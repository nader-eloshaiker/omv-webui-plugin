# Visual foundation

The look of the new interface, re-founded after the owner rejected the first one (journal,
2026-11-23, "The interface's look is re-founded"). It says what the interface should feel like, the
principles every screen follows, and the systems that carry them: colour, type, space, surfaces,
motion, data visualisation, illustration, navigation and page composition. It ends with three visual
directions that all satisfy it, live in the design lab, and a recommendation. **It is a proposal
until the owner chooses a direction**; then the chosen direction's values move into
`design/tokens.css` through the colour audit, and the component library is rewritten to it.

- The lab: `web/apps/omv-web-app/src/lab/`, at `/ui/lab` in `pnpm dev` and `pnpm dev:mock` only
  (section 15).
- Token values today: [`design/tokens.css`](../../design/tokens.css). Contrast numbers here come from
  `node tools/colour-audit.mjs measure`.

---

## 0. What this replaces and what survives

This document **supersedes** these parts of the [style guide](style-guide.md):

| Style guide | Was | Now |
| --- | --- | --- |
| 1 (feel), 1.1 last row (Material dropped for flat) | Calm, appliance-like, "no decoration that moves" | Section 1 and 2 here |
| 2.1 (colour budget, about 90% neutral by area) | Colour only as signal | Section 3: colour also expresses identity and depth, with rules that keep status honest |
| 3.10 last bullet (no gradients) | No gradients anywhere | Section 3.4: four kinds of gradient and light, each with a meaning |
| 3.8 "elevation is a lighter surface plus a hairline" | Flat | Section 6 |
| 4.1 scale table | 12 to 30px, 14px body | Section 4 |
| 4.2 card padding and gaps | Fixed | Section 5 (per direction, plus a density setting) |
| 4.3 "borders before shadows", three elevation levels | Flat | Section 6 |
| 4.5 (motion "never entertains", 120/180/260ms, live values without animation) | Minimal | Section 7 |
| 5.1 top bar on identity blue; 40-row side navigation | One long text list | Section 10 |
| Page composition as practised by every slice (stacked prose sections) | Document-like | Section 11 and 12 |

These **survive unchanged** and are normative here too:

- **Status semantics** (style guide 2 jobs 2 and 3, 3.4 to 3.6, 5.5): the fixed words OK, Warning,
  Critical, Unknown, Disabled, Stopped; a word or a distinct shape with every status colour; Unknown
  as a hollow ring; a roll-up shows the worst child; yellow means saved-but-not-applied and nothing
  else; warning is OMV's orange; destructive is a form, not a status; no blue "info" severity.
- **The audited colour values** of status fills, labels and strokes, pending yellow and its ink,
  action and identity blues (tokens.css), and the fill/label/stroke split (3.5).
- **Contrast and colour-vision rules** (3.11, 6): WCAG 2.2 AA as the bar, APCA advisory, measured
  on real grounds, CVD-checked.
- **Accessibility** (6), **focus** (4.6), **forms and validation** (5.3), **destructive
  confirmation** (5.4), **tasks and output** (5.7), **the pending loop** (5.8, its behaviour; its
  placement is now per direction), **empty states** (5.9), **toasts** (5.10).
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

Dark is the first theme. Each direction has five grounds stepping up in lightness, all in the slate
family (OKLCH hue 240 to 250) with chroma at or under 0.03, so greys and blues belong together:

| Role | Job | Instrument | Sky | Atlas |
| --- | --- | --- | --- | --- |
| `bg` | The page | `#0b0e11` | `#0a111c` | `#0f1113` |
| `s1` | Cards, panels | `#12161a` | `#111a27` | `#15181b` |
| `s2` | Insets, table heads, raised rows | `#171c21` | `#16212f` | `#1a1e22` |
| `s3` | Hover, tracks, chips | `#1f252b` | `#1d2939` | `#22272c` |
| `line` | Dividers (decorative) | `#252c33` | `#233042` | `#2a2f35` |
| `line-2` | Control edges (3:1) | `#7a8691` | `#7d8b9b` | `#7c868f` |

Sky's grounds lean toward blue (a night sky), Atlas's are almost neutral, Instrument's sit between.
Light is re-derived, not inverted (lab.css has every value): a cool page, white cards, and the
audited light labels from tokens.css.

**Text tiers** (dark, on the hardest ground for each):

| Tier | Use | Instrument | Sky | Atlas |
| --- | --- | --- | --- | --- |
| `ink` | Body, titles, figures | 15.03:1 on `s1` | 15.23:1 on `s1` | 15.32:1 on `s1` |
| `ink-2` | Secondary text | 7.61:1 on `s2` | 8.47:1 on `s1` | 8.53:1 on `bg` |
| `ink-3` | Captions, metadata | 4.81:1 on `s3` | 4.68:1 on `s3` | 4.58:1 on `s3` |

`ink-3` was raised during the lab's review: the first values gave 4.02 to 4.46:1 in five places and
captions are read. Light `ink-3` is 5.22 to 5.77:1. Dark `ink-3` sits at APCA Lc 38 to 42, so it is
for 12px-and-up captions at medium weight and never for running text.

### 3.2 How the brand is expressed

OMV's sky blue `#5dacdf` stays the identity, and now does more:

- **As light.** An ambient glow from above the page (Sky), a power light on the drive-bay picture,
  the focus ring, the live dot.
- **As the trace of live data.** Single-series live charts (processor, memory, network, temperature)
  draw in the brand blue: they are "how much", which the old guide already gave to the usage ramp.
- **As the path.** On maps, the lineage you are tracing lights in brand blue.
- **As action**, as before: the action blue in light (`#1272ab`, labels `#095a8a`), the sky blue
  itself in dark with navy ink.

The identity bar is gone: no direction paints the top bar sky blue. Identity comes from the mark,
the light and the blue that runs through live data. (The light-theme top bar's contrast problem in
style guide 3.3 disappears with it.)

### 3.3 Status stays honest

Status hues (OK green, Warning orange, Critical red, Unknown grey) and pending yellow are used only
for what they mean, always with a word or shape: a pill, a shaped mark, a slot light with the word
beside it, a node with its mark. Two kinds of status area are new and allowed: a **status-tinted
wash** behind the one element that carries a non-OK state (the health strip's lead cell, a warning
callout, a warning node on a map) at 7 to 14% over a known ground, and **status-coloured lines** on a
map leading to a node in that state. Both always travel with the node's mark and word. A risk
statement that is not a monitored state (for example "a stripe loses everything") uses a neutral
glyph, never a status hue.

### 3.4 Gradients, tints and light: four kinds, each with a meaning

| Kind | Where | Means | Rule |
| --- | --- | --- | --- |
| Ambient light | Behind the top of the page (Sky), at most 0.28 alpha, brand hues only | Identity | Nothing is read against it that would fail at its darkest or lightest point; never a status hue |
| Area fill under a live line | Sparklines, from 0.32 alpha to 0 | The area of the quantity | Series colour only |
| Material light | The chassis of the drive-bay picture, top-lit, 1 step | That the picture is an object | Grounds only |
| Status wash | One element per non-OK state | The state, with its word | Over a known ground; the label clears 4.5:1 on it |

Not allowed: multi-hue decorative gradients, gradient text, gradient borders, glow around text,
glass blur over content. One exception to blur: Sky's sticky top bar blurs the page scrolling under
it, so the bar stays legible over any content.

### 3.5 The audit

When a direction is chosen, every new pair (each ground with each text tier and each label, the
status washes, the map lines) goes into `PAIRS` in `tools/colour-audit.mjs` before it reaches
`tokens.css`, per style guide 8. The lab's values were checked with `measure`; they are not yet in
the audited set.

## 4. Type

Inter (bundled) for everything; Roboto Mono (bundled) for device names, paths, addresses and, in
Instrument only, live readouts. The lab loads Inter's optical-size build (`opsz.css`, already in the
packaged `@fontsource-variable/inter`, no new dependency), so large figures and headlines get
Inter Display's tighter forms automatically.

| Step | Size | Weight | Use |
| --- | --- | --- | --- |
| Display | 36 to 64px fluid (`clamp`) | 650 to 700, tracking -0.03 to -0.045em | The one headline answer on a top page (Sky hero, Atlas) |
| Figure | 26 to 44px | 300 (Atlas), 600 | Live values and capacity figures |
| Page title | 20 to 36px by direction | 650 | One per page |
| Section | 17 to 18px | 650 | Card and section titles |
| Body | 13 / 15 / 14px (Instrument / Sky / Atlas) | 400 to 550 | Everything read |
| Caption | 12 to 13px | 500 to 650 | Metadata, units, overlines (Instrument uppercases 12px card titles) |

Rules kept: tabular numerals for every number; units at a smaller size beside the figure; sentence
case; nothing under 12px; text survives 200% zoom and a 40% longer translation. Each direction sets
OpenType features: Instrument slashed zero, Sky the single-storey a (`cv11`), Atlas open digits
(`ss01`).

## 5. Space, grid and density

- A 4px base. A 12-column page grid with a maximum width of 1440px; cards span 3 to 12 columns at
  1280px and above, 6 or 12 under 1024px, 12 under 640px.
- Gutter 16px at 390px and narrower, up to 40px wide.
- Card padding and grid gap per direction: Instrument 16 and 12, Sky 24 and 20, Atlas 20 and 16.
- **Density is a setting, not a direction.** A compact switch in the top bar (and in the command
  palette) tightens table rows, card padding, gaps and list rows. It is a stored preference (UI-13
  allows it).

## 6. Surfaces and elevation

Three levels, by meaning:

1. **Ground**: the page, ambient light only.
2. **Surface**: cards, panels, tables. Dark: one step lighter than the ground, a 1px inner top
   highlight (light from above), and either a hairline (Instrument, Atlas) or a soft long shadow
   (Sky). Light: white with a 1px edge (Instrument, Atlas) or a layered soft shadow (Sky).
3. **Floating**: dialogs, the palette, drawers, toasts, the Sky pending dock. A stronger shadow over
   a scrim (dark 0.62, light 0.42 alpha).

Radius: Instrument 8 / 6, Atlas 10 / 8, Sky 20 / 12 (30 / 16 as squircles where supported). Pills,
dots, meters and rings stay round.

## 7. Motion

### 7.1 Tokens

| Token | Value | For |
| --- | --- | --- |
| `--d-1` | 90ms | Pressed |
| `--d-2` | 160ms | Hover, focus, small changes of state |
| `--d-3` | 240ms | Toggles, menus, exits |
| `--d-4` | 360ms | Entrances, page change, disclosure height |
| `--d-5` | 640ms | Meters, rings and number glides |
| `--e-std` | `cubic-bezier(0.2, 0, 0, 1)` | Everything by default |
| `--e-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Things arriving: decelerate hard |
| `--e-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Things leaving: accelerate away |
| `--e-settle` | a spring as CSS `linear()`, 8% overshoot | Things that land: a switch thumb, a pending chip, a toast |
| `--e-soft` | a spring as CSS `linear()`, 1.5% overshoot | Height changes: bars, disclosures, sections |
| `--stagger` | 22 / 45 / 32ms per item | List entrance, capped at about 10 items |

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
| **Disclosure** | That more is there, and its size | Native `::details-content` with `interpolate-size`; the chevron turns on the settle spring | Opens at once |
| **Trace** | What depends on this | Pointing at or focusing a map node lights its whole lineage and dims the rest | Same, no transition |
| **Map draw** | That lines are connections | Lines draw along their length on entrance | Drawn |
| **Arrival** | Where to look after a jump | Following "View disk sdb" scrolls to that disk and rings it twice | Ring without movement |
| **Skeleton** | That this is loading, with its final shape | The real layout with its content hidden, bars breathing in opacity at 1.4s | Static bars with the words |
| **Disk failing preview** | What a layout survives | One disk greys and is crossed through; lost blocks go dashed red only where data is lost | Same, no transition |
| **Copy direction** | Which way files go | A dash travels from source to destination twice on arrival, not in a loop (the job is not running) | Static arrow |

The only loops allowed are the spinner and the skeleton, while work or loading is really happening.

### 7.3 Reduced motion

Under `prefers-reduced-motion: reduce` every duration token is 0, every animation runs in 1ms to its
end state (so nothing is left invisible; checked in the lab: no element below full opacity after
400ms on three screens), view transitions are cut, the pending flight does not run, and JavaScript
motion checks the same query. Meaning never depends on motion: every motion's end state says the same
thing in words.

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
- **Per direction**: Instrument, an icon rail with labels and the chosen group's pages beside it;
  Sky, one sidebar where only the current group is open and the others fold; Atlas, the groups as
  tabs across the top with the group's pages as a second row and a sliding indicator.
- **Under 1024px** every direction folds into a drawer.
- **The top bar** carries the product mark and host, "Go to or do…" (the palette, `/`), the density
  switch, the pending indicator (a count chip that turns yellow) and the account.
- **The pending changes** keep their behaviour (style guide 5.8) and their yellow. Instrument and
  Atlas put the band under the top bar; Sky makes it a dock that rides the foot of the window,
  sticky, so it never covers the end of the page.
- The UI-12 notice keeps its place under the top bar in all three (not drawn in the lab).

## 11. Page archetypes

- **Dashboard**: the answer (worst state in words, largest type), then what needs you with a next
  step each, then pending changes, then capacity, disks and live activity, then first steps for a new
  owner, then the rest. Every summary links to its page.
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

### 14.4 Recommendation

**Sky as the base, with Atlas's map as the diagram language and Instrument's dense table and
readouts behind the density switch.**

Why: the people this is for are home and small-office owners who mostly open it to check that all
is well; Sky answers that in one sentence at the largest size, makes the next step a card with a
verb, and is the one most likely to be opened willingly, which is the owner's complaint about the
current interface. It is also the clearest break from "reads like a document". Its weakness, density,
is answered by the same density switch and technical columns all three share. Atlas's map is the
single most useful drawing in the lab (dependencies before a delete, who can reach a folder) and
works inside Sky's cards (the lab already draws Sky's share map that way). Instrument's segmented
meters and mono readouts are a good compact mode, not a separate look.

If the owner prefers one direction unmixed, Atlas is the stronger second choice for distinctiveness;
Instrument suits a technical audience best but is the easiest to mistake for a generic dashboard.

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

## 16. Open questions for the owner

1. Which direction, or the recommended mix.
2. Whether the identity bar may go (section 3.2): no direction paints the top bar sky blue.
3. Whether live samples may be kept for the session across pages (section 8), so charts are not
   empty after every navigation.
4. Whether Sky's dock placement for pending changes is acceptable in place of the band under the top
   bar (style guide 5.1 asked for the band).
