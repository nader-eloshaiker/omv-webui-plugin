// SPDX-License-Identifier: GPL-3.0-or-later
// Story frames only: a card as a page would hold the drawing, the two densities side by side, and a
// phone's width. Both themes come from the toolbar.
import type * as React from "react";
import { cn } from "../utils";

/** A raised card, as a page composes a chart or a drawing. */
export function StoryCard({
  title,
  className,
  children,
}: {
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-card p-card surface-raised",
        className,
      )}
    >
      {title ? <h3 className="text-section text-foreground">{title}</h3> : null}
      {children}
    </section>
  );
}

/** Comfortable (Sky) and compact (Instrument's values) side by side, as the density switch gives them. */
export function BothDensities({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div data-density="comfortable" className="flex min-w-0 flex-col gap-2">
        <p className="text-caption font-semibold text-tertiary-foreground">
          Comfortable
        </p>
        {children}
      </div>
      <div data-density="compact" className="flex min-w-0 flex-col gap-2">
        <p className="text-caption font-semibold text-tertiary-foreground">
          Compact
        </p>
        {children}
      </div>
    </div>
  );
}

/** 390px wide with the 16px gutter, as on a phone. */
export function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[390px] max-w-full rounded-card bg-page px-4 py-4 ring-1 ring-border">
      {children}
    </div>
  );
}
