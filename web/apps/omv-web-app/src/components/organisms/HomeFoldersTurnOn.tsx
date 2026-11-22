// SPDX-License-Identifier: GPL-3.0-or-later
// Turning home folders on (phase 5 users design 12.3 items 4 and 7, 12.4, 12.5): a form with one radio
// option per shared folder that may hold them, none chosen (the one kept from last time first), the
// ones that cannot with their reasons behind a disclosure, and "Turn on home folders…", which opens a
// plain confirmation (nothing is erased; focus on Cancel). Confirming reads the setting, the shared
// folders and the file systems again and applies 12.4's rules to them before UserMgmt.setSettings
// with `enable` true and the folder's `uuid`; the request does the work for every person, so a step
// line says so while it runs. A failure keeps the dialog with the server's words; a cut request is
// "Could not tell…" with "Check again", which reads the setting. Nothing retries by itself (UI-14).
import type {
  ConfiguredFilesystem,
  SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  RadioGroupField,
  RadioOption,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isCut } from "../../filesystems/fsTasks.ts";
import { isolateName } from "../../format/isolate.ts";
import {
  homeChoices,
  offeredOrder,
  turnOnCheck,
  type HomeReason,
} from "../../homeFolders/homeModel.ts";
import { recordHomeSaved } from "../../homeFolders/homeSession.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameSlot } from "../atoms/FsNameSlot.tsx";

export function HomeFoldersTurnOn({
  folders,
  fileSystems,
  pending,
  kept,
  people,
  homesShared,
  stateRef,
}: {
  folders: readonly SharedFolder[];
  fileSystems: readonly ConfiguredFilesystem[];
  pending: readonly string[];
  /** The folder OMV keeps from last time (12.6), offered first. */
  kept: string;
  /** How many people are on the NAS; undefined when the list was not read. */
  people: number | undefined;
  /** Windows and Mac sharing shares home folders (`homesenable`, SMB on). */
  homesShared: boolean;
  stateRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  const toast = useToast();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState("");
  const [chooseError, setChooseError] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  const { offered, cannot } = homeChoices(folders, fileSystems, pending);
  const shown = offeredOrder(offered, kept);
  const folder = shown.find((f) => f.uuid === chosen);

  const reasonText = (
    reason: HomeReason,
    fs: ConfiguredFilesystem | undefined,
    device: string,
  ) =>
    reason === "whole" ? (
      <Trans
        i18nKey="homeFolders.reason.whole"
        components={{ fs: <FsNameSlot fs={fs} fallback={device} /> }}
      />
    ) : (
      t(`homeFolders.reason.${reason}`)
    );

  const serverWords = (failure: unknown) =>
    isRpcError(failure) ? (
      <ServerMessage label={t("app.serverMessage")}>
        {failure.message}
      </ServerMessage>
    ) : null;

  const finish = (name: string) => {
    recordHomeSaved();
    // Read again (the setting, and the folder now "in use"), so the page says what is stored now.
    void Promise.allSettled([api.homeSettings(), api.folders()]);
    setOpen(false);
    setUnknown(false);
    toast.show({
      title: t("homeFolders.on.done", { folder: isolateName(name) }),
    });
    stateRef.current?.focus();
  };

  const confirm = async () => {
    if (folder === undefined || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let check;
      try {
        const [settingsNow, foldersNow, fsNow, pendingNow] = await Promise.all([
          api.homeSettings(),
          api.folders(),
          api.fileSystems(),
          api.pending().catch(() => [] as string[]),
        ]);
        check = turnOnCheck(
          folder.uuid,
          settingsNow,
          foldersNow,
          fsNow,
          pendingNow,
        );
      } catch (failure) {
        setError(
          <span className="flex flex-col gap-2">
            <span>{t("homeFolders.recheckFailed")}</span>
            {serverWords(failure)}
          </span>,
        );
        return;
      }
      if (check.kind === "changed") {
        // The fresh read shows the page the setting as it is now, in place of this form.
        setOpen(false);
        toast.show({ title: t("homeFolders.changedElsewhere") });
        stateRef.current?.focus();
        return;
      }
      if (check.kind === "gone") {
        setError(
          t("sharedFolder.notFound", { folder: isolateName(folder.name) }),
        );
        return;
      }
      if (check.kind === "refused") {
        setError(
          <span>
            <Trans
              i18nKey="homeFolders.refused"
              components={{
                folder: <FolderNameText value={check.folder.name} />,
              }}
            />{" "}
            {reasonText(check.reason, check.fs, check.folder.device)}
          </span>,
        );
        return;
      }
      try {
        await api.setHomeSettings({
          enable: true,
          sharedfolderref: check.folder.uuid,
        });
      } catch (failure) {
        if (isCut(failure)) {
          setUnknown(true);
          return;
        }
        setError(
          <span className="flex flex-col gap-2">
            <span>{t("homeFolders.saveFailed")}</span>
            {serverWords(failure)}
            <span>{t("homeFolders.on.partly")}</span>
          </span>,
        );
        return;
      }
      finish(check.folder.name);
    } finally {
      setSaving(false);
    }
  };

  /** "Check again" after a cut request: the setting says whether they were turned on. */
  const checkAgain = async () => {
    if (folder === undefined || saving) {
      return;
    }
    setSaving(true);
    try {
      const now = await api.homeSettings();
      if (now.enable && now.sharedfolderref === folder.uuid) {
        finish(folder.name);
      } else {
        setUnknown(false);
        setError(t("homeFolders.on.partly"));
      }
    } catch {
      // Still not known: the reader may check again.
    } finally {
      setSaving(false);
    }
  };

  const disclosure =
    cannot.length === 0 ? null : (
      <Disclosure>
        <DisclosureTrigger>
          {t("homeFolders.cannot", { count: cannot.length })}
        </DisclosureTrigger>
        <DisclosurePanel>
          <ul className="flex flex-col gap-2">
            {cannot.map((c) => (
              <li key={c.folder.uuid} className="flex flex-col">
                <FolderNameText value={c.folder.name} />
                <span className="text-sm text-muted-foreground">
                  {reasonText(c.reason, c.fs, c.folder.device)}
                </span>
              </li>
            ))}
          </ul>
        </DisclosurePanel>
      </Disclosure>
    );

  if (shown.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p>{t("homeFolders.none")}</p>
        <p>
          <Link to="/storage/shared-folders/add" className={routerLinkClass}>
            {t("homeFolders.addFolder")}
          </Link>
        </p>
        {disclosure}
      </div>
    );
  }

  const peopleCount = people;
  const progress =
    peopleCount === undefined
      ? t("homeFolders.saving")
      : t("homeFolders.on.progress", { count: peopleCount });

  return (
    <>
      <form
        noValidate
        className="flex max-w-xl flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (folder === undefined) {
            setChooseError(true);
            return;
          }
          setError(null);
          setUnknown(false);
          setOpen(true);
        }}
      >
        <RadioGroupField
          legend={t("homeFolders.choose")}
          value={chosen}
          onValueChange={(value) => {
            setChosen(value);
            setChooseError(false);
          }}
          error={chooseError ? t("homeFolders.chooseRequired") : undefined}
          name="sharedfolderref"
        >
          {shown.map((f) => (
            <RadioOption
              key={f.uuid}
              value={f.uuid}
              label={<FolderNameText value={f.name} />}
            />
          ))}
        </RadioGroupField>
        {disclosure}
        <div>
          <Button ref={openerRef} type="submit" variant="primary">
            {t("homeFolders.turnOn")}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !saving) {
            setOpen(false);
            setUnknown(false);
            openerRef.current?.focus();
          }
        }}
        title={t("homeFolders.on.title", {
          folder: isolateName(folder?.name ?? ""),
        })}
        description={
          <Trans
            i18nKey={
              peopleCount === undefined
                ? "homeFolders.on.bodyNoCount"
                : "homeFolders.on.body"
            }
            count={peopleCount}
            components={{
              folder: <FolderNameText value={folder?.name ?? ""} />,
            }}
          />
        }
        confirmLabel={
          saving
            ? t("homeFolders.saving")
            : unknown
              ? t("homeFolders.checkAgain")
              : t("homeFolders.on.confirm")
        }
        cancelLabel={t("homeFolders.cancel")}
        pending={saving}
        error={unknown ? t("homeFolders.on.unknown") : (error ?? undefined)}
        onConfirm={() => void (unknown ? checkAgain() : confirm())}
      >
        <p>{t("homeFolders.on.move")}</p>
        <p>{t("homeFolders.on.wait")}</p>
        {homesShared ? <p>{t("homeFolders.on.smb")}</p> : null}
        <p role="status" className="text-sm">
          {saving && !unknown ? progress : ""}
        </p>
      </ConfirmDialog>
    </>
  );
}
