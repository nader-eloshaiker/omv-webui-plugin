// SPDX-License-Identifier: GPL-3.0-or-later
// "Linux and Unix computers" on a shared folder's page (phase 5 services design 2; 0.3, 0.4, 0.5,
// 0.10; P10 to P12): whether the folder is shared over NFS and with which computers, each entry with
// its access, its address and any options set in the classic interface (no_root_squash warned, never
// offered), the entry form in place ("Let a computer in…", "Change…"), and "Stop letting them in…"
// with a plain confirmation (NFS.deleteShare: no file is touched).
//
// Focus (2.3, 2.5, 18.2): opening the form moves focus to its heading; Cancel returns it to the button
// that opened it (or the entry's heading for a change); after a save it moves to the saved entry's
// heading; after stopping, the entry is gone, so it moves to the section heading.
//
// The section reads the NFS entries and settings itself (the same cache entries as the NFS page). When
// either cannot be read, it says so with the server's words and offers no NFS action (2.6).
import type {
  NfsShareRow,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Identifier,
  InlineAlert,
  ServerMessage,
  Skeleton,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useNfsApi } from "../../hooks/useNfsApi.ts";
import { useNfsEntrySave } from "../../hooks/useNfsEntrySave.ts";
import { useNfsSettings, useNfsShares } from "../../hooks/useNfsReads.ts";
import { useNfsWords } from "../../hooks/useNfsWords.ts";
import { useSharesSystem } from "../../hooks/useSharesReads.ts";
import { classifyStored } from "../../services/clientRules.ts";
import {
  entriesOf,
  entryAccess,
  entryClient,
  folderRefusal,
  givesRoot,
  otherOptionsDiffer,
} from "../../services/nfsModel.ts";
import {
  beginNfsAction,
  endNfsAction,
  nfsFolderPending,
  nfsSession,
  recordNfsSaved,
} from "../../services/nfsSession.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { TextSlot } from "../atoms/TextSlot.tsx";
import { NfsAddressList } from "../molecules/NfsAddressList.tsx";
import { NfsClientWords } from "../molecules/NfsClientWords.tsx";
import { NfsEntryForm } from "./NfsEntryForm.tsx";

type Editing = null | { kind: "new" } | { kind: "change"; uuid: string };
type FocusTarget =
  | { kind: "heading" }
  | { kind: "letIn" }
  | { kind: "form" }
  | { kind: "entry"; uuid: string };

export function FolderNfsSection({
  folder,
  folderOk,
  hostname,
  focus = true,
}: {
  folder: SharedFolder;
  /** Whether the folder is OK as its page reads it (the shares slice's 0.3). */
  folderOk: boolean;
  hostname: string | undefined;
  /** Read again on window focus (off while the page holds unsaved work). */
  focus?: boolean;
}) {
  const { t } = useTranslation();
  const api = useNfsApi();
  const toast = useToast();
  const words = useNfsWords();
  const shares = useNfsShares({ focus });
  const settings = useNfsSettings({ focus });
  const system = useSharesSystem();
  const memory = useMemoryStore(nfsSession);
  const pending = system.pending;
  const noPasswordId = useId();
  const accessNotUsedId = useId();
  const reasonId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const letInRef = useRef<HTMLButtonElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const entryHeadingsRef = useRef(new Map<string, HTMLHeadingElement>());
  const [editing, setEditing] = useState<Editing>(null);
  const [stopping, setStopping] = useState<NfsShareRow | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const { turnOn } = useNfsEntrySave();
  // 2.3: the entry is saved, but turning NFS on failed; "Try again" makes only that second call.
  const [turnOnFailed, setTurnOnFailed] = useState<{
    uuid: string;
    client: string;
    error: unknown;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  // Focus moves after the render that removed what held it, or showed where it goes.
  const focusToRef = useRef<FocusTarget | null>(null);
  useEffect(() => {
    const target = focusToRef.current;
    if (target === null || stopOpen) {
      return;
    }
    const element =
      target.kind === "heading"
        ? headingRef.current
        : target.kind === "letIn"
          ? letInRef.current
          : target.kind === "form"
            ? formHeadingRef.current
            : (entryHeadingsRef.current.get(target.uuid) ?? null);
    if (element !== null) {
      focusToRef.current = null;
      element.focus();
    }
  });

  const failed =
    shares.isError && shares.data === undefined
      ? shares
      : settings.isError && settings.data === undefined
        ? settings
        : null;
  const entries =
    shares.data === undefined
      ? undefined
      : entriesOf(shares.data.data, folder.uuid);
  const nfsOn = settings.data?.enable;
  const refusal = folderRefusal(folder, folderOk);
  const folderName = <FolderNameText value={folder.name} />;

  const stop = async () => {
    if (stopping === null || !stopOpen || stopBusy) {
      return;
    }
    if (!beginNfsAction(folder.uuid, "stop")) {
      setStopError(t("folderNfs.err.running"));
      return;
    }
    setStopBusy(true);
    setStopError(null);
    const client = entryClient(stopping);
    try {
      await api.deleteShare(stopping.uuid);
      recordNfsSaved(folder.uuid);
      await api.shares().catch(() => undefined);
      toast.show({
        title:
          client.kind === "any"
            ? t("folderNfs.stoppedAny", { folder: isolateName(folder.name) })
            : t("folderNfs.stopped", {
                client: words.short(client),
                folder: isolateName(folder.name),
              }),
      });
      setStopOpen(false);
      focusToRef.current = { kind: "heading" };
    } catch (error) {
      setStopError(
        isRpcError(error)
          ? `${t("folderNfs.stopFailed")} ${error.message}`
          : t("folderNfs.stopFailed"),
      );
    } finally {
      setStopBusy(false);
      endNfsAction(folder.uuid);
    }
  };

  const form = (entry: NfsShareRow | undefined) => (
    <NfsEntryForm
      key={entry?.uuid ?? "new"}
      folder={{ uuid: folder.uuid, name: folder.name }}
      folderOk={folderOk}
      entry={entry}
      settings={settings.data}
      heading={{ ref: formHeadingRef }}
      describedBy={
        entries !== undefined && entries.length > 0
          ? `${noPasswordId} ${accessNotUsedId}`
          : undefined
      }
      onSaved={(uuid) => {
        setEditing(null);
        setTurnOnFailed(null);
        focusToRef.current = { kind: "entry", uuid };
      }}
      onTurnOnFailed={(failure) => {
        setEditing(null);
        setTurnOnFailed(failure);
      }}
      onCancel={() => {
        setEditing(null);
        focusToRef.current =
          entry === undefined
            ? { kind: "letIn" }
            : { kind: "entry", uuid: entry.uuid };
      }}
    />
  );

  const letInButton = (label: string) =>
    refusal === null ? (
      <Button
        ref={letInRef}
        variant="neutral"
        onClick={() => {
          focusToRef.current = { kind: "form" };
          setEditing({ kind: "new" });
        }}
      >
        {label}
      </Button>
    ) : (
      <div className="flex flex-col items-start gap-1">
        <Button
          ref={letInRef}
          variant="neutral"
          disabled
          focusableWhenDisabled
          aria-describedby={reasonId}
        >
          {label}
        </Button>
        <p id={reasonId} className="max-w-prose text-sm">
          {refusal === "notOk"
            ? t("nfs.dialog.folderNotOk")
            : t("folderNfs.cannot")}
        </p>
      </div>
    );

  const retryTurnOn = async () => {
    if (turnOnFailed === null || retrying) {
      return;
    }
    setRetrying(true);
    try {
      const result = await turnOn();
      if (result.ok) {
        toast.show({
          title: t("folderNfs.saved", {
            folder: isolateName(folder.name),
            client: words.short(classifyStored(turnOnFailed.client)),
          }),
        });
        focusToRef.current = { kind: "entry", uuid: turnOnFailed.uuid };
        setTurnOnFailed(null);
      } else {
        setTurnOnFailed({
          ...turnOnFailed,
          error: "error" in result ? result.error : null,
        });
      }
    } finally {
      setRetrying(false);
    }
  };
  const turnOnAlert =
    turnOnFailed === null ? null : (
      <InlineAlert
        tone="critical"
        title={
          <Trans
            i18nKey="folderNfs.turnOnFailed"
            components={{
              folder: folderName,
              client: (
                <TextSlot
                  value={words.short(classifyStored(turnOnFailed.client))}
                />
              ),
            }}
          />
        }
      >
        <span className="flex flex-col items-start gap-2">
          {isRpcError(turnOnFailed.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {turnOnFailed.error.message}
            </ServerMessage>
          ) : null}
          <Button
            variant="neutral"
            size="sm"
            loading={retrying}
            onClick={() => void retryTurnOn()}
          >
            {t("folderNfs.tryAgain")}
          </Button>
        </span>
      </InlineAlert>
    );

  let body;
  if (failed !== null) {
    body = (
      <InlineAlert tone="neutral" title={t("folderNfs.loadFailed")}>
        <span className="flex flex-col items-start gap-2">
          {isRpcError(failed.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failed.error.message}
            </ServerMessage>
          ) : null}
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              void shares.refetch();
              void settings.refetch();
            }}
          >
            {t("folderNfs.tryAgain")}
          </Button>
        </span>
      </InlineAlert>
    );
  } else if (entries === undefined || settings.data === undefined) {
    body = (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t("app.loading")}</span>
        <Skeleton className="w-72 max-w-full" />
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-pair">
        <p className="text-sm">{t("folderNfs.notShared")}</p>
        {editing?.kind === "new"
          ? form(undefined)
          : letInButton(t("folderNfs.letIn"))}
      </div>
    );
  } else {
    const versions = settings.data.versions;
    body = (
      <div className="flex flex-col gap-group">
        <div className="flex max-w-prose flex-col gap-1 text-sm">
          <p id={noPasswordId}>{t("folderNfs.noPassword")}</p>
          <p id={accessNotUsedId}>{t("folderNfs.accessNotUsed")}</p>
        </div>
        {nfsOn === false ? (
          <p className="flex flex-col items-start gap-1 text-sm">
            <span>{t("folderNfs.nfsOff")}</span>
            <Link to="/services/nfs" className={routerLinkClass}>
              {t("folderNfs.nfsOffLink")}
            </Link>
          </p>
        ) : null}
        <ul className="flex flex-col gap-5">
          {entries.map((entry, index) => {
            const client = entryClient(entry);
            const access = entryAccess(entry);
            const differ = otherOptionsDiffer(entry);
            const root = givesRoot(entry);
            const changing =
              editing?.kind === "change" && editing.uuid === entry.uuid;
            return (
              <li key={entry.uuid} className="flex flex-col gap-2">
                <h3
                  ref={(element) => {
                    if (element === null) {
                      entryHeadingsRef.current.delete(entry.uuid);
                    } else {
                      entryHeadingsRef.current.set(entry.uuid, element);
                    }
                  }}
                  tabIndex={-1}
                  className="text-base font-semibold outline-hidden [overflow-wrap:anywhere]"
                >
                  <NfsClientWords client={client} />
                </h3>
                <FactList>
                  <FactListItem>
                    <FactListLabel>{t("folderNfs.fact.access")}</FactListLabel>
                    <FactListValue>
                      {access.kind === "classic"
                        ? t("nfs.shares.classicValue", {
                            value: inertBidi(access.value),
                          })
                        : t(`access.${access.kind}`)}
                    </FactListValue>
                  </FactListItem>
                  {index === 0 && hostname !== undefined ? (
                    <FactListItem>
                      <FactListLabel>
                        {entries.length > 1
                          ? t("folderNfs.fact.addressAll")
                          : t("folderNfs.fact.address")}
                      </FactListLabel>
                      <FactListValue>
                        <NfsAddressList
                          hostname={hostname}
                          folder={folder.name}
                          versions={versions}
                        />
                      </FactListValue>
                    </FactListItem>
                  ) : null}
                  {differ ? (
                    <FactListItem>
                      <FactListLabel>
                        {t("folderNfs.fact.options")}
                      </FactListLabel>
                      <FactListValue>
                        <span className="flex flex-wrap items-center gap-x-2">
                          <Identifier
                            dir="ltr"
                            className="[overflow-wrap:anywhere]"
                          >
                            {inertBidi(entry.extraoptions ?? "")}
                          </Identifier>
                          <span className="text-sm text-muted-foreground">
                            {t("folderNfs.optionsClassic")}
                          </span>
                        </span>
                      </FactListValue>
                    </FactListItem>
                  ) : null}
                </FactList>
                {root ? (
                  <InlineAlert tone="neutral" icon="warning" role="note">
                    <span>
                      <Trans
                        i18nKey="folderNfs.rootWarn"
                        components={{ folder: folderName }}
                      />
                    </span>
                  </InlineAlert>
                ) : null}
                {changing ? (
                  form(entry)
                ) : (
                  <div className={buttonRowClass}>
                    <Button
                      variant="neutral"
                      onClick={() => {
                        focusToRef.current = { kind: "form" };
                        setEditing({ kind: "change", uuid: entry.uuid });
                      }}
                    >
                      {t("folderNfs.change")}
                    </Button>
                    <Button
                      variant="neutral"
                      className="sm:ms-4"
                      onClick={() => {
                        setStopError(null);
                        setStopping(entry);
                        setStopOpen(true);
                      }}
                    >
                      {t("folderNfs.stop.open")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {editing?.kind === "new" ? (
          form(undefined)
        ) : (
          <div>{letInButton(t("folderNfs.letAnother"))}</div>
        )}
      </div>
    );
  }

  const stoppingClient = stopping === null ? null : entryClient(stopping);
  const last = entries !== undefined && entries.length === 1;

  return (
    <section
      id="nfs"
      aria-labelledby="folder-nfs"
      className="flex min-w-0 flex-col gap-group"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="folder-nfs"
          ref={headingRef}
          tabIndex={-1}
          className="text-section text-foreground outline-hidden"
        >
          {t("folderNfs.title")}
        </h2>
        {pending !== undefined &&
        nfsFolderPending(memory, folder.uuid, pending) ? (
          <PendingMark />
        ) : null}
      </div>
      {turnOnAlert}
      {body}
      {stopping !== null && stoppingClient !== null ? (
        <ConfirmDialog
          open={stopOpen}
          onOpenChange={(open) => {
            if (!open && !stopBusy) {
              setStopOpen(false);
            }
          }}
          title={t("folderNfs.stop.title", {
            client: words.short(stoppingClient),
            folder: isolateName(folder.name),
          })}
          description={
            <span>
              <Trans
                i18nKey="folderNfs.stop.body"
                values={{ clientSentence: words.sentence(stoppingClient) }}
                components={{ folder: folderName }}
              />
              {last ? (
                <>
                  {" "}
                  <Trans
                    i18nKey="folderNfs.stop.last"
                    components={{ folder: folderName }}
                  />
                </>
              ) : null}
            </span>
          }
          cancelLabel={t("folderNfs.stop.cancel")}
          confirmLabel={t("folderNfs.stop.confirm")}
          pending={stopBusy}
          error={stopError ?? undefined}
          onConfirm={() => void stop()}
        >
          {otherOptionsDiffer(stopping) ? (
            <p className="text-base text-foreground">
              {t("folderNfs.stop.options")}
            </p>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
