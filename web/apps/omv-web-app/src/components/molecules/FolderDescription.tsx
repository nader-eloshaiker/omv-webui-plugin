// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's description, edited in place (phase 5 shares design 2.6, 0.10; D12): "Edit" turns
// the value into a field with Save and Cancel; Enter in the field saves, Escape cancels, and focus goes
// back to "Edit" either way. Saving re-reads the folder's row first and sends ShareMgmt.set with its
// fields and the new description only; it stops when the folder changed meanwhile (0.9). Saved: a
// toast, the band, the pending mark. Failed: the field stays with the server's words.
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  ServerMessage,
  buttonRowClass,
  useToast,
} from "@omv-webui/react-ui-components";
import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { folderSetRequest } from "../../sharedFolders/folderWrites.ts";
import { descriptionProblem } from "../../sharedFolders/nameRules.ts";
import { folderChanged } from "../../sharedFolders/shareActions.ts";
import {
  beginAction,
  endAction,
  recordSaved,
  runningOn,
  type SharesAction,
} from "../../sharedFolders/sharesSession.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { PendingMark } from "../atoms/PendingMark.tsx";

type Problem =
  | { kind: "tooLong" }
  | { kind: "running"; action: SharesAction }
  | { kind: "changed" }
  | { kind: "gone" }
  | { kind: "server"; error: unknown };

export function FolderDescription({
  folder,
  pending,
}: {
  folder: SharedFolder;
  /** This session saved the description and it is not applied yet (0.8). */
  pending: boolean;
}) {
  const { t } = useTranslation();
  const api = useSharesApi();
  const toast = useToast();
  const editRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Focus moves after the render that swapped the field for the value, or the value for the field.
  const focusToRef = useRef<"edit" | "field" | null>(null);
  useEffect(() => {
    const target = focusToRef.current;
    if (target === null) {
      return;
    }
    focusToRef.current = null;
    (target === "edit" ? editRef : inputRef).current?.focus();
  });

  const open = () => {
    setDraft(folder.comment);
    setProblem(null);
    setEditing(true);
    focusToRef.current = "field";
  };
  const close = () => {
    setEditing(false);
    setProblem(null);
    focusToRef.current = "edit";
  };

  const save = async () => {
    if (saving) {
      return;
    }
    if (descriptionProblem(draft) !== null) {
      setProblem({ kind: "tooLong" });
      return;
    }
    if (!beginAction(folder.uuid, "description")) {
      const action = runningOn(folder.uuid);
      setProblem(action === null ? null : { kind: "running", action });
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const now = (await api.folders()).find((f) => f.uuid === folder.uuid);
      if (now === undefined) {
        setProblem({ kind: "gone" });
        return;
      }
      if (folderChanged(folder, now)) {
        setProblem({ kind: "changed" });
        return;
      }
      await api.setFolder(
        folderSetRequest(now, { kind: "description", comment: draft }),
      );
      recordSaved(folder.uuid, "description");
      // The row as stored now, so the value shown is what was saved.
      await api.folders().catch(() => undefined);
      toast.show({ title: t("sharedFolder.description.saved") });
      close();
    } catch (error) {
      setProblem({ kind: "server", error });
    } finally {
      setSaving(false);
      endAction(folder.uuid);
    }
  };

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {folder.comment === "" ? (
          <span className="text-muted-foreground">
            {t("sharedFolder.fact.descriptionNone")}
          </span>
        ) : (
          <span dir="auto" className="[overflow-wrap:anywhere]">
            {inertBidi(folder.comment)}
          </span>
        )}
        {pending ? <PendingMark /> : null}
        <Button ref={editRef} variant="neutral" size="sm" onClick={open}>
          {t("sharedFolder.description.edit")}
        </Button>
      </span>
    );
  }

  const tooLong = problem?.kind === "tooLong";
  return (
    <form
      noValidate
      className="flex max-w-[40rem] flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field invalid={tooLong ? true : undefined}>
        <FieldLabel>{t("sharedFolder.description.label")}</FieldLabel>
        <FieldControl
          ref={inputRef}
          autoComplete="off"
          dir="auto"
          readOnly={saving}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        />
        <FieldHint>{t("sharedFolder.description.hint")}</FieldHint>
        {tooLong ? (
          <FieldError match>{t("sharedFolder.description.tooLong")}</FieldError>
        ) : null}
      </Field>
      {problem !== null && problem.kind !== "tooLong" ? (
        <InlineAlert
          tone="critical"
          title={
            problem.kind === "running"
              ? undefined
              : t("sharedFolder.descriptionFailed")
          }
        >
          {problem.kind === "running" ? (
            t("shareDelete.blocked.running", {
              action: t(`shares.action.${problem.action}`),
            })
          ) : problem.kind === "gone" ? (
            t("sharedFolder.gone")
          ) : problem.kind === "changed" ? (
            <Trans
              i18nKey="sharedFolder.changedElsewhere"
              components={{ folder: <FolderNameText value={folder.name} /> }}
            />
          ) : isRpcError(problem.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {problem.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
      ) : null}
      <div className={buttonRowClass}>
        <Button type="submit" loading={saving}>
          {saving ? t("common.saving") : t("sharedFolder.description.save")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          disabled={saving}
          focusableWhenDisabled
          onClick={close}
        >
          {t("sharedFolder.description.cancel")}
        </Button>
      </div>
    </form>
  );
}
