/* ระบบเครื่องเกมอื่น ๆ: ตรวจชนิดรอม, checksum, แผ่น PS1 (ISO9660 + EDC/ECC), แพตช์ PPF */
(function (root) {
  'use strict';
  const RS = root.RS, u32 = RS.u32, put32 = RS.put32;
  const asc = (b, o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = b[o + i]; if (c >= 32 && c < 127) s += String.fromCharCode(c); } return s.trim(); };
  const be16 = (b, o) => b[o] << 8 | b[o + 1];

  /* ---------- checksum ของแต่ละระบบ ---------- */
  function fixGB(rom) {
    let x = 0; for (let i = 0x134; i <= 0x14C; i++) x = (x - rom[i] - 1) & 255; rom[0x14D] = x;
    let s = 0; for (let i = 0; i < rom.length; i++) if (i !== 0x14E && i !== 0x14F) s = (s + rom[i]) & 0xFFFF;
    rom[0x14E] = s >> 8; rom[0x14F] = s & 255;
  }
  function fixGenesis(rom) {
    put32BE(rom, 0x1A4, rom.length - 1);
    let s = 0; for (let i = 0x200; i + 1 < rom.length; i += 2) s = (s + be16(rom, i)) & 0xFFFF;
    rom[0x18E] = s >> 8; rom[0x18F] = s & 255;
  }
  function put32BE(b, o, v) { b[o] = v >>> 24; b[o + 1] = v >>> 16 & 255; b[o + 2] = v >>> 8 & 255; b[o + 3] = v & 255; }
  function snesHeader(rom) {
    const skip = rom.length % 1024 === 512 ? 512 : 0; let best = null;
    for (const base of [0x7FC0, 0xFFC0]) {
      const o = skip + base; if (o + 0x40 > rom.length) continue;
      const sum = rom[o + 0x1E] | rom[o + 0x1F] << 8, inv = rom[o + 0x1C] | rom[o + 0x1D] << 8;
      let score = (sum ^ inv) === 0xFFFF ? 4 : 0;
      for (let i = 0; i < 21; i++) if (rom[o + i] >= 0x20 && rom[o + i] < 0x7F) score += 0.1;
      if ((rom[o + 0x15] & 1) === (base === 0xFFC0 ? 1 : 0)) score += 1;
      if (!best || score > best.score) best = { o, skip, score, hi: base === 0xFFC0 };
    }
    return best && best.score >= 3 ? best : null;
  }
  function fixSNES(rom) {
    const h = snesHeader(rom); if (!h) return;
    const n = rom.length - h.skip; if (n & (n - 1)) return; // คำนวณง่ายเฉพาะขนาดกำลังสอง
    rom[h.o + 0x1C] = rom[h.o + 0x1D] = 0xFF; rom[h.o + 0x1E] = rom[h.o + 0x1F] = 0;
    let s = 0; for (let i = h.skip; i < rom.length; i++) s = (s + rom[i]) & 0xFFFF;
    rom[h.o + 0x1E] = s & 255; rom[h.o + 0x1F] = s >> 8; rom[h.o + 0x1C] = ~s & 255; rom[h.o + 0x1D] = ~s >> 8 & 255;
  }

  function fixSMS(rom) {
    if (rom.length < 0x8000) return; const code = rom[0x7FFF] & 15, size = Math.min(rom.length, { 12: 0x8000, 14: 0x10000, 15: 0x20000, 0: 0x40000, 1: 0x80000 }[code] || 0x8000);
    let s = 0; for (let i = 0; i < 0x7FF0; i++) s += rom[i]; for (let i = 0x8000; i < size; i++) s += rom[i];
    rom[0x7FFA] = s & 255; rom[0x7FFB] = s >> 8 & 255;
  }
  function fixWS(rom) { const n = rom.length; let s = 0; for (let i = 0; i < n - 2; i++) s = (s + rom[i]) & 0xFFFF; rom[n - 2] = s & 255; rom[n - 1] = s >> 8; }
  function swap16(b) { const o = new Uint8Array(b.length); for (let i = 0; i + 1 < b.length; i += 2) { o[i] = b[i + 1]; o[i + 1] = b[i]; } if (b.length & 1) o[b.length - 1] = b[b.length - 1]; return o; }

  /* ---------- อ่านไฟล์ .zip (ชุดรอมอาร์เคด / รอมที่บีบอัด) ---------- */
  function zipList(z) {
    let e = z.length - 22; while (e >= 0 && u32(z, e) !== 0x06054B50) e--;
    if (e < 0) throw new Error('ไฟล์ .zip เสียหายหรืออ่านไม่ได้');
    const n = z[e + 10] | z[e + 11] << 8, files = []; let p = u32(z, e + 16);
    for (let i = 0; i < n && u32(z, p) === 0x02014B50; i++) {
      const nl = z[p + 28] | z[p + 29] << 8, xl = z[p + 30] | z[p + 31] << 8, cl = z[p + 32] | z[p + 33] << 8, lo = u32(z, p + 42);
      const path = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nl));
      if (!path.endsWith('/')) files.push({ path, method: z[p + 10] | z[p + 11] << 8, csize: u32(z, p + 20), size: u32(z, p + 24), lo });
      p += 46 + nl + xl + cl;
    }
    return files;
  }
  async function zipRead(z, f) {
    const d = f.lo + 30 + (z[f.lo + 26] | z[f.lo + 27] << 8) + (z[f.lo + 28] | z[f.lo + 29] << 8), raw = z.subarray(d, d + f.csize);
    if (f.method === 0) return raw.slice();
    if (f.method !== 8) throw new Error('ไฟล์ใน .zip นี้ใช้การบีบอัดที่ไม่รองรับ ให้แตกไฟล์ออกมาก่อน');
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(raw); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  /* ---------- ตรวจชนิดไฟล์ ---------- */
  function detect(rom, name) {
    const ext = (/\.([^.]+)$/.exec(name || '') || ['', ''])[1].toLowerCase();
    const tag = (o, s) => { for (let i = 0; i < s.length; i++) if (rom[o + i] !== s.charCodeAt(i)) return false; return rom.length > o + s.length; };
    const sys = (id, label, o) => Object.assign({ id, label, title: '', ptr: null, maxSize: rom.length, fix: null, note: '' }, o);
    if (tag(0, 'PS-X EXE')) return sys('psx', 'PlayStation (ไฟล์โปรแกรมหลัก)', { ptr: { delta: (u32(rom, 0x18) - 0x800) >>> 0 }, note: 'ไฟล์นี้ขยายไม่ได้ คำแปลที่ยาวกว่าเดิมจะย้ายไปที่ว่างท้ายไฟล์เท่าที่มี' });
    if (rom.length >= 0xC0 && rom[0xB2] === 0x96 && ext !== 'nds') return sys('gba', 'Game Boy Advance', { title: asc(rom, 0xA0, 12), code: asc(rom, 0xAC, 4), ptr: { delta: RS.GBA_BASE }, maxSize: 0x2000000 });
    if (ext === 'nds' && rom.length > 0x200) return sys('nds', 'Nintendo DS', { title: asc(rom, 0, 12), code: asc(rom, 12, 4), ptr: { delta: (u32(rom, 0x28) - u32(rom, 0x20)) >>> 0 }, note: 'แกะได้เฉพาะข้อความในโปรแกรมหลัก (ARM9) และไฟล์ที่ไม่บีบอัด ขยายรอมไม่ได้' });
    if (tag(0, 'NES\x1A')) return sys('nes', 'Famicom / NES', { note: 'เกม NES ส่วนใหญ่ใช้รหัสอักษรของตัวเอง ให้หาในแท็บตารางอักษรก่อน แปลได้แบบลงที่เดิม' });
    if (rom.length > 0x150 && rom[0x104] === 0xCE && rom[0x105] === 0xED && rom[0x106] === 0x66 && rom[0x107] === 0x66) return sys('gb', 'Game Boy / Game Boy Color', { title: asc(rom, 0x134, 15), fix: fixGB, note: 'แปลได้แบบลงที่เดิม โปรแกรมแก้ checksum ให้' });
    if (tag(0x100, 'SEGA')) return sys('md', 'Mega Drive / Genesis', { title: asc(rom, 0x150, 48), ptr: { delta: 0, big: true, align: 2 }, maxSize: 0x400000, fix: fixGenesis, note: 'โปรแกรมแก้ checksum ให้' });
    if (tag(0, 'COPYRIGHT BY SNK') || tag(0, ' LICENSED BY SNK')) return sys('ngp', 'Neo Geo Pocket / Color', { title: asc(rom, 0x24, 12), ptr: { delta: 0x200000 }, note: 'ขยายรอมไม่ได้ คำแปลที่ยาวกว่าเดิมจะย้ายไปที่ว่างท้ายรอมเท่าที่มี' });
    if (tag(0x7FF0, 'TMR SEGA')) return sys('sms', ext === 'gg' ? 'Game Gear' : 'Master System / Game Gear', { fix: fixSMS, note: 'แปลได้แบบลงที่เดิม โปรแกรมแก้ checksum ให้ เกมส่วนใหญ่ใช้รหัสอักษรของตัวเอง' });
    if (ext === 'ws' || ext === 'wsc') return sys('ws', 'WonderSwan / Color', { fix: fixWS, note: 'แปลได้แบบลงที่เดิม โปรแกรมแก้ checksum ให้' });
    if (ext === 'vb') return sys('vb', 'Virtual Boy', { title: asc(rom, rom.length - 544, 20), ptr: { delta: 4294967296 - rom.length }, note: 'ขยายรอมไม่ได้ คำแปลที่ยาวกว่าเดิมจะย้ายไปที่ว่างเท่าที่มี' });
    const byExt = { pce: 'PC Engine / TurboGrafx-16', sgx: 'PC Engine SuperGrafx', lnx: 'Atari Lynx', a26: 'Atari 2600', a78: 'Atari 7800', col: 'ColecoVision', int: 'Intellivision', sg: 'SG-1000', min: 'Pokemon Mini', gg: 'Game Gear', sms: 'Master System', fds: 'Famicom Disk System', msx: 'MSX', rom: 'MSX / รอมทั่วไป', sfc: '', smc: '' };
    if (byExt[ext]) return sys(ext, byExt[ext], { note: 'แปลได้แบบลงที่เดิม เกมเครื่องนี้ส่วนใหญ่ใช้รหัสอักษรของตัวเอง ให้หาในแท็บตารางอักษรก่อน' });
    const m = rom.length > 4 ? u32(rom, 0) : 0;
    if (m === 0x40123780) return sys('n64', 'Nintendo 64 (.z64)', { title: asc(rom, 0x20, 20), note: 'แปลได้แบบลงที่เดิม เกม N64 หลายเกมบีบอัดข้อความ และถ้าแก้ในช่วง 1MB แรกต้องแก้ checksum ด้วยเครื่องมืออื่น' });
    if (m === 0x12408037 || m === 0x80371240) return sys('n64x', 'Nintendo 64 (ไบต์สลับ)', { note: 'รอมนี้เป็นแบบ .v64/.n64 ให้แปลงเป็น .z64 ก่อนแล้วเปิดใหม่' });
    if (ext === 'sfc' || ext === 'smc' || (ext !== 'bin' && snesHeader(rom))) { const h = snesHeader(rom); return sys('snes', 'Super Famicom / SNES', { title: h ? asc(rom, h.o, 21) : '', fix: fixSNES, note: 'เกม SNES ส่วนใหญ่ใช้รหัสอักษรของตัวเอง แปลได้แบบลงที่เดิม โปรแกรมแก้ checksum ให้' }); }
    return sys('raw', 'ไฟล์ทั่วไป', { note: 'ไม่รู้จักชนิดไฟล์ แกะและแปลได้แบบลงที่เดิม' });
  }

  /* ---------- EDC / ECC ของเซกเตอร์ซีดี ---------- */
  const EDC = new Uint32Array(256), EF = new Uint8Array(256), EB = new Uint8Array(256);
  for (let i = 0; i < 256; i++) { let e = i; for (let k = 0; k < 8; k++) e = e & 1 ? (e >>> 1) ^ 0xD8018001 : e >>> 1; EDC[i] = e >>> 0; const j = ((i << 1) ^ (i & 0x80 ? 0x11D : 0)) & 255; EF[i] = j; EB[i ^ j] = i; }
  function edc(b, s, e) { let v = 0; for (let i = s; i < e; i++) v = (v >>> 8) ^ EDC[(v ^ b[i]) & 255]; return v >>> 0; }
  function ecc(sec, major, minor, mult, inc, dest) {
    const size = major * minor;
    for (let a = 0; a < major; a++) {
      let idx = (a >> 1) * mult + (a & 1), x = 0, y = 0;
      for (let i = 0; i < minor; i++) { const t = sec[12 + idx]; idx += inc; if (idx >= size) idx -= size; x ^= t; y ^= t; x = EF[x]; }
      x = EB[EF[x] ^ y]; sec[dest + a] = x; sec[dest + a + major] = x ^ y;
    }
  }
  function fixSector(sec) {
    const both = () => { ecc(sec, 86, 24, 2, 86, 0x81C); ecc(sec, 52, 43, 86, 88, 0x8C8); };
    if (sec[15] === 1) { put32(sec, 2064, edc(sec, 0, 2064)); sec.fill(0, 2068, 2076); both(); }
    else if (sec[15] === 2) {
      if (sec[18] & 0x20) put32(sec, 2348, edc(sec, 16, 2348));
      else { put32(sec, 2072, edc(sec, 16, 2072)); const h = sec.slice(12, 16); sec.fill(0, 12, 16); both(); sec.set(h, 12); }
    }
  }

  /* ---------- แผ่น ISO9660 (ทั้ง .iso 2048 และ .bin 2352) ---------- */
  // read(off, len) -> Promise<Uint8Array>
  async function openDisc(read, size) {
    const head = await read(0, 16);
    const raw = head[0] === 0 && head[1] === 0xFF && head[10] === 0xFF && head[11] === 0;
    const ss = raw ? 2352 : 2048;
    const d = { raw, ss, size, read, files: [] };
    d.sectors = async (lba, n) => {
      if (!raw) return read(lba * 2048, n * 2048);
      const r = await read(lba * 2352, n * 2352), out = new Uint8Array(n * 2048);
      for (let i = 0; i < n; i++) { const o = i * 2352, dOff = r[o + 15] === 2 ? 24 : 16; out.set(r.subarray(o + dOff, o + dOff + 2048), i * 2048); }
      return out;
    };
    const pvd = await d.sectors(16, 1);
    if (asc(pvd, 1, 5) !== 'CD001') throw new Error('อ่านโครงสร้างแผ่นไม่ได้ ไฟล์นี้ไม่ใช่อิมเมจแผ่นแบบ ISO9660 (ถ้ามีหลายไฟล์ .bin ให้เลือก Track 1)');
    d.volume = asc(pvd, 40, 32);
    const walk = async (lba, len, path, depth) => {
      const dir = await d.sectors(lba, Math.ceil(len / 2048));
      for (let p = 0; p < len;) {
        const rl = dir[p]; if (!rl) { p = (Math.floor(p / 2048) + 1) * 2048; continue; }
        const eLba = u32(dir, p + 2), eLen = u32(dir, p + 10), flags = dir[p + 25], nl = dir[p + 32];
        if (!(nl === 1 && dir[p + 33] < 2)) {
          const nm = asc(dir, p + 33, nl).replace(/;\d+$/, '');
          if (flags & 2) { if (depth < 8) await walk(eLba, eLen, path + nm + '/', depth + 1); }
          else if (d.files.length < 20000) d.files.push({ path: path + nm, lba: eLba, size: eLen });
        }
        p += rl;
      }
    };
    await walk(u32(pvd, 158), u32(pvd, 166), '', 0);
    d.readFile = async f => (await d.sectors(f.lba, Math.ceil(f.size / 2048))).subarray(0, f.size);
    return d;
  }
  /* สร้างรายการแก้ไขระดับอิมเมจ จากไฟล์ในแผ่นที่ถูกแก้ (ขนาดต้องเท่าเดิม) */
  async function discRecords(d, f, oldB, newB) {
    if (oldB.length !== newB.length) throw new Error('ไฟล์ในแผ่นต้องมีขนาดเท่าเดิม');
    const recs = [], n = Math.ceil(f.size / 2048);
    for (let i = 0; i < n; i++) {
      const a = i * 2048, b = Math.min(a + 2048, f.size); let same = true;
      for (let k = a; k < b; k++) if (oldB[k] !== newB[k]) { same = false; break; }
      if (same) continue;
      const off = (f.lba + i) * d.ss, old = await d.read(off, d.ss), neu = old.slice();
      neu.set(newB.subarray(a, b), d.raw ? (old[15] === 2 ? 24 : 16) : 0);
      if (d.raw) fixSector(neu);
      recs.push({ off, bytes: neu, old });
    }
    return recs;
  }

  /* ---------- PPF ---------- */
  function createPpf(recs, desc, block) {
    const out = [], te = new TextEncoder().encode((desc || '').slice(0, 50));
    for (const c of 'PPF30') out.push(c.charCodeAt(0));
    out.push(2); for (let i = 0; i < 50; i++) out.push(i < te.length && te.length <= 50 ? te[i] : 0x20);
    out.push(0, block ? 1 : 0, 0, 0);
    if (block) for (const x of block) out.push(x);
    for (const r of recs) {
      const n = r.bytes.length;
      for (let i = 0; i < n;) {
        if (r.old && r.old[i] === r.bytes[i]) { i++; continue; }
        let j = i + 1, last = i;
        while (j < n && j - i < 255) { if (!r.old || r.old[j] !== r.bytes[j]) last = j; else if (j - last > 8) break; j++; }
        const o = r.off + i, len = last - i + 1;
        out.push(o & 255, o >>> 8 & 255, o >>> 16 & 255, o >>> 24 & 255, Math.floor(o / 4294967296) & 255, 0, 0, 0, len);
        for (let k = i; k <= last; k++) out.push(r.bytes[k]);
        i = last + 1;
      }
    }
    return Uint8Array.from(out);
  }
  function parsePpf(p) {
    const ver = asc(p, 0, 5); let pos, ow, block = null;
    if (ver === 'PPF10') { pos = 56; ow = 4; }
    else if (ver === 'PPF20') { block = p.subarray(60, 1084); pos = 1084; ow = 4; }
    else if (ver === 'PPF30') { if (p[58]) throw new Error('ไม่รองรับแพตช์ PPF ที่มีข้อมูล undo'); pos = 60; if (p[57]) { block = p.subarray(60, 1084); pos = 1084; } ow = 8; }
    else throw new Error('ไฟล์นี้ไม่ใช่แพตช์ PPF');
    let end = p.length;
    for (let i = Math.max(pos, p.length - 4096); i + 18 <= p.length; i++) if (p[i] === 0x40 && asc(p, i, 18) === '@BEGIN_FILE_ID.DIZ') { end = i; break; }
    const recs = [];
    while (pos + ow + 1 <= end) {
      const off = u32(p, pos) + (ow === 8 ? u32(p, pos + 4) * 4294967296 : 0), len = p[pos + ow]; pos += ow + 1;
      recs.push({ off, bytes: p.subarray(pos, pos + len) }); pos += len;
    }
    return { recs, block };
  }
  function mergeRecs(recs) {
    const s = recs.slice().sort((a, b) => a.off - b.off), out = [];
    for (const r of s) {
      const l = out[out.length - 1];
      if (l && l.off + l.len === r.off) { l.parts.push(r.bytes); l.len += r.bytes.length; }
      else if (!l || r.off > l.off + l.len) out.push({ off: r.off, len: r.bytes.length, parts: [r.bytes] });
    }
    return out;
  }
  Object.assign(RS, { swap16, zipList, zipRead, fixSMS, fixWS, detect, fixGB, fixGenesis, fixSNES, snesHeader, edc, fixSector, openDisc, discRecords, createPpf, parsePpf, mergeRecs });

  /* ---------- LZ77 ของ GBA/NDS (ชนิด 0x10) ---------- */
  function lzDecode(rom, off) {
    if (rom[off] !== 0x10) return null;
    const size = rom[off + 1] | rom[off + 2] << 8 | rom[off + 3] << 16; if (!size) return null;
    const out = new Uint8Array(size); let p = off + 4, o = 0, refs = 0;
    while (o < size) {
      if (p >= rom.length) return null;
      const flags = rom[p++];
      for (let b = 0x80; b && o < size; b >>= 1) {
        if (flags & b) {
          if (p + 1 >= rom.length) return null;
          const b1 = rom[p++], b2 = rom[p++], disp = ((b1 & 15) << 8 | b2) + 1; let len = (b1 >> 4) + 3;
          if (disp > o) return null; refs++;
          while (len-- && o < size) { out[o] = out[o - disp]; o++; }
        } else { if (p >= rom.length) return null; out[o++] = rom[p++]; }
      }
    }
    return { data: out, clen: (p - off + 3) & ~3, refs };
  }
  function lzEncode(d) {
    const n = d.length, out = [0x10, n & 255, n >> 8 & 255, n >> 16 & 255], head = new Int32Array(65536).fill(-1), prev = new Int32Array(n);
    const ins = i => { if (i + 2 < n) { const h = (d[i] << 8 ^ d[i + 1] << 4 ^ d[i + 2]) & 0xFFFF; prev[i] = head[h]; head[h] = i; } };
    let i = 0;
    while (i < n) {
      const fp = out.length; out.push(0);
      for (let b = 0x80; b && i < n; b >>= 1) {
        let best = 0, bd = 0;
        if (i + 2 < n) {
          let c = head[(d[i] << 8 ^ d[i + 1] << 4 ^ d[i + 2]) & 0xFFFF], tries = 64; const max = Math.min(18, n - i);
          while (c >= 0 && i - c <= 4096 && tries--) {
            if (i - c >= 2) { let l = 0; while (l < max && d[c + l] === d[i + l]) l++; if (l > best) { best = l; bd = i - c; if (l === max) break; } }
            c = prev[c];
          }
        }
        if (best >= 3) { out[fp] |= b; out.push((best - 3) << 4 | (bd - 1) >> 8, (bd - 1) & 255); for (let k = 0; k < best; k++) ins(i + k); i += best; }
        else { out.push(d[i]); ins(i); i++; }
      }
    }
    while (out.length & 3) out.push(0);
    return Uint8Array.from(out);
  }
  function lzScan(rom, minSize, limit) {
    const res = [];
    for (let o = 0; o + 8 < rom.length && res.length < (limit || 4000); o += 4) {
      if (rom[o] !== 0x10) continue;
      const size = rom[o + 1] | rom[o + 2] << 8 | rom[o + 3] << 16;
      if (size < (minSize || 0x400) || size > 0x80000) continue;
      const r = lzDecode(rom, o);
      if (!r || r.refs < 8 || r.clen >= size) continue;
      res.push({ off: o, size, clen: r.clen }); o += r.clen - 4;
    }
    return res;
  }
  function findPtrs(rom, off, P) {
    const out = []; if (!P) return out; const v = (P.delta + off) >>> 0;
    for (let p = 0, st = P.align || 4; p + 3 < rom.length; p += st) {
      const x = P.big ? ((rom[p] << 24 | rom[p + 1] << 16 | rom[p + 2] << 8 | rom[p + 3]) >>> 0) : u32(rom, p);
      if (x === v) out.push(p);
    }
    return out;
  }
  Object.assign(RS, { lzDecode, lzEncode, lzScan, findPtrs });

  /* ---------- ตารางอักษรญี่ปุ่น (ใช้ตัวถอดรหัสของเบราว์เซอร์) ---------- */
  const jpCache = {};
  function jpPairs(enc) {
    if (jpCache[enc]) return jpCache[enc];
    const td = new TextDecoder(enc, { fatal: true }), pairs = RS.asciiPairs(), b1 = new Uint8Array(1), b2 = new Uint8Array(2);
    const two = (a, b) => { b2[0] = a; b2[1] = b; try { const s = td.decode(b2); if (s.length === 1 && s !== '\uFFFD') pairs.push([[a, b], s]); } catch (e) {} };
    const one = (lo, hi) => { for (let b = lo; b <= hi; b++) { b1[0] = b; try { const s = td.decode(b1); if (s.length === 1 && s !== '\uFFFD' && s.charCodeAt(0) > 0x9F) pairs.push([[b], s]); } catch (e) {} } };
    if (enc === 'shift_jis') { one(0xA1, 0xDF); for (let a = 0x81; a <= 0xEA; a++) { if (a >= 0xA0 && a < 0xE0) continue; for (let b = 0x40; b <= 0xFC; b++) if (b !== 0x7F) two(a, b); } }
    else if (enc === 'euc-jp') { for (let a = 0xA1; a <= 0xFE; a++) for (let b = 0xA1; b <= 0xFE; b++) two(a, b); }
    else if (enc === 'gbk' || enc === 'big5' || enc === 'euc-kr') { for (let a = 0x81; a <= 0xFE; a++) for (let b = 0x40; b <= 0xFE; b++) if (b !== 0x7F) two(a, b); }
    else one(0x80, 0xFF);
    return jpCache[enc] = pairs;
  }
  RS.jpPairs = jpPairs;
})(typeof window !== 'undefined' ? window : globalThis);
