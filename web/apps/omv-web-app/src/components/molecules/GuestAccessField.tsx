// SPDX-License-Identifier: GPL-3.0-or-later
// "Also let in anyone on the network, without a password" (phase 5 shares design 4.3, 6.2 C6; Q6):
// its own choice after a 16px gap, never preselected, on a folder's share form and in the add flow.
// When ticked, the warning-shape neutral notice (not a pill: it is a choice) sits inside the field's
// hint, so the hint and every warning line are the box's description: Base UI's Field links the hint
// to the box through `aria-describedby`, and a screen reader hears the warning when the box is
// reached, not only when it appears (15.2). The notice is not a live region of its own (`role="none"`),
// so it is not announced twice.
import {
  Checkbox,
  Field,
  FieldHint,
  FieldLabel,
  InlineAlert,
} from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { FolderNameText } from "../atoms/FolderNameText.tsx";

export function GuestAccessField({
  checked,
  onCheckedChange,
  folder,
  guestsOnly = false,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The folder's name for the warning; "" while none is typed. */
  folder: string;
  /** "Guests only" is set in the classic interface: one more line says saving here changes it. */
  guestsOnly?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Field disabled={disabled} className="mt-4 gap-0.5">
      <FieldLabel className="flex w-fit items-start gap-2 font-regular data-disabled:cursor-not-allowed">
        <span className="flex h-[1lh] shrink-0 items-center">
          <Checkbox
            disabled={disabled}
            checked={checked}
            onCheckedChange={(next) => onCheckedChange(next)}
          />
        </span>
        <span className="min-w-0">{t("folderSmb.form.guest")}</span>
      </FieldLabel>
      <FieldHint render={<div />} className="flex flex-col gap-2 ps-6">
        <span>{t("folderSmb.form.guestHint")}</span>
        {checked ? (
          <InlineAlert tone="neutral" icon="warning" role="none">
            <span className="flex flex-col gap-1">
              <span>
                <Trans
                  i18nKey="folderSmb.form.guestWarn"
                  components={{ folder: <FolderNameText value={folder} /> }}
                />
              </span>
              <span>{t("folderSmb.form.guestMode")}</span>
              {guestsOnly ? <span>{t("folderSmb.form.guestOnly")}</span> : null}
            </span>
          </InlineAlert>
        ) : null}
      </FieldHint>
    </Field>
  );
}
