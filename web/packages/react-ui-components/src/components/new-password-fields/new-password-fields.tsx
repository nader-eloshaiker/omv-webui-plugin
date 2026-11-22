// SPDX-License-Identifier: GPL-3.0-or-later
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Field, FieldError, FieldHint, FieldLabel } from "../field/field";
import { MaskedInput } from "../secret-field/masked-input";

interface NewPasswordInput {
  /** The visible label: "New password", "Type it again", "Password". */
  label: React.ReactNode;
  /** Plain advice under the field: "A long password that alex uses nowhere else is hardest to guess." */
  hint?: React.ReactNode;
  /** The message for a refused value: "The two passwords are not the same."; marks the field invalid. */
  error?: React.ReactNode;
  /**
   * What is typed, exactly as typed: never trimmed, never changed. Held by the caller, so it can be
   * cleared after every request, whatever the request returned (UI-6).
   */
  value: string;
  onValueChange: (value: string) => void;
  /** For the mismatch check on leaving the second field. */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /** The input's form name, if any. */
  name?: string;
  /** The input itself, to move focus to it after a failure. */
  inputRef?: React.Ref<HTMLInputElement>;
}

interface NewPasswordFieldsProps extends Omit<
  React.ComponentProps<"div">,
  "children"
> {
  /** The first field: "New password", or "Password" in the add flow. */
  password: NewPasswordInput;
  /** The second field: "Type it again". */
  confirmation: NewPasswordInput;
  /**
   * Each reveal toggle's accessible name and tooltip, masked and shown: "Show password", "Hide
   * password". The toggle is `aria-pressed`; it never reads the password out.
   */
  revealLabels: { show: string; hide: string };
  /**
   * A line under both fields, given as the first field's description: on a connection that is not
   * encrypted, "This connection is not encrypted, so this password can be read by others on your
   * network." with the caller's router link "Turn on HTTPS".
   */
  notice?: React.ReactNode;
  /** A request is running: both fields and both toggles are unavailable. */
  disabled?: boolean;
}

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

interface PasswordFieldProps {
  field: NewPasswordInput;
  revealLabels: { show: string; hide: string };
  disabled: boolean;
  describedBy?: string;
}

function PasswordField({
  field,
  revealLabels,
  disabled,
  describedBy,
}: PasswordFieldProps) {
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { inputRef: callerRef, value } = field;
  const [revealed, setRevealed] = React.useState(false);
  // Cleared, the field is masked again, so what is typed next is not shown until asked for. Only a
  // flag is kept here: the password lives in the caller's state and the input, nowhere else.
  const empty = value === "";
  const [wasEmpty, setWasEmpty] = React.useState(empty);
  if (empty !== wasEmpty) {
    setWasEmpty(empty);
    if (empty) {
      setRevealed(false);
    }
  }

  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(callerRef, node);
    },
    [callerRef],
  );

  // The value reaches the input through its `value` property only. A controlled React input also
  // writes its value into the `value` attribute, where the markup, a DOM snapshot or a CSS attribute
  // selector could read it; this input never has one.
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== value) {
      input.value = value;
    }
  }, [value]);

  // Leaving the page empties the input, whatever the caller does with its state.
  React.useEffect(() => {
    const input = inputRef.current;
    return () => {
      if (input) {
        input.value = "";
      }
    };
  }, []);

  return (
    <Field
      data-slot="new-password-field"
      invalid={field.error ? true : undefined}
      disabled={disabled}
    >
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <MaskedInput
        ref={setRef}
        id={id}
        name={field.name}
        autoComplete="new-password"
        aria-describedby={describedBy}
        onValueChange={(next) => field.onValueChange(next)}
        onBlur={field.onBlur}
        disabled={disabled}
        revealed={revealed}
        onRevealedChange={setRevealed}
        revealLabel={revealed ? revealLabels.hide : revealLabels.show}
        revealIcon={revealed ? <EyeOff /> : <Eye />}
      />
      {field.hint ? <FieldHint>{field.hint}</FieldHint> : null}
      {field.error ? <FieldError>{field.error}</FieldError> : null}
    </Field>
  );
}

/**
 * A new password, typed twice (phase 5 users design 0.7, 5.2): two masked fields, each with its own
 * reveal toggle, both `autocomplete="new-password"` so a password manager offers a new one rather
 * than the administrator's own, paste allowed, and what is typed kept exactly. Built from
 * `SecretField`'s input; `SecretField` stays the "Set / Change" control for a stored secret.
 *
 * The caller holds both values and clears them after every request and when the form closes (UI-6);
 * the fields mask again when cleared, forget their reveal state when they unmount, and never write
 * the password to storage, a log or the markup.
 */
function NewPasswordFields({
  password,
  confirmation,
  revealLabels,
  notice,
  disabled = false,
  className,
  ...props
}: NewPasswordFieldsProps) {
  const noticeId = React.useId();
  return (
    <div
      data-slot="new-password-fields"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    >
      <PasswordField
        field={password}
        revealLabels={revealLabels}
        disabled={disabled}
        describedBy={notice ? noticeId : undefined}
      />
      <PasswordField
        field={confirmation}
        revealLabels={revealLabels}
        disabled={disabled}
      />
      {notice ? (
        <p
          id={noticeId}
          data-slot="new-password-notice"
          className="-mt-2 text-sm text-foreground"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

export { NewPasswordFields };
export type { NewPasswordFieldsProps, NewPasswordInput };
