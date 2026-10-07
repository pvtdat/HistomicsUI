const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set innerHTML(value) { this.children = []; }
  get childElementCount() { return this.children.length; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  appendChild(element) { this.children.push(element); }
}

function setup() {
  const inputs = {
    predictInputSize: '512', predictPadding: '32', predictThreshold: '0.5',
    predictMean: '0.485, 0.456, 0.406', predictStd: '0.229, 0.224, 0.225'
  };
  const elements = Object.fromEntries(Object.entries(inputs).map(([id, value]) =>
    [id, { value, labels: [{ textContent: id }], reportValidity: () => true }]));
  const alerts = [];
  const context = vm.createContext({
    window: {}, console: { error() {}, warn() {} }, alert: message => alerts.push(message),
    document: { getElementById: id => elements[id], createElementNS: () => new Element() }
  });
  for (const name of ['api.js', 'annotations.js', 'sidebar.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), context);
  }
  const manager = Object.create(context.window.AnnotationManager.prototype);
  manager.svg = new Element();
  manager.viewerManager = {
    currentSlideFilename: 'test.svs', imageToScreen: ({ x, y }) => ({ x: x - 100, y: y - 200 })
  };
  manager.annotations = [{ id: 'roi', type: 'rectangle', points: [[100, 200], [300, 400]], label: 'Stroma' }];
  manager.selectedId = 'roi';
  manager.globalFillOpacity = 0.25;
  manager.globalStrokeOpacity = 0.85;
  manager.saveStateForUndo = () => { manager.saved = (manager.saved || 0) + 1; };
  manager.onAnnotationListChange = () => { manager.persisted = true; };
  const sidebar = Object.create(context.window.SidebarController.prototype);
  Object.assign(sidebar, {
    annotationManager: manager, viewerManager: manager.viewerManager,
    predictionControls: new Element(), btnClearPrediction: new Element(),
    predictionStatus: new Element(), predictionPending: false
  });
  return { context, manager, sidebar, elements, alerts };
}

function prediction() {
  return {
    mask: 'data:image/png;base64,AAAA', bounds: { left: 68, top: 168, width: 264, height: 264 },
    tumorFraction: 0.25, settings: { input_size: 512, threshold: 0.5 }, model: 'best.pt'
  };
}

test('API sends level-0 geometry and configured preprocessing, and surfaces server errors', async () => {
  const { context } = setup();
  let sent;
  context.fetch = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => prediction() };
  };
  await context.window.PathologyAPI.predictTumor('a b.svs', { type: 'rectangle', points: [[100, 200], [300, 400]] }, { threshold: 0.75 });
  assert.equal(sent.url, '/api/v1/slide/a%20b.svs/predict-tumor');
  assert.equal(sent.body.points[0][0], 100);
  assert.equal(sent.body.threshold, 0.75);
  context.fetch = async () => ({
    ok: false, status: 503, headers: { get: () => 'application/json' },
    json: async () => ({ detail: 'Tumor model missing' })
  });
  await assert.rejects(context.window.PathologyAPI.predictTumor('test.svs', {}, {}), /Tumor model missing/);
});

test('prediction persists on the requested annotation even when another is selected', async () => {
  const { context, manager, sidebar } = setup();
  const original = manager.annotations[0];
  let resolve;
  context.fetch = () => new Promise(done => { resolve = done; });
  const running = sidebar.predictSelectedTumor();
  assert.equal(sidebar.predictionControls.disabled, true);
  manager.annotations.push({ id: 'other', type: 'polygon', points: [[0, 0], [20, 0], [0, 20]] });
  manager.selectedId = 'other';
  resolve({ ok: true, json: async () => prediction() });
  await running;
  assert.equal(original.prediction.slideFilename, 'test.svs');
  assert.equal(original.label, 'Stroma');
  assert.equal(manager.annotations[1].prediction, undefined);
  assert.equal(manager.saved, 1);
  assert.equal(manager.persisted, true);
  assert.equal(sidebar.predictionPending, false);
});

test('stale responses are discarded after slide switch, geometry edit, deletion or undo/import', async () => {
  for (const mutate of [
    manager => { manager.viewerManager.currentSlideFilename = 'other.svs'; },
    manager => { manager.annotations[0].points[0][0] = 101; },
    manager => { manager.annotations.pop(); },
    manager => { manager.annotations = [...manager.annotations]; }
  ]) {
    const { context, manager, sidebar, alerts } = setup();
    const ann = manager.annotations[0];
    let resolve;
    context.fetch = () => new Promise(done => { resolve = done; });
    const running = sidebar.predictSelectedTumor();
    mutate(manager);
    resolve({ ok: true, json: async () => prediction() });
    await running;
    assert.equal(ann.prediction, undefined);
    assert.equal(manager.persisted, undefined);
    assert.match(alerts[0], /discarded/);
    assert.equal(sidebar.predictionPending, false);
  }
});

test('invalid RGB std is reported without making a request', async () => {
  const { context, sidebar, elements } = setup();
  elements.predictStd.value = '1, 0, 1';
  context.fetch = () => { throw new Error('must not fetch'); };
  await sidebar.predictSelectedTumor();
  assert.match(sidebar.predictionStatus.textContent, /Invalid predictStd/);
  assert.equal(sidebar.predictionPending, false);
});

test('overlay uses level-0 bounds, exact ROI clipping, opacity and visibility', () => {
  const { manager } = setup();
  const ann = manager.annotations[0];
  ann.prediction = { ...prediction(), slideFilename: 'test.svs' };
  manager.render();
  const image = manager.svg.children.find(el => el.attributes.href);
  assert.equal(image.attributes.x, '-32');
  assert.equal(image.attributes.y, '-32');
  assert.equal(image.attributes.width, '264');
  assert.equal(image.attributes.opacity, '0.25');
  assert.equal(image.attributes['pointer-events'], 'none');
  assert.match(image.attributes['clip-path'], /^url\(#prediction-clip-/);
  const rect = manager.svg.children.find(el => el.attributes.stroke);
  assert.equal(rect.attributes['fill-opacity'], '0');
  ann.visible = false;
  manager.render();
  assert.equal(manager.svg.children.length, 0);
  ann.visible = true;
  manager.viewerManager.currentSlideFilename = 'other.svs';
  manager.render();
  assert.equal(manager.svg.children.some(el => el.attributes.href), false);
});

test('exported internal annotation data retains prediction on import', () => {
  const { manager } = setup();
  manager.annotations[0].prediction = { ...prediction(), slideFilename: 'test.svs' };
  const exported = JSON.parse(JSON.stringify({ annotations: manager.annotations }));
  const imported = manager.parseAnyAnnotationFormat(exported);
  assert.equal(imported[0].prediction.mask, prediction().mask);
  assert.equal(imported[0].prediction.slideFilename, 'test.svs');
});
