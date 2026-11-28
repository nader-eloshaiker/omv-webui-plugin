// SPDX-License-Identifier: GPL-3.0-or-later
// An array's disks (phase 5 RAID design 2.5) and taking one out (5; owner, P6). One row per member of
// mdadm's report, with its role in words (Failed and Missing with the Critical pill), plus one row per
// missing disk. A visible "Take out…" on each row section 5 allows; where it does not, the reason once
// under the table. The dialog opens at once, checks the array and its report again ("Checking…"), then
// refuses, says the array changed, or confirms: plainly for a failed disk or a spare (nothing is lost),
// typed and destructive for a working disk (the array loses protection). The confirm button checks once
// more before MdMgmt.remove is called, with the array's device file and the member as the report names
// it. One disk at a time; nothing retries (UI-14).
import type { DiskDevice, MdDisk } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Identifier,
  InlineAlert,
  JobResult,
  ServerMessage,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import {
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { labelSize } from "../../disks/diskWords.ts";
import { isCut } from "../../filesystems/fsTasks.ts";
import { formatBytes } from "../../format/format.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import { useRaidApi } from "../../hooks/useRaidApi.ts";
import { useRemoveBlockerText } from "../../hooks/useRaidBlockers.tsx";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { bytesOf, diskOf } from "../../raid/raidChoices.ts";
import {
  arrayAddress,
  arrayState,
  levelKey,
  memberRows,
  protection,
  readReport,
  removeDecision,
  sameArray,
  type Member,
} from "../../raid/raidModel.ts";
import { recordChanged } from "../../raid/raidSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { Slotted } from "../atoms/Slotted.tsx";
import {
  CheckedDialog,
  type CheckedPhase,
} from "../molecules/CheckedDialog.tsx";
import { DiskHealthStatus } from "../molecules/DiskHealthStatus.tsx";

export interface ArrayDisksHandle {
  /** Open the take-out dialog for a member (the What to do now card's button). */
  takeOut: (member: Member) => void;
}

interface Done {
  device: string;
  serial: string;
  devicename: string | null;
  working: boolean;
}

export function ArrayDisks({
  view,
  disks,
  slaves,
  changing,
  onChanged,
  ref,
}: {
  view: ArrayView;
  disks: readonly DiskDevice[] | undefined;
  slaves: readonly MdDisk[] | undefined;
  changing: boolean;
  onChanged: () => void;
  ref?: Ref<ArrayDisksHandle>;
}) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const api = useRaidApi();
  const check = useDiskCheck();
  const blockerText = useRemoveBlockerText();
  const openerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { row, state, report } = view;
  const key = levelKey(row.level);
  const [member, setMember] = useState<Member | null>(null);
  const [phase, setPhase] = useState<CheckedPhase>({ kind: "checking" });
  const [confirmKind, setConfirmKind] = useState<"plain" | "typed">("plain");
  const [error, setError] = useState<unknown>(undefined);
  const [done, setDone] = useState<Done | null>(null);
  const [cut, setCut] = useState(false);
  const runRef = useRef(0);

  /** The re-read (5.2): the same array by its UUID, the member still in it, and still allowed. */
  const recheck = async (
    m: Member,
  ): Promise<
    | { ok: true; confirm: "plain" | "typed"; member: Member }
    | { ok: false; title: string; body: string }
  > => {
    try {
      const rows = await api.arrays();
      const now = rows.find((r) => r.devicefile === row.devicefile);
      if (now === undefined || !sameArray(now, row)) {
        return {
          ok: false,
          title: t("raidRemove.refusedTitle"),
          body: t("raidRemove.changed"),
        };
      }
      const detail = await api.detail(now.devicefile);
      const fresh = readReport(detail, now.devices);
      const freshState = arrayState(now, fresh, detail);
      const freshMember = fresh.known
        ? fresh.members.find((x) => x.device === m.device)
        : undefined;
      if (!fresh.known) {
        return {
          ok: false,
          title: t("raidRemove.refusedTitle"),
          body: t("raidRole.unreadBlocks"),
        };
      }
      if (freshMember === undefined) {
        return {
          ok: false,
          title: t("raidRemove.refusedTitle"),
          body: t("raidRemove.gone"),
        };
      }
      const decision = removeDecision(
        levelKey(now.level),
        freshState,
        freshMember,
        false,
      );
      if (!decision.allowed) {
        return {
          ok: false,
          title: t("raidRemove.refusedTitle"),
          body: blockerText(decision.blocker, now.level),
        };
      }
      return { ok: true, confirm: decision.confirm, member: freshMember };
    } catch (e) {
      return {
        ok: false,
        title: t("raidRemove.refusedTitle"),
        body: isRpcError(e) ? e.message : t("raidRole.unreadBlocks"),
      };
    }
  };

  const open = (m: Member, opener?: HTMLElement | null) => {
    openerRef.current =
      opener ?? (document.activeElement as HTMLElement | null);
    const mine = ++runRef.current;
    setMember(m);
    setError(undefined);
    setPhase({ kind: "checking" });
    void recheck(m).then((result) => {
      if (runRef.current !== mine) {
        return;
      }
      if (result.ok) {
        setConfirmKind(result.confirm);
        setMember(result.member);
        setPhase({ kind: "confirm" });
      } else {
        setPhase({ kind: "refused", title: result.title, body: result.body });
      }
    });
  };
  useImperativeHandle(ref, () => ({ takeOut: (m) => open(m) }));

  const close = () => {
    runRef.current += 1;
    setMember(null);
  };

  const confirm = async () => {
    if (member === null || phase.kind !== "confirm") {
      return;
    }
    const mine = runRef.current;
    setError(undefined);
    setPhase({ kind: "confirm", rechecking: true });
    const again = await recheck(member);
    if (runRef.current !== mine) {
      return;
    }
    if (!again.ok || again.confirm !== confirmKind) {
      setPhase(
        again.ok
          ? {
              kind: "refused",
              title: t("raidRemove.refusedTitle"),
              body: t("raidRemove.changed"),
            }
          : { kind: "refused", title: again.title, body: again.body },
      );
      return;
    }
    setPhase({ kind: "confirm", running: true });
    try {
      await api.remove(row.devicefile, member.device);
      recordChanged(row.devicefile);
      const disk = diskOf(member.device, disks);
      setDone({
        device: member.device,
        serial:
          disk?.serialnumber.trim() ??
          slaves
            ?.find((s) => s.devicefile === member.device)
            ?.serialnumber.trim() ??
          "",
        devicename: disk?.devicename ?? null,
        working: confirmKind === "typed",
      });
      setMember(null);
      headingRef.current?.focus();
      onChanged();
    } catch (e) {
      if (isCut(e)) {
        setMember(null);
        setCut(true);
        onChanged();
        return;
      }
      setError(e);
      setPhase({ kind: "confirm" });
    }
  };

  // The rows: the report's members and the missing slots; the listed devices when it was not read.
  const rows: { member: Member | null; key: string }[] =
    report !== null && report.known
      ? memberRows(report)
      : row.devices.map((device) => ({
          member: { device, role: "other" as const, words: "" },
          key: device,
        }));
  const rolesKnown = report !== null && report.known;
  const blockedWorking = new Set<string>();
  const decisions = rows.map(({ member: m }) => {
    if (m === null || !rolesKnown) {
      return null;
    }
    const decision = removeDecision(key, state, m, changing);
    if (!decision.allowed && m.role === "working") {
      blockedWorking.add(blockerText(decision.blocker, row.level));
    }
    return decision;
  });

  const sizeOf = (device: string) => {
    const slave = slaves?.find((s) => s.devicefile === device);
    return slave === undefined ? null : bytesOf(slave.size);
  };

  const shown = member;
  const shownDisk = shown === null ? undefined : diskOf(shown.device, disks);
  const shownSize = shown === null ? null : sizeOf(shown.device);
  const label = shownSize === null ? null : labelSize(shownSize);
  const sizeText =
    shownSize === null
      ? ""
      : label === null
        ? formatBytes(shownSize)
        : t("raidRemove.sizeLabel", {
            size: formatBytes(shownSize),
            label: t("format.sizeDecimal", label),
          });
  const after = protection(key, row.numdevices, (state.short ?? 0) + 1);
  const diskLine: ReactNode =
    shown === null ? null : (
      <Slotted
        sentence={(tokens) =>
          t(
            shownDisk?.model.trim()
              ? sizeText === ""
                ? "raidRemove.diskNoSize"
                : "raidRemove.disk"
              : sizeText === ""
                ? "raidRemove.diskNoModelNoSize"
                : "raidRemove.diskNoModel",
            {
              ...tokens,
              size: sizeText,
              role: words.roleWord(shown.role, shown.words),
            },
          )
        }
        values={{
          device: <Identifier>{shown.device}</Identifier>,
          model: shownDisk?.model.trim() ?? "",
          serial: (
            <Identifier>{shownDisk?.serialnumber.trim() ?? ""}</Identifier>
          ),
        }}
      />
    );
  const address = arrayAddress(row);
  const typed = confirmKind === "typed";

  return (
    <section
      aria-labelledby="array-disks"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2
        id="array-disks"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold outline-hidden"
      >
        {t("array.disks.title")}
      </h2>
      {done === null ? null : (
        <JobResult
          result={{
            status: "succeeded",
            statusLabel: t("addStorage.state.succeeded"),
            message: (
              <>
                <span className="block font-semibold">
                  {t("raidRemove.doneTitle", {
                    device: done.device,
                    array: row.devicefile,
                  })}
                </span>
                <span className="block">
                  {t("raidRemove.doneBody", { serial: done.serial })}
                </span>
                {done.working ? (
                  <span className="block">{t("raidRemove.undo")}</span>
                ) : null}
                <span className="block">{t("raidRemove.doneApply")}</span>
                {done.devicename === null ? null : (
                  <Link
                    to="/storage/disks/$disk"
                    params={{ disk: done.devicename }}
                    className={routerLinkClass}
                  >
                    {t("raidRemove.openDisk", { device: done.device })}
                  </Link>
                )}
              </>
            ),
          }}
          dismissLabel={t("raidRemove.dismiss")}
          onDismiss={() => setDone(null)}
        />
      )}
      {cut ? (
        <InlineAlert tone="neutral" title={t("raidRemove.unknown")}>
          <p>
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                setCut(false);
                onChanged();
              }}
            >
              {t("raidRemove.refresh")}
            </Button>
          </p>
        </InlineAlert>
      ) : null}
      <Table
        aria-label={t("array.disks.tableLabel", { device: row.devicefile })}
        frameLabel={t("array.disks.tableLabel", { device: row.devicefile })}
      >
        <TableHeader>
          <TableRow>
            <TableHead>{t("array.disks.col.disk")}</TableHead>
            <TableHead className="max-sm:hidden">
              {t("array.disks.col.model")}
            </TableHead>
            <TableHead className="text-end max-sm:hidden">
              {t("array.disks.col.size")}
            </TableHead>
            <TableHead>{t("array.disks.col.role")}</TableHead>
            <TableHead className="max-sm:hidden">
              {t("array.disks.col.health")}
            </TableHead>
            <TableHead>
              <span className="sr-only">{t("array.disks.takeOut")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ member: m, key: k }, i) => {
            if (m === null) {
              return (
                <TableRow key={k}>
                  <TableCell className="text-muted-foreground">
                    {t("array.disks.missing")}
                  </TableCell>
                  <TableCell className="max-sm:hidden" />
                  <TableCell className="max-sm:hidden" />
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill status="critical">
                        {t("health.critical")}
                      </StatusPill>
                      <span>{t("raidRole.missing")}</span>
                    </span>
                  </TableCell>
                  <TableCell className="max-sm:hidden" />
                  <TableCell />
                </TableRow>
              );
            }
            const disk = diskOf(m.device, disks);
            const size = sizeOf(m.device);
            const decision = decisions[i];
            const serial =
              disk?.serialnumber.trim() ??
              slaves
                ?.find((s) => s.devicefile === m.device)
                ?.serialnumber.trim() ??
              "";
            return (
              <TableRow key={k}>
                <TableCell className="whitespace-nowrap">
                  {disk !== undefined &&
                  disk.canonicaldevicefile === m.device ? (
                    <Link
                      to="/storage/disks/$disk"
                      params={{ disk: disk.devicename }}
                      aria-label={t("disks.openDisk", { device: m.device })}
                      className={routerLinkClass}
                    >
                      <Identifier>{m.device}</Identifier>
                    </Link>
                  ) : (
                    <Identifier>{m.device}</Identifier>
                  )}
                  {/* Under the small breakpoint, Model, Size and Health are hidden and said here. */}
                  <span className="mt-1 flex flex-col gap-0.5 text-sm whitespace-normal sm:hidden">
                    <span dir="auto">
                      {[
                        disk?.model.trim() ?? "",
                        size === null ? "" : formatBytes(size),
                      ]
                        .filter((x) => x !== "")
                        .join(", ")}
                    </span>
                    {serial === "" ? null : (
                      <span className="text-xs text-muted-foreground">
                        <Slotted
                          sentence={(tokens) => t("array.disks.serial", tokens)}
                          values={{ serial: <Identifier>{serial}</Identifier> }}
                        />
                      </span>
                    )}
                    <DiskHealthStatus
                      checked={check.result !== undefined}
                      reading={check.reading(
                        disk?.canonicaldevicefile ?? m.device,
                      )}
                    />
                  </span>
                </TableCell>
                <TableCell className="min-w-40 max-sm:hidden">
                  <span className="block" dir="auto">
                    {disk?.model.trim() ?? ""}
                  </span>
                  {serial === "" ? null : (
                    <span className="block text-xs text-muted-foreground">
                      <Slotted
                        sentence={(tokens) => t("array.disks.serial", tokens)}
                        values={{ serial: <Identifier>{serial}</Identifier> }}
                      />
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-end whitespace-nowrap tabular-nums max-sm:hidden">
                  {size === null ? "" : formatBytes(size)}
                </TableCell>
                <TableCell className="sm:min-w-32">
                  {!rolesKnown ? (
                    <span className="text-muted-foreground">
                      {t("raidRole.unknown")}
                    </span>
                  ) : m.role === "failed" ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusPill status="critical">
                        {t("health.critical")}
                      </StatusPill>
                      <span>{t("raidRole.failed")}</span>
                    </span>
                  ) : m.role === "rebuilding" ? (
                    <span className="block">
                      {t("raidRole.rebuilding")}
                      <span className="block text-sm text-muted-foreground">
                        {words.progressText(state.progress)}
                      </span>
                    </span>
                  ) : m.role === "spare" ? (
                    <span className="block">
                      {t("raidRole.spare")}
                      <span className="block text-sm text-muted-foreground">
                        {t("raidRole.spareHint")}
                      </span>
                    </span>
                  ) : m.role === "other" ? (
                    <Identifier>{m.words}</Identifier>
                  ) : (
                    t("raidRole.working")
                  )}
                </TableCell>
                <TableCell className="min-w-32 max-sm:hidden">
                  <DiskHealthStatus
                    checked={check.result !== undefined}
                    reading={check.reading(
                      disk?.canonicaldevicefile ?? m.device,
                    )}
                  />
                </TableCell>
                <TableCell>
                  {decision?.allowed === true ? (
                    <Button
                      variant="neutral"
                      size="sm"
                      aria-label={t("array.disks.takeOutName", {
                        device: m.device,
                        array: row.devicefile,
                      })}
                      onClick={(event) => open(m, event.currentTarget)}
                    >
                      {t("array.disks.takeOut")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {report !== null && report.known && report.spares > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("array.disks.spareNote")}
        </p>
      ) : null}
      {!rolesKnown && report !== null ? (
        <p className="max-w-prose">{t("raidRole.unreadBlocks")}</p>
      ) : null}
      {[...blockedWorking].map((text) => (
        <p key={text} className="max-w-prose">
          {text}
        </p>
      ))}
      {check.result === undefined ? (
        <p className="text-sm">
          <Link to="/storage/disks" className={routerLinkClass}>
            {t("array.disks.checkLink")}
          </Link>
        </p>
      ) : null}

      <CheckedDialog
        open={member !== null}
        onClose={close}
        phase={phase}
        checkingTitle={t("raidRemove.plainTitle", {
          device: member?.device ?? "",
          array: row.devicefile,
        })}
        checkingLabel={t("raidRemove.checking")}
        title={
          typed
            ? t("raidRemove.workingTitle", {
                device: member?.device ?? "",
                array: row.devicefile,
              })
            : t("raidRemove.plainTitle", {
                device: member?.device ?? "",
                array: row.devicefile,
              })
        }
        description={
          <>
            <p>{diskLine}</p>
            {typed ? (
              <>
                <p>
                  {t("raidRemove.consequence", {
                    protection: words.protectionText(after),
                  })}
                </p>
                <p>
                  {t("raidRemove.ifAnother", {
                    loss:
                      after?.key === "noMore" || after?.key === "none"
                        ? t("raidRemove.loss.all")
                        : t("raidRemove.loss.oneMore"),
                  })}
                </p>
              </>
            ) : (
              <p>
                {member?.role === "spare"
                  ? t("raidRemove.spareBody")
                  : t("raidRemove.failedBody")}
              </p>
            )}
          </>
        }
        destructive={typed}
        typed={
          typed && member !== null
            ? {
                confirmText: member.device,
                prompt: t("raidRemove.typePrompt", { device: member.device }),
                hint: t("raidRemove.typeHint"),
              }
            : undefined
        }
        confirmLabel={
          typed ? t("raidRemove.confirmWorking") : t("raidRemove.confirmPlain")
        }
        recheckingLabel={t("raidRemove.checkingAgain")}
        runningLabel={t("raidRemove.running", { device: member?.device ?? "" })}
        cancelLabel={t("raidRemove.cancel")}
        closeLabel={t("raidRemove.close")}
        error={
          error === undefined ? undefined : (
            <>
              <p className="text-critical-label">
                {t("raidRemove.failedTitle", { device: member?.device ?? "" })}
              </p>
              {isRpcError(error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {error.message}
                </ServerMessage>
              ) : null}
            </>
          )
        }
        onConfirm={() => void confirm()}
        openerRef={openerRef}
      >
        {typed ? (
          <div className="flex flex-col gap-2 text-base">
            {report !== null &&
            report.known &&
            report.spares === 0 &&
            address !== null ? (
              <p>
                {t("raidRemove.spareFirst")}{" "}
                <Link
                  to="/storage/md/$array/add"
                  params={{ array: address }}
                  className={routerLinkClass}
                >
                  {t("raidRemove.spareFirstLink")}
                </Link>
              </p>
            ) : null}
            <p>{t("raidRemove.notErasedShort")}</p>
          </div>
        ) : (
          <p className="text-base">{t("raidRemove.notErased")}</p>
        )}
      </CheckedDialog>
    </section>
  );
}
