// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "../field/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../select/select";

/** One unit the size can be given in. The words come from the caller. */
interface SizeFieldUnit {
  /** What the caller stores, e.g. "G". */
  value: string;
  /** What the person sees, e.g. "GiB". */
  label: string;
}

interface SizeFieldProps {
  /** What the size is: "Up to". The input's accessible name. */
  label: React.ReactNode;
  /** The number as typed. The caller parses and checks it. */
  value: string;
  onValueChange: (value: string) => void;
  /** The chosen unit's `value`, e.g. "G". */
  unit: string;
  /** The units to choose from, in order: binary units ("GiB", "TiB"). */
  units: readonly SizeFieldUnit[];
  /** Called with the chosen unit's `value`. The number is left as it is. */
  onUnitChange: (unit: string) => void;
  /** The accessible name of the unit control: "Unit". */
  unitLabel: string;
  /** What the setting does, in plain words, below the field. */
  hint?: React.ReactNode;
  /** How to fix the value, in words; marks the number invalid and describes it. */
  error?: React.ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  /** The number input's form name. */
  name?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Classes for the field. */
  className?: string;
}

/**
 * A size in a form: a number and its unit side by side, under one label (style guide 5.3). The number
 * is a text input with the numeric keyboard rather than `type="number"`, so a half-typed value can be
 * shown and refused in words, and the wheel never changes it. The unit is a Select named by
 * `unitLabel`; changing it never changes the number, so "500" stays "500" from GiB to TiB.
 *
 * The unit sits in a Field of its own: Base UI's Field links one control, and this one keeps the
 * label, hint and error on the number.
 */
function SizeField({
  label,
  value,
  onValueChange,
  unit,
  units,
  onUnitChange,
  unitLabel,
  hint,
  error,
  disabled,
  readOnly,
  name,
  inputRef,
  className,
}: SizeFieldProps) {
  return (
    <Field
      data-slot="size-field"
      invalid={error ? true : undefined}
      disabled={disabled}
      className={className}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <FieldControl
          ref={inputRef}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          readOnly={readOnly}
          value={value}
          onValueChange={(next) => onValueChange(next)}
          className="w-[10ch] min-w-24 tabular-nums"
        />
        <Field disabled={disabled} className="w-24 shrink-0">
          <Select
            items={units}
            value={unit}
            onValueChange={(next) => {
              if (typeof next === "string") {
                onUnitChange(next);
              }
            }}
            disabled={disabled}
            readOnly={readOnly}
          >
            <SelectTrigger data-slot="size-field-unit" aria-label={unitLabel} />
            <SelectContent>
              {units.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export { SizeField };
export type { SizeFieldProps, SizeFieldUnit };
