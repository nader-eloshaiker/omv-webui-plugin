// SPDX-License-Identifier: GPL-3.0-or-later
// The disk or disks a file system is on (phase 5 file-systems design 1.3, column "On"): each a router
// link to the disk's page when it is in DiskMgmt.getList and its kernel name passes the address pattern,
// a RAID array as a link to its page (as text without the plugin), anything else as text. A missing file system: "Disk not connected".
import type { DiskDevice } from "@omv-webui/react-api-omv/generated";
import { Identifier } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { belongsTo, diskNames } from "../../disks/diskUse.ts";
import { placesOf, type Placed } from "../../filesystems/storageChoices.ts";
import { useRaidPlugin } from "../../hooks/useRaidReads.ts";
import { ArrayLink } from "../atoms/ArrayLink.tsx";
import { DiskLink } from "../atoms/DiskLink.tsx";

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
  const raidPlugin = useRaidPlugin(true) === "installed";
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
          // A device name never breaks inside itself: in a narrow table "/dev/sr0" would otherwise
          // stack one character per line. Several devices still wrap between names.
          <span key={device} className="whitespace-nowrap">
            {disk !== undefined ? (
              <DiskLink
                devicename={disk.devicename}
                device={disk.canonicaldevicefile}
              />
            ) : /^\/dev\/md\d+$/.test(device) ? (
              // The array's page when the plugin is known to be installed (RAID design 9.2).
              <ArrayLink devicefile={device} linked={raidPlugin} />
            ) : (
              <Identifier>{device}</Identifier>
            )}
          </span>
        );
      })}
    </span>
  );
}
