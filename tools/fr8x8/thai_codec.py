#!/usr/bin/env python3
"""Thai text <-> FireRed byte codes for the F9 8x8 Thai slot patch.
encode('สวัสดี') -> bytes   (each Thai glyph = F9 xx)
Handles: sara am split, high/low tone marks, left-shifted marks over tall consonants
(ป ฝ ฟ ฬ), tail-less ญ ฐ above lower vowels.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(os.path.join(HERE, 'thai_map.json'), encoding='utf-8'))
BASE = M['base']; EXTRA = M['extra']

UPPER_V = set('ัิีึื็ํ')
TONES = set('่้๊๋์๎')
LOWER_V = set('ฺุู')
TALL = set('ปฝฟฬ')
TAIL = set('ญฐ')

def slot(ch): return ord(ch) - 0x0E00

def thai_slots(text):
    """yield slot numbers (0..0xAF) or ('raw', ch) for non-Thai chars"""
    text = text.replace('ำ', 'ํา')
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if not ('ก' <= ch <= '๛'):
            out.append(('raw', ch)); i += 1; continue
        if ch in UPPER_V or ch in TONES or ch in LOWER_V:
            out.append(slot(ch)); i += 1; continue   # orphan mark
        # base glyph + following combining marks
        j = i + 1
        marks = []
        while j < n and (text[j] in UPPER_V or text[j] in TONES or text[j] in LOWER_V):
            marks.append(text[j]); j += 1
        has_upper = any(m in UPPER_V for m in marks)
        has_lower = any(m in LOWER_V for m in marks)
        if ch in TAIL and has_lower:
            out.append(EXTRA[ch + '_'])
        else:
            out.append(slot(ch))
        tall = ch in TALL
        for m in marks:
            if m in TONES:
                key = m + ('^' if has_upper else '') + ('<' if tall else '')
                out.append(EXTRA[key] if key in EXTRA else slot(m))
            elif m in UPPER_V:
                key = m + ('<' if tall else '')
                out.append(EXTRA[key] if key in EXTRA else slot(m))
            else:
                out.append(slot(m))
        i = j
    return out

# minimal FireRed charmap for the non-Thai part (enough for previews / simple strings)
FR = {' ': 0x00, '!': 0xAB, '?': 0xAC, '.': 0xAD, '-': 0xAE, ',': 0xB8, '/': 0xBA, "'": 0xB4, ':': 0xF0,
      '\n': 0xFE}
for k, c in enumerate('0123456789'): FR[c] = 0xA1 + k
for k, c in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ'): FR[c] = 0xBB + k
for k, c in enumerate('abcdefghijklmnopqrstuvwxyz'): FR[c] = 0xD5 + k

def encode(text, eos=True):
    b = bytearray()
    for s in thai_slots(text):
        if isinstance(s, tuple):
            b.append(FR.get(s[1], 0xAC))
        else:
            b += bytes([0xF9, BASE + s])
    if eos: b.append(0xFF)
    return bytes(b)

if __name__ == '__main__':
    import sys
    t = sys.argv[1] if len(sys.argv) > 1 else 'สวัสดีครับ'
    print(encode(t).hex(' ').upper())
