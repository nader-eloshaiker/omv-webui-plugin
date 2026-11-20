// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";
import { Checkbox } from "../checkbox/checkbox";
import { Field, FieldError, FieldHint, FieldLabel } from "../field/field";

type CheckboxFieldProps = Omit<
  React.ComponentProps<typeof Checkbox>,
  "className" | "children"
> & {
  /** What turning it on does, as a statement: "Allow signing in with a password". */
  label: React.ReactNode;
  /**
   * What the setting means in plain words, below the label. When the checkbox is disabled, say why
   * here ("Turn on SSH to change this"): a disabled control always gives its reason (style guide 5.3).
   */
  hint?: React.ReactNode;
  /** The message for a refused value; marks the field invalid. */
  error?: React.ReactNode;
  /** Classes for the field around the checkbox. */
  className?: string;
};

/**
 * An on/off setting in a form that takes effect when the form is saved: the checkbox, its label
 * beside it and the hint below, on Base UI's Field, which names the checkbox by its label and links
 * the hint and error through `aria-describedby`. A switch reads as "takes effect now", so a setting
 * that waits for Save is a checkbox (phase 3 design 0.4). Takes the checkbox's own props (`checked`,
 * `defaultChecked`, `onCheckedChange`, `name`, `disabled`, `readOnly`, `ref`).
 */
function CheckboxField({
  label,
  hint,
  error,
  disabled,
  className,
  ...checkboxProps
}: CheckboxFieldProps) {
  return (
    <Field
      data-slot="checkbox-field"
      invalid={error ? true : undefined}
      disabled={disabled}
      className={cn("gap-0.5", className)}
    >
      <FieldLabel className="flex w-fit items-start gap-2 font-regular data-disabled:cursor-not-allowed">
        {/* The box sits on the first line of a wrapping label; its 24px target overhangs the box. */}
        <span className="flex h-[1lh] shrink-0 items-center">
          <Checkbox disabled={disabled} {...checkboxProps} />
        </span>
        <span className="min-w-0">{label}</span>
      </FieldLabel>
      {hint ? <FieldHint className="ps-6">{hint}</FieldHint> : null}
      {error ? <FieldError className="ps-6">{error}</FieldError> : null}
    </Field>
  );
}

export { CheckboxField };
export type { CheckboxFieldProps };
