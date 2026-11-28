// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disks (phase 5 disks design 1), for administrators: which disks the NAS has, what each one
// holds, and whether any is in trouble. The four reads (the disks, the configured and the detected
// file systems, the RAID plugin's arrays) are made when the page opens, on Refresh, and after "Look
// for new disks"; nothing polls (D3) and none of them wakes a disk. The temperatures by kind read, on
// the dashboard's terms (journal 2026-11-28), each awake disk's kind once per visit: a disk the list
// reports asleep is never asked. Health comes only from the
// session's disk-health check, which the reader starts. If what the disks hold cannot be checked, the
// page says so and no disk can be wiped (fail closed). A normal user gets the "only administrators"
// page, and nothing is called first (UI-4).
import {
  getDiskMgmtGetListQueryKey,
  getDiskMgmtGetListQueryOptions,
  getFileSystemMgmtEnumerateFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getMdMgmtEnumerateDevicesQueryOptions,
  useDiskMgmtRescan,
  type DiskDeviceList,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ExternalLink,
  InlineAlert,
  Page,
  PageHeader,
  PairStack,
  ServerMessage,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { newDisks } from "../../disks/disksList.ts";
import { useFormat } from "../../format/useFormat.ts";
import { ALL_DISKS, useDiskInventory } from "../../hooks/useDiskReads.ts";
import { useDiskTemperatureGroups } from "../../hooks/useDiskTemperatures.ts";
import {
  ALL_CONFIGURED,
  useForegroundRead,
} from "../../hooks/useMonitoringReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { DashboardTemperatures } from "../organisms/DashboardTemperatures.tsx";
import { DiskHealthLine } from "../organisms/DiskHealthLine.tsx";
import { DisksTable } from "../organisms/DisksTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function DisksPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("disks.title")} />;
  }
  return <Disks />;
}

/**
 * Read the four inputs again, as foreground reads, and wait for them. A failure stays in its entry.
 * Each read is named by its own options: nothing here refetches queries by a filter, which could
 * reach a read that wakes a disk.
 */
function useReadAgain() {
  const read = useForegroundRead();
  return () =>
    Promise.all([
      read(getDiskMgmtGetListQueryOptions(ALL_DISKS)),
      read(getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED)),
      read(getFileSystemMgmtEnumerateFilesystemsQueryOptions()),
      read({ ...getMdMgmtEnumerateDevicesQueryOptions(), retry: false }),
    ]).then(() => undefined);
}

type Rescan =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; at: number; found: string[] }
  | { state: "failed"; error: unknown };

function Disks() {
  const { t } = useTranslation();
  const format = useFormat();
  const queryClient = useQueryClient();
  const inventory = useDiskInventory();
  const readAgain = useReadAgain();
  const rescan = useDiskMgmtRescan();
  const [refreshing, setRefreshing] = useState(false);
  const [rescanState, setRescanState] = useState<Rescan>({ state: "idle" });
  const list = inventory.diskList;
  const temperatures = useDiskTemperatureGroups(inventory.disks);

  const refresh = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await readAgain();
    } finally {
      setRefreshing(false);
    }
  };

  const lookForNewDisks = async () => {
    if (rescanState.state === "running") {
      return;
    }
    const before = (inventory.disks ?? []).map((d) => d.canonicaldevicefile);
    setRescanState({ state: "running" });
    try {
      await rescan.mutateAsync();
    } catch (error) {
      setRescanState({ state: "failed", error });
      return;
    }
    await readAgain();
    const fresh = queryClient.getQueryData<DiskDeviceList>(
      getDiskMgmtGetListQueryKey(ALL_DISKS),
    );
    setRescanState({
      state: "done",
      at: Date.now(),
      found: newDisks(before, fresh?.data ?? []),
    });
  };

  const looking = rescanState.state === "running";
  const busy = refreshing || looking;
  const hasRows = inventory.disks !== undefined;

  return (
    <Page>
      <PageHeader
        title={
          <PageTitle documentTitle={t("disks.documentTitle")}>
            {t("disks.title")}
          </PageTitle>
        }
      >
        <p className="max-w-prose">{t("disks.intro")}</p>
        <DiskHealthLine />

        <PairStack>
          <TableToolbar>
            <Button
              variant="neutral"
              loading={looking}
              onClick={looking ? undefined : () => void lookForNewDisks()}
            >
              {looking ? t("disks.rescanning") : t("disks.rescan")}
            </Button>
            <Button
              variant="neutral"
              loading={refreshing}
              onClick={busy ? undefined : () => void refresh()}
            >
              {refreshing ? t("disks.refreshing") : t("disks.refresh")}
            </Button>
            <p
              role="status"
              className="ms-auto text-xs text-muted-foreground tabular-nums"
            >
              {hasRows && list.dataUpdatedAt > 0
                ? t("disks.readAt", { time: format.clock(list.dataUpdatedAt) })
                : ""}
            </p>
          </TableToolbar>

          <p role="status" className="text-sm empty:hidden">
            {rescanState.state === "done" ? (
              <>
                {t("disks.rescanDone", { time: format.clock(rescanState.at) })}{" "}
                {rescanState.found.length > 0
                  ? t("disks.rescanFound", {
                      count: rescanState.found.length,
                      list: rescanState.found.join(", "),
                    })
                  : t("disks.rescanNone")}
              </>
            ) : null}
          </p>
          {rescanState.state === "failed" ? (
            <InlineAlert tone="critical" title={t("disks.rescanFailed")}>
              {isRpcError(rescanState.error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {rescanState.error.message}
                </ServerMessage>
              ) : null}
            </InlineAlert>
          ) : null}
        </PairStack>

        {hasRows && inventory.useState === "failed" ? (
          <InlineAlert tone="critical" title={t("disks.useFailed")}>
            {isRpcError(inventory.useError) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {inventory.useError.message}
              </ServerMessage>
            ) : null}
            <p className="mt-2">
              <Button
                variant="neutral"
                size="sm"
                loading={refreshing}
                onClick={busy ? undefined : () => void refresh()}
              >
                {t("common.tryAgain")}
              </Button>
            </p>
          </InlineAlert>
        ) : null}
      </PageHeader>

      {/* Once the list is read: while it loads or after it failed, the table says so, once. */}
      {hasRows && !list.isError ? (
        <DashboardTemperatures
          mode="all"
          groups={temperatures}
          state="ok"
          error={null}
          readAt={list.dataUpdatedAt}
          retrying={refreshing}
          onRetry={() => void refresh()}
        />
      ) : null}

      <DisksTable
        disks={inventory.disks}
        uses={inventory.uses}
        usesLoading={inventory.useState === "loading"}
        error={list.error}
        failed={list.isError}
        refreshing={refreshing}
        onRetry={() => void refresh()}
      />

      <footer className="text-sm">
        <ExternalLink href={CLASSIC.disks} newTabLabel={t("app.newTab")}>
          {t("disks.classicLink")}
        </ExternalLink>
      </footer>
    </Page>
  );
}
