// SPDX-License-Identifier: GPL-3.0-or-later
// What the dashboard and the set-up checklist conclude from the server's settings (phase 3 design 1
// and 2). Pure, so each rule is tested by itself; the components only render the result.
import type {
  EmailNotificationSettings,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { parseByteCount, percentOf } from "../format/format.ts";

/** Memory in use, from `memUsed` and `memTotal`, so the three figures shown always agree. */
export function memoryUsage(
  info: Pick<SystemInformation, "memUsed" | "memTotal">,
): { used: number; total: number; percent: number } | null {
  const used = parseByteCount(info.memUsed);
  const total = parseByteCount(info.memTotal);
  if (used === null || total === null) {
    return null;
  }
  const percent = percentOf(used, total);
  return percent === null ? null : { used, total, percent };
}

/** A difference between the NAS clock and this computer's that is worth a row (design 1.4). */
export const CLOCK_TOLERANCE_SECONDS = 5 * 60;

/**
 * How far the NAS clock is from this computer's, in seconds: the server's epoch time `ts` against the
 * moment its reply arrived here. Epoch seconds on both sides, so time zones do not matter.
 */
export function clockDifferenceSeconds(
  ts: number,
  receivedAtMs: number,
): number {
  return Math.abs(receivedAtMs / 1000 - ts);
}

export type AttentionRow =
  { kind: "restart" } | { kind: "clock"; seconds: number };

/** The rows of the attention list, worst first: a restart before a clock difference. */
export function attentionRows(
  info: Pick<SystemInformation, "ts" | "rebootRequired">,
  receivedAtMs: number,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (info.rebootRequired === true) {
    rows.push({ kind: "restart" });
  }
  const seconds = clockDifferenceSeconds(info.ts, receivedAtMs);
  if (seconds > CLOCK_TOLERANCE_SECONDS) {
    rows.push({ kind: "clock", seconds });
  }
  return rows;
}

/**
 * Email alerts: `done` when the server's own test would pass (enabled, and server, port, sender and
 * primary address set), `incomplete` when enabled without them, `off` otherwise.
 */
export function emailAlerts(
  settings: Pick<
    EmailNotificationSettings,
    "enable" | "server" | "port" | "sender" | "primaryemail"
  >,
): "done" | "incomplete" | "off" {
  if (!settings.enable) {
    return "off";
  }
  const complete =
    settings.server.trim() !== "" &&
    Number.isInteger(settings.port) &&
    settings.port > 0 &&
    settings.sender.trim() !== "" &&
    settings.primaryemail.trim() !== "";
  return complete ? "done" : "incomplete";
}

/**
 * HTTPS: whether the setting is on, and whether this page arrived without it. The checklist then says
 * to use an https:// address and names the port as text; it builds no link from a reply (UI-3; owner,
 * 2026-11-20).
 */
export function httpsState(
  enablessl: boolean,
  protocol: string,
): "off" | "on" | "onButNotUsed" {
  if (!enablessl) {
    return "off";
  }
  return protocol === "https:" ? "on" : "onButNotUsed";
}

/**
 * The built-in administrator account, the one the factory password belongs to. Only it gets the
 * "Change your password" link: another administrator would change their own password, not admin's.
 */
export const FACTORY_ACCOUNT = "admin";
