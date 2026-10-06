/**
 * HistomicsUI Lite Main Application Bootstrap
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const slideSelect = document.getElementById('slideSelect');
  const localFileInput = document.getElementById('localFileInput');
  const btnImportJson = document.getElementById('btnImportJson');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnResetView = document.getElementById('btnResetView');
  const btnFullscreen = document.getElementById('btnFullscreen');

  const statusPosition = document.getElementById('statusPosition');
  const statusZoom = document.getElementById('statusZoom');
  const statusMPP = document.getElementById('statusMPP');
  const statusSlideSize = document.getElementById('statusSlideSize');

  // Initialize Core Viewer
  const viewerManager = new PathologyViewer('openseadragon-viewer', {
    onViewportChange: (mag) => {
      const metrics = viewerManager.getViewportMetrics();
      if (statusZoom) statusZoom.textContent = `${metrics.magnification}x`;
      if (statusMPP) statusMPP.textContent = `${metrics.currentMPP} μm`;
      if (window.sidebarController) window.sidebarController.updateZoomDisplay(metrics.magnification);
      if (window.annotationManager) window.annotationManager.render();
    },
    onMouseMove: (coords) => {
      if (statusPosition) statusPosition.textContent = `${coords.x.toLocaleString()}, ${coords.y.toLocaleString()}`;
    }
  });

  // SVG Layer
  const svgLayer = document.getElementById('annotation-svg-layer');

  // Initialize Annotation Manager
  const annotationManager = new AnnotationManager(svgLayer, viewerManager, {
    onSelectionChange: (selectedAnn) => {
      sidebarController.showSelectedProperties(selectedAnn);
      toolbarController.updateDeleteButtonState(!!selectedAnn);
      sidebarController.renderAnnotationList(annotationManager.annotations);
    },
    onAnnotationListChange: (annotations) => {
      sidebarController.renderAnnotationList(annotations);
      // Auto-save annotations to localStorage
      PathologyAPI.saveAnnotations(viewerManager.currentSlideId, annotations);
    }
  });
  window.annotationManager = annotationManager;

  // Initialize Controllers
  const toolbarController = new ToolbarController(annotationManager);
  const sidebarController = new SidebarController(annotationManager, viewerManager);
  window.sidebarController = sidebarController;

  // Load Slide Routine
  async function loadSlide(slideId) {
    viewerManager.currentSlideId = slideId;

    // 1. Fetch metadata
    const meta = await PathologyAPI.getSlideMetadata(slideId);
    sidebarController.updateSlideMetadata(meta);

    const w = (meta.width || 40960).toLocaleString();
    const h = (meta.height || 30720).toLocaleString();
    if (statusSlideSize) statusSlideSize.textContent = `${w} × ${h}`;
    if (statusMPP) statusMPP.textContent = `${meta.mpp || 0.25} μm`;

    // 2. Open tile source via frontend viewer
    const tileSource = meta.tileSourceUrl ? meta.tileSourceUrl : (meta.imageUrl ? { type: 'image', url: meta.imageUrl } : null);
    viewerManager.loadSlide(meta, tileSource);

    // 3. Load annotations
    const annList = await PathologyAPI.getAnnotations(slideId);
    annList.forEach((ann) => {
      const label = String(ann.label || '')
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (ann.visible === undefined && (label === 'roi' || label.startsWith('outside roi') || label === 'dont care')) {
        ann.visible = false;
      }
    });
    annotationManager.annotations = annList;
    annotationManager.selectedId = null;
    annotationManager.autoDetectOffset();
    annotationManager.render();
    sidebarController.renderAnnotationList(annList);
    sidebarController.showSelectedProperties(null);
  }

  // Header Actions
  if (slideSelect) {
    slideSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'upload-local') {
        localFileInput.click();
      } else {
        loadSlide(val);
      }
    });
  }

  if (localFileInput) {
    localFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const ext = file.name.split('.').pop().toLowerCase();
      const isWsi = ['svs', 'tif', 'tiff', 'ndpi', 'mrxs'].includes(ext);

      if (isWsi) {
        // Upload WSI file to Tile Server
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/v1/upload-wsi', {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            console.log('Upload WSI successful:', data);
            
            // Load uploaded slide metadata
            const metaRes = await fetch(`/api/v1/slide/${encodeURIComponent(file.name)}/metadata`);
            if (metaRes.ok) {
              const remoteMeta = await metaRes.json();
              const meta = {
                id: file.name,
                name: file.name,
                dimensions: `${remoteMeta.width.toLocaleString()} × ${remoteMeta.height.toLocaleString()} px`,
                width: remoteMeta.width,
                height: remoteMeta.height,
                magnification: remoteMeta.magnification || "40x",
                mpp: remoteMeta.mpp || 0.25,
                fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                tileSourceUrl: {
                  height: remoteMeta.height,
                  width: remoteMeta.width,
                  tileSize: remoteMeta.tileWidth || 256,
                  minLevel: 0,
                  maxLevel: remoteMeta.levels - 1,
                  getTileUrl: function (level, x, y) {
                    return `/api/v1/slide/${encodeURIComponent(file.name)}/tile/${level}/${x}/${y}.png`;
                  }
                },
                offsetX: 0,
                offsetY: 0
              };

              sidebarController.updateSlideMetadata(meta);
              if (statusSlideSize) statusSlideSize.textContent = `${remoteMeta.width.toLocaleString()} × ${remoteMeta.height.toLocaleString()}`;
              if (statusMPP) statusMPP.textContent = `${meta.mpp} μm`;

              viewerManager.loadSlide(meta, meta.tileSourceUrl);
              annotationManager.render();
              return;
            }
          }
        } catch (uploadErr) {
          console.error("Failed to upload WSI file to server:", uploadErr);
          alert("Không thể upload file WSI lên Tile Server. Đảm bảo python server.py đang chạy.");
        }
      }

      // Fallback for regular image files (PNG / JPG)
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const xminMatch = file.name.match(/xmin(\d+)/i);
        const yminMatch = file.name.match(/ymin(\d+)/i);
        const offsetX = xminMatch ? parseInt(xminMatch[1], 10) : 0;
        const offsetY = yminMatch ? parseInt(yminMatch[1], 10) : 0;

        const customMeta = {
          id: `local-${Date.now()}`,
          name: file.name,
          dimensions: `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px`,
          width: img.naturalWidth,
          height: img.naturalHeight,
          magnification: '40x',
          mpp: 0.25,
          fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          imageUrl: objectUrl,
          offsetX: offsetX,
          offsetY: offsetY
        };
        sidebarController.updateSlideMetadata(customMeta);
        if (statusSlideSize) statusSlideSize.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()}`;
        if (statusMPP) statusMPP.textContent = `${customMeta.mpp} μm`;

        viewerManager.loadSlide(customMeta, { type: 'image', url: objectUrl });
        
        if (annotationManager.annotations.length > 0) {
          annotationManager.autoDetectOffset();
          annotationManager.render();
          sidebarController.renderAnnotationList(annotationManager.annotations);
        } else {
          annotationManager.render();
          sidebarController.renderAnnotationList([]);
        }
      };
      img.src = objectUrl;
    });
  }

  if (btnImportJson) {
    btnImportJson.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            annotationManager.importJson(evt.target.result);
            annotationManager.autoDetectOffset();
            annotationManager.render();
          };
          reader.readAsText(file);
        }
      };
      input.click();
    });
  }

  if (btnExportJson) {
    btnExportJson.addEventListener('click', () => {
      annotationManager.exportJson();
    });
  }

  if (btnResetView) {
    btnResetView.addEventListener('click', () => {
      viewerManager.resetView();
    });
  }

  // Fullscreen button icon sync
  function updateFullscreenBtnIcon(isFS) {
    if (!btnFullscreen) return;
    if (isFS) {
      btnFullscreen.setAttribute('title', 'Exit Full Screen');
      btnFullscreen.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
        </svg>
      `;
    } else {
      btnFullscreen.setAttribute('title', 'Full Screen');
      btnFullscreen.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
      `;
    }
  }

  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      viewerManager.toggleFullscreen();
    });
  }

  const handleFullscreenChange = () => {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    updateFullscreenBtnIcon(isFS);
  };

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('mozfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);

  // Toggle Left Toolbar Collapse
  const btnToggleToolbar = document.getElementById('btnToggleToolbar');
  const leftToolbar = document.getElementById('leftToolbar');
  if (btnToggleToolbar && leftToolbar) {
    btnToggleToolbar.addEventListener('click', () => {
      leftToolbar.classList.toggle('collapsed');
    });
  }

  // Toggle Right Sidebar Overlay Collapse
  const sidebarTopBar = document.getElementById('sidebarTopBar');
  const rightSidebar = document.getElementById('rightSidebar');
  const sidebarToggleIcon = document.getElementById('sidebarToggleIcon');
  if (sidebarTopBar && rightSidebar) {
    sidebarTopBar.addEventListener('click', () => {
      rightSidebar.classList.toggle('collapsed');
      if (sidebarToggleIcon) {
        if (rightSidebar.classList.contains('collapsed')) {
          sidebarToggleIcon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
        } else {
          sidebarToggleIcon.innerHTML = '<polyline points="18 15 12 9 6 15"/>';
        }
      }
    });
  }

  // Initial Load
  loadSlide('tcga-a2-a0st');
});
