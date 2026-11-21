// SPDX-License-Identifier: GPL-3.0-or-later
// The start page (phase 3 design 1): is the NAS fine, and is there anything to do? For an
// administrator: the attention list, the set-up checklist while OMV's welcome flag is set, the System
// and Usage cards, and when the figures were last read. For a normal user, who gets only the time and
// the host name from the server: those two, and the way to their account. Pending changes are not
// repeated here: the band and the top bar say it.
//
// The figures come from the shell's System.getInformation poll, which is a background call (UI-14).
// A failed poll never blanks good data; "Try again" is a foreground read, because the reader asked.
//
// Phase 5 (design 1): Storage and Disk health first ("is my data safe?"), then Services and Network
// ("can my computers reach it?"), then Usage with its chart and System. Each card is its own query
// polled every 20 s in the background, so a slow one never holds up the others; Disk health is read
// only when the reader asks. All of it is for the administrator only: a normal user's dashboard makes
// none of these calls.
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
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  attentionRows,
  missingFileSystems,
  storageItems,
} from "../../dashboard/dashboard.ts";
import { diskHealth } from "../../dashboard/diskHealth.ts";
import { usageSamples } from "../../dashboard/usageSamples.ts";
import { addressIn } from "../../filesystems/fsModel.ts";
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
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { MAIN_ID } from "../../shell/ids.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AttentionList } from "../molecules/AttentionList.tsx";
import { FreshnessLine } from "../molecules/FreshnessLine.tsx";
import { SystemCard } from "../molecules/SystemCard.tsx";
import { UsageCard } from "../molecules/UsageCard.tsx";
import { DiskHealthCard } from "../organisms/DiskHealthCard.tsx";
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

function LoadFailed({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="error"
      serverMessage={
        isRpcError(error)
          ? { label: t("app.serverMessage"), text: error.message }
          : undefined
      }
      action={
        <Button variant="neutral" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      }
    >
      {t("dashboard.loadFailed")}
    </EmptyState>
  );
}

/**
 * When the checklist goes (hidden here, or by another administrator and seen on the next poll) and
 * focus was inside it, focus moves to the page title rather than being lost.
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

function AdminDashboard({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const readAgain = useReadAgain();
  const mounted = useMountedFilesystems();
  const configured = useConfiguredFilesystems();
  const services = useServiceStatus();
  const network = useNetworkInterfaces();
  const read = useForegroundRead();
  const disks = useMemoryStore(diskHealth);
  const { samples } = useMemoryStore(usageSamples);
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
        );
  const rows = attentionRows({
    info: data,
    receivedAtMs: info.dataUpdatedAt,
    storage,
    disks: disks.result
      ? { devices: disks.result.list.data, readAt: disks.result.readAt }
      : undefined,
    services: services.data?.data,
    pending,
  });
  // A card's own stale line only when the page's line does not already say it.
  const pageStale = info.isRefetchError;

  let systemRow;
  if (data === undefined && info.isError) {
    systemRow = (
      <div className="lg:col-span-2">
        <LoadFailed error={info.error} onRetry={readAgain} />
      </div>
    );
  } else if (data === undefined) {
    systemRow = (
      <div
        aria-busy="true"
        className="grid items-start gap-4 lg:col-span-2 lg:grid-cols-2"
      >
        <p role="status" className="sr-only">
          {t("dashboard.loading")}
        </p>
        <UsageCard info={undefined} />
        <SystemCard info={undefined} />
      </div>
    );
  } else {
    systemRow = (
      <>
        <UsageCard info={data} samples={samples} />
        <SystemCard info={data} />
      </>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      <AttentionList rows={rows} />
      {showChecklist && data ? (
        <SetupChecklist info={data} username={username} />
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <StorageCard
          items={storage}
          loading={mounted.isPending}
          error={mounted.error}
          stale={mounted.isRefetchError && !pageStale}
          updatedAt={mounted.dataUpdatedAt}
          retrying={mounted.isFetching}
          onRetry={() => {
            void read(
              getFileSystemMgmtEnumerateMountedFilesystemsQueryOptions(
                MOUNTED_REQUEST,
              ),
            );
            void read(getFileSystemMgmtGetListQueryOptions(ALL_CONFIGURED));
          }}
        />
        <DiskHealthCard />
        <ServicesCard
          services={services.data?.data}
          pending={pending}
          loading={services.isPending}
          error={services.error}
          stale={services.isRefetchError && !pageStale}
          updatedAt={services.dataUpdatedAt}
          retrying={services.isFetching}
          onRetry={() => void read(getServicesGetStatusQueryOptions())}
        />
        <NetworkCard
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
        {systemRow}
      </div>
      {data ? (
        <FreshnessLine
          updatedAt={info.dataUpdatedAt}
          failed={info.isRefetchError}
          retrying={info.isFetching}
          onRetry={readAgain}
        />
      ) : null}
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
  const info = useSystemInformation(role);
  const readAgain = useReadAgain();
  const titleId = useId();
  const roleWord = t(`role.${role}`);
  const data = info.data;

  let card;
  if (data === undefined && info.isError) {
    card = <LoadFailed error={info.error} onRetry={readAgain} />;
  } else {
    card = (
      <Card render={<section aria-labelledby={titleId} />}>
        <CardHeader>
          <CardTitle id={titleId}>{t("dashboard.user.title")}</CardTitle>
        </CardHeader>
        <CardContent aria-busy={data === undefined || undefined}>
          {data === undefined ? (
            <>
              <p role="status" className="sr-only">
                {t("dashboard.loading")}
              </p>
              <FactListSkeleton rows={2} />
            </>
          ) : (
            <FactList>
              <FactListItem>
                <FactListLabel>{t("dashboard.system.name")}</FactListLabel>
                <FactListValue variant="identifier">
                  {data.hostname}
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("dashboard.system.time")}</FactListLabel>
                <FactListValue>{data.time}</FactListValue>
              </FactListItem>
            </FactList>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      {card}
      <p>
        {username === null
          ? t("dashboard.signedInRole", { role: roleWord })
          : t("dashboard.signedInAs", { username, role: roleWord })}
      </p>
      <p>
        {t("dashboard.user.account")}{" "}
        <Link to="/account/settings" className="text-action-label underline">
          {t("dashboard.user.accountLink")}
        </Link>
      </p>
    </div>
  );
}
