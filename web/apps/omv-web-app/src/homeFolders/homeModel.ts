// SPDX-License-Identifier: GPL-3.0-or-later
// Home folders (phase 5 users design 12): where they are, how that folder stands, and which shared
// folders may hold them. Offered: a shared folder whose state is OK (the shares slice's 0.3), on a
// mounted file system, not on the system drive, and not a whole file system (P12, settled on the test
// VM: see the design's "Changes made during the build"). Pure; the caller fails closed when a read
// failed.
import type {
  ConfiguredFilesystem,
  HomeFolderSettings,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { fsState } from "../filesystems/fsModel.ts";
import { isWholeFs } from "../sharedFolders/nameRules.ts";
import {
  folderFs,
  folderState,
  isSystemDrive,
  type FolderState,
} from "../sharedFolders/shareActions.ts";

export type HomeReason = "notOk" | "notMounted" | "system" | "whole";

export interface HomeChoices {
  offered: SharedFolder[];
  cannot: {
    folder: SharedFolder;
    reason: HomeReason;
    fs: ConfiguredFilesystem | undefined;
  }[];
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** 12.4: which shared folders may hold home folders, and why the others may not. */
export function homeChoices(
  folders: readonly SharedFolder[],
  fsRows: readonly ConfiguredFilesystem[],
  pending: readonly string[] = [],
): HomeChoices {
  const offered: SharedFolder[] = [];
  const cannot: HomeChoices["cannot"] = [];
  for (const folder of [...folders].sort((a, b) =>
    collator.compare(a.name, b.name),
  )) {
    const fs = folderFs(folder, fsRows);
    const state = folderState(folder, fs, pending);
    let reason: HomeReason | null = null;
    if (state.pill !== "ok") {
      reason =
        state.pill === "critical" &&
        (state.reason === "fsNotMounted" || state.reason === "fsMissing")
          ? "notMounted"
          : "notOk";
    } else if (fs === undefined || fsState(fs, pending) !== "ok") {
      reason = "notMounted";
    } else if (isSystemDrive(fs)) {
      reason = "system";
    } else if (isWholeFs(folder.reldirpath)) {
      reason = "whole";
    }
    if (reason === null) {
      offered.push(folder);
    } else {
      cannot.push({ folder, reason, fs });
    }
  }
  return { offered, cannot };
}

/** The state line of 12.3 and 0.3's home-folder words. */
export type HomeState =
  | { kind: "off"; folder: SharedFolder | undefined }
  | { kind: "on"; folder: SharedFolder; state: FolderState }
  | { kind: "gone" };

export function homeState(
  settings: HomeFolderSettings,
  folders: readonly SharedFolder[],
  fsRows: readonly ConfiguredFilesystem[],
  pending: readonly string[] = [],
): HomeState {
  const folder = folders.find((f) => f.uuid === settings.sharedfolderref);
  if (!settings.enable) {
    return { kind: "off", folder };
  }
  if (folder === undefined) {
    return { kind: "gone" };
  }
  return {
    kind: "on",
    folder,
    state: folderState(folder, folderFs(folder, fsRows), pending),
  };
}

/** Whether a shared folder holds the home folders now (the shared folder's Used by, 13.1). */
export const holdsHomeFolders = (
  settings: HomeFolderSettings | undefined,
  folderUuid: string,
): boolean =>
  settings !== undefined &&
  settings.enable &&
  settings.sharedfolderref === folderUuid;

/** What the fresh reads say just before turning home folders on in a folder (12.5: 12.4's rules again). */
export type TurnOnCheck =
  | { kind: "ok"; folder: SharedFolder }
  /** Someone turned them on meanwhile (in the classic interface, another tab). */
  | { kind: "changed" }
  /** The chosen folder is no longer listed. */
  | { kind: "gone" }
  | {
      kind: "refused";
      folder: SharedFolder;
      reason: HomeReason;
      fs: ConfiguredFilesystem | undefined;
    };

export function turnOnCheck(
  uuid: string,
  settings: HomeFolderSettings,
  folders: readonly SharedFolder[],
  fsRows: readonly ConfiguredFilesystem[],
  pending: readonly string[] = [],
): TurnOnCheck {
  if (settings.enable) {
    return { kind: "changed" };
  }
  const { offered, cannot } = homeChoices(folders, fsRows, pending);
  const folder = offered.find((f) => f.uuid === uuid);
  if (folder !== undefined) {
    return { kind: "ok", folder };
  }
  const refused = cannot.find((c) => c.folder.uuid === uuid);
  return refused === undefined
    ? { kind: "gone" }
    : { kind: "refused", ...refused };
}

/** Offered folders with the one kept from last time first, so turning them on again offers it first (12.6). */
export function offeredOrder(
  offered: readonly SharedFolder[],
  kept: string,
): SharedFolder[] {
  const first = offered.filter((f) => f.uuid === kept);
  return [...first, ...offered.filter((f) => f.uuid !== kept)];
}
