// SPDX-License-Identifier: GPL-3.0-or-later
// "Check this array" (phase 5 RAID design 6; owner, P8), for levels with copies to compare. "Check
// now…" on an OK, idle array, "Stop checking…" while it is checked, each after a plain confirmation that
// says the disks are woken and kept busy for hours. On confirm the array is read again (still idle, or
// still checking), then MdMgmt.setSyncAction. No repair. When a check this session started has ended,
// where its finding is written.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  PageSection,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { useRaidApi } from "../../hooks/useRaidApi.ts";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { arrayState, checkDecision, sameArray } from "../../raid/raidModel.ts";
import {
  raidSession,
  recordCheckEnded,
  recordCheckStarted,
} from "../../raid/raidSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";

export function ArrayCheckSection({
  view,
  changing,
  onChanged,
}: {
  view: ArrayView;
  changing: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const format = useFormat();
  const api = useRaidApi();
  const reasonId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const memory = useMemoryStore(raidSession);
  const { row, state } = view;
  const decision = checkDecision(state, changing);
  const [open, setOpen] = useState<"check" | "idle" | null>(null);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "confirm" });
  const [error, setError] = useState<{ text: string; cause: unknown } | null>(
    null,
  );
  const check = memory.checks[row.uuid];
  const checking = state.kind === "checking" || state.kind === "repairing";

  // A check this session started that the state no longer shows has ended: when it was first seen.
  const ended = check !== undefined && check.endedAt === undefined && !checking;
  useEffect(() => {
    if (ended) {
      recordCheckEnded(row.uuid, Date.now());
    }
  }, [ended, row.uuid]);

  const start = (action: "check" | "idle") => {
    setError(null);
    setPhase({ kind: "confirm" });
    setOpen(action);
  };

  const confirm = async () => {
    if (open === null) {
      return;
    }
    const action = open;
    setPhase({ kind: "confirm", rechecking: true });
    try {
      const rows = await api.arrays();
      const now = rows.find((r) => r.devicefile === row.devicefile);
      const nowState = now === undefined ? null : arrayState(now);
      const still =
        now !== undefined &&
        sameArray(now, row) &&
        nowState !== null &&
        (action === "check"
          ? nowState.kind === "ok"
          : nowState.kind === "checking" || nowState.kind === "repairing");
      if (!still) {
        setPhase({ kind: "confirm" });
        setError({
          text:
            action === "check"
              ? t("raidCheck.notIdle")
              : t("raidCheck.notChecking"),
          cause: undefined,
        });
        return;
      }
      setPhase({ kind: "confirm", running: true });
      await api.syncAction(row.devicefile, action);
      if (action === "check") {
        recordCheckStarted(row.uuid, Date.now());
      }
      setOpen(null);
      onChanged();
    } catch (cause) {
      setPhase({ kind: "confirm" });
      setError({
        text:
          action === "check"
            ? t("raidCheck.startFailed")
            : t("raidCheck.stopFailed"),
        cause,
      });
    }
  };

  return (
    <PageSection heading={t("raidCheck.title")} lead={t("raidCheck.intro")}>
      {decision.allowed ? (
        <div className="flex flex-col gap-1">
          {decision.action === "idle" ? (
            <p>{words.stateReason(row, state)}</p>
          ) : null}
          <div>
            <Button
              ref={openerRef}
              variant="neutral"
              onClick={() => start(decision.action)}
            >
              {decision.action === "check"
                ? t("raidCheck.open")
                : t("raidCheck.stopOpen")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="neutral"
            disabled
            focusableWhenDisabled
            aria-describedby={reasonId}
          >
            {t("raidCheck.open")}
          </Button>
          <p id={reasonId} className="max-w-prose">
            {decision.blocker.kind === "busy"
              ? t("raidCheck.blocked.busy", {
                  what: words.busyWord(decision.blocker.what),
                })
              : decision.blocker.kind === "degraded"
                ? t("raidCheck.blocked.degraded")
                : decision.blocker.kind === "notRunning"
                  ? t("raidCheck.blocked.notRunning")
                  : decision.blocker.kind === "changing"
                    ? t("raidAdd.blocked.changing")
                    : t("raidState.unknownBlocks")}
          </p>
        </div>
      )}
      {check?.endedAt === undefined ? null : (
        <p className="max-w-prose text-sm">
          {t("raidCheck.ended", { time: format.clock(check.endedAt) })}{" "}
          <Link to="/diagnostics/system-logs" className={routerLinkClass}>
            {t("raidCheck.logsLink")}
          </Link>
        </p>
      )}
      <CheckedDialog
        open={open !== null}
        onClose={() => setOpen(null)}
        phase={phase}
        checkingTitle=""
        checkingLabel=""
        title={
          open === "idle"
            ? t("raidCheck.stopTitle", { array: row.devicefile })
            : t("raidCheck.dialogTitle", { array: row.devicefile })
        }
        description={
          open === "idle" ? t("raidCheck.stopBody") : t("raidCheck.dialogBody")
        }
        confirmLabel={
          open === "idle" ? t("raidCheck.stopConfirm") : t("raidCheck.confirm")
        }
        recheckingLabel={t("raidRemove.checkingAgain")}
        runningLabel={
          open === "idle" ? t("raidCheck.stopConfirm") : t("raidCheck.confirm")
        }
        cancelLabel={
          open === "idle" ? t("raidCheck.keep") : t("raidCheck.cancel")
        }
        closeLabel={t("raidRemove.close")}
        error={
          error === null ? undefined : (
            <>
              <p className="text-critical-label">{error.text}</p>
              {isRpcError(error.cause) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.cause.message}
                </ServerMessage>
              ) : null}
            </>
          )
        }
        onConfirm={() => void confirm()}
        openerRef={openerRef}
      />
    </PageSection>
  );
}
