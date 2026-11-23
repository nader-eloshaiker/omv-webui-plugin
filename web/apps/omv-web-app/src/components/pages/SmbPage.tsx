// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SMB/CIFS, "Windows and Mac sharing" (phase 5 shares design 5; owner, P12), for
// administrators: whether it is on and working, the one switch, and the folders it shares. Turning it
// on is a save to the band, checked first against the 15-character name rule (4.4); turning it off is
// a plain confirmation naming up to five of the folders that stop being reachable. Both writes send
// the whole SMB.getSettings reply read just before, with only `enable` changed (0.10, R4). A normal
// user who types the address gets the "only administrators" page, and nothing is called first. The
// workgroup card (phase 5 services design 11.2) follows the switch.
import type {
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  ExternalLink,
  Identifier,
  InlineAlert,
  ServerMessage,
  Skeleton,
  StatusPill,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import {
  useSharedFoldersAll,
  useShareServices,
  useSharesSystem,
  useSmbSettings,
  useSmbShares,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import { useSession } from "../../session/sessionContext.ts";
import { smbOnRefusal } from "../../sharedFolders/shareActions.ts";
import {
  forgetPending,
  recordSmbSaved,
  recordWorkgroupSaved,
  sharesSession,
  smbSwitchPending,
} from "../../sharedFolders/sharesSession.ts";
import {
  guestMode,
  hostRule,
  settingsRequest,
  shareAddresses,
  smbState,
  type SmbState,
} from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PageTitle } from "../atoms/PageTitle.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { SmbWorkgroupCard } from "../organisms/SmbWorkgroupCard.tsx";
import { AdminOnlyPage } from "./AdminOnlyPage.tsx";

/** At most this many folders are named in the turn-off confirmation (5.3). */
const NAMED = 5;

export function SmbPage() {
  const { t } = useTranslation();
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  if (session.role !== "admin") {
    return <AdminOnlyPage title={t("smb.title")} />;
  }
  return <Smb />;
}

function Smb() {
  const { t } = useTranslation();
  const settings = useSmbSettings({ focus: true });
  const shares = useSmbShares({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const services = useShareServices({ focus: true });
  const system = useSharesSystem();
  const memory = useMemoryStore(sharesSession);
  const pending = system.pending ?? [];

  useEffect(() => {
    if (system.pending !== undefined) {
      forgetPending(system.pending);
    }
  }, [system.pending]);

  const state = smbState(
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

  let content;
  if (settings.data === undefined && settings.isError) {
    content = (
      <ReadFailed
        error={settings.error}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      >
        {t("smb.state.unread")}
      </ReadFailed>
    );
  } else if (settings.data === undefined) {
    content = (
      <div className="flex flex-col gap-4">
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("smb.loading")}
        </p>
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-16 w-full max-w-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else {
    const enabled = settings.data.enable;
    content = (
      <>
        <StateLine state={state} pending={smbSwitchPending(memory, pending)} />
        <SwitchCard
          enabled={enabled}
          hostname={system.hostname}
          shares={shares.data?.data}
        />
        <SmbWorkgroupCard
          settings={settings.data}
          pending={memory.workgroupSaved && pending.includes("samba")}
          onSaved={recordWorkgroupSaved}
        />
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("smb.shares.title")}</h2>
          {shares.data === undefined && shares.isError ? (
            <ReadFailed
              error={shares.error}
              onRetry={() => void shares.refetch()}
              retrying={shares.isFetching}
            >
              {t("smb.shares.loadFailed")}
            </ReadFailed>
          ) : shares.data === undefined ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : shares.data.data.length === 0 ? (
            <EmptyState
              action={
                <Link to="/storage/shared-folders" className={routerLinkClass}>
                  {t("smb.shares.emptyLink")}
                </Link>
              }
            >
              {t("smb.shares.empty")}
            </EmptyState>
          ) : (
            <SharesTable
              shares={shares.data.data}
              folders={folders.data?.data}
              hostname={system.hostname}
            />
          )}
        </div>
        <p>
          <Link to="/diagnostics/services/smb" className={routerLinkClass}>
            {t("smb.connected")}
          </Link>
        </p>
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PageTitle>{t("smb.title")}</PageTitle>
        <p className="text-sm text-muted-foreground">{t("smb.subtitle")}</p>
      </div>
      <p className="max-w-prose">
        {t("shares.term.smb")} {t("smb.intro")}
      </p>
      {content}
      <footer className="flex flex-col gap-1 text-sm text-muted-foreground">
        <p>{t("smb.footerLine")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.smbSettings}
            newTabLabel={t("app.newTab")}
          >
            {t("smb.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </div>
  );
}

/** 0.3's pill and words, and the pending mark while this session's switch is not applied. */
function StateLine({ state, pending }: { state: SmbState; pending: boolean }) {
  const { t } = useTranslation();
  let pill = null;
  let words: ReactNode = null;
  switch (state.kind) {
    case "loading":
      words = t("smb.loading");
      break;
    case "unread":
      pill = <StatusPill status="unknown">{t("health.unknown")}</StatusPill>;
      words = t("smb.state.unread");
      break;
    case "off":
      pill = <StatusPill status="disabled">{t("health.disabled")}</StatusPill>;
      words = t("smb.state.off");
      break;
    case "on":
      pill = <StatusPill status="ok">{t("health.ok")}</StatusPill>;
      words = t("smb.state.on");
      break;
    case "down":
      pill = <StatusPill status="critical">{t("health.critical")}</StatusPill>;
      words = (
        <>
          {t("smb.state.down")}{" "}
          <Link to="/diagnostics/services/smb" className={routerLinkClass}>
            {t("smb.state.downLink")}
          </Link>
        </>
      );
      break;
    case "pendingOn":
      words = t("smb.state.pendingOn");
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

/** The one switch (5.2 item 4): Turn on, a save to the band; Turn off…, behind 5.3's confirmation. */
function SwitchCard({
  enabled,
  hostname,
  shares,
}: {
  enabled: boolean;
  hostname: string | undefined;
  shares: readonly SmbShareRow[] | undefined;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const host = hostname === undefined ? null : hostRule(hostname);
  const blocked = !enabled && host !== null && !host.ok;

  const write = async (enable: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const now = await api.settings();
      if (enable && smbOnRefusal(await api.hostname()) !== null) {
        return;
      }
      await api.setSmbSettings(settingsRequest(now, enable));
      recordSmbSaved();
      // Read again after the save (5.1), so the line and the switch say what is stored now.
      await Promise.all([api.settings(), api.services()]).catch(
        () => undefined,
      );
      setConfirming(false);
      toast.show({ title: t(enable ? "smb.turnedOn" : "smb.turnedOff") });
      buttonRef.current?.focus();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  const named = (shares ?? []).filter((s) => s.enable);
  const names = named.slice(0, NAMED).map((s) => s.sharedfoldername);
  const more = named.length - names.length;
  const list =
    more > 0
      ? `${names.join(", ")}, ${t("smb.off.more", { count: more })}`
      : names.join(", ");
  const errorAlert =
    error === null ? null : (
      <InlineAlert tone="critical" title={t("smb.saveFailed")}>
        {isRpcError(error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {error.message}
          </ServerMessage>
        ) : null}
      </InlineAlert>
    );

  return (
    <Card className="flex max-w-xl flex-col gap-3 p-4">
      <p>{enabled ? t("smb.switch.on") : t("smb.switch.off")}</p>
      {!confirming ? errorAlert : null}
      <div className="flex flex-col gap-2">
        <div>
          <Button
            ref={buttonRef}
            variant={enabled ? "neutral" : "primary"}
            loading={saving && !confirming}
            disabled={blocked}
            focusableWhenDisabled
            aria-describedby={blocked ? "smb-host-rule" : undefined}
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
              ? t("smb.saving")
              : enabled
                ? t("smb.turnOff")
                : t("smb.turnOn")}
          </Button>
        </div>
        {blocked && host !== null ? (
          <p id="smb-host-rule" className="max-w-prose text-sm">
            <Trans
              i18nKey="folderSmb.form.hostTooLong"
              values={{ count: host.length }}
              components={{
                host: <IdentifierText value={inertBidi(host.host)} />,
              }}
            />{" "}
            <ExternalLink
              href={CLASSIC.networkGeneral}
              newTabLabel={t("app.newTab")}
            >
              {t("folderSmb.form.hostLink")}
            </ExternalLink>
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setConfirming(false);
          }
        }}
        title={t("smb.off.title")}
        description={
          named.length === 0 || shares === undefined
            ? t("smb.off.bodyNone")
            : t("smb.off.body", { count: named.length, list })
        }
        confirmLabel={t("smb.off.confirm")}
        cancelLabel={t("smb.off.cancel")}
        pending={saving}
        error={
          error === null
            ? undefined
            : isRpcError(error)
              ? error.message
              : t("smb.saveFailed")
        }
        onConfirm={() => void write(false)}
      >
        <p>{t("smb.off.close")}</p>
      </ConfirmDialog>
    </Card>
  );
}

/** 5.2 item 5: each SMB share, its folder linked to its page by `sharedfolderref`. */
function SharesTable({
  shares,
  folders,
  hostname,
}: {
  shares: readonly SmbShareRow[];
  folders: readonly SharedFolder[] | undefined;
  hostname: string | undefined;
}) {
  const { t } = useTranslation();
  const yesNo = (value: boolean) =>
    value ? t("folderSmb.yes") : t("folderSmb.no");
  return (
    <Table frameLabel={t("smb.shares.title")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("smb.shares.col.folder")}</TableHead>
          <TableHead>{t("smb.shares.col.address")}</TableHead>
          <TableHead>{t("smb.shares.col.guest")}</TableHead>
          <TableHead>{t("smb.shares.col.readonly")}</TableHead>
          <TableHead>{t("smb.shares.col.browseable")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shares.map((share) => {
          const folder = folders?.find((f) => f.uuid === share.sharedfolderref);
          const name = folder?.name ?? share.sharedfoldername;
          const address =
            hostname === undefined || folder === undefined
              ? null
              : shareAddresses(hostname, folder.name).windows;
          return (
            <TableRow key={share.uuid}>
              <TableCell>
                <span className="flex flex-col">
                  {folder === undefined && folders !== undefined ? (
                    <span>{t("smb.shares.gone")}</span>
                  ) : (
                    <FolderLink uuid={folder?.uuid} name={name} />
                  )}
                  {share.enable ? null : (
                    <span className="text-sm text-muted-foreground">
                      {t("smb.shares.disabled")}
                    </span>
                  )}
                </span>
              </TableCell>
              <TableCell>
                {address === null ? null : (
                  <span className="flex items-center gap-1">
                    <Identifier>{inertBidi(address)}</Identifier>
                    <CopyButton
                      text={address}
                      label={t("sharedFolder.copyAddress", {
                        folder: inertBidi(name),
                      })}
                      copiedLabel={t("common.copied")}
                      selectedLabel={t("common.copySelected")}
                      size="icon-sm"
                    />
                  </span>
                )}
              </TableCell>
              <TableCell>
                {t(`smb.shares.guest.${guestMode(share.guest)}`)}
              </TableCell>
              <TableCell>{yesNo(share.readonly)}</TableCell>
              <TableCell>{yesNo(share.browseable)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
