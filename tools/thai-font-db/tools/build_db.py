"""Build /mnt/project-files/pokemon-thai/thai-font-db from the per-game adapters."""
import json, os, sys, collections, glob, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import adapters as A
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'out')

GAMES = {
    'pokemon-firered': 'Pokémon FireRed (GBA)', 'pokemon-leafgreen': 'Pokémon LeafGreen (GBA)',
    'pokemon-yellow': 'Pokémon Yellow (GB)', 'azito-3': 'Azito 3 (PS1)', 'battle-b-daman': 'Battle B-Daman (GBA)',
    'battle-b-daman-fire-spirits': 'Battle B-Daman: Fire Spirits! (GBA)',
    'dragon-ball-advanced-adventure': 'Dragon Ball: Advanced Adventure (GBA)',
    'dragon-ball-gt-transformation': 'Dragon Ball GT: Transformation (GBA)',
    'harry-potter-chamber-of-secrets': 'Harry Potter and the Chamber of Secrets (GBA)',
    'harry-potter-collection': 'Harry Potter Collection (GBA)',
    'harry-potter-goblet-of-fire': 'Harry Potter and the Goblet of Fire (GBA)',
    'harry-potter-prisoner-of-azkaban': 'Harry Potter and the Prisoner of Azkaban (GBA)',
    'harry-potter-quidditch-world-cup': 'Harry Potter: Quidditch World Cup (GBA)',
    'harry-potter-sorcerers-stone': "Harry Potter and the Sorcerer's Stone (GBA)",
    'harvest-moon-friends-of-mineral-town': 'Harvest Moon: Friends of Mineral Town (GBA)',
    'harvest-moon-more-friends-of-mineral-town': 'Harvest Moon: More Friends of Mineral Town (GBA)',
    'monster-house': 'Monster House (GBA)', 'naruto-ninja-council': 'Naruto: Ninja Council (GBA)',
    'naruto-ninja-council-2': 'Naruto: Ninja Council 2 (GBA)', 'one-piece': 'One Piece (GBA)',
    'pirates-bp': 'Pirates of the Caribbean: The Curse of the Black Pearl (GBA)',
    'pirates-dmc': "Pirates of the Caribbean: Dead Man's Chest (GBA)", 'shrek-2': 'Shrek 2 (GBA)',
    'shrek-2-beg-for-mercy': 'Shrek 2: Beg for Mercy (GBA)', 'shrek-the-third': 'Shrek the Third (GBA)',
    'spider-man': 'Spider-Man (GBA, 2002)', 'spider-man-2': 'Spider-Man 2 (GBA)', 'spider-man-3': 'Spider-Man 3 (GBA)',
    'spider-man-battle-for-new-york': 'Spider-Man: Battle for New York (GBA)',
    'spider-man-mysterios-menace': "Spider-Man: Mysterio's Menace (GBA)",
    'street-fighter-alpha-3': 'Street Fighter Alpha 3 (GBA)',
}
# kit folder for each slug (text sources for the cluster inventory)
KIT = {s: s for s in GAMES}
KIT['harry-potter-collection'] = None
TEXTS = {
    'pokemon-firered': sorted(glob.glob(os.path.join(PROJ, 'firered-th/thtools/data/translations/*.jsonl'))),
    'pokemon-leafgreen': sorted(glob.glob(os.path.join(PROJ, 'firered-th/thtools/data/translations/*.jsonl')))
                         + sorted(glob.glob(os.path.join(KITS, 'pokemon-leafgreen/translations/*.jsonl'))),
    'harry-potter-collection': [p for d in ('ss', 'cos', 'poa', 'menu') for p in glob.glob(os.path.join(KITS, 'harry-potter-collection', d, '*.json'))
                                if not p.endswith('en.json')],
    'naruto-ninja-council': [os.path.join(KITS, 'naruto-ninja-council/th.json'), os.path.join(KITS, 'naruto-ninja-council/tools/menus.json')],
}
ALIASES = {'harry-potter-collection': ['harry-potter-sorcerers-stone', 'harry-potter-chamber-of-secrets', 'harry-potter-prisoner-of-azkaban']}

CLASSES = ['base', 'upper', 'tone', 'toneHigh', 'lower']


def crop(g):
    ys = [y for y, r in enumerate(g) if any(r)]
    if not ys:
        return None
    xs = ink_cols(g)
    x0, x1 = min(xs), max(xs)
    return ys[0], x0, tuple(tuple(r[x0:x1 + 1]) for r in g[ys[0]:ys[-1] + 1])


def cls(key, kind):
    return 'base' if kind == 'clusters' else A.mark_class(key)


def compare(S, e):
    """-> None if incompatible, else (offsets {class: [dx, dy]}, overrides {key}, base_dy)"""
    if S['kind'] != e['kind']:
        return None
    shared = [k for k in e['glyphs'] if k in S['glyphs']]
    if len(shared) < 0.5 * min(len(e['glyphs']), len(S['glyphs'])):
        return None
    diffs = []
    pos = collections.defaultdict(list)
    for k in shared:
        a, b = crop(S['glyphs'][k]), crop(e['glyphs'][k])
        if a is None or b is None:
            continue
        if a[2] != b[2]:
            diffs.append(k); continue
        pos[cls(k, e['kind'])].append((b[1] - a[1], b[0] - a[0]))
    if len(diffs) > 4 or len(diffs) > 0.1 * len(shared):
        return None
    off = {}
    for c, lst in pos.items():
        dys = set(d[1] for d in lst)
        dxs = set(d[0] for d in lst)
        if len(dys) > 1 or (c != 'base' and len(dxs) > 1):
            return None
        off[c] = [0 if c == 'base' else lst[0][0], lst[0][1]]
    bdy = off.get('base', [0, 0])[1]
    rel = {}
    for c, (dx, dy) in off.items():
        if c == 'base':
            continue
        if dx or dy - bdy:
            rel[c] = [dx, dy - bdy]
    return rel, diffs, bdy


def place(grid, W, H, dx, dy):
    out = [[0] * W for _ in range(H)]
    for y, r in enumerate(grid):
        for x, v in enumerate(r):
            if v and 0 <= x + dx < W and 0 <= y + dy < H:
                out[y + dy][x + dx] = v
    return out


def main():
    entries = []
    for f in A.ADAPTERS:
        entries += f()
    print('entries', len(entries))
    sets = []
    for e in entries:
        for S in ([] if e.get('noMerge') else sets):
            r = compare(S, e)
            if r is not None:
                break
        else:
            S = dict(kind=e['kind'], design=e['design'], W=e['W'], H=e['H'], anchor=e['anchor'], tallDx=e['tallDx'],
                     glyphs=dict(e['glyphs']), metrics=dict(e['metrics']), bodyTop=e['bodyTop'], baseline=e['baseline'],
                     amAttach=e.get('amAttach', False), games=[])
            sets.append(S)
            r = ({}, [], 0)
        rel, diffs, bdy = r
        # glyphs the set lacks: add, moved into set coordinates
        for k, g in e['glyphs'].items():
            if k not in S['glyphs'] and crop(g):
                c = cls(k, e['kind'])
                dx, dy = rel.get(c, [0, 0])
                S['glyphs'][k] = place(g, S['W'], S['H'], -dx if c != 'base' else 0, -(bdy + (dy if c != 'base' else 0)))
                if k in e['metrics']:
                    S['metrics'][k] = e['metrics'][k]
        S['games'].append(dict(slug=e['slug'], game=GAMES[e['slug']], font=e['font'], anchor=e['anchor'], tallDx=e['tallDx'],
                               lineHeight=e.get('lineHeight'), bodyTop=e['bodyTop'] - bdy, effects=e.get('effects', []),
                               offsets=rel, overrides={k: grid_str(place(e['glyphs'][k], S['W'], S['H'], 0, -bdy)) for k in diffs},
                               notes=e.get('notes', ''), amAttach=e.get('amAttach', False)))
    # aliases (ported kits)
    for S in sets:
        for alias, srcs in ALIASES.items():
            for g in list(S['games']):
                if g['slug'] in srcs:
                    g2 = dict(g); g2['slug'] = alias; g2['game'] = GAMES[alias]
                    g2['notes'] = 'Ported %s kit (harry-potter-collection/%s), same glyph code. ' % (
                        GAMES[g['slug']], {'harry-potter-sorcerers-stone': 'ss', 'harry-potter-chamber-of-secrets': 'cos',
                                           'harry-potter-prisoner-of-azkaban': 'poa'}[g['slug']]) + g['notes']
                    S['games'].append(g2)
    names = name_sets(sets)
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = []
    allsets = []
    for S, name in zip(sets, names):
        js = finish(S, name)
        allsets.append(js)
        d = os.path.join(OUT, name)
        os.makedirs(d)
        json.dump(js, open(os.path.join(d, 'glyphs.json'), 'w'), ensure_ascii=False, indent=1, default=int)
        sheet(js, os.path.join(d, 'sheet.png'))
        info(js, os.path.join(d, 'info.md'))
        index.append(dict(id=name, title=js['title'], kind=js['kind'], cellW=js['cellW'], cellH=js['cellH'],
                          glyphCount=len(js['glyphs']), games=sorted(set(g['slug'] for g in js['games'])),
                          gaps=js['coverage']['gaps'], path=name + '/glyphs.json'))
        print('%-44s %-10s %3dx%-3d %4d glyphs  games=%s  gaps=%s' % (
            name, js['kind'], js['cellW'], js['cellH'], len(js['glyphs']),
            ','.join(sorted(set(g['slug'] for g in js['games']))), ''.join(js['coverage']['gaps'])))
    db = dict(name='90S Game Thai font DB', version=1, format='thai-font-db/1', sets=allsets)
    json.dump(dict(db, sets=index), open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, indent=1, default=int)
    s = json.dumps(db, ensure_ascii=False, separators=(',', ':'), default=int)
    open(os.path.join(OUT, 'db.json'), 'w').write(s)
    open(os.path.join(OUT, 'db.js'), 'w').write('window.THAI_FONT_DB=' + s + ';\n')
    print('db.js', len(s) // 1024, 'KB')
    shutil.copy(os.path.join(ROOT, 'index.html'), os.path.join(OUT, 'index.html'))
    os.makedirs(os.path.join(OUT, 'tools'))
    for f in ('common.py', 'adapters.py', 'build_db.py', 'thtools/dump.ts'):
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, 'tools', os.path.basename(f)))
    for f in ('README.md',):
        if os.path.exists(os.path.join(ROOT, f)):
            shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))


def name_sets(sets):
    names = []
    used = collections.Counter()
    for S in sets:
        d = S['design']
        if d.startswith('ttf-'):
            base = '%dpx-%s%s' % (S['H'], 'cluster-' if S['kind'] == 'clusters' else '', d[4:])
        else:
            base = '%dx%d-%s' % (S['W'], S['H'], d)
        used[base] += 1
        names.append(base if used[base] == 1 else base + '-' + S['games'][0]['slug'])
    return names


TITLES = {
    'firered-normal': 'FireRed Thai normal font (Unifont-derived, 5-row body, shadowed)',
    'firered-small': 'FireRed Thai small font (narrowed; glyphs.json)',
    'firered-small-folded': 'FireRed small font squeezed to 11 rows (HP Prisoner of Azkaban)',
    'gb-yellow': 'Pokémon Yellow GB tiles (FireRed small glyphs on 8x8 tiles)',
    'unifont': 'GNU Unifont Thai, raised 1 row, compact 2-row tones (fixed 8-px cells)',
    'unifont-bdaman': 'GNU Unifont Thai with 2-row upper vowels (Battle B-Daman)',
    'unifont-raw-hpss': 'GNU Unifont Thai, raw (HP Sorcerer\'s Stone composer)',
    'unifont-nc2': 'GNU Unifont Thai, redrawn บ/ป/ี/ึ/ื, emboldened (Naruto NC2)',
    'unifont-6row': 'Unifont Thai with 6-row body (port of thtools thai-glyphs.ts)',
    'unifont-squash6-dbaa': 'Unifont Thai squashed to a 6-row body, 14 rows (DB Advanced Adventure)',
    'unifont-7row-bfny': 'Unifont bodies compressed to 7 rows + 2-row hand-made marks (Spider-Man family)',
    'unifont-7row-dbgt': 'Unifont Thai with 7-row body (DBGT Transformation)',
    'ttf-noto-sans-thai-bold-8body': 'Noto Sans Thai Bold, 8-px body, 1bpp, proportional (Naruto NC)',
    'ttf-noto-sans-thai-bold-12': 'Noto Sans Thai Bold 12px, anti-aliased (HP Goblet of Fire font B)',
    'ttf-noto-serif-thai-bold-17': 'Noto Serif Thai Bold 17px, anti-aliased, outlined (HP Goblet of Fire font C)',
    'ttf-noto-looped-bold-12': 'Noto Looped Thai Bold 12px clusters + FireRed marks, 5 greys (One Piece)',
    'ttf-purisa-bold-15': 'Purisa Bold 15px handwriting clusters, 8 greys (Monster House)',
    'ttf-garuda-bold-10': 'Garuda Bold 10px clusters, 1bpp (HP Prisoner of Azkaban font 3)',
    'ttf-garuda-bold-12': 'Garuda Bold 12px clusters, 1bpp (HP Prisoner of Azkaban fonts 4, 6)',
    'ttf-garuda-11': 'Garuda 11px clusters, 1bpp (HP Prisoner of Azkaban font 5)',
}


def finish(S, name):
    kind = S['kind']
    levels = max([max(max(r) for r in g) for g in S['glyphs'].values() if g] + [1])
    gl = {}
    order = sorted(S['glyphs'], key=sort_key)
    for k in order:
        g = S['glyphs'][k]
        c = cls(k, kind)
        item = dict(type=c, rows=grid_str(g))
        if c == 'base':
            left, adv = S['metrics'].get(k, A.base_metrics(g))
            item['left'], item['adv'] = left, adv
        gl[k] = item
    # coverage
    chars = set()
    for k in gl:
        for ch in k:
            if ch != '^':
                chars.add(ch)
    if 'ำ' in chars:
        chars.add('ํ')          # nikhahit only occurs inside ำ
    core = CONS + SPACING_V + UPPER + TONES + LOWER
    gaps = [c for c in core if c not in chars]
    cov = dict(consonants=sum(c in chars for c in CONS), consonantsTotal=len(CONS),
               vowels=sum(c in chars for c in SPACING_V + UPPER + LOWER), vowelsTotal=len(SPACING_V + UPPER + LOWER),
               tones=sum(c in chars for c in TONES), tonesTotal=5, digits=sum(c in chars for c in DIGITS),
               saraAm='native' if 'ำ' in chars else ('split ํ+า' if 'ํ' in chars and 'า' in chars else 'missing'),
               highToneVariants=sum((t + '^') in gl for t in TONES), gaps=gaps,
               gapsOptional=[c for c in DIGITS + ['฿', '๏', '๚', '๛', '๎'] if c not in chars])
    # inventories
    inv = {}
    for g in S['games']:
        slug = g['slug']
        paths = TEXTS[slug] if slug in TEXTS else A.texts(KIT[slug])
        cnt = inventory(paths, am='attach' if g['amAttach'] else 'split')
        if kind == 'clusters':
            cnt = collections.Counter({c: n for c, n in cnt.items() if c in gl})
        inv[slug] = [c for c, n in cnt.most_common() if len(c) > 1]
    pal = palette(levels)
    title = TITLES.get(S['design'], S['design'])
    tall = ''.join(sorted(TALL))
    return dict(id=name, title=title, kind=kind, cellW=S['W'], cellH=S['H'], levels=levels,
                bpp=1 if levels == 1 else 2 if levels <= 3 else 4, palette=pal,
                bodyTop=S['bodyTop'], baseline=S['baseline'], anchor=S['anchor'], tallDx=S['tallDx'], tall=tall,
                amAttach=S['amAttach'], coverage=cov, games=S['games'], glyphs=gl, inventory=inv)


def info(js, path):
    c = js['coverage']
    L = ['# %s' % js['id'], '', js['title'], '',
         '- Kind: %s; cell %dx%d; %d glyphs; %s' % (js['kind'], js['cellW'], js['cellH'], len(js['glyphs']),
                                                   '1bpp' if js['levels'] == 1 else '%d ink levels' % js['levels']),
         '- Consonant body top row %d, baseline row %d; marks anchored: %s; tall consonants (%s) shift marks %d px' % (
             js['bodyTop'], js['baseline'], 'same cell as the base' if js['anchor'] == 'cell' else 'right edge of the previous base',
             js['tall'], js['tallDx']),
         '- Coverage: consonants %d/%d, vowels %d/%d, tones %d/5 (+%d high variants), Thai digits %d/10, SARA AM %s' % (
             c['consonants'], c['consonantsTotal'], c['vowels'], c['vowelsTotal'], c['tones'], c['highToneVariants'], c['digits'], c['saraAm']),
         '- Gaps: %s' % (' '.join(c['gaps']) or 'none'), '', '## Games and proven settings', '']
    for g in js['games']:
        off = ', '.join('%s dy %+d%s' % (k, v[1], ' dx %+d' % v[0] if v[0] else '') for k, v in g['offsets'].items())
        L.append('- **%s**, %s: line height %s, marks %s, tall shift %d%s%s%s' % (
            g['game'], g['font'], g['lineHeight'], 'same cell' if g['anchor'] == 'cell' else 'right-aligned', g['tallDx'],
            '; offsets vs this set: ' + off if off else '', '; redrawn: ' + ' '.join(g['overrides']) if g['overrides'] else '',
            '; effects: ' + ', '.join(g['effects']) if g['effects'] else ''))
        L.append('  - ' + g['notes'])
    L += ['', '## Cluster inventory', '']
    for slug, lst in js['inventory'].items():
        L.append('- %s: %d clusters with marks/sara am (full list in glyphs.json `inventory`)' % (slug, len(lst)))
    open(path, 'w').write('\n'.join(L) + '\n')


def palette(levels):
    if levels == 1:
        return ['#ffffff']
    out = []
    for i in range(1, levels + 1):
        v = int(70 + (255 - 70) * i / levels)
        out.append('#%02x%02x%02x' % (v, v, v))
    return out


def sort_key(k):
    order = CONS + SPACING_V + ['ำ'] + DIGITS + UPPER + OTHER_MARKS + TONES + LOWER
    idx = {c: i for i, c in enumerate(order)}
    return (len(k.rstrip('^')) > 1, idx.get(k[0], 999), k.endswith('^'), k)


_LF = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf', 13)
_LL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)


def sheet(js, path):
    W, H = js['cellW'], js['cellH']
    keys = list(js['glyphs'])
    S = 3 if max(W, H) <= 16 else 2
    cw, ch = max(W * S + 8, 44), H * S + 24
    cols = max(1, min(16, 1200 // cw))
    rows = (len(keys) + cols - 1) // cols
    im = Image.new('RGB', (cols * cw, rows * ch + 30), (18, 10, 36))
    d = ImageDraw.Draw(im)
    d.text((6, 8), '%s  (%d glyphs, cell %dx%d, baseline row %d)' % (js['id'], len(keys), W, H, js['baseline']), font=_LL, fill=(41, 216, 240))
    pal = [(0, 0, 0)] + [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in js['palette']]
    for i, k in enumerate(keys):
        x0, y0 = (i % cols) * cw, (i // cols) * ch + 30
        lab = k.replace('^', '')
        if js['glyphs'][k]['type'] != 'base':
            lab = '◌' + lab
        d.text((x0 + 4, y0), lab, font=_LF, fill=(178, 166, 214))
        if k.endswith('^'):
            d.text((x0 + 4 + int(d.textlength(lab, font=_LF)) + 2, y0 + 3), 'hi', font=_LL, fill=(255, 46, 136))
        gx, gy = x0 + 4, y0 + 20
        d.rectangle([gx - 1, gy - 1, gx + W * S, gy + H * S], fill=(29, 18, 56))
        bl = js['baseline']
        d.line([gx, gy + (bl + 1) * S - 1, gx + W * S - 1, gy + (bl + 1) * S - 1], fill=(90, 40, 80))
        for y, r in enumerate(js['glyphs'][k]['rows']):
            for x, c in enumerate(r):
                v = int(c, 16)
                if v:
                    d.rectangle([gx + x * S, gy + y * S, gx + x * S + S - 1, gy + y * S + S - 1], fill=pal[min(v, len(pal) - 1)])
    im.save(path)


if __name__ == '__main__':
    main()
