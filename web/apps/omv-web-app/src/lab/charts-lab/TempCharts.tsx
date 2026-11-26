// SPDX-License-Identifier: GPL-3.0-or-later
// Two ways to draw the disks' temperatures across the bay (owner, round two): DiskMgmt.getList
// `temperature` and `powermode` (a read that never wakes a sleeping disk, so a disk in standby has
// no figure), and the alert limit from Smart.getSettings `tempmax` (Smart.getDeviceSettings
// `tempmax` for one disk), drawn only when the admin set one. One reading, when the page opened: no
// history. Development only (UI-11).
//
// The marks are the usage blue, one hue for "how warm"; a disk at or past its alert limit takes the
// warning colour only together with the sentence that says so.
import {
  StatusIcon,
  StatusLabel,
  Tooltip,
} from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useRef } from "react";
import { useWidth } from "../reel/stages/useWidth.ts";
import type { DiskTemp } from "./model.ts";
import {
  bayPerRow,
  bayRows,
  celsius,
  diskCount,
  listWords,
  overLimit,
  sharedLimit,
  stackLayout,
  stackRange,
  stacksOf,
  tempScale,
} from "./model.ts";

const v = (name: string, value: number) =>
  ({ [name]: String(value) }) as CSSProperties;

function asleepOf(disks: readonly DiskTemp[]): string[] {
  return disks.filter((d) => d.asleep).map((d) => d.device);
}

/** The marker's shape says the kind of disk, so the chart does not lean on colour. */
function Marker({ kind, m }: { kind: DiskTemp["kind"]; m: number }) {
  const h = m / 2;
  if (kind === "ssd") {
    const s = h * 0.86;
    return (
      <rect
        x={-s}
        y={-s}
        width={2 * s}
        height={2 * s}
        rx={Math.max(1, s / 3)}
      />
    );
  }
  if (kind === "nvme") {
    return (
      <path
        d={`M0 ${String(-h)}L${String(h)} 0L0 ${String(h)}L${String(-h)} 0Z`}
      />
    );
  }
  return <circle r={h * 0.88} />;
}

function AsleepNote({ disks }: { disks: readonly DiskTemp[] }) {
  const asleep = asleepOf(disks);
  if (asleep.length === 0) {
    return null;
  }
  return (
    <p className="ch-note">
      {listWords(asleep)} {asleep.length === 1 ? "is" : "are"} asleep, so{" "}
      {asleep.length === 1 ? "its temperature was" : "their temperatures were"}{" "}
      not read: the disk list never wakes a disk to read it.
    </p>
  );
}

/** The disks at or past their limit, in words: the only place the warning colour is explained. */
function OverNote({ disks }: { disks: readonly DiskTemp[] }) {
  const over = disks.filter(overLimit);
  const first = over[0];
  if (first === undefined || first.limit === null) {
    return null;
  }
  const words = listWords(
    over.map((d) => `${d.device} is at ${celsius(d.c ?? 0)}`),
  );
  return (
    <p className="ch-note ch-over-note">
      <StatusLabel status="warning">
        {`${words}, at or over the alert limit of ${celsius(first.limit)}.`}
      </StatusLabel>
    </p>
  );
}

/** What a screen reader reads instead of the drawing: each degree with its disks, coolest first. */
function TextList({
  disks,
  readAt,
}: {
  disks: readonly DiskTemp[];
  readAt: string;
}) {
  return (
    <ul className="ch-sr" aria-label={`Disk temperatures read at ${readAt}`}>
      {stacksOf(disks).map((s) => (
        <li key={s.c}>
          {`${celsius(s.c)}: ${listWords(s.disks.map((d) => d.device))}${s.disks.some(overLimit) ? ", at or over the alert limit" : ""}.`}
        </li>
      ))}
    </ul>
  );
}

// ─── A. Along one scale, stacked ──────────────────────────────────────────────────────────────

/** The axis under the columns: a tick a degree, a longer one every 5, each column's degree written. */
const AXIS_PX = 20;
const LIMIT_ROW_PX = 20;

/**
 * Every disk as a marker on one temperature scale; disks at the same whole degree stack upward into
 * a column, so the spread reads like a histogram and no marker hides another. A column of up to
 * three names its disks; a taller one says how many and names them on pointer or focus. The hottest
 * column always names its disks. The alert limit is a dashed line with its value under the axis.
 */
export function TempStacks({
  disks,
  readAt,
}: {
  disks: readonly DiskTemp[];
  readAt: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useWidth(ref);
  const width = Math.round(measured > 0 ? measured : 640);
  const limit = sharedLimit(disks);
  const stacks = stacksOf(disks);
  const { lo, hi } = stackRange(stacks, limit);
  const layout = stackLayout(stacks, { width, lo, hi });
  const xOf = (c: number) => layout.x0 + c * layout.perDegree;
  const plotH = layout.height;
  const total = plotH + AXIS_PX + (limit === null ? 0 : LIMIT_ROW_PX);
  const degrees: number[] = [];
  for (let c = lo; c <= hi; c += 1) {
    degrees.push(c);
  }
  const limitX = limit === null ? null : xOf(limit);
  // The limit's words go right of its line, or left of it when they would run off the chart.
  const limitLeft = limitX !== null && limitX + 120 > width;
  return (
    <div className="ch-st">
      <TextList disks={disks} readAt={readAt} />
      <div ref={ref} className="ch-st-plot" style={v("--h", total)}>
        <svg
          className="ch-st-svg"
          aria-hidden="true"
          focusable="false"
          width={width}
          height={total}
          viewBox={`0 0 ${String(width)} ${String(total)}`}
        >
          {degrees.map((c) => (
            <path
              key={c}
              d={`M${xOf(c).toFixed(1)} ${String(plotH)}v${c % 5 === 0 ? "6" : "3"}`}
              className="ch-tick"
            />
          ))}
          <path
            d={`M0 ${String(plotH)}H${String(width)}`}
            className="ch-base"
          />
          {limitX === null ? null : (
            <path
              d={`M${limitX.toFixed(1)} 0V${String(total - 4)}`}
              className="ch-st-limit"
            />
          )}
          {layout.stacks.map((s) =>
            s.label.leader ? (
              <path
                key={`l${String(s.c)}`}
                d={`M${s.x.toFixed(1)} ${(plotH - s.top - 1).toFixed(1)}V${(plotH - s.label.box.y1).toFixed(1)}`}
                className="ch-st-leader"
              />
            ) : null,
          )}
          {layout.stacks.map((s) =>
            s.disks.map((d, i) => {
              const p = s.markers[i] ?? { x: s.x, y: 0 };
              return (
                <g
                  key={d.device}
                  className="ch-st-mark"
                  data-over={overLimit(d) || undefined}
                  transform={`translate(${p.x.toFixed(1)} ${(plotH - p.y).toFixed(1)})`}
                >
                  <Marker kind={d.kind} m={layout.m} />
                </g>
              );
            }),
          )}
          {layout.axis.map((a) => (
            <text
              key={a.c}
              x={a.x.toFixed(1)}
              y={plotH + 17}
              textAnchor="middle"
              className="ch-st-degree"
            >
              {String(a.c)}
            </text>
          ))}
        </svg>
        {layout.stacks.map((s) => {
          const style = {
            ...v("--left", s.label.box.x1),
            ...v("--top", plotH - s.label.box.y2),
            ...v("--lw", s.label.box.x2 - s.label.box.x1),
          };
          if (s.label.kind === "count") {
            return (
              <Tooltip
                key={s.c}
                content={`${celsius(s.c)}: ${listWords(s.disks.map((d) => d.device))}`}
              >
                <button
                  type="button"
                  className="ch-st-count"
                  aria-label={`${diskCount(s.disks.length)} at ${celsius(s.c)}`}
                  style={style}
                >
                  {s.label.lines[0]}
                </button>
              </Tooltip>
            );
          }
          return (
            <span
              key={s.c}
              className="ch-st-names"
              aria-hidden="true"
              style={style}
            >
              {s.label.lines.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </span>
          );
        })}
        {limit === null || limitX === null ? null : (
          <span
            className="ch-st-limit-words"
            data-side={limitLeft ? "left" : undefined}
            aria-hidden="true"
            style={{
              ...v("--x", limitX),
              ...v("--top", plotH + AXIS_PX + 2),
            }}
          >
            Alert at {celsius(limit)}
          </span>
        )}
      </div>
      <p className="ch-key ch-st-key">
        <span>Each marker is one disk at its whole degree Celsius:</span>
        <span className="ch-key-item">
          <svg
            viewBox="-7 -7 14 14"
            className="ch-st-key-mark"
            aria-hidden="true"
          >
            <Marker kind="hdd" m={12} />
          </svg>
          hard disk
        </span>
        <span className="ch-key-item">
          <svg
            viewBox="-7 -7 14 14"
            className="ch-st-key-mark"
            aria-hidden="true"
          >
            <Marker kind="ssd" m={12} />
          </svg>
          SSD
        </span>
        <span className="ch-key-item">
          <svg
            viewBox="-7 -7 14 14"
            className="ch-st-key-mark"
            aria-hidden="true"
          >
            <Marker kind="nvme" m={12} />
          </svg>
          NVMe
        </span>
      </p>
      <OverNote disks={disks} />
      <AsleepNote disks={disks} />
    </div>
  );
}

// ─── B. In bay order, as caddies ──────────────────────────────────────────────────────────────

/** A slot's width and the gap between two, in pixels (the caddy is 44px wide, 36px compact). */
const SLOT_PX = 48;
const SLOT_GAP = 8;
/** The chassis's padding either side. */
const CHASSIS_PAD = 14;

/** The caddy's level window in its 56 × 120 drawing, above the handle. */
const WIN = { x: 10, y: 10, w: 36, h: 72 };

/**
 * Each disk in its place in the bay, drawn as its caddy, with its temperature as a level in the
 * caddy's window on one shared scale. The alert limit is one dashed line straight across every slot
 * of a row. A sleeping disk shows "Asleep" and no level.
 */
export function TempCaddies({
  disks,
  readAt,
}: {
  disks: readonly DiskTemp[];
  readAt: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const measured = useWidth(ref);
  const width = measured > 0 ? measured : 640;
  const limit = sharedLimit(disks);
  const { lo, hi } = tempScale(disks, limit);
  const at = (c: number) => Math.min(1, Math.max(0, (c - lo) / (hi - lo)));
  const perRow = bayPerRow(
    disks.length,
    width - 2 * CHASSIS_PAD,
    SLOT_PX,
    SLOT_GAP,
  );
  const rows = bayRows(disks, perRow);
  return (
    <div className="ch-bay-wrap" ref={ref}>
      <TextList disks={disks} readAt={readAt} />
      <div className="ch-bay" aria-hidden="true">
        {rows.map((row) => (
          <div
            key={row[0]?.device ?? "row"}
            className="ch-bay-row"
            style={v("--per-row", row.length)}
          >
            {row.map((d) => {
              const k = d.c === null ? 0 : at(d.c);
              return (
                <div
                  key={d.device}
                  className="ch-bay-slot"
                  data-asleep={d.asleep || undefined}
                  data-over={overLimit(d) || undefined}
                >
                  <svg
                    viewBox="0 0 56 120"
                    className="ch-bay-caddy"
                    focusable="false"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="52"
                      height="116"
                      rx="6"
                      className="ch-bay-body"
                    />
                    <rect
                      x={WIN.x}
                      y={WIN.y}
                      width={WIN.w}
                      height={WIN.h}
                      rx="3"
                      className="ch-bay-window"
                    />
                    {d.c === null ? null : (
                      <rect
                        x={WIN.x}
                        y={WIN.y + WIN.h * (1 - k)}
                        width={WIN.w}
                        height={WIN.h * k}
                        rx="3"
                        className="ch-bay-level"
                      />
                    )}
                    <rect
                      x={WIN.x}
                      y={WIN.y}
                      width={WIN.w}
                      height={WIN.h}
                      rx="3"
                      className="ch-bay-window-edge"
                    />
                    <rect
                      x="10"
                      y="90"
                      width="36"
                      height="18"
                      rx="4"
                      className="ch-bay-handle"
                    />
                    {d.kind === "hdd" ? null : (
                      <path d="M18 99h20" className="ch-bay-faint" />
                    )}
                  </svg>
                  <span className="ch-bay-device">{d.device}</span>
                  <span className="ch-bay-value">
                    {d.c === null ? (
                      d.asleep ? (
                        "Asleep"
                      ) : (
                        "Not read"
                      )
                    ) : overLimit(d) ? (
                      <>
                        <StatusIcon status="warning" />
                        {celsius(d.c)}
                      </>
                    ) : (
                      celsius(d.c)
                    )}
                  </span>
                </div>
              );
            })}
            {limit === null ? null : (
              <span className="ch-bay-limit" style={v("--y", at(limit))} />
            )}
          </div>
        ))}
      </div>
      <p className="ch-note">
        Each caddy fills from {celsius(lo)} at the bottom of its window to{" "}
        {celsius(hi)} at the top
        {limit === null
          ? "."
          : `, and the dashed line across the caddies is the alert limit, ${celsius(limit)}.`}
      </p>
      <OverNote disks={disks} />
      <AsleepNote disks={disks} />
    </div>
  );
}
