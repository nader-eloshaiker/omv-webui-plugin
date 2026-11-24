// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by Dialog and the confirmations (AlertDialog): the scrim, and the centred modal surface at
// the modal elevation (style guide 4.3).
export const backdropClass =
  "fixed inset-0 z-50 bg-scrim transition-opacity duration-slow data-ending-style:opacity-0 data-starting-style:opacity-0";

export const popupClass =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto " +
  "rounded-card border border-border bg-popover p-6 text-popover-foreground shadow-floating outline-hidden " +
  "transition-opacity duration-slow data-ending-style:opacity-0 data-starting-style:opacity-0";
