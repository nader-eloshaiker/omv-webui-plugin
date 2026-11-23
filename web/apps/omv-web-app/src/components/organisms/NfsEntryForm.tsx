// SPDX-License-Identifier: GPL-3.0-or-later
// The NFS entry form (phase 5 services design 2.3, 2.4, 1.4; 0.4, 0.5, 0.10): who may connect (the
// library's ClientField: one computer, chosen for a new entry; one network; any computer, last and
// warned), access (Read only by default), the 0.5 lines as its description, and, when NFS is off for
// the NAS, the line that saving turns it on. Checked on blur and on Save; on Save the lists are read
// again and 0.10 is checked on what was read (useNfsEntrySave).
//
// The contract takes only the three forms of who may connect and "ro" or "rw", so an entry whose value
// was set in the classic interface as something else opens with no choice and its stored value shown,
// and saving needs a choice. Nothing is sent until then: the stored value is kept as long as no change
// to the entry is saved.
//
// Used in place on a shared folder's page and inside the NFS page's "Share a folder" dialog, which
// puts its folder choice first (`children`).
import type { NfsShareRow } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ClientField,
  InlineAlert,
  SegmentedChoice,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useNfsEntrySave } from "../../hooks/useNfsEntrySave.ts";
import { useNfsWords } from "../../hooks/useNfsWords.ts";
import {
  checkClient,
  classifyStored,
  networkWarning,
  valueOfStored,
  type ClientProblem,
  type ClientValue,
} from "../../services/clientRules.ts";
import {
  entryAccess,
  entryClient,
  type AccessChoice,
  type EntryRefusal,
} from "../../services/nfsModel.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { TextSlot } from "../atoms/TextSlot.tsx";

type Problem =
  | { kind: "refused"; refusal: EntryRefusal }
  | { kind: "running" }
  | { kind: "failed"; error: unknown }
  | { kind: "turnOnFailed"; error: unknown; uuid: string; client: string };

export interface NfsEntryFormProps {
  /** The folder the entry is for; null while none is chosen (the dialog). */
  folder: { uuid: string; name: string } | null;
  /** Whether the folder is OK as its page reads it (its file system too). */
  folderOk?: boolean;
  /** The entry being changed; none for a new one. */
  entry?: NfsShareRow;
  /** Whether NFS is on for the NAS, and its versions, as last read. */
  settings: { enable: boolean; versions: readonly string[] } | undefined;
  /** The form's own heading ("Let a computer in", "Change who may connect"), when it has one. */
  heading?: { ref: Ref<HTMLHeadingElement> };
  /** The ids of the 0.5 lines when the page already shows them; otherwise the form shows them. */
  describedBy?: string;
  /** Fields before who may connect (the dialog's folder choice). */
  children?: ReactNode;
  onSaved: (uuid: string) => void;
  /**
   * The entry is saved but turning NFS on failed. Given, the caller shows it and offers "Try again"
   * (a folder's page, where the form gives way to the new entry); otherwise the form shows it.
   */
  onTurnOnFailed?: (failure: {
    uuid: string;
    client: string;
    error: unknown;
  }) => void;
  onCancel: () => void;
}

export function NfsEntryForm({
  folder,
  folderOk,
  entry,
  settings,
  heading,
  describedBy,
  children,
  onSaved,
  onTurnOnFailed,
  onCancel,
}: NfsEntryFormProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const words = useNfsWords();
  const { save, turnOn } = useNfsEntrySave();
  const headingId = useId();
  const introId = useId();
  const accessId = useId();
  const accessHintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const stored = entry === undefined ? undefined : entryClient(entry);
  const storedAccess = entry === undefined ? undefined : entryAccess(entry);
  const [value, setValue] = useState<ClientValue>(() =>
    stored === undefined ? { choice: "one", text: "" } : valueOfStored(stored),
  );
  const [access, setAccess] = useState<AccessChoice | null>(
    storedAccess === undefined
      ? "ro"
      : storedAccess.kind === "classic"
        ? null
        : storedAccess.kind,
  );
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const isNew = entry === undefined;
  const nfsOff = settings !== undefined && !settings.enable;
  const noVersions = nfsOff && settings.versions.length === 0;
  const check = checkClient(value);
  const clientProblem: ClientProblem | null =
    checked && !check.ok ? check.problem : null;
  const folderName =
    folder === null ? null : <FolderNameText value={folder.name} />;

  const problemText = (p: ClientProblem): ReactNode => {
    switch (p.kind) {
      case "address":
        return t("folderNfs.err.address");
      case "network":
        return t("folderNfs.err.network");
      case "prefix":
        return t("folderNfs.err.prefix");
      case "zero":
        return t("folderNfs.err.networkZero");
      case "start":
        return t("folderNfs.err.networkStart", {
          value: inertBidi(p.value),
          suggestion: p.suggestion,
        });
      case "choose":
        return t("folderNfs.err.choose");
    }
  };
  const fieldError = (choice: "one" | "network") =>
    clientProblem !== null &&
    clientProblem.kind !== "choose" &&
    value.choice === choice
      ? problemText(clientProblem)
      : undefined;

  const wide = networkWarning(value);
  const warning =
    value.choice === "any" ? (
      // One sentence: the alert lays out its children as blocks, so the slots stay inside one span.
      <span>
        <Trans
          i18nKey="folderNfs.form.anyWarn"
          components={{ folder: folderName ?? <></> }}
        />
      </span>
    ) : wide?.kind === "count" ? (
      t("folderNfs.form.networkWide", {
        // The locale's grouping ("65,536"); the sentence has no plural form.
        count: new Intl.NumberFormat(i18n.language).format(wide.count),
      })
    ) : wide?.kind === "huge" ? (
      t("folderNfs.form.networkHuge")
    ) : undefined;
  const typedName =
    value.choice === "one" && check.ok && check.form.kind === "name";

  const finish = (uuid: string, client: string) => {
    const short = words.short(classifyStored(client));
    toast.show({
      title:
        isNew && folder !== null
          ? t("folderNfs.saved", {
              folder: isolateName(folder.name),
              client: short,
            })
          : t("folderNfs.savedChange", { client: short }),
    });
    onSaved(uuid);
  };

  const submit = async () => {
    if (saving || folder === null) {
      return;
    }
    setChecked(true);
    setProblem(null);
    if (!check.ok) {
      if (check.problem.kind !== "choose") {
        inputRef.current?.focus();
      }
      return;
    }
    if (access === null || noVersions) {
      return;
    }
    setSaving(true);
    try {
      const outcome = await save({
        folderUuid: folder.uuid,
        ok: folderOk,
        entryUuid: entry?.uuid,
        value,
        access,
      });
      switch (outcome.kind) {
        case "saved":
          finish(outcome.uuid, outcome.client);
          return;
        case "refused":
          if (outcome.refusal.kind === "client") {
            inputRef.current?.focus();
          }
          setProblem(outcome);
          return;
        case "turnOnFailed":
          if (onTurnOnFailed !== undefined) {
            onTurnOnFailed(outcome);
            return;
          }
          setProblem(outcome);
          return;
        case "running":
        case "failed":
          setProblem(outcome);
          return;
      }
    } finally {
      setSaving(false);
    }
  };

  const retryTurnOn = async () => {
    if (problem?.kind !== "turnOnFailed" || saving) {
      return;
    }
    setSaving(true);
    try {
      const result = await turnOn();
      if (result.ok) {
        finish(problem.uuid, problem.client);
      } else {
        setProblem({
          ...problem,
          error: "error" in result ? result.error : null,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const refusalText = (refusal: EntryRefusal): ReactNode => {
    switch (refusal.kind) {
      case "client":
        return problemText(refusal.problem);
      case "folder":
        return refusal.refusal === "notOk"
          ? t("nfs.dialog.folderNotOk")
          : t("folderNfs.cannot");
      case "duplicate": {
        const dup = classifyStored(refusal.client);
        return (
          <span>
            <Trans
              i18nKey="folderNfs.err.duplicate"
              components={{
                client:
                  dup.kind === "any" || dup.kind === "anyWithPassword" ? (
                    <TextSlot value={t("folderNfs.entry.any")} />
                  ) : (
                    <IdentifierText value={inertBidi(dup.value)} />
                  ),
                folder: folderName ?? <></>,
              }}
            />
          </span>
        );
      }
      case "noVersions":
        return t("nfs.noVersions");
      case "gone":
        return t("folderNfs.err.gone");
    }
  };

  let alert: ReactNode = null;
  if (problem !== null) {
    if (problem.kind === "turnOnFailed") {
      alert = (
        <InlineAlert
          tone="critical"
          title={
            <Trans
              i18nKey="folderNfs.turnOnFailed"
              components={{
                folder: folderName ?? <></>,
                client: (
                  <TextSlot
                    value={words.short(classifyStored(problem.client))}
                  />
                ),
              }}
            />
          }
        >
          <span className="flex flex-col items-start gap-2">
            {isRpcError(problem.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {problem.error.message}
              </ServerMessage>
            ) : null}
            <Button
              type="button"
              variant="neutral"
              size="sm"
              loading={saving}
              onClick={() => void retryTurnOn()}
            >
              {t("folderNfs.tryAgain")}
            </Button>
          </span>
        </InlineAlert>
      );
    } else if (problem.kind === "failed") {
      alert = (
        <InlineAlert tone="critical" title={t("folderNfs.saveFailed")}>
          {isRpcError(problem.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {problem.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      );
    } else if (problem.kind === "running") {
      alert = (
        <InlineAlert tone="neutral">{t("folderNfs.err.running")}</InlineAlert>
      );
    } else if (problem.refusal.kind !== "client") {
      alert = (
        <InlineAlert tone="neutral">{refusalText(problem.refusal)}</InlineAlert>
      );
    }
  }

  const formDescribedBy = describedBy ?? introId;
  const savedEntry = problem?.kind === "turnOnFailed";
  const unavailable = saving || savedEntry;

  return (
    <form
      noValidate
      aria-labelledby={heading === undefined ? undefined : headingId}
      aria-describedby={formDescribedBy}
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {heading === undefined ? null : (
        <h3
          id={headingId}
          ref={heading.ref}
          tabIndex={-1}
          className="text-base font-semibold outline-hidden"
        >
          {isNew
            ? t("folderNfs.form.titleNew")
            : t("folderNfs.form.titleChange")}
        </h3>
      )}
      {describedBy === undefined ? (
        <div id={introId} className="flex flex-col gap-1 text-sm">
          <p>{t("folderNfs.noPassword")}</p>
          <p>{t("folderNfs.accessNotUsed")}</p>
        </div>
      ) : null}
      {children}
      <ClientField
        legend={t("folderNfs.form.who")}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          setProblem(null);
        }}
        onBlur={() => setChecked(true)}
        inputRef={inputRef}
        one={{
          label: t("folderNfs.form.one"),
          hint: t("folderNfs.form.oneHint"),
          fieldLabel: t("folderNfs.form.oneField"),
          placeholder: "192.0.2.10",
          fieldHint: typedName ? t("folderNfs.form.nameHint") : undefined,
          error: fieldError("one"),
        }}
        network={{
          label: t("folderNfs.form.network"),
          hint: t("folderNfs.form.networkHint"),
          fieldLabel: t("folderNfs.form.networkField"),
          placeholder: "192.0.2.0/24",
          error: fieldError("network"),
        }}
        any={{
          label: t("folderNfs.form.any"),
          hint: t("folderNfs.form.anyHint"),
        }}
        stored={
          stored?.kind === "classic"
            ? {
                value: inertBidi(stored.value),
                description: (
                  <Trans
                    i18nKey="folderNfs.form.classicValue"
                    components={{
                      client: (
                        <IdentifierText value={inertBidi(stored.value)} />
                      ),
                    }}
                  />
                ),
              }
            : undefined
        }
        warning={warning}
        error={
          clientProblem?.kind === "choose"
            ? problemText(clientProblem)
            : undefined
        }
        disabled={unavailable}
      />
      <div className="flex flex-col gap-1">
        <span id={accessId} className="text-base font-medium">
          {t("folderNfs.form.access")}
        </span>
        <SegmentedChoice<AccessChoice>
          aria-label={t("folderNfs.form.access")}
          aria-describedby={accessHintId}
          options={[
            { value: "ro", label: t("access.ro") },
            { value: "rw", label: t("access.rw") },
          ]}
          value={access}
          onValueChange={(next) => {
            setAccess(next);
            setProblem(null);
          }}
          disabled={unavailable}
          error={
            checked && access === null ? t("folderNfs.err.access") : undefined
          }
        />
        <p id={accessHintId} className="text-sm text-muted-foreground">
          {t("folderNfs.form.accessHint")}
        </p>
        {storedAccess?.kind === "classic" ? (
          <p className="text-sm text-muted-foreground">
            {t("nfs.shares.classicValue", {
              value: inertBidi(storedAccess.value),
            })}
          </p>
        ) : null}
      </div>
      {nfsOff ? (
        <p className="text-sm">
          {noVersions ? t("nfs.noVersions") : t("folderNfs.form.nfsOff")}
        </p>
      ) : null}
      {alert}
      <div className={buttonRowClass}>
        {savedEntry ? null : (
          <Button
            type="submit"
            loading={saving}
            disabled={noVersions || folder === null}
            focusableWhenDisabled
          >
            {saving
              ? t("folderNfs.form.saving")
              : isNew
                ? t("folderNfs.form.letIn")
                : t("folderNfs.form.save")}
          </Button>
        )}
        <Button
          type="button"
          variant="neutral"
          disabled={saving}
          focusableWhenDisabled
          onClick={() => {
            if (problem?.kind === "turnOnFailed") {
              onSaved(problem.uuid);
              return;
            }
            onCancel();
          }}
        >
          {t("folderNfs.form.cancel")}
        </Button>
      </div>
    </form>
  );
}
