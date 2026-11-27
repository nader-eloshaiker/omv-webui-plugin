// SPDX-License-Identifier: GPL-3.0-or-later
// The NAS at a glance (journal 2026-11-27): one status per area under the answer, each its status
// icon and coloured word with a short count, read as one line the way an instrument's status row is
// read before its dials. Labelled values in a row, in sentence case: never pills, no uppercase label,
// no separator glyph and no arrow (style guide 10). Each value is a link to its part of the page,
// which takes the jump highlight once when it lands.
//
// It stands on its own strip, the raised surface, because it is read as one. The words come from the
// caller; the library knows no area.
import type * as React from "react";
import { cn } from "../../utils";
import { StatusLabel } from "../status/status";

/** The health of an area: the four a reading can have. */
export type ScanLineTone = "ok" | "warning" | "critical" | "unknown";

/** One area of the NAS. */
export interface ScanLineArea {
  id: string;
  /** The area's name, over its value: "Disks". */
  label: string;
  tone: ScanLineTone;
  /** The status word beside its icon, in the tone's ink: "Not checked", "OK", "Almost full". */
  status: string;
  /** The short count after it: "6 disks, 1 asleep", "enp2s0 at 1 Gbit/s". */
  value?: string;
  /**
   * The id of the part of the page the link lands on. It is scrolled to, takes focus (so give it
   * `tabIndex={-1}`) and is ringed once.
   */
  targetId: string;
  /** For assistive technology, after the visible words: "Go to the disk temperatures". */
  goTo?: string;
}

interface ScanLineProps extends Omit<
  React.ComponentProps<"nav">,
  "children" | "aria-label"
> {
  areas: readonly ScanLineArea[];
  /** The line's accessible name: "The NAS at a glance". */
  label: string;
}

/**
 * Scrolls to the part and rings it once (the arrival highlight), as a link inside the page does: the
 * part takes focus without a second scroll, and a second press plays the ring again. A press with a
 * modifier key is left to the browser.
 */
function jump(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const target = event.currentTarget.ownerDocument.getElementById(id);
  if (!target) {
    return;
  }
  event.preventDefault();
  target.scrollIntoView({ block: "start" });
  target.classList.remove("animate-arrive");
  // A new frame, so the ring plays again on a second press.
  requestAnimationFrame(() => {
    target.classList.add("animate-arrive");
  });
  target.focus({ preventScroll: true });
}

/**
 * One status per area, in a row on the raised strip (two by two under 48rem of its own width). Each
 * cell is a link named by its words, in the order they show, then where it goes.
 */
function ScanLine({ areas, label, className, ...props }: ScanLineProps) {
  return (
    <nav
      data-slot="scan-line"
      aria-label={label}
      className={cn(
        "@container/scanline min-w-0 rounded-lg border border-border surface-raised",
        className,
      )}
      {...props}
    >
      <ul className="m-0 grid list-none auto-cols-fr grid-flow-col p-0 @max-[48rem]/scanline:grid-flow-row @max-[48rem]/scanline:grid-cols-2">
        {areas.map((area) => (
          <li
            key={area.id}
            data-tone={area.tone}
            className="min-w-0 border-border not-first:border-s @max-[48rem]/scanline:odd:border-s-0 @max-[48rem]/scanline:nth-[n+3]:border-t"
          >
            <a
              href={`#${area.targetId}`}
              onClick={(event) => {
                jump(event, area.targetId);
              }}
              className="flex h-full flex-col gap-1 rounded-lg px-[18px] py-3.5 text-inherit no-underline transition-colors hover:bg-muted-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring compact:px-3 compact:py-2"
            >
              <span className="text-caption text-muted-foreground">
                {area.label}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-body">
                <StatusLabel status={area.tone} className="font-semibold">
                  {area.status}
                </StatusLabel>
                {area.value ? (
                  <span className="text-muted-foreground">{area.value}</span>
                ) : null}
              </span>
              {area.goTo ? <span className="sr-only">{area.goTo}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { ScanLine };
export type { ScanLineProps };
