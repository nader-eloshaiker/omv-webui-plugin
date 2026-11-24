// SPDX-License-Identifier: GPL-3.0-or-later
// A Wi-Fi interface's own fields (phase 5 network design 6.1), before the address part: the Wi-Fi
// hardware (new only), the network name, hidden network, the security, the Wi-Fi password and the
// frequency.
//
// The password (0.6, P8, UI-6): OMV needs it on every save and never gives it back, so every save asks
// for it, the same or a new one. The field is never pre-filled (SecretField has no value), and the form
// gives it a new key after every request, which empties it. A stored one shows as "Password: Set".
import {
  CheckboxField,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  RadioGroupField,
  RadioOption,
  SecretField,
  SegmentedChoice,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WifiBand } from "../../network/dto.ts";
import type { Candidate, IfaceFormDraft } from "../../network/ifaceForm.ts";
import { IfaceCandidateSelect } from "./IfaceCandidateSelect.tsx";

export type WifiField = "port" | "wpassid" | "wpapsk";

const BANDS: readonly WifiBand[] = ["auto", "2.4GHz", "5GHz"];

export function WifiFields({
  isNew,
  candidates,
  draft,
  onChange,
  onBlur,
  errors,
  passwordStored,
  secretKey,
  onPasswordChange,
  disabled,
}: {
  isNew: boolean;
  /** Network.getWirelessCandidates (new only). */
  candidates: readonly Candidate[];
  draft: IfaceFormDraft;
  onChange: (draft: IfaceFormDraft) => void;
  onBlur: (field: WifiField) => void;
  errors: Partial<Record<WifiField, ReactNode>>;
  /** A password is stored (x-omv-presence): "Password: Set". */
  passwordStored: boolean;
  /** A new key empties the password field (after every request). */
  secretKey: number;
  onPasswordChange: (password: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const ro = disabled ? { readOnly: true, "aria-disabled": true } : {};
  return (
    <div className="flex flex-col gap-6">
      {isNew ? (
        <IfaceCandidateSelect
          field="port"
          label={t("wifi.hardware")}
          placeholder={t("wifi.hardwarePlaceholder")}
          candidates={candidates}
          value={draft.port}
          onChange={(port) => onChange({ ...draft, port })}
          onBlur={() => onBlur("port")}
          error={errors.port}
          disabled={disabled}
        />
      ) : null}

      <Field invalid={errors.wpassid ? true : undefined} className="max-w-md">
        <FieldLabel>{t("wifi.name")}</FieldLabel>
        <FieldControl
          data-field="wpassid"
          value={draft.wpassid}
          onValueChange={(wpassid) => onChange({ ...draft, wpassid })}
          onBlur={() => onBlur("wpassid")}
          required
          aria-required="true"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dir="auto"
          {...ro}
        />
        <FieldHint>{t("wifi.nameHint")}</FieldHint>
        {errors.wpassid ? <FieldError>{errors.wpassid}</FieldError> : null}
      </Field>

      <CheckboxField
        label={t("wifi.hidden")}
        hint={t("network.term.hidden")}
        checked={draft.hidden}
        disabled={disabled}
        onCheckedChange={(hidden) => onChange({ ...draft, hidden })}
      />

      <RadioGroupField
        legend={t("wifi.security")}
        hint={t("wifi.securityHint")}
        value={draft.keymanagement}
        disabled={disabled}
        focusableWhenDisabled
        onValueChange={(next) => {
          if (next === "psk" || next === "sae") {
            onChange({ ...draft, keymanagement: next });
          }
        }}
      >
        <RadioOption value="psk" label={t("wifi.wpa2")} />
        <RadioOption value="sae" label={t("wifi.wpa3")} />
      </RadioGroupField>

      <div data-field="wpapsk" className="flex max-w-md flex-col gap-1">
        {passwordStored ? (
          <p className="font-medium">{t("wifi.passwordSet")}</p>
        ) : null}
        <SecretField
          key={secretKey}
          label={passwordStored ? t("wifi.passwordAgain") : t("wifi.password")}
          hint={passwordStored ? t("wifi.passwordAgainHint") : undefined}
          error={errors.wpapsk}
          revealLabel={t("wifi.show")}
          required
          aria-required="true"
          disabled={disabled}
          onChange={(event) => onPasswordChange(event.target.value)}
          onBlur={() => onBlur("wpapsk")}
        />
      </div>

      <div className="flex flex-col gap-1">
        <p aria-hidden="true" className="font-medium">
          {t("wifi.frequency.label")}
        </p>
        <SegmentedChoice
          aria-label={t("wifi.frequency.label")}
          options={BANDS.map((band) => ({
            value: band,
            label:
              band === "auto"
                ? t("wifi.frequency.auto")
                : band === "2.4GHz"
                  ? t("wifi.frequency.ghz24")
                  : t("wifi.frequency.ghz5"),
          }))}
          value={draft.band}
          disabled={disabled}
          onValueChange={(band) => onChange({ ...draft, band })}
        />
        <p className="text-sm text-muted-foreground">
          {t("wifi.frequencyHint")}
        </p>
      </div>
    </div>
  );
}
