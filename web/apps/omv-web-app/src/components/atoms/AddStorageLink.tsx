// SPDX-License-Identifier: GPL-3.0-or-later
// "Add storage on this disk" (phase 5 file-systems design 9, D17): a router link to Flow A that hands
// the disk over in memory, never in the address, so no address leads towards erasing a disk and nothing
// about the disk is in the history. The flow still checks the disk again, and a disk that is no longer
// offered is simply not chosen.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { handOffDisk } from "../../filesystems/fsSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function AddStorageLink({
  devicefile,
  children,
}: {
  /** The disk's stable device file from DiskMgmt.getList. */
  devicefile: string;
  children: ReactNode;
}) {
  return (
    <Link
      to="/storage/filesystems/add"
      className={routerLinkClass}
      onClick={() => handOffDisk(devicefile)}
    >
      {children}
    </Link>
  );
}
