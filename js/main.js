'use strict';
/* BUMBUM – Start */
(function (BB) {
  BB.project = BB.normalizeProject(BB.Store.load('bb-autosave') || BB.demoProject());

  BB.loadProject = function (d) {
    BB.Seq.stop();
    BB.project = BB.normalizeProject(d);
    const A = BB.Audio;
    if (A.ready) {
      A.applyAll(); A.syncTempo(); A.setMaster(BB.project.master);
      A.samples.forEach((s, i) => { if (s && s.raw) A.processSample(i); });
    }
    BB.UI.page = 0;
    BB.UI.refreshAll();
    BB.project.parts.forEach((_, i) => BB.emit('notes', i));
    BB.save();
  };

  async function restoreSamples() {
    const A = BB.Audio;
    for (let i = 0; i < 8; i++) {
      const st = await BB.IDB.get('part' + i);
      const buf = st ? BB.DSP.deserializeBuffer(A.ctx, st) : null;
      if (buf) { A.setSampleRaw(i, buf, null); continue; }
      const p = BB.project.parts[i];
      if (i === 7 && p.engine === 'SAMPLE') {
        A.demoLoop = await A.renderDemoLoop();
        if (!p.sample.name) Object.assign(p.sample, { name: 'DEMO BREAK 132', bars: 2, div: 8 });
        A.setSampleRaw(i, A.demoLoop, null);
      }
    }
    BB.UI.renderPads();
  }

  async function start() {
    const btn = document.getElementById('startBtn');
    BB.Audio.unlock(); // synchron im Klick – wichtig für iPhone/iPad
    btn.disabled = true; btn.textContent = 'Lade …';
    try {
      await BB.Audio.init();
      if (BB.Audio.ctx.state !== 'running') BB.Audio.ctx.resume().catch(() => {});
      await restoreSamples();
      document.getElementById('startOverlay').hidden = true;
      let pref = null; try { pref = localStorage.getItem('bb-mediaroute'); } catch (e) { /* */ }
      if (BB.Audio.isIOS && pref !== '0') BB.Audio.setMediaRoute(true);
      BB.UI.renderMuteBtn();
      BB.UI.flash('BUMBUM', `READY ${BB.project.bpm.toFixed(1)}`, 1600);
      BB.Audio.preview({ engine: 'KICK', decay: 0.3, level: 0.6 }, 60, 0.2);
      setTimeout(() => {
        if (BB.Audio.ctx.state !== 'running') BB.UI.toast('Ton blockiert – tippe irgendwo auf die App', 4000);
      }, 600);
    } catch (e) {
      console.error(e);
      btn.disabled = false; btn.textContent = 'Fehler – nochmal tippen';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    BB.UI.build();
    BB.PianoRoll.init();
    BB.Sampler.init();
    BB.Library.init();
    document.getElementById('startBtn').addEventListener('click', start, { once: false });
    // Bei jeder Berührung prüfen, ob Audio läuft (iOS unterbricht gern)
    const wake = () => {
      const A = BB.Audio;
      if (A.ctx && A.ctx.state !== 'running') A.unlock();
      if (A.ready) A.ensureMediaRoute();
    };
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
    // iOS: Audio nach Hintergrund wieder aufwecken
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && BB.Audio.ready && BB.Audio.ctx.state !== 'running') BB.Audio.ctx.resume();
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})(window.BB);
