// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { useGlide } from "./motion";
import { MotionScope } from "./motion-scope";
import { useDrawPath } from "./use-draw-path";
import { useFirstTime } from "./use-first-time";
import { useFlip } from "./use-flip";

const meta = {
  title: "Motion/Helpers",
  component: MotionScope,
  parameters: { layout: "padded" },
} satisfies Meta<typeof MotionScope>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The same demo twice: as the page runs it, and inside `MotionScope reduced`. */
function FullAndReduced({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section aria-label="Full" className="flex flex-col gap-2">
        <h3 className="m-0 text-section">Full</h3>
        <MotionScope>{children}</MotionScope>
      </section>
      <section aria-label="Reduced" className="flex flex-col gap-2">
        <h3 className="m-0 text-section">Reduced</h3>
        <MotionScope reduced>{children}</MotionScope>
      </section>
    </div>
  );
}

interface Disk {
  device: string;
  size: number;
  label: string;
}

const DISKS: Disk[] = [
  { device: "sda", size: 4000, label: "4 TB" },
  { device: "sdb", size: 8000, label: "8 TB" },
  { device: "nvme0n1", size: 500, label: "500 GB" },
  { device: "sdc", size: 2000, label: "2 TB" },
];

function SortDemo() {
  const [bySize, setBySize] = React.useState(false);
  const disks = React.useMemo(
    () =>
      bySize
        ? [...DISKS].sort((a, b) => b.size - a.size)
        : [...DISKS].sort((a, b) => a.device.localeCompare(b.device)),
    [bySize],
  );
  const flip = useFlip(disks, (d) => d.device);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setBySize((s) => !s);
        }}
      >
        {bySize ? "Sort by name" : "Sort by size"}
      </Button>
      <div {...flip.containerProps} className="w-full max-w-xs">
        {flip.waiting ? (
          <Button variant="ghost" size="sm" onClick={flip.release}>
            The order changed. Show it
          </Button>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {flip.items.map((disk) => (
            <li
              key={disk.device}
              data-flip-id={disk.device}
              className="flex justify-between rounded-control bg-muted px-3 py-2 text-sm"
            >
              <span className="font-mono">{disk.device}</span>
              <span className="text-muted-foreground tabular-nums">
                {disk.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * `useFlip`: "Sort by size" moves each disk from its old place to its new one over 360ms on the soft
 * curve. While the pointer or focus is in the list the order holds and a button offers the move; it
 * runs when the pointer leaves. Reduced: the rows that moved crossfade in their new places.
 */
export const Reorder: Story = {
  render: () => (
    <FullAndReduced>
      <SortDemo />
    </FullAndReduced>
  ),
};

function DrawDemo() {
  const [on, setOn] = React.useState(false);
  const path = useDrawPath(on);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setOn((o) => !o);
        }}
      >
        {on ? "Stop sharing Photos" : "Share Photos"}
      </Button>
      <svg
        viewBox="0 0 200 40"
        className="h-10 w-full max-w-xs overflow-visible"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="20"
          r="6"
          className="fill-art-plane stroke-art-line"
        />
        <circle
          cx="188"
          cy="20"
          r="6"
          className="fill-art-plane stroke-art-line"
        />
        <path
          ref={path}
          d="M20 20 C 80 2, 120 38, 180 20"
          className="fill-none stroke-art-path"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      <p className="m-0 text-sm text-muted-foreground">
        {on ? "Photos is shared." : "Photos is not shared."}
      </p>
    </div>
  );
}

/**
 * `useDrawPath` and `drawPath`: the line draws along its length over 360ms when sharing turns on and
 * retracts over 240ms on the exit curve when it turns off, never on the first render. Reduced: it
 * fades in or out over 160ms.
 */
export const DrawALine: Story = {
  render: () => (
    <FullAndReduced>
      <DrawDemo />
    </FullAndReduced>
  ),
};

function GlideDemo() {
  const [used, setUsed] = React.useState(62);
  const shown = useGlide(used) ?? used;
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setUsed((u) => (u === 62 ? 91 : 62));
        }}
      >
        {used === 62 ? "Copy 120 GiB of photos" : "Delete the copy"}
      </Button>
      <p className="m-0 text-figure tabular-nums">{Math.round(shown)} % used</p>
    </div>
  );
}

/**
 * `useGlide`: a figure glides to its new value over 640ms, so it says by how much it changed.
 * Reduced: the new value is there at once.
 */
export const GlideAValue: Story = {
  render: () => (
    <FullAndReduced>
      <GlideDemo />
    </FullAndReduced>
  ),
};

function FirstTimeDemo() {
  const [seen, setSeen] = React.useState(false);
  const { first, done } = useFirstTime(seen, () => {
    setSeen(true);
  });
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="m-0 text-sm">
        {first
          ? "This is the first time here, so the picture assembles in full."
          : "This browser has seen it, so the picture only fades in."}
      </p>
      <div className="flex gap-2">
        <Button variant="neutral" size="sm" disabled={!first} onClick={done}>
          Mark it seen
        </Button>
        <Button
          variant="plain"
          size="sm"
          disabled={first}
          onClick={() => {
            setSeen(false);
          }}
        >
          Forget it
        </Button>
      </div>
    </div>
  );
}

/**
 * `useFirstTime`: whether a first-time flourish plays in full. The library keeps no flag: the app
 * passes `seen` from its first-time store and `markSeen` to remember it; here it is the story's
 * own state.
 */
export const FirstTime: Story = {
  render: () => <FirstTimeDemo />,
};
