// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's name as a router link to its own page (phase 5 shares design 9.1, D1): the page is
// addressed by the folder's UUID, which the server gave; a value outside the UUID pattern is shown as
// text with no link, so no address is built from anything else. The name is text, in its own
// direction, never cut short, its bidirectional controls shown as "�" (UI-2; format/isolate.ts).
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function FolderLink({
  uuid,
  name,
  className,
}: {
  uuid: string | undefined;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!isFolderAddress(uuid)) {
    return (
      <bdi dir="auto" className="font-medium break-words">
        {inertBidi(name)}
      </bdi>
    );
  }
  return (
    <Link
      to="/storage/shared-folders/$folder"
      params={{ folder: uuid }}
      aria-label={t("sharedFolders.open", { folder: inertBidi(name) })}
      className={`${routerLinkClass} break-words ${className ?? ""}`}
    >
      <bdi dir="auto">{inertBidi(name)}</bdi>
    </Link>
  );
}
