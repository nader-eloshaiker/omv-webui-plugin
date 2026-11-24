// SPDX-License-Identifier: GPL-3.0-or-later
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

// The look of a box that cannot be changed: the same as Base UI's disabled one, for a box that stays
// focusable (`focusableWhenDisabled`), so the two read alike. A ticked one keeps its mark.
const unavailableClass =
  "cursor-not-allowed border-transparent bg-muted text-subtle-foreground data-checked:border-transparent data-checked:bg-muted data-indeterminate:border-transparent data-indeterminate:bg-muted";

type CheckboxProps = React.ComponentProps<typeof BaseCheckbox.Root> & {
  /**
   * With `disabled`: the box stays in the tab order and says it is unavailable (`aria-disabled`)
   * instead of leaving it, so its reason, given as its description, is heard when it is reached
   * (style guide 5.3). It cannot be changed by click, Space or its label. Like `Button`'s prop.
   */
  focusableWhenDisabled?: boolean;
};

/**
 * A checkbox on Base UI's Checkbox. Checked is the action blue with a mark, so selection never rests on
 * colour alone. `indeterminate` for a "select all" that covers part of a list. Give it a name: a
 * `<label>` around it, or `aria-label` in a table row.
 */
function Checkbox({
  className,
  disabled,
  focusableWhenDisabled = false,
  readOnly,
  ...props
}: CheckboxProps) {
  // Base UI's disabled box leaves the tab order; a read-only one stays and refuses every change.
  const unavailable = disabled === true && focusableWhenDisabled;
  return (
    <BaseCheckbox.Root
      data-slot="checkbox"
      data-unavailable={unavailable || undefined}
      disabled={unavailable ? false : disabled}
      readOnly={unavailable || readOnly}
      // Only when set here: an undefined value would hide Base UI's own `aria-disabled`.
      {...(unavailable ? { "aria-disabled": true } : null)}
      className={cn(
        "relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-sm border border-input bg-surface text-action-foreground",
        "transition-[background-color,border-color] duration-fast ease-standard",
        // The box is 16px; the press target is 24px (WCAG 2.5.8) through an empty pseudo-element.
        "after:absolute after:-inset-1 after:content-['']",
        "data-checked:border-action data-checked:bg-action data-indeterminate:border-action data-indeterminate:bg-action",
        "data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:bg-muted data-disabled:text-subtle-foreground",
        unavailable && unavailableClass,
        className,
      )}
      {...props}
    >
      <BaseCheckbox.Indicator
        // The mark lands on the settle spring as it appears (Base UI's starting style).
        className="flex transition-[scale,opacity] duration-base ease-settle data-starting-style:scale-50 data-starting-style:opacity-0 data-unchecked:hidden"
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
export type { CheckboxProps };
