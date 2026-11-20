// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SSH (phase 3 design 3), for administrators. A normal user who types the address gets the
// "only administrators" page, and nothing is called first (UI-4). The page marks itself pending while
// `ssh` has saved changes waiting; the band does the rest.
import { useSshGet } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  EmptyState,
  InlineAlert,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useSession } from "../../session/sessionContext.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { SshSettingsForm } from "../organisms/SshSettingsForm.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function SshPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("ssh.title")} />;
  }
  return <SshSettings />;
}

function FormSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex max-w-[40rem] flex-col gap-5">
      <p role="status" className="sr-only">
        {t("ssh.loading")}
      </p>
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={`skeleton-${String(i)}`}
          aria-hidden="true"
          className="flex flex-col gap-1"
        >
          <Skeleton className="w-40" />
          <Skeleton
            shape="block"
            className={i === 1 ? "h-8 w-24" : "h-5 w-2/3"}
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

function SshSettings() {
  const { t } = useTranslation();
  const ssh = useSshGet();
  const info = useSystemInformation("admin");
  const pending = pendingModules(info.data?.dirtyModules).includes("ssh");
  // Pending when the page opened: the form shows saved settings that are not in effect yet.
  const [pendingOnArrival] = useState(pending);

  let content;
  if (ssh.data === undefined && ssh.isError) {
    content = (
      <EmptyState
        variant="error"
        serverMessage={
          isRpcError(ssh.error)
            ? { label: t("app.serverMessage"), text: ssh.error.message }
            : undefined
        }
        action={
          <Button variant="neutral" onClick={() => void ssh.refetch()}>
            {t("common.tryAgain")}
          </Button>
        }
      >
        {t("ssh.loadFailed")}
      </EmptyState>
    );
  } else if (ssh.data === undefined) {
    content = <FormSkeleton />;
  } else {
    content = <SshSettingsForm saved={ssh.data} pending={pending} />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageTitle>{t("ssh.title")}</PageTitle>
        {pending ? <PendingMark /> : null}
      </div>
      <p className="max-w-prose">{t("ssh.intro")}</p>
      {pendingOnArrival && pending ? (
        <InlineAlert tone="neutral" role="note">
          {t("ssh.pendingOnArrival")}
        </InlineAlert>
      ) : null}
      {content}
    </div>
  );
}
