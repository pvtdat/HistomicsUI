"""Tumor segmentation for binary modules and PathoSegX-BR BCSS checkpoints."""

import base64
import io
import math
import os
import threading

_inference_lock = threading.Lock()
_model_cache = None


def load_model(model_path, device):
    import torch

    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
    if isinstance(checkpoint, torch.nn.Module):
        return checkpoint.to(device).eval(), {"num_classes": 1, "tumor_class": 0, "mode": "binary_sigmoid"}
    if not isinstance(checkpoint, dict) or "model_state_dict" not in checkpoint:
        raise ValueError("Expected a full torch.nn.Module or a PathoSegX-BR checkpoint with model_state_dict and config.")
    config = checkpoint.get("config")
    config = config.get("model") if isinstance(config, dict) else None
    if not isinstance(config, dict) or config.get("architecture") != "unet" or config.get("encoder") != "resnet50" or config.get("in_channels") != 3:
        raise ValueError("Checkpoint config must identify PathoSegX-BR unet/resnet50 with 3 input channels.")
    count = config.get("num_classes")
    if count not in (2, 5, 22):
        raise ValueError("PathoSegX-BR supports 2, 5 or 22 BCSS classes.")
    if __package__:
        from .pathosegx_model import ResNet50UNet
    else:
        from pathosegx_model import ResNet50UNet
    try:
        model = ResNet50UNet(num_classes=count)
    except RuntimeError as exc:
        if "torchvision::nms" in str(exc):
            raise ImportError(
                "Incompatible torch/torchvision builds. For torch 2.6.0+cpu use torchvision 0.21.0 CPU."
            ) from exc
        raise
    model.load_state_dict(checkpoint["model_state_dict"], strict=True)
    return model.to(device).eval(), {
        "num_classes": count, "tumor_class": 0 if count == 5 else 1,
        "mode": "bcss_softmax_argmax",
    }


def tumor_probabilities(output, metadata, input_size):
    import torch

    count = metadata["num_classes"]
    if not isinstance(output, torch.Tensor) or output.ndim != 4 or tuple(output.shape[:2]) != (1, count):
        raise ValueError(f"Model must return {'binary logits' if count == 1 else 'BCSS logits'} with shape [1, {count}, H, W].")
    if output.shape[2] == 0 or output.shape[3] == 0 or not torch.isfinite(output).all().item():
        raise ValueError("Model returned empty or non-finite logits.")
    output = torch.nn.functional.interpolate(
        output.float(), size=(input_size, input_size), mode="bilinear", align_corners=False,
    )
    if count == 1:
        return torch.sigmoid(output)[0, 0].cpu().numpy(), None
    probabilities = torch.softmax(output, dim=1)
    tumor_class = metadata["tumor_class"]
    return (
        probabilities[0, tumor_class].cpu().numpy(),
        (output.argmax(dim=1)[0] == tumor_class).cpu().numpy(),
    )


def region_bounds(annotation_type, points, slide_width, slide_height, padding):
    if annotation_type not in ("rectangle", "polygon"):
        raise ValueError("Predict tumor requires a rectangle or closed polygon.")
    if len(points) < (2 if annotation_type == "rectangle" else 3):
        raise ValueError("Not enough points for the selected region.")
    if any(len(p) < 2 or not all(math.isfinite(v) for v in p[:2]) for p in points):
        raise ValueError("Region coordinates must be finite.")
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    if min(xs) < 0 or min(ys) < 0 or max(xs) > slide_width or max(ys) > slide_height:
        raise ValueError("The selected region must be inside the original slide.")
    if max(xs) <= min(xs) or max(ys) <= min(ys):
        raise ValueError("The selected region has zero area.")
    if annotation_type == "polygon":
        area = abs(sum(
            p[0] * points[(i + 1) % len(points)][1]
            - points[(i + 1) % len(points)][0] * p[1]
            for i, p in enumerate(points)
        )) / 2
        if area == 0:
            raise ValueError("The selected polygon has zero area.")
    left = max(0, math.floor(min(xs)) - padding)
    top = max(0, math.floor(min(ys)) - padding)
    right = min(slide_width, max(math.ceil(max(xs)) + padding, left + 256))
    bottom = min(slide_height, max(math.ceil(max(ys)) + padding, top + 256))
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def predict_tumor(tile_source, request, model_path):
    import numpy as np
    import torch
    from PIL import Image, ImageDraw

    global _model_cache
    meta = tile_source.getMetadata()
    bounds = region_bounds(
        request.type, request.points, meta["sizeX"], meta["sizeY"], request.padding
    )
    # Read a bounded-resolution patch, never allocate a level-0 whole-slide ROI.
    patch, _ = tile_source.getRegion(
        region={**bounds, "units": "base_pixels"},
        output={"maxWidth": request.input_size, "maxHeight": request.input_size},
        format="PIL",
    )
    patch = patch.convert("RGB").resize(
        (request.input_size, request.input_size), Image.Resampling.BILINEAR
    )
    array = np.asarray(patch, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array.transpose(2, 0, 1).copy())
    mean = torch.tensor(request.mean, dtype=torch.float32)[:, None, None]
    std = torch.tensor(request.std, dtype=torch.float32)[:, None, None]
    tensor = ((tensor - mean) / std).unsqueeze(0)

    with _inference_lock:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        key = (model_path, os.stat(model_path).st_mtime_ns, str(device))
        if _model_cache is None or _model_cache[0] != key:
            # Only the operator-configured, trusted checkpoint may be unpickled.
            model, metadata = load_model(model_path, device)
            _model_cache = (key, model, metadata)
        model, metadata = _model_cache[1:]
        if metadata["num_classes"] > 1 and request.input_size % 32:
            raise ValueError("PathoSegX-BR input size must be a multiple of 32 (e.g. 256, 512, 1024).")
        with torch.inference_mode():
            output = model(tensor.to(device))
            probabilities, tumor_winner = tumor_probabilities(output, metadata, request.input_size)

    roi = Image.new("L", (request.input_size, request.input_size))
    draw = ImageDraw.Draw(roi)
    mapped = [
        ((p[0] - bounds["left"]) * request.input_size / bounds["width"],
         (p[1] - bounds["top"]) * request.input_size / bounds["height"])
        for p in request.points
    ]
    if request.type == "rectangle":
        xs, ys = [p[0] for p in mapped], [p[1] for p in mapped]
        draw.rectangle((min(xs), min(ys), max(xs), max(ys)), fill=255)
    else:
        draw.polygon(mapped, fill=255)
    roi_mask = np.asarray(roi) > 0
    roi_pixels = int(roi_mask.sum())
    if roi_pixels == 0:
        raise ValueError("Region is too small at this input size; increase input size.")
    mask = (probabilities > request.threshold) & roi_mask
    if tumor_winner is not None:
        mask &= tumor_winner
    tumor_pixels = int(mask.sum())
    rgba = np.zeros((request.input_size, request.input_size, 4), dtype=np.uint8)
    rgba[mask] = [230, 25, 75, 255]
    buffer = io.BytesIO()
    Image.fromarray(rgba).save(buffer, format="PNG")
    return {
        "bounds": bounds,
        "mask": "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
        "maskWidth": request.input_size,
        "maskHeight": request.input_size,
        "tumorPixels": tumor_pixels,
        "roiPixels": roi_pixels,
        "tumorFraction": tumor_pixels / roi_pixels,
        "settings": {
            "input_size": request.input_size, "padding": request.padding,
            "threshold": request.threshold, "mean": request.mean, "std": request.std,
        },
        "model": os.path.basename(model_path),
        "inference": metadata,
        "device": str(device),
    }
