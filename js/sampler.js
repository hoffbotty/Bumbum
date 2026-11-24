'use strict';
/* BUMBUM – Sampler: Laden, Aufnehmen, Time Slice, Timestretch */
(function (BB) {
  const $ = BB.$, $$ = BB.$$;
  const SP = BB.Sampler = { part: 7, drag: null, hiSlice: -1, hiT: 0, recorder: null };

  const P = () => BB.project.parts[SP.part];
  const S = () => BB.Audio.samples[SP.part];

  function pickDefaultPart() {
    const cur = BB.UI.part;
    if (BB.project.parts[cur].engine === 'SAMPLE') return cur;
    const i = BB.project.parts.findIndex((p) => p.engine === 'SAMPLE');
    return i >= 0 ? i : cur;
  }

  function open() {
    SP.part = pickDefaultPart();
    render();
  }

  function render() {
    BB.UI.chips($('#spParts'), SP.part, (i) => { SP.part = i; render(); });
    const p = P(), m = p.sample, s = S();
    $('#spName').textContent = s && s.raw ? (m.name || 'SAMPLE').toUpperCase().slice(0, 28) : '— kein Sample —';
    $$('#spDiv button').forEach((b) => b.classList.toggle('on', String(m.div) === b.dataset.div));
    $$('#spBars button').forEach((b) => b.classList.toggle('on', Number(b.dataset.bars) === m.bars));
    const st = m.stretch ? m.stretchMode : 'off';
    $$('#spStretch button').forEach((b) => b.classList.toggle('on', b.dataset.st === st));
    $('#spRatio').value = Math.round(m.ratio * 100);
    $('#spRatioV').textContent = Math.round(m.ratio * 100) + '%';
    $('#spRatio').disabled = st !== 'free';
    $('#spReverse').classList.toggle('on', m.reverse);
    $('#spPitch').value = p.pitch; $('#spPitchV').textContent = (p.pitch > 0 ? '+' : '') + p.pitch;
    $('#spDecay').value = Math.round(p.decay * 100); $('#spDecayV').textContent = p.decay >= 0.98 ? 'FULL' : Math.round(p.decay * 100);
    if (s && s.raw) {
      const region = s.raw.duration * (m.end - m.start);
      const orig = (m.bars * 4 * 60) / region;
      $('#spBpmInfo').textContent = `Original: ${orig.toFixed(1)} BPM → Projekt: ${BB.project.bpm.toFixed(1)} BPM`;
      $('#spInfo').textContent = `${s.buf.duration.toFixed(2)} s · ${m.slices.length ? m.slices.length + ' SLICES' : 'ONE SHOT'}`;
    } else { $('#spBpmInfo').textContent = 'Original: – BPM'; $('#spInfo').textContent = ''; }
    if (p.engine !== 'SAMPLE') $('#spInfo').textContent = `Spur ${SP.part + 1} ist ${p.engine} – beim Laden wird sie auf SAMPLE gestellt`;
    drawWave();
  }

  function ensureSampleEngine() {
    const p = P();
    if (p.engine !== 'SAMPLE') { p.engine = 'SAMPLE'; p.keyBase = 60; if (p.decay < 0.98) p.decay = 1; }
    BB.UI.renderParts(); BB.UI.refreshKnobs(); BB.UI.renderPads();
  }

  async function setRaw(buf, name) {
    ensureSampleEngine();
    const m = P().sample;
    Object.assign(m, BB.defaultSampleMeta(), { name });
    m.bars = BB.Audio.guessBars(buf.duration, BB.project.bpm);
    BB.Audio.setSampleRaw(SP.part, buf, name);
    BB.IDB.put('part' + SP.part, Object.assign(BB.DSP.serializeBuffer(buf), { name }));
    BB.save(); render(); BB.UI.renderPads();
    BB.UI.flash('SAMPLE', name.toUpperCase().slice(0, 16));
  }

  function reprocess() {
    if (!S() || !S().raw) { render(); return; }
    $('#spInfo').textContent = 'BERECHNE …';
    setTimeout(() => { BB.Audio.processSample(SP.part); BB.save(); render(); BB.UI.renderPads(); }, 10);
  }

  /* Waveform */
  function drawWave() {
    const c = $('#spWave'), [w, h, d] = BB.UI.sizeCanvas(c), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const s = S(), m = P().sample;
    if (!s || !s.peaks) {
      g.fillStyle = '#5a3a4a'; g.font = `${16 * d}px VT323, monospace`; g.textAlign = 'center';
      g.fillText('LADE ODER NIMM EIN SAMPLE AUF', w / 2, h / 2);
      return;
    }
    const pk = s.peaks, n = pk.length;
    // Slices
    const now = BB.Audio.now();
    const ls = BB.Audio.lastSlice[SP.part];
    m.slices.forEach((sl, i) => {
      const x0 = sl[0] * w, x1 = sl[1] * w;
      const active = ls && ls.idx === i && now >= ls.t && now - ls.t < 0.25;
      if (active) { g.fillStyle = 'rgba(140,80,220,0.55)'; g.fillRect(x0, 0, x1 - x0, h); }
      else if (i % 2) { g.fillStyle = 'rgba(255,79,154,0.05)'; g.fillRect(x0, 0, x1 - x0, h); }
    });
    // Wellenform
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffb3d6'); gr.addColorStop(0.5, '#e9a07a'); gr.addColorStop(1, '#ffb3d6');
    g.fillStyle = gr;
    const mid = h / 2;
    for (let x = 0; x < w; x += d) {
      const i = Math.floor((x / w) * n);
      const a = pk[i] * (h / 2 - 4 * d);
      g.fillRect(x, mid - a, d, a * 2 || d);
    }
    // Dimmen außerhalb Region
    g.fillStyle = 'rgba(13,7,9,0.7)';
    g.fillRect(0, 0, m.start * w, h); g.fillRect(m.end * w, 0, w - m.end * w, h);
    // Slice-Linien
    g.fillStyle = 'rgba(255,255,255,0.35)';
    m.slices.forEach((sl, i) => { if (i) g.fillRect(sl[0] * w, 0, d, h); });
    g.font = `${12 * d}px VT323, monospace`; g.textAlign = 'left';
    m.slices.forEach((sl, i) => { if ((sl[1] - sl[0]) * w > 18 * d) { g.fillStyle = '#ff9a2e'; g.fillText(String(i + 1), sl[0] * w + 3 * d, 12 * d); } });
    // Griffe
    [m.start, m.end].forEach((v) => {
      g.fillStyle = '#ff4f9a'; g.fillRect(v * w - d, 0, 2 * d, h);
      g.fillRect(v * w - 5 * d, h - 12 * d, 10 * d, 12 * d);
    });
  }

  function bindWave() {
    const c = $('#spWave');
    c.addEventListener('pointerdown', (e) => {
      const s = S(); if (!s || !s.buf) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      const m = P().sample, tol = 14 / r.width;
      if (Math.abs(x - m.start) < tol) { SP.drag = 'start'; return; }
      if (Math.abs(x - m.end) < tol) { SP.drag = 'end'; return; }
      SP.drag = null;
      // Slice oder Position abspielen
      if (m.slices.length) {
        const i = m.slices.findIndex((sl) => x >= sl[0] && x < sl[1]);
        if (i >= 0) BB.Audio.playNote(SP.part, BB.Audio.now() + 0.005, 60 + i, 1, 1);
      } else BB.Audio.playNote(SP.part, BB.Audio.now() + 0.005, 60, 1, 2);
    });
    c.addEventListener('pointermove', (e) => {
      if (!SP.drag) return;
      const r = c.getBoundingClientRect(), x = BB.clamp((e.clientX - r.left) / r.width, 0, 1);
      const m = P().sample;
      if (SP.drag === 'start') m.start = Math.min(x, m.end - 0.01); else m.end = Math.max(x, m.start + 0.01);
      m.slices = BB.DSP.computeSlices(m, S().buf);
      drawWave();
    });
    const up = () => {
      if (!SP.drag) return; SP.drag = null;
      if (P().sample.stretch && P().sample.stretchMode === 'sync') reprocess(); else { BB.save(); render(); }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }

  /* Mikrofon-Aufnahme */
  async function toggleRec() {
    const btn = $('#spRec');
    if (SP.recorder) { SP.recorder.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { BB.UI.toast('Aufnahme nicht unterstützt'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const chunks = [];
      const rec = SP.recorder = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        SP.recorder = null; btn.classList.remove('on'); btn.textContent = '🎙 Aufnehmen';
        try {
          const buf = await BB.Audio.ctx.decodeAudioData(await new Blob(chunks).arrayBuffer());
          await setRaw(trimSilence(buf), 'MIC ' + new Date().toLocaleTimeString().slice(0, 5));
        } catch (e) { BB.UI.toast('Aufnahme konnte nicht gelesen werden'); }
      };
      rec.start();
      btn.classList.add('on'); btn.textContent = '■ Stop';
    } catch (e) { BB.UI.toast('Kein Mikrofonzugriff'); }
  }

  function trimSilence(buf) {
    const d = buf.getChannelData(0);
    let a = 0, b = d.length - 1;
    const th = 0.02;
    while (a < d.length && Math.abs(d[a]) < th) a++;
    while (b > a && Math.abs(d[b]) < th) b--;
    a = Math.max(0, a - 400); b = Math.min(d.length, b + 2000);
    if (b - a < 1000) return buf;
    const ch = [];
    for (let c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c).slice(a, b));
    return BB.DSP.makeBuffer(BB.Audio.ctx, ch, buf.sampleRate);
  }

  function slicesToPads() {
    const p = P(), m = p.sample;
    if (!m.slices.length && S() && S().buf) { m.div = 8; m.slices = BB.DSP.computeSlices(m, S().buf); }
    const n = m.slices.length;
    if (!n) { BB.UI.toast('Erst ein Sample laden'); return; }
    const sec16 = 60 / BB.project.bpm / 4;
    const D = S().buf.duration;
    p.notes = [];
    let step = 0;
    for (let i = 0; i < n && step < BB.project.length; i++) {
      const lenSteps = Math.max(1, Math.round(((m.slices[i][1] - m.slices[i][0]) * D) / sec16));
      p.notes.push({ s: step, p: 60 + i, v: 1, l: 1 });
      step += lenSteps;
    }
    p.mute = false;
    BB.UI.selectPart(SP.part);
    BB.UI.mode = 'keys';
    BB.$$('#modes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === 'keys'));
    p.keyBase = 60;
    BB.UI.renderPads(); BB.save(); BB.emit('notes', SP.part);
    BB.UI.flash(`SLICE ${m.div === 'AUTO' ? 'AUTO' : '1/' + m.div}`, '→ PADS');
    BB.UI.toast(`${n} Slices auf Pads & Sequenz gelegt`);
  }

  SP.init = function () {
    BB.on('open:samplerOverlay', open);
    bindWave();
    $('#spFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!BB.Audio.ready) return;
      try {
        $('#spInfo').textContent = 'LADE …';
        const buf = await BB.Audio.ctx.decodeAudioData(await f.arrayBuffer());
        await setRaw(buf, f.name.replace(/\.[^.]+$/, ''));
      } catch (er) { BB.UI.toast('Datei konnte nicht gelesen werden'); }
      e.target.value = '';
    });
    $('#spRec').addEventListener('click', toggleRec);
    $('#spDemo').addEventListener('click', async () => {
      $('#spInfo').textContent = 'RENDERE …';
      const buf = BB.Audio.demoLoop || (BB.Audio.demoLoop = await BB.Audio.renderDemoLoop());
      await setRaw(buf, 'DEMO BREAK 132');
      P().sample.bars = 2; reprocess();
    });
    $$('#spDiv button').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.div; P().sample.div = v === 'AUTO' ? 'AUTO' : +v;
      if (S() && S().buf) P().sample.slices = BB.DSP.computeSlices(P().sample, S().buf);
      BB.save(); render(); BB.UI.renderPads();
    }));
    $$('#spBars button').forEach((b) => b.addEventListener('click', () => {
      P().sample.bars = +b.dataset.bars;
      if (P().sample.stretch && P().sample.stretchMode === 'sync') reprocess();
      else { if (S() && S().buf) P().sample.slices = BB.DSP.computeSlices(P().sample, S().buf); BB.save(); render(); }
    }));
    $$('#spStretch button').forEach((b) => b.addEventListener('click', () => {
      const m = P().sample, v = b.dataset.st;
      m.stretch = v !== 'off'; if (m.stretch) m.stretchMode = v; else m.ratio = 1;
      reprocess();
    }));
    $('#spRatio').addEventListener('input', (e) => { $('#spRatioV').textContent = e.target.value + '%'; });
    $('#spRatio').addEventListener('change', (e) => { P().sample.ratio = e.target.value / 100; reprocess(); });
    $('#spReverse').addEventListener('click', () => { P().sample.reverse = !P().sample.reverse; reprocess(); });
    $('#spNorm').addEventListener('click', () => {
      const s = S(); if (!s || !s.raw) return;
      s.raw = BB.DSP.normalize(BB.Audio.ctx, s.raw);
      BB.IDB.put('part' + SP.part, Object.assign(BB.DSP.serializeBuffer(s.raw), { name: P().sample.name }));
      reprocess();
    });
    $('#spReset').addEventListener('click', () => {
      const m = P().sample, name = m.name;
      Object.assign(m, BB.defaultSampleMeta(), { name, bars: S() && S().raw ? BB.Audio.guessBars(S().raw.duration, BB.project.bpm) : 1 });
      reprocess();
    });
    $('#spPitch').addEventListener('input', (e) => {
      P().pitch = +e.target.value; $('#spPitchV').textContent = (P().pitch > 0 ? '+' : '') + P().pitch;
      if (SP.part === BB.UI.part) BB.UI.refreshKnobs(); BB.save();
    });
    $('#spDecay').addEventListener('input', (e) => {
      P().decay = e.target.value / 100; $('#spDecayV').textContent = P().decay >= 0.98 ? 'FULL' : e.target.value;
      if (SP.part === BB.UI.part) BB.UI.refreshKnobs(); BB.save();
    });
    $('#spToPads').addEventListener('click', slicesToPads);

    // Timestretch bei Tempoänderung nachziehen
    let t = null;
    BB.on('bpm', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        BB.project.parts.forEach((p, i) => {
          if (p.sample.stretch && p.sample.stretchMode === 'sync' && BB.Audio.samples[i] && BB.Audio.samples[i].raw) BB.Audio.processSample(i);
        });
        if (!$('#samplerOverlay').hidden) render();
      }, 450);
    });
    BB.on('frame', () => { if (!$('#samplerOverlay').hidden) drawWave(); });
    BB.on('param', () => { if (!$('#samplerOverlay').hidden) render(); });
  };
})(window.BB);
