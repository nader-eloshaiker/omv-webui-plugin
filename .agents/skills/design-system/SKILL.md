---
name: design-system
description: Standards for engineering the design system - the token architecture from design/tokens.css into css-ui-style (grounds, density, elevation, light and motion tokens), the shadcn mapping, component API design in react-ui-components (cva variants, Base UI composition), Storybook coverage, theming mechanics and the Content Security Policy constraints on styling. Triggers on design tokens, tokens.css, css-ui-style, react-ui-components internals, shadcn, cva variants, Storybook and dark-mode plumbing.
---

# Design system engineering standards

How the token package and the shared component library are built. The
[visual foundation](../../../docs/design/visual-foundation.md) governs what surfaces look like and
why (Sky as the base, Instrument's values as the compact density, Atlas's map as the diagram
language), and is normative over the [style guide](../../../docs/design/style-guide.md) for
everything its section 0 lists; the `uiux-design` skill governs how screens are designed; **this
skill governs the system that produces them.** Colour choices go through the `colour-theory` skill.

**First, the generated look.** [Style guide section 10](../../../docs/design/style-guide.md#10-the-generated-look-what-we-never-do)
lists twenty habits of generated design and what replaces each; it overrides this skill, the
foundation and any spec. No token, utility, component, variant or story may bring one back: no glow,
blur, gradient fill or texture; no eyebrow (uppercase or letter-spaced labels); no coloured left edge;
no status pill or "live" dot; no arrow or chevron on a button or text link; no `·` separators; nothing
that pulses, breathes or blinks; no entrance motion on a region; no sparkle glyphs; no card around a
region; no "quiet" as a style word. Check every change against the table before reporting it done.

---

## 1. Tokens: three tiers, one direction

The single source of truth is [`design/tokens.css`](../../../design/tokens.css). Nothing else
declares a colour, size or duration.

1. **Primitives**: the static scales in `@theme` (`--color-brand-*`, `--color-slate-*`,
   `--color-status-*`, `--color-pending-fill`, `--color-pending-ink`). Theme-invariant.
2. **Semantic roles**: `--theme-*` on `:root`, redefined under `.dark`. This is the layer that makes
   light and dark work.
3. **Component vocabulary**: the shadcn names mapped onto the semantic tier with `@theme inline` in
   the stylesheet that `css-ui-style` builds. The mapping is style guide 3.2; note that shadcn's
   `accent` and `secondary` are **neutral** here.

Rules:

- Never skip a tier. Components use semantic utilities (`bg-surface`, `text-foreground`,
  `text-warning-label`); the mapping uses `--theme-*`, not hex.
- A new colour need is answered in this order: an existing semantic token, then a new semantic token
  defined for both themes, then (rarely) a new primitive. Never a hex value in a component.
- **Status fills are identical in both themes** (style guide 3.5); their labels and strokes flip.
- Hex only for colours in `tokens.css`: the audit script parses hex and `var(--token)` and nothing
  else.
- **Grounds** are four steps: `page`, `surface` (cards), `muted` (insets, table heads, hover inside
  a card), `muted-strong` (hover on a control, chips, tracks). **Text** is `foreground`,
  `muted-foreground`, `tertiary-foreground` (captions, still 4.5:1) and `subtle-foreground`
  (placeholder and disabled only).
- **There is no identity bar.** The sky blue is the brand and the interaction hue: `brand` (the
  mark, the health ring), `trace` and `trace-area` (live data), `art-path` (the traced lineage),
  `link`, `selected`, `selected-label`, `selected-mark` (checked controls, the current tab's
  underline) and the focus ring. Nothing is painted sky blue as a surface; controls on the top bar
  use the button's `plain` variant (`quiet` is its deprecated alias).
- **The accent is Cobalt, the `action` family** (foundation 3.6): `action`, `action-hover`,
  `action-foreground`, `action-label`, `action-stroke`, `action-wash`; shadcn's `primary` maps to
  it. It says "do this" only: `Button` `primary` (edged in `action-stroke`), `primaryOutline` for a
  next step that is not the region's one filled primary, the first-steps `ProgressRing`. Never a
  link, selection, a checked control or the focus ring: those are Sky's roles above.
- **Icons**: lucide for interface glyphs; the custom set (`Icon`, `IconPlate`, `IconBadge`) for
  domain objects and actions, drawn as JSX on a 24 grid with one `art-plane` plane. Their motions
  are CSS in css-ui-style `src/icons.css`, keyed on `data-part`, never inline.
- **Washes and the selected tint are tokens**, not `x/NN` classes: `ok-wash`, `warning-wash`,
  `critical-wash`, `unknown-wash`, `pending-wash`, `selected`. An alpha a token does not name is a
  new pair for the audit first. A wash is never a status ground: no tinted card, row or capsule.
- **One gradient** (foundation 3.4): the area under a live line (`trace-area`). There is no
  ambient light, no lit card and no gradient chassis; the drive-bay chassis is the flat
  `art-chassis-top`. Never a glow, a radial wash, a gradient on a surface or a button, gradient
  text or borders, dithering, noise or blur. `theme-reset.css` empties `--blur-*`, so
  `backdrop-blur-*` and `blur-*` generate nothing, and the tests of `css-ui-style` fail if an
  ambient token or utility comes back.
- **Elevation by meaning**: `shadow-control` (pressable, at rest), `shadow-raised` or
  `surface-raised` (cards, panels, tables), `shadow-floating` or `surface-floating` (dialogs, menus,
  popovers, toasts, drawers) over `bg-scrim` when modal. In dark each carries a 1px inner top
  highlight. `shadow-sm`, `shadow-md` and `shadow-lg` no longer exist.
- **Radii**: `rounded-control` (12px, 16px squircle) and `rounded-card` (20px, 30px squircle);
  `rounded-sm` (6px) for checkboxes and inner marks; meters, rings, count badges and removable
  filter tokens `rounded-full`. A status is never a pill.
- **Type**: the seven named steps `text-hero`, `text-display`, `text-figure`, `text-title`, `text-section`,
  `text-body`, `text-caption`, each carrying its weight, tracking and leading; the plain steps stay
  for older code (`text-base` is the 15px body). `font-readout` for live figures. No `uppercase`,
  no `tracking-wide`, no `italic`: table headers, group labels, chart and map labels are sentence
  case, regular weight, in `muted-foreground`.
- **Density** is `data-density="compact"` on `<html>` (or a subtree); comfortable is the default.
  Components take their padding and heights from the density utilities, never fixed values: `p-card`,
  `gap-grid`, `py-cell-y`, `px-cell-x`, `py-row`, `h-control`, `min-h-control`, `size-control` (with
  `-sm` and `-lg`). Body, caption and figure sizes and `font-readout` follow it. The `compact:`
  variant is for what a token cannot express.
- **Motion is tokens** (foundation 7.1): durations `duration-press` (90ms), `-fast` (160, the
  default), `-base` (240), `-slow` (360), `-glide` (640); curves `ease-standard` (the default),
  `ease-enter`, `ease-exit`, and the springs `ease-settle` and `ease-soft` as native `linear()`; the
  shared keyframes `animate-rise`, `animate-settle-in`, `animate-fade-in`, `animate-draw`,
  `animate-leave` (a list item leaving, through `LeavingItem`), `animate-spin` (the one repeating
  motion, a spinner beside words), and `stagger` with `--stagger-index`. `theme-reset.css` empties
  `--animate-*`, so Tailwind's `animate-pulse`, `animate-ping` and `animate-bounce` do not exist.
  Nothing pulses, breathes or blinks (skeletons are still), and no region fades or rises in on load
  or scroll: motion answers an action or a change of state. Exits are shorter than entrances. Under `prefers-reduced-motion` every duration, the stagger and the rise are 0 in the token file, and the
  base layer runs any keyframe once at once. Components reference the tokens, never an inline duration.
- Entry from nothing uses Base UI's `data-starting-style` and `data-ending-style` (CSS
  `@starting-style` semantics): dialogs rise over the scrim, popups grow from their
  `--transform-origin`, toasts land on the settle spring, disclosures animate the height Base UI
  measures into `--collapsible-panel-height`.
- **The surfaces nobody drew are still ours to theme**: text selection (`selection`), the caret, the
  focus ring, link underline offset. Give each a `--theme-*` pair for both themes and apply it once in
  the base layer.
- `css-ui-style` is built from `design/tokens.css` (`pnpm --filter @omv-webui/css-ui-style tokens`
  writes its `generated/tokens.css`; `pnpm test` fails on a stale copy); `design/preview.html`
  mirrors the tokens for a no-build specimen. A token change updates both and the style guide's
  quoted numbers.

## 2. Theming mechanics

- Dark mode is the `.dark` class on `<html>`. Tailwind's `dark:` variant is rebound to that class with
  `@custom-variant`.
- **No inline script may set the class before first paint** (UI-1). How the initial theme is chosen
  without one is fixed in [docs/02-architecture.md](../../../docs/02-architecture.md#cross-cutting-behaviour);
  follow it, do not add an inline bootstrap.
- Prefer semantic tokens; reach for `dark:` only where a token cannot express a per-theme difference.
  Writing `dark:` twice for the same concept means it wants a token.
- Every token or mapping change is verified in both themes and both densities, in Storybook and
  in the running app.

## 3. The Content Security Policy constrains the library

Everything under `/ui/` is served with `style-src 'self'` and `script-src 'self'` (UI-1).

- **No `<style>` element and no `style=` attribute** reach the page. Styling is the built stylesheet
  plus Tailwind classes. React `style={}` props for genuinely dynamic geometry are fine, because
  React sets them through the DOM's style API.
- **A dependency that injects `<style>` at run time violates UI-1.** sonner and several Radix
  primitives (scroll areas, select viewports, the scroll lock under dialogs and menus) do, which is
  why the library uses Base UI only, inside `CSPProvider disableStyleElements` (D7).
  Before adding or upgrading a primitive, check its built output for created style elements, and
  check the browser console for CSP violations with the component open. Phase 0 assumption `A9`
  records what was found; if a primitive fails, raise it with the owner, never loosen the policy.
- No web fonts from a host: Inter and Roboto Mono are bundled (UI-7).

## 4. Component library structure

- One folder per component in `web/packages/react-ui-components/src/components/<name>/`, holding
  `<name>.tsx` and `<name>.stories.tsx`; public surface through the package `exports` map.
- Import Base UI by per-primitive subpath (`@base-ui/react/dialog`), never the umbrella entry. No Radix, no sonner (D7).
- Components wrap **Base UI primitives** for behaviour and accessibility; never re-implement
  focus management, dismissal or ARIA wiring a primitive provides.
- shadcn idiom: `cva` for variants, `clsx` + `tailwind-merge` (`cn()`) for class composition,
  semantic utilities only.
- **The library is app-agnostic**: no `@app/*` imports, no API client, no generated DTOs, no router.
  Anything that knows an OMV concept (a disk state, a pending module) lives in the app and composes
  library primitives.
- **No component renders markup from a string** (UI-2). The task log component renders output as
  text nodes; ANSI codes are stripped or mapped to the fixed, audited set (style guide 5.7).
- Dependencies are pinned through the pnpm catalog; a new one needs a catalog entry, a written
  justification and a licence check (UI-11).

## 5. Component API design

- **Variants over booleans**: `variant` and `size` unions in `cva` with declared defaults.
- Extend native element props and forward `ref`; merge incoming `className` through `cn()` last.
- Compose: `asChild` where the primitive offers it, `children` over content props, compound
  components for multi-part anatomy.
- Controlled and uncontrolled modes follow the primitive's convention (`value` / `defaultValue` /
  `onValueChange`).
- Accessibility is part of the API: icon-only variants require an accessible name; focus styling
  comes from the shared `focus-ring` token (style guide 4.6).
- The style guide's fixed anatomies are not reinvented per component: one status label
  (`StatusLabel`, its icon and word, no capsule; `StatusDot` the icon alone, Unknown a dashed ring),
  one capacity meter, one destructive confirmation (focus starts on Cancel, Enter
  does not confirm, type-to-confirm for `data`-destructive), one pending banner.
- Breaking a component's props is a workspace-wide change: find every call site and migrate it in the
  same change. A prop or variant that only produced a look style guide 10 forbids stays accepted,
  does nothing, and is marked `@deprecated` in its JSDoc with what replaces it (`StatusPill`,
  `Card tone`, `CardChevron`, `variant="quiet"`), until every caller has moved.

## 6. Storybook

- Every component ships stories: one per variant and size, plus disabled, loading, error, with icon,
  and long content, and a story for each motion it has (switch settle, save settle, destructive arm).
- **Every story renders in both themes and both densities at once** by default: the preview's
  `withMatrix` decorator draws four panels (dark and light, comfortable and compact), each on the
  flat page ground. A story that opens an overlay on mount sets
  `parameters: { matrix: false }`; `layout: "fullscreen"` also opts out. The toolbar switches theme
  (dark first), density and the layout. Stories use `React.useId()`, never fixed DOM ids, since a
  story renders four times.
- Realistic content: OMV-shaped labels, sizes with units, long share names. Values joined with
  commas or given their own labels, never `·`; headlines and messages as whole sentences, never
  fragments (style guide 10). Seed one story with markup-looking text to show it renders inert.
- `build-storybook` stays green.

## 7. Charts and data display

- Chart colours come from the `series-1..4` tokens, `trace` and `trace-area` for a single live
  series, and the usage ramp, never hex in a chart config. No status hue, the Cobalt accent or pending gold in a
  categorical series (style guide 3.9); a chart showing the trace beside a series labels each line
  directly and gives it its own dash.
- Numeric display uses tabular numerals; callers format values and units.

## 8. Change discipline

- A token is an API. Renaming or removing one means searching the whole workspace (`bg-`, `text-`,
  `--theme-`, chart configs): an undefined variable renders transparent, not as an error.
- Keep the tier comments in `tokens.css` truthful.
- No one-off copies of a component inside the app to dodge a library change.

## 9. Playbook

1. Classify the change: primitive, semantic token, mapping, variant, or new component; touch only
   that layer.
2. Tokens first, both themes; run `node tools/colour-audit.mjs` before and after.
3. Build on primitives; check for injected styles (section 3).
4. Story every state in both themes.
5. Sweep consumers.
6. Verify: Storybook, [verification.md](../../rules/verification.md), and a real app surface.

## 10. Reviewer checklist

1. [ ] No hex or primitive in components; mapping consumes `--theme-*` only?
2. [ ] Every touched token defined for light and `.dark`; status fills and washes theme-invariant?
   Density, radii, elevation and motion from tokens, never fixed values?
3. [ ] `dark:` overrides rare and justified?
4. [ ] cva variants, native props, `className` last, ref forwarded?
5. [ ] No app, DTO or router import in the library; catalog-pinned, justified dependencies?
6. [ ] No injected `<style>`, no `style=` markup, no inline script; zero CSP violations?
7. [ ] No markup rendered from strings?
8. [ ] Stories cover every state and motion, green in both themes and both densities?
9. [ ] Colour audit exits 0; style guide numbers updated?
10. [ ] None of the twenty habits of style guide 10, in the component or its stories?
