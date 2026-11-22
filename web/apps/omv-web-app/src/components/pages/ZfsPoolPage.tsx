// SPDX-License-Identifier: GPL-3.0-or-later
// A pool's page (phase 5 ZFS design 2), for administrators: is this pool healthy, which disks is it
// made of and what is each doing, how full is it, and what is stored on it? Addressed by the pool's
// name, validated in the route; the row is found in Zfs.listPools and every later call uses its fields
// (UI-4). ZFS's report gives each disk's role and getPoolDevices its path. While a check or a rebuild
// runs, the list, the report and the devices are read again every 30 seconds in the background (P13).
// When the pool under this name is no longer the one first shown (none of its disks the same), the page
// says so. A normal user gets the "only administrators" page, and nothing is called first.
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
import { useConfiguredFs, useDiskList } from "../../hooks/useDiskReads.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useAllShares } from "../../hooks/useFsReads.ts";
import { useZfsPoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deleteRunOf, zfsActions } from "../../zfs/zfsActions.ts";
import { addFsBlocker, samePoolDisks } from "../../zfs/zfsModel.ts";
import { zfsSession } from "../../zfs/zfsSession.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { ZfsStateView } from "../molecules/ZfsStateView.tsx";
import {
  ZfsCheckSection,
  type ZfsCheckHandle,
} from "../organisms/ZfsCheckSection.tsx";
import { ZfsDetails } from "../organisms/ZfsDetails.tsx";
import { ZfsNowCard } from "../organisms/ZfsNowCard.tsx";
import {
  ZfsPoolDeleteRun,
  ZfsPoolDeleteSection,
  type DeletedPool,
} from "../organisms/ZfsPoolDeleteSection.tsx";
import {
  ZfsPoolDisks,
  type ZfsDisksHandle,
} from "../organisms/ZfsPoolDisks.tsx";
import { ZfsPoolFileSystems } from "../organisms/ZfsPoolFileSystems.tsx";
import { ZfsPoolSummary } from "../organisms/ZfsPoolSummary.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ZfsReadAt } from "./ZfsPage.tsx";

export function ZfsPoolRoutePage() {
  const { pool } = useParams({ from: "/_signedIn/storage/zfs/pools/$pool/" });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return <ZfsPool address={pool} />;
}

export function ZfsCrumbs({
  pool,
  current,
}: {
  pool: string | null;
  /** The last crumb, the current page; the pool is then a link. */
  current?: string;
}) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/storage/zfs" />}>
        {t("zfsPool.breadcrumb")}
      </BreadcrumbItem>
      {pool === null ? null : current === undefined ? (
        <BreadcrumbItem current>{pool}</BreadcrumbItem>
      ) : (
        <BreadcrumbItem
          render={<Link to="/storage/zfs/pools/$pool" params={{ pool }} />}
        >
          {pool}
        </BreadcrumbItem>
      )}
      {current === undefined ? null : (
        <BreadcrumbItem current>{current}</BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ZfsCrumbs pool={null} />
      <PageTitle>{t("zfs.title")}</PageTitle>
      <EmptyState
        action={
          <Link to="/storage/zfs" className={routerLinkClass}>
            {t("zfsPool.showAll")}
          </Link>
        }
      >
        {t("zfsPool.notFound")}
      </EmptyState>
    </div>
  );
}

function ZfsPool({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const fsApi = useFsApi();
  const v = useZfsPoolView(address);
  const omvDisks = useDiskList();
  const configured = useConfiguredFs();
  const shares = useAllShares(v.view !== null);
  const memory = useMemoryStore(zfsSession);
  useMemoryStore(zfsActions);
  const disksRef = useRef<ZfsDisksHandle>(null);
  const checkRef = useRef<ZfsCheckHandle>(null);
  const [deleted, setDeleted] = useState<DeletedPool | null>(null);
  const [cut, setCut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The pool this page first showed, by its disks (2.9).
  const paths = v.devices.data?.map((d) => d.devicefile) ?? null;
  const [seen, setSeen] = useState<readonly string[] | null>(null);
  const [changedAlert, setChangedAlert] = useState(false);
  if (paths !== null && paths.length > 0 && seen === null) {
    setSeen(paths);
  } else if (
    paths !== null &&
    paths.length > 0 &&
    seen !== null &&
    !samePoolDisks(seen, paths)
  ) {
    setSeen(paths);
    setChangedAlert(true);
  }

  const refresh = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await Promise.allSettled([
        v.list.refetch(),
        v.report?.refetch(),
        v.devices.refetch(),
        omvDisks.refetch(),
        configured.refetch(),
        shares.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (v.missing) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <PageTitle>{t("zfs.title")}</PageTitle>
        <ZfsNotInstalled />
      </div>
    );
  }
  if (deleted !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={null} />
        <PageTitle>{t("zfs.title")}</PageTitle>
        <JobResult
          result={{
            status: "succeeded",
            statusLabel: t("addStorage.state.succeeded"),
            message: (
              <>
                <span className="block font-semibold">
                  {t("zfsDelete.pool.doneTitle", { pool: deleted.pool })}
                </span>
                <span className="block">
                  {t("zfsDelete.pool.doneBody", {
                    list: deleted.disks.map((d) => d.device).join(", "),
                  })}
                </span>
              </>
            ),
          }}
          dismissLabel={t("zfsDelete.dismiss")}
          onDismiss={() => setDeleted(null)}
        />
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link to="/storage/zfs" className={routerLinkClass}>
            {t("zfsDelete.pool.toList")}
          </Link>
          {deleted.disks.map((d) =>
            d.devicename === null ? null : (
              <Link
                key={d.device}
                to="/storage/disks/$disk"
                params={{ disk: d.devicename }}
                className={routerLinkClass}
              >
                {t("zfsDelete.pool.openDisk", { device: d.device })}
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
  const deleting = deleteRunOf(address);
  if (deleting !== undefined && (v.rows === undefined || v.view === null)) {
    // The pool is gone from the list while its deletion's run lasts: its dialog stays (9.2).
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={address} />
        <PageTitle>{t("zfs.title")}</PageTitle>
        <ZfsPoolDeleteRun
          pool={address}
          onDeleted={(d) => {
            if (d === null) {
              setCut(true);
            } else {
              setDeleted(d);
            }
          }}
        />
      </div>
    );
  }
  if (v.rows === undefined) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <ZfsCrumbs pool={null} />
        {v.list.isError ? (
          <>
            <PageTitle>{t("zfs.title")}</PageTitle>
            <ReadFailed
              error={v.list.error}
              retrying={v.list.isFetching}
              onRetry={() => void v.list.refetch()}
            >
              {t("zfsPool.loadFailed")}
            </ReadFailed>
          </>
        ) : (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t("zfsPool.loading")}</span>
            <Skeleton className="h-8 w-48" />
            <FactListSkeleton rows={4} />
          </div>
        )}
      </div>
    );
  }
  const view = v.view;
  if (view === null) {
    return <NotFound />;
  }
  const pool = view.row.path;
  const changing = memory.changing.includes(pool);
  const pollFailed = v.list.isError || v.poll.isError;
  const statusWord = words.statusWord(view.state.status);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ZfsCrumbs pool={pool} />
      {changedAlert ? (
        <InlineAlert tone="neutral" title={t("zfsPool.changed")} />
      ) : null}
      <div className="flex flex-col gap-1">
        <PageTitle documentTitle={t("zfsPool.documentTitle", { pool })}>
          {t("zfsPool.title", { pool })}
        </PageTitle>
        <p className="text-sm text-muted-foreground">
          {t("zfsPool.subtitle", {
            layout: words.poolLayout(view.report),
            space: words.spaceText(view.root),
          })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {view.reportRead === "loading" ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <ZfsStateView state={view.state} report={view.report} />
        )}
        <p role="status" className="sr-only">
          {view.reportRead === "loading" ? "" : statusWord}
        </p>
        <ZfsReadAt
          at={v.list.dataUpdatedAt}
          pollFailed={pollFailed}
          polling={v.busy}
          onRetry={() => void refresh()}
        />
      </div>

      {cut ? (
        <InlineAlert
          tone="neutral"
          title={t("zfsDelete.pool.unknown", { pool })}
        />
      ) : null}

      <div key={pool} className="flex min-w-0 flex-col gap-5">
        <ZfsNowCard
          view={view}
          disks={v.disks}
          omvDisks={omvDisks.data?.data}
          changing={changing}
          disksRef={disksRef}
          checkRef={checkRef}
          detailsId="zfs-details"
          onRescan={async () => {
            try {
              await fsApi.rescan();
            } finally {
              await refresh();
            }
          }}
          onChanged={() => void refresh()}
        />
        <ZfsPoolSummary view={view} />
        <ZfsPoolDisks
          view={view}
          disks={v.disks}
          omvDisks={omvDisks.data?.data}
          changing={changing}
          onChanged={() => void refresh()}
          handle={disksRef}
        />
        <ZfsPoolFileSystems
          pool={pool}
          rows={v.rows}
          shares={shares.data?.data}
          addBlocker={addFsBlocker(view.state, view.row.capacity, changing)}
        />
        <ZfsCheckSection
          view={view}
          changing={changing}
          onChanged={() => void refresh()}
          handle={checkRef}
        />
        <ZfsDetails
          label={t("zfsPool.details.label", { pool })}
          intro={t("zfsPool.details.intro")}
          text={view.text}
          failed={view.reportRead === "failed"}
          error={v.report?.error}
          retrying={v.report?.isFetching ?? false}
          onRetry={() => void v.report?.refetch()}
        />
        <ZfsPoolDeleteSection
          view={view}
          rows={v.rows}
          disks={v.disks}
          omvDisks={omvDisks.data?.data}
          configured={{
            data: configured.data?.data,
            failed: configured.isError,
            error: configured.error,
          }}
          shares={{
            data: shares.data?.data,
            failed: shares.isError,
            error: shares.error,
          }}
          changing={changing}
          onRetry={() => void refresh()}
          onDeleted={(d) => {
            if (d === null) {
              setCut(true);
              void refresh();
              return;
            }
            setDeleted(d);
            void Promise.allSettled([
              v.list.refetch(),
              omvDisks.refetch(),
              configured.refetch(),
            ]);
          }}
        />
      </div>
    </div>
  );
}
