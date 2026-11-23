// SPDX-License-Identifier: GPL-3.0-or-later
// A folder's NFS address (phase 5 services design 0.2, D9): `NAS_HOST:/export/{{folder}}` and, when
// an NFSv4 version is offered, `NAS_HOST:/{{folder}}` labelled NFSv4. Text to copy, never a link
// (UI-3), each with its own copy button whose name says which address it copies.
import { CopyButton, Identifier } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { nfsAddresses } from "../../services/nfsModel.ts";

export function NfsAddressList({
  hostname,
  folder,
  versions,
}: {
  hostname: string;
  folder: string;
  versions: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-1">
      {nfsAddresses(hostname, folder, versions).map((address) => (
        <li
          key={address.kind}
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          {address.kind === "v4" ? (
            <span className="text-sm text-muted-foreground">
              {t("folderNfs.fact.addressV4")}
            </span>
          ) : null}
          <Identifier dir="ltr" className="[overflow-wrap:anywhere]">
            {inertBidi(address.text)}
          </Identifier>
          <CopyButton
            text={address.text}
            label={t(
              address.kind === "v4" ? "folderNfs.copyV4" : "folderNfs.copy",
              { folder: inertBidi(folder) },
            )}
            copiedLabel={t("common.copied")}
            selectedLabel={t("common.copySelected")}
            size="icon-sm"
          />
        </li>
      ))}
    </ul>
  );
}
