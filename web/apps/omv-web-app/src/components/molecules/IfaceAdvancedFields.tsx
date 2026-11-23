// SPDX-License-Identifier: GPL-3.0-or-later
// "Advanced" of the interface form (phase 5 network design 5.2 item 5): the packet size (Standard,
// Jumbo packets of 9000 bytes, or another size), Wake-on-LAN, a different hardware address (for the
// kinds whose request takes one), the route priorities (only with a fixed address and a router
// address), and the note. Closed unless one of them differs from its default; the form opens it when
// Save finds a refusal inside. Each field carries `data-field` so the form can move focus to it.
import {
  CheckboxField,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldRequired,
  NumberField,
  RadioGroupField,
  RadioOption,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { IfaceType } from "../../network/dto.ts";
import {
  showsMetric,
  takesMac,
  type IfaceFormDraft,
  type MtuChoice,
} from "../../network/ifaceForm.ts";
import type { AddressDraft } from "../../network/ifaceModel.ts";

export type AdvancedField =
  "mtu" | "altmacaddress" | "routemetric" | "routemetric6" | "comment";

const MTU_CHOICES: readonly MtuChoice[] = ["standard", "jumbo", "other"];

export function IfaceAdvancedFields({
  kind,
  draft,
  onChange,
  onBlur,
  errors,
  open,
  onOpenChange,
  disabled,
}: {
  kind: IfaceType;
  draft: IfaceFormDraft;
  onChange: (draft: IfaceFormDraft) => void;
  onBlur: (field: AdvancedField) => void;
  errors: Partial<Record<AdvancedField, ReactNode>>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const address = draft.address;
  const set = (part: Partial<AddressDraft>) =>
    onChange({ ...draft, address: { ...address, ...part } });
  const ro = disabled ? { readOnly: true, "aria-disabled": true } : {};

  return (
    <Disclosure open={open} onOpenChange={onOpenChange}>
      <DisclosureTrigger>{t("ifaceForm.advanced")}</DisclosureTrigger>
      <DisclosurePanel className="flex flex-col gap-6 ps-5 pt-2">
        <div>
          <RadioGroupField
            legend={t("ifaceForm.mtu.label")}
            hint={t("network.term.mtu")}
            value={draft.mtuChoice}
            disabled={disabled}
            focusableWhenDisabled
            onValueChange={(next) => {
              const choice = MTU_CHOICES.find((c) => c === next);
              if (choice !== undefined) {
                onChange({ ...draft, mtuChoice: choice });
              }
            }}
          >
            <RadioOption value="standard" label={t("ifaceForm.mtu.standard")} />
            <RadioOption value="jumbo" label={t("ifaceForm.mtu.jumbo")} />
            <RadioOption value="other" label={t("ifaceForm.mtu.other")}>
              {draft.mtuChoice === "other" ? (
                <div data-field="mtu">
                  <NumberField
                    label={t("ifaceForm.mtu.size")}
                    unit={t("ifaceForm.bytes")}
                    value={address.mtu}
                    onValueChange={(mtu) => set({ mtu })}
                    onBlur={() => onBlur("mtu")}
                    error={errors.mtu}
                    readOnly={disabled}
                  />
                </div>
              ) : null}
            </RadioOption>
          </RadioGroupField>
          {draft.mtuChoice !== "other" && errors.mtu !== undefined ? (
            <p className="mt-1 text-sm text-critical-label">{errors.mtu}</p>
          ) : null}
        </div>

        <CheckboxField
          label={t("ifaceForm.wol")}
          hint={t("ifaceForm.wolHint")}
          checked={address.wol}
          disabled={disabled}
          onCheckedChange={(checked) => set({ wol: checked })}
        />

        {takesMac(kind) ? (
          <Field
            invalid={errors.altmacaddress ? true : undefined}
            className="max-w-sm"
          >
            <FieldLabel>
              {t("ifaceForm.mac")}
              <FieldRequired>{t("ifaceForm.optional")}</FieldRequired>
            </FieldLabel>
            <FieldControl
              data-field="altmacaddress"
              value={address.altmacaddress}
              onValueChange={(altmacaddress) => set({ altmacaddress })}
              onBlur={() => onBlur("altmacaddress")}
              placeholder="00:00:5e:00:53:01"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
              {...ro}
            />
            <FieldHint>{t("network.term.altmacaddress")}</FieldHint>
            {errors.altmacaddress ? (
              <FieldError>{errors.altmacaddress}</FieldError>
            ) : null}
          </Field>
        ) : null}

        {showsMetric(draft, 4) ? (
          <div data-field="routemetric">
            <NumberField
              label={t("ifaceForm.metric4")}
              hint={t("network.term.routemetric")}
              value={address.routemetric}
              onValueChange={(routemetric) => set({ routemetric })}
              onBlur={() => onBlur("routemetric")}
              error={errors.routemetric}
              readOnly={disabled}
            />
          </div>
        ) : null}
        {showsMetric(draft, 6) ? (
          <div data-field="routemetric6">
            <NumberField
              label={t("ifaceForm.metric6")}
              hint={t("network.term.routemetric")}
              value={address.routemetric6}
              onValueChange={(routemetric6) => set({ routemetric6 })}
              onBlur={() => onBlur("routemetric6")}
              error={errors.routemetric6}
              readOnly={disabled}
            />
          </div>
        ) : null}

        <Field className="max-w-md">
          <FieldLabel>
            {t("ifaceForm.note")}
            <FieldRequired>{t("ifaceForm.optional")}</FieldRequired>
          </FieldLabel>
          <FieldControl
            data-field="comment"
            value={address.comment}
            onValueChange={(comment) => set({ comment })}
            dir="auto"
            autoComplete="off"
            maxLength={255}
            {...ro}
          />
          <FieldHint>{t("ifaceForm.noteHint")}</FieldHint>
        </Field>
      </DisclosurePanel>
    </Disclosure>
  );
}
