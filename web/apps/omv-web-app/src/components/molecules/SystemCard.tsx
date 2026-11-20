// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's "System" card for an administrator (phase 3 design 1.2): what this NAS is. Every
// value from the server is rendered as text (UI-2); a missing one says "Not reported". Without `info`
// it is the card's skeleton.
import type { SystemInformation } from "@omv-webui/react-api-omv/generated";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ExternalLink,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC } from "../../navigation/navigation.ts";

const ROWS = 7;

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

export function SystemCard({ info }: { info: SystemInformation | undefined }) {
  const { t } = useTranslation();
  const format = useFormat();
  const titleId = useId();

  if (!info) {
    return (
      <Card render={<section aria-labelledby={titleId} />}>
        <CardHeader>
          <CardTitle id={titleId}>{t("dashboard.system.title")}</CardTitle>
        </CardHeader>
        <CardContent aria-busy="true">
          <FactListSkeleton rows={ROWS} />
        </CardContent>
      </Card>
    );
  }

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

  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{t("dashboard.system.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <FactList>
          <Fact label={t("dashboard.system.name")} variant="identifier">
            {info.hostname}
          </Fact>
          <Fact label={t("dashboard.system.version")}>{info.version}</Fact>
          <Fact label={t("dashboard.system.processor")}>{processor}</Fact>
          <Fact label={t("dashboard.system.uptime")}>
            {info.uptime === undefined
              ? undefined
              : format.duration(info.uptime)}
          </Fact>
          <Fact label={t("dashboard.system.time")}>{info.time}</Fact>
          <Fact label={t("dashboard.system.kernel")} variant="identifier">
            {info.kernel}
          </Fact>
          <Fact label={t("dashboard.system.updates")}>
            {updates === undefined ? undefined : updates > 0 ? (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>
                  {t("dashboard.system.updatesAvailable", { count: updates })}
                </span>
                <ExternalLink
                  href={CLASSIC.updates}
                  newTabLabel={t("app.newTab")}
                >
                  {t("dashboard.system.updatesLink")}
                </ExternalLink>
              </span>
            ) : (
              t("dashboard.system.updatesNone")
            )}
          </Fact>
        </FactList>
      </CardContent>
      <CardFooter>
        <ExternalLink
          href={CLASSIC.systemInformation}
          newTabLabel={t("app.newTab")}
        >
          {t("dashboard.system.moreLink")}
        </ExternalLink>
      </CardFooter>
    </Card>
  );
}
