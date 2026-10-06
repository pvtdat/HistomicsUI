/**
 * HistomicsUI Vector Annotation Layer & Tools Engine
 * Handles SVG rendering, creation, editing, selection, area metrics, and undo/redo history.
 */
const ANNOTATION_LABEL_PALETTE = {
  tumor: '#e6194b',
  stroma: '#3cb44b',
  'lymphocytic infiltrate': '#0082c8',
  'necrosis / debris': '#f58230',
  'glandular secretions': '#911eb4',
  'outside roi / dont care': '#000000',
  'blood, fat, exclude': '#000000'
};

class AnnotationManager {
  constructor(svgElement, viewerManager, options = {}) {
    this.svg = svgElement;
    this.viewerManager = viewerManager;
    this.annotations = [];
    this.selectedId = null;
    this.activeTool = 'select';
    this.currentDrawing = null; // Transient state during drawing
    
    this.globalFillOpacity = 0.25;
    this.globalStrokeOpacity = 0.85;
    this.allVisible = true;
    this.undoStack = [];
    this.redoStack = [];

    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.onAnnotationListChange = options.onAnnotationListChange || (() => {});
    this.onToolStateChange = options.onToolStateChange || (() => {});

    this.initEventListeners();
  }

  setTool(tool) {
    this.activeTool = tool;
    if (tool !== 'polygon' && this.currentDrawing && this.currentDrawing.type === 'polygon') {
      this.cancelDrawing();
    }
    
    // Toggle OpenSeadragon mouse navigation vs drawing
    if (this.viewerManager.viewer) {
      if (tool === 'pan') {
        this.viewerManager.viewer.setMouseNavEnabled(true);
        this.svg.style.pointerEvents = 'none';
      } else {
        this.viewerManager.viewer.setMouseNavEnabled(false);
        this.svg.style.pointerEvents = 'auto';
      }
    }

    const hint = document.getElementById('drawing-instructions');
    if (hint) {
      if (tool === 'polygon') {
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
      }
    }
  }

  initEventListeners() {
    // Re-render SVG layer whenever OpenSeadragon viewport changes
    this.viewerManager.onViewportChange = () => {
      this.render();
    };

    this.svg.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.svg.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.svg.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.svg.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // Keyboard shortcuts for polygon finish / escape
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' && this.currentDrawing && this.currentDrawing.type === 'polygon') {
        this.finishPolygon();
      } else if (e.key === 'Escape') {
        this.cancelDrawing();
        this.selectAnnotation(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedId) {
          this.deleteSelected();
        }
      }
    });
  }

  getPointerImageCoords(e) {
    const rect = this.svg.getBoundingClientRect();
    const screenPt = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    return this.viewerManager.screenToImage(screenPt);
  }

  getColorForLabel(label) {
    const normalizedLabel = String(label || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s*\/\s*/g, ' / ')
      .replace(/\s+/g, ' ')
      .replace(/[.…]+$/g, '')
      .trim()
      .replace(/^mostly\s+/, '');
    const aliases = {
      lymphocyte: 'lymphocytic infiltrate',
      lymphocytic: 'lymphocytic infiltrate',
      necrosis: 'necrosis / debris',
      debris: 'necrosis / debris',
      'glandular secretion': 'glandular secretions',
      'outside roi': 'outside roi / dont care',
      'dont care': 'outside roi / dont care',
      roi: 'outside roi / dont care',
      blood: 'blood, fat, exclude',
      fat: 'blood, fat, exclude',
      exclude: 'blood, fat, exclude',
      'blood vessel': 'blood, fat, exclude',
      'blood, fat, exclude': 'blood, fat, exclude',
      other: 'blood, fat, exclude'
    };
    const paletteKey = aliases[normalizedLabel] || normalizedLabel;
    return ANNOTATION_LABEL_PALETTE[paletteKey] || null;
  }

  handleMouseDown(e) {
    if (e.button !== 0) return; // Only left click
    const imgPt = this.getPointerImageCoords(e);

    if (this.activeTool === 'rectangle') {
      this.saveStateForUndo();
      this.currentDrawing = {
        type: 'rectangle',
        startX: imgPt.x,
        startY: imgPt.y,
        endX: imgPt.x,
        endY: imgPt.y
      };
    } else if (this.activeTool === 'polygon') {
      if (!this.currentDrawing) {
        this.saveStateForUndo();
        this.currentDrawing = {
          type: 'polygon',
          points: [[imgPt.x, imgPt.y], [imgPt.x, imgPt.y]]
        };
      } else {
        // Append point to active polygon
        this.currentDrawing.points.push([imgPt.x, imgPt.y]);
      }
    } else if (this.activeTool === 'point') {
      this.saveStateForUndo();
      const newPoint = {
        id: `ann-${Date.now()}`,
        type: 'point',
        label: 'Lymphocytic infiltrate',
        color: this.getColorForLabel('Lymphocytic infiltrate'),
        notes: '',
        points: [[imgPt.x, imgPt.y]]
      };
      this.annotations.push(newPoint);
      this.selectAnnotation(newPoint.id);
      this.onAnnotationListChange(this.annotations);
    } else if (this.activeTool === 'select') {
      // Handled by SVG element click event listeners inside render
    }
  }

  handleMouseMove(e) {
    const imgPt = this.getPointerImageCoords(e);

    if (this.currentDrawing) {
      if (this.currentDrawing.type === 'rectangle') {
        this.currentDrawing.endX = imgPt.x;
        this.currentDrawing.endY = imgPt.y;
        this.render();
      } else if (this.currentDrawing.type === 'polygon') {
        const pts = this.currentDrawing.points;
        pts[pts.length - 1] = [imgPt.x, imgPt.y];
        this.render();
      }
    }
  }

  handleMouseUp(e) {
    if (this.currentDrawing && this.currentDrawing.type === 'rectangle') {
      const d = this.currentDrawing;
      const minX = Math.min(d.startX, d.endX);
      const maxX = Math.max(d.startX, d.endX);
      const minY = Math.min(d.startY, d.endY);
      const maxY = Math.max(d.startY, d.endY);

      // Only create if drag area is non-zero
      if (maxX - minX > 20 && maxY - minY > 20) {
        const newRect = {
          id: `ann-${Date.now()}`,
          type: 'rectangle',
          label: 'Tumor',
          color: this.getColorForLabel('Tumor'),
          notes: '',
          points: [[minX, minY], [maxX, maxY]]
        };
        this.annotations.push(newRect);
        this.selectAnnotation(newRect.id);
        this.onAnnotationListChange(this.annotations);
      }
      this.currentDrawing = null;
      this.render();
    }
  }

  handleDoubleClick(e) {
    if (this.currentDrawing && this.currentDrawing.type === 'polygon') {
      this.finishPolygon();
    }
  }

  finishPolygon() {
    if (!this.currentDrawing || this.currentDrawing.type !== 'polygon') return;
    const pts = this.currentDrawing.points;
    // Remove transient tracking point
    if (pts.length > 3) {
      pts.pop();
      const newPoly = {
        id: `ann-${Date.now()}`,
        type: 'polygon',
        label: 'Tumor',
        color: this.getColorForLabel('Tumor'),
        notes: '',
        points: pts
      };
      this.annotations.push(newPoly);
      this.selectAnnotation(newPoly.id);
      this.onAnnotationListChange(this.annotations);
    }
    this.currentDrawing = null;
    this.render();
  }

  cancelDrawing() {
    this.currentDrawing = null;
    this.render();
  }

  selectAnnotation(id) {
    this.selectedId = id;
    this.render();
    const selectedObj = this.annotations.find(a => a.id === id) || null;
    this.onSelectionChange(selectedObj);
  }

  updateSelectedAnnotation(updatedProps) {
    if (!this.selectedId) return;
    const ann = this.annotations.find(a => a.id === this.selectedId);
    if (ann) {
      this.saveStateForUndo();
      Object.assign(ann, updatedProps);
      this.render();
      this.onAnnotationListChange(this.annotations);
      this.onSelectionChange(ann);
    }
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this.saveStateForUndo();
    this.annotations = this.annotations.filter(a => a.id !== this.selectedId);
    this.selectedId = null;
    this.render();
    this.onAnnotationListChange(this.annotations);
    this.onSelectionChange(null);
  }

  deleteById(id) {
    this.saveStateForUndo();
    this.annotations = this.annotations.filter(a => a.id !== id);
    if (this.selectedId === id) {
      this.selectedId = null;
      this.onSelectionChange(null);
    }
    this.render();
    this.onAnnotationListChange(this.annotations);
  }

  setGlobalFillOpacity(val) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      this.globalFillOpacity = Math.max(0, Math.min(1, num));
      this.render();
    }
  }

  setGlobalStrokeOpacity(val) {
    const num = parseFloat(val);
    if (!isNaN(num)) {
      this.globalStrokeOpacity = Math.max(0, Math.min(1, num));
      this.render();
    }
  }

  isBlackAnnotation(ann) {
    if (Array.isArray(ann.color)) {
      return ann.color.length >= 3 && ann.color.slice(0, 3).every(channel => Number(channel) === 0);
    }
    const color = String(ann.color || '').toLowerCase().replace(/\s+/g, '');
    return color === 'black' ||
      /^#(?:000|000000|000[0-9a-f]|000000[0-9a-f]{2})$/.test(color) ||
      /^rgba?\(0(?:\.0+)?%?,0(?:\.0+)?%?,0(?:\.0+)?%?(?:,[\d.]+%?)?\)$/.test(color);
  }

  toggleAllVisibility(visibleState) {
    if (typeof visibleState === 'boolean') {
      this.allVisible = visibleState;
    } else {
      this.allVisible = !this.allVisible;
    }
    this.annotations.forEach(ann => {
      ann.visible = this.allVisible && !this.isBlackAnnotation(ann);
    });
    this.render();
    this.onAnnotationListChange(this.annotations);
  }

  toggleAnnotationVisibility(id) {
    const ann = this.annotations.find(a => a.id === id);
    if (ann) {
      ann.visible = ann.visible === false ? true : false;
      this.render();
      this.onAnnotationListChange(this.annotations);
    }
  }

  autoColorByLabel() {
    this.saveStateForUndo();
    this.annotations.forEach(ann => {
      ann.color = this.getColorForLabel(ann.label) || '#000000';
    });
    this.render();
    this.onAnnotationListChange(this.annotations);
    if (this.selectedId) {
      const selected = this.annotations.find(a => a.id === this.selectedId);
      this.onSelectionChange(selected);
    }
  }

  autoDetectOffset() {
    if (!this.annotations || this.annotations.length === 0 || !this.viewerManager) return;
    let minX = Infinity, minY = Infinity;
    this.annotations.forEach(ann => {
      if (Array.isArray(ann.points)) {
        ann.points.forEach(p => {
          if (Array.isArray(p)) {
            if (p[0] < minX) minX = p[0];
            if (p[1] < minY) minY = p[1];
          }
        });
      }
    });

    const imgW = this.viewerManager.imageWidth || 6477;
    const imgH = this.viewerManager.imageHeight || 5551;
    if (minX > imgW && minX < Infinity && (!this.viewerManager.imageOffsetX || this.viewerManager.imageOffsetX === 0)) {
      this.viewerManager.imageOffsetX = minX - 100;
    }
    if (minY > imgH && minY < Infinity && (!this.viewerManager.imageOffsetY || this.viewerManager.imageOffsetY === 0)) {
      this.viewerManager.imageOffsetY = minY - 100;
    }
  }

  saveStateForUndo() {
    this.undoStack.push(JSON.stringify(this.annotations));
    this.redoStack = []; // Clear redo on new action
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.annotations));
    const prevState = this.undoStack.pop();
    this.annotations = JSON.parse(prevState);
    this.selectedId = null;
    this.render();
    this.onAnnotationListChange(this.annotations);
    this.onSelectionChange(null);
    this.updateUndoRedoButtons();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.annotations));
    const nextState = this.redoStack.pop();
    this.annotations = JSON.parse(nextState);
    this.selectedId = null;
    this.render();
    this.onAnnotationListChange(this.annotations);
    this.onSelectionChange(null);
    this.updateUndoRedoButtons();
  }

  updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }

  // Calculate polygon/rectangle metrics in physical units (mm² / µm)
  calculateMetrics(ann) {
    const mpp = this.viewerManager.mpp || 0.25;
    if (ann.type === 'rectangle') {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      const wPx = Math.abs(p2[0] - p1[0]);
      const hPx = Math.abs(p2[1] - p1[1]);
      
      const areaUm2 = wPx * hPx * mpp * mpp;
      const areaMm2 = areaUm2 / 1e6;
      const perimUm = 2 * (wPx + hPx) * mpp;

      return {
        area: areaMm2 >= 0.01 ? `${areaMm2.toFixed(3)} mm²` : `${Math.round(areaUm2).toLocaleString()} µm²`,
        perimeter: `${Math.round(perimUm).toLocaleString()} µm`
      };
    } else if (ann.type === 'polygon') {
      const pts = ann.points;
      let areaPx = 0;
      let perimPx = 0;
      const n = pts.length;
      
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        areaPx += pts[i][0] * pts[j][1];
        areaPx -= pts[j][0] * pts[i][1];

        const dx = pts[j][0] - pts[i][0];
        const dy = pts[j][1] - pts[i][1];
        perimPx += Math.sqrt(dx * dx + dy * dy);
      }
      areaPx = Math.abs(areaPx) / 2;

      const areaUm2 = areaPx * mpp * mpp;
      const areaMm2 = areaUm2 / 1e6;
      const perimUm = perimPx * mpp;

      return {
        area: areaMm2 >= 0.01 ? `${areaMm2.toFixed(3)} mm²` : `${Math.round(areaUm2).toLocaleString()} µm²`,
        perimeter: `${Math.round(perimUm).toLocaleString()} µm`
      };
    }
    return { area: 'N/A (Point)', perimeter: 'N/A' };
  }

  exportJson() {
    const exportData = {
      version: "1.0",
      generator: "HistomicsUI-Lite",
      timestamp: new Date().toISOString(),
      slideId: this.viewerManager.currentSlideId || "demo-breast",
      annotations: this.annotations
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_${exportData.slideId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  parseAnyAnnotationFormat(data) {
    if (!data) return [];
    
    // Convert string to JSON object if needed
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error("Invalid JSON input:", e);
        return [];
      }
    }

    const items = [];

    // Safe point parsing helper ([x,y,z], [x,y], {x,y})
    const parsePoint = (pt) => {
      if (!pt) return null;
      if (Array.isArray(pt) && pt.length >= 2) {
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        if (!isNaN(x) && !isNaN(y)) return [x, y];
      } else if (typeof pt === 'object' && pt !== null) {
        const x = Number(pt.x ?? pt.X);
        const y = Number(pt.y ?? pt.Y);
        if (!isNaN(x) && !isNaN(y)) return [x, y];
      }
      return null;
    };

    // Color parsing helper
    const parseColor = (el) => {
      let color = el.lineColor || el.color || (el.properties && (el.properties.color || el.properties.stroke)) || '#10b981';
      if (typeof color === 'string') {
        if (color === 'rgba(0,0,0,0)' || color === 'transparent') {
          color = '#10b981'; // default readable color for transparent outlines
        }
      } else if (Array.isArray(color) && color.length >= 3) {
        color = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      }
      return color || '#10b981';
    };

    // Helper to process Girder / HistomicsUI / GeoJSON 'element' structure
    const processElement = (el, parentName) => {
      if (!el || typeof el !== 'object') return;

      // Handle GeoJSON Feature
      if (el.type === 'Feature' && el.geometry) {
        const geom = el.geometry;
        const color = parseColor(el);
        const label = el.properties?.name || el.properties?.classification?.name || parentName || 'Feature';
        const id = el.id || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
          const pts = geom.coordinates[0].map(parsePoint).filter(p => p !== null);
          if (pts.length >= 3) {
            items.push({ id, type: 'polygon', label, color, points: pts });
          }
        } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
          geom.coordinates.forEach((poly, idx) => {
            if (Array.isArray(poly) && poly[0]) {
              const pts = poly[0].map(parsePoint).filter(p => p !== null);
              if (pts.length >= 3) {
                items.push({ id: `${id}-${idx}`, type: 'polygon', label, color, points: pts });
              }
            }
          });
        } else if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
          const pt = parsePoint(geom.coordinates);
          if (pt) {
            items.push({ id, type: 'point', label, color, points: [pt] });
          }
        }
        return;
      }

      const rawType = (el.type || 'polygon').toLowerCase();
      const id = el.id || el._id || `ann-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const label = (el.label && el.label.value) || el.name || parentName || 'Annotation';
      const color = parseColor(el);

      let points2d = [];

      if (rawType === 'rectangle' || rawType === 'bbox' || rawType === 'box') {
        if (el.center && typeof el.width === 'number' && typeof el.height === 'number') {
          const cx = Number(el.center[0]);
          const cy = Number(el.center[1]);
          const w = el.width;
          const h = el.height;
          if (!isNaN(cx) && !isNaN(cy)) {
            points2d = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2]];
          }
        } else if (el.corner && typeof el.width === 'number' && typeof el.height === 'number') {
          const x = Number(el.corner[0]);
          const y = Number(el.corner[1]);
          if (!isNaN(x) && !isNaN(y)) {
            points2d = [[x, y], [x + el.width, y + el.height]];
          }
        } else if (Array.isArray(el.points) && el.points.length >= 2) {
          const pts = el.points.map(parsePoint).filter(p => p !== null);
          if (pts.length >= 2) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            pts.forEach(p => {
              minX = Math.min(minX, p[0]);
              maxX = Math.max(maxX, p[0]);
              minY = Math.min(minY, p[1]);
              maxY = Math.max(maxY, p[1]);
            });
            points2d = [[minX, minY], [maxX, maxY]];
          }
        }

        if (points2d.length === 2) {
          items.push({
            id: id,
            type: 'rectangle',
            label: label,
            color: color,
            notes: el.user || '',
            points: points2d
          });
        }

      } else if (rawType === 'point' || rawType === 'circle') {
        if (el.center) {
          const pt = parsePoint(el.center);
          if (pt) points2d = [pt];
        } else if (Array.isArray(el.points) && el.points.length > 0) {
          const pt = parsePoint(el.points[0]);
          if (pt) points2d = [pt];
        }

        if (points2d.length === 1) {
          items.push({
            id: id,
            type: 'point',
            label: label,
            color: color,
            notes: el.user || '',
            points: points2d
          });
        }

      } else { // polyline / polygon
        if (Array.isArray(el.points) && el.points.length > 0) {
          points2d = el.points.map(parsePoint).filter(p => p !== null);
        }

        if (points2d.length >= 3) {
          items.push({
            id: id,
            type: 'polygon',
            label: label,
            color: color,
            notes: el.user || '',
            points: points2d
          });
        }
      }
    };

    // Case 1: Simple internal array [ { id, type, label, color, points }, ... ]
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (!item) return;
        if (item.annotation && Array.isArray(item.annotation.elements)) {
          // HistomicsUI Girder format array of annotation objects
          const name = item.annotation.name || item.name || 'Annotation';
          item.annotation.elements.forEach(el => processElement(el, name));
        } else if (item.elements && Array.isArray(item.elements)) {
          const name = item.name || 'Annotation';
          item.elements.forEach(el => processElement(el, name));
        } else if (item.features && Array.isArray(item.features)) {
          item.features.forEach(f => processElement(f, f.properties?.name || 'Feature'));
        } else if (item.points && Array.isArray(item.points) && item.type && item.label && item.id) {
          items.push(item);
        } else {
          processElement(item, item.name || 'Annotation');
        }
      });
    } 
    // Case 2: GeoJSON FeatureCollection
    else if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
      data.features.forEach(f => processElement(f, f.properties?.name || 'Feature'));
    }
    // Case 3: Object containing 'annotation' -> { name, elements: [...] }
    else if (data.annotation && Array.isArray(data.annotation.elements)) {
      const name = data.annotation.name || 'Annotation';
      data.annotation.elements.forEach(el => processElement(el, name));
    }
    // Case 4: Object containing 'elements' -> [ {...}, ... ]
    else if (data.elements && Array.isArray(data.elements)) {
      const name = data.name || 'Annotation';
      data.elements.forEach(el => processElement(el, name));
    }
    // Case 5: Object containing 'annotations' -> [ {...}, ... ]
    else if (data.annotations && Array.isArray(data.annotations)) {
      return this.parseAnyAnnotationFormat(data.annotations);
    }
    // Case 6: Single element / feature object
    else if (typeof data === 'object') {
      processElement(data, 'Annotation');
    }

    return items.map(ann => ({
      ...ann,
      color: this.getColorForLabel(ann.label) || ann.color
    }));
  }

  importJson(jsonData) {
    try {
      if (typeof jsonData === 'string') {
        try {
          jsonData = JSON.parse(jsonData);
        } catch (jsonErr) {
          alert("Lỗi định dạng JSON: File không hợp lệ.");
          return;
        }
      }
      const parsed = this.parseAnyAnnotationFormat(jsonData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.saveStateForUndo();
        this.annotations = parsed;
        this.selectedId = null;
        this.toggleAllVisibility(true);
        this.onSelectionChange(null);
      } else {
        alert("Không tìm thấy dữ liệu chú thích (annotations) hợp lệ trong file JSON.");
      }
    } catch (e) {
      console.error("Failed to import annotation JSON:", e);
      alert("Lỗi khi đọc file chú thích: " + (e.message || "Định dạng không hợp lệ"));
    }
  }

  // Render SVG elements
  render() {
    this.svg.innerHTML = ''; // Clear SVG layer

    // 1. Render existing stored annotations
    this.annotations.forEach(ann => {
      if (ann.visible === false) return; // Skip hidden annotations

      const isSelected = ann.id === this.selectedId;
      const strokeColor = ann.color || '#ef4444';
      const strokeWidth = isSelected ? 3 : 2;
      const strokeOpacity = typeof ann.strokeOpacity === 'number' ? ann.strokeOpacity : this.globalStrokeOpacity;
      const baseFillOpacity = typeof ann.fillOpacity === 'number' ? ann.fillOpacity : this.globalFillOpacity;
      const fillOpacity = isSelected ? Math.min(1.0, baseFillOpacity + 0.2) : baseFillOpacity;

      if (ann.type === 'rectangle') {
        const sp1 = this.viewerManager.imageToScreen({ x: ann.points[0][0], y: ann.points[0][1] });
        const sp2 = this.viewerManager.imageToScreen({ x: ann.points[1][0], y: ann.points[1][1] });
        
        const x = Math.min(sp1.x, sp2.x);
        const y = Math.min(sp1.y, sp2.y);
        const width = Math.abs(sp2.x - sp1.x);
        const height = Math.abs(sp2.y - sp1.y);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('stroke', strokeColor);
        rect.setAttribute('stroke-width', strokeWidth);
        rect.setAttribute('stroke-opacity', strokeOpacity);
        rect.setAttribute('fill', strokeColor);
        rect.setAttribute('fill-opacity', fillOpacity);
        if (isSelected) rect.classList.add('selected-annotation');

        rect.onclick = (e) => {
          e.stopPropagation();
          this.selectAnnotation(ann.id);
        };
        this.svg.appendChild(rect);

      } else if (ann.type === 'polygon') {
        const screenPts = ann.points.map(pt => {
          const s = this.viewerManager.imageToScreen({ x: pt[0], y: pt[1] });
          return `${s.x},${s.y}`;
        }).join(' ');

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', screenPts);
        poly.setAttribute('stroke', strokeColor);
        poly.setAttribute('stroke-width', strokeWidth);
        poly.setAttribute('stroke-opacity', strokeOpacity);
        poly.setAttribute('fill', strokeColor);
        poly.setAttribute('fill-opacity', fillOpacity);
        if (isSelected) poly.classList.add('selected-annotation');

        poly.onclick = (e) => {
          e.stopPropagation();
          this.selectAnnotation(ann.id);
        };
        this.svg.appendChild(poly);

      } else if (ann.type === 'point') {
        const sp = this.viewerManager.imageToScreen({ x: ann.points[0][0], y: ann.points[0][1] });
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', sp.x);
        circle.setAttribute('cy', sp.y);
        circle.setAttribute('r', isSelected ? 8 : 6);
        circle.setAttribute('stroke', strokeColor);
        circle.setAttribute('stroke-width', strokeWidth);
        circle.setAttribute('stroke-opacity', strokeOpacity);
        circle.setAttribute('fill', strokeColor);
        circle.setAttribute('fill-opacity', Math.max(0.2, fillOpacity * 1.5));
        if (isSelected) circle.classList.add('selected-annotation');
        if (isSelected) circle.classList.add('selected-annotation');

        circle.onclick = (e) => {
          e.stopPropagation();
          this.selectAnnotation(ann.id);
        };
        this.svg.appendChild(circle);
      }
    });

    // 2. Render transient active drawing item
    if (this.currentDrawing) {
      const d = this.currentDrawing;
      if (d.type === 'rectangle') {
        const sp1 = this.viewerManager.imageToScreen({ x: d.startX, y: d.startY });
        const sp2 = this.viewerManager.imageToScreen({ x: d.endX, y: d.endY });
        
        const x = Math.min(sp1.x, sp2.x);
        const y = Math.min(sp1.y, sp2.y);
        const width = Math.abs(sp2.x - sp1.x);
        const height = Math.abs(sp2.y - sp1.y);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', width);
        rect.setAttribute('height', height);
        rect.setAttribute('stroke', '#6366f1');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '5,5');
        rect.setAttribute('fill', '#6366f1');
        rect.setAttribute('fill-opacity', '0.15');
        this.svg.appendChild(rect);

      } else if (d.type === 'polygon') {
        const screenPts = d.points.map(pt => {
          const s = this.viewerManager.imageToScreen({ x: pt[0], y: pt[1] });
          return `${s.x},${s.y}`;
        }).join(' ');

        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', screenPts);
        poly.setAttribute('stroke', '#6366f1');
        poly.setAttribute('stroke-width', '2');
        poly.setAttribute('stroke-dasharray', '5,5');
        poly.setAttribute('fill', '#6366f1');
        poly.setAttribute('fill-opacity', '0.15');
        this.svg.appendChild(poly);

        // Draw small handle dots on polygon vertices
        d.points.forEach(pt => {
          const sp = this.viewerManager.imageToScreen({ x: pt[0], y: pt[1] });
          const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          dot.setAttribute('cx', sp.x);
          dot.setAttribute('cy', sp.y);
          dot.setAttribute('r', '4');
          dot.setAttribute('fill', '#6366f1');
          this.svg.appendChild(dot);
        });
      }
    }
  }
}

window.AnnotationManager = AnnotationManager;
