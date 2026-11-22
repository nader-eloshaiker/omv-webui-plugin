// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A's decisions, summary and confirmation (phase 5 file-systems design 6.3 to 6.5, 7.1, 7.2;
// owner, P1 to P3): which device, in the groups the stricter of the server's list and the disk-use model
// allows, with every device that cannot be used listed with why; the format (EXT4 by default) or, to
// combine disks, the way (RAID1 by default); the tags and the warning level. Then one summary in plain
// words and one typed confirmation: the device name, or every device name for several disks. Nothing is
// chosen from the address; a disk handed over from its page is chosen only if it is still offered.
import type { MdArray } from "@omv-webui/react-api-omv/generated";
import {
  Button,
  CheckboxField,
  CheckboxListField,
  CheckboxOptionGroup,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  Identifier,
  JobSummary,
  RadioGroupField,
  RadioOption,
  RadioOptionGroup,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  flowStore,
  saveDraft,
  startFlow,
  targetDevice,
  type FlowChoices,
  type FlowDraft,
  type FlowKind,
  type Format,
  type Target,
} from "../../filesystems/flowRun.ts";
import {
  DEFAULT_LEVEL,
  tagsTooLong,
  tagsToSave,
} from "../../filesystems/fsModel.ts";
import { fsSession, takeHandoff } from "../../filesystems/fsSession.ts";
import {
  allChoices,
  btrfsUsable,
  choiceDevice,
  choiceKey,
  devicesToType,
  diskBytes,
  minDisks,
  PROFILES,
  type BtrfsProfile,
  type DiskChoice,
  type StorageChoice,
  type StorageChoices,
} from "../../filesystems/storageChoices.ts";
import { formatBytes } from "../../format/format.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useRaidPlugin } from "../../hooks/useRaidReads.ts";
import { useRaidWords } from "../../hooks/useRaidWords.tsx";
import { useStorageChoices } from "../../hooks/useStorageChoices.ts";
import { useZfsPlugin } from "../../hooks/useZfsReads.ts";
import {
  arrayAddress,
  arrayState,
  levelKey,
  type ArrayState,
} from "../../raid/raidModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { Slotted } from "../atoms/Slotted.tsx";
import { LevelField, TagsField } from "../molecules/FsSettingFields.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { WipeBlockers } from "../molecules/WipeBlockers.tsx";

const FORMATS: readonly Format[] = ["ext4", "xfs", "btrfs", "f2fs"];

const initialDraft = (kind: FlowKind): FlowDraft => {
  const saved = flowStore.getState().draft[kind];
  const handoff = kind === "single" ? fsSession.getState().handoff : null;
  const base: FlowDraft = saved ?? {
    chosen: [],
    format: "ext4",
    profile: "raid1",
    tags: "",
    level: DEFAULT_LEVEL,
  };
  return handoff === null ? base : { ...base, chosen: [handoff] };
};

const targetOf = (choice: StorageChoice): Target =>
  choice.kind === "disk"
    ? {
        kind: "disk",
        group: choice.group,
        disk: choice.disk,
        holds: choice.holds,
      }
    : { kind: "raid", array: choice.array };

/** An offered array's second line: still synchronising, or no protection (RAID design 9.3). */
function ArrayHint({ array }: { array: MdArray }) {
  const { t } = useTranslation();
  const state = arrayState(array);
  return (
    <>
      {state.kind === "resyncing" ||
      state.kind === "resyncPending" ||
      state.kind === "resyncDelayed" ||
      state.kind === "reshaping" ? (
        <span className="block text-sm">{t("addStorage.raidSyncing")}</span>
      ) : null}
      {levelKey(array.level) === "raid0" ? (
        <span className="block text-sm text-foreground">
          {t("addStorage.raidNoProtection")}
        </span>
      ) : null}
    </>
  );
}

function DiskHint({ choice }: { choice: DiskChoice }) {
  const words = useFlowWords();
  const serial = choice.disk.serialnumber.trim();
  return (
    <>
      {serial === "" ? null : (
        <span className="block text-xs text-muted-foreground">
          <Trans
            i18nKey="addStorage.optionSerial"
            components={{ serial: <IdentifierText value={serial} /> }}
          />
        </span>
      )}
      {choice.group === "reuse" ? (
        <span className="mt-0.5 block text-sm text-foreground" dir="auto">
          {words.holdsText(choice.holds).join(" ")}
        </span>
      ) : null}
    </>
  );
}

/** An array that cannot hold new storage now (RAID design 9.3): its state's reason, and its page. */
function ArrayCannot({ array, state }: { array: MdArray; state: ArrayState }) {
  const { t } = useTranslation();
  const raidWords = useRaidWords();
  const address = arrayAddress(array);
  return (
    <>
      <p className="font-medium">{raidWords.arrayName(array.devicefile)}</p>
      <p>{raidWords.stateReason(array, state)}</p>
      {address === null ? null : (
        <p>
          <Link
            to="/storage/md/$array"
            params={{ array: address }}
            className={routerLinkClass}
          >
            {t("addStorage.raidCannotOpen", { device: array.devicefile })}
          </Link>
        </p>
      )}
    </>
  );
}

/** The devices that are not offered, each with why (6.3, "Cannot be used"). */
function CannotUse({
  choices,
  defaultOpen,
}: {
  choices: Extract<StorageChoices, { state: "known" }>;
  defaultOpen: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  if (choices.unusable.length === 0) {
    return null;
  }
  return (
    <Disclosure open={open} onOpenChange={setOpen}>
      <DisclosureTrigger>
        {t("addStorage.cannotUse", { count: choices.unusable.length })}
      </DisclosureTrigger>
      <DisclosurePanel>
        <ul className="flex flex-col gap-3">
          {choices.unusable.map((u) => (
            <li
              key={
                u.kind === "disk"
                  ? u.disk.devicefile
                  : u.kind === "array"
                    ? u.array.devicefile
                    : u.device
              }
              className="flex flex-col gap-1"
            >
              {u.kind === "array" ? (
                <ArrayCannot array={u.array} state={u.state} />
              ) : (
                <>
                  <p className="font-medium">
                    <Identifier>
                      {u.kind === "disk"
                        ? u.disk.canonicaldevicefile
                        : u.device}
                    </Identifier>
                    {u.kind === "disk" && u.disk.model.trim() !== "" ? (
                      <span dir="auto">, {u.disk.model.trim()}</span>
                    ) : null}
                  </p>
                  {u.kind === "disk" ? (
                    <WipeBlockers blockers={u.blockers} />
                  ) : (
                    <p>{t("addStorage.cannotPlace")}</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  );
}

export function AddStorageDecisions({ kind }: { kind: FlowKind }) {
  const { t } = useTranslation();
  const words = useFlowWords();
  const raidWords = useRaidWords();
  const api = useFsApi();
  const { choices, retry, rescan, rescanning } = useStorageChoices();
  const raidPlugin = useRaidPlugin(true) === "installed";
  const zfsPlugin = useZfsPlugin(true) === "installed";
  const [draft, setDraft] = useState<FlowDraft>(() => initialDraft(kind));
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<FlowChoices | null>(null);
  const [problem, setProblem] = useState<"choose" | "min" | "tags" | null>(
    null,
  );
  const summaryRef = useRef<HTMLDivElement>(null);
  const multi = kind === "multi";

  // The handed-over disk is taken once (StrictMode runs the initializer twice, so not in it).
  useEffect(() => {
    takeHandoff();
  }, []);

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    }
  }, [stage]);

  if (choices.state === "failed") {
    return (
      <ReadFailed error={choices.error} onRetry={retry}>
        {t("addStorage.checkFailed")}
      </ReadFailed>
    );
  }
  if (choices.state === "loading") {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.looking")}
      </p>
    );
  }

  const offered = multi
    ? [...choices.empty, ...choices.reuse]
    : allChoices(choices);
  const offeredKeys = new Set(offered.map(choiceKey));
  // A chosen device that is no longer offered is simply not chosen; one offered device is chosen.
  let chosen = draft.chosen.filter((key) => offeredKeys.has(key));
  if (!multi && chosen.length === 0 && offered.length === 1 && offered[0]) {
    chosen = [choiceKey(offered[0])];
  }
  const chosenChoices = offered.filter((c) => chosen.includes(choiceKey(c)));
  const edit = (change: Partial<FlowDraft>) => {
    setDraft({ ...draft, chosen, ...change });
    setProblem(null);
  };

  if (stage === "summary" && fixed !== null) {
    const devices = fixed.targets.map(targetDevice);
    const confirmText = multi ? devicesToType(devices) : (devices[0] ?? "");
    const raid = fixed.targets[0]?.kind === "raid";
    return (
      <div ref={summaryRef} tabIndex={-1} className="outline-hidden">
        <JobSummary
          title={t("addStorage.summaryTitle")}
          items={words.summaryItems(fixed)}
          typedConfirmation={{
            confirmText,
            prompt: multi
              ? t("addStorage.multi.typePrompt", { devices: confirmText })
              : t("addStorage.typePrompt", { device: confirmText }),
          }}
          confirmLabel={
            multi
              ? t("addStorage.multi.confirm", { count: devices.length })
              : raid
                ? t("addStorage.confirmRaid")
                : t("addStorage.confirm")
          }
          backLabel={t("addStorage.back")}
          onBack={() => setStage("form")}
          onConfirm={() => {
            startFlow(
              api,
              {
                candidates: t("addStorage.task.candidates"),
                erase: (device) => t("addStorage.task.erase", { device }),
                create: (device) => t("addStorage.task.create", { device }),
                apply: t("pending.applyTask"),
                undo: t("pending.undoTask"),
              },
              fixed,
            );
          }}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("addStorage.typeHint")}
        </p>
      </div>
    );
  }

  const onContinue = () => {
    if (multi ? chosen.length < minDisks(draft.profile) : chosen.length !== 1) {
      setProblem(multi ? "min" : "choose");
      return;
    }
    if (tagsTooLong(draft.tags)) {
      setProblem("tags");
      return;
    }
    const next: FlowChoices = {
      kind,
      targets: chosenChoices.map(targetOf),
      format: multi ? "btrfs" : draft.format,
      profile: multi ? draft.profile : null,
      tags: tagsToSave(draft.tags),
      level: draft.level,
    };
    saveDraft(kind, { ...draft, chosen });
    setFixed(next);
    setStage("summary");
  };

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
          {t("addStorage.none")}
        </EmptyState>
        <CannotUse choices={choices} defaultOpen />
      </div>
    );
  }

  const diskSections: { key: "empty" | "reuse"; list: DiskChoice[] }[] = [
    { key: "empty" as const, list: choices.empty },
    { key: "reuse" as const, list: choices.reuse },
  ].filter((s) => s.list.length > 0);
  const offeredDisks = choices.empty.length + choices.reuse.length;

  let deviceField: ReactNode;
  if (multi) {
    const ticked = new Set(chosen);
    const need = minDisks(draft.profile);
    deviceField = (
      <CheckboxListField
        legend={t("addStorage.multi.disks")}
        error={
          problem === "min"
            ? need > 2
              ? t("addStorage.multi.minFor", { count: need })
              : t("addStorage.multi.min", { count: need })
            : undefined
        }
        footer={
          need > 2
            ? t("addStorage.multi.minFor", { count: need })
            : t("addStorage.multi.min", { count: need })
        }
        selectAll={
          offered.length > 9
            ? {
                selectAllLabel: t("addStorage.multi.selectAll"),
                selectNoneLabel: t("addStorage.multi.selectNone"),
                onSelectAll: () => edit({ chosen: offered.map(choiceKey) }),
                onSelectNone: () => edit({ chosen: [] }),
              }
            : undefined
        }
      >
        {diskSections.map((section) => (
          <CheckboxOptionGroup
            key={section.key}
            label={t(`addStorage.group.${section.key}`)}
            description={
              section.key === "reuse" ? t("addStorage.reuseIntro") : undefined
            }
          >
            {section.list.map((choice) => (
              <CheckboxField
                key={choiceKey(choice)}
                label={words.diskOption(choice.disk)}
                hint={<DiskHint choice={choice} />}
                checked={ticked.has(choiceKey(choice))}
                onCheckedChange={(on: boolean) =>
                  edit({
                    chosen: on
                      ? [...chosen, choiceKey(choice)]
                      : chosen.filter((k) => k !== choiceKey(choice)),
                  })
                }
              />
            ))}
          </CheckboxOptionGroup>
        ))}
      </CheckboxListField>
    );
  } else {
    deviceField = (
      <RadioGroupField
        legend={t("addStorage.disk")}
        value={chosen[0] ?? ""}
        onValueChange={(value) => edit({ chosen: [value] })}
        error={problem === "choose" ? t("addStorage.chooseDisk") : undefined}
      >
        {choices.empty.length > 0 ? (
          <RadioOptionGroup label={t("addStorage.group.empty")}>
            {choices.empty.map((choice) => (
              <RadioOption
                key={choiceKey(choice)}
                value={choiceKey(choice)}
                label={words.diskOption(choice.disk)}
                hint={<DiskHint choice={choice} />}
              />
            ))}
          </RadioOptionGroup>
        ) : null}
        {choices.raid.length > 0 ? (
          <RadioOptionGroup label={t("addStorage.group.raid")}>
            {choices.raid.map((choice) => (
              <RadioOption
                key={choiceKey(choice)}
                value={choiceKey(choice)}
                label={
                  <Slotted
                    sentence={(tokens) =>
                      t("addStorage.raidOption", {
                        ...tokens,
                        level: raidWords.levelWord(choice.array.level),
                        count: choice.array.numdevices,
                        size: words.sizes(choice.array.size).size,
                      })
                    }
                    values={{
                      device: <Identifier>{choiceDevice(choice)}</Identifier>,
                    }}
                  />
                }
                hint={<ArrayHint array={choice.array} />}
              />
            ))}
          </RadioOptionGroup>
        ) : null}
        {choices.reuse.length > 0 ? (
          <RadioOptionGroup
            label={t("addStorage.group.reuse")}
            description={t("addStorage.reuseIntro")}
          >
            {choices.reuse.map((choice) => (
              <RadioOption
                key={choiceKey(choice)}
                value={choiceKey(choice)}
                label={words.diskOption(choice.disk)}
                hint={<DiskHint choice={choice} />}
              />
            ))}
          </RadioOptionGroup>
        ) : null}
      </RadioGroupField>
    );
  }

  const sizes = chosenChoices.map((c) =>
    c.kind === "disk" ? diskBytes(c.disk) : 0,
  );
  // Each way's hint says the usable space only once enough disks are ticked for it.
  const wayHint = (profile: BtrfsProfile) =>
    chosenChoices.length >= minDisks(profile)
      ? t(`addStorage.multi.${profile}Hint`, {
          usable: formatBytes(btrfsUsable(sizes, profile)),
        })
      : t(`addStorage.multi.${profile}HintNoSize`);

  return (
    <div className="flex flex-col gap-5">
      {deviceField}
      <CannotUse choices={choices} defaultOpen={false} />
      {!multi && offeredDisks >= 2 ? (
        zfsPlugin ? (
          <p className="text-sm">
            {raidPlugin
              ? t("addStorage.combineHintZfs")
              : t("addStorage.combineHintZfsOnly")}{" "}
            <Link
              to="/storage/filesystems/add-multi"
              className={routerLinkClass}
            >
              {t("addStorage.combineLink")}
            </Link>{" "}
            {raidPlugin ? (
              <>
                <Link to="/storage/md/create" className={routerLinkClass}>
                  {t("addStorage.combineRaidLink")}
                </Link>{" "}
              </>
            ) : null}
            <Link to="/storage/zfs/create" className={routerLinkClass}>
              {t("addStorage.combineZfsLink")}
            </Link>
          </p>
        ) : raidPlugin ? (
          <p className="text-sm">
            {t("addStorage.combineHintRaid")}{" "}
            <Link
              to="/storage/filesystems/add-multi"
              className={routerLinkClass}
            >
              {t("addStorage.combineLink")}
            </Link>{" "}
            <Link to="/storage/md/create" className={routerLinkClass}>
              {t("addStorage.combineRaidLink")}
            </Link>
          </p>
        ) : (
          <p className="text-sm">
            {t("addStorage.combineHint")}{" "}
            <Link
              to="/storage/filesystems/add-multi"
              className={routerLinkClass}
            >
              {t("addStorage.combineLink")}
            </Link>
          </p>
        )
      ) : null}
      {multi ? (
        <RadioGroupField
          legend={t("addStorage.multi.way")}
          value={draft.profile}
          onValueChange={(value) => {
            const profile = PROFILES.find((p) => p === value);
            if (profile !== undefined) {
              edit({ profile });
            }
          }}
        >
          {PROFILES.map((profile) => (
            <RadioOption
              key={profile}
              value={profile}
              label={t(`addStorage.multi.${profile}`)}
              hint={wayHint(profile)}
            />
          ))}
        </RadioGroupField>
      ) : (
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
      )}
      <TagsField
        value={draft.tags}
        onChange={(tags) => edit({ tags })}
        tooLong={problem === "tags"}
        placeholder={t("addStorage.tagsPlaceholder")}
      />
      <LevelField value={draft.level} onChange={(level) => edit({ level })} />
      <p className="max-w-prose text-sm">{t("addStorage.sharingNext")}</p>
      <div>
        <Button onClick={onContinue}>{t("addStorage.continue")}</Button>
      </div>
    </div>
  );
}
