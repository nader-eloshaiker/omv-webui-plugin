// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's primitives: development only (UI-11). Status marks differ by shape as well as
// colour (OK a filled disc with a tick, Warning a triangle, Critical an octagon, Unknown a hollow
// dashed ring, Pending a clock), so no state depends on colour alone. Geometry that depends on data
// is passed as custom properties through React's style prop, which sets them through the CSSOM.
import type { ReactNode } from "react";
import { useId, useLayoutEffect, useRef } from "react";
import type { Status } from "./data.ts";
import { STATUS_WORD } from "./data.ts";
import { SAMPLE_MS } from "./live.ts";
import { reducedMotion, useTween } from "./motion.ts";
import { cx, vars } from "./util.ts";

export function Mark({
  status,
  size = 16,
}: {
  status: Status | "pending" | "setup";
  size?: number;
}) {
  const cls = `lx-mark lx-mark--${status}`;
  if (status === "ok") {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle className="lx-mark-fill" cx="8" cy="8" r="7" />
        <path className="lx-mark-ink" d="M4.8 8.2l2.1 2.1 4.3-4.5" />
      </svg>
    );
  }
  if (status === "warning") {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path className="lx-mark-fill" d="M8 1.2l7.1 12.6H.9z" />
        <path className="lx-mark-ink" d="M8 6v3.6M8 11.6v.1" />
      </svg>
    );
  }
  if (status === "critical") {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path
          className="lx-mark-fill"
          d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1z"
        />
        <path className="lx-mark-ink" d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" />
      </svg>
    );
  }
  if (status === "pending") {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle className="lx-mark-fill" cx="8" cy="8" r="7" />
        <path className="lx-mark-ink" d="M8 4.4V8l2.4 1.6" />
      </svg>
    );
  }
  if (status === "setup") {
    return (
      <svg
        className={cls}
        width={size}
        height={size}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <circle className="lx-mark-ring" cx="8" cy="8" r="6.4" />
        <path className="lx-mark-ink" d="M8 4.6v4.2M8 11v.1" />
      </svg>
    );
  }
  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle className="lx-mark-ring" cx="8" cy="8" r="6.2" />
    </svg>
  );
}

export function Pill({
  status,
  children,
}: {
  status: Status;
  children?: ReactNode;
}) {
  return (
    <span className={`lx-pill lx-pill--${status}`}>
      <Mark status={status} size={14} />
      <span>{children ?? STATUS_WORD[status]}</span>
    </span>
  );
}

export function Meter({
  value,
  max,
  status = "ok",
  label,
  segments,
}: {
  value: number;
  max: number;
  status?: Status;
  label: string;
  segments?: number;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div
      className={cx(
        "lx-meter",
        `lx-meter--${status}`,
        segments ? "lx-meter--seg" : false,
      )}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={vars({ "--v": ratio, "--segs": segments ?? 0 })}
    >
      <span className="lx-meter-fill" />
      {segments ? <span className="lx-meter-ticks" /> : null}
    </div>
  );
}

export function Ring({
  value,
  status = "ok",
  size = 96,
  stroke = 8,
  label,
  children,
  segments,
}: {
  value: number;
  status?: Status;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
  segments?: { value: number; status: Status }[];
}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  return (
    <div
      className="lx-ring"
      role="img"
      aria-label={label}
      style={vars({ "--size": `${size}px` })}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          className="lx-ring-track"
          cx={c}
          cy={c}
          r={r}
          strokeWidth={stroke}
        />
        {segments ? (
          segments.map((segment, i) => {
            const before = segments
              .slice(0, i)
              .reduce((sum, s) => sum + s.value, 0);
            return (
              <circle
                key={i}
                className={`lx-ring-val lx-ring-seg lx-ring-seg--${segment.status}`}
                cx={c}
                cy={c}
                r={r}
                strokeWidth={stroke}
                pathLength={100}
                transform={`rotate(${-90 + before * 3.6} ${c} ${c})`}
                style={vars({
                  "--off": 100 - Math.max(0, segment.value - 1.2),
                  "--i": i,
                })}
              />
            );
          })
        ) : (
          <circle
            className={`lx-ring-val lx-ring-val--${status}`}
            cx={c}
            cy={c}
            r={r}
            strokeWidth={stroke}
            pathLength={100}
            transform={`rotate(-90 ${c} ${c})`}
            style={vars({ "--off": 100 - value * 100, "--i": 0 })}
          />
        )}
      </svg>
      {children ? <div className="lx-ring-body">{children}</div> : null}
    </div>
  );
}

/**
 * A sampled line. When a sample arrives the line moves left by one step over the sampling interval,
 * so it scrolls at the rate the data really arrives; the head dot beats once per sample. Under
 * reduced motion the line simply redraws.
 */
export function Spark({
  values,
  max,
  label,
  height = 48,
  width = 240,
  tone = "brand",
  keep = 40,
  area = true,
}: {
  values: number[];
  max: number;
  label: string;
  height?: number;
  width?: number;
  tone?: "brand" | "s2";
  keep?: number;
  area?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const group = useRef<SVGGElement>(null);
  const head = useRef<SVGCircleElement>(null);
  const step = width / (keep - 1);
  const pad = 3;
  const y = (v: number) =>
    pad + (height - pad * 2) * (1 - Math.min(1, v / max));
  const start = keep - values.length;
  const points = values.map((v, i) => [(start + i) * step, y(v)] as const);
  const line = points
    .map(
      ([px, py], i) =>
        `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`,
    )
    .join(" ");
  const first = points[0];
  const last = points.at(-1);
  const fill =
    first && last
      ? `${line} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`
      : "";
  const latest = values.at(-1);
  useLayoutEffect(() => {
    if (reducedMotion()) {
      return;
    }
    group.current?.animate(
      [{ transform: `translateX(${step}px)` }, { transform: "translateX(0)" }],
      { duration: SAMPLE_MS, easing: "linear" },
    );
    head.current?.animate(
      [
        { r: "5", opacity: 0.35 },
        { r: "2.5", opacity: 1 },
      ],
      {
        duration: 700,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
  }, [latest, step]);
  return (
    <svg
      className={`lx-spark lx-spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="lx-spark-stop0" />
          <stop offset="1" className="lx-spark-stop1" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect x="0" y="0" width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        <g ref={group}>
          {area ? (
            <path className="lx-spark-area" d={fill} fill={`url(#g${id})`} />
          ) : null}
          <path
            className="lx-spark-line"
            d={line}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </g>
      {last ? (
        <circle
          ref={head}
          className="lx-spark-head"
          cx={last[0] - 2}
          cy={last[1]}
          r="2.5"
        />
      ) : null}
    </svg>
  );
}

/** A live number: it glides to each new reading with tabular figures, so it never jitters. */
export function Live({
  value,
  digits = 0,
  unit,
}: {
  value: number;
  digits?: number;
  unit?: string;
}) {
  const shown = useTween(value, 700);
  return (
    <span className="lx-num">
      {shown.toFixed(digits)}
      {unit ? <span className="lx-unit">{`\u00a0${unit}`}</span> : null}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      className="lx-switch"
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="lx-switch-thumb" />
    </button>
  );
}

/** Explanatory prose one click away. The height animates natively where supported. */
export function More({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="lx-more">
      <summary>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="lx-more-chev"
        >
          <path d="M6 3.5L10.5 8 6 12.5" />
        </svg>
        {summary}
      </summary>
      <div className="lx-more-body">{children}</div>
    </details>
  );
}

export function Avatar({
  initials,
  group,
}: {
  initials: string;
  group?: boolean;
}) {
  return (
    <span
      className={cx("lx-avatar", group && "lx-avatar--group")}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function DiskIcon({ kind }: { kind: "hdd" | "ssd" | "usb" }) {
  if (kind === "ssd") {
    return (
      <svg
        className="lx-diskicon"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        aria-hidden="true"
      >
        <rect x="3" y="9" width="22" height="10" rx="2" />
        <path d="M7 13h6M7 15.5h4M19 12v4M21.5 12v4" />
      </svg>
    );
  }
  if (kind === "usb") {
    return (
      <svg
        className="lx-diskicon"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        aria-hidden="true"
      >
        <rect x="4" y="9" width="16" height="10" rx="2.5" />
        <path d="M20 11.5h4v5h-4M8 14h6" />
      </svg>
    );
  }
  return (
    <svg
      className="lx-diskicon"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
      <rect x="5" y="3" width="18" height="22" rx="2.5" />
      <circle cx="14" cy="12" r="5" />
      <circle cx="14" cy="12" r="1.2" />
      <path d="M9 21h4" />
    </svg>
  );
}
