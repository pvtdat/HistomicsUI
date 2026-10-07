import base64
import io
import os
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import torch
from fastapi.testclient import TestClient
from PIL import Image

from backend import server, tumor_prediction


class ConstantModel(torch.nn.Module):
    def __init__(self, logit=0.0, channels=1):
        super().__init__()
        self.logit = logit
        self.channels = channels
        self.last_input = None

    def forward(self, tensor):
        self.last_input = tensor.detach().cpu()
        return torch.full((1, self.channels, 32, 32), self.logit, device=tensor.device)


class FakeSlide:
    def getMetadata(self):
        return {"sizeX": 1000, "sizeY": 800}

    def getRegion(self, **kwargs):
        self.region_args = kwargs
        return Image.new("RGB", (64, 32), (255, 0, 0)), "PIL"


class TumorPredictionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.model_path = os.path.join(self.directory.name, "best.pt")
        self.slide = FakeSlide()
        tumor_prediction._model_cache = None
        self.request = server.TumorPredictionRequest(
            type="rectangle", points=[[100, 100], [300, 300]], input_size=64
        )

    def tearDown(self):
        tumor_prediction._model_cache = None
        self.directory.cleanup()

    def predict(self, model):
        torch.save(model, self.model_path)
        return tumor_prediction.predict_tumor(self.slide, self.request, self.model_path)

    def mask(self, result):
        content = base64.b64decode(result["mask"].split(",", 1)[1])
        return np.asarray(Image.open(io.BytesIO(content)))

    def test_threshold_is_strict_and_mask_shape_is_exact(self):
        result = self.predict(ConstantModel(0.0))
        self.assertEqual(result["tumorPixels"], 0)
        self.assertEqual(result["tumorFraction"], 0)
        self.assertEqual(self.mask(result).shape, (64, 64, 4))
        self.assertEqual(self.mask(result)[:, :, 3].sum(), 0)
        self.assertEqual(result["bounds"], {"left": 68, "top": 68, "width": 264, "height": 264})
        self.assertEqual(self.slide.region_args["output"], {"maxWidth": 64, "maxHeight": 64})
        self.assertEqual(self.slide.region_args["region"]["units"], "base_pixels")
        tensor = tumor_prediction._model_cache[1].last_input
        self.assertEqual(tuple(tensor.shape), (1, 3, 64, 64))
        self.assertAlmostEqual(tensor[0, 0, 0, 0].item(), (1 - 0.485) / 0.229, places=5)

    def test_positive_logits_are_clipped_to_roi_not_padding(self):
        result = self.predict(ConstantModel(2.0))
        rgba = self.mask(result)
        self.assertEqual(result["tumorPixels"], result["roiPixels"])
        self.assertEqual(result["tumorFraction"], 1)
        self.assertEqual(rgba[0, 0, 3], 0)
        self.assertEqual(list(rgba[32, 32]), [230, 25, 75, 255])

    def test_polygon_excludes_pixels_inside_bbox_but_outside_polygon(self):
        self.request.type = "polygon"
        self.request.points = [[100, 100], [300, 100], [100, 300]]
        result = self.predict(ConstantModel(2.0))
        self.assertEqual(result["tumorFraction"], 1)
        self.assertEqual(self.mask(result)[48, 48, 3], 0)
        self.assertEqual(self.mask(result)[16, 16, 3], 255)

    def test_padding_and_minimum_crop_are_clamped_to_slide_edges(self):
        bounds = tumor_prediction.region_bounds("rectangle", [[0, 0], [10, 10]], 1000, 800, 32)
        self.assertEqual(bounds, {"left": 0, "top": 0, "width": 256, "height": 256})
        bounds = tumor_prediction.region_bounds("rectangle", [[990, 790], [1000, 800]], 1000, 800, 32)
        self.assertEqual(bounds, {"left": 958, "top": 758, "width": 42, "height": 42})

    def test_invalid_regions_are_rejected(self):
        for kind, points in [
            ("point", [[1, 1]]), ("polygon", [[1, 1], [2, 2]]),
            ("polygon", [[1, 1], [2, 2], [3, 3]]),
            ("rectangle", [[1, 1], [1, 50]]),
            ("rectangle", [[-1, 1], [10, 10]]),
            ("rectangle", [[1, 1], [1001, 10]]),
            ("rectangle", [[float("nan"), 1], [10, 10]]),
        ]:
            with self.subTest(kind=kind, points=points), self.assertRaises(ValueError):
                tumor_prediction.region_bounds(kind, points, 1000, 800, 32)

    def test_multiclass_output_and_state_dict_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "binary logits"):
            self.predict(ConstantModel(channels=2))
        tumor_prediction._model_cache = None
        torch.save({"state_dict": {}}, self.model_path)
        with self.assertRaisesRegex(ValueError, "PathoSegX-BR checkpoint"):
            tumor_prediction.predict_tumor(self.slide, self.request, self.model_path)

    def test_bcss_softmax_and_winning_class(self):
        metadata = {"num_classes": 22, "tumor_class": 1}
        logits = torch.zeros((1, 22, 1, 2))
        logits[0, 1, 0, 0] = 5
        logits[0, 2, 0, 1] = 5
        probabilities, winner = tumor_prediction.tumor_probabilities(logits, metadata, 64)
        self.assertGreater(probabilities[32, 0], 0.8)
        self.assertLess(probabilities[32, 63], 0.01)
        self.assertTrue(winner[32, 0])
        self.assertFalse(winner[32, 63])
        # Tumor may pass a low threshold but must still win against other classes.
        logits = torch.zeros((1, 2, 1, 1))
        logits[:, 0] = 0.2
        probabilities, winner = tumor_prediction.tumor_probabilities(
            logits, {"num_classes": 2, "tumor_class": 1}, 64
        )
        self.assertGreater(probabilities[0, 0], 0.4)
        self.assertFalse(winner[0, 0])

    def test_bcss_checkpoint_loads_strictly_with_correct_tumor_class(self):
        from backend import pathosegx_model
        for count, tumor_class in [(2, 1), (5, 0), (22, 1)]:
            config = {"model": {
                "architecture": "unet", "encoder": "resnet50",
                "in_channels": 3, "num_classes": count,
            }}
            torch.save({"config": config, "model_state_dict": {}}, self.model_path)
            with patch.object(pathosegx_model, "ResNet50UNet", return_value=ConstantModel(channels=count)) as factory:
                model, metadata = tumor_prediction.load_model(self.model_path, torch.device("cpu"))
            factory.assert_called_once_with(num_classes=count)
            self.assertFalse(model.training)
            self.assertEqual(metadata["tumor_class"], tumor_class)

    def test_bcss_checkpoint_rejects_unknown_architecture_and_weights(self):
        torch.save({"config": {"model": {"architecture": "unknown"}}, "model_state_dict": {}}, self.model_path)
        with self.assertRaisesRegex(ValueError, "unet/resnet50"):
            tumor_prediction.load_model(self.model_path, torch.device("cpu"))
        from backend import pathosegx_model
        torch.save({"config": {"model": {
            "architecture": "unet", "encoder": "resnet50", "in_channels": 3, "num_classes": 22,
        }}, "model_state_dict": {"unexpected.weight": torch.ones(1)}}, self.model_path)
        with patch.object(pathosegx_model, "ResNet50UNet", return_value=ConstantModel(channels=22)):
            with self.assertRaises(RuntimeError):
                tumor_prediction.load_model(self.model_path, torch.device("cpu"))

    def test_bcss_requires_input_size_multiple_of_32(self):
        self.request.input_size = 65
        torch.save(ConstantModel(), self.model_path)
        with patch.object(tumor_prediction, "load_model", return_value=(
            ConstantModel(channels=22), {"num_classes": 22, "tumor_class": 1}
        )):
            with self.assertRaisesRegex(ValueError, "multiple of 32"):
                tumor_prediction.predict_tumor(self.slide, self.request, self.model_path)

    def test_incompatible_torchvision_has_actionable_api_error(self):
        from backend import pathosegx_model
        torch.save({"config": {"model": {
            "architecture": "unet", "encoder": "resnet50", "in_channels": 3, "num_classes": 22,
        }}, "model_state_dict": {}}, self.model_path)
        with patch.object(pathosegx_model, "ResNet50UNet", side_effect=RuntimeError("operator torchvision::nms does not exist")):
            with patch.object(server, "MODEL_PATH", self.model_path), patch.object(server, "get_tile_source", return_value=self.slide):
                with self.assertLogs(level="ERROR"):
                    response = TestClient(server.app).post(
                        "/api/v1/slide/test.svs/predict-tumor", json=self.request.model_dump()
                    )
        self.assertEqual(response.status_code, 503)
        self.assertIn("torchvision 0.21.0 CPU", response.json()["detail"])

    def test_non_finite_model_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "non-finite"):
            self.predict(ConstantModel(float("nan")))

    def test_corrupt_checkpoint_returns_explicit_api_error(self):
        with open(self.model_path, "wb") as file:
            file.write(b"invalid checkpoint")
        client = TestClient(server.app)
        with patch.object(server, "MODEL_PATH", self.model_path), patch.object(server, "get_tile_source", return_value=self.slide):
            with self.assertLogs(level="ERROR"):
                response = client.post("/api/v1/slide/test.svs/predict-tumor", json=self.request.model_dump())
        self.assertEqual(response.status_code, 500)
        self.assertIn("server logs", response.json()["detail"])

    def test_api_success_missing_model_and_invalid_parameters(self):
        client = TestClient(server.app)
        endpoint = "/api/v1/slide/example.svs/predict-tumor"
        payload = self.request.model_dump()
        with patch.object(server, "MODEL_PATH", self.model_path), patch.object(server, "get_tile_source", return_value=self.slide):
            response = client.post(endpoint, json=payload)
            self.assertEqual(response.status_code, 503)
            torch.save(ConstantModel(2.0), self.model_path)
            response = client.post(endpoint, json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["tumorFraction"], 1)
            for field, value in [
                ("input_size", 1025), ("input_size", 64.5), ("padding", -1),
                ("threshold", 1), ("mean", [0, 0]), ("std", [1, 0, 1]),
                ("points", [[1], [2]]), ("type", "point"),
            ]:
                with self.subTest(field=field, value=value):
                    response = client.post(endpoint, json={**payload, field: value})
                    self.assertEqual(response.status_code, 422, response.text)


if __name__ == "__main__":
    unittest.main()
