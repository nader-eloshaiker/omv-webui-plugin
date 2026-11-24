// SPDX-License-Identifier: GPL-3.0-or-later
// Create a ZFS pool (phase 5 ZFS design 3; UX audit R1 to R10), for administrators. Opening it only
// reads (R9). While anything is pending the flow does not start (R1, Q2). A run of this session, under
// way or ended and not dismissed, is shown instead of the form: one ZFS run at a time. A normal user
// gets the "only administrators" page, and nothing is called first (UI-4).
import { JobRunner } from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useZfsPlugin } from "../../hooks/useZfsReads.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { zfsFlowStore, type ZfsRun } from "../../zfs/zfsRun.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { ZfsNotInstalled } from "../molecules/ZfsNotInstalled.tsx";
import { FlowPreflight } from "../organisms/FlowPreflight.tsx";
import { ZfsCreateDecisions } from "../organisms/ZfsCreateDecisions.tsx";
import { ZfsRunView } from "../organisms/ZfsRunView.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";
import { ZfsCrumbs } from "./ZfsPoolPage.tsx";

export function ZfsCreatePage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("zfs.title")} />;
  }
  return <ZfsCreate />;
}

/** Another ZFS run of this session is under way: where to see it. */
export function OtherZfsRun({ run }: { run: ZfsRun }) {
  const { t } = useTranslation();
  const { choices } = run;
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-prose">{t("zfs.otherRun")}</p>
      <p>
        {choices.kind === "create" ? (
          <Link to="/storage/zfs/create" className={routerLinkClass}>
            {t("zfs.otherRunLink")}
          </Link>
        ) : (
          <Link
            to={
              choices.kind === "addFs"
                ? "/storage/zfs/pools/$pool/add"
                : "/storage/zfs/pools/$pool/replace"
            }
            params={{ pool: choices.pool }}
            className={routerLinkClass}
          >
            {t("zfs.otherRunLink")}
          </Link>
        )}
      </p>
    </div>
  );
}

function ZfsCreate() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  const plugin = useZfsPlugin(true);
  const { run } = useMemoryStore(zfsFlowStore);
  const pending = pendingModules(info.data?.dirtyModules);

  let content;
  if (plugin === "missing") {
    content = <ZfsNotInstalled />;
  } else if (run !== null && run.choices.kind === "create") {
    content = <ZfsRunView run={run} />;
  } else if (run !== null) {
    content = <OtherZfsRun run={run} />;
  } else if (info.data === undefined || plugin === "checking") {
    content = (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addStorage.loading")}
      </p>
    );
  } else if (pending.length > 0 || info.data.configDirty === true) {
    content = (
      <FlowPreflight modules={pending} body={t("zfsCreate.preflightBody")} />
    );
  } else {
    content = <ZfsCreateDecisions />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ZfsCrumbs pool={null} current={t("zfsCreate.breadcrumb")} />
      <PageTitle documentTitle={t("zfsCreate.documentTitle")}>
        {t("zfsCreate.title")}
      </PageTitle>
      <JobRunner title={t("zfsCreate.runnerTitle")}>{content}</JobRunner>
    </div>
  );
}
