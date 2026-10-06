/* แกนโปรแกรม: ไม่แตะ DOM ใช้ได้ทั้งในเบราว์เซอร์และ node */
(function (root) {
  'use strict';
  const GBA_BASE = 0x08000000;
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8, start, end) {
    let c = 0xFFFFFFFF; start = start || 0; end = end == null ? u8.length : end;
    for (let i = start; i < end; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const hex = (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0');
  const u32 = (b, o) => (b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24) >>> 0;
  function put32(b, o, v) { b[o] = v & 255; b[o + 1] = v >>> 8 & 255; b[o + 2] = v >>> 16 & 255; b[o + 3] = v >>> 24 & 255; }

  function header(rom) {
    const asc = (a, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = rom[a + i]; if (c >= 32 && c < 127) s += String.fromCharCode(c); } return s; };
    return { title: asc(0xA0, 12), code: asc(0xAC, 4), maker: asc(0xB0, 2), version: rom[0xBC] | 0, isGba: rom.length >= 0xC0 && rom[0xB2] === 0x96 };
  }

  /* ---------- ตารางอักษร ---------- */
  function asciiPairs() { const p = [[[0x0A], '\n']]; for (let b = 0x20; b < 0x7F; b++) p.push([[b], String.fromCharCode(b)]); return p; }
  function thaiPairs() { // TIS-620
    const p = [];
    for (let c = 0x0E01; c <= 0x0E3A; c++) p.push([[c - 0x0E01 + 0xA1], String.fromCharCode(c)]);
    for (let c = 0x0E3F; c <= 0x0E5B; c++) p.push([[c - 0x0E3F + 0xDF], String.fromCharCode(c)]);
    return p;
  }
  function makeTable(pairs) {
    const t = { pairs: [], dec1: new Array(256), dec2: new Map(), lead: new Uint8Array(256), enc: new Map(), maxStr: 1 };
    for (const [bytes, str] of pairs) {
      if (!str || !bytes.length || bytes.length > 2) continue;
      t.pairs.push([bytes.slice(), str]);
      if (bytes.length === 1) { if (t.dec1[bytes[0]] === undefined) t.dec1[bytes[0]] = str; }
      else { const k = bytes[0] << 8 | bytes[1]; if (!t.dec2.has(k)) t.dec2.set(k, str); t.lead[bytes[0]] = 1; }
      if (!t.enc.has(str)) t.enc.set(str, bytes.slice());
      if (str.length > t.maxStr) t.maxStr = str.length;
    }
    return t;
  }
  function parseTbl(text) {
    const pairs = [], errors = [];
    text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, n) => {
      if (!line.trim() || line[0] === '#' || line[0] === ';') return;
      const m = /^\s*([0-9A-Fa-f]{2}|[0-9A-Fa-f]{4})=(.*)$/.exec(line);
      if (!m) { errors.push(n + 1); return; }
      const bytes = m[1].length === 2 ? [parseInt(m[1], 16)] : [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2), 16)];
      let s = m[2].replace(/\\n/g, '\n');
      if (s === '') s = ' ';
      pairs.push([bytes, s]);
    });
    return { pairs, errors };
  }
  function tblText(table) { return table.pairs.map(([b, s]) => b.map(x => hex(x)).join('') + '=' + s.replace(/\n/g, '\\n')).join('\n'); }

  function decode(rom, off, len, table) {
    let s = '';
    for (let i = off, e = off + len; i < e; i++) {
      const b = rom[i];
      if (table.lead[b] && i + 1 < e) { const v = table.dec2.get(b << 8 | rom[i + 1]); if (v !== undefined) { s += v; i++; continue; } }
      const v = table.dec1[b];
      s += v !== undefined ? v : '<' + hex(b) + '>';
    }
    return s;
  }
  function encode(str, table) {
    const out = [], bad = [];
    str = str.replace(/\r\n?/g, '\n');
    for (let i = 0; i < str.length;) {
      if (str[i] === '<') { const m = /^<([0-9A-Fa-f]{2})>/.exec(str.substr(i, 4)); if (m) { out.push(parseInt(m[1], 16)); i += 4; continue; } }
      let hit = false;
      for (let n = Math.min(table.maxStr, str.length - i); n >= 1; n--) {
        const b = table.enc.get(str.substr(i, n));
        if (b) { for (const x of b) out.push(x); i += n; hit = true; break; }
      }
      if (hit) continue;
      const ch = String.fromCodePoint(str.codePointAt(i));
      if (!bad.includes(ch)) bad.push(ch);
      i += ch.length;
    }
    return { bytes: out, bad };
  }

  /* ---------- แกะข้อความ ---------- */
  function scan(rom, opt) {
    const table = opt.table, term = opt.term == null ? 0 : opt.term, minLen = opt.minLen || 4;
    const minRatio = opt.minRatio == null ? 0.7 : opt.minRatio, limit = opt.limit || 60000;
    const ok = new Uint8Array(256), letter = new Uint8Array(256);
    const multi = !!opt.multi;
    for (let b = 0; b < 256; b++) {
      const s = table.dec1[b];
      if (s === undefined || b === term) continue;
      if (opt.asciiOnly && b >= 0x80) continue;
      ok[b] = 1;
      if (/^[\p{L}\p{M} ]+$/u.test(s)) letter[b] = 1;
    }
    const found = [], byOff = new Map();
    const end = Math.min(rom.length, opt.end || rom.length);
    let truncated = false;
    for (let i = opt.start || 0; i < end;) {
      if (!ok[rom[i]] && !(multi && table.lead[rom[i]])) { i++; continue; }
      let j = i, L = 0, kana = 0, wide = 0;
      while (j < end) {
        const b = rom[j];
        if (multi && table.lead[b] && j + 1 < end) {
          const ch = table.dec2.get(b << 8 | rom[j + 1]), c = ch === undefined ? 0 : ch.charCodeAt(0);
          if ((c >= 0x3000 && c <= 0x30FF) || (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0xFF01 && c <= 0xFF5E) || (c >= 0xAC00 && c <= 0xD7A3)) { wide++; if (c >= 0x3041 && c <= 0x30FC) kana++; if (c > 0x3040) L += 2; j += 2; continue; }
        }
        if (!ok[b]) break;
        L += letter[b]; j++;
      }
      if (j < end && rom[j] === term && j - i >= minLen && L / (j - i) >= minRatio && (!opt.needKana || kana > 0) && (!opt.minWide || wide >= opt.minWide)) {
        let extra = 0;
        while (((j + 1 + extra) & 3) !== 0 && rom[j + 1 + extra] === term) extra++;
        if (found.length >= limit) { truncated = true; break; }
        byOff.set(i, found.length);
        found.push({ off: i, len: j - i, slot: j - i + extra, ptrs: [], text: '', thai: '' });
      }
      i = j + 1;
    }
    const P = opt.ptr === undefined ? { delta: GBA_BASE } : opt.ptr;
    if (P) for (let p = 0, st = P.align || 4; p + 3 < rom.length; p += st) {
      const v = P.big ? ((rom[p] << 24 | rom[p + 1] << 16 | rom[p + 2] << 8 | rom[p + 3]) >>> 0) : u32(rom, p);
      const idx = byOff.get(v - P.delta);
      if (idx !== undefined) found[idx].ptrs.push(p);
    }
    const list = opt.needPtr ? found.filter(e => e.ptrs.length) : found;
    for (const e of list) e.text = decode(rom, e.off, e.len, table);
    return { entries: list, truncated };
  }

  /* หาการเข้ารหัสที่ไม่ใช่ ASCII จากคำที่รู้ว่ามีในเกม (relative search) */
  function relativeSearch(rom, word, max) {
    const cp = Array.from(word).map(c => c.charCodeAt(0)), n = cp.length, res = [];
    if (n < 3) return res;
    for (let i = 0; i + n <= rom.length && res.length < (max || 50); i++) {
      const d = rom[i] - cp[0]; let k = 1;
      for (; k < n; k++) if (rom[i + k] - cp[k] !== d) break;
      if (k === n) res.push({ off: i, delta: d });
    }
    return res;
  }

  /* ---------- ใส่คำแปลกลับ ---------- */
  function checkEntry(e, table) {
    if (!e.thai) return { status: 'empty' };
    const r = encode(e.thai, table);
    if (r.bad.length) return { status: 'badchar', bad: r.bad, bytes: r.bytes };
    if (r.bytes.length <= e.slot) return { status: 'inplace', bytes: r.bytes };
    if (e.ptrs.length) return { status: 'move', bytes: r.bytes };
    return { status: 'toolong', bytes: r.bytes };
  }
  function findFree(rom) {
    const n = rom.length, last = rom[n - 1];
    if (last !== 0xFF && last !== 0x00) return n;
    let i = n; while (i > 0 && rom[i - 1] === last) i--;
    const guard = last === 0xFF ? 16 : 0x100;
    const free = (i + guard + 3) & ~3;
    return free < n ? free : n;
  }
  function build(orig, entries, table, opt) {
    opt = opt || {};
    const term = opt.term == null ? 0 : opt.term, maxSize = opt.maxSize || 0x2000000;
    const P = opt.ptr || { delta: GBA_BASE };
    let rom = new Uint8Array(orig);
    for (const p of opt.patches || []) rom.set(p.bytes, p.off);
    const report = new Map(), moves = [];
    const stats = { inplace: 0, moved: 0, toolong: 0, badchar: 0, ptrs: 0 };
    for (const e of entries) {
      const c = checkEntry(e, table);
      if (c.status === 'empty') continue;
      if (c.status === 'inplace') {
        rom.set(c.bytes, e.off);
        rom.fill(term, e.off + c.bytes.length, e.off + e.slot + 1);
        stats.inplace++;
      } else if (c.status === 'move') moves.push([e, c.bytes]);
      else stats[c.status]++;
      report.set(e.off, { status: c.status, bad: c.bad });
    }
    const jobs = moves.map(([e, b]) => ({ bytes: Uint8Array.from(b.concat([term])), ptrs: e.ptrs, rep: report.get(e.off), text: true }));
    stats.gfx = 0; stats.gfxMoved = 0;
    for (const g of opt.blobs || []) {
      if (g.bytes.length <= g.origLen) { rom.set(g.bytes, g.off); stats.gfx++; }
      else if (g.ptrs && g.ptrs.length) jobs.push({ bytes: g.bytes, ptrs: g.ptrs, rep: {} });
      else throw new Error('กราฟิกที่ 0x' + hex(g.off, 6) + ' ใหญ่กว่าเดิมหลังบีบอัด และไม่มีพอยน์เตอร์ให้ย้าย ลองใช้ข้อความเครดิตสั้นลงหรือสีเดียว');
    }
    let freeStart = null, cur = 0;
    if (jobs.length) {
      let need = 0; const seen = new Set();
      for (const j of jobs) { j.key = j.bytes.length + ':' + crc32(j.bytes) + ':' + j.bytes[0]; if (!seen.has(j.key)) { seen.add(j.key); need += (j.bytes.length + 3) & ~3; } }
      freeStart = opt.freeOff != null ? opt.freeOff : findFree(rom);
      const size = freeStart + need <= rom.length ? rom.length : Math.ceil((freeStart + need) / 0x20000) * 0x20000;
      if (size > maxSize) throw new Error(maxSize > orig.length ? 'ข้อมูลที่ต้องย้ายรวม ' + need + ' ไบต์ เกินขนาดสูงสุดของรอม' : 'ไฟล์นี้ขยายไม่ได้ และที่ว่างท้ายไฟล์ไม่พอสำหรับคำแปลที่ยาวกว่าเดิม (ต้องการ ' + need + ' ไบต์) ลองย่อคำแปลให้ลงที่เดิม');
      if (size !== rom.length) { const big = new Uint8Array(size).fill(0xFF); big.set(rom); rom = big; }
      cur = freeStart;
      const placed = new Map();
      for (const j of jobs) {
        let at = placed.get(j.key);
        if (at === undefined) { at = cur; rom.set(j.bytes, at); cur = (at + j.bytes.length + 3) & ~3; placed.set(j.key, at); }
        for (const p of j.ptrs) { const v = P.delta + at; if (P.big) { rom[p] = v >>> 24; rom[p + 1] = v >>> 16 & 255; rom[p + 2] = v >>> 8 & 255; rom[p + 3] = v & 255; } else put32(rom, p, v); stats.ptrs++; }
        j.rep.newOff = at; if (j.text) stats.moved++; else { stats.gfx++; stats.gfxMoved++; }
      }
    }
    if (opt.fix) opt.fix(rom);
    return { rom, report, stats, freeStart, freeEnd: cur, expanded: rom.length !== orig.length };
  }

  /* ---------- แพตช์ BPS / IPS ---------- */
  function applyBps(src, patch, opt) {
    if (patch.length < 19 || String.fromCharCode(patch[0], patch[1], patch[2], patch[3]) !== 'BPS1') throw new Error('ไฟล์นี้ไม่ใช่แพตช์ BPS');
    let p = 4; const end = patch.length - 12;
    const num = () => { let d = 0, sh = 1; for (;;) { const x = patch[p++]; d += (x & 0x7F) * sh; if (x & 0x80) return d; sh *= 128; d += sh; } };
    const srcSize = num(), tgtSize = num(), meta = num(); p += meta;
    const srcCrc = u32(patch, end), tgtCrc = u32(patch, end + 4), patCrc = u32(patch, end + 8);
    if (crc32(patch, 0, patch.length - 4) !== patCrc) throw new Error('ไฟล์แพตช์เสียหาย (CRC ของแพตช์ไม่ตรง)');
    if (!(opt && opt.ignoreCrc) && (src.length !== srcSize || crc32(src) !== srcCrc))
      throw new Error('ROM ต้นฉบับไม่ตรงรุ่น แพตช์นี้ต้องใช้ ROM ที่มี CRC32 ' + hex(srcCrc, 8) + ' ขนาด ' + srcSize + ' ไบต์');
    const tgt = new Uint8Array(tgtSize); let o = 0, sRel = 0, tRel = 0;
    while (p < end) {
      const d = num(), act = d & 3; let len = (d >>> 2) + 1;
      if (act === 0) { tgt.set(src.subarray(o, o + len), o); o += len; }
      else if (act === 1) { tgt.set(patch.subarray(p, p + len), o); p += len; o += len; }
      else {
        const r = num(), off = (r & 1 ? -1 : 1) * Math.floor(r / 2);
        if (act === 2) { sRel += off; tgt.set(src.subarray(sRel, sRel + len), o); sRel += len; o += len; }
        else { tRel += off; while (len--) tgt[o++] = tgt[tRel++]; }
      }
    }
    if (crc32(tgt) !== tgtCrc && !(opt && opt.ignoreCrc)) throw new Error('แปะแพตช์แล้วผลลัพธ์ไม่ถูกต้อง (CRC ปลายทางไม่ตรง)');
    return tgt;
  }
  function createBps(src, tgt) {
    const out = [];
    const num = d => { for (;;) { const x = d & 0x7F; d = Math.floor(d / 128); if (d === 0) { out.push(0x80 | x); return; } out.push(x); d--; } };
    for (const c of 'BPS1') out.push(c.charCodeAt(0));
    num(src.length); num(tgt.length); num(0);
    const n = tgt.length, m = Math.min(src.length, n);
    let i = 0, lit = -1;
    const flush = to => { if (lit < 0) return; num((to - lit - 1) << 2 | 1); for (let k = lit; k < to; k++) out.push(tgt[k]); lit = -1; };
    while (i < n) {
      let j = i; while (j < m && src[j] === tgt[j]) j++;
      if (j - i >= 6 || (j === n && j > i && lit < 0)) { flush(i); num((j - i - 1) * 4); i = j; }
      else { if (lit < 0) lit = i; i = Math.max(j, i + 1); if (i > n) i = n; }
    }
    flush(n);
    const push32 = v => out.push(v & 255, v >>> 8 & 255, v >>> 16 & 255, v >>> 24 & 255);
    push32(crc32(src)); push32(crc32(tgt));
    const body = Uint8Array.from(out), res = new Uint8Array(body.length + 4);
    res.set(body); put32(res, body.length, crc32(body));
    return res;
  }
  function applyIps(src, patch) {
    if (String.fromCharCode(...patch.subarray(0, 5)) !== 'PATCH') throw new Error('ไฟล์นี้ไม่ใช่แพตช์ IPS');
    const recs = []; let p = 5, size = src.length;
    while (p + 3 <= patch.length) {
      if (patch[p] === 0x45 && patch[p + 1] === 0x4F && patch[p + 2] === 0x46) break;
      const off = patch[p] << 16 | patch[p + 1] << 8 | patch[p + 2]; let len = patch[p + 3] << 8 | patch[p + 4]; p += 5;
      if (len) { recs.push([off, patch.subarray(p, p + len)]); p += len; }
      else { len = patch[p] << 8 | patch[p + 1]; recs.push([off, new Uint8Array(len).fill(patch[p + 2])]); p += 3; }
      size = Math.max(size, off + len);
    }
    const tgt = new Uint8Array(size); tgt.set(src);
    for (const [off, b] of recs) tgt.set(b, off);
    return tgt;
  }
  function applyPatch(src, patch, opt) {
    const tag = String.fromCharCode(patch[0], patch[1], patch[2], patch[3]);
    if (tag === 'BPS1') return applyBps(src, patch, opt);
    if (tag === 'PATC') return applyIps(src, patch);
    throw new Error('รองรับเฉพาะแพตช์ .bps และ .ips');
  }

  /* ---------- zip แบบไม่บีบอัด (ใช้ตอนบันทึกไฟล์ผ่านหน้าเว็บ) ---------- */
  function makeZip(files) {
    const te = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = te.encode(f.name), crc = crc32(f.data), h = new Uint8Array(30 + name.length);
      put32(h, 0, 0x04034B50); h[4] = 20; h[7] = 8; put32(h, 14, crc); put32(h, 18, f.data.length); put32(h, 22, f.data.length); h[26] = name.length & 255; h[27] = name.length >> 8; h.set(name, 30);
      const c = new Uint8Array(46 + name.length);
      put32(c, 0, 0x02014B50); c[4] = 20; c[6] = 20; c[9] = 8; put32(c, 16, crc); put32(c, 20, f.data.length); put32(c, 24, f.data.length); c[28] = name.length & 255; c[29] = name.length >> 8; put32(c, 42, off); c.set(name, 46);
      parts.push(h, f.data); central.push(c); off += h.length + f.data.length;
    }
    const cs = central.reduce((a, c) => a + c.length, 0), e = new Uint8Array(22);
    put32(e, 0, 0x06054B50); e[8] = e[10] = files.length & 255; e[9] = e[11] = files.length >> 8; put32(e, 12, cs); put32(e, 16, off);
    const all = parts.concat(central, [e]), out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
    let o = 0; for (const a of all) { out.set(a, o); o += a.length; }
    return out;
  }

  /* ---------- CSV ---------- */
  function toCsv(rows) { return '\uFEFF' + rows.map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n'); }
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, ''); const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---------- รอมตัวอย่าง (ไม่ใช่เกมจริง) ---------- */
  function demoRom() {
    const rom = new Uint8Array(0x10000).fill(0xFF);
    rom.fill(0, 0, 0x5000);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) rom[o + i] = s.charCodeAt(i); };
    put32(rom, 0, 0xEA00002E); w(0xA0, 'THAI DEMO'); w(0xAC, 'DEMO'); w(0xB0, '90'); rom[0xB2] = 0x96;
    const lines = ['NEW GAME', 'CONTINUE', 'OPTIONS', 'Are you ready, hero?', 'Press START to begin\nyour adventure!', 'You found a key.', 'The door is locked.', 'Thank you for playing!', 'Save your progress?', 'Yes, please', 'No, thanks', 'Game Over'];
    let o = 0x1000;
    lines.forEach((s, i) => { w(o, s); if (i !== 9) put32(rom, 0x800 + i * 4, GBA_BASE + o); o = (o + s.length + 1 + 3) & ~3; });
    return rom;
  }

  root.RS = { put32, GBA_BASE, crc32, hex, u32, header, asciiPairs, thaiPairs, makeTable, parseTbl, tblText, decode, encode, scan, relativeSearch, checkEntry, findFree, build, applyBps, createBps, applyIps, applyPatch, makeZip, toCsv, parseCsv, demoRom };
})(typeof window !== 'undefined' ? window : globalThis);
