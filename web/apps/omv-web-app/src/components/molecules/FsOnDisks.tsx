// SPDX-License-Identifier: GPL-3.0-or-later
// The disk or disks a file system is on (phase 5 file-systems design 1.3, column "On"): each a router
// link to the disk's page when it is in DiskMgmt.getList and its kernel name passes the address pattern,
// a RAID array as text, anything else as text. A missing file system: "Disk not connected".
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { Identifier } from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import { placesOf, type Placed } from "../../filesystems/storageChoices.ts";
import { DiskLink } from "../atoms/DiskLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

export function FsOnDisks({
  fs,
  disks,
  perLine = false,
}: {
  fs: Placed;
  disks: readonly DiskDevice[] | undefined;
  /** One disk per line, on a file system's page. */
  perLine?: boolean;
}) {
  const { t } = useTranslation();
  const places = placesOf(fs);
  if (fs.status === 3 || places.length === 0) {
    return (
      <span className="text-muted-foreground">{t("filesystems.diskGone")}</span>
    );
  }
  return (
    <span
      className={perLine ? "flex flex-col gap-0.5" : "flex flex-wrap gap-x-2"}
    >
      {places.map((device) => {
        const disk = disks?.find((d) => belongsTo(device, diskNames(d)));
        return (
          <span key={device}>
            {disk !== undefined ? (
              <DiskLink
                devicename={disk.devicename}
                device={disk.canonicaldevicefile}
              />
            ) : /^\/dev\/md\d+$/.test(device) ? (
              <Trans
                i18nKey="filesystems.raidOn"
                components={{ device: <IdentifierText value={device} /> }}
              />
            ) : (
              <Identifier>{device}</Identifier>
            )}
          </span>
        );
      })}
    </span>
  );
}
