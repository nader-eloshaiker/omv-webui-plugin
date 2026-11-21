// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's device, as a router link to its page (phase 5 disks design 0.5, 8): "Open disk /dev/sdb".
// The address takes the disk's kernel name from a reply only when it passes the address pattern;
// otherwise (a hardware RAID name such as "cciss!c0d0") the device stays text, with no link.
import { Identifier } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { isDiskName } from "../../disks/diskWords.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function DiskLink({
  devicename,
  device,
}: {
  /** The kernel name, such as "sdb". */
  devicename: string;
  /** What the link shows: the canonical device file, such as "/dev/sdb". */
  device: string;
}) {
  const { t } = useTranslation();
  if (!isDiskName(devicename)) {
    return <Identifier>{device}</Identifier>;
  }
  return (
    <Link
      to="/storage/disks/$disk"
      params={{ disk: devicename }}
      aria-label={t("disks.openDisk", { device })}
      className={routerLinkClass}
    >
      <Identifier>{device}</Identifier>
    </Link>
  );
}
