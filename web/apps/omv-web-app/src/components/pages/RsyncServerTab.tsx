// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync > Rsync server (phase 5 services design 9; 0.3, 0.9, 0.11; P13, P17), the second tab
// of the Rsync page: whether other computers can copy to and from this NAS with rsync, the one switch,
// and the folders offered to it. Turning it on is a save to the band; turning it off is a plain
// confirmation naming the folders that stop being reachable. Both send Rsyncd.getSettings's `port` and
// `extraoptions` read just before, with only `enable` changed. Offering, changing and stopping a folder
// are the dialog (10) and a plain confirmation (10.4), each to the band.
//
// Reads: Rsyncd.getSettings, Rsyncd.getModuleList (every sign-in's password replaced by whether it is
// set, by the transport), ShareMgmt.getList, Services.getStatus and the shell's System.getInformation;
// on opening, on window focus and after a save. Administrator-only: RsyncPage keeps a normal user out
// before this is mounted.
import type {
  RsyncdModuleRow,
  RsyncdSettings,
  SharedFolder,
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
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
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
import { useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useRsyncdApi } from "../../hooks/useRsyncdApi.ts";
import {
  useRsyncdModules,
  useRsyncdSettings,
} from "../../hooks/useRsyncdReads.ts";
import {
  useSharedFoldersAll,
  useShareServices,
  useSharesSystem,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  moduleMay,
  moduleSignIn,
  moduleWho,
  rsyncAddress,
  rsyncdSettingsRequest,
  rsyncdState,
  type RsyncdState,
} from "../../services/rsyncdModel.ts";
import {
  beginRsyncdAction,
  endRsyncdAction,
  moduleRowPending,
  recordSwitchSaved,
  rsyncdSession,
  rsyncdSwitchPending,
} from "../../services/rsyncdSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderLink } from "../atoms/FolderLink.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { RsyncWhoText } from "../molecules/RsyncWhoText.tsx";
import {
  RsyncModuleDialog,
  type ModuleDialogTarget,
} from "../organisms/RsyncModuleDialog.tsx";

/** At most this many folders are named in the turn-off confirmation (9.3). */
const NAMED = 5;
/** A cell that holds a name or address from the backend: it wraps anywhere, within a cap. */
const NAME_CELL =
  "min-w-40 max-w-64 [overflow-wrap:anywhere] whitespace-normal";

export function RsyncServerTab() {
  const { t } = useTranslation();
  const settings = useRsyncdSettings({ focus: true });
  const modules = useRsyncdModules({ focus: true });
  const folders = useSharedFoldersAll({ focus: true });
  const services = useShareServices({ focus: true });
  const system = useSharesSystem();
  const memory = useMemoryStore(rsyncdSession);
  const pending = system.pending ?? [];

  const state = rsyncdState(
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

  let modulesSection = null;
  let content;
  if (settings.data === undefined && settings.isError) {
    content = (
      <ReadFailed
        error={settings.error}
        onRetry={() => void settings.refetch()}
        retrying={settings.isFetching}
      >
        {t("rsyncd.state.unread")}
      </ReadFailed>
    );
  } else if (settings.data === undefined) {
    content = (
      <div className="flex flex-col gap-group">
        <p role="status" aria-busy="true" className="text-muted-foreground">
          {t("rsyncd.loading")}
        </p>
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-16 w-full max-w-xl" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else {
    content = (
      <>
        <StateLine
          state={state}
          pending={rsyncdSwitchPending(memory, pending)}
        />
        <SwitchCard settings={settings.data} modules={modules.data?.data} />
      </>
    );
    modulesSection = (
      <Modules
        modules={modules}
        folders={folders.data?.data}
        hostname={system.hostname}
        settings={settings.data}
        pending={pending}
        saved={memory.saved}
      />
    );
  }

  return (
    <>
      <PageSection>
        <p className="max-w-prose">{t("services.term.rsyncd")}</p>
        <InlineAlert tone="neutral" icon="warning" role="note">
          {t("rsyncd.noEncryption")}
        </InlineAlert>
        <p className="text-sm">
          {t("rsyncd.sshInstead")}{" "}
          <Link to="/services/ssh" className={routerLinkClass}>
            {t("rsyncd.sshLink")}
          </Link>
        </p>
        {content}
      </PageSection>
      {modulesSection}
      <footer className="flex flex-col gap-line text-sm text-muted-foreground">
        <p>{t("rsyncd.footerLine")}</p>
        <p>
          <ExternalLink
            href={CLASSIC.rsyncServerSettings}
            newTabLabel={t("app.newTab")}
          >
            {t("rsyncd.classicLink")}
          </ExternalLink>
        </p>
      </footer>
    </>
  );
}

/** 0.3's pill and words, and the pending mark while this session's switch is not applied. */
function StateLine({
  state,
  pending,
}: {
  state: RsyncdState;
  pending: boolean;
}) {
  const { t } = useTranslation();
  let pill = null;
  let words: ReactNode = null;
  switch (state.kind) {
    case "loading":
      words = t("rsyncd.loading");
      break;
    case "unread":
      pill = <StatusPill status="unknown">{t("health.unknown")}</StatusPill>;
      words = t("rsyncd.state.unread");
      break;
    case "off":
      pill = <StatusPill status="disabled">{t("health.disabled")}</StatusPill>;
      words = t("rsyncd.state.off");
      break;
    case "on":
      pill = <StatusPill status="ok">{t("health.ok")}</StatusPill>;
      words = t("rsyncd.state.on");
      break;
    case "down":
      pill = <StatusPill status="critical">{t("health.critical")}</StatusPill>;
      words = (
        <>
          {t("rsyncd.state.down")}{" "}
          <Link to="/diagnostics/system-logs" className={routerLinkClass}>
            {t("rsyncd.state.downLink")}
          </Link>
        </>
      );
      break;
    case "pendingOn":
      words = t("rsyncd.state.pendingOn");
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

/** The one switch (9.2 item 5): Turn on, a save to the band; Turn off…, behind 9.3's confirmation. */
function SwitchCard({
  settings,
  modules,
}: {
  settings: RsyncdSettings;
  modules: readonly RsyncdModuleRow[] | undefined;
}) {
  const { t } = useTranslation();
  const api = useRsyncdApi();
  const toast = useToast();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const enabled = settings.enable;

  const write = async (enable: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const now = await api.settings();
      await api.setSettings(rsyncdSettingsRequest(now, enable));
      recordSwitchSaved();
      await Promise.all([api.settings(), api.services()]).catch(
        () => undefined,
      );
      setConfirming(false);
      toast.show({ title: t(enable ? "rsyncd.turnedOn" : "rsyncd.turnedOff") });
      buttonRef.current?.focus();
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  const named = (modules ?? []).filter((m) => m.enable);
  const names = named.slice(0, NAMED).map((m) => inertBidi(m.sharedfoldername));
  const more = named.length - names.length;
  const list =
    more > 0
      ? `${names.join(", ")}, ${t("rsyncd.off.more", { count: more })}`
      : names.join(", ");

  return (
    <Card className="flex max-w-xl flex-col gap-3 p-4">
      <p>{enabled ? t("rsyncd.switch.on") : t("rsyncd.switch.off")}</p>
      {!confirming && error !== null ? (
        <InlineAlert tone="critical" title={t("rsyncd.saveFailed")}>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <div>
        <Button
          ref={buttonRef}
          variant={enabled ? "neutral" : "primary"}
          loading={saving && !confirming}
          onClick={() => {
            if (saving) {
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
            ? t("rsyncd.saving")
            : enabled
              ? t("rsyncd.turnOff")
              : t("rsyncd.turnOn")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("rsyncd.port", { port: settings.port })}
      </p>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setConfirming(false);
          }
        }}
        title={t("rsyncd.off.title")}
        description={
          named.length === 0 || modules === undefined
            ? t("rsyncd.off.bodyNone")
            : t("rsyncd.off.body", { count: named.length, list })
        }
        confirmLabel={t("rsyncd.off.confirm")}
        cancelLabel={t("rsyncd.off.cancel")}
        pending={saving}
        error={
          error === null
            ? undefined
            : isRpcError(error)
              ? error.message
              : t("rsyncd.saveFailed")
        }
        onConfirm={() => void write(false)}
      />
    </Card>
  );
}

interface ModulesRead {
  data: { data: RsyncdModuleRow[] } | undefined;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/** 9.2 item 6: "Folders offered", the Offer button, the table, and the dialogs. */
function Modules({
  modules,
  folders,
  hostname,
  settings,
  pending,
  saved,
}: {
  modules: ModulesRead;
  folders: readonly SharedFolder[] | undefined;
  hostname: string | undefined;
  settings: RsyncdSettings;
  pending: readonly string[];
  saved: readonly string[];
}) {
  const { t } = useTranslation();
  const offerRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<ModuleDialogTarget | null>(null);
  const [stopping, setStopping] = useState<RsyncdModuleRow | null>(null);
  const rows = modules.data?.data;

  let body;
  if (rows === undefined && modules.isError) {
    body = (
      <ReadFailed
        error={modules.error}
        onRetry={() => void modules.refetch()}
        retrying={modules.isFetching}
      >
        {t("rsyncd.modules.loadFailed")}
      </ReadFailed>
    );
  } else if (rows === undefined) {
    body = (
      <div className="flex flex-col gap-pair">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (rows.length === 0) {
    body = <EmptyState>{t("rsyncd.modules.empty")}</EmptyState>;
  } else {
    body = (
      <Table
        frameLabel={t("rsyncd.modules.title")}
        // Wide enough to read at 320 px: the table scrolls in its own frame, never the page.
        className="min-w-[56rem]"
      >
        <TableHeader>
          <TableRow>
            <TableHead>{t("rsyncd.col.folder")}</TableHead>
            <TableHead>{t("rsyncd.col.as")}</TableHead>
            <TableHead>{t("rsyncd.col.may")}</TableHead>
            <TableHead>{t("rsyncd.col.signIn")}</TableHead>
            <TableHead>{t("rsyncd.col.who")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("rsyncd.col.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <ModuleRow
              key={row.uuid}
              row={row}
              folders={folders}
              hostname={hostname}
              port={settings.port}
              pending={moduleRowPending(
                { saved },
                row.sharedfolderref,
                pending,
              )}
              onChange={(opener) => {
                openerRef.current = opener;
                setDialog({ kind: "change", row });
              }}
              onStop={(opener) => {
                openerRef.current = opener;
                setStopping(row);
              }}
            />
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <PageSection heading={t("rsyncd.modules.title")}>
      <PairStack>
        {rows === undefined ? null : (
          <TableToolbar>
            <Button
              ref={offerRef}
              variant="neutral"
              onClick={() => {
                openerRef.current = offerRef.current;
                setDialog({ kind: "new" });
              }}
            >
              {t("rsyncd.modules.add")}
            </Button>
          </TableToolbar>
        )}
        {body}
      </PairStack>
      <RsyncModuleDialog
        target={dialog}
        onClose={() => setDialog(null)}
        folders={folders ?? []}
        modules={rows ?? []}
        hostname={hostname}
        port={settings.port}
        serverOff={!settings.enable}
        finalFocus={openerRef}
      />
      <StopOffering
        row={stopping}
        hostname={hostname}
        port={settings.port}
        onClose={() => {
          setStopping(null);
          openerRef.current?.focus();
        }}
        onStopped={() => {
          setStopping(null);
          offerRef.current?.focus();
        }}
      />
    </PageSection>
  );
}

function ModuleRow({
  row,
  folders,
  hostname,
  port,
  pending,
  onChange,
  onStop,
}: {
  row: RsyncdModuleRow;
  folders: readonly SharedFolder[] | undefined;
  hostname: string | undefined;
  port: number;
  pending: boolean;
  onChange: (opener: HTMLElement | null) => void;
  onStop: (opener: HTMLElement | null) => void;
}) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const folder = folders?.find((f) => f.uuid === row.sharedfolderref);
  const name = folder?.name ?? row.sharedfoldername;
  const address =
    hostname === undefined ? null : rsyncAddress(hostname, row.name, port);
  const signIn = moduleSignIn(row);
  return (
    <TableRow>
      <TableCell className={NAME_CELL}>
        <span className="flex flex-col">
          <span className="flex flex-wrap items-center gap-2">
            {folder === undefined && folders !== undefined ? (
              <span>{t("rsyncd.folderGone")}</span>
            ) : (
              <FolderLink uuid={folder?.uuid} name={name} />
            )}
            {pending ? <PendingMark /> : null}
          </span>
          {row.enable ? null : (
            <span className="text-sm text-muted-foreground">
              {t("rsyncd.moduleOff")}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className={NAME_CELL}>
        {address === null ? (
          <Identifier>{inertBidi(row.name)}</Identifier>
        ) : (
          <span className="flex items-center gap-1">
            <Identifier>{inertBidi(address)}</Identifier>
            <CopyButton
              text={address}
              label={t("rsyncd.copyAddress", { name: inertBidi(row.name) })}
              copiedLabel={t("common.copied")}
              selectedLabel={t("common.copySelected")}
              size="icon-sm"
            />
          </span>
        )}
      </TableCell>
      <TableCell>{t(`rsyncd.may.${moduleMay(row)}`)}</TableCell>
      <TableCell className={NAME_CELL}>
        {signIn.kind === "none" ? (
          <span className="flex flex-col gap-0.5">
            <span className="inline-flex items-start gap-1.5">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-foreground"
              />
              <span className="font-medium">{t("rsyncd.signIn.none")}</span>
            </span>
            <span className="text-sm text-muted-foreground">
              {t("rsyncd.signIn.noneWarn")}
            </span>
          </span>
        ) : signIn.kind === "one" ? (
          <Trans
            i18nKey="rsyncd.signIn.one"
            components={{
              name: <IdentifierText value={inertBidi(signIn.name)} />,
            }}
          />
        ) : (
          t("rsyncd.signIn.many", { count: signIn.count })
        )}
      </TableCell>
      <TableCell className={NAME_CELL}>
        <RsyncWhoText who={moduleWho(row)} />
      </TableCell>
      <TableCell>
        <Menu>
          <MenuTrigger
            ref={triggerRef}
            render={
              <Button
                variant="neutral"
                size="sm"
                aria-label={t("rsyncd.actionsFor", {
                  folder: inertBidi(name),
                })}
              />
            }
          >
            {t("rsyncd.col.actions")}
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onClick={() => onChange(triggerRef.current)}>
              {t("module.action.change")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => onStop(triggerRef.current)}>
              {t("module.action.stop")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </TableCell>
    </TableRow>
  );
}

/** 10.4: a plain confirmation, then Rsyncd.deleteModule, to the band. */
function StopOffering({
  row,
  hostname,
  port,
  onClose,
  onStopped,
}: {
  row: RsyncdModuleRow | null;
  hostname: string | undefined;
  port: number;
  onClose: () => void;
  onStopped: () => void;
}) {
  const { t } = useTranslation();
  const api = useRsyncdApi();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folder = row?.sharedfoldername ?? "";
  const address =
    row === null
      ? ""
      : hostname === undefined
        ? row.name
        : rsyncAddress(hostname, row.name, port);

  const stop = async () => {
    if (row === null || busy) {
      return;
    }
    if (!beginRsyncdAction(row.sharedfolderref, "stop")) {
      setError(t("module.refused.running", { folder: isolateName(folder) }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteModule(row.uuid);
      await api.modules().catch(() => undefined);
      toast.show({
        title: t("module.stopped", { folder: isolateName(folder) }),
      });
      onStopped();
    } catch (failure) {
      setError(
        isRpcError(failure)
          ? `${t("module.stopFailed")} ${failure.message}`
          : t("module.stopFailed"),
      );
    } finally {
      setBusy(false);
      endRsyncdAction(row.sharedfolderref);
    }
  };

  return (
    <ConfirmDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setError(null);
          onClose();
        }
      }}
      title={t("module.stop.title", { folder: isolateName(folder) })}
      description={
        <>
          <Trans
            i18nKey="module.stop.body"
            components={{
              address: <IdentifierText value={inertBidi(address)} />,
            }}
          />
          {row !== null && row.authusers && row.users.length > 0 ? (
            <> {t("module.stop.signIn")}</>
          ) : null}
        </>
      }
      cancelLabel={t("module.stop.cancel")}
      confirmLabel={t("module.stop.confirm")}
      pending={busy}
      error={error ?? undefined}
      onConfirm={() => void stop()}
    />
  );
}
