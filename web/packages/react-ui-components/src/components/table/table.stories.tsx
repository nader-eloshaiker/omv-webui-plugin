// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button, IconButton } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState } from "../empty-state/empty-state";
import { Input } from "../field/field";
import { StatusPill } from "../status/status";
import type { HealthStatus } from "../status/status-kinds";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableLastRefreshed,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
  type SortDirection,
} from "./table";

const meta = { title: "Components/Table" } satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Disk {
  device: string;
  model: string;
  capacity: string;
  bytes: number;
  temperature: string;
  status: HealthStatus;
}

const DISKS: Disk[] = [
  {
    device: "/dev/sda",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    bytes: 4,
    temperature: "34 °C",
    status: "ok",
  },
  {
    device: "/dev/sdb",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    bytes: 4,
    temperature: "47 °C",
    status: "warning",
  },
  {
    device: "/dev/sdc",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    bytes: 4,
    temperature: "36 °C",
    status: "critical",
  },
  {
    device: "/dev/sdd",
    model: "Example SSD 500G with a long model name from the firmware",
    capacity: "465.8 GiB",
    bytes: 0.5,
    temperature: "n/a",
    status: "unknown",
  },
];

const WORDS: Record<HealthStatus, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
  disabled: "Disabled",
  stopped: "Stopped",
};

function Head({ sort, onSort }: { sort: SortDirection; onSort: () => void }) {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">
          <span className="sr-only">Selected</span>
        </TableHead>
        <TableHead sort={sort} onSort={onSort}>
          Device
        </TableHead>
        <TableHead>Model</TableHead>
        <TableHead numeric sort="none" onSort={() => undefined}>
          Capacity
        </TableHead>
        <TableHead numeric>Temperature</TableHead>
        <TableHead>Health</TableHead>
      </TableRow>
    </TableHeader>
  );
}

function DisksTable({
  state,
}: {
  state: "data" | "loading" | "empty" | "filtered" | "error";
}) {
  const [selected, setSelected] = React.useState<string[]>(["/dev/sdb"]);
  const [sort, setSort] = React.useState<SortDirection>("ascending");
  const rows = sort === "ascending" ? DISKS : [...DISKS].reverse();
  const toggle = (device: string) =>
    setSelected((current) =>
      current.includes(device)
        ? current.filter((d) => d !== device)
        : [...current, device],
    );
  return (
    <div>
      <TableToolbar aria-label="Disk actions">
        <Input
          aria-label="Search disks"
          placeholder="Search"
          className="h-7 w-48"
        />
        <Button size="sm" variant="neutral" disabled={selected.length !== 1}>
          SMART details
        </Button>
        <div className="ms-auto">
          <Button size="sm" variant="neutral" disabled={selected.length === 0}>
            <Trash2 aria-hidden="true" />
            Wipe...
          </Button>
        </div>
      </TableToolbar>
      <Table aria-label="Disks" busy={state === "loading"}>
        <Head
          sort={sort}
          onSort={() =>
            setSort(sort === "ascending" ? "descending" : "ascending")
          }
        />
        <TableBody>
          {state === "loading" ? (
            <TableSkeletonRows columns={6} rows={4} />
          ) : null}
          {state === "empty" ? (
            <TableStateRow colSpan={6}>
              <EmptyState
                title="No disks found"
                action={<Button variant="neutral">Scan again</Button>}
              >
                No disks are attached to this system.
              </EmptyState>
            </TableStateRow>
          ) : null}
          {state === "filtered" ? (
            <TableStateRow colSpan={6}>
              <EmptyState
                variant="filtered"
                action={<Button variant="neutral">Clear the search</Button>}
              >
                No disks match “nvme”.
              </EmptyState>
            </TableStateRow>
          ) : null}
          {state === "error" ? (
            <TableStateRow colSpan={6}>
              <EmptyState
                variant="error"
                title="Could not read the disks"
                action={<Button variant="neutral">Try again</Button>}
              >
                The request timed out after 30 seconds.
              </EmptyState>
            </TableStateRow>
          ) : null}
          {state === "data"
            ? rows.map((disk) => (
                <TableRow
                  key={disk.device}
                  selected={selected.includes(disk.device)}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${disk.device}`}
                      checked={selected.includes(disk.device)}
                      onCheckedChange={() => toggle(disk.device)}
                    />
                  </TableCell>
                  <TableCell mono>{disk.device}</TableCell>
                  <TableCell className="max-w-56 truncate">
                    {disk.model}
                  </TableCell>
                  <TableCell numeric>{disk.capacity}</TableCell>
                  <TableCell
                    numeric
                    className={
                      disk.status === "unknown"
                        ? "text-subtle-foreground"
                        : undefined
                    }
                  >
                    {disk.temperature}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={disk.status}>
                      {WORDS[disk.status]}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
      <TableLastRefreshed
        action={
          <IconButton
            label="Refresh the disk list"
            icon={<RefreshCw />}
            size="icon-sm"
          />
        }
      >
        Last refreshed 12:04
      </TableLastRefreshed>
    </div>
  );
}

export const WithSelection: Story = {
  render: () => <DisksTable state="data" />,
};
export const Loading: Story = { render: () => <DisksTable state="loading" /> };
export const Empty: Story = { render: () => <DisksTable state="empty" /> };
export const FilteredEmpty: Story = {
  render: () => <DisksTable state="filtered" />,
};
export const ErrorWithRetry: Story = {
  render: () => <DisksTable state="error" />,
};
