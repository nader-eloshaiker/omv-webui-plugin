// SPDX-License-Identifier: GPL-3.0-or-later
// Creating a pool: the decisions, the summary and the one typed confirmation (phase 5 ZFS design 3.2,
// 3.3; owner, P3 to P6). The disks in the groups the stricter of the plugin's list and the disk-use
// model allows, with every disk that cannot be used listed with why; the layout in two headed groups,
// Mirror the default, "No protection (stripe)" last under "Not protected" and never chosen by anything
// but the reader's own press (not by default, not when it is the only layout one disk allows, not after
// "Change choices"); the pool's name; a first file system "data", ticked by default; the fixed settings
// as text. Then one summary in plain words, the "no protection" warning repeated just before the typed
// field, and every chosen device name typed. Nothing is chosen from the address.
import {
  Button,
  CheckboxField,
  CheckboxListField,
  CheckboxOptionGroup,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
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
import { devicesToType } from "../../filesystems/storageChoices.ts";
import { formatBytes, naturalCompare } from "../../format/format.ts";
import { useFlowWords } from "../../hooks/useFlowWords.tsx";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useZfsApi } from "../../hooks/useZfsApi.ts";
import { useZfsCreateSummary } from "../../hooks/useZfsCreateSummary.tsx";
import { useZfsDiskChoices } from "../../hooks/useZfsDiskChoices.ts";
import { useZfsList } from "../../hooks/useZfsReads.ts";
import { useZfsWords } from "../../hooks/useZfsWords.tsx";
import { bytesOf } from "../../raid/raidChoices.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import type { ZfsDiskChoice } from "../../zfs/zfsChoices.ts";
import {
  CREATE_LAYOUTS,
  fsNameProblem,
  layoutOfCreate,
  MIN_DISKS,
  poolNameProblem,
  pools,
  usableSize,
  type CreateLayout,
} from "../../zfs/zfsModel.ts";
import {
  saveCreateDraft,
  startZfsFlow,
  targetDevice,
  zfsFlowStore,
  type CreateChoices,
  type CreateDraft,
} from "../../zfs/zfsRun.ts";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { ZfsCannotUse, ZfsDiskHint } from "../molecules/ZfsDiskOptions.tsx";
import { ZfsNameField } from "../molecules/ZfsNameField.tsx";

const PROTECTED: readonly CreateLayout[] = [
  "mirror",
  "raidz1",
  "raidz2",
  "raidz3",
];

/** "No protection" is never preselected (P4): a draft that had it comes back with no layout chosen. */
const withoutStripe = (draft: CreateDraft): CreateDraft =>
  draft.layout === "basic" ? { ...draft, layout: null } : draft;

const initialDraft = (): CreateDraft => {
  const saved = zfsFlowStore.getState().create;
  return saved === null
    ? { chosen: [], layout: "mirror", name: "", withFs: true, fsName: "data" }
    : withoutStripe(saved);
};

type Problem = "min" | "layout" | "name" | "fsName" | null;

export function ZfsCreateDecisions() {
  const { t } = useTranslation();
  const words = useZfsWords();
  const flow = useFlowWords();
  const fsApi = useFsApi();
  const zfsApi = useZfsApi();
  const summaryOf = useZfsCreateSummary();
  const list = useZfsList();
  const { choices, retry, rescan, rescanning } = useZfsDiskChoices();
  const [draft, setDraft] = useState<CreateDraft>(initialDraft);
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<CreateChoices | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [returned, setReturned] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    } else if (returned) {
      // Back from the summary: focus goes to the layout, which the reader may have to choose again.
      layoutRef.current?.focus();
    }
  }, [stage, returned]);

  if (choices.state === "failed" || list.isError) {
    return (
      <ReadFailed
        error={choices.state === "failed" ? choices.error : list.error}
        onRetry={() => {
          retry();
          void list.refetch();
        }}
      >
        {t("zfsCreate.checkFailed")}
      </ReadFailed>
    );
  }
  if (choices.state === "loading" || list.data === undefined) {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("zfsCreate.looking")}
      </p>
    );
  }
  const rows = list.data.data;
  const taken = pools(rows).map((r) => r.path);

  const offered = [...choices.empty, ...choices.reuse];
  const offeredKeys = new Set(offered.map((c) => c.disk.devicefile));
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
          title={t("zfsCreate.summaryTitle")}
          items={items}
          notice={notice}
          typedConfirmation={{
            confirmText,
            prompt: t("zfsCreate.typePrompt", { devices: confirmText }),
          }}
          confirmLabel={t("zfsCreate.confirm", { count: devices.length })}
          backLabel={t("zfsCreate.changeChoices")}
          onBack={() => {
            setDraft(withoutStripe);
            setReturned(true);
            setStage("form");
          }}
          onConfirm={() => {
            startZfsFlow(
              fsApi,
              zfsApi,
              {
                erase: (device) => t("addStorage.task.erase", { device }),
                apply: t("pending.applyTask"),
              },
              fixed,
            );
          }}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          {t("zfsCreate.typeHint")}
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
          {t("zfsCreate.notEnough")}
        </EmptyState>
        <ZfsCannotUse unusable={choices.unusable} defaultOpen />
      </div>
    );
  }

  const nameProblem = poolNameProblem(draft.name, taken);
  const nameError =
    (nameTouched || problem === "name") && nameProblem !== null
      ? t(`zfsName.pool.${nameProblem}`, { name: draft.name })
      : null;
  const fsProblem = draft.withFs
    ? fsNameProblem(draft.fsName, [], draft.name)
    : null;
  const fsError =
    problem === "fsName" && fsProblem !== null
      ? t(`zfsName.fs.${fsProblem}`, { name: draft.fsName, pool: draft.name })
      : null;

  const layout = draft.layout;
  const need = layout === null ? 1 : MIN_DISKS[layout];
  const onContinue = () => {
    if (layout === null) {
      setProblem("layout");
      return;
    }
    if (chosen.length < need) {
      setProblem("min");
      return;
    }
    if (nameProblem !== null) {
      setNameTouched(true);
      setProblem("name");
      return;
    }
    if (fsProblem !== null) {
      setProblem("fsName");
      return;
    }
    const next: CreateChoices = {
      kind: "create",
      // In device order, as the disks list them: the summary and the typed names follow it.
      targets: [...chosenChoices].sort((a, b) =>
        naturalCompare(a.disk.devicename, b.disk.devicename),
      ),
      layout,
      name: draft.name,
      fs: draft.withFs ? draft.fsName : null,
      usable: usableSize(
        layout,
        chosenChoices.map((c) => bytesOf(c.disk.size)),
      ),
    };
    saveCreateDraft({ ...draft, chosen });
    setFixed(next);
    setStage("summary");
  };

  const sizes = chosenChoices.map((c) => bytesOf(c.disk.size));
  const smallest = sizes.length === 0 ? 0 : Math.min(...sizes);
  const lost = sizes.reduce((sum, s) => sum + (s - smallest), 0);
  const hint = (l: CreateLayout): ReactNode => {
    const enough = chosenChoices.length >= MIN_DISKS[l];
    const usable = formatBytes(usableSize(l, sizes));
    if (l === "basic") {
      const text = !enough
        ? t("zfsCreate.stripeHintNoSize")
        : chosenChoices.length === 1
          ? t("zfsCreate.stripeHintOne", { usable })
          : t("zfsCreate.stripeHintMany", { usable });
      return (
        <span className="flex items-start gap-1.5 text-foreground">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{text}</span>
        </span>
      );
    }
    return enough
      ? t(`zfsCreate.${l}Hint`, { usable })
      : `${t(`zfsCreate.${l}HintNoSize`)} ${t("zfsCreate.needs", { count: MIN_DISKS[l] })}`;
  };
  const layoutLabel = (l: CreateLayout) =>
    l === "basic" ? t("zfsCreate.stripe") : t(`zfsCreate.${l}`);
  const minText =
    layout !== null && need > 1
      ? t("zfsCreate.minFor", {
          count: need,
          layout: words.layoutWord(layoutOfCreate(layout, need)),
        })
      : t("zfsCreate.minOne");
  const sections = [
    { key: "empty" as const, list: choices.empty },
    { key: "reuse" as const, list: choices.reuse },
  ].filter((s) => s.list.length > 0);
  const toggle = (choice: ZfsDiskChoice, on: boolean) =>
    edit({
      chosen: on
        ? [...chosen, choice.disk.devicefile]
        : chosen.filter((k) => k !== choice.disk.devicefile),
    });

  return (
    <div className="flex flex-col gap-5">
      <CheckboxListField
        legend={t("zfsCreate.disks")}
        error={problem === "min" ? minText : undefined}
        footer={
          <>
            {problem === "min" ? null : (
              <span className="block">
                {t("zfsCreate.needs", { count: need })}
              </span>
            )}
            {lost > 0 && layout !== "basic" ? (
              <span className="block">
                {t("zfsCreate.mixedSizes", {
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
                selectAllLabel: t("zfsCreate.selectAll"),
                selectNoneLabel: t("zfsCreate.selectNone"),
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
                hint={<ZfsDiskHint choice={choice} />}
                checked={chosen.includes(choice.disk.devicefile)}
                onCheckedChange={(on: boolean) => toggle(choice, on)}
              />
            ))}
          </CheckboxOptionGroup>
        ))}
      </CheckboxListField>
      <ZfsCannotUse unusable={choices.unusable} defaultOpen={false} />

      <div ref={layoutRef} tabIndex={-1} className="outline-hidden">
        <RadioGroupField
          legend={t("zfsCreate.layout")}
          value={draft.layout ?? ""}
          onValueChange={(value) => {
            const picked = CREATE_LAYOUTS.find((l) => l === value);
            if (picked !== undefined) {
              edit({ layout: picked });
            }
          }}
          error={problem === "layout" ? t("zfsCreate.chooseLayout") : undefined}
        >
          <RadioOptionGroup label={t("zfsCreate.group.protected")}>
            {PROTECTED.map((l) => (
              <RadioOption
                key={l}
                value={l}
                label={layoutLabel(l)}
                hint={hint(l)}
              />
            ))}
          </RadioOptionGroup>
          <RadioOptionGroup label={t("zfsCreate.group.unprotected")}>
            <RadioOption
              value="basic"
              label={layoutLabel("basic")}
              hint={hint("basic")}
            />
          </RadioOptionGroup>
        </RadioGroupField>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("zfsCreate.oneDiskAlt")}{" "}
        <Link to="/storage/filesystems/add" className={routerLinkClass}>
          {t("zfsCreate.oneDiskAltLink")}
        </Link>
      </p>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("zfsCreate.checksums")}
      </p>

      <ZfsNameField
        label={t("zfsCreate.name")}
        value={draft.name}
        onChange={(name) => edit({ name })}
        onBlur={() => setNameTouched(draft.name !== "")}
        hint={
          draft.name === ""
            ? t("zfsCreate.nameHintEmpty")
            : t("zfsCreate.nameHint", { name: draft.name })
        }
        error={nameError}
      />

      <CheckboxField
        label={t("zfsCreate.firstFs")}
        hint={t("zfsCreate.firstFsHint")}
        checked={draft.withFs}
        onCheckedChange={(on: boolean) => edit({ withFs: on })}
      />
      {draft.withFs ? (
        <ZfsNameField
          label={t("zfsCreate.firstFsName")}
          value={draft.fsName}
          onChange={(fsName) => edit({ fsName })}
          hint={t("zfsFsAdd.nameHint", {
            pool: draft.name === "" ? "…" : draft.name,
            name: draft.fsName,
          })}
          error={fsError}
        />
      ) : null}

      <Disclosure>
        <DisclosureTrigger>{t("zfsCreate.chosen.title")}</DisclosureTrigger>
        <DisclosurePanel>
          <ul className="flex list-disc flex-col gap-1 ps-5">
            <li>{t("zfsCreate.chosen.compression")}</li>
            <li>{t("zfsCreate.chosen.ids")}</li>
            <li>{t("zfsCreate.chosen.blocks")}</li>
            <li>{t("zfsCreate.chosen.case")}</li>
            <li>{t("zfsCreate.chosen.later")}</li>
          </ul>
        </DisclosurePanel>
      </Disclosure>
      <p className="max-w-prose text-sm">{t("zfsCreate.sharingNext")}</p>
      <div>
        <Button onClick={onContinue}>{t("zfsCreate.continue")}</Button>
      </div>
    </div>
  );
}
