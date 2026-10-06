/**
 * HistomicsUI Lite Data & Storage Manager (Pure Frontend)
 * Handles local slide metadata and client-side localStorage annotation persistence.
 */
class PathologyAPI {
  static isBackendAvailable = false;

  static async checkHealth() {
    try {
      const res = await fetch('/api/v1/slide/TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.svs/metadata');
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  static async getSlides() {
    return [
      {
        id: "tcga-a2-a0st",
        name: "TCGA-A2-A0ST (Interactive Vector Annotation Mode)",
        mpp: 0.25,
        magnification: "40x",
        dimensions: [120000, 50000],
      },
    ];
  }

  static async getSlideMetadata(slideId) {
    if (slideId === "tcga-a2-a0st-svs-overlay") {
      return {
        id: "tcga-a2-a0st-svs-overlay",
        name: "OVERLAY_OUTPUT_SVS.png (SVS Sliced + Annotation Rendered)",
        dimensions: "6,477 × 5,551 px",
        width: 6477,
        height: 5551,
        magnification: "40x",
        mpp: 0.25,
        fileSize: "62.47 MB",
        imageUrl: "data/OVERLAY_OUTPUT_SVS.png",
        offsetX: 0,
        offsetY: 0,
      };
    }
    if (slideId === "tcga-a2-a0st-full-svs" || slideId === "tcga-a2-a0st") {
      try {
        const filename = "TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.svs";
        const res = await fetch(`/api/v1/slide/${filename}/metadata`);
        if (res.ok) {
          const remoteMeta = await res.json();
          this.isBackendAvailable = true;
          return {
            id: "tcga-a2-a0st-full-svs",
            name: remoteMeta.name,
            dimensions: `${remoteMeta.width.toLocaleString()} × ${remoteMeta.height.toLocaleString()} px`,
            width: remoteMeta.width,
            height: remoteMeta.height,
            magnification: remoteMeta.magnification || "40x",
            mpp: remoteMeta.mpp || 0.25,
            fileSize: "688.95 MB",
            tileSourceUrl: {
              height: remoteMeta.height,
              width: remoteMeta.width,
              tileSize: remoteMeta.tileWidth || 256,
              minLevel: 0,
              maxLevel: remoteMeta.levels - 1,
              getTileUrl: function (level, x, y) {
                return `/api/v1/slide/${filename}/tile/${level}/${x}/${y}.png`;
              }
            },
            offsetX: 0,
            offsetY: 0
          };
        }
      } catch (e) {
        console.warn("Tile server error, fallbacking to ROI image mode:", e);
      }

      return {
        id: "tcga-a2-a0st",
        name: "TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.svs",
        dimensions: "120,000 × 50,000 px",
        width: 120000,
        height: 50000,
        magnification: "40x",
        mpp: 0.25,
        fileSize: "688.95 MB",
        imageUrl: "data/TCGA-A2-A0ST-DX1_xmin109446_ymin18274_MPP-0.2500.png",
        roiWidth: 6477,
        roiHeight: 5551,
        offsetX: 109446,
        offsetY: 18274,
      };
    }
  }

  static async getAnnotations(slideId) {
    const local = localStorage.getItem(`histomics_ann_${slideId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {}
    }
    if (slideId === "tcga-a2-a0st") {
      try {
        const res = await fetch(
          "data/TCGA-A2-A0ST-01Z-00-DX1.AE05A5DB-4861-40DE-B0F5-7955FC903A96.json",
        );
        if (res.ok) {
          const raw = await res.json();
          return window.annotationManager
            ? window.annotationManager.parseAnyAnnotationFormat(raw)
            : raw;
        }
      } catch (e) {
        console.warn("Fetch annotation error:", e);
      }
    }
    return this.getSampleDemoAnnotations(slideId);
  }

  static async saveAnnotations(slideId, annotations) {
    try {
      localStorage.setItem(
        `histomics_ann_${slideId}`,
        JSON.stringify(annotations),
      );
    } catch (e) {
      console.warn("Could not save annotations to localStorage:", e);
    }
  }

  static getSampleDemoAnnotations(slideId) {
    if (slideId === "demo-kidney" || slideId === "tcga-a2-a0st") {
      return [
        {
          id: "ann-demo-1",
          type: "polygon",
          label: "blood_vessel",
          color: "#10b981",
          notes: "Sample blood vessel annotation",
          points: [
            [109900, 20388],
            [109858, 20389],
            [109794, 20421],
            [109800, 20450],
            [109850, 20460],
          ],
        },
        {
          id: "ann-demo-2",
          type: "rectangle",
          label: "roi",
          color: "#ef4444",
          notes: "Region of interest",
          points: [
            [109446, 18274],
            [115976, 23870],
          ],
        },
      ];
    }
    return [];
  }
}

// Instance method proxies for backward compatibility
PathologyAPI.prototype.checkHealth = PathologyAPI.checkHealth;
PathologyAPI.prototype.getSlides = PathologyAPI.getSlides;
PathologyAPI.prototype.getSlideMetadata = PathologyAPI.getSlideMetadata;
PathologyAPI.prototype.getAnnotations = PathologyAPI.getAnnotations;
PathologyAPI.prototype.saveAnnotations = PathologyAPI.saveAnnotations;
PathologyAPI.prototype.getSampleDemoAnnotations =
  PathologyAPI.getSampleDemoAnnotations;

window.PathologyAPI = PathologyAPI;
