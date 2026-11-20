// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button, IconButton } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState } from "../empty-state/empty-state";
import { Input } from "../field/field";
import { StatusIcon, StatusPill } from "../status/status";
import type { HealthStatus } from "../status/status-kinds";
import { Identifier } from "../text/identifier";
import { Tooltip } from "../tooltip/tooltip";
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
  temperature: string | null;
  status: HealthStatus;
}

const DISKS: Disk[] = [
  {
    device: "/dev/sda",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    temperature: "34 °C",
    status: "ok",
  },
  {
    device: "/dev/sdb",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    temperature: "47 °C",
    status: "warning",
  },
  {
    device: "/dev/sdc",
    model: "Example HDD 4T",
    capacity: "3.6 TiB",
    temperature: "36 °C",
    status: "critical",
  },
  {
    device: "/dev/sdd",
    model: "Example SSD 500G with a long model name from the firmware",
    capacity: "465.8 GiB",
    temperature: null,
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

type State = "data" | "loading" | "empty" | "filtered" | "error";

function DisksTable({
  state,
  touch = false,
}: {
  state: State;
  touch?: boolean;
}) {
  const [selected, setSelected] = React.useState<string[]>(["/dev/sdb"]);
  const [sort, setSort] = React.useState<SortDirection>("ascending");
  const rows = sort === "ascending" ? DISKS : [...DISKS].reverse();
  const all = selected.length === DISKS.length;
  const some = selected.length > 0 && !all;
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
          className="min-h-7 w-48"
        />
        <span
          role="status"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {selected.length > 0 ? `${String(selected.length)} selected` : ""}
        </span>
        <Tooltip content="Select exactly one disk to see its SMART details.">
          <Button
            size="sm"
            variant="neutral"
            disabled={selected.length !== 1}
            focusableWhenDisabled
          >
            SMART details
          </Button>
        </Tooltip>
        <div className="ms-auto">
          <Tooltip content="Select one disk to wipe it.">
            <Button
              size="sm"
              variant="neutral"
              disabled={selected.length !== 1}
              focusableWhenDisabled
            >
              <Trash2 aria-hidden="true" />
              Wipe…
            </Button>
          </Tooltip>
        </div>
      </TableToolbar>
      <Table
        aria-label="Disks"
        busy={state === "loading"}
        busyLabel="Loading disks…"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all disks"
                checked={all}
                indeterminate={some}
                onCheckedChange={() =>
                  setSelected(all ? [] : DISKS.map((d) => d.device))
                }
              />
            </TableHead>
            <TableHead
              sort={sort}
              onSort={() =>
                setSort(sort === "ascending" ? "descending" : "ascending")
              }
            >
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
                No disks match <Identifier>nvme</Identifier>.
              </EmptyState>
            </TableStateRow>
          ) : null}
          {state === "error" ? (
            <TableStateRow colSpan={6}>
              <EmptyState
                variant="error"
                title="Could not read the disks"
                serverMessage={{
                  label: "Message from the server",
                  text: "The request timed out after 30 seconds.",
                }}
                action={<Button variant="neutral">Try again</Button>}
              >
                The list of disks did not load. Nothing was changed.
              </EmptyState>
            </TableStateRow>
          ) : null}
          {state === "data"
            ? rows.map((disk) => (
                <TableRow
                  key={disk.device}
                  selected={selected.includes(disk.device)}
                  size={touch ? "touch" : "default"}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${disk.device}`}
                      checked={selected.includes(disk.device)}
                      onCheckedChange={() => toggle(disk.device)}
                    />
                  </TableCell>
                  <TableCell mono>{disk.device}</TableCell>
                  <TableCell className="max-w-64 [overflow-wrap:anywhere]">
                    {disk.model}
                  </TableCell>
                  <TableCell numeric>{disk.capacity}</TableCell>
                  <TableCell numeric>
                    {disk.temperature ?? (
                      <span className="inline-flex items-center gap-1 text-unknown-label">
                        <StatusIcon status="unknown" />
                        No reading
                      </span>
                    )}
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
export const TouchRows: Story = {
  render: () => <DisksTable state="data" touch />,
};
export const Loading: Story = { render: () => <DisksTable state="loading" /> };
export const Empty: Story = { render: () => <DisksTable state="empty" /> };
export const FilteredEmpty: Story = {
  render: () => <DisksTable state="filtered" />,
};
export const ErrorWithRetry: Story = {
  render: () => <DisksTable state="error" />,
};
