// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "../field/field";
import { InlineAlert } from "../inline-alert/inline-alert";
import {
  RadioGroupField,
  RadioOption,
} from "../radio-group-field/radio-group-field";
import { Identifier } from "../text/identifier";

/**
 * Who may connect (phase 5 services design 0.4). `one` and `network` take the field's text; `any`
 * is "any computer that can reach the NAS"; `anyWithPassword` is the rsync server's "any computer
 * with the name and password", stored empty. `null` while none is chosen: a new form with no
 * default, or a value set in the classic interface that is none of these (see `stored`).
 */
type ClientChoice = "one" | "network" | "any" | "anyWithPassword";

/**
 * The field's value, held by the caller. `text` is what is typed for `one` or `network`, exactly as
 * typed; it is kept when the choice changes, and the caller decides what a choice without a field
 * stores. Plain and serialisable.
 */
interface ClientFieldValue {
  choice: ClientChoice | null;
  text: string;
}

/** The words of a choice without a field of its own. */
interface ClientFieldChoice {
  /** The choice, as a statement: "Any computer that can reach the NAS". */
  label: React.ReactNode;
  /** What it means, under the label: "Any computer on your network, and any that reaches it…" */
  hint?: React.ReactNode;
}

/** The words of a choice with a text field under it (`one`, `network`). */
interface ClientFieldTextChoice extends ClientFieldChoice {
  /** The field's visible label: "Its address or name", "Network". */
  fieldLabel: React.ReactNode;
  /** An example, never the label: "192.0.2.10", "192.0.2.0/24". */
  placeholder?: string;
  /** Advice under the field: "Write the network's first address, a slash and its size, …" */
  fieldHint?: React.ReactNode;
  /**
   * The caller's check of the text, for this choice: "Write one address, such as 192.0.2.10, or one
   * computer name." Marks the field invalid; shown only while this choice is chosen. The library
   * holds no rule about addresses.
   */
  error?: React.ReactNode;
}

interface ClientFieldProps {
  /** The question, always visible: "Who may connect". Add a `FieldRequired` inside it when required. */
  legend: React.ReactNode;
  /** What the choice decides, under the legend. */
  hint?: React.ReactNode;
  value: ClientFieldValue;
  /** Called with the whole new value: a choice made, or a character typed. */
  onValueChange: (value: ClientFieldValue) => void;
  /** The text field was left: the moment to check it (style guide 5.3, on blur and on Save). */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /** "One computer", with its field. */
  one: ClientFieldTextChoice;
  /** "Computers on one network", with its field. */
  network: ClientFieldTextChoice;
  /**
   * "Any computer that can reach the NAS", drawn after a 16px gap as its own choice. Leave it out
   * where it must not be offered (an rsync server folder that asks for no password, design 0.10).
   */
  any?: ClientFieldChoice;
  /**
   * "Any computer with the name and password": the rsync server's extra first choice, where a name
   * and password are asked and who may connect is optional (design 0.4).
   */
  anyWithPassword?: ClientFieldChoice;
  /**
   * A value set in the classic interface that is none of the choices (`*.example.org`, a netgroup,
   * several entries). Shown while `value.choice` is `null`: the stored text in the `Identifier` style
   * with the caller's sentence ("Set in the classic interface. It is kept until you choose one of
   * these."), as the group's description. No choice is selected meanwhile.
   */
  stored?: { value: string; description: React.ReactNode };
  /**
   * A risk the current value carries, in the warning-shape neutral alert under the chosen choice:
   * a wide network ("This network holds 65,536 addresses. …"), or any computer. It is part of the
   * group's and the text field's description, and announced politely when it appears. The caller
   * decides when it applies.
   */
  warning?: React.ReactNode;
  /** A refusal of the group as a whole: "Choose who may connect." */
  error?: React.ReactNode;
  /**
   * Unavailable: every option and the text field stay focusable and say so (`aria-disabled`), with
   * `disabledReason` as the description. Nothing can be changed.
   */
  disabled?: boolean;
  /** Why it is unavailable, shown under the legend: "Turn on the rsync server first." */
  disabledReason?: React.ReactNode;
  /** The radio group's form name, if any. */
  name?: string;
  /** The text field, to move focus to it after a refused save. */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

interface ChoiceTextFieldProps {
  choice: ClientFieldTextChoice;
  text: string;
  onTextChange: (text: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  unavailable: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** The text field under `one` or `network`, on Base UI's Field. */
function ChoiceTextField({
  choice,
  text,
  onTextChange,
  onBlur,
  unavailable,
  describedBy,
  inputRef,
}: ChoiceTextFieldProps) {
  return (
    <Field invalid={choice.error ? true : undefined} className="max-w-sm">
      <FieldLabel
        className={cn(
          "text-sm",
          unavailable && "cursor-not-allowed text-muted-foreground",
        )}
      >
        {choice.fieldLabel}
      </FieldLabel>
      <FieldControl
        ref={inputRef}
        value={text}
        onValueChange={(next) => onTextChange(next)}
        onBlur={onBlur}
        placeholder={choice.placeholder}
        // Addresses and names are written left to right in every language.
        dir="ltr"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        readOnly={unavailable}
        {...(unavailable ? { "aria-disabled": true } : null)}
        aria-describedby={describedBy}
        className={cn(
          "font-mono",
          unavailable && "cursor-not-allowed bg-muted text-subtle-foreground",
        )}
      />
      {choice.fieldHint ? <FieldHint>{choice.fieldHint}</FieldHint> : null}
      {choice.error ? <FieldError>{choice.error}</FieldError> : null}
    </Field>
  );
}

/**
 * Who may connect to an NFS share or an rsync server folder (phase 5 services design 0.4), as a
 * radio group: "One computer" and "Computers on one network", each with its text field under it
 * while chosen, then, after a 16px gap, "Any computer that can reach the NAS". The rsync server's
 * form adds a first choice and may leave out "Any computer". A value set in the classic interface
 * that is none of these is shown as stored, with no choice selected, until one is chosen.
 *
 * Controlled and wordless: every label, hint and placeholder is a prop, and every check is the
 * caller's (pass each choice's `error`, the group's `error` and the `warning`). Errors and the
 * warning are part of the accessible description. The fields always sit under their radio, so the
 * layout holds at 320px and 200% zoom.
 */
function ClientField({
  legend,
  hint,
  value,
  onValueChange,
  onBlur,
  one,
  network,
  any,
  anyWithPassword,
  stored,
  warning,
  error,
  disabled = false,
  disabledReason,
  name,
  inputRef,
  className,
}: ClientFieldProps) {
  const id = React.useId();
  const storedId = `${id}-stored`;
  const warningId = `${id}-warning`;
  const showStored = value.choice === null && stored !== undefined;
  const groupDescribedBy =
    [showStored ? storedId : null, warning ? warningId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const setChoice = (next: string) => {
    if (
      next === "one" ||
      next === "network" ||
      next === "any" ||
      next === "anyWithPassword"
    ) {
      onValueChange({ choice: next, text: value.text });
    }
  };
  const setText = (text: string) => {
    onValueChange({ choice: value.choice, text });
  };

  // One region per option, always in the page (empty and hidden unless its option is chosen), so a
  // warning that appears under the chosen option is announced. The alert itself is a note, not a
  // second live region. `-mt-1` brings it to 8px under its option.
  const warningRegion = (forChoice: ClientChoice) => (
    <div
      aria-live="polite"
      data-slot="client-field-warning-region"
      className="-mt-1 ps-6 empty:hidden"
    >
      {warning && value.choice === forChoice ? (
        <InlineAlert
          id={warningId}
          data-slot="client-field-warning"
          tone="neutral"
          icon="warning"
          role="note"
        >
          {warning}
        </InlineAlert>
      ) : null}
    </div>
  );

  const textOption = (
    choiceValue: "one" | "network",
    choice: ClientFieldTextChoice,
  ) => (
    <>
      <RadioOption value={choiceValue} label={choice.label} hint={choice.hint}>
        {value.choice === choiceValue ? (
          <ChoiceTextField
            choice={choice}
            text={value.text}
            onTextChange={setText}
            onBlur={onBlur}
            unavailable={disabled}
            describedBy={warning ? warningId : undefined}
            inputRef={inputRef}
          />
        ) : null}
      </RadioOption>
      {warningRegion(choiceValue)}
    </>
  );

  return (
    <RadioGroupField
      legend={legend}
      hint={hint}
      error={error}
      value={value.choice ?? ""}
      onValueChange={setChoice}
      disabled={disabled}
      focusableWhenDisabled
      disabledReason={disabledReason}
      aria-describedby={groupDescribedBy}
      name={name}
      className={cn("max-w-xl", className)}
    >
      {showStored ? (
        <div
          id={storedId}
          data-slot="client-field-stored"
          className="flex flex-col gap-0.5 rounded-control border border-border bg-muted px-3 py-2"
        >
          <Identifier dir="ltr" className="text-base text-foreground">
            {stored.value}
          </Identifier>
          <p className="text-sm text-muted-foreground">{stored.description}</p>
        </div>
      ) : null}
      {anyWithPassword ? (
        <>
          <RadioOption
            value="anyWithPassword"
            label={anyWithPassword.label}
            hint={anyWithPassword.hint}
          />
          {warningRegion("anyWithPassword")}
        </>
      ) : null}
      {textOption("one", one)}
      {textOption("network", network)}
      {any ? (
        <>
          {/* Its own choice, a step further off (16px) than the others (design 0.4, Q6). */}
          <RadioOption
            value="any"
            label={any.label}
            hint={any.hint}
            className="mt-1"
          />
          {warningRegion("any")}
        </>
      ) : null}
    </RadioGroupField>
  );
}

export { ClientField };
export type {
  ClientChoice,
  ClientFieldChoice,
  ClientFieldProps,
  ClientFieldTextChoice,
  ClientFieldValue,
};
