// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface DeletePictureProps extends Omit<
  React.ComponentProps<"figure">,
  "children"
> {
  /** What is deleted, under the crossed folder: "Photos". */
  item: React.ReactNode;
  /** What uses it and stops working, one per cut link: "Windows share", "Copy job: nightly". */
  dependents: readonly { id: string; label: React.ReactNode }[];
  /**
   * The whole picture as one sentence, the figure's caption for screen readers: "Photos and its files
   * are deleted; the Windows share and the copy job that use it stop working."
   */
  caption: string;
}

const ROW = 32;
const GAP = 8;

/**
 * What a delete takes away (foundation 9, for the destructive confirmation): the thing crossed out,
 * its links cut, and each thing that depends on it named. The names are HTML beside the drawing, so
 * they reflow and translate; the lines are drawn to their rows. With nothing depending on it, only
 * the crossed folder is drawn.
 */
function DeletePicture({
  item,
  dependents,
  caption,
  className,
  ...props
}: DeletePictureProps) {
  const height = Math.max(
    80,
    dependents.length * ROW + (dependents.length - 1) * GAP,
  );
  const mid = (i: number) => i * (ROW + GAP) + ROW / 2;
  const top = (height - 80) / 2;
  return (
    <figure
      data-slot="delete-picture"
      className={cn("m-0 flex items-center gap-0", className)}
      {...props}
    >
      <div className="flex shrink-0 flex-col items-center gap-1">
        <svg
          aria-hidden="true"
          width="84"
          height="80"
          viewBox="0 0 84 80"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M14 14h22l6 6h28a4 4 0 014 4v40a4 4 0 01-4 4H14a4 4 0 01-4-4V18a4 4 0 014-4z"
            className="stroke-critical-stroke"
          />
          <path d="M24 32h22M24 42h32M24 52h16" className="stroke-art-faint" />
          <path
            d="M28 24l28 40M56 24L28 64"
            pathLength={1}
            strokeWidth={2.5}
            className="line-draw stroke-critical-stroke"
          />
        </svg>
        <span className="max-w-24 text-center text-caption font-semibold text-foreground [overflow-wrap:anywhere]">
          {item}
        </span>
      </div>
      {dependents.length > 0 ? (
        <>
          <svg
            aria-hidden="true"
            width="72"
            height={height}
            viewBox={`0 0 72 ${height}`}
            className="shrink-0 rtl:-scale-x-100"
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
          >
            {dependents.map((dependent, i) => {
              const y = mid(i);
              const from = top + 40;
              return (
                <g key={dependent.id}>
                  <path
                    d={`M0 ${from}C36 ${from} 36 ${y} 72 ${y}`}
                    strokeDasharray="4 4"
                    className="stroke-art-line"
                  />
                  <path
                    d={`M32 ${(from + y) / 2 - 4}l8 8M40 ${(from + y) / 2 - 4}l-8 8`}
                    strokeWidth={2}
                    className="stroke-critical-stroke"
                  />
                </g>
              );
            })}
          </svg>
          <ul className="flex min-w-0 flex-col gap-2">
            {dependents.map((dependent) => (
              <li
                key={dependent.id}
                className="flex h-8 min-w-0 items-center rounded-control border border-border-control px-2.5 text-caption font-medium text-muted-foreground"
              >
                <span className="truncate">{dependent.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

export { DeletePicture };
export type { DeletePictureProps };
