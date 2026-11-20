// SPDX-License-Identifier: GPL-3.0-or-later
// The look shared by text inputs and select triggers. The edge is the control token, which clears 3:1
// on every ground; a refused value also takes the critical stroke, beside its message (style guide 5.3).
export const controlClass =
  "h-8 w-full min-w-0 rounded-control border border-input bg-surface px-2.5 text-base text-foreground " +
  "placeholder:text-subtle-foreground data-invalid:border-critical-stroke aria-invalid:border-critical-stroke " +
  "data-disabled:cursor-not-allowed data-disabled:bg-muted data-disabled:text-subtle-foreground";
