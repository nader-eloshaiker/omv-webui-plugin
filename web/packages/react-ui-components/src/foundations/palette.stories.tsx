// SPDX-License-Identifier: GPL-3.0-or-later
// The palette and the one colour scheme it follows (foundation 3.6): the hue wheel that shows where
// each family sits, then every family as fill, stroke, word and wash on every ground, the inks on
// solid fills, the accent and Sky's interaction roles, the chart series with the live trace, usage, the terminal and the
// drawings. Every colour is the shipped token; the hex values beside them are read back from the page.
import type { Meta, StoryObj } from "@storybook/react-vite";
import type * as React from "react";
import { Button } from "../components/button/button";
import { cn } from "../utils";
import { Hex, HueWheel, Panel } from "./palette-kit";

const GROUNDS = [
  { id: "page", bg: "bg-page" },
  { id: "surface", bg: "bg-surface" },
  { id: "muted", bg: "bg-muted" },
  { id: "muted-strong", bg: "bg-muted-strong" },
] as const;

/** Literal classes, so Tailwind finds them. */
const FAMILIES = [
  {
    id: "ok",
    name: "OK",
    word: "OK",
    fill: "bg-ok",
    stroke: "border-ok-stroke",
    strokeBg: "bg-ok-stroke",
    label: "text-ok-label",
    labelBg: "bg-ok-label",
    wash: "bg-ok-wash",
  },
  {
    id: "warning",
    name: "Warning",
    word: "Warning",
    fill: "bg-warning",
    stroke: "border-warning-stroke",
    strokeBg: "bg-warning-stroke",
    label: "text-warning-label",
    labelBg: "bg-warning-label",
    wash: "bg-warning-wash",
  },
  {
    id: "critical",
    name: "Critical",
    word: "Critical",
    fill: "bg-critical",
    stroke: "border-critical-stroke",
    strokeBg: "bg-critical-stroke",
    label: "text-critical-label",
    labelBg: "bg-critical-label",
    wash: "bg-critical-wash",
  },
  {
    id: "unknown",
    name: "Unknown",
    word: "Unknown",
    fill: "bg-unknown",
    stroke: "border-unknown-stroke",
    strokeBg: "bg-unknown-stroke",
    label: "text-unknown-label",
    labelBg: "bg-unknown-label",
    wash: "bg-unknown-wash",
  },
  {
    id: "pending",
    name: "Pending",
    word: "Not applied yet",
    fill: "bg-pending",
    stroke: "border-pending-stroke",
    strokeBg: "bg-pending-stroke",
    label: "text-pending-label",
    labelBg: "bg-pending-label",
    wash: "bg-pending-wash",
  },
] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-section text-foreground">{children}</h3>;
}

/** The scheme in four lines, as foundation 3.6 states it. */
function Scheme() {
  return (
    <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-muted-foreground marker:text-tertiary-foreground">
      <li>
        The base is Sky blue, about 240: brand, links, selection, the live trace
        and usage.
      </li>
      <li>
        The accent, Cobalt, is the base turned toward the screen&apos;s own blue
        (258) at twice its chroma: the one thing to press.
      </li>
      <li>
        What asks for attention sits opposite: warning on the complement,
        critical and pending on the split complements, stepping gold, orange,
        red from light to dark.
      </li>
      <li>
        OK is a quarter turn round; the chart series take the gaps between.
      </li>
      <li>Words on a light fill are Sky&apos;s navy.</li>
    </ul>
  );
}

/** One family: its four members read back, then fill, stroke, word and wash on each ground. */
function FamilyRow({ family }: { family: (typeof FAMILIES)[number] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="w-20 font-semibold">{family.name}</span>
        <span className="text-caption text-tertiary-foreground">fill</span>
        <Hex bg={family.fill} />
        <span className="text-caption text-tertiary-foreground">stroke</span>
        <Hex bg={family.strokeBg} />
        <span className="text-caption text-tertiary-foreground">label</span>
        <Hex bg={family.labelBg} />
        <span className="text-caption text-tertiary-foreground">wash</span>
        <Hex bg={family.wash} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GROUNDS.map((ground) => (
          <div
            key={ground.id}
            className={cn(
              "flex flex-col gap-2 rounded-control p-3 ring-1 ring-border",
              ground.bg,
            )}
          >
            <span className="text-xs text-tertiary-foreground">
              {ground.id}
            </span>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-3 rounded-full border-[1.5px]",
                  family.fill,
                  family.stroke,
                )}
              />
              <span
                aria-hidden="true"
                className={cn("size-3 rounded-full border-2", family.stroke)}
              />
              <span className={cn("text-sm font-medium", family.label)}>
                {family.word}
              </span>
            </span>
            <span
              className={cn(
                "inline-flex self-start rounded-control px-2.5 py-1 text-sm font-medium",
                family.stroke,
                family.wash,
                family.label,
              )}
            >
              {family.word}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The inks on solid fills: one rule, Sky's navy on every light fill. */
function Inks() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-pending-stroke bg-pending px-2.5 py-0.5 text-sm font-semibold text-pending-foreground">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full bg-pending-foreground"
        />
        2 pending
      </span>
      <span className="inline-flex rounded-control border border-ok-stroke bg-ok px-3 py-1 text-sm font-medium text-ok-foreground">
        Saved
      </span>
      <Button>Save</Button>
      <Button variant="destructive">Delete the share</Button>
      <span className="flex flex-wrap gap-2">
        <Hex bg="bg-pending-foreground" />
        <Hex bg="bg-ok-foreground" />
        <Hex bg="bg-action-foreground" />
        <Hex bg="bg-destructive-foreground" />
      </span>
    </div>
  );
}

/**
 * The accent and Sky side by side: Cobalt says "do this" (the primary, the outlined next step); Sky
 * says "you can interact with this" (a link, an action in place, the selected row, the checked mark, the
 * focus ring).
 */
function ActionAndSelection() {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-raised">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Apply</Button>
        <Button variant="primaryOutline">See what to do</Button>
        <Button variant="neutral">Cancel</Button>
        <Button variant="ghost">Show details</Button>
        <a href="#palette" className="text-link underline underline-offset-3">
          Open the SMB settings
        </a>
        <span className="rounded-control px-2 py-1 outline-2 outline-offset-2 outline-focus-ring">
          Focused
        </span>
      </div>
      <div className="flex flex-col">
        <div className="flex justify-between gap-3 rounded-control px-3 py-2">
          <span>media</span>
          <span className="text-muted-foreground">
            /srv/dev-disk-by-uuid-1a2b/media
          </span>
        </div>
        <div className="flex justify-between gap-3 rounded-control bg-selected px-3 py-2">
          <span className="font-medium text-selected-label">
            photos (selected)
          </span>
          <span className="text-muted-foreground">
            /srv/dev-disk-by-uuid-1a2b/photos
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Hex bg="bg-action" />
        <Hex bg="bg-action-stroke" />
        <Hex bg="bg-action-label" />
        <Hex bg="bg-action-wash" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Hex bg="bg-link" />
        <Hex bg="bg-selected-mark" />
        <Hex bg="bg-focus-ring" />
        <Hex bg="bg-selected" />
      </div>
    </div>
  );
}

const SERIES = [
  {
    stroke: "stroke-series-1",
    bg: "bg-series-1",
    dash: undefined,
    name: "Series 1, violet",
  },
  {
    stroke: "stroke-series-2",
    bg: "bg-series-2",
    dash: "6 4",
    name: "Series 2, teal",
  },
  {
    stroke: "stroke-series-3",
    bg: "bg-series-3",
    dash: "1 5",
    name: "Series 3, magenta",
  },
  {
    stroke: "stroke-series-4",
    bg: "bg-series-4",
    dash: "10 4 1 4",
    name: "Series 4, moss",
  },
] as const;

const wave = (phase: number, base: number) =>
  Array.from({ length: 25 }, (_, i) => {
    const x = (i / 24) * 300;
    const y =
      base + Math.sin(i / 3 + phase) * 9 + Math.cos(i / 5 + phase * 2) * 5;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

/** Four categorical series, each with its own dash, and the live trace over its area. */
function SeriesAndTrace() {
  const trace = wave(0.4, 98);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["bg-surface", "bg-muted"] as const).map((ground) => (
        <div
          key={ground}
          className={cn("rounded-control p-3 ring-1 ring-border", ground)}
        >
          <svg viewBox="0 0 300 130" className="w-full" aria-hidden="true">
            {SERIES.map((s, i) => (
              <path
                key={s.name}
                d={wave(i * 1.3, 18 + i * 18)}
                strokeDasharray={s.dash}
                className={cn("fill-none [stroke-width:2]", s.stroke)}
              />
            ))}
            <path
              d={`${trace} L300,130 L0,130 Z`}
              className="fill-trace-area"
            />
            <path
              d={trace}
              className="fill-none stroke-trace [stroke-width:2]"
            />
          </svg>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        {SERIES.map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-1.5 text-xs"
          >
            {s.name}
            <Hex bg={s.bg} />
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs">
          Trace
          <Hex bg="bg-trace" />
        </span>
      </div>
    </div>
  );
}

function UsageTerminalDrawing() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-2 rounded-control bg-surface p-3 ring-1 ring-border">
        <span className="text-xs text-tertiary-foreground">
          Used and empty, filled with no outline
        </span>
        <span className="h-2.5 overflow-hidden rounded-full bg-usage-empty">
          <span className="block h-full w-3/5 rounded-full bg-usage" />
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <Hex bg="bg-usage" />
          <Hex bg="bg-usage-empty" />
        </span>
      </div>
      <div className="flex flex-col gap-1 rounded-control bg-terminal p-3 font-mono text-xs">
        <span className="text-terminal-muted">12:04:21</span>
        <span className="text-terminal-foreground">Setting up libssl3 ...</span>
        <Hex bg="bg-terminal-foreground" />
      </div>
      <div className="flex flex-col gap-2 rounded-control bg-art-chassis-top p-3 ring-1 ring-art-line">
        <span className="text-xs text-tertiary-foreground">Drawing</span>
        <svg viewBox="0 0 120 30" className="w-full" aria-hidden="true">
          <rect
            x="2"
            y="4"
            width="34"
            height="22"
            rx="3"
            className="fill-art-surface stroke-art-line"
          />
          <path d="M36 15 H84" className="stroke-art-path [stroke-width:2]" />
          <path d="M36 22 H84" className="stroke-art-faint" />
          <rect
            x="84"
            y="4"
            width="34"
            height="22"
            rx="3"
            className="fill-art-surface stroke-art-line"
          />
        </svg>
        <Hex bg="bg-art-path" />
      </div>
    </div>
  );
}

function Sheet({ theme }: { theme: "dark" | "light" }) {
  return (
    <Panel theme={theme} title={theme === "dark" ? "Dark" : "Light"}>
      <Scheme />
      <HueWheel caption="Where each family sits: hue as angle, chroma as distance from the centre." />
      <SectionTitle>Status and pending: fill, stroke, word, wash</SectionTitle>
      {FAMILIES.map((family) => (
        <FamilyRow key={family.id} family={family} />
      ))}
      <SectionTitle>Inks on solid fills</SectionTitle>
      <Inks />
      <SectionTitle>The accent, and Sky's interaction roles</SectionTitle>
      <ActionAndSelection />
      <SectionTitle>Chart series and the live trace</SectionTitle>
      <SeriesAndTrace />
      <SectionTitle>Usage, terminal, drawings</SectionTitle>
      <UsageTerminalDrawing />
    </Panel>
  );
}

const meta = {
  title: "Foundations/Palette",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both themes side by side. */
export const BothThemes: Story = {
  render: () => (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      <Sheet theme="dark" />
      <Sheet theme="light" />
    </div>
  ),
};

export const Dark: Story = {
  render: () => (
    <div className="p-4">
      <Sheet theme="dark" />
    </div>
  ),
};

export const Light: Story = {
  render: () => (
    <div className="p-4">
      <Sheet theme="light" />
    </div>
  ),
};
