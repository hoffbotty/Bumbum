'use strict';
/* BUMBUM – Sequencer mit Lookahead-Scheduler */
(function (BB) {
  const S = BB.Seq = { playing: false, step: 0, nextTime: 0, queue: [], recent: [], recording: false, timer: null };

  S.sec16 = () => 60 / BB.project.bpm / 4;

  S.start = function () {
    const A = BB.Audio; if (!A.ready) return;
    if (A.ctx.state !== 'running') A.ctx.resume();
    S.playing = true; S.step = 0; S.queue = []; S.recent = [];
    S.nextTime = A.ctx.currentTime + 0.06;
    clearInterval(S.timer);
    S.timer = setInterval(S.tick, 20);
    S.tick();
    BB.emit('transport');
  };

  S.stop = function () {
    S.playing = false; clearInterval(S.timer); S.timer = null; S.queue = [];
    BB.emit('transport'); BB.emit('playhead', -1);
  };

  S.toggle = () => (S.playing ? S.stop() : S.start());

  S.tick = function () {
    const A = BB.Audio;
    const ahead = A.ctx.currentTime + 0.12;
    while (S.nextTime < ahead) {
      S.scheduleStep(S.step, S.nextTime);
      S.nextTime += S.sec16();
      S.step++;
    }
  };

  S.scheduleStep = function (step, t) {
    const P = BB.project, L = P.length, s = step % L, sec16 = S.sec16();
    const tt = t + (s % 2 === 1 ? P.swing * sec16 * 0.5 : 0);
    const anySolo = P.parts.some((p) => p.solo);
    P.parts.forEach((part, i) => {
      if (part.mute || (anySolo && !part.solo)) return;
      for (const n of part.notes) if (n.s === s) BB.Audio.playNote(i, tt, n.p, n.v, n.l * sec16 * 0.96);
    });
    S.queue.push({ t: tt, s });
    S.recent.push({ t: tt, s });
    if (S.recent.length > 8) S.recent.shift();
    if (BB.Metro && BB.Metro.on && s % 4 === 0) BB.Metro.click(tt, s === 0);
  };

  /* nächster Step zu einer Audiozeit (für Live-Aufnahme) */
  S.nearestStep = function (time) {
    let best = null, bd = Infinity;
    const sec16 = S.sec16();
    S.recent.forEach((e) => { const d = Math.abs(e.t - time); if (d < bd) { bd = d; best = e; } });
    if (!best) return 0;
    if (time - best.t > sec16 / 2) return (best.s + 1) % BB.project.length;
    return best.s;
  };

  /* aktueller Step für den Playhead (vom UI-Loop aufgerufen) */
  S.poll = function () {
    if (!S.playing) return;
    const now = BB.Audio.ctx.currentTime;
    let cur = null;
    while (S.queue.length && S.queue[0].t <= now) cur = S.queue.shift();
    if (cur) BB.emit('playhead', cur.s);
  };

  /* Live-Aufnahme */
  S.recordNote = function (part, pitch, vel, time) {
    if (!S.recording || !S.playing) return null;
    const s = S.nearestStep(time);
    const notes = BB.project.parts[part].notes;
    let n = notes.find((x) => x.s === s && x.p === pitch);
    if (!n) { n = { s, p: pitch, v: vel, l: 1 }; notes.push(n); }
    else n.v = vel;
    BB.emit('notes', part);
    return n;
  };

  /* Mini-Event-System */
  const L = {};
  BB.on = (e, f) => { (L[e] = L[e] || []).push(f); };
  BB.emit = (e, a) => { (L[e] || []).forEach((f) => f(a)); };

  BB.Metro = {
    on: false,
    click(t, accent) {
      const A = BB.Audio, ctx = A.ctx;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1760 : 1320;
      g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o.connect(g); g.connect(A.masterGain); o.start(t); o.stop(t + 0.05);
    },
  };
})(window.BB);
