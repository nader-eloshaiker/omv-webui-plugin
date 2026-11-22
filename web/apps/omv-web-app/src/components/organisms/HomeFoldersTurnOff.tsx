// SPDX-License-Identifier: GPL-3.0-or-later
// Turning home folders off (phase 5 users design 12.6): "Turn off home folders…" (neutral) and its
// plain confirmation (nothing is erased; access to home folders is cut), focus on Cancel. Confirming
// reads the setting again and sends UserMgmt.setSettings with `enable` false and the folder's `uuid`
// kept (OMV stores both, so turning them on again offers the same folder first). Also the only action
// when their shared folder no longer exists (12.7). Nothing retries by itself (UI-14).
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isCut } from "../../filesystems/fsTasks.ts";
import { isolateName } from "../../format/isolate.ts";
import { recordHomeSaved } from "../../homeFolders/homeSession.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";

export function HomeFoldersTurnOff({
  folder,
  homesShared,
  stateRef,
}: {
  /** The shared folder that holds them; undefined when it no longer exists. */
  folder: SharedFolder | undefined;
  /** Windows and Mac sharing shares home folders (`homesenable`, SMB on). */
  homesShared: boolean;
  stateRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const toast = useToast();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const serverWords = (failure: unknown) =>
    isRpcError(failure) ? (
      <ServerMessage label={t("app.serverMessage")}>
        {failure.message}
      </ServerMessage>
    ) : null;

  const finish = () => {
    recordHomeSaved();
    void Promise.allSettled([api.homeSettings(), api.folders()]);
    setOpen(false);
    setUnknown(false);
    toast.show({
      title:
        folder === undefined
          ? t("homeFolders.off.doneGone")
          : t("homeFolders.off.done", { folder: isolateName(folder.name) }),
    });
    stateRef.current?.focus();
  };

  const confirm = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let kept: string;
      try {
        const now = await api.homeSettings();
        if (!now.enable) {
          // The fresh read shows the page the setting as it is now, in place of this button.
          setOpen(false);
          toast.show({ title: t("homeFolders.changedElsewhere") });
          stateRef.current?.focus();
          return;
        }
        kept = now.sharedfolderref;
      } catch (failure) {
        setError(
          <span className="flex flex-col gap-2">
            <span>{t("homeFolders.recheckFailed")}</span>
            {serverWords(failure)}
          </span>,
        );
        return;
      }
      try {
        await api.setHomeSettings({ enable: false, sharedfolderref: kept });
      } catch (failure) {
        if (isCut(failure)) {
          setUnknown(true);
          return;
        }
        setError(
          <span className="flex flex-col gap-2">
            <span>{t("homeFolders.saveFailed")}</span>
            {serverWords(failure)}
          </span>,
        );
        return;
      }
      finish();
    } finally {
      setSaving(false);
    }
  };

  /** "Check again" after a cut request: the setting says whether they were turned off. */
  const checkAgain = async () => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const now = await api.homeSettings();
      if (!now.enable) {
        finish();
      } else {
        setUnknown(false);
      }
    } catch {
      // Still not known: the reader may check again.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Button
        ref={openerRef}
        variant="neutral"
        onClick={() => {
          setError(null);
          setUnknown(false);
          setOpen(true);
        }}
      >
        {t("homeFolders.turnOff")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !saving) {
            setOpen(false);
            setUnknown(false);
            openerRef.current?.focus();
          }
        }}
        title={t("homeFolders.off.title")}
        description={
          folder === undefined ? (
            t("homeFolders.off.bodyGone")
          ) : (
            <Trans
              i18nKey="homeFolders.off.body"
              components={{ folder: <FolderNameText value={folder.name} /> }}
            />
          )
        }
        confirmLabel={
          saving
            ? t("homeFolders.saving")
            : unknown
              ? t("homeFolders.checkAgain")
              : t("homeFolders.off.confirm")
        }
        cancelLabel={t("homeFolders.cancel")}
        pending={saving}
        error={unknown ? t("homeFolders.off.unknown") : (error ?? undefined)}
        onConfirm={() => void (unknown ? checkAgain() : confirm())}
      >
        {homesShared ? <p>{t("homeFolders.off.smb")}</p> : null}
        <p>{t("homeFolders.off.programs")}</p>
      </ConfirmDialog>
    </div>
  );
}
