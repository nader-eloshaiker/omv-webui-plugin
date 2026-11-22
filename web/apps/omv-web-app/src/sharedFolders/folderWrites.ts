// SPDX-License-Identifier: GPL-3.0-or-later
// ShareMgmt.set on an existing shared folder (phase 5 shares design 0.10, 2.6, 7): the fields of the
// row just read from ShareMgmt.getList (`uuid`, `name`, `comment`, `mntentref`, `reldirpath`) with the
// one change; OMV keeps the access list itself (observed). Pointing the folder somewhere else always
// sends mode 770, so a folder made there gets the same file permissions as a new one (section 7, Q4).
// The stored `reldirpath` keeps its trailing slash, which the contract accepts. Pure.
import type {
  ShareMgmtSetRequest,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";

export type FolderChange =
  /** 2.6: the description only. */
  | { kind: "description"; comment: string }
  /** 7: where it points, on a folder that cannot be reached. */
  | { kind: "repoint"; mntentref: string; reldirpath: string };

export function folderSetRequest(
  row: Pick<
    SharedFolder,
    "uuid" | "name" | "comment" | "mntentref" | "reldirpath"
  >,
  change: FolderChange,
): ShareMgmtSetRequest {
  const base: ShareMgmtSetRequest = {
    uuid: row.uuid,
    name: row.name,
    comment: row.comment,
    mntentref: row.mntentref,
    reldirpath: row.reldirpath,
  };
  if (change.kind === "description") {
    return { ...base, comment: change.comment };
  }
  return {
    ...base,
    mntentref: change.mntentref,
    reldirpath: change.reldirpath,
    mode: "770",
  };
}
