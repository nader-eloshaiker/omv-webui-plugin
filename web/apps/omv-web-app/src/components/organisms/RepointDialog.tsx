// SPDX-License-Identifier: GPL-3.0-or-later
// "Point {{folder}} somewhere else" (phase 5 shares design 7; P6), only for a folder that cannot be
// reached. It moves no file: the folder points at the chosen file system and folder, which OMV makes
// when it does not exist. A plain dialog (nothing is deleted): the file systems that can hold a shared
// folder (0.6, the stricter of OMV's list and this interface's reading), its current one chosen when
// offered, and the folder on it (0.5's rules), filled with the current path.
//
// "Save" re-reads the folder's row, the candidates, the file systems and the pending modules, checks
// the rules again, then ShareMgmt.set with the new mount entry and path and mode 770 (0.10). Failed:
// the dialog stays with the server's words.
//
// Focus starts on Cancel whether or not the file systems have been read yet, and Tab goes Cancel, the
// fields in reading order, then Save (the destructive dialogs' Cancel-first order, 8.6), so a keyboard
// user reaches the choices before the button that saves them.
import type {
  ConfiguredFilesystem,
  SharedFolder,
  SmbShareRow,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  RadioGroupField,
  RadioOption,
  ServerMessage,
  Skeleton,
  useToast,
} from "@omv-webui/react-ui-components";
import { useRef, useState, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { isolate, isolateName } from "../../format/isolate.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import { useShareCandidates } from "../../hooks/useSharesReads.ts";
import { folderSetRequest } from "../../sharedFolders/folderWrites.ts";
import {
  displayPath,
  isWholeFs,
  normalisePath,
  pathProblem,
  WHOLE_FS,
  type PathProblem,
} from "../../sharedFolders/nameRules.ts";
import {
  folderChanged,
  fsChoices,
  repointRefusal,
  type Refusal,
} from "../../sharedFolders/shareActions.ts";
import {
  beginAction,
  endAction,
  runningOn,
} from "../../sharedFolders/sharesSession.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { followTabSequence } from "../../shell/tabSequence.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameView } from "../atoms/FsNameView.tsx";

type Problem =
  { kind: "refused"; refusal: Refusal } | { kind: "failed"; error: unknown };

export function RepointDialog({
  open,
  onOpenChange,
  folder,
  folders,
  fileSystems,
  share,
  pending,
  finalFocus,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: SharedFolder;
  /** Every shared folder (the whole-list read), for the path rule. */
  folders: readonly SharedFolder[];
  fileSystems: readonly ConfiguredFilesystem[] | undefined;
  share: SmbShareRow | undefined;
  pending: readonly string[];
  /** Where focus goes when the dialog closes (the opener may be gone once the folder is repaired). */
  finalFocus?: RefObject<HTMLElement | null>;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const words = useFsWords();
  const api = useSharesApi();
  const toast = useToast();
  const candidates = useShareCandidates({ enabled: open });
  const cancelRef = useRef<HTMLButtonElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [mntentref, setMntentref] = useState<string | null>(null);
  const [whole, setWhole] = useState(false);
  const [path, setPath] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Fill the form with where it points now, on each opening, during render.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMntentref(null);
      setWhole(isWholeFs(folder.reldirpath));
      setPath(
        isWholeFs(folder.reldirpath) ? "" : displayPath(folder.reldirpath),
      );
      setTouched(false);
      setProblem(null);
    }
  }

  const choices =
    candidates.data === undefined || fileSystems === undefined
      ? undefined
      : fsChoices(candidates.data, fileSystems, folders, pending);
  const chosen =
    mntentref ??
    choices?.offered.find((o) => o.candidate.uuid === folder.mntentref)
      ?.candidate.uuid ??
    null;
  const sent = whole ? WHOLE_FS : normalisePath(path);
  const pathFault: PathProblem | null =
    chosen === null ? null : pathProblem(sent, chosen, folders, folder.uuid);

  const save = async () => {
    setTouched(true);
    if (saving || chosen === null || pathFault !== null) {
      return;
    }
    if (!beginAction(folder.uuid, "repoint")) {
      const action = runningOn(folder.uuid);
      if (action !== null) {
        setProblem({ kind: "refused", refusal: { kind: "running", action } });
      }
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const [list, fresh, rows, pendingNow] = await Promise.all([
        api.folders(),
        api.candidates(),
        api.fileSystems(),
        api.pending(),
      ]);
      const now = list.find((f) => f.uuid === folder.uuid);
      if (now === undefined) {
        setProblem({ kind: "refused", refusal: { kind: "gone" } });
        return;
      }
      if (folderChanged(folder, now)) {
        setProblem({ kind: "refused", refusal: { kind: "changed" } });
        return;
      }
      const offered = fsChoices(fresh, rows, list, pendingNow).offered.find(
        (o) => o.candidate.uuid === chosen,
      );
      const refusal = repointRefusal({
        folder: now,
        fsOffered: offered !== undefined,
        path: pathProblem(sent, chosen, list, folder.uuid),
      });
      if (refusal !== null) {
        setProblem({ kind: "refused", refusal });
        return;
      }
      await api.setFolder(
        folderSetRequest(now, {
          kind: "repoint",
          mntentref: chosen,
          reldirpath: sent,
        }),
      );
      await Promise.allSettled([api.folders(), api.fileSystems()]);
      toast.show({
        title: t("repoint.saved", {
          folder: isolateName(folder.name),
          path: isolateName(
            sent === WHOLE_FS ? t("sharedFolder.fact.wholeFs") : sent,
          ),
          fs: isolate(
            offered === undefined ? "" : words.nameOf(shownFsName(offered.fs)),
          ),
        }),
      });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      setProblem({ kind: "failed", error });
    } finally {
      setSaving(false);
      endAction(folder.uuid);
    }
  };

  const refusalText = (refusal: Refusal) => {
    switch (refusal.kind) {
      case "okOnly":
        return t("repoint.okOnly");
      case "path":
        return t(refusal.problem.key, {
          other: "other" in refusal.problem ? refusal.problem.other : "",
        });
      case "fsNotOffered":
        return t("addShare.fs.reason.notCandidate");
      case "running":
        return t("shareDelete.blocked.running", {
          action: t(`shares.action.${refusal.action}`),
        });
      case "gone":
        return t("sharedFolder.gone");
      case "changed":
        return (
          <Trans
            i18nKey="sharedFolder.changedElsewhere"
            components={{ folder: <FolderNameText value={folder.name} /> }}
          />
        );
      default:
        return null;
    }
  };

  const users = [
    share === undefined ? null : t("repoint.useSmb"),
    folder._used && share === undefined ? t("repoint.useOther") : null,
  ].filter((u): u is string => u !== null);

  let fields;
  if (candidates.isError) {
    fields = (
      <EmptyState
        variant="error"
        serverMessage={
          isRpcError(candidates.error)
            ? { label: t("app.serverMessage"), text: candidates.error.message }
            : undefined
        }
        action={
          <Button variant="neutral" onClick={() => void candidates.refetch()}>
            {t("common.tryAgain")}
          </Button>
        }
      >
        {t("addShare.fs.loadFailed")}
      </EmptyState>
    );
  } else if (choices === undefined) {
    fields = (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t("app.loading")}</span>
        <Skeleton className="w-48" />
        <Skeleton className="w-64" />
      </div>
    );
  } else if (choices.offered.length === 0) {
    fields = <EmptyState>{t("addShare.fs.none")}</EmptyState>;
  } else {
    fields = (
      <div className="flex flex-col gap-4">
        <RadioGroupField
          legend={t("addShare.fs.legend")}
          value={chosen ?? ""}
          onValueChange={(value) => setMntentref(value)}
          disabled={saving}
        >
          {choices.offered.map((o) => {
            const free = parseByteCount(o.fs.available);
            return (
              <RadioOption
                key={o.candidate.uuid}
                value={o.candidate.uuid}
                label={<FsNameView name={shownFsName(o.fs)} />}
                hint={
                  free === null
                    ? words.typeWord(o.fs.type)
                    : t("sharedFolder.fact.fsValue", {
                        type: words.typeWord(o.fs.type),
                        free: formatBytes(free),
                      })
                }
              />
            );
          })}
        </RadioGroupField>
        <CheckboxField
          label={t("addShare.path.whole")}
          hint={t("addShare.path.wholeHint")}
          checked={whole}
          disabled={saving}
          onCheckedChange={setWhole}
        />
        {whole ? null : (
          <Field
            invalid={touched && pathFault !== null ? true : undefined}
            className="max-w-[40rem]"
          >
            <FieldLabel>{t("addShare.path.label")}</FieldLabel>
            <FieldControl
              autoComplete="off"
              dir="auto"
              readOnly={saving}
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
            <FieldHint>{t("addShare.path.hint")}</FieldHint>
            {touched && pathFault !== null ? (
              <FieldError match>
                {t(pathFault.key, {
                  other: "other" in pathFault ? pathFault.other : "",
                })}
              </FieldError>
            ) : null}
          </Field>
        )}
        {users.length > 0 ? (
          <p className="text-sm">
            {t("repoint.users", { list: users.join(", ") })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent
        initialFocus={cancelRef}
        finalFocus={finalFocus}
        onKeyDown={(event) =>
          followTabSequence(event, [
            cancelRef.current,
            fieldsRef.current,
            saveRef.current,
          ])
        }
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="[overflow-wrap:anywhere]">
              {t("repoint.title", { folder: isolateName(folder.name) })}
            </DialogTitle>
            <DialogDescription className="text-foreground">
              <Trans
                i18nKey="repoint.body"
                components={{ folder: <FolderNameText value={folder.name} /> }}
              />
            </DialogDescription>
          </div>
          <div ref={fieldsRef}>{fields}</div>
          {problem !== null ? (
            <InlineAlert
              tone="critical"
              title={
                problem.kind === "failed"
                  ? t("repoint.failed", { folder: isolateName(folder.name) })
                  : undefined
              }
            >
              {problem.kind === "failed" ? (
                isRpcError(problem.error) ? (
                  <ServerMessage label={t("app.serverMessage")}>
                    {problem.error.message}
                  </ServerMessage>
                ) : null
              ) : (
                refusalText(problem.refusal)
              )}
            </InlineAlert>
          ) : null}
          <DialogFooter>
            <DialogClose
              ref={cancelRef}
              disabled={saving}
              render={
                <Button type="button" variant="neutral" focusableWhenDisabled />
              }
            >
              {t("repoint.cancel")}
            </DialogClose>
            <Button
              ref={saveRef}
              type="submit"
              loading={saving}
              disabled={chosen === null}
              focusableWhenDisabled
            >
              {saving ? t("common.saving") : t("repoint.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
