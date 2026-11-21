// SPDX-License-Identifier: GPL-3.0-or-later
// An array's state (phase 5 RAID design 0.2): the fixed status word in its pill, the reason beside it
// as text (never in a tooltip), and while the kernel is working a progress bar with the same figures in
// words. A check whose percentage is not known draws an indeterminate bar.
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import { ProgressBar, StatusPill } from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { isBusy, type ArrayState } from "../../raid/raidModel.ts";

export function RaidStateView({
  row,
  state,
  compact = false,
}: {
  row: Pick<MdArray, "level" | "numdevices">;
  state: ArrayState;
  /** In a table row: the compact bar. */
  compact?: boolean;
}) {
  const words = useRaidWords();
  const reasonId = useId();
  const reason = words.stateReason(row, state);
  const working =
    isBusy(state.kind) &&
    state.kind !== "resyncPending" &&
    state.kind !== "resyncDelayed";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <StatusPill status={state.status} className="shrink-0">
          {words.statusWord(state)}
        </StatusPill>
        {reason === null ? null : (
          <span id={reasonId} className={compact ? "text-sm" : undefined}>
            {reason}
          </span>
        )}
      </span>
      {working ? (
        <ProgressBar
          aria-labelledby={reasonId}
          value={state.progress?.percent ?? null}
          valueText={words.progressText(state.progress)}
          size={compact ? "compact" : "default"}
          className={compact ? "max-w-56" : "max-w-md"}
        />
      ) : null}
    </div>
  );
}
