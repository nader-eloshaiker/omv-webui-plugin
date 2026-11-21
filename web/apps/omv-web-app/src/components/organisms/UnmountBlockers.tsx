// SPDX-License-Identifier: GPL-3.0-or-later
// Why a file system cannot be unmounted or removed now, in words, each with what to do (phase 5
// file-systems design 5.1; owner, P9). The links lead to removing the blocker (the shared folders),
// never round it: the classic File systems page refuses the same unmount while it is used.
import { ExternalLink } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { UnmountBlocker } from "../../filesystems/fsModel.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

function Line({ blocker }: { blocker: UnmountBlocker }) {
  const { t } = useTranslation();
  const newTab = t("app.newTab");
  switch (blocker.kind) {
    case "shared":
      return (
        <>
          <p dir="auto">
            {t("fsUnmount.blocked.shared", { list: blocker.names.join(", ") })}
          </p>
          <p className="text-sm">{t("fsUnmount.blocked.sharedDo")}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to="/storage/shared-folders" className={routerLinkClass}>
              {t("filesystem.usedBy.openShared")}
            </Link>
            <ExternalLink href={CLASSIC.sharedFolders} newTabLabel={newTab}>
              {t("fsUnmount.sharedLink")}
            </ExternalLink>
          </p>
        </>
      );
    case "used":
      return <p>{t("fsUnmount.blocked.used")}</p>;
    case "other":
      return (
        <>
          <p>{t("fsUnmount.blocked.other")}</p>
          <p className="text-sm">
            <ExternalLink href={CLASSIC.fileSystems} newTabLabel={newTab}>
              {t("filesystems.classicLink")}
            </ExternalLink>
          </p>
        </>
      );
    case "readOnly":
      return <p>{t("fsUnmount.blocked.readOnly")}</p>;
    case "creating":
      return <p>{t("fsUnmount.blocked.creating")}</p>;
    case "noFstab":
      return <p>{t("fsUnmount.blocked.noFstab")}</p>;
    case "busy":
      return <p>{t("fsUnmount.blocked.busy")}</p>;
  }
}

export function UnmountBlockers({
  blockers,
  id,
}: {
  blockers: readonly UnmountBlocker[];
  id?: string;
}) {
  return (
    <ul id={id} data-slot="unmount-blockers" className="flex flex-col gap-3">
      {blockers.map((blocker) => (
        <li key={blocker.kind} className="flex max-w-prose flex-col gap-1">
          <Line blocker={blocker} />
        </li>
      ))}
    </ul>
  );
}
