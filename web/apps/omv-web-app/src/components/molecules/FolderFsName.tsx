// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's file system by name (phase 5 shares design 0.2, 2.3): the file-systems slice's
// name rule, as a router link to its page when it has one (a ZFS file system to its ZFS page), else as
// text. The address is the row's own identifier, never text typed or taken from this page's address.
import type { ConfiguredFilesystem } from "@omv-webui/react-api-omv/generated";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { fsPage } from "../../sharedFolders/folderPage.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FsNameView } from "../atoms/FsNameView.tsx";

export function FolderFsName({
  fs,
  link = true,
  children,
}: {
  fs: ConfiguredFilesystem;
  /** False for the name alone, inside a sentence that already has its link. */
  link?: boolean;
  /** The link's words, when not the name ("Open Media"). */
  children?: string;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const name = shownFsName(fs);
  const page = link ? fsPage(fs) : null;
  const shown = children ?? <FsNameView name={name} />;
  if (page === null) {
    return <FsNameView name={name} />;
  }
  return page.kind === "zfs" ? (
    <Link
      to="/storage/zfs/fs/$"
      params={{ _splat: page.name }}
      aria-label={
        children === undefined
          ? t("filesystems.openZfs", { name: inertBidi(page.name) })
          : undefined
      }
      className={routerLinkClass}
    >
      {shown}
    </Link>
  ) : (
    <Link
      to="/storage/filesystems/$fs"
      params={{ fs: page.address }}
      aria-label={
        children === undefined
          ? t("filesystems.open", { name: words.nameOf(name) })
          : undefined
      }
      className={routerLinkClass}
    >
      {shown}
    </Link>
  );
}
