// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's "System" card for an administrator (phase 3 design 1.2; dashboard spec 10.2): what
// this NAS is, with the processor and kernel one disclosure away. Every value from the server is
// rendered as text (UI-2); a missing one says "Not reported". Without `info` it is the card's
// skeleton, or, when System.getInformation was never read, the failure with the server's message and
// "Try again": the page's one alert for it (the answer above only names the area).
import type { SystemInformation } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  ExternalLink,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { DashboardCard } from "./DashboardCard.tsx";

function Fact({
  label,
  variant,
  children,
}: {
  label: string;
  variant?: "text" | "identifier";
  /** Undefined: the server did not report it. */
  children: ReactNode | undefined;
}) {
  const { t } = useTranslation();
  return (
    <FactListItem>
      <FactListLabel>{label}</FactListLabel>
      {children === undefined ? (
        <FactListValue variant="missing">
          {t("common.notReported")}
        </FactListValue>
      ) : (
        <FactListValue variant={variant}>{children}</FactListValue>
      )}
    </FactListItem>
  );
}

export function SystemCard({
  info,
  error,
  retrying,
  onRetry,
  className,
  index,
}: {
  info: SystemInformation | undefined;
  /** Set when System.getInformation failed and there is nothing to show. */
  error?: unknown;
  retrying?: boolean;
  onRetry: () => void;
  /** Its place in the page grid, and in the rise-in order. */
  className?: string;
  index?: number;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const newTab = t("app.newTab");

  let content: ReactNode;
  if (!info && error !== undefined && error !== null) {
    content = (
      <EmptyState
        variant="error"
        className="py-4"
        serverMessage={
          isRpcError(error)
            ? { label: t("app.serverMessage"), text: error.message }
            : undefined
        }
        action={
          <Button variant="neutral" loading={retrying} onClick={onRetry}>
            {t("common.tryAgain")}
          </Button>
        }
      >
        {t("dashboard.loadFailed")}
      </EmptyState>
    );
  } else if (!info) {
    content = <FactListSkeleton rows={5} />;
  } else {
    const cores = info.cpuCores ?? null;
    const model = info.cpuModelName ?? null;
    let processor: string | undefined;
    if (model !== null && cores !== null) {
      processor = t("dashboard.system.processorValue", { model, count: cores });
    } else if (cores !== null) {
      processor = t("dashboard.system.processorCores", { count: cores });
    } else if (model !== null) {
      processor = model;
    }
    const updates = info.availablePkgUpdates;
    content = (
      <>
        <FactList>
          <Fact label={t("dashboard.system.name")} variant="identifier">
            {info.hostname}
          </Fact>
          <Fact label={t("dashboard.system.version")}>{info.version}</Fact>
          <Fact label={t("dashboard.system.uptime")}>
            {info.uptime === undefined
              ? undefined
              : format.duration(info.uptime)}
          </Fact>
          <Fact label={t("dashboard.system.time")}>{info.time}</Fact>
          <Fact label={t("dashboard.system.updates")}>
            {updates === undefined ? undefined : updates > 0 ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {t("dashboard.system.updatesAvailable", { count: updates })}
                </span>
                <ExternalLink href={CLASSIC.updates} newTabLabel={newTab}>
                  {t("dashboard.system.updatesLink")}
                </ExternalLink>
              </span>
            ) : (
              t("dashboard.system.updatesNone")
            )}
          </Fact>
        </FactList>
        <Disclosure>
          <DisclosureTrigger variant="inline">
            {t("dashboard.system.technical")}
          </DisclosureTrigger>
          <DisclosurePanel>
            <FactList>
              <Fact label={t("dashboard.system.processor")}>{processor}</Fact>
              <Fact label={t("dashboard.system.kernel")} variant="identifier">
                {info.kernel}
              </Fact>
            </FactList>
            <p>
              <ExternalLink
                href={CLASSIC.systemInformation}
                newTabLabel={newTab}
              >
                {t("dashboard.system.moreLink")}
              </ExternalLink>
            </p>
          </DisclosurePanel>
        </Disclosure>
      </>
    );
  }

  return (
    <DashboardCard
      title={t("dashboard.system.title")}
      busy={!info && (error === undefined || error === null)}
      className={className}
      index={index}
    >
      {content}
    </DashboardCard>
  );
}
