// SPDX-License-Identifier: GPL-3.0-or-later
// What the shares pages keep in memory for the session (phase 5 shares design 0.8, 1.5, 6.7): the
// folders this session created and whether their flow chose to share them over SMB (the list's
// unfinished-work lines, R8), the sections of a folder saved since the last apply (the pending mark:
// access, sharing, description), whether the SMB page saved the on or off switch, the action running
// on each folder (one at a time, 0.9), and the file system Flow A handed over (6.7: in memory, never
// in the address, UI-4). In memory only (UI-13); emptied when the session ends (app.ts).
//
// Folders are kept by their `uuid` and file systems by their `devicefile`: identifiers the server
// gave, never text typed or taken from the address.
import type {
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { savedMarks } from "../pending/savedMarks.ts";
import { createMemoryStore } from "../shell/memoryStore.ts";

/** A folder this session created (6.4 step 2), and whether its flow chose to share it over SMB. */
export interface CreatedFolder {
  uuid: string;
  name: string;
  smb: boolean;
}

/** The sections of a folder's page that carry a pending mark (0.8). */
export type SavedSection = "access" | "sharing" | "description";

/** What this session may be doing to a folder (0.9: one action at a time). */
export type SharesAction =
  | "add"
  | "access"
  | "share"
  | "stopShare"
  | "description"
  | "repoint"
  | "remove"
  | "delete";

export interface SharesSessionState {
  created: readonly CreatedFolder[];
  /** Sections saved since the last apply, by folder `uuid`. */
  saved: Readonly<Record<string, readonly SavedSection[]>>;
  /** The SMB page saved the on or off switch since the last apply (5.2's pending mark). */
  smbSaved: boolean;
  /** The SMB page saved the workgroup since the last apply (services design 11.2, 0.9). */
  workgroupSaved: boolean;
  /** The action this session is running on a folder, by folder `uuid`. */
  running: Readonly<Record<string, SharesAction>>;
  /** The file system Flow A handed over, by its `devicefile` (6.7). */
  handover: string | null;
}

const INITIAL: SharesSessionState = {
  created: [],
  saved: {},
  smbSaved: false,
  workgroupSaved: false,
  running: {},
  handover: null,
};

export const sharesSession = createMemoryStore<SharesSessionState>(INITIAL);

/** The add flow made a folder (its reply's `uuid`). */
export const recordCreated = (folder: CreatedFolder): void =>
  sharesSession.set((s) => ({
    created: [...s.created.filter((f) => f.uuid !== folder.uuid), folder],
  }));

/** A folder removed in this session is no longer "created" (its unfinished-work line goes). */
export const forgetFolder = (uuid: string): void =>
  sharesSession.set((s) => {
    const { [uuid]: _saved, ...saved } = s.saved;
    return { created: s.created.filter((f) => f.uuid !== uuid), saved };
  });

/** The modules whose pending state the shares marks follow. */
export const SHARES_MODULES = ["sharedfolders", "samba"] as const;

/**
 * Once none of the shares modules is pending any more (an apply or an undo ran), the marks are
 * forgotten (savedMarks.ts).
 */
const marks = savedMarks.track(SHARES_MODULES, () =>
  sharesSession.set((s) =>
    Object.keys(s.saved).length === 0 && !s.smbSaved && !s.workgroupSaved
      ? {}
      : { saved: {}, smbSaved: false, workgroupSaved: false },
  ),
);

/** A section of a folder's page was saved; its mark shows while its module is pending. */
export const recordSaved = (uuid: string, section: SavedSection): void => {
  marks.saved();
  sharesSession.set((s) => {
    const now = s.saved[uuid] ?? [];
    return now.includes(section)
      ? {}
      : { saved: { ...s.saved, [uuid]: [...now, section] } };
  });
};

/** The SMB page saved its switch. */
export const recordSmbSaved = (): void => {
  marks.saved();
  sharesSession.set((s) => (s.smbSaved ? {} : { smbSaved: true }));
};

/** The SMB page saved the workgroup. */
export const recordWorkgroupSaved = (): void => {
  marks.saved();
  sharesSession.set((s) => (s.workgroupSaved ? {} : { workgroupSaved: true }));
};

/** Mark a folder as being changed by this session; false when an action on it already runs. */
export function beginAction(uuid: string, action: SharesAction): boolean {
  if (sharesSession.getState().running[uuid] !== undefined) {
    return false;
  }
  sharesSession.set((s) => ({ running: { ...s.running, [uuid]: action } }));
  return true;
}

export const endAction = (uuid: string): void =>
  sharesSession.set((s) => {
    if (s.running[uuid] === undefined) {
      return {};
    }
    const { [uuid]: _done, ...running } = s.running;
    return { running };
  });

/** The action running on a folder in this session, or null. */
export const runningOn = (uuid: string): SharesAction | null =>
  sharesSession.getState().running[uuid] ?? null;

/** Flow A hands its new file system to "Add a shared folder" (6.7). */
export const handOverFs = (devicefile: string): void =>
  sharesSession.set({ handover: devicefile });

export const handedOverFs = (): string | null =>
  sharesSession.getState().handover;

export const clearHandover = (): void =>
  sharesSession.set((s) => (s.handover === null ? {} : { handover: null }));

// ---- What the marks mean (0.8, 1.3, 1.5) -----------------------------------------------------------

/** The module each section's save waits for. Access waits for either (it marks samba with a share). */
const SECTION_MODULES: Record<SavedSection, readonly string[]> = {
  access: ["sharedfolders", "samba"],
  sharing: ["samba"],
  description: ["sharedfolders"],
};

/** The pending mark beside a section of a folder's page (0.8). */
export function sectionPending(
  state: Pick<SharesSessionState, "saved">,
  uuid: string,
  section: SavedSection,
  pending: readonly string[],
): boolean {
  return (
    (state.saved[uuid] ?? []).includes(section) &&
    SECTION_MODULES[section].some((m) => pending.includes(m))
  );
}

/** The pending mark beside a folder's name on the list: this session changed or made it, not applied. */
export function folderPending(
  state: Pick<SharesSessionState, "saved" | "created">,
  uuid: string,
  pending: readonly string[],
): boolean {
  const touched =
    (state.saved[uuid] ?? []).length > 0 ||
    state.created.some((f) => f.uuid === uuid);
  return touched && SHARES_MODULES.some((m) => pending.includes(m));
}

/** The SMB page's pending mark beside its on or off line (0.8). */
export const smbSwitchPending = (
  state: Pick<SharesSessionState, "smbSaved">,
  pending: readonly string[],
): boolean => state.smbSaved && pending.includes("samba");

/** One unfinished-work line of the list (1.5), at most one per folder, the first that applies. */
export type UnfinishedWork =
  /** "{{folder}} was set up, but its folder could not be made on the disk." → "Open {{folder}}" */
  | { kind: "noDir"; folder: SharedFolder }
  /** "{{folder}} is made, but the NAS has not saved it yet…" (the band carries Apply) */
  | { kind: "notSaved"; folder: SharedFolder }
  /** "{{folder}} is not shared with Windows and Mac computers yet." → "Share it" */
  | { kind: "notShared"; folder: SharedFolder };

/**
 * What the list recognises from server state about the folders this session created (R8): a folder
 * whose status is not OK, one whose `sharedfolders` change is still pending, one whose flow chose SMB
 * and that has no share. A folder an action of this session is still working on is left out (its run
 * shows it), and so is one the list does not hold (removed since). `shares` undefined (not read, or
 * failed) leaves the "not shared" line out: it is not claimed without the read.
 */
export function unfinishedWork(
  state: Pick<SharesSessionState, "created" | "running">,
  folders: readonly SharedFolder[],
  shares: readonly SmbShareRow[] | undefined,
  pending: readonly string[],
): UnfinishedWork[] {
  const lines: UnfinishedWork[] = [];
  for (const made of state.created) {
    if (state.running[made.uuid] !== undefined) {
      continue;
    }
    const folder = folders.find((f) => f.uuid === made.uuid);
    if (folder === undefined) {
      continue;
    }
    if (folder.status !== "OK") {
      lines.push({ kind: "noDir", folder });
    } else if (pending.includes("sharedfolders")) {
      lines.push({ kind: "notSaved", folder });
    } else if (
      made.smb &&
      shares !== undefined &&
      !shares.some((s) => s.sharedfolderref === made.uuid)
    ) {
      lines.push({ kind: "notShared", folder });
    }
  }
  return lines;
}
