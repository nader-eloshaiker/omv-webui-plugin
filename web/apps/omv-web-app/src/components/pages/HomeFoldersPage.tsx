// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Settings, "Home folders" (phase 5 users design 12, D15; P12), for administrators: whether
// each person has a private folder on the NAS and where, turning them on in a shared folder that may
// hold them (OK, mounted, not on the system drive, not a whole file system: settled on the test VM),
// and turning them off. Both are plain confirmations (nothing is erased); each sends both fields of
// UserMgmt.setSettings, which works for every person inside the request and leaves Windows and Mac
// sharing pending (the band). Moving them to another shared folder stays in the classic interface.
// Fail closed: a read the offer rests on that failed leaves nothing offered, with its sentence and
// "Try again". A normal user who types the address gets the "only administrators" page, and nothing
// is called first.
import {
  ExternalLink,
  Skeleton,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { homeState, type HomeState } from "../../homeFolders/homeModel.ts";
import {
  forgetHomePending,
  homePending,
  homeSession,
} from "../../homeFolders/homeSession.ts";
import { useHomeSettings } from "../../hooks/useGroupsApi.ts";
import {
  useShareFileSystems,
  useSharedFoldersAll,
  useSharesSystem,
  useSmbSettings,
  useUserAccounts,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { folderFs } from "../../sharedFolders/shareActions.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { FolderStateView } from "../molecules/FolderStateView.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { HomeFoldersTurnOff } from "../organisms/HomeFoldersTurnOff.tsx";
import { HomeFoldersTurnOn } from "../organisms/HomeFoldersTurnOn.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function HomeFoldersPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("homeFolders.title")} />;
  }
  return <HomeFolders />;
}

function HomeFolders() {
  const { t } = useTranslation();
  const settings = useHomeSettings({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const fileSystems = useShareFileSystems({ focus: true });
  const smb = useSmbSettings({ focus: true });
  const users = useUserAccounts({ focus: true });
  const system = useSharesSystem();
  const memory = useMemoryStore(homeSession);
  const stateRef = useRef<HTMLParagraphElement>(null);
  const pending = system.pending ?? [];

  useEffect(() => {
    if (system.pending !== undefined) {
      forgetHomePending(system.pending);
    }
  }, [system.pending]);

  const people = users.data?.data.length;
  const smbOn = smb.data?.enable === true;
  const homesShared = smbOn && smb.data?.homesenable === true;

  let content;
  if (settings.data === undefined && settings.isError) {
    content = (
      <ReadFailed
        error={settings.error}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      >
        {t("homeFolders.loadFailed")}
      </ReadFailed>
    );
  } else if (
    settings.data === undefined ||
    (folders.data === undefined && !folders.isError)
  ) {
    content = (
      <div className="flex flex-col gap-4">
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("homeFolders.loading")}
        </p>
        <Skeleton className="h-6 w-80 max-w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full max-w-xl" />
        ))}
      </div>
    );
  } else if (folders.data === undefined) {
    content = (
      <ReadFailed
        error={folders.error}
        onRetry={() => void folders.refetch()}
        retrying={folders.isFetching}
      >
        {t("sharedFolders.loadFailed")}
      </ReadFailed>
    );
  } else {
    const folderRows = folders.data.data;
    const fsRows = fileSystems.data?.data;
    const state = homeState(settings.data, folderRows, fsRows ?? [], pending);
    const fsFailed = fileSystems.isError && fileSystems.data === undefined;
    const fsRead = (
      <ReadFailed
        error={fileSystems.error}
        onRetry={() => void fileSystems.refetch()}
        retrying={fileSystems.isFetching}
      >
        {t("filesystems.loadFailed")}
      </ReadFailed>
    );
    const fsLoading = (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full max-w-xl" />
        ))}
      </div>
    );
    const shownFolder =
      state.kind === "off"
        ? undefined
        : state.kind === "on"
          ? state.folder
          : undefined;
    content = (
      <>
        <StateLine
          state={state}
          fsKnown={fsRows !== undefined}
          fs={
            shownFolder === undefined || fsRows === undefined
              ? undefined
              : folderFs(shownFolder, fsRows)
          }
          pending={homePending(memory, pending)}
          stateRef={stateRef}
        />
        {state.kind === "off" ? (
          fsFailed ? (
            fsRead
          ) : fsRows === undefined ? (
            fsLoading
          ) : (
            <HomeFoldersTurnOn
              folders={folderRows}
              fileSystems={fsRows}
              pending={pending}
              kept={settings.data.sharedfolderref}
              people={people}
              homesShared={homesShared}
              stateRef={stateRef}
            />
          )
        ) : (
          <div className="flex flex-col gap-3">
            {state.kind === "on" ? (
              <p className="max-w-prose">
                <Trans
                  i18nKey="homeFolders.onLine"
                  components={{
                    folder: <FolderNameText value={state.folder.name} />,
                  }}
                />
              </p>
            ) : null}
            <HomeFoldersTurnOff
              folder={state.kind === "on" ? state.folder : undefined}
              homesShared={homesShared}
              stateRef={stateRef}
            />
            {state.kind === "on" ? (
              <>
                {fsFailed ? fsRead : null}
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t("homeFolders.move")}{" "}
                  <ExternalLink
                    href={CLASSIC.userSettings}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("homeFolders.classicLink")}
                  </ExternalLink>
                </p>
              </>
            ) : null}
          </div>
        )}
        {smbOn ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {homesShared ? t("homeFolders.smbYes") : t("homeFolders.smbNo")}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PageTitle>{t("homeFolders.title")}</PageTitle>
        <p className="text-sm text-muted-foreground">
          {t("homeFolders.subtitle")}
        </p>
      </div>
      <p className="max-w-prose">{t("users.term.home")}</p>
      {content}
    </div>
  );
}

/** 12.3 item 3: off, on in a folder (with its state when not OK), or on in a folder that is gone. */
function StateLine({
  state,
  fs,
  fsKnown,
  pending,
  stateRef,
}: {
  state: HomeState;
  fs: Parameters<typeof FolderStateView>[0]["fs"];
  /** The file systems were read, so the folder's state can be told. */
  fsKnown: boolean;
  pending: boolean;
  stateRef: RefObject<HTMLParagraphElement | null>;
}) {
  const { t } = useTranslation();
  let words;
  let pill = null;
  if (state.kind === "off") {
    words = t("homeFolders.state.off");
  } else if (state.kind === "gone") {
    pill = <StatusPill status="unknown">{t("health.unknown")}</StatusPill>;
    words = t("homeFolders.state.gone");
  } else {
    words = (
      <Trans
        i18nKey="homeFolders.state.on"
        components={{
          folder: (
            <FolderLink uuid={state.folder.uuid} name={state.folder.name} />
          ),
        }}
      />
    );
  }
  const unreachable =
    state.kind === "on" && fsKnown && state.state.pill !== "ok";
  return (
    <div className="flex flex-col gap-2">
      <p
        ref={stateRef}
        tabIndex={-1}
        role="status"
        className="flex flex-wrap items-center gap-2 outline-hidden"
      >
        {pill}
        <span>{words}</span>
        {pending ? <PendingMark /> : null}
      </p>
      {unreachable ? (
        <div className="flex flex-col items-start gap-1">
          <FolderStateView state={state.state} fs={fs} />
          <p>{t("homeFolders.state.unreachable")}</p>
        </div>
      ) : null}
    </div>
  );
}
