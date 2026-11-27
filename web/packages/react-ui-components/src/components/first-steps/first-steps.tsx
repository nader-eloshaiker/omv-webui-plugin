// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { Checklist, ChecklistItem } from "../checklist/checklist";

interface FirstStep {
  id: string;
  /** What to do: "Change the factory password". */
  title: React.ReactNode;
  /** One line on why, hidden in compact density: "The factory password may still work." */
  detail?: React.ReactNode;
  done: boolean;
  /** The step's button: "Change". */
  actionLabel: React.ReactNode;
  onAction?: () => void;
  /** Or the router's link it is. */
  render?: React.ReactElement;
}

interface FirstStepsProps extends Omit<
  React.ComponentProps<"section">,
  "title" | "children"
> {
  /** "First steps". */
  title: React.ReactNode;
  /** Beside the title, from the counts: "1 of 4 done". */
  progress: (done: number, total: number) => React.ReactNode;
  steps: readonly FirstStep[];
  /** Read after each step's title: "done", "not done". */
  stateLabels: { done: string; notDone: string };
  /**
   * The current step's button: `filled`, the screen's one filled accent, when nothing else on the
   * screen is (A2); `outline` otherwise. The other steps' buttons are neutral.
   */
  accent?: "filled" | "outline";
  /** The heading's level: 2 by default. */
  headingLevel?: 2 | 3;
  /**
   * `list`, the default: one step per row, its button at the row's end. `across`: a new NAS's first
   * steps laid across the full row as four stations of one path, each with its words over its button,
   * from 60rem of the list's own width; under that, the list. For a region that spans the page.
   */
  layout?: "list" | "across";
}

/** The steps across: one column per step from 60rem of the section's width, the buttons on one line. */
const acrossList =
  "@min-[60rem]/first-steps:grid-flow-col @min-[60rem]/first-steps:grid-cols-none @min-[60rem]/first-steps:auto-cols-fr @min-[60rem]/first-steps:gap-x-gutter @min-[60rem]/first-steps:gap-y-0";
const acrossItem =
  "@min-[60rem]/first-steps:col-span-1 @min-[60rem]/first-steps:grid-cols-[1.375rem_minmax(0,1fr)] @min-[60rem]/first-steps:grid-rows-[auto_1fr] " +
  "@min-[60rem]/first-steps:items-start @min-[60rem]/first-steps:gap-x-3 @min-[60rem]/first-steps:gap-y-2.5 " +
  "@min-[60rem]/first-steps:border-t-0 @min-[60rem]/first-steps:pt-3.5 @min-[60rem]/first-steps:pb-1 " +
  "@min-[60rem]/first-steps:[&>:last-child]:col-start-2 @min-[60rem]/first-steps:[&>:last-child]:self-end @min-[60rem]/first-steps:[&>:last-child]:justify-start";

/**
 * The first steps (rethink 6.2 E, P.3 G1, style guide 10 rule 9): a checklist, a tick when done and
 * an empty circle when not, no numbers and no rail, the current step's button in the accent. A step
 * done while the page is open draws its tick (7.2). Compact density keeps each step's title and
 * button and drops its line (owner decision 11). When every step is done, or tips are off, the page
 * shows `Shortcuts` in its place.
 */
function FirstSteps({
  title,
  progress,
  steps,
  stateLabels,
  accent = "filled",
  headingLevel = 2,
  layout = "list",
  className,
  ...props
}: FirstStepsProps) {
  const titleId = React.useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const current = steps.find((s) => !s.done)?.id;
  const done = steps.filter((s) => s.done).length;
  return (
    <section
      data-slot="first-steps"
      data-layout={layout}
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col",
        layout === "across" && "@container/first-steps",
        className,
      )}
      {...props}
    >
      <header className="mb-1.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5">
        <Heading id={titleId} className="text-section text-foreground">
          {title}
        </Heading>
        <p className="text-sm text-muted-foreground tabular-nums">
          {progress(done, steps.length)}
        </p>
      </header>
      <Checklist
        variant="steps"
        className={layout === "across" ? acrossList : undefined}
      >
        {steps.map((step) => {
          const isCurrent = step.id === current;
          return (
            <ChecklistItem
              key={step.id}
              state={step.done ? "done" : "notDone"}
              stateLabel={step.done ? stateLabels.done : stateLabels.notDone}
              title={step.title}
              aria-current={isCurrent ? "step" : undefined}
              className={layout === "across" ? acrossItem : undefined}
              action={
                step.done ? undefined : (
                  <Button
                    size="sm"
                    variant={
                      isCurrent
                        ? accent === "filled"
                          ? "primary"
                          : "primaryOutline"
                        : "neutral"
                    }
                    render={step.render}
                    onClick={step.onAction}
                  >
                    {step.actionLabel}
                  </Button>
                )
              }
            >
              {step.detail}
            </ChecklistItem>
          );
        })}
      </Checklist>
    </section>
  );
}

export { FirstSteps };
export type { FirstStep, FirstStepsProps };
