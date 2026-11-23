// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { Field, FieldError, FieldHint, FieldLabel } from "../field/field";
import {
  RadioGroupField,
  RadioOption,
} from "../radio-group-field/radio-group-field";
import { MaskedInput } from "./masked-input";

interface StoredSecret {
  /** Says a secret is stored without showing it: "Set". */
  setLabel: React.ReactNode;
  /** Opens an empty input for a new one; name the secret: "Change password". */
  changeLabel: string;
  /** Closes it again and keeps the stored secret: "Keep the current password". */
  keepLabel: string;
}

/** The reader's answer to a stored secret this page cannot give back (`storedChoice`). */
type StoredSecretAnswer = "keep" | "remove";

/**
 * A stored secret that a save must send again or drop (phase 5 network design 12.3, 0.6): the write
 * replaces the whole object and the page never holds the stored value, so the reader must either type
 * it again or remove it. A required choice; no answer is preselected.
 */
interface StoredSecretChoice {
  /** Says a secret is stored, under the label: "Password: Set". */
  setLabel?: React.ReactNode;
  /** "Keep it: type it again". Choosing it shows the secret input under it. */
  keepLabel: React.ReactNode;
  /** "Remove the stored password". */
  removeLabel: React.ReactNode;
  /** The reader's answer, held by the caller; `null` until one is chosen. */
  choice: StoredSecretAnswer | null;
  onChoiceChange: (choice: StoredSecretAnswer) => void;
  /** The refusal of an unanswered choice: "Type the stored password again, or remove it." */
  error?: React.ReactNode;
  /** The secret input's own label under Keep it, read with the field's label: "Password". */
  inputLabel: React.ReactNode;
}

type SecretFieldProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "type" | "children"
> & {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** The message for a refused value; marks the field invalid. */
  error?: React.ReactNode;
  /** The accessible name of the reveal toggle: "Show password". It is a toggle (`aria-pressed`). */
  revealLabel: string;
  /**
   * A secret is already stored. The field then shows `setLabel` and a change control instead of an
   * input: the stored value is never sent to the page, so there is nothing to pre-fill (5.3).
   */
  stored?: StoredSecret;
  /** Called when the reader opens or closes the input for a new secret (only with `stored`). */
  onChangingChange?: (changing: boolean) => void;
  /**
   * A stored secret that must be typed again or removed before a save (design 12.3). The field is
   * then a required choice, "Keep it: type it again" with the input under it, or "Remove the stored
   * password"; `label` names the choice (add a `FieldRequired` inside it), `hint` describes it and
   * `error` refuses the typed secret. Takes the place of `stored`. Choosing Remove takes the input out
   * of the page, which empties it; after a request, give the field a new `key` to empty it too.
   */
  storedChoice?: StoredSecretChoice;
};

/**
 * A password, key or shared secret (style guide 5.3, 7.5). It cannot be given a value: there is no
 * `value` or `defaultValue`, so it always opens empty and a stored secret is never echoed. It is masked
 * until the reader asks to see what they typed. Wire it to a form like a native input (`name`,
 * `onChange`, `ref`). `autoComplete` defaults to `new-password` so a browser does not fill a stored
 * login into a settings form.
 */
function SecretField({
  label,
  hint,
  error,
  revealLabel,
  stored,
  onChangingChange,
  storedChoice,
  className,
  disabled,
  autoComplete = "new-password",
  ref,
  ...inputProps
}: SecretFieldProps) {
  const [revealed, setRevealed] = React.useState(false);
  const [changing, setChanging] = React.useState(false);
  const inputId = React.useId();
  const labelId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // The caller's ref reaches the input too, beside the field's own.
  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );
  const changeRef = React.useRef<HTMLButtonElement>(null);
  // Never forwarded, whatever a caller casts its way past the type: the field opens empty.
  const safeProps: Record<string, unknown> = { ...inputProps };
  delete safeProps.value;
  delete safeProps.defaultValue;

  const setChangingState = (next: boolean) => {
    movedRef.current = true;
    setChanging(next);
    setRevealed(false);
    onChangingChange?.(next);
  };

  // Focus follows the reader: into the new input on Change, back to Change on Keep.
  const movedRef = React.useRef(false);
  React.useEffect(() => {
    if (!movedRef.current) {
      return;
    }
    if (changing) {
      inputRef.current?.focus();
    } else {
      changeRef.current?.focus();
    }
  }, [changing]);

  if (storedChoice) {
    return (
      <RadioGroupField
        legend={label}
        hint={
          storedChoice.setLabel || hint ? (
            <>
              {storedChoice.setLabel ? (
                <span className="block">{storedChoice.setLabel}</span>
              ) : null}
              {hint ? <span className="block">{hint}</span> : null}
            </>
          ) : undefined
        }
        error={storedChoice.error}
        value={storedChoice.choice ?? ""}
        onValueChange={(next) => {
          if (next === "keep" || next === "remove") {
            // A secret typed again opens masked, whatever was shown before.
            setRevealed(false);
            storedChoice.onChoiceChange(next);
          }
        }}
        disabled={disabled}
        className={cn("max-w-md", className)}
      >
        <RadioOption value="keep" label={storedChoice.keepLabel}>
          {storedChoice.choice === "keep" ? (
            <Field
              data-slot="secret-field"
              invalid={error ? true : undefined}
              disabled={disabled}
            >
              <FieldLabel htmlFor={inputId} className="text-sm">
                {storedChoice.inputLabel}
              </FieldLabel>
              <MaskedInput
                {...safeProps}
                ref={setInputRef}
                id={inputId}
                required
                autoComplete={autoComplete}
                disabled={disabled}
                revealed={revealed}
                onRevealedChange={setRevealed}
                revealLabel={revealLabel}
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          ) : null}
        </RadioOption>
        <RadioOption value="remove" label={storedChoice.removeLabel} />
      </RadioGroupField>
    );
  }

  if (stored && !changing) {
    return (
      <div
        data-slot="secret-field"
        role="group"
        aria-labelledby={labelId}
        className={cn("flex flex-col gap-1", className)}
      >
        <span id={labelId} className="text-base font-medium text-foreground">
          {label}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-base text-muted-foreground">
            {stored.setLabel}
          </span>
          <Button
            ref={changeRef}
            variant="neutral"
            size="sm"
            disabled={disabled}
            onClick={() => setChangingState(true)}
          >
            {stored.changeLabel}
          </Button>
        </div>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    );
  }

  return (
    <Field
      data-slot="secret-field"
      invalid={error ? true : undefined}
      disabled={disabled}
      className={className}
    >
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <MaskedInput
          {...safeProps}
          ref={setInputRef}
          id={inputId}
          autoComplete={autoComplete}
          disabled={disabled}
          revealed={revealed}
          onRevealedChange={setRevealed}
          revealLabel={revealLabel}
        />
        {stored ? (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setChangingState(false)}
          >
            {stored.keepLabel}
          </Button>
        ) : null}
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export { SecretField };
export type {
  SecretFieldProps,
  StoredSecret,
  StoredSecretAnswer,
  StoredSecretChoice,
};
