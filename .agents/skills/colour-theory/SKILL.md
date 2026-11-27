---
name: colour-theory
description: Colour theory applied to the openmediavault web interface - colour as a signal channel, the colour budget (which hue may do which job), the one colour scheme every hue takes a place in (Sky blue base, attention on its complementary arc, OK a quarter turn round, series in the gaps, navy ink), the brand sky blue, Sky's interaction roles and the Cobalt accent, light and the four kinds of gradient, pending gold, warning orange, status fill/label/stroke families, the slate neutral ramp, dark-theme derivation, chart palettes, tints and gradients, contrast (WCAG 2.2 bar, APCA advisory), colour-vision deficiency, and the scripted colour audit. Triggers on choosing or changing a colour, a token, a status or pending colour, a hover/selected/focus colour, a chart series, a tint, dark-mode colour, contrast, colour blindness, and colour reviews.
---

# Colour theory for the openmediavault web interface

This skill is **how to think about colour and how to audit it**. The decisions themselves, with their
measured numbers, are in the [visual foundation](../../../docs/design/visual-foundation.md), section
3 (normative for the grounds, the brand, light and gradients, washes and elevation), and the
[style guide](../../../docs/design/style-guide.md), sections 2 and 3 (status semantics, the
fill/label/stroke split, charts). This skill never restates their numbers, because they come from
the audit script and would go stale here. The token mechanics are in the `design-system` skill. The
sourced research behind the rules is in [references/research.md](references/research.md).

The audit script is [`tools/colour-audit.mjs`](../../../tools/colour-audit.mjs). It is the only copy;
do not duplicate it.

```
node tools/colour-audit.mjs                     # contrast + distinct + neutrals
node tools/colour-audit.mjs contrast --quiet    # exit 1 if a required pair fails (the CI gate)
node tools/colour-audit.mjs distinct            # status, brand and series under simulated CVD
node tools/colour-audit.mjs neutrals            # hue drift and chroma of the slate ramp
node tools/colour-audit.mjs legacy              # the stock OMV palette's measured defects
node tools/colour-audit.mjs measure '#fff' '#5dacdf'
node tools/colour-audit.mjs measure '#8a4613' '#f78f00' 0.14 '#ffffff'   # on a wash over a ground
node tools/colour-audit.mjs oklch 0.55 0.12 240
```

---

## 1. Colour is a signal channel

Colour in this console may say five things and only five (style guide 2): where you can act; the
state of a monitored thing; that configuration is pending; which chart series is which; identity.
Everything else is neutral.

The test for any colour: **remove it - is information lost?** If not, it is decoration, and
decoration may not borrow a hue that one of the five jobs owns.

**A status colour is a claim.** Red says "act now" whatever the words beside it say. It is reserved
for a monitored thing that has failed or is failing. A validation error is not a system status, and
a destructive button is red by form, not by status.

## 2. The scheme and the budget

### The scheme: every colour has its place

Every colour sits in one scheme built on Sky's blue (owner, 2026-11-24; the values and numbers are
in foundation 3.6, and `tokens.css` states it at the top of its primitives). Measure hue in OKLCH
(`node tools/colour-audit.mjs measure '#hex' '#fff'` prints it):

- **The base, about 240**: Sky blue in lightness steps does brand, links, selection, checked
  controls, the focus ring, the trace, usage and the map path. The slate neutrals
  lean toward it.
- **The accent, 258**: Cobalt, the base turned toward the screen's own blue at nearly twice its
  chroma, says "do this" and nothing else (owner, 2026-11-25). Analogous, so it belongs; louder by
  chroma, not by temperature, because the warm arc means status and pending and a warm accent
  would read as a state.
- **The attention arc, opposite**: warning on the complement (62), critical and pending on the split
  complements (27 and 87). Lightness falls with hue, gold lightest, red darkest; keep that order, it
  is what separates them under colour-vision deficiency.
- **The quarter turn, 151**: OK, on the calm side with the base.
- **The gaps, 118, 195, 292, 345**: the chart series, at one chroma and an even lightness ladder.
- **Ink on a light fill is Sky's navy** (brand-950); white on a dark fill. Never a new hue as ink.
- **Words never go muddy**: a word in a hue leans toward red as it darkens and toward yellow as it
  lightens. A darkened yellow reads olive or brown, which is why pending words in light are navy.

A new colour takes a place in the scheme or it does not come in. A colour at an in-between hue that
belongs to neither side (the old coffee ink at hue 37), or a family whose chroma or lightness is out
of step with its siblings, is a defect even when it passes contrast.

### The budget: every hue with one job

Colour now also expresses identity and depth (the live trace, raised surfaces;
foundation 3), but each hue still has one job, listed in style guide 2.1, and status stays honest.
The checks that follow from it:

- **One interaction hue, one accent.** Sky means "you can interact with this" (links, selection,
  checked controls, the focus ring: `link`, `selected*`, `focus-ring`). Cobalt (`action*`, shadcn
  `primary`) means "this is the one to press": the primary button, the next step on an item that
  needs the person, the current step, the first-steps progress, an empty state's create. In-place
  hover is the neutral `muted` step; selected is a Sky tint; focus is the Sky ring, so tabbing
  through a form never paints the accent.
- **The accent is scarce.** One filled per region, at most three accent elements in a viewport,
  about 2% of it by area. Never a status, pending, a link, selection, a hover, a heading, a chart
  series or decoration; it never pulses.
- **Count the hues on a screen.** Neutrals, blue, the status hues present, chart series. Any other
  hue names its job from the table or goes.
- **There is no "info" colour.** Both blues are taken.

The four project-specific splits, and why (style guide 3.3 and 3.4):

- **Sky blue `#5dacdf` is the brand, never a surface and never the primary action**: the mark, the
  health ring, the trace of live data, the traced path on a map and the focus ring. There is no
  sky-blue bar, no glow and no "live" dot (style guide 10). White on it fails, so in light a deeper step of the
  same hue does links and checked marks; in dark it is the checked mark itself.
- **Cobalt is the accent, a family of its own** (foundation 3.6): fill, hover, foreground, label,
  stroke (the edge that clears 3:1; in dark the fill alone does not) and wash. In light it shares
  Sky's lightness, so the two are told apart by form (a button with a verb against a link, a mark
  or a tint), never by a bare accent dot or line beside a Sky one.
- **Gold means pending configuration and nothing else.** It is OMV's signature banner, warmed from
  the stock lemon to the gold of the scheme and inked in navy; it is never warning, accent,
  highlight or hover.
- **Warning is OMV's own orange**, on the exact complement of the blue, which frees the gold.
- **shadcn's `accent` and `secondary` are neutral.** Mapping `accent` to a hue would paint every menu
  hover with it.

## 3. Roles and the fill / foreground / label / stroke split

Three tiers (primitives, semantic `--theme-*`, shadcn vocabulary); components read the semantic or
component tier only.

Every chromatic family has members with different jobs and different bars (style guide 3.5):

| Member          | Job                                     | Bar                                   |
| --------------- | --------------------------------------- | ------------------------------------- |
| fill (`x`)      | meter fill, solid button                  | 3:1 only if it carries meaning alone |
| `x-foreground`  | words on the solid fill                 | 4.5:1 against the fill                |
| `x-label`       | words in that hue on a ground or tint   | 4.5:1 on every ground it lands on     |
| `x-stroke`      | outlines, rings, small icons            | 3:1 on every ground                   |
| `x/14` tint     | a wash behind a label                   | the label clears 4.5:1 on the wash    |

**Fills draw; labels are read.** A status fill used as a word is the commonest colour defect in the
stock interface, and the new fills are no better as words. A word always takes `-label`.

## 4. Neutrals: one family, one temperature

- One hue at low chroma, stepping in lightness. A step far off its neighbours' hue, or at several
  times their chroma, reads as a different colour rather than a darker grey. `neutrals` reports both.
- The slate ramp is cool and leans toward the brand hue so greys and blues belong together.
- Three text tiers that read as tiers: `foreground`, `muted-foreground`, `subtle-foreground`
  (placeholders and disabled only).
- Two borders: `border` is a faint, decorative divider and exempt from 3:1; `border-control` marks something you
  can operate and clears 3:1 on every ground.

## 5. Dark theme: re-derive, never invert

- Every semantic token has its own dark value. Chromatic words and marks go lighter and less
  saturated; grounds are a night sky, the slate family leaning toward the brand.
- No pure black, no pure white for text. Elevation is a lighter surface with a 1px inner top
  highlight (light from above) and a soft long shadow; light uses a layered soft shadow in slate ink.
- No large brand fill: a full-width sky-blue surface would be the brightest thing on screen.
- WCAG 2 flatters dark pairs; read the APCA column too and keep advisory pairs to labels at medium
  weight or above.
- The same status looks like the same status in both themes.

## 6. Status colour

- **Never colour alone** (WCAG 1.4.1): the status word or a distinct icon shape travels with every
  status colour.
- **Same meaning, same treatment, everywhere**: one status label (its icon and its word in the
  `-label` ink, no capsule) per status; where the word does not fit, the same icon with the word in
  its name. No coloured disc, no tinted card, no coloured left edge (style guide 10).
- **Lightness must separate what hue cannot.** Under red-green deficiency some pairs collapse in hue;
  the style guide keeps OK light and Critical dark, and carries the remaining close pairs by form
  (pending is a banner or a labelled chip, never a bare dot; Unknown is a hollow ring).
- **Unknown is never drawn as OK**, and "no data yet" is never green.

## 7. Charts

- **At most four categorical series**; a fifth folds into Other or the chart becomes small multiples.
  The series take the gaps between the scheme's hues, never blue, the pending gold or a status hue.
- Label lines directly and give each series its own dash or marker; the legend is never the only
  link.
- Sequential (how full, how much): one hue by lightness, Sky's usage blue.
- Grey for context, colour for the series being discussed.
- Thresholds are status with words: a meter is blue until an admin-configured threshold adds a
  Warning or Critical status label.

## 8. Tints, alpha and gradients

- Alpha is safe on one known ground and unpredictable over variable ones, so translucent colours are
  tokens written as `color-mix(in srgb, <colour> N%, transparent)` (the washes, `selected`,
  `trace-area`), and every ground they sit on is a pair in `PAIRS`, composited the
  way the browser paints it with `on(ground, layer...)`. An `x/NN` class a token does not name is a
  new pair first.
- State layers use the neutral steps (`muted`, `muted-strong`). Pick tonal step or overlay per
  component; do not mix.
- **One gradient** (foundation 3.4): the area under a live line (series or trace colour only). The
  ambient light, the material light of the chassis and the card lit in its state are gone (owner,
  2026-11-25; style guide 10). A gradient is audited at every stop with `gradient(name, stop...)`;
  the worst stop decides. Never a glow, a radial wash, a gradient on a surface or a button, gradient
  text or borders, dithering, noise, blur or multi-hue decoration. A wash is never a status ground.

## 9. Contrast: the bar and the advisory

- **WCAG 2.2 AA is the bar**: 4.5:1 for text; 3:1 for large text, for marks needed to understand
  content, for the edge of a control (1.4.11), and for the focus indicator.
- **APCA is advisory**: body text Lc 75, secondary Lc 60, large or bold Lc 45.
- Measure on the real grounds: `page`, `surface`, `muted`, `muted-strong`, the wash a label sits on,
  and the line or fill it sits over (the trace's own area fill).

## 10. Auditing colour

Do all five passes and report what each found.

1. **Contrast matrix**: `contrast`, every required pair in both themes. Exit 1 fails the build.
2. **Distinguishability**: `distinct`, status against status and brand, under normal vision,
   deuteranopia, protanopia and tritanopia, plus the greyscale lightness gap. Under 10 means the pair needs its
   word or icon wherever both appear.
3. **Neutral ramp**: `neutrals`.
4. **Tokens in code**: search components for literal colours, raw Tailwind palette classes,
   primitives, and fill tokens used on text. None may exist.
5. **Screens**: both themes, the squint test (the primary action and the worst status are what you
   see first), greyscale (`filter: grayscale(1)`; every status still identifiable), and the browser's
   deuteranopia and protanopia emulation. The `browser-verifier` subagent captures these.

Durable rules an audit finds go into the style guide, not into an audit document.

## 11. Before adding or changing a colour

Follow style guide section 8: name its job; give it its place in the scheme (section 2); reuse a family or give a new one the full shape for both
themes; declare it in `tokens.css` as hex; add its pairs to `PAIRS` (and `DISTINCT` if it must be
told apart) in the same change; run the audit; look at it in `preview.html` and the app in both
themes, greyscale and deuteranopia; update the style guide's numbers.

## 12. Checklist

- [ ] Every chromatic element names one of the five jobs; decoration is neutral.
- [ ] Sky is the only interaction hue and Cobalt only says "do this"; hover neutral; one filled
      accent per region.
- [ ] Every colour has its place in the scheme; inks on light fills are navy; no muddy in-between
      hue, and chroma and lightness in step with the family's siblings.
- [ ] The pending gold only for pending configuration.
- [ ] Status hues only mean status; no blue "info".
- [ ] Words use `-label` or `-foreground`; fills and strokes are not text colours.
- [ ] Every status has its word or a distinct icon; Unknown is hollow; greyscale and CVD views still
      tell states apart.
- [ ] `contrast` exits 0; advisory pairs are labels, not body text.
- [ ] No literal colours, palette classes or primitives in components; no gradient outside the four
      kinds, and each one audited at its stops.
- [ ] Charts: four series at most, directly labelled, distinct dash or marker.
- [ ] Both themes checked; dark re-derived, not inverted.
