'use strict';
/* BUMBUM – Sound-Library: Kits, Presets, gerenderte Samples und Loops */
(function (BB) {
  const $ = BB.$, $$ = BB.$$;
  const L = BB.Library = { cat: 'KITS', sel: null, part: 0, cache: {} };
  const fx = (t, a) => ({ ifxType: t, ifx: a });
  const P = (engine, o, f) => Object.assign({ engine }, o || {}, f || {});

  /* ---------- Presets (Synth-Parameter, mit Reglern editierbar) ---------- */
  const PRESETS = {
    KICKS: [
      ['Tekk Kick', P('KICK', { pitch: 2, decay: 0.35, cutoff: 0.85, level: 0.95 }, fx('DRIVE', 0.65))],
      ['Hardcore Kick', P('KICK', { pitch: 0, decay: 0.55, cutoff: 0.7, level: 0.95 }, fx('DRIVE', 0.9))],
      ['909 Punch', P('KICK', { pitch: 1, decay: 0.45, level: 0.95 }, fx('COMP', 0.5))],
      ['808 Boom', P('KICK', { pitch: -5, decay: 0.95, level: 0.95 })],
      ['Deep Kick', P('KICK', { pitch: -3, decay: 0.6, cutoff: 0.5, level: 0.95 })],
      ['Short Click', P('KICK', { pitch: 5, decay: 0.15, level: 0.9 })],
      ['Rumble Kick', P('KICK', { pitch: -2, decay: 0.7, cutoff: 0.45, level: 0.95 }, fx('REVERB', 0.35))],
      ['Lo-Fi Kick', P('KICK', { pitch: -1, decay: 0.4, cutoff: 0.6, level: 0.95 }, fx('CRUSH', 0.45))],
    ],
    SNARES: [
      ['Tight Snare', P('SNARE', { pitch: 3, decay: 0.25, level: 0.75 })],
      ['Fat Snare', P('SNARE', { pitch: -3, decay: 0.6, level: 0.75 }, fx('COMP', 0.5))],
      ['Reverb Snare', P('SNARE', { decay: 0.45, level: 0.7 }, fx('REVERB', 0.5))],
      ['Crushed Snare', P('SNARE', { decay: 0.4, level: 0.7 }, fx('CRUSH', 0.5))],
      ['Piccolo', P('SNARE', { pitch: 8, decay: 0.2, level: 0.7 })],
      ['Break Snare', P('SNARE', { pitch: 1, decay: 0.5, level: 0.75 }, fx('DRIVE', 0.4))],
      ['Rimshot', P('RIM', { decay: 0.3, level: 0.7 })],
    ],
    CLAPS: [
      ['Classic Clap', P('CLAP', { level: 0.75 })],
      ['Big Clap', P('CLAP', { decay: 0.7, level: 0.7 }, fx('REVERB', 0.4))],
      ['Tight Clap', P('CLAP', { pitch: 3, decay: 0.2, level: 0.75 })],
      ['Low Clap', P('CLAP', { pitch: -4, decay: 0.45, level: 0.75 })],
      ['Clap Delay', P('CLAP', { decay: 0.3, level: 0.7 }, fx('DELAY', 0.4))],
    ],
    HATS: [
      ['Closed Hat', P('HH CL', { decay: 0.25, level: 0.5 })],
      ['Tick Hat', P('HH CL', { pitch: 4, decay: 0.08, level: 0.5 })],
      ['Open Hat', P('HH OP', { decay: 0.35, level: 0.45 })],
      ['Long Open', P('HH OP', { decay: 0.8, level: 0.4 })],
      ['Shaker', P('HH CL', { pitch: -6, decay: 0.25, attack: 0.12, level: 0.45 })],
      ['Crash', P('HH OP', { pitch: -10, decay: 1, level: 0.4 }, fx('REVERB', 0.3))],
      ['Ride', P('HH OP', { pitch: 6, decay: 0.7, cutoff: 0.9, level: 0.35 })],
    ],
    PERC: [
      ['Tom High', P('TOM', { pitch: 5, decay: 0.35 })],
      ['Tom Low', P('TOM', { pitch: -5, decay: 0.5 })],
      ['Conga', P('TOM', { pitch: 10, decay: 0.2 })],
      ['Cowbell', P('SQUARE', { cutoff: 0.7, reso: 0.3, decay: 0.22, keyBase: 72, level: 0.5 })],
      ['Blip', P('SINE', { pitch: 24, decay: 0.1, keyBase: 60, level: 0.6 })],
      ['Wood Block', P('RIM', { pitch: -7, decay: 0.2 })],
      ['Noise Hit', P('NOISE', { decay: 0.25, cutoff: 0.8, level: 0.5 }, fx('REVERB', 0.5))],
    ],
    BASS: [
      ['Tekk Bass', P('SAW', { cutoff: 0.35, reso: 0.6, egInt: 0.5, decay: 0.2, keyBase: 36, level: 0.7 }, fx('DRIVE', 0.3))],
      ['Acid 303', P('SAW', { cutoff: 0.25, reso: 0.85, egInt: 0.7, decay: 0.3, keyBase: 36, level: 0.65 }, fx('DRIVE', 0.25))],
      ['Sub Bass', P('SINE', { decay: 1, cutoff: 0.4, keyBase: 36, level: 0.85 })],
      ['Reese', P('SUPERSAW', { cutoff: 0.3, reso: 0.2, decay: 1, keyBase: 36, level: 0.6 })],
      ['Square Bass', P('SQUARE', { cutoff: 0.3, reso: 0.4, egInt: 0.4, decay: 0.3, keyBase: 36, level: 0.65 })],
      ['FM Bass', P('FM', { cutoff: 0.6, decay: 0.3, keyBase: 36, level: 0.7 })],
      ['Wobble', P('SAW', { cutoff: 0.5, decay: 1, keyBase: 36, level: 0.65 }, fx('WAH', 0.8))],
      ['Pluck Bass', P('TRI', { decay: 0.2, cutoff: 0.5, egInt: 0.5, keyBase: 36, level: 0.75 })],
    ],
    LEADS: [
      ['Supersaw Lead', P('SUPERSAW', { cutoff: 0.75, decay: 0.6, keyBase: 60, level: 0.45 }, fx('DELAY', 0.3))],
      ['Rave Stab', P('SUPERSAW', { cutoff: 0.6, egInt: 0.5, decay: 0.25, keyBase: 60, level: 0.5 }, fx('REVERB', 0.3))],
      ['Square Lead', P('SQUARE', { cutoff: 0.7, decay: 0.7, keyBase: 60, level: 0.45 }, fx('DELAY', 0.3))],
      ['Sine Lead', P('SINE', { decay: 0.8, keyBase: 72, level: 0.55 }, fx('CHORUS', 0.5))],
      ['FM Bell', P('FM', { decay: 0.6, pitch: 12, keyBase: 60, level: 0.5 }, fx('REVERB', 0.4))],
      ['Acid Lead', P('SAW', { cutoff: 0.3, reso: 0.8, egInt: 0.8, decay: 0.25, keyBase: 60, level: 0.5 }, fx('DELAY', 0.35))],
      ['Chip Lead', P('SQUARE', { decay: 0.5, keyBase: 72, level: 0.4 }, fx('CRUSH', 0.5))],
    ],
    CHORDS: [
      ['Minor Stab', P('CHORD', { cutoff: 0.6, egInt: 0.4, decay: 0.3, keyBase: 48, level: 0.45 }, fx('REVERB', 0.4))],
      ['Dub Chord', P('CHORD', { cutoff: 0.45, decay: 0.3, keyBase: 48, level: 0.45 }, fx('DELAY', 0.6))],
      ['House Organ', P('CHORD', { cutoff: 0.7, decay: 0.5, keyBase: 48, level: 0.4 }, fx('COMP', 0.4))],
      ['Lofi Keys', P('CHORD', { cutoff: 0.4, decay: 0.5, keyBase: 48, level: 0.45 }, fx('CRUSH', 0.3))],
      ['Bright Stab', P('CHORD', { cutoff: 0.85, decay: 0.2, keyBase: 48, level: 0.4 }, fx('DRIVE', 0.3))],
    ],
    PADS: [
      ['Warm Pad', P('SUPERSAW', { attack: 0.6, decay: 1, cutoff: 0.45, keyBase: 48, level: 0.4 }, fx('REVERB', 0.6))],
      ['Dark Pad', P('SAW', { attack: 0.7, decay: 1, cutoff: 0.3, keyBase: 48, level: 0.45 }, fx('CHORUS', 0.6))],
      ['Glass Pad', P('TRI', { attack: 0.5, decay: 1, keyBase: 60, level: 0.5 }, fx('REVERB', 0.7))],
      ['Chord Pad', P('CHORD', { attack: 0.6, decay: 1, cutoff: 0.5, keyBase: 48, level: 0.35 }, fx('REVERB', 0.5))],
      ['Noise Wash', P('NOISE', { attack: 0.8, decay: 1, cutoff: 0.4, level: 0.35 }, fx('REVERB', 0.7))],
    ],
    SYNTH_FX: [
      ['Laser', P('FM', { pitch: 24, decay: 0.2, egInt: -0.8, level: 0.5 })],
      ['Impact', P('KICK', { pitch: -12, decay: 1, level: 0.9 }, fx('REVERB', 0.7))],
      ['Riser Noise', P('NOISE', { attack: 1, decay: 1, cutoff: 0.6, level: 0.4 }, fx('REVERB', 0.4))],
      ['Crush Noise', P('NOISE', { decay: 0.4, level: 0.4 }, fx('CRUSH', 0.8))],
    ],
  };
  const presetByName = {};
  Object.values(PRESETS).forEach((list) => list.forEach(([n, p]) => { presetByName[n] = p; }));

  /* ---------- Kits (7 Sounds + passendes Pattern) ---------- */
  const X = (s) => s; // Lesbarkeit: 'x' = Schlag, 'o' = leise
  const KITS = [
    { n: 'TEKK 165', bpm: 165, sounds: ['Tekk Kick', 'Tight Clap', 'Closed Hat', 'Open Hat', 'Tekk Bass', 'Rave Stab', 'Minor Stab'],
      pat: [X('x...x...x...x...'), X('....x.......x...'), X('xoxoxoxoxoxoxoxo'), X('..x...x...x...x.')],
      mel: { 4: [[1, 36], [2, 36], [3, 36], [5, 36], [6, 36], [7, 36], [9, 36], [10, 36], [11, 36], [13, 39], [14, 39], [15, 41]], 6: [[6, 60], [14, 58]] } },
    { n: 'HARDCORE 180', bpm: 180, sounds: ['Hardcore Kick', 'Big Clap', 'Tick Hat', 'Ride', 'Reese', 'Supersaw Lead', 'Bright Stab'],
      pat: [X('x...x...x...x...'), X('....x.......x...'), X('..x...x...x...x.'), X('x.......x.......')],
      mel: { 4: [[2, 36, 2], [6, 36, 2], [10, 34, 2], [14, 31, 2]], 5: [[0, 72, 2], [4, 75, 2], [8, 79, 2], [12, 77, 4]] } },
    { n: 'TECHNO 135', bpm: 135, sounds: ['Rumble Kick', 'Clap Delay', 'Closed Hat', 'Long Open', 'Acid 303', 'Dub Chord', 'Noise Wash'],
      pat: [X('x...x...x...x...'), X('....x.......x...'), X('xxxxxxxxxxxxxxxx'), X('..x...x...x...x.')],
      mel: { 4: [[0, 36], [3, 48], [6, 36], [8, 39], [10, 36], [11, 43], [14, 36]], 5: [[3, 48], [11, 48]] } },
    { n: 'HOUSE 124', bpm: 124, sounds: ['909 Punch', 'Classic Clap', 'Shaker', 'Open Hat', 'Pluck Bass', 'House Organ', 'Warm Pad'],
      pat: [X('x...x...x...x...'), X('....x.......x...'), X('oxoxoxoxoxoxoxox'), X('..x...x...x...x.')],
      mel: { 4: [[2, 36], [6, 36], [7, 48], [10, 39], [14, 41]], 5: [[3, 57, 2], [7, 57, 2], [11, 55, 2], [15, 55]] } },
    { n: 'LO-FI 85', bpm: 85, sounds: ['Lo-Fi Kick', 'Crushed Snare', 'Tick Hat', 'Shaker', 'Sub Bass', 'Lofi Keys', 'Glass Pad'],
      pat: [X('x.....x...x.....'), X('....x.......x...'), X('x.x.x.x.x.x.x.xo'), X('...x.......x....')],
      mel: { 4: [[0, 36, 4], [6, 36, 2], [10, 34, 4]], 5: [[0, 57, 6], [8, 53, 6]] } },
    { n: 'TRAP 140', bpm: 140, sounds: ['808 Boom', 'Tight Snare', 'Closed Hat', 'Rimshot', 'Sub Bass', 'FM Bell', 'Dark Pad'],
      pat: [X('x......x..x.....'), X('........x.......'), X('x.x.x.xxx.x.xxxx'), X('......x.......x.')],
      mel: { 5: [[0, 72], [3, 75], [6, 79], [10, 77]], 6: [[0, 48, 16]] } },
    { n: 'ELECTRO 128', bpm: 128, sounds: ['Short Click', 'Fat Snare', 'Closed Hat', 'Cowbell', 'Square Bass', 'Chip Lead', 'Laser'],
      pat: [X('x..x..x...x.....'), X('....x.......x...'), X('x.xxx.xxx.xxx.xx'), X('..x.....x.x.....')],
      mel: { 4: [[0, 36], [3, 36], [6, 48], [8, 36], [11, 39], [14, 43]], 5: [[0, 72], [2, 75], [4, 79], [6, 84]] } },
  ];

  /* ---------- Gerenderte Samples ---------- */
  function driveCurve(a) { const n = 2048, c = new Float32Array(n), k = 1 + a * 40, nm = Math.tanh(k); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / nm; } return c; }
  function makeIR(ctx, sec) { const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); } return b; }

  function helpers(oc) {
    const sr = oc.sampleRate;
    const noise = oc.createBuffer(1, sr * 2, sr); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const res = { noise };
    const out = oc.createGain(); out.connect(oc.destination);
    const h = {
      oc, out, res, noise,
      tr(params, t, midi, vel, dur, dest) {
        const p = Object.assign(BB.defaultPart(params.engine), params);
        return BB.Voices.trigger(oc, dest || out, p, t, midi == null ? 60 : midi, vel == null ? 1 : vel, dur == null ? 0.2 : dur, res);
      },
      fx(o, dest) {
        dest = dest || out;
        const inp = oc.createGain(); let node = inp;
        if (o.hp) { const f = oc.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
        if (o.lp) { const f = oc.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
        if (o.drive) { const w = oc.createWaveShaper(); w.curve = driveCurve(o.drive); w.oversample = '4x'; node.connect(w); node = w; }
        node.connect(dest);
        if (o.rev) { const cv = oc.createConvolver(), g = oc.createGain(); cv.buffer = makeIR(oc, o.revLen || 2.2); g.gain.value = o.rev; node.connect(cv); cv.connect(g); g.connect(dest); }
        return inp;
      },
      noiseSrc() { const s = oc.createBufferSource(); s.buffer = noise; s.loop = true; return s; },
      /* Formant-Stimme */
      vox(t, midi, dur, vowels, vel, dest) {
        dest = dest || out;
        const F = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 3000], o: [570, 840, 2410], u: [320, 870, 2240] };
        const src = oc.createOscillator(); src.type = 'sawtooth'; src.frequency.setValueAtTime(BB.mtof(midi), t);
        const lfo = oc.createOscillator(), lg = oc.createGain(); lfo.frequency.value = 5.5; lg.gain.value = BB.mtof(midi) * 0.012;
        lfo.connect(lg); lg.connect(src.frequency);
        const amp = oc.createGain(); amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(vel || 0.9, t + 0.03);
        amp.gain.setValueAtTime(vel || 0.9, t + dur - 0.08); amp.gain.linearRampToValueAtTime(0, t + dur);
        const mix = oc.createGain(); mix.gain.value = 1.4;
        [1, 0.55, 0.3].forEach((g, k) => {
          const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9 + k * 3;
          vowels.forEach((v, j) => {
            const tt = t + (dur * j) / vowels.length;
            if (j === 0) bp.frequency.setValueAtTime(F[v][k], tt); else bp.frequency.linearRampToValueAtTime(F[v][k], tt + 0.06);
          });
          const gg = oc.createGain(); gg.gain.value = g;
          src.connect(bp); bp.connect(gg); gg.connect(mix);
        });
        mix.connect(amp); amp.connect(dest);
        src.start(t); lfo.start(t); src.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      },
      /* Sequenz-Helfer für Loops */
      seq(bpm, bars, tracks) {
        const s16 = 60 / bpm / 4;
        tracks.forEach((tk) => {
          let hit = 0;
          for (let i = 0; i < bars * 16; i++) {
            const ch = tk.steps[i % tk.steps.length];
            if (ch === '.' || ch === ' ') continue;
            const midi = Array.isArray(tk.midi) ? tk.midi[hit % tk.midi.length] : (tk.midi || 60);
            const t = i * s16 + (i % 2 ? (tk.swing || 0) * s16 : 0) + 0.002;
            h.tr(tk.p, t, midi, ch === 'o' ? 0.5 : 1, (tk.len || 1) * s16, tk.dest);
            hit++;
          }
        });
      },
    };
    return h;
  }

  const SAMPLES = [
    // VOCALS
    { n: 'Vox Ah', cat: 'VOCALS', len: 1.2, r: (h) => h.vox(0.01, 57, 1.1, ['a'], 0.9, h.fx({ rev: 0.25 })) },
    { n: 'Vox Oh', cat: 'VOCALS', len: 1.2, r: (h) => h.vox(0.01, 55, 1.1, ['o'], 0.9, h.fx({ rev: 0.25 })) },
    { n: 'Vox Hey', cat: 'VOCALS', len: 0.7, r: (h) => {
      const n = h.noiseSrc(), g = h.oc.createGain(), f = h.oc.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
      g.gain.setValueAtTime(0.4, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.08); n.connect(f); f.connect(g); g.connect(h.out); n.start(0); n.stop(0.1);
      h.vox(0.05, 62, 0.55, ['e', 'i'], 0.95, h.fx({ rev: 0.2, drive: 0.2 }));
    } },
    { n: 'Vox Yeah', cat: 'VOCALS', len: 0.9, r: (h) => h.vox(0.01, 60, 0.85, ['i', 'e', 'a', 'a'], 0.95, h.fx({ rev: 0.25 })) },
    { n: 'Vox Chop', cat: 'VOCALS', len: 1.0, r: (h) => { const d = h.fx({ rev: 0.2 }); [[0, 64, 'a'], [0.25, 67, 'e'], [0.5, 62, 'o'], [0.75, 60, 'a']].forEach(([t, m, v]) => h.vox(t + 0.01, m, 0.2, [v], 0.9, d)); } },
    { n: 'Choir', cat: 'VOCALS', len: 2.5, r: (h) => { const d = h.fx({ rev: 0.6, revLen: 3 }); [57, 60, 64, 69].forEach((m) => h.vox(0.01, m, 2.2, ['a', 'o'], 0.35, d)); } },
    // HITS
    { n: 'Gabber Kick', cat: 'HITS', len: 0.6, r: (h) => h.tr({ engine: 'KICK', decay: 0.55, pitch: 1 }, 0.005, 60, 1, 0.5, h.fx({ drive: 0.95, lp: 7000 })) },
    { n: 'Layered Kick', cat: 'HITS', len: 0.6, r: (h) => { const d = h.fx({ drive: 0.35 }); h.tr({ engine: 'KICK', decay: 0.5 }, 0.005, 60, 1, 0.5, d); h.tr({ engine: 'KICK', pitch: 12, decay: 0.08 }, 0.005, 60, 0.6, 0.1, d); h.tr({ engine: 'HH CL', decay: 0.05 }, 0.005, 48, 0.4, 0.05, d); } },
    { n: 'Orchestra Hit', cat: 'HITS', len: 1.6, r: (h) => { const d = h.fx({ rev: 0.5, drive: 0.15 }); [48, 55, 60, 63, 67, 72].forEach((m) => h.tr({ engine: 'SUPERSAW', cutoff: 0.8, egInt: 0.3, decay: 0.45 }, 0.005, m, 0.35, 0.6, d)); h.tr({ engine: 'SNARE', decay: 0.6, pitch: -5 }, 0.005, 60, 0.7, 0.3, d); h.tr({ engine: 'KICK', decay: 0.4, pitch: -3 }, 0.005, 60, 0.8, 0.3, d); } },
    { n: 'Rave Hit', cat: 'HITS', len: 1.0, r: (h) => { const d = h.fx({ drive: 0.5, rev: 0.3 }); [60, 63, 67, 70].forEach((m) => h.tr({ engine: 'SUPERSAW', cutoff: 0.7, egInt: 0.5, decay: 0.3 }, 0.005, m, 0.4, 0.4, d)); } },
    { n: 'Sub Drop', cat: 'HITS', len: 1.8, r: (h) => { const o = h.oc.createOscillator(), g = h.oc.createGain(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(28, 1.6); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.9, 0.02); g.gain.exponentialRampToValueAtTime(0.001, 1.75); o.connect(g); g.connect(h.out); o.start(0); o.stop(1.8); } },
    { n: 'Laser Zap', cat: 'HITS', len: 0.35, r: (h) => { const o = h.oc.createOscillator(), g = h.oc.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(4000, 0); o.frequency.exponentialRampToValueAtTime(80, 0.3); g.gain.setValueAtTime(0.5, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.33); o.connect(g); g.connect(h.fx({ lp: 6000 })); o.start(0); o.stop(0.35); } },
    { n: 'Impact Boom', cat: 'HITS', len: 3, r: (h) => { const d = h.fx({ rev: 0.8, revLen: 3 }); h.tr({ engine: 'KICK', pitch: -12, decay: 1 }, 0.005, 60, 1, 1, d); h.tr({ engine: 'HH OP', pitch: -14, decay: 1 }, 0.005, 60, 0.5, 1, d); } },
    // FX
    { n: 'Riser', cat: 'FX', len: 3.2, r: (h) => {
      const n = h.noiseSrc(), bp = h.oc.createBiquadFilter(), g = h.oc.createGain(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(300, 0); bp.frequency.exponentialRampToValueAtTime(9000, 3.1);
      g.gain.setValueAtTime(0.001, 0); g.gain.exponentialRampToValueAtTime(0.7, 3.1); g.gain.linearRampToValueAtTime(0, 3.2);
      const o = h.oc.createOscillator(), og = h.oc.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(1760, 3.1);
      og.gain.setValueAtTime(0.001, 0); og.gain.exponentialRampToValueAtTime(0.18, 3.1); og.gain.linearRampToValueAtTime(0, 3.2);
      const d = h.fx({ rev: 0.4 }); n.connect(bp); bp.connect(g); g.connect(d); o.connect(og); og.connect(d); n.start(0); o.start(0); n.stop(3.2); o.stop(3.2);
    } },
    { n: 'Downlifter', cat: 'FX', len: 2.5, r: (h) => {
      const n = h.noiseSrc(), bp = h.oc.createBiquadFilter(), g = h.oc.createGain(); bp.type = 'bandpass'; bp.Q.value = 2;
      bp.frequency.setValueAtTime(8000, 0); bp.frequency.exponentialRampToValueAtTime(200, 2.3);
      g.gain.setValueAtTime(0.7, 0); g.gain.exponentialRampToValueAtTime(0.001, 2.4); n.connect(bp); bp.connect(g); g.connect(h.fx({ rev: 0.4 })); n.start(0); n.stop(2.5);
    } },
    { n: 'Reverse Cymbal', cat: 'FX', len: 2.2, reverse: true, r: (h) => h.tr({ engine: 'HH OP', pitch: -8, decay: 1 }, 0.005, 60, 1, 2, h.fx({ rev: 0.4 })) },
    { n: 'Snare Roll', cat: 'FX', len: 2.0, r: (h) => { const d = h.fx({ rev: 0.2 }); let t = 0.005, step = 0.125; while (t < 1.9) { h.tr({ engine: 'SNARE', decay: 0.3 }, t, 60, 0.3 + (t / 1.9) * 0.7, 0.1, d); t += step; step = Math.max(0.03, step * 0.9); } } },
    { n: 'Siren', cat: 'FX', len: 2.0, r: (h) => { const o = h.oc.createOscillator(), l = h.oc.createOscillator(), lg = h.oc.createGain(), g = h.oc.createGain(); o.type = 'square'; o.frequency.value = 700; l.frequency.value = 2; lg.gain.value = 250; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.25, 0); g.gain.linearRampToValueAtTime(0, 2); o.connect(g); g.connect(h.fx({ lp: 3500, rev: 0.3 })); o.start(0); l.start(0); o.stop(2); l.stop(2); } },
    { n: 'Noise Sweep', cat: 'FX', len: 1.5, r: (h) => { const n = h.noiseSrc(), f = h.oc.createBiquadFilter(), g = h.oc.createGain(); f.type = 'lowpass'; f.Q.value = 8; f.frequency.setValueAtTime(200, 0); f.frequency.exponentialRampToValueAtTime(12000, 0.75); f.frequency.exponentialRampToValueAtTime(200, 1.5); g.gain.value = 0.5; n.connect(f); f.connect(g); g.connect(h.out); n.start(0); n.stop(1.5); } },
    // LOOPS (passen sich per Timestretch dem Projekttempo an)
    { n: 'Tekk Loop 165', cat: 'LOOPS', bpm: 165, bars: 1, r: (h) => h.seq(165, 1, [
      { p: presetByName['Tekk Kick'], steps: 'x...x...x...x...', dest: h.fx({ drive: 0.6 }) },
      { p: presetByName['Tight Clap'], steps: '....x.......x...' },
      { p: presetByName['Closed Hat'], steps: 'xoxoxoxoxoxoxoxo' },
      { p: presetByName['Open Hat'], steps: '..x...x...x...x.' }]) },
    { n: 'Breakbeat 132', cat: 'LOOPS', bpm: 132, bars: 2, r: (h) => h.seq(132, 2, [
      { p: { engine: 'KICK', decay: 0.35 }, steps: 'x.........x.....x..x......x.....' },
      { p: { engine: 'SNARE', decay: 0.4 }, steps: '....x.......x.......x..o....x...' },
      { p: { engine: 'HH CL', decay: 0.2 }, steps: 'x.x.x...x.x.x.x.x.x.x...x.x.x.x.' },
      { p: { engine: 'HH OP', decay: 0.3 }, steps: '......x.......x.......x.......x.' }]) },
    { n: 'House Loop 124', cat: 'LOOPS', bpm: 124, bars: 1, r: (h) => h.seq(124, 1, [
      { p: presetByName['909 Punch'], steps: 'x...x...x...x...' },
      { p: presetByName['Classic Clap'], steps: '....x.......x...' },
      { p: presetByName['Shaker'], steps: 'oxoxoxoxoxoxoxox', swing: 0.2 },
      { p: presetByName['Open Hat'], steps: '..x...x...x...x.' }]) },
    { n: 'Techno Loop 135', cat: 'LOOPS', bpm: 135, bars: 1, r: (h) => h.seq(135, 1, [
      { p: presetByName['Rumble Kick'], steps: 'x...x...x...x...' },
      { p: presetByName['Closed Hat'], steps: 'xxxxxxxxxxxxxxxx' },
      { p: presetByName['Ride'], steps: '..x...x...x...x.' },
      { p: presetByName['Rimshot'], steps: '...x..x....x..x.' }]) },
    { n: 'Rolling Bass 150', cat: 'LOOPS', bpm: 150, bars: 1, r: (h) => h.seq(150, 1, [
      { p: presetByName['Tekk Bass'], steps: '.xxx.xxx.xxx.xxx', midi: [36, 36, 36, 36, 36, 36, 36, 36, 36, 39, 39, 41] }]) },
    { n: 'Acid Loop 140', cat: 'LOOPS', bpm: 140, bars: 1, r: (h) => h.seq(140, 1, [
      { p: presetByName['Acid 303'], steps: 'xx.xx.x.xx.x.xx.', midi: [36, 48, 36, 39, 36, 51, 36, 43, 36, 48, 41] }]) },
    { n: 'Chord Loop 124', cat: 'LOOPS', bpm: 124, bars: 2, r: (h) => h.seq(124, 2, [
      { p: presetByName['Minor Stab'], steps: '..x...x...x..x....x...x...x..x..', midi: [57, 57, 57, 57, 53, 53, 53, 53] }]) },
    { n: 'Perc Loop 120', cat: 'LOOPS', bpm: 120, bars: 1, r: (h) => h.seq(120, 1, [
      { p: presetByName['Conga'], steps: 'x..x..x...x.x...', midi: [60, 60, 67, 60, 64] },
      { p: presetByName['Wood Block'], steps: '..x.....x.x...x.' },
      { p: presetByName['Shaker'], steps: 'xoxoxoxoxoxoxoxo' }]) },
  ];

  const CATS = [
    ['KITS', 'Kits'], ['KICKS', 'Kicks'], ['SNARES', 'Snares'], ['CLAPS', 'Claps'], ['HATS', 'Hats'], ['PERC', 'Perc'],
    ['BASS', 'Bass'], ['LEADS', 'Leads'], ['CHORDS', 'Chords'], ['PADS', 'Pads'], ['SYNTH_FX', 'Synth FX'],
    ['VOCALS', 'Vocals'], ['HITS', 'Hits'], ['FX', 'FX'], ['LOOPS', 'Loops'],
  ];

  function itemsFor(cat) {
    if (cat === 'KITS') return KITS.map((k) => ({ kind: 'kit', n: k.n, k }));
    if (PRESETS[cat]) return PRESETS[cat].map(([n, p]) => ({ kind: 'preset', n, p }));
    return SAMPLES.filter((s) => s.cat === cat).map((s) => ({ kind: 'sample', n: s.n, s }));
  }

  L.count = () => Object.values(PRESETS).reduce((a, l) => a + l.length, 0) + SAMPLES.length + KITS.length;

  /* Rendern */
  L.render = async function (rc) {
    if (L.cache[rc.n]) return L.cache[rc.n];
    const sr = 44100;
    const len = rc.bars ? (rc.bars * 4 * 60) / rc.bpm : rc.len;
    const oc = new OfflineAudioContext(2, Math.ceil(sr * len), sr);
    const h = helpers(oc);
    rc.r(h);
    let buf = await oc.startRendering();
    if (rc.reverse) buf = BB.DSP.reverse(BB.Audio.ctx, buf);
    buf = BB.DSP.normalize(BB.Audio.ctx, buf);
    L.cache[rc.n] = buf;
    return buf;
  };

  /* Anwenden */
  const RESET = { pitch: 0, cutoff: 1, reso: 0.1, egInt: 0, attack: 0, decay: 0.4, ifx: 0, ifxType: 'OFF', level: 0.8, pan: 0 };
  L.applyPreset = function (i, params) {
    const part = BB.project.parts[i];
    Object.assign(part, RESET, params);
    if (params.keyBase == null) part.keyBase = BB.isSynth(params.engine) ? 48 : 60;
    BB.Audio.applyPart(i);
  };

  L.applySample = async function (i, rc) {
    const buf = await L.render(rc);
    const part = BB.project.parts[i];
    Object.assign(part, RESET, { engine: 'SAMPLE', keyBase: 60, decay: 1, level: 0.8 });
    const m = part.sample;
    Object.assign(m, BB.defaultSampleMeta(), { name: rc.n });
    if (rc.bars) {
      Object.assign(m, { bars: rc.bars, stretch: true, stretchMode: 'sync' });
      const steps = rc.bars * 16;
      if (steps > BB.project.length) BB.UI.setLength(Math.min(64, steps));
      part.notes = [{ s: 0, p: 60, v: 1, l: Math.min(BB.project.length, steps) }];
      part.mute = false;
    } else m.bars = BB.Audio.guessBars(buf.duration, BB.project.bpm);
    BB.Audio.setSampleRaw(i, buf, rc.n);
    BB.IDB.put('part' + i, Object.assign(BB.DSP.serializeBuffer(buf), { name: rc.n }));
    BB.Audio.applyPart(i);
  };

  L.applyKit = function (kit, withPattern) {
    kit.sounds.forEach((n, i) => { const p = presetByName[n]; if (p) L.applyPreset(i, p); });
    if (withPattern) {
      BB.project.bpm = kit.bpm; BB.Audio.syncTempo(); BB.emit('bpm');
      BB.project.length = 16; BB.UI.page = 0;
      for (let i = 0; i < 7; i++) {
        const part = BB.project.parts[i];
        part.notes = []; part.mute = false; part.solo = false;
        const s = kit.pat[i];
        if (s) for (let k = 0; k < 16; k++) if (s[k] === 'x' || s[k] === 'o') part.notes.push({ s: k, p: 60, v: s[k] === 'o' ? 0.55 : 1, l: 1 });
        const mel = kit.mel[i];
        if (mel) mel.forEach(([st, p, l]) => part.notes.push({ s: st, p, v: 1, l: l || 1 }));
      }
    }
  };

  function afterChange() {
    BB.UI.refreshAll(); BB.save();
    BB.project.parts.forEach((_, i) => BB.emit('notes', i));
  }

  /* ---------- UI ---------- */
  function open() { L.part = BB.UI.part; render(); }

  function render() {
    BB.UI.chips($('#libParts'), L.part, (i) => { L.part = i; render(); });
    const tabs = $('#libCats'); tabs.innerHTML = '';
    CATS.forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label; b.className = id === L.cat ? 'on' : '';
      b.addEventListener('click', () => { L.cat = id; L.sel = null; render(); });
      tabs.appendChild(b);
    });
    const grid = $('#libGrid'); grid.innerHTML = '';
    itemsFor(L.cat).forEach((it) => {
      const b = document.createElement('button');
      b.className = 'lib-tile' + (it.kind === 'kit' ? ' kit' : '') + (L.sel && L.sel.n === it.n ? ' sel' : '');
      b.style.setProperty('--c', BB.PART_COLORS[L.part]);
      if (it.kind === 'kit') {
        b.innerHTML = `<b>${it.n}</b><small>${it.k.sounds.join(' · ')}</small>`;
      } else {
        const tag = it.kind === 'preset' ? it.p.engine : (it.s.bars ? `LOOP ${it.s.bpm} BPM` : 'SAMPLE');
        b.innerHTML = `<b>${it.n}</b><small>${tag}${it.p && it.p.ifxType ? ' + ' + it.p.ifxType : ''}</small>`;
      }
      b.addEventListener('click', () => { L.sel = it; $$('.lib-tile', grid).forEach((x) => x.classList.toggle('sel', x === b)); preview(it, b); renderBar(); });
      b.addEventListener('dblclick', () => load(it));
      grid.appendChild(b);
    });
    renderBar();
  }

  function renderBar() {
    const it = L.sel;
    $('#libSel').textContent = it ? it.n : 'Sound antippen zum Vorhören';
    const kit = it && it.kind === 'kit';
    $('#libLoad').hidden = !it || kit;
    $('#libLoad').textContent = `Auf Spur ${L.part + 1} laden`;
    $('#libKitSounds').hidden = !kit; $('#libKitPattern').hidden = !kit;
    $('#libPreview').hidden = !it;
  }

  async function preview(it, el) {
    if (!BB.Audio.ready) return;
    if (it.kind === 'preset') {
      const syn = BB.isSynth(it.p.engine);
      BB.Audio.preview(it.p, syn ? (it.p.keyBase || 48) + 12 : 60, syn ? 0.5 : 0.3);
    } else if (it.kind === 'sample') {
      const was = el ? el.querySelector('small').textContent : '';
      if (el && !L.cache[it.s.n]) el.querySelector('small').textContent = 'rendere …';
      const buf = await L.render(it.s);
      if (el) el.querySelector('small').textContent = was;
      BB.Audio.previewBuffer(buf);
    } else if (it.kind === 'kit') {
      const t0 = BB.Audio.now() + 0.02, s16 = 60 / it.k.bpm / 4;
      for (let k = 0; k < 16; k++) {
        it.k.pat.forEach((s, i) => {
          if (s[k] === 'x' || s[k] === 'o') {
            const p = presetByName[it.k.sounds[i]];
            const P2 = Object.assign(BB.defaultPart(p.engine), p);
            BB.Voices.trigger(BB.Audio.ctx, BB.Audio.bus, P2, t0 + k * s16, 60, s[k] === 'o' ? 0.5 : 0.9, s16, { noise: BB.Audio.noise });
          }
        });
      }
    }
  }

  async function load(it) {
    if (!it) return;
    if (it.kind === 'preset') { L.applyPreset(L.part, it.p); BB.UI.toast(`${it.n} → Spur ${L.part + 1}`); }
    else if (it.kind === 'sample') {
      $('#libLoad').textContent = 'lade …';
      await L.applySample(L.part, it.s);
      BB.UI.toast(it.s.bars ? `${it.n} → Spur ${L.part + 1} (folgt dem Tempo)` : `${it.n} → Spur ${L.part + 1}`);
    }
    if (BB.UI.part !== L.part) BB.UI.part = L.part;
    afterChange(); render();
    BB.UI.flash(`${L.part + 1}:${BB.project.parts[L.part].engine}`, it.n.toUpperCase().slice(0, 16));
  }

  L.init = function () {
    BB.on('open:libraryOverlay', open);
    $('#libLoad').addEventListener('click', () => load(L.sel));
    $('#libPreview').addEventListener('click', () => L.sel && preview(L.sel));
    $('#libKitSounds').addEventListener('click', () => { if (!L.sel) return; L.applyKit(L.sel.k, false); afterChange(); BB.UI.toast(`Kit ${L.sel.n}: Sounds auf Spur 1–7`); });
    $('#libKitPattern').addEventListener('click', () => {
      if (!L.sel) return; L.applyKit(L.sel.k, true); afterChange();
      BB.UI.toast(`Kit ${L.sel.n} mit Pattern geladen – drück Play`);
      BB.UI.close($('#libraryOverlay'));
    });
    $('#libStop').addEventListener('click', () => BB.Audio.stopPreview());
  };
})(window.BB);
