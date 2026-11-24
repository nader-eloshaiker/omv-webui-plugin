// SPDX-License-Identifier: GPL-3.0-or-later
// Shared by Dialog and the confirmations (AlertDialog): the scrim, and the centred modal surface at
// the floating elevation (foundation 6). The dialog rises 8px and grows from 0.97 over a fading scrim
// on the enter curve, and leaves faster on the exit curve (foundation 7.2). It is centred with
// `inset-0 m-auto`, not a translate, so the rise is its own translate. Reduced motion: every duration
// is 0, so it is simply there.
export const backdropClass =
  "fixed inset-0 z-50 bg-scrim transition-opacity duration-slow ease-standard " +
  "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-base";

export const popupClass =
  "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto " +
  "rounded-card surface-floating p-6 text-popover-foreground outline-hidden " +
  "transition-[opacity,translate,scale] duration-slow ease-enter " +
  "data-starting-style:translate-y-2 data-starting-style:scale-[0.97] data-starting-style:opacity-0 " +
  "data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-ending-style:duration-base data-ending-style:ease-exit";
