// SPDX-License-Identifier: GPL-3.0-or-later
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type * as React from "react";
import { cn } from "../../utils";

interface TooltipProps {
  /** What the tooltip says. Plain text: a tooltip is never the only place a needed fact appears. */
  content: React.ReactNode;
  /** The element it describes. It must accept a ref and spread props (every component here does). */
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/** A short hint on hover and keyboard focus, on Base UI's Tooltip. */
function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
          <BaseTooltip.Popup
            className={cn(
              "max-w-72 rounded-control bg-foreground px-2 py-1 text-xs text-page shadow-floating",
              "transition-opacity duration-fast data-ending-style:opacity-0 data-starting-style:opacity-0",
              className,
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export { Tooltip };
export type { TooltipProps };
