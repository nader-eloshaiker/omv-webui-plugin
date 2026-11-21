// SPDX-License-Identifier: GPL-3.0-or-later
// Whether the NAS watches a disk (phase 5 disks design 2.5): where the form starts, its one check, what
// it saves, and when watching cannot be turned off. Pure, so each rule is tested by itself. The limit is
// edited as text, so an empty or half-typed value can be shown and refused in words.
import type {
  DiskDevice,
  SmartDeviceSettings,
  SmartSetDeviceSettingsRequest,
} from "@omv-webui/react-api-omv/generated";
import { NEW_OBJECT_UUID } from "./diskWords.ts";

export interface MonitoringDraft {
  enable: boolean;
  /** "same": the limit for all disks (`tempmax` 0); "own": the disk's own limit. */
  limitMode: "same" | "own";
  limit: string;
}

/** The form's start: the saved settings, or not watched when none are saved (`null`). */
export function monitoringDraft(
  saved: SmartDeviceSettings | null,
): MonitoringDraft {
  if (saved === null) {
    return { enable: false, limitMode: "same", limit: "" };
  }
  return saved.tempmax > 0
    ? { enable: saved.enable, limitMode: "own", limit: String(saved.tempmax) }
    : { enable: saved.enable, limitMode: "same", limit: "" };
}

export function isMonitoringDirty(
  saved: SmartDeviceSettings | null,
  draft: MonitoringDraft,
): boolean {
  const start = monitoringDraft(saved);
  return (
    start.enable !== draft.enable ||
    start.limitMode !== draft.limitMode ||
    (draft.limitMode === "own" && start.limit !== draft.limit.trim())
  );
}

/** The disk's own limit as a whole number from 1 to 100; null when it is not one. */
export function ownLimit(text: string): number | null {
  const value = text.trim();
  if (!/^[0-9]{1,3}$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return n >= 1 && n <= 100 ? n : null;
}

/** Why the form cannot be saved: an own limit that is not a whole number from 1 to 100. */
export const limitProblem = (draft: MonitoringDraft): "range" | null =>
  draft.limitMode === "own" && ownLimit(draft.limit) === null ? "range" : null;

/**
 * Smart.setDeviceSettings with all five fields: the saved object's identifier or OMV's new-object one,
 * the row's stable device file, and `tempdiff` sent back as read (read, change, write: UX audit R4).
 * Call only after `limitProblem` found nothing.
 */
export function monitoringRequest(
  disk: Pick<DiskDevice, "devicefile">,
  saved: SmartDeviceSettings | null,
  draft: MonitoringDraft,
): SmartSetDeviceSettingsRequest {
  return {
    uuid: saved?.uuid ?? NEW_OBJECT_UUID,
    devicefile: disk.devicefile,
    enable: draft.enable,
    tempdiff: saved?.tempdiff ?? 0,
    tempmax: draft.limitMode === "own" ? (ownLimit(draft.limit) ?? 0) : 0,
  };
}

/**
 * Watching cannot be turned off while scheduled self-tests refer to the disk (D13): a test of a disk
 * that is not watched never runs, and nothing would say so. The server does not enforce this.
 */
export const watchLocked = (saved: SmartDeviceSettings | null): boolean =>
  saved !== null && saved.enable && saved._used === true;
