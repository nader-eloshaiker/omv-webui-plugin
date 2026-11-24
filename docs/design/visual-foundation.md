# Visual foundation

The look of the new interface, re-founded after the owner rejected the first one (journal,
2026-11-23, "The interface's look is re-founded"). It says what the interface should feel like, the
principles every screen follows, and the systems that carry them: colour, type, space, surfaces,
motion, data visualisation, illustration, navigation and page composition. It ends with the three
visual directions that were prototyped in the design lab, and the owner's choice among them.

**It is normative.** On 2026-11-24 the owner chose the mix (journal, "The new look: the owner's four
choices"; section 14.4): **Sky is the base, Atlas's map is the diagram language, and Instrument's
values are the compact density.** The values in sections 3 to 7 are the chosen ones, and they live
in [`design/tokens.css`](../../design/tokens.css), the only place a colour, size, duration or easing
is declared. Where this document and the style guide disagree on anything section 0 lists, this
document wins.

- The lab: `web/apps/omv-web-app/src/lab/`, at `/ui/lab` in `pnpm dev` and `pnpm dev:mock` only
  (section 15). It keeps all three directions for reference.
- Token values: [`design/tokens.css`](../../design/tokens.css); the specimen sheet:
  [`design/preview.html`](../../design/preview.html). Every contrast number here is the output of
  `node tools/colour-audit.mjs`, which checks every pair in both themes (section 3.5).

---

## 0. What this replaces and what survives

This document **supersedes** these parts of the [style guide](style-guide.md):

| Style guide | Was | Now |
| --- | --- | --- |
| 1 (feel), 1.1 last row (Material dropped for flat) | Calm, appliance-like, "no decoration that moves" | Section 1 and 2 here |
| 2.1 (colour budget, about 90% neutral by area) | Colour only as signal | Section 3: colour also expresses identity and depth, with rules that keep status honest |
| 2.1 and 3.3, the identity rows (the sky-blue top bar, `identity` and its ink) | Identity is a bar | Section 3.2: no bar; the brand is the mark, the light, the trace and the focus ring. 3.3's action decision stands |
| 3.7 neutral ramp values, three text tiers, three grounds | Graphite, flat | Section 3.1: Sky's ramp, four grounds and a readable third tier (`tertiary-foreground`) |
| 3.10 last bullet (no gradients) | No gradients anywhere | Section 3.4: four kinds of gradient and light, each with a meaning |
| 3.10 tints as `x/14` alpha classes | Ad hoc alpha | Section 3.3: the audited wash tokens (`warning-wash` and the others) |
| 3.8 "elevation is a lighter surface plus a hairline" | Flat | Section 6 |
| 3.11 audit numbers, 4.6 focus-ring numbers | Measured on the old grounds | Section 3.5 |
| 4.1 scale table | 12 to 30px, 14px body | Section 4 |
| 4.2 card padding and gaps | Fixed | Section 5 (Sky, plus the compact density) |
| 4.3 radii, "borders before shadows", three elevation levels | 6 and 8px, flat | Section 6 |
| 4.5 (motion "never entertains", 120/180/260ms, live values without animation) | Minimal | Section 7 |
| 5.1 top bar on identity blue; 40-row side navigation | One long text list | Section 10 |
| Page composition as practised by every slice (stacked prose sections) | Document-like | Section 11 and 12 |

These **survive unchanged** and are normative here too:

- **Status semantics** (style guide 2 jobs 2 and 3, 3.4 to 3.6, 5.5): the fixed words OK, Warning,
  Critical, Unknown, Disabled, Stopped; a word or a distinct shape with every status colour; Unknown
  as a hollow ring; a roll-up shows the worst child; yellow means saved-but-not-applied and nothing
  else; warning is OMV's orange; destructive is a form, not a status; no blue "info" severity.
- **The audited colour values** of status fills, labels and strokes, pending yellow and its ink and
  the action blues (tokens.css), and the fill/label/stroke split (3.5). None needed to change on the
  new grounds. The identity roles are gone with the identity bar (3.2).
- **Contrast and colour-vision rules** (3.11, 6): WCAG 2.2 AA as the bar, APCA advisory, measured
  on real grounds, CVD-checked.
- **Accessibility** (6), **focus** (4.6), **forms and validation** (5.3), **destructive
  confirmation** (5.4), **tasks and output** (5.7), **the pending loop** (5.8: its behaviour, and
  its band directly under the top bar; section 10), **empty states** (5.9), **toasts** (5.10).
- **Security rules** (7) and every `UI-*` rule in [05-security.md](../05-security.md).
- **Squircle corners** where supported (4.3), now also on Sky's larger radii.
- **Units and numerals** (4.1): binary units, one decimal, a non-breaking space, tabular figures.

---

## 1. The feel

The NAS is a machine that is alive in the next room. Opening the interface should feel like looking
at it through a good window: in one glance you see that it is well, or exactly what is not; the
things that move are the things that are really moving; everything you can touch looks touchable
and tells you what it will do before you touch it. It is quiet when nothing is wrong, unmistakable
when something is, and pleasant enough that people open it when nothing is wrong.

Not a document, not a control panel from 2010, not a showcase. Depth, light and motion are used the
way a well-made physical product uses them: to show what is in front, what is live and what changed.

## 2. Principles

1. **State in one glance, the problem in five seconds.** Every top-level screen opens with its
   answer: the worst state, in words, at the largest size on the page. Healthy is a short sentence,
   not an absence.
2. **Show, then tell.** Quantities, structure and relationships are drawn (meters, rings, bays,
   maps). Explanations are one click away (section 12), never the first thing on a page.
3. **Affordance is obvious.** Anything pressable looks pressable at rest, not only on hover; every
   action says what it does in a verb with its object, and previews its consequence before it
   happens (section 13).
4. **Depth means hierarchy.** What is raised is more important or closer to the hand; what is
   ambient is identity. Nothing is raised for decoration.
5. **Motion explains.** It shows where a thing came from and went, what changed, what is live, what
   is working and that something landed. It never delays a reader and never loops without real work
   behind it (section 7).
6. **Honest liveness.** Only what is sampled moves; a chart says how long it has been sampling
   (OMV keeps no history as numbers, journal A7). "No data yet" is never drawn as calm.
7. **Status colour is a claim.** Status hues mean only the state of a monitored thing, always with
   a word or shape. Brand light is for identity and never for state.
8. **One interface for beginners and experts.** The same screens, layered: plain first view,
   explanations on demand, technical detail one disclosure away, and fast keyboard paths for those
   who want them (section 13).

## 3. Colour, dark first

### 3.1 Grounds with depth

Dark is the first theme. Sky's grounds step up in lightness in the slate family, a night sky: OKLCH
hue 248 to 259 with chroma 0.005 to 0.037, leaning toward the brand so greys and blues belong
together. Every ground, line and text tier is one step of the `--color-slate-*` ramp. Light is
re-derived, not inverted: a cool page and white cards.

| Lab name | Token | Job | Dark | Light |
| --- | --- | --- | --- | --- |
| `bg` | `page` | The page, with the ambient light at its top | `#0a111c` (slate-950) | `#eef3f8` (slate-100) |
| `s1` | `surface` | Cards, panels, tables, dialogs, menus | `#111a27` (slate-925) | `#ffffff` |
| `s2` | `muted` | Insets, table heads, neutral hover inside a card | `#16212f` (slate-900) | `#f5f8fb` (slate-50) |
| `s3` | `muted-strong` | Hover on a control, chips, tracks | `#1d2939` (slate-850) | `#e8eef4` (slate-200) |
| `line` | `border` | Dividers (decorative) | `#233042` (slate-800) | `#dbe3eb` (slate-300) |
| `line-2` | `border-control` | Control edges, 3:1 on every ground | `#7d8b9b` (slate-550) | `#6b7885` (slate-600) |

**Text tiers**, measured on all four grounds:

| Lab name | Token | Use | Dark | Light |
| --- | --- | --- | --- | --- |
| `ink` | `foreground` | Body, titles, figures | 12.58 to 16.19:1 | 14.96 to 17.49:1 |
| `ink-2` | `muted-foreground` | Secondary text | 7.12 to 9.17:1 | 6.41 to 7.49:1 |
| `ink-3` | `tertiary-foreground` | Captions, metadata | 4.68 to 6.02:1 | 5.24 to 6.13:1 |
| | `subtle-foreground` | Placeholder and disabled only (exempt, WCAG 1.4.3) | 3.26 to 4.19:1 | 2.98 to 3.48:1 |

`ink-3` was raised during the lab's review: the first values gave 4.02 to 4.46:1 in five places and
captions are read. Dark `tertiary-foreground` sits at APCA Lc 40 to 43, so it is for 12px-and-up
captions at medium weight and never for running text. Three lab values were merged into the ramp's
nearest step, with no visible difference: dark `ink` `#eaf0f6` is `#e8eef4`, light `ink` `#0f1a26`
is `#111a27`, and the meter track takes `muted-strong` in both themes.

### 3.2 How the brand is expressed

OMV's sky blue `#5dacdf` stays the identity, and now does more (tokens in brackets):

- **As the mark and light** (`brand`): the logo, the live dot, the health ring, the power light on
  the drive-bay picture; and an ambient glow from above the page (`ambient`, `ambient-soft`, section
  3.4).
- **As the focus ring** (`focus-ring`): brand-600 in light, brand-300 in dark.
- **As the trace of live data** (`trace`, `trace-area`). Single-series live charts (processor,
  memory, network, temperature) draw in the brand blue: they are "how much", which the old guide
  already gave to the usage ramp.
- **As the path** (`art-path`). On maps, the lineage you are tracing lights in brand blue.
- **As action and selection**, as before: the action blue in light (`#1272ab`, labels `#095a8a`),
  the sky blue itself in dark with navy ink; the `selected` tint is the same blue at 9% (light) and
  14% (dark).

**The identity bar is gone** (owner, 2026-11-24): no surface is painted sky blue. The top bar sits
on the page ground and identity comes from the mark, the light and the blue that runs through live
data. The `identity`, `identity-foreground` and `focus-ring-on-identity` roles and the button's
`onIdentity` variant are removed; controls on the bar use the `quiet` variant. (The light-theme top
bar's contrast problem in style guide 3.3 disappears with it.)

### 3.3 Status stays honest

Status hues (OK green, Warning orange, Critical red, Unknown grey) and the pending gold are used
only for what they mean (where each sits on the colour wheel, and why, is 3.6), always with a word or shape: a pill, a shaped mark, a slot light with the word
beside it, a node with its mark. Two kinds of status area are new and allowed: a **status-tinted
wash** behind the one element that carries a non-OK state (the health strip's lead cell, a warning
callout, a warning node on a map) at 7 to 14% over a known ground (`ok-wash` 12%, `warning-wash`
14%, `critical-wash` 14%, `unknown-wash` 10%, `pending-wash` 14%, theme-invariant like the fills),
and **status-coloured lines** on a map leading to a node in that state. Both always travel with the
node's mark and word. A risk statement that is not a monitored state (for example "a stripe loses
everything") uses a neutral glyph, never a status hue.

### 3.4 Gradients, tints and light: four kinds, each with a meaning

| Kind | Where | Means | Rule |
| --- | --- | --- | --- |
| Ambient light | Behind the top of the page (`ambient-light`), brand hues only | Identity | Nothing is read against it that would fail at its darkest or lightest point; never a status hue |
| Area fill under a live line | Sparklines and live charts, from 0.32 alpha to 0 (`trace-area`) | The area of the quantity | Series or trace colour only |
| Material light | The chassis of the drive-bay picture, lit from above, 1 step (`art-chassis-top`, `art-chassis-bottom`) | That the picture is an object | Grounds only |
| Status wash | One element per non-OK state (`*-wash`; as light, a radial wash in a card's corner fading to the card) | The state, with its word | Over a known ground; the label clears 4.5:1 on it |

The ambient light is two radial glows whose ellipses are centred above the page (the lab's
geometry). Its tokens are the **brightest point actually painted**, where each glow meets the page's
top edge: `ambient` is brand-400 at 10% (dark) and 12% (light), `ambient-soft` brand-300 at 3% and
7%. The `ambient-light` utility places its first colour stop exactly there, so it looks as it did in
the lab, and the audit measures what is on screen rather than the centre of an ellipse no one sees.

Not allowed: multi-hue decorative gradients, gradient text, gradient borders, glow around text,
glass blur over content. One exception to blur: Sky's sticky top bar blurs the page scrolling under
it, so the bar stays legible over any content.

### 3.5 The audit

Done. Every pair is in `PAIRS` in `tools/colour-audit.mjs`: each text tier, label, stroke and
control edge on each of the four grounds; the selected tint; the status and pending washes over each
ground, with the body and secondary text that sits on them; the ambient light; a card lit in its
warning or critical state; the trace over its own area fill; the chassis; the map lines; the bars of a bar chart on a card or an inset (4.90 to 7.02:1); and the
Save button's "Saved" (`ok-foreground` on the OK fill, 12.24:1, edged in `ok-stroke`). The script
now composites translucent tokens over their known ground, as the browser paints them (`on(ground,
layer...)`), and checks a gradient at each of its stops, the worst stop deciding (`gradient(name,
stop...)`). It reads `color-mix(in srgb, X N%, transparent)`, the form every wash and glow is
written in.

**Result: 436 required pairs, 0 failures, both themes** (164 before the new grounds, 430 before the
scheme of 3.6). Highlights:

- In the ambient light, at its brightest (both glows over the page): `foreground` 13.90:1 light and
  13.26:1 dark, `muted-foreground` 5.96 and 7.51:1, `tertiary-foreground` 4.87 and 4.93:1, the focus
  ring 4.15 and 8.41:1, `border-control` 3.59 and 4.46:1.
- Status labels on their own wash over any ground: 5.10 to 6.78:1 light, 6.08 to 9.06:1 dark; the
  pending words, navy in light and gold in dark, 14.72 to 16.23:1 and 8.88 to 9.88:1. On a card lit
  warning, the warning word is 6.28:1 light and 7.28:1 dark at the wash's strongest point.
- The trace over the top of its own area fill: 3.13 to 3.30:1 light, 4.17 to 4.49:1 dark.
- Secondary text on any wash over any ground: at least 5.11:1 (dark, on the pending wash over
  `muted-strong`).
- The tightest required pairs: dark `tertiary-foreground` on `muted-strong` and on the chassis,
  4.68:1; light `series-2` on the page, 3.09:1; light trace over its fill in an inset, 3.13:1; the
  pending pill's edge in the light ambient light, 3.15:1.
- APCA advisory: 44 text pairs pass 4.5:1 but sit under Lc 60, all labels, captions, secondary
  text on a wash or words on a fill (dark `tertiary-foreground` at Lc 40 to 43 is the lowest); none
  is running text.
- `distinct` simulates deuteranopia, protanopia and tritanopia (Machado 2009). In light the live
  trace beside a categorical series falls under 10 in four places (lowest: trace and `series-3`, 9.2
  under deuteranopia) and violet against magenta is 8.2 under protanopia; in dark only trace and
  `series-2` does, 9.3 under tritanopia. A chart that shows them together labels each line directly
  and gives each its own dash, as style guide 3.9 already asks.

### 3.6 One colour scheme (owner, 2026-11-24)

The owner turned down OMV's lemon `#f8d400` with its coffee-brown ink `#4d2e25` for the pending band
("lacks taste and doesn't really match") and asked that every colour combination follow colour
theory and harmonise with Sky. Measured in OKLCH, most of the palette already did; what did not was
the pending pair, the ink on the dark destructive button, the chart series' uneven weights and the
terminal's green. The scheme below is now the rule for every colour, and `design/tokens.css` states
it at the top of its primitives.

**The scheme, by OKLCH hue:**

| Place | Hue | Who sits there |
| --- | --- | --- |
| The base | 240 | Sky blue: brand, action, selection, the live trace, usage, the map path, the ambient light. The slate neutrals lean toward it (248 to 259) |
| The complement | 62 | Warning, OMV's orange `#f78f00` |
| The split complements | 27 and 87 | Critical `#d01d21`, and pending gold `#ffcd47` |
| A quarter turn | 151 | OK `#74e791` |
| The gaps between | 118, 195, 292, 345 | The four chart series: moss, teal, violet, magenta |
| Ink on a light fill | 243 | Sky's navy, brand-950 `#021d30` |

- **Attention is opposite the brand.** The three colours that ask for attention sit on the blue's
  complementary arc, so they are what the eye goes to on a blue-grey screen. Their lightness falls
  with hue (gold 0.87, orange 0.75, red 0.55), which is what keeps them apart under colour-vision
  deficiency.
- **Calm is beside it.** OK is a quarter turn round, on the cool side with the brand.
- **Series live in the gaps**, never on a signal hue, at one chroma (0.11 to 0.14) and an even
  lightness ladder (light 0.44, 0.50, 0.56, 0.62; dark 0.62, 0.70, 0.79, 0.88), so they part in
  greyscale too.
- **One ink.** Words on a light fill are Sky's navy: pending, "Saved" on the OK fill, the dark
  destructive button, the dark primary button. White on the dark fills.
- **Labels hold one weight and never go muddy.** In light, the status words clear 5.10 to 5.70:1 at
  their worst; a word in a hue leans toward red as it darkens and toward yellow as it lightens.
  Darkened gold reads olive or brown, so in light the pending words are the navy on the gold wash,
  with a deep gold stroke (`#9e7b0b`) that also edges the top bar's pill; in dark they are a lighter
  gold (`#f4d660`). Warning's dark label moves to its fill's own hue (`#ffa659`), apart from the gold.
- **The terminal is a piece of the night theme**: its words are the slate text tiers, not a green
  tint, since green is OK's hue.

**What changed**, light / dark where they differ:

| Token | Was | Now |
| --- | --- | --- |
| `pending` (fill, both) | `#f8d400` | `#ffcd47` |
| `pending-foreground` (both) | `#4d2e25` | `#021d30` (brand-950) |
| `pending-label` | `#695205` / `#f3d754` | `#021d30` / `#f4d660` |
| `pending-stroke` (light) | `#8d7100` | `#9e7b0b` |
| `ok-foreground` (both) | slate-950 | brand-950 |
| `ok-label`, `ok-stroke` (light) | `#00612c`, `#007938` | `#096a33`, `#1d8545` |
| `critical-label` (light) | `#a91518` | `#a32321` |
| `warning-label` (dark) | `#fbb360` | `#ffa659` |
| `destructive-foreground` (dark) | `#2a0606` | `#021d30` (brand-950) |
| `series-1..4` (light) | `#6635a3` `#006c6c` `#d4599b` `#62691b` | `#563e98` `#009a9a` `#983c75` `#6f7d1a` |
| `series-1..4` (dark) | `#9369d4` `#97e9e8` `#e97ab2` `#b5c06b` | `#a58de6` `#70f1da` `#c06099` `#b3c65f` |
| `terminal-foreground`, `terminal-muted` | `#cde6cf`, `#8c9e8e` | slate-200, slate-500 |

The status fills, OK, warning, critical and unknown, did not change: OMV's orange already sits on
the complement and its red on a split complement.

**Measured** (`node tools/colour-audit.mjs`):

- Navy on the gold: 11.53:1 (coffee on lemon was 8.31). "Saved" on the OK fill 11.12:1; words on
  the dark destructive button 5.98:1.
- The pending pill clears 3:1 by its edge: the gold alone is 1.34:1 on the light page, the stroke
  3.15:1 at the worst point of the ambient light.
- Pending against warning (normal / deuteranopia / protanopia / tritanopia): fills 14.5 / 12.1 /
  15.8 / 15.2; words 29.6 or more in light, 11.7 / 7.8 / 11.6 / 12.0 in dark (they were 7.0 / 2.5 /
  1.1 / 7.7 and 9.4 / 6.3 / 9.1 / 8.7). Pending against OK stays a pair that needs its word (7.3
  under protanopia), as before: pending is never a bare dot.
- The weakest chart pair, series against series or the trace, over all four kinds of vision: light
  8.2 (was 3.8), dark 9.3 (was 8.4). Every series clears 3:1 on the plot grounds: 3.09 to 8.27:1
  light, 4.16 to 13.77:1 dark.
- The band's buttons keep the one audited pair in every state. Unavailable while applying, they are
  dashed outlines in the ink rather than faded, since navy at partial opacity over the gold is a
  khaki no one measured.

**For a colour added later**: name its job (style guide 2.1), give it a place in this scheme (the
base, the attention arc, the quarter turn or a gap), ink it in navy if words sit on it, and measure
it with the audit before it ships. A colour that has no place in the scheme does not come in.

## 4. Type

Inter (bundled, its optical-size build) for everything; Roboto Mono (bundled) for device names,
paths and addresses, and for live readouts in compact density. The optical-size build is
`@fontsource-variable/inter/opsz.css`, already in the packaged dependency, so the headline and large
figures get Inter Display's tighter forms automatically. It costs 73 KB for the Latin subset against
the weight-only build's 48 KB.

| Step | Token | Size | Weight, tracking, leading | Use |
| --- | --- | --- | --- | --- |
| Display | `text-display` | 28 to 40px, `clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem)` | 650, -0.03em, 1.1 | The one headline answer on a top page |
| Figure | `text-figure` | 30px (26px compact, in mono) | 600, -0.02em, 1.15 | Live values and capacity figures |
| Page title | `text-title` | 28px | 650, -0.02em, 1.2 | One per page |
| Section | `text-section` | 17px | 600, -0.01em, 1.35 | Card and section titles |
| Body | `text-body` | 15px (13px compact) | 400 to 550, 1.5 | Everything read |
| Caption | `text-caption` | 13px (12px compact) | 500 to 650 | Metadata, units, help lines |

Each named step carries its own weight, tracking and leading, so `text-title` is the whole style.
The plain steps (`text-xs` 12, `text-sm` 13, `text-base` 15, `text-lg` 17, `text-xl` 20, `text-2xl`
24, `text-3xl` 30px) stay for page code written before the named ones; `text-base` and `text-sm`
follow the body and caption in compact density. Live readouts use `font-readout`, which is Inter
and becomes Roboto Mono in compact density.

Rules kept: tabular numerals for every number; units at a smaller size beside the figure; sentence
case; nothing under 12px; text survives 200% zoom and a 40% longer translation. Sky's OpenType
features apply to the whole interface: the single-storey a (`cv11`) and tabular figures (`tnum`),
in `--font-features`.

## 5. Space, grid and density

- A 4px base. A 12-column page grid with a maximum width of 1440px; cards span 3 to 12 columns at
  1280px and above, 6 or 12 under 1024px, 12 under 640px.
- Gutter 16px at 390px and narrower, up to 40px wide.
- **Density is a setting, not a direction.** Comfortable is Sky; compact is Instrument's values on
  Sky's colours: its padding and gaps, a 13px body, dense table rows and monospaced readouts. The
  switch is in the top bar and in the command palette. It is a stored preference like the theme
  (UI-13 allows it), applied as `data-density="compact"` on `<html>`; comfortable needs no
  attribute. Any subtree may carry either value (a story shows both side by side). Prefer the tokens
  and utilities below; the `compact:` variant is for what a token cannot express.

| Token | Utility | Comfortable (Sky) | Compact (Instrument) |
| --- | --- | --- | --- |
| `--density-card` | `p-card` | 24px | 16px |
| `--density-grid` | `gap-grid` | 20px | 12px |
| `--density-cell-y` | `py-cell-y` | 10px | 5px |
| `--density-cell-x` | `px-cell-x` | 12px | 10px |
| `--density-row` | `py-row` | 12px | 8px |
| `--density-control-sm` | `h-control-sm` | 28px | 24px |
| `--density-control` | `h-control` | 32px | 28px |
| `--density-control-lg` | `h-control-lg` | 40px | 36px |
| `--text-body`, `--text-caption` | `text-body`, `text-caption` | 15px, 13px | 13px, 12px |
| `--font-readout` | `font-readout` | Inter | Roboto Mono |

Radii do not change with density (section 6). Every control height stays at or above the 24px
target minimum (WCAG 2.5.8).

## 6. Surfaces and elevation

Three levels, by meaning:

1. **Ground**: the page, ambient light only (`bg-page`, `ambient-light`).
2. **Surface**: cards, panels, tables (`surface-raised`, or `bg-surface shadow-raised`). Dark: one
   step lighter than the ground, a 1px inner top highlight (light from above), a faint edge and a
   soft long shadow. Light: white with a layered soft shadow. Inside a surface, insets are `muted`
   and hover on a control, chips and tracks are `muted-strong`.
3. **Floating**: dialogs, the palette, drawers, menus, popovers and toasts (`surface-floating`, or
   `shadow-floating`). A stronger shadow, over the `scrim` when modal (dark 0.62, light 0.42 alpha).

Something pressable has `shadow-control` at rest: an inner top highlight in dark, a 1px soft shadow
in light. The shadow ink in light is slate (`rgb(17 26 39)`), never black. The tokens `shadow-sm`,
`shadow-md` and `shadow-lg` are gone: `shadow-raised` and `shadow-floating` replace them.

Radius (Sky): controls 12px (`rounded-control`), cards, dialogs, menus, popovers and toasts 20px
(`rounded-card`), squircles of 16 and 30px where `corner-shape` is supported; checkboxes and inner
marks 6px. Pills, dots, meters and rings stay round.

## 7. Motion

### 7.1 Tokens

| Token (lab name) | Utility | Value | For |
| --- | --- | --- | --- |
| `--duration-press` (`--d-1`) | `duration-press` | 90ms | Pressed |
| `--duration-fast` (`--d-2`) | `duration-fast`, the default | 160ms | Hover, focus, small changes of state |
| `--duration-base` (`--d-3`) | `duration-base` | 240ms | Toggles, menus, exits |
| `--duration-slow` (`--d-4`) | `duration-slow` | 360ms | Entrances, page change, dialogs, disclosure height |
| `--duration-glide` (`--d-5`) | `duration-glide` | 640ms | Meters, rings and number glides |
| `--ease-standard` (`--e-std`) | `ease-standard`, the default | `cubic-bezier(0.2, 0, 0, 1)` | Everything by default |
| `--ease-enter` (`--e-enter`) | `ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Things arriving: decelerate hard |
| `--ease-exit` (`--e-exit`) | `ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Things leaving: accelerate away |
| `--ease-settle` (`--e-settle`) | `ease-settle` | a spring as CSS `linear()`, 8% overshoot | Things that land: a switch thumb, a pending chip, a toast |
| `--ease-soft` (`--e-soft`) | `ease-soft` | a spring as CSS `linear()`, 1.5% overshoot | Height changes: bars, disclosures, sections |
| `--motion-stagger` (`--stagger`) | `stagger`, with `--stagger-index` | 45ms per item | List entrance, capped at 10 items |
| `--motion-rise` (`--rise`) | (in `animate-rise`) | 12px | How far an entering card rises |

Shared motions ship as utilities with their keyframes: `animate-rise` (fade and rise, on the enter
curve), `animate-settle-in` (rise a little and land on the settle spring), `animate-fade-in` and
`animate-breathe` (the skeleton, 1.4s). The old `--ease-out` is `--ease-standard`.

The springs are generated from a damped oscillator and written as native `linear()` easing: no
library. Exits are shorter than entrances. Nothing a reader waits for takes longer than 400ms; only
value glides (640ms) and the sample-paced chart scroll are longer, and neither blocks anything.

### 7.2 Catalogue

| Motion | What it explains | How | Reduced motion |
| --- | --- | --- | --- |
| **Page change** | Where you went | View Transitions API: the shell is named and stays still; the old page fades out in 160ms, the new rises 10px (Instrument), scales from 0.985 (Sky), or slides 32px in the direction of travel (Atlas) | A cut |
| **Shared element** | That this is the same thing, bigger | The folder tile is named, so it morphs between views | A cut |
| **List entrance** | Reading order | Items fade and rise in turn (`--stagger`) | Content is simply there |
| **Value glide** | That a number changed, and by how much | Tabular figures tween to the new value in 700ms | Jump to the value |
| **Live line** | What is live and how fast it is sampled | The line moves left by one step over exactly one sampling interval (Web Animations API); the head dot beats once per sample received | The line redraws in place; the dot is still |
| **Meter and ring fill** | How full, as an amount | Fills grow from zero on entrance, then glide | Drawn at value |
| **Switch settle** | That the choice took | The thumb travels on the settle spring; pressing stretches it | Moves without travel |
| **Save settle** | That the save landed | The button's label slides out, a spinner while saving, then a tick draws and the button turns OK green with "Saved" for 1.5s | Words change, no movement |
| **Pending flight** | Where your change went | A small pending mark flies on an arc from the Save button to the pending indicator, which pops on the settle spring as the count rises; the bar or dock slides in | The indicator and bar appear |
| **Apply progress** | That work is happening | A progress line runs along the pending bar; on success the bar reads "Applied" and collapses after 1.6s | A static line and the words |
| **Destructive arm** | That the confirm is now live | Typing the name exactly fills the confirm button with the destructive red from the left | The fill appears |
| **Dialog and palette** | What is in front now | Rise 8px and scale from 0.97 over a fading scrim | Fade only |
| **Disclosure** | That more is there, and its size | The height Base UI measures into `--collapsible-panel-height`, on the soft spring (works where `interpolate-size` does not yet); the chevron turns on the settle spring | Opens at once |
| **Trace** | What depends on this | Pointing at or focusing a map node lights its whole lineage and dims the rest | Same, no transition |
| **Map draw** | That lines are connections | Lines draw along their length on entrance | Drawn |
| **Arrival** | Where to look after a jump | Following "View disk sdb" scrolls to that disk and rings it twice | Ring without movement |
| **Skeleton** | That this is loading, with its final shape | The real layout with its content hidden, bars breathing in opacity at 1.4s | Static bars with the words |
| **Disk failing preview** | What a layout survives | One disk greys and is crossed through; lost blocks go dashed red only where data is lost | Same, no transition |
| **Copy direction** | Which way files go | A dash travels from source to destination twice on arrival, not in a loop (the job is not running) | Static arrow |

The only loops allowed are the spinner and the skeleton, while work or loading is really happening.

### 7.3 Reduced motion

Under `prefers-reduced-motion: reduce` every duration token, the stagger and the rise are 0 (in
`tokens.css`), every animation runs once at once to its end state (css-ui-style's base rule) (so
nothing is left invisible; checked in the lab: no element below full opacity after 400ms on three
screens), view transitions are cut, the pending flight does not run, and JavaScript motion checks
the same query. Meaning never depends on motion: every motion's end state says the same thing in
words.

## 8. Data visualisation

- **Sampled, never invented.** Live charts show only what this page sampled (A7), say so ("Live ·
  every 2 s · last 58 s on this page", the span actually sampled), and start empty. A history kept across pages for the
  session is allowed and says so.
- **Sparkline**: one series, brand trace with its area fill, fixed scale for percentages, a rounded
  "nice" maximum for throughput, a text alternative with now and peak.
- **Capacity meter**: blue until an administrator's threshold; then the warning fill *with* a pill
  ("Almost full"). Instrument segments it (24 or 40 cells) so the amount can be counted; numbers
  always beside it.
- **Ring**: for a few capacities side by side (Sky) and for roll-ups (the health ring: one segment
  per area in its status fill, Unknown dashed). Always with the figure inside and the words beside.
- **Disk**: drawn as a slot in a NAS front panel (section 9). Temperature as a number; no fake
  activity light (OMV does not give per-disk activity).
- **Map**: disks → file systems → shared folders → ways of sharing → people, with traced lineage.
- At most four categorical series, labelled directly (style guide 3.9 holds).

## 9. Illustration and diagram language

Pictures are used wherever they remove ambiguity: what is in the box, how disks combine, what
depends on what, which way a copy goes, what a delete takes away, what to do next on an empty page.

**Drawing rules**

- A 4px grid; strokes 1.5px (2 to 2.5px for emphasis), round caps and joins, `vector-effect:
  non-scaling-stroke` where a drawing scales; corner radius 3 for small parts and 6 for bodies.
- Ink from `currentColor` and fills from the stylesheet's `--art-*` and theme properties, so one
  drawing serves both themes and all three directions. No `<style>` inside an SVG; classes from the
  stylesheet or presentation attributes only.
- Status colour on a drawing follows section 3.3: the shape or word carries the state too (a slot
  light beside its mark and word; a crossed disk; dashed lost blocks).
- Motion follows section 7: parts enter in order, a state change animates once.
- **Words are HTML beside the drawing**, so they reflow at 390px, zoom with the page and translate.
  Text inside an SVG is limited to labels on fixed-size drawings (block letters, "Copy job") at 12px
  or more. A drawing is either decorative (`aria-hidden`, with the same facts as text beside it) or
  `role="img"` with a full text alternative.
- **At 390px** grids of parts wrap (drive slots go from six across to four), maps drop their lines
  and each node says in words what it feeds ("→ pool").

**Security** (UI-2, UI-7): every drawing is a React component built from data through props.
Nothing parses or injects SVG text; backend strings appear only as React text children; no external
or third-party asset. lucide stays for small interface icons.

**The set** (all in `src/lab/art.tsx` except the map in `screens/parts.tsx`):

| Drawing | Removes the question |
| --- | --- |
| Drive bay: the NAS front with one caddy per disk, health light, device, word and role | "Which disk is which, and which one is the problem?" |
| Arrangement: blocks on disks for mirror, stripe and parity, with "Show a disk failing" | "What do I lose if a disk dies?", before anyone commits to a layout |
| Map: disks → file systems → folders → sharing → people, traceable | "What depends on this?", "Who can reach this folder, and how?" |
| Copy direction: from → to with a travelling dash | "Which way does this job copy?" |
| Delete picture: the folder crossed, its links cut, what depends on it named | "What exactly goes away?" |
| Empty pending: a form → the yellow bar | "Where do saved settings wait?" |

Not yet drawn, same language, for later domains: network topology (this browser → interface → the
NAS, bonds, VLANs and bridges as layers), service tiles with meaningful glyphs, RAID and ZFS pool
creation previews using the arrangement drawing with the real disks.

## 10. Navigation and shell

- **Grouped as OMV groups it** (System, Network, Storage, Services, Users, Diagnostics) plus
  Overview. Only the current group's pages are listed at once, so navigation is never a 40-row
  list. Classic-only pages stay listed, quieter, with "Classic" and the external mark.
- **Sky's sidebar**: one sidebar where only the current group is open and the others fold. It scales
  to every page and to plugin items. (The lab also shows Instrument's icon rail and Atlas's top
  tabs; neither was chosen.)
- **Under 1024px** every direction folds into a drawer.
- **The top bar** carries the product mark and host, "Go to or do…" (the palette, `/`), the density
  switch, the pending indicator (a count chip that turns yellow) and the account.
- **The pending changes** keep their behaviour (style guide 5.8) and OMV's yellow, in a **slim band
  directly under the top bar** (owner, 2026-11-24; Sky's dock at the foot of the window was not
  chosen). On save, a pending mark flies into the top bar's "pending" pill, and the band can shrink
  to that pill while the page scrolls.
- The UI-12 notice keeps its place under the top bar in all three (not drawn in the lab).

## 11. Page archetypes

- **Dashboard**: the answer (worst state in words, largest type), then what needs you with a next
  step each, then pending changes, then capacity, disks and live activity, then first steps for a
  new owner, then the rest. Every summary links to its page.
- **List**: a short summary line with counts by state, a drawing where one helps (bay, map), a
  dense table with selection and bulk actions, technical columns behind a switch.
- **Detail**: a summary header (what it is, where it lives, who can use it, its state, and the one
  callout if something is wrong), then sections. Sections are tabs (Instrument), cards with an "On
  this page" list (Sky) or a numbered ledger with sticky section titles (Atlas). Destructive actions
  sit in the header, quiet, and open a confirmation.
- **Flow or wizard**: for creating things that are hard to undo (a file system, a pool, a copy
  job). Steps with a drawing of the result before the final step; never forced on someone who uses
  the palette to reach a single setting.
- **Settings form**: rows with a title, one line of help and the control on the right; a save bar
  appears only when something changed, previews the consequence, and settles on save.

**Where the prose goes.** The current pages explain in paragraphs. In the new composition: one plain
line of help under each control; "Which should I use?" or "What do these mean?" as a disclosure
under a group of controls; "Technical details" as a disclosure with copyable values; a section lead
of one sentence. Anything longer belongs in the help part of the build, linked.

## 12. Progressive disclosure layers

1. **The answer**: state and next step, at the top, in words.
2. **The controls**, each with one line saying what it does for the user.
3. **Explanations on demand**: disclosures named as questions.
4. **Technical detail**: device names, paths, permissions, serial numbers, raw values, one
   disclosure or one switch away, in mono, each copyable.
5. **The classic interface** for what is not here yet, linked plainly.

## 13. One interface for beginners and experts

There are no separate modes. A beginner and an expert use the same screens; the screens are layered
so each finds their path. Two modes would double every page, split the documentation and leave one
of them stale.

**For a new owner (affordance)**

- **Clickable looks clickable at rest**: filled or outlined buttons, links in the action colour with
  an arrow, cards that act have a chevron and a hover state; nothing depends on hover to be found.
- **Every action says what it does**: "Run a quick health check", "Save sharing", "Apply 1 change",
  "Delete Photos and its files"; never "OK".
- **What happens before it happens**: the save bar previews the consequence in words with the real
  address ("Linux computers can mount `nas:/export/Photos`") and says that saving changes nothing
  until Apply; the arrangement drawing shows a disk failing before a layout is chosen; the delete
  dialog draws what goes away.
- **What to do next**: each attention item has one next step; first steps on the dashboard show
  progress (2/4), why each matters, and what the button will open; empty states say what belongs
  there and how it gets there.
- **Sensible defaults and safety**: Discard beside every Save; Undo on the pending bar; typed
  confirmation only where data is lost; focus starts on Cancel.

**For a professional**

- **Command palette** ("Go to or do…", `/` or Ctrl/Cmd+K): every page, classic pages too, and
  actions that open the place where the change is made ("Share Photos with Linux and Unix",
  "Apply 1 pending change"). Arrow keys and Enter; the shortcut beside each item teaches it.
- **Jump keys**: `g` then `o`, `s` or `f` (Overview, Storage, Photos in the lab; per page in the
  build). Ignored while typing.
- **Density**: compact rows from the top bar or the palette.
- **Dense tables** with selection and bulk actions ("2 selected · Run a quick health check", "Set
  to Read only" for several people at once) and **technical columns** behind a switch.
- **Technical values** one disclosure away and copyable.
- **No forced wizards**: a wizard is the way to create something new; changing one setting is always
  a direct page or palette action.

**How each direction serves both**: all three share the palette, jump keys, density, bulk actions,
copyable details, previews and first steps. Instrument leans expert (dense from the start, uppercase
labels, mono readouts) and relies on first steps and previews to welcome a beginner. Sky leans
beginner (a plain headline, big rings, cards) and relies on the palette, density and technical
columns for the expert. Atlas serves both through the map: a beginner sees how things fit together;
an expert traces dependencies before acting.

## 14. Three directions

All three follow sections 1 to 13. They differ in character.

### 14.1 Instrument

*A well-made piece of test equipment.* Graphite grounds in a tight grid of panels separated by
hairlines; sky blue as the signal light in live traces and segmented meters; mono readouts; 13px
body, uppercase 12px panel titles. The dashboard opens with a health strip (overall state, then
disks, file systems, services, network, pending, each a button), then activity with four live
readouts beside "Needs attention", then storage as segmented meters and the disks as a bay of sleds.
Navigation is an icon rail with labels and the group's pages beside it. Detail pages use tabs.
Signature motions: sample-paced scrolling traces, segmented fills, the pending flight into a compact
top-bar chip. Daily: fast, dense and calm for someone who checks often and knows what they are
looking at; the most "pro", and the one most at risk of reading as a generic monitoring dashboard.

### 14.2 Sky

*Your NAS, in plain sight.* Night-sky slate grounds with a soft light from above, raised cards with
large squircle corners, generous space, 15px body and a big plain-words headline. The dashboard
opens with a hero that answers in a sentence beside a health ring (one segment per area), then the
items that need you as cards with their next step, then storage as rings, live activity as soft
area charts, first steps, and the drive-bay picture. Navigation is one sidebar where only the
current group is open. Detail pages are a summary header and section cards with "On this page".
Pending changes are a dock at the foot of the window. Signature motions: cards settle in on a soft
spring, rings draw, the folder tile morphs from list to page. Daily: welcoming and pleasant; the one
a non-technical owner is most likely to open without being asked; the least dense.

### 14.3 Atlas

*The map of your storage.* An even, near-neutral ground; structure from type, rules and lines
rather than boxes; a 36 to 64px headline; big light-weight figures; numbered sections. The dashboard
opens with the headline answer and a band of live figures, then what needs you and what is waiting,
then the map: disks → file systems → shared folders → ways of sharing, which lights a lineage when
you point at or tab to any node. Navigation is the groups as tabs across the top with the group's
pages under them, so pages use the full width. Detail pages are a ledger: sticky numbered section
titles on the left, content on the right, including the share map from the disks to the people.
Signature motions: lines draw, lineage traces, pages slide in the direction of travel. Daily: the
one that best answers "what will break if I touch this?"; the most distinctive; its long typographic
pages risk the "document" criticism if the map is not kept near the top.

### 14.4 The decision

**The owner chose the mix on 2026-11-24** (journal, "The new look: the owner's four choices"), as
recommended: **Sky as the base, with Atlas's map as the diagram language and Instrument's dense
tables and readouts as the compact density.**

- **Sky** gives the plain-words health headline, problem cards with a next step, capacity rings, the
  drive-bay picture, the sidebar with collapsible groups, its grounds, light, raised cards, squircle
  corners and 15px body. Its values are sections 3 to 7 of this document and `design/tokens.css`.
- **Atlas's connection map** is the diagram language everywhere (section 9). Atlas's top tabs are
  not used.
- **Instrument** is the compact density (section 5): its padding, gaps, 13px body, dense table rows
  and monospaced readouts, on Sky's colours.
- **No sky-blue top bar** (section 3.2). **Pending changes** stay in a band under the top bar
  (section 10). **Live samples** are kept for the session, in memory only (section 8, journal).

Why: the people this is for are home and small-office owners who mostly open it to check that all
is well; Sky answers that in one sentence at the largest size, makes the next step a card with a
verb, and is the one most likely to be opened willingly, which is the owner's complaint about the
first interface. Its weakness, density, is answered by the compact setting and the technical
columns. Atlas's map is the single most useful drawing in the lab (dependencies before a delete, who
can reach a folder) and works inside Sky's cards.

## 15. The lab

- **Open it**: `cd web/apps/omv-web-app && pnpm dev:mock --port 5180`, then
  `http://localhost:5180/ui/lab`. The query string selects a view and never acts (UI-4):
  `?dir=instrument|sky|atlas&theme=dark|light&screen=dashboard|storage|folder&state=attention|healthy`,
  plus `density=compact` and `chrome=0` to hide the switcher.
- **The switcher** (bottom centre, not part of any direction): direction, theme, the NAS's state
  ("Needs attention" or "All OK"), and "Show loading" for the skeleton.
- **What works**: the three screens with page transitions; live sampled values; the palette and jump
  keys; density; toggles with the consequence preview, Save settle, pending flight, Apply and Undo;
  access changes in bulk; the disk table's selection, bulk action and technical columns; the
  arrangement's disk-failing preview; map tracing; the typed delete confirmation (it deletes
  nothing); disclosures; the mobile drawer.
- **What is stubbed**: other navigation items and first-step buttons show a toast; the live samples
  are simulated, with 60 seconds prefilled so a fresh tab looks like one open for a minute (the real
  page starts empty); error states and the UI-12 notice are not drawn.
- **Never shipped**: `main.tsx` loads the lab only when `import.meta.env.DEV` is true (or the build
  mode is `lab`) and the path is under `/ui/lab`, so a production build emits none of it; `index.css`
  excludes `src/lab` from Tailwind's sources; `tools/build-check` fails the bundle if `omv-lab` or
  `lx-labbar` appears.
- **Proved under the real headers**: `pnpm test:browser:lab` (in `web/`) builds the lab in the
  test-only `lab` mode into `dist-lab/` and serves it with the snippet's headers, Trusted Types
  enforced; every direction and theme is pointed at, driven by keyboard and left to update live, and
  any CSP or Trusted Types violation fails it.
- **Charts** are drawn with Recharts (`src/lab/charts.tsx`, what they show in `chartModel.ts`):
  the dashboard's last minute, the storage page's space and disk temperatures, and a Performance
  page (Diagnostics) with up to ten minutes of session samples. Every mark is painted by class; text
  takes `currentColor`.
- **CSP**: the lab follows the production rules. Styling is one stylesheet of classes; data-driven
  geometry is set as custom properties through the CSSOM (React's `style` prop, `setProperty`), which
  `style-src 'self'` allows; the pending flight's element is made with `createElement` and moved with
  the Web Animations API. Vite's development server injects stylesheets as style elements, as it
  does for the whole app; the production build links them.

## 16. The owner's answers (2026-11-24)

1. **Direction**: the recommended mix (section 14.4).
2. **The identity bar** goes; the sky blue stays as the brand accent (section 3.2).
3. **Live samples** are kept for the session, in this tab's memory only, at most the last 10
   minutes, cleared by signing out or closing the tab; the reads never keep the session alive
   (journal, "The new look: the owner's four choices").
4. **Pending changes** stay in a slim band under the top bar, not Sky's dock (section 10).
