// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { StoryMeter } from "../../fixtures/nas-dashboard";
import {
  baseNas,
  dashboardReadsNas,
  diskCriticalNas,
  laneFailedNas,
  loadingNas,
  manyNas,
  newNas,
  poolDisksUnreadNas,
  withSdbWarning,
} from "../../fixtures/nas-fixtures";
import { NAS_MAP_WORDS } from "../../fixtures/nas-words";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import {
  NasMap,
  NasMapFolderChip,
  NasMapStorageCell,
  NasMapWire,
} from "./nas-map";
import { nasMapView, type NasLane, type NasMapInput } from "./nas-map-model";

const BACKUP = baseNas().storage.find((s) => s.id === "backup");

function MapStory({
  input,
  captions,
  example,
  addStorage,
}: {
  input: NasMapInput;
  captions?: readonly NasLane[];
  example?: boolean;
  addStorage?: boolean;
}) {
  const view = React.useMemo(() => nasMapView(input), [input]);
  const [opened, setOpened] = React.useState("");
  return (
    <div className="flex flex-col gap-3">
      <NasMap
        view={view}
        words={NAS_MAP_WORDS}
        meter={(s) => <StoryMeter storage={s} />}
        onOpen={(item) => {
          setOpened(`Opens the ${item.kind}.`);
        }}
        captions={captions}
        example={example}
        addStorage={
          addStorage ? (
            <Button variant="primary" size="sm">
              <Icon name="file-system" mark="create" size={16} />
              Add storage
            </Button>
          ) : null
        }
        errors={{ disks: "The request timed out after 10 seconds." }}
        onRetry={() => undefined}
      />
      {opened ? (
        <p role="status" className="text-sm text-muted-foreground">
          {opened}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The NAS as rows (rethink 6.8): disks, storage with its meter in a slot, shared folders with their
 * ways in, then the band of ways in and the network. Point at or focus a folder, a disk or a way in
 * to trace it; the arrow keys move along and between rows.
 */
const meta = {
  title: "Drawings/NAS map",
  component: MapStory,
  args: { input: baseNas() },
} satisfies Meta<typeof MapStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Rows: Story = {};

/** A failing disk: its row first, its icon at the start, its connectors and storage in its tone. */
export const ADiskFailing: Story = { args: { input: diskCriticalNas() } };

/** A new NAS: the unused disks end in "Add storage", the example row and every caption. */
export const NewNasWithExample: Story = {
  args: {
    input: newNas(),
    captions: ["disks", "storage", "folders", "ways", "network"],
    example: true,
    addStorage: true,
  },
};

/** 24 disks, 8 storage: a strip for the healthy disks beyond six, "+4 more" folders, "3 more" rows. */
export const Many: Story = { args: { input: manyNas() } };

/**
 * As the dashboard reads the NAS (owner, 2026-11-27): it never reads the RAID arrays, so Backup is a
 * file system with no disk attached and says where its disks are, with no connector, and sdb and sdc
 * stand on a row of their own after the system drive. Neither is called unused: only sde is.
 */
export const DashboardReads: Story = { args: { input: dashboardReadsNas() } };

/**
 * A RAID member reports a problem: its row moves up with the problems, starts with the warning icon
 * and its connector takes the tone. sdb's word shows in place.
 */
export const RaidMemberWarning: Story = {
  args: { input: withSdbWarning(dashboardReadsNas()) },
};

/**
 * The pool's disks could not be read (Zfs.getPoolDevices failed): tank says so where its disks would
 * be, and since sdd may be in it, no disk is called unused and there is no "Add storage".
 */
export const PoolDisksUnread: Story = {
  args: { input: poolDisksUnreadNas(), addStorage: true },
};

/** The dashboard's reads at 390px: the sentence stands where the disks would. */
export const DashboardReadsNarrow: Story = {
  args: { input: withSdbWarning(dashboardReadsNas()) },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/** The disks could not be read: the error in place, the rest stands. */
export const DisksUnread: Story = { args: { input: laneFailedNas() } };

/** The first read in flight: still placeholder rows. */
export const Loading: Story = { args: { input: loadingNas() } };

/** At 390px the rows stack and the connectors run down. */
export const Narrow: Story = {
  args: { input: diskCriticalNas() },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/** The parts, alone: a storage cell with its meter slot, a folder chip, the connectors. */
export const Parts: Story = {
  render: () => (
    <div className="@container/nasmap flex max-w-2xl flex-col gap-4">
      <div className="flex items-center">
        <NasMapWire tone="warning" />
        <div className="w-60 shrink-0">
          <NasMapStorageCell
            kind="raid"
            name="Backup"
            tech="Mirror (RAID 1)"
            state={{ tone: "warning", label: "At risk" }}
            meter={BACKUP ? <StoryMeter storage={BACKUP} /> : null}
            action={{}}
          />
        </div>
        <NasMapWire place="folders" tone="warning" />
        <NasMapFolderChip
          name="Time Machine"
          ways={[{ id: "smb", label: "Windows and Mac" }]}
        />
      </div>
      <div className="flex items-center">
        <NasMapWire tone="ghost" />
        <div className="w-60 shrink-0">
          <NasMapStorageCell
            variant="ghost"
            kind="fs"
            name="Data drive"
            tech="EXT4"
          />
        </div>
        <NasMapWire place="folders" tone="ghost" />
        <NasMapFolderChip
          variant="ghost"
          name="Photos"
          ways={[{ id: "smb", label: "Windows and Mac" }]}
        />
      </div>
      <NasMapFolderChip
        className="self-start"
        name="a4share <b>not markup</b>"
        ways={[]}
        noWays="Ways in: none"
        state={{ tone: "critical", label: "Not reachable" }}
      />
    </div>
  ),
};
