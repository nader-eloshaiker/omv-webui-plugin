// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { Crossfade } from "../crossfade/crossfade";
import { Icon, IconBadge } from "../icon/icon";
import type { NasHealth } from "../nas-map/nas-map-model";
import { Skeleton } from "../skeleton/skeleton";

const markClass = cva(
  "mt-0.5 inline-grid size-7.5 place-items-center text-muted-foreground compact:size-6 [&_svg]:size-full",
);

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
  /** One full short sentence: "Everything is working.", "Four things need you." */
  title: string;
  /** Its reason, one plain sentence. Leave it out when the first row of what needs you says it. */
  reason?: React.ReactNode;
  /** The first read is in flight: the sentence is this ("Reading the NAS…"), the mark a placeholder. */
  loading?: boolean;
  /** The heading's level: the dashboard's answer is its page's `h1`. */
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
 */
function NasAnswer({
  status,
  variant = "status",
  title,
  reason,
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
  return (
    <section
      data-slot="nas-answer"
      data-status={loading ? undefined : status}
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      className={cn(
        "grid grid-cols-[1.875rem_minmax(0,1fr)] items-start gap-x-3.5 gap-y-1 compact:grid-cols-[1.5rem_minmax(0,1fr)]",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Skeleton shape="block" className={cn(markClass(), "rounded-full")} />
      ) : (
        <Crossfade
          contentKey={markKey}
          aria-hidden="true"
          className={markClass()}
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
      <div className="min-w-0" aria-live="polite">
        <Heading
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="text-title text-balance text-foreground outline-hidden"
        >
          <Crossfade contentKey={title} reduced="cut">
            {title}
          </Crossfade>
        </Heading>
        {reason && !loading ? (
          <p className="mt-1 max-w-[70ch] text-body text-muted-foreground compact:mt-0">
            {reason}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export { NasAnswer };
export type { NasAnswerProps };
