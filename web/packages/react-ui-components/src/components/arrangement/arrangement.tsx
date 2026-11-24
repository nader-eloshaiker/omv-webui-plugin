// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import { ShieldCheck, ShieldOff } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import {
  blockLayout,
  diskNumbers,
  losesDataOnOneFailure,
  type ArrangementKind,
} from "./arrangement-model";

interface ArrangementOption {
  /** Stable across renders. */
  id: string;
  /** How the blocks are laid out: copies on every disk, spread across them, or spread with parity. */
  kind: ArrangementKind;
  /** How many disks to draw, 2 to 6 (3 or more for parity). */
  disks: number;
  /** Its name: "Mirror", "Parity (RAID 5, RAID-Z1)". */
  title: React.ReactNode;
  /** The space it gives: "Half the space: 3.6 TiB from two 3.6 TiB disks". */
  usable: React.ReactNode;
  /** What it survives, in words: "Keeps working when one disk fails". */
  survives: React.ReactNode;
  /** What is lost while one disk is shown failing: "Nothing is lost: the other disk has every block." */
  whenFailing: React.ReactNode;
  /** The layout the pool uses now, marked with `currentLabel`. */
  current?: boolean;
}

interface ArrangementProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  options: readonly ArrangementOption[];
  /** The question it answers, as its heading: "What happens if a disk fails?" */
  question: React.ReactNode;
  /** The button's words: "Show a disk failing", and once pressed "Bring the disk back". */
  showFailingLabel: React.ReactNode;
  hideFailingLabel: React.ReactNode;
  /** The tag on the current option: "pool uses this". */
  currentLabel?: React.ReactNode;
  /** The letter on a parity block: "P". */
  parityLetter: string;
  /** Controlled: whether a disk is shown failing. */
  failing?: boolean;
  defaultFailing?: boolean;
  onFailingChange?: (failing: boolean) => void;
}

const blockClass = cva("transition-[fill,stroke,opacity] duration-base", {
  variants: {
    part: {
      data: "fill-art-surface stroke-trace",
      parity: "fill-none stroke-art-line",
      // Lost: dashed in the critical stroke, only where data is really gone (foundation 7.2).
      lost: "fill-none stroke-critical-stroke",
    },
  },
});
const letterClass = cva("text-xs font-semibold", {
  variants: {
    part: {
      data: "fill-foreground",
      parity: "fill-muted-foreground",
      lost: "fill-critical-label",
    },
  },
});

/**
 * How disks combine, drawn as blocks on disks for mirror, stripe and parity (foundation 9), with
 * "Show a disk failing": one disk greys and is crossed through, and blocks go dashed red only where
 * data is lost, so the question "what do I lose if a disk dies?" is answered before anyone commits to
 * a layout. The words beside each drawing say the same, and the change is announced.
 */
function Arrangement({
  options,
  question,
  showFailingLabel,
  hideFailingLabel,
  currentLabel,
  parityLetter,
  failing: failingProp,
  defaultFailing = false,
  onFailingChange,
  className,
  ...props
}: ArrangementProps) {
  const [own, setOwn] = React.useState(defaultFailing);
  const failing = failingProp ?? own;
  const toggle = () => {
    const next = !failing;
    if (failingProp === undefined) {
      setOwn(next);
    }
    onFailingChange?.(next);
  };
  const headId = React.useId();
  return (
    <div
      data-slot="arrangement"
      data-failing={failing ? "" : undefined}
      role="group"
      aria-labelledby={headId}
      className={cn("@container flex flex-col gap-3.5", className)}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p id={headId} className="font-semibold text-foreground">
          {question}
        </p>
        <Button
          variant="neutral"
          size="sm"
          aria-pressed={failing}
          onClick={toggle}
        >
          {failing ? hideFailingLabel : showFailingLabel}
        </Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
        {options.map((option) => {
          const disks = Math.max(2, Math.min(6, option.disks));
          const rows = blockLayout(option.kind, disks).map((row, r) => ({
            row,
            r,
          }));
          const lost = failing && losesDataOnOneFailure(option.kind);
          const width = disks * 44 + (disks - 1) * 12;
          return (
            <li
              key={option.id}
              data-kind={option.kind}
              data-current={option.current ? "" : undefined}
              className={cn(
                "flex flex-wrap gap-3.5 rounded-control bg-muted p-3.5 ring-1 ring-border ring-inset",
                option.current && "ring-2 ring-action",
              )}
            >
              <svg
                aria-hidden="true"
                width={width}
                height={124}
                viewBox={`0 0 ${width} 124`}
                className="shrink-0 overflow-visible"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {diskNumbers(disks).map((d) => {
                  const x = d * 56;
                  const dead = failing && d === 0;
                  return (
                    <g
                      key={`disk-${d}`}
                      data-dead={dead ? "" : undefined}
                      className={cn(
                        "transition-opacity duration-slow",
                        dead && "opacity-35",
                      )}
                    >
                      <rect
                        x={x + 1}
                        y={1}
                        width={42}
                        height={122}
                        rx={6}
                        className="fill-surface stroke-art-line"
                      />
                      {rows.map(({ row, r }) => {
                        const letter = row[d];
                        const part = lost
                          ? "lost"
                          : letter === null
                            ? "parity"
                            : "data";
                        return (
                          <g key={`row-${r}`} data-part={part}>
                            <rect
                              x={x + 7}
                              y={10 + r * 30}
                              width={30}
                              height={22}
                              rx={3}
                              strokeDasharray={
                                part === "data" ? undefined : "3 2"
                              }
                              className={blockClass({ part })}
                            />
                            <text
                              x={x + 22}
                              y={25 + r * 30}
                              textAnchor="middle"
                              className={letterClass({ part })}
                            >
                              {letter ?? parityLetter}
                            </text>
                          </g>
                        );
                      })}
                      {dead ? (
                        <path
                          data-slot="arrangement-cross"
                          d={`M${x + 6} 6L${x + 38} 118M${x + 38} 6L${x + 6} 118`}
                          pathLength={1}
                          strokeWidth={2.5}
                          className="line-draw fill-none stroke-critical-stroke"
                        />
                      ) : null}
                    </g>
                  );
                })}
              </svg>
              <div className="flex min-w-0 flex-[1_1_9rem] flex-col gap-1 text-sm text-muted-foreground">
                <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold text-foreground">
                  {option.title}
                  {option.current && currentLabel ? (
                    <span className="rounded-full bg-selected px-2 text-xs font-semibold text-action-label">
                      {currentLabel}
                    </span>
                  ) : null}
                </p>
                <p>{option.usable}</p>
                {/* A risk is not a monitored state: a neutral glyph, never a status hue (foundation 3.3). */}
                <p className="flex items-start gap-1.5 font-medium text-foreground">
                  {losesDataOnOneFailure(option.kind) ? (
                    <ShieldOff
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                  ) : (
                    <ShieldCheck
                      aria-hidden="true"
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                  )}
                  {option.survives}
                </p>
                <p aria-live="polite" className="text-foreground">
                  {failing ? option.whenFailing : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { Arrangement };
export type { ArrangementKind, ArrangementOption, ArrangementProps };
