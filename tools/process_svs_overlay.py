"""
Script đè Annotation JSON lên file ảnh WSI (.SVS) và render kết quả ROI xuất ra file ảnh PNG.
Sử dụng HistomicsTK / large_image / OpenCV.
"""

import json
import os
import sys
import numpy as np

# System stdout encoding fix for Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import large_image
except ImportError:
    print("Vui lòng cài đặt large_image: pip install large_image large_image_source_openslide")
    sys.exit(1)

try:
    import cv2
except ImportError:
    print("Vui lòng cài đặt opencv-python: pip install opencv-python")
    sys.exit(1)


def parse_color(color_str):
    """
    Chuyển đổi các định dạng màu (HEX, RGB, RGBA) sang tuple BGR cho OpenCV.
    """
    if not color_str:
        return (0, 0, 255) # Mặc định đỏ (BGR)
    
    color_str = str(color_str).strip()
    if color_str.startswith("#"):
        hex_val = color_str.lstrip("#")
        if len(hex_val) == 6:
            r = int(hex_val[0:2], 16)
            g = int(hex_val[2:4], 16)
            b = int(hex_val[4:6], 16)
            return (b, g, r)
    elif "rgb" in color_str.lower():
        nums = [int(s) for s in color_str.replace("rgba", "").replace("rgb", "").replace("(", "").replace(")", "").split(",") if s.strip().isdigit()]
        if len(nums) >= 3:
            return (nums[2], nums[1], nums[0])
    
    return (0, 0, 255)


def overlay_annotations_on_svs(svs_path, json_path, output_png_path, roi_left=None, roi_top=None, roi_width=None, roi_height=None):
    """
    Đọc file SVS, trích xuất ROI và vẽ đè Annotation từ JSON lên ảnh.
    """
    print(f"1. Đang mở file WSI (.SVS): {svs_path}")
    ts = large_image.open(svs_path)
    meta = ts.getMetadata()
    full_width = meta['sizeX']
    full_height = meta['sizeY']
    print(f" -> Kích thước tiêu bản SVS: {full_width} x {full_height} px")

    # 2. Đọc file JSON chú thích
    print(f"2. Đang đọc file Annotation JSON: {json_path}")
    with open(json_path, 'r', encoding='utf-8') as f:
        annotation_doc = json.load(f)

    # Lấy danh sách phần tử annotation
    elements = []
    if isinstance(annotation_doc, list):
        for item in annotation_doc:
            if 'elements' in item:
                elements.extend(item['elements'])
            elif 'annotation' in item and 'elements' in item['annotation']:
                elements.extend(item['annotation']['elements'])
            else:
                elements.append(item)
    elif isinstance(annotation_doc, dict):
        if 'elements' in annotation_doc:
            elements.extend(annotation_doc['elements'])
        elif 'annotation' in annotation_doc and 'elements' in annotation_doc['annotation']:
            elements.extend(annotation_doc['annotation']['elements'])

    print(f" -> Đã tìm thấy {len(elements)} phần tử chú thích.")

    # 3. Tính toán vùng ROI cần cắt nếu không chỉ định thủ công
    if roi_left is None or roi_top is None:
        min_x, min_y = float('inf'), float('inf')
        max_x, max_y = float('-inf'), float('-inf')

        for el in elements:
            pts = el.get('points', [])
            if not pts and 'center' in el:
                cx, cy = el['center'][0], el['center'][1]
                w, h = el.get('width', 0), el.get('height', 0)
                pts = [[cx - w/2, cy - h/2], [cx + w/2, cy + h/2]]
            
            for p in pts:
                min_x = min(min_x, p[0])
                min_y = min(min_y, p[1])
                max_x = max(max_x, p[0])
                max_y = max(max_y, p[1])

        if min_x != float('inf'):
            padding = 500
            roi_left = max(0, int(min_x - padding))
            roi_top = max(0, int(min_y - padding))
            roi_width = int(max_x - min_x + padding * 2)
            roi_height = int(max_y - min_y + padding * 2)
        else:
            # Mặc định lấy ở tâm ảnh nếu không thấy tọa độ
            roi_left, roi_top = full_width // 4, full_height // 4
            roi_width, roi_height = 4000, 4000

    print(f"3. Đang trích xuất vùng ROI: Left={roi_left}, Top={roi_top}, Width={roi_width}, Height={roi_height}")
    region_tile, _ = ts.getRegion(
        region=dict(left=roi_left, top=roi_top, width=roi_width, height=roi_height),
        format=large_image.constants.TILE_FORMAT_NUMPY
    )

    # Chuyển đổi màu từ RGB sang BGR cho OpenCV
    overlay_img = cv2.cvtColor(region_tile[:, :, :3], cv2.COLOR_RGB2BGR)
    overlay_mask = overlay_img.copy()

    # 4. Vẽ các phần tử chú thích lên vùng ROI
    print("4. Đang đè hình chú thích (Polygons / Rectangles / Points)...")
    for el in elements:
        el_type = str(el.get('type', 'polygon')).lower()
        color = parse_color(el.get('lineColor') or el.get('color') or el.get('fillColor'))

        if el_type in ['polygon', 'polyline']:
            raw_pts = el.get('points', [])
            if len(raw_pts) >= 3:
                # Trừ offset vùng ROI để chuyển về tọa độ tương đối của ảnh cắt
                local_pts = np.array([[int(p[0] - roi_left), int(p[1] - roi_top)] for p in raw_pts], dtype=np.int32)
                local_pts = local_pts.reshape((-1, 1, 2))

                # Tô màu vùng (Fill)
                cv2.fillPoly(overlay_mask, [local_pts], color)
                # Vẽ đường viền (Border)
                cv2.polylines(overlay_img, [local_pts], isClosed=True, color=color, thickness=3)

        elif el_type in ['rectangle', 'bbox', 'box']:
            if 'center' in el and 'width' in el and 'height' in el:
                cx, cy = el['center'][0], el['center'][1]
                w, h = el['width'], el['height']
                x1, y1 = int(cx - w/2 - roi_left), int(cy - h/2 - roi_top)
                x2, y2 = int(cx + w/2 - roi_left), int(cy + h/2 - roi_top)
            elif 'points' in el and len(el['points']) >= 2:
                pts = el['points']
                x1 = int(min(pts[0][0], pts[1][0]) - roi_left)
                y1 = int(min(pts[0][1], pts[1][1]) - roi_top)
                x2 = int(max(pts[0][0], pts[1][0]) - roi_left)
                y2 = int(max(pts[0][1], pts[1][1]) - roi_top)
            else:
                continue

            cv2.rectangle(overlay_mask, (x1, y1), (x2, y2), color, -1)
            cv2.rectangle(overlay_img, (x1, y1), (x2, y2), color, 3)

        elif el_type == 'point':
            pt = el.get('center') or (el.get('points')[0] if el.get('points') else None)
            if pt:
                px = int(pt[0] - roi_left)
                py = int(pt[1] - roi_top)
                cv2.circle(overlay_img, (px, py), 8, color, -1)
                cv2.circle(overlay_img, (px, py), 10, (255, 255, 255), 2)

    # Trộn độ trong suốt (Alpha Blending 30% fill opacity)
    alpha = 0.35
    cv2.addWeighted(overlay_mask, alpha, overlay_img, 1 - alpha, 0, overlay_img)

    # 5. Lưu ảnh kết quả
    cv2.imwrite(output_png_path, overlay_img)
    print(f"\n✅ ĐÃ XUẤT ẢNH KẾT QUẢ THÀNH CÔNG: {output_png_path}")


if __name__ == "__main__":
    base_dir = r"C:\Users\DXP\Desktop\src dxp\HistomicsUI\frontend\data"
    svs_file = os.path.join(base_dir, "TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.svs")
    json_file = os.path.join(base_dir, "TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.json")
    output_png = os.path.join(base_dir, "OVERLAY_OUTPUT_SVS.png")

    # Gọi hàm xử lý (Tọa độ ROI khớp với mẫu dữ liệu)
    overlay_annotations_on_svs(
        svs_path=svs_file,
        json_path=json_file,
        output_png_path=output_png,
        roi_left=109446,
        roi_top=18274,
        roi_width=6477,
        roi_height=5551
    )
