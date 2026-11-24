// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { flyPendingMark } from "../flight/flight";
import { PendingPill } from "../pending-pill/pending-pill";
import { PendingBand, type PendingBandState } from "./pending-band";

const meta = {
  title: "Components/Pending band",
  component: PendingBand,
  parameters: { layout: "fullscreen" },
  args: {
    label: "Pending changes",
    open: true,
    shrinkOnScroll: false,
    message: "3 changes waiting to be applied: SMB, SSH, Network interfaces",
    applyingMessage: "Applying the changes… The services restart as needed.",
    appliedMessage:
      "Applied. SMB, SSH and Network interfaces now use the new settings.",
    failedMessage:
      "Applying the changes failed. They are still saved and waiting. SMB could not be restarted.",
    applyLabel: "Apply 3 changes",
    undoLabel: "Undo 3 changes",
    retryLabel: "Try applying again",
    showProgress: { label: "Show progress", onShow: () => undefined },
    onApply: () => undefined,
    onUndo: () => undefined,
  },
} satisfies Meta<typeof PendingBand>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OneChange: Story = {
  args: {
    message: "1 change waiting to be applied: SSH",
    applyLabel: "Apply 1 change",
    undoLabel: "Undo 1 change",
  },
};

/** Twelve modules: the words wrap under 640px instead of being cut. */
export const TwelveChanges: Story = {
  args: {
    message:
      "12 changes waiting to be applied: SMB, SSH, Network interfaces, Firewall, NFS, Rsync server, Time, Notifications, Shared folders, Disk monitoring, Web interface, Scheduled tasks",
    applyLabel: "Apply 12 changes",
    undoLabel: "Undo 12 changes",
  },
};

export const Applying: Story = { args: { state: "applying" } };

export const Applied: Story = { args: { state: "applied" } };

export const Failed: Story = { args: { state: "failed" } };

/** Compact density: the band is slimmer, its buttons shorter. */
export const Compact: Story = {
  render: (args) => (
    <div data-density="compact">
      <PendingBand {...args} />
    </div>
  ),
};

/** Text from the server stays text: a module name that looks like markup renders inert. */
export const MarkupLookingText: Story = {
  args: {
    message: "1 change waiting to be applied: <img src=x onerror=alert(1)>",
    applyLabel: "Apply 1 change",
    undoLabel: "Undo 1 change",
  },
};

const pillLabel = (n: number | null) =>
  n === null
    ? "Pending changes"
    : n === 0
      ? "No pending changes"
      : `${n} pending ${n === 1 ? "change" : "changes"}`;

/** The top bar's pill in each state: none, one, twelve, unknown count, applying. */
export const Pills: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 p-6">
      {[0, 1, 12, null].map((n) => (
        <PendingPill
          key={String(n)}
          count={n}
          label={pillLabel(n)}
          word="pending"
        />
      ))}
      <PendingPill
        count={3}
        applying
        label="3 pending changes, applying"
        word="pending"
      />
    </div>
  ),
};

function FlightDemo() {
  const [count, setCount] = React.useState(0);
  const [state, setState] = React.useState<PendingBandState>("idle");
  const pillRef = React.useRef<HTMLButtonElement>(null);
  const word = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;
  return (
    <div className="flex min-h-96 flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-3">
        <PendingPill
          ref={pillRef}
          count={count}
          label={pillLabel(count)}
          word="pending"
        />
      </div>
      <PendingBand
        label="Pending changes"
        open={count > 0}
        state={state}
        shrinkOnScroll={false}
        message={`${word(count)} waiting to be applied`}
        applyingMessage="Applying the changes…"
        appliedMessage="Applied."
        applyLabel={`Apply ${word(count)}`}
        undoLabel={`Undo ${word(count)}`}
        onUndo={() => setCount(0)}
        onApply={() => {
          setState("applying");
          window.setTimeout(() => {
            setState("applied");
            window.setTimeout(() => {
              setCount(0);
              setState("idle");
            }, 1600);
          }, 2000);
        }}
      />
      <div className="mt-auto flex justify-start p-6">
        <Button
          onClick={(event) => {
            const from = event.currentTarget;
            void flyPendingMark(from, pillRef.current ?? from);
            setCount((n) => n + 1);
          }}
        >
          Save SSH
        </Button>
      </div>
    </div>
  );
}

/**
 * The pending flight: Save sends a mark on an arc into the pill, which pops on the settle spring as
 * the count rises; the band slides open. Under reduced motion the mark does not fly and the pill and
 * band simply appear.
 */
export const Flight: Story = { render: () => <FlightDemo /> };
