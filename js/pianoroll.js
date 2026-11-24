'use strict';
/* BUMBUM – Piano Roll */
(function (BB) {
  const $ = BB.$, $$ = BB.$$;
  const PR = BB.PianoRoll = {
    part: 0, tool: 'draw', len: 1, stepW: 34, rowH: 18, keysW: 52, rulerH: 22,
    sx: 0, sy: 0, top: 108, bottom: 12, drag: null, sel: null,
  };

  const rows = () => PR.top - PR.bottom + 1;
  const notes = () => BB.project.parts[PR.part].notes;

  function open() {
    PR.part = BB.UI.part;
    renderChips();
    $('#prPatLen').value = String(BB.project.length);
    requestAnimationFrame(() => { fitWidth(); centerOnNotes(); draw(); });
  }

  function renderChips() {
    BB.UI.chips($('#prParts'), PR.part, (i) => { PR.part = i; BB.UI.selectPart(i); renderChips(); centerOnNotes(); draw(); });
  }

  function view() {
    const c = $('#prCanvas');
    const [w, h, d] = BB.UI.sizeCanvas(c);
    return { c, g: c.getContext('2d'), w: w / d, h: h / d, d };
  }

  function fitWidth() {
    const { w } = view();
    const avail = w - PR.keysW;
    PR.stepW = Math.max(16, Math.min(60, avail / BB.project.length));
    clampScroll();
  }

  function centerOnNotes() {
    const { h } = view();
    const ns = notes();
    let mid;
    if (ns.length) mid = ns.reduce((a, n) => a + n.p, 0) / ns.length;
    else mid = BB.project.parts[PR.part].keyBase + 12;
    PR.sy = (PR.top - mid) * PR.rowH - (h - PR.rulerH) / 2;
    clampScroll();
  }

  function clampScroll() {
    const { w, h } = view();
    const maxX = Math.max(0, BB.project.length * PR.stepW - (w - PR.keysW));
    const maxY = Math.max(0, rows() * PR.rowH - (h - PR.rulerH));
    PR.sx = BB.clamp(PR.sx, 0, maxX); PR.sy = BB.clamp(PR.sy, 0, maxY);
  }

  const xToStep = (x) => (x - PR.keysW + PR.sx) / PR.stepW;
  const yToPitch = (y) => PR.top - Math.floor((y - PR.rulerH + PR.sy) / PR.rowH);
  const stepToX = (s) => PR.keysW + s * PR.stepW - PR.sx;
  const pitchToY = (p) => PR.rulerH + (PR.top - p) * PR.rowH - PR.sy;

  function hit(x, y) {
    const s = xToStep(x), p = yToPitch(y);
    const ns = notes();
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (n.p === p && s >= n.s && s < n.s + n.l) return { n, edge: stepToX(n.s + n.l) - x < Math.max(7, PR.stepW * 0.25) };
    }
    return null;
  }

  function audition(p, v) {
    if (!BB.Audio.ready) return;
    BB.Audio.playNote(PR.part, BB.Audio.now() + 0.005, p, v || 0.9, 0.2);
  }

  function changed() { BB.save(); BB.emit('notes', PR.part); draw(); }

  function draw() {
    const ov = $('#pianoOverlay'); if (ov.hidden) return;
    const { g, w, h, d } = view();
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, w, h);
    const L = BB.project.length, col = BB.PART_COLORS[PR.part];
    // Zeilen
    const p0 = Math.min(PR.top, yToPitch(PR.rulerH)), p1 = Math.max(PR.bottom, yToPitch(h));
    for (let p = p0; p >= p1; p--) {
      const y = pitchToY(p);
      g.fillStyle = BB.isBlack(p) ? '#140a0f' : '#1d0f16';
      g.fillRect(PR.keysW, y, w - PR.keysW, PR.rowH);
      g.fillStyle = p % 12 === 0 ? '#3a1d2b' : '#24121a';
      g.fillRect(PR.keysW, y + PR.rowH - 1, w - PR.keysW, 1);
    }
    // außerhalb des Patterns
    const endX = stepToX(L);
    if (endX < w) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(endX, PR.rulerH, w - endX, h); }
    // Vertikale Linien
    for (let s = 0; s <= L; s++) {
      const x = stepToX(s); if (x < PR.keysW - 1 || x > w) continue;
      g.fillStyle = s % 16 === 0 ? '#6a3550' : s % 4 === 0 ? '#3d1f2e' : '#26131c';
      g.fillRect(x, PR.rulerH, s % 16 === 0 ? 2 : 1, h);
    }
    // Noten
    notes().forEach((n) => {
      const x = stepToX(n.s), y = pitchToY(n.p), nw = n.l * PR.stepW;
      if (x + nw < PR.keysW || x > w || y + PR.rowH < PR.rulerH || y > h) return;
      g.globalAlpha = 0.45 + n.v * 0.55;
      g.fillStyle = col;
      roundRect(g, x + 1, y + 1, nw - 2, PR.rowH - 2, 4); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + nw - 5, y + 4, 2, PR.rowH - 8);
      if (n === PR.sel) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; roundRect(g, x + 1, y + 1, nw - 2, PR.rowH - 2, 4); g.stroke(); }
      if (PR.stepW * n.l > 30 && PR.rowH >= 14) {
        g.fillStyle = 'rgba(20,4,12,0.8)'; g.font = '10px Inter, sans-serif'; g.textAlign = 'left';
        g.fillText(BB.noteName(n.p), x + 4, y + PR.rowH - 5);
      }
    });
    // Playhead
    if (BB.Seq.playing && BB.UI.playhead >= 0) {
      const x = stepToX(BB.UI.playhead);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, PR.rulerH, PR.stepW, h);
      g.fillStyle = '#fff'; g.fillRect(x, PR.rulerH, 1.5, h);
    }
    // Tasten
    g.fillStyle = '#0d0709'; g.fillRect(0, PR.rulerH, PR.keysW, h);
    for (let p = p0; p >= p1; p--) {
      const y = pitchToY(p);
      const black = BB.isBlack(p);
      g.fillStyle = black ? '#1a1316' : '#e9dfe4';
      g.fillRect(0, y, black ? PR.keysW * 0.62 : PR.keysW - 2, PR.rowH - 1);
      if (p % 12 === 0) { g.fillStyle = '#5b0f36'; g.font = '10px Inter, sans-serif'; g.textAlign = 'right'; g.fillText(BB.noteName(p), PR.keysW - 6, y + PR.rowH - 5); }
    }
    // Lineal
    g.fillStyle = '#170b11'; g.fillRect(0, 0, w, PR.rulerH);
    g.font = '11px VT323, monospace'; g.textAlign = 'left';
    for (let s = 0; s < L; s += 4) {
      const x = stepToX(s); if (x < PR.keysW - 1 || x > w) continue;
      g.fillStyle = s % 16 === 0 ? '#ff9a2e' : '#7a5566';
      g.fillText(s % 16 === 0 ? `${s / 16 + 1}` : `${Math.floor(s / 16) + 1}.${(s % 16) / 4 + 1}`, x + 3, 15);
    }
    g.fillStyle = '#170b11'; g.fillRect(0, 0, PR.keysW, PR.rulerH);
    g.fillStyle = col; g.font = '700 11px Inter, sans-serif'; g.fillText(`P${PR.part + 1}`, 8, 15);
    drawVel();
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawVel() {
    const c = $('#prVel'), [w0, h0, d] = BB.UI.sizeCanvas(c), g = c.getContext('2d');
    const w = w0 / d, h = h0 / d;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.fillStyle = '#7a5566'; g.font = '700 9px Inter, sans-serif'; g.textAlign = 'left'; g.fillText('VEL', 8, 14);
    const col = BB.PART_COLORS[PR.part];
    notes().forEach((n) => {
      const x = stepToX(n.s); if (x < PR.keysW - 2 || x > w) return;
      const bh = (h - 10) * n.v;
      g.fillStyle = n === PR.sel ? '#fff' : col;
      g.fillRect(x + 2, h - bh - 2, Math.max(3, Math.min(10, PR.stepW - 4)), bh);
    });
  }

  /* Interaktion im Grid */
  function bindGrid() {
    const c = $('#prCanvas');
    const pts = new Map();
    let pinch = null;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      pts.set(e.pointerId, { x, y });
      if (pts.size === 2) { PR.drag = null; const [a, b] = [...pts.values()]; pinch = { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, sx: PR.sx, sy: PR.sy }; return; }
      if (x < PR.keysW && y > PR.rulerH) { audition(yToPitch(y)); PR.drag = { mode: 'scrollY', y0: y, sy: PR.sy }; return; }
      if (y < PR.rulerH) { PR.drag = { mode: 'scrollX', x0: x, sx: PR.sx }; return; }
      if (PR.tool === 'pan') { PR.drag = { mode: 'pan', x0: x, y0: y, sx: PR.sx, sy: PR.sy }; return; }
      const h = hit(x, y);
      const erase = PR.tool === 'erase' || e.button === 2;
      if (erase) { if (h) { remove(h.n); } PR.drag = { mode: 'erase' }; return; }
      if (h) {
        PR.sel = h.n;
        if (h.edge) PR.drag = { mode: 'resize', n: h.n };
        else { PR.drag = { mode: 'move', n: h.n, ds: xToStep(x) - h.n.s, moved: false, t: performance.now() }; audition(h.n.p, h.n.v); }
      } else {
        const s = Math.floor(xToStep(x)), p = yToPitch(y);
        if (s < 0 || s >= BB.project.length || p > PR.top || p < PR.bottom) return;
        const n = { s, p, v: 1, l: Math.min(PR.len, BB.project.length - s) };
        notes().push(n); PR.sel = n; audition(p);
        BB.UI.lastPitch[PR.part] = p;
        PR.drag = { mode: 'resize', n, created: true };
      }
      draw();
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x, y });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        PR.sx = pinch.sx - ((a.x + b.x) / 2 - pinch.cx); PR.sy = pinch.sy - ((a.y + b.y) / 2 - pinch.cy);
        clampScroll(); draw(); return;
      }
      const D = PR.drag;
      if (!D) { const h = hit(x, y); c.style.cursor = h ? (h.edge ? 'ew-resize' : 'grab') : (PR.tool === 'pan' ? 'move' : 'crosshair'); return; }
      if (D.mode === 'scrollY') { PR.sy = D.sy - (y - D.y0); clampScroll(); }
      else if (D.mode === 'scrollX') { PR.sx = D.sx - (x - D.x0); clampScroll(); }
      else if (D.mode === 'pan') { PR.sx = D.sx - (x - D.x0); PR.sy = D.sy - (y - D.y0); clampScroll(); }
      else if (D.mode === 'erase') { const h = hit(x, y); if (h) remove(h.n); }
      else if (D.mode === 'resize') {
        const e2 = Math.ceil(xToStep(x));
        D.n.l = BB.clamp(e2 - D.n.s, 1, BB.project.length - D.n.s);
      } else if (D.mode === 'move') {
        const s = BB.clamp(Math.round(xToStep(x) - D.ds), 0, BB.project.length - D.n.l);
        const p = BB.clamp(yToPitch(y), PR.bottom, PR.top);
        if (p !== D.n.p) audition(p, D.n.v);
        if (s !== D.n.s || p !== D.n.p) D.moved = true;
        D.n.s = s; D.n.p = p;
      }
      draw();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      const D = PR.drag; PR.drag = null;
      if (!D) return;
      if (D.mode === 'move' && !D.moved && performance.now() - D.t < 250 && D.n === PR._lastTap && performance.now() - PR._lastTapT < 400) {
        remove(D.n); return;
      }
      if (D.mode === 'move') { PR._lastTap = D.n; PR._lastTapT = performance.now(); }
      if (['move', 'resize', 'erase'].includes(D.mode)) changed();
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) { zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); return; }
      if (e.shiftKey) PR.sx += e.deltaY; else { PR.sx += e.deltaX; PR.sy += e.deltaY; }
      clampScroll(); draw();
    }, { passive: false });
  }

  function remove(n) {
    const ns = notes(), i = ns.indexOf(n);
    if (i >= 0) ns.splice(i, 1);
    if (PR.sel === n) PR.sel = null;
    changed();
  }

  function zoom(f) { PR.stepW = BB.clamp(PR.stepW * f, 10, 90); clampScroll(); draw(); }

  function bindVel() {
    const c = $('#prVel');
    let on = false;
    const set = (e) => {
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const v = BB.clamp(1 - (y - 2) / (r.height - 10), 0.05, 1);
      const s = Math.floor(xToStep(x));
      const ns = notes().filter((n) => n.s === s);
      ns.forEach((n) => { n.v = Math.round(v * 100) / 100; });
      if (ns.length) draw();
    };
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); c.setPointerCapture(e.pointerId); on = true; set(e); });
    c.addEventListener('pointermove', (e) => { if (on) set(e); });
    c.addEventListener('pointerup', () => { if (on) { on = false; changed(); } });
  }

  function bindTools() {
    $$('#prTool button').forEach((b) => b.addEventListener('click', () => {
      PR.tool = b.dataset.tool; $$('#prTool button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#prLen').addEventListener('change', (e) => { PR.len = +e.target.value; });
    $('#prPatLen').addEventListener('change', (e) => { BB.UI.setLength(+e.target.value); fitWidth(); draw(); });
    const transpose = (d) => {
      const ns = PR.sel ? [PR.sel] : notes();
      ns.forEach((n) => { n.p = BB.clamp(n.p + d, PR.bottom, PR.top); });
      changed();
    };
    $('#prOctUp').addEventListener('click', () => transpose(12));
    $('#prOctDown').addEventListener('click', () => transpose(-12));
    $('#prZoomIn').addEventListener('click', () => zoom(1.25));
    $('#prZoomOut').addEventListener('click', () => zoom(0.8));
    $('#prClear').addEventListener('click', () => { if (confirm(`Alle Noten von Spur ${PR.part + 1} löschen?`)) { BB.project.parts[PR.part].notes = []; PR.sel = null; changed(); } });
    $('#prPlay').addEventListener('click', () => BB.Seq.toggle());
    window.addEventListener('keydown', (e) => {
      if ($('#pianoOverlay').hidden || !PR.sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(PR.sel); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); PR.sel.p = BB.clamp(PR.sel.p + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), PR.bottom, PR.top); audition(PR.sel.p); changed(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); PR.sel.s = BB.clamp(PR.sel.s + (e.key === 'ArrowRight' ? 1 : -1), 0, BB.project.length - PR.sel.l); changed(); }
    }, true);
  }

  PR.init = function () {
    bindGrid(); bindVel(); bindTools();
    BB.on('open:pianoOverlay', open);
    BB.on('playhead', () => draw());
    BB.on('notes', (i) => { if (i === PR.part) draw(); });
    BB.on('length', () => { $('#prPatLen').value = String(BB.project.length); });
    window.addEventListener('resize', () => { if (!$('#pianoOverlay').hidden) { clampScroll(); draw(); } });
  };
})(window.BB);
