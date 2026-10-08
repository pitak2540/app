"""Per-game adapters: run each kit's own glyph code and return the Thai glyphs it ships, as ink grids.

Every adapter returns a list of entries (one per distinct Thai font design used in that game):
  dict(slug, font, design, kind, W, H, anchor, tallDx, glyphs={key: grid}, metrics={key: [left, adv]},
       bodyTop, baseline, lineHeight, effects=[...], notes='...', clusters=[...] (cluster kind) )
Keys: a Thai char; tone variants used above an upper vowel get a '^' suffix (e.g. '่^').
Grids are lists of rows of ints (0 = empty, 1.. = ink level)."""
import json, os, glob, collections
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from common import *

FR = json.load(open(os.path.join(ROOT, 'fr_glyphs.json')))
TONE_BY_HIGH = {0xF701 + i: t for i, t in enumerate(TONES)}


def kpath(kit, *p):
    return os.path.join(KITS, kit, *p)


def texts(kit, extra=()):
    pats = ['th.json', 'th_*.json', 'tr/*.txt', 'tr/*.json', 'tr/th/*.json', 'tr/*/*.json', 'tr/*.py', 'tx/*.txt',
            'credits_th.json', 'tools/th_src.py', 'th_src.py', 'menus.json', 'units.json', 'popups.json']
    out = []
    for p in pats:
        out += glob.glob(kpath(kit, p))
    return sorted(set(out)) + list(extra)


def mark_class(key):
    ch = key[0]
    if key.endswith('^'):
        return 'toneHigh'
    if ch in UPPER or ch in OTHER_MARKS:
        return 'upper'
    if ch in TONES:
        return 'tone'
    if ch in LOWER:
        return 'lower'
    return 'base'


def base_metrics(grid, extra=2):
    cols = ink_cols(grid)
    if not cols:
        return [0, 4]
    return [min(cols), max(cols) - min(cols) + extra]


def entry(slug, font, design, W, H, glyphs, anchor='end', tallDx=-2, metrics=None, **kw):
    metrics = dict(metrics or {})
    for k, g in glyphs.items():
        if mark_class(k) == 'base' and k not in metrics:
            metrics[k] = base_metrics(g)
    e = dict(slug=slug, font=font, design=design, kind='components', W=W, H=H, anchor=anchor, tallDx=tallDx,
             glyphs=glyphs, metrics=metrics, effects=[], notes='')
    e.update(kw)
    return e


# ------------------------------------------------------------------ FireRed / small font family
def fr_dict(layout):
    return {g['cp']: g['rows'] for g in FR[layout]}


def small_glyphs(by, H=13, tone_high_dy=0, upper_dy=0, lower_dy=0, base_dy=0, fold=None, W=8):
    """by: cp -> 13 row masks (FireRed small layout incl. PUA variants) -> {key: grid}"""
    out = {}
    for cp, rows in by.items():
        if 0xF701 <= cp <= 0xF705:
            key = TONE_BY_HIGH[cp] + '^'
        elif cp >= 0xF700:
            continue          # tall-shifted copies: same rows, handled by tallDx
        else:
            key = chr(cp)
        pad = 1 if (upper_dy or lower_dy or base_dy) else 0
        g = masks_to_grid([0] * pad + list(rows) + [0] * (H + pad - len(rows)), W, H + 2 * pad)
        c = mark_class(key)
        dy = {'toneHigh': tone_high_dy, 'upper': upper_dy, 'tone': upper_dy, 'lower': lower_dy}.get(c, base_dy)
        g = shift_grid(g, 0, dy)
        if fold is not None:   # fold rows >= fold into row `fold`
            for y in range(fold + 1, len(g)):
                for x in range(W):
                    if g[y][x]:
                        g[fold][x] = g[y][x]; g[y][x] = 0
        out[key] = g
    return out


def check_tall_variants(by):
    """FireRed PUA tall variants must equal their plain marks (we use tallDx instead)"""
    up = [0x0E31, 0x0E34, 0x0E35, 0x0E36, 0x0E37, 0x0E4D, 0x0E47]
    for i, cp in enumerate(up):
        assert by[0xF710 + i] == by[cp]
    for i in range(5):
        assert by[0xF717 + i] == by[0x0E48 + i]
        assert by[0xF71C + i] == by[0xF701 + i]


def thaienc_by(kit, mod='thaienc'):
    te = kitmod(kit, mod)
    return {g['cp']: list(g['rows']) for g in te.GLYPHS}


def a_firered():
    out = []
    n = fr_dict('normal'); s = fr_dict('small')
    check_tall_variants(s)
    out.append(entry('pokemon-firered', 'normal / male / female (dialogue)', 'firered-normal', 8, 14,
                     small_glyphs(n, 14), bodyTop=6, baseline=10, lineHeight=16,
                     effects=['shadow-rb (bases)', 'shadow-r (marks)'],
                     notes='pokefirered decomp + thtools build-font.ts (Unifont-derived, 5-row body). Glyph cells 16x16 2bpp in '
                           'latin_normal/male/female.png; marks are zero-width and drawn right-aligned to the previous base '
                           '(mark column 7 = base stem). Tall consonants use left-shifted marks (shiftLeft 2). '
                           'High tone (above an upper vowel) = compact 2-row form in rows 0-1.'))
    out.append(entry('pokemon-firered', 'small (menus, names, summary)', 'firered-small', 8, 13,
                     small_glyphs(s, 13), bodyTop=6, baseline=10, lineHeight=13, effects=['shadow-rb'],
                     notes='latin_small.png; same Unifont derivation with one column removed (narrowed). '
                           'This exact table is the glyphs.json copied into most later kits.'))
    for e in list(out):
        e2 = dict(e); e2['slug'] = 'pokemon-leafgreen'; e2['notes'] = 'Same font engine as FireRed (shared thtools / engine patches).'
        out.append(e2)
    return out


def a_small_kit(slug, font, kit, mod='thaienc', **kw):
    by = thaienc_by(kit, mod)
    pad = 1 if any(kw.get(k) for k in ('upper_dy', 'lower_dy', 'base_dy')) else 0
    kw.setdefault('bodyTop', 6 + pad)
    kw.setdefault('baseline', 10 + pad)
    return entry(slug, font, 'firered-small-fixed', 8, 13, small_glyphs(by, 13, **{k: v for k, v in kw.items() if k in (
        'tone_high_dy', 'upper_dy', 'lower_dy', 'base_dy', 'fold')}),
        **{k: v for k, v in kw.items() if k not in ('tone_high_dy', 'upper_dy', 'lower_dy', 'base_dy', 'fold')})


def a_pirates_bp():
    return [a_small_kit('pirates-bp', 'dialogue (BG + bitmap)', 'pirates-bp', lineHeight=16,
                        notes='thaienc.py glyph table at 0x08800000 (13 rows, width, isMark); thai.c draws marks at x - width '
                              '(right-aligned to the base), text row offset -4.')]


def a_pirates_dmc():
    return [a_small_kit('pirates-dmc', '9 game fonts (bold/shadow per font)', 'pirates-dmc', tone_high_dy=1, lineHeight=12,
                        effects=['bold-r (fonts 5-8)', 'shadow-r (fonts 2,3,5-8)'],
                        notes='Each base+marks cluster is precomposed into one double-byte glyph (thfont.py); body top row 5-7 by font; '
                              'high tone moved down 1 row to close the gap to the vowel.')]


def a_shrek_bfm():
    return [a_small_kit('shrek-2-beg-for-mercy', 'story + menu', 'shrek-2-beg-for-mercy', lineHeight=16,
                        effects=['outline (menu)'],
                        notes='Base byte + optional mark-combo byte; build.py composes base and marks into 16x16 sprite cells '
                              '(marks right-aligned to the base).')]


def a_shrek3():
    return [a_small_kit('shrek-the-third', '16x16 OBJ fonts', 'shrek-the-third', mod='thaienc_bp', lineHeight=16, effects=['outline-4 (edge colour 3)'],
                        notes='Single-byte codes 0x8A-0xFF; marks are zero-width and emitted before their base, drawn in the same '
                              '16x16 cell (cell row = glyph row + top, col + 1).')]


def a_qwc():
    return [a_small_kit('harry-potter-quidditch-world-cup', 'sprite font', 'harry-potter-quidditch-world-cup',
                        upper_dy=-1, tone_high_dy=-1, lower_dy=1, lineHeight=16, effects=['outline-8 + vertical colour gradient'],
                        notes='16x16 4bpp OBJ glyph sprites + frame records; upper marks lifted 1 row, lower vowels dropped 1 row.')]


def a_monster_house():
    out = [a_small_kit('monster-house', 'fonts 0-3, 6 (pixel)', 'monster-house', tone_high_dy=1, lineHeight=16,
                       effects=['outline-8 (fonts 0,1)', 'bold-r (fonts 2,3)'],
                       notes='Each cluster (base+marks+ำ) becomes one glyph index >= 0x120 in all 7 fonts (mhfont.py); '
                             'body top row 6-8 by font.')]
    mh = kitmod('monster-house', 'mhfont')
    inv = inventory(texts('monster-house'), am='attach')
    PURISA = '/usr/share/fonts/truetype/tlwg/Purisa-Bold.ttf'
    st = mh.Style('ttf', 0, aa=[1, 2, 3, 4, 5, 6, 7, 8], size=15, ttf=PURISA, base=18, offs=2)
    gl, met = {}, {}
    for cl in sorted(inv):
        if not cl or cl[0] in MARKS:
            continue
        adv, px = st.glyph(cl)
        # palette 1 (darkest) .. 8 (lightest) -> levels 8..1 (higher = darker)
        g = pix_to_grid({p: 9 - v for p, v in px.items()}, 24, 24)
        gl[cl] = g; met[cl] = [0, adv]
    out.append(dict(slug='monster-house', font='fonts 4/5 (handwriting)', design='ttf-purisa-bold-15', kind='clusters',
                    W=24, H=24, anchor='end', tallDx=0, glyphs=gl, metrics=met, bodyTop=12, baseline=18, lineHeight=24,
                    amAttach=True, levels=8, effects=[],
                    notes='Purisa Bold 15px rendered with raqm, anti-aliased into palette 1..9 (8 levels here, 8 = darkest). '
                          'Clusters keep a following SARA AM (attach).'))
    return out


def a_dbgt():
    tf = kitmod('dragon-ball-gt-transformation', 'thaifont')
    out = []
    # small family: shape all base/mark singles via the kit's own cluster renderer (body top 6 -> glyph rows)
    by = {g['cp']: list(g['rows']) for g in tf.te.GLYPHS}
    out.append(entry('dragon-ball-gt-transformation', 'F0 / F2 (small)', 'firered-small-fixed', 8, 13,
                     small_glyphs(by, 13, tone_high_dy=1), bodyTop=6, baseline=10, lineHeight=12,
                     notes='Every cluster is one UTF-16 code >= 0x100 in the Webfoot font tables (thaifont.py small_cluster); '
                           'high tone closed up 1 row.'))
    # unifont family: render singles with uni_cluster at top=6
    gl = {}
    for cp in list(range(0x0E01, 0x0E2F)) + [ord(c) for c in SPACING_V] + [ord(c) for c in DIGITS]:
        if cp in tf.U:
            gl[chr(cp)] = pix_to_grid(tf.uni_cluster(chr(cp), 6), 8, 16)
    for m in UPPER + TONES + LOWER:
        gl[m] = pix_to_grid(tf.uni_cluster('ก' + m, 6) - tf.uni_cluster('ก', 6), 8, 16)
    for t in TONES:
        gl[t + '^'] = pix_to_grid(tf.uni_cluster('กิ' + t, 6) - tf.uni_cluster('กิ', 6), 8, 16)
    out.append(entry('dragon-ball-gt-transformation', 'F1 dialogue / F3, F4 bold menus', 'unifont-7row-dbgt', 8, 16, gl,
                     anchor='cell', bodyTop=6, baseline=12, lineHeight=16, effects=['bold-r (F3, F4)'],
                     notes='GNU Unifont Thai with the 8-row body squeezed to 7 rows (remove_one), compact 2-row high tones; '
                           'clusters precomposed, one code per cluster. Body top row 5 (F1), 6 (F3), 8 (F4).'))
    return out


def a_spiderman2():
    out = [a_small_kit('spider-man-2', 'small (dialogue)', 'spider-man-2', tone_high_dy=1, lineHeight=12,
                       effects=['outline-4 + row gradient'],
                       notes='thai.c ORs 1bpp rows per cluster on the GBA, outlines and colours them (smfont.py model).')]
    out += bfny_entries('spider-man-2', 'spider-man-2', 'bfnyfont', 'big (menus/titles)')
    return out


def a_spiderman_mm():
    return bfny_entries('spider-man-mysterios-menace', 'spider-man-mysterios-menace', 'bigfont',
                        'font A small (per shaped code point) + menu clusters',
                        notes_extra=' Small font: one OBJ per shaped code point, drop shadow (+1,+1).')


def a_naruto_nc():
    out = []
    by = thaienc_by('naruto-ninja-council/tools')
    out.append(entry('naruto-ninja-council', 'menus / names (smallfont.py)', 'firered-small-fixed', 8, 13,
                     small_glyphs(by, 13), bodyTop=6, baseline=10, lineHeight=8,
                     notes='Tiny renderer for menu/name graphics: FireRed rows 4..11 cropped into an 8-px strip.'))
    tf = kitmod('naruto-ninja-council/tools', 'thfont')
    gl, met = {}, {}
    for key, code in tf.THAI.items():
        g = tf.GLYPHS[code]
        if key.endswith('L'):
            continue
        k = key[0] + ('^' if key.endswith('H') else '')
        if g.adv:      # base
            grid = pix_to_grid({(x, y): 1 for y, xs in g.rows.items() for x in xs}, 16, 16)
            gl[k] = grid; met[k] = [0, g.adv]
        else:          # mark: x = pen_after_base + xoff + col ; store in 16-wide cell right-aligned at col 16
            grid = pix_to_grid({(x + 16 + g.xoff, y): 1 for y, xs in g.rows.items() for x in xs}, 16, 16)
            gl[k] = grid
    out.append(entry('naruto-ninja-council', 'dialogue (proportional)', 'ttf-noto-sans-thai-bold-8body', 16, 16, gl,
                     metrics=met, anchor='end', bodyTop=5, baseline=12, lineHeight=16,
                     notes='Noto Sans Thai Bold scaled so the consonant body is 8 px (rendered 8x, box-filtered, threshold), '
                           'hand-drawn 2-row upper vowels and high tones; marks are zero-width with xoff -(w+1) '
                           '(-(w+3) after a tall consonant).'))
    return out


def a_poa(slug='harry-potter-prisoner-of-azkaban', kit='harry-potter-prisoner-of-azkaban'):
    tf = kitmod(kit, 'thfont')
    te = tf.te
    out = []
    by = {g['cp']: list(g['rows']) for g in te.GLYPHS}
    out.append(entry(slug, 'fonts 0-2, 7-11 (small, 12 px pitch)', 'firered-small-folded', 8, 13,
                     small_glyphs(by, 13, tone_high_dy=1, fold=11), bodyTop=6, baseline=10, lineHeight=12,
                     effects=['shadow-r (font 2)', 'shadow-rb (fonts 9, 11)'],
                     notes='Each cluster is one double-byte glyph (lead >= 0xF0). Small glyphs squeezed to 11 rows: high tone '
                           'keeps rows 0-1, everything else moves up 1, lower vowels and tails folded into one row.'))
    # TTF families: render the clusters the game uses
    inv = collections.Counter()
    for t in read_texts(texts(kit)):
        for line in t.split('\n'):
            try:
                items = tf.clusters(line)
            except Exception:
                items = []
            for item in items:
                if isinstance(item, tuple) and item[0] not in tf.MARKS:
                    inv[canon(''.join(chr(tf.unvariant(c)) for c in item))] += 1
    for fid, name in ((3, 'garuda-bold-10'), (4, 'garuda-bold-12'), (5, 'garuda-11')):
        conf = tf.CONF[fid]
        H = conf['T'] + conf['base'] + 1 + conf['B'] + 2
        gl, met = {}, {}
        for cl in sorted(inv):
            # back to shaped code points for the kit renderer
            cps = tuple(te.shape(cl))
            w, res = tf.render_ttf(cps, conf)
            grid = [[0] * 20 for _ in range(H)]
            if res:
                pix, minx = res
                for (x, y) in pix:
                    if 0 <= y < H and x - minx < 20:
                        grid[y][x - minx] = 1
            gl[cl] = grid; met[cl] = [0, w]
        out.append(dict(slug=slug, font='font %s (%s)' % ({3: 3, 4: '4, 6', 5: 5}[fid], conf['ttf'].split('/')[-1]),
                        design='ttf-' + name, kind='clusters', W=20, H=H, anchor='end', tallDx=0, glyphs=gl, metrics=met,
                        bodyTop=conf['T'] + conf['base'] - 6, baseline=conf['T'] + conf['base'], lineHeight=conf['pitch'],
                        effects=['shadow-rb (font 6)'] if fid == 4 else [], levels=1,
                        notes='TLWG %s %dpx rendered with raqm, threshold 90 -> 1bpp; one double-byte glyph per cluster '
                              '(ำ split into ํ + า).' % (conf['ttf'].split('/')[-1], conf['size'])))
    return out


def a_one_piece():
    tf = kitmod('one-piece', 'thfont')
    inv = collections.Counter()
    for t in read_texts(texts('one-piece')):
        for c in tf.split(t):
            if tf.is_thai(c[0]) and c[0] not in MARKS:
                inv[c] += 1
    gl, met = {}, {}
    lv = {13: 1, 12: 2, 11: 3, 10: 4, 15: 5}
    for cl in sorted(inv):
        try:
            w, a = tf.render(cl)
        except Exception as ex:
            print('one-piece skip', repr(cl), ex); continue
        g = [[lv.get(int(v), 0) for v in row] for row in a.tolist()]
        g = [r + [0] * (20 - len(r)) for r in g] if len(g[0]) < 20 else [r[:20] for r in g]
        gl[canon(cl)] = g; met[canon(cl)] = [0, w]
    return [dict(slug='one-piece', font='dialogue', design='ttf-noto-looped-bold-12', kind='clusters', W=20, H=16,
                 anchor='end', tallDx=0, glyphs=gl, metrics=met, bodyTop=7, baseline=13, lineHeight=16, amAttach=True,
                 levels=5, effects=[],
                 notes='Base letters from Noto Looped Thai Bold 12px anti-aliased into the 5 grey shades of BG palette 0 '
                       '(level 5 = black); vowel/tone marks are the FireRed small marks, stacked to fit 16 rows. '
                       'One glyph per cluster (base+marks+ำ).')]


def a_gof():
    fg = kitmod('harry-potter-goblet-of-fire', 'fontgen')
    GL = fg.GL
    out = []

    def conv(fam, design, font, levelmap, W=24, H=28, base_row=20, effects=(), notes=''):
        gl, met = {}, {}
        for g, d in zip(GL, fam):
            cp = g['cp']
            if 0xF701 <= cp <= 0xF705:
                key = TONE_BY_HIGH[cp] + '^'
            elif cp >= 0xF700:
                continue
            else:
                key = chr(cp)
            px = {p: levelmap(v) for p, v in d['px'].items()}
            if g['isMark']:
                grid = pix_to_grid(px, W, H, dx=W, dy=base_row)
            else:
                grid = pix_to_grid(px, W, H, dx=0, dy=base_row)
                met[key] = [0, d['adv']]
            gl[key] = grid
        return entry('harry-potter-goblet-of-fire', font, design, W, H, gl, metrics=met, anchor='end', tallDx=-3,
                     bodyTop=base_row - 7, baseline=base_row, lineHeight=H, effects=list(effects), notes=notes,
                     levels=max(max(max(r) for r in g) for g in gl.values()))
    # A/D = unifont pixel glyphs (uniglyphs), handled by unifont-6row adapter below
    ramp_rank = {i: len(fg.RAMP_COL) - k for k, (t, i) in enumerate(fg.RAMP_COL)}
    out.append(conv(fg.family('B'), 'ttf-noto-sans-thai-bold-12', 'font B (Noto Sans Thai Bold 12)',
                    lambda v: ramp_rank.get(v, 1), W=16, H=20, base_row=15,
                    notes='Per-character glyphs from Noto Sans Thai Bold 12px; coverage -> 10-step palette ramp (level 10 = '
                          'full ink); marks positioned relative to the pen after the base (rendered as ก+mark minus ก); '
                          'high tones rendered over กิ. Tall shift 3 px.'))
    wr = {i: len(fg.RAMP_WHITE) - k for k, (t, i) in enumerate(fg.RAMP_WHITE)}
    fam = fg.family('C')
    out.append(conv(fam, 'ttf-noto-serif-thai-bold-17', 'font C (Noto Serif Thai Bold 17, outlined)',
                    lambda v: 0 if v == 1 else wr.get(v, 1), W=24, H=30, base_row=22, effects=['outline (dilated, palette 1)'],
                    notes='Noto Serif Thai Bold 17px, white ramp over a 1-px dilated dark outline; tall shift 4 px.'))
    out[-1]['tallDx'] = -4
    return out


# ------------------------------------------------------------------ Unifont families
def uni_raw():
    U = {}
    for l in open(kpath('azito-3', 'unifont_thai.hex')):
        c, b = l.strip().split(':')
        if len(b) == 32:
            U[int(c, 16)] = [int(b[i:i + 2], 16) for i in range(0, 32, 2)]
    return U


def P(rows):
    return [sum(0x80 >> x for x, p in enumerate(r) if p == '#') for r in rows]


TONE2 = {'่': ['.....#..', '.....#..'], '้': ['...##.#.', '....##..'], '๊': ['..#.#.#.', '..##.##.'],
         '๋': ['.....#..', '....###.'], '์': ['....###.', '....##..']}


def a_unifont15(slug, font, notes, H=16, kit=None):
    """HM FoMT / MFoMT (thai.py glyph) and Azito 3 (thaifont compose): Unifont shifted up 1 row, compact tones."""
    U = uni_raw()
    gl = {}
    for cp, rows in U.items():
        ch = chr(cp)
        if not (0x0E01 <= cp <= 0x0E5B) or ch == AM:
            continue
        if ch in TONES:
            gl[ch] = masks_to_grid([0, 0] + P(TONE2[ch]) + [0] * (H - 4), 8, H)
            gl[ch + '^'] = masks_to_grid(P(TONE2[ch]) + [0] * (H - 2), 8, H)
        else:
            gl[ch] = masks_to_grid(rows[1:] + [0], 8, 16)[:H]
    return entry(slug, font, 'unifont', 8, H, gl, anchor='cell', tallDx=0,
                 metrics={k: [0, 8] for k in gl if mark_class(k) == 'base'},
                 bodyTop=5, baseline=12, lineHeight=16, notes=notes)


def a_hm(slug, kit):
    th = kitmod(kit, 'thai')
    e = a_unifont15(slug, 'dialogue/menus (8x16 1bpp sprites)',
                    'Each cluster precomposed into one 8x16 1bpp glyph (thai.py glyph()): Unifont shifted up 1 row, '
                    'tones replaced by compact 2-row forms (rows 0-1 above an upper vowel, else rows 2-3). Fixed 8 px advance.')
    # verify against the kit's own composer
    for cl in ['ก', 'กิ', 'ก่', 'กิ่', 'กุ']:
        assert th.glyph(cl) == [sum(0x80 >> x for x in range(8) if r[x]) for r in compose_cell(e, cl)], cl
    return [e]


def compose_cell(e, cl):
    """compose a cluster for 'cell'-anchored fixed-width sets (for verification)"""
    H, W = e['H'], e['W']
    g = [[0] * W for _ in range(H)]
    has_up = any(c in UPPER for c in cl)
    for c in cl:
        k = c + '^' if (c in TONES and has_up and c + '^' in e['glyphs']) else c
        for y in range(H):
            for x in range(W):
                if e['glyphs'][k][y][x]:
                    g[y][x] = 1
    return g


def a_azito():
    tf = kitmod('azito-3', 'thaifont')
    e = a_unifont15('azito-3', 'PS1 16x16 cells, two 8x15 half-width clusters per cell',
                    'hook.s composes each cluster at run time from BASE/UPPER/TONE/LOWER tables (thaifont.py): '
                    'Unifont shifted up 1 row (15 rows), upper rows 0-3, compact tones rows 0-1 (with upper vowel) or 2-3, '
                    'lower rows 13-14. Each 16x16 kanji cell code draws two clusters side by side.', H=15)
    for cl in ['กิ่', 'ป้', 'ดุ', 'ที่']:
        bi = {ch: i for i, ch in enumerate('กปดท')}
        rows = tf.compose(tf.descriptor(cl, bi), [tf.base_rows(c) for c in 'กปดท'])
        assert rows == [sum(0x80 >> x for x in range(8) if r[x]) for r in compose_cell(e, cl)], cl
    e['lineHeight'] = 16
    return [e]


def a_bdaman():
    tf = kitmod('battle-b-daman', 'thaifont')
    gl, met = {}, {}
    for key, rows, w in tf.GLYPHS:
        if isinstance(key, str):
            continue
        if isinstance(key, int):
            k = chr(key)
        elif key[-1] == 'L':
            continue
        elif len(key) == 2 and key[1] in 'HN':
            k = chr(key[0]) + ('^' if key[1] == 'H' else '')
        else:
            continue
        gl[k] = masks_to_grid(rows, 8, 16)
        if w:
            met[k] = [0, w]
    return [entry('battle-b-daman', '16x16 2bpp dialogue font', 'unifont-bdaman', 8, 16, gl, metrics=met, anchor='cell',
                  bodyTop=5, baseline=12, lineHeight=16,
                  notes='thaifont.py: Unifont bases moved up 1 row (body rows 5-12), upper vowels squeezed to 2 rows (rows 2-3), '
                        'compact tones rows 0-1 (high) / 2-3, lower vowels rows 13-14. 2-byte codes 0x80,0x10+k; marks zero-width, '
                        'emitted BEFORE the base and drawn at the same x; tall consonants use marks shifted 2 px left.')]


def a_hpss(slug='harry-potter-sorcerers-stone', kit='harry-potter-sorcerers-stone'):
    tf = kitmod(kit, 'thfont')
    by, H, oy = tf.load_uni()
    gl, met = {}, {}
    thenc = tf.thenc
    for ch in thenc.CHARS:
        rows = by[ord(ch)]
        if ch in thenc.MARKS:
            v = tf.mark_variants(by, 'uni', ch)
            gl[ch] = masks_to_grid(v[0], 16, 16, msb=0x8000)
            if ch in TONES:
                gl[ch + '^'] = masks_to_grid(v[1], 16, 16, msb=0x8000)
        else:
            g = masks_to_grid(rows, 16, 16, msb=0x8000)
            gl[ch] = g
            cols = ink_cols(g)
            met[ch] = [min(cols), max(cols) - min(cols) + 2]
    gl = {k: [r[:8] for r in g] for k, g in gl.items()}
    return [entry(slug, 'fonts 0-4 (all text)', 'unifont-raw-hpss', 8, 16, gl, metrics=met, anchor='cell', tallDx=0,
                  bodyTop=6, baseline=13, lineHeight=16,
                  notes='thfont.py + thai.c: raw GNU Unifont 8x16, nikhahit moved into the upper-vowel rows, tones: Unifont '
                        'position when above an upper vowel, else 2 rows lower. Marks are zero-width bytes after the base; '
                        'thai.c ORs them onto a copy of the base bitmap (cell origin = pen - left). No tall shift. '
                        'Latin rows moved down per font (LAYOUT). ฃ ฅ ฦ not encoded.')]


def a_nc2():
    tf = kitmod('naruto-ninja-council-2', 'thfont')
    gl, met = {}, {}
    for cp in range(0xE01, 0xE5C):
        if cp not in tf.U or cp == 0xE33:
            continue
        rows = tf.src_rows(cp)
        ch = chr(cp)
        g = masks_to_grid(rows, 16, 16, msb=0x8000)
        if ch in TONES:
            gl[ch + '^'] = g
            gl[ch] = masks_to_grid([0, 0] + [r << 8 for r in tf.U[cp]][:14], 16, 16, msb=0x8000)
        else:
            gl[ch] = g
            if ch not in MARKS:
                cols = ink_cols(g)
                met[ch] = [min(cols), max(cols) - min(cols) + 2] if cols else [0, 4]
    gl = {k: [r[:8] for r in g] for k, g in gl.items()}
    return [entry('naruto-ninja-council-2', 'dialogue (proportional)', 'unifont-nc2', 8, 16, gl, metrics=met, anchor='cell',
                  bodyTop=6, baseline=13, lineHeight=16, effects=['bold-r (bases, never closing a 1-px gap; not ะ)'],
                  notes='thfont.py: GNU Unifont with redrawn บ/ป bodies (flat bottom), redrawn ี ึ ื, compact high tones in rows 0-1, '
                        'low tones = Unifont tone 2 rows lower; bases emboldened by 1 px. Glyph table 256 x 36 bytes '
                        '(u16 rows[16], advance, mark flag, xoff); marks drawn at the last base cell origin.')]


def uniglyph_entry(slug, kit, font, notes, effects=(), ovr=None, mod='uniglyphs', lineHeight=16, desc_dy=False, anchor='cell'):
    U = kitmod(kit, mod)
    if ovr:
        U.OVR.update(ovr(U))
    gl, met = {}, {}
    for cp in list(range(0xE01, 0xE2F)) + [0xE2F, 0xE30, 0xE32, 0xE40, 0xE41, 0xE42, 0xE43, 0xE44, 0xE45, 0xE46]:
        if cp not in U.U:
            continue
        g = masks_to_grid(U.base_rows(cp), 8, 16)
        gl[chr(cp)] = g
        cols = ink_cols(g)
        met[chr(cp)] = [min(cols), max(cols) - min(cols) + 2]
    for c in UPPER:
        gl[c] = masks_to_grid(U.upper_rows(ord(c)), 8, 16)
    for c in TONES:
        gl[c] = masks_to_grid(U.low_tone_rows(ord(c)), 8, 16)
        gl[c + '^'] = masks_to_grid(U.high_tone_rows(ord(c)), 8, 16)
    for c in LOWER:
        gl[c] = masks_to_grid(U.lower_rows(ord(c)), 8, 16)
    return entry(slug, font, 'unifont-6row', 8, 16, gl, metrics=met, anchor=anchor, bodyTop=U.BODY_TOP,
                 baseline=U.BODY_TOP + U.BODY_ROWS - 1, lineHeight=lineHeight, effects=list(effects), notes=notes)


def a_uni6():
    out = []
    out.append(uniglyph_entry('shrek-2', 'shrek-2', '16x16 sprite font', effects=['outline-4 (colour 3)'],
                              notes='thfont.py: Unifont port of thtools thai-glyphs.ts (6-row body rows 6-11, marks aligned to the '
                                    'base stem). Single-byte codes: spacing glyphs + precomposed mark-combo glyphs (upper+tone), marks '
                                    'zero-width, emitted BEFORE the base and drawn in the same 16x16 cell.'))
    out.append(uniglyph_entry('harry-potter-chamber-of-secrets', 'harry-potter-chamber-of-secrets', '16-high fonts',
                              effects=['outline (fontgen fill/outline colours)', 'bold-r (some fonts)'],
                              ovr=lambda U: {0xE30: U.P(['.#.#....', '..##....', '........', '.#.#....', '..##....', '........'])},
                              notes='Same scheme as Shrek 2 (thenc.py is the Shrek 2 encoder) with ะ redrawn; 16x16 sheet glyphs.'))
    out.append(uniglyph_entry('harry-potter-goblet-of-fire', 'harry-potter-goblet-of-fire', 'fonts A / D (pixel)',
                              effects=['outline-8 (font D)'], anchor='end',
                              notes='fontgen.py pixel_glyph: uniglyphs rows, bases cropped (+1 or +2 px), marks right-aligned to the '
                                    'pen with FireRed-style variant code points (tall shift 2).'))
    out.append(uniglyph_entry('battle-b-daman-fire-spirits', 'battle-b-daman-fire-spirits', '16x16 2bpp dialogue, 8 px per cluster',
                              effects=['shadow-r (colour 2)'],
                              notes='thfont.py: every cluster (base+upper+tone+lower) is one double-byte code drawn as one 8-px '
                                    'fixed-width cell; lower vowels under ฎ ฏ ญ ฐ are moved down 1 row.'))
    out.append(uniglyph_entry('street-fighter-alpha-3', 'street-fighter-alpha-3', 'OBJ font 8x16 4bpp', mod='thfont',
                              effects=['row colour shading + shadow-r (colour 5)'],
                              notes='thfont.py: same derivation with body rows 5-10 (Latin baseline row 10), upper marks end row 3, '
                                    'lower marks from row 11; ะ redrawn. Single-byte codes 0x80+ with mark variants (H high, S tall).'))
    return out


def a_dbaa():
    th = kitmod('dragon-ball-advanced-adventure', 'thai')
    G = th.GLYPH
    gl, met = {}, {}
    for cp, rows in G.items():
        ch = chr(cp)
        if not (0x0E01 <= cp <= 0x0E5B) or ch == AM:
            continue
        g = masks_to_grid(rows, 8, 14)
        if ch in TONES:
            gl[ch] = shift_grid(g, 0, 2)
            gl[ch + '^'] = g
        else:
            gl[ch] = g
    return [entry('dragon-ball-advanced-adventure', 'OBJ sprite text (16x16 per cluster)', 'unifont-squash6-dbaa', 8, 14, gl,
                  anchor='cell', bodyTop=6, baseline=11, lineHeight=16, effects=['outline-8 (white, colour 15)'],
                  notes='uni.py: Unifont with the 8-row body squashed to 6 rows (14 rows: 0-2 tone, 3-4 upper vowel, 6-11 body, '
                        '12-13 lower). Tones drop 2 rows when there is no upper vowel; marks shift 2 px left on tall consonants. '
                        'Each cluster precomposed into one 16x16 4bpp sprite.')]


def bfny_entries(slug, kit, mod, font, notes_extra=''):
    sf = kitmod(kit, mod)
    gl = {}
    for ch in sf.CONS + sf.SPACING:
        try:
            gl[ch] = pix_to_grid(sf.compose(ch), 8, 16)
        except Exception:
            pass
    base = sf.compose('ก')
    for m in sorted(sf.UPPER | sf.LOWER | sf.TONES):
        gl[m] = pix_to_grid(sf.compose('ก' + m) - base, 8, 16)
    for t in sf.TONES:
        gl[t + '^'] = pix_to_grid(sf.compose('กิ' + t) - sf.compose('กิ'), 8, 16)
    lower_row = 13 if 'y0 = 13' in open(kpath(kit, mod + '.py')).read() else 14
    return [entry(slug, font, 'unifont-7row-bfny', 8, 16, gl, anchor='cell', bodyTop=6, baseline=12, lineHeight=16,
                  effects=['outline-8 (colour 9) + row colours'],
                  notes='%s.py: Unifont bodies compressed to 7 rows (rows 6-12), hand-made 2-row mark designs (upper row 3, '
                        'tones row 3 or row 0 above an upper vowel, lower row %d), tall shift 2 px; each cluster precomposed '
                        'into a 16x16 cell.%s' % (mod, lower_row, notes_extra))]


def a_bfny():
    return bfny_entries('spider-man-battle-for-new-york', 'spider-man-battle-for-new-york', 'smfont', 'dialogue / menus (16x16 clusters)')


def a_sm3():
    return bfny_entries('spider-man-3', 'spider-man-3', 'smfont', 'dialogue / menus (16x16 clusters)',
                        notes_extra=' บ redrawn with a flat bottom so it does not read as ข.')


def a_sm2002():
    return bfny_entries('spider-man', 'spider-man', 'thglyph', 'stroke masks (rows 0-14)',
                        notes_extra=' thai.c draws the masks; lower marks at row 13.')


def a_yellow():
    G = {e['cp']: list(e['rows']) for e in json.load(open(kpath('pokemon-yellow', 'kit', 'glyphs.json')))}
    G[ord('ใ')] = [int(x.replace('.', '0').replace('#', '1'), 2) for x in
                   ['........', '........', '........', '..###...', '.#..#...', '.##.#...', '....#...',
                    '....#...', '....#...', '....##..', '....##..', '........', '........']]
    gl = small_glyphs(G, 13)
    # GB layout: rows 0-4 = mark tile (drawn in the empty tile row above), rows 5-12 = 8x8 base tile.
    gl = {k: [[0] * 8] * 3 + g for k, g in gl.items()}       # 16 rows = 2 GB tiles (3 blank + 13)
    for k in [k for k in gl if mark_class(k) == 'base']:
        pass
    keep = set(c for c in CONS if c not in 'ฃฅฦ') | set('ะาเแโใไๆฯ') | set('ัิีึื็ํ่้๊๋์ุู') | {t + '^' for t in TONES}
    gl = {k: v for k, v in gl.items() if k in keep}
    met = {k: [0, 8] for k in gl if mark_class(k) == 'base'}
    return [entry('pokemon-yellow', 'GB 8x8 tiles (base tile + mark tile above)', 'gb-yellow', 8, 16, gl, metrics=met,
                  anchor='cell', tallDx=0, bodyTop=9, baseline=13, lineHeight=16, noMerge=True,
                  notes='Game Boy: every Thai cell = an 8x8 base tile (glyph rows 5-12, here rows 8-15) plus marks OR-ed into '
                        'the tile above (glyph rows 0-4, here rows 3-7), allocated from a 54-tile pool at $A0-$E4. FireRed small '
                        'glyphs with ใ redrawn. Fixed 8 px cells, no tall shift. Marks that collide with text above use a '
                        'compact squeezed tile. Precomposed pairs: คุ ชิ ซึ กิ นิ.')]


ADAPTERS = [a_firered, a_yellow, a_pirates_bp, a_pirates_dmc, a_shrek_bfm, a_shrek3, a_qwc, a_monster_house, a_dbgt,
            a_spiderman2, a_spiderman_mm, a_naruto_nc, a_poa, a_one_piece, a_gof,
            lambda: a_hm('harvest-moon-friends-of-mineral-town', 'harvest-moon-friends-of-mineral-town'),
            lambda: a_hm('harvest-moon-more-friends-of-mineral-town', 'harvest-moon-more-friends-of-mineral-town'),
            a_azito, a_bdaman, a_hpss, a_nc2, a_uni6, a_dbaa, a_bfny, a_sm3, a_sm2002]
