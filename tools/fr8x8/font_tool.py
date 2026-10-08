#!/usr/bin/env python3
"""Edit the 8x8 Thai slots inside a patched ROM.

  python font_tool.py export rom.gba  font8x8.png  font8x8.csv
  python font_tool.py import rom.gba  font8x8.png  font8x8.csv  [out.gba]

font8x8.png : 16 columns x 11 rows of 8x8 cells (cell n = code F9 (20+n)).
              Colors: white = transparent, dark gray = ink, light gray = shadow.
              Any other non-white color is treated as ink.
font8x8.csv : code,adv,yoff,xshift,name
              adv    = pixels the cursor moves (0 = combining mark drawn over the previous letter)
              yoff   = row inside the 16-px text line where the cell's top row is drawn (0..8)
              xshift = horizontal draw offset from the cursor (negative = to the left)
"""
import sys, struct, json, os
from PIL import Image

TILES = 0xC82000
ATTRS = TILES + 16 * 0xB0
N = 0xB0
COLS = 16
ROWS = (N + COLS - 1) // COLS
WHITE, INK, SHADOW = (255, 255, 255), (64, 64, 64), (184, 184, 184)

def names():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'thai_map.json')
    if os.path.exists(p):
        return {int(k): v for k, v in json.load(open(p, encoding='utf-8'))['names'].items()}
    return {}

def export(rom, png, csv):
    d = open(rom, 'rb').read()
    im = Image.new('RGB', (COLS * 8, ROWS * 8), WHITE)
    nm = names()
    lines = ['code,adv,yoff,xshift,name']
    for n in range(N):
        t = d[TILES + n * 16:TILES + n * 16 + 16]
        for r in range(8):
            h = t[r * 2] | t[r * 2 + 1] << 8
            for p in range(8):
                v = (h >> (2 * p)) & 3
                if v: im.putpixel(((n % COLS) * 8 + p, (n // COLS) * 8 + r), INK if v == 1 else SHADOW)
        adv, yoff, xs = d[ATTRS + n * 4], d[ATTRS + n * 4 + 1], d[ATTRS + n * 4 + 2]
        xs = xs - 256 if xs > 127 else xs
        lines.append('F9%02X,%d,%d,%d,%s' % (0x20 + n, adv, yoff, xs, nm.get(n, '')))
    im.save(png)
    open(csv, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('exported', png, csv)

def import_(rom, png, csv, out):
    d = bytearray(open(rom, 'rb').read())
    assert d[0x5B80:0x5B88] == bytes.fromhex('00480047') + struct.pack('<I', 0x08C80001), 'ROM is not patched with the 8x8 slot hack'
    im = Image.open(png).convert('RGB')
    for n in range(N):
        data = bytearray(16)
        for r in range(8):
            h = 0
            for p in range(8):
                c = im.getpixel(((n % COLS) * 8 + p, (n // COLS) * 8 + r))
                if c == WHITE or (min(c) > 240): v = 0
                elif sum(c) > 3 * 140: v = 2
                else: v = 1
                h |= v << (2 * p)
            struct.pack_into('<H', data, r * 2, h)
        d[TILES + n * 16:TILES + n * 16 + 16] = data
    for line in open(csv, encoding='utf-8').read().splitlines()[1:]:
        if not line.strip(): continue
        f = line.split(',')
        n = int(f[0][2:], 16) - 0x20
        d[ATTRS + n * 4:ATTRS + n * 4 + 3] = bytes([int(f[1]) & 0xFF, int(f[2]) & 0xFF, int(f[3]) & 0xFF])
    open(out, 'wb').write(d)
    print('written', out)

if __name__ == '__main__':
    if len(sys.argv) < 5:
        print(__doc__); sys.exit(1)
    if sys.argv[1] == 'export': export(*sys.argv[2:5])
    else: import_(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else sys.argv[2])
