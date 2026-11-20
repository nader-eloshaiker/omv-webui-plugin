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
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-input bg-muted p-0.5 transition-colors duration-fast",
        "data-checked:border-action data-checked:bg-action",
        "data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block size-3.5 rounded-full bg-muted-foreground transition-transform duration-fast",
          "data-checked:translate-x-4 data-checked:bg-action-foreground rtl:data-checked:-translate-x-4",
        )}
      />
    </BaseSwitch.Root>
  );
}

export { Switch };
