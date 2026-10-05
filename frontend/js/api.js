/**
 * HistomicsUI Lite Data & Storage Manager (Pure Frontend)
 * Handles local slide metadata and client-side localStorage annotation persistence.
 */
class PathologyAPI {
  static isBackendAvailable = false;

  static async checkHealth() {
    return false;
  }

  static async getSlides() {
    return [
      { id: 'demo-breast', name: 'Breast Tissue Microarray (Demo)', mpp: 0.25, magnification: '40x', dimensions: [40960, 30720] },
      { id: 'demo-kidney', name: 'Kidney Glomeruli (Demo)', mpp: 0.50, magnification: '20x', dimensions: [20480, 15360] }
    ];
  }

  static async getSlideMetadata(slideId) {
    if (slideId === 'demo-kidney') {
      return {
        id: 'demo-kidney',
        name: 'sample_kidney_002.svs',
        dimensions: '20,480 × 15,360 px',
        width: 20480,
        height: 15360,
        magnification: '20x',
        mpp: 0.50,
        fileSize: '512 MB'
      };
    }
    return {
      id: 'demo-breast',
      name: 'sample_breast_001.svs',
      dimensions: '40,960 × 30,720 px',
      width: 40960,
      height: 30720,
      magnification: '40x',
      mpp: 0.25,
      fileSize: '1.24 GB'
    };
  }

  static async getAnnotations(slideId) {
    const local = localStorage.getItem(`histomics_ann_${slideId}`);
    if (local) {
      try { return JSON.parse(local); } catch (e) {}
    }
    return this.getSampleDemoAnnotations(slideId);
  }

  static async saveAnnotations(slideId, annotations) {
    try {
      localStorage.setItem(`histomics_ann_${slideId}`, JSON.stringify(annotations));
    } catch (e) {
      console.warn("Could not save annotations to localStorage:", e);
    }
  }

  static getSampleDemoAnnotations(slideId) {
    if (slideId === 'demo-kidney') {
      return [
        {
          id: 'ann-k1',
          type: 'polygon',
          label: 'Stroma',
          color: '#10b981',
          notes: 'Cortical interstitial area',
          points: [[4000, 3000], [6000, 3200], [5500, 5000], [3800, 4800]]
        },
        {
          id: 'ann-k2',
          type: 'rectangle',
          label: 'Tumor',
          color: '#ef4444',
          notes: 'Glomerulus region of interest',
          points: [[8000, 6000], [11000, 8500]]
        }
      ];
    }
    return [
      {
        id: 'ann-001',
        type: 'polygon',
        label: 'Tumor',
        color: '#ef4444',
        notes: 'Invasive ductal carcinoma region',
        points: [[12400, 8000], [16800, 8500], [17500, 12000], [13000, 13200], [11500, 10500]]
      },
      {
        id: 'ann-002',
        type: 'rectangle',
        label: 'Stroma',
        color: '#10b981',
        notes: 'Desmoplastic stroma region',
        points: [[22000, 14000], [28000, 18500]]
      },
      {
        id: 'ann-003',
        type: 'point',
        label: 'Lymphocyte',
        color: '#3b82f6',
        notes: 'TIL focus marker',
        points: [[15000, 10000]]
      }
    ];
  }
}

// Instance method proxies for backward compatibility
PathologyAPI.prototype.checkHealth = PathologyAPI.checkHealth;
PathologyAPI.prototype.getSlides = PathologyAPI.getSlides;
PathologyAPI.prototype.getSlideMetadata = PathologyAPI.getSlideMetadata;
PathologyAPI.prototype.getAnnotations = PathologyAPI.getAnnotations;
PathologyAPI.prototype.saveAnnotations = PathologyAPI.saveAnnotations;
PathologyAPI.prototype.getSampleDemoAnnotations = PathologyAPI.getSampleDemoAnnotations;

window.PathologyAPI = PathologyAPI;
