// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: Add a person, redesigned (rethink spec 3.11, 8 row 3). Development only (UI-11). The
// four questions, group chips that say what each opens, role cards, the password's strength and a
// suggestion made in the browser, the person-access picture fanning out from a group, and the
// HTTP notice inline under the password (UI-12). Pressing Add runs a simulated job: the lab never
// writes (UI-4), and the password never leaves this component's memory.
import {
  Button,
  CopyButton,
  ExternalLink,
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  IconButton,
} from "@omv-webui/react-ui-components";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { useId, useRef, useState } from "react";
import type { AccessRow } from "./AccessRows.tsx";
import { AccessRows } from "./AccessRows.tsx";
import { FormIcon } from "./FormIcon.tsx";
import { PersonPicture } from "./LineageStrip.tsx";
import type { PersonField, PersonForm, Role } from "./model.ts";
import {
  GROUPS,
  initialPerson,
  levelWords,
  listWords,
  personAccess,
  personNameProblem,
  personProblems,
  personSentences,
  strength,
  suggestPassword,
} from "./model.ts";
import type { RunStep, StepState } from "./parts.tsx";
import {
  ActionBar,
  ChoiceCards,
  ConsequenceList,
  ErrorSummary,
  FormHeader,
  FormLayout,
  FormSection,
  MoreOptions,
  ReviewSheet,
  RunSteps,
  SettingRow,
} from "./parts.tsx";
import type { PersonState } from "./states.ts";
import { useFocusOnPhase, useWide } from "./states.ts";

type Phase = "edit" | "run" | "done";

const STEP_MS = 900;
// A fixed example for the lab's states only; a real form never pre-fills a password (UI-6).
const EXAMPLE_PASSWORD = "lantern-otter-cobalt-97";

const ICON_FOR = {
  made: "add-person",
  people: "shared-folder",
  smb: "smb",
  nfs: "nfs",
  nas: "info",
  warning: "administrator",
  effect: "takes-effect",
} as const;

function seed(state: PersonState): PersonForm {
  const form = initialPerson();
  if (state === "empty" || state === "errors") {
    return form;
  }
  const named: PersonForm = {
    ...form,
    name: "alex",
    who: "Alex at home",
    password: EXAMPLE_PASSWORD,
    again: EXAMPLE_PASSWORD,
    groups: ["family"],
  };
  switch (state) {
    case "groups":
      return { ...named, groups: ["family", "kids"], own: { Documents: "ro" } };
    case "weak":
      return { ...named, password: "sunshine", again: "sunshine" };
    case "suggested":
      return {
        ...named,
        password: suggestPassword(),
        again: "",
        revealed: true,
        suggested: true,
      };
    case "admin":
      return { ...named, role: "admin", ssh: true };
    default:
      return named;
  }
}

function stepsFor(form: PersonForm): RunStep[] {
  const name = form.name.trim();
  const steps: { id: string; label: string }[] = [
    { id: "add", label: `Add ${name}` },
  ];
  if (form.groups.length > 0) {
    steps.push({
      id: "groups",
      label: `Put ${name} in ${listWords(form.groups)}`,
    });
  }
  const own = Object.entries(form.own).filter(([, a]) => a !== "none");
  if (own.length > 0) {
    steps.push({
      id: "access",
      label: `Give access to ${listWords(own.map(([f]) => f))}`,
    });
  }
  steps.push({ id: "apply", label: "Apply the changes" });
  return steps.map((s) => ({ ...s, state: "waiting" as StepState }));
}

function progress(steps: RunStep[], done: number): RunStep[] {
  return steps.map((s, i) => ({
    ...s,
    state: i < done ? "done" : i === done ? "running" : "waiting",
  }));
}

export function AddPerson({
  state,
  https,
  onNote,
}: {
  state: PersonState;
  https: boolean;
  onNote: (text: string) => void;
}) {
  const [form, setForm] = useState<PersonForm>(() => seed(state));
  const [attempt, setAttempt] = useState(state === "errors" ? 1 : 0);
  const [open, setOpen] = useState({
    who: false,
    powers: state === "admin",
  });
  const [review, setReview] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    state === "run" ? "run" : state === "done" ? "done" : "edit",
  );
  const [steps, setSteps] = useState<RunStep[]>(() => {
    const all = stepsFor(seed(state));
    if (state === "run") {
      return progress(all, 1);
    }
    return state === "done" ? progress(all, all.length) : all;
  });
  const layoutRef = useRef<HTMLDivElement>(null);
  const wide = useWide(layoutRef);
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const againRef = useRef<HTMLInputElement>(null);
  const railHeadingId = useId();
  useFocusOnPhase(phase, railHeadingId);

  const set = (patch: Partial<PersonForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  const problems = attempt > 0 ? personProblems(form) : [];
  const errorOf = (field: PersonField) =>
    problems.find((p) => p.field === field)?.text;
  const liveNameProblem = form.name ? personNameProblem(form.name) : null;
  const nameError = errorOf("name") ?? liveNameProblem ?? undefined;
  const name = form.name.trim();
  const busy = phase !== "edit";
  const access = personAccess(form);
  const sentences = personSentences(form);
  const primary = name ? `Add ${name}` : "Add person";

  const run = () => {
    const all = stepsFor(form);
    // The password leaves the form's memory as the job starts (UI-6).
    setForm((f) => ({ ...f, password: "", again: "" }));
    setPhase("run");
    setSteps(progress(all, 0));
    let done = 0;
    const tick = () => {
      done += 1;
      setSteps(progress(all, done));
      if (done >= all.length) {
        setPhase("done");
        return;
      }
      window.setTimeout(tick, STEP_MS);
    };
    window.setTimeout(tick, STEP_MS);
  };

  const submit = () => {
    if (busy) {
      return;
    }
    if (personProblems(form).length > 0) {
      setAttempt((a) => a + 1);
      return;
    }
    run();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  const errorSummary = (
    <ErrorSummary
      problems={problems}
      attempt={attempt}
      onGo={(field) => {
        const target =
          field === "name"
            ? nameRef
            : field === "password"
              ? passwordRef
              : againRef;
        target.current?.focus();
      }}
    />
  );

  const rows: AccessRow[] = access.map((a) => {
    const givers = GROUPS.filter((g) =>
      g.opens.some((o) => o.folder === a.folder),
    ).map((g) => g.name);
    return {
      key: a.folder,
      kind: "folder",
      name: a.folder,
      line:
        a.through !== null
          ? `${levelWords(a.access)[0]?.toUpperCase() ?? ""}${levelWords(a.access).slice(1)} through ${a.through}`
          : form.own[a.folder] !== undefined
            ? `Set for ${name || "them"} alone`
            : givers.length > 0
              ? `The ${listWords(givers)} ${givers.length === 1 ? "group opens" : "groups open"} it`
              : "No group opens it",
      value: a.access,
    };
  });

  const questions = (
    <div className="lf-form" inert={busy || undefined} onKeyDown={onKeyDown}>
      <a className="lf-skip" href={`#${railHeadingId}`}>
        Skip to summary
      </a>
      {wide ? null : errorSummary}
      <FormSection question="Who is it?">
        <Field
          invalid={Boolean(nameError)}
          className="lf-field"
          data-flagged={nameError ? attempt : undefined}
        >
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            ref={nameRef}
            width="name"
            className="lf-mono"
            autoFocus={state === "empty"}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="For example: alex"
            value={form.name}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
          {nameError ? (
            <FieldError key={attempt}>{nameError}</FieldError>
          ) : (
            <FieldHint>
              They sign in with this name. It cannot be changed later.
            </FieldHint>
          )}
        </Field>
        <Field>
          <FieldLabel>Who they are</FieldLabel>
          <FieldControl
            width="full"
            placeholder="For example: Alex at home"
            value={form.who}
            onChange={(event) => {
              set({ who: event.target.value });
            }}
          />
          <FieldHint>Lists show it, to tell people apart.</FieldHint>
        </Field>
        <MoreOptions
          what="email address"
          changed={form.email.trim() ? 1 : 0}
          open={open.who}
          onOpenChange={(o) => {
            setOpen((s) => ({ ...s, who: o }));
          }}
        >
          <Field>
            <FieldLabel>Email address</FieldLabel>
            <FieldControl
              type="email"
              width="wide"
              autoComplete="off"
              value={form.email}
              onChange={(event) => {
                set({ email: event.target.value });
              }}
            />
            <FieldHint>Scheduled jobs send their messages to it.</FieldHint>
          </Field>
        </MoreOptions>
      </FormSection>

      <FormSection question="How will they sign in?">
        <PasswordPart
          form={form}
          set={set}
          https={https}
          attempt={attempt}
          passwordError={errorOf("password")}
          againError={errorOf("again")}
          passwordRef={passwordRef}
          againRef={againRef}
        />
      </FormSection>

      <FormSection question="What can they open?">
        <fieldset className="lf-chips">
          <legend className="lf-sub">Groups</legend>
          {GROUPS.map((group) => {
            const on = form.groups.includes(group.name);
            return (
              <label
                key={group.name}
                className="lf-chip"
                data-checked={on || undefined}
              >
                <input
                  type="checkbox"
                  className="lf-card-input"
                  checked={on}
                  onChange={(event) => {
                    set({
                      groups: event.target.checked
                        ? [...form.groups, group.name]
                        : form.groups.filter((g) => g !== group.name),
                    });
                  }}
                />
                <span className="lf-chip-box" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="m3.5 8.5 3 3 6-7" pathLength={1} />
                  </svg>
                </span>
                <span className="lf-chip-name">{group.name}</span>
                <span className="lf-chip-line">
                  It opens {listWords(group.opens.map((o) => o.folder))}.
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="lf-sub">Shared folders</p>
        <AccessRows
          label="Shared folders"
          rows={rows}
          onChange={(folder, value) => {
            set({ own: { ...form.own, [folder]: value } });
          }}
        />
      </FormSection>

      <FormSection question="What may they change?">
        <ChoiceCards<Role>
          label="What they may change"
          name="role"
          value={form.role}
          onChange={(role) => {
            set({ role });
          }}
          options={[
            {
              value: "user",
              title: "Uses shared folders",
              line: "They open the shared folders they are given and can change their own password.",
              recommended: true,
            },
            {
              value: "admin",
              title: "Administrator of this NAS",
              line: "They can change every setting, and read and delete every file.",
            },
          ]}
        />
        <MoreOptions
          what="command line"
          changed={form.ssh ? 1 : 0}
          open={open.powers}
          onOpenChange={(o) => {
            setOpen((s) => ({ ...s, powers: o }));
          }}
        >
          <SettingRow
            label="May sign in over SSH"
            hint={`Lets ${name || "this person"} sign in to the NAS's command line from another computer, and copy files with SFTP. Most people never need it.`}
            checked={form.ssh}
            onChange={(ssh) => {
              set({ ssh });
            }}
          />
        </MoreOptions>
      </FormSection>
    </div>
  );

  const picture = (
    <PersonPicture
      name={name}
      admin={form.role === "admin"}
      groups={GROUPS.map((g) => ({
        name: g.name,
        on: form.groups.includes(g.name),
        opens: g.opens.map((o) => o.folder),
      }))}
      folders={access.map((a) => ({
        name: a.folder,
        access: a.access,
        through: a.through,
      }))}
    />
  );

  const rail = (
    <>
      {picture}
      {phase === "edit" ? (
        <>
          {wide ? errorSummary : null}
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            What this does
          </h2>
          <ConsequenceList sentences={sentences} iconFor={ICON_FOR} />
          {wide ? (
            <ActionBar
              primary={primary}
              onPrimary={submit}
              onCancel={() => {
                onNote("Cancel would return to People.");
              }}
            />
          ) : null}
        </>
      ) : null}
      {phase === "run" ? (
        <div className="lf-runbox lf-fade">
          <h2 id={railHeadingId} tabIndex={-1} className="lf-rail-title">
            Adding {name}
          </h2>
          <RunSteps steps={steps} stepMs={STEP_MS} />
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
            {name} can sign in now
          </h2>
          <p className="lf-line">
            They sign in as <strong className="lf-strong">{name}</strong>, here
            and from their computers, with the password you gave them.
          </p>
          <div className="lf-actions">
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                onNote(`Open ${name}'s page would go to their page.`);
              }}
            >
              Open {name}&apos;s page
            </Button>
            <Button
              variant="neutral"
              size="lg"
              onClick={() => {
                setForm(initialPerson());
                setAttempt(0);
                setPhase("edit");
                window.setTimeout(() => nameRef.current?.focus(), 0);
              }}
            >
              Add another person
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  const first = sentences[0];
  return (
    <>
      <FormHeader
        parent="People"
        title="Add a person"
        line="Each person signs in with their own password and opens the shared folders you give them."
      />
      <FormLayout
        layoutRef={layoutRef}
        wide={wide}
        busy={busy}
        questions={questions}
        rail={rail}
        bar={
          phase === "edit" ? (
            <ActionBar
              primary={primary}
              onPrimary={submit}
              onCancel={() => {
                onNote("Cancel would return to People.");
              }}
              narrow={{
                first: first ? first.parts.join("") : "",
                onReview: () => {
                  setReview(true);
                },
              }}
            />
          ) : null
        }
      />
      <ReviewSheet
        open={review}
        onOpenChange={setReview}
        picture={picture}
        sentences={sentences}
        iconFor={ICON_FOR}
        primary={primary}
        onPrimary={submit}
      />
    </>
  );
}

function PasswordPart({
  form,
  set,
  https,
  attempt,
  passwordError,
  againError,
  passwordRef,
  againRef,
}: {
  form: PersonForm;
  set: (patch: Partial<PersonForm>) => void;
  https: boolean;
  attempt: number;
  passwordError?: string;
  againError?: string;
  passwordRef: RefObject<HTMLInputElement | null>;
  againRef: RefObject<HTMLInputElement | null>;
}) {
  const measured = strength(form.password);
  const noticeId = useId();
  return (
    <>
      <Field
        invalid={Boolean(passwordError)}
        className="lf-field"
        data-flagged={passwordError ? attempt : undefined}
      >
        <FieldLabel>Password</FieldLabel>
        <div className="lf-password">
          <FieldControl
            ref={passwordRef}
            key={form.suggested ? form.password : "typed"}
            type={form.revealed ? "text" : "password"}
            width="name"
            className="lf-mono lf-password-input"
            autoComplete="new-password"
            spellCheck={false}
            aria-describedby={https ? undefined : noticeId}
            value={form.password}
            onChange={(event) => {
              set({ password: event.target.value, suggested: false });
            }}
          />
          <IconButton
            className="lf-password-reveal"
            label={form.revealed ? "Hide the password" : "Show the password"}
            icon={<FormIcon name={form.revealed ? "conceal" : "reveal"} />}
            onClick={() => {
              set({ revealed: !form.revealed });
            }}
          />
        </div>
        <div className="lf-strength" data-word={measured.word}>
          <span className="lf-strength-track" aria-hidden="true">
            <span
              className="lf-strength-fill"
              style={{ "--v": measured.fraction } as CSSProperties}
            />
          </span>
          <span className="lf-strength-words" aria-live="polite">
            {form.password ? (
              <span key={measured.word} className="lf-strength-word">
                {measured.word}: {measured.length}{" "}
                {measured.length === 1 ? "character" : "characters"}
              </span>
            ) : (
              <span className="lf-secondary">
                Choose a long password they use nowhere else.
              </span>
            )}
          </span>
        </div>
        {passwordError ? (
          <FieldError key={attempt}>{passwordError}</FieldError>
        ) : null}
        {https ? null : (
          <p id={noticeId} className="lf-http">
            <FormIcon name="warning" />
            <span>
              This connection is not encrypted, so this password can be read by
              others on your network.{" "}
              <ExternalLink
                href="/#/system/workbench/settings"
                newTabLabel="(opens in a new tab)"
              >
                Turn on HTTPS
              </ExternalLink>
            </span>
          </p>
        )}
      </Field>
      <div className="lf-suggest-row">
        <Button
          variant="neutral"
          onClick={() => {
            set({
              password: suggestPassword(),
              again: "",
              revealed: true,
              suggested: true,
            });
          }}
        >
          <FormIcon name="suggest" />
          Suggest a strong password
        </Button>
        {form.suggested ? (
          <span className="lf-suggested">
            <CopyButton
              text={form.password}
              label="Copy the password"
              copiedLabel="Copied"
              selectedLabel="Selected. Press Ctrl+C to copy."
              size="sm"
            >
              Copy
            </CopyButton>
            <span className="lf-secondary">
              It is shown only once. Give it to them, or copy it now.
            </span>
          </span>
        ) : null}
      </div>
      {form.revealed || form.suggested ? null : (
        <Field
          invalid={Boolean(againError)}
          className="lf-field"
          data-flagged={againError ? attempt : undefined}
        >
          <FieldLabel>Type it again</FieldLabel>
          <FieldControl
            ref={againRef}
            type="password"
            width="name"
            className="lf-mono"
            autoComplete="new-password"
            value={form.again}
            onChange={(event) => {
              set({ again: event.target.value });
            }}
          />
          {againError ? (
            <FieldError key={attempt}>{againError}</FieldError>
          ) : (
            <FieldHint>This catches a typing slip.</FieldHint>
          )}
        </Field>
      )}
    </>
  );
}
