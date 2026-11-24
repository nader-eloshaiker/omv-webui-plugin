// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's page (phase 5 file-systems design 2), for administrators. The address names the file
// system by its UUID, validated by the route; the page finds that row in FileSystemMgmt.getList and
// hands the row to every section, which use its fields for every call, never the address (UI-4). A
// value that failed the pattern, or names no row, makes no file-system-specific call. A normal user
// gets the "only administrators" page, and nothing is called first. The UUID is never in the title.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import {
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  FactListSkeleton,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import { actionOf, fsActions } from "../../filesystems/fsActions.ts";
import {
  endSection,
  findFsRow,
  fsName,
  fsState,
  sameUuid,
  SETTINGS_MODULE,
  usedBy,
} from "../../filesystems/fsModel.ts";
import { fsSession } from "../../filesystems/fsSession.ts";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { useConfiguredFs, useDiskList } from "../../hooks/useDiskReads.ts";
import {
  useAllShares,
  useMountEntry,
  useReadFileSystemsAgain,
} from "../../hooks/useFsReads.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FsNameView } from "../atoms/FsNameView.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { FsStateView } from "../molecules/FsStatus.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { FsDetails } from "../organisms/FsDetails.tsx";
import { FsSettingsForm } from "../organisms/FsSettingsForm.tsx";
import { FsSummary } from "../organisms/FsSummary.tsx";
import { FsUsedBy } from "../organisms/FsUsedBy.tsx";
import { GrowSection } from "../organisms/GrowSection.tsx";
import { UnmountPanel } from "../organisms/UnmountPanel.tsx";
import { UnmountSection } from "../organisms/UnmountSection.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

/** The route's page: the validated address (null when the address's value failed the pattern). */
export function FileSystemRoutePage() {
  const { fs } = useParams({ from: "/_signedIn/storage/filesystems/$fs" });
  return <FileSystemPage address={fs} />;
}

export function FileSystemPage({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("filesystems.title")} />;
  }
  // A value that failed the address pattern never reaches a call (UI-4).
  return address === null ? (
    <NotFound address={null} />
  ) : (
    <Found address={address} />
  );
}

function Crumbs({ current }: { current?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs aria-label={t("app.breadcrumb")}>
      <BreadcrumbItem render={<Link to="/storage/filesystems" />}>
        {t("filesystem.breadcrumb")}
      </BreadcrumbItem>
      {current === undefined ? null : (
        <BreadcrumbItem current>{current}</BreadcrumbItem>
      )}
    </Breadcrumbs>
  );
}

function Found({ address }: { address: string }) {
  const { t } = useTranslation();
  const list = useConfiguredFs();
  if (list.data === undefined && list.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Crumbs />
        <PageTitle>{t("filesystems.title")}</PageTitle>
        <ReadFailed
          error={list.error}
          retrying={list.isFetching}
          onRetry={() => void list.refetch()}
        >
          {t("filesystem.loadFailed")}
        </ReadFailed>
      </div>
    );
  }
  if (list.data === undefined) {
    return <Loading />;
  }
  const fs = findFsRow(list.data.data, address);
  if (fs === undefined) {
    return <NotFound address={address} />;
  }
  return <Sections fs={fs} address={address} />;
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        {t("filesystem.loading")}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8 w-56" />
        <Skeleton className="w-40" />
      </div>
      <FactListSkeleton rows={8} />
      {["used", "settings", "details"].map((part) => (
        <div key={part} aria-hidden="true" className="flex flex-col gap-2">
          <Skeleton shape="block" className="h-6 w-40" />
          <Skeleton className="w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Not set up (2.8): after an unmount here, its result stays above (5.4). */
function NotFound({ address }: { address: string | null }) {
  const { t } = useTranslation();
  useMemoryStore(fsActions);
  const action = address === null ? undefined : actionOf(address);
  return (
    <div className="flex flex-col gap-4">
      <Crumbs />
      <PageTitle>{t("filesystems.title")}</PageTitle>
      {address !== null && action !== undefined && action.kind !== "grow" ? (
        <UnmountPanel address={address} />
      ) : null}
      <EmptyState
        action={
          <Link to="/storage/filesystems" className={routerLinkClass}>
            {t("filesystem.showAll")}
          </Link>
        }
      >
        {t("filesystem.notFound")}
      </EmptyState>
    </div>
  );
}

function Sections({
  fs,
  address,
}: {
  fs: ConfiguredFilesystem;
  address: string;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const info = useSystemInformation();
  const disks = useDiskList();
  const entry = useMountEntry(fs.devicefile);
  const shares = useAllShares();
  const memory = useMemoryStore(fsSession);
  const readAgain = useReadFileSystemsAgain();

  const pending = pendingModules(info.data?.dirtyModules);
  const state = fsState(fs, pending);
  const name = fsName(fs);
  const nameText = words.nameOf(name);
  const size = parseByteCount(fs.size);
  const used = usedBy(fs, entry.isError ? undefined : entry.data, {
    data: shares.data?.data,
    failed: shares.isError,
    error: shares.error,
  });
  // 0.7: this page's own change is pending.
  const pendingMark =
    state === "setUpPending" ||
    (pending.includes(SETTINGS_MODULE) &&
      memory.settingsSaved.includes(address));
  const created = memory.created.some((u) => sameUuid(u, fs.uuid));
  const section = endSection(fs, pending);
  const disk = disks.data?.data.find((d) =>
    belongsTo(fs.parentdevicefile, diskNames(d)),
  );
  const missing = state === "missing";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Crumbs current={<FsNameView name={name} />} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PageTitle
            documentTitle={t("filesystem.documentTitle", { name: nameText })}
          >
            <Slotted
              sentence={(tokens) => t("filesystem.title", tokens)}
              values={{ name: <FsNameView name={name} /> }}
            />
          </PageTitle>
          {pendingMark ? <PendingMark /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {size === null
            ? words.typeWord(fs.type)
            : t("filesystem.subtitle", {
                type: words.typeWord(fs.type),
                size: formatBytes(size),
              })}
        </p>
      </div>

      <div role="status" className="flex flex-col gap-2">
        <FsStateView
          state={state}
          className="flex flex-wrap items-center gap-2"
        />
        {missing ? (
          <p className="max-w-prose">{t("filesystem.missingBody")}</p>
        ) : null}
      </div>

      <FsSummary
        fs={fs}
        state={state}
        name={nameText}
        disks={disks.data?.data}
      />

      <FsUsedBy
        fs={fs}
        used={used}
        created={created}
        onRetry={() => {
          void shares.refetch();
          void entry.refetch();
        }}
      />

      {missing || fs.status === 2 ? null : (
        <FsSettingsForm fs={fs} address={address} />
      )}
      {missing ? null : <FsDetails fs={fs} name={nameText} />}
      {fs.propresize === true ? (
        <GrowSection
          fs={fs}
          name={nameText}
          address={address}
          disks={disks.data?.data}
          onRefresh={() => void readAgain()}
        />
      ) : null}
      {section === null ? null : (
        <UnmountSection
          fs={fs}
          section={section}
          name={nameText}
          address={address}
          used={used}
          entry={entry.isError ? undefined : entry.data}
          disk={disk}
        />
      )}
    </div>
  );
}
