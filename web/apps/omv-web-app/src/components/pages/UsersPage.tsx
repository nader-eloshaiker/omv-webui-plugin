// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Users (phase 5 users design 1), for administrators: who can use this NAS, and which of them
// can control it? Leads to a person's page and to adding a person. The whole list is read on opening,
// on Refresh and on window focus (D2), with the groups, SSH's settings and the services for the
// summary and the columns; a side read that fails takes away only what it feeds (1.4). The unfinished
// work of this session's add and delete flows is recognised from server state (1.5, R8). A normal user
// who types the address gets the "only administrators" page, and nothing is called first (UI-4).
import {
  ExternalLink,
  InlineAlert,
  Skeleton,
  TableSkeletonRows,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useFormat } from "../../format/useFormat.ts";
import { useSharedFoldersAll } from "../../hooks/useSharesReads.ts";
import {
  useGroups,
  usePeople,
  useSshSettings,
} from "../../hooks/useUsersReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { isFolderAddress } from "../../sharedFolders/folderAddress.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { controlSummary } from "../../users/usersList.ts";
import {
  unfinishedPeople,
  usersSession,
  type UnfinishedPerson,
} from "../../users/usersSession.ts";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PersonLink } from "../atoms/PersonLink.tsx";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { UsersControlCard } from "../organisms/UsersControlCard.tsx";
import { UsersTable } from "../organisms/UsersTable.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function UsersPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("users.title")} />;
  }
  return <Users selfName={session.username} />;
}

/** One unfinished-work line (1.5) with its action. */
function UnfinishedLine({ work }: { work: UnfinishedPerson }) {
  const { t } = useTranslation();
  const name = <PersonNameText value={work.name} />;
  if (work.kind === "staleAccess") {
    const list = new Intl.ListFormat(undefined, { type: "conjunction" }).format(
      work.folders.map((f) => isolateName(f.name)),
    );
    return (
      <InlineAlert tone="neutral">
        <p>
          <Trans
            i18nKey="users.unfinished.staleAccess"
            values={{ folders: list }}
            components={{ name }}
          />
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {work.folders
            .filter((f) => isFolderAddress(f.uuid))
            .map((f) => (
              <Link
                key={f.uuid}
                to="/storage/shared-folders/$folder"
                params={{ folder: f.uuid }}
                hash="folder-access"
                className={routerLinkClass}
              >
                {t("personAccess.open", { folder: inertBidi(f.name) })}
              </Link>
            ))}
        </p>
      </InlineAlert>
    );
  }
  return (
    <InlineAlert tone="neutral">
      <p>
        <Trans
          i18nKey={`users.unfinished.${work.kind}`}
          components={{ name }}
        />
      </p>
      <p>
        <PersonLink
          name={work.name}
          label={t("users.open", { name: inertBidi(work.name) })}
          hash={work.kind === "access" ? "person-access" : undefined}
        />
      </p>
    </InlineAlert>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p role="status" className="text-muted-foreground">
        {t("users.loading")}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton shape="block" className="h-6 w-56" />
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/2" />
      </div>
      <table aria-hidden="true" className="w-full">
        <tbody>
          <TableSkeletonRows rows={5} columns={6} />
        </tbody>
      </table>
    </div>
  );
}

function Users({ selfName }: { selfName: string | null }) {
  const { t } = useTranslation();
  const format = useFormat();
  const people = usePeople({ focus: true });
  const groups = useGroups({ focus: true });
  const ssh = useSshSettings({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const memory = useMemoryStore(usersSession);

  const footer = (
    <div className="flex flex-col gap-1 pt-3 text-sm text-muted-foreground">
      <p>{t("users.footer.admin")}</p>
      <p>
        {t("users.footer.classic")}{" "}
        <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
          {t("users.classicLink")}
        </ExternalLink>
      </p>
    </div>
  );

  let content;
  if (people.data === undefined) {
    content = people.isError ? (
      <>
        <ReadFailed
          error={people.error}
          retrying={people.isFetching}
          onRetry={() => void people.refetch()}
        >
          {t("users.loadFailed")}
        </ReadFailed>
        {footer}
      </>
    ) : (
      <Loading />
    );
  } else {
    const list = people.data.data;
    const omvGroups = groups.data?.data ?? [];
    const unfinished = unfinishedPeople(memory, list, folders.data?.data);
    const refresh = () => {
      void people.refetch();
      void groups.refetch();
      void ssh.refetch();
      void folders.refetch();
    };
    content = (
      <>
        <UsersControlCard
          summary={controlSummary(list, omvGroups)}
          sshUnread={ssh.isError}
          firstLineOnly={list.length === 0}
        />
        {unfinished.map((work) => (
          <UnfinishedLine key={`${work.kind}:${work.name}`} work={work} />
        ))}
        <UsersTable
          users={list}
          groups={{
            data: groups.data?.data,
            failed: groups.isError && groups.data === undefined,
            error: groups.error,
            retrying: groups.isFetching,
            retry: () => void groups.refetch(),
          }}
          selfName={selfName}
          readAt={t("sharedFolders.lastRefreshed", {
            time: format.clock(people.dataUpdatedAt),
          })}
          refreshing={people.isFetching}
          onRefresh={refresh}
          footer={footer}
        />
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageTitle>{t("users.title")}</PageTitle>
      <p className="max-w-prose">{t("users.term.person")}</p>
      {content}
    </div>
  );
}
