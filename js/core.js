'use strict';
/* BUMBUM – Kern: Konstanten, Datenmodell, Speicher */
window.BB = window.BB || {};
(function (BB) {
  BB.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  BB.mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  BB.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  BB.noteName = (m) => BB.NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  BB.isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
  BB.pad3 = (n) => String(n).padStart(3, '0');

  BB.ENGINES = ['KICK', 'SNARE', 'CLAP', 'HH CL', 'HH OP', 'TOM', 'RIM', 'NOISE',
    'SAW', 'SQUARE', 'TRI', 'SINE', 'SUPERSAW', 'FM', 'CHORD', 'SAMPLE'];
  BB.DRUMS = ['KICK', 'SNARE', 'CLAP', 'HH CL', 'HH OP', 'TOM', 'RIM'];
  BB.isDrum = (e) => BB.DRUMS.includes(e);
  BB.isSynth = (e) => !BB.isDrum(e) && e !== 'SAMPLE';

  BB.IFX_TYPES = ['OFF', 'DRIVE', 'CRUSH', 'DELAY', 'REVERB', 'CHORUS', 'WAH', 'COMP'];
  BB.PADFX_TYPES = ['FILTER', 'DELAY', 'BUILD', 'GATE', 'ROLL', 'CRUSH'];

  BB.PART_COLORS = ['#ff4f9a', '#ffb347', '#6fd8ff', '#b993ff', '#ff6b6b', '#ffe066', '#6bffb8', '#e08cff'];

  BB.KNOBS = [
    { id: 'engine', label: 'OSC', min: 0, max: BB.ENGINES.length - 1, step: 1, def: 0 },
    { id: 'pitch', label: 'PITCH', min: -24, max: 24, step: 1, def: 0 },
    { id: 'cutoff', label: 'CUTOFF', min: 0, max: 1, def: 1 },
    { id: 'reso', label: 'RESO', min: 0, max: 1, def: 0.1 },
    { id: 'egInt', label: 'EG INT', min: -1, max: 1, def: 0 },
    { id: 'level', label: 'LEVEL', min: 0, max: 1, def: 0.8 },
    { id: 'pan', label: 'PAN', min: -1, max: 1, def: 0 },
    { id: 'attack', label: 'ATTACK', min: 0, max: 1, def: 0 },
    { id: 'decay', label: 'DECAY', min: 0, max: 1, def: 0.4 },
    { id: 'ifx', label: 'IFX', min: 0, max: 1, def: 0 },
  ];

  BB.formatParam = function (id, v, part) {
    switch (id) {
      case 'engine': return BB.ENGINES[Math.round(v)];
      case 'pitch': return (v > 0 ? '+' : '') + Math.round(v) + ' ST';
      case 'pan': return Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
      case 'egInt': return (v > 0 ? '+' : '') + Math.round(v * 100);
      case 'ifx': return (part ? part.ifxType + ' ' : '') + Math.round(v * 100) + '%';
      default: return Math.round(v * 127);
    }
  };

  BB.defaultSampleMeta = () => ({
    name: '', bars: 1, div: 0, slices: [], start: 0, end: 1,
    reverse: false, stretch: false, stretchMode: 'sync', ratio: 1,
  });

  BB.defaultPart = function (engine, extra) {
    const p = {
      engine, pitch: 0, cutoff: 1, reso: 0.1, egInt: 0, level: 0.8, pan: 0,
      attack: 0, decay: 0.4, ifx: 0, ifxType: 'OFF', mute: false, solo: false,
      keyBase: BB.isSynth(engine) ? 48 : 60, notes: [], sample: BB.defaultSampleMeta(),
    };
    return Object.assign(p, extra || {});
  };

  const N = (s, p, v, l) => ({ s, p, v: v == null ? 1 : v, l: l || 1 });

  BB.demoProject = function () {
    const parts = [];
    const kick = BB.defaultPart('KICK', { decay: 0.45, ifxType: 'DRIVE', ifx: 0.3, level: 0.95 });
    for (let s = 0; s < 16; s += 4) kick.notes.push(N(s, 60));
    parts.push(kick);

    const clap = BB.defaultPart('CLAP', { ifxType: 'REVERB', ifx: 0.25, level: 0.7 });
    clap.notes.push(N(4, 60), N(12, 60));
    parts.push(clap);

    const hh = BB.defaultPart('HH CL', { decay: 0.25, level: 0.5, pan: 0.15 });
    for (let s = 0; s < 16; s++) hh.notes.push(N(s, 60, s % 4 === 2 ? 1 : 0.55));
    parts.push(hh);

    const oh = BB.defaultPart('HH OP', { decay: 0.35, level: 0.45, pan: -0.15 });
    for (let s = 2; s < 16; s += 4) oh.notes.push(N(s, 60));
    parts.push(oh);

    const bass = BB.defaultPart('SAW', { cutoff: 0.38, reso: 0.55, egInt: 0.45, decay: 0.22, level: 0.7, ifxType: 'DRIVE', ifx: 0.2 });
    [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15].forEach((s) => bass.notes.push(N(s, s === 14 || s === 15 ? 39 : 36, s % 2 ? 0.8 : 1)));
    parts.push(bass);

    const lead = BB.defaultPart('SUPERSAW', { cutoff: 0.7, decay: 0.5, level: 0.42, ifxType: 'DELAY', ifx: 0.35, mute: true });
    [[0, 72], [3, 75], [6, 79], [8, 77], [10, 75], [12, 74]].forEach(([s, p]) => lead.notes.push(N(s, p, 1, 2)));
    parts.push(lead);

    const chord = BB.defaultPart('CHORD', { cutoff: 0.62, egInt: 0.3, decay: 0.3, level: 0.4, ifxType: 'REVERB', ifx: 0.4, keyBase: 48 });
    chord.notes.push(N(6, 60, 0.9), N(14, 58, 0.9));
    parts.push(chord);

    const smp = BB.defaultPart('SAMPLE', { decay: 1, level: 0.75, keyBase: 60 });
    parts.push(smp);

    return { name: 'DEMO', bpm: 150, swing: 0, length: 16, padFx: 'FILTER', master: 0.85, slot: 1, parts };
  };

  BB.emptyProject = function () {
    const p = BB.demoProject();
    p.parts.forEach((x) => { x.notes = []; x.mute = false; });
    p.name = 'NEU';
    return p;
  };

  /* Projekt säubern (nach Laden) */
  BB.normalizeProject = function (p) {
    const d = BB.demoProject();
    p = Object.assign({}, d, p || {});
    if (!Array.isArray(p.parts) || p.parts.length !== 8) p.parts = d.parts;
    p.parts = p.parts.map((x, i) => {
      const base = BB.defaultPart(x && x.engine ? x.engine : d.parts[i].engine);
      const r = Object.assign(base, x || {});
      r.sample = Object.assign(BB.defaultSampleMeta(), r.sample || {});
      r.notes = (r.notes || []).filter((n) => n && n.s >= 0).map((n) => N(n.s | 0, n.p | 0, n.v, Math.max(1, n.l | 0)));
      return r;
    });
    return p;
  };

  /* ---------- Speicher ---------- */
  BB.Store = {
    save(key, proj) {
      try { localStorage.setItem(key, JSON.stringify(proj)); return true; } catch (e) { return false; }
    },
    load(key) {
      try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
    },
    slotKey: (n) => 'bb-slot-' + n,
    hasSlot(n) { try { return !!localStorage.getItem('bb-slot-' + n); } catch (e) { return false; } },
  };

  /* IndexedDB für Samples */
  BB.IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open('bumbum', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('samples');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async put(key, val) {
      try {
        const db = await this.open();
        return new Promise((res) => {
          const tx = db.transaction('samples', 'readwrite');
          tx.objectStore('samples').put(val, key);
          tx.oncomplete = () => res(true); tx.onerror = () => res(false);
        });
      } catch (e) { return false; }
    },
    async get(key) {
      try {
        const db = await this.open();
        return new Promise((res) => {
          const tx = db.transaction('samples', 'readonly');
          const q = tx.objectStore('samples').get(key);
          q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
        });
      } catch (e) { return null; }
    },
    async del(key) {
      try {
        const db = await this.open();
        const tx = db.transaction('samples', 'readwrite');
        tx.objectStore('samples').delete(key);
      } catch (e) { /* ignore */ }
    },
  };
})(window.BB);
