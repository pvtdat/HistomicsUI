# HistomicsUI - Whole Slide Image (WSI) & Annotation Viewer

Hệ thống xem tiêu bản hiển vi y khoa kích thước lớn (Whole Slide Image - WSI như `.svs`, `.tiff`, `.ndpi`) và quản lý lớp chú thích vector (Annotation) mỏng nhẹ, tối ưu và dễ dàng triển khai.

---

## 🌟 Tính Năng Nổi Bật

1. **Hiển thị Tiêu bản SVS / WSI Siêu Nét**:
   - Sử dụng **Dynamic Tile Server (FastAPI + large_image / OpenSlide)** phục vụ cắt tile pyramid linh hoạt theo tọa độ và cấp độ zoom ($150,000 \times 60,000\text{ px}$).
   - Cho phép soi rõ từng cấu trúc tế bào ở độ phóng đại gốc **40x / 80x**.

2. **Khớp và Đè Chú Thích (Annotation Overlay Match)**:
   - Đọc dữ liệu chú thích `annotation.json` ở hệ tọa độ Level 0 (tuyệt đối).
   - Tự động đè các đường nét vector (Polygon, Rectangle, Point) lên ảnh SVS chuẩn xác.
   - Hỗ trợ đổi màu sắc, tùy chỉnh độ mờ đục (Fill Opacity), tự động tính toán diện tích ($mm^2, \mu m^2$) và chu vi.

3. **Upload File SVS Trực Tiếp Từ Trình Duyệt**:
   - Cho phép người dùng (Client) chọn upload tệp `.svs` từ máy cá nhân lên server để soi ngay lập tức.

4. **Công Cụ Render Offline SVS + Annotation**:
   - [`tools/process_svs_overlay.py`](file:///c:/Users/DXP/Desktop/src%20dxp/HistomicsUI/tools/process_svs_overlay.py): Cắt vùng ROI từ SVS và tô phủ chú thích bằng OpenCV, xuất ra ảnh PNG chất lượng cao.

---

## 🛠 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Cài đặt các thư viện phụ thuộc:

```bash
pip install fastapi uvicorn large-image large-image-source-openslide openslide-python opencv-python numpy
```

---

### 2. Khởi chạy WSI Dynamic Tile Server:

```bash
python backend/server.py
```

Truy cập hệ thống tại đường dẫn trình duyệt:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
HistomicsUI/
├── backend/                      # Dynamic Tile Server Backend (FastAPI)
│   └── server.py                 # Dynamic Tile Server & WSI Upload API
├── frontend/                     # Giao diện Web Client (HTML, CSS, JS thuần)
│   ├── index.html                # Trang web chính
│   ├── css/                      # Stylesheet layout & components
│   ├── js/                       # Core Web App logic
│   │   ├── app.js                # Bootstrap ứng dụng
│   │   ├── viewer.js             # Quản lý OpenSeadragon WSI viewer
│   │   ├── annotations.js        # Lớp xử lý SVG Vector Annotation
│   │   ├── api.js                # Quản lý giao tiếp API / Tile Source
│   │   ├── sidebar.js            # Điều khiển thanh công cụ bên phải
│   │   └── toolbar.js            # Điều khiển thanh công cụ vẽ bên trái
│   └── data/                     # Thư mục chứa dữ liệu mẫu (.svs, .json)
├── tools/                        # Thư mục các công cụ bổ trợ
│   └── process_svs_overlay.py    # Script Python render ROI SVS + Annotation xuất PNG
└── README.md                     # Tài liệu hướng dẫn sử dụng dự án
```

---

## 📖 Hướng Dẫn Sử Dụng Tính Năng

### 1. Xem Tiêu Bản SVS Nét Căng & Zoom Tế Bào

- Khi truy cập `http://localhost:8000`, hệ thống tự động nạp file tiêu bản SVS mẫu `TCGA-A2-A0ST-01Z-00-DX1...svs`.
- Dùng con lăn chuột để zoom in sâu vào từng tế bào u, tế bào lành.
- Giữ chuột trái để Pan di chuyển xung quanh tiêu bản.

### 2. Upload File SVS Cá Nhân Từ Máy Tính

- Tại thanh dropdown góc trên bên trái, chọn **Local Image / SVS File...**.
- Chọn file `.svs` trên máy tính của bạn để tải lên server và xem trực tiếp.

### 3. Import / Export Annotation JSON

- Bấm nút **Import** ở thanh tiêu đề trên cùng để chọn file `annotation.json` từ máy tính.
- Khi import, các nhãn có trong bảng màu lớp được tự động gán màu chuẩn, bao gồm các nhãn có tiền tố `Mostly`; nhãn ngoài bảng giữ màu từ file.
- Khi chọn annotation, **Properties > Label** hiển thị đúng nhãn hiện tại, kể cả nhãn import không có sẵn trong danh sách lớp.
- Import và **Bật hiện toàn bộ** hiển thị các annotation không đen, ẩn các annotation màu RGB `[0, 0, 0]`. Có thể bật lại annotation đen bằng nút mắt riêng của annotation hoặc nhóm.
- Bấm nút **Export** để tải xuống tất cả các hình vẽ/vùng chọn chú thích hiện tại thành file JSON.

### 4. Render Ảnh SVS Overlay Bằng Python (Offline)

Chạy lệnh bên dưới để tự động cắt khung ROI từ file `.svs` và vẽ màu phủ annotation bằng OpenCV:

```bash
python tools/process_svs_overlay.py
```

Ảnh đầu ra sẽ được tạo tại `frontend/data/OVERLAY_OUTPUT_SVS.png`.

### 5. Predict tumor trên vùng Annotation

Tính năng dựa trên luồng xử lý của `tools/gemini-code-1791282707893.py`: cắt bounding box có padding, resize ảnh RGB, normalize theo ImageNet và suy luận. Hỗ trợ mô hình nhị phân hoàn chỉnh và checkpoint đa lớp của PathoSegX-BR. Backend dùng tile source `large_image` đang mở thay vì mở thêm OpenSlide; chỉ đọc patch ở độ phân giải giới hạn để tránh cấp phát toàn bộ ROI level 0.

**Cấu hình server (PowerShell):**

```powershell
pip install torch torchvision Pillow numpy python-multipart
$env:HISTOMICS_TUMOR_MODEL = 'C:\models\best.pt'
python backend\server.py
```

- Mặc định mô hình nằm tại `models/best.pt`. Biến môi trường chỉ do người vận hành server cấu hình; giao diện không nhận đường dẫn checkpoint tùy ý.
- **Checkpoint PathoSegX-BR:** hỗ trợ dictionary gồm `model_state_dict` và `config.model` (`architecture: unet`, `encoder: resnet50`, `in_channels: 3`, `num_classes: 2/5/22`). Kiến trúc được tích hợp trong `backend/pathosegx_model.py`, giữ nguyên tên tham số từ `PathoSegX-BR/src/models.py`; nạp trọng số strict, không tải pretrained weights từ Internet. Không hỗ trợ state_dict trần không có config hoặc kiến trúc khác.
- **Ánh xạ BCSS:** mô hình 22 lớp giữ raw ID, tumor = **1**; mô hình 2 lớp tumor = **1**; mô hình 5 lớp tumor = **0**, theo `PathoSegX-BR/src/labels.py`. Đầu ra logits được softmax; pixel chỉ tính là tumor khi **argmax là lớp tumor và xác suất tumor > threshold**. Đây không phải sigmoid độc lập trên 22 lớp.
- **Mô hình nhị phân:** vẫn hỗ trợ toàn bộ `torch.nn.Module` lưu bằng `torch.save(model, ...)`, output logits `[1, 1, H, W]`, dùng sigmoid > threshold. Module Python định nghĩa kiến trúc phải import được trên server; mô hình lưu dưới `__main__` cần xuất lại từ module import được.
- Output phải là tensor logits `[1, C, H, W]` phù hợp số lớp; dictionary hoặc xác suất đã sigmoid/softmax không được hỗ trợ.
- Chỉ sử dụng checkpoint đáng tin cậy: `torch.load(..., weights_only=False)` có thể thực thi mã trong file mô hình. Không upload checkpoint từ người dùng không tin cậy.
- Server tự chọn CUDA nếu có, nếu không sử dụng CPU; cache một mô hình và tuần tự hóa inference.

**Lưu ý phiên bản PyTorch/TorchVision:** hai thư viện phải dùng cặp phiên bản tương thích và cùng kiểu build (CPU/CUDA). Python hiện tại đã phát hiện `torch 2.6.0+cpu` đi với `torchvision 0.28.0`, gây lỗi `operator torchvision::nms does not exist`. Chưa thay đổi môi trường Python dùng chung. Với `torch 2.6.0+cpu`, phiên bản tương ứng là `torchvision 0.21.0` CPU; có thể cài trong môi trường riêng hoặc chỉ sửa môi trường hiện tại khi bạn cho phép:

```powershell
# Chạy với Python interpreter thực tế dùng để khởi động server.
python -m pip install --no-deps torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu
python -c "import torch, torchvision; print(torch.__version__, torchvision.__version__)"
python backend\server.py
```

Khởi động lại backend sau khi cập nhật mã/thư viện và refresh trình duyệt. Nếu backend vẫn trả lỗi `Checkpoint must contain a full torch.nn.Module`, bạn đang chạy process phiên bản cũ; backend mới hỗ trợ checkpoint PathoSegX-BR có `model_state_dict` + `config`.

**Sử dụng:**

1. Mở SVS/WSI từ backend hoặc upload một WSI. Chế độ ảnh PNG/JPG và preview offline không hỗ trợ dự đoán.
2. Vẽ hoặc chọn **Rectangle** / **Polygon** đã đóng.
3. Trong **Properties > Predict tumor**, chỉnh `Input size` (mặc định 512; PathoSegX-BR yêu cầu bội số 32), `Padding` (32 pixel level 0), `Threshold` (0.5), `Normalize mean/std` (ba giá trị RGB). Các thông số phải khớp preprocessing khi train; PathoSegX-BR dùng ImageNet mean/std mặc định.
4. Bấm **Predict tumor**. Mask đỏ thay phần fill của ROI; đường viền và nhãn gốc được giữ nguyên. Mask chỉ hiển thị trong hình đã chọn, không trong padding; phần trăm tumor được tính trên pixel ROI ở độ phân giải mask, **không phải độ tin cậy chẩn đoán**.
5. **Fill Opacity**, nút mắt và **Clear prediction** điều khiển mask. Kết quả cùng cấu hình được lưu trong annotation, hỗ trợ Undo/Redo, lưu trình duyệt và Export/Import JSON. Nếu trình duyệt hết dung lượng lưu, hệ thống báo lỗi và cần Export JSON.

API: `POST /api/v1/slide/{filename}/predict-tumor`, JSON gồm `type`, `points` (tọa độ level 0), `input_size`, `padding`, `threshold`, `mean`, `std`. Kết quả gồm PNG RGBA dạng data URL, bounding box level 0, kích thước mask, `tumorPixels`, `roiPixels`, `tumorFraction`, cấu hình, tên mô hình và `inference` (`num_classes`, `tumor_class`, `mode`). Vùng nằm ngoài slide, hình suy biến hoặc output mô hình không hợp lệ bị từ chối; mô hình/thư viện thiếu được báo rõ, không tạo dự đoán giả.

> Chỉ phục vụ nghiên cứu; kết quả không thay thế chẩn đoán của bác sĩ. ROI lớn được resize về một input vuông nên có thể mất chi tiết; đây là suy luận một patch, không phải tiled inference toàn tiêu bản.

Kiểm tra tính năng:

```powershell
python -m unittest discover -s backend\tests -v
node --test frontend\tests\tumor_prediction.test.cjs
```

---

## 💡 Ghi Chú Kiến Trúc Kiến Nghị

Hệ thống được thiết kế theo kiến trúc mỏng nhẹ (**Lite UI**):

- **Đọc & Soi ảnh SVS nét căng**: Sử dụng trực tiếp 2 thư viện Python chuẩn nhẹ hơn nhiều là `large_image` và `openslide-python` trong file [`backend/server.py`](file:///c:/Users/DXP/Desktop/src%20dxp/HistomicsUI/backend/server.py).
- **Hiển thị Annotation đè ảnh**: Do thư viện JavaScript `OpenSeadragon` + lớp vector `SVG` xử lý mượt mà trực tiếp trên trình duyệt.
- **Render offline ảnh SVS**: Đã có file [`tools/process_svs_overlay.py`](file:///c:/Users/DXP/Desktop/src%20dxp/HistomicsUI/tools/process_svs_overlay.py) dùng `large_image` + `OpenCV` xử lý gọn gàng.
