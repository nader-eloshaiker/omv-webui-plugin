// SPDX-License-Identifier: GPL-3.0-or-later
// A bridge's own fields (phase 5 network design 9.1), before the address part: the term, the
// interfaces in the bridge (optional: a bridge with none joins only virtual machines and containers;
// interfaces with settings of their own are not offered, 0.8, though OMV's list includes a bond with
// settings; this page's own interface listed unavailable), and for a new bridge "The NAS names it br0."
import {
  CheckboxField,
  CheckboxListField,
  IsolatedIdentifier,
} from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import {
  toggleMember,
  type IfaceFormDraft,
  type MemberChoice,
} from "../../network/ifaceForm.ts";
import { ThisPageMember } from "./BondFields.tsx";
import { CandidateWords } from "./IfaceCandidateSelect.tsx";

export function BridgeFields({
  isNew,
  name,
  choices,
  draft,
  onChange,
  disabled,
}: {
  isNew: boolean;
  /** The name OMV will give a new bridge. */
  name: string;
  choices: readonly MemberChoice[];
  draft: IfaceFormDraft;
  onChange: (draft: IfaceFormDraft) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-prose text-muted-foreground">
        {t("network.term.bridge")}
      </p>
      <div data-field="slaves">
        <CheckboxListField
          legend={t("bridge.members")}
          hint={t("bridge.membersHint")}
        >
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
              onCheckedChange={(checked) =>
                onChange(toggleMember(draft, candidate.devicename, checked))
              }
            />
          ))}
        </CheckboxListField>
      </div>
      {isNew ? (
        <p>
          <Trans
            i18nKey="bridge.named"
            components={{
              name: <IsolatedIdentifier value={inertBidi(name)} />,
            }}
          />
        </p>
      ) : null}
    </div>
  );
}
