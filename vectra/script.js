
const NS         = 'http://www.w3.org/2000/svg';
const VSIZE      = 400;
const VBOX       = `0 0 ${VSIZE} ${VSIZE}`;
let   VWIDTH     = VSIZE;
function dynVBox(){ return `0 0 ${VWIDTH.toFixed(1)} ${VSIZE}`; }
const DOODLE_KEY = 'vectra_doodles';

let penTip    = 'round';
let bgColor   = '#f6f1e7';
let exportOrientation = 'portrait';

let cropOn    = false;
let cropRect  = { x:50, y:50, w:300, h:300 };
let cropDragging = false, cropDragOX=0, cropDragOY=0;
let cropResizing = false;

let layers    = [];
let activeIdx = -1;

let isDrawing      = false;
let strokePts      = [];
let liveEl         = null;
let activePointerId = null;

let interps       = [];
let isMorphing    = false;
let isPaused      = false;
let morphPathEl   = null;
let morphStageEl  = null;
let pausedT       = 0;
let pausedStepIdx = 0;
let morphAnims    = [];
let rafId         = null;
let morphStartTime= 0;
let totalMorphDur = 0;
let isScrubbing   = false;
let stepDurMs     = 1000;

let mediaRecorder = null;
let recChunks     = [];
let isRecording   = false;

let eSvg = 0, eJpg = 0;

const startScreen    = document.getElementById('startScreen');
const toolScreen     = document.getElementById('toolScreen');
const galleryScreen  = document.getElementById('galleryScreen');
const doodleBg       = document.getElementById('doodle-bg');
const guiPanel       = document.getElementById('guiPanel');
const svgContainer   = document.getElementById('svg-container');
const canvasWrap     = document.getElementById('canvas-wrap');
const canvasBg       = document.getElementById('canvas-bg');
const layerListEl    = document.getElementById('layer-list');
const trashArea      = document.getElementById('trash-area');
const animBtn        = document.getElementById('animate-button');
const checkLoop      = document.getElementById('checkLoop');
const speedSlider    = document.getElementById('myRange');
const easingSelect   = document.getElementById('easingSelect');
const timelineSlider = document.getElementById('timeline');
const galleryGrid    = document.getElementById('gallery-grid');
const galleryEmpty   = document.getElementById('gallery-empty');
const swSlider       = document.getElementById('strokeWidthSlider');
const swVal          = document.getElementById('strokeWidthVal');
const opSlider       = document.getElementById('opacitySlider');
const opVal          = document.getElementById('opacityVal');
const recBtn         = document.getElementById('export-btn-rec');
const recStatus      = document.getElementById('rec-status');
const cropOverlay    = document.getElementById('crop-overlay');
const cropFrameEl    = document.getElementById('crop-frame');

morphStageEl = document.createElement('div');
morphStageEl.id = 'morph-stage';
const _ms = document.createElementNS(NS, 'svg');
_ms.setAttribute('viewBox', dynVBox());
_ms.setAttribute('preserveAspectRatio', 'none');
morphPathEl = document.createElementNS(NS, 'path');
morphPathEl.id = 'morph-path';
_ms.appendChild(morphPathEl);
morphStageEl.appendChild(_ms);
canvasWrap.appendChild(morphStageEl);


function syncVBox() {
  const r = canvasWrap.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return;
  VWIDTH = VSIZE * r.width / r.height;
  const vb = dynVBox();
  layers.forEach(l => l.svgEl.setAttribute('viewBox', vb));
  const ms = morphStageEl.querySelector('svg');
  if (ms) ms.setAttribute('viewBox', vb);
}
requestAnimationFrame(() => requestAnimationFrame(syncVBox));
new ResizeObserver(syncVBox).observe(canvasWrap);


function showView(id) {
  document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display='none'; });
  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', !!btn.dataset.view && btn.dataset.view === id);
  });
  const burger = document.getElementById('sidebarBurger');
  burger.style.display = (id === 'toolScreen' && guiPanel.classList.contains('collapsed')) ? 'flex' : 'none';
}

document.getElementById('navHome').addEventListener('click', () => {
  clearCanvas(); showView('startScreen'); renderStartBg();
});
document.getElementById('navBtnSketch').addEventListener('click', () => {
  showView('toolScreen'); if (layers.length===0) addLayer();
});
document.getElementById('navBtnGallery').addEventListener('click', () => {
  clearCanvas(); showView('galleryScreen'); renderGallery(); renderStartBg();
});
document.getElementById('navBtnInfo').addEventListener('click', () => {
  document.getElementById('infoModal').classList.add('open');
});
document.getElementById('infoClose').addEventListener('click', () => {
  document.getElementById('infoModal').classList.remove('open');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  guiPanel.classList.add('collapsed');
  document.getElementById('sidebarBurger').style.display = 'flex';
});
document.getElementById('sidebarBurger').addEventListener('click', () => {
  guiPanel.classList.remove('collapsed');
  document.getElementById('sidebarBurger').style.display = 'none';
});

function clearCanvas() {
  haltMorph();
  layers.forEach(l => l.el.remove());
  layers=[]; activeIdx=-1;
  renderLayerList();
}


swSlider.addEventListener('input', () => { swVal.textContent=swSlider.value; applyStyleToAll(); });
opSlider.addEventListener('input', () => { opVal.textContent=opSlider.value+'%'; applyStyleToAll(); });
['strokeColorPicker','fillColorPicker'].forEach(id =>
  document.getElementById(id).addEventListener('input', applyStyleToAll));
document.getElementById('strokeOn').addEventListener('change', applyStyleToAll);
document.getElementById('fillOn').addEventListener('change', applyStyleToAll);

document.getElementById('tipSelect').addEventListener('click', e => {
  const btn = e.target.closest('.tip-btn');
  if (!btn) return;
  document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  penTip = btn.dataset.tip;
  applyStyleToAll();
});

document.getElementById('bgColorPicker').addEventListener('input', e => {
  bgColor = e.target.value; canvasBg.style.background = bgColor;
});
document.getElementById('bgResetBtn').addEventListener('click', () => {
  bgColor = '#f6f1e7';
  document.getElementById('bgColorPicker').value = bgColor;
  canvasBg.style.background = bgColor;
});

function getStyleAttrs() {
  const strokeOn = document.getElementById('strokeOn').checked;
  const fillOn   = document.getElementById('fillOn').checked;
  const strokeCol= document.getElementById('strokeColorPicker').value;
  const fillCol  = document.getElementById('fillColorPicker').value;
  const sw       = parseFloat(swSlider.value);
  const op       = parseFloat(opSlider.value) / 100;
  const linecap  = penTip==='square' ? 'square' : 'round';
  return {
    fill:              fillOn ? fillCol : 'none',
    stroke:            strokeOn ? strokeCol : 'none',
    'stroke-width':    sw,
    'stroke-linecap':  linecap,
    'stroke-linejoin': 'round',
    opacity:           String(op),
    style:             'mix-blend-mode:multiply'
  };
}

function applyAttrs(el, attrs) {
  Object.entries(attrs).forEach(([k,v]) => {
    if (v==null) return;
    if (k==='style') el.style.cssText = v;
    else el.setAttribute(k, String(v));
  });
}

function applyStyleToAll() {
  const attrs = getStyleAttrs();
  layers.forEach(layer => {
    layer.strokes.forEach(s => { s.attrs={...attrs}; });
    layer.svgEl.querySelectorAll('path[data-primary="1"]').forEach(p => applyAttrs(p, attrs));
  });
  if (isMorphing||isPaused) applyAttrs(morphPathEl, attrs);
  refreshThumbs();
}


document.querySelectorAll('.orient-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.orient-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    exportOrientation = btn.dataset.orient;
    if (cropOn) showCropFrame();
  });
});

function getExportDimensions() {
  if (!cropOn) {
    const r = canvasWrap.getBoundingClientRect();
    const scale = 1600 / Math.max(r.width, r.height);
    return { W: Math.round(r.width * scale), H: Math.round(r.height * scale) };
  }
  const ratioKey = document.getElementById('exportRatio').value;
  const ratios = { '1x1':[1,1], '4x3':[3,4], '16x9':[9,16], 'A4':[1,Math.sqrt(2)] };
  let [rw, rh] = ratios[ratioKey] || [1,1];
  if (exportOrientation === 'landscape') { const tmp=rw; rw=rh; rh=tmp; }
  const scale = 800 / Math.max(rw, rh);
  return { W: Math.round(rw * scale), H: Math.round(rh * scale) };
}

document.getElementById('cropFrameOn').addEventListener('change', function(e) {
  e.stopPropagation();
  cropOn = this.checked;
  document.querySelectorAll('.crop-only').forEach(el => {
    el.style.display = cropOn ? 'flex' : 'none';
  });
  if (cropOn) {
    showCropFrame();
  } else {
    cropOverlay.style.display = 'none';
  }
});

function showCropFrame() {
  const r = canvasWrap.getBoundingClientRect();
  const { W, H } = getExportDimensions();
  const scale = Math.min(r.width * 0.8 / W, r.height * 0.8 / H);
  cropRect.w = Math.round(W * scale);
  cropRect.h = Math.round(H * scale);
  cropRect.x = Math.round((r.width - cropRect.w) / 2);
  cropRect.y = Math.round((r.height - cropRect.h) / 2);
  updateCropFrameDOM();
  cropOverlay.style.display = 'block';
}

function updateCropFrameDOM() {
  cropFrameEl.style.left   = cropRect.x + 'px';
  cropFrameEl.style.top    = cropRect.y + 'px';
  cropFrameEl.style.width  = cropRect.w + 'px';
  cropFrameEl.style.height = cropRect.h + 'px';
}

const cropResizeHandle = document.createElement('div');
cropResizeHandle.id = 'crop-resize';
cropResizeHandle.style.cssText = 'position:absolute;bottom:-6px;right:-6px;width:14px;height:14px;background:#fff;border:2px solid rgba(0,0,0,.4);border-radius:3px;cursor:se-resize;';
cropFrameEl.appendChild(cropResizeHandle);

let cropAspect = 1;

cropFrameEl.addEventListener('mousedown', e => {
  if (e.target === cropResizeHandle) return;
  e.stopPropagation(); e.preventDefault();
  cropDragging = true;
  const r = canvasWrap.getBoundingClientRect();
  cropDragOX = e.clientX - r.left - cropRect.x;
  cropDragOY = e.clientY - r.top  - cropRect.y;
});

cropResizeHandle.addEventListener('mousedown', e => {
  e.stopPropagation(); e.preventDefault();
  cropResizing = true;
  cropAspect = cropRect.w / cropRect.h;
});

document.addEventListener('mousemove', e => {
  const r = canvasWrap.getBoundingClientRect();
  if (cropDragging) {
    cropRect.x = Math.max(0, Math.min(r.width  - cropRect.w, e.clientX - r.left - cropDragOX));
    cropRect.y = Math.max(0, Math.min(r.height - cropRect.h, e.clientY - r.top  - cropDragOY));
    updateCropFrameDOM();
  }
  if (cropResizing) {
    const newW = Math.max(40, e.clientX - r.left - cropRect.x);
    const newH = Math.round(newW / cropAspect);
    if (cropRect.x + newW <= r.width && cropRect.y + newH <= r.height) {
      cropRect.w = newW;
      cropRect.h = newH;
      updateCropFrameDOM();
    }
  }
});
document.addEventListener('mouseup', () => { cropDragging=false; cropResizing=false; });

document.getElementById('exportRatio').addEventListener('change', e => {
  e.stopPropagation();
  if (cropOn) showCropFrame();
});


function addLayer(savedStrokes) {
  const idx = layers.length;
  if (idx >= 6) return;
  const wrap = document.createElement('div');
  wrap.className = 'canvas-layer'; wrap.dataset.li = idx;
  const svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('viewBox', dynVBox());
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.style.mixBlendMode = 'multiply';
  wrap.appendChild(svgEl);
  svgContainer.appendChild(wrap);
  const layer = { idx, strokes:[], el:wrap, svgEl, locked:false };
  layers.push(layer);
  if (savedStrokes?.length) {
    savedStrokes.forEach(s => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('data-primary','1');
      p.setAttribute('d', s.d);
      applyAttrs(p, s.attrs);
      svgEl.appendChild(p);
      layer.strokes.push({ d:s.d, attrs:{...s.attrs} });
    });
    layer.locked = true; wrap.classList.add('drawn-done');
  }
  setActiveLayer(idx);
}
document.getElementById('addLayerBtn').addEventListener('click', () => addLayer());

function deleteLayer(idx) {
  if (!layers[idx]) return;
  layers[idx].el.remove();
  layers.splice(idx,1);
  layers.forEach((l,i) => { l.idx=i; l.el.dataset.li=i; });
  activeIdx = Math.max(0, Math.min(activeIdx, layers.length-1));
  if (layers.length===0) { activeIdx=-1; renderLayerList(); return; }
  renderLayerList(); showOnlyActive();
}

function setActiveLayer(idx) { activeIdx=idx; renderLayerList(); showOnlyActive(); }

function showOnlyActive() {
  layers.forEach((l,i) => {
    l.el.classList.remove('active-draw');
    l.el.style.display = 'none';
    if (i===activeIdx) {
      l.el.style.display = 'block';
      if (!l.locked) l.el.classList.add('active-draw');
    }
  });
}

function renderLayerList() {
  layerListEl.innerHTML = '';
  layers.forEach((l,i) => {
    const item = document.createElement('div');
    item.className = 'layer-item'+(i===activeIdx?' active-layer':'');
    item.dataset.index = i;
    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    const mini = l.svgEl.cloneNode(true);
    mini.setAttribute('width','20'); mini.setAttribute('height','20');
    thumb.appendChild(mini);
    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = `Layer ${i+1}`+(l.locked?' ✓':'');
    item.appendChild(thumb); item.appendChild(name);
    item.addEventListener('click', () => setActiveLayer(i));
    layerListEl.appendChild(item);
  });
}

function refreshThumbs() {
  layerListEl.querySelectorAll('.layer-thumb').forEach((thumb,i) => {
    if (!layers[i]) return;
    thumb.innerHTML = '';
    const mini = layers[i].svgEl.cloneNode(true);
    mini.setAttribute('width','20'); mini.setAttribute('height','20');
    thumb.appendChild(mini);
  });
}

document.getElementById('delete-button').addEventListener('click', e => {
  e.stopPropagation();
  haltMorph(); clearCanvas(); addLayer();
});

trashArea.addEventListener('click', () => {
  if (activeIdx >= 0) deleteLayer(activeIdx);
  if (layers.length === 0) addLayer();
});

Sortable.create(layerListEl, {
  group:'layers', animation:110, ghostClass:'sortable-ghost',
  onEnd() {
    const order = Array.from(layerListEl.children).map(el => parseInt(el.dataset.index));
    layers = order.map(i => layers[i]);
    layers.forEach((l,i) => { l.idx=i; l.el.dataset.li=i; });
    renderLayerList();
  }
});
Sortable.create(trashArea, {
  group:'layers', animation:110,
  onAdd(evt) {
    const idx = parseInt(evt.item.dataset.index);
    evt.item.remove();
    if (!isNaN(idx) && layers[idx]) deleteLayer(idx);
    if (layers.length===0) addLayer();
  }
});


canvasWrap.addEventListener('pointerdown',   onDown);
canvasWrap.addEventListener('pointermove',   onMove);
canvasWrap.addEventListener('pointerup',     onUp);
canvasWrap.addEventListener('pointerleave',  onUp);
canvasWrap.addEventListener('pointercancel', onUp);

function toPt(clientX, clientY) {
  const r = canvasWrap.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width)  * VWIDTH,
    y: ((clientY - r.top)  / r.height) * VSIZE
  };
}

function toPtFromSVG(clientX, clientY) {
  const r  = canvasWrap.getBoundingClientRect();
  const cx = Math.max(r.left, Math.min(r.right,  clientX));
  const cy = Math.max(r.top,  Math.min(r.bottom, clientY));
  return {
    x: ((cx - r.left) / r.width)  * VWIDTH,
    y: ((cy - r.top)  / r.height) * VSIZE
  };
}

function onDown(e) {
  if (cropOn && e.target !== canvasWrap && e.target !== canvasBg && !e.target.closest('#svg-container')) return;
  if (isMorphing || isPaused) return;
  if (activePointerId !== null) return;
  e.preventDefault();
  if (activeIdx<0 || layers[activeIdx]?.locked) {
    if (layers.length>=6) return;
    addLayer();
  }
  try { canvasWrap.setPointerCapture(e.pointerId); } catch(_) {}
  activePointerId = e.pointerId;
  isDrawing=true; strokePts=[];
  const p = toPtFromSVG(e.clientX, e.clientY);
  strokePts.push(p);
  liveEl = document.createElementNS(NS,'path');
  liveEl.setAttribute('data-primary','1');
  applyAttrs(liveEl, getStyleAttrs());
  liveEl.setAttribute('d', `M${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  layers[activeIdx].svgEl.appendChild(liveEl);
}

function onMove(e) {
  if (!isDrawing||!liveEl) return;
  if (e.pointerId !== activePointerId) return;
  e.preventDefault();
  const evts = e.getCoalescedEvents?.() || [e];
  for (const ce of evts) strokePts.push(toPtFromSVG(ce.clientX, ce.clientY));
  if (e.pointerType === 'pen' && e.pressure > 0) {
    const baseW = parseFloat(swSlider.value);
    liveEl.setAttribute('stroke-width', (baseW * (0.5 + e.pressure)).toFixed(1));
  }
  liveEl.setAttribute('d', buildD(strokePts));
}

function onUp(e) {
  if (!isDrawing) return;
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return;
  isDrawing=false;
  activePointerId = null;
  if (strokePts.length<2||!liveEl) { liveEl?.remove(); liveEl=null; return; }
  const attrs = getStyleAttrs();
  if (e?.pointerType === 'pen') {
    const sw = liveEl.getAttribute('stroke-width');
    if (sw) attrs['stroke-width'] = sw;
  }
  const d = buildD(strokePts);
  layers[activeIdx].strokes.push({ d, attrs:{...attrs} });
  layers[activeIdx].locked = true;
  layers[activeIdx].el.classList.remove('active-draw');
  layers[activeIdx].el.classList.add('drawn-done');
  liveEl = null;
  refreshThumbs(); renderLayerList();
}

function buildD(pts) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = ((pts[i].x + pts[i+1].x) / 2).toFixed(1);
    const my = ((pts[i].y + pts[i+1].y) / 2).toFixed(1);
    d += ` Q${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${mx},${my}`;
  }
  const last = pts[pts.length-1];
  d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  return d;
}
function rnd(a) { return (Math.random()-.5)*a*2; }


function drawnPaths() {
  return layers.filter(l=>l.strokes.length>0).map(l=>l.strokes[0].d);
}

function updateAnimBtn() { animBtn.textContent = isMorphing ? '⏸' : '▶'; }

animBtn.addEventListener('click', () => {
  if (isMorphing) pauseMorph();
  else if (isPaused) resumeMorph();
  else startMorph();
});

function startMorph() {
  const paths = drawnPaths();
  if (paths.length<2) { alert('Sketch on at least 2 layers!'); return; }
  try {
    interps=[];
    const cycle=[...paths,paths[0]];
    for (let i=0;i<cycle.length-1;i++)
      interps.push(flubber.interpolate(cycle[i],cycle[i+1],{maxSegmentLength:2}));
  } catch(e) { alert('Could not morph these shapes.'); return; }

  applyAttrs(morphPathEl, getStyleAttrs());
  morphStageEl.style.display='block';
  layers.forEach(l => { l.el.style.display='none'; });
  stepDurMs=Math.max(200,5000-parseFloat(speedSlider.value));
  totalMorphDur=stepDurMs*interps.length;
  isMorphing=true; isPaused=false;
  updateAnimBtn();
  morphStartTime=performance.now();
  rafId=requestAnimationFrame(tickTimeline);
  playStep(0,0,easingSelect.value,checkLoop.checked);
}

function playStep(stepIdx,startT,easing,loop) {
  if (!isMorphing) return;
  pausedStepIdx=stepIdx;
  const interp=interps[stepIdx];
  if (interp) morphPathEl.setAttribute('d',interp(startT));
  const anim=anime({
    targets:{t:startT},t:1,
    duration:stepDurMs*(1-startT),easing,
    update(a){
      pausedT=a.animations[0].currentValue;
      if(interp) morphPathEl.setAttribute('d',interp(pausedT));
    },
    complete(){
      if(!isMorphing) return;
      const next=stepIdx+1;
      if(next<interps.length) playStep(next,0,easing,loop);
      else if(loop){morphStartTime=performance.now();playStep(0,0,easing,true);}
      else{isMorphing=false;isPaused=false;updateAnimBtn();cancelAnimationFrame(rafId);}
    }
  });
  morphAnims.push(anim);
}

function pauseMorph(){morphAnims.forEach(a=>a.pause());morphAnims=[];cancelAnimationFrame(rafId);isMorphing=false;isPaused=true;updateAnimBtn();}
function resumeMorph(){
  isPaused=false;
  morphStartTime=performance.now()-(pausedStepIdx+pausedT)*stepDurMs;
  isMorphing=true;updateAnimBtn();
  rafId=requestAnimationFrame(tickTimeline);
  playStep(pausedStepIdx,pausedT,easingSelect.value,checkLoop.checked);
}
function haltMorph(){
  morphAnims.forEach(a=>a.pause());morphAnims=[];cancelAnimationFrame(rafId);
  morphStageEl.style.display='none';
  layers.forEach(l=>{l.el.style.display='none';});
  showOnlyActive();
  isMorphing=false;isPaused=false;timelineSlider.value=0;updateAnimBtn();
}

function tickTimeline(){
  if(!isMorphing) return;
  if(!isScrubbing){
    const elapsed=performance.now()-morphStartTime;
    const frac=totalMorphDur>0?(elapsed%totalMorphDur)/totalMorphDur:0;
    timelineSlider.value=(Math.min(frac,1)*100).toFixed(2);
  }
  rafId=requestAnimationFrame(tickTimeline);
}

timelineSlider.addEventListener('mousedown',()=>{
  isScrubbing=true;
  if(isMorphing){morphAnims.forEach(a=>a.pause());morphAnims=[];}
});
timelineSlider.addEventListener('input',function(){
  if((!isMorphing&&!isPaused)||!interps.length) return;
  const frac=parseFloat(this.value)/100;
  const pos=frac*interps.length;
  const idx=Math.min(Math.floor(pos),interps.length-1);
  const local=pos-idx;
  if(interps[idx]) morphPathEl.setAttribute('d',interps[idx](Math.min(local,1)));
  pausedStepIdx=idx;pausedT=Math.min(local,1);
  morphStageEl.style.display='block';
  layers.forEach(l=>{l.el.style.display='none';});
  isPaused=true;isMorphing=false;updateAnimBtn();
});
timelineSlider.addEventListener('mouseup',()=>{isScrubbing=false;});

speedSlider.addEventListener('input',()=>{
  stepDurMs=Math.max(200,5000-parseFloat(speedSlider.value));
  totalMorphDur=stepDurMs*interps.length;
  if(isMorphing){pauseMorph();resumeMorph();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&toolScreen.classList.contains('active')) animBtn.click();
});


function makeSVGRoot(w, h, vb) {
  const r = document.createElementNS(NS,'svg');
  r.setAttribute('xmlns',NS);
  r.setAttribute('viewBox', vb || dynVBox());
  r.setAttribute('width', w || Math.round(VWIDTH));
  r.setAttribute('height', h || VSIZE);
  return r;
}

function composeSVG() {
  const root=makeSVGRoot();
  layers.forEach(l=>Array.from(l.svgEl.children).forEach(c=>root.appendChild(c.cloneNode(true))));
  return root;
}

function captureCurrentFrame() {
  const root=makeSVGRoot();
  if(isMorphing||isPaused){
    root.appendChild(morphPathEl.cloneNode(true));
  } else if(activeIdx>=0){
    Array.from(layers[activeIdx].svgEl.children).forEach(c=>root.appendChild(c.cloneNode(true)));
  }
  return root;
}

function serializeLayer0(){
  const r=makeSVGRoot(VSIZE,VSIZE,VBOX);
  if(layers[0]) Array.from(layers[0].svgEl.children).forEach(c=>r.appendChild(c.cloneNode(true)));
  return new XMLSerializer().serializeToString(r);
}


function renderToCanvas(svgEl, cb) {
  const { W, H } = getExportDimensions();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  let srcX=0, srcY=0, srcW=VSIZE, srcH=VSIZE;
  if (cropOn) {
    const canvasR = canvasWrap.getBoundingClientRect();
    const scaleX = VSIZE / canvasR.width;
    const scaleY = VSIZE / canvasR.height;
    srcX = cropRect.x * scaleX;
    srcY = cropRect.y * scaleY;
    srcW = cropRect.w * scaleX;
    srcH = cropRect.h * scaleY;
    const newVB = `${srcX.toFixed(1)} ${srcY.toFixed(1)} ${srcW.toFixed(1)} ${srcH.toFixed(1)}`;
    svgEl.setAttribute('viewBox', newVB);
    svgEl.setAttribute('width', W);
    svgEl.setAttribute('height', H);
  } else {
    svgEl.setAttribute('width', W);
    svgEl.setAttribute('height', H);
  }

  const svgStr = new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([svgStr],{type:'image/svg+xml'}));
  const img = new Image();
  img.onload = () => {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,W,H);
    ctx.drawImage(img,0,0,W,H);
    URL.revokeObjectURL(url);
    cb(c, svgStr);
  };
  img.src = url;
}

document.getElementById('export-btn-svg').addEventListener('click', e => {
  e.stopPropagation();
  const svgEl = captureCurrentFrame();
  if (cropOn) {
    const canvasR = canvasWrap.getBoundingClientRect();
    const scaleX = VSIZE / canvasR.width;
    const scaleY = VSIZE / canvasR.height;
    const srcX = (cropRect.x * scaleX).toFixed(1);
    const srcY = (cropRect.y * scaleY).toFixed(1);
    const srcW = (cropRect.w * scaleX).toFixed(1);
    const srcH = (cropRect.h * scaleY).toFixed(1);
    svgEl.setAttribute('viewBox',`${srcX} ${srcY} ${srcW} ${srcH}`);
  }
  const { W, H } = getExportDimensions();
  svgEl.setAttribute('width', W); svgEl.setAttribute('height', H);
  dl(new Blob([new XMLSerializer().serializeToString(svgEl)],{type:'image/svg+xml'}), `vectra${eSvg++}.svg`);
});

document.getElementById('export-btn-jpg').addEventListener('click', e => {
  e.stopPropagation();
  renderToCanvas(captureCurrentFrame(), (c) => {
    c.toBlob(b => dl(b,`vectra${eJpg++}.jpg`),'image/jpeg',0.92);
  });
});

recBtn.addEventListener('click', e => {
  e.stopPropagation();
  if(isRecording) stopRecording(); else startRecording();
});

function dl(blob,name){
  const url=URL.createObjectURL(blob);
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||
    (/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  if(isIOS){
    // On iOS, open blob in new tab; use noopener so it can't navigate this window
    const win=window.open('','_blank','noopener,noreferrer');
    if(win){ win.location.href=url; }
    else { window.open(url,'_blank','noopener,noreferrer'); }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return;
  }
  const a=document.createElement('a');
  a.href=url; a.download=name; a.style.display='none'; a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
}


function startRecording(){
  if(typeof MediaRecorder==='undefined'||!HTMLCanvasElement.prototype.captureStream){
    alert('Video recording is not supported in this browser.\nTry Chrome, Firefox, or Edge.');return;
  }
  const paths=drawnPaths();
  if(paths.length<2){alert('Sketch at least 2 layers first!');return;}
  const { W, H } = getExportDimensions();
  const offCanvas=document.createElement('canvas'); offCanvas.width=W; offCanvas.height=H;
  const ctx=offCanvas.getContext('2d');
  const stream=offCanvas.captureStream(30);
  const mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9'
    :MediaRecorder.isTypeSupported('video/webm')?'video/webm':'video/mp4';
  const ext=mime.includes('mp4')?'mp4':'webm';
  mediaRecorder=new MediaRecorder(stream,{mimeType:mime});
  recChunks=[];
  mediaRecorder.ondataavailable=e=>{if(e.data.size>0) recChunks.push(e.data);};
  mediaRecorder.onstop=()=>{
    const blob=new Blob(recChunks,{type:mime});
    dl(blob,`vectra-morph-${Date.now()}.${ext}`);
    saveVideoToGallery(blob);
    isRecording=false;
    recBtn.classList.remove('recording');
    recBtn.innerHTML='⏺ REC';
    recStatus.textContent='✓ Saved!';
    recStatus.style.display='block';
    setTimeout(()=>{recStatus.style.display='none';},2500);
    setTimeout(()=>showView('toolScreen'),300);
  };
  mediaRecorder.start(100);
  isRecording=true;
  recBtn.classList.add('recording');
  recBtn.innerHTML='⏹ STOP';
  recStatus.style.display='block';
  recStatus.textContent='● Recording...';
  if(!isMorphing){if(isPaused)resumeMorph();else startMorph();}
  const morphSvgEl=morphStageEl.querySelector('svg');
  function drawFrame(){
    if(!isRecording) return;
    const svgClone=morphSvgEl.cloneNode(true);
    svgClone.setAttribute('xmlns', NS);
    svgClone.setAttribute('width', W);
    svgClone.setAttribute('height', H);
    if(cropOn){
      const canvasR=canvasWrap.getBoundingClientRect();
      const scaleX=VSIZE/canvasR.width, scaleY=VSIZE/canvasR.height;
      svgClone.setAttribute('viewBox',
        `${(cropRect.x*scaleX).toFixed(1)} ${(cropRect.y*scaleY).toFixed(1)} ${(cropRect.w*scaleX).toFixed(1)} ${(cropRect.h*scaleY).toFixed(1)}`);
      svgClone.setAttribute('preserveAspectRatio','xMidYMid meet');
    } else {
      svgClone.setAttribute('viewBox', dynVBox());
      svgClone.setAttribute('preserveAspectRatio','none');
    }
    const svgStr=new XMLSerializer().serializeToString(svgClone);
    const blobSVG=new Blob([svgStr],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blobSVG);
    const img=new Image();
    img.onload=()=>{ctx.clearRect(0,0,W,H);ctx.fillStyle=bgColor;ctx.fillRect(0,0,W,H);ctx.drawImage(img,0,0,W,H);URL.revokeObjectURL(url);};
    img.src=url;
    requestAnimationFrame(drawFrame);
  }
  drawFrame();
  const autoDur=totalMorphDur>0?totalMorphDur:stepDurMs*2;
  setTimeout(()=>{if(isRecording)stopRecording();},autoDur+500);
}

function stopRecording(){if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();}

function saveVideoToGallery(videoBlob){
  const reader=new FileReader();
  reader.onload=()=>{
    const videoB64=reader.result;
    const list=loadDoodles();
    if(list.length>0){list[list.length-1].videoB64=videoB64;}
    else{const l0=serializeLayer0();list.push({svg:l0,allSVG:l0,videoB64,savedLayers:[],ts:Date.now(),label:'Sketch 1'});}
    localStorage.setItem(DOODLE_KEY,JSON.stringify(list));
    recStatus.textContent='✓ Saved & downloaded!';
    setTimeout(()=>{recStatus.style.display='none';},2500);
  };
  reader.readAsDataURL(videoBlob);
}


document.getElementById('saveDoodleBtn').addEventListener('click', e => {
  e.stopPropagation();
  if(layers.every(l=>l.strokes.length===0)) return;
  const allSVG=new XMLSerializer().serializeToString(composeSVG());
  const savedLayers=layers.map(l=>({strokes:l.strokes.map(s=>({d:s.d,attrs:{...s.attrs}}))}));
  const list=loadDoodles();
  list.push({svg:serializeLayer0(),allSVG,videoB64:null,savedLayers,bgColor,ts:Date.now(),label:`Sketch ${list.length+1}`});
  localStorage.setItem(DOODLE_KEY,JSON.stringify(list));
  renderStartBg();
  showView('toolScreen');
  const btn=document.getElementById('saveDoodleBtn');
  btn.textContent='✓ SAVED!';btn.style.background='#000';btn.style.color='#fff';
  setTimeout(()=>{
    btn.textContent='SAVE SKETCH';btn.style.background='';btn.style.color='';
    haltMorph(); clearCanvas(); addLayer();
    showView('toolScreen');
  },1500);
});


function loadDoodles(){try{return JSON.parse(localStorage.getItem(DOODLE_KEY))||[];}catch{return[];}}

function renderGallery(){
  const doodles=loadDoodles();
  galleryGrid.innerHTML='';
  galleryEmpty.style.display=doodles.length?'none':'block';

  const total=doodles.length;
  [...doodles].reverse().forEach((d,i)=>{
    const wrapper=document.createElement('div');
    wrapper.className='gi-wrapper';
    const numEl=document.createElement('div');
    numEl.className='gi-num';
    numEl.textContent=String(total-i).padStart(3,'0');
    wrapper.appendChild(numEl);

    const item=document.createElement('div');
    item.className='gallery-item';

    const thumbBg = d.bgColor || '#f6f1e7';
    item.style.background = thumbBg;
    const thumbDiv=document.createElement('div');
    thumbDiv.className='gi-thumb';
    thumbDiv.style.background = thumbBg;
    thumbDiv.innerHTML=fitToContent(d.svg);
    item.appendChild(thumbDiv);

    const hasMultipleLayers = (d.savedLayers||[]).length > 1;
    const hasVideo = !!d.videoB64;
    const hasPreview = hasVideo || hasMultipleLayers;

    if (hasPreview) {
      item.classList.add('has-preview');
    }

    if (hasVideo) {
      const vid=document.createElement('video');
      vid.className='gi-video';vid.src=d.videoB64;
      vid.loop=true;vid.muted=true;vid.playsInline=true;
      item.addEventListener('mouseenter',()=>{thumbDiv.style.visibility='hidden';vid.style.display='block';vid.play();});
      item.addEventListener('mouseleave',()=>{vid.pause();vid.style.display='none';thumbDiv.style.visibility='';});
      item.appendChild(vid);
    } else if (hasMultipleLayers) {
      const layerSVGs=(d.savedLayers||[]).map(ld=>{
        const root=makeSVGRoot(VSIZE,VSIZE,VBOX);
        ld.strokes.forEach(s=>{
          const p=document.createElementNS(NS,'path');
          p.setAttribute('d',s.d);
          applyAttrs(p,s.attrs);
          root.appendChild(p);
        });
        return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(root));
      }).filter(Boolean);

      if (layerSVGs.length>1){
        let frameIdx=0,frameInterval=null;
        const frameImg=document.createElement('img');
        frameImg.className='gi-anim-img';
        frameImg.src=layerSVGs[0];
        item.appendChild(frameImg);
        item.addEventListener('mouseenter',()=>{
          thumbDiv.style.visibility='hidden';
          frameImg.style.display='block';
          frameIdx=0;frameImg.src=layerSVGs[0];
          frameInterval=setInterval(()=>{frameIdx=(frameIdx+1)%layerSVGs.length;frameImg.src=layerSVGs[frameIdx];},400);
        });
        item.addEventListener('mouseleave',()=>{
          clearInterval(frameInterval);frameImg.style.display='none';thumbDiv.style.visibility='';
        });
      }
    }

    const realIdx = total - 1 - i;   // index in the original (non-reversed) stored array

    const del=document.createElement('button');
    del.className='gallery-delete';del.textContent='×';
    del.addEventListener('click',e=>{
      e.stopPropagation();
      e.preventDefault();
      const list=loadDoodles();list.splice(realIdx,1);
      localStorage.setItem(DOODLE_KEY,JSON.stringify(list));
      renderGallery();renderStartBg();
    });

    // load for editing only on direct item click, not on delete or child controls
    item.addEventListener('click',e=>{
      if(e.target.closest('.gallery-delete')) return;
      loadForEditing(d);
    });
    item.appendChild(del);
    const dt=new Date(d.ts||Date.now());
    const dateEl=document.createElement('div');
    dateEl.className='gi-date';
    dateEl.textContent=`${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getFullYear()).slice(2)}`;
    wrapper.appendChild(item);
    wrapper.appendChild(dateEl);
    galleryGrid.appendChild(wrapper);
  });
}

function loadForEditing(doodleData){
  clearCanvas();showView('toolScreen');
  if (doodleData.bgColor) {
    bgColor = doodleData.bgColor;
    canvasBg.style.background = bgColor;
    const bgPicker = document.getElementById('bgColorPicker');
    if (bgPicker) bgPicker.value = bgColor;
  }
  if(doodleData.savedLayers?.length) doodleData.savedLayers.forEach(ld=>addLayer(ld.strokes));
  else addLayer();
}

function resizeSVG(svgStr){
  try{
    const doc=new DOMParser().parseFromString(svgStr,'image/svg+xml');
    const el=doc.documentElement;
    el.setAttribute('width','100%');
    el.setAttribute('height','100%');
    if (!el.getAttribute('viewBox')) el.setAttribute('viewBox',VBOX);
    el.setAttribute('preserveAspectRatio','xMidYMid meet');
    return new XMLSerializer().serializeToString(el);
  }catch{return svgStr;}
}

function fitToContent(svgStr){
  try{
    const doc=new DOMParser().parseFromString(svgStr,'image/svg+xml');
    const el=doc.documentElement;
    // Temporarily attach to DOM to use getBBox()
    const tmp=document.createElement('div');
    tmp.style.cssText='position:fixed;left:-9999px;top:-9999px;width:400px;height:400px;visibility:hidden;pointer-events:none;';
    const tmpSvg=document.createElementNS(NS,'svg');
    tmpSvg.setAttribute('viewBox',VBOX);
    tmpSvg.setAttribute('width','400');
    tmpSvg.setAttribute('height','400');
    Array.from(el.children).forEach(c=>tmpSvg.appendChild(c.cloneNode(true)));
    tmp.appendChild(tmpSvg);
    document.body.appendChild(tmp);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    tmpSvg.querySelectorAll('path').forEach(p=>{
      try{
        const bb=p.getBBox();
        if(bb.width>0||bb.height>0){
          const sw=parseFloat(p.getAttribute('stroke-width'))||0;
          const half=sw/2;
          minX=Math.min(minX,bb.x-half); minY=Math.min(minY,bb.y-half);
          maxX=Math.max(maxX,bb.x+bb.width+half); maxY=Math.max(maxY,bb.y+bb.height+half);
        }
      }catch(e){}
    });
    document.body.removeChild(tmp);
    if(isFinite(minX)&&maxX>minX&&maxY>minY){
      const pad=20;
      const vx=(minX-pad).toFixed(1), vy=(minY-pad).toFixed(1);
      const vw=(maxX-minX+pad*2).toFixed(1), vh=(maxY-minY+pad*2).toFixed(1);
      el.setAttribute('viewBox',`${vx} ${vy} ${vw} ${vh}`);
    } else {
      el.setAttribute('viewBox',VBOX);
    }
    el.setAttribute('width','100%');
    el.setAttribute('height','100%');
    el.setAttribute('preserveAspectRatio','xMidYMid meet');
    return new XMLSerializer().serializeToString(el);
  }catch(e){return svgStr;}
}


function renderStartBg(){
  doodleBg.innerHTML='';
  const doodles=loadDoodles();
  if(!doodles.length) return;
  const vw=window.innerWidth, vh=window.innerHeight;
  const SIZE = 180;
  const GAP  = 16;
  const TEXT_PAD = 50;

  const textEl = document.querySelector('.start-center');
  let tr = { left:(vw-500)/2, top:(vh-200)/2, right:(vw+500)/2, bottom:(vh+200)/2 };
  if (textEl) {
    const r = textEl.getBoundingClientRect();
    if (r.width > 0) tr = r;
  }

  const placed = [];

  function isValid(x, y) {
    if (x + SIZE < 0 || x > vw || y + SIZE < 0 || y > vh) return false;
    const tx1=tr.left-TEXT_PAD, ty1=tr.top-TEXT_PAD, tx2=tr.right+TEXT_PAD, ty2=tr.bottom+TEXT_PAD;
    if (x < tx2 && x+SIZE > tx1 && y < ty2 && y+SIZE > ty1) return false;
    for (const p of placed) {
      if (x < p.x+p.s+GAP && x+SIZE > p.x-GAP && y < p.y+p.s+GAP && y+SIZE > p.y-GAP) return false;
    }
    return true;
  }

  doodles.forEach((d, i) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = Math.random() * (vw - SIZE);
      const y = Math.random() * (vh - SIZE);
      if (!isValid(x, y)) continue;
      placed.push({ x, y, s: SIZE });
      const rot = (Math.random() - 0.5) * 22;
      const wrap = document.createElement('div');
      wrap.className = 'doodle-card';
      wrap.style.cssText = `width:${SIZE}px;height:${SIZE}px;left:${x}px;top:${y}px;--rot:rotate(${rot}deg);transform:rotate(${rot}deg);animation-delay:${i*.07}s;`;
      wrap.innerHTML = resizeSVG(d.svg, SIZE, SIZE);
      doodleBg.appendChild(wrap);
      break;
    }
  });
}
renderStartBg();

updateAnimBtn();
if(window.innerWidth<=640) document.getElementById('guiPanel').classList.add('collapsed');
