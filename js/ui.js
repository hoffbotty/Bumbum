'use strict';
/* BUMBUM – Oberfläche des Geräts */
(function (BB) {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  BB.$ = $; BB.$$ = $$;

  const UI = BB.UI = {
    part: 0, mode: 'step', page: 0, fn: 'TEMPO', muteMode: false, hold: false,
    playhead: -1, lastPitch: {}, knobs: [], taps: [],
  };

  /* ---------- Hilfen ---------- */
  let saveT = null;
  BB.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(() => BB.Store.save('bb-autosave', BB.project), 400);
  };

  UI.toast = function (msg, ms) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(() => { t.hidden = true; }, ms || 1800);
  };

  UI.curPart = () => BB.project.parts[UI.part];

  UI.defaultPitch = function (i) {
    if (UI.lastPitch[i] != null) return UI.lastPitch[i];
    const p = BB.project.parts[i];
    if (BB.isSynth(p.engine)) {
      const first = p.notes[0];
      return first ? first.p : 48;
    }
    return 60;
  };

  /* ---------- Knopf-Komponente ---------- */
  class Knob {
    constructor(parent, o) {
      this.o = Object.assign({ min: 0, max: 1, def: 0, step: 0, endless: false }, o);
      const w = this.wrap = document.createElement('div');
      w.className = 'knob-wrap';
      w.innerHTML = `<div class="knob"><div class="cap"></div></div>${o.label ? `<span class="klabel">${o.label}</span>` : ''}`;
      parent.appendChild(w);
      this.knob = w.querySelector('.knob'); this.cap = w.querySelector('.cap');
      this.v = this.o.def; this.acc = 0;
      this.bind();
      this.render();
    }
    set(v) { this.v = v; this.render(); }
    render() {
      const o = this.o;
      const ang = o.endless ? (this.acc * 12) % 360 : -135 + (270 * (this.v - o.min)) / (o.max - o.min || 1);
      this.cap.style.transform = `rotate(${ang}deg)`;
    }
    change(v) {
      const o = this.o;
      v = BB.clamp(v, o.min, o.max);
      if (o.step) v = Math.round(v / o.step) * o.step;
      if (v !== this.v) { this.v = v; this.render(); o.onChange && o.onChange(v); }
    }
    bind() {
      const k = this.knob, o = this.o;
      let sy = 0, sv = 0, last = 0, moved = false;
      k.addEventListener('pointerdown', (e) => {
        e.preventDefault(); k.setPointerCapture(e.pointerId);
        sy = e.clientY; sv = this.v; last = e.clientY; moved = false;
        this.wrap.classList.add('sel');
        o.onStart && o.onStart();
      });
      k.addEventListener('pointermove', (e) => {
        if (!k.hasPointerCapture(e.pointerId)) return;
        moved = true;
        if (o.endless) {
          const d = last - e.clientY;
          if (Math.abs(d) >= 9) {
            const steps = Math.trunc(d / 9); last -= steps * 9;
            this.acc += steps; this.render(); o.onDelta && o.onDelta(steps, e.shiftKey);
          }
          return;
        }
        const range = o.max - o.min;
        const sens = o.step >= 1 && range <= 20 ? 140 : (e.shiftKey ? 700 : 180);
        this.change(sv + ((sy - e.clientY) / sens) * range);
      });
      const up = (e) => { if (k.hasPointerCapture(e.pointerId)) k.releasePointerCapture(e.pointerId); this.wrap.classList.remove('sel'); o.onEnd && o.onEnd(moved); };
      k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
      k.addEventListener('wheel', (e) => {
        e.preventDefault();
        const dir = e.deltaY < 0 ? 1 : -1;
        if (o.endless) { this.acc += dir; this.render(); o.onDelta && o.onDelta(dir, e.shiftKey); return; }
        const st = o.step || (o.max - o.min) / 100;
        this.change(this.v + dir * st * (e.shiftKey ? 0.25 : 1));
        o.onStart && o.onStart();
      }, { passive: false });
      k.addEventListener('dblclick', () => { if (!o.endless) this.change(o.def); });
    }
  }
  UI.Knob = Knob;

  /* ---------- LCD ---------- */
  UI.lcd = function () {
    clearTimeout(UI._lcdT);
    const P = BB.project, p = UI.curPart();
    $('#lcd1').textContent = `PTN ${BB.pad3(P.slot || 1)} ${UI.part + 1}:${p.engine}`;
    let l2;
    switch (UI.fn) {
      case 'SWING': l2 = `SWING ${Math.round(P.swing * 100)}%`; break;
      case 'LENGTH': l2 = `LENGTH ${P.length / 16} BAR`; break;
      case 'IFX': l2 = `IFX: ${p.ifxType} ${Math.round(p.ifx * 100)}`; break;
      case 'PADFX': l2 = `PAD FX: ${P.padFx}`; break;
      case 'MUTE': l2 = 'MUTE: PART-TASTEN'; break;
      default: l2 = `TEMPO ${P.bpm.toFixed(1)} BPM`;
    }
    if (BB.Seq.recording) l2 = 'REC ' + l2;
    $('#lcd2').textContent = l2;
    $('#bpmTag').textContent = `${Math.round(P.bpm)} BPM`;
  };
  UI.flash = function (a, b, ms) {
    clearTimeout(UI._lcdT);
    $('#lcd1').textContent = a; $('#lcd2').textContent = b;
    UI._lcdT = setTimeout(UI.lcd, ms || 1300);
  };

  /* ---------- Regler ---------- */
  function buildKnobs() {
    const box = $('#knobs');
    BB.KNOBS.forEach((d) => {
      const k = new Knob(box, {
        label: d.label, min: d.min, max: d.max, step: d.step, def: d.def,
        onChange: (v) => {
          const p = UI.curPart();
          if (d.id === 'engine') {
            const eng = BB.ENGINES[v];
            p.engine = eng;
            if (BB.isSynth(eng) && p.keyBase === 60) p.keyBase = 48;
            if (!BB.isSynth(eng) && p.keyBase === 48) p.keyBase = 60;
            UI.renderParts(); UI.renderPads();
          } else p[d.id] = v;
          BB.Audio.applyPart(UI.part);
          UI.flash(d.id === 'ifx' ? `IFX: ${p.ifxType}` : `${UI.part + 1}:${d.label}`, BB.formatParam(d.id, v, p));
          BB.save();
          BB.emit('param', UI.part);
        },
        onStart: () => UI.flash(`${UI.part + 1}:${d.label}`, BB.formatParam(d.id, d.id === 'engine' ? BB.ENGINES.indexOf(UI.curPart().engine) : UI.curPart()[d.id], UI.curPart())),
        onEnd: (moved) => {
          if (!moved && d.id === 'engine' && !BB.Seq.playing) UI.audition(UI.part);
        },
      });
      k.id = d.id;
      UI.knobs.push(k);
    });
  }
  UI.refreshKnobs = function () {
    const p = UI.curPart();
    UI.knobs.forEach((k) => k.set(k.id === 'engine' ? BB.ENGINES.indexOf(p.engine) : p[k.id]));
  };

  /* ---------- Funktionstasten + VALUE ---------- */
  const FNS = [['TEMPO', 'TEMPO'], ['SWING', 'SWING'], ['LENGTH', 'LENGTH'], ['IFX', 'IFX'], ['PADFX', 'PAD FX'], ['MUTE', 'MUTE']];
  function buildFn() {
    const row = $('#fnrow');
    FNS.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.className = 'sbtn'; b.dataset.fn = id; b.innerHTML = `${label}<i class="led"></i>`;
      b.addEventListener('click', () => {
        if (id === 'MUTE') { UI.muteMode = !UI.muteMode; UI.fn = UI.muteMode ? 'MUTE' : 'TEMPO'; }
        else {
          if (id === 'TEMPO' && UI.fn === 'TEMPO') tapTempo();
          UI.fn = id; UI.muteMode = false;
        }
        UI.renderFn(); UI.renderParts(); UI.lcd();
      });
      row.appendChild(b);
    });
    UI.valueKnob = new Knob($('#valueKnob'), { endless: true, onDelta: valueDelta });
  }
  function tapTempo() {
    const now = performance.now();
    UI.taps = UI.taps.filter((t) => now - t < 2000);
    UI.taps.push(now);
    if (UI.taps.length >= 3) {
      const iv = [];
      for (let i = 1; i < UI.taps.length; i++) iv.push(UI.taps[i] - UI.taps[i - 1]);
      const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
      UI.setBpm(60000 / avg);
      UI.flash('TAP TEMPO', `${BB.project.bpm.toFixed(1)} BPM`);
    }
  }
  UI.setBpm = function (v) {
    BB.project.bpm = Math.round(BB.clamp(v, 40, 300) * 10) / 10;
    BB.Audio.syncTempo();
    BB.emit('bpm');
    UI.lcd(); BB.save();
  };
  UI.setLength = function (len) {
    BB.project.length = BB.clamp(len, 16, 64);
    UI.page = Math.min(UI.page, BB.project.length / 16 - 1);
    UI.renderPads(); UI.lcd(); BB.save(); BB.emit('length');
  };
  function valueDelta(d, fine) {
    const P = BB.project, p = UI.curPart();
    switch (UI.fn) {
      case 'TEMPO': UI.setBpm(P.bpm + d * (fine ? 0.1 : 1)); break;
      case 'SWING': P.swing = BB.clamp(Math.round((P.swing + d * 0.02) * 100) / 100, 0, 1); UI.lcd(); BB.save(); break;
      case 'LENGTH': UI.setLength(P.length + d * 16); break;
      case 'IFX': {
        const i = (BB.IFX_TYPES.indexOf(p.ifxType) + d + BB.IFX_TYPES.length * 10) % BB.IFX_TYPES.length;
        p.ifxType = BB.IFX_TYPES[i];
        if (p.ifxType !== 'OFF' && p.ifx < 0.05) { p.ifx = 0.5; UI.refreshKnobs(); }
        BB.Audio.applyPart(UI.part); UI.lcd(); BB.save(); BB.emit('param', UI.part); break;
      }
      case 'PADFX': {
        const i = (BB.PADFX_TYPES.indexOf(P.padFx) + d + BB.PADFX_TYPES.length * 10) % BB.PADFX_TYPES.length;
        UI.setPadFx(BB.PADFX_TYPES[i]); break;
      }
      default: break;
    }
  }
  UI.renderFn = function () {
    $$('#fnrow .sbtn').forEach((b) => b.classList.toggle('on', b.dataset.fn === UI.fn || (b.dataset.fn === 'MUTE' && UI.muteMode)));
  };
  UI.setPadFx = function (t) {
    BB.project.padFx = t; $('#padFxType').textContent = t;
    if (BB.Audio.padfx && BB.Audio.padfx.active) BB.Audio.padfx.release();
    UI.lcd(); BB.save(); BB.emit('padfx');
  };

  /* ---------- Part-Tasten ---------- */
  function buildParts() {
    const box = $('#parts');
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button');
      b.className = 'sbtn'; b.style.setProperty('--c', BB.PART_COLORS[i]);
      b.addEventListener('click', () => {
        if (UI.muteMode) { const p = BB.project.parts[i]; p.mute = !p.mute; UI.renderParts(); BB.save(); BB.emit('mute'); return; }
        UI.selectPart(i);
        if (!BB.Seq.playing) UI.audition(i);
      });
      box.appendChild(b);
    }
  }
  UI.renderParts = function () {
    $$('#parts .sbtn').forEach((b, i) => {
      const p = BB.project.parts[i];
      b.innerHTML = `<span class="num">${i + 1}</span>${p.engine}<i class="led"></i>`;
      b.classList.toggle('sel', i === UI.part);
      b.classList.toggle('muted', !!p.mute);
    });
  };
  UI.selectPart = function (i) {
    UI.part = i;
    UI.renderParts(); UI.refreshKnobs(); UI.renderPads(); UI.lcd();
    BB.emit('part', i);
  };
  UI.audition = function (i) {
    if (!BB.Audio.ready) return;
    BB.Audio.playNote(i, BB.Audio.now() + 0.005, UI.defaultPitch(i), 0.9, 0.25);
  };

  /* ---------- Pads ---------- */
  function buildPads() {
    const box = $('#pads');
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('button');
      b.className = 'pad';
      b.innerHTML = '<span class="fill"></span><span class="pl"></span><span class="pn"></span>';
      bindPad(b, i);
      box.appendChild(b);
    }
  }
  function padTarget(i) {
    if (UI.mode === 'trig') return { part: i % 8, pitch: UI.defaultPitch(i % 8), vel: i < 8 ? 1 : 0.5 };
    const p = UI.curPart();
    return { part: UI.part, pitch: p.keyBase + i, vel: 1 };
  }
  function bindPad(b, i) {
    let lpT = null, long = false, handle = null, rec = null, t0 = 0;
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      if (UI.mode === 'step') {
        long = false;
        lpT = setTimeout(() => { long = true; cycleVelocity(i); }, 420);
        return;
      }
      const tg = padTarget(i);
      const A = BB.Audio; if (!A.ready) return;
      t0 = A.now();
      UI.lastPitch[tg.part] = UI.mode === 'keys' ? tg.pitch : UI.lastPitch[tg.part];
      handle = A.playNote(tg.part, t0 + 0.003, tg.pitch, tg.vel, null);
      rec = BB.Seq.recordNote(tg.part, tg.pitch, tg.vel, t0);
      b.classList.add('hit');
    });
    const up = () => {
      if (UI.mode === 'step') {
        if (lpT) { clearTimeout(lpT); lpT = null; if (!long) toggleStep(i); }
        return;
      }
      b.classList.remove('hit');
      const A = BB.Audio;
      if (handle) { handle.release(A.now()); handle = null; }
      if (rec) {
        const p = BB.project.parts[UI.mode === 'trig' ? i % 8 : UI.part];
        if (BB.isSynth(p.engine)) rec.l = Math.max(1, Math.round((A.now() - t0) / BB.Seq.sec16()));
        rec = null; BB.save(); UI.renderPads();
      }
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  }
  function toggleStep(i) {
    const p = UI.curPart(), s = UI.page * 16 + i;
    if (s >= BB.project.length) return;
    const idx = p.notes.findIndex((n) => n.s === s);
    if (idx >= 0) p.notes = p.notes.filter((n) => n.s !== s);
    else {
      const pitch = BB.isDrum(p.engine) ? 60 : (p.engine === 'SAMPLE' && p.sample.slices.length ? 60 + (s % p.sample.slices.length) : UI.defaultPitch(UI.part));
      p.notes.push({ s, p: pitch, v: 1, l: 1 });
      if (!BB.Seq.playing && BB.Audio.ready) BB.Audio.playNote(UI.part, BB.Audio.now() + 0.005, pitch, 1, 0.2);
    }
    UI.renderPads(); BB.save(); BB.emit('notes', UI.part);
  }
  function cycleVelocity(i) {
    const p = UI.curPart(), s = UI.page * 16 + i;
    if (s >= BB.project.length) return;
    let ns = p.notes.filter((n) => n.s === s);
    if (!ns.length) { const n = { s, p: UI.defaultPitch(UI.part), v: 0.6, l: 1 }; p.notes.push(n); ns = [n]; }
    else {
      const v = ns[0].v, nv = v > 0.8 ? 0.6 : v > 0.45 ? 0.3 : 1;
      ns.forEach((n) => { n.v = nv; });
    }
    UI.flash(`STEP ${s + 1}`, `VELOCITY ${Math.round(ns[0].v * 127)}`);
    UI.renderPads(); BB.save(); BB.emit('notes', UI.part);
  }

  UI.renderPads = function () {
    const pads = $$('#pads .pad');
    const p = UI.curPart(), col = BB.PART_COLORS[UI.part];
    const pages = BB.project.length / 16;
    UI.page = Math.min(UI.page, pages - 1);
    pads.forEach((b, i) => {
      b.className = 'pad';
      b.style.removeProperty('--a');
      const pl = b.querySelector('.pl'), pn = b.querySelector('.pn');
      pl.textContent = '';
      if (UI.mode === 'step') {
        const s = UI.page * 16 + i;
        b.style.setProperty('--c', col);
        pn.textContent = s + 1;
        const ns = p.notes.filter((n) => n.s === s);
        if (ns.length) {
          b.classList.add('on');
          const v = Math.max(...ns.map((n) => n.v));
          b.style.setProperty('--a', String(0.35 + v * 0.65));
          if (BB.isSynth(p.engine)) pl.textContent = BB.noteName(ns[0].p);
          else if (p.engine === 'SAMPLE' && p.sample.slices.length) pl.textContent = 'S' + (((ns[0].p - 60) % p.sample.slices.length + p.sample.slices.length) % p.sample.slices.length + 1);
        } else if (p.notes.some((n) => n.s < s && n.s + n.l > s)) b.classList.add('tie');
        if (UI.playhead === s) b.classList.add('ph');
      } else if (UI.mode === 'trig') {
        const pi = i % 8;
        b.style.setProperty('--c', BB.PART_COLORS[pi]);
        b.classList.add('tint');
        pl.textContent = BB.project.parts[pi].engine.slice(0, 5);
        pn.textContent = (pi + 1) + (i >= 8 ? '·' : '');
      } else {
        const m = p.keyBase + i;
        b.style.setProperty('--c', col);
        const sl = p.engine === 'SAMPLE' ? p.sample.slices.length : 0;
        if (sl) { pl.textContent = i < sl ? 'S' + (i + 1) : ''; if (i < sl) b.classList.add('tint'); }
        else { pl.textContent = BB.noteName(m); if (BB.isBlack(m)) b.classList.add('black'); else b.classList.add('tint'); }
        pn.textContent = i + 1;
      }
    });
    $('#pgLabel').textContent = UI.mode === 'keys' ? BB.noteName(p.keyBase) : `${UI.page + 1}/${pages}`;
  };

  function buildModes() {
    $$('#modes [data-mode]').forEach((b) => b.addEventListener('click', () => { UI.mode = b.dataset.mode; renderModes(); UI.renderPads(); }));
    $('#pgDown').addEventListener('click', () => pageOrOct(-1));
    $('#pgUp').addEventListener('click', () => pageOrOct(1));
  }
  function pageOrOct(d) {
    if (UI.mode === 'keys') {
      const p = UI.curPart(); p.keyBase = BB.clamp(p.keyBase + d * 12, 12, 108);
      UI.flash('OCTAVE', BB.noteName(p.keyBase)); BB.save();
    } else UI.page = BB.clamp(UI.page + d, 0, BB.project.length / 16 - 1);
    UI.renderPads();
  }
  function renderModes() { $$('#modes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === UI.mode)); }

  /* ---------- Transport ---------- */
  function buildTransport() {
    $('#playBtn').addEventListener('click', () => { if (!BB.Seq.playing) BB.Seq.start(); });
    $('#stopBtn').addEventListener('click', () => { if (BB.Seq.playing) BB.Seq.stop(); else if (BB.Seq.recording) { BB.Seq.recording = false; renderTransport(); UI.lcd(); } });
    $('#recBtn').addEventListener('click', UI.toggleRec);
    BB.on('transport', renderTransport);
  }
  UI.toggleRec = function () {
    BB.Seq.recording = !BB.Seq.recording;
    if (BB.Seq.recording && UI.mode === 'step') { UI.mode = 'keys'; renderModes(); UI.renderPads(); }
    renderTransport(); UI.lcd();
  };
  function renderTransport() {
    $('#playBtn').classList.toggle('on', BB.Seq.playing);
    $('#recBtn').classList.toggle('on', BB.Seq.recording);
  }

  /* ---------- Touchpad ---------- */
  const TP = { x: 0.5, y: 0.5, down: false, trail: [], active: false };
  function buildTouchpad() {
    const c = $('#touchpad');
    const pos = (e) => { const r = c.getBoundingClientRect(); return [BB.clamp((e.clientX - r.left) / r.width, 0, 1), BB.clamp((e.clientY - r.top) / r.height, 0, 1)]; };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      if (!BB.Audio.ready) return;
      const [x, y] = pos(e); TP.x = x; TP.y = y; TP.down = true; TP.active = true;
      BB.Audio.padfx.engage(BB.project.padFx, x, 1 - y);
      padLcd();
    });
    c.addEventListener('pointermove', (e) => {
      if (!TP.down) return;
      const [x, y] = pos(e); TP.x = x; TP.y = y;
      BB.Audio.padfx.move(x, 1 - y); padLcd();
    });
    const up = () => {
      if (!TP.down) return; TP.down = false;
      if (!UI.hold) { BB.Audio.padfx.release(); TP.active = false; UI.lcd(); }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    $('#holdBtn').addEventListener('click', () => {
      UI.hold = !UI.hold; $('#holdBtn').classList.toggle('on', UI.hold);
      if (!UI.hold && !TP.down && TP.active) { BB.Audio.padfx.release(); TP.active = false; UI.lcd(); }
    });
    $('#padFxType').addEventListener('click', () => {
      const i = (BB.PADFX_TYPES.indexOf(BB.project.padFx) + 1) % BB.PADFX_TYPES.length;
      UI.setPadFx(BB.PADFX_TYPES[i]); TP.active = false;
      UI.flash('PAD FX', BB.project.padFx);
    });
  }
  function padLcd() {
    const names = { FILTER: TP.x < 0.5 ? 'LPF' : 'HPF', DELAY: 'DLY', BUILD: 'RISE', GATE: 'GATE', ROLL: 'ROLL', CRUSH: 'BITS' };
    clearTimeout(UI._lcdT);
    $('#lcd1').textContent = `PAD FX ${BB.project.padFx}`;
    $('#lcd2').textContent = `${names[BB.project.padFx]} ${Math.round(TP.x * 100)}% ${Math.round((1 - TP.y) * 100)}%`;
  }
  function sizeCanvas(c) {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return [w, h, d];
  }
  UI.sizeCanvas = sizeCanvas;
  function drawTouchpad() {
    const c = $('#touchpad'), g = c.getContext('2d');
    const [w, h, d] = sizeCanvas(c);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,79,154,0.09)'; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo((i * w) / 8, 0); g.lineTo((i * w) / 8, h); g.stroke();
      g.beginPath(); g.moveTo(0, (i * h) / 8); g.lineTo(w, (i * h) / 8); g.stroke();
    }
    if (TP.active) TP.trail.push([TP.x, TP.y]);
    if (TP.trail.length > 28 || (!TP.active && TP.trail.length)) TP.trail.shift();
    if (TP.trail.length > 1) {
      g.lineCap = 'round';
      for (let i = 1; i < TP.trail.length; i++) {
        const a = i / TP.trail.length;
        g.strokeStyle = `rgba(255,90,170,${a * 0.9})`; g.lineWidth = (2 + a * 4) * d;
        g.beginPath(); g.moveTo(TP.trail[i - 1][0] * w, TP.trail[i - 1][1] * h); g.lineTo(TP.trail[i][0] * w, TP.trail[i][1] * h); g.stroke();
      }
    }
    if (TP.active) {
      const x = TP.x * w, y = TP.y * h, R = 46 * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.12, 'rgba(255,120,190,0.9)');
      gr.addColorStop(0.45, 'rgba(255,60,150,0.28)'); gr.addColorStop(1, 'rgba(255,60,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = 'rgba(255,79,154,0.35)'; g.font = `${11 * d}px Inter, sans-serif`; g.textAlign = 'center';
      g.fillText(BB.project.padFx, w / 2, h / 2 + 4 * d);
    }
  }

  /* ---------- Scope ---------- */
  const hist = [];
  let scopeBuf = null;
  function drawScope() {
    const c = $('#scope'), g = c.getContext('2d');
    const [w, h, d] = sizeCanvas(c);
    const A = BB.Audio;
    let peak = 0;
    if (A.ready) {
      if (!scopeBuf) scopeBuf = new Float32Array(A.analyser.fftSize);
      A.analyser.getFloatTimeDomainData(scopeBuf);
      for (let i = 0; i < scopeBuf.length; i++) { const v = Math.abs(scopeBuf[i]); if (v > peak) peak = v; }
    }
    const bw = 3 * d, n = Math.ceil(w / bw);
    hist.push(peak); while (hist.length > n) hist.shift();
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ff8cc6'); gr.addColorStop(0.5, '#ff4f9a'); gr.addColorStop(1, '#ff8cc6');
    g.fillStyle = gr;
    const off = n - hist.length;
    for (let i = 0; i < hist.length; i++) {
      const a = Math.min(1, hist[i] * 1.1) * (h / 2 - 2) + 0.5 * d;
      g.fillRect((off + i) * bw, h / 2 - a, bw - d, a * 2);
    }
    $('#liveTag').style.color = peak > 0.02 ? '#ff4f9a' : '';
  }

  /* ---------- Render-Loop ---------- */
  function loop() {
    BB.Seq.poll();
    drawTouchpad(); drawScope();
    const A = BB.Audio;
    if (A.ready) {
      const now = A.now();
      $$('#parts .sbtn').forEach((b, i) => b.classList.toggle('trig', now - A.lastTrig[i] < 0.09 && now >= A.lastTrig[i]));
    }
    BB.emit('frame');
    requestAnimationFrame(loop);
  }

  BB.on('playhead', (s) => {
    UI.playhead = s;
    if (UI.mode === 'step' && s >= 0 && BB.Seq.playing && UI.follow) {
      const pg = Math.floor(s / 16); if (pg !== UI.page) UI.page = pg;
    }
    UI.renderPads();
  });
  BB.on('notes', (i) => { if (i === UI.part) UI.renderPads(); });

  /* ---------- Overlays ---------- */
  UI.open = function (id) {
    const o = $('#' + id); o.hidden = false; BB.emit('open:' + id);
  };
  UI.close = function (o) { o.hidden = true; BB.emit('close:' + o.id); };
  function bindOverlays() {
    $$('.overlay').forEach((o) => {
      o.addEventListener('pointerdown', (e) => { if (e.target === o) UI.close(o); });
      $$('[data-close]', o).forEach((b) => b.addEventListener('click', () => UI.close(o)));
    });
    $('#openPiano').addEventListener('click', () => UI.open('pianoOverlay'));
    $('#openSampler').addEventListener('click', () => UI.open('samplerOverlay'));
    $('#openMixer').addEventListener('click', () => UI.open('mixerOverlay'));
    $('#openProject').addEventListener('click', () => UI.open('projectOverlay'));
    $('#openHelp').addEventListener('click', () => UI.open('helpOverlay'));
    $('#metroBtn').addEventListener('click', () => { BB.Metro.on = !BB.Metro.on; $('#metroBtn').classList.toggle('on', BB.Metro.on); });
  }
  UI.chips = function (box, cur, onPick) {
    box.innerHTML = '';
    BB.project.parts.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === cur ? ' on' : '');
      b.style.setProperty('--c', BB.PART_COLORS[i]);
      b.textContent = `${i + 1} ${p.engine}`;
      b.addEventListener('click', () => onPick(i));
      box.appendChild(b);
    });
  };

  /* ---------- Mixer ---------- */
  function renderMixer() {
    const box = $('#mxStrips'); box.innerHTML = '';
    BB.project.parts.forEach((p, i) => {
      const s = document.createElement('div');
      s.className = 'strip'; s.style.setProperty('--c', BB.PART_COLORS[i]);
      s.innerHTML = `
        <h4>SPUR ${i + 1}</h4><div class="eng">${p.engine}</div>
        <div class="vlabel"><span>Insert-FX</span></div>
        <select class="ifxT">${BB.IFX_TYPES.map((t) => `<option ${t === p.ifxType ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <div class="vlabel"><span>FX-Menge</span><span class="vA">${Math.round(p.ifx * 100)}%</span></div>
        <input type="range" class="ifxA" min="0" max="100" value="${Math.round(p.ifx * 100)}">
        <div class="vlabel"><span>Level</span><span class="vL">${Math.round(p.level * 100)}</span></div>
        <input type="range" class="lvl" min="0" max="100" value="${Math.round(p.level * 100)}">
        <div class="vlabel"><span>Pan</span><span class="vP">${BB.formatParam('pan', p.pan)}</span></div>
        <input type="range" class="pan" min="-100" max="100" value="${Math.round(p.pan * 100)}">
        <div class="row"><button class="mbtn m ${p.mute ? 'on' : ''}">M</button><button class="mbtn s ${p.solo ? 'on' : ''}">S</button></div>`;
      const upd = () => { BB.Audio.applyPart(i); BB.save(); if (i === UI.part) { UI.refreshKnobs(); UI.lcd(); } };
      $('.ifxT', s).addEventListener('change', (e) => { p.ifxType = e.target.value; if (p.ifxType !== 'OFF' && p.ifx < 0.05) { p.ifx = 0.5; $('.ifxA', s).value = 50; $('.vA', s).textContent = '50%'; } upd(); });
      $('.ifxA', s).addEventListener('input', (e) => { p.ifx = e.target.value / 100; $('.vA', s).textContent = e.target.value + '%'; upd(); });
      $('.lvl', s).addEventListener('input', (e) => { p.level = e.target.value / 100; $('.vL', s).textContent = e.target.value; upd(); });
      $('.pan', s).addEventListener('input', (e) => { p.pan = e.target.value / 100; $('.vP', s).textContent = BB.formatParam('pan', p.pan); upd(); });
      $('.mbtn.m', s).addEventListener('click', (e) => { p.mute = !p.mute; e.target.classList.toggle('on', p.mute); UI.renderParts(); BB.save(); });
      $('.mbtn.s', s).addEventListener('click', (e) => { p.solo = !p.solo; e.target.classList.toggle('on', p.solo); BB.save(); });
      box.appendChild(s);
    });
    const P = BB.project;
    $('#mxMaster').value = Math.round(P.master * 100); $('#mxMasterV').textContent = Math.round(P.master * 100);
    $('#mxSwing').value = Math.round(P.swing * 100); $('#mxSwingV').textContent = Math.round(P.swing * 100) + '%';
    $('#mxPadFx').innerHTML = BB.PADFX_TYPES.map((t) => `<option ${t === P.padFx ? 'selected' : ''}>${t}</option>`).join('');
  }
  function bindMixer() {
    BB.on('open:mixerOverlay', renderMixer);
    $('#mxMaster').addEventListener('input', (e) => { BB.project.master = e.target.value / 100; $('#mxMasterV').textContent = e.target.value; BB.Audio.setMaster(BB.project.master); BB.save(); });
    $('#mxSwing').addEventListener('input', (e) => { BB.project.swing = e.target.value / 100; $('#mxSwingV').textContent = e.target.value + '%'; UI.lcd(); BB.save(); });
    $('#mxPadFx').addEventListener('change', (e) => UI.setPadFx(e.target.value));
  }

  /* ---------- Projekt / Pattern ---------- */
  let pjMode = 'load';
  function renderProject() {
    const box = $('#pjSlots'); box.innerHTML = '';
    for (let n = 1; n <= 16; n++) {
      const b = document.createElement('button');
      b.className = 'slot' + (BB.Store.hasSlot(n) ? ' full' : '') + (BB.project.slot === n ? ' cur' : '');
      b.textContent = BB.pad3(n);
      b.addEventListener('click', () => {
        if (pjMode === 'save') {
          BB.project.slot = n;
          BB.Store.save(BB.Store.slotKey(n), BB.project); BB.save();
          UI.toast(`Pattern ${BB.pad3(n)} gespeichert`); renderProject(); UI.lcd();
        } else {
          const d = BB.Store.load(BB.Store.slotKey(n));
          if (!d) { UI.toast('Slot ist leer'); return; }
          BB.loadProject(d); BB.project.slot = n;
          UI.toast(`Pattern ${BB.pad3(n)} geladen`); renderProject(); UI.lcd();
        }
      });
      box.appendChild(b);
    }
    $$('#pjMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === pjMode));
  }
  function bindProject() {
    BB.on('open:projectOverlay', renderProject);
    $$('#pjMode button').forEach((b) => b.addEventListener('click', () => { pjMode = b.dataset.m; renderProject(); }));
    $('#pjNew').addEventListener('click', () => { if (confirm('Alle Noten löschen und neues Pattern beginnen?')) { BB.loadProject(BB.emptyProject()); UI.toast('Neues Pattern'); } });
    $('#pjDemo').addEventListener('click', () => { BB.loadProject(BB.demoProject()); UI.toast('Demo geladen'); });
    $('#pjClearPart').addEventListener('click', () => { UI.curPart().notes = []; UI.renderPads(); BB.save(); UI.toast(`Spur ${UI.part + 1} geleert`); BB.emit('notes', UI.part); });
    $('#pjExport').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(BB.project, null, 1)], { type: 'application/json' });
      UI.download(blob, `bumbum-${BB.pad3(BB.project.slot || 1)}.json`);
    });
    $('#pjImport').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { BB.loadProject(JSON.parse(await f.text())); UI.toast('Importiert'); } catch (er) { UI.toast('Datei ungültig'); }
      e.target.value = '';
    });
  }
  UI.download = function (blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  /* ---------- Bounce (Aufnahme der Summe) ---------- */
  let rec = null, chunks = [];
  function bindBounce() {
    const btn = $('#bounceBtn');
    btn.addEventListener('click', async () => {
      const A = BB.Audio; if (!A.ready) return;
      if (rec) { rec.stop(); return; }
      if (!window.MediaRecorder) { UI.toast('Aufnahme wird von diesem Browser nicht unterstützt'); return; }
      if (!A.recDest) { A.recDest = A.ctx.createMediaStreamDestination(); A.limiter.connect(A.recDest); }
      chunks = [];
      rec = new MediaRecorder(A.recDest.stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        btn.classList.remove('on'); btn.textContent = '⏺ Bounce';
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        rec = null;
        try {
          const buf = await A.ctx.decodeAudioData(await blob.arrayBuffer());
          UI.download(BB.DSP.encodeWAV(buf), `bumbum-bounce-${Date.now()}.wav`);
        } catch (er) {
          UI.download(blob, `bumbum-bounce-${Date.now()}.${(blob.type.split('/')[1] || 'webm').split(';')[0]}`);
        }
        UI.toast('Bounce gespeichert');
      };
      rec.start();
      btn.classList.add('on'); btn.textContent = '■ Stop Bounce';
      if (!BB.Seq.playing) BB.Seq.start();
    });
  }

  /* ---------- Tastatur + MIDI ---------- */
  const KEYMAP = { y: 0, z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, l: 13, '.': 14, 'ö': 15, '-': 16 };
  function bindKeys() {
    const held = {};
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); BB.Seq.toggle(); return; }
      if (e.repeat) return;
      if (/^[1-8]$/.test(k)) { UI.selectPart(+k - 1); return; }
      if (k === 'r') { UI.toggleRec(); return; }
      if (k in KEYMAP && BB.Audio.ready) {
        const p = UI.curPart(), pitch = p.keyBase + KEYMAP[k], t = BB.Audio.now();
        UI.lastPitch[UI.part] = pitch;
        held[k] = { h: BB.Audio.playNote(UI.part, t + 0.003, pitch, 1, null), r: BB.Seq.recordNote(UI.part, pitch, 1, t), t, part: UI.part };
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase(), o = held[k];
      if (!o) return;
      o.h && o.h.release(BB.Audio.now());
      if (o.r && BB.isSynth(BB.project.parts[o.part].engine)) { o.r.l = Math.max(1, Math.round((BB.Audio.now() - o.t) / BB.Seq.sec16())); BB.save(); }
      delete held[k];
    });
  }
  function bindMidi() {
    if (!navigator.requestMIDIAccess) return;
    const held = {};
    navigator.requestMIDIAccess().then((acc) => {
      const hook = (inp) => {
        inp.onmidimessage = (ev) => {
          const [st, n, vel] = ev.data, cmd = st & 0xf0, ch = st & 0x0f;
          if (!BB.Audio.ready) return;
          const part = ch === 9 && n >= 36 && n < 44 ? n - 36 : UI.part;
          const pitch = ch === 9 ? UI.defaultPitch(part) : n;
          const key = ch + ':' + n;
          if (cmd === 0x90 && vel > 0) {
            const t = BB.Audio.now();
            held[key] = { h: BB.Audio.playNote(part, t + 0.003, pitch, vel / 127, null), r: BB.Seq.recordNote(part, pitch, vel / 127, t), t, part };
          } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
            const o = held[key]; if (!o) return;
            o.h && o.h.release(BB.Audio.now());
            if (o.r && BB.isSynth(BB.project.parts[o.part].engine)) o.r.l = Math.max(1, Math.round((BB.Audio.now() - o.t) / BB.Seq.sec16()));
            delete held[key];
          }
        };
      };
      acc.inputs.forEach(hook);
      acc.onstatechange = () => acc.inputs.forEach(hook);
    }).catch(() => {});
  }

  /* ---------- Aufbau ---------- */
  UI.build = function () {
    buildKnobs(); buildFn(); buildParts(); buildPads(); buildModes(); buildTransport(); buildTouchpad();
    bindOverlays(); bindMixer(); bindProject(); bindBounce(); bindKeys(); bindMidi();
    UI.follow = true;
    renderModes();
    UI.refreshAll();
    requestAnimationFrame(loop);
  };
  UI.refreshAll = function () {
    UI.renderFn(); UI.renderParts(); UI.refreshKnobs(); UI.renderPads(); UI.lcd();
    $('#padFxType').textContent = BB.project.padFx;
  };
})(window.BB);
