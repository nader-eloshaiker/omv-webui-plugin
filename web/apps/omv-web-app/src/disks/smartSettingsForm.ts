// SPDX-License-Identifier: GPL-3.0-or-later
// The disk health settings form's rules (phase 5 disks design 5.2, 5.3). The form edits numbers as
// text, so an empty or half-typed value can be shown and refused in words; Save sends all five fields
// (UX audit B11). Pure, so each rule is tested by itself.
import type {
  EmailNotificationSettings,
  SmartSetSettingsRequest,
  SmartSetSettingsRequestPowermode,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";

export const POWER_MODES = ["never", "sleep", "standby", "idle"] as const;
export type PowerMode = (typeof POWER_MODES)[number];
export const isPowerMode = (value: string): value is PowerMode =>
  (POWER_MODES as readonly string[]).includes(value);

/** What the temperature fields start at when they are ticked with nothing saved. */
export const DEFAULT_TEMP_MAX = 55;
export const DEFAULT_TEMP_DIFF = 2;

export interface SmartSettingsDraft {
  enable: boolean;
  /** Whole minutes, as typed. */
  minutes: string;
  powermode: PowerMode;
  tempWarn: boolean;
  tempAt: string;
  tempDiffOn: boolean;
  tempDiffAt: string;
}

/** Seconds as whole minutes, at least 1: a value set elsewhere (45 s) is rounded (5.2, field 2). */
export const wholeMinutes = (seconds: number): number =>
  Math.max(1, Math.round(seconds / 60));

/** Whether the saved interval is not a whole number of minutes (it was set elsewhere). */
export const intervalIsOdd = (seconds: number): boolean => seconds % 60 !== 0;

export function toSettingsDraft(saved: SmartSettings): SmartSettingsDraft {
  return {
    enable: saved.enable,
    minutes: String(wholeMinutes(saved.interval)),
    // A value a later OMV adds is shown as the factory one until it is changed.
    powermode: isPowerMode(saved.powermode) ? saved.powermode : "never",
    tempWarn: saved.tempmax > 0,
    tempAt: String(saved.tempmax > 0 ? saved.tempmax : DEFAULT_TEMP_MAX),
    tempDiffOn: saved.tempdiff > 0,
    tempDiffAt: String(saved.tempdiff > 0 ? saved.tempdiff : DEFAULT_TEMP_DIFF),
  };
}

const wholeIn = (text: string, min: number, max: number): number | null => {
  const value = text.trim();
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return n >= min && n <= max ? n : null;
};

export interface SettingsProblems {
  minutes: boolean;
  tempAt: boolean;
  tempDiffAt: boolean;
}

/** Which typed numbers cannot be saved: minutes 1 to 1440; the two temperatures 1 to 100 when on. */
export function settingsProblems(draft: SmartSettingsDraft): SettingsProblems {
  return {
    minutes: wholeIn(draft.minutes, 1, 1440) === null,
    tempAt: draft.tempWarn && wholeIn(draft.tempAt, 1, 100) === null,
    tempDiffAt: draft.tempDiffOn && wholeIn(draft.tempDiffAt, 1, 100) === null,
  };
}

export const hasProblem = (p: SettingsProblems): boolean =>
  p.minutes || p.tempAt || p.tempDiffAt;

/** All five fields for Smart.setSettings. Call only when `settingsProblems` found nothing. */
export function fromSettingsDraft(
  draft: SmartSettingsDraft,
): SmartSetSettingsRequest {
  return {
    enable: draft.enable,
    interval: Number(draft.minutes.trim()) * 60,
    powermode: draft.powermode as SmartSetSettingsRequestPowermode,
    tempmax: draft.tempWarn ? Number(draft.tempAt.trim()) : 0,
    tempdiff: draft.tempDiffOn ? Number(draft.tempDiffAt.trim()) : 0,
  };
}

/** Whether the form differs from what the server holds. */
export function settingsDirty(
  saved: SmartSettings,
  draft: SmartSettingsDraft,
): boolean {
  const current = toSettingsDraft(saved);
  return (Object.keys(current) as (keyof SmartSettingsDraft)[]).some(
    (key) => current[key] !== draft[key],
  );
}

/** Email counts as set up when it is on and has an address to send to (4.4). */
export const emailSetUp = (
  email: Pick<EmailNotificationSettings, "enable" | "primaryemail">,
): boolean => email.enable && email.primaryemail.trim() !== "";
