// SPDX-License-Identifier: GPL-3.0-or-later
// "Check this pool" (phase 5 ZFS design 6; owner, P12): "Check now…" when idle, "Stop checking…" while
// checked, "Continue checking…" and "Stop checking…" while paused (no pause here, D19), each after a
// plain confirmation that says the disks are woken and kept busy for hours. On confirm the pool is read
// again; a change since refuses. Refused, with the reason beside the button, while the pool is Critical,
// Unknown or being rebuilt. The check runs in ZFS and is the pool's state, not a task (D20).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ExternalLink,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import type { PoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import {
  checkDecision,
  findPool,
  parsePoolReport,
  poolState,
} from "../../zfs/zfsModel.ts";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";

const SCRUB_JOBS = "/#/storage/zfs/scrubjobs";

type Act = "start" | "stop" | "resume";

/** The "What to do now" card's "Check now…" opens the same dialog. */
export interface ZfsCheckHandle {
  start(opener: HTMLButtonElement): void;
}

export function ZfsCheckSection({
  view,
  changing,
  onChanged,
  handle,
}: {
  view: PoolView;
  changing: boolean;
  onChanged: () => void;
  handle?: Ref<ZfsCheckHandle>;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const api = useZfsApi();
  const reasonId = useId();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const pool = view.row.path;
  const decision = checkDecision(view.state, changing);
  const [open, setOpen] = useState<Act | null>(null);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "confirm" });
  const [error, setError] = useState<{ text: string; cause: unknown } | null>(
    null,
  );
  const scan = view.report.known ? view.report.scan : null;
  const finished = scan?.kind === "check" && scan.status === "finished";
  const percent =
    view.state.scan?.percent == null
      ? ""
      : words.percentText(view.state.scan.percent);

  const start = (act: Act, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setError(null);
    setPhase({ kind: "confirm" });
    setOpen(act);
  };

  useImperativeHandle(handle, () => ({
    start: (opener: HTMLButtonElement) => {
      if (decision.allowed && decision.action === "start") {
        start("start", opener);
      }
    },
  }));

  const confirm = async () => {
    if (open === null) {
      return;
    }
    const act = open;
    setPhase({ kind: "confirm", rechecking: true });
    try {
      const [rows, text] = await Promise.all([api.list(), api.report(pool)]);
      const row = findPool(rows, pool);
      const now =
        row === undefined
          ? null
          : checkDecision(poolState(row, parsePoolReport(text)), false);
      const still =
        now !== null &&
        now.allowed &&
        (act === "stop"
          ? now.action === "stop" || now.action === "resume"
          : now.action === act);
      if (!still) {
        setPhase({ kind: "confirm" });
        setError({ text: t("zfsCheck.changed"), cause: undefined });
        return;
      }
      setPhase({ kind: "confirm", running: true });
      if (act === "stop") {
        await api.stopScrub(pool);
      } else {
        await api.scrub(pool);
      }
      setOpen(null);
      onChanged();
    } catch (cause) {
      setPhase({ kind: "confirm" });
      setError({ text: t("zfsCheck.failed"), cause });
    }
  };

  const reason = (): string => {
    if (decision.allowed) {
      return "";
    }
    switch (decision.blocker.kind) {
      case "critical":
        return t("zfsCheck.refused.critical");
      case "rebuilding":
        return t("zfsCheck.refused.rebuilding");
      default:
        return words.blockerText(decision.blocker);
    }
  };

  const titles: Record<Act, string> = {
    start: t("zfsCheck.startTitle", { pool }),
    stop: t("zfsCheck.stopTitle", { pool }),
    resume: t("zfsCheck.resumeTitle", { pool }),
  };
  const bodies: Record<Act, string> = {
    start: t("zfsCheck.startBody"),
    stop: t("zfsCheck.stopBody"),
    resume: t("zfsCheck.resumeBody", { percent }),
  };
  const confirms: Record<Act, string> = {
    start: t("zfsCheck.startConfirm"),
    stop: t("zfsCheck.stopConfirm"),
    resume: t("zfsCheck.resumeConfirm"),
  };

  return (
    <section aria-labelledby="zfs-check" className="flex flex-col gap-2">
      <h2 id="zfs-check" className="text-lg font-semibold">
        {t("zfsCheck.title")}
      </h2>
      <p className="max-w-prose">
        {t("zfs.term.check")} {t("zfsCheck.cost")}
      </p>
      {finished && scan.repaired !== null && !/^0B?$/.test(scan.repaired) ? (
        <p className="max-w-prose">
          {t("zfsCheck.repaired", { amount: scan.repaired })}
        </p>
      ) : null}
      {finished && scan.errors !== null && scan.errors > 0 ? (
        <p className="max-w-prose">
          {t("zfsCheck.unrepaired", { count: scan.errors })}
        </p>
      ) : null}
      {decision.allowed ? (
        <div className="flex flex-wrap gap-2">
          {decision.action === "start" ? (
            <Button
              variant="neutral"
              onClick={(e) => start("start", e.currentTarget)}
            >
              {t("zfsCheck.start")}
            </Button>
          ) : null}
          {decision.action === "resume" ? (
            <Button
              variant="neutral"
              onClick={(e) => start("resume", e.currentTarget)}
            >
              {t("zfsCheck.resume")}
            </Button>
          ) : null}
          {decision.action !== "start" ? (
            <Button
              variant="neutral"
              onClick={(e) => start("stop", e.currentTarget)}
            >
              {t("zfsCheck.stop")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="neutral"
            disabled
            focusableWhenDisabled
            aria-describedby={reasonId}
          >
            {t("zfsCheck.start")}
          </Button>
          <p id={reasonId} className="max-w-prose">
            {reason()}
          </p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {t("zfsCheck.schedules")}{" "}
        <ExternalLink href={SCRUB_JOBS} newTabLabel={t("app.newTab")}>
          {t("zfsCheck.schedulesLink")}
        </ExternalLink>
      </p>
      <CheckedDialog
        open={open !== null}
        onClose={() => setOpen(null)}
        phase={phase}
        checkingTitle=""
        checkingLabel=""
        title={open === null ? "" : titles[open]}
        description={open === null ? "" : bodies[open]}
        confirmLabel={open === null ? "" : confirms[open]}
        recheckingLabel={t("zfsCheck.checkingAgain")}
        runningLabel={open === null ? "" : confirms[open]}
        cancelLabel={t("zfsCheck.cancel")}
        closeLabel={t("zfsDevice.close")}
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
    </section>
  );
}
