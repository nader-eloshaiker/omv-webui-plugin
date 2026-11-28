// SPDX-License-Identifier: GPL-3.0-or-later
// "Windows and Mac computers" on a shared folder's page (phase 5 shares design 4; 0.3, 0.10; P9 to
// P11): whether the folder is shared over SMB and how, the share form in place, "Turn it on" for a
// share turned off in the classic interface (a save to the band, no dialog: it restores what was set),
// and "Stop sharing…" with a plain confirmation (SMB.deleteShare: no file is touched). After stopping,
// the button that opened the dialog is gone, so focus moves to the section heading (15.2). Opening
// the share form removes the button that opened it too, so focus moves to the form's heading.
//
// The facts include the recycle bin (phase 5 services design 11.1, 11.3) and, when it is on, "Empty the
// recycle bin…" (11.4, RecycleBinEmpty). "Turn it on" reads the share with SMB.getShare just before
// the write (services design 0.11, D12).
//
// When the share list or the SMB settings could not be read, the section says so with the server's
// words and offers no sharing action (4.6); on the test VM the share list fails outright when a share
// names a shared folder whose record is gone (section 19, item 13).
import type {
  SharedFolder,
  SmbSettings,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
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
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { anyoneHasAccess, entriesOf } from "../../sharedFolders/accessModel.ts";
import type { ShareDraft } from "../../sharedFolders/folderPage.ts";
import {
  beginAction,
  endAction,
  recordSaved,
  runningOn,
  type SharesAction,
} from "../../sharedFolders/sharesSession.ts";
import {
  changedShareRequest,
  folderShareState,
  guestMode,
  otherOptionsDiffer,
  recycleView,
  shareAddresses,
  shareChoicesOf,
  shareOf,
} from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";
import { ShareAddressList } from "../molecules/ShareAddressList.tsx";
import { RecycleBinEmpty } from "./RecycleBinEmpty.tsx";
import { ShareForm } from "./ShareForm.tsx";

interface Read<T> {
  data: T | undefined;
  failed: boolean;
  error: unknown;
  retry: () => void;
}

type Problem =
  | { kind: "running"; action: SharesAction }
  | { kind: "needAccess" }
  | { kind: "turnOnFailed"; error: unknown };

export function FolderSmbSection({
  folder,
  shares,
  settings,
  hostname,
  draft,
  onDraftChange,
  pending,
  pendingModules,
  stopOpen,
  onStopOpenChange,
}: {
  folder: SharedFolder;
  shares: Read<readonly SmbShareRow[]>;
  settings: Read<SmbSettings>;
  hostname: string | undefined;
  draft: ShareDraft;
  onDraftChange: (draft: ShareDraft) => void;
  /** This session saved how it is shared and it is not applied yet (0.8). */
  pending: boolean;
  /** The pending modules; undefined while not read (emptying the recycle bin waits for `samba`). */
  pendingModules?: readonly string[];
  /** "Stop sharing…" is open; the delete section opens it too (8.1). */
  stopOpen: boolean;
  onStopOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const formHeadingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<"stop" | "turnOn" | null>(null);
  const [stopError, setStopError] = useState<unknown>(null);
  // Focus moves after the render that removed what held it (the change that removes it re-renders).
  const focusToRef = useRef<"heading" | "share" | "form" | null>(null);
  useEffect(() => {
    const target = focusToRef.current;
    if (target === null || stopOpen) {
      return;
    }
    focusToRef.current = null;
    (target === "heading"
      ? headingRef
      : target === "form"
        ? formHeadingRef
        : shareButtonRef
    ).current?.focus();
  });

  const failed = shares.failed ? shares : settings.failed ? settings : null;
  const ready = shares.data !== undefined && settings.data !== undefined;
  const share =
    shares.data === undefined ? undefined : shareOf(shares.data, folder.uuid);
  const on = settings.data?.enable;
  const view = folderShareState(share, on);

  const turnOnShare = async () => {
    if (share === undefined || busy !== null) {
      return;
    }
    setProblem(null);
    if (
      guestMode(share.guest) === "no" &&
      !anyoneHasAccess(entriesOf(folder.privileges))
    ) {
      setProblem({ kind: "needAccess" });
      return;
    }
    if (!beginAction(folder.uuid, "share")) {
      const action = runningOn(folder.uuid);
      if (action !== null) {
        setProblem({ kind: "running", action });
      }
      return;
    }
    setBusy("turnOn");
    try {
      const row = await api.share(share.uuid);
      if (row.sharedfolderref === folder.uuid) {
        await api.setShare(changedShareRequest(row, { enable: true }));
        recordSaved(folder.uuid, "sharing");
        toast.show({
          title: t("folderSmb.turnedOnShare", {
            folder: isolateName(folder.name),
          }),
        });
      }
      await api.shares().catch(() => undefined);
    } catch (error) {
      setProblem({ kind: "turnOnFailed", error });
    } finally {
      setBusy(null);
      endAction(folder.uuid);
    }
  };

  const stop = async () => {
    if (share === undefined || busy !== null) {
      return;
    }
    if (!beginAction(folder.uuid, "stopShare")) {
      const action = runningOn(folder.uuid);
      setStopError(
        action === null
          ? null
          : t("shareDelete.blocked.running", {
              action: t(`shares.action.${action}`),
            }),
      );
      return;
    }
    setBusy("stop");
    setStopError(null);
    try {
      await api.deleteShare(share.uuid);
      recordSaved(folder.uuid, "sharing");
      await api.shares().catch(() => undefined);
      toast.show({
        title: t("folderSmb.stopped", { folder: isolateName(folder.name) }),
      });
      onStopOpenChange(false);
      focusToRef.current = "heading";
    } catch (error) {
      setStopError(
        isRpcError(error)
          ? `${t("folderSmb.stopFailed")} ${error.message}`
          : t("folderSmb.stopFailed"),
      );
    } finally {
      setBusy(null);
      endAction(folder.uuid);
    }
  };

  const folderName = <FolderNameText value={folder.name} />;
  const addresses =
    hostname === undefined ? null : shareAddresses(hostname, folder.name);
  let body;
  if (failed !== null) {
    body = (
      <InlineAlert tone="neutral" title={t("folderSmb.loadFailed")}>
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
              shares.retry();
              settings.retry();
            }}
          >
            {t("common.tryAgain")}
          </Button>
        </span>
      </InlineAlert>
    );
  } else if (!ready) {
    body = (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t("app.loading")}</span>
        <Skeleton className="w-72 max-w-full" />
      </div>
    );
  } else if (view.kind === "notShared") {
    body =
      draft === null ? (
        <div className="flex flex-col items-start gap-pair">
          <p className="text-sm">{t("folderSmb.notShared")}</p>
          <Button
            ref={shareButtonRef}
            variant="neutral"
            onClick={() => {
              focusToRef.current = "form";
              onDraftChange(shareChoicesOf(undefined));
            }}
          >
            {t("folderSmb.share")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-pair">
          <p className="text-sm">{t("folderSmb.notShared")}</p>
          <ShareForm
            folder={folder}
            share={undefined}
            smbOn={on}
            hostname={hostname}
            values={draft}
            onValuesChange={onDraftChange}
            headingId={formHeadingId}
            headingRef={formHeadingRef}
            onCancel={() => {
              onDraftChange(null);
              focusToRef.current = "share";
            }}
            onSaved={() => {
              onDraftChange(null);
              focusToRef.current = "heading";
            }}
          />
        </div>
      );
  } else {
    const row = view.share;
    const guest = guestMode(row.guest);
    body = (
      <div className="flex flex-col gap-group">
        <FactList>
          <FactListItem>
            <FactListLabel>{t("folderSmb.fact.sharedAs")}</FactListLabel>
            <FactListValue>
              {view.kind === "shared" && hostname !== undefined ? (
                <ShareAddressList hostname={hostname} folder={folder.name} />
              ) : view.kind === "smbOff" ? (
                <span className="flex flex-col items-start gap-1">
                  <span>{t("folderSmb.sharedSmbOff")}</span>
                  <Link to="/services/smb" className={routerLinkClass}>
                    {t("sharedFolders.smbOffLink")}
                  </Link>
                </span>
              ) : view.kind === "disabled" ? (
                t("folderSmb.sharedDisabled")
              ) : null}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("folderSmb.fact.browseable")}</FactListLabel>
            <FactListValue>
              {row.browseable ? t("folderSmb.yes") : t("folderSmb.no")}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("folderSmb.fact.readonly")}</FactListLabel>
            <FactListValue>
              {row.readonly ? t("folderSmb.yes") : t("folderSmb.no")}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("folderSmb.fact.guest")}</FactListLabel>
            <FactListValue>
              {guest === "no"
                ? t("folderSmb.guest.off")
                : guest === "allow"
                  ? t("folderSmb.guest.on")
                  : t("folderSmb.guest.only")}
            </FactListValue>
          </FactListItem>
          <FactListItem>
            <FactListLabel>{t("folderSmb.fact.recycle")}</FactListLabel>
            <FactListValue>
              <RecycleWords share={row} />
            </FactListValue>
          </FactListItem>
          {otherOptionsDiffer(row) ? (
            <FactListItem>
              <FactListLabel>{t("folderSmb.fact.other")}</FactListLabel>
              <FactListValue>{t("folderSmb.otherOptions")}</FactListValue>
            </FactListItem>
          ) : null}
        </FactList>
        {row.recyclebin === true && draft === null ? (
          <RecycleBinEmpty
            shareUuid={row.uuid}
            folder={folder.name}
            pending={pendingModules}
            smbOn={on}
            savedHere={pending}
          />
        ) : null}
        {problem !== null ? (
          <InlineAlert
            tone={problem.kind === "turnOnFailed" ? "critical" : "neutral"}
            title={
              problem.kind === "turnOnFailed" ? (
                <Trans
                  i18nKey="folderSmb.turnOnShareFailed"
                  components={{ folder: folderName }}
                />
              ) : undefined
            }
          >
            {problem.kind === "turnOnFailed" ? (
              isRpcError(problem.error) ? (
                <ServerMessage label={t("app.serverMessage")}>
                  {problem.error.message}
                </ServerMessage>
              ) : null
            ) : problem.kind === "needAccess" ? (
              t("folderSmb.needAccess")
            ) : (
              t("shareDelete.blocked.running", {
                action: t(`shares.action.${problem.action}`),
              })
            )}
          </InlineAlert>
        ) : null}
        {draft === null ? (
          <div className={buttonRowClass}>
            {view.kind === "disabled" ? (
              <Button
                variant="neutral"
                loading={busy === "turnOn"}
                onClick={() => void turnOnShare()}
              >
                {t("folderSmb.turnOn")}
              </Button>
            ) : null}
            <Button
              variant="neutral"
              onClick={() => {
                setProblem(null);
                focusToRef.current = "form";
                onDraftChange(shareChoicesOf(row));
              }}
            >
              {t("folderSmb.change")}
            </Button>
            <Button
              variant="neutral"
              className="sm:ms-4"
              onClick={() => {
                setStopError(null);
                onStopOpenChange(true);
              }}
            >
              {t("folderSmb.stop.open")}
            </Button>
          </div>
        ) : (
          <ShareForm
            folder={folder}
            share={row}
            smbOn={on}
            hostname={hostname}
            values={draft}
            onValuesChange={onDraftChange}
            headingId={formHeadingId}
            headingRef={formHeadingRef}
            onCancel={() => {
              onDraftChange(null);
              focusToRef.current = "heading";
            }}
            onSaved={() => {
              onDraftChange(null);
              focusToRef.current = "heading";
            }}
          />
        )}
      </div>
    );
  }

  return (
    <section
      id="sharing"
      aria-labelledby="folder-smb"
      className="flex min-w-0 flex-col gap-group"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          id="folder-smb"
          ref={headingRef}
          tabIndex={-1}
          className="text-section text-foreground outline-hidden"
        >
          {t("folderSmb.title")}
        </h2>
        {pending ? <PendingMark /> : null}
      </div>
      {body}
      {share === undefined ? null : (
        <ConfirmDialog
          open={stopOpen}
          onOpenChange={(open) => {
            if (!open && busy !== "stop") {
              onStopOpenChange(false);
            }
          }}
          title={t("folderSmb.stop.title", {
            folder: isolateName(folder.name),
          })}
          description={
            <Trans
              i18nKey="folderSmb.stop.body"
              components={{
                address: (
                  <IdentifierText
                    value={inertBidi(addresses?.windows ?? folder.name)}
                  />
                ),
              }}
            />
          }
          cancelLabel={t("folderSmb.stop.cancel")}
          confirmLabel={t("folderSmb.stop.confirm")}
          pending={busy === "stop"}
          error={typeof stopError === "string" ? stopError : undefined}
          onConfirm={() => void stop()}
        >
          {otherOptionsDiffer(share) ? (
            <p className="text-base text-foreground">
              {t("folderSmb.stop.options")}
            </p>
          ) : null}
        </ConfirmDialog>
      )}
    </section>
  );
}

/** 0.3's words for a share's recycle bin. */
function RecycleWords({ share }: { share: SmbShareRow }) {
  const { t } = useTranslation();
  const view = recycleView(share);
  return view.kind === "off"
    ? t("folderSmb.recycle.off")
    : view.kind === "forever"
      ? t("folderSmb.recycle.forever")
      : t("folderSmb.recycle.days", { count: view.days });
}
