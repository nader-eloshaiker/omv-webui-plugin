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

interface NumberFieldProps {
  /** What the number is: "Check every", "Warn at". */
  label: React.ReactNode;
  /** The unit, shown after the input and read with the label: "minutes", "°C". */
  unit?: React.ReactNode;
  /** What the setting does, in plain words, below the input. */
  hint?: React.ReactNode;
  /** How to fix the value, in words ("Enter a whole number from 1 to 100."); marks the field invalid. */
  error?: React.ReactNode;
  /** The text in the input. The caller parses and checks it. */
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  disabled?: boolean;
  name?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Classes for the field around the input. */
  className?: string;
  /** Classes for the input: its width, when the default does not fit the range. */
  inputClassName?: string;
}

/**
 * A whole number in a form, with its unit after it (style guide 5.3). A text input with the numeric
 * keyboard rather than `type="number"`, so a half-typed or empty value can be shown and refused in
 * words, and the wheel never changes it. The unit is part of the input's accessible name ("Check
 * every, minutes"), so it is heard as well as seen.
 */
function NumberField({
  label,
  unit,
  hint,
  error,
  value,
  onValueChange,
  onBlur,
  readOnly,
  disabled,
  name,
  inputRef,
  className,
  inputClassName,
}: NumberFieldProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const unitId = `${id}-unit`;
  return (
    <Field
      data-slot="number-field"
      invalid={error ? true : undefined}
      disabled={disabled}
      className={className}
    >
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <FieldControl
          ref={inputRef}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          readOnly={readOnly}
          value={value}
          aria-labelledby={unit ? `${labelId} ${unitId}` : undefined}
          onValueChange={(next) => onValueChange(next)}
          onBlur={onBlur}
          className={cn("w-[8ch] min-w-20 tabular-nums", inputClassName)}
        />
        {unit ? (
          <span id={unitId} className="text-base text-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export { NumberField };
export type { NumberFieldProps };
