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
- Bấm nút **Export** để tải xuống tất cả các hình vẽ/vùng chọn chú thích hiện tại thành file JSON.

### 4. Render Ảnh SVS Overlay Bằng Python (Offline)

Chạy lệnh bên dưới để tự động cắt khung ROI từ file `.svs` và vẽ màu phủ annotation bằng OpenCV:

```bash
python tools/process_svs_overlay.py
```

Ảnh đầu ra sẽ được tạo tại `frontend/data/OVERLAY_OUTPUT_SVS.png`.

---

## 💡 Ghi Chú Kiến Trúc Kiến Nghị

Hệ thống được thiết kế theo kiến trúc mỏng nhẹ (**Lite UI**):

- **Đọc & Soi ảnh SVS nét căng**: Sử dụng trực tiếp 2 thư viện Python chuẩn nhẹ hơn nhiều là `large_image` và `openslide-python` trong file [`backend/server.py`](file:///c:/Users/DXP/Desktop/src%20dxp/HistomicsUI/backend/server.py).
- **Hiển thị Annotation đè ảnh**: Do thư viện JavaScript `OpenSeadragon` + lớp vector `SVG` xử lý mượt mà trực tiếp trên trình duyệt.
- **Render offline ảnh SVS**: Đã có file [`tools/process_svs_overlay.py`](file:///c:/Users/DXP/Desktop/src%20dxp/HistomicsUI/tools/process_svs_overlay.py) dùng `large_image` + `OpenCV` xử lý gọn gàng.
