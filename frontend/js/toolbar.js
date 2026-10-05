/**
 * Left Toolbar Controller & Keyboard Shortcuts Manager
 */
class ToolbarController {
  constructor(annotationManager) {
    this.annotationManager = annotationManager;
    this.buttons = document.querySelectorAll('.tool-btn[data-tool]');
    this.btnDelete = document.getElementById('btnDeleteSelected');
    this.btnUndo = document.getElementById('btnUndo');
    this.btnRedo = document.getElementById('btnRedo');

    this.initEvents();
  }

  initEvents() {
    this.buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this.setActiveTool(tool);
      });
    });

    if (this.btnDelete) {
      this.btnDelete.addEventListener('click', () => {
        this.annotationManager.deleteSelected();
      });
    }

    if (this.btnUndo) {
      this.btnUndo.addEventListener('click', () => {
        this.annotationManager.undo();
      });
    }

    if (this.btnRedo) {
      this.btnRedo.addEventListener('click', () => {
        this.annotationManager.redo();
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          this.annotationManager.undo();
        } else if (key === 'y') {
          e.preventDefault();
          this.annotationManager.redo();
        }
        return;
      }

      switch (key) {
        case 's':
          this.setActiveTool('select');
          break;
        case 'h':
          this.setActiveTool('pan');
          break;
        case 'r':
          this.setActiveTool('rectangle');
          break;
        case 'p':
          this.setActiveTool('polygon');
          break;
        case 'o':
          this.setActiveTool('point');
          break;
      }
    });
  }

  setActiveTool(tool) {
    this.buttons.forEach(btn => {
      if (btn.getAttribute('data-tool') === tool) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.annotationManager.setTool(tool);
  }

  updateDeleteButtonState(hasSelection) {
    if (this.btnDelete) {
      this.btnDelete.disabled = !hasSelection;
    }
  }
}

window.ToolbarController = ToolbarController;
