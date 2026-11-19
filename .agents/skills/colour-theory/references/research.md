# Colour theory for product UI - the research behind the skill

Gathered 2026-11-03 for the `colour-theory` skill and carried over from the reference application.
Each rule carries its source. **[F]** means the source page was fetched and read when this was
written; **[R]** means it is recalled from the named source and was not re-fetched - check an [R]
figure before quoting it as a hard number. Contrast figures for this project's own tokens are
deliberately absent: they come from `tools/colour-audit.mjs`, which reads the live tokens, and are
quoted in the style guide.

## 1. Fundamentals

- HSL is not perceptually uniform: the same +10% lightness moves blue and yellow by very different
  perceived amounts. OKLCH's L is perceptual. [F] https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl
- OKLCH: L 0-1, C from 0 (grey) to about 0.37 in sRGB/P3, H 0-360 (red ~20, yellow ~90, green ~140,
  blue ~260, purple ~320). [F] same
- Build a scale by fixing the L steps and the C curve and varying only H; a hue change in HSL moves
  lightness and breaks contrast, in OKLCH it does not. Derive variants with relative colour syntax,
  `oklch(from var(--x) calc(l - 0.1) c h)`. [F] same
- Out-of-gamut values are clipped and shift hue; ship an sRGB-safe value and put a higher-chroma P3
  value under `@media (color-gamut: p3)`. [F] same
- OKLCH L predicts contrast only roughly; confirm with a contrast calculation. [F] same
- Tailwind v4's palettes are authored in OKLCH, and `x/NN` compiles to `color-mix(in oklab, ...)`.
  [R] https://tailwindcss.com/docs/colors
- Simultaneous contrast: a colour looks different on a different surround. Judge a status chip on
  the surface it really sits on. [R] https://www.nngroup.com/articles/color-enhance-design/
- Tint neutrals at very low chroma (about 0.005-0.02 OKLCH). Radix's greys carry a hue (slate, sand,
  olive, mauve) and are meant to be paired with a matching accent family.
  [R] https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette
- Refactoring UI: avoid true grey beside colour; saturate greys slightly, warm for warm brands and
  cool for cool brands; build 8-10 shades per hue by hand. [R] https://www.refactoringui.com

## 2. Harmony, and orange next to yellow

- Product UIs are almost always monochromatic-plus-neutral with one accent, not full triadic or
  complementary schemes. [R] https://m3.material.io/styles/color/system/how-the-system-works
- Full-chroma complements placed edge to edge vibrate (chromostereopsis); separate them with a
  neutral or let one be a tint. [R] https://www.nngroup.com/articles/color-enhance-design/
- Material 3 derives secondary and tertiary at much lower chroma than primary: a secondary is a quiet
  companion, not a second brand voice. [R] https://m3.material.io/styles/color/roles
- Orange and amber/yellow are the caution hues in every major system. Carbon's alert set uses orange
  for serious warning and yellow for warning. In this project orange is warning and yellow is
  pending configuration, so the two must stay apart on lightness and carry their own words. [F] https://carbondesignsystem.com/data-visualization/color-palettes/
- A mid-lightness orange such as OMV's `#f78f00` fails as a word on white (about 2.4:1); dark text on
  it passes. (Computed; `node tools/colour-audit.mjs legacy` reproduces it.)

## 3. Distribution

- 60-30-10 (dominant / secondary / accent) comes from interior design.
  [R] https://www.nngroup.com/articles/color-enhance-design/
- Dense product UIs run far more neutral than that - colour marks interaction and state, not fill.
  [R] https://atlassian.design/foundations/color , https://primer.style/foundations/color/overview
- If removing a colour loses no information, it is decoration. [R] https://www.refactoringui.com
- Establish hierarchy with grey levels and weight first, colour second. [R] same
- One primary button per view or section. [R] https://atlassian.design/components/button/usage
- "Colour budget" is a working concept, not a published standard: cap the hues on a screen at the
  brand, the status set and one chart family, each extra hue naming its job.

## 4. Roles and token tiers

- Three tiers: primitives, semantic, component. Components read semantic tokens; themes remap
  semantic to primitive. [R] https://atlassian.design/foundations/color , https://m3.material.io/styles/color/roles
- M3 pairs every fill role with an `on-` role of guaranteed contrast (primary / on-primary /
  primary-container / on-primary-container), and tiers surfaces (surface-container-lowest to
  -highest). [R] https://m3.material.io/styles/color/roles
- Radix's 12 steps: 1 app background; 2 subtle background; 3 UI element background; 4 hovered; 5
  pressed/selected; 6 subtle non-interactive border; 7 interactive border; 8 strong border, focus
  ring; 9 solid fill; 10 hovered solid; 11 low-contrast text; 12 high-contrast text.
  [F] https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Radix guarantees step 11 at APCA Lc 60 and step 12 at Lc 90 on step 2 of the same scale. [F] same
- shadcn's `accent` is the subtle hover/active background of menu items and ghost controls (a
  neutral step in its default themes), not a brand accent. [R] https://ui.shadcn.com/docs/theming
- Three text tiers (primary, secondary, tertiary/disabled) are enough; more drift.
  [R] https://atlassian.design/foundations/color

## 5. Interactive states

- M3 state layers overlay the content colour: hover 8%, focus 10%, pressed 10%, dragged 16%;
  disabled content 38%, container 12%. [R] https://m3.material.io/foundations/interaction/states/state-layers
- Radix uses tonal steps instead: 3 rest, 4 hover, 5 pressed/selected; 9 solid, 10 hovered solid.
  [F] https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Pick one method per component. Selected (persistent) and focused (transient) must look different.
- A link in running text needs 4.5:1 and a non-colour cue (underline), or 3:1 against the
  surrounding text plus a cue on hover and focus. [R] https://www.w3.org/WAI/WCAG22/Techniques/general/G183

## 6. Status colour

- Red danger, orange/yellow warning, green success, blue information.
  [F] https://carbondesignsystem.com/data-visualization/color-palettes/
- Keep brand and status roles separate; with a blue brand, information must still be told apart from
  primary. [R] https://atlassian.design/foundations/color
- Each status needs a subtle background, a border and a text/icon colour that clears 4.5:1 on that
  background. [R] same
- Colour is never the only means of conveying information (WCAG 1.4.1).
  https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- About 8% of men have a red-green deficiency. Separate statuses by lightness as well as hue, add
  icons, and shift green toward blue-green and red toward orange-red if hue must carry more.
  [R] https://jfly.uni-koeln.de/color/ , https://www.nngroup.com/articles/color-vision-deficiency/

## 7. Accessibility

- 1.4.3: 4.5:1 for text, 3:1 for large text (18pt / 24px, or 14pt / 18.66px bold).
  https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- 1.4.11: 3:1 for the visual information needed to identify a control and its state, and for
  graphics needed to understand the content. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- 2.4.13 Focus Appearance (AAA): at least a 2 CSS px perimeter and 3:1 between focused and unfocused.
  [R] https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- APCA Lc guide: body text 75 (90 preferred), large or heavy text 45, fine non-text 15-45 by size.
  WCAG 2 overstates contrast when one colour is near black, which is where dark themes live.
  [F] https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html
- APCA is a draft; WCAG 2.2 AA remains the conformance baseline.

## 8. Dark theme

- Re-derive, do not invert; M3 moves primary to a lighter tone in dark. [R] https://m3.material.io/styles/color/roles
- Avoid pure black so elevation can show; elevation is a lighter surface. [R] same
- Desaturate and lighten chromatic colours on dark grounds; saturated colours glow and vibrate. [R] same
- Carbon: diverging palettes stay the same across themes; sequential palettes reverse.
  [F] https://carbondesignsystem.com/data-visualization/color-palettes/

## 9. Data visualisation

- Keep categorical palettes to 6-8 hues. Okabe-Ito's CVD-safe set: #E69F00, #56B4E9, #009E73,
  #F0E442, #0072B2, #D55E00, #CC79A7, black. https://jfly.uni-koeln.de/color/
- Carbon allows up to 14 categorical colours in a fixed order chosen for neighbour contrast, and keeps
  its alert colours as a separate set. [F] https://carbondesignsystem.com/data-visualization/color-palettes/
- Sequential: one hue, ordered by lightness. Diverging: two hues around a neutral midpoint. [F] same
- Choose a palette type by the data type, and test it for colour blindness. https://colorbrewer2.org
- Grey out everything not being discussed; colour the series that is. [R] https://blog.datawrapper.de/colors/
- Gradients in charts only to highlight extremes. [F] Carbon, same page

## 10. Tints, alpha and gradients

- Alpha tints are safe on one known ground and unpredictable over variable ones; text-bearing fills
  on variable grounds want opaque tokens so contrast can be computed.
- Overlays are the right tool for state layers, because the content colour sits on top of them.
  [R] M3 state layers
- Interpolating in OKLCH/OKLab avoids the grey dead zone of an sRGB blend.
  [R] https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl

## 11. Where sources disagree

- **Contrast model**: WCAG 2.2 is the conformance bar; APCA says it overstates dark pairs. Use WCAG
  for pass/fail and APCA as an advisory column.
- **Radix step 11 (Lc 60) versus APCA body text (Lc 75)**: step 11 is secondary text only.
- **60-30-10 versus mostly-neutral**: the first is a general design heuristic; dense B2B products
  follow the second. This product follows the second.
- **Overlay (M3) versus tonal step (Radix)** states: both work; do not mix them in one component.
- **Orange**: Carbon uses it for serious warning, others use yellow/amber for warning. This project
  follows Carbon: orange is warning, and yellow is kept for pending configuration only.
- **Pure black dark mode**: M3 avoids it; Apple's HIG permits true black for OLED. A data UI with
  elevation prefers a dark grey.
- **Categorical count**: Carbon up to 14; Okabe-Ito and most CVD guidance 6-8. Prefer 6-8.
