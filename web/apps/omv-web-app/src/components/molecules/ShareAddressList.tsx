// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's two network addresses (phase 5 shares design 0.2, 2.3, 4.2; D4): from Windows
// `\\host\name`, from a Mac `smb://host/name`, each as TEXT with a copy button, never a link (UI-3:
// the address is built from the server's host name and the folder's name, so it is never navigated
// to, opened or fetched).
import { CopyButton, Identifier } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { shareAddresses } from "../../sharedFolders/smbModel.ts";

export function ShareAddressList({
  hostname,
  folder,
}: {
  hostname: string;
  folder: string;
}) {
  const { t } = useTranslation();
  const addresses = shareAddresses(hostname, folder);
  const rows = [
    {
      id: "windows",
      label: t("sharedFolder.fact.addressWindows"),
      text: addresses.windows,
      copy: t("sharedFolder.copyWindows", { folder: inertBidi(folder) }),
    },
    {
      id: "mac",
      label: t("sharedFolder.fact.addressMac"),
      text: addresses.mac,
      copy: t("sharedFolder.copyMac", { folder: inertBidi(folder) }),
    },
  ];
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="text-sm text-muted-foreground">{row.label}</span>
          <Identifier dir="ltr" className="[overflow-wrap:anywhere]">
            {inertBidi(row.text)}
          </Identifier>
          <CopyButton
            text={row.text}
            label={row.copy}
            copiedLabel={t("common.copied")}
            selectedLabel={t("common.copySelected")}
            size="icon-sm"
          />
        </li>
      ))}
    </ul>
  );
}
