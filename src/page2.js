/* ---------- ส่วนที่ย้ายมาจากชุด "แปลเกมเอง" (DIY) และคลังฟอนต์ไทย 90S Game ----------
   ไฟล์นี้ถูกแทรกเข้าไปในสคริปต์หลักของ page.src.html (ใช้ S, $, hex, toast, save, workRom ร่วมกัน) */
const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const setMsg = (id, cls, txt) => { const e = $(id); e.className = 'msg' + (cls ? ' ' + cls : ''); e.textContent = txt; };
window.__rsSave = (name, data) => save(name, data); // ให้หน้าคลังฟอนต์ (iframe) บันทึกไฟล์ผ่านช่องทางเดียวกับแอป

/* ===== ชนิดพอยน์เตอร์ ===== */
function scanPtr() {
  const k = $('scPtrKind').value;
  if (k === 'auto') return S.sys ? S.sys.ptr : null;
  if (k === 'none' || !S.orig) return null;
  if (k === 'nes') return RS.ptrModel(k, S.orig, { bank: +$('scNesBank').value, base: parseHex($('scNesBase').value) });
  if (k === 'custom') return RS.ptrModel(k, S.orig, { n: +$('scCusN').value, base: parseHex($('scCusBase').value) || 0, big: $('scCusBig').checked });
  return RS.ptrModel(k, S.orig);
}
function ptrUI() {
  const k = $('scPtrKind').value; $('scNesBox').hidden = k !== 'nes'; $('scCusBox').hidden = k !== 'custom';
  const P = scanPtr(); $('scPtr').disabled = !P; if (!P) $('scPtr').checked = false;
}
['scPtrKind', 'scNesBank', 'scNesBase', 'scCusN', 'scCusBase', 'scCusBig'].forEach(id => $(id).addEventListener('change', () => {
  const was = $('scPtr').disabled; ptrUI(); if (was && !$('scPtr').disabled && $('scPtrKind').value !== 'none') $('scPtr').checked = false; if (S.orig) doScan(true);
}));
/* เดาไบต์ปิดข้อความ: ไบต์ที่ตามหลังตัวอักษรติดกันยาว ๆ บ่อยที่สุด */
function guessTerms(rom, table) {
  const cnt = new Array(256).fill(0); let run = 0; const has = b => table.dec1[b] !== undefined;
  for (let i = 0; i < rom.length - 1; i++) { if (has(rom[i])) run++; else { if (run >= 4 && !has(rom[i + 1])) cnt[rom[i]]++; run = 0; } }
  return cnt.map((c, b) => [b, c]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
}

/* ===== ตาราง: ใส่หลายคู่ทีเดียว (คู่ใหม่ใช้ก่อนคู่เดิมตอนใส่คำแปล) ===== */
function tblPut(map) { // map: Map(byte -> string)
  const pairs = [...map.entries()].map(([b, c]) => [[b], c]);
  for (const [b, c] of S.table.pairs) if (!(b.length === 1 && map.has(b[0]))) pairs.push([b, c]);
  const txt = RS.tblText(RS.makeTable(pairs)); $('tblText').value = txt; applyTbl(txt);
}
const tbl1 = () => { const m = new Map(); for (let b = 0; b < 256; b++) if (S.table.dec1[b] !== undefined) m.set(b, S.table.dec1[b]); return m; };
function decodeBytes(rom, a, b) { let s = '', known = 0, letters = 0; for (let j = a; j < b; j++) { const c = S.table.dec1[rom[j]]; if (c !== undefined) { s += c; known++; if (c.trim()) letters++; } else s += '<' + hex(rom[j]) + '>'; } return { s, known, letters }; }

/* ===== ฟอนต์: ข้อมูลช่อง ค้นหา ส่งออก/นำเข้า png ===== */
function tvInfo(p, k, o) {
  const box = $('tvInfo'), code = isNaN(p.first) ? null : p.first + k, ch = code != null && code < 256 ? S.table.dec1[code] : undefined;
  box.innerHTML = 'ช่องที่ <b>' + k + '</b> · ตำแหน่ง <b class="mono">0x' + hex(o, 6) + '</b> · ช่องละ ' + p.bytes + ' ไบต์' +
    (code != null && code < 256 ? ' · รหัสอักษร <b class="mono">' + hex(code) + '</b> · ในตาราง: <b>' + (ch === undefined ? 'ไม่มี' : esc2(JSON.stringify(ch))) + '</b>' : ' · (ใส่ "ช่องแรกคือรหัส" เพื่อดูรหัสอักษร)') +
    ((S.tvBlank || []).includes(k) ? ' · <span style="color:var(--ok)">ช่องว่าง</span>' : '') +
    '<br><button class="btn sm" id="tvSetStart">ให้ช่องนี้เป็นตำแหน่งเริ่ม</button>' + (code != null && code < 256 ? ' <button class="btn sm" id="tvAddSlot">เพิ่มรหัส ' + hex(code) + ' ในช่องที่จะเขียนตัวไทย</button>' : '');
  $('tvSetStart').onclick = () => { $('tvOff').value = hex(o, 6); if (code != null) $('tvFirst').value = hex(code); S.tvSel = 0; drawTiles(); };
  if ($('tvAddSlot')) $('tvAddSlot').onclick = () => { addSlots([code]); toast('เพิ่ม ' + hex(code) + ' แล้ว: ' + $('fkSlots').value); };
}
document.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
  if (!S.orig) return; const p = tv(), st = { '-1': -1, '+1': 1, '-c': -(cellOff(p, 1) - p.off), '+c': cellOff(p, 1) - p.off }[b.dataset.mv];
  $('tvOff').value = hex(Math.max(0, Math.min(S.orig.length - 1, p.off + st)), 6); S.tvSel = null; drawTiles();
});
$('tvFindGo').onclick = () => {
  if (!S.orig) return; const bs = $('tvFind').value.trim().split(/[\s,]+/).map(parseHex), out = $('tvInfo');
  if (bs.length < 3 || bs.some(x => isNaN(x) || x > 255)) { toast('ใส่ไบต์ hex อย่างน้อย 3 ตัว คั่นด้วยช่องว่าง'); return; }
  const r = workRom(), hits = []; outer: for (let i = 0; i + bs.length <= r.length && hits.length < 40; i++) { for (let k = 0; k < bs.length; k++) if (r[i + k] !== bs[k]) continue outer; hits.push(i); }
  out.innerHTML = hits.length ? 'เจอ ' + hits.length + ' ที่: ' + hits.map(h => '<button class="btn sm" data-go="' + h + '">0x' + hex(h, 6) + '</button>').join(' ') : 'ไม่เจอ (ฟอนต์อาจถูกบีบอัด หรือรูปแบบในรอมต่างจากในอีมู เช่น 1bpp ในรอม แต่ 2bpp ในหน่วยความจำ)';
  out.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { $('tvOff').value = hex(+b.dataset.go, 6); S.tvSel = 0; drawTiles(); });
};
$('tvFree').onclick = () => {
  const p = tv(); if (isNaN(p.first)) { toast('ใส่ "ช่องแรกคือรหัส" ก่อน (รหัสอักษรของช่องแรกที่ตำแหน่งเริ่ม)', 6000); return; }
  const codes = (S.tvBlank || []).map(n => p.first + n).filter(c => c < 256); addSlots(codes);
  toast('ส่ง ' + codes.length + ' ช่องว่างไปกล่องสร้างฟอนต์ไทยแล้ว: ' + $('fkSlots').value, 7000);
};
const gray = (v, max) => Math.round(255 - Math.min(v, max) * 255 / max);
$('pngOut').onclick = () => {
  if (!S.orig) return; const p = tv(), z = +$('pngScale').value, rom = workRom(), cv = document.createElement('canvas'), n = p.cols * p.rows;
  cv.width = p.cols * p.w * z; cv.height = Math.ceil(n / p.cols) * p.h * z; const c = cv.getContext('2d');
  for (let i = 0; i < n; i++) { const o = cellOff(p, i); if (o + p.bytes > rom.length) break; const px = getCell(rom, o, p);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const g = gray(px[y * p.w + x], p.max); c.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; c.fillRect(((i % p.cols) * p.w + x) * z, (Math.floor(i / p.cols) * p.h + y) * z, z, z); } }
  cv.toBlob(b => save('font_' + hex(p.off, 6) + '_' + p.mode + '_' + p.w + 'x' + p.h + (p.k ? '_k' + p.k : '') + '_' + p.cols + 'x' + p.rows + '.png', b), 'image/png');
  setMsg('pngMsg', '', 'จำค่าที่ตั้งไว้ (ชื่อไฟล์บอกตำแหน่ง รูปแบบ ขนาด) ไว้ใช้ตอนนำเข้า');
};
$('pngIn').onclick = pick('filePng', async f => {
  if (!S.orig) return; const p = tv(), n = p.cols * p.rows, im = await createImageBitmap(f), W = p.cols * p.w, H = Math.ceil(n / p.cols) * p.h, z = im.width / W;
  if (!Number.isInteger(z) || Math.abs(im.height / H - z) > 1e-9) { setMsg('pngMsg', 'bad', 'ขนาดรูปไม่ตรง: รูป ' + im.width + 'x' + im.height + ' แต่ค่าที่ตั้งไว้ต้องเป็น ' + W + 'x' + H + ' (หรือคูณเท่าเดียวกัน) ตั้งค่าให้เหมือนตอนส่งออก'); return; }
  const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(im, 0, 0);
  const d = c.getImageData(0, 0, im.width, im.height).data, rom = workRom(); let changed = 0;
  for (let i = 0; i < n; i++) { const o = cellOff(p, i); if (o + p.bytes > rom.length) break; const px = new Uint8Array(p.w * p.h);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const X = ((i % p.cols) * p.w + x) * z + (z >> 1), Y = (Math.floor(i / p.cols) * p.h + y) * z + (z >> 1), q = (Y * im.width + X) * 4, L = d[q] * 0.3 + d[q + 1] * 0.59 + d[q + 2] * 0.11; px[y * p.w + x] = Math.max(0, Math.min(p.max, Math.round((255 - L) * p.max / 255))); }
    const old = getCell(rom, o, p); if (old.some((v, j) => v !== px[j])) { for (const x of cellPatches(px, p, i)) S.patches.push(Object.assign(x, { font: true })); changed++; } }
  S.work = null; drawTiles(); setMsg('pngMsg', 'ok', 'นำเข้าแล้ว เปลี่ยน ' + changed + ' ช่อง (รวมตอนบันทึกในแท็บแพตช์)');
});

/* ===== สร้างฟอนต์ไทย (จากคลังฟอนต์ หรือฟอนต์ในเครื่อง) ===== */
const UPV = 'ัิีึื็ํ', TONE = '่้๊๋์๎', LOWV = 'ฺุู';
const isMark = c => UPV.includes(c) || TONE.includes(c) || LOWV.includes(c), isThai = s => /[฀-๿]/.test(s);
function thClusters(s, pre) { s = RS.normThai(s.replace(/<[0-9A-Fa-f]{2}>/g, ' ')); const out = []; for (const ch of s) { if (pre && isMark(ch) && out.length && /[ก-ฮะ-ำเ-ๆ]/.test(out[out.length - 1][0])) out[out.length - 1] += ch; else out.push(ch); } return out; }
function parseSlots(s) { const out = []; for (const t of s.split(/[\s,]+/).filter(Boolean)) { const m = t.split('-'), a = parseHex(m[0]), b = m.length > 1 ? parseHex(m[1]) : a; if (isNaN(a) || isNaN(b)) continue; for (let x = a; x <= b && x < 256; x++) if (!out.includes(x)) out.push(x); } return out; }
function slotsText(arr) { arr = [...arr].sort((a, b) => a - b); const out = []; for (let i = 0; i < arr.length;) { let j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; out.push(j > i ? hex(arr[i]) + '-' + hex(arr[j]) : hex(arr[i])); i = j + 1; } return out.join(' '); }
function addSlots(codes) { const cur = parseSlots($('fkSlots').value); codes.forEach(c => { if (!cur.includes(c)) cur.push(c); }); $('fkSlots').value = slotsText(cur); fkCount(); }
function fkCount() { const n = $('fkList').value.split(/\s+/).filter(Boolean).length, m = parseSlots($('fkSlots').value).length;
  $('fkCount').innerHTML = 'ต้องสร้าง <b>' + n + '</b> ตัว · มีช่อง <b>' + m + '</b> ช่อง' + (n > m ? ' <span style="color:var(--bad)">ช่องไม่พอ ขาด ' + (n - m) + ' ช่อง ตัวท้ายรายการจะไม่ถูกสร้าง</span>' : ''); }
$('fkList').oninput = fkCount; $('fkSlots').oninput = fkCount;
$('fkFromTh').onclick = () => {
  const pre = $('fkMode').value === '1', have = new Set(S.table.pairs.filter(([b]) => b.length === 1).map(([, c]) => c)), cnt = new Map();
  for (const e of S.entries) if (e.thai) for (const c of thClusters(e.thai, pre)) if (isThai(c) && !have.has(c)) cnt.set(c, (cnt.get(c) || 0) + 1);
  const list = [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); $('fkList').value = list.join(' '); fkCount();
  setMsg('fkMsg', list.length ? 'ok' : 'warn', list.length ? 'พบตัวไทยที่ต้องสร้าง ' + list.length + ' ตัว (ไม่นับตัวที่มีในตารางแบบ 1 ไบต์แล้ว)' : 'ยังไม่มีคำแปลภาษาไทย พิมพ์คำแปลในแท็บข้อความก่อน หรือใช้ชุดพื้นฐาน');
};
$('fkBasic').onclick = () => { const a = []; for (let c = 0x0E01; c <= 0x0E2E; c++) if (c !== 0x0E03 && c !== 0x0E05) a.push(String.fromCharCode(c)); 'ะาำเแโใไๆฯ'.split('').forEach(c => a.push(c)); (UPV + TONE + LOWV).split('').filter(c => c !== '๎' && c !== 'ฺ').forEach(c => a.push(c)); $('fkMode').value = '0'; $('fkList').value = a.join(' '); fkCount(); };

const FONTDB = window.THAI_FONT_DB && window.THAI_FONT_DB.sets ? window.THAI_FONT_DB : null;
const curSet = () => FONTDB ? FONTDB.sets[+$('fkSet').value] : null;
function fillSets() {
  const sel = $('fkSet'); sel.innerHTML = ''; if (!FONTDB) return;
  const p = tv(), H = p.h, body = +$('fkBody').value || 5;
  const wid = st => { if (st._w != null) return st._w; let n = 0, t = 0; for (let c = 0x0E01; c <= 0x0E2E; c++) { const g = st.glyphs[String.fromCharCode(c)]; if (!g) continue; let a = 99, b = -1; g.rows.forEach(r => [...r].forEach((v, x) => { if (v !== '0') { a = Math.min(a, x); b = Math.max(b, x); } })); if (b >= 0) { n++; t += b - a + 1; } } return st._w = n ? t / n : 0; };
  const score = st => (st.kind === 'components' ? 0 : 50) + Math.abs((st.baseline - st.bodyTop + 1) - body) * 3 + (st.cellW === p.w ? 0 : 20) + Math.abs(st.cellH - H) * (H >= 16 ? 1 : 0.1) - Math.min(wid(st), 7) * 0.8;
  const idx = FONTDB.sets.map((st, i) => [i, score(st)]).sort((a, b) => a[1] - b[1]), best = idx.slice(0, 3).map(x => x[0]), keep = sel.dataset.v;
  idx.forEach(([i]) => { const st = FONTDB.sets[i], games = [...new Set(st.games.map(g => g.game))], o = document.createElement('option'); o.value = i;
    o.textContent = (best.includes(i) ? '★ ' : '') + st.id + ' · ' + st.cellW + 'x' + st.cellH + ' · ' + (st.kind === 'clusters' ? 'ทั้งพยางค์' : 'ประกอบตัว') + ' (' + games.join(', ') + ')'; sel.appendChild(o); });
  sel.value = keep != null && keep !== '' && FONTDB.sets[+keep] ? keep : best[0]; fillGames();
}
function fillGames() {
  const st = curSet(), g = $('fkGame'); $('fkSet').dataset.v = $('fkSet').value; g.innerHTML = '<option value="-1">- ค่ามาตรฐานของชุด -</option>'; if (!st) return;
  st.games.forEach((x, i) => { const o = document.createElement('option'); o.value = i; o.textContent = x.game + (x.font ? ' · ' + x.font : ''); g.appendChild(o); });
  const cov = st.coverage || {}; $('fkSetInfo').textContent = (st.title || st.id) + ' · ช่อง ' + st.cellW + 'x' + st.cellH + ' · ตัวพยัญชนะสูง ' + (st.baseline - st.bodyTop + 1) + ' จุด' + (cov.gaps && cov.gaps.length ? ' · ไม่มีตัว: ' + cov.gaps.join(' ') : '') + (st.kind === 'clusters' ? ' · ชุดนี้มีเฉพาะพยางค์ที่เกมนั้นใช้ พยางค์อื่นจะขาด' : '');
}
$('fkSet').onchange = fillGames;
function fkSrcUI() { const set = $('fkSrc').value === 'set'; $('fkSetBox').hidden = !set; $('fkGameBox').hidden = !set; $('fkFamBox').hidden = set; $('fkBoldBox').hidden = set; $('fkMethBox').hidden = set; if (!set) $('fkSetInfo').textContent = ''; else fillSets(); }
$('fkSrc').onchange = fkSrcUI; $('fkBody').addEventListener('change', () => { if ($('fkSrc').value === 'set') fillSets(); });
['tvW', 'tvH'].forEach(id => $(id).addEventListener('change', () => { if ($('fkSrc').value === 'set') fillSets(); }));

// ฟอนต์ในเครื่อง: วาดใหญ่แล้วย่อลงช่อง
const HS = 96; let srcCache = { key: '', map: new Map() };
function bbox(r, ya, yb) { ya = ya || 0; yb = yb == null ? r.h : yb; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = Math.max(0, ya); y < Math.min(r.h, yb); y++) for (let x = 0; x < r.w; x++) if (r.a[y * r.w + x] >= 110) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1 }; }
function canvasSource(fam, bold) {
  const key = 'c|' + fam + '|' + bold; if (srcCache.key !== key) srcCache = { key, map: new Map() };
  const cv = document.createElement('canvas'); cv.width = HS * 4; cv.height = HS * 3; const c = cv.getContext('2d', { willReadFrequently: true });
  const render = str => { if (srcCache.map.has(str)) return srcCache.map.get(str); c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#000'; c.font = (bold ? 'bold ' : '') + HS + 'px "' + fam + '", "Leelawadee UI", Tahoma, "Noto Sans Thai", sans-serif'; c.textBaseline = 'alphabetic'; c.fillText(str, HS, HS * 2);
    const d = c.getImageData(0, 0, cv.width, cv.height).data, a = new Uint8Array(cv.width * cv.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; const r = { a, w: cv.width, h: cv.height }; srcCache.map.set(str, r); return r; };
  const ref = bbox(render('ก')), refO = bbox(render('อ'));
  return { metrics: { top: ref.y0, bottom: ref.y1 },
    base(ch) { const r = render(ch); if (!r.bb0) r.bb0 = bbox(r); r.bb = r.bb0; return r; },
    mark(ch) { const r = render('อ' + ch), up = !LOWV.includes(ch), m = Math.round((refO.y1 - refO.y0) * 0.06); if (!r.bbm) r.bbm = up ? bbox(r, 0, refO.y0 - m) : bbox(r, refO.y1 + m, r.h); r.bb = r.bbm; return r; } };
}
function skeleton(r) { if (r.sk) return r.sk; const W = r.w, H = r.h, b = new Uint8Array(W * H); for (let i = 0; i < b.length; i++) b[i] = r.a[i] >= 128 ? 1 : 0; const bb = bbox(r); if (!bb) { r.sk = b; return b; }
  const x0 = Math.max(1, bb.x0 - 1), x1 = Math.min(W - 2, bb.x1 + 1), y0 = Math.max(1, bb.y0 - 1), y1 = Math.min(H - 2, bb.y1 + 1); let ch = true; const del = [];
  for (let it = 0; ch && it < 200; it++) { ch = false; for (let step = 0; step < 2; step++) { del.length = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (!b[i]) continue; const p2 = b[i - W], p3 = b[i - W + 1], p4 = b[i + 1], p5 = b[i + W + 1], p6 = b[i + W], p7 = b[i + W - 1], p8 = b[i - 1], p9 = b[i - W - 1];
      const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue; const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
      if (step === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) del.push(i); }
    if (del.length) { ch = true; for (const i of del) b[i] = 0; } } }
  r.sk = b; return b; }
function stampSk(cov, W, H, r, bb, dx, dy, sx, sy) { const sk = skeleton(r); for (let Y = bb.y0; Y <= bb.y1; Y++) for (let X = bb.x0; X <= bb.x1; X++) { if (!sk[Y * r.w + X]) continue; const tx = Math.floor(dx + (X - bb.x0 + .5) * sx), ty = Math.floor(dy + (Y - bb.y0 + .5) * sy); if (tx >= 0 && tx < W && ty >= 0 && ty < H) cov[ty * W + tx] = Math.max(cov[ty * W + tx], 1); } }
function stamp(cov, W, H, r, bb, dx, dy, sx, sy) { const N = 5; for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) { let s = 0, hit = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const X = Math.floor(bb.x0 + (tx + (i + .5) / N - dx) / sx), Y = Math.floor(bb.y0 + (ty + (j + .5) / N - dy) / sy); if (X < bb.x0 || X > bb.x1 || Y < bb.y0 || Y > bb.y1) continue; hit++; s += r.a[Y * r.w + X]; }
  if (hit) { const v = s / (N * N * 255); if (v > cov[ty * W + tx]) cov[ty * W + tx] = v; } } }
function FS() { const p = tv(); return { W: p.w, H: p.h, body: Math.max(3, +$('fkBody').value || 5), thr: Math.min(.9, Math.max(.1, (+$('fkThr').value || 40) / 100)), dx: +$('fkDx').value || 0, aw: Math.max(3, Math.min(p.w, +$('fkW').value || 7)), src: $('fkSrc').value, fam: $('fkFam').value, bold: $('fkBold').checked, mode: $('fkMeth').value, ws: Math.max(.5, Math.min(3, (+$('fkSx').value || 100) / 100)) }; }
function makeGlyph(cl, fs, src) {
  const W = fs.W, H = fs.H, cov = new Float32Array(W * H), draw = (...a) => { if (fs.mode !== 'thin') stamp(cov, W, H, ...a); if (fs.mode !== 'avg') stampSk(cov, W, H, ...a); };
  const lowerH = H >= 16 ? 2 : 1, baseRow = H - 1 - lowerH, bodyTop = Math.max(1, baseRow - fs.body + 1), gap = bodyTop >= 5 ? 1 : 0, markBot = bodyTop - gap, k = fs.body / (src.metrics.bottom - src.metrics.top + 1);
  let base = cl[0], ms = [...cl.slice(1)]; if (isMark(base)) { ms.unshift(base); base = null; }
  let right = Math.min(W - 1, fs.aw) + fs.dx;
  if (base) { const c = src.base(base); if (c && c.bb) { const bw = c.bb.x1 - c.bb.x0 + 1; let sx = k * fs.ws; if (bw * sx > fs.aw) sx = fs.aw / bw; const tw = bw * sx, dx = Math.round((fs.aw - tw) / 2) + fs.dx, dy = (baseRow + 1) - (src.metrics.bottom + 1 - c.bb.y0) * k; draw(c, c.bb, dx, dy, sx, k); right = dx + tw; } }
  const ups = ms.filter(m => UPV.includes(m)), tones = ms.filter(m => TONE.includes(m)), lows = ms.filter(m => LOWV.includes(m)), asc = base && 'ปฝฟฬ'.includes(base) ? Math.max(1, Math.round(fs.body / 4)) : 0, zones = [];
  if (ups.length && tones.length) { const h1 = Math.ceil(markBot / 2); zones.push([ups[0], markBot - h1, markBot], [tones[0], 0, markBot - h1]); } else if (ups.length) zones.push([ups[0], 0, markBot]); else if (tones.length) zones.push([tones[0], 0, markBot]);
  if (lows.length) zones.push([lows[0], baseRow + 1, H]);
  for (const [m, z0, z1] of zones) { const c = src.mark(m); if (!c || !c.bb) continue; const bw = c.bb.x1 - c.bb.x0 + 1, bh = c.bb.y1 - c.bb.y0 + 1, zh = z1 - z0; if (zh <= 0) continue;
    const sy = fs.H < 16 ? zh / bh : Math.min(k, zh / bh), sx = Math.min(k * fs.ws, fs.aw / bw), tw = bw * sx, th = bh * sy; let dx = right - asc - tw; if (dx < 0) dx = 0; const dy = LOWV.includes(m) ? z0 : z1 - th; draw(c, c.bb, dx, dy, sx, sy); }
  const px = new Uint8Array(W * H); for (let i = 0; i < px.length; i++) px[i] = cov[i] >= fs.thr ? 1 : 0; return px;
}
function fkColors() {
  const p = tv(), m = p.max; let ink = parseHex($('fkInk').value), bg = parseHex($('fkBg').value), sh = $('fkSh').value.trim().toLowerCase(); sh = sh === 'none' || sh === '-1' ? -1 : parseHex(sh);
  if ((isNaN(ink) || isNaN(bg) || isNaN(sh)) && S.orig) { const hist = new Array(m + 1).fill(0), rom = workRom(); for (let n = 0; n < 64; n++) { const o = cellOff(p, n); if (o + p.bytes > rom.length) break; getCell(rom, o, p).forEach(x => hist[Math.min(x, m)]++); }
    const ord = hist.map((c, i) => [i, c]).sort((a, b) => b[1] - a[1]); if (isNaN(bg)) bg = ord[0][0]; if (isNaN(ink)) ink = ord[1] && ord[1][1] ? ord[1][0] : m; if (isNaN(sh)) sh = ord[2] && ord[1] && ord[2][1] > ord[1][1] * 0.15 ? ord[2][0] : -1; }
  if (isNaN(ink)) ink = m; if (isNaN(bg)) bg = 0; if (isNaN(sh) || m === 1) sh = -1; return { ink, bg, sh };
}
function toPal(px, W, H, col) { const out = new Uint8Array(W * H).fill(col.bg); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (px[y * W + x]) out[y * W + x] = col.ink; else if (col.sh >= 0 && ((x > 0 && px[y * W + x - 1]) || (y > 0 && px[(y - 1) * W + x]) || (x > 0 && y > 0 && px[(y - 1) * W + x - 1]))) out[y * W + x] = col.sh; } return out; }
// จัดพยางค์ด้วยข้อมูลคลังฟอนต์ แล้วบีบลงช่องของเกม (W x H)
function setGlyph(cl, fs, st, prof, col) {
  const W = fs.W, H = fs.H, L = FDB.layout(st, prof, cl), CW = st.cellW * 3, SH = st.cellH, g = new Uint8Array(CW * SH), miss = [...L.miss];
  for (const op of L.ops) { if (op.box) continue; op.g.rows.forEach((r, y) => [...r].forEach((c, x) => { const v = parseInt(c, 16), X = op.x + x + st.cellW, Y = op.y + y; if (v && X >= 0 && X < CW && Y >= 0 && Y < SH) g[Y * CW + X] = Math.max(g[Y * CW + X], v); })); }
  if (col.sh >= 0) FDB.applyFx(g, CW, SH, FDB.effectsOf(prof));
  let x0 = CW, x1 = -1; for (let y = 0; y < SH; y++) for (let x = 0; x < CW; x++) if (g[y * CW + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const out = new Uint8Array(W * H).fill(col.bg); if (x1 < 0) return { px: out, miss };
  const fixed = st.cellW === W && !(L.ops.length && L.ops[0].g && L.ops[0].g.type !== 'base'); if (fixed) x0 = st.cellW + 2 - ((L.ops[0] && L.ops[0].g && L.ops[0].g.left) || 0); const sw = fixed ? W : x1 - x0 + 1;
  const lowerH = H >= 16 ? 2 : 1, baseRow = H - 1 - lowerH, bodyTop = Math.max(1, baseRow - fs.body + 1), gap = bodyTop >= 5 ? 1 : 0, markBot = bodyTop - gap, rowMap = new Int16Array(SH).fill(-1);
  if (SH === H) { for (let y = 0; y < SH; y++) rowMap[y] = y; }
  else { const ink = y => { for (let x = x0; x <= x1; x++) if (g[y * CW + x]) return true; return false; };
    const zone = (a, b, ta, tb, align) => { let u = -1, v = -1; for (let y = a; y < b; y++) if (ink(y)) { if (u < 0) u = y; v = y; } if (u < 0 || tb <= ta) return; const n = v - u + 1, m = tb - ta; for (let y = u; y <= v; y++) rowMap[y] = n <= m ? (align === 'bottom' ? tb - n + (y - u) : ta + (y - u)) : ta + Math.floor((y - u) * m / n); };
    zone(0, st.bodyTop, 0, markBot, 'bottom'); const sb = st.baseline - st.bodyTop + 1; for (let y = st.bodyTop; y <= st.baseline; y++) rowMap[y] = bodyTop + Math.floor((y - st.bodyTop) * fs.body / sb); zone(st.baseline + 1, SH, baseRow + 1, H, 'top'); }
  const aw = fixed ? W : fs.aw, tw = Math.min(sw, aw), dx = fixed ? fs.dx : Math.max(0, Math.round((aw - tw) / 2) + fs.dx);
  for (let y = 0; y < SH; y++) { const ty = rowMap[y]; if (ty < 0 || ty >= H) continue; for (let x = 0; x < sw; x++) { const v = g[y * CW + x0 + x]; if (!v) continue; const tx = dx + (sw <= aw ? x : Math.floor(x * aw / sw)); if (tx < 0 || tx >= W) continue;
    const idx = v === 250 ? (col.sh >= 0 ? col.sh : -1) : (st.levels > 1 && v / st.levels < 0.45 && col.sh >= 0 ? col.sh : col.ink); if (idx < 0) continue; const q = ty * W + tx; if (out[q] !== col.ink) out[q] = idx; } }
  return { px: out, miss };
}
function buildGlyphs() {
  const fs = FS(), list = $('fkList').value.split(/\s+/).filter(Boolean).map(x => RS.normThai(x)), slots = parseSlots($('fkSlots').value), col = fkColors();
  if (fs.src === 'set') { const st = curSet(); if (!st) throw new Error('ไม่มีคลังฟอนต์'); const prof = st.games[+$('fkGame').value] || null, miss = new Set();
    const gl = list.slice(0, slots.length).map((cl, i) => { const r = setGlyph(cl, fs, st, prof, col); r.miss.forEach(m => miss.add(m)); return { cl, code: slots[i], px: r.px }; });
    return { gl, fs, missing: list.slice(slots.length), nofont: [...miss] }; }
  const src = canvasSource(fs.fam, fs.bold);
  return { gl: list.slice(0, slots.length).map((cl, i) => ({ cl, code: slots[i], px: toPal(makeGlyph(cl, fs, src), fs.W, fs.H, col) })), fs, missing: list.slice(slots.length), nofont: [] };
}
function drawItems(cv, items, W, H, max, z, labels) {
  const per = 16, n = Math.min(per, items.length) || 1, R = Math.ceil(items.length / per) || 1, lab = labels ? 14 : 0; cv.width = n * (W * z + 6); cv.height = R * (H * z + 6 + lab); const c = cv.getContext('2d'); c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
  items.forEach((g, i) => { const X = (i % per) * (W * z + 6) + 3, Y = Math.floor(i / per) * (H * z + 6 + lab) + 3; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = gray(g.px[y * W + x], max); c.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; c.fillRect(X + x * z, Y + y * z, z, z); }
    if (labels) { c.fillStyle = '#ff9ccc'; c.font = '11px monospace'; c.textBaseline = 'top'; c.fillText(hex(g.code), X, Y + H * z + 1); } });
}
$('fkPrev').onclick = () => { try { const { gl, fs, missing, nofont } = buildGlyphs(); if (!gl.length) { setMsg('fkMsg', 'bad', 'ยังไม่มีรายการตัวอักษร หรือยังไม่ได้ใส่ช่องที่จะเขียน'); return; }
  drawItems($('fkCv'), gl, fs.W, fs.H, tv().max, 4, true); setMsg('fkMsg', nofont.length || missing.length ? 'warn' : 'ok', 'ตัวอย่าง ' + gl.length + ' ตัว' + (missing.length ? ' · ช่องไม่พอ ไม่ได้สร้าง: ' + missing.join(' ') : '') + (nofont.length ? ' · ชุดนี้ไม่มีตัว: ' + nofont.join(' ') + ' (ลองชุดอื่น)' : '') + ' · ถ้าตัวเล็ก/ใหญ่ไป ปรับ "ความสูงตัวพยัญชนะ"'); } catch (e) { setMsg('fkMsg', 'bad', e.message); } };
$('fkTestGo').onclick = () => { if (!S.orig) return; try { const { gl, fs } = buildGlyphs(), p = tv(), map = new Map(gl.map(g => [g.cl, g])), items = [], rom = workRom();
  for (const cl of thClusters($('fkTest').value, $('fkMode').value === '1')) { const g = map.get(cl); if (g) { items.push(g); continue; }
    const pr = S.table.pairs.find(([b, c]) => b.length === 1 && c === cl); if (pr && !isNaN(p.first) && pr[0][0] >= p.first) items.push({ px: getCell(rom, cellOff(p, pr[0][0] - p.first), p), code: pr[0][0] }); else items.push({ px: new Uint8Array(fs.W * fs.H).fill(p.max), code: 0 }); }
  const cv = $('fkCv2'), z = 4; cv.width = Math.max(1, items.length) * fs.W * z; cv.height = fs.H * z; const c = cv.getContext('2d');
  items.forEach((g, i) => { for (let y = 0; y < fs.H; y++) for (let x = 0; x < fs.W; x++) { const q = gray(g.px[y * fs.W + x], p.max); c.fillStyle = 'rgb(' + q + ',' + q + ',' + q + ')'; c.fillRect((i * fs.W + x) * z, y * z, z, z); } }); } catch (e) { setMsg('fkMsg', 'bad', e.message); } };
$('fkWrite').onclick = () => {
  if (!S.orig) return; const p = tv(); if (isNaN(p.first)) { setMsg('fkMsg', 'bad', 'ตั้ง "ช่องแรกคือรหัส" ในกล่องดูกราฟิกด้านบนก่อน (รหัสอักษรของช่องแรกที่ตำแหน่งเริ่ม)'); return; }
  try { const { gl, missing } = buildGlyphs(); if (!gl.length) { setMsg('fkMsg', 'bad', 'ยังไม่มีรายการตัวอักษร หรือยังไม่ได้ใส่ช่องที่จะเขียน'); return; }
    const bad = gl.filter(g => g.code < p.first); if (bad.length) { setMsg('fkMsg', 'bad', 'ช่อง ' + bad.map(g => hex(g.code)).join(' ') + ' อยู่ก่อนช่องแรกของฟอนต์'); return; }
    const used = new Uint32Array(256); for (const e of S.entries) for (let j = e.off; j < e.off + e.len; j++) used[S.orig[j]]++;
    const over = gl.filter(g => used[g.code] && !isThai(S.table.dec1[g.code] || ''));
    S.patches = S.patches.filter(x => !(x.fk && gl.some(g => cellPatches(new Uint8Array(p.w * p.h), p, g.code - p.first).some(y => y.off === x.off))));
    const map = new Map(); for (const g of gl) { for (const x of cellPatches(g.px, p, g.code - p.first)) S.patches.push(Object.assign(x, { font: true, fk: true })); map.set(g.code, g.cl); }
    S.work = null; tblPut(map); drawTiles();
    setMsg('fkMsg', over.length ? 'warn' : 'ok', 'เขียนฟอนต์ไทย ' + gl.length + ' ตัวและเพิ่มในตารางอักษรแล้ว' + (missing.length ? ' · ยังขาด ' + missing.length + ' ตัว: ' + missing.join(' ') : '') + (over.length ? ' · ระวัง: ช่อง ' + over.map(g => hex(g.code)).join(' ') + ' เดิมมีใช้ในข้อความของเกม ข้อความอังกฤษที่ใช้ช่องนั้นจะเพี้ยน' : '') + ' · บันทึก .tbl เก็บไว้ในแท็บตารางอักษร');
  } catch (e) { setMsg('fkMsg', 'bad', e.message); }
};
$('fkClear').onclick = () => { S.patches = S.patches.filter(x => !x.fk); S.work = null; drawTiles(); setMsg('fkMsg', '', 'ลบฟอนต์ที่เขียนจากกล่องนี้แล้ว (ตารางอักษรยังคงเดิม)'); };

/* ===== จับคู่ประโยคไทยกับไบต์ในรอม ===== */
$('btnPair').onclick = () => {
  if (!S.orig) return; const text = $('pairText').value.trim(); if (!text) { setMsg('pairMsg', 'bad', 'พิมพ์ประโยคไทยก่อน'); return; }
  const rom = S.ana ? S.ana.rom : workRom(), rev = new Map(); for (const [b, c] of S.table.pairs) if (b.length === 1 && !rev.has(c)) rev.set(c, b[0]);
  const areas = $('pairAll').checked || !S.ana ? [[0, rom.length]] : S.ana.regions.map(r => [Math.max(0, r.a - 64), Math.min(rom.length, r.b + 64)]);
  const res = [], seen = new Set();
  for (const pre of [true, false]) { const u = thClusters(text, pre); if (u.length < 5) continue; const first = u.map(x => u.indexOf(x)), known = u.map(x => rev.has(x) && isThai(x) ? rev.get(x) : undefined);
    for (const [A, B] of areas) for (let p = A; p + u.length <= B && res.length < 50; p++) { const used = new Map(); let ok = true;
      for (let i = 0; i < u.length; i++) { const b = rom[p + i]; if (known[i] !== undefined && b !== known[i]) { ok = false; break; }
        if (first[i] !== i) { if (b !== rom[p + first[i]]) { ok = false; break; } } else { if (used.has(b)) { ok = false; break; } used.set(b, u[i]); } }
      if (!ok || seen.has(p)) continue; seen.add(p); res.push({ p, pre, map: used }); } }
  const box = $('pairRes'); box.innerHTML = '';
  if (!res.length) { setMsg('pairMsg', 'bad', 'ไม่เจอ: พิมพ์ให้ตรงจอทุกตัว (รวมช่องว่าง) ลองติ๊ก "ค้นทั้งรอม" หรือเกมนี้อาจใช้ 2 ไบต์ต่อตัว / บีบอัดข้อความ'); return; }
  setMsg('pairMsg', 'ok', res.length === 1 ? 'เจอ 1 ที่ น่าจะถูก กดเพิ่มลงตารางได้' : 'เจอ ' + res.length + ' ที่ ถ้าเยอะเกิน ใช้ประโยคที่ยาวขึ้นหรือมีตัวซ้ำมากขึ้น');
  res.slice(0, 12).forEach(r => { const d = document.createElement('div'); d.className = 'msg'; d.style.margin = '8px 0'; const pairs = [...r.map.entries()].sort((a, b) => a[0] - b[0]);
    d.innerHTML = '<b class="mono">0x' + hex(r.p, 6) + '</b> (' + (r.pre ? '1 ช่องต่อพยางค์ รวมสระบน/ล่าง' : '1 ไบต์ต่อ 1 ตัวอักษร') + ')<div class="mono" style="margin:4px 0"></div>';
    d.querySelector('.mono:not(b)').textContent = pairs.map(([b, c]) => hex(b) + '=' + (c === ' ' ? '(ช่องว่าง)' : c)).join('  ');
    const add = document.createElement('button'); add.className = 'btn sm'; add.textContent = 'เพิ่มลงตาราง'; add.onclick = () => { tblPut(new Map(pairs)); setMsg('pairMsg', 'ok', 'เพิ่ม ' + pairs.length + ' ตัวในตารางแล้ว' + (S.ana ? ' กด "วิเคราะห์ใหม่" ในแท็บแพตช์ได้' : '')); }; d.appendChild(add);
    const th = pairs.filter(([, c]) => c.length === 1 && isThai(c)), offs = new Set(th.map(([b, c]) => b - c.charCodeAt(0) + 0x0E00));
    if (th.length >= 4 && offs.size === 1) { const o = [...offs][0], bt = document.createElement('button'); bt.className = 'btn sm pri'; bt.style.marginLeft = '6px'; bt.textContent = o === 0xA0 ? 'นี่คือรหัส TIS-620 เติมตัวไทยครบทั้งชุด' : 'ตัวไทยเรียงตามลำดับมาตรฐาน เติมครบทั้งชุด';
      bt.onclick = () => { const m = new Map(); for (let c = 0x0E01; c <= 0x0E5B; c++) { const b = c - 0x0E00 + o; if (b < 0 || b > 255 || (c > 0x0E3A && c < 0x0E3F)) continue; m.set(b, String.fromCharCode(c)); } for (const [b, c] of pairs) if (!isThai(c)) m.set(b, c); tblPut(m); setMsg('pairMsg', 'ok', 'เติมตัวไทย ' + m.size + ' ตัวในตารางแล้ว'); }; d.appendChild(bt); }
    box.appendChild(d); });
};

/* ===== แตกแพตช์ + วิเคราะห์ ===== */
function diffRegions(a, b, gap) { const R = []; let s = -1, last = -1; for (let i = 0; i < b.length; i++) { if (i >= a.length || a[i] !== b[i]) { if (s < 0) s = i; else if (i - last > gap) { R.push([s, last + 1]); s = i; } last = i; } } if (s >= 0) R.push([s, last + 1]); return R; }
const isGbaRom = () => S.sys && S.sys.id === 'gba';
function splitRegion(a, b, rom) { if (b - a < 64) return [[a, b]]; const out = [], gba = isGbaRom(), push = (x, y) => { if (y > x) out.push([x, y]); };
  const isP = p => { const w = RS.u32(rom, p); return (w >>> 24 === 8 || w >>> 24 === 9) && (w & 0x1FFFFFF) < rom.length; }, isT = j => S.table.dec1[rom[j]] !== undefined; let s = a, i = a;
  while (i < b) { if (gba && i % 4 === 0 && i + 8 <= b && isP(i) && isP(i + 4)) { let j = i; while (j + 4 <= b && isP(j)) j += 4; push(s, i); push(i, j); s = i = j; continue; }
    if (isT(i)) { let j = i, bad = 0, good = 0; while (j < b && bad <= 3) { if (isT(j)) { good++; bad = 0; } else bad++; j++; } j -= bad; if (good >= 12) { push(s, i); push(i, j); s = i = j; continue; } }
    if (rom[i] === 0 || rom[i] === 255) { let j = i; while (j < b && rom[j] === rom[i]) j++; if (j - i >= 32) { push(s, i); push(i, j); s = i = j; continue; } }
    i++; }
  push(s, b); return out; }
function classify(a, b, rom) { const len = b - a, r = { a, b, len }, sys = S.sys ? S.sys.id : '';
  if (sys === 'gba') { let cov = 0; const ptr = []; for (let p = a & ~3; p < b; p += 4) { const w = RS.u32(rom, p); if ((w >>> 24 === 8 || w >>> 24 === 9) && (w & 0x1FFFFFF) < rom.length) { ptr.push([p, w & 0x1FFFFFF]); cov += Math.min(b, p + 4) - Math.max(a, p); } } if (ptr.length && cov >= len * 0.9) { r.type = 'ptr'; r.ptrs = ptr; return r; } }
  else if (len <= 3) { let p = a, v = rom[p] | (rom[p + 1] << 8); if (sys === 'gb' && !(v >= 0x4000 && v < 0x8000) && a > 0) { const v2 = rom[a - 1] | (rom[a] << 8); if (v2 >= 0x4000 && v2 < 0x8000) { p = a - 1; v = v2; } }
    let t = null; if (sys === 'gb' && v >= 0x4000 && v < 0x8000) { const bk = rom[p + 2]; t = bk && bk * 0x4000 < rom.length ? bk * 0x4000 + (v - 0x4000) : (p & ~0x3FFF) + (v - 0x4000); } r.type = 'ptr'; r.ptrs = [[p, t]]; return r; }
  const d = decodeBytes(rom, a, b); if (len >= 3 && d.known / len >= 0.6 && d.letters >= 2) { r.type = 'text'; r.txt = d.s; return r; }
  let z = 0; const hist = new Uint32Array(256); for (let i = a; i < b; i++) { hist[rom[i]]++; if (rom[i] === 0 || rom[i] === 255) z++; } let distinct = 0; for (const h of hist) if (h) distinct++;
  if (len >= 16 && (z / len >= 0.2 || distinct > len * 0.6 && len >= 64)) { r.type = 'gfx'; return r; } r.type = 'unk'; return r; }
const TYPE0 = { text: '<span style="color:var(--ok)">ข้อความ</span>', gfx: '<span style="color:#9fd">รูป / ฟอนต์</span>', ptr: '<span style="color:var(--warn)">พอยน์เตอร์</span>', unk: '<span style="opacity:.75">ไม่ทราบ (ข้อความที่ตารางยังอ่านไม่ออก / โค้ด / ข้อมูล)</span>' };
const hexDump = (rom, a, b, max) => { const o = []; for (let i = a; i < Math.min(b, a + max); i++) o.push(hex(rom[i])); return o.join(' ') + (b - a > max ? ' …' : ''); };
function jumpTiles(off) { const p = tv(); $('tvOff').value = hex(off - (off % Math.max(1, p.tb || p.bytes)), 6); S.tvSel = null; document.querySelector('#tabs [data-t=font]').click(); drawTiles(); }
function analyse() { if (!S.ana) return; const rom = S.ana.rom, R = []; for (const [a, b] of diffRegions(real(S.orig), rom, 16)) for (const [x, y] of splitRegion(a, b, rom)) R.push(classify(x, y, rom)); S.ana.regions = R;
  const cnt = { text: 0, gfx: 0, ptr: 0, unk: 0 }; R.forEach(r => cnt[r.type]++);
  setMsg('anaMsg', 'ok', S.ana.name + ': ส่วนที่ต่างจากต้นฉบับ ' + R.length.toLocaleString() + ' ช่วง · ข้อความ ' + cnt.text + ' · รูป/ฟอนต์ ' + cnt.gfx + ' · พอยน์เตอร์ ' + cnt.ptr + ' · ไม่ทราบ ' + cnt.unk + (rom.length > S.orig.length ? ' · รอมขยายจาก ' + (S.orig.length / 1048576).toFixed(1) + ' เป็น ' + (rom.length / 1048576).toFixed(1) + ' MB' : '') + (cnt.unk > cnt.text ? ' · ช่วง "ไม่ทราบ" เยอะ ลองสร้างตารางอักษรไทยในแท็บตารางอักษร' : ''));
  renderAna(); }
function renderAna() { const R = S.ana ? S.ana.regions : [], on = new Set([...document.querySelectorAll('.f0')].filter(c => c.checked).map(c => c.value)), tb = $('anaTb').tBodies[0], rom = S.ana ? S.ana.rom : null; tb.innerHTML = ''; let shown = 0;
  R.forEach((r, i) => { if (!on.has(r.type) || shown >= 2000) return; shown++; const tr = tb.insertRow(); let prev = '', btn = '';
    if (r.type === 'text') { prev = esc2(r.txt.slice(0, 120)); btn = '<button class="btn sm" data-a="txt" data-i="' + i + '">ดูข้อความ</button>'; }
    else if (r.type === 'ptr') { prev = r.ptrs.slice(0, 4).map(([p, t]) => '0x' + hex(p, 6) + ' → ' + (t != null ? '0x' + hex(t, 6) : '?')).join('<br>') + (r.ptrs.length > 4 ? '<br>… รวม ' + r.ptrs.length + ' ตัว' : ''); btn = '<button class="btn sm" data-a="ptr" data-i="' + i + '">ดูปลายทาง</button>'; }
    else { prev = '<span class="mono">' + hexDump(rom, r.a, r.b, 24) + '</span>'; btn = '<button class="btn sm" data-a="gfx" data-i="' + i + '">ดูเป็นรูป</button> <button class="btn sm" data-a="txt" data-i="' + i + '">ดูเป็นข้อความ</button>'; }
    tr.innerHTML = '<td>' + (i + 1) + '</td><td class="mono">0x' + hex(r.a, 6) + '</td><td>' + r.len.toLocaleString() + '</td><td>' + TYPE0[r.type] + '</td><td class="t">' + prev + '</td><td style="white-space:nowrap">' + btn + '</td>'; });
  tb.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => { const r = R[+b.dataset.i], box = $('anaInfo'); box.hidden = false;
    if (b.dataset.a === 'gfx') { if (S.anaWork) jumpTiles(r.a); else toast('กด "ใช้รอมที่ลงแพตช์นี้ทำงานต่อ" ก่อน จึงจะดูรูปที่แพตช์แก้ได้ (ตอนนี้แท็บฟอนต์แสดงรอมต้นฉบับ)', 7000); return; }
    if (b.dataset.a === 'txt') { const d = decodeBytes(rom, r.a, Math.min(r.b, r.a + 2000)); box.innerHTML = '<b>0x' + hex(r.a, 6) + '–0x' + hex(r.b, 6) + '</b> อ่านด้วยตารางปัจจุบัน:<div class="t" style="margin:6px 0;white-space:pre-wrap"></div><div class="mono" style="word-break:break-all;opacity:.7">' + hexDump(rom, r.a, r.b, 256) + '</div>'; box.querySelector('.t').textContent = d.s; box.scrollIntoView({ block: 'nearest' }); return; }
    const T = S.terms && S.terms.length ? new Set(S.terms) : new Set([S.term]), strs = [];
    box.innerHTML = r.ptrs.slice(0, 40).map(([p, t]) => { if (t == null) return '0x' + hex(p, 6) + ' → ไม่ทราบปลายทาง'; let e = t; while (e < rom.length && e < t + 300 && !T.has(rom[e])) e++; strs.push(decodeBytes(rom, t, e).s.slice(0, 200)); return 'พอยน์เตอร์ที่ <b class="mono">0x' + hex(p, 6) + '</b> ชี้ไป <b class="mono">0x' + hex(t, 6) + '</b>: <span class="t"></span>'; }).join('<br>');
    box.querySelectorAll('.t').forEach((x, k) => x.textContent = strs[k]); box.scrollIntoView({ block: 'nearest' }); }); }
document.querySelectorAll('.f0').forEach(c => c.onchange = renderAna);
$('btnAna').onclick = pick('fileAna', async f => {
  if (!S.orig || S.demo) { setMsg('anaMsg', 'bad', 'เปิดรอมต้นฉบับ (ยังไม่แพตช์) ก่อน'); return; }
  try { const p = await readFile(f), src = real(S.orig), out = String.fromCharCode(p[0], p[1], p[2], p[3]) === 'PATC' ? RS.applyIps(src, p) : RS.applyBps(src, p);
    S.ana = { rom: out, name: f.name, regions: [] }; S.anaWork = false; analyse(); }
  catch (e) { setMsg('anaMsg', 'bad', e.message); }
});
$('btnAnaRe').onclick = () => { if (S.ana) analyse(); else setMsg('anaMsg', 'bad', 'ยังไม่ได้เลือกแพตช์'); };
$('btnAnaUse').onclick = () => {
  if (!S.ana) { setMsg('anaMsg', 'bad', 'ยังไม่ได้เลือกแพตช์'); return; }
  if ((S.entries.some(e => e.thai) || S.patches.length) && !confirm('งานแปลที่ทำค้างไว้กับรอมนี้จะถูกล้าง ใช้รอมที่ลงแพตช์แล้วแทนไหม?')) return;
  const ana = S.ana, tbl = $('tblText').value; setRom(S.swap ? RS.swap16(ana.rom) : ana.rom, S.name.replace(/(\.[^.]+)?$/, ' [' + ana.name.replace(/\.[^.]+$/, '') + ']$1'), false, S.swap);
  $('tblText').value = tbl; applyTbl(tbl); S.ana = ana; S.anaWork = true; doScan(false);
  setMsg('anaMsg', 'ok', 'ใช้รอมที่ลงแพตช์แล้วเป็นงานใหม่ แกะข้อความใหม่ให้แล้ว (ข้อความไทยเดิมแก้ได้ในแท็บข้อความ) แพตช์ที่บันทึกต่อจากนี้ต้องแปะต่อจากแพตช์ ' + ana.name + ' หรือใช้ "สร้างแพตช์จากสองไฟล์" เพื่อรวมเป็นไฟล์เดียว');
};
let bpsA = null, bpsB = null;
$('btnBpsA').onclick = pick('fileBpsA', async f => { bpsA = { f, d: await readFile(f) }; setMsg('bps2Msg', '', 'ต้นฉบับ: ' + f.name + (bpsB ? ' · แก้แล้ว: ' + bpsB.f.name : '')); });
$('btnBpsB').onclick = pick('fileBpsB', async f => { bpsB = { f, d: await readFile(f) }; setMsg('bps2Msg', '', (bpsA ? 'ต้นฉบับ: ' + bpsA.f.name + ' · ' : '') + 'แก้แล้ว: ' + f.name); });
$('btnBps2').onclick = async () => { if (!bpsA || !bpsB) { setMsg('bps2Msg', 'bad', 'เลือกทั้งสองไฟล์ก่อน'); return; }
  const p = RS.createBps(bpsA.d, bpsB.d); await save(bpsB.f.name.replace(/\.[^.]+$/, '') + '.bps', p); setMsg('bps2Msg', 'ok', 'สร้างแพตช์แล้ว ขนาด ' + p.length.toLocaleString() + ' ไบต์'); };

/* ===== แท็บคลังฟอนต์ และคู่มือ ===== */
const FDB_PAGE = __FDB_PAGE__;
const GUIDE = __GUIDE__;
$('tabs').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.t === 'fontdb' && !$('fdbFrame').srcdoc) $('fdbFrame').srcdoc = FDB_PAGE;
  if (b.dataset.t === 'guide' && !$('guideBox').innerHTML) $('guideBox').innerHTML = GUIDE;
  if (b.dataset.t === 'font' && FONTDB && !$('fkSet').options.length) fkSrcUI(); });
fkCount();
