// SPDX-License-Identifier: GPL-3.0-or-later
// Everything the NAS map says, from the app's catalogue: the library carries no words of its own.
// Each entry names where it shows. Functions receive the figures and names from the input, never
// invent one, and return a whole sentence or a label that is part of a field (style guide 10).
import type { NasLane, NasWayId } from "./nas-map-model";

export interface NasMapWords {
  /** The map's heading: "Your NAS". */
  title: string;
  /** Each column's title and the one-line caption under it for a newcomer. */
  lanes: Record<NasLane, { title: string; caption: string }>;
  /** The rows list's name: "Your storage, a row each". */
  rowsLabel: string;
  /** For screen readers: "Use the arrow keys to move along a row and between rows." */
  keyboardHint: string;
  /** "Photos, Music and Documents". */
  list: (items: readonly string[]) => string;

  // A row's disks
  /** "Disks: not read". */
  disksUnread: string;
  /** "Disks: none". */
  disksNone: string;
  /** A state several disks share, said once: "Not checked yet: sda, sdb and sdc". */
  sharedDiskState: (label: string, devices: readonly string[]) => string;
  /** The strip beyond six: "22 more, all OK", "8 disks: 6 OK, 2 not checked". */
  strip: (s: {
    count: number;
    ok: number;
    unchecked: number;
    more: boolean;
  }) => string;
  /** A disk's name: "sdb, Hard disk 3.6 TiB, Warning, 41 °C, also in System drive". */
  diskLabel: (d: {
    device: string;
    summary?: string;
    healthLabel: string;
    detail?: string;
    alsoIn: readonly string[];
  }) => string;
  /** The tooltip of a disk in two storages: "Also in System drive". */
  alsoIn: (names: readonly string[]) => string;

  // The storage
  /** Beside a storage whose disk is in trouble: "At risk". */
  atRisk: string;

  // The folders
  /** "Shared folders: not read". */
  foldersUnread: string;
  /** "Shared folders: none". */
  foldersNone: string;
  /** The system drive's: "This drive holds the system itself, so it keeps no shared folders." */
  systemNoFolders: string;
  /** A folder no way in reaches: "Ways in: none". */
  noWayIn: string;
  /** The short name of each way in, a folder's icon's tooltip: "Windows and Mac". */
  wayShort: Record<NasWayId, string>;
  /** A folder's name: "Photos: reached by Windows and Mac, at risk". */
  folderLabel: (f: {
    name: string;
    ways: readonly string[];
    state?: string;
  }) => string;
  /** "3 more, all OK" or "3 more". */
  moreFolders: (count: number, allOk: boolean) => string;

  // Rows
  /** A storage row's name (item 13). */
  rowLabel: (r: {
    name: string;
    devices: readonly string[];
    used: number | null;
    problem?: string;
    sick: readonly { device: string; label: string }[];
    folders: readonly string[];
    atRisk: boolean;
    system: boolean;
    /** `NasStorage.disksNote`, for a storage with no disk attached. */
    disksNote?: string;
  }) => string;
  /**
   * The RAID members' row, in its storage column: "Disks sdb and sdc are part of a RAID array, shown
   * on the RAID page."
   */
  raidMembers: (devices: readonly string[]) => string;
  /** Its name: "In a RAID array: disks sdb and sdc, disk sdb warning. The RAID page shows the array." */
  raidMembersLabel: (r: {
    devices: readonly string[];
    sick: readonly { device: string; label: string }[];
  }) => string;
  /** The unused row: "Disk sde is not in use yet." */
  unused: (devices: readonly string[]) => string;
  /** Its name: "Not in use: disk sde. Add storage to keep files on it." */
  unusedLabel: (devices: readonly string[]) => string;
  /** Beside it for a newcomer: "Shared folders live on storage." */
  unusedFolders: string;
  /** The storage rows beyond six. */
  moreRows: {
    /** The link: "3 more, all OK". */
    link: (count: number, allOk: boolean) => string;
    /** "11 disks". */
    disks: (count: number) => string;
    /** "Media 1, Media 2 and Scratch hold 12 shared folders." */
    folders: (names: readonly string[], count: number) => string;
  };
  /** The example row of a new NAS: a picture, hidden from assistive technology. */
  example: {
    device: string;
    storage: string;
    tech: string;
    folder: string;
    tag: string;
  };

  // The band
  /** "All running", "2 of 3 running". */
  waysRunning: (running: number, total: number) => string;
  running: string;
  notRunning: string;
  /** "No way in is on yet." */
  noWayOn: string;
  /** "Off: Copies to other NAS". */
  off: (names: readonly string[]) => string;
  /** A way in's name: "Windows and Mac (SMB): running, over enp2s0". */
  wayLabel: (w: {
    name: string;
    tech: string;
    running: boolean;
    over: readonly string[];
  }) => string;
  /** An interface that is down: "Not connected". */
  notConnected: string;
  /** Where the band ends: "Your network". */
  world: string;

  // Errors
  /** "Could not read the disks". */
  laneError: (lane: NasLane) => string;
  /** "Try again", and while it reads, "Reading…". */
  retry: string;
  retrying: string;
}
