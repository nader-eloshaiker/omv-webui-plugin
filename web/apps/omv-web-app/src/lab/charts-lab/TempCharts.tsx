// SPDX-License-Identifier: GPL-3.0-or-later
// Two ways to draw the disks' temperatures (owner, rounds two and three): DiskMgmt.getList
// `temperature` and `powermode` (a read that never wakes a sleeping disk, so a disk in standby has
// no figure), and the alert limit from Smart.getSettings `tempmax` (Smart.getDeviceSettings
// `tempmax` for one disk), drawn only when the admin set one. One reading, when the page opened: no
// history. Development only (UI-11).
//
// Each disk is drawn as its kind (DrivePicture.tsx), in the neutral inks: the shape says the kind.
// The levels are the usage blue, one hue for "how warm"; a disk at or past its alert limit takes the
// warning colour only together with the sentence that says so.
import {
  StatusIcon,
  StatusLabel,
  Tooltip,
} from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useId, useRef } from "react";
import { useWidth } from "../reel/stages/useWidth.ts";
import { DriveMarker, DrivePicture } from "./DrivePicture.tsx";
import type { DiskTemp, DriveKind } from "./model.ts";
import {
  celsius,
  diskCount,
  diskWords,
  KIND_NAME,
  kindGroups,
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

/**
 * What a screen reader reads instead of the drawing: each degree with its disks and their kind,
 * coolest first.
 */
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
          {`${celsius(s.c)}: ${diskWords(s.disks)}${s.disks.some(overLimit) ? ", at or over the alert limit" : ""}.`}
        </li>
      ))}
    </ul>
  );
}

const KINDS: readonly DriveKind[] = ["hdd", "ssd", "nvme"];

/** The key: each kind's picture at the size it has on the chart, with its name. */
function KindKey() {
  return (
    <>
      {KINDS.map((kind) => (
        <span key={kind} className="ch-key-item">
          <DrivePicture kind={kind} size="marker" />
          {KIND_NAME[kind]}
        </span>
      ))}
    </>
  );
}

// ─── A. Along one scale, stacked ──────────────────────────────────────────────────────────────

/** The axis under the columns: a tick a degree, a longer one every 5, each column's degree written. */
const AXIS_PX = 20;
const LIMIT_ROW_PX = 20;

/**
 * Every disk as its marker picture on one temperature scale; disks at the same whole degree stack
 * upward into a column, so the spread reads like a histogram and no marker hides another. A column
 * of up to three names its disks; a taller one says how many and names them on pointer or focus.
 * The hottest column always names its disks. The alert limit is a dashed line with its value under
 * the axis.
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
                  <DriveMarker kind={d.kind} k={layout.k} />
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
        <span>Each picture is one disk at its whole degree Celsius:</span>
        <KindKey />
      </p>
      <OverNote disks={disks} />
      <AsleepNote disks={disks} />
    </div>
  );
}

// ─── B. By kind, each disk with its level ─────────────────────────────────────────────────────

/** One disk: its picture, and beside it (along it, for a stick) its level on the shared scale. */
function KindTile({
  d,
  k,
  limitAt,
}: {
  d: DiskTemp;
  /** Where the reading sits on the scale, 0 to 1. */
  k: number;
  limitAt: number | null;
}) {
  const over = overLimit(d);
  return (
    <li
      className="ch-kt"
      data-kind={d.kind}
      data-asleep={d.asleep || undefined}
      data-over={over || undefined}
    >
      <span className="ch-kt-art" aria-hidden="true">
        <DrivePicture kind={d.kind} size="tile" />
        <span className="ch-kt-bar">
          {d.c === null ? null : (
            <span className="ch-kt-level" style={v("--k", k)} />
          )}
        </span>
        {limitAt === null ? null : (
          <span className="ch-kt-limit" style={v("--y", limitAt)} />
        )}
      </span>
      <span className="ch-kt-device">{d.device}</span>
      <span className="ch-sr">: </span>
      <span className="ch-kt-value">
        {d.c === null ? (
          d.asleep ? (
            "Asleep"
          ) : (
            "Not read"
          )
        ) : over ? (
          <>
            <StatusIcon status="warning" />
            {celsius(d.c)}
            <span className="ch-sr">, at or over the alert limit</span>
          </>
        ) : (
          celsius(d.c)
        )}
      </span>
    </li>
  );
}

/**
 * The disks in three groups by kind, each in device order, since the disk list does not say which
 * slot of the case a disk is in, and an NVMe SSD sits on the mainboard rather than in a bay. Each
 * tile is the disk's picture with its temperature as a level beside it, on one scale shared by
 * every group: the alert limit is one dashed line at the same height through every upright tile,
 * and a mark at the same temperature on each stick. A sleeping disk shows "Asleep" and no level.
 */
export function TempByKind({
  disks,
  readAt,
}: {
  disks: readonly DiskTemp[];
  readAt: string;
}) {
  const id = useId();
  const limit = sharedLimit(disks);
  const { lo, hi } = tempScale(disks, limit);
  const at = (c: number) => Math.min(1, Math.max(0, (c - lo) / (hi - lo)));
  const limitAt = limit === null ? null : at(limit);
  const groups = kindGroups(disks);
  const hasStick = groups.some((g) => g.kind === "nvme");
  return (
    <div className="ch-kinds">
      {groups.map((g) => (
        <section
          key={g.kind}
          className="ch-kind"
          aria-labelledby={`${id}-${g.kind}`}
        >
          <h4 id={`${id}-${g.kind}`} className="ch-kind-title">
            {g.title}
          </h4>
          <ul
            className="ch-kind-tiles"
            data-kind={g.kind}
            aria-label={`${g.title}, read at ${readAt}`}
          >
            {g.disks.map((d) => (
              <KindTile
                key={d.device}
                d={d}
                k={d.c === null ? 0 : at(d.c)}
                limitAt={limitAt}
              />
            ))}
          </ul>
        </section>
      ))}
      <p className="ch-note">
        Every level is on the same scale, from {celsius(lo)} to {celsius(hi)}:
        from the bottom up beside each upright disk
        {hasStick ? ", and from left to right under each NVMe stick" : ""}.
        {limit === null
          ? ""
          : ` The dashed line through the tiles${hasStick ? ", and the mark on each stick," : ""} is the alert limit, ${celsius(limit)}.`}{" "}
        Within a kind the disks are in device order: the NAS does not report
        which slot of the case a disk is in.
      </p>
      <OverNote disks={disks} />
      <AsleepNote disks={disks} />
    </div>
  );
}
