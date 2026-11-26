// SPDX-License-Identifier: GPL-3.0-or-later
// Two ways to draw the disks' temperatures across the bay: DiskMgmt.getList `temperature` and
// `powermode` (a read that never wakes a sleeping disk, so a disk in standby has no figure), and the
// alert limit from Smart.getSettings `tempmax` (Smart.getDeviceSettings `tempmax` for one disk), drawn
// only when the admin set one. One reading, when the page opened: no history. Development only
// (UI-11).
import type { CSSProperties } from "react";
import { useRef } from "react";
import { useWidth } from "../reel/stages/useWidth.ts";
import type { DiskTemp } from "./model.ts";
import {
  celsius,
  labelRows,
  listWords,
  sharedLimit,
  tempScale,
} from "./model.ts";

const v = (name: string, value: number) =>
  ({ [name]: String(value) }) as CSSProperties;

function altOf(
  disks: readonly DiskTemp[],
  readAt: string,
  limit: number | null,
) {
  const read = disks
    .filter((d) => d.c !== null)
    .sort((a, b) => (a.c ?? 0) - (b.c ?? 0))
    .map((d) => `${d.device} ${celsius(d.c ?? 0)}`);
  const asleep = disks.filter((d) => d.asleep).map((d) => d.device);
  return [
    `Disk temperatures read at ${readAt}: ${listWords(read)}.`,
    limit === null ? "" : `The alert limit is ${celsius(limit)}.`,
    asleep.length === 0
      ? ""
      : `${listWords(asleep)} ${asleep.length === 1 ? "is" : "are"} asleep and not read.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The marker's shape says the kind of disk, so the strip does not lean on colour. */
function Marker({ kind }: { kind: DiskTemp["kind"] }) {
  if (kind === "ssd") {
    return <rect x="-4.5" y="-4.5" width="9" height="9" rx="1.5" />;
  }
  if (kind === "nvme") {
    return <path d="M0 -6L6 0L0 6L-6 0Z" />;
  }
  return <circle r="5" />;
}

function AsleepNote({ disks }: { disks: readonly DiskTemp[] }) {
  const asleep = disks.filter((d) => d.asleep).map((d) => d.device);
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

// ─── A. Along one scale ───────────────────────────────────────────────────────────────────────

const CHAR_PX = 7.4;

/**
 * Every disk as a marker along one temperature scale, its name and figure written above it, so the
 * spread across the bay and the hottest disk read at once; the alert limit is a dashed line.
 */
export function TempScale({
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
  const { lo, hi, ticks } = tempScale(disks, limit);
  const read = disks.filter((d) => d.c !== null);
  const at = (c: number) => (c - lo) / (hi - lo);
  const labels = read.map((d) => ({
    x: at(d.c ?? lo) * width,
    width: (d.device.length + 6) * CHAR_PX,
  }));
  const rows = labelRows(labels);
  const rowCount = Math.max(1, ...rows.map((r) => r + 1));
  return (
    <div
      ref={ref}
      className="ch-ts"
      role="img"
      aria-label={altOf(disks, readAt, limit)}
      style={v("--label-rows", rowCount)}
    >
      <div className="ch-ts-labels" aria-hidden="true">
        {read.map((d, i) => (
          <span
            key={d.device}
            className="ch-ts-label"
            data-over={(d.limit !== null && (d.c ?? 0) >= d.limit) || undefined}
            style={{ ...v("--x", at(d.c ?? lo)), ...v("--row", rows[i] ?? 0) }}
          >
            <span className="ch-ts-device">{d.device}</span>
            <span className="ch-strong">{celsius(d.c ?? 0)}</span>
          </span>
        ))}
        {limit === null ? null : (
          <span className="ch-ts-limit" style={v("--x", at(limit))}>
            <span className="ch-ts-limit-words">Alert at {celsius(limit)}</span>
          </span>
        )}
      </div>
      <svg
        className="ch-ts-axis"
        aria-hidden="true"
        viewBox={`0 0 ${String(width)} 34`}
        width={width}
        height="34"
      >
        <path d={`M0 12H${String(width)}`} className="ch-base" />
        {ticks.map((c) => (
          <g key={c} transform={`translate(${(at(c) * width).toFixed(1)} 0)`}>
            <path d="M0 12V17" className="ch-tick" />
            <text
              y="30"
              className="ch-tick-text"
              textAnchor={c === lo ? "start" : c === hi ? "end" : "middle"}
            >
              {celsius(c)}
            </text>
          </g>
        ))}
        {read.map((d) => (
          <g
            key={d.device}
            className="ch-ts-mark"
            transform={`translate(${(at(d.c ?? lo) * width).toFixed(1)} 12)`}
          >
            <Marker kind={d.kind} />
          </g>
        ))}
      </svg>
      <AsleepNote disks={disks} />
    </div>
  );
}

// ─── B. In bay order ──────────────────────────────────────────────────────────────────────────

/**
 * Each disk in its place in the bay as a thermometer on a shared scale, its figure under it, the
 * alert limit as one dashed line across them all; a sleeping disk's tube is left empty and says so.
 */
export function TempBay({
  disks,
  readAt,
}: {
  disks: readonly DiskTemp[];
  readAt: string;
}) {
  const limit = sharedLimit(disks);
  const { lo, hi } = tempScale(disks, limit);
  const at = (c: number) => Math.min(1, Math.max(0, (c - lo) / (hi - lo)));
  return (
    <div className="ch-tb" role="img" aria-label={altOf(disks, readAt, limit)}>
      <div className="ch-tb-row" aria-hidden="true">
        {limit === null ? null : (
          <span className="ch-tb-limit" style={v("--y", at(limit))}>
            <span className="ch-tb-limit-words">Alert at {celsius(limit)}</span>
          </span>
        )}
        {disks.map((d) => (
          <span
            key={d.device}
            className="ch-tb-disk"
            data-asleep={d.asleep || undefined}
          >
            <span className="ch-tb-tube">
              {d.c === null ? null : (
                <span
                  className="ch-tb-fill"
                  data-over={(d.limit !== null && d.c >= d.limit) || undefined}
                  style={v("--v", at(d.c))}
                />
              )}
            </span>
            <span className="ch-tb-value">
              {d.c === null ? (d.asleep ? "Asleep" : "Not read") : celsius(d.c)}
            </span>
            <span className="ch-tb-device">{d.device}</span>
          </span>
        ))}
      </div>
      <p className="ch-note">
        The tubes run from {celsius(lo)} at the bottom to {celsius(hi)} at the
        top.
      </p>
    </div>
  );
}
