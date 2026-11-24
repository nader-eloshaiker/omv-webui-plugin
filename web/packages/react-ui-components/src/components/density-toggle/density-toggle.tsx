// SPDX-License-Identifier: GPL-3.0-or-later
import { Toggle } from "@base-ui/react/toggle";
import { Rows3, Rows4 } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { buttonClass } from "../button/button-class";
import { Tooltip } from "../tooltip/tooltip";

type Density = "comfortable" | "compact";

interface DensityToggleProps extends Omit<
  React.ComponentProps<typeof Toggle>,
  "pressed" | "defaultPressed" | "onPressedChange" | "children" | "aria-label"
> {
  density: Density;
  onDensityChange: (density: Density) => void;
  /** The switch's name, which stays the same in both states: "Compact rows". */
  label: string;
  /** The tooltip, saying the state: "Compact rows: on". */
  hint?: string;
}

/**
 * The density switch in the top bar (foundation 5): comfortable or compact, as a toggle button whose
 * pressed state is compact (`aria-pressed`), on Base UI's Toggle. The icon shows the rows it gives.
 * The caller stores the choice and puts `data-density` on <html>.
 */
function DensityToggle({
  density,
  onDensityChange,
  label,
  hint,
  className,
  ...props
}: DensityToggleProps) {
  const compact = density === "compact";
  return (
    <Tooltip content={hint ?? label}>
      <Toggle
        data-slot="density-toggle"
        aria-label={label}
        pressed={compact}
        onPressedChange={(pressed) =>
          onDensityChange(pressed ? "compact" : "comfortable")
        }
        className={cn(
          buttonClass({ variant: "quiet", size: "icon" }),
          "data-pressed:bg-muted-strong data-pressed:text-foreground",
          className,
        )}
        {...props}
      >
        <span aria-hidden="true" className="contents">
          {compact ? <Rows4 /> : <Rows3 />}
        </span>
      </Toggle>
    </Tooltip>
  );
}

export { DensityToggle };
export type { Density, DensityToggleProps };
