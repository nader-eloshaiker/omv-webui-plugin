// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health > Overview (phase 5 disks design 4), for administrators: does the NAS watch the
// disks, how are they, and will it say when one starts to fail. Every read on opening is configuration
// or a "do not wake" disk list; disk health comes only from the session's check, which the reader
// starts (it wakes sleeping disks). A normal user gets the "only administrators" page, and nothing is
// called first (UI-4).
import type {
  DiskDevice,
  SmartScheduleEntry,
  SmartSettings,
} from "@omv-webui/react-api-omv/generated";
import { useEmailNotificationGet } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  ExternalLink,
  Skeleton,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { byDeviceOrder } from "../../disks/diskUse.ts";
import { degrees, tempStatus } from "../../disks/diskWords.ts";
import { diskOfEntry } from "../../disks/schedule.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useDiskCheck } from "../../hooks/useDiskCheck.ts";
import {
  ON_OPEN,
  useDiskList,
  useScheduleList,
  useSmartSettings,
} from "../../hooks/useDiskReads.ts";
import { useSmartWatched, type Watch } from "../../hooks/useSmartWatched.ts";
import { useScheduleText } from "../../hooks/useSmartWords.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { DiskHealthStatus } from "../molecules/DiskHealthStatus.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { DiskHealthLine } from "../organisms/DiskHealthLine.tsx";
import { SmartMonitoringCard } from "../organisms/SmartMonitoringCard.tsx";
import { SmartTabsFrame } from "../templates/SmartTabsFrame.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SmartOverviewPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("smart.title")} />;
  }
  return (
    <SmartTabsFrame tab="overview">
      <Overview />
    </SmartTabsFrame>
  );
}

const COLUMNS = 5;

function TemperatureCell({
  disk,
  reading,
  watch,
  settings,
}: {
  disk: DiskDevice;
  reading: unknown;
  watch: Watch;
  settings: SmartSettings | undefined;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const value = degrees(reading) ?? degrees(disk.temperature);
  if (value === null) {
    return (
      <span className="text-muted-foreground">{t("disk.fact.notRead")}</span>
    );
  }
  const own =
    watch.state === "watched" || watch.state === "notWatched"
      ? (watch.settings?.tempmax ?? 0)
      : 0;
  const status = tempStatus(value, own, settings?.tempmax ?? 0);
  return (
    <span className="flex flex-col items-start gap-1 tabular-nums">
      <span>{format.celsius(value)}</span>
      {status === null ? null : (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={status.status}>
            {t(`health.${status.status}`)}
          </StatusPill>
          <span className="text-sm">
            {status.status === "critical"
              ? t("disk.fact.tempAtAlert", {
                  alert: format.celsius(status.alert),
                })
              : t("disk.fact.tempAtLimit", {
                  limit: format.celsius(status.limit),
                })}
          </span>
        </span>
      )}
    </span>
  );
}

function WatchedCell({ watch, globalOn }: { watch: Watch; globalOn: boolean }) {
  const { t } = useTranslation();
  if (watch.state === "loading") {
    return <Skeleton className="w-12" />;
  }
  if (watch.state === "unknown") {
    return <>{t("smart.overview.notKnown")}</>;
  }
  if (!globalOn) {
    return <>{t("smart.overview.noGlobalOff")}</>;
  }
  return (
    <>
      {watch.state === "watched"
        ? t("smart.overview.yes")
        : t("smart.overview.no")}
    </>
  );
}

function TestsCell({ tests }: { tests: readonly SmartScheduleEntry[] }) {
  const { t } = useTranslation();
  const words = useScheduleText();
  const [first, ...more] = tests;
  if (first === undefined) {
    return <>{t("smart.overview.none")}</>;
  }
  return (
    <>
      {words.summary(first)}
      {more.length > 0
        ? ` ${t("smart.overview.moreTests", { count: more.length })}`
        : ""}
    </>
  );
}

function Overview() {
  const { t } = useTranslation();
  const headingId = useId();
  const settings = useSmartSettings();
  const diskList = useDiskList();
  const schedule = useScheduleList();
  const email = useEmailNotificationGet({ query: ON_OPEN });
  const check = useDiskCheck();
  const disks = diskList.data ? byDeviceOrder(diskList.data.data) : undefined;
  const watched = useSmartWatched(disks);
  const globalOn = settings.data?.enable ?? false;

  const candidates = (disks ?? []).filter((d) => !d.isreadonly);
  const counts =
    disks === undefined
      ? undefined
      : {
          total: candidates.length,
          watched: globalOn
            ? candidates.filter(
                (d) => watched.of(d.devicefile).state === "watched",
              ).length
            : 0,
          loading: candidates.some(
            (d) => watched.of(d.devicefile).state === "loading",
          ),
        };
  const entries = schedule.data?.data;
  const testsOf = (disk: DiskDevice) =>
    (entries ?? []).filter(
      (e) => diskOfEntry(e, disks ?? [])?.devicefile === disk.devicefile,
    );

  let body;
  if (diskList.data === undefined && diskList.isError) {
    body = (
      <TableStateRow colSpan={COLUMNS}>
        <ReadFailed
          error={diskList.error}
          onRetry={() => void diskList.refetch()}
          retrying={diskList.isFetching}
        >
          {t("disks.loadFailed")}
        </ReadFailed>
      </TableStateRow>
    );
  } else if (disks === undefined) {
    body = <TableSkeletonRows rows={4} columns={COLUMNS} />;
  } else {
    body = disks.map((disk) => {
      const reading = check.reading(disk.canonicaldevicefile);
      const watch = watched.of(disk.devicefile);
      return (
        <TableRow key={disk.devicename}>
          <TableCell>
            <span className="flex flex-col">
              <DiskLink
                devicename={disk.devicename}
                device={disk.canonicaldevicefile}
              />
              {disk.model.trim() === "" ? null : (
                <span dir="auto" className="text-xs text-muted-foreground">
                  {disk.model}
                </span>
              )}
            </span>
          </TableCell>
          <TableCell>
            <DiskHealthStatus
              checked={check.result !== undefined}
              reading={reading}
            />
          </TableCell>
          <TableCell>
            <TemperatureCell
              disk={disk}
              reading={reading?.temperature}
              watch={watch}
              settings={settings.data}
            />
          </TableCell>
          <TableCell>
            <WatchedCell watch={watch} globalOn={globalOn} />
          </TableCell>
          <TableCell>
            {entries === undefined ? (
              <Skeleton className="w-24" />
            ) : (
              <TestsCell tests={testsOf(disk)} />
            )}
          </TableCell>
        </TableRow>
      );
    });
  }

  return (
    <>
      <SmartMonitoringCard
        settings={settings.data}
        settingsError={settings.isError ? settings.error : undefined}
        onRetrySettings={() => void settings.refetch()}
        retrying={settings.isFetching}
        counts={counts}
        tests={entries?.length}
        email={email.data}
        emailFailed={email.data === undefined && email.isError}
      />
      <DiskHealthLine />
      <section
        aria-labelledby={headingId}
        className="flex min-w-0 flex-col gap-3"
      >
        <h2 id={headingId} className="text-lg font-semibold">
          {t("smart.overview.disks")}
        </h2>
        {watched.failedCount > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t("smart.overview.watchFailed", { count: watched.failedCount })}
            <Button
              variant="neutral"
              size="sm"
              loading={watched.retrying}
              onClick={watched.retryFailed}
            >
              {t("common.tryAgain")}
            </Button>
          </p>
        ) : null}
        <Table
          aria-label={t("smart.overview.tableLabel")}
          frameLabel={t("smart.overview.tableLabel")}
          busy={disks === undefined && !diskList.isError}
          busyLabel={t("disks.loading")}
        >
          <TableHeader>
            <TableRow>
              <TableHead>{t("smart.overview.col.disk")}</TableHead>
              <TableHead>{t("smart.overview.col.health")}</TableHead>
              <TableHead>{t("smart.overview.col.temperature")}</TableHead>
              <TableHead>{t("smart.overview.col.watched")}</TableHead>
              <TableHead>{t("smart.overview.col.tests")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </section>
      <p className="text-sm">
        <ExternalLink href={CLASSIC.smartDevices} newTabLabel={t("app.newTab")}>
          {t("smart.overview.classicLink")}
        </ExternalLink>
      </p>
    </>
  );
}
