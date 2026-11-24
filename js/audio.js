'use strict';
/* BUMBUM – Audio-Engine: Stimmen, Insert-Effekte, Touchpad-Effekte, Master */
(function (BB) {
  const A = BB.Audio = { ready: false, samples: [], lastTrig: new Array(8).fill(-1), lastSlice: [], openHats: [] };

  const WORKLET = `
class BBCrusher extends AudioWorkletProcessor {
  static get parameterDescriptors(){return [{name:'bits',defaultValue:16,minValue:1,maxValue:16},{name:'down',defaultValue:1,minValue:1,maxValue:64}]}
  constructor(){super();this.h=[0,0];this.c=0}
  process(ins,outs,p){
    const i=ins[0],o=outs[0]; if(!i||!i.length){return true}
    const step=Math.pow(2,p.bits[0]-1), down=Math.max(1,Math.round(p.down[0]));
    let c0=this.c;
    for(let ch=0;ch<o.length;ch++){
      const x=i[ch]||i[0], y=o[ch]; let c=c0, h=this.h[ch]||0;
      for(let n=0;n<y.length;n++){ if(c%down===0){h=Math.round(x[n]*step)/step} y[n]=h; c++ }
      this.h[ch]=h; this.c=c;
    }
    return true;
  }
}
registerProcessor('bb-crusher',BBCrusher);`;

  function makeIR(ctx, sec, pow) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, pow);
    }
    return b;
  }

  function driveCurve(a) {
    const n = 2048, c = new Float32Array(n);
    const k = 1 + a * 40;
    const norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / norm; }
    return c;
  }
  function stairCurve(bits) {
    const n = 4096, c = new Float32Array(n), st = Math.pow(2, bits - 1);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * st) / st; }
    return c;
  }

  function crusherNode(ctx) {
    if (A.hasWorklet) {
      try {
        const n = new AudioWorkletNode(ctx, 'bb-crusher', { outputChannelCount: [2] });
        return {
          input: n, output: n,
          set(a) { n.parameters.get('bits').value = 16 - a * 13; n.parameters.get('down').value = 1 + Math.round(a * a * 28); },
        };
      } catch (e) { /* fallback */ }
    }
    const ws = ctx.createWaveShaper();
    return { input: ws, output: ws, set(a) { ws.curve = stairCurve(Math.max(2, Math.round(16 - a * 13))); } };
  }

  /* ---------- Insert-Effekte pro Spur ---------- */
  function makeIFX(ctx, type) {
    const t = ctx.currentTime;
    switch (type) {
      case 'DRIVE': {
        const pre = ctx.createGain(), ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), post = ctx.createGain();
        ws.oversample = '4x'; lp.type = 'lowpass'; post.gain.value = 0.85;
        pre.connect(ws); ws.connect(lp); lp.connect(post);
        return { mode: 'insert', input: pre, output: post, set(a) { ws.curve = driveCurve(a); lp.frequency.setTargetAtTime(18000 - a * 11000, ctx.currentTime, 0.02); } };
      }
      case 'CRUSH': {
        const c = crusherNode(ctx), post = ctx.createGain(); post.gain.value = 0.9;
        c.output.connect(post);
        return { mode: 'insert', input: c.input, output: post, set: c.set };
      }
      case 'DELAY': {
        const inp = ctx.createGain(), dl = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), out = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 4200; fb.gain.value = 0.42;
        inp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out);
        const sync = () => { dl.delayTime.setTargetAtTime(BB.clamp((60 / BB.project.bpm) * 0.75, 0.01, 1.99), ctx.currentTime, 0.05); };
        sync();
        return { mode: 'send', input: inp, output: out, set() {}, sync };
      }
      case 'REVERB': {
        const cv = ctx.createConvolver(), out = ctx.createGain();
        cv.buffer = A.irLong; out.gain.value = 1.2; cv.connect(out);
        return { mode: 'send', input: cv, output: out, set() {} };
      }
      case 'CHORUS': {
        const inp = ctx.createGain(), out = ctx.createGain(), m = ctx.createChannelMerger(2);
        const mk = (rate, ch) => {
          const d = ctx.createDelay(0.1), l = ctx.createOscillator(), g = ctx.createGain();
          d.delayTime.value = 0.018; l.frequency.value = rate; g.gain.value = 0.004;
          l.connect(g); g.connect(d.delayTime); l.start(t);
          inp.connect(d); d.connect(m, 0, ch);
          return l;
        };
        const l1 = mk(0.7, 0), l2 = mk(1.05, 1);
        m.connect(out);
        return { mode: 'send', input: inp, output: out, set() {}, stop() { try { l1.stop(); l2.stop(); } catch (e) {} } };
      }
      case 'WAH': {
        const f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), g = ctx.createGain(), out = ctx.createGain();
        f.type = 'lowpass'; f.Q.value = 7; f.frequency.value = 900; lfo.type = 'sine';
        lfo.connect(g); g.connect(f.frequency); f.connect(out); out.gain.value = 1.1;
        const sync = () => { lfo.frequency.setValueAtTime(BB.project.bpm / 60 / 2, ctx.currentTime); };
        sync(); lfo.start(t);
        return {
          mode: 'insert', input: f, output: out, sync,
          set(a) { f.frequency.setTargetAtTime(400 + a * 1600, ctx.currentTime, 0.03); g.gain.setTargetAtTime(a * 1800, ctx.currentTime, 0.03); },
          stop() { try { lfo.stop(); } catch (e) {} },
        };
      }
      case 'COMP': {
        const c = ctx.createDynamicsCompressor(), mk = ctx.createGain();
        c.attack.value = 0.003; c.release.value = 0.12; c.knee.value = 6; c.connect(mk);
        return {
          mode: 'insert', input: c, output: mk,
          set(a) { c.threshold.value = -a * 40; c.ratio.value = 2 + a * 14; mk.gain.value = 1 + a * 2.2; },
        };
      }
      default: return null;
    }
  }

  class PartChain {
    constructor(ctx, dest) {
      this.ctx = ctx;
      this.input = ctx.createGain();
      this.dry = ctx.createGain(); this.send = ctx.createGain(); this.wet = ctx.createGain();
      this.pan = ctx.createStereoPanner(); this.level = ctx.createGain();
      this.input.connect(this.dry); this.dry.connect(this.pan);
      this.input.connect(this.send); this.wet.connect(this.pan);
      this.pan.connect(this.level); this.level.connect(dest);
      this.fx = null; this.type = 'OFF'; this.amount = 0;
      this.send.gain.value = 0; this.wet.gain.value = 0;
    }
    setType(type) {
      if (type === this.type && this.fx) return;
      if (this.fx) {
        try { this.send.disconnect(); this.fx.output.disconnect(); } catch (e) {}
        if (this.fx.stop) this.fx.stop();
      }
      this.type = type;
      this.fx = makeIFX(this.ctx, type);
      if (this.fx) { this.send.connect(this.fx.input); this.fx.output.connect(this.wet); }
      this.setAmount(this.amount);
    }
    setAmount(a) {
      this.amount = a;
      const t = this.ctx.currentTime, fx = this.fx;
      let d = 1, s = 0, w = 0;
      if (fx && fx.mode === 'insert') {
        if (a > 0.01) { d = 0; s = 1; w = 1; fx.set(a); }
      } else if (fx) { d = 1; s = 1; w = a; fx.set(a); }
      this.dry.gain.setTargetAtTime(d, t, 0.01);
      this.send.gain.setTargetAtTime(s, t, 0.01);
      this.wet.gain.setTargetAtTime(w, t, 0.01);
    }
    apply(P) {
      const t = this.ctx.currentTime;
      this.level.gain.setTargetAtTime(P.level * P.level, t, 0.02);
      this.pan.pan.setTargetAtTime(P.pan, t, 0.02);
      if (P.ifxType !== this.type) this.setType(P.ifxType);
      if (Math.abs(P.ifx - this.amount) > 1e-4 || !this.fx) this.setAmount(P.ifx);
    }
    sync() { if (this.fx && this.fx.sync) this.fx.sync(); }
  }

  /* ---------- Touchpad-Effekte (Master) ---------- */
  class PadFX {
    constructor(ctx) {
      this.ctx = ctx;
      const g = () => ctx.createGain();
      this.input = g(); this.out = g(); this.dry = g();
      this.input.connect(this.dry); this.dry.connect(this.out);
      this.sends = {};
      const send = (name) => { const s = g(); s.gain.value = 0; this.input.connect(s); this.sends[name] = s; return s; };
      // FILTER
      { const s = send('FILTER'); this.lp = ctx.createBiquadFilter(); this.hp = ctx.createBiquadFilter();
        this.lp.type = 'lowpass'; this.hp.type = 'highpass'; this.lp.frequency.value = 20000; this.hp.frequency.value = 10;
        s.connect(this.lp); this.lp.connect(this.hp); this.hp.connect(this.out); }
      // DELAY
      { const s = send('DELAY'); this.dl = ctx.createDelay(2); this.dlFb = g(); this.dlLp = ctx.createBiquadFilter();
        this.dlLp.type = 'lowpass'; this.dlLp.frequency.value = 5000; this.dlFb.gain.value = 0;
        s.connect(this.dl); this.dl.connect(this.dlLp); this.dlLp.connect(this.dlFb); this.dlFb.connect(this.dl);
        this.dlRet = g(); this.dlLp.connect(this.dlRet); this.dlRet.connect(this.out); }
      // BUILD
      { const s = send('BUILD'); this.bHp = ctx.createBiquadFilter(); this.bHp.type = 'highpass'; this.bHp.Q.value = 2;
        s.connect(this.bHp); this.bHp.connect(this.out);
        this.bRevSend = g(); this.bRevSend.gain.value = 0; this.bHp.connect(this.bRevSend);
        const cv = ctx.createConvolver(); cv.buffer = A.irLong; this.bRevSend.connect(cv); cv.connect(this.out);
        const ns = ctx.createBufferSource(); ns.buffer = A.noise; ns.loop = true;
        this.nBp = ctx.createBiquadFilter(); this.nBp.type = 'bandpass'; this.nBp.Q.value = 3;
        this.nGain = g(); this.nGain.gain.value = 0;
        ns.connect(this.nBp); this.nBp.connect(this.nGain); this.nGain.connect(this.out); ns.start(); }
      // GATE
      { const s = send('GATE'); this.vca = g(); this.vca.gain.value = 1;
        this.gLfo = ctx.createOscillator(); this.gLfo.type = 'square'; this.gDepth = g(); this.gDepth.gain.value = 0;
        this.gLfo.connect(this.gDepth); this.gDepth.connect(this.vca.gain); this.gLfo.start();
        s.connect(this.vca); this.vca.connect(this.out); }
      // ROLL (Stutter)
      { const s = send('ROLL'); this.rIn = g(); this.rIn.gain.value = 0; this.rDl = ctx.createDelay(2);
        this.rFb = g(); this.rFb.gain.value = 0; this.rOut = g(); this.rOut.gain.value = 0;
        s.connect(this.rIn); this.rIn.connect(this.rDl); this.rDl.connect(this.rFb); this.rFb.connect(this.rDl);
        this.rDl.connect(this.rOut); this.rOut.connect(this.out); this.sends.ROLL.gain.value = 1; this.rollRate = 0; }
      // CRUSH
      { const s = send('CRUSH'); this.cr = crusherNode(ctx); s.connect(this.cr.input); this.cr.output.connect(this.out); }
      this.active = null;
    }
    engage(type, x, y) {
      const t = this.ctx.currentTime;
      this.active = type;
      Object.entries(this.sends).forEach(([k, s]) => { if (k !== 'ROLL') s.gain.setTargetAtTime(k === type ? 1 : 0, t, 0.005); });
      const keepDry = type === 'DELAY' || type === 'ROLL';
      this.dry.gain.setTargetAtTime(keepDry ? 1 : 0, t, 0.005);
      this.rollRate = 0;
      this.move(x, y);
    }
    move(x, y) {
      const t = this.ctx.currentTime, beat = 60 / BB.project.bpm;
      switch (this.active) {
        case 'FILTER': {
          if (x < 0.5) {
            const f = 120 * Math.pow(20000 / 120, x * 2);
            this.lp.frequency.setTargetAtTime(f, t, 0.01); this.hp.frequency.setTargetAtTime(10, t, 0.01);
          } else {
            const f = 20 * Math.pow(6000 / 20, (x - 0.5) * 2);
            this.hp.frequency.setTargetAtTime(f, t, 0.01); this.lp.frequency.setTargetAtTime(20000, t, 0.01);
          }
          const q = 0.7 + y * 18; this.lp.Q.setTargetAtTime(q, t, 0.01); this.hp.Q.setTargetAtTime(q, t, 0.01);
          break;
        }
        case 'DELAY': {
          const divs = [0.125, 0.25, 0.375, 0.5, 0.75, 1];
          const d = divs[Math.min(divs.length - 1, Math.floor(x * divs.length))] * beat;
          this.dl.delayTime.setTargetAtTime(d, t, 0.03);
          this.dlFb.gain.setTargetAtTime(0.2 + y * 0.72, t, 0.02);
          this.dlRet.gain.setTargetAtTime(0.8, t, 0.02);
          break;
        }
        case 'BUILD': {
          this.bHp.frequency.setTargetAtTime(30 * Math.pow(150, x), t, 0.02);
          this.bRevSend.gain.setTargetAtTime(y * 1.2, t, 0.03);
          this.nBp.frequency.setTargetAtTime(400 * Math.pow(30, x), t, 0.03);
          this.nGain.gain.setTargetAtTime(y * 0.18 * (0.3 + x), t, 0.03);
          break;
        }
        case 'GATE': {
          const divs = [1, 0.5, 0.25, 0.125, 0.0625];
          const d = divs[Math.min(divs.length - 1, Math.floor(x * divs.length))] * beat;
          this.gLfo.frequency.setValueAtTime(1 / d, t);
          this.vca.gain.setValueAtTime(1 - y * 0.5, t);
          this.gDepth.gain.setValueAtTime(y * 0.5, t);
          break;
        }
        case 'ROLL': {
          const divs = [1, 0.5, 0.25, 0.125, 0.0625];
          const d = divs[Math.min(divs.length - 1, Math.floor(x * divs.length))] * beat;
          if (d !== this.rollRate) {
            this.rollRate = d;
            this.rDl.delayTime.setValueAtTime(d, t);
            this.rFb.gain.cancelScheduledValues(t); this.rIn.gain.cancelScheduledValues(t);
            this.rFb.gain.setValueAtTime(0, t); this.rIn.gain.setValueAtTime(1, t);
            this.rIn.gain.setValueAtTime(0, t + d); this.rFb.gain.setValueAtTime(1, t + d);
            this.rOut.gain.setValueAtTime(1, t + d * 0.999);
            this.dry.gain.cancelScheduledValues(t); this.dry.gain.setValueAtTime(0, t + d);
          }
          this.rFb.gain.setTargetAtTime(Math.max(0.5, 1 - y * 0.5), t + this.rollRate, 0.01);
          break;
        }
        case 'CRUSH': this.cr.set(0.25 + x * 0.75); break;
        default: break;
      }
    }
    release() {
      const t = this.ctx.currentTime;
      Object.entries(this.sends).forEach(([k, s]) => { if (k !== 'ROLL') s.gain.setTargetAtTime(0, t, 0.01); });
      this.dry.gain.cancelScheduledValues(t); this.dry.gain.setTargetAtTime(1, t, 0.01);
      this.rIn.gain.cancelScheduledValues(t); this.rIn.gain.setValueAtTime(0, t);
      this.rFb.gain.cancelScheduledValues(t); this.rFb.gain.setTargetAtTime(0, t, 0.01);
      this.rOut.gain.cancelScheduledValues(t); this.rOut.gain.setTargetAtTime(0, t, 0.01);
      this.nGain.gain.setTargetAtTime(0, t, 0.05); this.bRevSend.gain.setTargetAtTime(0, t, 0.3);
      this.dlFb.gain.setTargetAtTime(0, t, 0.2);
      this.active = null;
    }
  }

  /* ---------- Stimmen ---------- */
  const V = BB.Voices = {};

  function env(ctx, t, atk, len, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + atk + len);
    return g;
  }
  function osc(ctx, type, f, t) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
  function noiseSrc(ctx, noise, t) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.loopStart = Math.random(); return s; }

  /**
   * Spielt eine Note. dur == null → offenes Gate (Live), Rückgabe: Handle mit release(t)
   * res = {noise, ir}, S = Sample-Laufzeitobjekt
   */
  V.trigger = function (ctx, dest, P, t, midi, vel, dur, res, S, hooks) {
    const eng = P.engine;
    if (eng === 'SYNTH') return BB.SynthVoice(ctx, dest, P, t, midi, vel, dur, res, hooks && hooks.part != null ? hooks.part : null);
    const semis = P.pitch + (midi - 60);
    const r = Math.pow(2, semis / 12);
    const atk = 0.0008 + P.attack * P.attack * 1.5;
    const dec = 0.015 + P.decay * P.decay * 2.5;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    const base = 30 * Math.pow(620, P.cutoff);
    f.Q.value = 0.4 + P.reso * P.reso * 24;
    if (Math.abs(P.egInt) > 0.01) {
      const peak = BB.clamp(base * Math.pow(2, P.egInt * 7), 20, 20000);
      f.frequency.setValueAtTime(base, t);
      f.frequency.linearRampToValueAtTime(peak, t + Math.max(0.002, atk));
      f.frequency.setTargetAtTime(base, t + atk, dec / 3);
    } else f.frequency.setValueAtTime(base, t);
    const gate = ctx.createGain();
    f.connect(gate); gate.connect(dest);
    const srcs = [];
    let end = t + 0.5;
    const start = (n) => { srcs.push(n); n.start(t); return n; };

    if (BB.isDrum(eng)) {
      const da = Math.min(atk, 0.05);
      switch (eng) {
        case 'KICK': {
          const o = start(osc(ctx, 'sine', 300 * r, t));
          o.frequency.exponentialRampToValueAtTime(110 * r, t + 0.012);
          o.frequency.exponentialRampToValueAtTime(46 * r, t + 0.07 + P.decay * 0.06);
          const len = 0.12 + P.decay * 1.3;
          const g = env(ctx, t, da + 0.001, len, vel); o.connect(g); g.connect(f);
          const n = start(noiseSrc(ctx, res.noise, t)); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
          const gn = env(ctx, t, 0.0005, 0.012, vel * 0.35); n.connect(hp); hp.connect(gn); gn.connect(f);
          end = t + da + len; break;
        }
        case 'SNARE': {
          const o = start(osc(ctx, 'triangle', 200 * r, t)); o.frequency.exponentialRampToValueAtTime(165 * r, t + 0.06);
          const g = env(ctx, t, da + 0.001, 0.12, vel * 0.8); o.connect(g); g.connect(f);
          const n = start(noiseSrc(ctx, res.noise, t)); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300 * r;
          const len = 0.09 + P.decay * 0.5; const gn = env(ctx, t, da + 0.001, len, vel * 0.75);
          n.connect(hp); hp.connect(gn); gn.connect(f); end = t + da + len; break;
        }
        case 'CLAP': {
          const n = start(noiseSrc(ctx, res.noise, t)); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
          bp.frequency.value = 1150 * r; bp.Q.value = 1.3; const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(vel, t + k * 0.011); g.gain.exponentialRampToValueAtTime(0.06, t + k * 0.011 + 0.009); }
          const tail = 0.08 + P.decay * 0.6;
          g.gain.setValueAtTime(vel * 0.9, t + 0.034); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.034 + tail);
          n.connect(bp); bp.connect(g); g.connect(f); end = t + 0.034 + tail; break;
        }
        case 'HH CL': case 'HH OP': {
          const open = eng === 'HH OP';
          const mix = ctx.createGain(); mix.gain.value = 0.25;
          [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((m) => start(osc(ctx, 'square', 40 * m * r, t)).connect(mix));
          const n = start(noiseSrc(ctx, res.noise, t)); const ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(ng); ng.connect(mix);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10000; bp.Q.value = 0.8;
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
          const len = open ? 0.12 + P.decay * 0.9 : 0.02 + P.decay * 0.14;
          const g = env(ctx, t, da + 0.0005, len, vel * 0.9);
          mix.connect(bp); bp.connect(hp); hp.connect(g);
          const choke = ctx.createGain(); g.connect(choke); choke.connect(f);
          if (open) { A.openHats.push({ g: choke, end: t + len }); }
          else {
            A.openHats = A.openHats.filter((h) => h.end > t);
            A.openHats.forEach((h) => { if (h.g.context === ctx) h.g.gain.setTargetAtTime(0, t, 0.006); });
          }
          end = t + da + len; break;
        }
        case 'TOM': {
          const o = start(osc(ctx, 'sine', 230 * r, t)); o.frequency.exponentialRampToValueAtTime(115 * r, t + 0.25);
          const len = 0.18 + P.decay * 0.9; const g = env(ctx, t, da + 0.001, len, vel); o.connect(g); g.connect(f);
          end = t + da + len; break;
        }
        case 'RIM': {
          const o = start(osc(ctx, 'triangle', 1750 * r, t)), o2 = start(osc(ctx, 'square', 480 * r, t));
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900 * r; bp.Q.value = 2;
          const len = 0.025 + P.decay * 0.08; const g = env(ctx, t, 0.0005, len, vel * 0.9);
          o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(f); end = t + len; break;
        }
        default: break;
      }
      gate.gain.setValueAtTime(1, t);
      srcs.forEach((s) => s.stop(end + 0.05));
      if (hooks) hooks(end);
      return { release() {} };
    }

    /* Synths, Noise, Sample: AD-Hüllkurve + Gate */
    const amp = ctx.createGain();
    amp.connect(f);
    let natural = Infinity;
    if (eng === 'SAMPLE') {
      if (!S || !S.buf) { try { f.disconnect(); } catch (e) {} return { release() {} }; }
      const src = ctx.createBufferSource(); src.buffer = S.buf;
      const D = S.buf.duration, meta = P.sample;
      let off, len, rate = Math.pow(2, P.pitch / 12);
      const sl = meta.slices || [];
      if (sl.length) {
        const n = sl.length, idx = (((midi - 60) % n) + n) % n;
        off = sl[idx][0] * D; len = (sl[idx][1] - sl[idx][0]) * D;
        A.lastSlice[hooks && hooks.part != null ? hooks.part : 0] = { idx, t };
        if (S.onSlice) S.onSlice(idx, t);
      } else {
        off = meta.start * D; len = (meta.end - meta.start) * D; rate *= Math.pow(2, (midi - 60) / 12);
      }
      src.playbackRate.value = rate;
      const real = len / rate;
      const hold = P.decay >= 0.98 ? real : Math.min(real, 0.02 + P.decay * P.decay * 3);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(vel, t + Math.max(0.002, atk));
      amp.gain.setValueAtTime(vel, t + Math.max(0.003, hold - 0.008));
      amp.gain.linearRampToValueAtTime(0, t + Math.max(0.005, hold));
      src.connect(amp); src.start(t, off, len + 0.01);
      srcs.push(src); natural = t + hold;
    } else {
      const fq = BB.mtof(midi + P.pitch);
      const g = ctx.createGain();
      if (eng === 'SUPERSAW') {
        g.gain.value = 0.32;
        for (let k = 0; k < 7; k++) { const o = start(osc(ctx, 'sawtooth', fq, t)); o.detune.value = (k - 3) * 9; o.connect(g); }
      } else if (eng === 'CHORD') {
        g.gain.value = 0.3;
        [0, 3, 7, 10].forEach((iv, k) => { const o = start(osc(ctx, 'sawtooth', fq * Math.pow(2, iv / 12), t)); o.detune.value = k % 2 ? 6 : -6; o.connect(g); });
      } else if (eng === 'FM') {
        const c = start(osc(ctx, 'sine', fq, t)), m = start(osc(ctx, 'sine', fq * 2, t)), mg = ctx.createGain();
        mg.gain.setValueAtTime(fq * 4, t); mg.gain.setTargetAtTime(fq * 0.6, t, dec / 2);
        m.connect(mg); mg.connect(c.frequency); c.connect(g); g.gain.value = 0.8;
      } else if (eng === 'NOISE') {
        const n = start(noiseSrc(ctx, res.noise, t)); n.connect(g); g.gain.value = 0.6;
      } else {
        const type = { SAW: 'sawtooth', SQUARE: 'square', TRI: 'triangle', SINE: 'sine' }[eng] || 'sawtooth';
        const o = start(osc(ctx, type, fq, t)); o.connect(g);
        g.gain.value = type === 'square' ? 0.5 : type === 'sawtooth' ? 0.6 : 0.9;
        if (eng === 'SAW') { const o2 = start(osc(ctx, 'sawtooth', fq, t)); o2.detune.value = 7; o2.connect(g); g.gain.value = 0.38; }
      }
      g.connect(amp);
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(vel, t + atk);
      amp.gain.setTargetAtTime(P.decay > 0.97 ? vel * 0.9 : 0, t + atk, dec * 0.45);
      natural = P.decay > 0.97 ? Infinity : t + atk + dec * 3;
    }

    const stopAll = (te) => { srcs.forEach((s) => { try { s.stop(te); } catch (e) {} }); };
    if (dur != null) {
      const ge = Math.min(natural, t + Math.max(dur, atk + 0.005));
      gate.gain.setValueAtTime(1, t);
      gate.gain.setTargetAtTime(0, ge, 0.012);
      stopAll(ge + 0.12);
      if (typeof hooks === 'function') hooks(ge);
      return { release() {} };
    }
    gate.gain.setValueAtTime(1, t);
    if (natural !== Infinity) stopAll(natural + 0.1);
    return {
      release(tr) {
        tr = Math.max(tr || ctx.currentTime, t + 0.005);
        gate.gain.setTargetAtTime(0, tr, 0.015);
        stopAll(tr + 0.15);
      },
    };
  };

  /* ---------- Initialisierung ---------- */
  /* MUSS synchron im Klick-Handler laufen (iOS/Safari) */
  A.unlock = function () {
    if (!A.ctx) A.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const ctx = A.ctx;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* */ }
    try { ctx.resume(); } catch (e) { /* */ }
    try {
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* */ }
    // iOS: stilles <audio>-Element schaltet die Audio-Session auf "Wiedergabe" (ignoriert Stummschalter)
    try {
      if (!A.silentEl) {
        const el = A.silentEl = document.createElement('audio');
        el.src = silentWav(); el.loop = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
        el.volume = 0.01;
        document.body.appendChild(el);
      }
      const pr = A.silentEl.play(); if (pr && pr.catch) pr.catch(() => {});
    } catch (e) { /* */ }
    return ctx;
  };

  function silentWav() {
    const sr = 8000, n = 2000, bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
    const ws = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * 2, true);
    let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
  }

  A.init = async function () {
    const ctx = A.unlock();
    const len = ctx.sampleRate * 2;
    A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = A.noise.getChannelData(0); for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    A.irLong = makeIR(ctx, 2.6, 3);
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      if (!ctx.audioWorklet) throw new Error('no worklet');
      await Promise.race([ctx.audioWorklet.addModule(url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))]);
      A.hasWorklet = true;
    } catch (e) { A.hasWorklet = false; }

    A.bus = ctx.createGain();
    A.padfx = new PadFX(ctx);
    A.bus.connect(A.padfx.input);
    A.masterGain = ctx.createGain(); A.masterGain.gain.value = BB.project.master;
    A.limiter = ctx.createDynamicsCompressor();
    A.limiter.threshold.value = -4; A.limiter.knee.value = 4; A.limiter.ratio.value = 14;
    A.limiter.attack.value = 0.002; A.limiter.release.value = 0.12;
    A.analyser = ctx.createAnalyser(); A.analyser.fftSize = 1024;
    A.padfx.out.connect(A.masterGain); A.masterGain.connect(A.limiter); A.limiter.connect(A.analyser); A.analyser.connect(ctx.destination);
    A.parts = [];
    for (let i = 0; i < 8; i++) A.parts.push(new PartChain(ctx, A.bus));
    A.applyAll();
    A.ready = true;
  };

  /* iOS: Ausgabe über ein <audio>-Element (Medienwiedergabe ignoriert den Stummschalter) */
  A.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  A.mediaRoute = false;
  A.setMediaRoute = function (on) {
    if (!A.ready) return;
    const ctx = A.ctx;
    if (!A.mediaDest) A.mediaDest = ctx.createMediaStreamDestination();
    if (!A.routeEl) {
      const el = A.routeEl = document.createElement('audio');
      el.setAttribute('playsinline', ''); el.setAttribute('x-webkit-airplay', 'deny'); el.autoplay = true;
      document.body.appendChild(el);
    }
    try { A.analyser.disconnect(); } catch (e) { /* */ }
    if (on) {
      A.analyser.connect(A.mediaDest);
      if (A.routeEl.srcObject !== A.mediaDest.stream) A.routeEl.srcObject = A.mediaDest.stream;
      const pr = A.routeEl.play(); if (pr && pr.catch) pr.catch(() => {});
    } else {
      A.analyser.connect(ctx.destination);
      A.routeEl.pause();
    }
    A.mediaRoute = on;
  };
  A.ensureMediaRoute = function () {
    if (A.mediaRoute && A.routeEl && A.routeEl.paused) { const pr = A.routeEl.play(); if (pr && pr.catch) pr.catch(() => {}); }
  };

  /* Vorhören von Library-Presets über eine eigene Kette */
  A.preview = function (params, midi, dur) {
    if (!A.ready) return;
    if (!A.prevChain) A.prevChain = new PartChain(A.ctx, A.bus);
    const P = Object.assign(BB.defaultPart(params.engine), params);
    if (params.syn) P.syn = BB.mergeSyn(params.syn);
    A.prevChain.apply(P);
    V.trigger(A.ctx, A.prevChain.input, P, A.ctx.currentTime + 0.01, midi, 0.95, dur || 0.4, { noise: A.noise }, null);
  };
  A.previewBuffer = function (buf) {
    if (!A.ready || !buf) return;
    if (A.prevSrc) { try { A.prevSrc.stop(); } catch (e) {} }
    const s = A.prevSrc = A.ctx.createBufferSource(), g = A.ctx.createGain();
    g.gain.value = 0.9; s.buffer = buf; s.connect(g); g.connect(A.bus); s.start();
  };
  A.stopPreview = function () { if (A.prevSrc) { try { A.prevSrc.stop(); } catch (e) {} A.prevSrc = null; } };

  A.applyAll = function () { if (!A.parts) return; BB.project.parts.forEach((p, i) => A.parts[i].apply(p)); };
  A.applyPart = function (i) { if (A.parts) A.parts[i].apply(BB.project.parts[i]); };
  A.syncTempo = function () { if (A.parts) A.parts.forEach((p) => p.sync()); };
  A.setMaster = function (v) { if (A.masterGain) A.masterGain.gain.setTargetAtTime(v, A.ctx.currentTime, 0.02); };

  A.playNote = function (i, t, midi, vel, dur) {
    if (!A.ready) return null;
    const P = BB.project.parts[i];
    A.lastTrig[i] = t;
    const hooks = (e) => {}; hooks.part = i;
    return V.trigger(A.ctx, A.parts[i].input, P, t, midi, vel, dur, { noise: A.noise }, A.samples[i], hooks);
  };

  A.now = () => (A.ctx ? A.ctx.currentTime : 0);

  /* ---------- Samples ---------- */
  A.setSampleRaw = function (i, raw, name) {
    const S = A.samples[i] = A.samples[i] || {};
    S.raw = raw;
    const meta = BB.project.parts[i].sample;
    if (name != null) meta.name = name;
    A.processSample(i);
  };

  A.processSample = function (i) {
    const S = A.samples[i]; if (!S || !S.raw) return;
    const meta = BB.project.parts[i].sample;
    let b = S.raw;
    if (meta.reverse) b = BB.DSP.reverse(A.ctx, b);
    if (meta.stretch) {
      let ratio = meta.ratio;
      if (meta.stretchMode === 'sync') {
        const region = b.duration * (meta.end - meta.start);
        const target = (meta.bars * 4 * 60) / BB.project.bpm;
        ratio = target / Math.max(0.01, region);
        meta.ratio = ratio;
      }
      b = BB.DSP.timeStretch(A.ctx, b, ratio);
    }
    S.buf = b;
    S.peaks = BB.DSP.peaks(b, 1200);
    meta.slices = BB.DSP.computeSlices(meta, b);
  };

  A.guessBars = function (dur, bpm) {
    const bars = dur / ((4 * 60) / bpm);
    const opts = [0.5, 1, 2, 4, 8, 16];
    let best = 1, bd = Infinity;
    opts.forEach((o) => { const d = Math.abs(Math.log2(bars / o)); if (d < bd) { bd = d; best = o; } });
    return best;
  };

  /* Demo-Loop offline rendern (2 Takte Breakbeat mit Akkord) */
  A.renderDemoLoop = async function () {
    const bpm = 132, sr = 44100, sec16 = 60 / bpm / 4, steps = 32;
    const total = steps * sec16;
    const oc = new OfflineAudioContext(2, Math.ceil(sr * total), sr);
    const noise = oc.createBuffer(1, sr * 2, sr); const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const out = oc.createGain(); out.gain.value = 0.8; out.connect(oc.destination);
    const res = { noise };
    const P = (e, o) => Object.assign(BB.defaultPart(e), o || {});
    const kick = P('KICK', { decay: 0.35 }), sn = P('SNARE', { decay: 0.4 }), hh = P('HH CL', { decay: 0.2 }), oh = P('HH OP', { decay: 0.3 });
    const stab = P('CHORD', { cutoff: 0.7, egInt: 0.35, decay: 0.35 });
    const k = [0, 10, 16, 19, 26], s = [4, 12, 20, 23, 28], st = [0, 7, 14, 22, 30];
    for (let i = 0; i < steps; i++) {
      const t = i * sec16 + 0.01;
      if (k.includes(i)) V.trigger(oc, out, kick, t, 60, 1, 0.1, res);
      if (s.includes(i)) V.trigger(oc, out, sn, t, 60, i === 23 ? 0.5 : 0.95, 0.1, res);
      if (i % 2 === 0 && i % 8 !== 6) V.trigger(oc, out, hh, t, 60, i % 4 === 2 ? 0.9 : 0.5, 0.05, res);
      if (i % 8 === 6) V.trigger(oc, out, oh, t, 60, 0.7, 0.1, res);
      if (st.includes(i)) V.trigger(oc, out, stab, t, i < 16 ? 63 : 60, 0.6, sec16 * 2, res);
    }
    const buf = await oc.startRendering();
    return buf;
  };
})(window.BB);
