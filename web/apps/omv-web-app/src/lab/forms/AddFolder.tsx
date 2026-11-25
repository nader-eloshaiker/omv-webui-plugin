// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: Add a shared folder, redesigned (rethink spec 3.11, 8 row 2). Development only (UI-11).
// The four questions in the person's order, the outcome picture and consequence summary in the rail,
// defaults that never make a folder nobody can open, "More options" per question, the error summary
// after a press with problems, and the run in place with its done panel. Pressing Create runs a
// simulated job: the lab never writes (UI-4).
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "@omv-webui/react-ui-components";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { AccessRow } from "./AccessRows.tsx";
import { AccessRows } from "./AccessRows.tsx";
import { FolderPicture } from "./LineageStrip.tsx";
import type {
  Drive,
  FolderForm,
  NfsReach,
  Problem,
  WhoPreset,
} from "./model.ts";
import {
  baseAccess,
  changedCounts,
  effectiveAccess,
  folderNameProblem,
  folderProblems,
  folderSentences,
  gib,
  GROUPS,
  HOME_RANGE,
  initialFolder,
  levelWords,
  listWords,
  NAS_NAME,
  PEOPLE,
  PRINCIPALS,
} from "./model.ts";
import type { RunStep, StepState } from "./parts.tsx";
import {
  ActionBar,
  Address,
  ChoiceCards,
  ConsequenceList,
  ErrorSummary,
  FormHeader,
  FormLayout,
  FormSection,
  Help,
  MoreOptions,
  RunSteps,
  SettingRow,
  StatementRow,
  Tip,
  ToggleCard,
} from "./parts.tsx";
import type { FolderState } from "./states.ts";
import { useFocusOnPhase, useWide } from "./states.ts";

type Phase = "edit" | "run" | "done" | "failed";

const STEP_MS = 900;
const SERVICES = { smbOn: false, nfsOn: false };

function seed(state: FolderState, drives: readonly Drive[]): FolderForm {
  const form = initialFolder(drives);
  if (state === "empty" || state === "errors") {
    return form;
  }
  const named = { ...form, name: "Photos" };
  switch (state) {
    case "options":
      return { ...named, guest: true };
    case "chosen":
      return {
        ...named,
        who: "chosen",
        picked: { "g:family": "rw", "p:jo": "ro" },
      };
    case "nfs":
      return { ...named, nfs: true };
    default:
      return named;
  }
}

function stepsFor(form: FolderForm, drives: readonly Drive[]): RunStep[] {
  const name = form.name.trim();
  const drive = drives.find((d) => d.id === form.drive)?.name ?? "the drive";
  const people = [...effectiveAccess(form).values()].filter(
    (a) => a !== "none",
  ).length;
  const steps: { id: string; label: string }[] = [
    { id: "create", label: `Create ${name} on ${drive}` },
    {
      id: "access",
      label: `Give ${people === 1 ? "1 person" : `${people} people`} access`,
    },
  ];
  if (form.smb) {
    if (!SERVICES.smbOn) {
      steps.push({ id: "smbOn", label: "Turn on Windows and Mac sharing" });
    }
    steps.push({
      id: "smb",
      label: `Share ${name} with Windows and Mac computers`,
    });
  }
  if (form.nfs) {
    steps.push({ id: "nfs", label: `Share ${name} with Linux computers` });
  }
  steps.push({ id: "apply", label: "Apply the changes" });
  return steps.map((s) => ({ ...s, state: "waiting" as StepState }));
}

/** The run's steps with the first `done` finished and the next one in `current`. */
function progress(
  steps: RunStep[],
  done: number,
  current: StepState,
): RunStep[] {
  return steps.map((s, i) => ({
    ...s,
    state: i < done ? "done" : i === done ? current : "waiting",
  }));
}

export function AddFolder({
  state,
  drives,
  tips,
  onNote,
}: {
  state: FolderState;
  drives: readonly Drive[];
  tips: boolean;
  onNote: (text: string) => void;
}) {
  const [form, setForm] = useState<FolderForm>(() => seed(state, drives));
  const [attempt, setAttempt] = useState(state === "errors" ? 1 : 0);
  const [blurred, setBlurred] = useState(false);
  const [settledName, setSettledName] = useState(form.name);
  const [open, setOpen] = useState({
    name: false,
    where: false,
    how: state === "options",
  });
  const [tipShown, setTipShown] = useState(true);
  const [review, setReview] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    state === "run"
      ? "run"
      : state === "done"
        ? "done"
        : state === "failed"
          ? "failed"
          : "edit",
  );
  const [steps, setSteps] = useState<RunStep[]>(() => {
    const all = stepsFor(seed(state, drives), drives);
    if (state === "run") {
      return progress(all, 2, "running");
    }
    if (state === "done") {
      return progress(all, all.length, "done");
    }
    return state === "failed" ? progress(all, 2, "failed") : all;
  });
  const [live, setLive] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const wide = useWide(layoutRef);
  const nameRef = useRef<HTMLInputElement>(null);
  const whoRef = useRef<HTMLDivElement>(null);
  const computerRef = useRef<HTMLInputElement>(null);
  const railHeadingId = useId();
  useFocusOnPhase(phase, railHeadingId);

  // Availability on a 400ms pause (3.8): read from data already loaded, never a call per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledName(form.name);
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [form.name]);

  // The light travels once the panel has risen (7.4 "It is live").
  useEffect(() => {
    if (phase !== "done") {
      return;
    }
    const timer = window.setTimeout(() => {
      setLive(true);
    }, 120);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  const set = (patch: Partial<FolderForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  const problems: Problem[] = attempt > 0 ? folderProblems(form) : [];
  const nameError =
    problems.find((p) => p.field === "name")?.text ??
    (blurred || settledName === form.name
      ? (() => {
          const problem = folderNameProblem(form.name);
          // Before a press, an empty name is not an error yet; a taken or malformed one is.
          return problem && form.name ? problem : null;
        })()
      : null);
  const whoError = problems.find((p) => p.field === "who")?.text;
  const computerError = problems.find((p) => p.field === "nfsComputer")?.text;

  const drive = drives.find((d) => d.id === form.drive) ?? null;
  const usable = drives.filter((d) => !d.unavailable);
  const sentences = folderSentences(form, drives, SERVICES);
  const changed = changedCounts(form);
  const levels = effectiveAccess(form);
  const withAccess = PEOPLE.filter((p) => levels.get(p.name) !== "none").map(
    (p) => p.name,
  );
  const name = form.name.trim();
  const primary = name ? `Create ${name}` : "Create shared folder";
  const busy = phase !== "edit";

  const run = () => {
    const all = stepsFor(form, drives);
    setPhase("run");
    setSteps(progress(all, 0, "running"));
    let done = 0;
    const tick = () => {
      done += 1;
      if (done >= all.length) {
        setSteps(progress(all, all.length, "done"));
        setPhase("done");
        return;
      }
      setSteps(progress(all, done, "running"));
      window.setTimeout(tick, STEP_MS);
    };
    window.setTimeout(tick, STEP_MS);
  };

  const submit = () => {
    if (busy) {
      return;
    }
    if (folderProblems(form).length > 0) {
      setAttempt((a) => a + 1);
      return;
    }
    run();
  };

  const go = (field: string) => {
    if (field === "name") {
      nameRef.current?.focus();
    } else if (field === "who") {
      whoRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    } else {
      computerRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const reset = () => {
    setForm(initialFolder(drives));
    setAttempt(0);
    setBlurred(false);
    setPhase("edit");
    setLive(false);
    window.setTimeout(() => nameRef.current?.focus(), 0);
  };

  // A person a group lets in further than their own row says which group, and at what level.
  const picker: AccessRow[] = PRINCIPALS.map((p) => {
    const own = form.picked[p.key] ?? baseAccess(form.who);
    const effective = p.kind === "person" ? levels.get(p.name) : undefined;
    const raised = effective !== undefined && effective !== own;
    const via = raised
      ? GROUPS.filter(
          (g) =>
            g.members.includes(p.name) &&
            (form.picked[`g:${g.name}`] ?? baseAccess(form.who)) === effective,
        ).map((g) => g.name)
      : [];
    return {
      key: p.key,
      kind: p.kind,
      name: p.name,
      line:
        p.kind === "group"
          ? `Group · ${p.line}`
          : raised
            ? `${p.line} · ${levelWords(effective)} through the group`
            : p.line,
      value: own,
      tag: via.length > 0 ? `through ${listWords(via)}` : undefined,
    };
  });

  const errorSummary = (
    <ErrorSummary problems={problems} attempt={attempt} onGo={go} />
  );

  const questions = (
    <div className="lf-form" inert={busy || undefined} onKeyDown={onKeyDown}>
      <a className="lf-skip" href={`#${railHeadingId}`}>
        Skip to summary
      </a>
      {wide ? null : errorSummary}
      <FormSection n={1} question="What is it called?">
        <Field
          invalid={Boolean(nameError)}
          className="lf-field"
          data-flagged={nameError ? attempt : undefined}
        >
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            ref={nameRef}
            className="lf-w-name"
            autoFocus={state === "empty"}
            autoComplete="off"
            spellCheck={false}
            placeholder="For example: Photos"
            value={form.name}
            onBlur={() => {
              setBlurred(true);
            }}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
          {nameError ? (
            <FieldError key={attempt}>{nameError}</FieldError>
          ) : (
            <FieldHint>
              Computers show the folder by this name. It cannot be changed
              later.
            </FieldHint>
          )}
        </Field>
        <MoreOptions
          what="description"
          changed={changed.name}
          open={open.name}
          onOpenChange={(o) => {
            setOpen((s) => ({ ...s, name: o }));
          }}
        >
          <Field>
            <FieldLabel>Description</FieldLabel>
            <FieldControl
              className="lf-w-full"
              value={form.description}
              onChange={(event) => {
                set({ description: event.target.value });
              }}
            />
            <FieldHint>Shown in lists, to tell folders apart.</FieldHint>
          </Field>
        </MoreOptions>
      </FormSection>

      <FormSection n={2} question="Where are its files kept?">
        {usable.length === 1 && drive ? (
          <StatementRow
            icon="file-system"
            fact={`${gib(drive.freeGiB)} free of ${gib(drive.sizeGiB)}`}
          >
            Files are kept on{" "}
            <strong className="lf-strong">{drive.name}</strong>
            <span className="lf-term"> {drive.type}</span>
          </StatementRow>
        ) : (
          <ChoiceCards
            label="Where its files are kept"
            name="drive"
            value={form.drive}
            columns={drives.length > 2 ? 3 : 2}
            onChange={(drive) => {
              set({ drive });
            }}
            options={[...drives]
              .sort(
                (a, b) =>
                  Number(Boolean(a.unavailable)) -
                    Number(Boolean(b.unavailable)) || b.freeGiB - a.freeGiB,
              )
              .map((d) => ({
                value: d.id,
                title: d.name,
                term: d.type,
                icon: "file-system" as const,
                line: d.device,
                fact: d.unavailable
                  ? undefined
                  : `${gib(d.freeGiB)} free of ${gib(d.sizeGiB)}`,
                used: 1 - d.freeGiB / d.sizeGiB,
                unavailable: d.unavailable,
              }))}
          />
        )}
        <MoreOptions
          what="folder on the drive"
          changed={changed.where}
          open={open.where}
          onOpenChange={(o) => {
            setOpen((s) => ({ ...s, where: o }));
          }}
        >
          <Field>
            <FieldLabel>Folder on the drive</FieldLabel>
            <FieldControl
              className="lf-w-full lf-mono"
              placeholder={name ? `${name}/` : "The same as the name"}
              value={form.path}
              onChange={(event) => {
                set({ path: event.target.value });
              }}
            />
            <FieldHint>
              Leave it empty to use the name. Use an existing folder to share
              files already on {drive?.name ?? "the drive"}.
            </FieldHint>
          </Field>
        </MoreOptions>
      </FormSection>

      <FormSection
        n={3}
        question="Who can open it?"
        flagged={Boolean(whoError)}
        help={
          tips ? null : (
            <Help tips={false} question="Which should I choose?">
              <WhoHelp />
            </Help>
          )
        }
      >
        <div ref={whoRef}>
          <ChoiceCards<WhoPreset>
            label="Who can open it"
            name="who"
            value={form.who}
            onChange={(who) => {
              set({ who, picked: {} });
            }}
            options={[
              {
                value: "everyone",
                icon: "group",
                title: "Everyone here can read and change files",
                line: `All ${PEOPLE.length} people who use this NAS.`,
                recommended: true,
              },
              {
                value: "readSome",
                icon: "person",
                title: "Everyone can read; some can change",
                line: "You choose who may change or delete files.",
              },
              {
                value: "chosen",
                icon: "give-access",
                title: "Only the people I choose",
                line: "Nobody else can open it.",
              },
            ]}
          />
        </div>
        {tips ? (
          <Help tips question="Which should I choose?">
            <WhoHelp />
          </Help>
        ) : null}
        {form.who === "everyone" ? null : (
          <div className="lf-picker lf-arrive">
            <p className="lf-picker-head">
              {form.who === "readSome"
                ? "Who may change files?"
                : "Who can open it?"}
              <span className="lf-picker-count">
                {withAccess.length} of {PEOPLE.length} people
              </span>
            </p>
            <AccessRows
              label="People and groups"
              rows={picker}
              flagged={Boolean(whoError)}
              onChange={(key, value) => {
                set({ picked: { ...form.picked, [key]: value } });
              }}
            />
            {whoError ? (
              <p className="lf-inline-error" key={attempt}>
                {whoError}
              </p>
            ) : null}
          </div>
        )}
      </FormSection>

      <FormSection
        n={4}
        question="How will computers reach it?"
        help={
          tips ? null : (
            <Help tips={false} question="What is the difference?">
              <HowHelp />
            </Help>
          )
        }
      >
        <div className="lf-toggles">
          <ToggleCard
            icon="smb"
            title="Windows and Mac"
            term="SMB"
            line="Opens in File Explorer and Finder."
            checked={form.smb}
            onChange={(smb) => {
              set({ smb });
            }}
          />
          <ToggleCard
            icon="nfs"
            title="Linux and media players"
            term="NFS"
            line="For Linux computers, Kodi and similar boxes."
            checked={form.nfs}
            onChange={(nfs) => {
              set({ nfs });
            }}
          />
        </div>
        {form.nfs ? (
          <div className="lf-nfs lf-arrive">
            <p className="lf-sub">Which computers?</p>
            <ChoiceCards<NfsReach>
              label="Which computers can open it over NFS"
              name="nfs-reach"
              value={form.nfsReach}
              onChange={(nfsReach) => {
                set({ nfsReach });
              }}
              options={[
                {
                  value: "one",
                  title: "One computer",
                  line: "The one at the address you type.",
                },
                {
                  value: "home",
                  title: "My home network",
                  line: `Computers on ${HOME_RANGE}.`,
                  recommended: true,
                },
                {
                  value: "any",
                  title: "Any computer",
                  line: "Anyone who can reach the NAS.",
                },
              ]}
            />
            {form.nfsReach === "one" ? (
              <Field
                invalid={Boolean(computerError)}
                className="lf-field"
                data-flagged={computerError ? attempt : undefined}
              >
                <FieldLabel>Its address</FieldLabel>
                <FieldControl
                  ref={computerRef}
                  className="lf-w-ip lf-mono"
                  inputMode="decimal"
                  placeholder="192.0.2.20"
                  value={form.nfsComputer}
                  onChange={(event) => {
                    set({ nfsComputer: event.target.value });
                  }}
                />
                {computerError ? (
                  <FieldError key={attempt}>{computerError}</FieldError>
                ) : null}
              </Field>
            ) : null}
          </div>
        ) : null}
        {tips ? (
          <Help tips question="What is the difference?">
            <HowHelp />
          </Help>
        ) : null}
        <MoreOptions
          what="network list, read only, recycle bin, guests"
          changed={changed.how}
          open={open.how}
          onOpenChange={(o) => {
            setOpen((s) => ({ ...s, how: o }));
          }}
        >
          <SettingRow
            label="Show it in the network list"
            hint="Computers see it when they browse the NAS. Off: it opens only by its address."
            checked={form.browseable}
            onChange={(browseable) => {
              set({ browseable });
            }}
          />
          <SettingRow
            label="Read only for everyone"
            hint="Nobody can change files through Windows and Mac sharing, whatever their access."
            checked={form.readOnly}
            onChange={(readOnly) => {
              set({ readOnly });
            }}
          />
          <SettingRow
            label="Recycle bin"
            hint="Files deleted from it go to a hidden folder first, so they can be brought back."
            checked={form.recycle}
            onChange={(recycle) => {
              set({ recycle });
            }}
          />
          <SettingRow
            label="Let in guests without a password"
            hint="Anyone on your network can open it. Use it only for files you would show any visitor."
            checked={form.guest}
            warn={
              form.guest
                ? "Anyone on your network can open it without a password."
                : undefined
            }
            onChange={(guest) => {
              set({ guest });
            }}
          />
        </MoreOptions>
      </FormSection>
    </div>
  );

  const picture = (
    <FolderPicture
      drive={drive ? { name: drive.name, free: gib(drive.freeGiB) } : null}
      name={name}
      smb={form.smb}
      nfs={form.nfs}
      people={withAccess}
      guest={form.smb && form.guest}
      live={live}
    />
  );

  const address = `\\\\${NAS_NAME}\\${name || "Photos"}`;
  const rail = (
    <>
      {picture}
      {phase === "edit" ? (
        <>
          {wide ? errorSummary : null}
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            What this does
          </h2>
          <ConsequenceList sentences={sentences} />
          {tips && tipShown ? (
            <Tip
              onDismiss={() => {
                setTipShown(false);
              }}
            >
              Press Ctrl Enter to create it from anywhere in the form.
            </Tip>
          ) : null}
          {wide ? (
            <ActionBar
              primary={primary}
              onPrimary={submit}
              onCancel={() => {
                onNote("Cancel would return to Shared folders.");
              }}
            />
          ) : null}
        </>
      ) : null}
      {phase === "run" ? (
        <div className="lf-runbox lf-fade">
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            Creating {name}
          </h2>
          <RunSteps steps={steps} stepMs={STEP_MS} />
          <p className="lf-quiet">
            You can leave this page; the work carries on.
          </p>
        </div>
      ) : null}
      {phase === "done" ? (
        <div className="lf-done">
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            <span className="lf-done-check" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m5 12.5 4.5 4.5L19 7.5" pathLength={1} />
              </svg>
            </span>
            {name} is ready
          </h2>
          <p className="lf-line">
            {form.smb
              ? "Open it from any computer at home:"
              : "It is on the NAS. Share it from its page when you want computers to reach it."}
          </p>
          {form.smb ? (
            <>
              <Address
                label="Windows"
                value={address}
                copyLabel={`Copy the Windows address of ${name}`}
              />
              <Address
                label="Mac"
                value={`smb://${NAS_NAME}/${name}`}
                copyLabel={`Copy the Mac address of ${name}`}
              />
            </>
          ) : null}
          {form.nfs ? (
            <Address
              label="Linux"
              value={`${NAS_NAME}:/export/${name}`}
              copyLabel={`Copy the Linux address of ${name}`}
            />
          ) : null}
          <div className="lf-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                onNote(`Open ${name} would go to the folder's page.`);
              }}
            >
              Open {name}
            </Button>
            <Button variant="ghost" size="lg" onClick={reset}>
              Add another shared folder
            </Button>
          </div>
        </div>
      ) : null}
      {phase === "failed" ? (
        <div className="lf-failed lf-fade">
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            {name} was not finished
          </h2>
          <RunSteps steps={steps} stepMs={STEP_MS} />
          <p className="lf-server">
            The Windows and Mac sharing service did not start: smbd exited with
            status 1.
          </p>
          <p className="lf-line">
            Already made: <strong className="lf-strong">{name}</strong> on{" "}
            {drive?.name}, and who can open it. Nothing else changed.
          </p>
          <div className="lf-actions">
            <Button variant="primary" size="lg" onClick={run}>
              Try again
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                setPhase("edit");
              }}
            >
              Back to the form
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  const first = sentences[0];
  const bar =
    phase === "edit" ? (
      <ActionBar
        primary={primary}
        onPrimary={submit}
        onCancel={() => {
          onNote("Cancel would return to Shared folders.");
        }}
        narrow={{
          first: first ? first.parts.join("") : "",
          onReview: () => {
            setReview(true);
          },
        }}
      />
    ) : null;

  return (
    <>
      <FormHeader
        icon="create-shared-folder"
        parent="Shared folders"
        title="Add a shared folder"
        line="A folder on the NAS that your computers can open."
      />
      <FormLayout
        layoutRef={layoutRef}
        wide={wide}
        busy={busy}
        questions={questions}
        rail={rail}
        bar={bar}
      />
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="lf-sheet">
          <DialogHeader>
            <DialogTitle>What this does</DialogTitle>
          </DialogHeader>
          {picture}
          <ConsequenceList sentences={sentences} />
          <ActionBar
            primary={primary}
            onPrimary={() => {
              setReview(false);
              submit();
            }}
            onCancel={() => {
              setReview(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function WhoHelp() {
  return (
    <>
      Most homes let everyone read and change Photos and Music. Choose who can
      change files when children or visitors should only look. You can change
      this later on the folder&apos;s page.
    </>
  );
}

function HowHelp() {
  return (
    <>
      Windows and Mac computers open shared folders over SMB; Linux computers
      can too. NFS is for Linux computers and media players that ask for it,
      such as Kodi. It has no passwords: it trusts the computer, not the person.
    </>
  );
}
