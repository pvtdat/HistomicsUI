/**
 * Right Sidebar Controller
 * Manages Slide Metadata, Annotation List, Search, and Selected Property Editor.
 */
class SidebarController {
  constructor(annotationManager, viewerManager) {
    this.annotationManager = annotationManager;
    this.viewerManager = viewerManager;

    // Elements
    this.metaName = document.getElementById('metaSlideName');
    this.metaDim = document.getElementById('metaSlideDimensions');
    this.metaMag = document.getElementById('metaSlideMag');
    this.metaMPP = document.getElementById('metaSlideMPP');
    this.metaSize = document.getElementById('metaSlideSize');

    this.annotationList = document.getElementById('annotationList');
    this.annotationSearch = document.getElementById('annotationSearch');
    this.countBadge = document.getElementById('annotationCountBadge');

    this.propertiesForm = document.getElementById('propertiesForm');
    this.noSelectionMsg = document.getElementById('noSelectionMsg');

    this.propLabel = document.getElementById('propLabel');
    this.propColor = document.getElementById('propColor');
    this.colorHexText = document.getElementById('colorHexText');
    this.propFillOpacity = document.getElementById('propFillOpacity');
    this.propFillOpacityVal = document.getElementById('propFillOpacityVal');
    this.propNotes = document.getElementById('propNotes');
    this.propArea = document.getElementById('propArea');
    this.propPerimeter = document.getElementById('propPerimeter');

    this.globalOpacitySlider = document.getElementById('globalOpacitySlider');
    this.globalStrokeOpacitySlider = document.getElementById('globalStrokeOpacitySlider');
    this.btnShowAllAnn = document.getElementById('btnShowAllAnn');
    this.btnHideAllAnn = document.getElementById('btnHideAllAnn');
    this.btnAutoColor = document.getElementById('btnAutoColor');
    // Zoom Elements
    this.zoomSlider = document.getElementById('zoomSlider');
    this.zoomInput = document.getElementById('zoomInput');
    this.btnZoomIn = document.getElementById('btnZoomIn');
    this.btnZoomOut = document.getElementById('btnZoomOut');
    this.presetBtns = document.querySelectorAll('.btn-zoom-preset');
    this.btnDownloadView = document.getElementById('btnDownloadView');
    this.btnDownloadArea = document.getElementById('btnDownloadArea');

    this.initEvents();
  }

  initEvents() {
    // Zoom Slider Event
    if (this.zoomSlider) {
      this.zoomSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.viewerManager.setMagnification(val);
        if (this.zoomInput) this.zoomInput.value = val.toFixed(1);
        this.updateActivePreset(val);
      });
    }

    // Zoom Input Event
    if (this.zoomInput) {
      this.zoomInput.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
          this.viewerManager.setMagnification(val);
          if (this.zoomSlider) this.zoomSlider.value = val;
          this.updateActivePreset(val);
        }
      });
    }

    // Zoom In / Out Buttons
    if (this.btnZoomIn) {
      this.btnZoomIn.addEventListener('click', () => {
        this.viewerManager.zoomIn();
      });
    }

    if (this.btnZoomOut) {
      this.btnZoomOut.addEventListener('click', () => {
        this.viewerManager.zoomOut();
      });
    }

    // Download View & Download Area Buttons
    if (this.btnDownloadView) {
      this.btnDownloadView.addEventListener('click', () => {
        this.viewerManager.downloadViewSnapshot();
      });
    }

    if (this.btnDownloadArea) {
      this.btnDownloadArea.addEventListener('click', () => {
        this.viewerManager.downloadAreaSnapshot();
      });
    }

    // Zoom Preset Buttons
    if (this.presetBtns) {
      this.presetBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          btn.blur();
          const val = btn.dataset.zoom;
          if (val === 'fit') {
            this.viewerManager.zoomToFit();
          } else {
            const num = parseFloat(val);
            this.viewerManager.setMagnification(num);
            if (this.zoomInput) this.zoomInput.value = num.toFixed(1);
            if (this.zoomSlider) this.zoomSlider.value = num;
            this.updateActivePreset(num);
          }
        });
      });
    }

    if (this.globalOpacitySlider) {
      this.globalOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.annotationManager.setGlobalFillOpacity(val);
      });
    }

    if (this.globalStrokeOpacitySlider) {
      this.globalStrokeOpacitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.annotationManager.setGlobalStrokeOpacity(val);
      });
    }

    if (this.btnShowAllAnn) {
      this.btnShowAllAnn.addEventListener('click', () => {
        this.annotationManager.toggleAllVisibility(true);
      });
    }

    if (this.btnHideAllAnn) {
      this.btnHideAllAnn.addEventListener('click', () => {
        this.annotationManager.toggleAllVisibility(false);
      });
    }

    if (this.btnAutoColor) {
      this.btnAutoColor.addEventListener('click', () => {
        this.annotationManager.autoColorByLabel();
      });
    }

    if (this.annotationSearch) {
      this.annotationSearch.addEventListener('input', () => {
        this.renderAnnotationList(this.annotationManager.annotations);
      });
    }

    if (this.propLabel) {
      this.propLabel.addEventListener('change', () => {
        this.annotationManager.updateSelectedAnnotation({ label: this.propLabel.value });
      });
    }

    if (this.propColor) {
      this.propColor.addEventListener('input', () => {
        this.colorHexText.textContent = this.propColor.value;
        this.annotationManager.updateSelectedAnnotation({ color: this.propColor.value });
      });
    }

    if (this.propFillOpacity) {
      this.propFillOpacity.addEventListener('input', () => {
        const val = parseFloat(this.propFillOpacity.value);
        if (this.propFillOpacityVal) this.propFillOpacityVal.textContent = `${Math.round(val * 100)}%`;
        this.annotationManager.updateSelectedAnnotation({ fillOpacity: val });
      });
    }

    if (this.propNotes) {
      this.propNotes.addEventListener('input', () => {
        this.annotationManager.updateSelectedAnnotation({ notes: this.propNotes.value });
      });
    }

    if (this.btnDeleteCurrent) {
      this.btnDeleteCurrent.addEventListener('click', () => {
        this.annotationManager.deleteSelected();
      });
    }
  }

  updateZoomDisplay(zoom, mag) {
    const displayVal = mag !== undefined ? mag : zoom;
    if (this.zoomSlider) this.zoomSlider.value = displayVal;
    if (this.zoomInput) this.zoomInput.value = displayVal.toFixed(1);
    this.updateActivePreset(displayVal);
  }

  updateActivePreset(currentMag) {
    if (!this.presetBtns) return;
    const mag = parseFloat(currentMag);
    this.presetBtns.forEach(btn => {
      const val = btn.dataset.zoom;
      if (val === 'fit') {
        btn.classList.remove('active');
      } else {
        const presetNum = parseFloat(val);
        if (!isNaN(presetNum) && Math.abs(presetNum - mag) < 0.25) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });
  }

  updateSlideMetadata(meta) {
    if (this.metaName) this.metaName.textContent = meta.name || 'slide.svs';
    if (this.metaDim) this.metaDim.textContent = meta.dimensions || '40,960 × 30,720 px';
    if (this.metaMag) this.metaMag.textContent = meta.magnification || '40x';
    if (this.metaMPP) this.metaMPP.textContent = `${meta.mpp || 0.25} μm`;
    if (this.metaSize) this.metaSize.textContent = meta.fileSize || '1.24 GB';
  }

  renderAnnotationList(annotations) {
    if (!this.annotationList) return;
    this.annotationList.innerHTML = '';

    if (this.countBadge) {
      this.countBadge.textContent = annotations.length;
    }

    const filterText = (this.annotationSearch ? this.annotationSearch.value : '').toLowerCase();
    const filtered = annotations.filter(a => {
      const label = (a.label || '').toLowerCase();
      const type = (a.type || '').toLowerCase();
      const notes = (a.notes || '').toLowerCase();
      return label.includes(filterText) || type.includes(filterText) || notes.includes(filterText);
    });

    if (filtered.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-state';
      emptyLi.textContent = annotations.length === 0 ? 'No annotations added yet.' : 'No matching annotations found.';
      this.annotationList.appendChild(emptyLi);
      return;
    }

    filtered.forEach(ann => {
      const li = document.createElement('li');
      li.className = `annotation-item ${ann.id === this.annotationManager.selectedId ? 'selected' : ''}`;
      
      const metrics = this.annotationManager.calculateMetrics(ann);
      const isVisible = ann.visible !== false;

      li.innerHTML = `
        <div class="ann-item-left">
          <button class="btn-eye-toggle ${!isVisible ? 'hidden-ann' : ''}" title="${!isVisible ? 'Hiện chú thích' : 'Ẩn chú thích'}">
            ${!isVisible ? `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            `}
          </button>
          <span class="ann-color-dot" style="background-color: ${ann.color || '#ef4444'}"></span>
          <div>
            <div class="ann-item-name">${ann.label || 'Annotation'}</div>
            <div class="ann-item-type">${ann.type.toUpperCase()} • ${metrics.area}</div>
          </div>
        </div>
        <div class="ann-item-actions">
          <button class="btn-icon-sm btn-zoom" title="Zoom to Annotation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="btn-icon-sm btn-del" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;

      // Item click selects annotation
      li.addEventListener('click', (e) => {
        if (!e.target.closest('.ann-item-actions') && !e.target.closest('.btn-eye-toggle')) {
          this.annotationManager.selectAnnotation(ann.id);
        }
      });

      // Eye toggle button
      const eyeBtn = li.querySelector('.btn-eye-toggle');
      if (eyeBtn) {
        eyeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.annotationManager.toggleAnnotationVisibility(ann.id);
        });
      }

      // Zoom button
      const zoomBtn = li.querySelector('.btn-zoom');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.annotationManager.selectAnnotation(ann.id);
          this.viewerManager.zoomToAnnotation(ann.points);
        });
      }

      // Delete button
      const delBtn = li.querySelector('.btn-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.annotationManager.deleteById(ann.id);
        });
      }

      this.annotationList.appendChild(li);
    });
  }

  showSelectedProperties(ann) {
    if (!ann) {
      if (this.propertiesForm) this.propertiesForm.classList.add('hidden');
      if (this.noSelectionMsg) this.noSelectionMsg.classList.remove('hidden');
      return;
    }

    if (this.propertiesForm) this.propertiesForm.classList.remove('hidden');
    if (this.noSelectionMsg) this.noSelectionMsg.classList.add('hidden');

    if (this.propLabel) this.propLabel.value = ann.label || 'Tumor';
    if (this.propColor) {
      this.propColor.value = ann.color || '#ef4444';
      if (this.colorHexText) this.colorHexText.textContent = ann.color || '#ef4444';
    }
    if (this.propFillOpacity) {
      const opacity = typeof ann.fillOpacity === 'number' ? ann.fillOpacity : this.annotationManager.globalFillOpacity;
      this.propFillOpacity.value = opacity;
      if (this.propFillOpacityVal) this.propFillOpacityVal.textContent = `${Math.round(opacity * 100)}%`;
    }
    if (this.propNotes) this.propNotes.value = ann.notes || '';

    const metrics = this.annotationManager.calculateMetrics(ann);
    if (this.propArea) this.propArea.textContent = metrics.area;
    if (this.propPerimeter) this.propPerimeter.textContent = metrics.perimeter;
  }
}

window.SidebarController = SidebarController;
