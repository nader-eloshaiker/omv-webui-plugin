// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Disk health > Settings (phase 5 disks design 5), for administrators: how the NAS watches
// the disks. A normal user who types the address gets the "only administrators" page, and nothing is
// called first (UI-4). Smart.getSettings reads configuration only; it wakes no disk.
import { Button, Skeleton } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { useSmartSettings } from "../../hooks/useDiskReads.ts";
import { useSmartPending } from "../../hooks/useSmartPending.ts";
import { useSession } from "../../session/sessionContext.ts";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { SmartSettingsForm } from "../organisms/SmartSettingsForm.tsx";
import { SmartTabsFrame } from "../templates/SmartTabsFrame.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SmartSettingsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("smart.title")} />;
  }
  return (
    <SmartTabsFrame tab="settings">
      <Settings />
    </SmartTabsFrame>
  );
}

function FormSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex max-w-[40rem] flex-col gap-5">
      <p role="status" className="sr-only">
        {t("smart.settings.loading")}
      </p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} aria-hidden="true" className="flex flex-col gap-1">
          <Skeleton className="w-48" />
          <Skeleton
            shape="block"
            className={i === 2 ? "h-24 w-2/3" : "h-8 w-1/2"}
          />
        </div>
      ))}
      <div className="flex gap-3">
        <Button disabled>{t("common.save")}</Button>
        <Button variant="neutral" disabled>
          {t("common.discard")}
        </Button>
      </div>
    </div>
  );
}

function Settings() {
  const { t } = useTranslation();
  const settings = useSmartSettings();
  const pending = useSmartPending();
  if (settings.data === undefined && settings.isError) {
    return (
      <ReadFailed
        error={settings.error}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      >
        {t("smart.settings.loadFailed")}
      </ReadFailed>
    );
  }
  if (settings.data === undefined) {
    return <FormSkeleton />;
  }
  return <SmartSettingsForm saved={settings.data} pending={pending} />;
}
