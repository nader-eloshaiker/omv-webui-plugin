// SPDX-License-Identifier: GPL-3.0-or-later
// The workgroup on Services > SMB/CIFS (phase 5 services design 11.2; 0.10, 0.11; P15): the stored
// value in a text field, checked on blur and on Save against OMV's NetBIOS-name rule, and Save, which
// re-reads SMB.getSettings and sends the whole reply with only `workgroup` changed. To the band.
import type { SmbSettings } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import {
  workgroupRequest,
  workgroupValid,
} from "../../sharedFolders/smbModel.ts";
import { PendingMark } from "../atoms/PendingMark.tsx";

export function SmbWorkgroupCard({
  settings,
  pending,
  onSaved,
}: {
  settings: SmbSettings;
  /** This session saved the workgroup and `samba` is still pending (0.9). */
  pending: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const stored = settings.workgroup ?? "";
  // The reader's text, or null while it is the stored value (so a new read shows through).
  const [draft, setDraft] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const value = draft ?? stored;
  const invalid = checked && !workgroupValid(value);

  const save = async () => {
    if (saving) {
      return;
    }
    setChecked(true);
    if (!workgroupValid(value)) {
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = await api.settings();
      await api.setSmbSettings(workgroupRequest(now, value));
      await api.settings().catch(() => undefined);
      setDraft(null);
      setChecked(false);
      onSaved();
      toast.show({ title: t("smb.workgroup.saved") });
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      render={<section aria-labelledby={headingId} />}
      className="flex max-w-xl flex-col gap-group p-4"
    >
      <div className="flex flex-col gap-pair">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={headingId} className="text-section text-foreground">
            {t("smb.workgroup.title")}
          </h2>
          {pending ? <PendingMark /> : null}
        </div>
        <p className="text-sm">{t("services.term.workgroup")}</p>
      </div>
      {error === null ? null : (
        <InlineAlert tone="critical" title={t("smb.workgroup.failed")}>
          {isRpcError(error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      )}
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field invalid={invalid ? true : undefined} className="max-w-sm">
          <FieldLabel>{t("smb.workgroup.field")}</FieldLabel>
          <FieldControl
            ref={inputRef}
            value={value}
            readOnly={saving}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => {
              setError(null);
              setDraft(event.target.value);
            }}
            onBlur={() => setChecked(true)}
          />
          <FieldHint>{t("smb.workgroup.hint")}</FieldHint>
          {invalid ? <FieldError>{t("smb.workgroup.err")}</FieldError> : null}
        </Field>
        <div>
          <Button type="submit" variant="neutral" loading={saving}>
            {saving ? t("smb.workgroup.saving") : t("smb.workgroup.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
