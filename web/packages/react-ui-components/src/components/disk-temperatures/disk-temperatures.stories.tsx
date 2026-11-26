// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DISKS_24,
  DISKS_6,
  REST_LABELS,
  temperatureGroups,
  temperatureLabels,
  VOLUMES_24,
  VOLUMES_6,
  withTemperature,
  type DemoDisk,
} from "../../fixtures/chart-fixtures";
import { Phone } from "../../fixtures/story-frames";
import { DiskTemperatures } from "./disk-temperatures";
import {
  diskGroups,
  diskTemperatureOf,
  type VolumeRows,
} from "./disk-temperatures-model";

const labels = temperatureLabels("10:31");
const NO_VOLUMES: VolumeRows = { arrays: [], pools: [], labels: [] };

const meta = {
  title: "Components/Disk temperatures",
  component: DiskTemperatures,
  args: {
    groups: temperatureGroups(DISKS_6, VOLUMES_6),
    labels,
  },
} satisfies Meta<typeof DiskTemperatures>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The dashboard's six disks on the Disks page: the Backup mirror of sdb and sdc, the pool tank on sdd
 * (asleep, so no bar), then the rest by kind. The dashed alert limit at 45 °C is one line at the same
 * height through every upright tile, and a mark at 45 °C on the stick.
 */
export const SixDisks: Story = {};

/**
 * 24 disks in three arrays and a pool, and ten in none: the NVMe sticks stay in their Apps mirror,
 * the Archive array is rebuilding and says so, sdt is over the limit and sdi and sdu are asleep.
 */
export const TwentyFourDisks: Story = {
  args: { groups: temperatureGroups(DISKS_24, VOLUMES_24) },
};

/** A pool on its own: a RAID-Z1 of four hard disks, ZFS opening each by a partition of its by-id path. */
export const APool: Story = {
  args: {
    groups: (() => {
      const disks = DISKS_24.slice(2, 7);
      const link = (d: DemoDisk) => `${d.row.devicelinks[0] ?? ""}-part1`;
      return temperatureGroups(disks, {
        arrays: [],
        pools: [
          {
            status: { name: "tank", state: "ONLINE" },
            devices: disks
              .slice(0, 4)
              .map((d) => ({ devicefile: link(d), vdev: "raidz1-0" })),
          },
        ],
        labels: [],
      });
    })(),
  },
};

/** The Backup mirror rebuilding onto a new disk: its group says so in words, with the status icon. */
export const RebuildingArray: Story = {
  args: {
    groups: temperatureGroups(DISKS_6, {
      ...VOLUMES_6,
      arrays: [
        {
          devicefile: "/dev/md0",
          name: "",
          level: "raid1",
          devices: ["/dev/sdb", "/dev/sdc"],
          state:
            "clean, degraded, recovering (12.5% (488362496/3906886144) finish=401.3min speed=141860K/sec)",
          syncaction: "recover",
        },
      ],
    }),
  },
};

/**
 * sda at 47 °C, over the 45 °C limit: its level takes the warning stroke and its figure the warning
 * icon, and the sentence under the groups says which disk and at what limit.
 */
export const OneOverTheLimit: Story = {
  args: {
    groups: temperatureGroups(withTemperature(DISKS_6, "sda", "47"), VOLUMES_6),
  },
};

/** Three disks asleep: each says "Asleep" with no bar, and one sentence says why none was read. */
export const AsleepDisks: Story = {
  args: {
    groups: temperatureGroups(
      DISKS_6.map((d) =>
        ["sda", "sdc"].includes(d.row.devicename)
          ? {
              ...d,
              row: { ...d.row, temperature: "", powermode: "STANDBY" },
            }
          : d,
      ),
      VOLUMES_6,
    ),
  },
};

/** No alert limit set in the disk health settings: no dashed line and no warning, only the levels. */
export const NoLimit: Story = {
  args: {
    groups: diskGroups(
      DISKS_6.map((d) =>
        diskTemperatureOf(
          {
            disk: d.row,
            kind: d.row.devicename.startsWith("nvme") ? "nvme" : "hdd",
          },
          { tempmax: 0 },
        ),
      ),
      NO_VOLUMES,
    ),
  },
};

/** On the dashboard with six disks: every disk is shown, with no disclosure. */
export const DashboardSixDisks: Story = {
  args: { mode: "dashboard", restLabels: REST_LABELS },
};

/**
 * On the dashboard with 24 disks: only the group with sdt, over the limit, is shown whole; the other
 * 16 disks are summed up in a sentence, with a way to open them in place.
 */
export const DashboardCollapsed: Story = {
  args: {
    groups: temperatureGroups(DISKS_24, VOLUMES_24),
    mode: "dashboard",
    restLabels: REST_LABELS,
  },
};

/** The same, opened: the other groups appear under the sentence, on the same scale. */
export const DashboardOpened: Story = {
  args: {
    groups: temperatureGroups(DISKS_24, VOLUMES_24),
    mode: "dashboard",
    restLabels: REST_LABELS,
    defaultRestOpen: true,
  },
};

/** On the dashboard with 24 disks and none over the limit: every disk is behind "Show all 24 disks". */
export const DashboardNoneOver: Story = {
  args: {
    groups: temperatureGroups(
      withTemperature(DISKS_24, "sdt", "37"),
      VOLUMES_24,
    ),
    mode: "dashboard",
    restLabels: REST_LABELS,
  },
};

/** At 390px the groups wrap under each other and the tiles of a group wrap within it. */
export const At390px: Story = {
  render: (args) => (
    <Phone>
      <DiskTemperatures {...args} />
    </Phone>
  ),
  args: { groups: temperatureGroups(DISKS_24, VOLUMES_24) },
};

/** The dashboard at 390px, collapsed. */
export const DashboardAt390px: Story = {
  render: (args) => (
    <Phone>
      <DiskTemperatures {...args} />
    </Phone>
  ),
  args: {
    groups: temperatureGroups(DISKS_24, VOLUMES_24),
    mode: "dashboard",
    restLabels: REST_LABELS,
  },
};

/** Text from the backend renders as text: an array label that looks like markup stays inert. */
export const MarkupLookingLabel: Story = {
  args: {
    groups: temperatureGroups(DISKS_6, {
      ...VOLUMES_6,
      labels: [
        { devicename: "md0", label: "<b>Backup</b> & <script>x</script>" },
      ],
    }),
  },
};
