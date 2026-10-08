#!/usr/bin/env python3
"""Patch a FireRed (BPRE) ROM: add 176 extra 8x8 glyph slots reachable as  F9 20 .. F9 CF.

usage: patch.py in.gba out.gba [tiles.bin attrs.bin]

- RenderText hook (0x08005B80): codes F9 20..CF are drawn from an 8x8 2bpp table with a
  transparent background, per-glyph advance / y-offset / x-shift (x-shift lets Thai marks
  sit on top of the previous consonant, advance 0 = combining).
- Glyph-width functions (table at 0x081EA6C4) wrapped so GetStringWidth etc. know the new widths.
"""
import sys, struct, keystone

SRC, DST = sys.argv[1], sys.argv[2]
TILES = open(sys.argv[3] if len(sys.argv) > 3 else 'thai_tiles.bin', 'rb').read()
ATTRS = open(sys.argv[4] if len(sys.argv) > 4 else 'thai_attrs.bin', 'rb').read()

FREE = 0x08C80000            # free space (all 0xFF in Ultra Violet 1.22)
HOOK_AT = 0x08005B80
WIDTH_TABLE = 0x081EA6C4
GLYPH_INFO = 0x03003DA0
COPY_GLYPH = 0x08003028
RESUME = 0x08005B88
EPILOGUE = 0x08005D7E
FIRST = 0x120                # 0x100 | 0x20
COUNT = 0xB0

rom = bytearray(open(SRC, 'rb').read())
assert rom[0xAC:0xB0] == b'BPRE', 'not a FireRed (BPRE) ROM'
def u32(a): return struct.unpack_from('<I', rom, a & 0x1FFFFFF)[0]

# sanity: the code we hook must be the vanilla instructions
expect = bytes.fromhex('20680007000f0528')
cur = bytes(rom[(HOOK_AT & 0x1FFFFFF):(HOOK_AT & 0x1FFFFFF) + 8])
already = cur[:4] == bytes.fromhex('00480047')
if not already:
    assert cur == expect, 'RenderText differs from vanilla: %s' % cur.hex()

orig_width = [u32(WIDTH_TABLE + 8 * i + 4) for i in range(6)]
if already:
    # re-patch: recover original width funcs saved after our code
    orig_width = [u32(FREE + 0x1000 + 4 * i) for i in range(6)]

TILES_AT = FREE + 0x2000
ATTRS_AT = TILES_AT + 16 * COUNT

asm = f'''
hook:
    ldr  r0, L_first
    subs r0, r3, r0
    cmp  r0, #{COUNT}
    bcc  thai
    ldr  r0, [r4]
    lsls r0, r0, #0x1c
    lsrs r0, r0, #0x1c
    ldr  r1, L_resume
    cmp  r0, #5
    bx   r1
thai:
    adds r1, r6, #0
    bl   draw
    adds r4, r0, #0
    ldrb r5, [r6, #8]
    movs r1, #2
    ldrsb r1, [r4, r1]
    adds r1, r5, r1
    strb r1, [r6, #8]
    adds r0, r6, #0
    ldr  r2, L_copy
    bl   call_r2
    ldrb r1, [r4]
    adds r5, r5, r1
    strb r5, [r6, #8]
    movs r0, #0
    ldr  r1, L_epi
    bx   r1
call_r2:
    bx   r2

draw:
    push {{r4-r7, lr}}
    mov  r4, r8
    mov  r5, r9
    mov  r6, r10
    push {{r4-r6}}
    ldrb r4, [r1, #0xC]
    lsrs r4, r4, #4
    ldrb r5, [r1, #0xD]
    lsrs r5, r5, #4
    ldr  r2, L_attrs
    lsls r3, r0, #2
    adds r2, r2, r3
    mov  r8, r2
    ldr  r6, L_tiles
    lsls r3, r0, #4
    adds r6, r6, r3
    ldr  r2, L_glyph
    mov  r9, r2
    movs r3, #0
    movs r1, #32
clr:
    stmia r2!, {{r3}}
    subs r1, #1
    bne  clr
    movs r3, #8
    strb r3, [r2]
    movs r3, #16
    strb r3, [r2, #1]
    mov  r2, r8
    ldrb r0, [r2, #1]
    adds r1, r0, #0
    adds r1, #8
    cmp  r1, #16
    ble  rows_ok
    movs r1, #16
rows_ok:
    mov  r10, r1
rowloop:
    mov  r1, r10
    cmp  r0, r1
    bge  done
    ldrh r2, [r6]
    adds r6, #2
    movs r3, #0
    movs r7, #0
pix:
    movs r1, #3
    ands r1, r2
    beq  next
    cmp  r1, #1
    bne  notfg
    adds r1, r4, #0
    b    putpx
notfg:
    cmp  r1, #2
    bne  next
    adds r1, r5, #0
putpx:
    lsls r1, r7
    orrs r3, r1
next:
    lsrs r2, r2, #2
    adds r7, #4
    cmp  r7, #32
    bne  pix
    lsrs r1, r0, #3
    lsls r1, r1, #6
    movs r7, #7
    ands r7, r0
    lsls r7, r7, #2
    adds r1, r1, r7
    add  r1, r9
    str  r3, [r1]
    adds r0, #1
    b    rowloop
done:
    mov  r0, r8
    pop  {{r4-r6}}
    mov  r8, r4
    mov  r9, r5
    mov  r10, r6
    pop  {{r4-r7}}
    pop  {{r1}}
    bx   r1
'''
for i in range(6):
    asm += f'''
width{i}:
    lsls r2, r0, #16
    lsrs r2, r2, #16
    ldr  r3, L_first
    subs r2, r2, r3
    cmp  r2, #{COUNT}
    bcs  width{i}_orig
    ldr  r3, L_attrs
    lsls r2, r2, #2
    ldrb r0, [r3, r2]
    bx   lr
width{i}_orig:
    ldr  r3, L_orig{i}
    bx   r3
'''
asm += f'''
    .align 2
L_first:  .word {FIRST:#x}
L_resume: .word {RESUME | 1:#x}
L_copy:   .word {COPY_GLYPH | 1:#x}
L_epi:    .word {EPILOGUE | 1:#x}
L_attrs:  .word {ATTRS_AT:#x}
L_tiles:  .word {TILES_AT:#x}
L_glyph:  .word {GLYPH_INFO:#x}
''' + ''.join(f'L_orig{i}: .word {orig_width[i]:#x}\n' for i in range(6))

ks = keystone.Ks(keystone.KS_ARCH_ARM, keystone.KS_MODE_THUMB)
enc, _ = ks.asm(asm, FREE)
code = bytes(enc)
assert len(code) < 0x1000

# symbol addresses: assemble prefixes to find label offsets
WRAP = []
_k = 0
while True:
    _k = code.find(bytes.fromhex('0204120c'), _k)
    if _k < 0: break
    WRAP.append(FREE + _k); _k += 4
assert len(WRAP) == 6, WRAP

base = FREE & 0x1FFFFFF
region = rom[base:base + 0x2000 + len(TILES) + len(ATTRS)]
if not already:
    assert all(b == 0xFF for b in region), 'free space at %#x is not empty' % FREE
rom[base:base + len(code)] = code
for i, a in enumerate(orig_width):                # keep originals for re-patching
    struct.pack_into('<I', rom, base + 0x1000 + 4 * i, a)
t = TILES_AT & 0x1FFFFFF
rom[t:t + len(TILES)] = TILES
a = ATTRS_AT & 0x1FFFFFF
rom[a:a + len(ATTRS)] = ATTRS

# hook: ldr r0,[pc,#0]; bx r0; .word hook|1
h = HOOK_AT & 0x1FFFFFF
rom[h:h + 8] = bytes.fromhex('00480047') + struct.pack('<I', FREE | 1)
# width table
for i in range(6):
    struct.pack_into('<I', rom, (WIDTH_TABLE & 0x1FFFFFF) + 8 * i + 4, WRAP[i] | 1)

open(DST, 'wb').write(rom)
print('code %d bytes at %#x, tiles %#x, attrs %#x' % (len(code), FREE, TILES_AT, ATTRS_AT))
print('width wrappers:', [hex(w) for w in WRAP])
