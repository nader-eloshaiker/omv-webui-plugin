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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../select/select";

/** The list's choice for any port. */
const PORT_ANY = "any";
/** The list's choice that reveals the text field. */
const PORT_OTHER = "other";

/**
 * The field's value, held by the caller. `choice` is `PORT_ANY`, `PORT_OTHER` or a known port's
 * `value`; `text` is what is typed for `PORT_OTHER`, exactly as typed, and is kept when the choice
 * changes. The caller decides what each choice stores.
 */
interface PortFieldValue {
  choice: string;
  text: string;
}

/** A port the list names (phase 5 network design 11.3): "22 (SSH)", "445 (Windows and Mac sharing)". */
interface KnownPort {
  /** The port as stored: "22". Never `PORT_ANY` or `PORT_OTHER`. */
  value: string;
  /** The port with its name, in the caller's words: "22 (SSH)". */
  label: string;
}

interface PortFieldLabels {
  /** "Port". */
  label: React.ReactNode;
  /** "Any port". */
  any: string;
  /** "Another port or range…". */
  other: string;
  /** The text field's label: "Port or range". */
  field: React.ReactNode;
  /** An example, never the label: "1024-65535". */
  fieldPlaceholder?: string;
  /** "One port, such as 22, or a range, such as 1024-65535." */
  fieldHint?: React.ReactNode;
}

interface PortFieldProps {
  labels: PortFieldLabels;
  /** What the port decides, under the label. */
  hint?: React.ReactNode;
  value: PortFieldValue;
  onValueChange: (value: PortFieldValue) => void;
  /** The known ports, in the caller's order. */
  knownPorts: readonly KnownPort[];
  /**
   * The caller's check of the typed port or range: "Write one port from 1 to 65535, or a range such
   * as 1024-65535." Shown under the text field while "Another port or range…" is chosen.
   */
  error?: React.ReactNode;
  /** The text field was left: the moment to check it (style guide 5.3). */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  /**
   * No port can be chosen for this kind of traffic: the label stays and this line replaces the
   * controls ("A port can be chosen only for TCP or UDP."), as design 11.4 asks.
   */
  unavailableReason?: React.ReactNode;
  /** Both controls take part in a refused or running save: shown, nothing can be changed. */
  disabled?: boolean;
  /** The text field, to move focus to it after a refused save. */
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

/**
 * A firewall rule's port (phase 5 network design 11.4): a list of "Any port", the known ports by
 * number and name, and "Another port or range…", which reveals a text field for "22" or
 * "1024-65535". Controlled and wordless; the check of the typed text is the caller's. For traffic that
 * has no ports, `unavailableReason` says why in place of the controls.
 */
function PortField({
  labels,
  hint,
  value,
  onValueChange,
  knownPorts,
  error,
  onBlur,
  unavailableReason,
  disabled,
  inputRef,
  className,
}: PortFieldProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const items = React.useMemo(
    () => [
      { value: PORT_ANY, label: labels.any },
      ...knownPorts,
      { value: PORT_OTHER, label: labels.other },
    ],
    [knownPorts, labels.any, labels.other],
  );

  if (unavailableReason !== undefined) {
    return (
      <div
        data-slot="port-field"
        data-unavailable=""
        role="group"
        aria-labelledby={labelId}
        className={cn("flex flex-col gap-1", className)}
      >
        <span
          id={labelId}
          className="text-base font-medium text-muted-foreground"
        >
          {labels.label}
        </span>
        <p
          data-slot="port-field-reason"
          className="text-sm text-muted-foreground"
        >
          {unavailableReason}
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="port-field"
      className={cn("flex flex-col gap-3", className)}
    >
      <Field disabled={disabled} className="max-w-sm">
        <FieldLabel>{labels.label}</FieldLabel>
        <Select
          items={items}
          value={value.choice}
          disabled={disabled}
          onValueChange={(next) => {
            if (typeof next === "string") {
              onValueChange({ choice: next, text: value.text });
            }
          }}
        >
          <SelectTrigger aria-describedby={hint ? hintId : undefined} />
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      </Field>
      {value.choice === PORT_OTHER ? (
        <Field
          data-slot="port-field-other"
          invalid={error ? true : undefined}
          disabled={disabled}
          className="max-w-xs"
        >
          <FieldLabel>{labels.field}</FieldLabel>
          <FieldControl
            ref={inputRef}
            value={value.text}
            onValueChange={(text) =>
              onValueChange({ choice: value.choice, text })
            }
            onBlur={onBlur}
            placeholder={labels.fieldPlaceholder}
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="font-mono tabular-nums"
          />
          {labels.fieldHint ? <FieldHint>{labels.fieldHint}</FieldHint> : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      ) : null}
    </div>
  );
}

export { PORT_ANY, PORT_OTHER, PortField };
export type { KnownPort, PortFieldLabels, PortFieldProps, PortFieldValue };
