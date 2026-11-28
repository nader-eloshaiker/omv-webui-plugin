// SPDX-License-Identifier: GPL-3.0-or-later
// Services > NFS, "Linux and Unix sharing" (phase 5 services design 1; P10 to P12, P17), for
// administrators: whether it is on and working, the one switch, and which folders which computers may
// reach, built as the Windows and Mac sharing page is (SmbPage) so the two read alike. Turning it on
// is a save to the band, refused while no NFS version is chosen; turning it off is a plain
// confirmation naming up to five of the folders that stop being reachable. Both send `enable` and the
// versions read just before (0.11). "Share a folder…" opens the entry form with a folder choice.
// A normal user who types the address gets the "only administrators" page, and nothing is called.
import type {
  NfsShareRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ExternalLink,
  Identifier,
  InlineAlert,
  Page,
  PageHeader,
  PageSection,
  PairStack,
  ServerMessage,
  Skeleton,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useNfsApi } from "../../hooks/useNfsApi.ts";
import { useNfsSettings, useNfsShares } from "../../hooks/useNfsReads.ts";
import {
  useSharedFoldersAll,
  useShareServices,
  useSharesSystem,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  entriesByFolder,
  entryAccess,
  entryClient,
  givesRoot,
  hasVersions,
  nfsState,
  otherOptionsDiffer,
  settingsRequest,
  sharedFolderNames,
  versionsText,
  type NfsState,
} from "../../services/nfsModel.ts";
import {
  nfsFolderPending,
  nfsSession,
  nfsSwitchPending,
  recordNfsSwitch,
} from "../../services/nfsSession.ts";
import { useSession } from "../../session/sessionContext.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { NfsAddressList } from "../molecules/NfsAddressList.tsx";
import { NfsClientWords } from "../molecules/NfsClientWords.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { NfsShareDialog } from "../organisms/NfsShareDialog.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

export function NfsPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("nfs.title")} />;
  }
  return <Nfs />;
}

function Nfs() {
  const { t } = useTranslation();
  const settings = useNfsSettings({ focus: true });
  const shares = useNfsShares({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const services = useShareServices({ focus: true });
  const system = useSharesSystem();
  const memory = useMemoryStore(nfsSession);
  const pending = system.pending ?? [];
  const addRef = useRef<HTMLButtonElement>(null);
  const [adding, setAdding] = useState(false);

  const state = nfsState(
    {
      data: settings.data,
      failed: settings.isError && settings.data === undefined,
      error: settings.error,
    },
    {
      data: services.data?.data,
      failed: services.isError && services.data === undefined,
      error: services.error,
    },
    pending,
  );
  const foldersFailed = folders.isError && folders.data === undefined;

  const addButton = (
    <div className="flex flex-col items-start gap-1">
      <Button
        ref={addRef}
        variant="neutral"
        disabled={foldersFailed || folders.data === undefined}
        focusableWhenDisabled
        aria-describedby={foldersFailed ? "nfs-folders-failed" : undefined}
        onClick={() => {
          if (folders.data !== undefined) {
            setAdding(true);
          }
        }}
      >
        {t("nfs.shares.add")}
      </Button>
      {foldersFailed ? (
        <p id="nfs-folders-failed" className="text-sm">
          {t("nfs.shares.foldersFailed")}
        </p>
      ) : null}
    </div>
  );

  let header = null;
  let content;
  if (settings.data === undefined && settings.isError) {
    content = (
      <PageSection>
        <ReadFailed
          error={settings.error}
          onRetry={() => void settings.refetch()}
          retrying={settings.isFetching}
        >
          {t("nfs.state.unread")}
        </ReadFailed>
      </PageSection>
    );
  } else if (settings.data === undefined) {
    content = (
      <PageSection>
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("nfs.loading")}
        </p>
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-16 w-full max-w-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </PageSection>
    );
  } else {
    header = (
      <>
        <StateLine state={state} pending={nfsSwitchPending(memory, pending)} />
        <SwitchCard
          enabled={settings.data.enable}
          versions={settings.data.versions}
          shares={shares.data?.data}
        />
      </>
    );
    content = (
      <div className="flex min-w-0 flex-col gap-group">
        <h2 className="text-section text-foreground">
          {t("nfs.shares.title")}
        </h2>
        {shares.data === undefined && shares.isError ? (
          <ReadFailed
            error={shares.error}
            onRetry={() => void shares.refetch()}
            retrying={shares.isFetching}
          >
            {t("nfs.shares.loadFailed")}
          </ReadFailed>
        ) : shares.data === undefined ? (
          <div className="flex flex-col gap-pair">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : shares.data.data.length === 0 ? (
          <EmptyState action={addButton}>{t("nfs.shares.empty")}</EmptyState>
        ) : (
          <PairStack>
            <TableToolbar aria-label={t("nfs.shares.title")}>
              {addButton}
            </TableToolbar>
            <SharesTable
              shares={shares.data.data}
              folders={folders.data?.data}
              foldersFailed={foldersFailed}
              hostname={system.hostname}
              versions={settings.data.versions}
              pendingFolder={(uuid) => nfsFolderPending(memory, uuid, pending)}
            />
          </PairStack>
        )}
        <p>
          <Link to="/diagnostics/services/nfs" className={routerLinkClass}>
            {t("nfs.whatIsShared")}
          </Link>
        </p>
        <NfsShareDialog
          open={adding}
          onOpenChange={setAdding}
          folders={folders.data?.data ?? []}
          settings={settings.data}
          finalFocus={addRef}
          onSaved={() => setAdding(false)}
        />
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        title={<PageTitle>{t("nfs.title")}</PageTitle>}
        subtitle={t("nfs.subtitle")}
      >
        <p className="max-w-prose">
          {t("services.term.nfs")} {t("nfs.intro")}
        </p>
        {header}
      </PageHeader>
      {content}
      <footer className="flex flex-col gap-line text-sm text-muted-foreground">
        <p>{t("nfs.footerLine")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.nfsSettings}
            newTabLabel={t("app.newTab")}
          >
            {t("nfs.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </Page>
  );
}

/** 0.3's pill and words, and the pending mark while this session's switch is not applied. */
function StateLine({ state, pending }: { state: NfsState; pending: boolean }) {
  const { t } = useTranslation();
  let pill = null;
  let words: ReactNode = null;
  switch (state.kind) {
    case "loading":
      words = t("nfs.loading");
      break;
    case "unread":
      pill = <StatusPill status="unknown">{t("health.unknown")}</StatusPill>;
      words = t("nfs.state.unread");
      break;
    case "off":
      pill = <StatusPill status="disabled">{t("health.disabled")}</StatusPill>;
      words = t("nfs.state.off");
      break;
    case "on":
      pill = <StatusPill status="ok">{t("health.ok")}</StatusPill>;
      words = t("nfs.state.on");
      break;
    case "down":
      pill = <StatusPill status="critical">{t("health.critical")}</StatusPill>;
      words = (
        <>
          {t("nfs.state.down")}{" "}
          <Link to="/diagnostics/services/nfs" className={routerLinkClass}>
            {t("nfs.state.downLink")}
          </Link>
        </>
      );
      break;
    case "pendingOn":
      words = t("nfs.state.pendingOn");
      break;
  }
  return (
    <p role="status" className="flex flex-wrap items-center gap-2">
      {pill}
      <span>{words}</span>
      {pending || state.kind === "pendingOn" ? <PendingMark /> : null}
    </p>
  );
}

/** The one switch (1.2 item 4): Turn on, a save to the band; Turn off…, behind 1.3's confirmation. */
function SwitchCard({
  enabled,
  versions,
  shares,
}: {
  enabled: boolean;
  versions: readonly string[];
  shares: readonly NfsShareRow[] | undefined;
}) {
  const { t } = useTranslation();
  const api = useNfsApi();
  const toast = useToast();
  const versionsId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const blocked = !enabled && versions.length === 0;

  const write = async (enable: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const now = await api.settings();
      if (enable && !hasVersions(now)) {
        return;
      }
      await api.setSettings(settingsRequest(now, enable));
      recordNfsSwitch();
      // Read again after the save, so the line and the switch say what is stored now.
      await Promise.all([api.settings(), api.services()]).catch(
        () => undefined,
      );
      setConfirming(false);
      toast.show({ title: t(enable ? "nfs.turnedOn" : "nfs.turnedOff") });
      buttonRef.current?.focus();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  const named = sharedFolderNames(shares ?? []);
  const list =
    named.more > 0
      ? `${named.names.map(inertBidi).join(", ")}, ${t("nfs.off.more", { count: named.more })}`
      : named.names.map(inertBidi).join(", ");
  const errorAlert =
    error === null ? null : (
      <InlineAlert tone="critical" title={t("nfs.saveFailed")}>
        {isRpcError(error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {error.message}
          </ServerMessage>
        ) : null}
      </InlineAlert>
    );

  return (
    <Card className="flex max-w-xl flex-col gap-3 p-4">
      <p>{enabled ? t("nfs.switch.on") : t("nfs.switch.off")}</p>
      {!confirming ? errorAlert : null}
      <div className="flex flex-col gap-2">
        <div>
          <Button
            ref={buttonRef}
            variant={enabled ? "neutral" : "primary"}
            loading={saving && !confirming}
            disabled={blocked}
            focusableWhenDisabled
            aria-describedby={blocked ? versionsId : undefined}
            onClick={() => {
              if (saving || blocked) {
                return;
              }
              if (enabled) {
                setError(null);
                setConfirming(true);
              } else {
                void write(true);
              }
            }}
          >
            {saving && !confirming
              ? t("nfs.saving")
              : enabled
                ? t("nfs.turnOff")
                : t("nfs.turnOn")}
          </Button>
        </div>
        <p
          id={versionsId}
          className="max-w-prose text-sm text-muted-foreground"
        >
          {versions.length === 0
            ? t("nfs.noVersions")
            : t("nfs.versions", { versions: versionsText(versions) })}
        </p>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setConfirming(false);
          }
        }}
        title={t("nfs.off.title")}
        description={
          named.count === 0 || shares === undefined
            ? t("nfs.off.none")
            : t("nfs.off.body", { count: named.count, list })
        }
        confirmLabel={t("nfs.off.confirm")}
        cancelLabel={t("nfs.off.cancel")}
        pending={saving}
        error={
          error === null
            ? undefined
            : isRpcError(error)
              ? error.message
              : t("nfs.saveFailed")
        }
        onConfirm={() => void write(false)}
      >
        <p>{t("nfs.off.close")}</p>
      </ConfirmDialog>
    </Card>
  );
}

/** 1.2 item 5: one row per entry, grouped by folder, the folder named and linked on its first row. */
function SharesTable({
  shares,
  folders,
  foldersFailed,
  hostname,
  versions,
  pendingFolder,
}: {
  shares: readonly NfsShareRow[];
  folders: readonly SharedFolder[] | undefined;
  foldersFailed: boolean;
  hostname: string | undefined;
  versions: readonly string[];
  pendingFolder: (uuid: string) => boolean;
}) {
  const { t } = useTranslation();
  return (
    <Table frameLabel={t("nfs.shares.title")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("nfs.shares.col.folder")}</TableHead>
          <TableHead>{t("nfs.shares.col.client")}</TableHead>
          <TableHead>{t("nfs.shares.col.access")}</TableHead>
          <TableHead>{t("nfs.shares.col.address")}</TableHead>
          <TableHead>{t("nfs.shares.col.note")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entriesByFolder(shares).flatMap(({ folderUuid, entries }) => {
          const folder = folders?.find((f) => f.uuid === folderUuid);
          const name = folder?.name ?? entries[0]?.sharedfoldername ?? "";
          return entries.map((entry, index) => {
            const access = entryAccess(entry);
            const root = givesRoot(entry);
            const other = otherOptionsDiffer(entry);
            return (
              <TableRow
                key={entry.uuid}
                // Stacked, a later entry of the same folder continues its block without a rule.
                className={index > 0 ? "@max-[40rem]:border-t-0" : undefined}
              >
                {/* A long unbroken name wraps anywhere within a capped column, so no other column
                    is squeezed to a sliver; the table still scrolls only in its own region. Stacked,
                    the folder heads its first entry; a later entry of the same folder has no title. */}
                <TableCell
                  narrow={index > 0 ? "hidden" : "title"}
                  className="[overflow-wrap:anywhere] @min-[40rem]:max-w-56 @min-[40rem]:min-w-32 [&_a]:[overflow-wrap:anywhere] [&_bdi]:[overflow-wrap:anywhere]"
                >
                  {index > 0 ? null : foldersFailed ? (
                    <span>{t("nfs.shares.unreadFolder")}</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2">
                      <FolderLink uuid={folder?.uuid} name={name} />
                      {pendingFolder(folderUuid) ? <PendingMark /> : null}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  label={t("nfs.shares.col.client")}
                  className="[overflow-wrap:anywhere] @min-[40rem]:max-w-64 @min-[40rem]:min-w-40"
                >
                  <NfsClientWords client={entryClient(entry)} />
                </TableCell>
                <TableCell
                  label={t("nfs.shares.col.access")}
                  className="[overflow-wrap:anywhere] @min-[40rem]:max-w-48 @min-[40rem]:min-w-28"
                >
                  {access.kind === "classic"
                    ? t("nfs.shares.classicValue", {
                        value: inertBidi(access.value),
                      })
                    : t(`access.${access.kind}`)}
                </TableCell>
                <TableCell
                  label={t("nfs.shares.col.address")}
                  className="@min-[40rem]:max-w-72 @min-[40rem]:min-w-48"
                >
                  {index > 0 || hostname === undefined ? null : (
                    <NfsAddressList
                      hostname={hostname}
                      folder={name}
                      versions={versions}
                    />
                  )}
                </TableCell>
                <TableCell
                  label={t("nfs.shares.col.note")}
                  className="[overflow-wrap:anywhere] @min-[40rem]:max-w-64 @min-[40rem]:min-w-40"
                >
                  {root || other ? (
                    <span className="flex flex-col gap-1">
                      {root ? (
                        <span className="flex items-start gap-1.5">
                          <TriangleAlert
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span>{t("nfs.shares.rootNote")}</span>
                        </span>
                      ) : null}
                      {other ? (
                        <span className="text-sm">
                          {t("nfs.shares.otherOptions")}{" "}
                          <Identifier
                            dir="ltr"
                            className="[overflow-wrap:anywhere]"
                          >
                            {inertBidi(entry.extraoptions ?? "")}
                          </Identifier>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          });
        })}
      </TableBody>
    </Table>
  );
}
