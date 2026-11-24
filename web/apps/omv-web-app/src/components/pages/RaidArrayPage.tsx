// SPDX-License-Identifier: GPL-3.0-or-later
// An array's page (phase 5 RAID design 2), for administrators: is it healthy, which disks is it made of
// and what is each doing, and what is stored on it. Addressed by the array's kernel name, validated in
// the route; the row is found in MdMgmt.enumerateDevices and every later call uses its fields (UI-4).
// Its report (MdMgmt.getDetail) gives each member's role; its disks' sizes come from getSlaves. While it
// is busy the array and its report are read again every 30 seconds in the background (P9). Every action
// re-checks the array's UUID before it acts (D2): a different array under the same name closes every
// dialog. A normal user gets the "only administrators" page, and nothing is called first.
import {
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  FactListSkeleton,
  InlineAlert,
  JobResult,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDiskList } from "../../hooks/useDiskReads.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useArraySlaves } from "../../hooks/useRaidReads.ts";
import { useArrayView } from "../../hooks/useRaidView.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { addDecision, keepsCopies, levelKey } from "../../raid/raidModel.ts";
import { raidSession } from "../../raid/raidSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { RaidNotInstalled } from "../molecules/RaidNotInstalled.tsx";
import { RaidStateView } from "../molecules/RaidStateView.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ArrayAddSection } from "../organisms/ArrayAddSection.tsx";
import { ArrayCheckSection } from "../organisms/ArrayCheckSection.tsx";
import {
  ArrayDeleteSection,
  type Deleted,
} from "../organisms/ArrayDeleteSection.tsx";
import { ArrayDetails } from "../organisms/ArrayDetails.tsx";
import { ArrayDisks, type ArrayDisksHandle } from "../organisms/ArrayDisks.tsx";
import { ArrayNowCard } from "../organisms/ArrayNowCard.tsx";
import { ArraySummary } from "../organisms/ArraySummary.tsx";
import { ArrayUsedBy } from "../organisms/ArrayUsedBy.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ReadAtLine } from "./RaidPage.tsx";

export function RaidArrayRoutePage() {
  const { array } = useParams({ from: "/_signedIn/storage/md/$array/" });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("raid.title")} />;
  }
  return <RaidArray address={array} />;
}

function Crumbs({ device }: { device: string | null }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/storage/md" />}>
        {t("array.breadcrumb")}
      </BreadcrumbItem>
      {device === null ? null : (
        <BreadcrumbItem current>{t("array.title", { device })}</BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Crumbs device={null} />
      <PageTitle>{t("raid.title")}</PageTitle>
      <EmptyState
        action={
          <Link to="/storage/md" className={routerLinkClass}>
            {t("array.showAll")}
          </Link>
        }
      >
        {t("array.notFound")}
      </EmptyState>
    </div>
  );
}

function RaidArray({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const words = useRaidWords();
  const fsApi = useFsApi();
  const v = useArrayView(address);
  const disks = useDiskList();
  const row = v.view?.row;
  const slaves = useArraySlaves(row?.devicefile ?? "", row !== undefined);
  const info = useSystemInformation();
  const memory = useMemoryStore(raidSession);
  const disksRef = useRef<ArrayDisksHandle>(null);
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [cut, setCut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The array this page first showed, by its UUID (0.6, D2).
  const [seen, setSeen] = useState<string | null>(null);
  const [changedAlert, setChangedAlert] = useState(false);
  if (row !== undefined && seen === null) {
    setSeen(row.uuid);
  } else if (row !== undefined && seen !== null && seen !== row.uuid) {
    setSeen(row.uuid);
    setChangedAlert(true);
  }
  // The state is announced once when the pill changes; the moving percentage is not.
  const statusWord = v.view === null ? "" : words.statusWord(v.view.state);

  const refresh = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await Promise.allSettled([
        v.arrays.refetch(),
        v.detail.refetch(),
        slaves.refetch(),
        v.configured.refetch(),
        v.detected.refetch(),
        disks.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (v.missing) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t("raid.title")}</PageTitle>
        <RaidNotInstalled />
      </div>
    );
  }
  if (deleted !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Crumbs device={null} />
        <PageTitle>{t("raid.title")}</PageTitle>
        <JobResult
          result={{
            status: "succeeded",
            statusLabel: t("addStorage.state.succeeded"),
            message: (
              <>
                <span className="block font-semibold">
                  {t("raidDelete.doneTitle", { array: deleted.devicefile })}
                </span>
                <span className="block">
                  {t("raidDelete.doneBody", {
                    list: deleted.disks.map((d) => d.device).join(", "),
                  })}
                </span>
              </>
            ),
          }}
          dismissLabel={t("raidRemove.dismiss")}
          onDismiss={() => setDeleted(null)}
        />
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/storage/md" className={routerLinkClass}>
            {t("raidDelete.toList")}
          </Link>
          {deleted.disks.map((d) =>
            d.devicename === null ? null : (
              <Link
                key={d.device}
                to="/storage/disks/$disk"
                params={{ disk: d.devicename }}
                className={routerLinkClass}
              >
                {t("raidRemove.openDisk", { device: d.device })}
              </Link>
            ),
          )}
        </p>
      </div>
    );
  }
  if (address === null) {
    return <NotFound />;
  }
  if (v.arrays.data === undefined) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <Crumbs device={null} />
        {v.arrays.isError ? (
          <>
            <PageTitle>{t("raid.title")}</PageTitle>
            <ReadFailed
              error={v.arrays.error}
              retrying={v.arrays.isFetching}
              onRetry={() => void v.arrays.refetch()}
            >
              {t("array.loadFailed")}
            </ReadFailed>
          </>
        ) : (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t("array.loading")}</span>
            <Skeleton className="h-8 w-48" />
            <FactListSkeleton rows={4} />
          </div>
        )}
      </div>
    );
  }
  const view = v.view;
  if (view === null || row === undefined) {
    return <NotFound />;
  }

  const pending = pendingModules(info.data?.dirtyModules);
  const marked =
    pending.includes("mdadm") && memory.changed.includes(row.devicefile);
  const changing = memory.changing.includes(row.uuid);
  const key = levelKey(row.level);
  const add = addDecision(key, view.state, view.report, changing);
  const pollFailed = v.arrays.isError || v.poll.isError;
  const showNow =
    view.state.kind === "degraded" ||
    view.state.kind === "rebuilding" ||
    view.state.kind === "inactive" ||
    view.state.kind === "failed" ||
    view.state.kind === "ok";

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Crumbs device={row.devicefile} />
      {changedAlert ? (
        <InlineAlert tone="neutral" title={t("array.changed")} />
      ) : null}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <PageTitle
            documentTitle={t("array.documentTitle", { device: row.devicefile })}
          >
            {words.arrayName(row.devicefile)}
          </PageTitle>
          {marked ? <PendingMark /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("array.subtitle", {
            level: words.levelWord(row.level),
            size: words.sizeText(row.size),
          })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <RaidStateView row={row} state={view.state} />
        <p role="status" className="sr-only">
          {statusWord}
        </p>
        <ReadAtLine
          at={v.arrays.dataUpdatedAt}
          pollFailed={pollFailed}
          polling={v.busy}
          onRetry={() => void refresh()}
        />
      </div>

      {cut ? (
        <InlineAlert tone="neutral" title={t("raidDelete.unknown")} />
      ) : null}

      <div key={row.uuid} className="flex min-w-0 flex-col gap-5">
        {showNow ? (
          <ArrayNowCard
            view={view}
            disks={disks.data?.data}
            slaves={slaves.data}
            addBlocked={!add.allowed}
            onTakeOut={(member) => disksRef.current?.takeOut(member)}
            onRescan={async () => {
              try {
                await fsApi.rescan();
              } finally {
                await refresh();
              }
            }}
          />
        ) : null}
        <ArraySummary view={view} />
        <ArrayDisks
          ref={disksRef}
          view={view}
          disks={disks.data?.data}
          slaves={slaves.data}
          changing={changing}
          onChanged={() => void refresh()}
        />
        <ArrayUsedBy view={view} onRetry={() => void refresh()} />
        <ArrayAddSection view={view} changing={changing} />
        {keepsCopies(key) ? (
          <ArrayCheckSection
            view={view}
            changing={changing}
            onChanged={() => void refresh()}
          />
        ) : null}
        <ArrayDetails
          device={row.devicefile}
          detail={view.detail}
          failed={v.detail.isError}
          error={v.detail.error}
          retrying={v.detail.isFetching}
          onRetry={() => void v.detail.refetch()}
        />
        <ArrayDeleteSection
          view={view}
          disks={disks.data?.data}
          slaves={slaves.data}
          changing={changing}
          onRetry={() => void refresh()}
          onDeleted={(d) => {
            setDeleted(d);
            // The array is gone: its report and disks are not read again (they would answer 500).
            void Promise.allSettled([
              v.arrays.refetch(),
              v.configured.refetch(),
              v.detected.refetch(),
              disks.refetch(),
            ]);
          }}
          onCut={() => {
            setCut(true);
            void refresh();
          }}
        />
      </div>
    </div>
  );
}
