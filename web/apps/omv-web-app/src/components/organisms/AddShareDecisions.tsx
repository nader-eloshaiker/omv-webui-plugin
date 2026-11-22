// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder": the decisions in one form and the one summary (phase 5 shares design 6.1 to
// 6.3, 6.8; owner, P4, P5, P8, P9). Every read the rules need comes first, and when any of them fails
// nothing is offered (0.6, fail closed). The form: the file system (only those both OMV's list and
// this interface allow, the one Flow A handed over chosen), the name, the folder on the file system,
// the description, who can use it (everyone at No access, A5), and sharing with Windows and Mac
// computers (on, A6) with its three options, guest access never preselected (Q6). Continue checks
// every field in order, moves focus to the first problem and announces how many there are. The
// summary has no typed confirmation: nothing is erased (UI-8). Nothing here is chosen from the address.
import type {
  ConfiguredFilesystem,
  ShareCandidate,
  SharedFolder,
  UserAccount,
  UserGroup,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  CheckboxField,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  EmptyState,
  ExternalLink,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  JobSummary,
  RadioGroupField,
  RadioOption,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes, parseByteCount } from "../../format/format.ts";
import { inertBidi } from "../../format/isolate.ts";
import { useFsApi } from "../../hooks/useFsApi.ts";
import { useFsWords } from "../../hooks/useFsWords.ts";
import { useSharesApi } from "../../hooks/useSharesApi.ts";
import {
  useShareCandidates,
  useSharedFoldersAll,
  useShareFileSystems,
  useShareServices,
  useSharesSystem,
  useSmbSettings,
  useSmbShares,
  useUserAccounts,
  useUserGroups,
} from "../../hooks/useSharesReads.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  accessModel,
  accessSummary,
  gridGivesAccess,
  privilegesToSave,
  type AccessModel,
  type AccessRow,
} from "../../sharedFolders/accessModel.ts";
import {
  addFlowStore,
  saveAddDraft,
  startAddFlow,
  type AddChoices,
  type AddDraft,
} from "../../sharedFolders/addFlow.ts";
import {
  defaultPath,
  descriptionProblem,
  displayPath,
  isWholeFs,
  nameProblem,
  normalisePath,
  pathProblem,
  WHOLE_FS,
} from "../../sharedFolders/nameRules.ts";
import {
  defaultFsChoice,
  fsChoices,
  type FsChoices,
} from "../../sharedFolders/shareActions.ts";
import { sharesSession } from "../../sharedFolders/sharesSession.ts";
import { shownFsName } from "../../sharedFolders/shownNames.ts";
import { hostRule, shareAddresses } from "../../sharedFolders/smbModel.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { FsNameView } from "../atoms/FsNameView.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import { AccessGridSection } from "./AccessGridSection.tsx";
import { AddShareSmbOptions } from "./AddShareSmbOptions.tsx";

/** The reads of 6.1, each with what the page says when it fails. */
export function AddShareDecisions() {
  const { t } = useTranslation();
  const candidates = useShareCandidates();
  const fileSystems = useShareFileSystems();
  const folders = useSharedFoldersAll();
  const users = useUserAccounts();
  const groups = useUserGroups();
  const settings = useSmbSettings();
  const shares = useSmbShares();
  const services = useShareServices();
  const system = useSharesSystem();

  const reads = [
    { q: candidates, words: t("addShare.fs.loadFailed") },
    { q: fileSystems, words: t("addShare.fs.loadFailed") },
    { q: folders, words: t("sharedFolders.loadFailed") },
    { q: users, words: t("access.loadFailed") },
    { q: groups, words: t("access.loadFailed") },
    { q: settings, words: t("smb.state.unread") },
    { q: shares, words: t("smb.shares.loadFailed") },
    { q: services, words: t("smb.state.unread") },
  ];
  const failed = reads.find((r) => r.q.isError);
  if (failed !== undefined) {
    return (
      <ReadFailed
        error={failed.q.error}
        onRetry={() => {
          for (const r of reads) {
            if (r.q.isError) {
              void r.q.refetch();
            }
          }
        }}
        retrying={reads.some((r) => r.q.isFetching)}
      >
        {failed.words}
      </ReadFailed>
    );
  }
  if (
    candidates.data === undefined ||
    fileSystems.data === undefined ||
    folders.data === undefined ||
    users.data === undefined ||
    groups.data === undefined ||
    settings.data === undefined ||
    shares.data === undefined ||
    services.data === undefined ||
    system.hostname === undefined ||
    system.pending === undefined
  ) {
    return (
      <p role="status" aria-busy="true" className="text-muted-foreground">
        {t("addShare.loading")}
      </p>
    );
  }
  return (
    <AddShareForm
      candidates={candidates.data}
      fileSystems={fileSystems.data.data}
      folders={folders.data.data}
      users={users.data.data}
      groups={groups.data.data}
      smbEnabled={settings.data.enable}
      hostname={system.hostname}
      pending={system.pending}
    />
  );
}

type Problem = "fs" | "name" | "path" | "comment" | "access";

const newDraft = (fs: string | null, smb: boolean): AddDraft => ({
  fs,
  name: "",
  custom: false,
  path: "",
  whole: false,
  comment: "",
  access: {},
  smb,
  browseable: true,
  readonly: false,
  guest: false,
});

function AddShareForm({
  candidates,
  fileSystems,
  folders,
  users,
  groups,
  smbEnabled,
  hostname,
  pending,
}: {
  candidates: readonly ShareCandidate[];
  fileSystems: readonly ConfiguredFilesystem[];
  folders: readonly SharedFolder[];
  users: readonly UserAccount[];
  groups: readonly UserGroup[];
  smbEnabled: boolean;
  hostname: string;
  pending: readonly string[];
}) {
  const { t } = useTranslation();
  const fsWords = useFsWords();
  const sharesApi = useSharesApi();
  const fsApi = useFsApi();
  const summaryItems = useAddShareSummary();
  const { handover } = useMemoryStore(sharesSession);
  const choicesOf: FsChoices = useMemo(
    () => fsChoices(candidates, fileSystems, folders, pending),
    [candidates, fileSystems, folders, pending],
  );
  const model: AccessModel = useMemo(
    () => accessModel(users, groups, undefined),
    [users, groups],
  );
  const host = hostRule(hostname);
  const smbBlocked = !smbEnabled && !host.ok;
  const [draft, setDraft] = useState<AddDraft>(() => {
    const saved = addFlowStore.getState().draft;
    if (saved !== null) {
      // "Change choices" brings every choice back, but guest access is never preselected (Q6) and
      // sharing cannot be chosen while the NAS's name forbids it.
      return { ...saved, smb: saved.smb && !smbBlocked };
    }
    return newDraft(
      defaultFsChoice(choicesOf.offered, handover)?.fs.devicefile ?? null,
      !smbBlocked,
    );
  });
  const [stage, setStage] = useState<"form" | "summary">("form");
  const [fixed, setFixed] = useState<AddChoices | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [count, setCount] = useState("");
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLInputElement>(null);
  const accessRef = useRef<HTMLHeadingElement>(null);
  const accessId = useId();

  useEffect(() => {
    if (stage === "summary") {
      summaryRef.current?.focus();
    }
  }, [stage]);

  const edit = (change: Partial<AddDraft>) =>
    setDraft((d) => ({ ...d, ...change }));
  const chosen = choicesOf.offered.find((o) => o.fs.devicefile === draft.fs);
  const mntentref = chosen?.candidate.uuid ?? "";
  const reldirpath = !draft.custom
    ? defaultPath(draft.name)
    : draft.whole
      ? WHOLE_FS
      : normalisePath(draft.path);

  const nameIssue = nameProblem(draft.name, folders);
  const pathIssue =
    draft.name === "" && !draft.custom
      ? null
      : pathProblem(reldirpath, mntentref, folders);
  const commentIssue = descriptionProblem(draft.comment);
  const needAccess =
    draft.smb && !draft.guest && !gridGivesAccess(model, draft.access);
  const problems: Problem[] = [
    ...(chosen === undefined ? (["fs"] as const) : []),
    ...(nameIssue !== null ? (["name"] as const) : []),
    ...(nameIssue === null && pathIssue !== null ? (["path"] as const) : []),
    ...(commentIssue !== null ? (["comment"] as const) : []),
    ...(needAccess ? (["access"] as const) : []),
  ];
  const shows = (p: Problem) => submitted && problems.includes(p);
  const nameError =
    nameIssue !== null && (submitted || nameTouched)
      ? t(nameIssue.key, nameIssue)
      : null;
  const pathError =
    shows("path") && pathIssue !== null ? t(pathIssue.key, pathIssue) : null;

  const focusProblem = (p: Problem) => {
    switch (p) {
      case "fs":
        fsRef.current?.focus();
        return;
      case "name":
        nameRef.current?.focus();
        return;
      case "path":
        (draft.custom && !draft.whole
          ? pathRef.current
          : nameRef.current
        )?.focus();
        return;
      case "comment":
        commentRef.current?.focus();
        return;
      case "access":
        accessRef.current?.focus();
    }
  };

  const onContinue = () => {
    setSubmitted(true);
    const first = problems[0];
    if (first !== undefined || chosen === undefined) {
      setCount(t("addShare.check.count", { count: problems.length }));
      if (first !== undefined) {
        focusProblem(first);
      }
      return;
    }
    setCount("");
    saveAddDraft(draft);
    setFixed({
      fs: chosen.fs,
      mntentref,
      name: draft.name,
      reldirpath,
      comment: draft.comment,
      privileges: privilegesToSave(model, draft.access),
      smb: draft.smb
        ? {
            browseable: draft.browseable,
            readonly: draft.readonly,
            guest: draft.guest ? "allow" : "no",
          }
        : null,
      turnOn: draft.smb && !smbEnabled,
      hostname,
    });
    setStage("summary");
  };

  if (stage === "summary" && fixed !== null) {
    return (
      <JobSummary
        title={t("addShare.sum.title")}
        titleLevel={3}
        titleRef={summaryRef}
        items={summaryItems(fixed, model, draft.access)}
        confirmLabel={t("addShare.confirm")}
        backLabel={t("addShare.changeChoices")}
        onBack={() => setStage("form")}
        onConfirm={() => {
          startAddFlow(
            { shares: sharesApi, apply: fsApi.apply },
            { apply: t("addShare.task.apply", { name: fixed.name }) },
            fixed,
          );
        }}
      />
    );
  }

  const cannot =
    choicesOf.cannot.length > 0 ? (
      <Disclosure>
        <DisclosureTrigger>
          {t("addShare.fs.cannot", { count: choicesOf.cannot.length })}
        </DisclosureTrigger>
        <DisclosurePanel>
          <ul className="flex flex-col gap-1 ps-1">
            {choicesOf.cannot.map(({ fs, reason }) => (
              <li key={fs.devicefile} className="flex flex-col">
                <span>
                  <FsNameView name={shownFsName(fs)} />
                </span>
                <span className="text-sm text-muted-foreground">
                  {t(`addShare.fs.reason.${reason}`)}
                </span>
              </li>
            ))}
          </ul>
        </DisclosurePanel>
      </Disclosure>
    ) : null;

  if (choicesOf.offered.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          action={
            <Link to="/storage/filesystems/add" className={routerLinkClass}>
              {t("addShare.fs.addStorage")}
            </Link>
          }
        >
          {t("addShare.fs.none")}
        </EmptyState>
        {cannot}
      </div>
    );
  }

  const fsHint = (o: (typeof choicesOf.offered)[number]): ReactNode => {
    const free = formatBytes(parseByteCount(o.fs.available) ?? 0);
    const type = fsWords.typeWord(o.fs.type);
    if (o.usage === "warning" || o.usage === "critical") {
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span>{type}</span>
          <StatusPill status={o.usage}>{t(`health.${o.usage}`)}</StatusPill>
          <span>{t("addShare.fs.full", { free })}</span>
        </span>
      );
    }
    return `${type}, ${t("addShare.fs.free", { free })}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div ref={fsRef} tabIndex={-1} className="outline-hidden">
        <RadioGroupField
          legend={t("addShare.fs.legend")}
          value={draft.fs ?? ""}
          onValueChange={(value) => edit({ fs: value })}
          error={shows("fs") ? t("addShare.fs.choose") : undefined}
        >
          {choicesOf.offered.map((o) => (
            <RadioOption
              key={o.fs.devicefile}
              value={o.fs.devicefile}
              label={
                o.fs.devicefile === handover
                  ? `${fsWords.nameOf(shownFsName(o.fs))} ${t("addShare.fs.handedOver")}`
                  : fsWords.nameOf(shownFsName(o.fs))
              }
              hint={fsHint(o)}
            />
          ))}
        </RadioGroupField>
      </div>
      {cannot}

      <Field
        invalid={nameError === null ? undefined : true}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("addShare.name.label")}</FieldLabel>
        <FieldControl
          ref={nameRef}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          dir="auto"
          required
          placeholder={t("addShare.name.placeholder")}
          value={draft.name}
          onChange={(event) => edit({ name: event.target.value })}
          onBlur={() => setNameTouched(draft.name !== "")}
        />
        <FieldHint>{t("addShare.name.hint")}</FieldHint>
        {nameError === null ? null : <FieldError match>{nameError}</FieldError>}
      </Field>

      <div className="flex max-w-[40rem] flex-col gap-2">
        {draft.custom ? (
          <>
            <Field
              invalid={pathError === null || draft.whole ? undefined : true}
              disabled={draft.whole}
            >
              <FieldLabel>{t("addShare.path.label")}</FieldLabel>
              <FieldControl
                ref={pathRef}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                dir="auto"
                disabled={draft.whole}
                value={draft.whole ? WHOLE_FS : draft.path}
                onChange={(event) => edit({ path: event.target.value })}
              />
              <FieldHint>{t("addShare.path.hint")}</FieldHint>
              {pathError === null || draft.whole ? null : (
                <FieldError match>{pathError}</FieldError>
              )}
            </Field>
            <CheckboxField
              label={t("addShare.path.whole")}
              hint={t("addShare.path.wholeHint")}
              checked={draft.whole}
              onCheckedChange={(on: boolean) => edit({ whole: on })}
              error={draft.whole ? (pathError ?? undefined) : undefined}
            />
            <div>
              <Button
                variant="ghost"
                // The words line up with the field and sentence above: back by the padding and border.
                className="-ms-2.75"
                size="sm"
                onClick={() => edit({ custom: false, whole: false, path: "" })}
              >
                {t("addShare.path.useDefault")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {chosen === undefined || draft.name === "" ? null : (
              <p className="text-sm">
                <Trans
                  i18nKey="addShare.path.default"
                  components={{
                    path: <IdentifierText value={inertBidi(draft.name)} />,
                    fs: <FsNameView name={shownFsName(chosen.fs)} />,
                  }}
                />
              </p>
            )}
            {pathError === null ? null : (
              <p className="text-sm text-critical-label">{pathError}</p>
            )}
            <div>
              <Button
                variant="ghost"
                // The words line up with the field and sentence above: back by the padding and border.
                className="-ms-2.75"
                size="sm"
                onClick={() => edit({ custom: true, path: draft.name })}
              >
                {t("addShare.path.other")}
              </Button>
            </div>
          </>
        )}
      </div>

      <Field
        invalid={shows("comment") ? true : undefined}
        className="max-w-[40rem]"
      >
        <FieldLabel>{t("sharedFolder.description.label")}</FieldLabel>
        <FieldControl
          ref={commentRef}
          autoComplete="off"
          dir="auto"
          value={draft.comment}
          onChange={(event) => edit({ comment: event.target.value })}
        />
        <FieldHint>{t("sharedFolder.description.hint")}</FieldHint>
        {shows("comment") ? (
          <FieldError match>{t("sharedFolder.description.tooLong")}</FieldError>
        ) : null}
      </Field>

      {/* C5: the folder page's grid, every row at No access to begin with (A5). A new folder has
          no stored entries, so no row is Blocked and the stale-entry line never shows; the choices are
          the form's, sent by the run's step 3. */}
      <section aria-labelledby={accessId} className="flex flex-col gap-2">
        <h3
          id={accessId}
          ref={accessRef}
          tabIndex={-1}
          aria-describedby={shows("access") ? `${accessId}-error` : undefined}
          className="text-base font-semibold outline-hidden"
        >
          {t("access.title")}
        </h3>
        <p className="max-w-prose text-sm">{t("addShare.access.intro")}</p>
        {shows("access") ? (
          <p
            id={`${accessId}-error`}
            className="text-sm text-critical-label"
            data-slot="field-error"
          >
            {t("addShare.check.needAccess")}
          </p>
        ) : null}
        <AccessGridSection
          label={t("access.title")}
          model={model}
          choices={draft.access}
          onChoicesChange={(access) => edit({ access })}
        />
      </section>

      <div className="flex flex-col gap-3">
        <CheckboxField
          label={t("addShare.smb.label")}
          checked={draft.smb}
          disabled={smbBlocked}
          onCheckedChange={(on: boolean) => edit({ smb: on })}
          hint={
            smbBlocked ? (
              <>
                <Trans
                  i18nKey="folderSmb.form.hostTooLong"
                  values={{ count: host.length }}
                  components={{
                    host: <IdentifierText value={inertBidi(host.host)} />,
                  }}
                />{" "}
                <ExternalLink
                  href={CLASSIC.networkGeneral}
                  newTabLabel={t("app.newTab")}
                >
                  {t("folderSmb.form.hostLink")}
                </ExternalLink>
              </>
            ) : (
              t("shares.term.smb")
            )
          }
        />
        {draft.smb ? (
          <AddShareSmbOptions
            values={{
              browseable: draft.browseable,
              readonly: draft.readonly,
              guest: draft.guest,
            }}
            onChange={(values) => edit(values)}
            folder={draft.name}
            smbOff={!smbEnabled}
          />
        ) : null}
      </div>

      <p className="max-w-prose text-sm">{t("addShare.modeNote")}</p>
      <p role="status" aria-live="polite" className="text-sm font-medium">
        {count}
      </p>
      <div>
        <Button onClick={onContinue}>{t("addShare.continue")}</Button>
      </div>
    </div>
  );
}

/** 6.3: one item per action, in the order they run. */
function useAddShareSummary() {
  const { t } = useTranslation();
  const listOf = (rows: readonly AccessRow[]): string =>
    rows
      .map((r) =>
        r.kind === "group"
          ? t("addShare.sum.group", { name: inertBidi(r.name) })
          : inertBidi(r.name),
      )
      .join(", ");
  return (
    fixed: AddChoices,
    model: AccessModel,
    access: AddDraft["access"],
  ): (ReactNode | { content: ReactNode; tone: "warning" })[] => {
    const fs = <FsNameView name={shownFsName(fixed.fs)} />;
    const name = <FolderNameText value={fixed.name} />;
    const path = (
      <IdentifierText value={inertBidi(displayPath(fixed.reldirpath))} />
    );
    const items: (ReactNode | { content: ReactNode; tone: "warning" })[] = [];
    if (isWholeFs(fixed.reldirpath)) {
      items.push(
        <Trans i18nKey="addShare.sum.makeWhole" components={{ name, fs }} />,
      );
    } else {
      items.push(
        <Trans i18nKey="addShare.sum.make" components={{ name, fs, path }} />,
        <Trans i18nKey="addShare.sum.existing" components={{ path }} />,
      );
    }
    const { rw, ro } = accessSummary(model, access);
    if (rw.length > 0) {
      items.push(<>{t("addShare.sum.rw", { list: listOf(rw) })}</>);
    }
    if (ro.length > 0) {
      items.push(<>{t("addShare.sum.ro", { list: listOf(ro) })}</>);
    }
    if (rw.length === 0 && ro.length === 0 && fixed.smb === null) {
      items.push(<>{t("addShare.sum.nobody")}</>);
    }
    if (fixed.smb === null) {
      items.push(<>{t("addShare.sum.noShare")}</>);
    } else {
      const address = shareAddresses(fixed.hostname, fixed.name).windows;
      items.push(
        <Trans
          i18nKey="addShare.sum.share"
          components={{
            address: <IdentifierText value={inertBidi(address)} />,
          }}
        />,
      );
      if (fixed.turnOn) {
        items.push(<>{t("addShare.sum.smbOn")}</>);
      }
      if (fixed.smb.guest !== "no") {
        items.push({
          tone: "warning",
          content: (
            <>
              <span className="block">{t("addShare.sum.guest")}</span>
              <span className="block">{t("folderSmb.form.guestMode")}</span>
            </>
          ),
        });
      }
    }
    items.push(<>{t("addShare.sum.apply")}</>);
    return items;
  };
}
