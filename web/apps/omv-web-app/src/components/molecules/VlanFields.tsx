// SPDX-License-Identifier: GPL-3.0-or-later
// A VLAN's own fields (phase 5 network design 8.1), before the address part: the term, what it runs
// on and its VLAN ID (both new only; OMV names the VLAN by them, so a VLAN's are shown as text), and
// "The NAS names it {{parent}}.{{id}}." once both are chosen.
import {
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  IsolatedIdentifier,
  NumberField,
} from "@omv-webui/react-ui-components";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { Candidate, IfaceFormDraft } from "../../network/ifaceForm.ts";
import { IfaceCandidateSelect } from "./IfaceCandidateSelect.tsx";

export type VlanField = "vlanrawdevice" | "vlanid";

const Name = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

export function VlanFields({
  isNew,
  candidates,
  draft,
  name,
  onChange,
  onBlur,
  errors,
  disabled,
}: {
  isNew: boolean;
  /** Network.getVlanCandidates (new only). */
  candidates: readonly Candidate[];
  draft: IfaceFormDraft;
  /** "{{parent}}.{{id}}" once both are valid; "" before. */
  name: string;
  onChange: (draft: IfaceFormDraft) => void;
  onBlur: (field: VlanField) => void;
  errors: Partial<Record<VlanField, ReactNode>>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-muted-foreground">
        {t("network.term.vlan")}
      </p>
      {isNew ? (
        <>
          <IfaceCandidateSelect
            field="vlanrawdevice"
            label={t("vlan.runsOn")}
            placeholder={t("vlan.runsOnPlaceholder")}
            candidates={candidates}
            value={draft.vlanrawdevice}
            onChange={(vlanrawdevice) => onChange({ ...draft, vlanrawdevice })}
            onBlur={() => onBlur("vlanrawdevice")}
            error={errors.vlanrawdevice}
            disabled={disabled}
          />
          <div data-field="vlanid">
            <NumberField
              label={t("vlan.id")}
              hint={t("vlan.idHint")}
              value={draft.vlanid}
              onValueChange={(vlanid) => onChange({ ...draft, vlanid })}
              onBlur={() => onBlur("vlanid")}
              error={errors.vlanid}
              readOnly={disabled}
            />
          </div>
          {name === "" ? null : (
            <p>
              <Trans
                i18nKey="vlan.named"
                components={{ name: <Name value={name} /> }}
              />
            </p>
          )}
        </>
      ) : (
        <FactList>
          <FactListItem>
            <FactListLabel>{t("vlan.runsOn")}</FactListLabel>
            <FactListValue>
              <Name value={draft.vlanrawdevice} />
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("vlan.id")}</FactListLabel>
            <FactListValue>
              <Name value={draft.vlanid} />
            </FactListValue>
          </FactListItem>
        </FactList>
      )}
    </div>
  );
}
