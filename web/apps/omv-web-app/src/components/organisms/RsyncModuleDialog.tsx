// SPDX-License-Identifier: GPL-3.0-or-later
// "Offer a folder to the rsync server" and "Change how {{folder}} is offered" (phase 5 services design
// 10; 0.4, 0.8, 0.10, 0.11; P13). One dialog for both: the folder (fixed when changing), the name other
// computers use (the folder's own name when it fits, D8; fixed when changing), what they may do (read
// only by default), a name and password asked by default (unticking it is warned and makes who may
// connect one computer or one network), and who may connect (the library's ClientField, with "Any
// computer with the name and password" first and no "Any computer").
//
// Changing reads Rsyncd.getModule when the dialog opens. A module with more than one sign-in, or with
// values set in the classic interface that the contract cannot send back, opens read-only with the
// classic link: saving would need what this page never has (0.8, 0.10).
//
// Passwords (0.8, UI-6): the NAS never gives one back (the transport replaces each by whether it is
// set), so a save of a folder with a sign-in asks for it again. The password is held only in this
// dialog's state while typed and in the one request, and is cleared after every request, whatever it
// returned, and when the dialog closes. It is never in a toast, the address, storage or a log.
//
// Saving re-reads the folders and the modules (and the module, when changing) just before the write
// and checks 0.10 again, then Rsyncd.setModule (0.11). It goes to the band.
import {
  useRsyncdGetModule,
  type RsyncdModule,
  type RsyncdModuleRow,
  type SharedFolder,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  ClientField,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  ExternalLink,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  InlineAlert,
  NewPasswordFields,
  RadioGroupField,
  RadioOption,
  SecretField,
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  ServerMessage,
  Skeleton,
  useToast,
  type ClientFieldValue,
} from "@omv-webui/react-ui-components";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi, isolateName } from "../../format/isolate.ts";
import { useRsyncdApi } from "../../hooks/useRsyncdApi.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  networkWarning,
  type ClientProblem,
} from "../../services/clientRules.ts";
import {
  changedModuleRequest,
  changeRefusal,
  defaultModuleName,
  moduleChoicesOf,
  moduleMay,
  moduleProblems,
  moduleSignIn,
  moduleWho,
  newModuleChoices,
  newModuleRequest,
  offerableFolders,
  offerRefusal,
  readOnlyModule,
  rsyncAddress,
  withAsk,
  type ModuleChoices,
  type ModuleField,
  type ModuleFieldProblem,
  type ModuleRefusal,
} from "../../services/rsyncdModel.ts";
import {
  beginRsyncdAction,
  endRsyncdAction,
  recordModuleSaved,
} from "../../services/rsyncdSession.ts";
import { passwordProblem } from "../../users/addPersonFlow.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { RsyncWhoText } from "../molecules/RsyncWhoText.tsx";

export type ModuleDialogTarget =
  { kind: "new" } | { kind: "change"; row: RsyncdModuleRow };

export function RsyncModuleDialog({
  target,
  onClose,
  folders,
  modules,
  hostname,
  port,
  serverOff,
  finalFocus,
}: {
  /** What the dialog is open for; null when it is closed. */
  target: ModuleDialogTarget | null;
  onClose: () => void;
  /** Every shared folder, as the tab read it. */
  folders: readonly SharedFolder[];
  /** Every module, as the tab read it. */
  modules: readonly RsyncdModuleRow[];
  hostname: string | undefined;
  port: number | undefined;
  /** The rsync server is off: the dialog's last line says offering does not turn it on. */
  serverOff: boolean;
  /** Where focus goes when the dialog closes: the button that opened it. */
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const open = target !== null;
  const change = target?.kind === "change" ? target.row : undefined;
  const read = useRsyncdGetModule(
    { uuid: change?.uuid ?? "" },
    {
      query: {
        enabled: change !== undefined,
        staleTime: 0,
        gcTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  );
  const folderName =
    change === undefined
      ? ""
      : (folders.find((f) => f.uuid === change.sharedfolderref)?.name ??
        change.sharedfoldername);

  let body: ReactNode;
  if (target === null) {
    body = null;
  } else if (target.kind === "new") {
    body = (
      <ModuleForm
        key="new"
        initial={newModuleChoices()}
        module={undefined}
        folderName=""
        folders={folders}
        modules={modules}
        hostname={hostname}
        port={port}
        serverOff={serverOff}
        onClose={onClose}
      />
    );
  } else if (read.data === undefined && read.isError) {
    body = (
      <>
        <InlineAlert tone="critical" title={t("module.loadFailed")}>
          {isRpcError(read.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {read.error.message}
            </ServerMessage>
          ) : null}
        </InlineAlert>
        <DialogFooter>
          <DialogClose render={<Button variant="neutral" />}>
            {t("module.close")}
          </DialogClose>
          <Button variant="neutral" onClick={() => void read.refetch()}>
            {t("common.tryAgain")}
          </Button>
        </DialogFooter>
      </>
    );
  } else if (read.data === undefined) {
    body = (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t("module.loading")}</span>
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/2" />
        <Skeleton className="w-3/4" />
      </div>
    );
  } else {
    const readOnly = readOnlyModule(read.data);
    body =
      readOnly === null ? (
        <ModuleForm
          key={read.data.uuid}
          initial={moduleChoicesOf(read.data)}
          module={read.data}
          folderName={folderName}
          folders={folders}
          modules={modules}
          hostname={hostname}
          port={port}
          serverOff={serverOff}
          onClose={onClose}
        />
      ) : (
        <ReadOnlyModule
          module={read.data}
          folderName={folderName}
          hostname={hostname}
          port={port}
          reason={
            readOnly.kind === "manySignIns"
              ? t("module.many", { count: readOnly.count })
              : t("module.classicValues")
          }
        />
      );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      disablePointerDismissal
    >
      <DialogContent finalFocus={finalFocus} className="max-w-2xl">
        <DialogTitle className="[overflow-wrap:anywhere]">
          {change === undefined
            ? t("module.titleNew")
            : t("module.titleChange", { folder: isolateName(folderName) })}
        </DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** 10.2's read-only case: the fields as text, why, and the classic link. */
function ReadOnlyModule({
  module,
  folderName,
  hostname,
  port,
  reason,
}: {
  module: RsyncdModule;
  folderName: string;
  hostname: string | undefined;
  port: number | undefined;
  reason: string;
}) {
  const { t } = useTranslation();
  const signIn = moduleSignIn(module);
  return (
    <>
      <DialogDescription className="text-foreground">
        {reason}
      </DialogDescription>
      <FactList>
        <FactListItem>
          <FactListLabel>{t("module.folder")}</FactListLabel>
          <FactListValue>
            <FolderNameText value={folderName} />
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("module.name")}</FactListLabel>
          <FactListValue>
            <IdentifierText
              value={inertBidi(
                hostname === undefined
                  ? module.name
                  : rsyncAddress(hostname, module.name, port),
              )}
            />
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("module.may.label")}</FactListLabel>
          <FactListValue>{t(`rsyncd.may.${moduleMay(module)}`)}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("rsyncd.col.signIn")}</FactListLabel>
          <FactListValue>
            {signIn.kind === "none" ? (
              t("rsyncd.signIn.none")
            ) : signIn.kind === "one" ? (
              <Trans
                i18nKey="rsyncd.signIn.one"
                components={{
                  name: <IdentifierText value={inertBidi(signIn.name)} />,
                }}
              />
            ) : (
              t("rsyncd.signIn.many", { count: signIn.count })
            )}
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>{t("module.who")}</FactListLabel>
          <FactListValue>
            <RsyncWhoText who={moduleWho(module)} />
          </FactListValue>
        </FactListItem>
      </FactList>
      <p>
        <ExternalLink
          href={CLASSIC.rsyncServerModules}
          newTabLabel={t("app.newTab")}
        >
          {t("module.classicLink")}
        </ExternalLink>
      </p>
      <DialogFooter>
        <DialogClose render={<Button variant="neutral" />}>
          {t("module.close")}
        </DialogClose>
      </DialogFooter>
    </>
  );
}

type Failure =
  | { kind: "server"; error: unknown }
  | { kind: "refused"; refusal: ModuleRefusal }
  | { kind: "running" }
  | { kind: "unread"; error: unknown };

/** How the password is asked: a new one typed twice, or the stored one typed again (0.8). */
type PasswordMode = "new" | "again";

function ModuleForm({
  initial,
  module,
  folderName: fixedFolderName,
  folders,
  modules,
  hostname,
  port,
  serverOff,
  onClose,
}: {
  initial: ModuleChoices;
  /** The module as read when the dialog opened; undefined for a new one. */
  module: RsyncdModule | undefined;
  folderName: string;
  folders: readonly SharedFolder[];
  modules: readonly RsyncdModuleRow[];
  hostname: string | undefined;
  port: number | undefined;
  serverOff: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const api = useRsyncdApi();
  const toast = useToast();
  const formId = useId();
  const isNew = module === undefined;
  const storedSignIn = module === undefined ? undefined : moduleSignIn(module);
  const passwordStored =
    storedSignIn?.kind === "one" && storedSignIn.passwordSet;
  const [choices, setChoices] = useState<ModuleChoices>(initial);
  const [nameTouched, setNameTouched] = useState(!isNew);
  const [shown, setShown] = useState<ReadonlySet<ModuleField>>(() => new Set());
  const [passwordMode, setPasswordMode] = useState<PasswordMode>(
    passwordStored ? "again" : "new",
  );
  // The password, only while typed: cleared after every request and when the dialog closes.
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  // SecretField holds its own input: a new key gives an empty one after each request.
  const [secretKey, setSecretKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const clearPassword = () => {
    setPassword("");
    setAgain("");
    setPasswordShown(false);
    setSecretKey((k) => k + 1);
  };

  const folderOf = (uuid: string) => folders.find((f) => f.uuid === uuid);
  const folderName = isNew
    ? (folderOf(choices.folder)?.name ?? "")
    : fixedFolderName;
  const choosable = isNew ? offerableFolders(folders, modules) : [];
  const problems = moduleProblems(choices, modules, module?.uuid);
  const problemOf = (field: ModuleField): ModuleFieldProblem | undefined =>
    shown.has(field) ? problems.find((p) => p.field === field) : undefined;
  const show = (field: ModuleField) =>
    setShown((s) => (s.has(field) ? s : new Set([...s, field])));

  const update = (next: ModuleChoices) => {
    setFailure(null);
    setChoices(next);
  };

  const pwProblem = !choices.ask
    ? null
    : passwordMode === "new"
      ? passwordProblem(password, again)
      : password === ""
        ? ("empty" as const)
        : /[\r\n]/u.test(password)
          ? ("lineBreak" as const)
          : null;
  const pwMessage =
    passwordShown && pwProblem !== null
      ? pwProblem === "empty"
        ? t("module.passwordEmpty")
        : t(`password.${pwProblem}`)
      : undefined;

  const clientMessage = (problem: ClientProblem): string => {
    switch (problem.kind) {
      case "address":
        return t("module.client.address");
      case "network":
        return t("module.client.networkErr");
      case "prefix":
        return t("module.client.prefix");
      case "zero":
        return t("module.client.zero");
      case "start":
        return t("module.client.start", {
          value: problem.value,
          suggestion: problem.suggestion,
        });
      case "choose":
        return t("module.err.whoChoose");
    }
  };

  const fieldMessage = (problem: ModuleFieldProblem | undefined) => {
    if (problem === undefined) {
      return undefined;
    }
    switch (problem.field) {
      case "folder":
        return t("module.err.folder");
      case "name":
        return problem.kind === "pattern"
          ? t("module.err.name")
          : t("module.err.nameTaken", { name: inertBidi(problem.name) });
      case "signInName":
        return t("module.err.signInName");
      case "who":
        return problem.kind === "required"
          ? t("module.err.whoRequired")
          : clientMessage(problem.problem);
    }
  };

  const submit = async () => {
    if (saving) {
      return;
    }
    setShown(new Set(["folder", "name", "signInName", "who"]));
    setPasswordShown(true);
    if (problems.length > 0 || pwProblem !== null) {
      return;
    }
    const folderUuid = choices.folder;
    if (!beginRsyncdAction(folderUuid, isNew ? "offer" : "change")) {
      setFailure({ kind: "running" });
      return;
    }
    setSaving(true);
    setFailure(null);
    // The request carries the typed password; this copy is the only one, and it is cleared below.
    const typed = choices.ask ? password : "";
    try {
      let modulesNow: RsyncdModuleRow[];
      let foldersNow: SharedFolder[];
      let moduleNow: RsyncdModule | undefined;
      try {
        [modulesNow, foldersNow, moduleNow] = await Promise.all([
          api.modules(),
          api.folders(),
          module === undefined
            ? Promise.resolve(undefined)
            : api.module(module.uuid),
        ]);
      } catch (error) {
        setFailure({ kind: "unread", error });
        return;
      }
      const refusal =
        module === undefined
          ? offerRefusal(folderUuid, foldersNow, modulesNow)
          : changeRefusal(module, moduleNow);
      if (refusal !== null) {
        setFailure({ kind: "refused", refusal });
        return;
      }
      const recheck = moduleProblems(choices, modulesNow, module?.uuid);
      if (recheck.length > 0) {
        return;
      }
      await api.setModule(
        module === undefined || moduleNow === undefined
          ? newModuleRequest(choices, typed)
          : changedModuleRequest(moduleNow, choices, typed),
      );
      recordModuleSaved(folderUuid);
      await api.modules().catch(() => undefined);
      toast.show({
        title: isNew
          ? t("module.saved", {
              folder: isolateName(folderName),
              name: isolateName(choices.name),
            })
          : t("module.savedChange", { folder: isolateName(folderName) }),
      });
      onClose();
    } catch (error) {
      setFailure({ kind: "server", error });
    } finally {
      clearPassword();
      setPasswordShown(false);
      setSaving(false);
      endRsyncdAction(folderUuid);
    }
  };

  const folderSlot = <FolderNameText value={folderName} />;
  const whoValue: ClientFieldValue = choices.who;
  const wide = networkWarning(choices.who);
  const numberFormat = new Intl.NumberFormat(i18n.language);
  const storedWho = module === undefined ? undefined : moduleWho(module);
  const storedShown =
    choices.who.choice === null &&
    storedWho !== undefined &&
    (storedWho.kind === "classic" || storedWho.kind === "any");
  const whoProblem = problemOf("who");
  const groupError =
    whoProblem?.kind === "required" ||
    (whoProblem?.kind === "client" && whoProblem.problem.kind === "choose")
      ? fieldMessage(whoProblem)
      : undefined;
  const choiceError =
    whoProblem?.kind === "client" && whoProblem.problem.kind !== "choose"
      ? fieldMessage(whoProblem)
      : undefined;
  const address =
    hostname === undefined || choices.name === ""
      ? null
      : rsyncAddress(hostname, choices.name, port);

  const failureView = (() => {
    if (failure === null) {
      return null;
    }
    const title = isNew ? t("module.failed") : t("module.failedChange");
    switch (failure.kind) {
      case "server":
      case "unread":
        return (
          <InlineAlert
            tone="critical"
            title={
              failure.kind === "unread" ? t("module.refused.unread") : title
            }
          >
            {isRpcError(failure.error) ? (
              <ServerMessage label={t("app.serverMessage")}>
                {failure.error.message}
              </ServerMessage>
            ) : null}
          </InlineAlert>
        );
      case "running":
        return (
          <InlineAlert tone="critical" title={title}>
            <span>
              <Trans
                i18nKey="module.refused.running"
                components={{ folder: folderSlot }}
              />
            </span>
          </InlineAlert>
        );
      case "refused": {
        const r = failure.refusal;
        return (
          <InlineAlert tone="critical" title={title}>
            {r.kind === "manySignIns" ? (
              t("module.many", { count: r.count })
            ) : r.kind === "classicValues" ? (
              t("module.classicValues")
            ) : (
              <span>
                <Trans
                  i18nKey={`module.refused.${r.kind}`}
                  components={{
                    folder: folderSlot,
                    name: (
                      <IdentifierText
                        value={inertBidi(r.kind === "offered" ? r.name : "")}
                      />
                    ),
                  }}
                />
              </span>
            )}
          </InlineAlert>
        );
      }
    }
  })();

  const may = choices.may;
  const passwordFields = !choices.ask ? null : passwordMode === "again" ? (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t("module.passwordSet")}</span>
        <Button
          variant="neutral"
          size="sm"
          disabled={saving}
          onClick={() => {
            clearPassword();
            setPasswordShown(false);
            setPasswordMode("new");
          }}
        >
          {t("module.passwordChange")}
        </Button>
      </p>
      <SecretField
        key={secretKey}
        label={t("module.password")}
        hint={t("module.passwordAgain")}
        error={pwMessage}
        revealLabel={t("password.show")}
        disabled={saving}
        onChange={(event) => {
          setFailure(null);
          setPassword(event.target.value);
        }}
      />
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <NewPasswordFields
        password={{
          label:
            isNew || !passwordStored
              ? t("module.password")
              : t("module.newPassword"),
          hint:
            isNew || !passwordStored ? undefined : t("module.passwordAgain"),
          error: pwProblem === "mismatch" ? undefined : pwMessage,
          value: password,
          onValueChange: (v) => {
            setFailure(null);
            setPassword(v);
          },
        }}
        confirmation={{
          label: t("password.again"),
          error: pwProblem === "mismatch" ? pwMessage : undefined,
          value: again,
          onValueChange: setAgain,
        }}
        revealLabels={{ show: t("password.show"), hide: t("password.hide") }}
        disabled={saving}
      />
      {passwordStored ? (
        <div>
          <Button
            variant="neutral"
            size="sm"
            disabled={saving}
            onClick={() => {
              clearPassword();
              setPasswordShown(false);
              setPasswordMode("again");
            }}
          >
            {t("module.passwordKeep")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {failureView}
      {isNew ? (
        <div className="flex flex-col gap-1">
          {choosable.length === 0 ? (
            <>
              <p className="font-medium">{t("module.folder")}</p>
              <p className="text-sm">{t("module.folderNone")}</p>
            </>
          ) : (
            <Select
              items={choosable.map((f) => ({
                value: f.uuid,
                label: inertBidi(f.name),
              }))}
              value={choices.folder === "" ? null : choices.folder}
              disabled={saving}
              onValueChange={(next) => {
                if (typeof next !== "string") {
                  return;
                }
                const chosen = folderOf(next);
                update({
                  ...choices,
                  folder: next,
                  name:
                    nameTouched || chosen === undefined
                      ? choices.name
                      : defaultModuleName(chosen.name),
                });
                show("folder");
              }}
            >
              <SelectLabel>{t("module.folder")}</SelectLabel>
              <SelectTrigger
                placeholder={t("module.folderPlaceholder")}
                aria-invalid={problemOf("folder") ? true : undefined}
                className="w-full max-w-sm"
              />
              <SelectContent>
                {choosable.map((f) => (
                  <SelectItem key={f.uuid} value={f.uuid}>
                    <span dir="auto">{inertBidi(f.name)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {problemOf("folder") ? (
            <p className="text-sm text-critical-label">
              {fieldMessage(problemOf("folder"))}
            </p>
          ) : null}
        </div>
      ) : (
        <p>
          <span className="font-medium">{t("module.folder")}</span> {folderSlot}
        </p>
      )}

      <Field
        invalid={problemOf("name") ? true : undefined}
        className="max-w-md"
      >
        <FieldLabel>{t("module.name")}</FieldLabel>
        <FieldControl
          ref={firstRef}
          value={choices.name}
          readOnly={!isNew || saving}
          {...(!isNew ? { "aria-readonly": true } : null)}
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          onChange={(event) => {
            setNameTouched(true);
            update({ ...choices, name: event.target.value });
          }}
          onBlur={() => show("name")}
        />
        {address === null ? null : (
          <FieldHint>
            <Trans
              i18nKey="module.nameHint"
              components={{
                address: <IdentifierText value={inertBidi(address)} />,
              }}
            />
          </FieldHint>
        )}
        {problemOf("name") ? (
          <FieldError>{fieldMessage(problemOf("name"))}</FieldError>
        ) : null}
      </Field>

      <div className="flex flex-col gap-2">
        <RadioGroupField
          legend={t("module.may.label")}
          value={may}
          disabled={saving}
          onValueChange={(next) => {
            if (next === "ro" || next === "rw" || next === "wo") {
              update({ ...choices, may: next });
            }
          }}
        >
          <RadioOption value="ro" label={t("module.may.ro")} />
          <RadioOption
            value="rw"
            label={t("module.may.rw")}
            hint={
              <Trans
                i18nKey="module.may.rwHint"
                components={{ folder: folderSlot }}
              />
            }
          />
          {initial.may === "wo" ? (
            <RadioOption value="wo" label={t("module.may.wo")} />
          ) : null}
        </RadioGroupField>
        <p className="max-w-prose text-sm">
          <Trans
            i18nKey="module.filesBelong"
            components={{ folder: folderSlot }}
          />
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <CheckboxField
          label={t("module.ask")}
          checked={choices.ask}
          disabled={saving}
          warning={
            choices.ask ? undefined : (
              // One span, so the alert lays the sentence out as one line of text with the name in it.
              <span>
                <Trans
                  i18nKey="module.noAskWarn"
                  values={{ may: t(`module.verb.${may}`) }}
                  components={{ folder: folderSlot }}
                />
              </span>
            )
          }
          onCheckedChange={(checked) => {
            update(withAsk(choices, checked));
            if (!checked) {
              clearPassword();
              setPasswordShown(false);
            }
          }}
        />
        <p className="max-w-prose text-sm">{t("module.accessNotUsed")}</p>
      </div>

      {choices.ask ? (
        <div className="flex flex-col gap-3 ps-6">
          <Field
            invalid={problemOf("signInName") ? true : undefined}
            className="max-w-sm"
          >
            <FieldLabel>{t("module.signInName")}</FieldLabel>
            <FieldControl
              value={choices.signInName}
              readOnly={saving}
              dir="ltr"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="font-mono"
              onChange={(event) =>
                update({ ...choices, signInName: event.target.value })
              }
              onBlur={() => show("signInName")}
            />
            <FieldHint>{t("module.signInHint")}</FieldHint>
            {problemOf("signInName") ? (
              <FieldError>{fieldMessage(problemOf("signInName"))}</FieldError>
            ) : null}
          </Field>
          {passwordFields}
        </div>
      ) : null}

      <ClientField
        legend={t("module.who")}
        value={whoValue}
        onValueChange={(next) => {
          update({ ...choices, who: { choice: next.choice, text: next.text } });
        }}
        onBlur={() => show("who")}
        anyWithPassword={
          choices.ask ? { label: t("rsyncd.who.anyWithPassword") } : undefined
        }
        one={{
          label: t("module.client.one"),
          hint: t("module.client.oneHint"),
          fieldLabel: t("module.client.oneField"),
          placeholder: "192.0.2.10",
          error: choices.who.choice === "one" ? choiceError : undefined,
        }}
        network={{
          label: t("module.client.network"),
          hint: t("module.client.networkHint"),
          fieldLabel: t("module.client.networkField"),
          placeholder: "192.0.2.0/24",
          error: choices.who.choice === "network" ? choiceError : undefined,
        }}
        stored={
          storedShown && storedWho !== undefined
            ? {
                value:
                  storedWho.kind === "classic"
                    ? inertBidi(storedWho.value)
                    : (module?.hostsallow ?? "") === ""
                      ? t("rsyncd.who.any")
                      : inertBidi(module?.hostsallow ?? ""),
                description: t("module.client.classicValue"),
              }
            : undefined
        }
        warning={
          wide === null
            ? undefined
            : wide.kind === "huge"
              ? t("module.client.networkHuge")
              : t("module.client.networkWide", {
                  addresses: numberFormat.format(wide.count),
                })
        }
        error={groupError}
        disabled={saving}
      />

      {serverOff ? <p className="text-sm">{t("module.serverOff")}</p> : null}

      <DialogFooter>
        <DialogClose
          disabled={saving}
          render={<Button variant="neutral" focusableWhenDisabled />}
        >
          {t("module.cancel")}
        </DialogClose>
        <Button type="submit" loading={saving}>
          {saving
            ? t("module.saving")
            : isNew
              ? t("module.offer")
              : t("module.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
