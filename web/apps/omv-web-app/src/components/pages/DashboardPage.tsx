// SPDX-License-Identifier: GPL-3.0-or-later
// The start page (phase 3 design 1, phase 5 design 1; the redesign's dashboard spec). Is the NAS
// fine, and if not, what needs the reader? For an administrator, in this order, which is also the
// reading and focus order at every width (no grid placement reorders it):
//
//   1. the answer: a plain headline beside the health ring of Storage, Disks, Services and System;
//   2. what needs the reader: one action card per attention row, worst first;
//   3. capacity (Storage), 4. live activity (Right now), 5. the disks (the drive bay and the check),
//   6. first steps while OMV's welcome flag is set, 7. Services, Network and System.
//
// Pending changes are not repeated here: the band and the top bar say it, and a second Apply could
// disagree with the first. A normal user, who gets only the time and the host name from the server,
// sees those two and the way to their account, and the page makes none of the administrator's reads
// (no storage, services, network, disks, live samples or chart chunk).
//
// The figures come from the shell's System.getInformation poll, a background call (UI-14). A failed
// poll never blanks good data; "Try again" is a foreground read, because the reader asked. Each card
// is its own query, so a slow one never holds up the others; disk health is read only when the reader
// asks. Fail closed: a read that failed or has not arrived can only make the answer worse, never
// "Everything is OK" (dashboard/dashboard.ts, healthAreas).
import type {
  Role,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import {
  getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions,
  getFileSystemMgmtGetListQueryOptions,
  getNetworkEnumerateDevicesListQueryOptions,
  getServicesGetStatusQueryOptions,
  getSystemGetInformationQueryOptions,
  getZfsGetPoolStatusQueryOptions,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardChevron,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
  PageAnswer,
  PageAnswerBody,
  PageAnswerDescription,
  PageAnswerHeadline,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  attentionRows,
  dashboardAnswer,
  healthAreas,
  missingFileSystems,
  storageItems,
  type AreaInput,
} from "../../dashboard/dashboard.ts";
import { addressIn } from "../../filesystems/fsModel.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  ALL_CONFIGURED,
  ALL_INTERFACES,
  MOUNTED_REQUEST,
  useConfiguredFilesystems,
  useForegroundRead,
  useMountedFilesystems,
  useNetworkInterfaces,
  useServiceStatus,
} from "../../hooks/useMonitoringReads.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useZfsPlugin, useZfsPoolHealth } from "../../hooks/useZfsReads.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { MAIN_ID } from "../../shell/ids.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AttentionList } from "../molecules/AttentionList.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { SystemCard } from "../molecules/SystemCard.tsx";
import { DashboardHero } from "../organisms/DashboardHero.tsx";
import { DisksCard } from "../organisms/DisksCard.tsx";
import { LiveCard } from "../organisms/LiveCard.tsx";
import { NetworkCard } from "../organisms/NetworkCard.tsx";
import { ServicesCard } from "../organisms/ServicesCard.tsx";
import { SetupChecklist } from "../organisms/SetupChecklist.tsx";
import { StorageCard } from "../organisms/StorageCard.tsx";

export function DashboardPage() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return session.role === "admin" ? (
    <AdminDashboard username={session.username} />
  ) : (
    <UserDashboard username={session.username} role={session.role} />
  );
}

/** A foreground read of System.getInformation, for "Try again". */
function useReadAgain() {
  const queryClient = useQueryClient();
  return () => {
    queryClient
      .fetchQuery({ ...getSystemGetInformationQueryOptions(), staleTime: 0 })
      .catch(() => undefined);
  };
}

/**
 * When the first steps go (hidden here, or by another administrator and seen on the next poll) and
 * focus was inside them, focus moves to the page title rather than being lost.
 */
function useFocusTitleWhenGone(visible: boolean) {
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      const id = window.setTimeout(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          document.querySelector<HTMLElement>(`#${MAIN_ID} h1`)?.focus();
        }
      }, 0);
      wasVisibleRef.current = visible;
      return () => window.clearTimeout(id);
    }
    wasVisibleRef.current = visible;
    return undefined;
  }, [visible]);
}

/**
 * The page grid (spec 3.1): one column on a narrow page, twelve from 600px of content, and the wide
 * spans from 880px. The page's own width decides, not the window's, since the sidebar takes its
 * share. Under the answer, two stacks that each keep their own height, so a tall card on one side
 * never leaves a hole on the other: capacity and the disks on the left (is my data safe?), live
 * activity and the first steps, or the services, on the right. Then the rest in one row. Nothing is
 * reordered by placement: the reading order is the DOM order.
 */
const PAGE_GRID =
  "grid grid-cols-1 items-start gap-gutter @min-[37.5rem]/dash:grid-cols-12";
const STACK = {
  left: "col-span-full flex min-w-0 flex-col gap-gutter @min-[55rem]/dash:col-span-7",
  right:
    "col-span-full flex min-w-0 flex-col gap-gutter @min-[55rem]/dash:col-span-5",
} as const;
const SPAN = {
  withSteps: {
    services: "@min-[37.5rem]/dash:col-span-6 @min-[55rem]/dash:col-span-4",
    network: "@min-[37.5rem]/dash:col-span-6 @min-[55rem]/dash:col-span-4",
    system: "@min-[37.5rem]/dash:col-span-12 @min-[55rem]/dash:col-span-4",
  },
  withoutSteps: {
    services: undefined,
    network: "@min-[37.5rem]/dash:col-span-6",
    system: "@min-[37.5rem]/dash:col-span-6",
  },
} as const;

function AdminDashboard({ username }: { username: string | null }) {
  const info = useSystemInformation();
  const readAgain = useReadAgain();
  const mounted = useMountedFilesystems();
  const configured = useConfiguredFilesystems();
  const services = useServiceStatus();
  const network = useNetworkInterfaces();
  const read = useForegroundRead();
  const check = useDiskCheck();
  const zfsPlugin = useZfsPlugin(true);
  const zfsPools = useZfsPoolHealth(zfsPlugin === "installed");
  const data: SystemInformation | undefined = info.data;
  const showChecklist = data?.displayWelcomeMessage === true;
  useFocusTitleWhenGone(showChecklist);

  const pending = pendingModules(data?.dirtyModules);
  const storage =
    mounted.data === undefined
      ? undefined
      : storageItems(
          mounted.data,
          missingFileSystems(configured.data?.data ?? []),
          (fs) => addressIn(configured.data?.data ?? [], fs),
          zfsPlugin === "installed",
        );
  const result = check.result;
  const rows = attentionRows({
    info: data,
    receivedAtMs: info.dataUpdatedAt,
    storage,
    disks: result
      ? { devices: result.list.data, readAt: result.readAt }
      : undefined,
    services: services.data?.data,
    pending,
    pools: zfsPools.data,
  });

  const failedRead = (q: { isError: boolean; data: unknown }) =>
    q.isError && q.data === undefined;
  const poolsState: AreaInput["pools"]["state"] =
    zfsPlugin === "missing"
      ? "none"
      : zfsPlugin === "checking"
        ? "checking"
        : failedRead(zfsPools)
          ? "failed"
          : zfsPools.data === undefined
            ? "checking"
            : "read";
  const areas = healthAreas({
    storage: { data: storage, failed: failedRead(mounted) },
    configured: {
      pending: configured.data === undefined && !configured.isError,
      failed: failedRead(configured),
    },
    pools: { state: poolsState, list: zfsPools.data ?? [] },
    disks: {
      checking: check.checking,
      failed: check.failed && result === undefined,
      devices: result?.list.data,
    },
    services: {
      data: services.data?.data,
      failed: failedRead(services),
      pending,
    },
    system: { data, failed: failedRead(info) },
  });
  const answer = dashboardAnswer({
    loading:
      data === undefined &&
      !info.isError &&
      mounted.data === undefined &&
      !mounted.isError,
    areas,
    rows,
    disksReadAt: result?.readAt,
  });

  const readStorage = () => {
    void read(
      getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions(MOUNTED_REQUEST),
    );
    void read(getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED));
  };
  const readServices = () => void read(getServicesGetStatusQueryOptions());
  // The answer's "Try again": every read that failed with nothing to show, in the foreground. A
  // failed disk check is started again: the reader asked for it before, and asks again here.
  const readFailed = () => {
    if (failedRead(info)) {
      readAgain();
    }
    if (failedRead(mounted) || failedRead(configured)) {
      readStorage();
    }
    if (failedRead(services)) {
      readServices();
    }
    if (poolsState === "failed") {
      void read({ ...getZfsGetPoolStatusQueryOptions(), retry: false });
    }
    if (areas.some((a) => a.id === "disks" && a.word === "readFailed")) {
      check.start();
    }
  };
  // A card's own stale line only when the answer's kicker does not already say it.
  const pageStale = info.isRefetchError;
  const span = showChecklist ? SPAN.withSteps : SPAN.withoutSteps;
  // Services: under the first steps' row when they show, else at the foot of the right-hand stack.
  const servicesCard = (className: string | undefined) => (
    <ServicesCard
      className={className}
      index={4}
      services={services.data?.data}
      pending={pending}
      loading={services.isPending}
      error={services.error}
      stale={services.isRefetchError && !pageStale}
      updatedAt={services.dataUpdatedAt}
      retrying={services.isFetching}
      onRetry={readServices}
    />
  );

  return (
    <div className="@container/dash">
      <div className={PAGE_GRID}>
        <DashboardHero
          answer={answer}
          areas={areas}
          hostname={data?.hostname}
          updatedAt={data === undefined ? 0 : info.dataUpdatedAt}
          stale={info.isRefetchError}
          retrying={info.isFetching}
          onRetry={readAgain}
          onReadAgain={readFailed}
          readingAgain={
            info.isFetching ||
            mounted.isFetching ||
            configured.isFetching ||
            services.isFetching ||
            check.checking
          }
        />
        <div className="col-span-full empty:hidden">
          <AttentionList rows={rows} />
        </div>
        <div className={STACK.left}>
          <StorageCard
            index={0}
            items={storage}
            loading={mounted.isPending}
            error={mounted.error}
            stale={mounted.isRefetchError && !pageStale}
            updatedAt={mounted.dataUpdatedAt}
            retrying={mounted.isFetching}
            onRetry={readStorage}
          />
          <DisksCard index={2} hostname={data?.hostname} />
        </div>
        <div className={STACK.right}>
          <LiveCard
            index={1}
            info={data}
            stale={info.isRefetchError}
            updatedAt={info.dataUpdatedAt}
            devices={network.data?.data}
          />
          {showChecklist ? (
            <SetupChecklist index={3} info={data} username={username} />
          ) : (
            servicesCard(undefined)
          )}
        </div>
        {showChecklist ? servicesCard(SPAN.withSteps.services) : null}
        <NetworkCard
          className={span.network}
          index={5}
          devices={network.data?.data}
          loading={network.isPending}
          error={network.error}
          stale={network.isRefetchError && !pageStale}
          updatedAt={network.dataUpdatedAt}
          retrying={network.isFetching}
          onRetry={() =>
            void read(
              getNetworkEnumerateDevicesListQueryOptions(ALL_INTERFACES),
            )
          }
        />
        <SystemCard
          className={span.system}
          index={6}
          info={data}
          error={data === undefined && info.isError ? info.error : undefined}
          retrying={info.isFetching}
          onRetry={readAgain}
        />
      </div>
    </div>
  );
}

function UserDashboard({
  username,
  role,
}: {
  username: string | null;
  role: Role;
}) {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const readAgain = useReadAgain();
  const titleId = useId();
  const accountTitleId = useId();
  const accountBodyId = useId();
  const roleWord = t(`role.${role}`);
  const data = info.data;

  let facts;
  if (data === undefined && info.isError) {
    facts = (
      <EmptyState
        variant="error"
        className="py-4"
        serverMessage={
          isRpcError(info.error)
            ? { label: t("app.serverMessage"), text: info.error.message }
            : undefined
        }
        action={
          <Button
            variant="neutral"
            loading={info.isFetching}
            onClick={readAgain}
          >
            {t("common.tryAgain")}
          </Button>
        }
      >
        {t("dashboard.loadFailed")}
      </EmptyState>
    );
  } else if (data === undefined) {
    facts = <FactListSkeleton rows={2} />;
  } else {
    facts = (
      <FactList>
        <FactListItem>
          <FactListLabel>{t("dashboard.system.name")}</FactListLabel>
          <FactListValue variant="identifier">{data.hostname}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("dashboard.system.time")}</FactListLabel>
          <FactListValue>{data.time}</FactListValue>
        </FactListItem>
      </FactList>
    );
  }

  return (
    <div className="@container/dash">
      <div className="grid grid-cols-1 items-start gap-gutter @min-[37.5rem]/dash:grid-cols-2">
        <PageAnswer aria-labelledby={titleId} className="col-span-full">
          <PageAnswerBody>
            <PageTitle id={titleId} variant="eyebrow">
              {t("dashboard.title")}
            </PageTitle>
            <PageAnswerHeadline>
              {username === null
                ? t("dashboard.user.headlineNoName")
                : t("dashboard.user.headline", { username })}
            </PageAnswerHeadline>
            <PageAnswerDescription>
              {username === null
                ? t("dashboard.signedInRole", { role: roleWord })
                : t("dashboard.signedInAs", { username, role: roleWord })}
            </PageAnswerDescription>
          </PageAnswerBody>
        </PageAnswer>
        <Card
          variant="action"
          render={<Link to="/account/settings" />}
          aria-labelledby={accountTitleId}
          aria-describedby={accountBodyId}
        >
          <CardHeader className="items-center">
            <CardTitle id={accountTitleId}>
              {t("dashboard.user.accountTitle")}
            </CardTitle>
            <CardChevron />
          </CardHeader>
          <CardContent>
            <p id={accountBodyId} className="text-muted-foreground">
              {t("dashboard.user.accountBody")}
            </p>
          </CardContent>
        </Card>
        <DashboardCard
          title={t("dashboard.user.title")}
          busy={data === undefined && !info.isError}
          busyLabel={t("dashboard.loading")}
        >
          {facts}
        </DashboardCard>
      </div>
    </div>
  );
}
