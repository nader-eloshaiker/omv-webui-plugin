// SPDX-License-Identifier: GPL-3.0-or-later
// One choice of the self-test dialog (phase 5 disks design 6.4): a visible label, the library's Select,
// a hint linked to it, and an error. An option can carry a quiet second line (the test kinds' meanings)
// and be unavailable with its reason in its words ("Not watched").
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@omv-webui/react-ui-components";
import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";

export interface SelfTestOption {
  value: string;
  /** What the trigger shows once chosen. */
  label: string;
  /** A second line in the list only. */
  description?: string;
  disabled?: boolean;
}

export function SelfTestSelect({
  label,
  value,
  options,
  onValueChange,
  hint,
  error,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly SelfTestOption[];
  onValueChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
}) {
  const hintId = useId();
  const errorId = useId();
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1">
      <Select
        items={options.map((o) => ({ value: o.value, label: o.label }))}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onValueChange(next);
          }
        }}
      >
        <SelectLabel>{label}</SelectLabel>
        <SelectTrigger
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="w-full max-w-sm"
        />
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              <span className="flex flex-col">
                <span dir="auto">{o.label}</span>
                {o.description ? (
                  <span className="text-sm text-muted-foreground">
                    {o.description}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm text-critical-label"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
          />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
