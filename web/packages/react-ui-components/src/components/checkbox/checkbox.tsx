// SPDX-License-Identifier: GPL-3.0-or-later
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * A checkbox on Base UI's Checkbox. Checked is the action blue with a mark, so selection never rests on
 * colour alone. `indeterminate` for a "select all" that covers part of a list. Give it a name: a
 * `<label>` around it, or `aria-label` in a table row.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof BaseCheckbox.Root>) {
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-surface text-action-foreground",
        // The box is 16px; the press target is 24px (WCAG 2.5.8) through an empty pseudo-element.
        "after:absolute after:-inset-1 after:content-['']",
        "data-checked:border-action data-checked:bg-action data-indeterminate:border-action data-indeterminate:bg-action",
        "data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:bg-muted data-disabled:text-subtle-foreground",
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        className="flex data-unchecked:hidden"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <Minus aria-hidden="true" className="size-3" strokeWidth={3} />
            ) : (
              <Check aria-hidden="true" className="size-3" strokeWidth={3} />
            )}
          </span>
        )}
      />
    </BaseCheckbox.Root>
  );
}

export { Checkbox };
