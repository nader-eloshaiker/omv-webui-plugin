// SPDX-License-Identifier: GPL-3.0-or-later
// The scheduled self-tests and their actions (phase 5 disks design 6.3 to 6.6, 2.6): one table, used
// on the Self-tests page for every disk and on a disk's page for that disk (without the Disk column).
// Each row has a visible "Actions" menu button (D22): Run now, Edit, Delete. Every read here is
// configuration and wakes no disk; only "Run now", after its confirmation, starts a test (D15). A
// narrow table stacks: the disk (or, on a disk's page, the test) on top, the other columns as lines.
import type {
  DiskDevice,
  SmartScheduleEntry,
} from "@omv-webui/react-api-omv/generated";
import {
  getSmartGetDeviceSettingsQueryKey,
  getSmartGetScheduleListQueryKey,
  useSmartDeleteScheduledTest,
  useSmartGetScheduledTest,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ExternalLink,
  InlineAlert,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  PairStack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { byDeviceOrder } from "../../disks/diskUse.ts";
import { diskOfEntry, isConnected, runsWord } from "../../disks/schedule.ts";
import {
  ALL_TESTS,
  ON_OPEN,
  useDiskList,
  useScheduleList,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { useSmartWatched, type Watch } from "../../hooks/useSmartWatched.ts";
import { useScheduleText } from "../../hooks/useSmartWords.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { DevicePath } from "../atoms/DevicePath.tsx";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import {
  SelfTestDialog,
  type SelfTestDialogTarget,
} from "./SelfTestDialog.tsx";
import {
  SelfTestResults,
  SelfTestRunConfirm,
  type RunTarget,
} from "./SelfTestRunNow.tsx";

interface Row {
  entry: SmartScheduleEntry;
  disk: DiskDevice | undefined;
  connected: boolean;
  watch: Watch;
}

/** The disk-not-connected row's stored device: Smart.getScheduledTest keeps it; the list does not. */
function StoredDevice({ uuid }: { uuid: string }) {
  const stored = useSmartGetScheduledTest({ uuid }, { query: ON_OPEN });
  const device = stored.data?.devicefile ?? "";
  return device === "" ? null : <DevicePath value={device} />;
}

function ActionsMenu({
  row,
  onRun,
  onEdit,
  onDelete,
}: {
  row: Row;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const words = useScheduleText();
  const device = row.disk?.canonicaldevicefile ?? t("smart.tests.notConnected");
  const runBlocked = !row.connected
    ? t("smart.tests.runNowNotConnected")
    : row.watch.state !== "watched"
      ? t("smart.tests.runNowNotWatched")
      : null;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="neutral"
            size="sm"
            aria-label={t("smart.tests.actionsFor", {
              test: words.typeLower(row.entry.type),
              device,
            })}
          />
        }
      >
        {t("smart.tests.actions")}
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem disabled={runBlocked !== null} onClick={onRun}>
          <span className="flex flex-col">
            <span>{t("smart.tests.runNow")}</span>
            {runBlocked === null ? null : (
              <span className="text-sm text-muted-foreground">
                {runBlocked}
              </span>
            )}
          </span>
        </MenuItem>
        <MenuItem onClick={onEdit}>{t("smart.tests.edit")}</MenuItem>
        <MenuSeparator />
        <MenuItem onClick={onDelete}>{t("smart.tests.delete")}</MenuItem>
      </MenuContent>
    </Menu>
  );
}

function RunsCell({ row, globalOn }: { row: Row; globalOn: boolean }) {
  const { t } = useTranslation();
  const word = runsWord({
    enable: row.entry.enable,
    connected: row.connected,
    watched:
      row.watch.state === "watched"
        ? true
        : row.watch.state === "notWatched"
          ? false
          : undefined,
    globalOn,
  });
  return <>{t(`smart.tests.runs.${word}`)}</>;
}

export function SelfTestsManager({ disk }: { disk?: DiskDevice }) {
  const { t } = useTranslation();
  const words = useScheduleText();
  const queryClient = useQueryClient();
  const schedule = useScheduleList();
  const diskList = useDiskList();
  const settings = useSmartSettings();
  const disks = diskList.data ? byDeviceOrder(diskList.data.data) : undefined;
  const watched = useSmartWatched(disks);
  const remove = useSmartDeleteScheduledTest();
  const [dialog, setDialog] = useState<SelfTestDialogTarget | null>(null);
  const [run, setRun] = useState<RunTarget | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const globalOn = settings.data?.enable ?? true;
  const showDisk = disk === undefined;
  const columns = showDisk ? 6 : 5;

  const order = (d: DiskDevice | undefined) =>
    d === undefined ? Number.MAX_SAFE_INTEGER : (disks ?? []).indexOf(d);
  const rows: Row[] = (schedule.data?.data ?? [])
    .map((entry) => {
      const of = diskOfEntry(entry, disks ?? []);
      return {
        entry,
        disk: of,
        connected: isConnected(entry) && of !== undefined,
        watch: of ? watched.of(of.devicefile) : ({ state: "loading" } as Watch),
      };
    })
    .filter(
      (row) => disk === undefined || row.disk?.devicefile === disk.devicefile,
    )
    .map((row, index) => ({ row, index }))
    .sort((a, b) => order(a.row.disk) - order(b.row.disk) || a.index - b.index)
    .map(({ row }) => row);

  const choices = (disks ?? []).map((d) => ({
    disk: d,
    watched: watched.of(d.devicefile).state === "watched",
  }));

  const openAdd = () => {
    setSavedNotice(false);
    setDialog({ mode: "add", devicefile: disk?.devicefile });
  };
  const openEdit = (row: Row) => {
    setSavedNotice(false);
    setDialog({
      mode: "edit",
      entry: row.entry,
      devicefile: row.disk?.devicefile ?? "",
      connected: row.connected,
    });
  };
  const confirmDelete = () => {
    if (deleting === null) {
      return;
    }
    remove.mutate(
      { data: { uuid: deleting.entry.uuid } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getSmartGetScheduleListQueryKey(ALL_TESTS),
          });
          if (deleting.disk) {
            void queryClient.invalidateQueries({
              queryKey: getSmartGetDeviceSettingsQueryKey({
                devicefile: deleting.disk.devicefile,
              }),
            });
          }
          setDeleting(null);
          setSavedNotice(true);
        },
      },
    );
  };

  const addButton = (
    <Button variant={showDisk ? "primary" : "neutral"} onClick={openAdd}>
      {t("smart.tests.add")}
    </Button>
  );

  let body;
  if (schedule.data === undefined && schedule.isError) {
    body = (
      <TableStateRow colSpan={columns}>
        <ReadFailed
          error={schedule.error}
          onRetry={() => void schedule.refetch()}
          retrying={schedule.isFetching}
        >
          {t("smart.tests.loadFailed")}
        </ReadFailed>
      </TableStateRow>
    );
  } else if (schedule.data === undefined || disks === undefined) {
    body = <TableSkeletonRows rows={3} columns={columns} />;
  } else {
    body = rows.map((row) => (
      <TableRow key={row.entry.uuid}>
        {showDisk ? (
          <TableCell narrow="title" className="@min-[40rem]:min-w-40">
            {row.disk && row.connected ? (
              <span className="flex flex-col whitespace-nowrap">
                <DiskLink
                  devicename={row.disk.devicename}
                  device={row.disk.canonicaldevicefile}
                />
                {row.disk.model.trim() === "" ? null : (
                  <span
                    dir="auto"
                    className="text-xs whitespace-normal text-muted-foreground"
                  >
                    {row.disk.model}
                  </span>
                )}
              </span>
            ) : (
              <span className="flex flex-col">
                <StoredDevice uuid={row.entry.uuid} />
                <span className="text-xs text-muted-foreground">
                  {t("smart.tests.notConnected")}
                </span>
              </span>
            )}
          </TableCell>
        ) : null}
        {/* On a disk's page, with no Disk column, the test is the row's name. */}
        <TableCell
          narrow={showDisk ? "line" : "title"}
          label={showDisk ? t("smart.tests.col.test") : undefined}
        >
          {words.typeName(row.entry.type)}
        </TableCell>
        <TableCell label={t("smart.tests.col.when")}>
          {words.when(row.entry)}
        </TableCell>
        <TableCell label={t("smart.tests.col.runs")}>
          <RunsCell row={row} globalOn={globalOn} />
        </TableCell>
        <TableCell label={t("smart.tests.col.note")}>
          {/* Nothing without a note, so a stacked row leaves the line out. */}
          {row.entry.comment === "" ? null : (
            <span dir="auto" className="line-clamp-2 max-w-64 break-words">
              {row.entry.comment}
            </span>
          )}
        </TableCell>
        {/* Stacked, the actions are a line of their own under the facts. */}
        <TableCell className="text-end">
          <ActionsMenu
            row={row}
            onRun={() =>
              setRun({
                entry: row.entry,
                devicename: row.disk?.devicename ?? null,
              })
            }
            onEdit={() => openEdit(row)}
            onDelete={() => {
              remove.reset();
              setSavedNotice(false);
              setDeleting(row);
            }}
          />
        </TableCell>
      </TableRow>
    ));
  }

  const empty =
    schedule.data !== undefined && disks !== undefined && rows.length === 0;
  const devices =
    disk === undefined ? undefined : new Set([disk.canonicaldevicefile]);
  const diskWatch = disk ? watched.of(disk.devicefile) : undefined;

  const table = (
    <Table
      aria-label={t("smart.tests.tableLabel")}
      // On a disk's page the section of the same name holds the table; its frame stays unnamed.
      frameLabel={showDisk ? t("smart.tests.tableLabel") : undefined}
      busy={schedule.data === undefined}
      busyLabel={t("smart.tests.loading")}
    >
      <TableHeader>
        <TableRow>
          {showDisk ? <TableHead>{t("smart.tests.col.disk")}</TableHead> : null}
          <TableHead>{t("smart.tests.col.test")}</TableHead>
          <TableHead>{t("smart.tests.col.when")}</TableHead>
          <TableHead>{t("smart.tests.col.runs")}</TableHead>
          <TableHead>{t("smart.tests.col.note")}</TableHead>
          <TableHead className="text-end">
            {t("smart.tests.col.actions")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{body}</TableBody>
    </Table>
  );

  const savedLine = (
    <p role="status" className="text-sm text-foreground empty:hidden">
      {savedNotice ? t("common.savedPending") : ""}
    </p>
  );

  return (
    <div className="flex min-w-0 flex-col gap-group">
      {showDisk ? (
        <>
          <PairStack>
            <TableToolbar>{addButton}</TableToolbar>
            {savedLine}
          </PairStack>
          <SelfTestResults />
        </>
      ) : diskWatch?.state === "notWatched" ? (
        <p className="text-sm">{t("disk.tests.notWatched")}</p>
      ) : null}
      {empty && showDisk ? (
        <EmptyState
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="neutral" onClick={openAdd}>
                {t("smart.tests.add")}
              </Button>
              <Link to="/storage/smart/set-up" className={routerLinkClass}>
                {t("smart.tests.setUpLink")}
              </Link>
            </div>
          }
        >
          {t("smart.tests.empty")}
        </EmptyState>
      ) : empty ? (
        <p>{t("disk.tests.empty")}</p>
      ) : (
        table
      )}
      {showDisk ? (
        <p className="text-sm">
          <ExternalLink href={CLASSIC.smartTasks} newTabLabel={t("app.newTab")}>
            {t("smart.tests.classicLink")}
          </ExternalLink>
        </p>
      ) : (
        <>
          <PairStack>
            <div>{addButton}</div>
            {savedLine}
          </PairStack>
          <SelfTestResults devices={devices} />
          <p className="text-sm">
            <Link to="/storage/smart/self-tests" className={routerLinkClass}>
              {t("disk.tests.all")}
            </Link>
          </p>
        </>
      )}

      <SelfTestDialog
        target={dialog}
        disks={choices}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          setSavedNotice(true);
        }}
      />
      <SelfTestRunConfirm target={run} onClose={() => setRun(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        title={
          <Trans
            i18nKey="smart.tests.deleteTitle"
            values={{ test: words.typeLower(deleting?.entry.type ?? "S") }}
            components={{
              device: (
                <IdentifierText
                  value={
                    deleting?.disk?.canonicaldevicefile ??
                    t("smart.tests.notConnected")
                  }
                />
              ),
            }}
          />
        }
        description={t("smart.tests.deleteBody")}
        cancelLabel={t("smart.tests.dialog.cancel")}
        confirmLabel={t("smart.tests.deleteConfirm")}
        pending={remove.isPending}
        error={
          remove.error ? (
            <>
              {t("smart.tests.deleteFailed")}{" "}
              {isRpcError(remove.error) ? remove.error.message : ""}
            </>
          ) : undefined
        }
        onConfirm={confirmDelete}
      />
      {watched.failedCount > 0 ? (
        <InlineAlert tone="neutral" role="note">
          <span className="flex flex-wrap items-center gap-2">
            {t("smart.overview.watchFailed", { count: watched.failedCount })}
            <Button
              variant="neutral"
              size="sm"
              loading={watched.retrying}
              onClick={watched.retryFailed}
            >
              {t("common.tryAgain")}
            </Button>
          </span>
        </InlineAlert>
      ) : null}
    </div>
  );
}
