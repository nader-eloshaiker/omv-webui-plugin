// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { StatusPill } from "../status/status";
import { TaskLog, type TaskLogLine } from "./task-log";

const labels = {
  label: "Output of Install updates",
  copyLabel: "Copy output",
  copiedLabel: "Output copied",
  selectedLabel: "Output selected. Press Ctrl+C to copy.",
  download: { label: "Download output", fileName: "install-updates.log" },
};

const meta = {
  title: "Components/Task log",
  component: TaskLog,
  args: { ...labels, lines: [] },
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
} satisfies Meta<typeof TaskLog>;

export default meta;
type Story = StoryObj<typeof meta>;

const APT: TaskLogLine[] = [
  { time: "12:04:01", text: "Reading package lists..." },
  { time: "12:04:03", text: "Building dependency tree..." },
  { time: "12:04:03", text: "Reading state information..." },
  { time: "12:04:04", text: "Calculating upgrade..." },
  {
    time: "12:04:09",
    text: "3 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
  },
  {
    time: "12:04:10",
    text: "Get:1 https://deb.example.org/debian trixie/main amd64 libssl3 [2,041 kB]",
  },
  { time: "12:04:21", text: "Setting up libssl3 ..." },
];

export const WaitingForOutput: Story = {
  args: { lines: [], emptyLabel: "Waiting for output…" },
};

export const Running: Story = { args: { lines: APT } };

export const Ended: Story = {
  args: {
    lines: [...APT, { time: "12:04:30", text: "Done." }],
    endMessage: (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="succeeded">Succeeded</StatusPill>3 packages were
        upgraded.
      </span>
    ),
  },
};

export const HostileOutput: Story = {
  args: {
    lines: [
      '<img src=x onerror="alert(1)">',
      "<script>alert(2)</script>",
      "\u001b[1;31mE:\u001b[0m colour codes are removed",
      "\u001b]0;window title\u0007OSC sequences are removed",
      "Progress: 10%\rProgress: 100% (carriage returns keep the last write)",
      "‮Right-to-left override removed",
    ],
  },
};

function Streaming() {
  const [lines, setLines] = React.useState<TaskLogLine[]>(APT.slice(0, 2));
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setLines((current) => [
        ...current,
        {
          time: "12:05:" + String(current.length).padStart(2, "0"),
          text: `Unpacking package ${String(current.length)} ...`,
        },
      ]);
    }, 700);
    return () => window.clearInterval(timer);
  }, []);
  return <TaskLog {...labels} lines={lines} />;
}

export const FollowsTheTail: Story = {
  args: { lines: [] },
  render: () => <Streaming />,
  parameters: {
    docs: {
      description: {
        story:
          "Scroll up to stop following; scroll to the end to follow again.",
      },
    },
  },
};
