// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync, the Copy jobs tab (phase 5 services design 3): which copies the NAS makes, of
// what, to where and when. Reads Rsync.getList (whole; each job's stored password replaced by
// whether one is set, 0.8), the shared folders and file systems (whether Run now can reach them), the
// shell's pending modules and the NAS's time zone. Opening it only reads (UI-4). Every action follows
// the reader's own press: Run now and Delete through their confirmations, Change on the job's page.
import type {
  ConfiguredFilesystem,
  RsyncJobRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { useTask } from "@omv-webui/react-api-omv/tasks";
import {
  Button,
  buttonClass,
  EmptyState,
  ExternalLink,
  InlineAlert,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  PageSection,
  PairStack,
  Skeleton,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { Link, useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobWords } from "../../hooks/useJobWords.ts";
import { useNasTime, useRsyncJobs } from "../../hooks/useJobsReads.ts";
import {
  useSharedFoldersAll,
  useShareFileSystems,
  useSharesSystem,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  deletionOf,
  rowSides,
  runBlock,
  trialKey,
  trialOnly,
  unreachableFolders,
} from "../../services/jobModel.ts";
import {
  jobPending,
  jobsSession,
  requestChange,
} from "../../services/jobsSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { TASK_STATUS } from "../../shell/taskView.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { JobSideView } from "../molecules/JobDirection.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import {
  DeleteJobDialog,
  type DeleteTarget,
} from "../organisms/DeleteJobDialog.tsx";
import {
  RunBlockReason,
  RunJobConfirm,
  type RunTarget,
} from "../organisms/RunJob.tsx";

export function CopyJobsTab() {
  const { t } = useTranslation();
  const jobs = useRsyncJobs({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const fileSystems = useShareFileSystems();
  const time = useNasTime();
  const system = useSharesSystem();
  const memory = useMemoryStore(jobsSession);
  const pending = system.pending;
  const [running, setRunning] = useState<RunTarget | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  let table;
  if (jobs.data === undefined && jobs.isError) {
    table = (
      <ReadFailed
        error={jobs.error}
        onRetry={() => void jobs.refetch()}
        retrying={jobs.isFetching}
      >
        {t("jobs.loadFailed")}
      </ReadFailed>
    );
  } else if (jobs.data === undefined) {
    table = (
      <div role="status" aria-busy="true" className="flex flex-col gap-pair">
        <span className="sr-only">{t("jobs.loading")}</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (jobs.data.data.length === 0) {
    table = (
      <EmptyState
        action={
          <Link to="/services/rsync/jobs/add" className={routerLinkClass}>
            {t("jobs.add")}
          </Link>
        }
      >
        {t("jobs.empty")}
      </EmptyState>
    );
  } else {
    table = (
      <JobsTable
        rows={jobs.data.data}
        folders={folders.data?.data}
        fileSystems={fileSystems.data?.data}
        pending={pending}
        saved={memory}
        runs={memory.runs}
        nasZone={time.data?.timezone}
        onRun={setRunning}
        onDelete={setDeleting}
      />
    );
  }

  return (
    <>
      <PageSection>
        <p className="max-w-prose">{t("services.term.job")}</p>
        {pending?.includes("rsync") ? (
          <InlineAlert tone="neutral">{t("jobs.pendingBlocksRun")}</InlineAlert>
        ) : null}
        <PairStack>
          <TableToolbar>
            <Link
              to="/services/rsync/jobs/add"
              className={buttonClass({ variant: "primary" })}
            >
              {t("jobs.add")}
            </Link>
          </TableToolbar>
          {table}
          <p className="text-sm text-muted-foreground">
            {t("jobs.lastRunUnknown")}{" "}
            <Link to="/diagnostics/system-logs" className={routerLinkClass}>
              {t("jobs.logLink")}
            </Link>
          </p>
        </PairStack>
        <RunJobConfirm
          target={running}
          folders={folders.data?.data}
          onClose={() => setRunning(null)}
        />
        <DeleteJobDialog
          target={deleting}
          folders={folders.data?.data}
          onClose={() => setDeleting(null)}
        />
      </PageSection>
      <footer className="text-sm text-muted-foreground">
        <p>
          {t("jobs.footerLine")}{" "}
          <ExternalLink href={CLASSIC.rsyncTasks} newTabLabel={t("app.newTab")}>
            {t("jobs.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </>
  );
}

function JobsTable({
  rows,
  folders,
  fileSystems,
  pending,
  saved,
  runs,
  nasZone,
  onRun,
  onDelete,
}: {
  rows: readonly RsyncJobRow[];
  folders: readonly SharedFolder[] | undefined;
  fileSystems: readonly ConfiguredFilesystem[] | undefined;
  pending: readonly string[] | undefined;
  saved: Parameters<typeof jobPending>[0];
  runs: Readonly<Record<string, number>>;
  nasZone: string | undefined;
  onRun: (target: RunTarget) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const { t } = useTranslation();
  const words = useJobWords(nasZone);
  return (
    <Table frameLabel={t("jobs.tableLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("jobs.col.job")}</TableHead>
          <TableHead>{t("jobs.col.from")}</TableHead>
          <TableHead>{t("jobs.col.to")}</TableHead>
          <TableHead>{t("jobs.col.when")}</TableHead>
          <TableHead>{t("jobs.col.deletes")}</TableHead>
          <TableHead>{t("jobs.col.session")}</TableHead>
          <TableHead>{t("jobs.col.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <JobRow
            key={row.uuid}
            row={row}
            name={words.rowName(row)}
            when={words.when(row)}
            folders={folders}
            fileSystems={fileSystems}
            pending={pending}
            marked={
              pending !== undefined && jobPending(saved, row.uuid, pending)
            }
            taskId={runs[row.uuid]}
            onRun={onRun}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function WarningWords({ children }: { children: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <span>{children}</span>
    </span>
  );
}

function JobRow({
  row,
  name,
  when,
  folders,
  fileSystems,
  pending,
  marked,
  taskId,
  onRun,
  onDelete,
}: {
  row: RsyncJobRow;
  name: string;
  when: string;
  folders: readonly SharedFolder[] | undefined;
  fileSystems: readonly ConfiguredFilesystem[] | undefined;
  pending: readonly string[] | undefined;
  marked: boolean;
  taskId: number | undefined;
  onRun: (target: RunTarget) => void;
  onDelete: (target: DeleteTarget) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { task } = useTask(taskId);
  const sides = rowSides(row);
  const deletion = deletionOf(row);
  const trial = trialOnly(row);
  const runningTask = task?.state === "running" ? task.id : undefined;
  const block =
    sides === null
      ? ({ kind: "pending" } as const)
      : runBlock({
          pending,
          runningTask,
          unreachable: unreachableFolders(sides, folders, fileSystems),
        });
  return (
    <TableRow>
      <TableCell narrow="title">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            to="/services/rsync/jobs/$job"
            params={{ job: row.uuid }}
            className={routerLinkClass}
          >
            <bdi dir="auto">{name}</bdi>
          </Link>
          {marked ? <PendingMark /> : null}
        </span>
      </TableCell>
      <TableCell label={t("jobs.col.from")}>
        {sides === null ? (
          <FolderNameText value={row.srcname} />
        ) : (
          <JobSideView side={sides.from} folders={folders} name={row.srcname} />
        )}
        <span className="sr-only"> {t("jobs.between")}</span>
      </TableCell>
      <TableCell label={t("jobs.col.to")}>
        {sides === null ? (
          <FolderNameText value={row.destname} />
        ) : (
          <JobSideView side={sides.to} folders={folders} name={row.destname} />
        )}
      </TableCell>
      <TableCell label={t("jobs.col.when")}>
        <span className="flex flex-col gap-1">
          <span>{when}</span>
          {trial ? <WarningWords>{t("jobs.trialOnly")}</WarningWords> : null}
        </span>
      </TableCell>
      <TableCell label={t("jobs.col.deletes")}>
        {deletion === "option" ? (
          <WarningWords>{t("jobs.deletes.yes")}</WarningWords>
        ) : deletion === "extra" ? (
          <WarningWords>{t("jobs.deletes.extra")}</WarningWords>
        ) : (
          t("jobs.deletes.no")
        )}
      </TableCell>
      <TableCell narrow="aside">
        {task === undefined ? null : (
          <StatusPill status={TASK_STATUS[task.state]}>
            {t(`tasks.${task.state}`)}
          </StatusPill>
        )}
      </TableCell>
      <TableCell>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="neutral"
                size="sm"
                aria-label={t("jobs.actionsFor", { job: name })}
              />
            }
          >
            {t("jobs.col.actions")}
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem
              disabled={block !== null}
              onClick={() => {
                if (sides !== null && block === null) {
                  onRun({
                    uuid: row.uuid,
                    name,
                    sides,
                    trialOnly: trial,
                    deletes: deletion !== "no",
                    trialKey: trialKey(row),
                  });
                }
              }}
            >
              <span className="flex flex-col">
                <span>{t("jobs.action.run")}</span>
                {block === null ? null : (
                  <span className="text-sm text-muted-foreground">
                    <RunBlockReason block={block} folders={folders} />
                  </span>
                )}
              </span>
            </MenuItem>
            <MenuItem
              onClick={() => {
                requestChange(row.uuid);
                void navigate({
                  to: "/services/rsync/jobs/$job",
                  params: { job: row.uuid },
                });
              }}
            >
              {t("jobs.action.change")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              disabled={runningTask !== undefined}
              onClick={() => {
                if (runningTask === undefined) {
                  onDelete({ uuid: row.uuid, name, sides });
                }
              }}
            >
              <span className="flex flex-col">
                <span>{t("jobs.action.delete")}</span>
                {runningTask === undefined ? null : (
                  <span className="text-sm text-muted-foreground">
                    {t("deleteJob.running")}
                  </span>
                )}
              </span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </TableCell>
    </TableRow>
  );
}
