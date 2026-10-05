/**
 * HistomicsUI Vector Annotation Layer & Tools Engine
 * Handles SVG rendering, creation, editing, selection, area metrics, and undo/redo history.
 */
class AnnotationManager {
  constructor(svgElement, viewerManager, options = {}) {
    this.svg = svgElement;
    this.viewerManager = viewerManager;
    this.annotations = [];
    this.selectedId = null;
    this.activeTool = 'select';
    this.currentDrawing = null; // Transient state during drawing
    
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
        label: 'Lymphocyte',
        color: '#3b82f6',
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
          color: '#ef4444',
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
        color: '#ef4444',
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

  importJson(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      const imported = data.annotations || (Array.isArray(data) ? data : []);
      if (Array.isArray(imported) && imported.length > 0) {
        this.saveStateForUndo();
        this.annotations = imported;
        this.selectedId = null;
        this.render();
        this.onAnnotationListChange(this.annotations);
        this.onSelectionChange(null);
      }
    } catch (e) {
      alert("Invalid JSON format for annotations.");
    }
  }

  // Render SVG elements
  render() {
    this.svg.innerHTML = ''; // Clear SVG layer

    // 1. Render existing stored annotations
    this.annotations.forEach(ann => {
      const isSelected = ann.id === this.selectedId;
      const strokeColor = ann.color || '#ef4444';
      const strokeWidth = isSelected ? 3 : 2;

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
        rect.setAttribute('fill', strokeColor);
        rect.setAttribute('fill-opacity', isSelected ? '0.35' : '0.2');
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
        poly.setAttribute('fill', strokeColor);
        poly.setAttribute('fill-opacity', isSelected ? '0.35' : '0.2');
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
        circle.setAttribute('fill', strokeColor);
        circle.setAttribute('fill-opacity', '0.8');
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
