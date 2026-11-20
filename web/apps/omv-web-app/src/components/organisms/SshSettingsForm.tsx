// SPDX-License-Identifier: GPL-3.0-or-later
// The SSH settings form (phase 3 design 3.2 to 3.4): edit, Save (SSH.set with the whole object), then
// Apply in the pending band, which the transport's x-omv-dirty signal brings up. The port is the one
// blocking check; the warnings never block. On/off settings are checkboxes: nothing takes effect until
// Save and Apply. A refetch never overwrites unsaved edits; while clean, the form follows the server.
import type { SshSettings } from "@omv-webui/react-api-omv/generated";
import {
  getSshGetQueryKey,
  useSshSet,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  ServerMessage,
  TextareaField,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  fromDraft,
  isDirty,
  linesSet,
  pagePort,
  portProblem,
  sshWarnings,
  toDraft,
  type PortProblem,
  type SshDraft,
} from "../../ssh/sshForm.ts";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";

type BooleanSetting = Exclude<keyof SshSettings, "port" | "extraoptions">;

interface Props {
  /** What the server holds now. */
  saved: SshSettings;
  /** SSH has saved changes waiting to be applied. */
  pending: boolean;
}

export function SshSettingsForm({ saved, pending }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useSshSet();
  const [draft, setDraft] = useState<SshDraft | null>(null);
  const [portError, setPortError] = useState<PortProblem | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const alertRef = useRef<HTMLDivElement>(null);
  const portRef = useRef<HTMLInputElement>(null);
  const noChangesId = useId();
  const webPort = pagePort(window.location);

  // When the saved changes are applied (or undone), the "Saved" line has done its job.
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) {
      setSavedNotice(false);
    }
  }

  const values = draft ?? toDraft(saved);
  const dirty = draft !== null && isDirty(saved, draft);
  const warnings = sshWarnings(saved, values);
  const saving = save.isPending;
  const failure = save.error;

  useEffect(() => {
    if (failure) {
      alertRef.current?.focus();
    }
  }, [failure]);

  const edit = (change: Partial<SshDraft>) => {
    setDraft({ ...values, ...change });
    setSavedNotice(false);
  };

  const checkbox = (key: BooleanSetting) => ({
    checked: values[key],
    readOnly: saving,
    onCheckedChange: (checked: boolean) => edit({ [key]: checked }),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving || draft === null) {
      return;
    }
    const problem = portProblem(draft.port, webPort);
    setPortError(problem);
    if (problem) {
      portRef.current?.focus();
      return;
    }
    save.reset();
    save.mutate(
      { data: fromDraft(draft) },
      {
        onSuccess: (stored) => {
          queryClient.setQueryData(getSshGetQueryKey(), stored);
          void queryClient.invalidateQueries({ queryKey: getSshGetQueryKey() });
          setDraft(null);
          setSavedNotice(true);
        },
      },
    );
  };

  const discard = () => {
    setDraft(null);
    setPortError(null);
    save.reset();
  };

  const extraLines = linesSet(values.extraoptions);
  const portMessage =
    portError === "required"
      ? t("ssh.portRequired")
      : portError === "range"
        ? t("ssh.portRange")
        : portError === "inUse"
          ? t("ssh.portInUse", { port: values.port.trim() })
          : null;

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={t("ssh.title")}
      className="flex max-w-[40rem] flex-col gap-5"
    >
      <LeaveGuard when={dirty} />
      {failure ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("ssh.saveFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <CheckboxField
          label={t("ssh.enable")}
          hint={t("ssh.enableHint")}
          {...checkbox("enable")}
        />
        {values.enable ? null : (
          <p className="text-sm text-muted-foreground">{t("ssh.offNote")}</p>
        )}
        {warnings.turningOff ? (
          <InlineAlert tone="neutral">{t("ssh.warnTurningOff")}</InlineAlert>
        ) : null}
      </div>

      <Field invalid={portMessage ? true : undefined}>
        <FieldLabel>{t("ssh.port")}</FieldLabel>
        <FieldControl
          ref={portRef}
          name="port"
          inputMode="numeric"
          autoComplete="off"
          readOnly={saving}
          value={values.port}
          className="w-[8ch] min-w-24 tabular-nums"
          onChange={(event) => {
            edit({ port: event.target.value });
            setPortError(null);
          }}
          onBlur={() => setPortError(portProblem(values.port, webPort))}
        />
        <FieldHint>{t("ssh.portHint")}</FieldHint>
        {portMessage ? <FieldError>{portMessage}</FieldError> : null}
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold text-foreground">
          {t("ssh.signIn")}
        </legend>
        <CheckboxField
          label={t("ssh.password")}
          {...checkbox("passwordauthentication")}
        />
        <CheckboxField
          label={t("ssh.key")}
          hint={t("ssh.keyHint")}
          {...checkbox("pubkeyauthentication")}
        />
        <CheckboxField
          label={t("ssh.root")}
          hint={t("ssh.rootHint")}
          {...checkbox("permitrootlogin")}
        />
        {warnings.noMethod ? (
          <InlineAlert tone="neutral">{t("ssh.warnNoMethod")}</InlineAlert>
        ) : null}
        {warnings.rootPassword ? (
          <InlineAlert tone="neutral">{t("ssh.warnRootPassword")}</InlineAlert>
        ) : null}
        {warnings.keysOnly ? (
          <InlineAlert tone="neutral">{t("ssh.warnKeysOnly")}</InlineAlert>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-semibold text-foreground">
          {t("ssh.connection")}
        </legend>
        <CheckboxField
          label={t("ssh.forwarding")}
          hint={t("ssh.forwardingHint")}
          {...checkbox("tcpforwarding")}
        />
        <CheckboxField
          label={t("ssh.compression")}
          hint={t("ssh.compressionHint")}
          {...checkbox("compression")}
        />
      </fieldset>

      <Disclosure defaultOpen={saved.extraoptions.trim() !== ""}>
        <DisclosureTrigger>
          {extraLines > 0
            ? t("ssh.advancedSet", { count: extraLines })
            : t("ssh.advanced")}
        </DisclosureTrigger>
        <DisclosurePanel>
          <TextareaField
            label={t("ssh.extra")}
            hint={t("ssh.extraHint")}
            mono
            rows={4}
            maxRows={12}
            readOnly={saving}
            value={values.extraoptions}
            onChange={(event) => edit({ extraoptions: event.target.value })}
          />
        </DisclosurePanel>
      </Disclosure>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={saving}
            disabled={!dirty}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={!dirty || saving}
            focusableWhenDisabled
            aria-describedby={dirty ? undefined : noChangesId}
            onClick={discard}
          >
            {t("common.discard")}
          </Button>
          {dirty ? null : (
            <span id={noChangesId} className="text-sm text-muted-foreground">
              {t("common.noChanges")}
            </span>
          )}
        </div>
        <p role="status" className="text-sm text-foreground empty:hidden">
          {savedNotice ? t("ssh.saved") : ""}
        </p>
      </div>
    </form>
  );
}
