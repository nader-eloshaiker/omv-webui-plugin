// SPDX-License-Identifier: GPL-3.0-or-later
// The palette in use (foundation 3.6): the shipped tokens on the real components, as a dashboard and a
// settings page put them together, in both themes. The review surface for any colour change.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TriangleAlert } from "lucide-react";
import type * as React from "react";
import { Button } from "../components/button/button";
import { buttonRowClass } from "../components/button/button-class";
import { CapacityMeter } from "../components/capacity-meter/capacity-meter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/card/card";
import * as BarStories from "../components/charts/bar-chart.stories";
import * as LiveStories from "../components/charts/live-chart.stories";
import { DriveBay, type DriveSlot } from "../components/drive-bay/drive-bay";
import { PendingBand } from "../components/pending-band/pending-band";
import { PendingPill } from "../components/pending-pill/pending-pill";
import { StatusLabel } from "../components/status/status";
import { TaskLog, type TaskLogLine } from "../components/task-log/task-log";
import { TopBar, TopBarBrand } from "../components/top-bar/top-bar";
import { cn } from "../utils";
import { Panel } from "./palette-kit";

/** A story's own drawing, reused so the charts here are exactly the ones their stories show. */
function fromStory(story: { render?: unknown }): React.ReactNode {
  return typeof story.render === "function"
    ? (story.render as () => React.ReactNode)()
    : null;
}

const SLOTS: DriveSlot[] = [
  {
    id: "sda",
    device: "sda",
    kind: "hdd",
    status: "ok",
    statusLabel: "OK",
    role: "data",
  },
  {
    id: "sdb",
    device: "sdb",
    kind: "hdd",
    status: "warning",
    statusLabel: "Warning",
    role: "data",
  },
  {
    id: "sdc",
    device: "sdc",
    kind: "hdd",
    status: "critical",
    statusLabel: "Failing",
    role: "backup",
  },
  {
    id: "nvme0n1",
    device: "nvme0n1",
    kind: "ssd",
    status: "ok",
    statusLabel: "OK",
    role: "System",
  },
  {
    id: "sdd",
    device: "sdd",
    kind: "usb",
    status: "unknown",
    statusLabel: "Not checked",
    role: "USB copy",
  },
];

const APT: TaskLogLine[] = [
  { time: "12:04:01", text: "Reading package lists..." },
  { time: "12:04:03", text: "Building dependency tree..." },
  {
    time: "12:04:09",
    text: "3 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.",
  },
  {
    time: "12:04:10",
    text: "Get:1 https://deb.example.org/debian trixie/main amd64 libssl3 [2,041 kB]",
  },
  { time: "12:04:21", text: "Setting up libssl3 ..." },
  { time: "12:04:30", text: "Done." },
];

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-section text-foreground">{children}</h3>;
}

/** The destructive confirmation as the dialog draws it, in place: the dialog itself opens in a portal. */
function DestructiveConfirm() {
  return (
    <div className="flex flex-col gap-4 rounded-card p-card surface-floating">
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-foreground"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-section text-foreground">
            Delete the shared folder “photos”?
          </p>
          <div className="flex flex-col gap-2 text-base text-foreground">
            <p>
              The folder and everything in it are removed from the disk. This
              cannot be undone.
            </p>
            <ul className="list-disc ps-5 marker:text-muted-foreground">
              <li>12,408 files, 214 GiB</li>
              <li>The SMB share “photos” stops working</li>
            </ul>
          </div>
        </div>
      </div>
      <div className={cn("sm:justify-end", buttonRowClass)}>
        <Button variant="neutral">Cancel</Button>
        <Button variant="destructive">Delete photos and its files</Button>
      </div>
    </div>
  );
}

function InUse({ theme }: { theme: "dark" | "light" }) {
  return (
    <Panel
      theme={theme}
      title={theme === "dark" ? "Dark" : "Light"}
      className="gap-gutter"
    >
      <div className="-mx-6 -mt-2 flex flex-col">
        <TopBar
          className="static"
          brand={
            <TopBarBrand
              href="#dashboard"
              productName="openmediavault"
              hostName="nas.example.org"
            />
          }
          pending={
            <PendingPill count={2} label="2 pending changes" word="pending" />
          }
        />
        <PendingBand
          className="static"
          label="Pending changes"
          open
          shrinkOnScroll={false}
          message="2 changes waiting to be applied: SMB, SSH"
          applyLabel="Apply 2 changes"
          undoLabel="Undo 2 changes"
          onApply={() => undefined}
          onUndo={() => undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title text-foreground">Shared folders</h2>
        <StatusLabel status="pending">Not applied yet</StatusLabel>
        <span className="ms-auto flex flex-wrap gap-x-4 gap-y-2">
          <StatusLabel status="ok">OK</StatusLabel>
          <StatusLabel status="warning">Warning</StatusLabel>
          <StatusLabel status="critical">Critical</StatusLabel>
          <StatusLabel status="unknown">Unknown</StatusLabel>
        </span>
      </div>

      <div className="grid gap-gutter md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle level={3} tone="warning">
              Disk sdb is running warm
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              It is at 47&nbsp;°C, above the 45&nbsp;°C you set. Check that the
              fans are turning and that nothing blocks the air vents.
            </p>
            <Button variant="neutral" className="self-start">
              Run a quick health check
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle level={3} tone="critical">
              RAID md0 is degraded
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              One of its two disks is missing. The data is still there, but a
              second failure would lose it.
            </p>
            <Button className="self-start">Replace the disk</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-gutter md:grid-cols-2">
        <DestructiveConfirm />
        <div className="flex flex-col gap-4 rounded-card p-card surface-raised">
          <Heading>Space</Heading>
          <CapacityMeter
            label="File system: data"
            value={2.2}
            max={3.6}
            valueText="2.2 TiB of 3.6 TiB (62%)"
          />
          <CapacityMeter
            label="File system: photos"
            value={3.1}
            max={3.6}
            valueText="3.1 TiB of 3.6 TiB (86%); over the 85% threshold"
            threshold={{ status: "warning", label: "Warning" }}
          />
          <CapacityMeter
            label="File system: backup"
            value={3.5}
            max={3.6}
            valueText="3.5 TiB of 3.6 TiB (96%); over the 90% threshold"
            threshold={{ status: "critical", label: "Critical" }}
          />
        </div>
      </div>

      {fromStory(LiveStories.HealthyDashboard)}
      {fromStory(BarStories.SpaceByFileSystem)}

      <div className="flex min-w-0 flex-col gap-3 rounded-card p-card surface-raised">
        <Heading>Disks</Heading>
        <DriveBay aria-label="The disks in this NAS" name="nas" slots={SLOTS} />
      </div>

      <TaskLog
        label="Output of Install updates"
        copyLabel="Copy output"
        copiedLabel="Output copied"
        selectedLabel="Output selected. Press Ctrl+C to copy."
        lines={APT}
        endMessage={
          <span className="flex flex-wrap items-center gap-2">
            <StatusLabel status="succeeded">Succeeded</StatusLabel>3 packages
            were upgraded.
          </span>
        }
      />
    </Panel>
  );
}

const meta = {
  title: "Foundations/Palette in use",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both themes side by side. */
export const BothThemes: Story = {
  render: () => (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      <InUse theme="dark" />
      <InUse theme="light" />
    </div>
  ),
};

export const Dark: Story = {
  render: () => (
    <div className="mx-auto max-w-5xl p-4">
      <InUse theme="dark" />
    </div>
  ),
};

export const Light: Story = {
  render: () => (
    <div className="mx-auto max-w-5xl p-4">
      <InUse theme="light" />
    </div>
  ),
};
