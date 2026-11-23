// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Services (phase 5 design 4), for administrators: what SMB/CIFS, NFS and SSH are doing
// right now. Three static routes, one per tab (UI-4), linked by PageTabs. The status beside the heading
// is the dashboard's Services.getStatus (polled in the background) with the pending check first. The
// output is a snapshot read when the tab opens and on Refresh, never polled (D13): a block that
// changes under a selection loses it. Before reading, the page checks what it already knows, so it
// does not ask for an output that cannot come: nothing is called while the module is pending or the
// service is off. Output is shown as text on the terminal pair, unwrapped (D14).
import type { ServiceStatus } from "@omv-webui/react-api-omv/generated";
import {
  getNfsGetStatsQueryOptions,
  getSmbGetStatsQueryOptions,
  getSshGetStatsQueryOptions,
  useNfsGetStats,
  useSmbGetStats,
  useSshGetStats,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  EmptyState,
  InlineAlert,
  PageTab,
  PageTabs,
  Skeleton,
  StatusPill,
  TaskLog,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import {
  useForegroundRead,
  useServiceStatus,
} from "../../hooks/useMonitoringReads.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

type ServiceTab = "smb" | "nfs" | "ssh";
const TABS: readonly ServiceTab[] = ["smb", "nfs", "ssh"];

/** The OMV module behind each tab, as Services.getStatus and `dirtyModules` name it. */
const MODULE: Record<ServiceTab, string> = {
  smb: "samba",
  nfs: "nfs",
  ssh: "ssh",
};

const TAB_ROUTE = {
  smb: "/diagnostics/services/smb",
  nfs: "/diagnostics/services/nfs",
  ssh: "/diagnostics/services/ssh",
} as const;

const routerLinkClass =
  "rounded-sm text-action-label underline underline-offset-2 hover:no-underline";

export function ServiceDetailsPage({ tab }: { tab: ServiceTab }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("serviceDetails.title")} />;
  }
  return <ServiceDetails tab={tab} />;
}

/** The three tabs, each a route's page. */
export const SmbDetailsPage = () => <ServiceDetailsPage tab="smb" />;
export const NfsDetailsPage = () => <ServiceDetailsPage tab="nfs" />;
export const SshDetailsPage = () => <ServiceDetailsPage tab="ssh" />;

function SettingsLink({ tab }: { tab: ServiceTab }) {
  const { t } = useTranslation();
  if (tab === "ssh") {
    return (
      <Link to="/services/ssh" className={routerLinkClass}>
        {t("serviceDetails.link.ssh")}
      </Link>
    );
  }
  if (tab === "smb") {
    // Windows and Mac sharing has its page here now (shares design 9.3); its footer has the classic one.
    return (
      <Link to="/services/smb" className={routerLinkClass}>
        {t("serviceDetails.link.smbPage")}
      </Link>
    );
  }
  // Linux and Unix sharing has its page here now (services design 12.3); its footer has the classic one.
  return (
    <Link to="/services/nfs" className={routerLinkClass}>
      {t("serviceDetails.link.nfsPage")}
    </Link>
  );
}

/** The output read of a tab: only the chosen tab's method, and only when `enabled`. */
function useStats(tab: ServiceTab, enabled: boolean, background: boolean) {
  const options = (mine: boolean) => ({
    request: { background },
    query: {
      enabled: enabled && mine,
      // Read when the tab opens, and on Refresh; never on a timer, focus or reconnect.
      refetchOnMount: "always" as const,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  });
  const smb = useSmbGetStats(options(tab === "smb"));
  const nfs = useNfsGetStats(options(tab === "nfs"));
  const ssh = useSshGetStats(options(tab === "ssh"));
  return tab === "smb" ? smb : tab === "nfs" ? nfs : ssh;
}

const statsOptions = (tab: ServiceTab) =>
  tab === "smb"
    ? getSmbGetStatsQueryOptions()
    : tab === "nfs"
      ? getNfsGetStatsQueryOptions()
      : getSshGetStatsQueryOptions();

function StatusBeside({
  service,
  pending,
  known,
}: {
  service: ServiceStatus | undefined;
  pending: boolean;
  known: boolean;
}) {
  const { t } = useTranslation();
  if (pending) {
    return (
      <>
        <PendingMark />
        <span className="text-sm">{t("serviceDetails.pendingReason")}</span>
      </>
    );
  }
  if (!known) {
    return <Skeleton shape="block" className="h-5.5 w-16 rounded-full" />;
  }
  if (service === undefined) {
    return null;
  }
  if (!service.enabled) {
    return (
      <>
        <StatusPill status="disabled">{t("health.disabled")}</StatusPill>
        <span className="text-sm">{t("serviceDetails.off")}</span>
      </>
    );
  }
  return service.running ? (
    <>
      <StatusPill status="ok">{t("health.ok")}</StatusPill>
      <span className="text-sm">{t("serviceDetails.running")}</span>
    </>
  ) : (
    <>
      <StatusPill status="critical">{t("health.critical")}</StatusPill>
      <span className="text-sm">{t("serviceDetails.notRunning")}</span>
    </>
  );
}

function ServiceDetails({ tab }: { tab: ServiceTab }) {
  const { t } = useTranslation();
  const format = useFormat();
  const read = useForegroundRead();
  const headingId = useId();
  const info = useSystemInformation("admin");
  const status = useServiceStatus();
  const name = t(`serviceDetails.name.${tab}`);
  const module = MODULE[tab];
  const service = status.data?.data.find((s) => s.name === module);
  const pending = pendingModules(info.data?.dirtyModules).includes(module);
  const off = service !== undefined && !service.enabled;
  const statusKnown = status.data !== undefined;
  // A failed status read leaves the output to be read anyway: the server's reply says if it is off.
  const mayRead = !pending && !off && (statusKnown || status.isError);

  // Once the module has been pending on this page, the read that follows its apply is the page's own,
  // so it is a background read (design 4.5).
  const [sawPending, setSawPending] = useState(pending);
  if (pending && !sawPending) {
    setSawPending(true);
  }
  const stats = useStats(tab, mayRead, sawPending);
  const refresh = () => void read(statsOptions(tab));

  let output;
  if (pending) {
    output = (
      <InlineAlert tone="neutral" role="note">
        <p className="flex flex-wrap items-center gap-2">
          <PendingMark />
          <span>{t("serviceDetails.pending", { service: name })}</span>
        </p>
      </InlineAlert>
    );
  } else if (off) {
    output = (
      <EmptyState action={<SettingsLink tab={tab} />}>
        {t("serviceDetails.disabled", { service: name })}
      </EmptyState>
    );
  } else if (stats.data === undefined && stats.isError) {
    output = (
      <ReadFailed
        error={stats.error}
        onRetry={refresh}
        retrying={stats.isFetching}
      >
        {t("serviceDetails.loadFailed", { service: name })}
      </ReadFailed>
    );
  } else if (stats.data === undefined) {
    output = (
      <div
        aria-busy="true"
        className="flex flex-col gap-2 rounded-card bg-terminal p-3.5"
      >
        <p role="status" className="sr-only">
          {t("serviceDetails.reading", { service: name })}
        </p>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`block h-3 rounded-sm bg-terminal-muted/30 motion-safe:animate-pulse ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`}
          />
        ))}
      </div>
    );
  } else if (stats.data.trim() === "") {
    output = (
      <p className="text-sm">
        {tab === "nfs"
          ? t("serviceDetails.emptyNfs")
          : t("serviceDetails.emptyConnections")}
      </p>
    );
  } else {
    output = (
      <TaskLog
        lines={stats.data.split("\n")}
        label={t("serviceDetails.outputLabel", { service: name })}
        copyLabel={t("serviceDetails.copy")}
        copiedLabel={t("serviceDetails.copied")}
        selectedLabel={t("serviceDetails.selected")}
        wrap={false}
        size="page"
        follow={false}
        busy={stats.isFetching}
      />
    );
  }

  const showRead = !pending && !off && stats.data !== undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle
        documentTitle={t("serviceDetails.documentTitle", { tab: name })}
      >
        {t("serviceDetails.title")}
      </PageTitle>
      <p className="max-w-prose">{t("serviceDetails.intro")}</p>
      <PageTabs aria-label={t("serviceDetails.tabs")}>
        {TABS.map((each) => (
          <PageTab
            key={each}
            current={each === tab}
            render={<Link to={TAB_ROUTE[each]} />}
          >
            {t(`serviceDetails.name.${each}`)}
          </PageTab>
        ))}
      </PageTabs>

      <section
        aria-labelledby={headingId}
        className="flex min-w-0 flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-lg font-semibold">
            {name}
          </h2>
          <StatusBeside
            service={service}
            pending={pending}
            known={statusKnown}
          />
        </div>
        {status.data === undefined && status.isError ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t("serviceDetails.statusFailed", { service: name })}
            <Button
              variant="neutral"
              size="sm"
              loading={status.isFetching}
              onClick={() => void status.refetch()}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        ) : null}
        <p className="max-w-prose">{t(`serviceDetails.what.${tab}`)}</p>
        {output}
        {showRead ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              role="status"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {t("serviceDetails.readAt", {
                time: format.clock(stats.dataUpdatedAt),
              })}
            </p>
            <Button
              variant="neutral"
              size="sm"
              loading={stats.isFetching}
              onClick={stats.isFetching ? undefined : refresh}
            >
              {stats.isFetching
                ? t("serviceDetails.refreshing")
                : t("serviceDetails.refresh")}
            </Button>
          </div>
        ) : null}
        {off ? null : (
          // When the service is off, the link is the empty state's own action: shown once.
          <p className="text-sm">
            <SettingsLink tab={tab} />
          </p>
        )}
      </section>
    </div>
  );
}
