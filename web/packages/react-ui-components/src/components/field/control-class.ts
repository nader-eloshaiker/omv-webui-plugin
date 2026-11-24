// SPDX-License-Identifier: GPL-3.0-or-later
// The look shared by text inputs and select triggers. The edge is the control token, which clears 3:1
// on every ground; a refused value also takes the critical stroke, beside its message (style guide 5.3).
// The height follows the density (`h-control`: 32px, 28px compact). A field is recessed, not raised,
// so it takes no resting shadow; hover darkens its edge toward the ink.
export const controlClass =
  "h-control w-full min-w-0 rounded-control border border-input bg-surface px-3 text-base text-foreground " +
  "transition-[border-color,background-color] duration-fast ease-standard hover:not-data-disabled:border-muted-foreground " +
  "placeholder:text-subtle-foreground data-invalid:border-critical-stroke aria-invalid:border-critical-stroke " +
  "data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:text-subtle-foreground";
