# Plan Refactor HistomicsUI → Lightweight Pathology UI

## 1. Mục tiêu

Refactor giao diện từ:

`DigitalSlideArchive/HistomicsUI`

thành một UI pathology đơn giản, dễ chạy và dễ chỉnh sửa.

Mục tiêu chính:

- Giữ lại trải nghiệm xem ảnh pathology / Whole Slide Image.
- Giữ layout và các thao tác annotation quan trọng.
- Giữ toolbar, panel thông tin và danh sách annotation.
- Loại bỏ dependency không cần thiết của Girder.
- Không phụ thuộc Backbone/Marionette hoặc hệ plugin cũ.
- Frontend ưu tiên:
  - HTML
  - CSS
  - Vanilla JavaScript
- Python chỉ dùng làm backend nhẹ nếu cần.
- Có thể chạy local nhanh để phục vụ demo/research.

---

# 2. Core UI cần giữ lại

Không cần port toàn bộ HistomicsUI.

Chỉ giữ các phần có giá trị trực tiếp với người dùng.

## 2.1. Main Viewer

Đây là phần quan trọng nhất.

Giữ:

- Pan ảnh.
- Zoom in / zoom out.
- Fullscreen.
- Reset viewport.
- Hiển thị độ zoom hiện tại.
- Mini navigator nếu cần.
- Hiển thị WSI dạng tile.

Khuyến nghị:

```text
OpenSeadragon
```

OpenSeadragon là thư viện JavaScript chuyên cho ảnh deep-zoom và có thể dùng độc lập, không cần Girder.

Layout:

```text
+------------------------------------------------------+
| Header                                               |
+-------+--------------------------------------+-------+
|       |                                      |       |
| Tool  |                                      | Info  |
| bar   |            WSI Viewer                | Panel |
|       |                                      |       |
|       |                                      |       |
+-------+--------------------------------------+-------+
| Status / Zoom / Coordinates                          |
+------------------------------------------------------+
```

---

# 3. Annotation tools

Giữ tối thiểu:

```text
Pointer / Select
Pan
Rectangle
Polygon
Point
Delete
Undo
Redo
```

Không cần implement ngay:

```text
Freehand
Complex spline
Brush segmentation
AI-assisted polygon editing
Advanced measurement
```

Data annotation nên chuẩn hóa thành JSON.

Ví dụ:

```json
{
  "id": "ann-001",
  "type": "polygon",
  "label": "Tumor",
  "points": [
    [1240, 500],
    [1400, 610],
    [1350, 820]
  ]
}
```

Hoặc tốt hơn:

```text
GeoJSON
```

để sau này dễ tích hợp backend.

---

# 4. Annotation Layer

Viewer:

```text
OpenSeadragon
```

Annotation overlay:

```text
SVG
```

Kiến trúc:

```text
OpenSeadragon
      |
      +------ WSI tile layer
      |
      +------ SVG annotation layer
                  |
                  +-- polygon
                  +-- rectangle
                  +-- point
```

SVG phù hợp hơn canvas trong giai đoạn đầu vì:

- dễ inspect;
- dễ style CSS;
- dễ click/select;
- dễ resize;
- dễ highlight.

Nếu muốn tận dụng thư viện có sẵn có thể dùng annotation plugin trên OpenSeadragon; loại plugin này hoạt động bằng vector/SVG overlay trên ảnh zoom.

---

# 5. Left Toolbar

Toolbar mới không cần copy toàn bộ HistomicsUI.

Ví dụ:

```text
┌────┐
│ ↖  │ Select
│ ✋ │ Pan
│ +  │ Zoom
│ □  │ Rectangle
│ △  │ Polygon
│ •  │ Point
│ ↶  │ Undo
│ ↷  │ Redo
│ 🗑 │ Delete
└────┘
```

HTML:

```html
<aside class="toolbar">
  <button data-tool="select">Select</button>
  <button data-tool="pan">Pan</button>
  <button data-tool="rectangle">Rectangle</button>
  <button data-tool="polygon">Polygon</button>
</aside>
```

Không cần framework.

---

# 6. Right Sidebar

Sidebar giữ lại các phần quan trọng.

## Slide information

```text
Slide

Name
sample_001.svs

Size
81234 × 61440

Magnification
40x

MPP
0.25 μm
```

---

## Annotation list

```text
Annotations

☑ Tumor        12
☑ Stroma        4
☑ Necrosis      2
```

Click annotation:

```text
Annotation
      ↓
Viewer pan + zoom
      ↓
Highlight polygon
```

---

# 7. Annotation Properties

Khi chọn annotation:

```text
Annotation

Label
[ Tumor        ▼ ]

Color
[ red ]

Notes
[................]

Area
1.32 mm²

[Delete]
```

Chỉ cần UI đơn giản.

---

# 8. Header

Header nên tối giản hơn HistomicsUI.

Ví dụ:

```text
Pathology Viewer

sample_001.svs

[Open slide]       [Export]       [Settings]
```

Không cần:

```text
Admin
Girder navigation
Assetstore
Plugins
Jobs
Collections
Folders
```

---

# 9. Status Bar

Bottom status:

```text
X: 12,320
Y: 5,820

Zoom: 12.5x

MPP: 0.25 µm

Slide: 81234 × 61440
```

Phần này rất hữu ích khi nghiên cứu pathology.

---

# 10. Recommended frontend structure

Không cần React.

Cấu trúc:

```text
frontend/

├── index.html
│
├── css/
│   ├── base.css
│   ├── layout.css
│   ├── viewer.css
│   ├── toolbar.css
│   └── sidebar.css
│
├── js/
│   ├── app.js
│   │
│   ├── viewer.js
│   │
│   ├── annotations.js
│   │
│   ├── toolbar.js
│   │
│   ├── sidebar.js
│   │
│   └── api.js
│
└── assets/
    └── icons/
```

---

# 11. JavaScript responsibility

## app.js

Application bootstrap.

```text
init viewer
init toolbar
init annotation manager
init sidebar
load slide
```

---

## viewer.js

Chịu trách nhiệm:

```text
OpenSeadragon initialization

zoom
pan
coordinates

screen → image coordinates

image → screen coordinates
```

---

## annotations.js

Chịu trách nhiệm:

```text
create
update
delete
select
highlight

serialize
deserialize
```

---

## toolbar.js

Chịu trách nhiệm:

```text
active tool

select
pan
rectangle
polygon
point
```

---

## sidebar.js

Chịu trách nhiệm:

```text
slide metadata

annotation list

annotation properties
```

---

# 12. Python Backend

Nếu chỉ demo UI thì chưa cần Python.

Có thể chạy:

```bash
python3 -m http.server 8000
```

và mở:

```text
http://localhost:8000
```

---

Nếu cần đọc WSI thật thì mới thêm Python.

Khuyến nghị:

```text
Flask
```

hoặc:

```text
FastAPI
```

FastAPI cấu trúc:

```text
backend/

├── app.py
├── slide_service.py
├── annotation_service.py
└── requirements.txt
```

---

# 13. API tối thiểu

Chỉ cần:

```text
GET /api/slides
```

```text
GET /api/slides/{id}
```

```text
GET /api/slides/{id}/metadata
```

```text
GET /api/slides/{id}/tile/{z}/{x}/{y}
```

```text
GET /api/slides/{id}/annotations
```

```text
POST /api/slides/{id}/annotations
```

```text
PUT /api/annotations/{id}
```

```text
DELETE /api/annotations/{id}
```

---

# 14. Python WSI layer

Có hai option.

## Option A — OpenSlide

```text
Python
 ↓
OpenSlide
 ↓
SVS / NDPI / TIFF
```

Phù hợp nếu requirement đơn giản.

---

## Option B — large_image

Nếu muốn giữ compatibility gần HistomicsUI hơn:

```text
Python
 ↓
large_image
 ↓
SVS
TIFF
OME-TIFF
NDPI
...
```

HistomicsUI hiện tại cũng dùng `large_image` để đọc và hiển thị WSI.

### Khuyến nghị

Version đầu:

```text
OpenSlide
```

Version sau mới cân nhắc:

```text
large_image
```

---

# 15. Phase 1 — Audit HistomicsUI

Không code ngay.

Đầu tiên phân loại source thành:

```text
KEEP

viewer
toolbar
annotation interaction
annotation styles
sidebar layout
slide metadata UI
```

```text
REFERENCE ONLY

color scheme
spacing
icons
keyboard shortcuts
panel behaviour
```

```text
REMOVE

Girder integration
authentication
collections
folders
assetstore
plugin management
slicer CLI
worker
jobs
Docker analysis integration
MongoDB models
```

---

# 16. Phase 2 — Static UI Prototype

Tạo:

```text
index.html
style.css
app.js
```

Dùng ảnh pathology bình thường trước:

```text
sample.jpg
```

Mục tiêu:

```text
layout
toolbar
sidebar
interaction states
```

chưa cần WSI.

---

# 17. Phase 3 — OpenSeadragon Viewer

Thay:

```text
<img>
```

bằng:

```text
OpenSeadragon
```

Hoàn thiện:

```text
zoom
pan
navigator
fullscreen
coordinate tracking
```

---

# 18. Phase 4 — Annotation

Implement:

```text
Select
Rectangle
Polygon
Point
Delete
```

Data lưu tạm:

```text
localStorage
```

Ví dụ:

```text
slide_annotations_sample001
```

Không cần database.

---

# 19. Phase 5 — Sidebar synchronization

Đồng bộ:

```text
Viewer
 ↕
Annotation Layer
 ↕
Annotation List
```

Ví dụ:

```text
click polygon
```

→ select item sidebar.

```text
click sidebar
```

→ zoom tới polygon.

---

# 20. Phase 6 — Python integration

Sau khi frontend ổn mới thêm:

```text
FastAPI
+
OpenSlide
```

Python chỉ chịu trách nhiệm:

```text
slide metadata
tile serving
annotations persistence
```

Không xử lý UI.

---

# 21. Phase 7 — WSI support

Test:

```text
.svs
.tiff
.ndpi
```

Flow:

```text
WSI
 ↓
OpenSlide
 ↓
tile endpoint
 ↓
OpenSeadragon
```

---

# 22. Phase 8 — Export / Import annotation

Cho phép:

```text
Export JSON
```

và:

```text
Import JSON
```

Ví dụ:

```text
sample001.annotations.json
```

Sau này có thể hỗ trợ:

```text
GeoJSON
```

---

# 23. Những phần không nên port

Không port:

```text
Girder UI
Girder routes
Girder models

Backbone views
Marionette

Slicer CLI
Girder Worker

Celery
RabbitMQ

MongoDB

HistomicsTK algorithms
```

trừ khi requirement thực sự cần.

Repo hiện tại vốn bao gồm những thành phần liên quan Girder, worker và analysis, nên nếu mục tiêu chỉ là UI thì việc bỏ các phần này sẽ giảm đáng kể độ phức tạp.

---

# 24. Target architecture

Kiến trúc cuối cùng nên là:

```text
                 Browser

                    │
                    ▼

       HTML + CSS + JavaScript

                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼

   OpenSeadragon         SVG Annotation

          │
          ▼

        REST API

          │
          ▼

        FastAPI

       ┌───┴────┐
       │        │
       ▼        ▼

   OpenSlide   JSON
```

---

# 25. MVP

Bản MVP chỉ cần:

```text
✓ Open slide

✓ Zoom / Pan

✓ Rectangle annotation

✓ Polygon annotation

✓ Select annotation

✓ Delete annotation

✓ Annotation list

✓ Annotation label

✓ Import JSON

✓ Export JSON
```

Đây đã đủ để thay thế phần UI lõi của HistomicsUI cho mục đích research/demo.

---

# 26. Không làm trong MVP

Tạm thời bỏ:

```text
AI inference

multi-user

authentication

database

roles / permissions

job system

plugin system

Docker workers

MongoDB

cloud storage
```

---

# 27. Milestone đề xuất

## Milestone 1

```text
HistomicsUI audit
+
Static HTML/CSS layout
```

Output:

```text
index.html
```

---

## Milestone 2

```text
OpenSeadragon viewer
```

Output:

```text
WSI viewer hoạt động
```

---

## Milestone 3

```text
Annotation tools
```

Output:

```text
Rectangle
Polygon
Point
Selection
```

---

## Milestone 4

```text
Annotation sidebar
+
JSON persistence
```

Output:

```text
Lightweight Histomics UI
```

---

## Milestone 5

```text
Python backend
+
WSI tile server
```

Output:

```text
Lightweight Pathology Viewer
```

---

# 28. Final target

Không cố tạo:

```text
HistomicsUI clone
```

mà tạo:

```text
HistomicsUI-inspired Lightweight Viewer
```

với khoảng:

```text
HTML
CSS
JavaScript
OpenSeadragon

+

Python / FastAPI
OpenSlide
```

Không framework frontend lớn.

Không Girder.

Không MongoDB.

Không worker.

Không microservice.

Ưu tiên code dễ đọc, dễ sửa và phù hợp cho research.
