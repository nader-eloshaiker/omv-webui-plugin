// SPDX-License-Identifier: GPL-3.0-or-later
// The three share options inside "Add a shared folder" (phase 5 shares design 6.2 C6, 4.3, 4.4): shown
// in the network list (on), read only for everyone (off), and, after a gap so that it reads as its own
// choice, guest access (off, never preselected, Q6), the same field as a folder's own share form: its
// warnings are the box's description, heard when the box is reached. When Windows and Mac sharing is off, the last line says sharing this
// folder turns it on.
import { CheckboxField } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { GuestAccessField } from "../molecules/GuestAccessField.tsx";

export interface SmbOptionValues {
  browseable: boolean;
  readonly: boolean;
  guest: boolean;
}

export function AddShareSmbOptions({
  values,
  onChange,
  folder,
  smbOff,
}: {
  values: SmbOptionValues;
  onChange: (values: SmbOptionValues) => void;
  /** The folder's name as typed, for the guest warning; "" while none is typed. */
  folder: string;
  /** Windows and Mac sharing is off for the NAS now. */
  smbOff: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 ps-6">
      <CheckboxField
        label={t("folderSmb.form.browseable")}
        hint={t("folderSmb.form.browseableHint")}
        checked={values.browseable}
        onCheckedChange={(on: boolean) =>
          onChange({ ...values, browseable: on })
        }
      />
      <CheckboxField
        label={t("folderSmb.form.readonly")}
        hint={t("folderSmb.form.readonlyHint")}
        checked={values.readonly}
        onCheckedChange={(on: boolean) => onChange({ ...values, readonly: on })}
      />
      <GuestAccessField
        checked={values.guest}
        onCheckedChange={(on) => onChange({ ...values, guest: on })}
        folder={folder}
      />
      {smbOff ? (
        <p className="max-w-prose text-sm">{t("folderSmb.form.smbOff")}</p>
      ) : null}
    </div>
  );
}
