// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { Button, IconButton } from "../button/button";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState } from "../empty-state/empty-state";
import { Input } from "../field/field";
import { PairStack } from "../page-layout/page-layout";
import { StatusIcon, StatusLabel } from "../status/status";
import type { HealthStatus } from "../status/status-kinds";
import { Identifier } from "../text/identifier";
import { Tooltip } from "../tooltip/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
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
    <PairStack>
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
                    <StatusLabel status={disk.status}>
                      {WORDS[disk.status]}
                    </StatusLabel>
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
    </PairStack>
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

/** A wide table in a narrow column: the frame is a named region, so the keyboard can scroll it. */
export const ScrollsInsideItsFrame: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Table
      aria-label="Entries of File access over SMB/CIFS (audit)"
      frameLabel="Entries of File access over SMB/CIFS (audit)"
    >
      <TableHeader>
        <TableRow>
          {[
            "Time",
            "User",
            "Computer",
            "Shared folder",
            "File",
            "Action",
            "Result",
          ].map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="whitespace-nowrap">
            21 Nov 2026, 03:32:00
          </TableCell>
          <TableCell>example-user</TableCell>
          <TableCell mono>192.0.2.10</TableCell>
          <TableCell>media</TableCell>
          <TableCell mono>old.jpg</TableCell>
          <TableCell mono>unlinkat</TableCell>
          <TableCell>ok</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

interface PoolDisk {
  device: string;
  model: string;
  serial: string;
  size: string;
  role: string;
  status?: HealthStatus;
}

interface DiskGroup {
  id: string;
  heading: string;
  description?: string;
  disks: PoolDisk[];
}

const MIRROR: DiskGroup = {
  id: "group-mirror-0",
  heading: "Mirror, 2 disks",
  description: "Protected: one disk of the two can fail without losing files.",
  disks: [
    {
      device: "/dev/sdb",
      model: "Example HDD 4T",
      serial: "EXAMPLE-0001",
      size: "3.6 TiB",
      role: "Working",
    },
    {
      device: "/dev/sdc",
      model: "Example HDD 4T",
      serial: "EXAMPLE-0002",
      size: "3.6 TiB",
      role: "Working",
    },
  ],
};

const GROUPS: DiskGroup[] = [
  MIRROR,
  {
    id: "group-mirror-1",
    heading: "Mirror, 2 disks",
    description:
      "Not protected now: a disk is missing. If the other disk fails, every file on the pool is lost.",
    disks: [
      {
        device: "/dev/sdd",
        model: "Example HDD 4T",
        serial: "EXAMPLE-0003",
        size: "3.6 TiB",
        role: "Working",
      },
      {
        device: "/dev/sde",
        model: "Example HDD 4T",
        serial: "EXAMPLE-0004",
        size: "3.6 TiB",
        role: "Missing",
        status: "critical",
      },
    ],
  },
  {
    id: "group-cache",
    heading: "Read cache, 1 disk",
    description: "Speeds up reading. Losing it loses no files.",
    disks: [
      {
        device: "/dev/nvme0n1",
        model: "Example NVMe SSD 500G",
        serial: "EXAMPLE-0005",
        size: "465.8 GiB",
        role: "Working",
      },
    ],
  },
];

function RoleCell({ disk }: { disk: PoolDisk }) {
  return disk.status ? (
    <StatusLabel status={disk.status}>{disk.role}</StatusLabel>
  ) : (
    disk.role
  );
}

/** A pool's disks, each group in its own body with its heading row first (phase 5, 2.5). */
function PoolDisksTable({ groups }: { groups: DiskGroup[] }) {
  return (
    <Table aria-label="Disks of pool tank" frameLabel="Disks of pool tank">
      <TableHeader>
        <TableRow>
          <TableHead>Disk</TableHead>
          <TableHead>Model</TableHead>
          <TableHead numeric>Size</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      {groups.map((group) => (
        <TableBody key={group.id}>
          <TableGroupRow
            colSpan={4}
            id={group.id}
            heading={group.heading}
            description={group.description}
          />
          {group.disks.map((disk) => (
            <TableRow key={disk.device} className="whitespace-nowrap">
              <TableCell>
                <Identifier>{disk.device}</Identifier>
              </TableCell>
              <TableCell>
                <div>{disk.model}</div>
                <Identifier className="text-sm text-muted-foreground">
                  {disk.serial}
                </Identifier>
              </TableCell>
              <TableCell numeric>{disk.size}</TableCell>
              <TableCell>
                <RoleCell disk={disk} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  );
}

/** One group with its protection sentence. */
export const GroupRowOneGroup: Story = {
  render: () => <PoolDisksTable groups={[MIRROR]} />,
};

/**
 * Several groups, each in its own body: a screen reader reads each disk with its group ("Mirror, 2
 * disks ... /dev/sde, Missing").
 */
export const GroupRowSeveralGroups: Story = {
  render: () => <PoolDisksTable groups={GROUPS} />,
};

/**
 * A long heading in a 320px column. The table scrolls sideways inside its frame; the heading and its
 * sentence stay at the frame's start and wrap in view, breaking a name with no spaces.
 */
export const GroupRowLongHeadingAt320: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <PoolDisksTable
      groups={[
        {
          ...MIRROR,
          heading:
            "RAID-Z2, 6 disks, in special_metadata_class_for_small_blocks_and_the_dedup_table_of_backup-archive-2026",
          description:
            "Protected: any two disks of the six can fail without losing files. A third failure loses every file on the pool.",
        },
        ...GROUPS.slice(1),
      ]}
    />
  ),
};

/** The compact phone layout: two columns, the disk and its role, at 320px. */
export const GroupRowCompactPhoneLayout: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Table aria-label="Disks of pool tank">
      <TableHeader>
        <TableRow>
          <TableHead>Disk</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      {GROUPS.map((group) => (
        <TableBody key={group.id}>
          <TableGroupRow
            colSpan={2}
            id={`${group.id}-compact`}
            heading={group.heading}
            description={group.description}
          />
          {group.disks.map((disk) => (
            <TableRow key={disk.device} size="touch">
              <TableCell>
                <Identifier>{disk.device}</Identifier>
                <div className="text-sm text-muted-foreground">{disk.size}</div>
              </TableCell>
              <TableCell>
                <RoleCell disk={disk} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  ),
};

/** Markup-looking words from the backend render as text. */
export const GroupRowHostileText: Story = {
  render: () => (
    <PoolDisksTable
      groups={[
        {
          ...MIRROR,
          heading: '<img src="x" onerror="alert(1)"> Mirror, 2 disks',
          description: "<script>alert('group')</script> &amp; <b>bold</b>",
        },
      ]}
    />
  ),
};
