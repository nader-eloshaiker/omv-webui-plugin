// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { cn } from "../../utils";
import { Skeleton } from "../skeleton/skeleton";

type PageAnswerProps = useRender.ComponentProps<"section">;

/**
 * The answer a top-level page opens with (foundation principle 1): on the page ground under the
 * ambient light, never a card. Compose it from its parts, in this order:
 *
 * ```tsx
 * <PageAnswer aria-labelledby={titleId}>
 *   <PageAnswerBody>
 *     <PageTitle id={titleId} variant="eyebrow">Dashboard</PageTitle>   (the page's h1, the app's)
 *     <PageAnswerKicker><StatusPill …/> <Identifier>nas</Identifier> Updated at 10:42:07</PageAnswerKicker>
 *     <PageAnswerHeadline ref={headlineRef}>2 things need you</PageAnswerHeadline>
 *     <PageAnswerDescription>Worst first: Data is almost full.</PageAnswerDescription>
 *     <PageAnswerAction><Button variant="secondary">Check disk health</Button></PageAnswerAction>
 *   </PageAnswerBody>
 *   <PageAnswerAside><HealthRing size="lg" legend="beside" … /></PageAnswerAside>
 * </PageAnswer>
 * ```
 *
 * The aside sits beside the words once the answer is 600px wide and moves under the headline below
 * that; the answer's own width decides, not the window's. It rises in once, on mount, and its space
 * follows the density (32px over, 24px under; 16px and 12px compact). While the first read is in
 * flight, put `PageAnswerHeadlineSkeleton` and `Skeleton` lines in place of the words, a
 * `HealthRingSkeleton` in the aside, and `aria-busy` with a polite "Loading …" on the section.
 */
function PageAnswer({
  render,
  className,
  children,
  ...props
}: PageAnswerProps) {
  return useRender({
    render,
    defaultTagName: "section",
    props: {
      "data-slot": "page-answer",
      className: cn(
        "@container/answer min-w-0 pt-8 pb-6 motion-safe:animate-rise compact:pt-4 compact:pb-3",
        className,
      ),
      ...props,
      children: (
        <div className="flex flex-col gap-x-10 gap-y-5 @min-[37.5rem]/answer:flex-row @min-[37.5rem]/answer:items-center @min-[37.5rem]/answer:justify-between">
          {children}
        </div>
      ),
    },
  });
}

/** The words of the answer: the page title, the kicker, the headline, the sub-lines and the action. */
function PageAnswerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-answer-body"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-start gap-2",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The line over the headline: the overall state's pill, the host name, how fresh the figures are.
 * Caption size, tabular figures. For a stale read, give it `role="status"` so the change is said once.
 */
function PageAnswerKicker({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-answer-kicker"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-tertiary-foreground tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The answer in one line, the display step, always in the foreground ink (never a status hue: the
 * pill and the ring carry the colour). Not a heading: it changes with every read, so the page title
 * stays the landmark. Focusable from script (`tabIndex={-1}`), so focus can land on it when the
 * button that had it goes; pass `ref` to move it there.
 */
function PageAnswerHeadline({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-answer-headline"
      tabIndex={-1}
      className={cn(
        "text-display text-balance text-foreground outline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

/** One plain sentence under the headline, at most two lines; a second one for an area not read. */
function PageAnswerDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-answer-description"
      className={cn("max-w-[60ch] text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The one next step, only when the state calls for it: a secondary button or a link. */
function PageAnswerAction({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-answer-action"
      className={cn("mt-2 flex flex-wrap items-center gap-3", className)}
      {...props}
    />
  );
}

/** The picture beside the words: the page's `HealthRing`. */
function PageAnswerAside({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-answer-aside"
      className={cn("min-w-0 shrink-0", className)}
      {...props}
    />
  );
}

/** The headline while the first read is in flight: a bar at the display step's line height, 60% wide. */
function PageAnswerHeadlineSkeleton({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <Skeleton
      data-slot="page-answer-headline-skeleton"
      className={cn("w-3/5 text-display", className)}
      {...props}
    />
  );
}

export {
  PageAnswer,
  PageAnswerAction,
  PageAnswerAside,
  PageAnswerBody,
  PageAnswerDescription,
  PageAnswerHeadline,
  PageAnswerHeadlineSkeleton,
  PageAnswerKicker,
};
export type { PageAnswerProps };
