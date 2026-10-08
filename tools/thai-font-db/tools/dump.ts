import { buildThaiGlyphs } from './src/font/thai-glyphs.ts';
const L: any = {
  normal: { bodyTop: 6, bodyRows: 5, lowerMarkTop: 11, height: 14, narrow: false },
  small: { bodyTop: 6, bodyRows: 5, lowerMarkTop: 11, height: 13, narrow: true },
};
const out: any = {};
for (const [n, l] of Object.entries(L)) {
  out[n] = buildThaiGlyphs().map((g) => ({ char: g.char, cp: g.char.codePointAt(0), slot: g.slot, isMark: g.isMark, shiftLeft: g.shiftLeft, shadowBelow: g.shadowBelow, rows: g.rows(l as any).map((m: number, y: number) => (y < (l as any).height ? m : 0)) }));
}
console.log(JSON.stringify(out));
