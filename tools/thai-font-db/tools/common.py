"""Shared helpers for building the Thai font DB."""
import json, os, sys, importlib, glob, re, collections

ROOT = os.path.dirname(os.path.abspath(__file__))
KITS = os.path.join(ROOT, 'kits')          # scratch copy of /mnt/project-files/pokemon-thai/tools
PROJ = '/mnt/project-files/pokemon-thai'

CONS = [chr(c) for c in range(0x0E01, 0x0E2F)]
SPACING_V = list('ฯะาเแโใไๅๆ')
DIGITS = [chr(c) for c in range(0x0E50, 0x0E5A)]
UPPER = list('ัิีึื็ํ')
TONES = list('่้๊๋์')
LOWER = list('ฺุู')
OTHER_MARKS = ['๎']
MARKS = set(UPPER + TONES + LOWER + OTHER_MARKS)
TALL = set('ปฝฟฬ')
AM = 'ำ'
MARK_ORDER = {c: i for i, c in enumerate(LOWER + UPPER + OTHER_MARKS + TONES)}
ALL_EXPECTED = CONS + SPACING_V + ['ำ'] + UPPER + TONES + LOWER + DIGITS + ['฿', '๏', '๚', '๛']


def is_thai(ch):
    return '฀' <= ch <= '๿'


def canon(cl):
    """canonical cluster key: base + marks sorted (lower, upper, tone) [+ ำ]"""
    if not cl:
        return cl
    am = cl.endswith(AM)
    if am:
        cl = cl[:-1]
    if cl and cl[0] not in MARKS:
        b, m = cl[0], cl[1:]
    else:
        b, m = '', cl
    m = ''.join(sorted(m, key=lambda c: MARK_ORDER.get(c, 99)))
    return b + m + (AM if am else '')


def split_clusters(text, am='split'):
    """Thai text -> list of canonical cluster strings (non-Thai chars dropped).
    am='split': ำ -> ํ on the cluster + separate า ; am='attach': ำ stays on the cluster."""
    out = []
    cur = None
    for ch in text:
        if not is_thai(ch):
            if cur: out.append(cur)
            cur = None
            continue
        if ch in MARKS:
            cur = (cur or '') + ch
            continue
        if ch == AM:
            if am == 'attach':
                cur = (cur or '') + AM
                out.append(cur); cur = None
            else:
                cur = (cur or '') + 'ํ'
                out.append(cur); cur = 'า'
            continue
        if cur: out.append(cur)
        cur = ch
    if cur: out.append(cur)
    return [canon(c) for c in out]


def walk_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(k)
            yield from walk_strings(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from walk_strings(v)


def read_texts(paths):
    """all strings from json / jsonl / txt / py files"""
    for p in paths:
        try:
            raw = open(p, encoding='utf-8').read()
        except Exception:
            continue
        if p.endswith('.json'):
            try:
                yield from walk_strings(json.loads(raw)); continue
            except Exception:
                pass
        if p.endswith('.jsonl'):
            for line in raw.splitlines():
                try:
                    yield from walk_strings(json.loads(line))
                except Exception:
                    yield line
            continue
        yield raw


def inventory(paths, am='split'):
    cnt = collections.Counter()
    for t in read_texts(paths):
        for c in split_clusters(t, am):
            cnt[c] += 1
    return cnt


_KITMODS = ['thaienc', 'thaienc_bp', 'uniglyphs', 'thaifont', 'thfont', 'thai', 'uni', 'smfont', 'thglyph', 'bfnyfont', 'bigfont',
            'fontgen', 'thenc', 'mhfont', 'shthai', 'hpfont', 'fontlib', 'thaigen', 'smallfont']


def kitmod(kit, name):
    """import module `name` from kit dir (scratch copy), isolating same-named sibling modules."""
    d = os.path.join(KITS, kit)
    for m in _KITMODS:
        sys.modules.pop(m, None)
    sys.path.insert(0, d)
    cwd = os.getcwd()
    os.chdir(d)
    try:
        mod = importlib.import_module(name)
    finally:
        os.chdir(cwd)
        sys.path.remove(d)
    for m in _KITMODS:
        if m != name:
            sys.modules.pop(m, None)
    sys.modules.pop(name, None)
    return mod


def masks_to_grid(masks, w=8, H=None, msb=0x80):
    """list of int row masks (bit msb = col 0) -> grid [[0/1]*w]*H"""
    H = H or len(masks)
    g = [[0] * w for _ in range(H)]
    for y, m in enumerate(masks[:H]):
        for x in range(w):
            if m & (msb >> x):
                g[y][x] = 1
    return g


def pix_to_grid(pix, w, H, dx=0, dy=0, val=1):
    """set of (x,y) or dict (x,y)->v -> grid"""
    g = [[0] * w for _ in range(H)]
    items = pix.items() if isinstance(pix, dict) else ((p, val) for p in pix)
    for (x, y), v in items:
        X, Y = x + dx, y + dy
        if 0 <= X < w and 0 <= Y < H and v:
            g[Y][X] = v
    return g


def shift_grid(g, dx=0, dy=0):
    H, W = len(g), len(g[0])
    out = [[0] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if g[y][x]:
                X, Y = x + dx, y + dy
                if 0 <= X < W and 0 <= Y < H:
                    out[Y][X] = g[y][x]
    return out


def ink_cols(g):
    return [x for x in range(len(g[0])) if any(r[x] for r in g)]


def grid_str(g):
    return [''.join('%x' % v for v in r) for r in g]


def gkey(g):
    return '|'.join(grid_str(g))
