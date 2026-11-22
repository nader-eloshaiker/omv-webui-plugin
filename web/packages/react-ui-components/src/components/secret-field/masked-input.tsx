// SPDX-License-Identifier: GPL-3.0-or-later
import { Eye } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { IconButton } from "../button/button";
import { FieldControl } from "../field/field";

type MaskedInputProps = Omit<
  React.ComponentProps<typeof FieldControl>,
  "type" | "value" | "defaultValue" | "children" | "id"
> & {
  /** The input's id, which the reveal toggle controls. */
  id: string;
  /** Whether the reader asked to see what they typed. */
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  /** The toggle's accessible name and tooltip. It is a toggle (`aria-pressed`). */
  revealLabel: string;
  /** The toggle's icon; the open eye unless given. */
  revealIcon?: React.ReactElement;
};

/**
 * The masked input with its reveal toggle, shared by `SecretField` and `NewPasswordFields`. Internal:
 * it sits inside a `Field`, which names it and links its hint and error. It takes no value: it is a
 * native, uncontrolled input, so what is typed is never written into the `value` attribute.
 */
function MaskedInput({
  id,
  revealed,
  onRevealedChange,
  revealLabel,
  revealIcon,
  disabled,
  className,
  ...inputProps
}: MaskedInputProps) {
  return (
    <div className="relative flex-1">
      <FieldControl
        {...inputProps}
        id={id}
        type={revealed ? "text" : "password"}
        disabled={disabled}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        // The browser's own reveal control (Edge) is removed: the field has a named one.
        className={cn("pe-9 font-mono [&::-ms-reveal]:hidden", className)}
      />
      <IconButton
        label={revealLabel}
        icon={revealIcon ?? <Eye />}
        variant="ghost"
        size="icon-sm"
        aria-pressed={revealed}
        aria-controls={id}
        disabled={disabled}
        onClick={() => onRevealedChange(!revealed)}
        className="absolute end-0.5 top-0.5 text-muted-foreground"
      />
    </div>
  );
}

export { MaskedInput };
export type { MaskedInputProps };
