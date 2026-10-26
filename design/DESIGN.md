# Groundwork design system

The rules every page follows. If a page and this file disagree, this file wins, and a
change of mind is recorded here first.

## Direction

**The knowledge graph.** The visual identity comes from the real shape of the context vault:
notes as nodes, links as edges, anonymised. It is the page background; the camera flies
through it as you scroll.

## Decisions

| Area | Decision | Date |
|---|---|---|
| Heading font | **Synonym** (Fontshare, variable 200–700, no italics) | 2026-10-26 |
| Body font | **Amulya** (Fontshare, variable 300–700, with italics) | 2026-10-26 |
| Colour | **Derived from requirements**, not picked (see *Colour* below). Ink-and-paper neutrals; blue = metric notes, amber = decision notes. Earlier picks (Coolors greens, BCG greens) were dropped | 2026-10-26 |
| Theme | **Light and dark.** Follows the visitor's OS; the header toggle pins a choice (saved in `localStorage` as `gw-theme`) | 2026-10-26 |
| Type and spacing scale | Fluid (Utopia method): body 17px→20px, ratio 1.2→1.25, phone 360px → desktop 1280px. Tokens `--step-*`, `--space-*` | 2026-10-26 |
| Graph treatment | The real vault graph, anonymised, as a fixed background. The camera flies between areas as you scroll; each section declares its camera move with `data-stop` (see `js/graph.js`) | 2026-10-26 |

### Colour
The palette is computed by `tools/palette.py` (run it to reproduce). It searches hue pairs in OKLCH
against these requirements, in both themes:

1. Body text ≥ 7:1 (WCAG AAA) and APCA Lc ≥ 75. Muted text and links ≥ 4.5:1 and APCA Lc ≥ 60.
2. The two graph note types stay distinct under normal vision and simulated protanopia, deuteranopia
   and tritanopia (Machado 2009). Measured as OKLab ΔE; about 2 is a just-noticeable difference.
3. Every graph mark ≥ 3:1 against its background (WCAG 1.4.11).
4. Light and dark share hues; only lightness moves.
5. Chromatic colour is reserved for data. Text, buttons, lines and backgrounds are neutral ink and paper.

Result: metric **blue, OKLCH hue 265**; decision **amber, hue 60**. All warm hues from 45° to 75° tied
on separation; amber was taken over red-orange because red reads as an error, and a decision isn't one.

| Check | Light | Dark |
|---|---|---|
| Body text on background | 15.5:1 · Lc 99 | 15.4:1 · Lc 93 |
| Muted text | 6.3:1 · Lc 79 | 9.6:1 · Lc 65 |
| Link text | 7.1:1 · Lc 81 | 8.9:1 · Lc 61 |
| Button label | 15.5:1 | 15.4:1 |
| Metric / decision dots vs background | 3.1:1 / 3.1:1 | 5.4:1 / 6.2:1 |
| Metric vs decision, worst of normal + 3 CVD types | ΔE 28 | ΔE 29 |

Rules:
- Text uses `--fg`, `--muted` or `--link` only. `--metric` and `--decision` are for graph marks and legends, never text.
- Buttons are ink: `--fg` fill with `--bg` label. Secondary buttons are an ink outline.
- Backgrounds are never pure white or pure black (glare, and halation for astigmatic readers).
- To change a colour, change the requirements or the search in `tools/palette.py`, re-run it, and copy the result into `tokens.css`.

### Spacing rules
- Sizes and gaps come only from `--step-*` and `--space-*`. No raw px/rem values in components.
- Section padding uses the one-up pairs (`--space-l-2xl`, `--space-xl-3xl`) so it opens up on desktop.

### Type rules
- Headings, big numbers and navigation use Synonym. Running text, captions and quotes use Amulya.
- Synonym has no italics. Never italicise a heading; use weight instead.
- Before launch, self-host both fonts instead of loading from Fontshare, and keep the licence file in the repo.

### Layout rules
- Text sits in a left column (`min(40rem, 46vw)`; dense sections `.wide`). The graph sits right of centre and runs under the end of the text lines, where it dims.
- Every list on the site uses one pattern, `.rows`: a hairline above each item, a small label column, then the heading and text. No cards.
- Numbers that compare (before/after) use `.ledger` with fixed columns so values line up.
- Dense sections (comparison, team, FAQ) use `data-stop="quiet"`, which dims the graph to 40%.

## Never do
- Glassmorphism, gradient blobs, purple-to-blue gradients
- Colour used as decoration. If it doesn't encode data, it's ink or paper
- Emoji as icons or bullet points
- Rows of identical rounded cards with shadows
- A strip of four big stat tiles as decoration
- Centered-everything hero sections
- Inter, Space Grotesk, or any font outside the two above

## Files
- `design/tokens.css`: the variables. Pages import this file and use only its variables.
- `tools/palette.py`: the colour derivation and validation report.
- `archive/`: superseded work (first draft, prototype, earlier colour tests) with a frozen copy of the old tokens.
- `css/site.css`, `js/graph.js`: the site's styles and background graph. `data/graph.json` is rebuilt with `tools/build_graph.py`.
