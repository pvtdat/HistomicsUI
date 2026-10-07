import json
import openslide
from PIL import Image
import torch
import torchvision.transforms as transforms
import numpy as np

def process_annotation_and_predict(json_data, slide_path, model_path):
    # 1. Trích xuất tọa độ từ annotation JSON
    points = [pt[:2] for pt in json_data["points"]]
    x_coords = [p[0] for p in points]
    y_coords = [p[1] for p in points]

    x_min, x_max = min(x_coords), max(x_coords)
    y_min, y_max = min(y_coords), max(y_coords)

    width = x_max - x_min
    height = y_max - y_min

    # Thêm padding (đệm) xung quanh vùng chọn để mô hình cóữ ngữ cảnh tốt hơn
    padding = 32
    x_min_pad = max(0, x_min - padding)
    y_min_pad = max(0, y_min - padding)
    width_pad = width + (padding * 2)
    height_pad = height + (padding * 2)

    print(f"[*] Vùng cắt (Bounding Box): x={x_min_pad}, y={y_min_pad}, w={width_pad}, h={height_pad}")

    # 2. Cắt patch từ file .svs gốc bằng OpenSlide
    slide = openslide.OpenSlide(slide_path)
    level = 0  # Đọc ở độ phân giải gốc (Level 0)
    
    # Kiểm tra nếu vùng quá nhỏ, đặt kích thước tối thiểu an toàn
    width_pad = max(width_pad, 256)
    height_pad = max(height_pad, 256)
    
    patch = slide.read_region((x_min_pad, y_min_pad), level, (width_pad, height_pad))
    patch = patch.convert("RGB")

    # 3. Load mô hình ResNet50 U-Net (best.pt)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = torch.load(model_path, map_location=device)
    model.eval()

    # 4. Tiền xử lý ảnh input cho mô hình
    transform = transforms.Compose([
        transforms.Resize((512, 512)),  # Kích thước chuẩn khi train mô hình
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    input_tensor = transform(patch).unsqueeze(0).to(device)

    # 5. Chạy dự đoán (Inference)
    with torch.no_grad():
        output = model(input_tensor)
        # Chuyển đổi output sang dạng mask nhị phân (0 hoặc 1)
        pred_mask = (torch.sigmoid(output) > 0.5).float().cpu().numpy()[0, 0]

    print("[✔] Dự đoán thành công! Shape của mask kết quả:", pred_mask.shape)
    return pred_mask

# --- Ví dụ cách gọi hàm ---
if __name__ == "__main__":
    sample_annotation = {
        "group": "mostly_tumor",
        "closed": True,
        "label": {"value": "mostly_tumor"},
        "points": [
            [113046, 23800, 0],
            [113047, 23799, 0],
            [113048, 23800, 0],
            [113047, 23801, 0]
        ]
    }
    
    # Đường dẫn tới file .svs và mô hình của bạn
    SLIDE_FILE = "path_to_your_slide.svs"
    MODEL_FILE = "best.pt"
    
    # mask_result = process_annotation_and_predict(sample_annotation, SLIDE_FILE, MODEL_FILE)