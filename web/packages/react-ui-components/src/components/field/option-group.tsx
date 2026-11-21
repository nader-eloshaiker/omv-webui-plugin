// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";

interface OptionGroupProps {
  /** The section's heading, always visible: "Empty disks". It names the section. */
  label: React.ReactNode;
  /** What the section's options have in common, under the heading: "Their data will be erased." */
  description?: React.ReactNode;
  className?: string;
  /** The section's options, in reading order. */
  children: React.ReactNode;
}

/**
 * A headed section of options inside a choice (a `RadioGroupField` or a `CheckboxListField`): a
 * `group` named by its visible heading and described by the line under it. It only labels; it takes
 * no part in keyboard movement, so the options around it still move as one list. Internal: the
 * fields export it under their own names.
 */
function OptionGroup({
  label,
  description,
  className,
  children,
  dataSlot,
}: OptionGroupProps & { dataSlot: string }) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  return (
    <div
      role="group"
      data-slot={dataSlot}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      // A section after another one stands a step further off than the options inside it.
      className={cn("flex flex-col gap-3 not-first:mt-2", className)}
    >
      <div className="flex flex-col gap-0.5">
        <p
          id={labelId}
          className="text-sm font-semibold [overflow-wrap:anywhere] text-foreground"
        >
          {label}
        </p>
        {description ? (
          <p
            id={descriptionId}
            className="text-sm [overflow-wrap:anywhere] text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export { OptionGroup };
export type { OptionGroupProps };
