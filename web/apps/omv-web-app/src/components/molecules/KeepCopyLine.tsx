// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's "Keep a copy of this folder…" (phase 5 services design 5, 12.1): a line after Used
// by, shown always, that opens "Add a copy job" with this folder chosen as the source. The folder is
// handed over in the session store, never in the address (13.2, UI-4); opening the flow only reads.
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { handOverSource } from "../../services/jobsSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";

export function KeepCopyLine({ uuid }: { uuid: string }) {
  const { t } = useTranslation();
  return (
    <p>
      <Link
        to="/services/rsync/jobs/add"
        className={routerLinkClass}
        onClick={() => handOverSource(uuid)}
      >
        {t("folderPage.keepCopy")}
      </Link>
    </p>
  );
}
