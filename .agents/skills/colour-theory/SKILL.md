---
name: colour-theory
description: Colour theory applied to the openmediavault web interface - colour as a signal channel, the colour budget (which hue may do which job), the identity sky blue versus the action blue, pending yellow, warning orange, status fill/label/stroke families, the slate neutral ramp, dark-theme derivation, chart palettes, tints and gradients, contrast (WCAG 2.2 bar, APCA advisory), colour-vision deficiency, and the scripted colour audit. Triggers on choosing or changing a colour, a token, a status or pending colour, a hover/selected/focus colour, a chart series, a tint, dark-mode colour, contrast, colour blindness, and colour reviews.
---

# Colour theory for the openmediavault web interface

This skill is **how to think about colour and how to audit it**. The decisions themselves, with their
measured numbers, are in the [style guide](../../../docs/design/style-guide.md), sections 2 and 3;
that document is normative and this skill never restates its numbers, because they come from the
audit script and would go stale here. The token mechanics are in the `design-system` skill. The
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

## 2. The budget: mostly neutral, every hue with one job

Dense product interfaces run at roughly 90% neutral by area; the 60-30-10 rule comes from interior
design and is the wrong model for a data tool. The table of hues and their one job is style guide
2.1. The checks that follow from it:

- **One interaction hue.** Action blue means "you can act here". In-place hover is the neutral
  `muted` step; selected is a blue tint; focus is the blue ring.
- **One filled primary per view or dialog.**
- **Count the hues on a screen.** Neutrals, blue, the status hues present, chart series. Any other
  hue names its job from the table or goes.
- **There is no "info" colour.** Blue is taken.

The four project-specific splits, and why (style guide 3.3 and 3.4):

- **Sky blue `#5dacdf` is identity, not action, in the light theme**: white on it fails, so the bar
  keeps the hue with dark ink, and a deeper blue of the same hue does actions. In dark it is the
  action colour.
- **Yellow means pending configuration and nothing else.** It is OMV's signature banner; it is never
  warning, accent, highlight or hover.
- **Warning is OMV's own orange**, which frees yellow.
- **shadcn's `accent` and `secondary` are neutral.** Mapping `accent` to a hue would paint every menu
  hover with it.

## 3. Roles and the fill / foreground / label / stroke split

Three tiers (primitives, semantic `--theme-*`, shadcn vocabulary); components read the semantic or
component tier only.

Every chromatic family has members with different jobs and different bars (style guide 3.5):

| Member          | Job                                     | Bar                                   |
| --------------- | --------------------------------------- | ------------------------------------- |
| fill (`x`)      | dots, meter fill, pill wash, solid button | 3:1 only if it carries meaning alone |
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
- Two borders: `border` is a quiet divider and exempt from 3:1; `border-control` marks something you
  can operate and clears 3:1 on every ground.

## 5. Dark theme: re-derive, never invert

- Every semantic token has its own dark value. Chromatic words and marks go lighter and less
  saturated; grounds are graphite with the same faint slate tint.
- No pure black, no pure white for text. Elevation is a lighter surface plus a hairline.
- A large brand fill is a container, not a button colour: in dark the top bar takes the container
  blue, because a full-width sky-blue bar would glow.
- WCAG 2 flatters dark pairs; read the APCA column too and keep advisory pairs to labels at medium
  weight or above.
- The same status looks like the same status in both themes.

## 6. Status colour

- **Never colour alone** (WCAG 1.4.1): the status word or a distinct icon shape travels with every
  status colour.
- **Same meaning, same treatment, everywhere**: one pill, one dot, one icon per status.
- **Lightness must separate what hue cannot.** Under red-green deficiency some pairs collapse in hue;
  the style guide keeps OK light and Critical dark, and carries the remaining close pairs by form
  (pending is a banner or a labelled chip, never a bare dot; Unknown is a hollow ring).
- **Unknown is never drawn as OK**, and "no data yet" is never green.

## 7. Charts

- **At most four categorical series**; a fifth folds into Other or the chart becomes small multiples.
  The series palette avoids blue, yellow and the status hues.
- Label lines directly and give each series its own dash or marker; the legend is never the only
  link.
- Sequential (how full, how much): one hue by lightness, the action blue.
- Grey for context, colour for the series being discussed.
- Thresholds are status with words: a meter is blue until an admin-configured threshold adds a
  Warning or Critical pill.

## 8. Tints, alpha and gradients

- `x/NN` is alpha over whatever is below: safe on one known ground, unpredictable over variable
  ones. Only the audited washes ship (style guide 3.10); any other combination is added to the audit
  first.
- State layers use the neutral `muted` step. Pick tonal step or overlay per component; do not mix.
- **No gradients.** They carry no information here.

## 9. Contrast: the bar and the advisory

- **WCAG 2.2 AA is the bar**: 4.5:1 for text; 3:1 for large text, for marks needed to understand
  content, for the edge of a control (1.4.11), and for the focus indicator.
- **APCA is advisory**: body text Lc 75, secondary Lc 60, large or bold Lc 45.
- Measure on the real grounds: `page`, `surface`, `muted`, the identity bar, and the tint a label
  sits on.

## 10. Auditing colour

Do all five passes and report what each found.

1. **Contrast matrix**: `contrast`, every required pair in both themes. Exit 1 fails the build.
2. **Distinguishability**: `distinct`, status against status and brand, under normal vision,
   deuteranopia and protanopia, plus the greyscale lightness gap. Under 10 means the pair needs its
   word or icon wherever both appear.
3. **Neutral ramp**: `neutrals`.
4. **Tokens in code**: search components for literal colours, raw Tailwind palette classes,
   primitives, and fill tokens used on text. None may exist.
5. **Screens**: both themes, the squint test (the primary action and the worst status are what you
   see first), greyscale (`filter: grayscale(1)`; every status still identifiable), and the browser's
   deuteranopia and protanopia emulation. The `browser-verifier` subagent captures these.

Durable rules an audit finds go into the style guide, not into an audit document.

## 11. Before adding or changing a colour

Follow style guide section 8: name its job; reuse a family or give a new one the full shape for both
themes; declare it in `tokens.css` as hex; add its pairs to `PAIRS` (and `DISTINCT` if it must be
told apart) in the same change; run the audit; look at it in `preview.html` and the app in both
themes, greyscale and deuteranopia; update the style guide's numbers.

## 12. Checklist

- [ ] Every chromatic element names one of the five jobs; decoration is neutral.
- [ ] Blue is the only interaction hue; hover neutral; one filled primary per view.
- [ ] Yellow only for pending configuration.
- [ ] Status hues only mean status; no blue "info".
- [ ] Words use `-label` or `-foreground`; fills and strokes are not text colours.
- [ ] Every status has its word or a distinct icon; Unknown is hollow; greyscale and CVD views still
      tell states apart.
- [ ] `contrast` exits 0; advisory pairs are labels, not body text.
- [ ] No literal colours, palette classes or primitives in components; no gradients.
- [ ] Charts: four series at most, directly labelled, distinct dash or marker.
- [ ] Both themes checked; dark re-derived, not inverted.
