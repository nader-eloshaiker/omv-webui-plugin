// SPDX-License-Identifier: GPL-3.0-or-later
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle, Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { IconButton } from "../button/button";
import { Field, FieldControl, FieldHint, FieldLabel } from "../field/field";

const inputClass = cva(
  // Room for the search mark at the start and the clear button at the end. The browser's own clear
  // mark is removed: this field has a named button instead.
  "ps-8 pe-8 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
  {
    variants: {
      size: {
        // 28px in a table toolbar (style guide 4.2).
        sm: "h-control-sm",
        md: "h-control",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type SearchFieldProps = Omit<
  React.ComponentProps<"input">,
  | "type"
  | "value"
  | "defaultValue"
  | "onChange"
  | "size"
  | "className"
  | "width"
> &
  VariantProps<typeof inputClass> & {
    /** The visible label, never only a placeholder: "Search shared folders". */
    label: React.ReactNode;
    /** What the search looks at, below the field, always visible. */
    hint?: React.ReactNode;
    /** The clear button's name, also its tooltip: "Clear the search". */
    clearLabel: string;
    value?: string;
    defaultValue?: string;
    /** Every change: typing, the clear button and Escape. The caller debounces the query. */
    onValueChange?: (value: string) => void;
    /**
     * A search is being run with the current text: the search mark turns into a spinner. The words for
     * assistive technology belong to the region that is refreshing ("Loading…" in the toolbar).
     */
    busy?: boolean;
    /** Classes for the field around the input; set its width here. */
    className?: string;
  };

/**
 * A search box (phase 3 design 4.5): a visible label, `type="search"`, a clear button inside the box
 * while it holds text, and Escape to clear. Escape on an empty box is left to the page (it may close a
 * dialog). After clearing, focus is in the input. On Base UI's Field, so the label and hint are
 * linked to the input.
 */
function SearchField({
  label,
  hint,
  clearLabel,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  busy = false,
  size,
  disabled,
  className,
  onKeyDown,
  ref,
  ...inputProps
}: SearchFieldProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const controlled = valueProp !== undefined;
  const value = controlled ? valueProp : uncontrolled;
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const change = (next: string) => {
    if (!controlled) {
      setUncontrolled(next);
    }
    onValueChange?.(next);
  };

  const clear = () => {
    change("");
    inputRef.current?.focus();
  };

  const setRefs = (element: HTMLInputElement | null) => {
    inputRef.current = element;
    if (typeof ref === "function") {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  };

  const Mark = busy ? LoaderCircle : Search;

  return (
    <Field
      data-slot="search-field"
      disabled={disabled}
      className={cn("w-full", className)}
    >
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Mark
          aria-hidden="true"
          data-busy={busy || undefined}
          className={cn(
            "pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
            busy && "motion-safe:animate-spin",
          )}
        />
        <FieldControl
          {...inputProps}
          ref={setRefs}
          type="search"
          value={value}
          disabled={disabled}
          autoComplete="off"
          onValueChange={change}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            onKeyDown?.(event);
            if (event.key === "Escape" && value !== "") {
              // Clear here, and keep the key from also closing a dialog around the field.
              event.preventDefault();
              event.stopPropagation();
              change("");
            }
          }}
          className={inputClass({ size })}
        />
        {value !== "" && !disabled ? (
          <IconButton
            label={clearLabel}
            icon={<X />}
            size="icon-sm"
            onClick={clear}
            className={cn(
              "absolute end-0.5 top-1/2 -translate-y-1/2 text-muted-foreground",
              size === "sm" && "size-6",
            )}
          />
        ) : null}
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </Field>
  );
}

export { SearchField };
export type { SearchFieldProps };
