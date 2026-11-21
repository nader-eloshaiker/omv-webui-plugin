// SPDX-License-Identifier: GPL-3.0-or-later
import { Field, FieldControl, FieldLabel } from "../field/field";

interface TypeToConfirmFieldProps {
  /**
   * The exact text to type: the object's name, or several names in order separated by one space.
   * Case-sensitive; surrounding spaces are ignored and a run of spaces counts as one (`typedMatches`).
   */
  confirmText: string;
  /**
   * The instruction, one translated sentence containing `confirmText` wherever the language puts it:
   * "Type /dev/sdb to confirm." The name is set in code type where it appears.
   */
  prompt: string;
  value: string;
  onValueChange: (value: string) => void;
}

// The name is set in code type by finding it in the sentence, so a translation keeps its own word
// order and no markup enters the catalogue. A sentence that lost the name still renders, as text.
function Prompt({ sentence, name }: { sentence: string; name: string }) {
  const at = name ? sentence.indexOf(name) : -1;
  if (at < 0) {
    return <>{sentence}</>;
  }
  return (
    <>
      {sentence.slice(0, at)}
      <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.95em] font-semibold [overflow-wrap:anywhere] text-foreground">
        {name}
      </code>
      {sentence.slice(at + name.length)}
    </>
  );
}

/**
 * The typed confirmation field for what cannot be undone (style guide 5.4, UI-8). There is no form
 * around it, so Enter does nothing; the caller's confirm button checks `typedMatches`.
 */
export function TypeToConfirmField({
  confirmText,
  prompt,
  value,
  onValueChange,
}: TypeToConfirmFieldProps) {
  return (
    <Field>
      <FieldLabel className="font-regular">
        <Prompt sentence={prompt} name={confirmText} />
      </FieldLabel>
      <FieldControl
        data-slot="type-to-confirm-input"
        value={value}
        onValueChange={(next) => onValueChange(next)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="font-mono"
      />
    </Field>
  );
}

export type { TypeToConfirmFieldProps };
