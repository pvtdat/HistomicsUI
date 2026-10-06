/**
 * OpenSeadragon Viewer Manager
 * Controls deep-zoom viewport, tile loading, and screen-to-image coordinate mapping.
 */
class PathologyViewer {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.viewer = null;
    this.imageWidth = 40960;
    this.imageHeight = 30720;
    this.mpp = 0.25;
    this.onViewportChange = options.onViewportChange || (() => {});
    this.onMouseMove = options.onMouseMove || (() => {});
    
    this.initViewer();
    this.preventBrowserZoom();
  }

  initViewer() {
    this.viewer = OpenSeadragon({
      id: this.containerId,
      prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/",
      showNavigationControl: false,
      showNavigator: true,
      navigatorId: "overview-container",
      animationTime: 0.45,
      springStiffness: 5,
      blendTime: 0.1,
      constrainDuringPan: true,
      maxZoomPixelRatio: 10,
      minZoomImageRatio: 0.2,
      visibilityRatio: 0.8,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: false,
        scrollToZoom: true,
        zoomPerScroll: 1.15
      },
      gestureSettingsTouch: {
        pinchToZoom: true
      }
    });

    // Listen on the outer viewer so the sibling annotation SVG cannot block pointer tracking.
    const viewerSurface = this.viewer.container.parentElement;
    if (viewerSurface) {
      viewerSurface.addEventListener('mousemove', (evt) => {
        if (!this.viewer.viewport) return;
        const viewerRect = this.viewer.container.getBoundingClientRect();
        const webPoint = new OpenSeadragon.Point(
          evt.clientX - viewerRect.left,
          evt.clientY - viewerRect.top
        );
        const viewportPoint = this.viewer.viewport.pointFromPixel(webPoint);
        const imagePoint = this.viewer.viewport.viewportToImageCoordinates(viewportPoint);

        const imgX = Math.round(Math.max(0, Math.min(this.imageWidth, imagePoint.x)));
        const imgY = Math.round(Math.max(0, Math.min(this.imageHeight, imagePoint.y)));

        this.onMouseMove({ x: imgX, y: imgY });
      });
    }

    // Continuous real-time viewport change events (fires 60fps on wheel, gesture & trackpad zoom)
    const triggerViewportChange = () => {
      if (!this.viewer || !this.viewer.viewport) return;
      const mag = this.getCurrentMagnification();
      this.onViewportChange(mag);
      this.updateScalebar();
    };

    this.viewer.addHandler('viewport-change', triggerViewportChange);
    this.viewer.addHandler('animation', triggerViewportChange);
    this.viewer.addHandler('animation-start', triggerViewportChange);
    this.viewer.addHandler('animation-finish', triggerViewportChange);
    this.viewer.addHandler('update-viewport', triggerViewportChange);
    this.viewer.addHandler('open', triggerViewportChange);
    this.viewer.addHandler('zoom', triggerViewportChange);
    this.viewer.addHandler('pan', triggerViewportChange);
    this.viewer.addHandler('canvas-scroll', triggerViewportChange);
    this.viewer.addHandler('resize', triggerViewportChange);
  }

  preventBrowserZoom() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    // Prevent default trackpad pinch gesture that zooms webview page
    const preventZoomEvents = (e) => {
      if (e.ctrlKey || e.metaKey || (e.touches && e.touches.length > 1)) {
        e.preventDefault();
      }
    };

    el.addEventListener('wheel', preventZoomEvents, { passive: false });
    el.addEventListener('gesturestart', preventZoomEvents, { passive: false });
    el.addEventListener('gesturechange', preventZoomEvents, { passive: false });
    el.addEventListener('touchmove', preventZoomEvents, { passive: false });
  }

  updateScalebar() {
    if (!this.viewer || !this.viewer.viewport) return;

    const statusScale = document.getElementById('statusScale');
    if (!statusScale) return;

    const containerWidth = this.viewer.container ? this.viewer.container.clientWidth : 800;
    const viewportBounds = this.viewer.viewport.getBounds();
    const imageWidthInViewport = viewportBounds.width * this.imageWidth;

    if (imageWidthInViewport <= 0) return;

    // Screen pixels per image pixel
    const screenPxPerImgPx = containerWidth / imageWidthInViewport;

    // Screen pixels per micron
    const mpp = this.mpp || 0.25;
    const screenPxPerMicron = screenPxPerImgPx / mpp;

    // Target ~100px bar length
    const targetPx = 100;
    const targetMicrons = targetPx / screenPxPerMicron;

    // Standard physical steps in microns
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    let chosenStep = steps[0];
    for (let i = 0; i < steps.length; i++) {
      if (steps[i] <= targetMicrons * 1.4) {
        chosenStep = steps[i];
      } else {
        break;
      }
    }

    if (chosenStep >= 1000) {
      statusScale.textContent = `${chosenStep / 1000} mm`;
    } else {
      statusScale.textContent = `${chosenStep} µm`;
    }
  }

  loadSlide(slideMetadata, tileSourceUrl) {
    this.currentSlideId = slideMetadata.id;
    this.imageWidth = slideMetadata.roiWidth || slideMetadata.width || 40960;
    this.imageHeight = slideMetadata.roiHeight || slideMetadata.height || 30720;
    this.mpp = slideMetadata.mpp || 0.25;
    this.nativeMagnification = slideMetadata.magnification || '40x';
    this.imageOffsetX = slideMetadata.offsetX || 0;
    this.imageOffsetY = slideMetadata.offsetY || 0;

    let tileSource;
    if (tileSourceUrl) {
      tileSource = tileSourceUrl;
    } else if (slideMetadata.imageUrl) {
      tileSource = {
        type: 'image',
        url: slideMetadata.imageUrl
      };
    } else {
      tileSource = this.createSyntheticTileSource(this.imageWidth, this.imageHeight, slideMetadata.id);
    }

    this.viewer.open(tileSource);
  }

  getViewportMetrics() {
    if (!this.viewer || !this.viewer.viewport) {
      return { zoom: 1.0, magnification: 1.0, currentMPP: (this.mpp || 0.25).toFixed(2), imageZoom: 1.0 };
    }
    const viewportZoom = this.viewer.viewport.getZoom(true);
    const imageZoom = this.viewer.viewport.viewportToImageZoom(viewportZoom);
    
    let nativeMag = 40;
    if (typeof this.nativeMagnification === 'string') {
      nativeMag = parseFloat(this.nativeMagnification.replace(/[^0-9.]/g, '')) || 40;
    } else if (typeof this.nativeMagnification === 'number') {
      nativeMag = this.nativeMagnification;
    }

    const magnification = Math.round(imageZoom * nativeMag * 10) / 10;
    const baseMpp = this.mpp || 0.25;
    const currentMPP = imageZoom > 0 ? (baseMpp / imageZoom) : baseMpp;

    return {
      zoom: Math.round(viewportZoom * 10) / 10,
      imageZoom: Math.round(imageZoom * 100) / 100,
      magnification: magnification > 0 ? magnification : 1.0,
      currentMPP: currentMPP > 0 ? currentMPP.toFixed(2) : baseMpp.toFixed(2)
    };
  }

  createSyntheticTileSource(width, height, slideId) {
    const isKidney = slideId === 'demo-kidney';
    const primaryHue = isKidney ? 210 : 330; // Blue for kidney, Magenta/H&E for breast tissue
    
    return {
      height: height,
      width: width,
      tileSize: 512,
      minLevel: 0,
      maxLevel: 10,
      getTileUrl: function(level, x, y) {
        // Return a canvas data URL generating realistic H&E stained pathology tissue pattern
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Background tissue stroma gradient
        const bgGrad = ctx.createRadialGradient(256, 256, 10, 256, 256, 300);
        bgGrad.addColorStop(0, `hsl(${primaryHue}, 60%, 88%)`);
        bgGrad.addColorStop(1, `hsl(${primaryHue + 20}, 40%, 94%)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 512, 512);

        // Draw cellular structures & nuclei pattern based on grid level
        const step = Math.max(16, 64 - level * 4);
        ctx.fillStyle = `hsla(${primaryHue - 40}, 75%, 35%, 0.65)`;
        
        for (let px = (x * 512) % 37; px < 512; px += step) {
          for (let py = (y * 512) % 43; py < 512; py += step) {
            const r = 3 + ((px * py + x + y) % 6);
            ctx.beginPath();
            ctx.arc(px + (py % 7), py + (px % 5), r, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Draw subtle tissue boundary lines
        ctx.strokeStyle = `hsla(${primaryHue}, 30%, 70%, 0.4)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 512, 512);

        // Tile level label overlay (small mono text)
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.font = "10px monospace";
        ctx.fillText(`L:${level} X:${x} Y:${y}`, 12, 24);

        return canvas.toDataURL('image/jpeg', 0.85);
      }
    };
  }

  getNativeMag() {
    if (typeof this.nativeMagnification === 'string') {
      return parseFloat(this.nativeMagnification.replace(/[^0-9.]/g, '')) || 40;
    }
    return typeof this.nativeMagnification === 'number' ? this.nativeMagnification : 40;
  }

  getCurrentMagnification() {
    if (!this.viewer || !this.viewer.viewport) return 1.0;
    const viewportZoom = this.viewer.viewport.getZoom(true);
    const imageZoom = this.viewer.viewport.viewportToImageZoom(viewportZoom);
    const nativeMag = this.getNativeMag();
    const mag = Math.round(imageZoom * nativeMag * 10) / 10;
    return mag > 0 ? mag : 1.0;
  }

  getCurrentZoom() {
    return this.getCurrentMagnification();
  }

  resetView() {
    if (this.viewer && this.viewer.viewport) {
      this.viewer.viewport.goHome();
    }
  }

  cancelViewportAnimation() {
    if (!this.viewer || !this.viewer.viewport) return;
    const viewport = this.viewer.viewport;
    viewport.panTo(viewport.getCenter(true), true);
    viewport.zoomTo(viewport.getZoom(true), null, true);
  }

  setMagnification(targetMag) {
    if (!this.viewer || !this.viewer.viewport) return;
    const mag = parseFloat(targetMag);
    if (isNaN(mag) || mag <= 0) return;

    const nativeMag = this.getNativeMag();
    const targetImageZoom = mag / nativeMag;
    
    // Calculate ratio since OpenSeadragon viewportToImageZoom is linear (imageZoom = viewportZoom * ratio)
    const ratio = this.viewer.viewport.viewportToImageZoom(1.0);
    if (!ratio || ratio <= 0) {
      this.viewer.viewport.zoomTo(mag);
      return;
    }

    const targetViewportZoom = targetImageZoom / ratio;
    this.viewer.viewport.zoomTo(targetViewportZoom);
  }

  setZoom(zoomVal) {
    this.setMagnification(zoomVal);
  }

  zoomIn() {
    if (this.viewer && this.viewer.viewport) {
      const current = this.getCurrentMagnification();
      this.setMagnification(current * 1.25);
    }
  }

  zoomOut() {
    if (this.viewer && this.viewer.viewport) {
      const current = this.getCurrentMagnification();
      this.setMagnification(current * 0.8);
    }
  }

  zoomToFit() {
    this.resetView();
  }

  toggleFullscreen() {
    const docEl = document.documentElement;
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

    if (!isFS) {
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  downloadViewSnapshot() {
    if (!this.viewer || !this.viewer.drawer || !this.viewer.drawer.canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `${this.currentSlideId || 'slide'}_view.png`;
      link.href = this.viewer.drawer.canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.warn('Canvas snapshot download:', e);
    }
  }

  downloadAreaSnapshot() {
    this.downloadViewSnapshot();
  }

  // Convert image pixel coordinates to screen (container) coordinates for SVG rendering
  imageToScreen(imagePoint) {
    if (!this.viewer || !this.viewer.viewport) return { x: 0, y: 0 };
    const x = imagePoint.x - (this.imageOffsetX || 0);
    const y = imagePoint.y - (this.imageOffsetY || 0);
    const pt = new OpenSeadragon.Point(x, y);
    return this.viewer.viewport.imageToViewerElementCoordinates(pt);
  }

  // Convert screen coordinates back to image pixel coordinates
  screenToImage(screenPoint) {
    if (!this.viewer || !this.viewer.viewport) return { x: 0, y: 0 };
    const pt = new OpenSeadragon.Point(screenPoint.x, screenPoint.y);
    const imgPoint = this.viewer.viewport.viewerElementToImageCoordinates(pt);
    return {
      x: Math.round(imgPoint.x + (this.imageOffsetX || 0)),
      y: Math.round(imgPoint.y + (this.imageOffsetY || 0))
    };
  }

  zoomToAnnotation(points) {
    if (!points || points.length === 0 || !this.viewer || !this.viewer.viewport) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    });

    // If point annotation
    if (minX === maxX && minY === maxY) {
      minX -= 500;
      maxX += 500;
      minY -= 500;
      maxY += 500;
    }

    const width = Math.max(200, maxX - minX);
    const height = Math.max(200, maxY - minY);
    const localMinX = minX - (this.imageOffsetX || 0);
    const localMinY = minY - (this.imageOffsetY || 0);

    const vpRect = this.viewer.viewport.imageToViewportRectangle(localMinX, localMinY, width, height);
    this.viewer.viewport.fitBounds(vpRect);
  }
}

window.PathologyViewer = PathologyViewer;
