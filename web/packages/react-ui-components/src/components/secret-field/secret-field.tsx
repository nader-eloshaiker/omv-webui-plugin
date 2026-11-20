// SPDX-License-Identifier: GPL-3.0-or-later
import { Eye } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button, IconButton } from "../button/button";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "../field/field";

interface StoredSecret {
  /** Says a secret is stored without showing it: "Set". */
  setLabel: React.ReactNode;
  /** Opens an empty input for a new one; name the secret: "Change password". */
  changeLabel: string;
  /** Closes it again and keeps the stored secret: "Keep the current password". */
  keepLabel: string;
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
  className,
  disabled,
  autoComplete = "new-password",
  ...inputProps
}: SecretFieldProps) {
  const [revealed, setRevealed] = React.useState(false);
  const [changing, setChanging] = React.useState(false);
  const inputId = React.useId();
  const labelId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const changeRef = React.useRef<HTMLButtonElement>(null);
  // Never forwarded, whatever a caller casts its way past the type: the field opens empty.
  const safeProps: Record<string, unknown> = { ...inputProps };
  delete safeProps.value;
  delete safeProps.defaultValue;

  const setChangingState = (next: boolean) => {
    setChanging(next);
    setRevealed(false);
    onChangingChange?.(next);
  };

  React.useEffect(() => {
    if (changing) {
      inputRef.current?.focus();
    }
  }, [changing]);

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
        <div className="relative flex-1">
          <FieldControl
            {...safeProps}
            ref={inputRef}
            id={inputId}
            type={revealed ? "text" : "password"}
            autoComplete={autoComplete}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="pe-9 font-mono"
          />
          <IconButton
            label={revealLabel}
            icon={<Eye />}
            variant="ghost"
            size="icon-sm"
            aria-pressed={revealed}
            aria-controls={inputId}
            disabled={disabled}
            onClick={() => setRevealed((value) => !value)}
            className="absolute end-0.5 top-0.5 text-muted-foreground"
          />
        </div>
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
export type { SecretFieldProps, StoredSecret };
