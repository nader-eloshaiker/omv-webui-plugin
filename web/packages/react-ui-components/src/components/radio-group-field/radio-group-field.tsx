// SPDX-License-Identifier: GPL-3.0-or-later
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { OptionGroup, type OptionGroupProps } from "../field/option-group";

// Set by a group that is unavailable but stays focusable, so each option takes the disabled look.
const UnavailableContext = React.createContext(false);

interface RadioGroupFieldProps {
  /** The question the choice answers, always visible: "How to wipe". It names the group. */
  legend: React.ReactNode;
  /** What the choice means in plain words, below the legend. */
  hint?: React.ReactNode;
  /** The message for a refused choice; marks the group invalid. */
  error?: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /**
   * With `disabled`: the options stay in the tab order and say they are unavailable (`aria-disabled`)
   * instead of leaving it, so `disabledReason`, given as the group's description, is heard when the
   * group is reached (style guide 5.3). Nothing can be chosen. Like `Checkbox`'s prop.
   */
  focusableWhenDisabled?: boolean;
  /** Why the group is unavailable, shown under the hint while `disabled`: "Turn on NFS first." */
  disabledReason?: React.ReactNode;
  /** Ids of further lines that describe the group, such as a warning about the chosen option. */
  "aria-describedby"?: string;
  readOnly?: boolean;
  /** Identifies the group's value when a form is submitted. */
  name?: string;
  className?: string;
  /**
   * The `RadioOption`s, in reading order, or `RadioOptionGroup` sections of them. Either way the
   * group is one tab stop and the arrow keys move across every option.
   */
  children: React.ReactNode;
}

/**
 * One choice from a few (style guide 5.3: up to about seven; more goes in a Select), on Base UI's
 * RadioGroup: one tab stop for the whole group, the arrow keys move between options and choose. The
 * legend names the group; its hint and error are linked to it through `aria-describedby`. Each option
 * is a `RadioOption` with its own label and hint.
 */
function RadioGroupField({
  legend,
  hint,
  error,
  value,
  onValueChange,
  disabled,
  focusableWhenDisabled = false,
  disabledReason,
  "aria-describedby": describedByProp,
  readOnly,
  name,
  className,
  children,
}: RadioGroupFieldProps) {
  const id = React.useId();
  const legendId = `${id}-legend`;
  const hintId = `${id}-hint`;
  const reasonId = `${id}-reason`;
  const errorId = `${id}-error`;
  // Base UI's disabled group leaves the tab order; a read-only one stays and refuses every change.
  const unavailable = disabled === true && focusableWhenDisabled;
  const showReason = disabled === true && disabledReason !== undefined;
  const describedBy =
    [
      hint ? hintId : null,
      showReason ? reasonId : null,
      error ? errorId : null,
      describedByProp ?? null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div
      data-slot="radio-group-field"
      className={cn("flex flex-col gap-1", className)}
    >
      <div
        id={legendId}
        className={cn(
          "text-base font-medium text-foreground",
          disabled && "text-muted-foreground",
        )}
      >
        {legend}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {showReason ? (
        <p
          id={reasonId}
          data-slot="radio-group-reason"
          className="text-sm text-muted-foreground"
        >
          {disabledReason}
        </p>
      ) : null}
      <RadioGroup
        value={value}
        onValueChange={(next) => onValueChange(String(next))}
        disabled={unavailable ? false : disabled}
        readOnly={unavailable || readOnly}
        // Only when set here: an undefined value would hide Base UI's own state.
        {...(unavailable ? { "aria-disabled": true } : null)}
        data-unavailable={unavailable || undefined}
        name={name}
        aria-labelledby={legendId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className="mt-1 flex flex-col gap-3"
      >
        <UnavailableContext value={unavailable}>{children}</UnavailableContext>
      </RadioGroup>
      {error ? (
        <p
          id={errorId}
          data-slot="radio-group-error"
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

interface RadioOptionProps {
  value: string;
  /** The choice, as a statement: "Quick wipe (recommended)". */
  label: React.ReactNode;
  /**
   * What choosing it means, below the label. When the option is disabled, say why here: a disabled
   * control always gives its reason (style guide 5.3).
   */
  hint?: React.ReactNode;
  disabled?: boolean;
  /** Content under the option, indented to its label: the fields this choice needs. */
  children?: React.ReactNode;
  /**
   * Classes for the option's block: `mt-1` sets a choice apart after a 16px gap (the group's own gap
   * is 12px), as a risky choice is (phase 5 services design 0.4).
   */
  className?: string;
}

/** One option of a `RadioGroupField`: the round button, its label beside it, its hint below. */
function RadioOption({
  value,
  label,
  hint,
  disabled,
  children,
  className,
}: RadioOptionProps) {
  const id = React.useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const unavailable = React.use(UnavailableContext);
  return (
    <div
      data-slot="radio-option"
      className={cn("flex flex-col gap-0.5", className)}
    >
      <label
        className={cn(
          "flex w-fit items-start gap-2 text-base text-foreground",
          (disabled || unavailable) &&
            "cursor-not-allowed text-muted-foreground",
        )}
      >
        {/* The circle sits on the first line of a wrapping label; its 24px target overhangs it. */}
        <span className="flex h-[1lh] shrink-0 items-center">
          <Radio.Root
            value={value}
            disabled={disabled}
            aria-labelledby={labelId}
            aria-describedby={hint ? hintId : undefined}
            {...(unavailable ? { "aria-disabled": true } : null)}
            className={cn(
              "relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border border-input bg-surface",
              "transition-[background-color,border-color] duration-fast ease-standard",
              "after:absolute after:-inset-1 after:rounded-full after:content-['']",
              "data-checked:border-action data-checked:bg-action",
              "data-disabled:cursor-not-allowed data-disabled:border-transparent data-disabled:bg-muted",
              "data-readonly:cursor-default",
              unavailable &&
                "cursor-not-allowed border-transparent bg-muted data-checked:border-transparent data-checked:bg-muted data-readonly:cursor-not-allowed",
            )}
          >
            <Radio.Indicator
              className={cn(
                "size-2 rounded-full bg-action-foreground transition-[scale] duration-base ease-settle data-starting-style:scale-0 data-unchecked:hidden data-disabled:bg-subtle-foreground",
                unavailable && "bg-subtle-foreground",
              )}
            />
          </Radio.Root>
        </span>
        <span id={labelId} className="min-w-0 [overflow-wrap:anywhere]">
          {label}
        </span>
      </label>
      {hint ? (
        <p id={hintId} className="ps-6 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children ? (
        <div data-slot="radio-option-content" className="mt-2 ps-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

type RadioOptionGroupProps = OptionGroupProps;

/**
 * A headed section of a `RadioGroupField` ("Empty disks", "Erase and reuse"): a `group` inside the
 * `radiogroup`, named by its visible heading and described by the line under it. It only labels:
 * the whole field stays one tab stop and the arrow keys run on from the last option of one section
 * to the first of the next. Leave out a section that has no options rather than render it empty.
 */
function RadioOptionGroup(props: RadioOptionGroupProps) {
  return <OptionGroup dataSlot="radio-option-group" {...props} />;
}

export { RadioGroupField, RadioOption, RadioOptionGroup };
export type { RadioGroupFieldProps, RadioOptionGroupProps, RadioOptionProps };
