// SPDX-License-Identifier: GPL-3.0-or-later
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * An on/off setting that takes effect as a saved value (the pending banner follows a save, not the
 * switch). On Base UI's Switch. The thumb's position, not only its colour, says on or off. Give it a
 * name with a `<label>` or `aria-label`.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-muted-strong p-0.5",
        "transition-[background-color,border-color] duration-base ease-standard",
        // The track is 24px high, the WCAG 2.5.8 target; the pseudo-element keeps the target whole.
        "after:absolute after:-inset-px after:content-['']",
        "data-checked:border-selected-mark data-checked:bg-selected-mark",
        "data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          // Switch settle (foundation 7.2): the thumb travels on the settle spring, and pressing
          // stretches it toward where it will go. Reduced motion: it moves without travel.
          "block h-4.5 w-4.5 rounded-full bg-muted-foreground shadow-control",
          "transition-[translate,width,background-color] duration-slow ease-settle",
          "group-active/switch:w-5.5 group-data-disabled/switch:w-4.5",
          "data-checked:translate-x-5 data-checked:bg-selected-mark-foreground rtl:data-checked:-translate-x-5",
          "data-checked:group-active/switch:translate-x-4 rtl:data-checked:group-active/switch:-translate-x-4",
        )}
      />
    </BaseSwitch.Root>
  );
}

export { Switch };
