// SPDX-License-Identifier: GPL-3.0-or-later
// The start page (phase 3 design 1): is the NAS fine, and is there anything to do? For an
// administrator: the attention list, the set-up checklist while OMV's welcome flag is set, the System
// and Usage cards, and when the figures were last read. For a normal user, who gets only the time and
// the host name from the server: those two, and the way to their account. Pending changes are not
// repeated here: the band and the top bar say it.
//
// The figures come from the shell's System.getInformation poll, which is a background call (UI-14).
// A failed poll never blanks good data; "Try again" is a foreground read, because the reader asked.
import type {
  Role,
  SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { getSystemGetInformationQueryOptions } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { attentionRows } from "../../dashboard/dashboard.ts";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { MAIN_ID } from "../../shell/ids.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { AttentionList } from "../molecules/AttentionList.tsx";
import { FreshnessLine } from "../molecules/FreshnessLine.tsx";
import { SystemCard } from "../molecules/SystemCard.tsx";
import { UsageCard } from "../molecules/UsageCard.tsx";
import { SetupChecklist } from "../organisms/SetupChecklist.tsx";

export function DashboardPage() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return session.role === "admin" ? (
    <AdminDashboard username={session.username} />
  ) : (
    <UserDashboard username={session.username} role={session.role} />
  );
}

/** A foreground read of System.getInformation, for "Try again". */
function useReadAgain() {
  const queryClient = useQueryClient();
  return () => {
    queryClient
      .fetchQuery({ ...getSystemGetInformationQueryOptions(), staleTime: 0 })
      .catch(() => undefined);
  };
}

function LoadFailed({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      variant="error"
      serverMessage={
        isRpcError(error)
          ? { label: t("app.serverMessage"), text: error.message }
          : undefined
      }
      action={
        <Button variant="neutral" onClick={onRetry}>
          {t("common.tryAgain")}
        </Button>
      }
    >
      {t("dashboard.loadFailed")}
    </EmptyState>
  );
}

/**
 * When the checklist goes (hidden here, or by another administrator and seen on the next poll) and
 * focus was inside it, focus moves to the page title rather than being lost.
 */
function useFocusTitleWhenGone(visible: boolean) {
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    if (wasVisibleRef.current && !visible) {
      const id = window.setTimeout(() => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
          document.querySelector<HTMLElement>(`#${MAIN_ID} h1`)?.focus();
        }
      }, 0);
      wasVisibleRef.current = visible;
      return () => window.clearTimeout(id);
    }
    wasVisibleRef.current = visible;
    return undefined;
  }, [visible]);
}

function AdminDashboard({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const info = useSystemInformation("admin");
  const readAgain = useReadAgain();
  const data: SystemInformation | undefined = info.data;
  const showChecklist = data?.displayWelcomeMessage === true;
  useFocusTitleWhenGone(showChecklist);

  let content;
  if (data === undefined && info.isError) {
    content = <LoadFailed error={info.error} onRetry={readAgain} />;
  } else if (data === undefined) {
    content = (
      <div aria-busy="true" className="grid gap-4 lg:grid-cols-2">
        <p role="status" className="sr-only">
          {t("dashboard.loading")}
        </p>
        <SystemCard info={undefined} />
        <UsageCard info={undefined} />
      </div>
    );
  } else {
    content = (
      <>
        <AttentionList rows={attentionRows(data, info.dataUpdatedAt)} />
        {showChecklist ? (
          <SetupChecklist info={data} username={username} />
        ) : null}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SystemCard info={data} />
          <UsageCard info={data} />
        </div>
        <FreshnessLine
          updatedAt={info.dataUpdatedAt}
          failed={info.isRefetchError}
          retrying={info.isFetching}
          onRetry={readAgain}
        />
      </>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      {content}
    </div>
  );
}

function UserDashboard({
  username,
  role,
}: {
  username: string | null;
  role: Role;
}) {
  const { t } = useTranslation();
  const info = useSystemInformation(role);
  const readAgain = useReadAgain();
  const titleId = useId();
  const roleWord = t(`role.${role}`);
  const data = info.data;

  let card;
  if (data === undefined && info.isError) {
    card = <LoadFailed error={info.error} onRetry={readAgain} />;
  } else {
    card = (
      <Card render={<section aria-labelledby={titleId} />}>
        <CardHeader>
          <CardTitle id={titleId}>{t("dashboard.user.title")}</CardTitle>
        </CardHeader>
        <CardContent aria-busy={data === undefined || undefined}>
          {data === undefined ? (
            <>
              <p role="status" className="sr-only">
                {t("dashboard.loading")}
              </p>
              <FactListSkeleton rows={2} />
            </>
          ) : (
            <FactList>
              <FactListItem>
                <FactListLabel>{t("dashboard.system.name")}</FactListLabel>
                <FactListValue variant="identifier">
                  {data.hostname}
                </FactListValue>
              </FactListItem>
              <FactListItem>
                <FactListLabel>{t("dashboard.system.time")}</FactListLabel>
                <FactListValue>{data.time}</FactListValue>
              </FactListItem>
            </FactList>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle>{t("dashboard.title")}</PageTitle>
      {card}
      <p>
        {username === null
          ? t("dashboard.signedInRole", { role: roleWord })
          : t("dashboard.signedInAs", { username, role: roleWord })}
      </p>
      <p>
        {t("dashboard.user.account")}{" "}
        <Link to="/account/settings" className="text-action-label underline">
          {t("dashboard.user.accountLink")}
        </Link>
      </p>
    </div>
  );
}
