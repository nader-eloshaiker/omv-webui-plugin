// SPDX-License-Identifier: GPL-3.0-or-later
// Story frames only: the themed panels and the readouts the palette stories share. Every colour shown
// comes from css-ui-style (design/tokens.css); the hex values and hue angles printed beside a swatch
// are read back from what the browser resolved, so they cannot drift from what is painted.
import * as React from "react";
import { cn } from "../utils";

type Theme = "dark" | "light";

/** A panel in one theme, on the page ground, as a page shows it. */
export function Panel({
  theme,
  title,
  className,
  children,
}: {
  theme: Theme;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        theme,
        "flex min-w-0 flex-col gap-5 rounded-card bg-page p-6 text-body text-foreground",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{title}</p>
      {children}
    </section>
  );
}

// ─── Reading back what the browser painted ───────────────────────────────────────────────────────

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A computed colour: `rgb()`/`rgba()`, or `color(srgb …)` as Chromium reports a color-mix(). */
function parseComputed(value: string): Rgba | null {
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (rgb?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r, g, b, a };
  }
  const srgb = /^color\(srgb\s+([^)]+)\)$/.exec(value.trim());
  if (srgb?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = srgb[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: r * 255, g: g * 255, b: b * 255, a };
  }
  return null;
}

function toHex({ r, g, b }: Rgba): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.round(Math.min(255, Math.max(0, c)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** OKLCH (Ottosson), so the wheel places each colour where the colour audit measures it. */
function toOklch({ r, g, b }: Rgba): { L: number; C: number; H: number } {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    L,
    C: Math.hypot(A, B),
    H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

const backgroundOf = (element: Element) =>
  getComputedStyle(element).backgroundColor;

/** A hex readout for one token: a swatch painted with the token's background class, read back. */
export function Hex({ bg, className }: { bg: string; className?: string }) {
  const [value, setValue] = React.useState("");
  const ref = React.useCallback((element: HTMLSpanElement | null) => {
    if (element) {
      setValue(backgroundOf(element));
    }
  }, []);
  const colour = parseComputed(value);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        ref={ref}
        aria-hidden="true"
        className={cn("size-3 shrink-0 rounded-sm ring-1 ring-border", bg)}
      />
      <span className="font-mono text-xs text-tertiary-foreground tabular-nums">
        {colour === null
          ? "…"
          : colour.a < 1
            ? `${toHex(colour)} ${String(Math.round(colour.a * 100))}%`
            : toHex(colour)}
      </span>
    </span>
  );
}

// ─── The hue wheel ────────────────────────────────────────────────────────────────────────────────

/** The scheme's angles (OKLCH hue, foundation 3.6), drawn as spokes. */
const SCHEME_SPOKES: readonly {
  hue: number;
  label: string;
  anchor: boolean;
}[] = [
  { hue: 240, label: "Sky 240", anchor: true },
  { hue: 258, label: "Cobalt 258", anchor: true },
  { hue: 60, label: "complement 60", anchor: true },
  { hue: 30, label: "split 30", anchor: true },
  { hue: 90, label: "split 90", anchor: true },
  { hue: 150, label: "quarter 150", anchor: true },
  { hue: 118, label: "", anchor: false },
  { hue: 195, label: "", anchor: false },
  { hue: 292, label: "", anchor: false },
  { hue: 345, label: "", anchor: false },
];

/** Each family the wheel places: a fill class for its marker and a background class to read it. */
const WHEEL_FAMILIES: readonly {
  id: string;
  name: string;
  fill: string;
  bg: string;
}[] = [
  { id: "brand", name: "Sky", fill: "fill-brand", bg: "bg-brand" },
  { id: "action", name: "Cobalt", fill: "fill-action", bg: "bg-action" },
  { id: "ok", name: "OK", fill: "fill-ok", bg: "bg-ok" },
  { id: "warning", name: "Warning", fill: "fill-warning", bg: "bg-warning" },
  {
    id: "critical",
    name: "Critical",
    fill: "fill-critical",
    bg: "bg-critical",
  },
  { id: "pending", name: "Pending", fill: "fill-pending", bg: "bg-pending" },
  {
    id: "ink",
    name: "Ink",
    fill: "fill-pending-foreground",
    bg: "bg-pending-foreground",
  },
  {
    id: "series-1",
    name: "Series 1",
    fill: "fill-series-1",
    bg: "bg-series-1",
  },
  {
    id: "series-2",
    name: "Series 2",
    fill: "fill-series-2",
    bg: "bg-series-2",
  },
  {
    id: "series-3",
    name: "Series 3",
    fill: "fill-series-3",
    bg: "bg-series-3",
  },
  {
    id: "series-4",
    name: "Series 4",
    fill: "fill-series-4",
    bg: "bg-series-4",
  },
];

const SIZE = 360;
const MID = SIZE / 2;
const MAX_C = 0.22;
const radius = (c: number) => 26 + (Math.min(c, MAX_C) / MAX_C) * 104;
const point = (hue: number, r: number) => ({
  x: MID + r * Math.cos((hue * Math.PI) / 180),
  y: MID - r * Math.sin((hue * Math.PI) / 180),
});

/**
 * Where each family sits: hue as the angle (0 at the right, counter-clockwise, as OKLCH), chroma as
 * the distance from the centre. Spokes mark the scheme: solid for the anchors, dashed for the gaps
 * the chart series take. Families painted the same share one marker.
 */
export function HueWheel({ caption }: { caption: string }) {
  const [read, setRead] = React.useState<Readonly<Record<string, string>>>({});
  const probes = React.useMemo(
    () =>
      Object.fromEntries(
        WHEEL_FAMILIES.map((family) => [
          family.id,
          (element: HTMLSpanElement | null) => {
            if (!element) {
              return;
            }
            const value = backgroundOf(element);
            setRead((prev) =>
              prev[family.id] === value
                ? prev
                : { ...prev, [family.id]: value },
            );
          },
        ]),
      ),
    [],
  );
  const placed = WHEEL_FAMILIES.flatMap((family) => {
    const colour = parseComputed(read[family.id] ?? "");
    if (!colour) {
      return [];
    }
    const { C, H, L } = toOklch(colour);
    return [{ family, C, H, L, hex: toHex(colour) }];
  });
  const markers = placed.flatMap((entry, index) =>
    placed.findIndex((other) => other.hex === entry.hex) === index
      ? [
          {
            ...entry,
            names: placed
              .filter((other) => other.hex === entry.hex)
              .map((other) => other.family.name)
              .join(", "),
          },
        ]
      : [],
  );
  return (
    <figure className="flex flex-col items-center gap-2">
      {WHEEL_FAMILIES.map((family) => (
        <span
          key={family.id}
          ref={probes[family.id]}
          aria-hidden="true"
          className={cn("hidden", family.bg)}
        />
      ))}
      <svg
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="w-full max-w-96 overflow-visible"
        role="img"
        aria-label={caption}
      >
        <circle
          cx={MID}
          cy={MID}
          r={radius(MAX_C)}
          className="fill-none stroke-border"
        />
        <circle
          cx={MID}
          cy={MID}
          r={radius(0.11)}
          className="fill-none stroke-border [stroke-dasharray:2_4]"
        />
        <circle cx={MID} cy={MID} r={26} className="fill-none stroke-border" />
        {SCHEME_SPOKES.map((spoke) => {
          const from = point(spoke.hue, 26);
          const to = point(spoke.hue, radius(MAX_C) + 6);
          const text = point(spoke.hue, radius(MAX_C) + 18);
          return (
            <g key={spoke.hue}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={cn(
                  "stroke-border-control",
                  !spoke.anchor && "[stroke-dasharray:3_4]",
                )}
              />
              {spoke.label ? (
                <text
                  x={text.x}
                  y={text.y}
                  textAnchor={
                    text.x < MID - 8
                      ? "end"
                      : text.x > MID + 8
                        ? "start"
                        : "middle"
                  }
                  dominantBaseline="middle"
                  className="fill-tertiary-foreground text-xs font-medium"
                >
                  {spoke.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {markers.map(({ family, C, H }) => {
          const at = point(H, radius(C));
          return (
            <circle
              key={family.id}
              cx={at.x}
              cy={at.y}
              r={7}
              className={cn(
                family.fill,
                "stroke-foreground [stroke-width:1.5]",
              )}
            />
          );
        })}
        {markers.map(({ family, names, C, H }) => {
          // The name sits outward along the marker's own hue, so neighbours on the arc part ways.
          const at = point(H, radius(C) + 14);
          const cos = Math.cos((H * Math.PI) / 180);
          return (
            <text
              key={`${family.id}-label`}
              x={at.x}
              y={at.y}
              textAnchor={cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle"}
              dominantBaseline="middle"
              className="fill-muted-foreground text-xs"
            >
              {names}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-caption text-tertiary-foreground">
        {caption}
      </figcaption>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-tertiary-foreground">
            <th className="text-start font-medium">Family</th>
            <th className="text-end font-medium">L</th>
            <th className="text-end font-medium">C</th>
            <th className="text-end font-medium">H</th>
          </tr>
        </thead>
        <tbody>
          {placed.map(({ family, L, C, H }) => (
            <tr key={family.id} className="text-muted-foreground">
              <td>{family.name}</td>
              <td className="text-end font-mono">{L.toFixed(2)}</td>
              <td className="text-end font-mono">{C.toFixed(3)}</td>
              <td className="text-end font-mono">{H.toFixed(0)}°</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
