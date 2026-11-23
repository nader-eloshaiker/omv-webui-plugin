// SPDX-License-Identifier: GPL-3.0-or-later
// The share form on a shared folder's page (phase 5 shares design 4.3, 4.4; 0.9, 0.10; P9, P10): the
// three plain options (shown in the network list, read only for everyone, guest access, never
// preselected), the guest warnings in the warning-shape neutral notice (not a pill: it is a choice),
// "Guests only" shown and kept until the reader changes it, and turning Windows and Mac sharing on in
// the same save, refused first for a NAS name longer than 15 characters.
//
// The recycle bin (phase 5 services design 11.3; D13): on or off, and the days files are kept (30 for
// a bin that was off); turning a stored bin off says that what is in it stays, using space.
//
// "Share" (or "Save") re-reads the share itself with SMB.getShare (services design 0.11, D12: it does
// not fail when another share's folder is gone, as the list does), the SMB settings and the folder's
// row just before the writes (0.10, R4) and checks the refusals again: then SMB.setShare (a new share
// with the classic form's defaults, or the share as read with only these fields changed), and
// SMB.setSettings with only `enable` changed when sharing is off. When the share was saved and turning
// sharing on failed, the form says so and "Try again" makes only the second call.
import type {
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  ExternalLink,
  InlineAlert,
  NumberField,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useState, type Ref } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  shareRefusal,
  type Refusal,
} from "../../sharedFolders/shareActions.ts";
import {
  beginAction,
  endAction,
  recordSaved,
  recordSmbSaved,
  runningOn,
} from "../../sharedFolders/sharesSession.ts";
import {
  changedShareRequest,
  newShareRequest,
  recycleDaysOf,
  recycleValid,
  settingsRequest,
  type ShareChoices,
} from "../../sharedFolders/smbModel.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { GuestAccessField } from "../molecules/GuestAccessField.tsx";

type Problem =
  | { kind: "failed"; error: unknown }
  /** The share is saved; turning Windows and Mac sharing on failed. */
  | { kind: "turnOn"; error: unknown }
  | { kind: "refused"; refusal: Refusal }
  | { kind: "gone" };

export function ShareForm({
  folder,
  share,
  smbOn,
  hostname,
  values,
  onValuesChange,
  onCancel,
  onSaved,
  headingId,
  headingRef,
}: {
  folder: SharedFolder;
  /** The folder's share as read; undefined for a new one. */
  share: SmbShareRow | undefined;
  /** Whether Windows and Mac sharing is on for the NAS; undefined while not known. */
  smbOn: boolean | undefined;
  hostname: string | undefined;
  values: ShareChoices;
  onValuesChange: (values: ShareChoices) => void;
  onCancel: () => void;
  /** The share was saved (and sharing turned on when it was off). */
  onSaved: () => void;
  headingId: string;
  /** The form's heading, which takes focus when the form opens (the button that opened it is gone). */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const reasonId = useId();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [daysShown, setDaysShown] = useState(false);
  const isNew = share === undefined;
  const set = (next: ShareChoices) => {
    if (problem?.kind !== "turnOn") {
      setProblem(null);
    }
    onValuesChange(next);
  };
  const guestTicked = values.guest !== "no";

  const refusal = shareRefusal({
    folder,
    guest: values.guest,
    smbOn,
    hostname,
    running: saving ? null : runningOn(folder.uuid),
  });

  const saved = (turnedOn: boolean) => {
    recordSaved(folder.uuid, "sharing");
    if (turnedOn) {
      recordSmbSaved();
    }
    toast.show({
      title: t(isNew ? "folderSmb.saved" : "folderSmb.savedChange", {
        folder: isolateName(folder.name),
      }),
    });
    onSaved();
  };

  const turnOn = async (): Promise<boolean> => {
    try {
      const settings = await api.settings();
      if (!settings.enable) {
        await api.setSmbSettings(settingsRequest(settings, true));
      }
      return true;
    } catch (error) {
      setProblem({ kind: "turnOn", error });
      return false;
    } finally {
      void api.settings().catch(() => undefined);
    }
  };

  const submit = async () => {
    if (saving || refusal !== null) {
      return;
    }
    if (!recycleValid(values.recycle)) {
      setDaysShown(true);
      return;
    }
    if (!beginAction(folder.uuid, "share")) {
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const [stored, settings, folders] = await Promise.all([
        share === undefined
          ? Promise.resolve(undefined)
          : api.share(share.uuid),
        api.settings(),
        api.folders(),
      ]);
      const now = folders.find((f) => f.uuid === folder.uuid);
      if (now === undefined) {
        setProblem({ kind: "gone" });
        return;
      }
      const again = shareRefusal({
        folder: now,
        guest: values.guest,
        smbOn: settings.enable,
        hostname,
      });
      if (again !== null) {
        setProblem({ kind: "refused", refusal: again });
        return;
      }
      await api.setShare(
        stored === undefined
          ? newShareRequest(folder.uuid, values)
          : changedShareRequest(stored, values),
      );
      await api.shares().catch(() => undefined);
      if (!settings.enable) {
        if (!(await turnOn())) {
          recordSaved(folder.uuid, "sharing");
          return;
        }
      }
      saved(!settings.enable);
    } catch (error) {
      setProblem({ kind: "failed", error });
    } finally {
      setSaving(false);
      endAction(folder.uuid);
    }
  };

  const retryTurnOn = async () => {
    if (saving || !beginAction(folder.uuid, "share")) {
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      if (await turnOn()) {
        saved(true);
      }
    } finally {
      setSaving(false);
      endAction(folder.uuid);
    }
  };

  const shown: Refusal | null =
    problem?.kind === "refused" ? problem.refusal : refusal;
  const reason = refusalWords(shown);
  const folderName = <FolderNameText value={folder.name} />;
  const serverMessage = (error: unknown) =>
    isRpcError(error) ? (
      <ServerMessage label={t("app.serverMessage")}>
        {error.message}
      </ServerMessage>
    ) : null;

  function refusalWords(r: Refusal | null) {
    if (r === null) {
      return null;
    }
    switch (r.kind) {
      case "needAccess":
        return t("folderSmb.needAccess");
      case "hostTooLong":
        return (
          <span className="flex flex-col items-start gap-1">
            <span>
              <Trans
                i18nKey="folderSmb.form.hostTooLong"
                values={{ count: r.length }}
                components={{
                  host: <IdentifierText value={inertBidi(r.host)} />,
                }}
              />
            </span>
            <ExternalLink
              href={CLASSIC.networkGeneral}
              newTabLabel={t("app.newTab")}
            >
              {t("folderSmb.form.hostLink")}
            </ExternalLink>
          </span>
        );
      case "running":
        return t("shareDelete.blocked.running", {
          action: t(`shares.action.${r.action}`),
        });
      default:
        return null;
    }
  }

  return (
    <form
      noValidate
      aria-labelledby={headingId}
      className="flex max-w-[44rem] flex-col gap-3 rounded-card border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold outline-hidden"
      >
        {isNew ? t("folderSmb.form.titleNew") : t("folderSmb.form.titleChange")}
      </h3>
      <CheckboxField
        label={t("folderSmb.form.browseable")}
        hint={t("folderSmb.form.browseableHint")}
        checked={values.browseable}
        disabled={saving}
        onCheckedChange={(checked) => set({ ...values, browseable: checked })}
      />
      <CheckboxField
        label={t("folderSmb.form.readonly")}
        hint={t("folderSmb.form.readonlyHint")}
        checked={values.readonly}
        disabled={saving}
        onCheckedChange={(checked) => set({ ...values, readonly: checked })}
      />
      <GuestAccessField
        checked={guestTicked}
        onCheckedChange={(checked) =>
          set({ ...values, guest: checked ? "allow" : "no" })
        }
        folder={folder.name}
        guestsOnly={values.guest === "only"}
        disabled={saving}
      />
      <RecycleFields
        values={values}
        storedOn={share?.recyclebin === true}
        folder={folder.name}
        disabled={saving}
        daysShown={daysShown}
        onDaysBlur={() => setDaysShown(true)}
        onChange={(recycle) => set({ ...values, recycle })}
      />
      {smbOn === false && shown?.kind !== "hostTooLong" ? (
        <p className="text-sm">{t("folderSmb.form.smbOff")}</p>
      ) : null}
      {problem?.kind === "failed" ? (
        <InlineAlert tone="critical" title={t("folderSmb.saveFailed")}>
          {serverMessage(problem.error)}
        </InlineAlert>
      ) : null}
      {problem?.kind === "gone" ? (
        <InlineAlert tone="critical">{t("sharedFolder.gone")}</InlineAlert>
      ) : null}
      {problem?.kind === "turnOn" ? (
        <InlineAlert
          tone="critical"
          title={
            <Trans
              i18nKey="folderSmb.turnOnFailed"
              components={{ folder: folderName }}
            />
          }
        >
          <span className="flex flex-col items-start gap-2">
            {serverMessage(problem.error)}
            <Button
              variant="neutral"
              size="sm"
              onClick={() => void retryTurnOn()}
            >
              {t("folderSmb.tryAgain")}
            </Button>
          </span>
        </InlineAlert>
      ) : null}
      <div className="flex flex-col gap-1">
        <div className={buttonRowClass}>
          {problem?.kind === "turnOn" ? null : (
            <Button
              type="submit"
              loading={saving}
              disabled={shown !== null}
              focusableWhenDisabled
              aria-describedby={reason === null ? undefined : reasonId}
            >
              {saving
                ? t("folderSmb.form.saving")
                : isNew
                  ? t("folderSmb.form.share")
                  : t("folderSmb.form.save")}
            </Button>
          )}
          <Button
            type="button"
            variant="neutral"
            disabled={saving}
            focusableWhenDisabled
            onClick={onCancel}
          >
            {t("folderSmb.form.cancel")}
          </Button>
        </div>
        {reason === null ? null : (
          <div id={reasonId} className="text-sm">
            {reason}
          </div>
        )}
      </div>
    </form>
  );
}

/** 11.3: the recycle bin's box, its days while ticked, and the line when a stored bin is turned off. */
function RecycleFields({
  values,
  storedOn,
  folder,
  disabled,
  daysShown,
  onDaysBlur,
  onChange,
}: {
  values: ShareChoices;
  /** The share's recycle bin is on as stored. */
  storedOn: boolean;
  folder: string;
  disabled: boolean;
  /** The days field was left or Save was pressed: its error may show. */
  daysShown: boolean;
  onDaysBlur: () => void;
  onChange: (recycle: NonNullable<ShareChoices["recycle"]>) => void;
}) {
  const { t } = useTranslation();
  const recycle = values.recycle ?? { on: false, days: "30" };
  const folderSlot = { folder: <FolderNameText value={folder} /> };
  return (
    <div className="flex flex-col gap-2">
      <CheckboxField
        label={t("folderSmb.form.recycle")}
        hint={
          <Trans i18nKey="folderSmb.form.recycleHint" components={folderSlot} />
        }
        warning={
          storedOn && !recycle.on ? (
            <span>
              <Trans
                i18nKey="folderSmb.form.recycleOffWarn"
                components={folderSlot}
              />
            </span>
          ) : undefined
        }
        checked={recycle.on}
        disabled={disabled}
        onCheckedChange={(checked) => onChange({ ...recycle, on: checked })}
      />
      {recycle.on ? (
        <NumberField
          className="ps-6"
          label={t("folderSmb.form.recycleDays")}
          unit={t("folderSmb.form.recycleDaysUnit")}
          hint={
            <Trans
              i18nKey="folderSmb.form.recycleDaysHint"
              components={folderSlot}
            />
          }
          error={
            daysShown && recycleDaysOf(recycle.days) === null
              ? t("folderSmb.form.recycleDaysErr")
              : undefined
          }
          value={recycle.days}
          disabled={disabled}
          onValueChange={(days) => onChange({ ...recycle, days })}
          onBlur={onDaysBlur}
        />
      ) : null}
    </div>
  );
}
