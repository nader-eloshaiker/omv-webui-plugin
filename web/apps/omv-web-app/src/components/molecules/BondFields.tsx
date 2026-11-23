// SPDX-License-Identifier: GPL-3.0-or-later
// A bond's own fields (phase 5 network design 7.1), before the address part: the term, the ports in
// the bond (this page's own port listed unavailable, refused ports not offered, 0.8; a warning for one
// port), what the bond does (three modes in plain words; a mode set in the classic interface shown as
// such and kept, P3), the main port where OMV needs one (modes 1, 5 and 6), and under Advanced the
// timing settings as text (changed in the classic interface). A new bond: "The NAS names it bond0."
import {
  CheckboxField,
  CheckboxListField,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  IsolatedIdentifier,
  RadioGroupField,
  RadioOption,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@omv-webui/react-ui-components";
import { useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { BondMode, IfaceSettings } from "../../network/dto.ts";
import {
  toggleMember,
  type IfaceFormDraft,
  type MemberChoice,
} from "../../network/ifaceForm.ts";
import {
  BOND_MODE_NAMES,
  BOND_MODES,
  MODES_NEEDING_PRIMARY,
  NEW_BOND_TIMING,
} from "../../network/ifaceModel.ts";
import { CandidateWords } from "./IfaceCandidateSelect.tsx";

export type BondField = "slaves" | "bondprimary";

const OFFERED: readonly BondMode[] = [
  BOND_MODES.backup,
  BOND_MODES.lacp,
  BOND_MODES.alb,
];

const Name = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** "This page reaches the NAS through it." and how to do it safely (0.8). */
export function ThisPageMember({ iface }: { iface: string }) {
  const { t } = useTranslation();
  return (
    <>
      {t("bond.thisPagePort")}{" "}
      <Trans
        i18nKey="network.impact.otherWay"
        components={{ iface: <Name value={iface} /> }}
      />
    </>
  );
}

export function BondFields({
  isNew,
  read,
  name,
  choices,
  draft,
  onChange,
  onBlur,
  errors,
  disabled,
}: {
  isNew: boolean;
  /** The bond as read, for its stored mode and timing. */
  read: IfaceSettings | null;
  /** The name OMV will give a new bond. */
  name: string;
  choices: readonly MemberChoice[];
  draft: IfaceFormDraft;
  onChange: (draft: IfaceFormDraft) => void;
  onBlur: (field: BondField) => void;
  errors: Partial<Record<BondField, ReactNode>>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const primaryErrorId = useId();
  const storedMode = read?.bondmode;
  const classicMode =
    storedMode !== undefined && !OFFERED.some((m) => m === storedMode)
      ? storedMode
      : null;
  const needsPrimary = MODES_NEEDING_PRIMARY.includes(draft.bondmode);
  const timing = {
    miimon: read?.bondmiimon ?? NEW_BOND_TIMING.bondmiimon,
    updelay: read?.bondupdelay ?? NEW_BOND_TIMING.bondupdelay,
    downdelay: read?.bonddowndelay ?? NEW_BOND_TIMING.bonddowndelay,
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-muted-foreground">
        {t("network.term.bond")}
      </p>

      <div data-field="slaves" className="flex flex-col gap-2">
        <CheckboxListField legend={t("bond.ports")} error={errors.slaves}>
          {choices.map(({ candidate, thisPage }) => (
            <CheckboxField
              key={candidate.devicename}
              label={<CandidateWords candidate={candidate} />}
              hint={
                thisPage ? (
                  <ThisPageMember iface={candidate.devicename} />
                ) : undefined
              }
              checked={draft.slaves.includes(candidate.devicename)}
              disabled={disabled || thisPage}
              focusableWhenDisabled
              onCheckedChange={(checked) => {
                onChange(toggleMember(draft, candidate.devicename, checked));
                onBlur("slaves");
              }}
            />
          ))}
        </CheckboxListField>
        {draft.slaves.length === 1 ? (
          <InlineAlert tone="neutral" icon="warning" role="note">
            {t("bond.onePort")}
          </InlineAlert>
        ) : null}
      </div>

      <RadioGroupField
        legend={t("bond.mode.label")}
        value={String(draft.bondmode)}
        disabled={disabled}
        focusableWhenDisabled
        onValueChange={(next) => {
          const mode = [
            ...OFFERED,
            ...(classicMode === null ? [] : [classicMode]),
          ].find((m) => String(m) === next) as BondMode | undefined;
          if (mode !== undefined) {
            onChange({
              ...draft,
              bondmode: mode,
              bondprimary: MODES_NEEDING_PRIMARY.includes(mode)
                ? draft.bondprimary
                : "",
            });
          }
        }}
      >
        <RadioOption
          value={String(BOND_MODES.backup)}
          label={t("bond.mode.backup")}
          hint={t("bond.mode.backupHint")}
        />
        <RadioOption
          value={String(BOND_MODES.lacp)}
          label={t("bond.mode.lacp")}
          hint={t("bond.mode.lacpHint")}
        />
        <RadioOption
          value={String(BOND_MODES.alb)}
          label={t("bond.mode.alb")}
          hint={t("bond.mode.albHint")}
        />
        {classicMode === null ? null : (
          <RadioOption
            value={String(classicMode)}
            label={t("bond.mode.classic", {
              mode: BOND_MODE_NAMES[classicMode] ?? String(classicMode),
            })}
          />
        )}
      </RadioGroupField>

      {needsPrimary ? (
        <div data-field="bondprimary" className="flex flex-col gap-1">
          <Select
            items={draft.slaves.map((s) => ({
              value: s,
              label: <Name value={s} />,
            }))}
            value={draft.bondprimary === "" ? null : draft.bondprimary}
            disabled={disabled}
            onValueChange={(next) => {
              if (typeof next === "string") {
                onChange({ ...draft, bondprimary: next });
              }
            }}
            onOpenChange={(open) => {
              if (!open) {
                onBlur("bondprimary");
              }
            }}
          >
            <SelectLabel>{t("bond.primary")}</SelectLabel>
            <SelectTrigger
              placeholder={t("bond.primaryPlaceholder")}
              aria-invalid={errors.bondprimary ? true : undefined}
              aria-describedby={errors.bondprimary ? primaryErrorId : undefined}
              className="w-full max-w-sm"
            />
            <SelectContent>
              {draft.slaves.map((s) => (
                <SelectItem key={s} value={s}>
                  <Name value={s} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t("bond.primaryHint")}
          </p>
          {errors.bondprimary ? (
            <p id={primaryErrorId} className="text-sm text-critical-label">
              {errors.bondprimary}
            </p>
          ) : null}
        </div>
      ) : null}

      <Disclosure>
        <DisclosureTrigger>{t("bond.advanced")}</DisclosureTrigger>
        <DisclosurePanel className="flex flex-col gap-1 ps-5">
          <p>{t("bond.miimon", { ms: String(timing.miimon) })}</p>
          <p>{t("bond.updelay", { ms: String(timing.updelay) })}</p>
          <p>{t("bond.downdelay", { ms: String(timing.downdelay) })}</p>
          <p className="text-sm text-muted-foreground">
            {t("bond.timingClassic")}
          </p>
        </DisclosurePanel>
      </Disclosure>

      {isNew ? (
        <p>
          <Trans
            i18nKey="bond.named"
            components={{ name: <Name value={name} /> }}
          />
        </p>
      ) : null}
    </div>
  );
}
