// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's Services card (phase 5 design 1.4): the services that are on, worst first, and one
// line for the ones that are off. The pending check comes first: `enabled` is the saved setting, so
// a service just turned on and saved is "Not applied yet", not "on, but not running". Titles come
// translated from the server and are shown as text. The SMB row's name leads to the Windows and Mac
// sharing page (shares design 9.2), the NFS row's to Linux and Unix sharing and the rsync server's to
// its tab (services design 12.2).
import type { ServiceStatus } from "@omv-webui/react-api-omv/generated";
import {
  EmptyState,
  HealthList,
  HealthListItem,
  HealthListSkeleton,
  rollUp,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { serviceSummary } from "../../dashboard/dashboard.ts";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { CardStaleLine } from "../molecules/CardStaleLine.tsx";
import { DashboardCard } from "../molecules/DashboardCard.tsx";
import { ListOf } from "../molecules/ListOf.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

/** The services whose row's name leads to their page here (shares design 9.2, services 12.2). */
const SERVICE_PAGES = {
  samba: "/services/smb",
  nfs: "/services/nfs",
  rsyncd: "/services/rsync/server",
} as const;

const pageOf = (name: string) =>
  Object.hasOwn(SERVICE_PAGES, name)
    ? SERVICE_PAGES[name as keyof typeof SERVICE_PAGES]
    : undefined;

function ServiceName({ service }: { service: ServiceStatus }) {
  const page = pageOf(service.name);
  return page !== undefined ? (
    <Link
      to={page}
      className="text-action-label underline underline-offset-2 hover:no-underline"
    >
      <span dir="auto">{service.title}</span>
    </Link>
  ) : (
    <>{service.title}</>
  );
}

export function ServicesCard({
  services,
  pending,
  loading,
  error,
  stale,
  updatedAt,
  retrying,
  onRetry,
}: {
  services: readonly ServiceStatus[] | undefined;
  /** The pending module ids. */
  pending: readonly string[];
  loading: boolean;
  error: unknown;
  stale: boolean;
  updatedAt: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const footer = (
    <Link
      to="/diagnostics/services"
      className="text-action-label underline underline-offset-2 hover:no-underline"
    >
      {t("dashboard.services.link")}
    </Link>
  );

  let content;
  if (services === undefined && loading) {
    content = <HealthListSkeleton rows={3} />;
  } else if (services === undefined) {
    content = (
      <ReadFailed
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        className="py-4"
      >
        {t("dashboard.services.loadFailed")}
      </ReadFailed>
    );
  } else if (services.length === 0) {
    content = (
      <EmptyState className="py-4">
        {t("dashboard.services.noneReported")}
      </EmptyState>
    );
  } else {
    const { on, off } = serviceSummary(services, pending);
    const settled = on.filter((s) => s.state !== "pending");
    const summary = rollUp(
      settled.map((s) => (s.state === "critical" ? "critical" : "ok")),
    );
    const offLine =
      off.length > 0 ? (
        <p className="text-sm">
          <Trans
            i18nKey="dashboard.services.off"
            components={{
              list: (
                <ListOf
                  items={off.map(({ service, running, pending: waiting }) => ({
                    key: service.name,
                    text: running
                      ? t("dashboard.services.stillRunning", {
                          title: service.title,
                        })
                      : service.title,
                    content:
                      pageOf(service.name) !== undefined && !running ? (
                        <ServiceName service={service} />
                      ) : undefined,
                    after: waiting ? (
                      <>
                        {" "}
                        <PendingMark />
                      </>
                    ) : undefined,
                  }))}
                />
              ),
            }}
          />
        </p>
      ) : null;
    content =
      on.length === 0 ? (
        <>
          <EmptyState className="py-4">
            {t("dashboard.services.noneOn")}
          </EmptyState>
          {offLine}
        </>
      ) : (
        <>
          {summary.status === "critical" ? (
            <p className="flex flex-wrap items-center gap-2">
              <StatusPill status="critical">{t("health.critical")}</StatusPill>
              <span>
                {t("dashboard.services.rollUp", {
                  count: summary.count,
                  total: on.length,
                  status: t("health.critical"),
                })}
              </span>
            </p>
          ) : summary.status === "ok" ? (
            <p className="flex flex-wrap items-center gap-2">
              <StatusPill status="ok">{t("health.ok")}</StatusPill>
              <span>
                {t("dashboard.services.allOk", { count: summary.total })}
              </span>
            </p>
          ) : null}
          <HealthList aria-label={t("dashboard.services.listLabel")}>
            {on.map(({ service, state }) => (
              <HealthListItem
                key={service.name}
                status={state}
                statusLabel={
                  state === "pending"
                    ? t("pending.itemMark")
                    : t(`health.${state}`)
                }
                name={<ServiceName service={service} />}
                reason={
                  state === "pending"
                    ? t("dashboard.services.pending")
                    : state === "critical"
                      ? t("dashboard.services.notRunning")
                      : undefined
                }
              />
            ))}
          </HealthList>
          {offLine}
        </>
      );
  }

  return (
    <DashboardCard
      title={t("dashboard.services.title")}
      busy={services === undefined && loading}
      busyLabel={t("dashboard.services.loading")}
      footer={footer}
    >
      {content}
      {services !== undefined ? (
        <CardStaleLine
          stale={stale}
          updatedAt={updatedAt}
          retrying={retrying}
          onRetry={onRetry}
        />
      ) : null}
    </DashboardCard>
  );
}
