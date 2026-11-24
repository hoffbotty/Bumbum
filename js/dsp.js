'use strict';
/* BUMBUM – DSP-Helfer: Timestretch (WSOLA), Slicing, Transienten, WAV */
(function (BB) {
  const D = BB.DSP = {};

  function makeBuffer(ctx, chData, sr) {
    const b = ctx.createBuffer(chData.length, chData[0].length, sr);
    chData.forEach((d, i) => b.copyToChannel ? b.copyToChannel(d, i) : b.getChannelData(i).set(d));
    return b;
  }
  D.makeBuffer = makeBuffer;

  function channels(buf) {
    const a = [];
    for (let c = 0; c < buf.numberOfChannels; c++) a.push(buf.getChannelData(c));
    return a;
  }

  D.reverse = function (ctx, buf) {
    const out = channels(buf).map((d) => { const r = new Float32Array(d.length); for (let i = 0; i < d.length; i++) r[i] = d[d.length - 1 - i]; return r; });
    return makeBuffer(ctx, out, buf.sampleRate);
  };

  D.normalize = function (ctx, buf) {
    const ch = channels(buf);
    let peak = 0;
    ch.forEach((d) => { for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } });
    if (peak < 1e-5) return buf;
    const g = 0.98 / peak;
    return makeBuffer(ctx, ch.map((d) => d.map((x) => x * g)), buf.sampleRate);
  };

  /**
   * Timestretch per WSOLA: ändert die Länge, nicht die Tonhöhe.
   * ratio > 1 = länger/langsamer, ratio < 1 = kürzer/schneller.
   */
  D.timeStretch = function (ctx, buf, ratio) {
    if (!buf || Math.abs(ratio - 1) < 0.002) return buf;
    ratio = BB.clamp(ratio, 0.2, 5);
    const sr = buf.sampleRate;
    const src = channels(buf);
    const N = buf.length;
    const W = sr > 60000 ? 4096 : 2048;
    const Hs = W / 4;
    const Ha = Hs / ratio;
    const tol = W / 8;
    const outLen = Math.max(1, Math.round(N * ratio));
    const mono = new Float32Array(N);
    src.forEach((d) => { for (let i = 0; i < N; i++) mono[i] += d[i] / src.length; });
    const win = new Float32Array(W);
    for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
    const out = src.map(() => new Float32Array(outLen + W));
    const norm = new Float32Array(outLen + W);
    const at = (arr, i) => (i >= 0 && i < N ? arr[i] : 0);
    const L = W / 2;
    let prev = 0;
    for (let k = 0, op = 0; op < outLen; k++, op += Hs) {
      const ideal = Math.round(k * Ha);
      let best = ideal;
      if (k > 0) {
        const target = prev + Hs;
        let bestC = -Infinity;
        for (let d = -tol; d <= tol; d += 2) {
          const cand = ideal + d;
          let c = 0;
          for (let i = 0; i < L; i += 4) c += at(mono, target + i) * at(mono, cand + i);
          if (c > bestC) { bestC = c; best = cand; }
        }
        // Feinsuche
        const coarse = best;
        for (let d = -1; d <= 1; d += 2) {
          const cand = coarse + d;
          let c = 0;
          for (let i = 0; i < L; i += 4) c += at(mono, target + i) * at(mono, cand + i);
          if (c > bestC) { bestC = c; best = cand; }
        }
      }
      for (let ch = 0; ch < src.length; ch++) {
        const s = src[ch], o = out[ch];
        for (let i = 0; i < W; i++) o[op + i] += at(s, best + i) * win[i];
      }
      for (let i = 0; i < W; i++) norm[op + i] += win[i];
      prev = best;
    }
    const res = out.map((o) => {
      const r = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) { const n = norm[i]; r[i] = n > 1e-3 ? o[i] / n : o[i]; }
      return r;
    });
    return makeBuffer(ctx, res, sr);
  };

  /* Transientenerkennung: liefert Positionen (0..1 vom Gesamtbuffer) im Bereich [start,end] */
  D.detectTransients = function (buf, start, end, maxCount) {
    const d = channels(buf)[0];
    const sr = buf.sampleRate;
    const a = Math.floor(start * d.length), b = Math.floor(end * d.length);
    const hop = 256, win = 512;
    const env = [];
    for (let i = a; i + win < b; i += hop) {
      let e = 0;
      for (let j = 0; j < win; j++) { const x = d[i + j]; e += x * x; }
      env.push(Math.sqrt(e / win));
    }
    const peak = env.reduce((m, x) => Math.max(m, x), 0) || 1;
    const pts = [a / d.length];
    const minGap = Math.round((0.07 * sr) / hop);
    let last = -minGap;
    for (let i = 2; i < env.length; i++) {
      const prevAvg = (env[i - 1] + env[i - 2]) / 2 + 1e-4;
      if (env[i] / prevAvg > 1.9 && env[i] > peak * 0.12 && i - last >= minGap) {
        const pos = (a + i * hop) / d.length;
        if (pos - pts[pts.length - 1] > 0.01) pts.push(pos);
        last = i;
      }
    }
    let res = pts.slice(0, maxCount || 16);
    const slices = [];
    for (let i = 0; i < res.length; i++) slices.push([res[i], i + 1 < res.length ? res[i + 1] : end]);
    return slices;
  };

  D.computeSlices = function (meta, buf) {
    if (!buf || !meta.div) return [];
    if (meta.div === 'AUTO') return D.detectTransients(buf, meta.start, meta.end, 16);
    const n = Math.min(64, Math.max(1, meta.bars * meta.div));
    const len = (meta.end - meta.start) / n;
    const out = [];
    for (let i = 0; i < n; i++) out.push([meta.start + i * len, meta.start + (i + 1) * len]);
    return out;
  };

  /* Peaks für Waveform-Anzeige */
  D.peaks = function (buf, n) {
    const d = channels(buf)[0];
    const res = new Float32Array(n);
    const step = d.length / n;
    for (let i = 0; i < n; i++) {
      let m = 0;
      const a = Math.floor(i * step), b = Math.min(d.length, Math.floor((i + 1) * step));
      for (let j = a; j < b; j += 4) { const v = Math.abs(d[j]); if (v > m) m = v; }
      res[i] = m;
    }
    return res;
  };

  D.encodeWAV = function (buf) {
    const ch = channels(buf);
    const n = buf.length, nc = ch.length, sr = buf.sampleRate;
    const ab = new ArrayBuffer(44 + n * nc * 2);
    const v = new DataView(ab);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true);
    v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * nc * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
      const s = BB.clamp(ch[c][i], -1, 1);
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  };

  D.serializeBuffer = (buf) => ({ sr: buf.sampleRate, ch: channels(buf).map((d) => new Float32Array(d)) });
  D.deserializeBuffer = (ctx, o) => (o && o.ch && o.ch.length ? makeBuffer(ctx, o.ch, o.sr) : null);
})(window.BB);
