// SPDX-License-Identifier: GPL-3.0-or-later
import { Field as BaseField } from "@base-ui/react/field";
import { Input as BaseInput } from "@base-ui/react/input";
import { CircleAlert } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { controlClass } from "./control-class";

/**
 * One form field: label above, control, hint, error. On Base UI's Field, which links the label to the
 * control and the hint and error to it through `aria-describedby`; nothing here wires that by hand.
 * Pass `invalid` from the form library when the value has been checked and refused.
 */
function Field({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Root>) {
  return (
    <BaseField.Root
      data-slot="field"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

/** The label, always visible, above the control. */
function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Label>) {
  return (
    <BaseField.Label
      data-slot="field-label"
      className={cn(
        "text-base font-medium text-foreground data-disabled:text-subtle-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** The required marker, in words (style guide 5.3): put it inside the label, e.g. "Required". */
function FieldRequired({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="field-required"
      className={cn("ms-1.5 font-regular text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A text input inside a Field. */
function FieldControl({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Control>) {
  return (
    <BaseField.Control
      data-slot="field-control"
      className={cn(controlClass, className)}
      {...props}
    />
  );
}

/** What the setting does, in plain words, below the control. */
function FieldHint({
  className,
  ...props
}: React.ComponentProps<typeof BaseField.Description>) {
  return (
    <BaseField.Description
      data-slot="field-hint"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * How to fix the value, with an icon so the error is not colour alone. Shown whenever it is rendered
 * (the form library decides when); `match` is forwarded for Base UI's own validity checks.
 */
function FieldError({
  className,
  children,
  match = true,
  ...props
}: React.ComponentProps<typeof BaseField.Error>) {
  return (
    <BaseField.Error
      data-slot="field-error"
      match={match}
      className={cn(
        "flex items-start gap-1.5 text-sm text-critical-label",
        className,
      )}
      {...props}
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
      />
      <span>{children}</span>
    </BaseField.Error>
  );
}

/** A text input outside a Field (a table search box). Give it an accessible name. */
function Input({
  className,
  ...props
}: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      data-slot="input"
      className={cn(controlClass, className)}
      {...props}
    />
  );
}

export {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldRequired,
  Input,
};
