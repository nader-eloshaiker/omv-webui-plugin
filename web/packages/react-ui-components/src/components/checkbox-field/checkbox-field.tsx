// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Checkbox } from "../checkbox/checkbox";
import { Field, FieldError, FieldHint, FieldLabel } from "../field/field";
import { InlineAlert } from "../inline-alert/inline-alert";

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
  /**
   * A risk the current choice carries, under the hint, in the warning-shape neutral alert: "Make alex
   * an administrator only if you trust them with everything on this NAS." It is also the checkbox's
   * description, so it is heard when the box is reached, and it is announced politely when it
   * appears. The caller decides when it applies (ticked, and not ticked before).
   */
  warning?: React.ReactNode;
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
 * `defaultChecked`, `onCheckedChange`, `name`, `disabled`, `focusableWhenDisabled`, `readOnly`,
 * `ref`).
 */
function CheckboxField({
  label,
  hint,
  warning,
  error,
  disabled,
  focusableWhenDisabled = false,
  className,
  "aria-describedby": describedByProp,
  ...checkboxProps
}: CheckboxFieldProps) {
  const warningId = React.useId();
  // A box that stays focusable cannot sit in a disabled Field, which would take it out of the tab
  // order; the label takes the disabled look by hand instead.
  const unavailable = disabled === true && focusableWhenDisabled;
  return (
    <Field
      data-slot="checkbox-field"
      invalid={error ? true : undefined}
      disabled={unavailable ? undefined : disabled}
      className={cn("gap-0.5", className)}
    >
      <FieldLabel
        className={cn(
          "flex w-fit items-start gap-2 font-regular data-disabled:cursor-not-allowed",
          unavailable && "cursor-not-allowed text-muted-foreground",
        )}
      >
        {/* The box sits on the first line of a wrapping label; its 24px target overhangs the box. */}
        <span className="flex h-[1lh] shrink-0 items-center">
          <Checkbox
            disabled={disabled}
            focusableWhenDisabled={focusableWhenDisabled}
            aria-describedby={
              [describedByProp, warning ? warningId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
            {...checkboxProps}
          />
        </span>
        <span className="min-w-0">{label}</span>
      </FieldLabel>
      {hint ? <FieldHint className="ps-6">{hint}</FieldHint> : null}
      {/* Always in the page, so a warning that appears in it is announced. The alert itself is a
          note, not a second live region. */}
      <div
        aria-live="polite"
        data-slot="checkbox-field-warning-region"
        className="ms-6 empty:hidden"
      >
        {warning ? (
          <InlineAlert
            id={warningId}
            data-slot="checkbox-field-warning"
            tone="neutral"
            icon="warning"
            role="note"
            className="mt-1"
          >
            {warning}
          </InlineAlert>
        ) : null}
      </div>
      {error ? <FieldError className="ps-6">{error}</FieldError> : null}
    </Field>
  );
}

export { CheckboxField };
export type { CheckboxFieldProps };
