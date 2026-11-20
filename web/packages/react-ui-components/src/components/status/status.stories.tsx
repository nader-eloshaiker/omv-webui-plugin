// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDot, StatusPill } from "./status";
import { rollUp, type RollUpStatus, type Status } from "./status-kinds";

const WORDS: Record<Status, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
  disabled: "Disabled",
  stopped: "Stopped",
  waiting: "Waiting",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Pending",
};

const meta = {
  title: "Components/Status",
  component: StatusPill,
  args: { status: "ok", children: "OK" },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Health: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        ["ok", "warning", "critical", "unknown", "disabled", "stopped"] as const
      ).map((s) => (
        <StatusPill key={s} status={s}>
          {WORDS[s]}
        </StatusPill>
      ))}
    </div>
  ),
};

export const TaskSteps: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(
        ["waiting", "running", "succeeded", "failed", "cancelled"] as const
      ).map((s) => (
        <StatusPill key={s} status={s}>
          {WORDS[s]}
        </StatusPill>
      ))}
    </div>
  ),
};

export const Pending: Story = {
  args: { status: "pending", children: "Pending" },
};

export const OnEveryGround: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-3">
      {(["bg-page", "bg-surface", "bg-muted"] as const).map((ground) => (
        <div
          key={ground}
          className={`flex flex-wrap gap-2 rounded-card border border-border p-3 ${ground}`}
        >
          {(["ok", "warning", "critical", "unknown", "pending"] as const).map(
            (s) => (
              <StatusPill key={s} status={s}>
                {WORDS[s]}
              </StatusPill>
            ),
          )}
        </div>
      ))}
    </div>
  ),
};

export const Dots: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {(["ok", "warning", "critical", "unknown", "stopped"] as const).map(
          (s) => (
            <StatusDot key={s} status={s} label={WORDS[s]} showLabel />
          ),
        )}
      </div>
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        Compact, word in the name and tooltip:
        {(["ok", "warning", "critical", "unknown"] as const).map((s) => (
          <StatusDot key={s} status={s} label={WORDS[s]} />
        ))}
      </p>
    </div>
  ),
};

const DISKS: { device: string; status: RollUpStatus }[] = [
  { device: "/dev/sda", status: "ok" },
  { device: "/dev/sdb", status: "critical" },
  { device: "/dev/sdc", status: "ok" },
  { device: "/dev/sdd", status: "unknown" },
];

export const RollUp: Story = {
  render: () => {
    const { status, count, total } = rollUp(DISKS.map((d) => d.status));
    return (
      <StatusPill status={status ?? "unknown"}>
        {`${String(count)} of ${String(total)} disks: ${WORDS[status ?? "unknown"]}`}
      </StatusPill>
    );
  },
};

export const LongWord: Story = {
  args: {
    status: "unknown",
    children: "Nicht überwacht (keine SMART-Unterstützung)",
  },
};
