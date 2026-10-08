# Thai font DB (90S Game)

Every Thai pixel font shipped in the ~32 translated games, extracted into one reusable database.
Open `index.html` (works from `file://`, no server): browse the sets, preview any Thai sentence in every set
(with each game's exact profile), and export a set as indexed PNG tiles (1/2/4bpp) + raw `.bin` tiles + `.tbl` + metrics.

## Files

| Path | What |
|---|---|
| `db.js` | `window.THAI_FONT_DB = {...}`: the whole DB for pages loaded from `file://` (`<script src="db.js">`) |
| `db.json` | Same object as plain JSON |
| `index.json` | Light index: set id, kind, cell size, glyph count, games, gaps, path of each set's `glyphs.json` |
| `<set>/glyphs.json` | One set (same object as in `db.json`) |
| `<set>/sheet.png` | Every glyph, labelled (`◌` = mark, `hi` = high tone variant, pink line = baseline) |
| `<set>/info.md` | Games that used the set and their proven settings |
| `index.html` | Thai browser tool (browse / preview / export) |
| `tools/` | The scripts that built this DB (reference; see "Rebuilding") |
| `ตัวอย่าง.png` | Preview screenshot (test sentence in 3 sets) |

## How the glyphs were extracted

Nothing was redrawn by hand here. For each game, the kit's own font code was run on a scratch copy of `tools/<slug>/`:

- FireRed / LeafGreen: `firered-th/thtools/src/font/thai-glyphs.ts` was run with Node (`--experimental-strip-types`) for the
  `normal` and `small` layouts (Unifont 16.0.04 hex, Thai block identical to the kits' `unifont_thai.hex`).
  The `small` result is byte-identical to the `glyphs.json` copied into the later kits.
- Kits using `glyphs.json` + `thaienc.py`: imported `thaienc` (which applies its ใ ไ โ redraws) and read the glyph table.
- Unifont kits: imported `uniglyphs.py`, `thaifont.py`, `thai.py`, `uni.py`, `thfont.py`, `smfont.py` etc. and called their
  `base_rows` / `upper_rows` / `compose` / `glyph` functions. Azito 3 and Harvest Moon were cross-checked against the kits'
  own composers (`thaifont.compose`, `thai.glyph`).
- TTF-based fonts (One Piece, Monster House handwriting, HP Prisoner of Azkaban Garuda fonts, HP Goblet of Fire B/C,
  Naruto NC dialogue) were rendered with the kits' own renderers (same TTF, size, threshold/ramp, Pillow + raqm).
  Cluster fonts were rendered for every cluster that occurs in that game's translation (`th.json`, `tr/`).
- No ROM was needed (Naruto NC's `thfont.build()` reads the English font from `base.gba`; a blank stand-in was used,
  only the Thai part is kept).

Colour effects (outline, drop shadow, bold, gradients) are not baked in: glyphs are ink only, and each game's effect is
listed in its profile (`effects`). Anti-aliased TTF sets keep their ink levels.

### Deduplication

Each game font was compared with the sets found so far, glyph by glyph, on the cropped ink shape:
- identical shapes -> same set; a constant vertical/horizontal shift of one mark class (upper, tone, high tone, lower)
  is stored as that game's `offsets`;
- up to 4 glyphs that differ (e.g. the kits' redrawn ใ ไ โ, SFA3/CoS ะ, Spider-Man 3 บ) are stored as the game's `overrides`;
- anything else -> a new set.

## Sets

| Set | Kind | Cell | Glyphs | Games | Missing (core) |
|---|---|---|---|---|---|
| `8x14-firered-normal` | components | 8x14 | 75 | pokemon-firered, pokemon-leafgreen | ฺ |
| `8x13-firered-small` | components | 8x13 | 75 | pokemon-firered, pokemon-leafgreen, pirates-bp, pirates-dmc, shrek-2-beg-for-mercy, shrek-the-third, harry-potter-quidditch-world-cup, monster-house, dragon-ball-gt-transformation, spider-man-2, naruto-ninja-council | ฺ |
| `8x13-firered-small-folded` | components | 8x13 | 75 | harry-potter-prisoner-of-azkaban, harry-potter-collection | ฺ |
| `8x16-gb-yellow` | components | 8x16 | 71 | pokemon-yellow | ฃ ฅ ฦ ๅ ฺ |
| `8x16-unifont` | components | 8x16 | 90 | azito-3, harvest-moon-friends-of-mineral-town, harvest-moon-more-friends-of-mineral-town | - |
| `8x16-unifont-raw-hpss` | components | 8x16 | 71 | harry-potter-sorcerers-stone, harry-potter-collection | ฃ ฅ ฦ ๅ ฺ |
| `8x16-unifont-nc2` | components | 8x16 | 90 | naruto-ninja-council-2 | - |
| `8x16-unifont-bdaman` | components | 8x16 | 76 | battle-b-daman | - |
| `8x16-unifont-6row` | components | 8x16 | 76 | shrek-2, harry-potter-chamber-of-secrets, harry-potter-goblet-of-fire, battle-b-daman-fire-spirits, street-fighter-alpha-3, harry-potter-collection | - |
| `8x14-unifont-squash6-dbaa` | components | 8x14 | 79 | dragon-ball-advanced-adventure | - |
| `8x16-unifont-7row-dbgt` | components | 8x16 | 76 | dragon-ball-gt-transformation | - |
| `8x16-unifont-7row-bfny` | components | 8x16 | 76 | spider-man, spider-man-2, spider-man-3, spider-man-battle-for-new-york, spider-man-mysterios-menace | - |
| `16px-noto-sans-thai-bold-8body` | components | 16x16 | 76 | naruto-ninja-council | - |
| `20px-noto-sans-thai-bold-12` | components | 16x20 | 75 | harry-potter-goblet-of-fire | ฺ |
| `30px-noto-serif-thai-bold-17` | components | 24x30 | 75 | harry-potter-goblet-of-fire | ฺ |
| `16px-cluster-noto-looped-bold-12` | clusters | 20x16 | 227 | one-piece | only shipped clusters |
| `24px-cluster-purisa-bold-15` | clusters | 24x24 | 352 | monster-house | only shipped clusters |
| `16px-cluster-garuda-bold-10` | clusters | 20x16 | 452 | harry-potter-prisoner-of-azkaban, harry-potter-collection | only shipped clusters |
| `17px-cluster-garuda-11` | clusters | 20x17 | 452 | harry-potter-prisoner-of-azkaban, harry-potter-collection | only shipped clusters |
| `20px-cluster-garuda-bold-12` | clusters | 20x20 | 452 | harry-potter-prisoner-of-azkaban, harry-potter-collection | only shipped clusters |

Provenance per set (details and every game's notes are in `<set>/info.md`):
- **firered-normal / firered-small**: pokefirered + thtools `build-font.ts` (Unifont-derived, 5-row body; small = one column removed). Most later GBA kits copied the small table as `glyphs.json`; `thaienc.py` in those kits redraws ใ ไ โ (game override).
- **firered-small-folded**: HP Prisoner of Azkaban small fonts: the same glyphs squeezed to 11 rows (lower vowels and tails folded into one row).
- **gb-yellow**: Pokémon Yellow (pret/pokeyellow): FireRed small glyphs (ใ redrawn) split into an 8x8 base tile (rows 8-15 here) and a mark tile above.
- **unifont**: GNU Unifont Thai raised 1 row, tones replaced by compact 2-row forms (Azito 3 composes these at run time on PS1; Harvest Moon precomposes 8x16 sprites). Includes Thai digits.
- **unifont-raw-hpss / -nc2 / -bdaman**: Unifont with each game's own mark handling (HPSS: tones 2 rows lower without upper vowel; NC2: redrawn บ ป ี ึ ื, emboldened; B-Daman: upper vowels squeezed to 2 rows).
- **unifont-6row**: Python port of thtools `thai-glyphs.ts` (6-row body) used by Shrek 2, CoS, GoF pixel fonts, B-Daman FS, SFA3.
- **unifont-squash6-dbaa / -7row-dbgt / -7row-bfny**: Unifont bodies squeezed to 6 or 7 rows by each kit's own algorithm; bfny has hand-made 2-row marks.
- **TTF sets**: Noto Sans Thai Bold (Naruto NC, GoF B), Noto Serif Thai Bold (GoF C), Noto Looped Thai Bold + FireRed marks (One Piece), Purisa Bold (Monster House handwriting), Garuda / Garuda Bold (HP PoA).

## JSON format (`format: "thai-font-db/1"`)

```
DB  = { name, version: 1, format: "thai-font-db/1", sets: [Set] }
Set = {
  id: "8x13-firered-small", title, kind: "components" | "clusters",
  cellW, cellH,               // every glyph's rows are cellH strings of cellW chars
  levels, bpp, palette,       // ink levels (1 = 1bpp); palette[i] = preview colour of level i+1
  bodyTop, baseline,          // cell rows of the consonant body top / bottom (baseline)
  anchor: "end" | "cell",     // how zero-width marks are placed (see below)
  tallDx: -2, tall: "ปฝฟฬ",   // x shift of upper vowels / tones after a tall consonant
  amAttach: false,            // clusters only: true = ำ stays in the cluster key, false = ำ is split into ํ + า
  coverage: { consonants, consonantsTotal, vowels, vowelsTotal, tones, highToneVariants, digits, saraAm, gaps, gapsOptional },
  glyphs: { key: Glyph },
  games: [Game],              // proven settings per game (profiles)
  inventory: { gameSlug: ["ที่", "น้ำ", ...] }   // clusters (with marks) used in that game's text, most frequent first
}
Glyph = { type: "base"|"upper"|"tone"|"toneHigh"|"lower", rows: ["0011100", ...], left, adv }
        // rows: one hex digit per pixel (0 = empty, 1..levels = ink); left/adv only for type "base"
Game  = { slug, game, font, anchor, tallDx, lineHeight, bodyTop, effects: ["shadow-rb", ...],
          offsets: { upper|tone|toneHigh|lower: [dx, dy] },   // add to that mark class for this game
          overrides: { key: rows },                            // glyphs this game redrew
          notes, amAttach }
```

Keys: a single Thai character, or for clusters a canonical cluster string = base + marks sorted (lower `ฺ ุ ู`,
then upper `ั ิ ี ึ ื ็ ํ ๎`, then tones `่ ้ ๊ ๋ ์`) [+ `ำ` when `amAttach`]. A tone with suffix `^` (e.g. `"่^"`) is the high
form used above an upper vowel or before ำ.

### Rendering (components)

```
pen = 0
for each char c:
  if c is a base:     g = glyphs[c]; draw g.rows at x = pen - g.left; last.cellX = pen - g.left; pen += g.adv; last.end = pen
  if c is ำ:          draw mark "ํ", then base "า"
  if c is a mark:     key = c + "^" if c is a tone and (an upper vowel came before it on this base, or next char is ำ) and glyphs[c+"^"] exists
                      x = anchor == "cell" ? last.cellX : last.end - cellW
                      if last base in `tall` and the mark is not a lower vowel: x += tallDx
                      draw at x (+ game offsets), no advance
```
All glyphs are drawn at the same line top (y = 0); vertical placement is already in the rows.

### Encoding (clusters)

Split text into clusters with the canonical rule above and look each key up greedily; a cluster that is not in
`glyphs` cannot be shown by that set (use a components set, or render it with the same TTF).
For components sets every key in `glyphs` gets its own code; marks are zero-width.

## Rebuilding

`tools/build_db.py` (with `common.py`, `adapters.py`, `dump.ts`) rebuilt everything. It expects a scratch copy of
`pokemon-thai/tools` as `kits/`, `firered-th/thtools` as `thtools/` (+ `vendor/unifont-16.0.04.hex`), and `fr_glyphs.json`
from `node --experimental-strip-types thtools/dump.ts`. Needs Python 3, Pillow with raqm, numpy, and the Noto/TLWG fonts.
