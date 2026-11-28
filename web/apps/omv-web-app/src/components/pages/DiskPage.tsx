// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's page (phase 5 disks design 2), for administrators. The address names the disk by its kernel
// name, validated by the route; the page finds that row in DiskMgmt.getList and hands the row to every
// section, which use its `devicefile` for every call, never the address (UI-3, UI-4). A name that failed
// the pattern makes no call at all; one that names no connected disk shows the not-found state and makes
// no disk-specific call. A normal user gets the "only administrators" page, and nothing is called first.
// The serial number is shown on the page only; it is never in the address or the document title.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  FactListSkeleton,
  Identifier,
  Page,
  PageHeader,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useDiskList } from "../../hooks/useDiskReads.ts";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { DiskHealthDetails } from "../organisms/DiskHealthDetails.tsx";
import { DiskMonitoring } from "../organisms/DiskMonitoring.tsx";
import { DiskPowerSettings } from "../organisms/DiskPowerSettings.tsx";
import { DiskSelfTests } from "../organisms/DiskSelfTests.tsx";
import {
  DiskAbout,
  DiskAside,
  DiskHealthAnswer,
  DiskHolds,
  DiskOnThisPage,
} from "../organisms/DiskSummary.tsx";
import {
  WipePanelForGoneDisk,
  WipeSection,
} from "../organisms/WipeSection.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

/** The route's page: the validated disk name (null when the address's value failed the pattern). */
export function DiskRoutePage() {
  const { disk } = useParams({ from: "/_signedIn/storage/disks/$disk" });
  return <DiskPage disk={disk} />;
}

export function DiskPage({ disk }: { disk: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("disks.title")} />;
  }
  // A value that failed the address pattern never reaches a call (UI-4).
  return disk === null ? <NotFound name={null} /> : <Disk name={disk} />;
}

function Crumbs({ current }: { current?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/storage/disks" />}>
        {t("disk.breadcrumb")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current className="font-mono text-sm">
          {current}
        </BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function Disk({ name }: { name: string }) {
  const { t } = useTranslation();
  const list = useDiskList();
  if (list.data === undefined && list.isError) {
    return (
      <Page>
        <PageHeader
          before={<Crumbs />}
          title={<PageTitle>{t("disks.title")}</PageTitle>}
        >
          <ReadFailed
            error={list.error}
            retrying={list.isFetching}
            onRetry={() => void list.refetch()}
          >
            {t("disk.loadFailed")}
          </ReadFailed>
        </PageHeader>
      </Page>
    );
  }
  if (list.data === undefined) {
    return <Loading />;
  }
  const disk = list.data.data.find((d) => d.devicename === name);
  if (disk === undefined) {
    return <NotFound name={name} />;
  }
  return <DiskSections disk={disk} />;
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-section">
      <p role="status" className="sr-only">
        {t("disk.loading")}
      </p>
      <div className="flex flex-col gap-group">
        <div aria-hidden="true" className="flex flex-col gap-pair">
          <Skeleton className="w-24" />
          <Skeleton shape="block" className="h-8 w-56" />
          <Skeleton className="w-72" />
        </div>
        <FactListSkeleton rows={8} />
      </div>
      {["details", "monitoring", "power"].map((part) => (
        <div key={part} aria-hidden="true" className="flex flex-col gap-pair">
          <Skeleton shape="block" className="h-6 w-40" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

function NotFound({ name }: { name: string | null }) {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader
        before={<Crumbs />}
        title={<PageTitle>{t("disks.title")}</PageTitle>}
      >
        <EmptyState
          action={
            <Link to="/storage/disks" className={routerLinkClass}>
              {t("disk.showAll")}
            </Link>
          }
        >
          {name === null
            ? t("disk.notFoundNoName")
            : t("disk.notFound", { name })}
        </EmptyState>
        {name === null ? null : <WipePanelForGoneDisk devicename={name} />}
      </PageHeader>
    </Page>
  );
}

function DiskSections({ disk }: { disk: DiskDevice }) {
  const { t } = useTranslation();
  const pending = useSmartPending();
  const device = disk.canonicaldevicefile;
  const model = disk.model.trim();
  const bytes = parseByteCount(disk.size);
  const size = bytes === null ? "" : formatBytes(bytes);
  return (
    <Page className="max-w-4xl">
      <PageHeader
        before={<Crumbs current={device} />}
        title={
          <PageTitle documentTitle={t("disk.documentTitle", { device })}>
            <Trans
              i18nKey="disk.title"
              components={{ device: <DeviceName value={device} /> }}
            />
          </PageTitle>
        }
        besideTitle={pending ? <PendingMark /> : undefined}
        subtitle={
          <Slotted
            sentence={(tokens) => t("disk.subtitle", tokens)}
            values={{
              model: model === "" ? t("disks.noModel") : model,
              size,
            }}
          />
        }
        aside={<DiskAside disk={disk} />}
      >
        <DiskHealthAnswer disk={disk} />
        <DiskOnThisPage />
      </PageHeader>
      <DiskHolds disk={disk} />
      <DiskAbout disk={disk} />
      <DiskHealthDetails disk={disk} />
      <DiskMonitoring disk={disk}>
        <DiskSelfTests disk={disk} />
      </DiskMonitoring>
      <DiskPowerSettings disk={disk} />
      {/* The destructive act sits apart from everything that is only a setting (style guide 5.2):
          a section step and its own rule above it. */}
      <WipeSection disk={disk} />
    </Page>
  );
}

/** The device in the title, set in code type; a prop, because `<Trans>` replaces a slot's children. */
function DeviceName({ value }: { value: string }) {
  return <Identifier className="text-[0.9em]">{value}</Identifier>;
}
