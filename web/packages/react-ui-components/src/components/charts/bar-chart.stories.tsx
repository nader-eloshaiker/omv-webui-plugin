// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BothDensities, Phone, StoryCard } from "../../fixtures/story-frames";
import { BarChart } from "./bar-chart";

interface FileSystem {
  label: string;
  type: string;
  usedTiB: number;
  sizeTiB: number;
  threshold: number;
}
interface Disk {
  device: string;
  holds: string;
  temp: number | null;
}

const FILE_SYSTEMS: FileSystem[] = [
  { label: "data", type: "ext4", usedTiB: 2.2, sizeTiB: 3.6, threshold: 85 },
  { label: "photos", type: "Btrfs", usedTiB: 3.1, sizeTiB: 3.6, threshold: 85 },
  { label: "backup", type: "ZFS", usedTiB: 1.1, sizeTiB: 7.2, threshold: 85 },
  {
    label: "media-archive-2019-and-older",
    type: "XFS",
    usedTiB: 0.4,
    sizeTiB: 1.8,
    threshold: 85,
  },
];
const DISKS: Disk[] = [
  { device: "sda", holds: "data", temp: 38 },
  { device: "sdb", holds: "data", temp: 47 },
  { device: "sdc", holds: "backup", temp: 36 },
  { device: "sdd", holds: "USB copy", temp: null },
];
const pct = (f: FileSystem) => Math.round((f.usedTiB / f.sizeTiB) * 100);
const tib = (v: number) => `${v.toFixed(1)}\u00a0TiB`;

function Space({ data }: { data: FileSystem[] }) {
  return (
    <BarChart<FileSystem>
      data={data}
      orientation="rows"
      rowKey={(f) => f.label}
      name={(f) => f.label}
      value={(f) => f.usedTiB}
      total={(f) => f.sizeTiB}
      formatTick={(v) => `${v}\u00a0TiB`}
      barLabel={(f) =>
        pct(f) >= f.threshold ? `${pct(f)}% · Almost full` : `${pct(f)}%`
      }
      missingLabel="No reading"
      tooltip={(f) => ({
        title: f.label,
        meta: f.type,
        body: (
          <>
            <p className="tabular-nums">
              {tib(f.usedTiB)} of {tib(f.sizeTiB)} used · {pct(f)}%
            </p>
            <p className="text-tertiary-foreground">
              {tib(f.sizeTiB - f.usedTiB)} free
              {pct(f) >= f.threshold ? " · Almost full" : ""}
            </p>
          </>
        ),
      })}
      label="Space by file system"
      description={data
        .map(
          (f) =>
            `${f.label}: ${tib(f.usedTiB)} of ${tib(f.sizeTiB)} used, ${pct(f)}%`,
        )
        .join("; ")}
      table={{
        summary: "Show the numbers as a table",
        caption: "Space by file system",
        columns: [
          { id: "name", header: "File system", cell: (f) => f.label },
          {
            id: "used",
            header: "Used",
            numeric: true,
            cell: (f) => tib(f.usedTiB),
          },
          {
            id: "size",
            header: "Size",
            numeric: true,
            cell: (f) => tib(f.sizeTiB),
          },
          {
            id: "full",
            header: "Full",
            numeric: true,
            cell: (f) => `${pct(f)}%`,
          },
        ],
      }}
    />
  );
}

function Temperatures({ data }: { data: Disk[] }) {
  return (
    <BarChart<Disk>
      data={data}
      rowKey={(d) => d.device}
      name={(d) => d.device}
      monoNames
      value={(d) => d.temp}
      domain={[0, 70]}
      ticks={[0, 35, 70]}
      // The alert temperature comes from Disk health's settings; 55 °C here is only an example.
      alerts={[{ value: 55, label: "Alert at 55\u00a0°C" }]}
      formatTick={(v) => `${v}°`}
      barLabel={(d) => `${d.temp}°`}
      missingLabel="No reading"
      tooltip={(d) => ({
        title: <span className="font-mono">{d.device}</span>,
        meta: d.holds,
        body:
          d.temp === null
            ? "Reports no temperature (USB)"
            : `${d.temp}\u00a0°C now`,
      })}
      label="Disk temperatures now"
      description={`${data.map((d) => (d.temp === null ? `${d.device} reports no temperature` : `${d.device} ${d.temp} °C`)).join(", ")}. Alert at 55 °C.`}
      table={{
        summary: "Show the numbers as a table",
        caption: "Disk temperatures now",
        columns: [
          { id: "disk", header: "Disk", mono: true, cell: (d) => d.device },
          { id: "holds", header: "Holds", cell: (d) => d.holds },
          {
            id: "temp",
            header: "Temperature",
            numeric: true,
            cell: (d) =>
              d.temp === null ? "Not reported" : `${d.temp}\u00a0°C`,
          },
        ],
      }}
    />
  );
}

const meta = {
  title: "Charts/Bar chart",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** Sizes as rows: each file system to one scale, the used part filled; one past its threshold says so in words. */
export const SpaceByFileSystem: Story = {
  render: () => (
    <StoryCard title="Where the space is" className="max-w-3xl">
      <Space data={FILE_SYSTEMS} />
    </StoryCard>
  ),
};

/** One measure across things as columns, with the alert line from settings; a USB disk reports none. */
export const DiskTemperatures: Story = {
  render: () => (
    <StoryCard title="Disk temperatures" className="max-w-2xl">
      <Temperatures data={DISKS} />
    </StoryCard>
  ),
};

/** A healthy NAS: every disk cool, every file system with room. */
export const HealthyNas: Story = {
  render: () => (
    <div className="grid max-w-5xl gap-gutter md:grid-cols-2">
      <StoryCard title="Where the space is">
        <Space data={FILE_SYSTEMS.filter((f) => f.label !== "photos")} />
      </StoryCard>
      <StoryCard title="Disk temperatures">
        <Temperatures
          data={DISKS.slice(0, 3).map((d) => ({
            ...d,
            temp: (d.temp ?? 40) - 4,
          }))}
        />
      </StoryCard>
    </div>
  ),
};

export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <div className="flex flex-col gap-4">
        <StoryCard title="Where the space is">
          <Space data={FILE_SYSTEMS} />
        </StoryCard>
        <StoryCard title="Disk temperatures">
          <Temperatures data={DISKS} />
        </StoryCard>
      </div>
    </Phone>
  ),
};

export const Densities: Story = {
  render: () => (
    <BothDensities>
      <StoryCard title="Disk temperatures">
        <Temperatures data={DISKS} />
      </StoryCard>
    </BothDensities>
  ),
};
