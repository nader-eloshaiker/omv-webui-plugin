// SPDX-License-Identifier: GPL-3.0-or-later
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { LeavingItem } from "../leaving-item/leaving-item";
import { useLeavingItems } from "../leaving-item/use-leaving-items";
import { capAttention, orderAttention } from "../nas-answer/nas-answer-model";
import type { NasHealth } from "../nas-map/nas-map-model";
import { StatusIcon } from "../status/status";

interface AttentionItem {
  /** Stable across reads: a new id is a new problem, and rises in. */
  id: string;
  /** Only what is not OK needs anyone; an OK item is left out. */
  health: Exclude<NasHealth, "ok">;
  /** The status word, read before the title: "Warning". */
  healthLabel: string;
  /** What it is, as a short sentence without its full stop: "Disk sdb reports a problem". */
  title: React.ReactNode;
  /** One line: what it means and what still works. */
  detail?: React.ReactNode;
  /** The next step, a verb and an object: "See what to do". */
  actionLabel: React.ReactNode;
  /** Pressing it. */
  onAction?: () => void;
  /** Or the router's link it is: `<Link to=… />`. */
  render?: React.ReactElement;
}

interface AttentionListProps extends Omit<
  React.ComponentProps<"section">,
  "children"
> {
  /** What needs the person, in any order: shown worst first, equal ones in the order given. */
  items: readonly AttentionItem[];
  /** The region's name for assistive technology: "What needs you". The answer above heads it. */
  label: string;
  /** How many rows before "N more". 3 by default. */
  max?: number;
  /** "1 more", "2 more". */
  moreLabel: (count: number) => React.ReactNode;
  /** "Show fewer". */
  fewerLabel: React.ReactNode;
  /**
   * Whether the worst row's button is the screen's one filled accent (A2). True by default; the
   * others are outlined in the accent.
   */
  accent?: boolean;
}

/**
 * What needs the person (rethink 6.2 B, 7.6): only when something does. Rows on the page ground,
 * parted by hairlines, no card and no coloured edge: the status icon, the title, one line and the
 * next step, worst first. At most three, then "N more". A row that arrives after the first render
 * rises in at its place; one that no longer needs the person folds up and gives up its height.
 * Renders nothing while nothing needs the person.
 */
function AttentionList({
  items,
  label,
  max = 3,
  moreLabel,
  fewerLabel,
  accent = true,
  className,
  ...props
}: AttentionListProps) {
  const [all, setAll] = React.useState(false);
  const titleId = React.useId();
  // The rows there at first are not news; one that arrives later is.
  const [initial] = React.useState(() => new Set(items.map((a) => a.id)));
  const ordered = React.useMemo(() => orderAttention(items), [items]);
  const { shown, more } = React.useMemo(
    () => capAttention(ordered, all ? ordered.length : max),
    [ordered, all, max],
  );
  const { entries, left } = useLeavingItems(shown, (a) => a.id);
  if (entries.length === 0) {
    return null;
  }
  return (
    <section
      data-slot="attention-list"
      aria-labelledby={titleId}
      className={cn(
        "@container/attention flex flex-col items-stretch",
        className,
      )}
      {...props}
    >
      <h2 id={titleId} className="sr-only">
        {label}
      </h2>
      <ul className="border-y border-border">
        {entries.map(({ key, item, leaving }, i) => (
          <LeavingItem
            key={key}
            leaving={leaving}
            onLeft={() => {
              left(key);
            }}
            className="border-t border-border first:border-t-0"
          >
            <AttentionRow
              item={item}
              filled={accent && i === 0}
              arrived={!initial.has(key)}
            />
          </LeavingItem>
        ))}
      </ul>
      {more > 0 || all ? (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => {
            setAll(!all);
          }}
          className="-ms-2 mt-1.5 inline-flex cursor-pointer items-center gap-1 self-start rounded-sm px-2 py-1 text-sm text-link hover:bg-muted-strong [&_svg]:size-4 [&_svg]:transition-[rotate] [&_svg]:duration-base [&_svg]:ease-settle aria-expanded:[&_svg]:rotate-180"
        >
          <ChevronDown aria-hidden="true" />
          {all ? fewerLabel : moreLabel(more)}
        </button>
      ) : null}
    </section>
  );
}

const toneText = {
  warning: "text-warning-label",
  critical: "text-critical-label",
  unknown: "text-unknown-label",
} as const;

function AttentionRow({
  item,
  filled,
  arrived,
}: {
  item: AttentionItem;
  filled: boolean;
  arrived: boolean;
}) {
  return (
    <div
      data-slot="attention-row"
      data-health={item.health}
      data-arrived={arrived || undefined}
      className={cn(
        "grid min-h-14.5 grid-cols-[1.875rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 py-2 compact:min-h-9.5 compact:py-0.75",
        "@max-[37.5rem]/attention:grid-cols-[1.625rem_minmax(0,1fr)] @max-[37.5rem]/attention:items-start @max-[37.5rem]/attention:py-3",
        // A problem that arrives rises in at its place (7.6); one there at first is simply there.
        "data-[arrived]:animate-rise",
      )}
    >
      <span
        className={cn(
          "inline-flex justify-center @max-[37.5rem]/attention:pt-0.5",
          toneText[item.health],
        )}
      >
        <StatusIcon status={item.health} className="size-4.5" />
        <span className="sr-only">{item.healthLabel}:</span>
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5">
        <span className="text-body font-semibold text-foreground">
          {item.title}
        </span>
        {item.detail ? (
          <span className="text-sm text-muted-foreground">{item.detail}</span>
        ) : null}
      </span>
      <Button
        variant={filled ? "primary" : "primaryOutline"}
        size="md"
        render={item.render}
        onClick={item.onAction}
        className="@max-[37.5rem]/attention:col-start-2 @max-[37.5rem]/attention:min-h-11 @max-[37.5rem]/attention:w-full @max-[37.5rem]/attention:justify-center"
      >
        {item.actionLabel}
      </Button>
    </div>
  );
}

export { AttentionList };
export type { AttentionItem, AttentionListProps };
