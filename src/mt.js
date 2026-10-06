/* ตัวแปลออฟไลน์: ตัวตัดคำแบบ Unigram (SentencePiece) และวงถอดรหัสของโมเดล QuickMT en-th บน ONNX Runtime Web */
(function (root) {
  'use strict';
  function Tok(json) {
    const v = json.model.vocab; this.pieces = v.map(x => x[0]); this.map = new Map(); this.maxLen = 1; let min = 0;
    v.forEach((x, i) => { if (!this.map.has(x[0])) this.map.set(x[0], [i, x[1]]); const n = Array.from(x[0]).length; if (n > this.maxLen && i > 259) this.maxLen = n; if (x[1] < min) min = x[1]; });
    this.unk = min - 10; this.byte0 = this.map.get('<0x00>') ? this.map.get('<0x00>')[0] : -1; this.maxLen = Math.min(this.maxLen, 32);
  }
  Tok.prototype.encode = function (text) {
    const ids = [], te = new TextEncoder();
    for (const w of text.normalize('NFKC').replace(/\s+/g, ' ').trim().split(' ')) {
      if (!w) continue;
      const ch = Array.from('▁' + w), n = ch.length, best = new Float64Array(n + 1).fill(-Infinity), back = new Array(n + 1); best[0] = 0;
      for (let i = 0; i < n; i++) {
        if (best[i] === -Infinity) continue;
        let s = '', hit1 = false;
        for (let l = 1; l <= this.maxLen && i + l <= n; l++) {
          s += ch[i + l - 1]; const e = this.map.get(s);
          if (e && e[0] > 3 && !(e[0] >= this.byte0 && e[0] < this.byte0 + 256)) { if (l === 1) hit1 = true; const sc = best[i] + e[1]; if (sc > best[i + l]) { best[i + l] = sc; back[i + l] = [i, e[0]]; } }
        }
        if (!hit1) { const sc = best[i] + this.unk; if (sc > best[i + 1]) { best[i + 1] = sc; back[i + 1] = [i, -1, ch[i]]; } }
      }
      const out = []; for (let p = n; p > 0; p = back[p][0]) out.push(back[p]);
      for (let k = out.length - 1; k >= 0; k--) { const b = out[k]; if (b[1] >= 0) ids.push(b[1]); else if (this.byte0 >= 0) for (const x of te.encode(b[2])) ids.push(this.byte0 + x); else ids.push(0); }
    }
    return ids;
  };
  Tok.prototype.decode = function (ids) {
    let s = '', bytes = []; const flush = () => { if (bytes.length) { s += new TextDecoder().decode(Uint8Array.from(bytes)); bytes = []; } };
    for (const id of ids) { if (id < 4) continue; if (this.byte0 >= 0 && id >= this.byte0 && id < this.byte0 + 256) { bytes.push(id - this.byte0); continue; } flush(); s += this.pieces[id] || ''; }
    flush(); return s.replace(/▁/g, ' ').replace(/ํา/g, 'ำ').replace(/\s+/g, ' ').trim();
  };
  const isTarget = j => j.model.vocab.slice(260, 900).filter(x => /[฀-๿]/.test(x[0])).length > 100;
  const MT = { ready: false, Tok };
  // parts: {enc, dec, wasm: ArrayBuffer|Uint8Array, tokA, tokB: string(JSON)}
  MT.load = async function (parts) {
    if (!root.ort) { const el = document.getElementById('ortsrc'); if (!el) throw new Error('ไม่มีตัวรันโมเดลในหน้านี้'); root.ort = await import(URL.createObjectURL(new Blob([el.textContent], { type: 'text/javascript' }))); }
    const ort = root.ort;
    const a = JSON.parse(parts.tokA), b = JSON.parse(parts.tokB); if (isTarget(a) === isTarget(b)) throw new Error('ไฟล์ tokenizer สองไฟล์ต้องเป็นของต้นทางหนึ่งไฟล์และของปลายทางหนึ่งไฟล์');
    MT.src = new Tok(isTarget(a) ? b : a); MT.tgt = new Tok(isTarget(a) ? a : b);
    const blobUrl = (d, t) => URL.createObjectURL(new Blob([d], { type: t }));
    ort.env.wasm.wasmPaths = { mjs: blobUrl(document.getElementById('ortglue').textContent, 'text/javascript'), wasm: blobUrl(parts.wasm, 'application/wasm') }; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const o = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    MT.enc = await ort.InferenceSession.create(new Uint8Array(parts.enc), o); MT.dec = await ort.InferenceSession.create(new Uint8Array(parts.dec), o); MT.ready = true;
  };
  MT.translate = async function (text) {
    const ort = root.ort, ids = MT.src.encode(text).slice(0, 250); if (!ids.length) return ''; ids.push(3);
    const T = a => new ort.Tensor('int64', BigInt64Array.from(a.map(x => BigInt(x))), [1, a.length]);
    const h = (await MT.enc.run({ input_ids: T(ids) })).last_hidden_state, out = [2], max = Math.min(200, ids.length * 3 + 12); let rep = 0;
    for (let step = 0; step < max; step++) {
      const lg = (await MT.dec.run({ input_ids: T(out), encoder_hidden_states: h })).logits, V = lg.dims[2], d = lg.data, base = (out.length - 1) * V; let bi = 0, bv = -Infinity;
      for (let i = 0; i < V; i++) { const x = d[base + i]; if (x > bv) { bv = x; bi = i; } }
      if (bi === 3) break; rep = bi === out[out.length - 1] ? rep + 1 : 0; if (rep >= 6) break; out.push(bi);
    }
    return MT.tgt.decode(out.slice(1));
  };
  root.RS_MT = MT;
})(typeof window !== 'undefined' ? window : globalThis);
