// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's state (phase 5 ZFS design 0.3): the fixed status word in its pill, the reason beside it as
// text (never in a tooltip), and while a check or a rebuild runs a progress bar with the same figures in
// words. How full the pool is has its own pill, beside the space (D7).
import { ProgressBar, StatusPill } from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { isBusy, type PoolReport, type PoolState } from "../../zfs/zfsModel.ts";

export function ZfsStateView({
  state,
  report,
  compact = false,
}: {
  state: PoolState;
  report: PoolReport;
  /** In a table row: the compact bar. */
  compact?: boolean;
}) {
  const words = useZfsWords();
  const reasonId = useId();
  const reason = words.stateReason(state, report);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <StatusPill
          status={state.status}
          className="shrink-0 whitespace-nowrap"
        >
          {words.statusWord(state.status)}
        </StatusPill>
        {reason === null ? null : (
          <span
            id={reasonId}
            dir="auto"
            className={
              compact
                ? "text-sm [overflow-wrap:anywhere]"
                : "[overflow-wrap:anywhere]"
            }
          >
            {reason}
          </span>
        )}
      </span>
      {isBusy(state) ? (
        <ProgressBar
          aria-labelledby={reasonId}
          value={state.scan?.percent ?? null}
          valueText={words.progressText(state.scan)}
          size={compact ? "compact" : "default"}
          className={compact ? "max-w-56" : "max-w-md"}
        />
      ) : null}
    </div>
  );
}
