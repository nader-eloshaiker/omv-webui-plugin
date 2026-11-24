// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
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
 * The choices with the firewall's fourth (phase 5 network design 11.4): `range`, "A range of
 * addresses", with a first and a last address. Opt in with `ClientFieldValue<ClientChoiceOrRange>`
 * and the `range` prop; a field without them keeps the four choices above.
 */
type ClientChoiceOrRange = ClientChoice | "range";

/**
 * The field's value, held by the caller. `text` is what is typed for `one` or `network`, or the first
 * address of a `range`, exactly as typed; `last` is a range's last address. Both are kept when the
 * choice changes, and the caller decides what a choice without a field stores. Plain and
 * serialisable.
 */
interface ClientFieldValue<C extends ClientChoiceOrRange = ClientChoice> {
  choice: C | null;
  text: string;
  last?: string;
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

/** The words of "A range of addresses", with its two fields (`range`). */
interface ClientFieldRangeChoice extends ClientFieldChoice {
  /** "First address", "Last address". */
  firstLabel: React.ReactNode;
  lastLabel: React.ReactNode;
  /** Examples, never the labels: "192.0.2.10", "192.0.2.20". */
  firstPlaceholder?: string;
  lastPlaceholder?: string;
  /** Advice under both fields. */
  fieldHint?: React.ReactNode;
  /** The caller's check of each address: "Write one IPv4 address, …". */
  firstError?: React.ReactNode;
  lastError?: React.ReactNode;
  /** The caller's check of the pair, under both: "The first address must come before the last." */
  error?: React.ReactNode;
}

/**
 * Which addresses the field is for. `ipv4` and `ipv6` are the firewall's lists (design 11.4): the
 * caller's words and checks fit the family; the field asks the touch keyboard for digits and dots
 * under `ipv4`. `any` (the default) takes addresses of either family and names.
 */
type ClientFieldFamily = "any" | "ipv4" | "ipv6";

/**
 * A stored "every address except" (`!`) set in the classic interface (design 11.4): shown as text
 * above the choices and kept until the reader chooses Remove beside it.
 */
interface ClientFieldExcept {
  /** "Every address except". */
  label: React.ReactNode;
  /** "(set in the classic interface)". */
  description: React.ReactNode;
  /** "Remove": names the button. Give the full name when several sit on one form. */
  removeLabel: string;
  /** The reader removes it; the caller stops passing `except`. Focus moves to the choices. */
  onRemove: () => void;
}

interface ClientFieldProps<C extends ClientChoiceOrRange = ClientChoice> {
  /** The question, always visible: "Who may connect". Add a `FieldRequired` inside it when required. */
  legend: React.ReactNode;
  /** What the choice decides, under the legend. */
  hint?: React.ReactNode;
  value: ClientFieldValue<C>;
  /** Called with the whole new value: a choice made, or a character typed. */
  onValueChange: (value: ClientFieldValue<C>) => void;
  /** The text field was left: the moment to check it (style guide 5.3, on blur and on Save). */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /** "One computer", with its field. */
  one: ClientFieldTextChoice;
  /** "Computers on one network", with its field. */
  network: ClientFieldTextChoice;
  /**
   * "A range of addresses", with a first and a last field, after the network (the firewall, design
   * 11.4). Pass it only with a value typed `ClientFieldValue<ClientChoiceOrRange>`.
   */
  range?: ClientFieldRangeChoice;
  /** Which addresses the field is for; `any` unless given. */
  family?: ClientFieldFamily;
  /** A stored negation set in the classic interface, shown above the choices until removed. */
  except?: ClientFieldExcept;
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
  family: ClientFieldFamily;
  onTextChange: (text: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  unavailable: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** IPv4 is digits and dots: ask a touch keyboard for them. IPv6 and names need letters. */
function inputModeOf(family: ClientFieldFamily) {
  return family === "ipv4" ? ("decimal" as const) : undefined;
}

/** The text field under `one` or `network`, on Base UI's Field. */
function ChoiceTextField({
  choice,
  text,
  family,
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
        inputMode={inputModeOf(family)}
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

interface RangeFieldsProps {
  choice: ClientFieldRangeChoice;
  first: string;
  last: string;
  family: ClientFieldFamily;
  onChange: (first: string, last: string) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  unavailable: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

/** The first and last address under `range`: side by side where they fit, stacked at 320px. */
function RangeFields({
  choice,
  first,
  last,
  family,
  onChange,
  onBlur,
  unavailable,
  describedBy,
  inputRef,
}: RangeFieldsProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const pairDescribedBy =
    [
      describedBy ?? null,
      choice.fieldHint ? hintId : null,
      choice.error ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const one = (
    which: "first" | "last",
    label: React.ReactNode,
    value: string,
    placeholder: string | undefined,
    error: React.ReactNode,
  ) => (
    <Field
      invalid={error || choice.error ? true : undefined}
      className="w-full max-w-60 min-w-0"
    >
      <FieldLabel
        className={cn(
          "text-sm",
          unavailable && "cursor-not-allowed text-muted-foreground",
        )}
      >
        {label}
      </FieldLabel>
      <FieldControl
        ref={which === "first" ? inputRef : undefined}
        data-range={which}
        value={value}
        onValueChange={(next) =>
          which === "first" ? onChange(next, last) : onChange(first, next)
        }
        onBlur={onBlur}
        placeholder={placeholder}
        dir="ltr"
        inputMode={inputModeOf(family)}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        readOnly={unavailable}
        {...(unavailable ? { "aria-disabled": true } : null)}
        aria-describedby={pairDescribedBy}
        className={cn(
          "font-mono",
          unavailable && "cursor-not-allowed bg-muted text-subtle-foreground",
        )}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
  return (
    <div data-slot="client-field-range" className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {one(
          "first",
          choice.firstLabel,
          first,
          choice.firstPlaceholder,
          choice.firstError,
        )}
        {one(
          "last",
          choice.lastLabel,
          last,
          choice.lastPlaceholder,
          choice.lastError,
        )}
      </div>
      {choice.fieldHint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {choice.fieldHint}
        </p>
      ) : null}
      {choice.error ? (
        <p
          id={errorId}
          data-slot="client-field-range-error"
          className="flex items-start gap-1.5 text-sm text-critical-label"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
          />
          <span>{choice.error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Who may connect to an NFS share or an rsync server folder (phase 5 services design 0.4), as a
 * radio group: "One computer" and "Computers on one network", each with its text field under it
 * while chosen, then, after a 16px gap, "Any computer that can reach the NAS". The rsync server's
 * form adds a first choice and may leave out "Any computer". A value set in the classic interface
 * that is none of these is shown as stored, with no choice selected, until one is chosen.
 *
 * The firewall's rule form (phase 5 network design 11.4) adds "A range of addresses" with a first and
 * a last field (`range`), limits it to one family (`family`), and shows a stored "every address
 * except" set in the classic interface (`except`) until the reader removes it.
 *
 * Controlled and wordless: every label, hint and placeholder is a prop, and every check is the
 * caller's (pass each choice's `error`, the group's `error` and the `warning`). Errors and the
 * warning are part of the accessible description. The fields always sit under their radio, so the
 * layout holds at 320px and 200% zoom.
 */
function ClientField<C extends ClientChoiceOrRange = ClientChoice>({
  legend,
  hint,
  value,
  onValueChange,
  onBlur,
  one,
  network,
  range,
  family = "any",
  except,
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
}: ClientFieldProps<C>) {
  const id = React.useId();
  const storedId = `${id}-stored`;
  const exceptId = `${id}-except`;
  const warningId = `${id}-warning`;
  const showStored = value.choice === null && stored !== undefined;
  const groupDescribedBy =
    [
      except ? exceptId : null,
      showStored ? storedId : null,
      warning ? warningId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  // Only the choices this field offers; `last` is passed on only when the caller holds one.
  const offered = (next: string): next is C =>
    next === "one" ||
    next === "network" ||
    (next === "range" && range !== undefined) ||
    (next === "any" && any !== undefined) ||
    (next === "anyWithPassword" && anyWithPassword !== undefined);
  const withText = (choice: C | null, text: string, last?: string) =>
    last === undefined ? { choice, text } : { choice, text, last };
  const setChoice = (next: string) => {
    if (offered(next)) {
      onValueChange(withText(next, value.text, value.last));
    }
  };
  const setText = (text: string) => {
    onValueChange(withText(value.choice, text, value.last));
  };
  const setRange = (text: string, last: string) => {
    onValueChange({ choice: value.choice, text, last });
  };

  // Remove takes its own button away: focus moves to the choices instead of falling to the page.
  const groupRef = React.useRef<HTMLDivElement>(null);
  const removedRef = React.useRef(false);
  React.useEffect(() => {
    if (except !== undefined || !removedRef.current) {
      return;
    }
    removedRef.current = false;
    const radios =
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]');
    const checked = Array.from(radios ?? []).find(
      (radio) => radio.getAttribute("aria-checked") === "true",
    );
    (checked ?? radios?.[0])?.focus();
  }, [except]);

  // One region per option, always in the page (empty and hidden unless its option is chosen), so a
  // warning that appears under the chosen option is announced. The alert itself is a note, not a
  // second live region. `-mt-1` brings it to 8px under its option.
  const warningRegion = (forChoice: ClientChoiceOrRange) => (
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
            family={family}
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
    <div
      ref={groupRef}
      data-slot="client-field"
      className={cn("max-w-xl", className)}
    >
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
      >
        {except ? (
          <div
            id={exceptId}
            data-slot="client-field-except"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border bg-muted px-3 py-2"
          >
            <p className="min-w-0 text-base text-foreground">
              {except.label}{" "}
              <span className="text-sm text-muted-foreground">
                {except.description}
              </span>
            </p>
            <Button
              variant="neutral"
              size="sm"
              disabled={disabled}
              focusableWhenDisabled
              onClick={() => {
                removedRef.current = true;
                except.onRemove();
              }}
            >
              {except.removeLabel}
            </Button>
          </div>
        ) : null}
        {showStored ? (
          <div
            id={storedId}
            data-slot="client-field-stored"
            className="flex flex-col gap-0.5 rounded-control border border-border bg-muted px-3 py-2"
          >
            <Identifier dir="ltr" className="text-base text-foreground">
              {stored.value}
            </Identifier>
            <p className="text-sm text-muted-foreground">
              {stored.description}
            </p>
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
        {range ? (
          <>
            <RadioOption value="range" label={range.label} hint={range.hint}>
              {value.choice === "range" ? (
                <RangeFields
                  choice={range}
                  first={value.text}
                  last={value.last ?? ""}
                  family={family}
                  onChange={setRange}
                  onBlur={onBlur}
                  unavailable={disabled}
                  describedBy={warning ? warningId : undefined}
                  inputRef={inputRef}
                />
              ) : null}
            </RadioOption>
            {warningRegion("range")}
          </>
        ) : null}
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
    </div>
  );
}

export { ClientField };
export type {
  ClientChoice,
  ClientChoiceOrRange,
  ClientFieldChoice,
  ClientFieldExcept,
  ClientFieldFamily,
  ClientFieldProps,
  ClientFieldRangeChoice,
  ClientFieldTextChoice,
  ClientFieldValue,
};
