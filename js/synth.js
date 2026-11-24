'use strict';
/* BUMBUM – Bass-Synth-Modul: Klangerzeugung, Presets, Editor mit Hüllkurven */
(function (BB) {
  const $ = BB.$, $$ = BB.$$;
  const SY = BB.Synth = { part: 0, knobs: [], held: {}, oct: 0 };

  /* ---------- Umrechnungen ---------- */
  const tA = (v) => 0.001 + v * v * 4;          // Attack-Zeit
  const tD = (v) => 0.005 + v * v * 5;          // Decay/Release-Zeit
  const fCut = (v) => 20 * Math.pow(900, v);    // 20 Hz … 18 kHz
  SY.tA = tA; SY.tD = tD;
  SY.lfoHz = (L) => {
    if (!L.sync) return 0.1 * Math.pow(200, L.rate);
    const divs = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625];
    const d = divs[Math.min(divs.length - 1, Math.floor(L.rate * divs.length))];
    return BB.project.bpm / 60 / d;
  };
  SY.lfoLabel = (L) => {
    if (!L.sync) return SY.lfoHz(L).toFixed(1) + ' Hz';
    const n = ['1 Takt', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64'];
    return n[Math.min(n.length - 1, Math.floor(L.rate * n.length))];
  };

  const waveCache = new WeakMap();
  function pulseWave(ctx, pw) {
    const key = Math.round(BB.clamp(pw, 0.05, 0.95) * 50);
    let m = waveCache.get(ctx); if (!m) { m = {}; waveCache.set(ctx, m); }
    if (m[key]) return m[key];
    const n = 64, re = new Float32Array(n), im = new Float32Array(n), d = key / 50;
    for (let i = 1; i < n; i++) re[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * d);
    return (m[key] = ctx.createPeriodicWave(re, im));
  }
  const curveCache = {};
  function driveCurve(a) {
    const k = Math.round(a * 20);
    if (curveCache[k]) return curveCache[k];
    const n = 2048, c = new Float32Array(n), g = 1 + (k / 20) * 30, nm = Math.tanh(g);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * g) / nm; }
    return (curveCache[k] = c);
  }
  const TYPES = { saw: 'sawtooth', square: 'square', tri: 'triangle', sine: 'sine' };
  function mkOsc(ctx, wave, pw) {
    const o = ctx.createOscillator();
    if (wave === 'pulse') o.setPeriodicWave(pulseWave(ctx, pw)); else o.type = TYPES[wave] || 'sawtooth';
    return o;
  }

  /* Letzte Stimme pro Spur (für Mono/Glide) */
  const last = {};

  /* ---------- Stimme ---------- */
  BB.SynthVoice = function (ctx, dest, P, t, midi, vel, dur, res, partIdx) {
    const S = P.syn;
    const note = midi + P.pitch;
    const velAmt = 1 - S.vel + S.vel * vel;
    const key = partIdx != null ? partIdx + ':' + (ctx === (BB.Audio && BB.Audio.ctx) ? 'r' : 'o') : null;
    const prev = key ? last[key] : null;
    const glideT = S.glide > 0.01 ? 0.005 + S.glide * S.glide * 0.6 : 0;
    // Mono: vorherige Stimme abschneiden
    if (S.mono && prev && prev.end > t) {
      prev.gate.gain.setTargetAtTime(0, t, 0.004);
      prev.stop(t + 0.05);
    }
    const startNote = glideT && prev && prev.end > t - 0.05 ? prev.note : note;

    const srcs = [];
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    const pitchTargets = [];
    const addOsc = (o, semis, cents, level) => {
      const f0 = BB.mtof(startNote + semis), f1 = BB.mtof(note + semis);
      o.frequency.setValueAtTime(f0, t);
      if (f0 !== f1) o.frequency.exponentialRampToValueAtTime(f1, t + glideT);
      o.detune.value = cents;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g); g.connect(mix); srcs.push(o); pitchTargets.push(o.detune);
    };
    const uni = Math.max(1, Math.round(S.unison));
    [S.o1, S.o2].forEach((O) => {
      if (O.level < 0.01) return;
      const semis = O.oct * 12 + O.semi;
      for (let k = 0; k < uni; k++) {
        const spread = uni > 1 ? (k / (uni - 1) - 0.5) * 2 * S.detune * 40 : 0;
        addOsc(mkOsc(ctx, O.wave, O.pw), semis, O.fine + spread, (O.level / Math.sqrt(uni)) * 0.9);
      }
    });
    if (S.sub.level > 0.01) addOsc(mkOsc(ctx, S.sub.wave, 0.5), S.o1.oct * 12 - 12, 0, S.sub.level * 0.9);
    if (S.noise > 0.01) {
      const n = ctx.createBufferSource(); n.buffer = res.noise; n.loop = true;
      const g = ctx.createGain(); g.gain.value = S.noise * 0.6; n.connect(g); g.connect(mix); srcs.push(n);
    }

    // Filter
    const F = S.flt;
    const stages = F.slope === 24 ? 2 : 1;
    const filters = [];
    let node = mix;
    const kt = Math.pow(2, ((note - 60) / 12) * F.key);
    const base = BB.clamp(fCut(F.cutoff) * kt, 20, 20000);
    const peak = BB.clamp(base * Math.pow(2, F.env * 8), 20, 20000);
    const fe = S.fenv;
    const fa = tA(fe.a), fd = tD(fe.d), fr = tD(fe.r);
    const sus = base + (peak - base) * fe.s;
    for (let i = 0; i < stages; i++) {
      const f = ctx.createBiquadFilter(); f.type = F.type;
      f.Q.value = F.type === 'lowpass' || F.type === 'highpass' ? 0.5 + F.reso * F.reso * (stages === 2 ? 14 : 24) : 0.7 + F.reso * 10;
      f.frequency.setValueAtTime(base, t);
      f.frequency.linearRampToValueAtTime(peak, t + fa);
      f.frequency.setTargetAtTime(sus, t + fa, fd / 3);
      node.connect(f); node = f; filters.push(f);
    }
    // Drive
    if (F.drive > 0.02) {
      const w = ctx.createWaveShaper(); w.curve = driveCurve(F.drive); w.oversample = '2x';
      const comp = ctx.createGain(); comp.gain.value = 1 - F.drive * 0.35;
      node.connect(w); w.connect(comp); node = comp;
    }
    // Amp-Hüllkurve (A-D-S) + Gate (R)
    const ae = S.aenv;
    const aa = tA(ae.a), ad = tD(ae.d), ar = tD(ae.r);
    const amp = ctx.createGain();
    const pk = velAmt * 0.9;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(pk, t + aa);
    amp.gain.setTargetAtTime(pk * ae.s, t + aa, ad / 3);
    const gate = ctx.createGain(); gate.gain.value = 1;
    node.connect(amp); amp.connect(gate);

    // LFO
    let lfo = null;
    const L = S.lfo;
    if (L.depth > 0.01) {
      lfo = ctx.createOscillator(); lfo.type = TYPES[L.wave] || 'sine';
      lfo.frequency.value = SY.lfoHz(L);
      const lg = ctx.createGain();
      lfo.connect(lg);
      if (L.target === 'pitch') { lg.gain.value = L.depth * L.depth * 1200; pitchTargets.forEach((p) => lg.connect(p)); }
      else if (L.target === 'amp') {
        const trem = ctx.createGain(); trem.gain.value = 1 - L.depth * 0.5; lg.gain.value = L.depth * 0.5;
        lg.connect(trem.gain); amp.disconnect(); amp.connect(trem); trem.connect(gate);
      } else { lg.gain.value = L.depth * 3600; filters.forEach((f) => lg.connect(f.detune)); }
      srcs.push(lfo);
    }
    gate.connect(dest);
    srcs.forEach((s) => s.start(t));

    const voice = {
      note, gate, end: Infinity,
      stop(te) { srcs.forEach((s) => { try { s.stop(te); } catch (e) { /* */ } }); },
      release(tr) {
        tr = Math.max(tr || ctx.currentTime, t + 0.003);
        gate.gain.setTargetAtTime(0, tr, ar / 4);
        filters.forEach((f) => f.frequency.setTargetAtTime(base, tr, fr / 3));
        voice.end = tr + ar * 1.2;
        voice.stop(tr + ar * 1.6 + 0.05);
      },
    };
    if (key) last[key] = voice;
    if (dur != null) voice.release(t + Math.max(dur, 0.01));
    return voice;
  };

  /* ---------- Presets ---------- */
  const S = (o) => BB.mergeSyn(o);
  SY.PRESETS = [
    ['Init', S({})],
    ['Tekk Rolling', S({ o1: { wave: 'saw', level: 0.8 }, o2: { wave: 'saw', oct: 0, fine: 9, level: 0.6 }, sub: { level: 0.5 }, flt: { cutoff: 0.3, reso: 0.55, env: 0.55, drive: 0.35, slope: 24 }, fenv: { a: 0, d: 0.28, s: 0.05, r: 0.1 }, aenv: { a: 0, d: 0.35, s: 0.2, r: 0.08 } })],
    ['Acid Squelch', S({ o1: { wave: 'saw', level: 0.9 }, o2: { level: 0 }, sub: { level: 0 }, flt: { cutoff: 0.22, reso: 0.85, env: 0.75, drive: 0.4, slope: 12 }, fenv: { a: 0, d: 0.3, s: 0, r: 0.1 }, aenv: { a: 0, d: 0.5, s: 0.6, r: 0.06 }, glide: 0.3 })],
    ['Reese Wide', S({ o1: { wave: 'saw' }, o2: { wave: 'saw', oct: 0, fine: 18, level: 0.8 }, unison: 3, detune: 0.45, sub: { level: 0.45 }, flt: { cutoff: 0.32, reso: 0.25, env: 0.1 }, aenv: { a: 0.05, d: 0.6, s: 0.9, r: 0.3 }, lfo: { target: 'cutoff', rate: 0.15, depth: 0.25 } })],
    ['Sub 808', S({ o1: { wave: 'sine', level: 0.9 }, o2: { wave: 'tri', oct: 1, level: 0.15 }, sub: { level: 0 }, flt: { cutoff: 0.6, reso: 0, env: 0, drive: 0.25 }, aenv: { a: 0, d: 0.75, s: 0.4, r: 0.4 }, glide: 0.25 })],
    ['Moog Fat', S({ o1: { wave: 'saw' }, o2: { wave: 'saw', oct: -1, fine: 4, level: 0.7 }, sub: { wave: 'square', level: 0.3 }, flt: { cutoff: 0.28, reso: 0.4, env: 0.5, slope: 24, drive: 0.2 }, fenv: { a: 0.02, d: 0.4, s: 0.2, r: 0.2 }, aenv: { a: 0.01, d: 0.5, s: 0.8, r: 0.15 } })],
    ['Hoover', S({ o1: { wave: 'pulse', pw: 0.3 }, o2: { wave: 'saw', oct: -1, level: 0.6 }, unison: 5, detune: 0.6, flt: { cutoff: 0.55, reso: 0.2, env: 0.2 }, aenv: { a: 0.02, d: 0.6, s: 0.85, r: 0.3 }, lfo: { target: 'pitch', rate: 0.35, depth: 0.12 }, glide: 0.35 })],
    ['Wobble 1/8', S({ o1: { wave: 'saw' }, o2: { wave: 'square', oct: -1, level: 0.6 }, sub: { level: 0.5 }, flt: { cutoff: 0.25, reso: 0.6, env: 0, drive: 0.4 }, aenv: { a: 0.01, d: 0.5, s: 1, r: 0.15 }, lfo: { target: 'cutoff', wave: 'sine', sync: true, rate: 0.5, depth: 0.7 } })],
    ['Gabber Bass', S({ o1: { wave: 'square' }, o2: { wave: 'saw', oct: 0, fine: 12 }, sub: { level: 0.6 }, flt: { cutoff: 0.45, reso: 0.5, env: 0.4, drive: 0.95 }, fenv: { d: 0.2, s: 0.1 }, aenv: { a: 0, d: 0.3, s: 0.3, r: 0.1 } })],
    ['Pluck Bass', S({ o1: { wave: 'tri' }, o2: { wave: 'saw', level: 0.3 }, sub: { level: 0.3 }, flt: { cutoff: 0.2, reso: 0.3, env: 0.7 }, fenv: { a: 0, d: 0.22, s: 0, r: 0.1 }, aenv: { a: 0, d: 0.32, s: 0, r: 0.1 } })],
    ['Funky Pulse', S({ o1: { wave: 'pulse', pw: 0.22 }, o2: { level: 0 }, sub: { level: 0.4 }, flt: { cutoff: 0.3, reso: 0.5, env: 0.55, slope: 12 }, fenv: { d: 0.25, s: 0.1 }, aenv: { a: 0, d: 0.4, s: 0.5, r: 0.08 } })],
    ['Square Sub', S({ o1: { wave: 'square', oct: -1 }, o2: { level: 0 }, sub: { level: 0.6 }, flt: { cutoff: 0.25, reso: 0.1, env: 0.15 }, aenv: { a: 0.01, d: 0.5, s: 0.9, r: 0.15 } })],
    ['Electro Zap', S({ o1: { wave: 'square' }, o2: { wave: 'saw', oct: 1, level: 0.3 }, flt: { cutoff: 0.15, reso: 0.7, env: 0.9, slope: 12 }, fenv: { a: 0, d: 0.12, s: 0, r: 0.05 }, aenv: { a: 0, d: 0.25, s: 0.2, r: 0.05 } })],
    ['Dark Drone', S({ o1: { wave: 'saw' }, o2: { wave: 'saw', oct: -1, fine: -14, level: 0.8 }, noise: 0.12, unison: 3, detune: 0.3, flt: { cutoff: 0.2, reso: 0.45, env: 0.15 }, aenv: { a: 0.45, d: 0.8, s: 1, r: 0.6 }, lfo: { target: 'cutoff', rate: 0.1, depth: 0.35, wave: 'tri' } })],
    ['Trance Lead', S({ o1: { wave: 'saw', oct: 1 }, o2: { wave: 'saw', oct: 1, fine: 12, level: 0.7 }, sub: { level: 0 }, unison: 7, detune: 0.5, flt: { cutoff: 0.6, reso: 0.2, env: 0.25 }, aenv: { a: 0.01, d: 0.6, s: 0.8, r: 0.35 }, mono: false })],
    ['Soft Pad', S({ o1: { wave: 'tri', oct: 1 }, o2: { wave: 'saw', oct: 1, fine: 10, level: 0.4 }, sub: { level: 0 }, unison: 3, detune: 0.35, flt: { cutoff: 0.45, reso: 0.1, env: 0.2 }, fenv: { a: 0.6, d: 0.7, s: 0.5, r: 0.6 }, aenv: { a: 0.6, d: 0.8, s: 0.9, r: 0.7 }, mono: false })],
  ];
  SY.presetByName = {};
  SY.PRESETS.forEach(([n, s]) => { SY.presetByName[n] = s; });

  SY.applyPreset = function (i, syn, name) {
    const p = BB.project.parts[i];
    p.syn = BB.mergeSyn(JSON.parse(JSON.stringify(syn)));
    if (p.engine !== 'SYNTH') { p.engine = 'SYNTH'; p.keyBase = 36; }
    p.pitch = 0;
    if (name) p.synName = name;
    BB.Audio.applyPart(i);
  };

  SY.random = function () {
    const r = Math.random, pick = (a) => a[Math.floor(r() * a.length)];
    const W = ['saw', 'square', 'pulse', 'tri', 'sine'];
    return BB.mergeSyn({
      o1: { wave: pick(W), oct: pick([-1, 0, 0]), level: 0.7 + r() * 0.3, pw: 0.15 + r() * 0.7 },
      o2: { wave: pick(W), oct: pick([-1, 0, 1]), fine: Math.round((r() - 0.5) * 30), level: r() * 0.8, pw: 0.15 + r() * 0.7 },
      sub: { wave: pick(['sine', 'square', 'tri']), level: r() * 0.6 }, noise: r() < 0.2 ? r() * 0.2 : 0,
      unison: pick([1, 1, 2, 3, 5]), detune: r() * 0.6,
      flt: { type: pick(['lowpass', 'lowpass', 'lowpass', 'bandpass']), slope: pick([12, 24]), cutoff: 0.15 + r() * 0.45, reso: r() * 0.8, env: r() * 0.8, key: 0.3, drive: r() * 0.6 },
      fenv: { a: r() * 0.2, d: 0.1 + r() * 0.5, s: r() * 0.5, r: r() * 0.4 },
      aenv: { a: r() * 0.1, d: 0.2 + r() * 0.6, s: r(), r: 0.05 + r() * 0.3 },
      lfo: { wave: pick(['sine', 'tri', 'square', 'saw']), target: pick(['cutoff', 'pitch', 'amp']), sync: r() < 0.6, rate: r(), depth: r() < 0.4 ? r() * 0.6 : 0 },
      glide: r() < 0.3 ? r() * 0.4 : 0,
    });
  };

  /* ---------- Editor ---------- */
  const P = () => BB.project.parts[SY.part];
  const syn = () => P().syn;
  function changed() { BB.save(); if (SY.part === BB.UI.part) { BB.UI.refreshKnobs(); BB.UI.lcd(); } drawEnvs(); }

  function open() {
    SY.part = BB.UI.part;
    if (P().engine !== 'SYNTH') {
      const sameSynth = BB.project.parts.findIndex((p) => p.engine === 'SYNTH');
      if (sameSynth >= 0 && !BB.isSynth(P().engine)) SY.part = sameSynth;
    }
    render();
  }

  function seg(box, opts, cur, onPick) {
    box.innerHTML = '';
    opts.forEach(([v, l]) => {
      const b = document.createElement('button');
      b.textContent = l; b.className = String(v) === String(cur) ? 'on' : '';
      b.addEventListener('click', () => { onPick(v); $$('button', box).forEach((x) => x.classList.toggle('on', x === b)); });
      box.appendChild(b);
    });
  }

  function knob(box, label, get, set, o) {
    const k = new BB.UI.Knob(box, Object.assign({
      label, def: get(),
      onChange: (v) => { set(v); valEl.textContent = fmt(v); changed(); },
      onEnd: (moved) => { if (moved) SY.audition(); },
    }, o));
    k.wrap.classList.add('mini');
    const fmt = (o && o.fmt) || ((v) => Math.round(v * 100));
    const valEl = document.createElement('span'); valEl.className = 'kval';
    k.wrap.appendChild(valEl);
    k.set(get()); valEl.textContent = fmt(get());
    SY.knobs.push(k);
    return k;
  }

  const WAVES = [['saw', 'SAW'], ['square', 'SQR'], ['pulse', 'PLS'], ['tri', 'TRI'], ['sine', 'SIN']];
  const secF = (t) => (t < 1 ? Math.round(t * 1000) + 'ms' : t.toFixed(2) + 's');

  function render() {
    SY.knobs = [];
    BB.UI.chips($('#syParts'), SY.part, (i) => { SY.part = i; render(); });
    const p = P();
    const box = $('#syBody');
    const isSyn = p.engine === 'SYNTH';
    $('#syConvert').hidden = isSyn;
    $('#syConvert').textContent = `Spur ${SY.part + 1} (${p.engine}) in BASS SYNTH umwandeln`;
    box.classList.toggle('disabled', !isSyn);
    const s = p.syn;
    // Presets
    const pr = $('#syPresets'); pr.innerHTML = '';
    SY.PRESETS.forEach(([n, ps]) => {
      const b = document.createElement('button'); b.className = 'chip' + (p.synName === n ? ' on' : ''); b.textContent = n;
      b.style.setProperty('--c', BB.PART_COLORS[SY.part]);
      b.addEventListener('click', () => { SY.applyPreset(SY.part, ps, n); BB.UI.refreshAll(); render(); SY.audition(); });
      pr.appendChild(b);
    });
    const rnd = document.createElement('button'); rnd.className = 'chip'; rnd.textContent = '🎲 Zufall';
    rnd.addEventListener('click', () => { SY.applyPreset(SY.part, SY.random(), 'Zufall'); BB.UI.refreshAll(); render(); SY.audition(); });
    pr.appendChild(rnd);

    // OSC 1 / OSC 2
    [['o1', '#syO1'], ['o2', '#syO2']].forEach(([k, sel]) => {
      const el = $(sel); const O = s[k];
      seg($('.sy-wave', el), WAVES, O.wave, (v) => { O.wave = v; changed(); SY.audition(); });
      const kb = $('.sy-knobs', el); kb.innerHTML = '';
      knob(kb, 'OCT', () => O.oct, (v) => { O.oct = v; }, { min: -3, max: 2, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v });
      knob(kb, 'SEMI', () => O.semi, (v) => { O.semi = v; }, { min: -12, max: 12, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v });
      knob(kb, 'FINE', () => O.fine, (v) => { O.fine = v; }, { min: -50, max: 50, step: 1, def: 0, fmt: (v) => v + 'ct' });
      knob(kb, 'PW', () => O.pw, (v) => { O.pw = v; }, { min: 0.05, max: 0.95, def: 0.5 });
      knob(kb, 'LEVEL', () => O.level, (v) => { O.level = v; }, { def: 0.7 });
    });
    // SUB / NOISE / UNISON
    { const el = $('#sySub');
      seg($('.sy-wave', el), [['sine', 'SIN'], ['square', 'SQR'], ['tri', 'TRI']], s.sub.wave, (v) => { s.sub.wave = v; changed(); SY.audition(); });
      const kb = $('.sy-knobs', el); kb.innerHTML = '';
      knob(kb, 'SUB', () => s.sub.level, (v) => { s.sub.level = v; }, { def: 0.3 });
      knob(kb, 'NOISE', () => s.noise, (v) => { s.noise = v; }, { def: 0 });
      knob(kb, 'UNISON', () => s.unison, (v) => { s.unison = v; }, { min: 1, max: 7, step: 1, def: 1, fmt: (v) => v + 'x' });
      knob(kb, 'DETUNE', () => s.detune, (v) => { s.detune = v; }, { def: 0.25 }); }
    // FILTER
    { const el = $('#syFlt'); const F = s.flt;
      seg($('.sy-wave', el), [['lowpass', 'LP'], ['highpass', 'HP'], ['bandpass', 'BP']], F.type, (v) => { F.type = v; changed(); SY.audition(); });
      seg($('.sy-slope', el), [[12, '12dB'], [24, '24dB']], F.slope, (v) => { F.slope = v; changed(); SY.audition(); });
      const kb = $('.sy-knobs', el); kb.innerHTML = '';
      knob(kb, 'CUTOFF', () => F.cutoff, (v) => { F.cutoff = v; }, { def: 0.35, fmt: (v) => { const f = fCut(v); return f < 1000 ? Math.round(f) + 'Hz' : (f / 1000).toFixed(1) + 'k'; } });
      knob(kb, 'RESO', () => F.reso, (v) => { F.reso = v; }, { def: 0.3 });
      knob(kb, 'ENV', () => F.env, (v) => { F.env = v; }, { min: -1, max: 1, def: 0.4 });
      knob(kb, 'KEY', () => F.key, (v) => { F.key = v; }, { def: 0.3 });
      knob(kb, 'DRIVE', () => F.drive, (v) => { F.drive = v; }, { def: 0.15 }); }
    // ENVs
    [['fenv', '#syFenv'], ['aenv', '#syAenv']].forEach(([k, sel]) => {
      const el = $(sel), E = s[k], kb = $('.sy-knobs', el); kb.innerHTML = '';
      knob(kb, 'A', () => E.a, (v) => { E.a = v; }, { def: 0.02, fmt: (v) => secF(tA(v)) });
      knob(kb, 'D', () => E.d, (v) => { E.d = v; }, { def: 0.4, fmt: (v) => secF(tD(v)) });
      knob(kb, 'S', () => E.s, (v) => { E.s = v; }, { def: 0.5 });
      knob(kb, 'R', () => E.r, (v) => { E.r = v; }, { def: 0.2, fmt: (v) => secF(tD(v)) });
      if (k === 'aenv') knob(kb, 'VEL', () => s.vel, (v) => { s.vel = v; }, { def: 0.5 });
    });
    // LFO
    { const el = $('#syLfo'); const L = s.lfo;
      seg($('.sy-wave', el), [['sine', 'SIN'], ['tri', 'TRI'], ['square', 'SQR'], ['saw', 'SAW']], L.wave, (v) => { L.wave = v; changed(); });
      seg($('.sy-slope', el), [['cutoff', 'FILTER'], ['pitch', 'PITCH'], ['amp', 'AMP']], L.target, (v) => { L.target = v; changed(); SY.audition(); });
      const kb = $('.sy-knobs', el); kb.innerHTML = '';
      const rk = knob(kb, 'RATE', () => L.rate, (v) => { L.rate = v; }, { def: 0.4, fmt: () => SY.lfoLabel(L) });
      knob(kb, 'DEPTH', () => L.depth, (v) => { L.depth = v; }, { def: 0 });
      const sb = document.createElement('button'); sb.className = 'pbtn sy-sync' + (L.sync ? ' on' : ''); sb.textContent = 'SYNC';
      sb.addEventListener('click', () => { L.sync = !L.sync; sb.classList.toggle('on', L.sync); rk.wrap.querySelector('.kval').textContent = SY.lfoLabel(L); changed(); });
      kb.appendChild(sb); }
    // VOICE
    { const el = $('#syVoice'); const kb = $('.sy-knobs', el); kb.innerHTML = '';
      knob(kb, 'GLIDE', () => s.glide, (v) => { s.glide = v; }, { def: 0, fmt: (v) => (v < 0.01 ? 'AUS' : secF(0.005 + v * v * 0.6)) });
      knob(kb, 'PITCH', () => p.pitch, (v) => { p.pitch = v; }, { min: -24, max: 24, step: 1, def: 0, fmt: (v) => (v > 0 ? '+' : '') + v });
      knob(kb, 'LEVEL', () => p.level, (v) => { p.level = v; BB.Audio.applyPart(SY.part); }, { def: 0.8 });
      seg($('.sy-wave', el), [[true, 'MONO'], [false, 'POLY']], s.mono, (v) => { s.mono = v; changed(); }); }
    renderKeys();
    requestAnimationFrame(drawEnvs);
  }

  /* Hüllkurven-Grafik (ziehbar) */
  function envGeom(E, w, h) {
    const pad = 10, total = 3.2;
    const sc = (w - pad * 2) / total;
    const a = Math.min(1, tA(E.a)), d = Math.min(1.2, tD(E.d)), r = Math.min(1, tD(E.r));
    const x0 = pad, x1 = x0 + a * sc, x2 = x1 + d * sc, x3 = Math.max(x2 + 20, w - pad - r * sc), x4 = x3 + r * sc;
    const yTop = pad, yBot = h - pad, yS = yBot - (yBot - yTop) * E.s;
    return { x0, x1, x2, x3, x4, yTop, yBot, yS, sc };
  }
  function drawEnv(c, E, col) {
    const [w0, h0, d] = BB.UI.sizeCanvas(c), g = c.getContext('2d');
    const w = w0 / d, h = h0 / d;
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,79,154,0.08)'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo((i * w) / 6, 0); g.lineTo((i * w) / 6, h); g.stroke(); }
    const G = envGeom(E, w, h);
    g.beginPath(); g.moveTo(G.x0, G.yBot); g.lineTo(G.x1, G.yTop);
    // Decay-Kurve (exponentiell)
    for (let i = 1; i <= 20; i++) { const x = G.x1 + ((G.x2 - G.x1) * i) / 20; const k = Math.exp((-3 * i) / 20); g.lineTo(x, G.yS - (G.yS - G.yTop) * ((k - Math.exp(-3)) / (1 - Math.exp(-3)))); }
    g.lineTo(G.x3, G.yS);
    for (let i = 1; i <= 20; i++) { const x = G.x3 + ((G.x4 - G.x3) * i) / 20; const k = Math.exp((-4 * i) / 20); g.lineTo(x, G.yBot - (G.yBot - G.yS) * ((k - Math.exp(-4)) / (1 - Math.exp(-4)))); }
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, col + '88'); grd.addColorStop(1, col + '00');
    g.lineTo(G.x4, G.yBot); g.closePath(); g.fillStyle = grd; g.fill();
    g.strokeStyle = col; g.lineWidth = 2.5; g.lineJoin = 'round'; g.stroke();
    [[G.x1, G.yTop, 'A'], [G.x2, G.yS, 'D/S'], [G.x4, G.yBot, 'R']].forEach(([x, y, l]) => {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c98aa8'; g.font = '10px Inter, sans-serif'; g.fillText(l, Math.min(w - 24, x + 8), Math.max(12, y - 6));
    });
  }
  function drawEnvs() {
    if ($('#synthOverlay').hidden) return;
    const s = syn();
    drawEnv($('#syFenvC'), s.fenv, '#ffb347');
    drawEnv($('#syAenvC'), s.aenv, '#ff4f9a');
  }
  function bindEnv(c, which) {
    let grab = null;
    const inv = { a: (t) => Math.sqrt(BB.clamp((t - 0.001) / 4, 0, 1)), d: (t) => Math.sqrt(BB.clamp((t - 0.005) / 5, 0, 1)) };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const G = envGeom(syn()[which], r.width, r.height);
      const pts = [['a', G.x1, G.yTop], ['ds', G.x2, G.yS], ['r', G.x4, G.yBot]];
      let best = null, bd = 1e9;
      pts.forEach(([k, px, py]) => { const dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = k; } });
      grab = best;
    });
    c.addEventListener('pointermove', (e) => {
      if (!grab) return;
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const E = syn()[which], G = envGeom(E, r.width, r.height);
      if (grab === 'a') E.a = inv.a(Math.max(0, (x - G.x0) / G.sc));
      if (grab === 'ds') { E.d = inv.d(Math.max(0.005, (x - G.x1) / G.sc)); E.s = BB.clamp((G.yBot - y) / (G.yBot - G.yTop), 0, 1); }
      if (grab === 'r') E.r = inv.d(Math.max(0.005, (x - G.x3) / G.sc));
      changed(); syncKnobs();
    });
    const up = () => { if (grab) { grab = null; SY.audition(); } };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }
  function syncKnobs() {
    // Hüllkurven-Knöpfe nachziehen (ohne Neuaufbau)
    const s = syn();
    [['#syFenv', s.fenv], ['#syAenv', s.aenv]].forEach(([sel, E]) => {
      const ks = SY.knobs.filter((k) => $(sel).contains(k.wrap));
      const vals = [E.a, E.d, E.s, E.r];
      const fm = [(v) => secF(tA(v)), (v) => secF(tD(v)), (v) => Math.round(v * 100), (v) => secF(tD(v))];
      ks.slice(0, 4).forEach((k, i) => { k.set(vals[i]); k.wrap.querySelector('.kval').textContent = fm[i](vals[i]); });
    });
  }

  /* Mini-Keyboard */
  function renderKeys() {
    const box = $('#syKeys'); box.innerHTML = '';
    const base = P().keyBase + SY.oct * 12;
    for (let i = 0; i < 25; i++) {
      const m = base + i, b = document.createElement('button');
      b.className = 'sy-key' + (BB.isBlack(m) ? ' blk' : '');
      if (m % 12 === 0) b.textContent = BB.noteName(m);
      let h = null;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('dn');
        if (!BB.Audio.ready) return;
        h = BB.Audio.playNote(SY.part, BB.Audio.now() + 0.003, m, 0.95, null);
        BB.Seq.recordNote(SY.part, m, 0.95, BB.Audio.now());
        BB.UI.lastPitch[SY.part] = m;
      });
      const up = () => { b.classList.remove('dn'); if (h) { h.release(BB.Audio.now()); h = null; } };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      box.appendChild(b);
    }
    $('#syOctL').textContent = BB.noteName(base);
  }

  SY.audition = function () {
    if (!BB.Audio.ready || BB.Seq.playing) return;
    const m = BB.UI.lastPitch[SY.part] != null ? BB.UI.lastPitch[SY.part] : P().keyBase;
    BB.Audio.playNote(SY.part, BB.Audio.now() + 0.005, m, 0.95, 0.35);
  };

  SY.init = function () {
    BB.on('open:synthOverlay', open);
    bindEnv($('#syFenvC'), 'fenv'); bindEnv($('#syAenvC'), 'aenv');
    $('#syConvert').addEventListener('click', () => {
      const p = P(); p.engine = 'SYNTH'; p.keyBase = 36;
      if (!p.synName) p.synName = 'Init';
      BB.Audio.applyPart(SY.part); BB.UI.refreshAll(); render(); BB.save(); SY.audition();
    });
    $('#syOctDown').addEventListener('click', () => { SY.oct = Math.max(-3, SY.oct - 1); renderKeys(); });
    $('#syOctUp').addEventListener('click', () => { SY.oct = Math.min(3, SY.oct + 1); renderKeys(); });
    $('#syPlay').addEventListener('click', () => BB.Seq.toggle());
    window.addEventListener('resize', drawEnvs);
    BB.on('part', () => { if (!$('#synthOverlay').hidden) { SY.part = BB.UI.part; render(); } });
  };
})(window.BB);
