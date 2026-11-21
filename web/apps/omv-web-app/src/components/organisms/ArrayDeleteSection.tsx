// SPDX-License-Identifier: GPL-3.0-or-later
// "Delete this array" (phase 5 RAID design 7; owner, P7), last on the page. The server stops the array
// and erases its marks without looking at what is on it, so this interface refuses while a file system
// on it is set up (mounted, used, or only set up), being created, other storage is built on it, or the
// reads this needs failed (fail closed; "Checking…" while they load, never the fail-closed state). The
// dialog reads everything again, then refuses, says the array changed or is gone, or confirms: red,
// naming the level, size and every member disk, typing the array's device name. "Delete array" checks
// once more. No classic link round a refusal (P10).
import type {
  DiskDevice,
  MdArray,
  MdDisk,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Identifier,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { labelSize } from "../../disks/diskWords.ts";
import { fsAddress } from "../../filesystems/fsModel.ts";
import { isCut } from "../../filesystems/fsTasks.ts";
import { formatBytes } from "../../format/format.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useRaidApi } from "../../hooks/useRaidApi.ts";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { bytesOf, diskOf } from "../../raid/raidChoices.ts";
import {
  arrayState,
  arrayUsedBy,
  deleteBlockers,
  sameArray,
  type DeleteBlocker,
} from "../../raid/raidModel.ts";
import { recordChanged } from "../../raid/raidSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { Slotted } from "../atoms/Slotted.tsx";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";

export interface Deleted {
  devicefile: string;
  disks: { device: string; devicename: string | null }[];
}

function BlockerLines({ blockers }: { blockers: readonly DeleteBlocker[] }) {
  const { t } = useTranslation();
  const words = useFsWords();
  return (
    <ul className="flex flex-col gap-2">
      {blockers.map((blocker, i) => {
        let line: ReactNode;
        switch (blocker.kind) {
          case "fs": {
            const name = words.nameText(blocker.fs);
            const address = fsAddress(blocker.fs);
            line = (
              <>
                <p>{t("raidDelete.blocked.fs", { name })}</p>
                <p className="text-sm">
                  {t("raidDelete.blocked.fsDo")}{" "}
                  {address === null ? null : (
                    <Link
                      to="/storage/filesystems/$fs"
                      params={{ fs: address }}
                      className={routerLinkClass}
                    >
                      {t("raidDelete.blocked.fsLink", { name })}
                    </Link>
                  )}
                </p>
              </>
            );
            break;
          }
          case "creating":
            line = <p>{t("raidDelete.blocked.creating")}</p>;
            break;
          case "other":
            line = <p>{t("raidDelete.blocked.other")}</p>;
            break;
          case "unread":
            line = (
              <>
                <p>{t("raidDelete.blocked.unread")}</p>
                {isRpcError(blocker.error) ? (
                  <ServerMessage label={t("app.serverMessage")}>
                    {blocker.error.message}
                  </ServerMessage>
                ) : null}
              </>
            );
            break;
          case "changing":
            line = <p>{t("raidDelete.blocked.changing")}</p>;
            break;
          case "unknown":
            line = <p>{t("raidState.unknownBlocks")}</p>;
            break;
        }
        return (
          <li
            key={`${blocker.kind}-${String(i)}`}
            className="flex max-w-prose flex-col gap-1"
          >
            {line}
          </li>
        );
      })}
    </ul>
  );
}

export function ArrayDeleteSection({
  view,
  disks,
  slaves,
  changing,
  onRetry,
  onDeleted,
  onCut,
}: {
  view: ArrayView;
  disks: readonly DiskDevice[] | undefined;
  slaves: readonly MdDisk[] | undefined;
  changing: boolean;
  onRetry: () => void;
  onDeleted: (deleted: Deleted) => void;
  onCut: () => void;
}) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const fsWords = useFsWords();
  const fsApi = useFsApi();
  const raidApi = useRaidApi();
  const reasonId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const runRef = useRef(0);
  const { row, state, used } = view;
  const blockers = deleteBlockers(state, used, changing);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "checking" });
  const [fresh, setFresh] = useState<{
    row: MdArray;
    view: ReturnType<typeof arrayUsedBy>;
  } | null>(null);
  const [error, setError] = useState<unknown>(undefined);

  /** 7.2: the four reads again; a refusal, a change, gone, or the fresh row and what is on it. */
  const recheck = async (): Promise<
    | { ok: true; row: MdArray; used: ReturnType<typeof arrayUsedBy> }
    | { ok: false; title: string; body: ReactNode }
  > => {
    const settle = <T,>(p: Promise<T>) =>
      p.then(
        (value) => ({ ok: true as const, value }),
        (e: unknown) => ({ ok: false as const, error: e }),
      );
    const [arrays, configured, detected] = await Promise.all([
      settle(raidApi.arrays()),
      settle(fsApi.configured()),
      settle(fsApi.detected()),
      settle(fsApi.disks()),
    ]);
    if (!arrays.ok) {
      return {
        ok: false,
        title: t("raidDelete.refusedTitle"),
        body: (
          <BlockerLines blockers={[{ kind: "unread", error: arrays.error }]} />
        ),
      };
    }
    const now = arrays.value.find((r) => r.devicefile === row.devicefile);
    if (now === undefined) {
      return {
        ok: false,
        title: t("raidDelete.refusedTitle"),
        body: t("raidDelete.gone"),
      };
    }
    if (!sameArray(now, row)) {
      return {
        ok: false,
        title: t("raidDelete.refusedTitle"),
        body: t("raidRemove.changed"),
      };
    }
    const nowUsed = arrayUsedBy(now, {
      configured: configured.ok
        ? { data: configured.value, failed: false }
        : { failed: true, error: configured.error },
      detected: detected.ok
        ? { data: detected.value, failed: false }
        : { failed: true, error: detected.error },
    });
    const nowBlockers = deleteBlockers(arrayState(now), nowUsed, false) ?? [];
    if (nowBlockers.length > 0) {
      return {
        ok: false,
        title: t("raidDelete.refusedTitle"),
        body: <BlockerLines blockers={nowBlockers} />,
      };
    }
    return { ok: true, row: now, used: nowUsed };
  };

  const start = () => {
    const mine = ++runRef.current;
    setError(undefined);
    setFresh(null);
    setPhase({ kind: "checking" });
    setOpen(true);
    void recheck().then((result) => {
      if (runRef.current !== mine) {
        return;
      }
      if (result.ok) {
        setFresh({ row: result.row, view: result.used });
        setPhase({ kind: "confirm" });
      } else {
        setPhase({ kind: "refused", title: result.title, body: result.body });
      }
    });
  };

  const confirm = async () => {
    const mine = runRef.current;
    setError(undefined);
    setPhase({ kind: "confirm", rechecking: true });
    const again = await recheck();
    if (runRef.current !== mine) {
      return;
    }
    if (!again.ok) {
      setPhase({ kind: "refused", title: again.title, body: again.body });
      return;
    }
    setPhase({ kind: "confirm", running: true });
    try {
      await raidApi.delete(again.row.devicefile);
      recordChanged(again.row.devicefile);
      setOpen(false);
      onDeleted({
        devicefile: again.row.devicefile,
        disks: again.row.devices.map((device) => ({
          device,
          devicename: diskOf(device, disks)?.devicename ?? null,
        })),
      });
    } catch (e) {
      if (isCut(e)) {
        setOpen(false);
        onCut();
        return;
      }
      setError(e);
      setPhase({ kind: "confirm" });
    }
  };

  const shown = fresh?.row ?? row;
  const found = fresh?.view.kind === "known" ? fresh.view.found : [];
  const memberLine = (device: string) => {
    const disk = diskOf(device, disks);
    const size = bytesOf(
      slaves?.find((s) => s.devicefile === device)?.size ?? disk?.size ?? "",
    );
    const label = size > 0 ? labelSize(size) : null;
    const sizeText =
      size <= 0
        ? ""
        : label === null
          ? formatBytes(size)
          : t("raidRemove.sizeLabel", {
              size: formatBytes(size),
              label: t("format.sizeDecimal", label),
            });
    return (
      <Slotted
        sentence={(tokens) =>
          t(disk?.model.trim() ? "raidDelete.disk" : "raidDelete.diskNoModel", {
            ...tokens,
            size: sizeText,
          })
        }
        values={{
          device: <Identifier>{device}</Identifier>,
          model: disk?.model.trim() ?? "",
          serial: <Identifier>{disk?.serialnumber.trim() ?? ""}</Identifier>,
        }}
      />
    );
  };

  return (
    <section
      aria-labelledby="array-delete"
      className="mt-6 flex flex-col gap-2 border-t border-border pt-6"
    >
      <h2 id="array-delete" className="text-lg font-semibold">
        {t("raidDelete.title")}
      </h2>
      <p className="max-w-prose">{t("raidDelete.intro")}</p>
      {blockers === null ? (
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("raidDelete.checking")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          ref={openerRef}
          variant="neutral"
          disabled={blockers === null || blockers.length > 0}
          focusableWhenDisabled
          aria-describedby={
            blockers !== null && blockers.length > 0 ? reasonId : undefined
          }
          onClick={
            blockers !== null && blockers.length === 0 ? start : undefined
          }
        >
          {t("raidDelete.open")}
        </Button>
        {blockers !== null && blockers.length > 0 ? (
          <div id={reasonId} className="flex flex-col gap-2">
            <BlockerLines blockers={blockers} />
            {blockers.some((b) => b.kind === "unread") ? (
              <p>
                <Button variant="neutral" size="sm" onClick={onRetry}>
                  {t("common.tryAgain")}
                </Button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <CheckedDialog
        open={open}
        onClose={() => {
          runRef.current += 1;
          setOpen(false);
        }}
        phase={phase}
        checkingTitle={t("raidDelete.dialogTitle", { array: row.devicefile })}
        checkingLabel={t("raidDelete.checking")}
        title={t("raidDelete.dialogTitle", { array: shown.devicefile })}
        description={t("raidDelete.consequence")}
        destructive
        typed={{
          confirmText: shown.devicefile,
          prompt: t("raidDelete.typePrompt", { array: shown.devicefile }),
          hint: t("raidDelete.typeHint"),
        }}
        confirmLabel={t("raidDelete.confirm")}
        recheckingLabel={t("raidDelete.checkingAgain")}
        runningLabel={t("raidDelete.running", { array: shown.devicefile })}
        cancelLabel={t("raidDelete.cancel")}
        closeLabel={t("raidDelete.close")}
        error={
          error === undefined ? undefined : (
            <>
              <p className="text-critical-label">
                {t("raidDelete.failedTitle", { array: shown.devicefile })}
              </p>
              {isRpcError(error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.message}
                </ServerMessage>
              ) : null}
              <p>{t("raidDelete.maybeStopped")}</p>
            </>
          )
        }
        onConfirm={() => void confirm()}
        openerRef={openerRef}
      >
        <div className="flex flex-col gap-2 text-base">
          <p>
            {t("raidDelete.arrayLine", {
              level: words.levelWord(shown.level),
              size: words.sizeText(shown.size),
            })}
          </p>
          <ul className="flex list-disc flex-col gap-1 ps-5">
            {shown.devices.map((device) => (
              <li key={device}>{memberLine(device)}</li>
            ))}
          </ul>
          <h3 className="font-semibold">{t("raidDelete.onItTitle")}</h3>
          <ul className="flex list-disc flex-col gap-1 ps-5">
            {found.map((fs) => (
              <li key={`${fs.uuid}:${fs.devicefile}`}>
                {t("raidDelete.onIt.fs", {
                  name: fsWords.nameText(fs),
                  type: fsWords.typeWord(fs.type),
                })}
              </li>
            ))}
            {found.length === 0 ? (
              <li>{t("raidDelete.onIt.nothing")}</li>
            ) : null}
            <li>{t("raidDelete.onIt.disks")}</li>
          </ul>
        </div>
      </CheckedDialog>
    </section>
  );
}
