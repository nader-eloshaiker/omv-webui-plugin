// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's power settings form (phase 5 disks design 2.7): the choices it offers, where it starts, what
// it saves, and when monitoring would keep the disk awake. Pure, so each rule is tested by itself.
import type {
  DiskDevice,
  DiskMgmtSetHdParmRequest,
  HdParm,
} from "@omv-webui/react-api-omv/generated";
import { NEW_OBJECT_UUID } from "./diskWords.ts";

/** "Spin down after": Never, then the Minutes and Hours groups, in OMV's standby encoding. */
export const SPINDOWN_MINUTES = [60, 120, 240, 241] as const;
export const SPINDOWN_HOURS = [242, 244, 246, 248, 250, 251] as const;
export const SPINDOWN_LISTED: readonly number[] = [
  0,
  ...SPINDOWN_MINUTES,
  ...SPINDOWN_HOURS,
];

/** "Power-saving level": Off, then the levels that may spin down, then the ones that keep spinning. */
export const APM_SPIN_DOWN = [1, 64, 127] as const;
export const APM_SPINNING = [128, 192, 254] as const;
export const APM_LISTED: readonly number[] = [
  0,
  ...APM_SPIN_DOWN,
  ...APM_SPINNING,
];

/** "Noise level": the three values OMV accepts. */
export const AAM_LISTED = [0, 128, 254] as const;
export type Aam = (typeof AAM_LISTED)[number];

export interface PowerDraft {
  spindowntime: number;
  apm: number;
  aam: Aam;
  writecache: boolean;
}

const isAam = (value: number): value is Aam =>
  (AAM_LISTED as readonly number[]).includes(value);

/**
 * Where the form starts: the saved settings, or, when nothing is saved, OMV's defaults with the write
 * cache on (2.7.3, owner P6): OMV sends every field, and "off" would silently slow the disk.
 */
export function startingDraft(saved: HdParm | undefined): PowerDraft {
  if (saved === undefined) {
    return { spindowntime: 0, apm: 0, aam: 0, writecache: true };
  }
  return {
    spindowntime: saved.spindowntime,
    apm: saved.apm,
    aam: isAam(saved.aam) ? saved.aam : 0,
    writecache: saved.writecache,
  };
}

/** Whether the form differs from what is saved (anything differs from nothing saved). */
export function isPowerDirty(
  saved: HdParm | undefined,
  draft: PowerDraft,
): boolean {
  if (saved === undefined) {
    return true;
  }
  const start = startingDraft(saved);
  return (
    start.spindowntime !== draft.spindowntime ||
    start.apm !== draft.apm ||
    start.aam !== draft.aam ||
    start.writecache !== draft.writecache
  );
}

/** DiskMgmt.setHdParm with all six fields; the disk is the row's stable device file (UI-4). */
export function powerRequest(
  disk: Pick<DiskDevice, "devicefile">,
  saved: HdParm | undefined,
  draft: PowerDraft,
): DiskMgmtSetHdParmRequest {
  return {
    uuid: saved?.uuid ?? NEW_OBJECT_UUID,
    devicefile: disk.devicefile,
    apm: draft.apm,
    aam: draft.aam,
    spindowntime: draft.spindowntime,
    writecache: draft.writecache,
  };
}

/**
 * 2.7.4: the disk is set to spin down, but disk monitoring checks it on a timer and wakes it to do
 * so, because the NAS-wide setting for sleeping disks is "Check it anyway".
 */
export function monitoringKeepsAwake(input: {
  spindowntime: number;
  watched: boolean;
  monitoringOn: boolean;
  powermode: string | undefined;
}): boolean {
  return (
    input.spindowntime !== 0 &&
    input.watched &&
    input.monitoringOn &&
    input.powermode === "never"
  );
}
