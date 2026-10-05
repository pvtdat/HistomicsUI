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

  const statusX = document.getElementById('statusX');
  const statusY = document.getElementById('statusY');
  const statusZoom = document.getElementById('statusZoom');
  const statusMPP = document.getElementById('statusMPP');
  const statusSlideSize = document.getElementById('statusSlideSize');
  const backendIndicator = document.getElementById('backendStatus');

  if (backendIndicator) {
    backendIndicator.className = 'backend-indicator online';
    backendIndicator.innerHTML = '<span class="dot"></span> Pure Frontend Mode';
  }

  // Initialize Core Viewer
  const viewerManager = new PathologyViewer('openseadragon-viewer', {
    onViewportChange: (mag) => {
      const metrics = viewerManager.getViewportMetrics();
      if (statusZoom) statusZoom.textContent = `${metrics.magnification}x`;
      if (statusMPP) statusMPP.textContent = `${metrics.currentMPP} μm`;
      if (window.sidebarController) window.sidebarController.updateZoomDisplay(metrics.magnification);
    },
    onMouseMove: (coords) => {
      if (statusX) statusX.textContent = coords.x.toLocaleString();
      if (statusY) statusY.textContent = coords.y.toLocaleString();
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
    viewerManager.loadSlide(meta, null);

    // 3. Load annotations
    const annList = await PathologyAPI.getAnnotations(slideId);
    annotationManager.annotations = annList;
    annotationManager.selectedId = null;
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
    localFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const customMeta = {
            id: `local-${Date.now()}`,
            name: file.name,
            dimensions: `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()} px`,
            width: img.naturalWidth,
            height: img.naturalHeight,
            magnification: '20x',
            mpp: 0.5,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`
          };
          sidebarController.updateSlideMetadata(customMeta);
          if (statusSlideSize) statusSlideSize.textContent = `${img.naturalWidth.toLocaleString()} × ${img.naturalHeight.toLocaleString()}`;
          if (statusMPP) statusMPP.textContent = `${customMeta.mpp} μm`;

          viewerManager.loadSlide(customMeta, { type: 'image', url: objectUrl });
          annotationManager.annotations = [];
          annotationManager.render();
          sidebarController.renderAnnotationList([]);
        };
        img.src = objectUrl;
      }
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
  loadSlide('demo-breast');
});
