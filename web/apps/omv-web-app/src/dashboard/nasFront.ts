// SPDX-License-Identifier: GPL-3.0-or-later
// The drawing of the NAS's front and the scan line under the answer, from the map's own input
// (dashboard/nasModel.ts), so the three never disagree (journal 2026-11-27, the dashboard design).
// Pure: the words come in from the catalogue (hooks/useNasFront.ts), every figure from a read.
import type {
  NasDisk,
  NasFrontBay,
  NasFrontGroup,
  NasFrontStick,
  NasHealth,
  NasMapInput,
  ScanLineArea,
  ScanLineTone,
} from "@omv-webui/react-ui-components";
import { nasFrontGroups } from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";

/** The ids of the parts of the page the scan line lands on. */
export const DASHBOARD_TARGETS = {
  map: "dashboard-map",
  temps: "dashboard-temps",
} as const;

export interface NasFrontWords {
  raid: string;
  unused: string;
  ready: string;
  /** The words beside the stick: "On the mainboard, NVMe SSD, 238.5 GiB" and the storage it holds. */
  stick: (summary: string | undefined, holds: string | undefined) => ReactNode;
}

export interface NasFrontParts {
  bays: NasFrontBay[];
  board: NasFrontStick[];
  groups: NasFrontGroup[];
}

/**
 * The bays hold every disk but the NVMe sticks, in device order (the dashboard reads no bay
 * positions, so none is claimed); the sticks stand on the board. A USB disk is drawn as a disk.
 */
export function nasFrontParts(
  input: Pick<NasMapInput, "disks" | "storage">,
  newNas: boolean,
  words: NasFrontWords,
): NasFrontParts {
  const holds = (d: NasDisk) =>
    input.storage.find((s) => d.storage.includes(s.id));
  const inBays = input.disks.filter((d) => d.kind !== "nvme");
  const bays = inBays.map((d): NasFrontBay => ({
    id: d.id,
    device: d.device,
    kind: d.kind === "usb" ? "disk" : d.kind,
    summary: d.summary,
    detail: d.detail,
  }));
  const board = input.disks
    .filter((d) => d.kind === "nvme")
    .map((d): NasFrontStick => ({
      id: d.id,
      device: d.device,
      detail: words.stick(d.summary, holds(d)?.name),
    }));
  const groups = nasFrontGroups(inBays, (d) => {
    const storage = holds(d);
    if (storage) {
      return { id: storage.id, name: storage.name, tech: storage.tech };
    }
    if (d.raidMember === true) {
      return { id: "raid", name: words.raid };
    }
    return {
      id: "unused",
      name: newNas ? words.ready : words.unused,
      dashed: true,
    };
  });
  return { bays, board, groups };
}

export interface ScanWords {
  disks: string;
  storage: string;
  sharing: string;
  network: string;
  health: (tone: ScanLineTone) => string;
  notChecked: string;
  unread: string;
  reading: string;
  notSetUp: string;
  notConnected: string;
  diskCount: (n: number) => string;
  disksAsleep: (disks: string, asleep: number) => string;
  drivesAll: (n: number) => string;
  drivesSome: (name: string, percent: number) => string;
  drivesNone: string;
  sharingOn: (folders: number, ways: number) => string;
  sharingNone: string;
  networkUp: (name: string, speed: string | undefined) => string;
  goTo: (area: "disks" | "storage" | "sharing" | "network") => string;
  /** The word the map writes under a sleeping disk: such disks are counted asleep. */
  asleep: string;
}

const RANK: Record<NasHealth, number> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
};
const worst = (tones: readonly NasHealth[]): NasHealth =>
  tones.reduce<NasHealth>((a, b) => (RANK[b] > RANK[a] ? b : a), "ok");

/**
 * One status per area of the NAS (disks, storage, sharing, network), each a link to its part of the
 * page. Fail closed as the answer does: an area whose read failed or has not arrived is never OK.
 */
export function scanAreas(
  input: NasMapInput,
  words: ScanWords,
): ScanLineArea[] {
  const { reads } = input;
  const pending = (
    id: "disks" | "storage" | "sharing" | "network",
    label: string,
    targetId: string,
    state: "loading" | "failed",
  ): ScanLineArea => ({
    id,
    label,
    tone: "unknown",
    status: state === "failed" ? words.unread : words.reading,
    targetId,
    goTo: words.goTo(id),
  });

  // The disks: their health only once it is read (Smart.getListBg, on "Check disk health").
  const disksRead = reads.disks ?? "loading";
  const asleep = input.disks.filter((d) => d.detail === words.asleep).length;
  const diskCount = words.diskCount(input.disks.length);
  const checked = reads.health === "ok";
  const diskTone: ScanLineTone = checked
    ? worst(input.disks.map((d) => d.health))
    : "unknown";
  const disks: ScanLineArea =
    disksRead === "ok"
      ? {
          id: "disks",
          label: words.disks,
          tone: diskTone,
          status: checked ? words.health(diskTone) : words.notChecked,
          value: asleep > 0 ? words.disksAsleep(diskCount, asleep) : diskCount,
          targetId: DASHBOARD_TARGETS.temps,
          goTo: words.goTo("disks"),
        }
      : pending("disks", words.disks, DASHBOARD_TARGETS.temps, disksRead);

  // The storage: the worst one that is not fine names itself, else how many have space.
  const storageRead = reads.storage ?? "loading";
  const drives = input.storage.filter((s) => s.system !== true);
  const trouble = [...input.storage]
    .filter((s) => s.health !== "ok")
    .sort((a, b) => RANK[b.health] - RANK[a.health])[0];
  const storage: ScanLineArea =
    storageRead === "ok"
      ? trouble
        ? {
            id: "storage",
            label: words.storage,
            tone: trouble.health,
            status: trouble.healthLabel,
            value:
              trouble.used === null
                ? trouble.name
                : words.drivesSome(
                    trouble.name,
                    Math.round(trouble.used * 100),
                  ),
            targetId: DASHBOARD_TARGETS.map,
            goTo: words.goTo("storage"),
          }
        : {
            id: "storage",
            label: words.storage,
            tone: drives.length === 0 ? "unknown" : "ok",
            status: drives.length === 0 ? words.notSetUp : words.health("ok"),
            value:
              drives.length === 0
                ? words.drivesNone
                : words.drivesAll(drives.length),
            targetId: DASHBOARD_TARGETS.map,
            goTo: words.goTo("storage"),
          }
      : pending("storage", words.storage, DASHBOARD_TARGETS.map, storageRead);

  // The sharing: the shared folders and the ways in that are on (the shell is not a way to files).
  const sharingRead =
    reads.folders === "failed" || reads.ways === "failed"
      ? "failed"
      : reads.folders === "ok" && reads.ways === "ok"
        ? "ok"
        : "loading";
  const ways = input.ways.filter((w) => w.running && w.id !== "ssh").length;
  const folderTone = worst(input.folders.map((f) => f.health));
  const sharing: ScanLineArea =
    sharingRead === "ok"
      ? {
          id: "sharing",
          label: words.sharing,
          tone: input.folders.length === 0 ? "unknown" : folderTone,
          status:
            input.folders.length === 0
              ? words.notSetUp
              : words.health(folderTone),
          value:
            input.folders.length === 0
              ? words.sharingNone
              : words.sharingOn(input.folders.length, ways),
          targetId: DASHBOARD_TARGETS.map,
          goTo: words.goTo("sharing"),
        }
      : pending("sharing", words.sharing, DASHBOARD_TARGETS.map, sharingRead);

  // The network: the first interface that is up, else the first.
  const networkRead = reads.network ?? "loading";
  const net = input.interfaces.find((i) => i.up) ?? input.interfaces[0];
  const network: ScanLineArea =
    networkRead === "ok"
      ? {
          id: "network",
          label: words.network,
          tone: net?.up === true ? "ok" : "unknown",
          status: net?.up === true ? words.health("ok") : words.notConnected,
          value: net ? words.networkUp(net.name, net.speed) : undefined,
          targetId: DASHBOARD_TARGETS.map,
          goTo: words.goTo("network"),
        }
      : pending("network", words.network, DASHBOARD_TARGETS.map, networkRead);

  return [disks, storage, sharing, network];
}
