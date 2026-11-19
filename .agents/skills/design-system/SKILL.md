---
name: design-system
description: Standards for engineering the design system - the token architecture from design/tokens.css into css-ui-style, the shadcn mapping, component API design in react-ui-components (cva variants, Base UI composition), Storybook coverage, theming mechanics and the Content Security Policy constraints on styling. Triggers on design tokens, tokens.css, css-ui-style, react-ui-components internals, shadcn, cva variants, Storybook and dark-mode plumbing.
---

# Design system engineering standards

How the token package and the shared component library are built. The
[style guide](../../../docs/design/style-guide.md) governs what surfaces look like and why; the
`uiux-design` skill governs how screens are designed; **this skill governs the system that produces
them.** Colour choices go through the `colour-theory` skill.

---

## 1. Tokens: three tiers, one direction

The single source of truth is [`design/tokens.css`](../../../design/tokens.css). Nothing else
declares a colour, size or duration.

1. **Primitives**: the static scales in `@theme` (`--color-brand-*`, `--color-slate-*`,
   `--color-status-*`, `--color-pending`). Theme-invariant.
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
- Motion durations and the easing curve are tokens; `prefers-reduced-motion` zeroes them in the
  token file. Components reference the token, never an inline duration.
- **The surfaces nobody drew are still ours to theme**: text selection, the caret, scrollbars, the
  focus ring, link underline offset. Give each a `--theme-*` pair for both themes and apply it once in
  the base layer.
- `css-ui-style` is built from `design/tokens.css`; `design/preview.html` mirrors the tokens for a
  no-build specimen. A token change updates both and the style guide's quoted numbers.

## 2. Theming mechanics

- Dark mode is the `.dark` class on `<html>`. Tailwind's `dark:` variant is rebound to that class with
  `@custom-variant`.
- **No inline script may set the class before first paint** (UI-1). How the initial theme is chosen
  without one is fixed in [docs/02-architecture.md](../../../docs/02-architecture.md#cross-cutting-behaviour);
  follow it, do not add an inline bootstrap.
- Prefer semantic tokens; reach for `dark:` only where a token cannot express a per-theme difference.
  Writing `dark:` twice for the same concept means it wants a token.
- Every token or mapping change is verified in both themes, in Storybook (theme addon) and in the
  running app.

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
- The style guide's fixed anatomies are not reinvented per component: one status pill, one dot (with
  Unknown hollow), one capacity meter, one destructive confirmation (focus starts on Cancel, Enter
  does not confirm, type-to-confirm for `data`-destructive), one pending banner.
- Breaking a component's props is a workspace-wide change: find every call site and migrate it in the
  same change.

## 6. Storybook

- Every component ships stories: one per variant and size, plus disabled, loading, error, with icon,
  and long content.
- Stories render correctly in both themes under the theme addon; that is the review surface for
  token regressions.
- Realistic content: real OMV-shaped labels, sizes with units, long share names. Seed one story with
  markup-looking text to show it renders inert.
- `build-storybook` stays green.

## 7. Charts and data display

- Chart colours come from the `series-1..4` tokens and the usage ramp, never hex in a chart config.
  No status hue, blue or yellow in a series (style guide 3.9).
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
2. [ ] Every touched token defined for light and `.dark`; status fills theme-invariant?
3. [ ] `dark:` overrides rare and justified?
4. [ ] cva variants, native props, `className` last, ref forwarded?
5. [ ] No app, DTO or router import in the library; catalog-pinned, justified dependencies?
6. [ ] No injected `<style>`, no `style=` markup, no inline script; zero CSP violations?
7. [ ] No markup rendered from strings?
8. [ ] Stories cover every state in both themes?
9. [ ] Colour audit exits 0; style guide numbers updated?
