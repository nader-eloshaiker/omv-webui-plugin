// SPDX-License-Identifier: GPL-3.0-or-later
import {
  ArrowRight,
  Ban,
  MonitorCheck,
  Pause,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";

/**
 * What a change does to this page (phase 5 network design 0.5): it keeps working, it pauses for a few
 * seconds, it moves to another address, it may be cut off, or the change is refused.
 */
type ImpactClass = "none" | "brief" | "moves" | "mayCut" | "refused";

// One shape per class, so the class is told apart without colour (design 19.2) and without reading
// the words: a screen with a check mark, a pause, an arrow, the warning triangle, a barred circle.
// All in the neutral ink: none of these is a state the NAS monitors (style guide 2).
const IMPACT_ICONS: Readonly<Record<ImpactClass, LucideIcon>> = {
  none: MonitorCheck,
  brief: Pause,
  moves: ArrowRight,
  mayCut: TriangleAlert,
  refused: Ban,
};

interface ImpactLineProps extends Omit<
  React.ComponentProps<"div">,
  "children" | "role"
> {
  impact: ImpactClass;
  /** The class's words (`network.impact.*`): "This page keeps working." */
  children: React.ReactNode;
  /**
   * The specific line for this change, after the class's words (`netChange.effect.*`): "This page
   * stops working at 192.0.2.10. The NAS will be at 192.0.2.20."
   */
  detail?: React.ReactNode;
  /**
   * `true` (the default) under a form's buttons: a polite live region, so the class is heard as the
   * fields change (design 5.2, 19.2). Give it an `id` and add that id to the Save button's
   * `aria-describedby`. `false` where the line does not change while read (the review summary).
   */
  live?: boolean;
}

/**
 * The class of a change in words with a shape of its own (phase 5 network design 0.5, 5.4). Neutral
 * ink throughout; nothing moves, so it reads the same under reduced motion. Keep it rendered while the
 * form is open and change its `impact` and words, so the live region announces the change.
 */
function ImpactLine({
  impact,
  children,
  detail,
  live = true,
  className,
  ...props
}: ImpactLineProps) {
  const Icon = IMPACT_ICONS[impact];
  return (
    <div
      data-slot="impact-line"
      data-impact={impact}
      role={live ? "status" : undefined}
      className={cn(
        "flex items-start gap-2 text-sm text-foreground",
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        data-slot="impact-line-icon"
        className={cn(
          "mt-[0.15em] size-4 shrink-0 text-muted-foreground",
          // The arrow points the way the reading goes.
          impact === "moves" && "rtl:-scale-x-100",
        )}
      />
      <div className="flex min-w-0 flex-col gap-0.5 [overflow-wrap:anywhere]">
        <p>{children}</p>
        {detail ? <p className="text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

export { IMPACT_ICONS, ImpactLine };
export type { ImpactClass, ImpactLineProps };
