// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > File systems (phase 5 file-systems design 1), for administrators: where the files are
// stored, whether each file system is reachable and how full it is, and what is found on the disks but
// not set up. The reads are made when the page opens, on Refresh and after an action; nothing polls
// (D13). Unfinished work from this session (R8) is offered as its next step. A normal user gets the
// "only administrators" page, and nothing is called first (UI-4).
import type { DetectedFilesystem } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  buttonClass,
  ExternalLink,
  InlineAlert,
  rollUp,
  StatusPill,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { fileSystemState } from "../../dashboard/dashboard.ts";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import {
  fsAddress,
  fsState,
  fsUsage,
  isZfs,
  listRows,
  rowStatus,
  sameUuid,
  usedBy,
} from "../../filesystems/fsModel.ts";
import { fsSession } from "../../filesystems/fsSession.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useConfiguredFs, useDiskList } from "../../hooks/useDiskReads.ts";
import {
  useAllShares,
  useMountCandidates,
  useMountedWithRoot,
  useReadFileSystemsAgain,
} from "../../hooks/useFsReads.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { FileSystemsTable } from "../organisms/FileSystemsTable.tsx";
import { FoundFileSystems } from "../organisms/FoundFileSystems.tsx";
import { MountDialog } from "../organisms/MountDialog.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function FileSystemsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("filesystems.title")} />;
  }
  return <FileSystems />;
}

function FileSystems() {
  const { t } = useTranslation();
  const format = useFormat();
  const words = useFsWords();
  const configured = useConfiguredFs();
  const candidates = useMountCandidates();
  const mounted = useMountedWithRoot();
  const disks = useDiskList();
  const info = useSystemInformation("admin");
  const memory = useMemoryStore(fsSession);
  const shares = useAllShares(memory.created.length > 0);
  const readAgain = useReadFileSystemsAgain();
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mounting, setMounting] = useState<DetectedFilesystem | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const pending = pendingModules(info.data?.dirtyModules);
  const rows = configured.data ? listRows(configured.data.data) : undefined;
  const system = mounted.data?.find((fs) => fs.mountpoint === "/");
  const diskRows = disks.data?.data;
  // ZFS file systems are never offered for mounting through OMV's settings (ZFS design 10.3): the
  // server's candidates leave them out today, and so does this page whatever it is sent.
  const found = candidates.data?.filter((fs) => !isZfs(fs));

  const refresh = async () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await readAgain(memory.created.length > 0);
    } finally {
      setRefreshing(false);
    }
  };

  // 1.4: each file system once, by the worse of its state and its usage.
  const statuses = [
    ...(system === undefined ? [] : [rowStatus("ok", fileSystemState(system))]),
    ...(rows ?? []).map((fs) => rowStatus(fsState(fs, pending), fsUsage(fs))),
  ];
  const summary = rollUp(statuses);
  const worst = summary.status;
  const showRollUp =
    rows !== undefined &&
    (worst === "critical" || worst === "warning" || worst === "unknown");

  // 1.6: what this session started and did not finish.
  const createdOn = new Set(memory.createdOn);
  const notMounted = (found ?? []).filter((fs) =>
    [fs.parentdevicefile, fs.canonicaldevicefile].some(
      (d) => d !== "" && (createdOn.has(d) || belongsTo(d, createdOn)),
    ),
  );
  const notShared = (rows ?? []).filter(
    (fs) =>
      fs.status === 1 &&
      fs.mounted &&
      memory.created.some((u) => sameUuid(u, fs.uuid)) &&
      ["none", "other"].includes(
        usedBy(fs, undefined, {
          data: shares.data?.data,
          failed: shares.isError,
          error: shares.error,
        }).kind,
      ) &&
      fsAddress(fs) !== null,
  );

  const diskOfCandidate = (fs: DetectedFilesystem) =>
    diskRows?.find((d) => belongsTo(fs.parentdevicefile, diskNames(d)))
      ?.canonicaldevicefile ?? fs.parentdevicefile;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("filesystems.title")}</PageTitle>
      <p className="max-w-prose">{t("filesystems.intro")}</p>

      {showRollUp ? (
        <p role="status" className="flex flex-wrap items-center gap-2">
          <StatusPill status={worst}>{t(`health.${worst}`)}</StatusPill>
          <span>
            {t("filesystems.rollUp", {
              count: summary.count,
              total: summary.total,
              status: t(`health.${worst}`),
            })}
          </span>
        </p>
      ) : null}

      {notMounted.map((fs) => (
        <InlineAlert key={`nm:${fs.uuid}:${fs.devicefile}`} tone="neutral">
          <p>
            <Trans
              i18nKey="filesystems.unfinished.notMounted"
              components={{
                disk: <IdentifierText value={diskOfCandidate(fs)} />,
              }}
            />
          </p>
          <p className="mt-2">
            <Button
              variant="neutral"
              size="sm"
              aria-label={t("filesystems.found.mountName", {
                name: words.nameText(fs),
              })}
              onClick={() => setMounting(fs)}
            >
              {t("filesystems.found.mount")}
            </Button>
          </p>
        </InlineAlert>
      ))}
      {notShared.map((fs) => (
        <InlineAlert key={`ns:${fs.uuid}`} tone="neutral">
          <p>
            {t("filesystems.unfinished.notShared", {
              name: words.nameText(fs),
            })}
          </p>
          <p className="mt-2">
            <Link
              to="/storage/filesystems/$fs"
              params={{ fs: fsAddress(fs) ?? "" }}
              className={routerLinkClass}
            >
              {t("filesystems.unfinished.howToShare")}
            </Link>
          </p>
        </InlineAlert>
      ))}

      <TableToolbar className="pb-0">
        <Link
          to="/storage/filesystems/add"
          className={buttonClass({ variant: "primary" })}
        >
          {t("filesystems.add")}
        </Link>
        <Link
          to="/storage/filesystems/add-multi"
          className={buttonClass({ variant: "neutral" })}
        >
          {t("filesystems.addMulti")}
        </Link>
        <Button
          ref={refreshRef}
          variant="neutral"
          loading={refreshing}
          onClick={refreshing ? undefined : () => void refresh()}
        >
          {refreshing ? t("filesystems.refreshing") : t("filesystems.refresh")}
        </Button>
        <p
          role="status"
          className="ms-auto text-xs text-muted-foreground tabular-nums"
        >
          {rows !== undefined && configured.dataUpdatedAt > 0
            ? t("filesystems.readAt", {
                time: format.clock(configured.dataUpdatedAt),
              })
            : ""}
        </p>
      </TableToolbar>

      <FileSystemsTable
        rows={rows}
        system={system}
        pending={pending}
        disks={diskRows}
        error={configured.error}
        failed={configured.isError}
        refreshing={refreshing}
        onRetry={() => void refresh()}
      />

      <FoundFileSystems
        found={found}
        failed={candidates.isError}
        error={candidates.error}
        retrying={candidates.isFetching}
        disks={diskRows}
        onRetry={() => void candidates.refetch()}
        onMount={setMounting}
      />

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-muted-foreground">{t("filesystems.footerLine")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.fileSystems}
            newTabLabel={t("app.newTab")}
          >
            {t("filesystems.classicLink")}
          </ExternalLink>
        </p>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <MountDialog
        fs={mounting}
        disks={diskRows}
        finalFocus={refreshRef}
        onClose={() => setMounting(null)}
        onRefresh={() => void refresh()}
        onSaved={(name) => {
          setMounting(null);
          setAnnouncement(t("fsMount.saved", { name }));
          void refresh();
        }}
      />
    </div>
  );
}
