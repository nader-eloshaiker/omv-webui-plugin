// SPDX-License-Identifier: GPL-3.0-or-later
// Creating an array: the decisions, the summary and the one typed confirmation (phase 5 RAID design 3.2,
// 3.3; owner, P1 to P4, D24). The disks in the groups the stricter of the plugin's list and the
// disk-use model allows, with every disk that cannot be used listed with why; the level in two headed
// groups, Mirror the default and Stripe last under "Not protected", never chosen by anything but the
// reader's own press (not by default, not when it is the only level the ticked count allows, not after
// "Change choices"); "Use it for files", ticked by default, with Flow A's format, tags and warning
// level. Then one summary in plain words, the Stripe warning repeated just before the typed field, and
// every chosen device name typed. Nothing is chosen from the address.
import {
  Button,
  CheckboxField,
  CheckboxListField,
  CheckboxOptionGroup,
  EmptyState,
  JobSummary,
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LEVEL,
  tagsTooLong,
  tagsToSave,
} from "../../filesystems/fsModel.ts";
import { devicesToType } from "../../filesystems/storageChoices.ts";
import { formatBytes } from "../../format/format.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useRaidApi } from "../../hooks/useRaidApi.ts";
import { useRaidDiskChoices } from "../../hooks/useRaidDiskChoices.ts";
import { useCreateSummary } from "../../hooks/useRaidSummaries.tsx";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { bytesOf, type RaidDiskChoice } from "../../raid/raidChoices.ts";
import {
  CREATE_LEVELS,
  levelKey,
  MIN_DISKS,
  usableSize,
  type CreateLevel,
} from "../../raid/raidModel.ts";
import {
  raidFlowStore,
  saveCreateDraft,
  startRaidFlow,
  targetDevice,
  type CreateChoices,
  type CreateDraft,
  type DiskTarget,
  type FsFormat,
} from "../../raid/raidRun.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { LevelField, TagsField } from "../molecules/FsSettingFields.tsx";
import { RaidCannotUse, RaidDiskHint } from "../molecules/RaidDiskOptions.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";

const FORMATS: readonly FsFormat[] = ["ext4", "xfs", "btrfs"];
const PROTECTED: readonly CreateLevel[] = [
  "mirror",
  "raid5",
  "raid6",
  "raid10",
];

const initialDraft = (): CreateDraft =>
  raidFlowStore.getState().create ?? {
    chosen: [],
    level: "mirror",
    forFiles: true,
    format: "ext4",
    tags: "",
    warn: DEFAULT_LEVEL,
  };

const targetOf = (choice: RaidDiskChoice): DiskTarget => ({
  kind: "disk",
  group: choice.group,
  disk: choice.disk,
  holds: choice.holds,
});

export function RaidCreateDecisions() {
  const { t } = useTranslation();
  const words = useRaidWords();
  const flow = useFlowWords();
  const fsApi = useFsApi();
  const raidApi = useRaidApi();
  const summaryOf = useCreateSummary();
  const { choices, retry, rescan, rescanning } = useRaidDiskChoices();
  const [draft, setDraft] = useState<CreateDraft>(initialDraft);
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<CreateChoices | null>(null);
  const [problem, setProblem] = useState<"min" | "tags" | null>(null);
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
        {t("raidCreate.looking")}
      </p>
    );
  }

  const offered = [...choices.empty, ...choices.reuse];
  const offeredKeys = new Set(offered.map((c) => c.disk.devicefile));
  // A chosen disk that is no longer offered is simply not chosen.
  const chosen = draft.chosen.filter((k) => offeredKeys.has(k));
  const chosenChoices = offered.filter((c) =>
    chosen.includes(c.disk.devicefile),
  );
  const edit = (change: Partial<CreateDraft>) => {
    setDraft({ ...draft, chosen, ...change });
    setProblem(null);
  };

  if (stage === "summary" && fixed !== null) {
    const devices = fixed.targets.map(targetDevice);
    const confirmText = devicesToType(devices);
    const { items, notice } = summaryOf(fixed);
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("raidCreate.summaryTitle")}
          items={items}
          notice={notice}
          typedConfirmation={{
            confirmText,
            prompt: t("raidCreate.typePrompt", { devices: confirmText }),
          }}
          confirmLabel={t("raidCreate.confirm", { count: devices.length })}
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

  if (offered.length < 2) {
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
          {t("raidCreate.notEnough")}
        </EmptyState>
        <RaidCannotUse unusable={choices.unusable} defaultOpen />
      </div>
    );
  }

  const need = MIN_DISKS[draft.level];
  const onContinue = () => {
    if (chosen.length < need) {
      setProblem("min");
      return;
    }
    if (draft.forFiles && tagsTooLong(draft.tags)) {
      setProblem("tags");
      return;
    }
    const next: CreateChoices = {
      kind: "create",
      targets: chosenChoices.map(targetOf),
      level: draft.level,
      forFiles: draft.forFiles,
      format: draft.format,
      tags: tagsToSave(draft.tags),
      warn: draft.warn,
    };
    // "Change choices" comes back to exactly these: nothing moves to or from Stripe by itself.
    saveCreateDraft({ ...draft, chosen });
    setFixed(next);
    setStage("summary");
  };

  const sizes = chosenChoices.map((c) => bytesOf(c.disk.size));
  const smallest = sizes.length === 0 ? 0 : Math.min(...sizes);
  const lost = sizes.reduce((sum, s) => sum + (s - smallest), 0);
  const hint = (level: CreateLevel): ReactNode => {
    const enough = chosenChoices.length >= MIN_DISKS[level];
    const usable = formatBytes(usableSize(levelKey(level), sizes));
    const text = enough
      ? t(`raidCreate.${level}Hint`, { usable })
      : `${t(`raidCreate.${level}HintNoSize`)} ${t("raidCreate.needs", { count: MIN_DISKS[level] })}`;
    return level === "stripe" ? (
      <span className="flex items-start gap-1.5 text-foreground">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{text}</span>
      </span>
    ) : (
      text
    );
  };
  const levelLabel = (level: CreateLevel) =>
    level === "mirror"
      ? t("raidCreate.mirror")
      : level === "stripe"
        ? t("raidCreate.stripe")
        : words.levelWord(level);
  const minText =
    need > 2
      ? t("raidCreate.minFor", {
          count: need,
          level: words.levelWord(draft.level),
        })
      : t("raidCreate.min");
  const sections = [
    { key: "empty" as const, list: choices.empty },
    { key: "reuse" as const, list: choices.reuse },
  ].filter((s) => s.list.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <CheckboxListField
        legend={t("raidCreate.disks")}
        error={problem === "min" ? minText : undefined}
        footer={
          <>
            <span className="block">{minText}</span>
            {lost > 0 ? (
              <span className="block">
                {t("raidCreate.mixedSizes", {
                  size: formatBytes(smallest),
                  lost: formatBytes(lost),
                })}
              </span>
            ) : null}
          </>
        }
        selectAll={
          offered.length > 9
            ? {
                selectAllLabel: t("raidCreate.selectAll"),
                selectNoneLabel: t("raidCreate.selectNone"),
                onSelectAll: () =>
                  edit({ chosen: offered.map((c) => c.disk.devicefile) }),
                onSelectNone: () => edit({ chosen: [] }),
              }
            : undefined
        }
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
                checked={chosen.includes(choice.disk.devicefile)}
                onCheckedChange={(on: boolean) =>
                  edit({
                    chosen: on
                      ? [...chosen, choice.disk.devicefile]
                      : chosen.filter((k) => k !== choice.disk.devicefile),
                  })
                }
              />
            ))}
          </CheckboxOptionGroup>
        ))}
      </CheckboxListField>
      <RaidCannotUse unusable={choices.unusable} defaultOpen={false} />

      <RadioGroupField
        legend={t("raidCreate.level")}
        value={draft.level}
        onValueChange={(value) => {
          const level = CREATE_LEVELS.find((l) => l === value);
          if (level !== undefined) {
            edit({ level });
          }
        }}
      >
        <RadioOptionGroup label={t("raidCreate.group.protected")}>
          {PROTECTED.map((level) => (
            <RadioOption
              key={level}
              value={level}
              label={levelLabel(level)}
              hint={hint(level)}
            />
          ))}
        </RadioOptionGroup>
        <RadioOptionGroup label={t("raidCreate.group.unprotected")}>
          <RadioOption
            value="stripe"
            label={levelLabel("stripe")}
            hint={hint("stripe")}
          />
        </RadioOptionGroup>
      </RadioGroupField>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("raidCreate.combineAlt")}{" "}
        <Link to="/storage/filesystems/add-multi" className={routerLinkClass}>
          {t("raidCreate.combineAltLink")}
        </Link>
      </p>

      <CheckboxField
        label={t("raidCreate.useForFilesBody")}
        hint={t("raidCreate.useForFilesHint")}
        checked={draft.forFiles}
        onCheckedChange={(on: boolean) => edit({ forFiles: on })}
      />
      {draft.forFiles ? (
        <>
          <RadioGroupField
            legend={t("addStorage.formatLegend")}
            value={draft.format}
            onValueChange={(value) => {
              const format = FORMATS.find((f) => f === value);
              if (format !== undefined) {
                edit({ format });
              }
            }}
          >
            {FORMATS.map((format) => (
              <RadioOption
                key={format}
                value={format}
                label={t(`addStorage.format.${format}`)}
                hint={t(`addStorage.format.${format}Hint`)}
              />
            ))}
          </RadioGroupField>
          <TagsField
            value={draft.tags}
            onChange={(tags) => edit({ tags })}
            tooLong={problem === "tags"}
            placeholder={t("addStorage.tagsPlaceholder")}
          />
          <LevelField value={draft.warn} onChange={(warn) => edit({ warn })} />
          <p className="max-w-prose text-sm">{t("addStorage.sharingNext")}</p>
        </>
      ) : null}
      <div>
        <Button onClick={onContinue}>{t("raidCreate.continue")}</Button>
      </div>
    </div>
  );
}
