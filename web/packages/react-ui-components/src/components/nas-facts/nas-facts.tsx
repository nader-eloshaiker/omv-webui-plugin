// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { FactList } from "../fact-list/fact-list";

interface NasFactsProps extends Omit<React.ComponentProps<"section">, "title"> {
  /** "This NAS". */
  title: React.ReactNode;
  /** At the end of the heading's line: "Show me around", which replays the first visit. */
  action?: React.ReactNode;
  /**
   * `grid`, the default: two columns, label over value (beside the first steps). `row`: one line of
   * facts across the width, when the facts stand alone (the steps moved up on a new NAS).
   */
  layout?: "grid" | "row";
  /** The heading's level: 2 by default. */
  headingLevel?: 2 | 3;
  /**
   * The facts, as `FactListItem`s with `FactListLabel` and `FactListValue`: every figure from
   * System.getInformation (`hostname`, `version`, `uptime`, `time`, `availablePkgUpdates`), formatted
   * by the app. A long value takes `span="full"`.
   */
  children: React.ReactNode;
}

/**
 * The NAS's own facts on the dashboard (rethink 6.2 E): a heading, an optional action at the end of
 * its line, and a `FactList` in its `grid` layout. On the page ground, no card. Any add-on this
 * interface does not draw is one fact here (style guide 10, rule 14).
 */
function NasFacts({
  title,
  action,
  layout = "grid",
  headingLevel = 2,
  className,
  children,
  ...props
}: NasFactsProps) {
  const titleId = React.useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      data-slot="nas-facts"
      aria-labelledby={titleId}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <header className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-0.5">
        <Heading id={titleId} className="text-section text-foreground">
          {title}
        </Heading>
        {action}
      </header>
      <FactList
        layout="grid"
        className={cn(
          layout === "row" &&
            "grid-cols-[repeat(auto-fit,minmax(9.375rem,1fr))] [&>[data-slot=fact-list-item]]:col-auto",
        )}
      >
        {children}
      </FactList>
    </section>
  );
}

export { NasFacts };
export type { NasFactsProps };
