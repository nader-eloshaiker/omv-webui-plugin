// SPDX-License-Identifier: GPL-3.0-or-later
// The Overview's monitoring card (phase 5 disks design 4.4): does the NAS watch the disks, how often,
// what it does with a sleeping disk, whether any self-test is scheduled, and how it tells the reader.
// Worst first: what is off comes before what is on. "Set up monitoring" is the page's one filled
// action, a router link to the set-up flow.
import type {
  EmailNotificationSettings,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import {
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FactListSkeleton,
  InlineAlert,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { isPowerMode } from "../../disks/smartSettingsForm.ts";
import { useFormat } from "../../format/useFormat.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { SmartEmailLine } from "./SmartEmailLine.tsx";

export interface MonitoringCounts {
  /** Disks that could be watched (read-only drives such as an optical drive are left out). */
  total: number;
  watched: number;
  /** Some disks' settings are still being read. */
  loading: boolean;
}

export function SmartMonitoringCard({
  settings,
  settingsError,
  onRetrySettings,
  retrying,
  counts,
  tests,
  email,
  emailFailed,
}: {
  settings: SmartSettings | undefined;
  settingsError: unknown;
  onRetrySettings: () => void;
  retrying: boolean;
  counts: MonitoringCounts | undefined;
  /** How many self-tests are scheduled; undefined until read. */
  tests: number | undefined;
  email: EmailNotificationSettings | undefined;
  emailFailed: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const titleId = useId();

  let content;
  if (settings === undefined && settingsError !== undefined) {
    content = (
      <ReadFailed
        error={settingsError}
        onRetry={onRetrySettings}
        retrying={retrying}
      >
        {t("smart.overview.settingsFailed")}
      </ReadFailed>
    );
  } else if (settings === undefined) {
    content = <FactListSkeleton rows={3} />;
  } else {
    const setUp = (
      <Link
        to="/storage/smart/set-up"
        className={buttonClass({
          variant: "primary",
          className: "px-3 py-1.5",
        })}
      >
        {t("smart.overview.setUp")}
      </Link>
    );
    const mode = isPowerMode(settings.powermode) ? settings.powermode : "never";
    content = (
      <div className="flex flex-col gap-3">
        {!settings.enable ? (
          <>
            <InlineAlert tone="neutral" role="note">
              {t("smart.overview.off")}
            </InlineAlert>
            <div>{setUp}</div>
          </>
        ) : counts === undefined || counts.loading ? (
          <Skeleton className="w-64" />
        ) : counts.watched < counts.total ? (
          <>
            <p>
              {t("smart.overview.some", {
                watched: counts.watched,
                total: counts.total,
              })}
            </p>
            <div>{setUp}</div>
          </>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("smart.overview.all")}</span>
            <Link to="/storage/smart/set-up" className={routerLinkClass}>
              {t("smart.overview.setUpAgain")}
            </Link>
          </p>
        )}
        {settings.enable ? (
          <p>
            {t("smart.overview.interval", {
              interval: format.interval(settings.interval),
              sleeping: t(`smart.settings.modeShort.${mode}`),
            })}
          </p>
        ) : null}
        {tests === 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t("smart.overview.noTests")}</span>
            <Link to="/storage/smart/self-tests" className={routerLinkClass}>
              {t("smart.overview.addTest")}
            </Link>
          </p>
        ) : null}
        <SmartEmailLine email={email} failed={emailFailed} />
      </div>
    );
  }

  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{t("smart.overview.monitoring")}</CardTitle>
      </CardHeader>
      <CardContent aria-busy={settings === undefined || undefined}>
        {content}
      </CardContent>
    </Card>
  );
}
