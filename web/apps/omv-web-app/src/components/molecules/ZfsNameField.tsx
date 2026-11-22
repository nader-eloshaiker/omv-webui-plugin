// SPDX-License-Identifier: GPL-3.0-or-later
// A name for a new pool or file system (phase 5 ZFS design 0.7, 3.2 C3, 4.2): a text field with its
// rule and the folder it gives as the hint, and the refusal in words. No spelling check, no autofill.
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "@omv-webui/react-ui-components";
import type { Ref } from "react";

export function ZfsNameField({
  label,
  value,
  onChange,
  onBlur,
  hint,
  error,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  hint: string;
  error: string | null;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <Field
      invalid={error === null ? undefined : true}
      className="max-w-[40rem]"
    >
      <FieldLabel>{label}</FieldLabel>
      <FieldControl
        ref={inputRef}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <FieldHint aria-live="polite">{hint}</FieldHint>
      {error === null ? null : <FieldError match>{error}</FieldError>}
    </Field>
  );
}
