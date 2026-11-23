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

// smbstatus prints columns; wrapping would scramble them, so the block scrolls sideways instead.
const SMBSTATUS = [
  "",
  "Samba version 4.22.4-Debian-4.22.4+dfsg-1~deb13u1",
  "PID     Username     Group        Machine                                   Protocol Version  Encryption           Signing",
  "----------------------------------------------------------------------------------------------------------------------------------------",
  "4321    example-user example-user 192.0.2.10 (ipv4:192.0.2.10:51234)       SMB3_11           -                    partial(AES-128-GMAC)",
  "",
  "Service      pid     Machine       Connected at                     Encryption   Signing",
  "---------------------------------------------------------------------------------------------",
  "media        4321    192.0.2.10    Sat Nov 21 10:15:02 AM 2026 UTC  -            -",
];

const serviceLabels = {
  label: "Status of SMB/CIFS",
  copyLabel: "Copy output",
  copiedLabel: "Output copied",
  selectedLabel: "Output selected. Press Ctrl+C to copy.",
};

export const ColumnsNotWrapped: Story = {
  args: {
    ...serviceLabels,
    download: undefined,
    lines: SMBSTATUS,
    wrap: false,
    size: "page",
    follow: false,
  },
};

export const ColumnsWrapped: Story = {
  args: { ...serviceLabels, download: undefined, lines: SMBSTATUS },
};

export const ShortOutputOnAPage: Story = {
  args: {
    ...serviceLabels,
    label: "Status of SSH",
    download: undefined,
    lines: [
      "Currently logged in users:",
      "No users connected",
      "",
      "Connections:",
      "No connections",
    ],
    wrap: false,
    size: "page",
    follow: false,
  },
};

export const RefreshingOnAPage: Story = {
  args: {
    ...serviceLabels,
    download: undefined,
    lines: SMBSTATUS,
    wrap: false,
    size: "page",
    follow: false,
    busy: true,
  },
};

// A file-system check's technical details: long output, of which the first lines say most.
const FSCK: TaskLogLine[] = [
  "e2fsck 1.47.2 (1-Jan-2025)",
  "Pass 1: Checking inodes, blocks, and sizes",
  "Pass 2: Checking directory structure",
  "Pass 3: Checking directory connectivity",
  "Pass 4: Checking reference counts",
  "Pass 5: Checking group summary information",
  ...Array.from(
    { length: 42 },
    (_, i) =>
      `Block bitmap differences:  -(${String(1048576 + i * 32768)}--${String(1048576 + i * 32768 + 31)})`,
  ),
  "data: 18342/244195328 files (0.4% non-contiguous), 15872341/976754176 blocks",
];

const fsckLabels = {
  label: "Technical details of Check data",
  copyLabel: "Copy details",
  copiedLabel: "Details copied",
  selectedLabel: "Details selected. Press Ctrl+C to copy.",
  download: { label: "Download details", fileName: "check-data.log" },
  follow: false,
  limit: {
    lines: 20,
    partialLabel: (shown: number, total: number) =>
      `Showing the first ${String(shown)} of ${String(total)} lines.`,
    showAllLabel: "Show all lines",
  },
};

/** Within the limit: the whole output, and no partial line. */
export const LimitUnderN: Story = {
  args: { ...fsckLabels, lines: FSCK.slice(0, 6) },
};

/**
 * Over the limit: the first 20 lines, the partial line and Show all lines under the frame. Copy and
 * download still take all 49 lines.
 */
export const LimitOverN: Story = {
  args: { ...fsckLabels, lines: FSCK },
};

// Opens the cut on mount, as pressing Show all lines does.
function Expanded() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("[data-slot=task-log-partial] button")
      ?.click();
  }, []);
  return (
    <div ref={ref}>
      <TaskLog {...fsckLabels} lines={FSCK} />
    </div>
  );
}

/** After Show all lines: every line in the same frame, and focus on the output. */
export const LimitExpanded: Story = {
  args: { ...fsckLabels, lines: FSCK },
  render: () => <Expanded />,
};

// ---- A copy job's run (phase 5 services design 7.3): the newest lines, and Stop ------------------

const copyLabels = {
  label: "Output of Copy job: Photos to Backup",
  copyLabel: "Copy output",
  copiedLabel: "Output copied",
  selectedLabel: "Output selected. Press Ctrl+C to copy.",
  download: { label: "Download output", fileName: "copy-job-photos.log" },
};

// The story caps at 200 so the frame is quick to scroll; the app caps at 10,000 (D10).
const copyCap = {
  lines: 200,
  label: (shown: number, total: number) =>
    `Showing the newest ${shown.toLocaleString("en")} of ${total.toLocaleString("en")} lines. The download has every line received.`,
};

const copyStop = {
  label: "Stop the copy…",
  title: "Stop Photos to Backup?",
  description:
    "Files copied so far stay. Files it deleted so far stay deleted. The next run carries on.",
  confirmLabel: "Stop the copy",
  cancelLabel: "Cancel",
  onStop: () => undefined,
};

function rsyncLines(count: number): string[] {
  return [
    "Please wait ...",
    "sending incremental file list",
    ...Array.from(
      { length: count },
      (_, i) =>
        `2026/Holiday ${String(1 + (i % 12)).padStart(2, "0")}/IMG_${String(4000 + i)}.jpg`,
    ),
  ];
}

/** Under the cap: every line, no notice, and Stop while it runs. */
export const CapUnderN: Story = {
  args: {
    ...copyLabels,
    lines: rsyncLines(40),
    cap: copyCap,
    stop: copyStop,
  },
};

/** Over the cap: only the newest lines on screen, the notice under the frame, all in the download. */
export const CapOverN: Story = {
  args: {
    ...copyLabels,
    lines: rsyncLines(30_000),
    cap: copyCap,
    stop: copyStop,
  },
};

/** The stop has been asked for and is under way. */
export const Stopping: Story = {
  args: {
    ...copyLabels,
    lines: rsyncLines(120),
    cap: copyCap,
    stop: { ...copyStop, pending: true },
  },
};

// Opens the confirmation on mount, as pressing Stop does.
function StopConfirmation() {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>("[data-slot=task-log-stop] button")
      ?.click();
  }, []);
  return (
    <div ref={ref}>
      <TaskLog
        {...copyLabels}
        lines={rsyncLines(80)}
        cap={copyCap}
        stop={copyStop}
      />
    </div>
  );
}

/** The plain confirmation, focus on Cancel. */
export const StopConfirm: Story = {
  args: { ...copyLabels, lines: [] },
  render: () => <StopConfirmation />,
};

/** Stopped: no Stop any more, and the result kept on screen. */
export const Stopped: Story = {
  args: {
    ...copyLabels,
    lines: [
      ...rsyncLines(64),
      "rsync error: received SIGINT, SIGTERM, or SIGHUP (code 20) at rsync.c(713) [sender=3.4.1]",
    ],
    cap: copyCap,
    endMessage: (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="cancelled">Cancelled</StatusPill>Photos to Backup
        was stopped. Files copied so far stay.
      </span>
    ),
  },
};

/** Failed with no output at all (design 7.3, 0.6: it may already be running on its schedule). */
export const FailedWithNoOutput: Story = {
  args: {
    ...copyLabels,
    lines: [],
    cap: copyCap,
    emptyLabel: "No output.",
    endMessage: (
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill status="failed">Failed</StatusPill>Photos to Backup ended at
        once without saying why. It may already be running on its schedule. Wait
        for it to end and try again.
      </span>
    ),
  },
};
