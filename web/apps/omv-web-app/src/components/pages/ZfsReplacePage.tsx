// SPDX-License-Identifier: GPL-3.0-or-later
// Replace a disk of a pool (phase 5 ZFS design 7.2, Flow F; owner, P10). The disk to replace comes
// from the pool's page in memory (the session store), never from the address; opening the address
// without one shows the disks section 7.1 allows, nothing preselected. The new disk is one the stricter
// of the plugin's list and the disk-use model offers, at least as large as the one it replaces;
// preselected only when it is the only one. One summary naming both disks, the new disk's device name
// typed, then the steps: check the pool and the disks again, erase the new disk if it holds something,
// start the rebuild, and check the new disk is in the old one's place. There is no apply (nothing is
// marked pending), so no pre-flight. A normal user gets the "only administrators" page.
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  EmptyState,
  JobRunner,
  JobSummary,
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../format/format.ts";
import { useDiskList } from "../../hooks/useDiskReads.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useZfsDiskChoices } from "../../hooks/useZfsDiskChoices.ts";
import { useZfsPoolView } from "../../hooks/useZfsView.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { bytesOf, diskOf } from "../../raid/raidChoices.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { deviceOf, minSizeFor } from "../../zfs/zfsChoices.ts";
import {
  isWorking,
  protectionOf,
  replaceDecision,
  type PoolDisk,
} from "../../zfs/zfsModel.ts";
import {
  startZfsFlow,
  targetDevice,
  zfsFlowStore,
  type ReplaceChoices,
} from "../../zfs/zfsRun.ts";
import { takeHandoff, zfsSession } from "../../zfs/zfsSession.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ZfsCannotUse, ZfsDiskHint } from "../molecules/ZfsDiskOptions.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { ZfsRunView } from "../organisms/ZfsRunView.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { OtherZfsRun } from "./ZfsCreatePage.tsx";
import { ZfsCrumbs } from "./ZfsPoolPage.tsx";

export function ZfsReplaceRoutePage() {
  const { pool } = useParams({
    from: "/_signedIn/storage/zfs/pools/$pool/replace",
  });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return <ZfsReplace address={pool} />;
}

function ZfsReplace({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const v = useZfsPoolView(address);
  const { run } = useMemoryStore(zfsFlowStore);
  const pool = v.view?.row.path ?? address ?? "";

  let content;
  if (v.missing) {
    content = <ZfsNotInstalled />;
  } else if (
    run !== null &&
    run.choices.kind === "replace" &&
    run.choices.pool === pool
  ) {
    content = <ZfsRunView run={run} />;
  } else if (run !== null) {
    content = <OtherZfsRun run={run} />;
  } else if (address === null || (v.rows !== undefined && v.view === null)) {
    content = (
      <EmptyState
        action={
          <Link to="/storage/zfs" className={routerLinkClass}>
            {t("zfsPool.showAll")}
          </Link>
        }
      >
        {t("zfsPool.notFound")}
      </EmptyState>
    );
  } else if (v.list.isError) {
    content = (
      <ReadFailed error={v.list.error} onRetry={() => void v.list.refetch()}>
        {t("zfsPool.loadFailed")}
      </ReadFailed>
    );
  } else if (
    v.view === null ||
    v.view.reportRead === "loading" ||
    (v.devices.data === undefined && !v.devices.isError)
  ) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.loading")}
      </p>
    );
  } else {
    content = <ReplaceDecisions address={pool} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ZfsCrumbs pool={address} current={t("zfsReplace.breadcrumb")} />
      <PageTitle documentTitle={t("zfsReplace.documentTitle", { pool })}>
        {t("zfsReplace.title", { pool })}
      </PageTitle>
      <JobRunner title={t("zfsReplace.runnerTitle")}>{content}</JobRunner>
    </div>
  );
}

function OldDiskLine({
  d,
  disks,
}: {
  d: PoolDisk;
  disks: readonly DiskDevice[] | undefined;
}) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const disk = d.role === "missing" ? undefined : diskOf(d.path, disks);
  if (disk === undefined) {
    return (
      <Trans
        i18nKey="zfsReplace.oldMissing"
        components={{ path: <IdentifierText value={d.disk.was ?? d.path} /> }}
      />
    );
  }
  return (
    <Trans
      i18nKey="zfsReplace.old"
      values={{
        model: disk.model.trim() || t("zfsPool.disks.noModel"),
        size: formatBytes(bytesOf(disk.size)),
        role: words.roleWord(d.role),
      }}
      components={{
        device: <IdentifierText value={disk.canonicaldevicefile} />,
        serial: <IdentifierText value={disk.serialnumber.trim()} />,
      }}
    />
  );
}

function ReplaceDecisions({ address }: { address: string }) {
  const { t } = useTranslation();
  const words = useZfsWords();
  const flow = useFlowWords();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  const v = useZfsPoolView(address);
  const omvDisks = useDiskList();
  const memory = useMemoryStore(zfsSession);
  const pool = v.view?.row.path ?? address;
  const changing = memory.changing.includes(pool);
  const allowed =
    v.view === null || !v.disks.known
      ? []
      : v.disks.disks.filter(
          (d) =>
            v.view !== null &&
            replaceDecision(d, v.view.state, v.disks, changing).allowed,
        );
  const handed = takeHandoff(pool);
  const [oldPath, setOldPath] = useState<string | null>(
    allowed.some((d) => d.path === handed) ? handed : null,
  );
  const old = allowed.find((d) => d.path === oldPath);
  const minSize =
    old === undefined || !v.disks.known
      ? null
      : minSizeFor(old, v.disks.disks, omvDisks.data?.data);
  const { choices, retry, rescan, rescanning } = useZfsDiskChoices(minSize);
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<"old" | "new" | null>(null);
  const [fixed, setFixed] = useState<ReplaceChoices | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fixed !== null) {
      summaryRef.current?.focus();
    }
  }, [fixed]);

  const view = v.view;
  if (view === null) {
    return null;
  }
  if (!v.disks.known) {
    return <p className="max-w-prose">{t("zfsRole.notKnownBlocks")}</p>;
  }
  if (!v.disks.byId) {
    return <p className="max-w-prose">{t("zfsBlock.notById")}</p>;
  }
  if (allowed.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="max-w-prose">{t("zfsReplace.nothingToReplace")}</p>
        <p>
          <Link
            to="/storage/zfs/pools/$pool"
            params={{ pool }}
            className={routerLinkClass}
          >
            {t("zfsReplace.openPool", { pool })}
          </Link>
        </p>
      </div>
    );
  }

  if (old === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <RadioGroupField
          legend={t("zfsReplace.choose")}
          hint={t("zfsReplace.chooseHint")}
          value=""
          error={problem === "old" ? t("zfsReplace.chooseOne") : undefined}
          onValueChange={(value) => {
            setOldPath(value);
            setChosen(null);
            setProblem(null);
          }}
        >
          {allowed.map((d) => (
            <RadioOption
              key={d.path}
              value={d.path}
              label={<OldDiskLine d={d} disks={omvDisks.data?.data} />}
            />
          ))}
        </RadioGroupField>
      </div>
    );
  }

  if (choices.state === "failed") {
    return (
      <ReadFailed error={choices.error} onRetry={retry}>
        {t("zfsCreate.checkFailed")}
      </ReadFailed>
    );
  }
  if (choices.state === "loading") {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("zfsCreate.looking")}
      </p>
    );
  }
  const offered = [...choices.empty, ...choices.reuse];
  const only =
    offered.length === 1 ? (offered[0]?.disk.devicefile ?? null) : null;
  const picked = chosen ?? only;
  const target = offered.find((c) => c.disk.devicefile === picked);
  const oldDisk =
    old.role === "missing"
      ? null
      : (diskOf(old.path, omvDisks.data?.data) ?? null);
  const oldDevice = deviceOf(old, omvDisks.data?.data);

  if (fixed !== null) {
    const device = targetDevice(fixed.target);
    const items = [
      <Fragment key="erase">
        <Trans
          i18nKey="zfsReplace.sum.erase"
          components={{ new: <IdentifierText value={device} /> }}
        />
        <ul className="mt-1 flex list-[circle] flex-col gap-1 ps-5">
          <li>{flow.diskLine({ kind: "disk", ...fixed.target })}</li>
        </ul>
      </Fragment>,
      <Trans
        key="place"
        i18nKey="zfsReplace.sum.place"
        values={{ model: fixed.oldDisk?.model.trim() ?? "" }}
        components={{
          old: <IdentifierText value={oldDevice} />,
          serial: (
            <IdentifierText value={fixed.oldDisk?.serialnumber.trim() ?? ""} />
          ),
          pool: <IdentifierText value={pool} />,
        }}
      />,
      t("zfsReplace.sum.rebuild"),
    ];
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("zfsReplace.summaryTitle")}
          items={items}
          typedConfirmation={{
            confirmText: device,
            prompt: t("zfsReplace.typePrompt", { device }),
          }}
          confirmLabel={t("zfsReplace.confirm")}
          backLabel={t("zfsCreate.changeChoices")}
          onBack={() => setFixed(null)}
          onConfirm={() =>
            startZfsFlow(
              fsApi,
              zfsApi,
              {
                erase: (d) => t("addStorage.task.erase", { device: d }),
                apply: t("pending.applyTask"),
              },
              fixed,
            )
          }
        />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("zfsReplace.typeHint")}
        </p>
      </div>
    );
  }

  const working = isWorking(old.role);
  const sections = [
    { key: "empty" as const, list: choices.empty },
    { key: "reuse" as const, list: choices.reuse },
  ].filter((s) => s.list.length > 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{t("zfsReplace.choose")}</h3>
        <p className="max-w-prose">
          <OldDiskLine d={old} disks={omvDisks.data?.data} />
        </p>
        {allowed.length > 1 ? (
          <p>
            <Button
              variant="neutral"
              size="sm"
              onClick={() => setOldPath(null)}
            >
              {t("zfsReplace.changeDisk")}
            </Button>
          </p>
        ) : null}
      </div>
      {offered.length === 0 ? (
        <EmptyState
          action={
            <Button
              variant="neutral"
              loading={rescanning}
              onClick={rescanning ? undefined : () => void rescan()}
            >
              {rescanning ? t("addStorage.rescanning") : t("zfsReplace.rescan")}
            </Button>
          }
        >
          {minSize === null
            ? t("zfsReplace.noneNoSize")
            : t("zfsReplace.none", { size: formatBytes(minSize) })}
        </EmptyState>
      ) : (
        <RadioGroupField
          legend={t("zfsReplace.new")}
          value={picked ?? ""}
          error={problem === "new" ? t("zfsReplace.chooseNew") : undefined}
          onValueChange={(value) => {
            setChosen(value);
            setProblem(null);
          }}
        >
          {sections.map((section) => (
            <RadioOptionGroup
              key={section.key}
              label={t(`addStorage.group.${section.key}`)}
            >
              {section.list.map((choice) => (
                <RadioOption
                  key={choice.disk.devicefile}
                  value={choice.disk.devicefile}
                  label={flow.diskOption(choice.disk)}
                  hint={<ZfsDiskHint choice={choice} />}
                />
              ))}
            </RadioOptionGroup>
          ))}
        </RadioGroupField>
      )}
      <ZfsCannotUse
        unusable={choices.unusable}
        defaultOpen={offered.length === 0}
      />
      <p className="max-w-prose text-sm text-muted-foreground">
        {working ? (
          <Trans
            i18nKey="zfsReplace.whileWorking"
            components={{ old: <IdentifierText value={oldDevice} /> }}
          />
        ) : (
          <Trans
            i18nKey="zfsReplace.whileFailed"
            values={{
              protection: words.protectionText(protectionOf(view.report)),
            }}
            components={{ old: <IdentifierText value={oldDevice} /> }}
          />
        )}
      </p>
      {offered.length === 0 ? null : (
        <div>
          <Button
            onClick={() => {
              if (target === undefined) {
                setProblem("new");
                return;
              }
              setFixed({
                kind: "replace",
                pool,
                old,
                oldDisk,
                target,
                minSize,
              });
            }}
          >
            {t("zfsReplace.continue")}
          </Button>
        </div>
      )}
    </div>
  );
}
