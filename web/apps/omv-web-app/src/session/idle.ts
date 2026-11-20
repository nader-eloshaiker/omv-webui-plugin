// SPDX-License-Identifier: GPL-3.0-or-later
// The idle clock's arithmetic, kept pure so it is tested without timers. The server ends a session
// `timeout` after the last call it counted (rpc.php; the transport's onActivity mirrors it). The
// warning opens shortly before that.

/** How long before the end the warning opens: a minute, or half the timeout when that is shorter. */
export function warningLeadMs(timeoutMs: number): number {
  return Math.min(60_000, Math.floor(timeoutMs / 2));
}

export type IdlePhase =
  | { kind: "off" }
  | { kind: "active"; warnInMs: number }
  | { kind: "warning"; remainingMs: number }
  | { kind: "expired" };

/**
 * Where the session stands at `now`, given the last activity the server counted and its timeout in
 * minutes (0 means the server never ends an idle session).
 */
export function idlePhase(
  now: number,
  lastActivity: number,
  timeoutMinutes: number | undefined,
): IdlePhase {
  if (!timeoutMinutes || timeoutMinutes <= 0) {
    return { kind: "off" };
  }
  const timeoutMs = timeoutMinutes * 60_000;
  const remainingMs = lastActivity + timeoutMs - now;
  if (remainingMs <= 0) {
    return { kind: "expired" };
  }
  const lead = warningLeadMs(timeoutMs);
  return remainingMs <= lead
    ? { kind: "warning", remainingMs }
    : { kind: "active", warnInMs: remainingMs - lead };
}

/** "1:05" for a countdown, rounded up so it never shows 0:00 while time remains. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
