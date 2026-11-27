// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { Crossfade } from "../crossfade/crossfade";
import { Icon, IconBadge } from "../icon/icon";
import type { NasHealth } from "../nas-map/nas-map-model";
import { Skeleton } from "../skeleton/skeleton";

const markClass = cva(
  "inline-grid place-items-center text-muted-foreground [&_svg]:size-full",
  {
    variants: {
      size: {
        title: "mt-0.5 size-7.5 compact:size-6",
        hero: "mt-1 size-11 compact:mt-0.5 compact:size-9",
      },
    },
    defaultVariants: { size: "title" },
  },
);

const gridClass = cva("grid items-start gap-y-1", {
  variants: {
    size: {
      title:
        "grid-cols-[1.875rem_minmax(0,1fr)] gap-x-3.5 compact:grid-cols-[1.5rem_minmax(0,1fr)]",
      hero: "grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4 compact:grid-cols-[2.25rem_minmax(0,1fr)]",
    },
  },
  defaultVariants: { size: "title" },
});

const titleClass = cva("text-balance text-foreground outline-hidden", {
  variants: {
    size: {
      title: "text-title",
      // The dashboard's one headline: the hero step, the display step in compact density.
      hero: "text-hero",
    },
  },
  defaultVariants: { size: "title" },
});

interface NasAnswerProps extends Omit<
  React.ComponentProps<"section">,
  "title" | "children"
> {
  /** The state the answer says, shown as its mark beside the sentence. */
  status: NasHealth;
  /**
   * `status`: the state's own mark. `welcome`: the NAS instead, for a new NAS, whose answer claims
   * nothing about health.
   */
  variant?: "status" | "welcome";
  /**
   * `title`, the default: the Title step, the answer under a welcome that holds the page's headline.
   * `hero`: the page's one headline (the Hero step, the Display step in compact density), its mark
   * larger to match, for the everyday dashboard where no welcome is shown.
   */
  size?: "title" | "hero";
  /** One full short sentence: "Everything is working.", "Four things need you." */
  title: string;
  /** Its reason, one plain sentence. Leave it out when the first row of what needs you says it. */
  reason?: React.ReactNode;
  /**
   * The one thing to do about the answer, under its reason: a `Button` of size `sm`, such as "Check
   * disk health". Give it the `primary` variant when it is the screen's one next step and nothing
   * else holds the accent; `neutral` otherwise. Outside the answer's live region, so a button's
   * changing words are not read out as a new answer. Not shown while `loading`.
   */
  action?: React.ReactNode;
  /**
   * A sentence under the reason and the action, in the body size: what still holds ("You could also
   * put sde to use."). Not shown while `loading`.
   */
  after?: React.ReactNode;
  /**
   * A small drawing at the far end of the answer's row (the NAS's front, say), centred on the
   * words. Under 48rem of the answer's own width it moves under them. The answer then takes the
   * whole width of its row.
   */
  aside?: React.ReactNode;
  /** The first read is in flight: the sentence is this ("Reading the NAS…"), the mark a placeholder. */
  loading?: boolean;
  /**
   * The heading's level: the dashboard's answer is its page's `h1`; under a welcome that holds the
   * `h1`, an `h2`.
   */
  headingLevel?: 1 | 2;
  /**
   * The heading, for the page to move focus to it (after a navigation, or when what held focus
   * went). It takes focus from code only (`tabIndex` -1), never from the Tab key.
   */
  titleRef?: React.Ref<HTMLHeadingElement>;
}

/**
 * The dashboard's answer (rethink 6.2 A): one full short sentence and its reason, left-aligned on
 * the page ground, its state's mark beside it. No chips or pills under it (style guide 10): what
 * needs the person lists the rest, and the map shows each thing's state in place. When the answer
 * changes (a problem arrives, it resolves) the mark and the words crossfade; the first answer is
 * simply there. The words come from `nasAnswerState` and the app's catalogue, so a read that failed
 * or has not arrived can never read "Everything is working".
 *
 * The everyday dashboard sets it as its headline (`size="hero"`), the check it waits for as its
 * `action`, what still holds `after` it, and the small drawing of the NAS as its `aside`.
 */
function NasAnswer({
  status,
  variant = "status",
  size = "title",
  title,
  reason,
  action,
  after,
  aside,
  loading = false,
  headingLevel = 1,
  titleRef,
  className,
  ...props
}: NasAnswerProps) {
  const titleId = React.useId();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  // The badge crossfades its own shape when the status changes (7.7); the NAS mark and the badge
  // swap by a crossfade.
  const markKey = variant;
  const hasAside = aside !== undefined && aside !== null && aside !== false;
  const words = (
    <div className={cn("min-w-0", hasAside && "max-w-[40rem]")}>
      <div aria-live="polite">
        <Heading
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className={titleClass({ size })}
        >
          <Crossfade contentKey={title} reduced="cut">
            {title}
          </Crossfade>
        </Heading>
        {reason && !loading ? (
          <p
            className={cn(
              "max-w-[70ch] text-body text-muted-foreground",
              size === "hero" ? "mt-1.5 compact:mt-1" : "mt-1 compact:mt-0",
            )}
          >
            {reason}
          </p>
        ) : null}
      </div>
      {action && !loading ? (
        <div data-slot="nas-answer-action" className="mt-3.5 compact:mt-2.5">
          {action}
        </div>
      ) : null}
      {after && !loading ? (
        <div
          data-slot="nas-answer-after"
          className="mt-3 text-body text-muted-foreground"
        >
          {after}
        </div>
      ) : null}
    </div>
  );
  return (
    <section
      data-slot="nas-answer"
      data-status={loading ? undefined : status}
      data-size={size}
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      className={cn(
        gridClass({ size }),
        hasAside && "@container/nas-answer",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Skeleton
          shape="block"
          className={cn(markClass({ size }), "rounded-full")}
        />
      ) : (
        <Crossfade
          contentKey={markKey}
          aria-hidden="true"
          className={markClass({ size })}
        >
          {variant === "welcome" ? (
            <Icon name="nas" size={24} motion="none" />
          ) : (
            <svg viewBox="0 0 24 24">
              <IconBadge
                status={status}
                cx={12}
                cy={12}
                r={10}
                strokeWidth={1.5}
              />
            </svg>
          )}
        </Crossfade>
      )}
      {hasAside ? (
        // The words, then the drawing at the row's far end from 48rem; under that, under the words.
        <div className="grid min-w-0 gap-y-3.5 @3xl/nas-answer:grid-cols-[minmax(0,max-content)_minmax(0,1fr)] @3xl/nas-answer:gap-x-8">
          {words}
          <div
            data-slot="nas-answer-aside"
            className="min-w-0 justify-self-start @3xl/nas-answer:self-center @3xl/nas-answer:justify-self-end"
          >
            {aside}
          </div>
        </div>
      ) : (
        words
      )}
    </section>
  );
}

export { NasAnswer };
export type { NasAnswerProps };
