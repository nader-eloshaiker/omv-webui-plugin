# Style guide

The visual language of the new openmediavault web UI: what it should feel like, what colour is
allowed to say, and the rules a component must follow. It is written for whoever implements the UI
(a person or an agent) and for whoever reviews it.

- Token values: [`design/tokens.css`](../../design/tokens.css) (the only place a colour, size or
  duration is declared).
- Specimen sheet: [`design/preview.html`](../../design/preview.html) (open it in a browser; no
  build, no network).
- Colour audit: [`tools/colour-audit.mjs`](../../tools/colour-audit.mjs). Every contrast and
  distance number in this document is that script's output. When a token changes, rerun it and
  update the numbers quoted here in the same change.

**This is an unofficial community plugin.** It must not present itself as the official
openmediavault interface. It does not use the openmediavault logo artwork (upstream's trademark);
the product name appears as plain text, and the About screen says the UI is a community plugin and
links to upstream.

**Stack assumption:** React, Tailwind CSS v4, shadcn-style components (Radix primitives), and
lucide icons, organised the way the reference application is: a token stylesheet package, a
component package, and the app. Tailwind reads the `@theme` block for utilities; the semantic
`--theme-*` roles are exposed to it with `@theme inline` in the app stylesheet.

---

## 1. What this product should feel like

A NAS console is opened to check that things are fine, to change one setting, or because something
broke. The first two should be quick and quiet. The third must be unmistakable.

1. **Calm.** Almost everything on screen is neutral. Colour appears where the reader can act or
   where the system has something to report, and nowhere else.
2. **Dense but legible.** Disks, shares, users and services are tabular data. The default text is
   14px with compact rows; density comes from tight spacing on a regular scale, never from small or
   low-contrast text.
3. **Appliance-like.** It behaves like the front panel of a piece of equipment: stable layout,
   predictable controls, plain words, no marketing surfaces, no decoration that moves.
4. **Honest about state.** Every status is a word plus a mark. "Unknown" is its own state and is
   never drawn as "fine". A change that has been saved but not applied is always visible.
5. **Careful with destruction.** Wiping a disk and deleting a share look and behave differently
   from saving a form, and colour is never the only difference.

### 1.1 The essence of OMV: what is kept and what changes

| OMV trait | Decision | Why |
| --- | --- | --- |
| Sky "corporate" blue `#5dacdf` | **Kept, exactly**, as the identity colour: the top bar in light, and the action colour in dark | It is the most recognisable thing about OMV. It cannot be the light-theme action colour: see 3.3 |
| White text on the blue bar | **Changed** to deep-navy ink | White on `#5dacdf` is 2.49:1 |
| Slate-gray neutrals | **Kept as a family**, rebuilt as one ramp at one hue with lower chroma | Stock slate is already cool and near the brand hue; the ramp is made even so steps read as greys |
| Yellow `#f8d400` with coffee ink `#4d2e25` | **Kept, exactly**, with exactly one job: pending configuration changes | It is OMV's signature banner. In stock OMV the same yellow is also "accent" and "warning": one hue, three jobs |
| Dark orange `#f78f00` | **Kept, exactly**, as the warning fill | It frees yellow from the warning job |
| Green / red status | **Kept as hues**, retuned, and split into fill, stroke and label | The stock fills are used as words and fail (3.6) |
| Inter and Roboto Mono | **Kept** | Already the OMV faces; Inter has tabular numerals |
| Green-on-black terminal | **Kept as an idea**: a dark output ground with a faint green tint to the text | Neon `#33ff33` glares, and saturated green means "OK" here |
| Material look (ripples, floating buttons, elevation everywhere) | **Dropped** | Flat surfaces, hairline borders, and restrained motion suit an appliance |

---

## 2. Colour is a signal channel

Colour in this console may say five things, and only five:

1. **Where you can act**: the primary action, the focused control, the selected item, a link.
2. **The state of a thing the system monitors**: a disk, a file system, a service, a task. OK,
   Warning, Critical, or Unknown/Disabled.
3. **That configuration is pending**: changes are saved but not yet applied.
4. **Which series is which** in a chart.
5. **Identity**: this is the openmediavault console.

Everything else is neutral: structure, text, borders, surfaces. The test for any colour is to
remove it and ask whether information was lost. If not, it was decoration, and decoration may not
borrow a hue that one of the five jobs owns.

**A status colour is a claim.** A red mark says "act now" whatever the words beside it say. Red is
reserved for a monitored thing in a failed or failing state (a degraded array, a failed SMART
test, a service that should be running and is not). A destructive button is red by form, not by
status (3.6). A validation error is not a system status: see 5.3.

### 2.1 The colour budget

Dense product interfaces run at roughly 90% neutral by area, because a signal only reads when
nothing around it is shouting. Each hue has one job.

| Hue | Its one job | Never |
| --- | --- | --- |
| **Slate neutrals** | Every surface, border, divider and word that is not a signal | A second neutral temperature; a warm grey; an off-hue step |
| **Action blue** (`action`, `action-label`, `focus-ring`) | The primary button, links, the focus ring, checked and selected states | A status; a chart series; an "info" severity; decoration |
| **Identity sky blue** (`identity`) | The top bar, and the sign-in screen's brand panel | A button or anything that looks pressable in light theme; a status; a card or table ground |
| **Pending yellow** (`pending`) | Configuration saved but not applied: the banner, and a mark on the item that is pending | Warning; "accent"; highlight; a hover; a badge count; anything decorative |
| **OK green** | A monitored thing is healthy | "Success" confetti; a positive button; decoration; a chart series |
| **Warning orange** | A monitored thing needs attention soon (a threshold crossed, a degraded-but-working state) | Emphasis; a hover; a "new" badge; pending changes |
| **Critical red** | A monitored thing has failed or is failing | Emphasis; decoration; a gradient; a chart series |
| **Destructive red** (`destructive`) | The confirm button of an irreversible action | A status mark; a cancel button; a link |
| **Unknown grey** (`unknown`) | No reading, not monitored, disabled, stopped on purpose | "Fine"; plain secondary text |
| **Chart categorical** (`series-1..4`: violet, teal, pink, olive) | Telling series apart | Blue, yellow, green, orange, red; a fifth generated hue |
| **Usage ramp** (action blue by lightness) | How full something is, on a meter or a sequential chart | A status; thresholds are the status hues with words (5.6) |
| **Terminal pair** | Task and log output | Any other surface |

Checks that follow from the table:

- **One interaction hue.** Blue means "you can act here". A control that acts in place hovers with
  a neutral step (`muted`); selected is a blue tint; focus is the blue ring.
- **One filled primary button per view or dialog.** If two things are filled blue, one of them is
  not primary.
- **Count the hues on a screen.** Neutrals, blue, the status hues actually present, and chart
  series. Any other hue must name its job from the table.
- **There is no "info" colour.** Informational messages are neutral with an icon. Blue is taken.

---

## 3. The colour system

### 3.1 Three tiers

1. **Primitives**: the static scales in `@theme` (`--color-brand-*`, `--color-slate-*`,
   `--color-status-*`, `--color-pending`).
2. **Semantic roles**: `--theme-*`, declared on `:root` and redefined under `.dark`.
3. **Component vocabulary**: the shadcn names, mapped onto the semantic tier in the app stylesheet.

Components read tier 2 or 3. A component never uses a primitive, a raw Tailwind palette class
(`bg-blue-500`), or a literal colour.

### 3.2 Mapping the shadcn vocabulary

| shadcn name | Maps to | Note |
| --- | --- | --- |
| `background` / `foreground` | `page` / `foreground` | |
| `card`, `popover` (+ `-foreground`) | `surface` / `foreground` | |
| `primary` / `primary-foreground` | `action` / `action-foreground` | |
| `secondary` / `secondary-foreground` | `muted` / `foreground` | A neutral button. There is no chromatic secondary |
| `muted` / `muted-foreground` | `muted` / `muted-foreground` | |
| `accent` / `accent-foreground` | `muted` / `foreground` | In shadcn, `accent` is the *hover ground* of a menu item, not a hue. It is neutral here. Mapping it to yellow would paint every menu hover as "pending" |
| `destructive` / `destructive-foreground` | `destructive` / `destructive-foreground` | |
| `border` | `border` | Dividers |
| `input` | `border-control` | The edge of a control must clear 3:1 |
| `ring` | `focus-ring` | |

### 3.3 Decision: the sky blue is identity; a deeper blue of the same hue acts

Measured on the stock palette (`node tools/colour-audit.mjs legacy`):

| Stock pair | Ratio | Bar | Result |
| --- | --- | --- | --- |
| White text on corporate blue `#5dacdf` (top bar, primary button) | 2.49:1 | 4.5:1 | Fails; also fails the 3:1 large-text bar |
| Corporate blue as a link or word on white | 2.49:1 | 4.5:1 | Fails |
| Corporate blue as a word on the app background `#eef0f2` | 2.18:1 | 4.5:1 | Fails |
| "Corporate darker" `#1b7bba` as a word on white | 4.58:1 | 4.5:1 | Passes on pure white only |
| "Corporate darker" as a word on the app background | 4.01:1 | 4.5:1 | Fails |

A blue this light cannot carry white text or be read as text on a light ground; no adjustment of
the surrounding greys fixes that. So the hue is split by job, staying at one OKLCH hue (about 240):

- **`identity` = `#5dacdf`, unchanged**, with deep-navy ink `#021d30` on it: 6.91:1. The top bar
  stays OMV's sky blue; its words and icons turn dark.
- **`action` = `#1272ab`** (brand-600) for the light-theme primary button, checked controls and the
  focus ring: white on it is 5.22:1, and it clears 3:1 as an edge on every ground (4.19 to 5.22:1).
- **`action-label` = `#095a8a`** (brand-700) for links and blue words: 5.94 to 7.39:1 on the three
  grounds, 6.45:1 on the selected-row tint.
- **In dark, `#5dacdf` is the action colour itself**, with the navy ink on it (6.91:1), and
  `#87c6f2` is the link colour (8.00 to 9.89:1). The dark theme is where OMV's blue does the most
  work.
- **In dark, the top bar takes the container blue `#074469`** with near-white ink (9.48:1). A
  full-width sky-blue bar on a dark page would be the brightest thing on screen and would glow; a
  large brand fill is a container, not a button colour.

### 3.4 Decision: yellow means "pending", and only that

In stock OMV, `$omv-color-accent`, `$omv-color-warning` and the pending-changes banner are all
`#f8d400`: OKLab distance 0.0 between "accent" and "warning". A yellow chip could mean "selected",
"careful" or "not applied yet".

- **Yellow keeps one job: configuration that is saved but not applied.** This is OMV's most
  distinctive piece of interface and the reason to keep the hue at all. `pending` is `#f8d400` with
  the stock coffee ink `#4d2e25`: 8.31:1.
- **Warning moves to OMV's own dark orange `#f78f00`.**
- **There is no accent colour.** shadcn's `accent` is neutral (3.2).

Is orange far enough from yellow, and from red? From `node tools/colour-audit.mjs distinct` (OKLab
distance x100; about 2 is one just-noticeable difference, and under 10 a pair needs its word or
icon):

| Pair | Normal | Deuteranopia | Protanopia | Greyscale lightness gap |
| --- | --- | --- | --- | --- |
| pending / warning | 16.6 | 12.8 | 17.3 | 12.9 |
| pending / critical | 39.4 | 32.5 | 43.1 | 32.5 |
| pending / ok | 15.8 | 11.6 | **8.3** | 3.5 |
| warning / critical | 23.0 | 19.7 | 25.8 | 19.6 |
| ok / warning | 24.9 | 11.9 | 19.7 | 9.4 |
| ok / critical | 43.6 | 27.7 | 44.1 | 29.0 |
| ok / unknown | 16.7 | **9.5** | 13.1 | 3.9 |
| warning / unknown | 19.4 | 17.6 | 19.6 | 5.5 |
| critical / unknown | 33.5 | 26.3 | 37.8 | 25.1 |

The suggestion holds: yellow and orange stay apart under both simulated deficiencies, mostly on
lightness (yellow is the lightest chromatic colour in the system). Two pairs fall under 10 and are
carried by form instead: **pending / ok** under protanopia (pending is a banner or a labelled chip
with its own icon, never a bare dot beside status dots), and **ok / unknown** under deuteranopia
(the reason the Unknown mark is a hollow ring and OK is a filled disc: 5.5).

The status fills were chosen for this table, not for looks. With the stock green `#4cd964` and red
`#ff3b30` the green / red distance under deuteranopia is 11.7; a mid-lightness green tested during
tuning took it as low as 5.6. Keeping OK light and Critical dark (OKLCH lightness 0.84 against
0.55) is what gives 27.7, so the two states that matter most differ in lightness as well as hue.

### 3.5 Fill, foreground, label, stroke

Every chromatic family has members with different jobs, and each job has its own contrast bar.

| Member | Job | Bar | Example |
| --- | --- | --- | --- |
| fill (`x`) | Dots, meter segments, pill washes, solid buttons | 3:1 only if it carries meaning alone; status fills never do (they are ringed by the stroke) | `bg-ok`, `bg-action` |
| `x-foreground` | Words on the solid fill | 4.5:1 against the fill | `text-action-foreground` |
| `x-label` | Words in that hue on a ground or on the family's tint | 4.5:1 on every ground it lands on | `text-warning-label` |
| `x-stroke` | Outlines, rings and small icons | 3:1 on every ground | `text-critical-stroke` |
| `x/14` tint | A wash behind a label | The label must clear 4.5:1 on the wash | `bg-warning/14` |

**Fills draw; labels are read.** The stock UI's commonest colour defect is a fill used as a word:

| Stock usage | Ratio |
| --- | --- |
| Status green `#4cd964` as a word on white | 1.84:1 |
| Warning yellow `#f8d400` as a word on white | 1.46:1 |
| Dark orange `#f78f00` as a word on white | 2.36:1 |
| Status red `#ff3b30` as a word on white | 3.55:1 |
| White text on the red fill | 3.55:1 |
| White text on the orange fill | 2.36:1 |

The new fills are no better as words (OK green on white is 1.55:1), and are not meant to be. A word
takes the `-label` member:

| Label | Light: page / surface / muted | Light: on its own 14% wash | Dark: page / surface / muted | Dark: on its own 14% wash |
| --- | --- | --- | --- | --- |
| `ok-label` | 6.93 / 7.65 / 6.14 | 7.17 | 11.09 / 10.12 / 8.97 | 7.28 |
| `warning-label` | 6.41 / 7.08 / 5.69 | 6.28 | 10.18 / 9.29 / 8.23 | 7.39 |
| `critical-label` | 6.78 / 7.48 / 6.01 | 5.94 | 8.68 / 7.92 / 7.02 | 7.39 |
| `unknown-label` | 6.50 / 7.17 / 5.76 | 6.63 | 9.46 / 8.64 / 7.65 | 6.42 |
| `pending-label` | 6.77 / 7.47 / 6.00 | 7.04 | 12.73 / 11.62 / 10.29 | 8.34 |

Status **fills are identical in both themes** so a state reads as the same state everywhere; the
labels and strokes flip.

### 3.6 Status and destructive actions

- **Never colour alone** (WCAG 1.4.1). Every status colour travels with its word, or with an icon
  whose shape differs per status. See 5.5 for the anatomy.
- **Same meaning, same treatment.** One pill, one dot and one icon per status, on every surface.
- **Destructive is a form, not a status.** `destructive` (`#b7191c` with white, 6.63:1; in dark
  `#f66d67` with near-black ink, 6.48:1) is used only on the confirm button of an irreversible
  action, with a verb ("Wipe disk"). Critical is a pill or a ring with a status word. The two never
  share a shape.
- **Blue is not a severity.** There is no blue "info" tier between OK and Warning.

### 3.7 Neutrals

- **One hue, low chroma.** The slate ramp sits at OKLCH hue 237 to 248 (median 245, no step more
  than 7.7 degrees off) with chroma 0.003 to 0.024. Stock OMV slate is the same temperature at
  chroma 0.03; it is kept cool and tinted toward the brand so greys and blues belong together.
- **Three text tiers** that read as tiers: `foreground` (15.08 / 16.65 / 13.37:1 on page / surface
  / muted in light), `muted-foreground` (6.50 / 7.17 / 5.76:1), and `subtle-foreground` for
  placeholders and disabled text (3.15 to 3.93:1; exempt from 1.4.3 and never used for anything a
  reader needs).
- **Two borders.** `border` is a decorative divider (1.19 to 1.48:1, intentionally quiet).
  `border-control` marks something you can operate and clears 3:1 on every ground (3.68 to 4.58:1
  light, 3.75 to 4.64:1 dark).
- **No pure black and no pure white for text.** White is the light card surface only.

### 3.8 Dark theme: re-derived, not inverted

- Every semantic token has its own dark value; nothing is produced by inverting or by a Material
  dark-palette function.
- Chromatic words and marks go **lighter and less saturated**; the grounds are graphite with the
  same faint slate tint as light (chroma 0.012 to 0.017).
- **Elevation is a lighter surface plus a hairline**, not a shadow: `page` < `surface` < `muted`.
- A large brand fill is a container (3.3).
- WCAG 2 flatters dark pairs, so read the APCA column too. The dark pairs the audit lists as
  advisory are all labels or button text, not body copy: `critical-label` (Lc 58 to 61),
  `unknown-label` on its wash (Lc 59), `action-foreground` on `action` (Lc 53) and
  `destructive-foreground` (Lc 48). Set them at medium weight (500) or above; do not use them for
  running text.
- The same status must look like the same status in both themes.

### 3.9 Charts

- **Categorical: at most four series** (`series-1..4`). A fifth folds into "Other" or the chart
  becomes small multiples. The palette avoids blue (action), yellow (pending) and the three status
  hues, so a line can never be mistaken for an alarm.
- Each series clears 3:1 against the plot ground: 3.34 to 8.07:1 light, 4.13 to 13.14:1 dark.
- **Series are staggered in lightness** so they survive colour-vision deficiency, but not every
  pair is safe on colour alone: in light, teal / pink falls to 8.1 under protanopia, and
  violet / teal and teal / olive are within 3.0 and 1.8 of each other in greyscale. So **label
  lines directly** and give each series its own dash pattern or marker shape. The legend is never
  the only link.
- **Sequential (how full, how much): one hue by lightness**, the action blue. Darker is more in
  light; lighter is more in dark.
- **Grey for context, colour for the series being discussed.**
- **Thresholds are status, with words.** A capacity meter is blue; when it crosses a threshold the
  admin configured, the *label* gains a Warning or Critical pill. The bar may take the status fill
  only together with that pill.
- Chart text uses the text tokens, never a series colour.

### 3.10 Tints, alpha and gradients

- `x/NN` is alpha over whatever is below. It is safe on one known ground (a pill on a card) and
  unpredictable over variable ones. The audited washes are 14% status and pending tints on
  `surface` and `page`, and the 10% action tint for a selected row on `surface`. Any other
  combination must be added to the audit before it ships.
- **State layers** (hover, pressed) use the neutral `muted` step. Pick tonal step or overlay per
  component and do not mix them.
- **No gradients.** Not on the bar, not on cards, not on meters. A gradient carries no information
  here and the identity does not need one.

### 3.11 Contrast and colour-vision deficiency

- **WCAG 2.2 AA is the bar**: 4.5:1 for text; 3:1 for large text (24px, or 18.66px bold), for
  icons and marks needed to understand content, for the edge of a control (1.4.11), and for the
  focus indicator (2.4.11).
- **APCA is advisory**: body text wants Lc 75, secondary text Lc 60, large or bold text Lc 45.
- **Measure on real grounds**: `page`, `surface`, `muted`, and the tint a label sits on. A value
  tuned on white fails on the page grey.
- About 8% of men have a red-green deficiency. The design does not depend on telling green from
  red by hue: lightness separates them, and words and shapes carry every status.

Current audit result: **160 required pairs, 0 failures**, both themes. Ten text pairs pass 4.5:1
but sit under Lc 60 (the top-bar ink at Lc 53, the terminal timestamps at Lc 46 to 47, and the dark
pairs listed in 3.8); all are labels, bar text or deliberately quiet metadata.

---

## 4. Type, space and form

### 4.1 Typography

- **Inter** for the interface, **Roboto Mono** for anything a user might copy or compare character
  by character: device paths (`/dev/sda1`), UUIDs, mount points, IP addresses, SSH keys, log and
  task output. Fonts are bundled with the app; no font is fetched from a third party.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) for sizes, counts, percentages,
  temperatures and timestamps, so columns align and live values do not jitter.
- Scale (the console default is 14px, not 16px):

| Token | Size | Use |
| --- | --- | --- |
| `text-xs` | 12px | Captions, table metadata, pill text |
| `text-sm` | 13px | Dense table cells, form hints |
| `text-base` | 14px | Body, form labels, buttons |
| `text-lg` | 16px | Section and card titles (semibold) |
| `text-xl` | 20px | Page title (semibold) |
| `text-2xl` | 24px | Dashboard figures |
| `text-3xl` | 30px | The one headline figure on a tile |

- Weights: 400 body, 500 labels and buttons, 600 titles. No lighter weights, no italics for
  emphasis, no all-caps except short table-header labels at 12px with letter spacing.
- Line height 1.5 for prose and 1.25 for titles and figures. Prose lines stay under about 75
  characters.
- Sizes are in `rem`; the layout must survive 200% zoom and a user font-size change.
- **Units are stated and consistent**: binary sizes (GiB, TiB) with the unit always shown, one
  decimal place, a non-breaking space before the unit.

### 4.2 Space and density

A 4px base (`--spacing`). Use the steps 4, 8, 12, 16, 24, 32, 48; nothing off the scale.

| Context | Value |
| --- | --- |
| Control height | 32px default, 28px in table toolbars, 40px on the sign-in form |
| Table row height | 36px default; 44px when the row is the main touch target on a narrow screen |
| Card padding | 16px |
| Gap between cards and sections | 16px within a group, 24px between groups |
| Form field vertical rhythm | 16px between fields, 4px between label and control, 4px between control and hint |
| Page gutter | 24px (16px under 640px wide) |

### 4.3 Radius, borders and elevation

- Radius: 6px for controls, 8px for cards and dialogs, full for pills, dots and meters. One radius
  per kind of thing.
- **Borders before shadows.** A card is a `surface` with a 1px `border`. Shadows are for things
  that float above the page (menus, popovers, dialogs, toasts) and nothing else.
- Three elevation levels only: flat, raised (menus and popovers, `shadow-md`), and modal
  (`shadow-lg` over a scrim).

### 4.4 Icons

- **lucide**, 16px beside text and 20px standalone, stroke width 2, `currentColor`.
- An icon-only button has an accessible name and a tooltip.
- Status icons differ by **shape**, not only colour: check-in-circle (OK), triangle with
  exclamation mark (Warning), octagon with cross (Critical), dashed or hollow circle (Unknown),
  clock-with-arrow or similar (Pending).
- No emoji as icons, no multicolour icons, no icon used as decoration beside a title.

### 4.5 Motion

- Motion explains a change of state; it never entertains. Durations are 120ms (hover, focus),
  180ms (menus, toasts) and 260ms (dialogs), with one ease-out curve.
- No looping animation except a progress indicator for work in progress.
- Live values (temperatures, throughput) update in place without animation.
- Under `prefers-reduced-motion: reduce` every duration is zero (the tokens do this) and
  indeterminate progress is shown as a static label ("Working...") with a non-moving indicator.

### 4.6 Focus

- Every interactive element shows a **2px `focus-ring` outline with a 2px offset** on
  `:focus-visible`. It clears 3:1 against all three grounds (4.19 to 5.22:1 light, 8.00 to 9.89:1
  dark). On the top bar the ring is `focus-ring-on-identity` (6.91:1 light, 9.48:1 dark).
- The ring is never removed, never replaced by a colour change alone, and never clipped by an
  `overflow: hidden` parent.
- Focus order follows reading order. Opening a dialog moves focus into it; closing returns focus to
  the control that opened it.

---

## 5. Components

Principles, not specifications. A component that needs something this section does not cover gets
the rule written here first.

### 5.1 App shell and navigation

- **Top bar** on `identity`: the product name as text, the host name, the pending-changes
  indicator, notifications, and the user menu. Nothing on the bar looks like a filled button.
- **Side navigation** on `page`, grouped as OMV groups it (System, Network, Storage, Services,
  Users, Diagnostics) so existing users find things. The current item has the blue tint and
  `action-label` text plus a non-colour cue (a bar on the leading edge and medium weight).
- Under 1024px wide the side navigation collapses to a drawer.
- One page title per page, in the content area. Breadcrumbs only below the second level.
- The address bar always reflects where you are, but a URL only ever *selects a view*. See 7.

### 5.2 Data tables

- The default presentation for disks, file systems, shares, users and jobs.
- Header on `muted`, 12px medium, sortable columns marked with an arrow that states the direction
  to assistive technology (`aria-sort`).
- Rows on `surface`, separated by `border`. No zebra striping (it fights the selected and hovered
  states).
- **Hover** is `muted`. **Selected** is the 10% action tint plus a checked checkbox. A row is never
  selected by colour alone.
- Numbers right-aligned with tabular numerals; identifiers in mono; status as a pill in its own
  column.
- Actions that apply to a selection live in a toolbar above the table and are disabled, with a
  reason in the tooltip, when they do not apply. Destructive actions sit apart from the rest.
- Loading shows skeleton rows of the right height. Empty shows an empty state (5.9). An error shows
  the error in place with a retry control. A stale table never looks current: show when it was last
  refreshed if it is not live.

### 5.3 Forms and validation

- Label above the control, always visible. A placeholder is an example, never the label.
- Help text below the control in `muted-foreground`. Say what the setting does in plain words;
  never require Linux knowledge to understand a field.
- **Validation errors** use the `critical-label` text colour and the `critical-stroke` edge, with
  an icon and a message below the field that says how to fix it, linked with `aria-describedby`. A
  red border alone is not an error message. Validate on blur and on submit, not on every keystroke.
- Required fields are marked in words ("Required") or with an asterisk that is explained once.
- **Saving a form does not apply it.** After a save, the pending banner appears (5.8). The save
  button says "Save", not "Apply".
- **Secrets** (passwords, keys, tokens, shared secrets) are masked, have a deliberate reveal
  control, are never pre-filled with the stored value, and are never echoed back in a toast, a URL
  or a confirmation dialog. An existing secret is shown as "Set" with a "Change" control.
- Disabled controls say why (tooltip or hint). Prefer hiding what can never apply and disabling
  what could.

### 5.4 Destructive-action confirmation

For anything that destroys data or cuts access: wiping a disk, deleting a file system, a share, a
user or a certificate in use, resetting configuration.

- A modal dialog that **names the exact object** ("Wipe disk `/dev/sdb`, WDC WD40EFRX, 3.6 TiB")
  and states the consequence in one plain sentence, including what depends on it ("2 shared folders
  use this file system").
- **Type-to-confirm** for the irreversible ones: the user types the object's name. The confirm
  button stays disabled until it matches.
- The confirm button is `destructive`, carries a verb and the object ("Wipe disk"), and is never
  the default focus; focus starts on Cancel. Enter does not confirm.
- Colour is never the only signal: the dialog has a warning-shape icon, a title that states the
  action, and the typed confirmation.
- No "don't ask again" on a destructive confirmation.

### 5.5 Status pills and health indicators

One anatomy per status, used everywhere:

- **Pill**: a 14% wash of the status fill, a 1px `-stroke` border, the status icon and the status
  word in `-label`. Pill text is 12px medium.
- **Dot** (where a pill does not fit, such as a compact tile): an 8 to 10px disc of the fill with a
  `-stroke` ring, and the word next to it or in an accessible name plus tooltip. **Unknown is a
  hollow ring**, not a filled disc, because OK and Unknown are close under deuteranopia (3.4).
- The words are fixed: **OK, Warning, Critical, Unknown**, plus **Disabled** and **Stopped**, which
  use the Unknown treatment with their own word. Do not invent synonyms per page.
- A roll-up shows the worst state of its children and says how many ("1 of 4 disks: Critical").
- Unknown is never rendered as OK, and "no data yet" is never green.

### 5.6 Capacity meters

- A full-radius track (`usage-track` with a `usage-track-edge` outline, 4.58:1 light, 4.24:1 dark)
  and a `usage` fill (4.19:1 against the track in light, 5.92:1 in dark).
- **Always paired with numbers**: "3.1 TiB of 3.6 TiB (86%)", tabular.
- The bar is blue. Crossing an admin-configured threshold adds a Warning or Critical pill beside
  the figure; only then may the fill take the status colour.
- It is exposed as a `meter` (or `progressbar`) with `aria-valuenow`, `aria-valuemin`,
  `aria-valuemax` and a text alternative.

### 5.7 Long-running tasks and log output

- A task (installing updates, building an array, a file-system check) has a title, a state
  (Running, Succeeded, Failed, Cancelled) as a pill, a progress bar where progress is known, elapsed
  time, and a cancel control where cancelling is safe.
- **Output is shown on the terminal pair** in both themes: `terminal` ground,
  `terminal-foreground` text (13.68:1 light theme, 14.57:1 dark), `terminal-muted` for timestamps
  (6.40 and 6.82:1), Roboto Mono 13px. The text has a faint green tint as a nod to OMV's terminal;
  it is not a status and nothing in the output is coloured as one.
- **Output is text.** It is rendered as text nodes, never as HTML. ANSI colour codes are stripped
  or mapped to a fixed, audited set; they are never passed through.
- The view follows the tail while the user is at the bottom and stops following when they scroll
  up. There is a copy control and a download control.
- A task survives navigation: leaving the page does not cancel it, and a running task is reachable
  from the top bar.
- When a task ends, the result is announced through a polite live region and stays on screen until
  dismissed.

### 5.8 The pending-changes banner

OMV's signature, and the only place the yellow appears at size.

- A full-width band on `pending` with `pending-foreground` text, directly under the top bar, shown
  whenever there are saved-but-unapplied changes. It is not dismissible while changes are pending.
- It says what is pending in words ("3 pending changes: SMB, SSH, Network"), with **Apply** and
  **Revert** controls. Buttons on the band are outlined in the coffee ink; the yellow is the
  ground, not the button.
- Apply opens a confirmation that lists the affected services and warns when applying may cut the
  current connection (network and web-server changes).
- The item that is pending carries a small pending mark (the pending icon with `pending-stroke`,
  3.75 to 4.67:1 light) and, as text, `pending-label`.
- While changes are being applied the band shows progress and both controls are disabled.
- The same indicator sits in the top bar, so the state is visible when the band is scrolled away.

### 5.9 Empty states

- One sentence saying what belongs here and one primary action to create it. An icon is optional
  and neutral.
- An empty table caused by a filter says so and offers to clear the filter.
- "No disks found" and "could not read disks" are different states and look different.

### 5.10 Toasts

- For confirmation of something the user just did ("Shared folder saved") and for background
  results. Never for an error the user must act on (that goes in place, or in a dialog), and never
  the only record of a failure.
- Neutral `surface` with an icon; a status toast uses the status icon and word, not a filled
  status ground.
- Polite live region; errors are assertive. Auto-dismiss after about 5 seconds only for
  confirmations; anything with an action or an error stays until dismissed. Dismissible by
  keyboard, and timing pauses on hover and focus.
- Toast text is plain text and never contains a secret or raw server output.

---

## 6. Accessibility

The bar is **WCAG 2.2 level AA**. In particular:

- **Contrast**: section 3.11, enforced by the audit.
- **Never colour alone** (1.4.1): status, selection, validation, required fields, links in running
  text (underlined), chart series.
- **Keyboard** (2.1.1, 2.1.2): everything is operable without a pointer; no trap; menus, dialogs,
  tabs and tables follow the WAI-ARIA Authoring Practices patterns. Use the Radix primitives rather
  than hand-built ones.
- **Focus visible and not obscured** (2.4.7, 2.4.11): section 4.6. Sticky bars must not cover the
  focused element.
- **Target size** (2.5.8): at least 24 by 24 CSS pixels, including icon buttons in dense tables;
  44 by 44 where touch is the main input.
- **Dragging** (2.5.7): anything draggable (dashboard tiles, column order) has a non-drag
  alternative.
- **Reflow and zoom** (1.4.10, 1.4.4): usable at 320 CSS pixels wide and at 200% zoom without
  two-dimensional scrolling, except inside data tables, which scroll in their own region.
- **Reduced motion** (2.3.3): section 4.5.
- **Names, roles, values** (4.1.2) and **status messages** (4.1.3): live regions for task results,
  save confirmations and validation summaries.
- **Authentication** (3.3.8): the sign-in and one-time-code forms allow paste and password
  managers; one-time-code fields use `autocomplete="one-time-code"`.
- **Consistent help and no redundant entry** (3.2.6, 3.3.7).
- **Language**: all strings come from the translation catalogue; layouts tolerate text 40% longer
  than English and do not rely on word order.

Check each screen in light and dark, in greyscale (`filter: grayscale(1)`), and with the browser's
deuteranopia and protanopia emulation. In greyscale every status must still be identifiable.

---

## 7. Security rules for the UI

The normative requirements are in [`docs/05-security.md`](../05-security.md).
The rules below are the ones that shape components; where the two differ, that document wins.

1. **No `innerHTML`, no `dangerouslySetInnerHTML`.** Everything from the server (names, comments,
   device labels, log lines, error messages, task output) is rendered as text.
2. **No server-provided HTML or Markdown is rendered, at all** (UI-2). There is no sanitiser
   and no "rich text from the API" component; a sanitiser is a thing that can be bypassed, and
   nothing in a NAS console needs one. Help text and documentation are part of the build.
3. **No navigation to a target supplied by the server or by the URL** (UI-3). No open
   redirects, no `returnUrl` parameter of any kind (after login the app goes to a fixed route), no
   `window.open` of an API-supplied address. External links are fixed in the code, open with
   `rel="noopener noreferrer"`, and are visibly external.
4. **No route may derive an API call from URL parameters.** A URL selects a view; it never names an
   operation, a method or its arguments. Every state-changing request follows an explicit user
   action on the page.
5. **Secrets are masked and never echoed**: section 5.3. They are never written to the URL,
   browser storage, logs, analytics or error reports.
6. **No inline scripts or styles**, so the content security policy can forbid them. No third-party
   scripts, fonts, images or analytics; the console makes no request to any other origin.
7. **Templating never evaluates data.** No client-side template engine is run over server data, and
   no string from the server is ever passed to `eval`, `new Function` or a template compiler.
8. **Destructive actions** follow 5.4 (UI-8).
9. **Error messages are plain and safe**: show the server's user-facing message as text and a
   correlation identifier; never a stack trace.

---

## 8. Adding or changing a colour

1. **Name its job** from the table in 2.1. If none fits, it does not get a hue.
2. **Reuse a family.** If a new one is unavoidable, give it the full shape (fill, foreground,
   label, stroke) with light and dark values. Build values in OKLCH so the hue stays put:
   `node tools/colour-audit.mjs oklch 0.55 0.12 240`.
3. **Declare it in `design/tokens.css`** as a primitive plus semantic roles, hex only.
4. **Add its pairs to `PAIRS`** in `tools/colour-audit.mjs` in the same change: every ground the
   colour can land on, with the right bar (`text`, `ui`, or `deco` with the reason). If it must be
   told apart from another colour, add the pair to `DISTINCT`.
5. **Run the audit.** `contrast` must exit 0. A new hue within 10 of an existing one with a
   different meaning, in any column of `distinct`, needs a non-colour cue wherever both can appear.
6. **Look at it** in `design/preview.html` (mirror the token there) and in the app: both themes,
   greyscale, deuteranopia.
7. **Update the numbers in this guide** that the change affects.

### Running the audit

```
node tools/colour-audit.mjs                # contrast + distinct + neutrals
node tools/colour-audit.mjs contrast       # exit 1 if a required pair fails; add --quiet for CI
node tools/colour-audit.mjs distinct       # status, brand and series under simulated CVD
node tools/colour-audit.mjs neutrals       # hue drift and chroma of the slate ramp
node tools/colour-audit.mjs legacy         # the stock OMV palette's measured defects
node tools/colour-audit.mjs measure '#fff' '#5dacdf'   # one ad-hoc pair
```

`contrast --quiet` belongs in the test target so a token change that breaks a pair fails the build.
The script needs only Node; it has no dependencies. Colour-vision deficiency is simulated with the
Machado, Oliveira and Fernandes (2009) matrices at full severity; APCA uses the 0.0.98G-4g
constants. Both are approximations: the simulation is a guide to which pairs need a second cue, not
proof that a pair is safe.

---

## 9. Checklist

- [ ] Every chromatic element names one of the five jobs (section 2); the rest is neutral.
- [ ] Blue is the only interaction hue; hover is neutral; one filled primary per view.
- [ ] Yellow appears only for pending configuration; nothing else is yellow.
- [ ] Status hues mean only status; there is no blue "info" severity.
- [ ] Words use `-label` (or `-foreground` on a solid fill); fills and strokes are not text colours.
- [ ] Every status has its word or a distinct icon shape; Unknown is hollow; greyscale and
      deuteranopia views still tell the states apart.
- [ ] `node tools/colour-audit.mjs contrast` exits 0; advisory pairs are labels, not body text.
- [ ] No literal colours, raw palette classes or primitives in components.
- [ ] No gradients; alpha tints only on the audited grounds.
- [ ] Charts: at most four series, directly labelled, each with its own dash or marker; no status
      hues, blue or yellow in a series.
- [ ] Both themes checked; dark is not an inversion.
- [ ] Focus ring visible on every control, on every ground, including the top bar.
- [ ] Keyboard-only pass of the screen; targets at least 24 by 24.
- [ ] Destructive actions: named object, typed confirmation, focus on Cancel, verb on the button.
- [ ] Sizes, counts and times use tabular numerals; identifiers use mono.
- [ ] Nothing from the server is rendered as HTML; no secret is echoed; no URL parameter drives an
      API call.
- [ ] No openmediavault logo artwork; the product is labelled as a community plugin.
