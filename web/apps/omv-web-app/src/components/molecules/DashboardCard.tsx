// SPDX-License-Identifier: GPL-3.0-or-later
// One card of the dashboard (phase 5 design 1.1; dashboard spec 3, 7, 9): a raised `section` named by
// its title, a quiet line of meta under the title (a roll-up, a count, how fresh), one action at the
// end of the header, its content, and a footer with its links. `busy` while the first read is in
// flight, with a polite "Loading …" for assistive technology (the skeletons are hidden from it).
//
// The cards from Storage on rise in once, in grid order (`index`, capped at 6 by the page): the
// stagger index is a CSS custom property set through the DOM's style API, which the Content Security
// Policy allows (UI-1); no style attribute is written into markup.
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@omv-webui/react-ui-components";
import { useId, type CSSProperties, type ReactNode } from "react";

export function DashboardCard({
  title,
  meta,
  action,
  busy,
  busyLabel,
  footer,
  className,
  index,
  children,
}: {
  title: string;
  /** Under the title: a roll-up with its pill, a count, the card's own freshness. */
  meta?: ReactNode;
  /** One control at the end of the header: "Check disk health", "Hide first steps". */
  action?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  footer?: ReactNode;
  /** The card's place in the page grid. */
  className?: string;
  /** Its place in the rise-in order. */
  index?: number;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <Card
      render={<section aria-labelledby={titleId} />}
      className={cn(
        index === undefined ? undefined : "motion-safe:animate-rise stagger",
        className,
      )}
      style={
        index === undefined
          ? undefined
          : ({ "--stagger-index": Math.min(index, 6) } as CSSProperties)
      }
    >
      <CardHeader className="items-start">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle id={titleId}>{title}</CardTitle>
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
              {meta}
            </div>
          ) : null}
        </div>
        {action ? (
          <div className="flex flex-wrap items-center gap-2 max-[399.98px]:w-full max-[399.98px]:*:w-full">
            {action}
          </div>
        ) : null}
      </CardHeader>
      <CardContent aria-busy={busy || undefined}>
        {busy && busyLabel ? (
          <p role="status" className="sr-only">
            {busyLabel}
          </p>
        ) : null}
        {children}
      </CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}
