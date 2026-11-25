// SPDX-License-Identifier: GPL-3.0-or-later
// The status vocabulary (style guide 5.5 and 5.7) and how each status is drawn. The words are not
// here: they come from the app's catalogue through props.

/** Monitored things: OK, Warning, Critical, Unknown, and the Unknown-treated Disabled and Stopped. */
export type HealthStatus =
  "ok" | "warning" | "critical" | "unknown" | "disabled" | "stopped";

/** The steps and tasks of a job (5.7, UX audit R5). Waiting is Unknown-treated, never the pending gold. */
export type TaskStatus =
  "waiting" | "running" | "succeeded" | "failed" | "cancelled";

/** Everything a status label can say. `pending` is configuration saved but not applied (3.4). */
export type Status = HealthStatus | TaskStatus | "pending";

/** The colour family a status is drawn in. `neutral` is a running task: work, not a state of health. */
export type StatusTone =
  "ok" | "warning" | "critical" | "unknown" | "pending" | "neutral";

/** The icon shape, which differs per family so a status never rests on colour alone (4.4). */
export type StatusIconName =
  "check" | "triangle" | "octagon" | "dashed" | "slash" | "clock" | "spinner";

export const STATUS_DRAWING: Record<
  Status,
  { tone: StatusTone; icon: StatusIconName }
> = {
  ok: { tone: "ok", icon: "check" },
  succeeded: { tone: "ok", icon: "check" },
  warning: { tone: "warning", icon: "triangle" },
  critical: { tone: "critical", icon: "octagon" },
  failed: { tone: "critical", icon: "octagon" },
  unknown: { tone: "unknown", icon: "dashed" },
  disabled: { tone: "unknown", icon: "dashed" },
  stopped: { tone: "unknown", icon: "dashed" },
  waiting: { tone: "unknown", icon: "dashed" },
  cancelled: { tone: "unknown", icon: "slash" },
  pending: { tone: "pending", icon: "clock" },
  running: { tone: "neutral", icon: "spinner" },
};

/** What a roll-up can summarise: things with a state of health, and finished or waiting steps. */
export type RollUpStatus = Exclude<Status, "pending" | "running">;

const SEVERITY: Record<StatusTone, number> = {
  critical: 4,
  warning: 3,
  unknown: 2,
  ok: 1,
  pending: 0,
  neutral: 0,
};

/**
 * The worst state among `statuses` and how many share it, for a roll-up such as "1 of 4 disks:
 * Critical" (style guide 5.5). Unknown ranks above OK: a set with one unread member is never "fine".
 * The app writes the sentence from the result. An empty list has no status.
 */
export function rollUp(statuses: readonly RollUpStatus[]): {
  status: RollUpStatus | undefined;
  count: number;
  total: number;
} {
  let worst: RollUpStatus | undefined;
  let count = 0;
  for (const status of statuses) {
    const rank = SEVERITY[STATUS_DRAWING[status].tone];
    const worstRank =
      worst === undefined ? -1 : SEVERITY[STATUS_DRAWING[worst].tone];
    if (rank > worstRank) {
      worst = status;
      count = 1;
    } else if (rank === worstRank) {
      count += 1;
    }
  }
  return { status: worst, count, total: statuses.length };
}
