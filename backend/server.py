"""
WSI Dynamic Tile Server cho HistomicsUI
Sử dụng FastAPI + large_image để render tile (.svs) trực tiếp phục vụ OpenSeadragon
"""

import io
import os
import sys
import shutil
from fastapi import FastAPI, HTTPException, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# System stdout encoding fix
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import large_image
except ImportError:
    print("Vui lòng cài đặt large_image: pip install large_image large_image_source_openslide")
    sys.exit(1)

app = FastAPI(title="WSI Dynamic Tile Server")

# Cho phép CORS cho frontend web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "frontend", "data")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
tile_sources = {}


def get_tile_source(filename: str):
    if filename not in tile_sources:
        file_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File '{filename}' không tồn tại.")
        try:
            tile_sources[filename] = large_image.open(file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Không thể mở file SVS/WSI: {str(e)}")
    return tile_sources[filename]


@app.get("/api/v1/slides")
def list_slides():
    """
    Trả về danh sách tất cả các file SVS / TIFF có sẵn trên server.
    """
    slides = []
    if os.path.exists(DATA_DIR):
        for f in os.listdir(DATA_DIR):
            if f.lower().endswith(('.svs', '.tif', '.tiff', '.ndpi', '.mrxs')):
                slides.append({"id": f, "name": f})
    return slides


@app.post("/api/v1/upload-wsi")
def upload_wsi(file: UploadFile = File(...)):
    """
    Cho phép người dùng (Client) chọn upload file SVS từ máy tính cá nhân lên Server.
    """
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR, exist_ok=True)
    
    file_path = os.path.join(DATA_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Xóa bớt cache tile source cũ nếu trùng tên
    if file.filename in tile_sources:
        del tile_sources[file.filename]
        
    return {"status": "success", "filename": file.filename, "message": f"File '{file.filename}' đã tải lên thành công!"}


@app.get("/api/v1/slide/{filename}/metadata")
def get_slide_metadata(filename: str):
    """
    Trả về metadata chính xác của file SVS (Level 0 kích thước thực, mpp, levels).
    """
    ts = get_tile_source(filename)
    meta = ts.getMetadata()
    return {
        "id": filename,
        "name": filename,
        "width": meta["sizeX"],
        "height": meta["sizeY"],
        "tileWidth": meta["tileWidth"],
        "tileHeight": meta["tileHeight"],
        "levels": meta["levels"],
        "mpp": meta.get("mm_x", 0.00025) * 1000,  # mm -> µm
        "magnification": meta.get("magnification", "40x"),
        "tileSourceUrl": f"/api/v1/slide/{filename}/tile/{{level}}/{{x}}/{{y}}.png"
    }


@app.get("/api/v1/slide/{filename}/tile/{level}/{x}/{y}.png")
def get_slide_tile(filename: str, level: int, x: int, y: int):
    """
    Cắt và trả về tile ảnh PNG tương ứng từ file SVS theo cấp độ zoom.
    """
    ts = get_tile_source(filename)
    try:
        tile_bytes = ts.getTile(x, y, level, encoding="PNG")
        return Response(content=tile_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi đọc tile: {str(e)}")


# Mount tĩnh thư mục frontend
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    print("🚀 Đang khởi chạy WSI Dynamic Tile Server tại http://localhost:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
