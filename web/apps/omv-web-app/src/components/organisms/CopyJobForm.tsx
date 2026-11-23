// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's decisions, in one form (phase 5 services design 5.2 and 5.3), for adding a job and for
// changing one (section 6): Copy from and Copy to, each a shared folder on this NAS or another
// computer (one side at most), the direction sentence (a polite live region, 500 ms after the last
// change), the replace line, "Also delete…" on its own after a gap with its warning as part of its
// description, When on the library's ScheduleField, email, and the note.
//
// Every refusal of 0.10 is checked here and again by the flow just before the save. The password for
// another computer's rsync server is held only while typed, never pre-filled, and dropped after every
// request by the caller (0.8, UI-6); it is passed up with the choices, never stored with them.
import type {
  ConfiguredFilesystem,
  SharedFolder,
  SshCertificateListDataItem,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  CheckboxField,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  ExternalLink,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  Identifier,
  InlineAlert,
  NumberField,
  RadioGroupField,
  RadioOption,
  ScheduleField,
  SecretField,
  type ScheduleFieldValue,
} from "@omv-webui/react-ui-components";
import { useId, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useDebounced } from "../../hooks/useDebounced.ts";
import { differsFromNas, useJobWords } from "../../hooks/useJobWords.ts";
import { monthText, weekdayText } from "../../hooks/useSmartWords.ts";
import { CLASSIC } from "../../navigation/navigation.ts";
import {
  choiceUri,
  emptyRemote,
  jobRefusals,
  NOTE_MAX,
  RSYNCD_PORT,
  sidesOfChoices,
  SSH_PORT,
  type JobChoices,
  type JobRefusal,
  type JobSides,
  type RemoteChoice,
  type RemoteField,
  type Side,
  type SideChoice,
} from "../../services/jobModel.ts";
import { scheduleFields } from "../../services/jobSchedule.ts";
import { folderFs, folderState } from "../../sharedFolders/shareActions.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import {
  JobDirection,
  JobSideView,
  SlotText,
} from "../molecules/JobDirection.tsx";
import { SelfTestSelect } from "../molecules/SelfTestSelect.tsx";

/** What the form reads, from its page. */
export interface JobFormReads {
  folders: readonly SharedFolder[] | undefined;
  foldersFailed: boolean;
  fileSystems: readonly ConfiguredFilesystem[] | undefined;
  keys: readonly SshCertificateListDataItem[] | undefined;
  keysFailed: boolean;
  /** Email notifications are set up; undefined while not known. */
  emailSetUp: boolean | undefined;
  /** The folder is shared over SMB or NFS or offered to the rsync server (5.3's line). */
  isShared: (uuid: string) => boolean;
  nasZone: string | undefined;
}

export interface JobFormProps {
  heading: string;
  initial: JobChoices;
  reads: JobFormReads;
  /** The submit button: "Review the job…", or for a change "Save" / "Review the change…". */
  submitLabel: (choices: JobChoices) => string;
  onSubmit: (choices: JobChoices, password: string) => void;
  onCancel?: () => void;
  /** The stored job signs in with a password: the field says to type it again (0.8). */
  passwordStored?: boolean;
  /** Lines under the form that depend on what changed (section 6). */
  notes?: (choices: JobChoices) => ReactNode;
  busy?: boolean;
  error?: ReactNode;
  /** Which sides' shared folders are checked as reachable (0.10: new jobs and changed sides). */
  checkFolders?: (choices: JobChoices) => { from: boolean; to: boolean };
}

const NUMBER = /^\d+$/u;

export function CopyJobForm({
  heading,
  initial,
  reads,
  submitLabel,
  onSubmit,
  onCancel,
  passwordStored = false,
  notes,
  busy = false,
  error,
  checkFolders,
}: JobFormProps) {
  const { t } = useTranslation();
  const words = useJobWords(reads.nasZone);
  const [choices, setChoices] = useState<JobChoices>(initial);
  const [ports, setPorts] = useState<{ from: string; to: string }>(() => ({
    from: portText(initial.from),
    to: portText(initial.to),
  }));
  // The password, only while typed: the caller drops it after every request (0.8).
  const [password, setPassword] = useState("");
  // SecretField holds its own input: a new key gives an empty one after each submit.
  const [secretKey, setSecretKey] = useState(0);
  const [tried, setTried] = useState(false);
  const set = (change: Partial<JobChoices>) =>
    setChoices((c) => ({ ...c, ...change }));

  const refusals =
    reads.folders === undefined || reads.fileSystems === undefined
      ? null
      : jobRefusals(
          choices,
          { folders: reads.folders, fileSystems: reads.fileSystems },
          checkFolders?.(choices),
        );

  // Each side as the sentences name it: a shared folder's name, "{{path}} on {{host}}" for another
  // computer (0.2), or a placeholder while it is not chosen. Each is a component that takes its text
  // as a prop, since a Trans slot replaces an element's children with the slot's own (empty) ones.
  const fromSide = sideOfChoice(choices.from);
  const toSide = sideOfChoice(choices.to);
  const sideNode = (side: Side | null, placeholder: string) =>
    side === null ? (
      <SlotText value={placeholder} />
    ) : (
      <JobSideView side={side} folders={reads.folders} />
    );
  const src = sideNode(fromSide, t("addJob.placeholder.src"));
  const dest = sideNode(toSide, t("addJob.placeholder.dest"));
  const srcText =
    fromSide === null
      ? t("addJob.placeholder.src")
      : words.sideText(fromSide, reads.folders);
  const destText =
    toSide === null
      ? t("addJob.placeholder.dest")
      : words.sideText(toSide, reads.folders);

  // Field 3: the direction, 500 ms after the last change to either side (5.2). Settled on the
  // sides' own value, so a re-render with equal choices does not restart the wait.
  const sidesNow = JSON.stringify(sidesOfChoices(choices));
  const settledSides = useDebounced(sidesNow, 500);
  const sides = JSON.parse(settledSides) as JobSides | null;

  const submit = () => {
    setTried(true);
    if (busy || refusals === null || refusals.length > 0) {
      return;
    }
    const typed = password;
    setPassword("");
    setSecretKey((k) => k + 1);
    onSubmit(choices, typed);
  };

  const zone = differsFromNas(reads.nasZone) ? reads.nasZone : undefined;
  const scheduleLabels = {
    legend: t("addJob.when"),
    manual: t("addJob.whenManual"),
    schedule: t("addJob.whenSchedule"),
    frequency: t("addJob.howOften"),
    frequencies: {
      hourly: t("addJob.howOftenOption.hourly"),
      daily: t("addJob.howOftenOption.daily"),
      weekly: t("addJob.howOftenOption.weekly"),
      monthly: t("addJob.howOftenOption.monthly"),
      custom: t("addJob.howOftenOption.custom"),
    },
    at: t("addJob.at"),
    hour: t("addJob.atHour"),
    minute: t("addJob.atMinute"),
    weekday: t("addJob.on"),
    day: t("addJob.onDay"),
    dayNote: t("addJob.onDayHigh"),
    minutesPast: t("addJob.minutesPast"),
    custom: {
      minute: t("addJob.custom.minute"),
      hour: t("addJob.custom.hour"),
      day: t("addJob.custom.day"),
      month: t("addJob.custom.month"),
      weekday: t("addJob.custom.weekday"),
    },
    every: {
      minute: t("addJob.custom.every.minute"),
      hour: t("addJob.custom.every.hour"),
      day: t("addJob.custom.every.day"),
      month: t("addJob.custom.every.month"),
      weekday: t("addJob.custom.every.weekday"),
    },
    customNote: t("addJob.custom.either"),
  };
  const storedWhen = choices.schedule.stored
    ? words.when({
        ...scheduleFields(initial.schedule, undefined),
        enable: true,
      })
    : null;

  const refusalOf = (kind: JobRefusal["kind"]) =>
    tried ? refusals?.find((r) => r.kind === kind) : undefined;
  const sideRefusal = (side: "from" | "to"): ReactNode => {
    if (!tried || refusals === null) {
      return null;
    }
    for (const r of refusals) {
      if ((r.kind === "missing" || r.kind === "folder") && r.side === side) {
        return r.kind === "missing"
          ? t("addJob.err.missing")
          : r.reason === "gone"
            ? t("addJob.err.gone")
            : t(`addJob.folderReason.${r.reason}`);
      }
    }
    if (side === "to") {
      const same = refusalOf("same");
      if (same !== undefined) {
        return t("addJob.err.same");
      }
      const inside = refusals.find((r) => r.kind === "inside");
      if (inside?.kind === "inside") {
        const name = (uuid: string) =>
          reads.folders?.find((f) => f.uuid === uuid)?.name ?? "";
        return (
          <Trans
            i18nKey="addJob.err.inside"
            components={{
              other: <FolderNameText value={name(inside.inner)} />,
              folder: <FolderNameText value={name(inside.outer)} />,
            }}
          />
        );
      }
    }
    return null;
  };
  const remoteErrors = new Set<RemoteField>(
    tried
      ? (refusals ?? []).flatMap((r) => (r.kind === "remote" ? [r.field] : []))
      : [],
  );

  const sideBlock = (side: "from" | "to") => {
    const value = choices[side];
    const other = choices[side === "from" ? "to" : "from"];
    const otherRemote = other.kind === "remote";
    const change = (next: SideChoice) => set({ [side]: next });
    return (
      <RadioGroupField
        legend={t(side === "from" ? "addJob.from" : "addJob.to")}
        value={value.kind}
        readOnly={busy}
        onValueChange={(kind) => {
          if (kind === "folder" && value.kind !== "folder") {
            change({ kind: "folder", uuid: "" });
          } else if (
            kind === "remote" &&
            value.kind !== "remote" &&
            !otherRemote
          ) {
            const via = reads.keysFailed ? "rsyncd" : "ssh";
            change({ kind: "remote", remote: emptyRemote(via) });
            setPorts((p) => ({
              ...p,
              [side]: String(via === "ssh" ? SSH_PORT : RSYNCD_PORT),
            }));
          }
        }}
      >
        <RadioOption value="folder" label={t("addJob.side.folder")}>
          {value.kind === "folder" ? (
            <FolderSide
              value={value.uuid}
              reads={reads}
              busy={busy}
              error={sideRefusal(side)}
              destShared={
                side === "to" &&
                value.uuid !== "" &&
                reads.isShared(value.uuid) ? (
                  <Trans i18nKey="addJob.destShared" components={{ dest }} />
                ) : null
              }
              onChange={(uuid) => change({ kind: "folder", uuid })}
            />
          ) : null}
        </RadioOption>
        <RadioOption
          value="remote"
          label={t("addJob.side.remote")}
          disabled={otherRemote}
          hint={otherRemote ? t("addJob.side.oneRemote") : undefined}
        >
          {value.kind === "remote" ? (
            <RemoteSide
              value={value.remote}
              port={ports[side]}
              reads={reads}
              busy={busy}
              errors={remoteErrors}
              classicRefused={refusalOf("classicAddress") !== undefined}
              secretKey={secretKey}
              passwordStored={passwordStored}
              onPassword={setPassword}
              onPort={(text) => {
                setPorts((p) => ({ ...p, [side]: text }));
                change({
                  kind: "remote",
                  remote: {
                    ...value.remote,
                    port: NUMBER.test(text) ? Number(text) : NaN,
                  },
                });
              }}
              onChange={(remote) => change({ kind: "remote", remote })}
            />
          ) : null}
        </RadioOption>
      </RadioGroupField>
    );
  };

  const emailOff = reads.emailSetUp === false;
  const noteTooLong = tried && refusalOf("note") !== undefined;
  const deleteWarning = choices.deletes ? (
    <span className="flex flex-col gap-1">
      <span>
        <Trans i18nKey="addJob.deleteWarn1" components={{ src, dest }} />
      </span>
      <span>
        <Trans i18nKey="addJob.deleteWarn2" components={{ src, dest }} />
      </span>
      <span>
        <Trans i18nKey="addJob.deleteWarn3" />
      </span>
    </span>
  ) : undefined;
  const readsFailed = reads.foldersFailed && reads.folders === undefined;

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      aria-label={heading}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {sideBlock("from")}
      {sideBlock("to")}
      {sides === null ? (
        <p role="status" className="text-base">
          {t("addJob.sentence.incomplete")}
        </p>
      ) : (
        <JobDirection role="status" sides={sides} folders={reads.folders} />
      )}
      <p className="text-sm">
        <Trans i18nKey="addJob.replace" components={{ src, dest }} />
      </p>
      <CheckboxField
        className="mt-1"
        label={<Trans i18nKey="addJob.delete" components={{ src, dest }} />}
        hint={<Trans i18nKey="addJob.deleteHint" components={{ src, dest }} />}
        warning={deleteWarning}
        checked={choices.deletes}
        readOnly={busy}
        onCheckedChange={(deletes: boolean) => set({ deletes })}
      />
      <ScheduleField
        labels={scheduleLabels}
        weekdayNames={[1, 2, 3, 4, 5, 6, 7].map(weekdayText)}
        monthNames={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(monthText)}
        value={choices.schedule}
        onValueChange={(schedule: ScheduleFieldValue) => set({ schedule })}
        storedNote={
          storedWhen === null
            ? undefined
            : t("addJob.custom.stored", { when: storedWhen })
        }
        clock={t("addJob.nasClock", {
          zone: zone === undefined ? "" : t("addJob.nasClockZone", { zone }),
        })}
        disabled={busy}
      />
      <CheckboxField
        label={t("addJob.email")}
        hint={
          emailOff ? (
            <span>
              {t("addJob.emailNotSetUp")}{" "}
              <ExternalLink
                href={CLASSIC.notifications}
                newTabLabel={t("app.newTab")}
              >
                {t("addJob.emailLink")}
              </ExternalLink>
            </span>
          ) : undefined
        }
        disabled={emailOff || busy}
        checked={choices.sendemail && !emailOff}
        onCheckedChange={(sendemail: boolean) => set({ sendemail })}
      />
      <Field invalid={noteTooLong ? true : undefined}>
        <FieldLabel>{t("addJob.note")}</FieldLabel>
        <FieldControl
          dir="auto"
          autoComplete="off"
          maxLength={NOTE_MAX}
          readOnly={busy}
          value={choices.comment}
          onValueChange={(comment) => set({ comment })}
        />
        <FieldHint>
          {t("addJob.noteHint", {
            auto: words.auto(srcText, destText),
          })}
        </FieldHint>
        {noteTooLong ? <FieldError>{t("addJob.err.note")}</FieldError> : null}
      </Field>
      {notes?.(choices)}
      {readsFailed ? (
        <InlineAlert tone="critical">{t("addJob.err.reads")}</InlineAlert>
      ) : null}
      {tried && refusalOf("bothRemote") !== undefined ? (
        <p role="alert" className="text-sm text-critical-label">
          {t("addJob.side.oneRemote")}
        </p>
      ) : null}
      {error}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          loading={busy}
          disabled={refusals === null}
          focusableWhenDisabled
        >
          {submitLabel(choices)}
        </Button>
        {onCancel ? (
          <Button type="button" variant="neutral" onClick={onCancel}>
            {t("addJob.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const portText = (side: SideChoice) =>
  side.kind === "remote" ? String(side.remote.port) : "";

/** A shared folder on this NAS: every folder by name, those that cannot be reached unavailable. */
function FolderSide({
  value,
  reads,
  busy,
  error,
  destShared,
  onChange,
}: {
  value: string;
  reads: JobFormReads;
  busy: boolean;
  error: ReactNode;
  destShared: ReactNode;
  onChange: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { value: "", label: t("addJob.folderNone"), disabled: true },
    ...(reads.folders ?? []).map((folder) => {
      const state =
        reads.fileSystems === undefined
          ? { pill: "ok" as const }
          : folderState(folder, folderFs(folder, reads.fileSystems));
      const reason =
        state.pill === "ok"
          ? null
          : state.pill === "critical" &&
              (state.reason === "fsNotMounted" || state.reason === "fsMissing")
            ? t("addJob.folderReason.notMounted")
            : t("addJob.folderReason.notOk");
      const label =
        folder.device === ""
          ? inertBidi(folder.name)
          : t("addJob.folderOption", {
              name: inertBidi(folder.name),
              fs: inertBidi(folder.device),
            });
      return {
        value: folder.uuid,
        label:
          reason === null
            ? label
            : t("addJob.folderUnavailable", { name: label, reason }),
        disabled: reason !== null,
      };
    }),
  ];
  return (
    <div className="flex flex-col gap-2">
      <SelfTestSelect
        label={t("addJob.folder")}
        value={value}
        options={options}
        onValueChange={onChange}
        disabled={busy || reads.folders === undefined}
        error={error}
      />
      {destShared ? <p className="text-sm">{destShared}</p> : null}
    </div>
  );
}

/** Another computer (5.3): how the NAS reaches it, then its fields; the address built from them. */
function RemoteSide({
  value,
  port,
  reads,
  busy,
  errors,
  classicRefused,
  secretKey,
  passwordStored,
  onPassword,
  onPort,
  onChange,
}: {
  value: RemoteChoice;
  port: string;
  reads: JobFormReads;
  busy: boolean;
  errors: ReadonlySet<RemoteField>;
  classicRefused: boolean;
  secretKey: number;
  passwordStored: boolean;
  onPassword: (password: string) => void;
  onPort: (text: string) => void;
  onChange: (remote: RemoteChoice) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const set = (change: Partial<RemoteChoice>) =>
    onChange({ ...value, ...change });
  const err = (field: RemoteField) =>
    errors.has(field) ? t(`addJob.err.${field}`) : undefined;
  const key = reads.keys?.find((k) => k.uuid === value.key);
  const sshUnavailable = reads.keysFailed;
  const text = (
    field: "host" | "user" | "path" | "module" | "inside",
    label: string,
    hint?: string,
    placeholder?: string,
  ) => (
    <Field invalid={errors.has(field) ? true : undefined}>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl
        dir="ltr"
        autoComplete="off"
        spellCheck={false}
        readOnly={busy}
        placeholder={placeholder}
        value={value[field]}
        onValueChange={(next) => set({ [field]: next.trim() })}
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {err(field) ? <FieldError>{err(field)}</FieldError> : null}
    </Field>
  );

  if (value.keep !== "") {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2">
          <Identifier>{inertBidi(value.keep)}</Identifier>
          <span className="text-sm text-muted-foreground">
            {t("changeJob.classicValue", { value: "" }).trim()}
          </span>
        </p>
        {classicRefused ? (
          <p role="alert" className="text-sm text-critical-label">
            {t("addJob.err.classicAddress")}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            variant="neutral"
            onClick={() =>
              onChange({ ...emptyRemote(value.via), key: value.key })
            }
          >
            {t("changeJob.writeAgain")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroupField
        legend={t("addJob.how")}
        value={value.via}
        readOnly={busy}
        onValueChange={(via) => {
          if ((via === "ssh" && !sshUnavailable) || via === "rsyncd") {
            set({ via, port: via === "ssh" ? SSH_PORT : RSYNCD_PORT });
            onPort(String(via === "ssh" ? SSH_PORT : RSYNCD_PORT));
          }
        }}
      >
        <RadioOption
          value="ssh"
          label={t("addJob.howSsh")}
          disabled={sshUnavailable}
          hint={sshUnavailable ? t("addJob.howSshUnavailable") : undefined}
        />
        <RadioOption value="rsyncd" label={t("addJob.howRsyncd")} />
      </RadioGroupField>
      {text("host", t("addJob.host"), undefined, "192.0.2.20")}
      <NumberField
        label={value.via === "ssh" ? t("addJob.sshPort") : t("addJob.port")}
        value={port}
        readOnly={busy}
        onValueChange={onPort}
        error={err("port")}
      />
      {text("user", t("addJob.user"))}
      {value.via === "ssh" ? (
        <>
          {text("path", t("addJob.path"), t("addJob.pathHint"), "/srv/copies")}
          <SelfTestSelect
            label={t("addJob.key")}
            value={value.key}
            options={[
              { value: "", label: t("addJob.keyNone"), disabled: true },
              ...(reads.keys ?? []).map((k) => ({
                value: k.uuid,
                label: inertBidi(k.comment === "" ? k.uuid : k.comment),
              })),
            ]}
            onValueChange={(next) => set({ key: next })}
            disabled={busy || reads.keys === undefined}
            hint={reads.keys?.length === 0 ? t("addJob.keyNoKeys") : undefined}
            error={err("key")}
          />
          {key === undefined ? null : (
            <Disclosure>
              <DisclosureTrigger>{t("addJob.showKey")}</DisclosureTrigger>
              <DisclosurePanel>
                <span className="flex items-start gap-1">
                  <Identifier className="break-all whitespace-pre-wrap">
                    {key.publickey}
                  </Identifier>
                  <CopyButton
                    text={key.publickey}
                    label={t("addJob.copyKey")}
                    copiedLabel={t("common.copied")}
                    selectedLabel={t("common.copySelected")}
                    size="icon-sm"
                  />
                </span>
              </DisclosurePanel>
            </Disclosure>
          )}
          <p className="text-sm">
            <Trans
              i18nKey="addJob.keyHelp"
              components={{
                user: <IdentifierText value={inertBidi(value.user)} />,
                host: <IdentifierText value={inertBidi(value.host)} />,
              }}
            />{" "}
            <ExternalLink
              href={CLASSIC.sshCertificates}
              newTabLabel={t("app.newTab")}
            >
              {t("addJob.keyLink")}
            </ExternalLink>
          </p>
        </>
      ) : (
        <>
          {text("module", t("addJob.module"), undefined, "photos")}
          {text("inside", t("addJob.inside"), t("addJob.pathHint"))}
          <SecretField
            key={secretKey}
            id={`${id}-password`}
            label={t("addJob.password")}
            hint={passwordStored ? t("addJob.passwordAgain") : undefined}
            revealLabel={t("password.show")}
            disabled={busy}
            onChange={(event) => onPassword(event.target.value)}
          />
          <InlineAlert tone="neutral" icon="warning">
            {t("addJob.noEncryption")}
          </InlineAlert>
        </>
      )}
    </div>
  );
}

/** One side as chosen so far, or null while it is not. */
function sideOfChoice(side: SideChoice): Side | null {
  if (side.kind === "folder") {
    return side.uuid === "" ? null : { kind: "folder", uuid: side.uuid };
  }
  return side.remote.host === "" && side.remote.keep === ""
    ? null
    : { kind: "remote", uri: choiceUri(side.remote) };
}
