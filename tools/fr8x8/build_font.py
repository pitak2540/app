#!/usr/bin/env python3
"""Build the 8x8 Thai glyph set for the FireRed F9-slot patch.

Each slot = 8x8 pixels, 2bpp (0 transparent, 1 ink, 2 shadow) + attributes:
  advance (u8), yoff (u8: row inside the 16-row text cell), xshift (s8: draw offset from pen).
Glyphs are derived from GNU Unifont's Thai bitmaps, squeezed to fit, then hand-tuned.
"""
import sys, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from uni import bm

GAP = 1          # pixels after ink (the shadow column doubles as spacing)
BASE = 0x20      # first F9 code used for Thai
NSLOTS = 0xB0    # F9 20 .. F9 CF

def ink(ch):
    b = bm(ch)
    return {(x, y) for y in range(16) for x in range(24) if b[y][x]}

def rows_of(px): return sorted({y for x, y in px})

def parse(art, top):
    """art: list of strings, '#' = ink. returns set of (x,y) with y starting at top."""
    s = set()
    for r, line in enumerate(art):
        for c, ch in enumerate(line):
            if ch == '#': s.add((c, top + r))
    return s

# ---------------------------------------------------------------- squeeze
def squeeze_body(px):
    """map unifont rows -> our rows. body rows 6..13 -> 5..10 (drop 2 rows)."""
    rowpat = {y: tuple(sorted(x for x, yy in px if yy == y)) for y in range(16)}
    win = list(range(6, 14))
    # candidates: rows equal to the row above (duplicate), prefer middle
    cands = []
    for y in win:
        score = 100
        if y > 6 and rowpat[y] == rowpat[y - 1]:
            score = abs(y - 9.5)
        elif y < 13 and rowpat[y] == rowpat[y + 1]:
            score = abs(y - 9.5) + 0.5
        else:
            # hamming distance with neighbour
            a = set(rowpat[y]); nb = set(rowpat[y - 1]) if y > 6 else set(rowpat[y + 1])
            score = 10 + len(a ^ nb) + abs(y - 9.5) * 0.1
        cands.append((score, y))
    cands.sort()
    drop = set()
    for sc, y in cands:
        if len(drop) == 2: break
        # avoid dropping two adjacent duplicates of the same run which kills a 2-row feature
        drop.add(y)
    m = {}
    out = 5
    for y in win:
        if y in drop: continue
        m[y] = out; out += 1
    for y in range(0, 6): m[y] = y - 1
    m[14] = 11; m[15] = 12
    res = set()
    for x, y in px:
        if y in m: res.add((x, m[y]))
    return res, drop

CIRCLE_ROWS = range(5, 12)

glyphs = {}   # code(0..NSLOTS-1) -> dict(px=set((x,y)), adv=int, shadow='full'|'right', name=str)

def put(code, name, px, adv, shadow='full'):
    glyphs[code] = dict(px=px, adv=adv, shadow=shadow, name=name)

def spacing(ch, override=None, top=5):
    if override is not None:
        px = parse(override, top)
    else:
        raw = ink(ch)
        x0 = min(x for x, y in raw)
        raw = {(x - x0, y) for x, y in raw}
        px, _ = squeeze_body(raw)
    w = max(x for x, y in px) + 1
    return px, w + GAP

def mark_from(art, top, right_col):
    """art drawn so that column right_col is the consonant's right edge column (0 = rightmost ink col of consonant).
    return pixels in pen coordinates (pen is after the consonant)."""
    px = parse(art, top)
    # consonant right ink col in pen coords = -GAP-1
    return {(x - right_col - GAP - 1, y) for x, y in px}

# ---------------------------------------------------------------- hand overrides for consonants/spacing (6 body rows: 5..10)
OV = {}
def ov(ch, *rows, top=5): OV[ch] = (list(rows), top)

ov('ะ', '##.#', '###.', '....', '##.#', '###.', top=5)
ov('ๆ', '##.##.', '###..#', '.....#', '.....#', '.....#', '.....#', '....#.', '...#..', top=5)
ov('ฯ', '##.##', '###.#', '....#', '....#', '....#', '....#')
ov('ๅ', '.###.', '#...#', '....#', '....#', '....#', '....#', '....#', top=5)
ov('ๆ', '##.##', '###.#', '....#', '....#', '....#', '....#', '...#.', top=5)
ov('โ', '.####.', '#....#', '#####.', '....#.', '....#.', '....#.', '....##', top=4)
ov('ใ', '.###.', '#.#.#', '.##.#', '....#', '....#', '....#', '....##', top=4)
ov('ไ', '##.#.', '..#.#', '....#', '....#', '....#', '....#', '....##', top=4)
ov('฿', '..#..', '####.', '.#.##', '.###.', '.#.##', '####.', '..#..', top=4)
ov('ฐ', '.####', '#....', '.###.', '....#', '.##.#', '.####', '#.#.#', top=5)
ov('๛', '##.##', '#.#.#', '##.##', top=6)


# consonants, spacing vowels, digits, symbols
SPACING = [c for c in range(0x0E01, 0x0E31)] + [0x0E32, 0x0E3F] + list(range(0x0E40, 0x0E47)) + [0x0E4F] + list(range(0x0E50, 0x0E5C))
for cp in SPACING:
    ch = chr(cp)
    if ch in OV:
        rows, top = OV[ch]
        px, adv = spacing(ch, rows, top)
    else:
        px, adv = spacing(ch)
    put(cp - 0x0E00, ch, px, adv)

# ---------------------------------------------------------------- combining marks (advance 0)
# upper vowels: rows 2..3 ; art aligned so last column = consonant right edge
UPPER = {
    'ั': ['#..#', '.###'],
    'ิ': ['.####', '#...#'],
    'ี': ['.##.#', '#..##'],
    'ึ': ['.####', '#..##'],
    'ื': ['.#.##', '#.###'],
    'ํ': ['##', '##'],
}
for ch, art in UPPER.items():
    put(ord(ch) - 0x0E00, ch, mark_from(art, 2, len(art[0]) - 1), 0)
# mai taikhu (็) uses vowel+tone space, rows 0..3
put(0x47, '็', mark_from(['....#', '.###.', '#.#..', '##...'], 0, 4), 0)

# lower vowels rows 12..13 (sit under right part of consonant)
LOWER = {'ุ': ['#', '##'], 'ู': ['#.#', '###'], 'ฺ': ['#']}
LOWER['ุ'] = ['#', '##']
LOWER['ู'] = ['#.#', '###']
LOWER['ฺ'] = ['#']
for ch, art in LOWER.items():
    put(ord(ch) - 0x0E00, ch, mark_from(art, 12, len(art[0]) - 1), 0)

# tone marks: HIGH (when an upper vowel is present) rows 0..1, right-only shadow
TONE_HIGH = {
    '่': ['#', '#'],
    '้': ['##.#', '.##.'],
    '๊': ['#.#.#', '##.##'],
    '๋': ['.#.', '###'],
    '์': ['..#', '##.'],
    '๎': ['.##', '##.'],
}
# LOW (no upper vowel) rows 1..3, full shadow
TONE_LOW = {
    '่': ['#', '#'],
    '้': ['##.#', '.##.'],
    '๊': ['#.#.#', '##.##'],
    '๋': ['.#.', '###', '.#.'],
    '์': ['...#', '###.', '##..'],
    '๎': ['..##', '.#..', '.##.'],
}
# default slot for the unicode tone mark = LOW form (rows 1..3); HIGH forms go to extra slots
EXTRA = 0x60   # slots 0x60.. (F9 80..)
extra_map = {}
for i, ch in enumerate(TONE_LOW):
    art = TONE_LOW[ch]
    top = 1 if len(art) == 3 else 2
    put(ord(ch) - 0x0E00, ch, mark_from(art, top, len(art[0]) - 1), 0)
for i, ch in enumerate(TONE_HIGH):
    art = TONE_HIGH[ch]
    code = EXTRA + i
    put(code, ch + '(high)', mark_from(art, 0, len(art[0]) - 1), 0, shadow='right')
    extra_map[ch + '^'] = code

# sara am (ำ): nikhahit over the previous consonant's right edge + sara aa
aa_px, aa_adv = spacing('า')
# (sara am is emitted by the encoder as nikhahit + sara aa; its own slot draws sara aa)
put(0x33, 'ำ', aa_px, aa_adv)

# shifted (left by 2) upper marks for tall consonants ป ฝ ฟ ฬ
SHIFT_SRC = list(UPPER) + ['็'] + list(TONE_LOW)
code = EXTRA + 0x10
for ch in SHIFT_SRC:
    g = glyphs[ord(ch) - 0x0E00]
    put(code, ch + '(left)', {(x - 2, y) for x, y in g['px']}, 0, g['shadow'])
    extra_map[ch + '<'] = code; code += 1
for ch in TONE_HIGH:
    g = glyphs[extra_map[ch + '^']]
    put(code, ch + '(high,left)', {(x - 2, y) for x, y in g['px']}, 0, 'right')
    extra_map[ch + '^<'] = code; code += 1

# ญ / ฐ without the lower tail (used when a lower vowel follows)
for ch in 'ญฐ':
    g = glyphs[ord(ch) - 0x0E00]
    put(code, ch + '(notail)', {(x, y) for x, y in g['px'] if y <= 10}, g['adv'])
    extra_map[ch + '_'] = code; code += 1

# ---------------------------------------------------------------- encode
def with_shadow(px, mode):
    out = {p: 1 for p in px}
    offs = [(1, 0), (0, 1), (1, 1)] if mode == 'full' else [(1, 0)]
    for x, y in px:
        for dx, dy in offs:
            q = (x + dx, y + dy)
            if q not in out: out[q] = 2
    return out

def encode(g):
    pix = with_shadow(g['px'], g['shadow'])
    xs = [x for x, y in pix]; ys = [y for x, y in pix]
    x0, y0 = min(xs), min(ys)
    if max(xs) - x0 > 7 or max(ys) - y0 > 7:
        print('TOO BIG', g['name'], max(xs) - x0 + 1, max(ys) - y0 + 1); return bytes(16), 0, 0
    if max(ys) > 15: raise SystemExit('glyph %s below cell' % g['name'])
    data = bytearray(16)
    for (x, y), v in pix.items():
        cx, cy = x - x0, y - y0
        word = cy * 2 + (cx // 4)
        data[word] |= v << ((cx % 4) * 2)
    return bytes(data), x0, y0

if __name__ == '__main__':
    tiles = bytearray(16 * NSLOTS)
    attrs = bytearray(4 * NSLOTS)
    info = {}
    for code, g in glyphs.items():
        d, x0, y0 = encode(g)
        tiles[code * 16:code * 16 + 16] = d
        attrs[code * 4 + 0] = g['adv']
        attrs[code * 4 + 1] = y0
        attrs[code * 4 + 2] = x0 & 0xFF
        info[code] = g['name']
    open('thai_tiles.bin', 'wb').write(tiles)
    open('thai_attrs.bin', 'wb').write(attrs)
    json.dump({'base': BASE, 'names': {str(k): v for k, v in info.items()}, 'extra': extra_map}, open('thai_map.json', 'w'), ensure_ascii=False, indent=1)
    print(len(glyphs), 'glyphs; extra', extra_map)
