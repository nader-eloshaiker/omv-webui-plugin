// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import {
  Bar,
  CartesianGrid,
  LabelList,
  BarChart as RechartsBarChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "../../utils";
import {
  finiteOrNull,
  fixedScale,
  niceScale,
  STATIC_STEPS,
  type ValueOf,
} from "../chart-model/chart-model";
import { useElementWidth } from "../chart-model/use-element-width";
import {
  ChartTable,
  ChartTableDisclosure,
  ChartTooltipCard,
  type ChartTableColumn,
  type ChartTableWords,
} from "./chart-parts";
import { chartFrameClass, TICK, type ChartAlert } from "./chart-theme";

/** What the tooltip says about the bar pointed at. */
interface BarTooltip {
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** The lines under the title: "2.2 TiB of 3.6 TiB used · 62%", "1.4 TiB free". */
  body: React.ReactNode;
}

interface BarChartProps<Row> extends Omit<
  React.ComponentProps<"figure">,
  "children"
> {
  /** One bar per row, in the order drawn. */
  data: readonly Row[];
  rowKey: (row: Row) => string;
  /** The bar's name on the category axis: "data", "sdb". */
  name: (row: Row) => string;
  /** The measure; `null` when there is none (a disk over USB reports no temperature): no bar, and `missingLabel` where it would be. */
  value: ValueOf<Row>;
  /**
   * The whole a bar is part of (a file system's size): the rest is drawn as the track, so each bar
   * shows both how big the thing is and how much of it is used, to one scale.
   */
  total?: ValueOf<Row>;
  /** `columns` stand up from a baseline (one measure across things); `rows` lie along the axis (sizes). */
  orientation?: "columns" | "rows";
  /** The value axis: fixed `[min, max]` or `"nice"` (the default) from zero. */
  domain?: readonly [number, number] | "nice";
  ticks?: readonly number[];
  /** Lines at an alert or threshold, with their words: the alert temperature set in Disk health. */
  alerts?: readonly ChartAlert[];
  /** A value with its unit, for the axis: "2 TiB", "35°". */
  formatTick: (value: number) => string;
  /** The words at the end of each bar: "62%", "62% · Almost full", "41°". */
  barLabel: (row: Row) => string;
  /** Under the name of a thing with no value, where its bar would be: "No reading". */
  missingLabel: string;
  /** What the tooltip says for the row pointed at. */
  tooltip: (row: Row) => BarTooltip;
  /** What the chart shows, its accessible name: "Space by file system". */
  label: string;
  /** The text alternative, every bar in words, written by the caller: "data, 62% of 3.6 TiB; …". */
  description: string;
  /** The numbers one click away. */
  table:
    (ChartTableWords & { columns: readonly ChartTableColumn<Row>[] }) | false;
  /** Device names in mono on the axis. */
  monoNames?: boolean;
  ground?: "surface" | "muted";
}

interface Drawn<Row> {
  key: string;
  name: string;
  /** The bar's length: 0 for a missing value, which draws none. */
  shown: number;
  rest: number | null;
  missing: boolean;
  row: Row;
}

const ROW_PX = 36;

/**
 * A bar chart of things now (foundation 8), on Recharts: one measure across things as columns, with
 * alert lines from the caller, or sizes as rows with the used part filled. One colour, the capacity
 * blue; a thing past its threshold keeps its bar and says so in words in its label. The bars grow
 * once on entrance, in CSS, so a resize redraws them in place instead of animating again; at once
 * under reduced motion.
 *
 * To a screen reader it is one image with its name and the caller's full description; the numbers
 * are a table one click away.
 */
function BarChart<Row>({
  data,
  rowKey,
  name,
  value,
  total,
  orientation = "columns",
  domain = "nice",
  ticks,
  alerts,
  formatTick,
  barLabel,
  missingLabel,
  tooltip,
  label,
  description,
  table,
  monoNames = false,
  ground,
  className,
  ...props
}: BarChartProps<Row>) {
  const descriptionId = `${React.useId()}-description`;
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const rows: Drawn<Row>[] = data.map((row) => {
    const v = finiteOrNull(value(row));
    const whole = total ? finiteOrNull(total(row)) : null;
    return {
      key: rowKey(row),
      name: name(row),
      shown: v ?? 0,
      rest: whole === null || v === null ? null : Math.max(0, whole - v),
      missing: v === null,
      row,
    };
  });
  const extent = rows.map((r) =>
    r.rest === null ? r.shown : r.shown + r.rest,
  );
  const scale =
    domain === "nice"
      ? niceScale(extent, STATIC_STEPS, 1.05)
      : fixedScale(domain, ticks);
  const across = orientation === "rows";
  const height = across ? rows.length * ROW_PX + 26 : 220;
  // Names on rows get 112px: a longer one is cut with an ellipsis (its full name is in the tooltip,
  // the description and the table). About 7px a character at 12px.
  const nameWidth = 112;
  const fit = (text: string) => {
    const room = Math.floor((nameWidth - 8) / (monoNames ? 7.3 : 6.6));
    return across && text.length > room ? `${text.slice(0, room - 1)}…` : text;
  };
  // Grows once, from the baseline, in CSS: a keyframe runs only when the mark first appears.
  const grow = across
    ? "[&_.recharts-rectangle]:grow-box [&_.recharts-rectangle]:origin-left [&_.recharts-rectangle]:animate-grow-x"
    : "[&_.recharts-rectangle]:grow-box [&_.recharts-rectangle]:origin-bottom [&_.recharts-rectangle]:animate-grow-y";
  const labelClass = "text-xs font-semibold text-muted-foreground";
  const valueAxis = {
    type: "number" as const,
    domain: [...scale.domain],
    ticks: [...scale.ticks],
    tickFormatter: formatTick,
    tick: TICK,
    tickLine: false,
    axisLine: false,
    interval: 0 as const,
  };
  // A thing's name on its axis; one with no value says so under its name, where its bar would be.
  const nameTick = (p: {
    x?: number | string;
    y?: number | string;
    payload?: { value?: unknown; index?: number };
  }) => {
    const drawn = rows[p.payload?.index ?? -1];
    const x = Number(p.x);
    const y = Number(p.y);
    return (
      <text
        x={x}
        y={across ? y : y + 4}
        textAnchor={across ? "end" : "middle"}
        fill="currentColor"
        // Names are read: the secondary ink at a heavier weight than the figures on the value axis
        // (not their class, which the frame paints in the caption tier).
        className={cn(
          "text-xs font-semibold text-muted-foreground",
          monoNames && "font-mono",
        )}
      >
        <tspan
          x={x}
          dy={across && drawn?.missing ? "-0.2em" : across ? "0.35em" : "0.9em"}
        >
          {fit(String(p.payload?.value ?? ""))}
        </tspan>
        {drawn?.missing ? (
          <tspan
            x={x}
            dy="1.3em"
            className="font-sans font-medium text-tertiary-foreground"
          >
            {missingLabel}
          </tspan>
        ) : null}
      </text>
    );
  };
  const categoryAxis = {
    type: "category" as const,
    dataKey: "name",
    tick: nameTick,
    tickLine: false,
    axisLine: false,
    interval: 0 as const,
  };

  return (
    <figure
      data-slot="bar-chart"
      data-orientation={orientation}
      className={cn("m-0 flex min-w-0 flex-col gap-1.5", className)}
      {...props}
    >
      <div ref={measureRef} className={chartFrameClass({ ground })}>
        {width > 0 ? (
          <RechartsBarChart
            width={width}
            height={height}
            data={rows}
            layout={across ? "vertical" : "horizontal"}
            role="img"
            aria-label={label}
            aria-describedby={descriptionId}
            barCategoryGap={across ? 9 : "28%"}
            margin={
              across
                ? { top: 4, right: 112, bottom: 0, left: 0 }
                : { top: 18, right: 8, bottom: 0, left: 0 }
            }
          >
            <CartesianGrid vertical={across} horizontal={!across} />
            {across ? (
              <>
                <XAxis {...valueAxis} height={22} />
                <YAxis {...categoryAxis} width={nameWidth} />
              </>
            ) : (
              <>
                <XAxis {...categoryAxis} height={40} />
                <YAxis {...valueAxis} width={40} />
              </>
            )}
            {(alerts ?? []).map((alert) => (
              <ReferenceLine
                key={alert.value}
                {...(across ? { x: alert.value } : { y: alert.value })}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                label={{
                  value: alert.label,
                  position: "insideTopRight",
                  className: labelClass,
                  fill: "currentColor",
                }}
              />
            ))}
            <Bar
              dataKey="shown"
              stackId="bar"
              isAnimationActive={false}
              fill="currentColor"
              radius={
                across ? (total ? [3, 0, 0, 3] : [3, 3, 3, 3]) : [3, 3, 0, 0]
              }
              className={cn("text-usage", grow)}
            >
              {total ? null : (
                <LabelList
                  position={across ? "right" : "top"}
                  className={labelClass}
                  fill="currentColor"
                  valueAccessor={(entry: { payload: Drawn<Row> }) =>
                    entry.payload.missing
                      ? missingLabel
                      : barLabel(entry.payload.row)
                  }
                />
              )}
            </Bar>
            {total ? (
              <Bar
                dataKey="rest"
                stackId="bar"
                isAnimationActive={false}
                fill="currentColor"
                radius={across ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                className="text-usage-track"
              >
                <LabelList
                  position={across ? "right" : "top"}
                  className={labelClass}
                  fill="currentColor"
                  valueAccessor={(entry: { payload: Drawn<Row> }) =>
                    entry.payload.missing
                      ? missingLabel
                      : barLabel(entry.payload.row)
                  }
                />
              </Bar>
            ) : null}
            <Tooltip
              isAnimationActive={false}
              content={(p) => {
                const drawn = p.payload?.[0]?.payload as Drawn<Row> | undefined;
                if (!p.active || !drawn) {
                  return null;
                }
                const tip = tooltip(drawn.row);
                return (
                  <ChartTooltipCard title={tip.title} meta={tip.meta}>
                    {tip.body}
                  </ChartTooltipCard>
                );
              }}
            />
          </RechartsBarChart>
        ) : (
          <div className={across ? undefined : "h-55"} />
        )}
      </div>
      <p id={descriptionId} className="sr-only">
        {description}
      </p>
      {table === false ? null : (
        <ChartTableDisclosure summary={table.summary}>
          <ChartTable
            rows={data}
            rowKey={rowKey}
            columns={table.columns}
            caption={table.caption}
          />
        </ChartTableDisclosure>
      )}
    </figure>
  );
}

export { BarChart };
export type { BarChartProps, BarTooltip };
