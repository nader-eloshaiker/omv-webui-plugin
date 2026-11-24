// SPDX-License-Identifier: GPL-3.0-or-later
// The proxy form (phase 5 network design 12.2, 12.3, 0.6, 0.9): three cards in one form, each "Use a
// proxy for …" with its address, port, user name and password. OMV replaces the whole object and
// needs every password on each save, and this page never holds a stored one, so each stored password
// is a required choice: type it again, or remove it; Save is unavailable until each is answered.
// Saving is Not affected for this page (0.5): straight to the band. The settings are read again just
// before the save (R4). Typed passwords live in form state only until the request ends, whatever its
// outcome; the write keeps nothing in the mutation cache (useNetworkApi) and the reply carries none.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CheckboxField,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  InlineAlert,
  NumberField,
  SecretField,
  ServerMessage,
  useToast,
} from "@omv-webui/react-ui-components";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useNetworkApi } from "../../hooks/useNetworkApi.ts";
import type { ProxyKind, ProxySettings } from "../../network/dto.ts";
import {
  checkProxy,
  PROXY_KINDS,
  proxyDraft,
  setProxyRequest,
  type PasswordDraft,
  type ProxyCardDraft,
  type ProxyDraft,
  type ProxyProblem,
} from "../../network/proxyModel.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { LeaveGuard } from "../molecules/LeaveGuard.tsx";

/** What the form was opened from, and what has been typed since. */
interface Editing {
  base: ProxySettings;
  values: ProxyDraft;
}

/** The fifteen fields as read, for "changed since you opened it" (R4). */
const sameRead = (a: ProxySettings, b: ProxySettings): boolean =>
  PROXY_KINDS.every(
    (k) =>
      a[`${k}enable`] === b[`${k}enable`] &&
      a[`${k}host`] === b[`${k}host`] &&
      a[`${k}port`] === b[`${k}port`] &&
      a[`${k}username`] === b[`${k}username`] &&
      Boolean(a[`${k}password`]) === Boolean(b[`${k}password`]),
  );

/** Every password back to its first state: none typed, no choice made (0.6). */
function withoutPasswords(draft: ProxyDraft): ProxyDraft {
  const clear = (p: PasswordDraft): PasswordDraft =>
    p.stored ? { stored: true, choice: null } : { stored: false, typed: "" };
  return {
    http: { ...draft.http, password: clear(draft.http.password) },
    https: { ...draft.https, password: clear(draft.https.password) },
    ftp: { ...draft.ftp, password: clear(draft.ftp.password) },
  };
}

const sameDraft = (a: ProxyDraft, b: ProxyDraft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function ProxyForm({
  saved,
  onDirtyChange,
}: {
  saved: ProxySettings;
  /** The form holds unsaved work: the page stops reading again on focus. */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useNetworkApi();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const needId = useId();
  const noChangesId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  // A new key empties every password field after a request or a discard (SecretField holds no value).
  const [secretsKey, setSecretsKey] = useState(0);
  const [tried, setTried] = useState(false);
  const [blurred, setBlurred] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [changedSince, setChangedSince] = useState(false);
  const [askFocus, setAskFocus] = useState(0);

  const first = proxyDraft(saved);
  const values = editing?.values ?? first;
  const dirty =
    editing !== null && !sameDraft(editing.values, proxyDraft(editing.base));
  const problems = checkProxy(values);
  const need = problems.find(
    (p): p is Extract<ProxyProblem, { field: "passwords" }> =>
      p.field === "passwords",
  );

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (askFocus === 0) {
      return;
    }
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [askFocus]);

  useEffect(() => {
    if (failure !== null || changedSince) {
      alertRef.current?.focus();
    }
  }, [failure, changedSince]);

  const editCard = (kind: ProxyKind, change: Partial<ProxyCardDraft>) => {
    setChangedSince(false);
    setEditing((e) => {
      const base = e?.base ?? saved;
      const current = e?.values ?? proxyDraft(base);
      return {
        base,
        values: { ...current, [kind]: { ...current[kind], ...change } },
      };
    });
  };

  const fieldError = (kind: ProxyKind, field: "host" | "port") => {
    const shown = tried || blurred.has(`${kind}.${field}`);
    const found = problems.find(
      (p) => p.field === field && "kind" in p && p.kind === kind,
    );
    return shown && found !== undefined ? t(found.code) : undefined;
  };
  const blur = (key: string) =>
    setBlurred((b) => (b.has(key) ? b : new Set([...b, key])));

  const discard = () => {
    setEditing(null);
    setTried(false);
    setBlurred(new Set());
    setFailure(null);
    setChangedSince(false);
    setSecretsKey((k) => k + 1);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !dirty || need !== undefined || editing === null) {
      return;
    }
    if (problems.length > 0) {
      setTried(true);
      setAskFocus((n) => n + 1);
      return;
    }
    setSaving(true);
    setFailure(null);
    setChangedSince(false);
    try {
      const now = await api.rereads.proxy();
      if (!sameRead(now, editing.base)) {
        setEditing(null);
        setChangedSince(true);
        return;
      }
      await api.setProxy(setProxyRequest(editing.values));
      setEditing(null);
      setTried(false);
      setBlurred(new Set());
      toast.show({ title: t("proxy.saved") });
    } catch (cause) {
      setFailure(cause);
      setEditing((e) =>
        e === null ? null : { ...e, values: withoutPasswords(e.values) },
      );
    } finally {
      setSaving(false);
      setSecretsKey((k) => k + 1);
    }
  };

  const kindName = (kind: ProxyKind) => t(`proxy.${kind}`);

  return (
    <form
      ref={formRef}
      noValidate
      aria-label={t("proxy.title")}
      className="flex max-w-[40rem] flex-col gap-5"
      onSubmit={(event) => void submit(event)}
    >
      <LeaveGuard when={dirty} />
      {failure !== null ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="critical"
          title={t("proxy.saveFailed")}
          className="outline-hidden"
        >
          {isRpcError(failure) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {failure.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      {changedSince ? (
        <InlineAlert
          ref={alertRef}
          tabIndex={-1}
          tone="neutral"
          icon="warning"
          className="outline-hidden"
        >
          {t("proxy.changedSince")}
        </InlineAlert>
      ) : null}
      {PROXY_KINDS.map((kind) => {
        const card = values[kind];
        const off = !card.enable;
        const password = card.password;
        return (
          <Card key={kind} data-proxy={kind}>
            <CardHeader>
              <CardTitle>{kindName(kind)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <CheckboxField
                label={
                  <Trans
                    i18nKey="proxy.use"
                    components={{ kind: <NodeSlot value={kindName(kind)} /> }}
                  />
                }
                checked={card.enable}
                readOnly={saving}
                onCheckedChange={(enable) => editCard(kind, { enable })}
              />
              <Field
                invalid={fieldError(kind, "host") ? true : undefined}
                disabled={off}
              >
                <FieldLabel>{t("proxy.host")}</FieldLabel>
                <FieldControl
                  value={card.host}
                  placeholder="proxy.example.org"
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  readOnly={saving}
                  className="font-mono"
                  onChange={(event) =>
                    editCard(kind, { host: event.target.value })
                  }
                  onBlur={() => blur(`${kind}.host`)}
                />
                {fieldError(kind, "host") ? (
                  <FieldError>{fieldError(kind, "host")}</FieldError>
                ) : null}
              </Field>
              <NumberField
                label={t("proxy.port")}
                hint={t("proxy.portHint")}
                value={card.port}
                onValueChange={(port) => editCard(kind, { port })}
                onBlur={() => blur(`${kind}.port`)}
                error={fieldError(kind, "port")}
                readOnly={saving}
                disabled={off}
                inputClassName="w-[8ch] min-w-24"
              />
              <Field disabled={off}>
                <FieldLabel>{t("proxy.user")}</FieldLabel>
                <FieldControl
                  value={card.username}
                  dir="auto"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  readOnly={saving}
                  onChange={(event) =>
                    editCard(kind, { username: event.target.value })
                  }
                />
              </Field>
              {password.stored ? (
                <SecretField
                  key={`${kind}-${String(secretsKey)}`}
                  label={t("proxy.password")}
                  revealLabel={t("password.show")}
                  disabled={saving}
                  storedChoice={{
                    setLabel: t("proxy.passwordSet"),
                    keepLabel: t("proxy.keep"),
                    removeLabel: t("proxy.remove"),
                    inputLabel: t("proxy.password"),
                    choice: password.choice,
                    onChoiceChange: (choice) =>
                      editCard(kind, {
                        password:
                          choice === "keep"
                            ? { stored: true, choice: "keep", typed: "" }
                            : { stored: true, choice: "remove" },
                      }),
                    error:
                      tried &&
                      need?.list.includes(kind) === true &&
                      password.choice === null
                        ? t("proxy.needPassword")
                        : undefined,
                  }}
                  onChange={(event) =>
                    editCard(kind, {
                      password: {
                        stored: true,
                        choice: "keep",
                        typed: event.target.value,
                      },
                    })
                  }
                />
              ) : (
                <SecretField
                  key={`${kind}-${String(secretsKey)}`}
                  label={t("proxy.password")}
                  hint={t("proxy.passwordHint")}
                  revealLabel={t("password.show")}
                  disabled={off || saving}
                  onChange={(event) =>
                    editCard(kind, {
                      password: { stored: false, typed: event.target.value },
                    })
                  }
                />
              )}
            </CardContent>
          </Card>
        );
      })}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            loading={saving}
            disabled={!dirty || need !== undefined}
            focusableWhenDisabled
            aria-describedby={
              !dirty ? noChangesId : need !== undefined ? needId : undefined
            }
          >
            {saving ? t("proxy.saving") : t("proxy.save")}
          </Button>
          <Button
            type="button"
            variant="neutral"
            disabled={!dirty || saving}
            focusableWhenDisabled
            onClick={discard}
          >
            {t("proxy.discard")}
          </Button>
          {dirty ? null : (
            <span id={noChangesId} className="text-sm text-muted-foreground">
              {t("common.noChanges")}
            </span>
          )}
        </div>
        {need === undefined ? null : (
          <p id={needId} className="text-sm">
            <Trans
              i18nKey="proxy.needPasswords"
              components={{
                list: <NodeSlot value={need.list.map(kindName).join(", ")} />,
              }}
            />
          </p>
        )}
      </div>
    </form>
  );
}
