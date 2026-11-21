// SPDX-License-Identifier: GPL-3.0-or-later
// Add a disk to an array (phase 5 RAID design 4; owner, P1, P2, P5): to replace a missing or failed
// one, to keep as a spare, or, for an OK, idle RAID5 or RAID6, to make it bigger (irreversible; no
// default between spare and bigger, D15). One disk at a time, several only to make it bigger (D14).
// Opening it only reads (R9); nothing is chosen from the address, and every disk needs the typed
// confirmation. While anything is pending the flow does not start (R1). A run of this session is shown
// instead of the form. A normal user gets the "only administrators" page, and nothing is called first.
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  CheckboxField,
  CheckboxListField,
  CheckboxOptionGroup,
  EmptyState,
  Identifier,
  JobRunner,
  JobSummary,
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "@omv-webui/react-ui-components";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { devicesToType } from "../../filesystems/storageChoices.ts";
import { formatBytes } from "../../format/format.ts";
import { useDiskList } from "../../hooks/useDiskReads.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useRaidApi } from "../../hooks/useRaidApi.ts";
import { useAddBlockerText } from "../../hooks/useRaidBlockers.tsx";
import { useRaidDiskChoices } from "../../hooks/useRaidDiskChoices.ts";
import { useArraySlaves } from "../../hooks/useRaidReads.ts";
import { useArrayView, type ArrayView } from "../../hooks/useRaidView.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import {
  bytesOf,
  diskOf,
  smallestMember,
  type RaidDiskChoice,
} from "../../raid/raidChoices.ts";
import {
  addDecision,
  arrayAddress,
  levelKey,
  usableSize,
  type AddMode,
} from "../../raid/raidModel.ts";
import {
  raidFlowStore,
  saveAddDraft,
  startRaidFlow,
  targetDevice,
  type AddChoices,
  type AddPurpose,
  type DiskTarget,
  type RaidRun,
} from "../../raid/raidRun.ts";
import { raidSession } from "../../raid/raidSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { RaidCannotUse, RaidDiskHint } from "../molecules/RaidDiskOptions.tsx";
import { RaidNotInstalled } from "../molecules/RaidNotInstalled.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { RaidRunView } from "../organisms/RaidRunView.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function RaidAddRoutePage() {
  const { array } = useParams({ from: "/_signedIn/storage/md/$array/add" });
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("raid.title")} />;
  }
  return <RaidAdd address={array} />;
}

/** Another RAID run of this session is under way or not dismissed: say so, and link to it. */
export function OtherRaidRun({ run }: { run: RaidRun }) {
  const { t } = useTranslation();
  const address =
    run.choices.kind === "add" ? arrayAddress(run.choices.array) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-prose">{t("raid.otherRun")}</p>
      <p>
        {address === null ? (
          <Link to="/storage/md/create" className={routerLinkClass}>
            {t("raid.otherRunLink")}
          </Link>
        ) : (
          <Link
            to="/storage/md/$array/add"
            params={{ array: address }}
            className={routerLinkClass}
          >
            {t("raid.otherRunLink")}
          </Link>
        )}
      </p>
    </div>
  );
}

function RaidAdd({ address }: { address: string | null }) {
  const { t } = useTranslation();
  const v = useArrayView(address);
  const info = useSystemInformation("admin");
  const memory = useMemoryStore(raidSession);
  const { run } = useMemoryStore(raidFlowStore);
  const blockerText = useAddBlockerText();
  const row = v.view?.row;
  const slaves = useArraySlaves(row?.devicefile ?? "", row !== undefined);
  const pending = pendingModules(info.data?.dirtyModules);
  const device = row?.devicefile ?? (address === null ? "" : `/dev/${address}`);

  let content: ReactNode;
  const mine =
    run !== null &&
    run.choices.kind === "add" &&
    row !== undefined &&
    run.choices.array.uuid === row.uuid;
  if (v.missing) {
    content = <RaidNotInstalled />;
  } else if (mine) {
    content = <RaidRunView run={run} />;
  } else if (run !== null) {
    content = <OtherRaidRun run={run} />;
  } else if (
    address === null ||
    (v.arrays.data !== undefined && v.view === null)
  ) {
    content = (
      <EmptyState
        action={
          <Link to="/storage/md" className={routerLinkClass}>
            {t("array.showAll")}
          </Link>
        }
      >
        {t("array.notFound")}
      </EmptyState>
    );
  } else if (v.arrays.isError && v.arrays.data === undefined) {
    content = (
      <ReadFailed
        error={v.arrays.error}
        onRetry={() => void v.arrays.refetch()}
      >
        {t("array.loadFailed")}
      </ReadFailed>
    );
  } else if (
    v.view === null ||
    info.data === undefined ||
    (v.view.report === null && !v.detail.isError) ||
    (slaves.data === undefined && !slaves.isError)
  ) {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("raidAdd.looking")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("raidCreate.preflightBody")} />
    );
  } else {
    const decision = addDecision(
      levelKey(v.view.row.level),
      v.view.state,
      v.view.report,
      memory.changing.includes(v.view.row.uuid),
    );
    content = decision.allowed ? (
      <AddDecisions
        view={v.view}
        mode={decision.mode}
        minSize={smallestMember(slaves.data)}
      />
    ) : (
      <div className="flex flex-col gap-2">
        <p className="max-w-prose">
          {blockerText(decision.blocker, v.view.row.level)}
        </p>
        {address === null ? null : (
          <p>
            <Link
              to="/storage/md/$array"
              params={{ array: address }}
              className={routerLinkClass}
            >
              {t("raid.open", { device })}
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Breadcrumbs aria-label={t("app.breadcrumb")}>
        <BreadcrumbItem render={<Link to="/storage/md" />}>
          {t("array.breadcrumb")}
        </BreadcrumbItem>
        {address === null ? null : (
          <BreadcrumbItem
            render={
              <Link to="/storage/md/$array" params={{ array: address }} />
            }
          >
            {t("array.title", { device })}
          </BreadcrumbItem>
        )}
        <BreadcrumbItem current>{t("raidAdd.breadcrumb")}</BreadcrumbItem>
      </Breadcrumbs>
      <PageTitle documentTitle={t("raidAdd.documentTitle", { device })}>
        {t("raid.title")}
      </PageTitle>
      <JobRunner title={t("raidAdd.title", { device })}>{content}</JobRunner>
    </div>
  );
}

const targetOf = (choice: RaidDiskChoice): DiskTarget => ({
  kind: "disk",
  group: choice.group,
  disk: choice.disk,
  holds: choice.holds,
});

function useAddSummary() {
  const { t } = useTranslation();
  const flow = useFlowWords();
  return (choices: AddChoices, hasFs: boolean): ReactNode[] => {
    const array = choices.array.devicefile;
    const items: ReactNode[] = choices.targets.map((target) =>
      flow.diskLine(target),
    );
    const size = formatBytes(choices.minSize ?? 0);
    switch (choices.purpose) {
      case "replace":
        items.push(t("raidAdd.sum.replace", { array, size }));
        break;
      case "spare":
        items.push(t("raidAdd.sum.spare", { array }));
        break;
      case "bigger":
        items.push(
          t("raidAdd.sum.bigger", {
            array,
            new: choices.estimate === null ? "" : formatBytes(choices.estimate),
            size: formatBytes(bytesOf(choices.array.size)),
          }),
        );
        if (hasFs) {
          items.push(t("raidAdd.sum.growFs"));
        }
        break;
    }
    if (choices.takeOut !== null) {
      const failed = choices.takeOut;
      items.push(
        <Slotted
          sentence={(tokens) => t("raidAdd.sum.takeOutFailed", tokens)}
          values={{
            device: <Identifier>{failed.device}</Identifier>,
            model: failed.model,
            serial: <Identifier>{failed.serial}</Identifier>,
          }}
        />,
      );
    }
    items.push(t("raidAdd.sum.save"));
    return items;
  };
}

function AddDecisions({
  view,
  mode,
  minSize,
}: {
  view: ArrayView;
  mode: AddMode;
  minSize: number | null;
}) {
  const { t } = useTranslation();
  const flow = useFlowWords();
  const fsApi = useFsApi();
  const raidApi = useRaidApi();
  const disks = useDiskList();
  const summaryOf = useAddSummary();
  const { choices, retry, rescan, rescanning } = useRaidDiskChoices(minSize);
  const { row, report } = view;
  const saved = raidFlowStore.getState().add;
  const [chosen, setChosen] = useState<readonly string[]>(
    saved?.uuid === row.uuid ? saved.chosen : [],
  );
  const [purpose, setPurpose] = useState<AddPurpose | null>(
    mode === "replace"
      ? "replace"
      : mode === "spare"
        ? "spare"
        : saved?.uuid === row.uuid
          ? saved.purpose
          : null,
  );
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<AddChoices | null>(null);
  const [problem, setProblem] = useState<"purpose" | "disk" | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    }
  }, [stage]);

  if (choices.state === "failed") {
    return (
      <ReadFailed error={choices.error} onRetry={retry}>
        {t("raidCreate.checkFailed")}
      </ReadFailed>
    );
  }
  if (choices.state === "loading") {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("raidAdd.looking")}
      </p>
    );
  }

  const offered = [...choices.empty, ...choices.reuse];
  const keys = new Set(offered.map((c) => c.disk.devicefile));
  const bigger = purpose === "bigger";
  let picked = chosen.filter((k) => keys.has(k));
  if (!bigger && picked.length === 0 && offered.length === 1 && offered[0]) {
    picked = [offered[0].disk.devicefile];
  }
  if (!bigger && picked.length > 1) {
    picked = picked.slice(0, 1);
  }
  const pickedChoices = offered.filter((c) =>
    picked.includes(c.disk.devicefile),
  );
  const known = report !== null && report.known ? report : null;
  const failedMember = known?.members.find((m) => m.role === "failed") ?? null;
  const hasFs = view.used.kind === "known" && view.used.configured.length > 0;

  if (stage === "summary" && fixed !== null) {
    const devices = fixed.targets.map(targetDevice);
    const confirmText = devicesToType(devices);
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("raidAdd.summaryTitle", { count: devices.length })}
          items={summaryOf(fixed, hasFs)}
          typedConfirmation={{
            confirmText,
            prompt: t("raidCreate.typePrompt", { devices: confirmText }),
          }}
          confirmLabel={t("raidAdd.confirm", { count: devices.length })}
          backLabel={t("addStorage.back")}
          onBack={() => setStage("form")}
          onConfirm={() => {
            startRaidFlow(
              fsApi,
              raidApi,
              {
                erase: (device) => t("addStorage.task.erase", { device }),
                fsCandidates: t("addStorage.task.candidates"),
                fsCreate: (device) => t("raidCreate.task.createFs", { device }),
                apply: t("pending.applyTask"),
              },
              fixed,
            );
          }}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("raidCreate.typeHint")}
        </p>
      </div>
    );
  }

  if (offered.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          action={
            <Button
              variant="neutral"
              loading={rescanning}
              onClick={rescanning ? undefined : () => void rescan()}
            >
              {rescanning ? t("addStorage.rescanning") : t("addStorage.rescan")}
            </Button>
          }
        >
          {t("raidAdd.none", { size: formatBytes(minSize ?? 0) })}
        </EmptyState>
        <p className="max-w-prose text-sm">{t("raidAdd.removedNote")}</p>
        <RaidCannotUse unusable={choices.unusable} defaultOpen />
      </div>
    );
  }

  const onContinue = () => {
    if (purpose === null) {
      setProblem("purpose");
      return;
    }
    if (pickedChoices.length === 0) {
      setProblem("disk");
      return;
    }
    const key = levelKey(row.level);
    const memberSizes = Array.from(
      { length: row.numdevices },
      () => minSize ?? 0,
    );
    const newSizes = pickedChoices.map((c) => bytesOf(c.disk.size));
    const failedDisk =
      failedMember === null
        ? undefined
        : diskOf(failedMember.device, disks.data?.data);
    const next: AddChoices = {
      kind: "add",
      array: row as MdArray,
      roles: {
        working: known?.working ?? 0,
        spares: known?.spares ?? 0,
        failed: known?.failed ?? 0,
        missing: known?.missing ?? 0,
      },
      minSize,
      estimate:
        purpose === "bigger" && minSize !== null
          ? usableSize(key, [...memberSizes, ...newSizes])
          : null,
      purpose,
      targets: pickedChoices.map(targetOf),
      takeOut:
        purpose === "replace" && failedMember !== null
          ? {
              ...failedMember,
              model: failedDisk?.model.trim() ?? "",
              serial: failedDisk?.serialnumber.trim() ?? "",
            }
          : null,
    };
    saveAddDraft({ uuid: row.uuid, chosen: picked, purpose });
    setFixed(next);
    setStage("summary");
  };

  const sections = [
    { key: "empty" as const, list: choices.empty },
    { key: "reuse" as const, list: choices.reuse },
  ].filter((s) => s.list.length > 0);
  const added = minSize === null ? "" : formatBytes(minSize);

  return (
    <div className="flex flex-col gap-5">
      {mode === "either" ? (
        <RadioGroupField
          legend={t("raidAdd.purpose")}
          value={purpose ?? ""}
          onValueChange={(value) => {
            setPurpose(value === "bigger" ? "bigger" : "spare");
            setProblem(null);
          }}
          error={problem === "purpose" ? t("raidAdd.purposeChoose") : undefined}
        >
          <RadioOption
            value="spare"
            label={t("raidAdd.purposeSpare")}
            hint={t("raidAdd.purposeSpareHint")}
          />
          <RadioOption
            value="bigger"
            label={t("raidAdd.purposeBigger")}
            hint={t("raidAdd.purposeBiggerHint", { added })}
          />
        </RadioGroupField>
      ) : (
        <p className="max-w-prose">{t(`raidAdd.fixed.${mode}`)}</p>
      )}

      {bigger ? (
        <CheckboxListField
          legend={t("raidAdd.disks")}
          error={problem === "disk" ? t("raidAdd.chooseDisks") : undefined}
        >
          {sections.map((section) => (
            <CheckboxOptionGroup
              key={section.key}
              label={t(`addStorage.group.${section.key}`)}
              description={
                section.key === "reuse" ? t("addStorage.reuseIntro") : undefined
              }
            >
              {section.list.map((choice) => (
                <CheckboxField
                  key={choice.disk.devicefile}
                  label={flow.diskOption(choice.disk)}
                  hint={<RaidDiskHint choice={choice} />}
                  checked={picked.includes(choice.disk.devicefile)}
                  onCheckedChange={(on: boolean) => {
                    setChosen(
                      on
                        ? [...picked, choice.disk.devicefile]
                        : picked.filter((k) => k !== choice.disk.devicefile),
                    );
                    setProblem(null);
                  }}
                />
              ))}
            </CheckboxOptionGroup>
          ))}
        </CheckboxListField>
      ) : (
        <RadioGroupField
          legend={t("raidAdd.disk")}
          value={picked[0] ?? ""}
          onValueChange={(value) => {
            setChosen([value]);
            setProblem(null);
          }}
          error={problem === "disk" ? t("raidAdd.chooseDisk") : undefined}
        >
          {sections.map((section) => (
            <RadioOptionGroup
              key={section.key}
              label={t(`addStorage.group.${section.key}`)}
              description={
                section.key === "reuse" ? t("addStorage.reuseIntro") : undefined
              }
            >
              {section.list.map((choice) => (
                <RadioOption
                  key={choice.disk.devicefile}
                  value={choice.disk.devicefile}
                  label={flow.diskOption(choice.disk)}
                  hint={<RaidDiskHint choice={choice} />}
                />
              ))}
            </RadioOptionGroup>
          ))}
        </RadioGroupField>
      )}
      <RaidCannotUse unusable={choices.unusable} defaultOpen={false} />
      {choices.reuse.length > 0 ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("raidAdd.removedNote")}
        </p>
      ) : null}
      <div>
        <Button onClick={onContinue}>{t("raidCreate.continue")}</Button>
      </div>
    </div>
  );
}
