// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { OptionGroup, type OptionGroupProps } from "../field/option-group";

interface CheckboxListSelectAll {
  /** The button that ticks every option the reader may choose: "Select all". */
  selectAllLabel: string;
  /** The button that clears them: "Select none". */
  selectNoneLabel: string;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

interface CheckboxListFieldProps {
  /** The question the choice answers, always visible: "Disks to combine". It names the list. */
  legend: React.ReactNode;
  /** What the choice means in plain words, below the legend. */
  hint?: React.ReactNode;
  /** The message for a refused choice, in words and with the error mark; marks the list invalid. */
  error?: React.ReactNode;
  /** A line under the list, such as the count or the rule: "Choose at least 2 disks." */
  footer?: React.ReactNode;
  /** Two neutral buttons above the list that tick or clear every option. */
  selectAll?: CheckboxListSelectAll;
  className?: string;
  /** `CheckboxOptionGroup` sections of `CheckboxField`s, or `CheckboxField`s alone, in reading order. */
  children: React.ReactNode;
}

/**
 * Several choices from a list (style guide 5.3), each a `CheckboxField`, optionally in headed
 * `CheckboxOptionGroup` sections. The list is a `group` named by its legend; the hint, the footer and
 * the error describe it through `aria-describedby`. Every checkbox is its own tab stop, as checkboxes
 * are. The caller owns the checked state and the select-all handlers.
 */
function CheckboxListField({
  legend,
  hint,
  error,
  footer,
  selectAll,
  className,
  children,
}: CheckboxListFieldProps) {
  const id = React.useId();
  const legendId = `${id}-legend`;
  const hintId = `${id}-hint`;
  const footerId = `${id}-footer`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, footer ? footerId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div
      role="group"
      data-slot="checkbox-list-field"
      data-invalid={error ? "" : undefined}
      aria-labelledby={legendId}
      aria-describedby={describedBy}
      className={cn("flex flex-col gap-1", className)}
    >
      <div
        id={legendId}
        className="text-base font-medium [overflow-wrap:anywhere] text-foreground"
      >
        {legend}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {selectAll ? (
        <div
          data-slot="checkbox-list-select-all"
          className="mt-1 flex flex-wrap gap-2"
        >
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={selectAll.onSelectAll}
          >
            {selectAll.selectAllLabel}
          </Button>
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={selectAll.onSelectNone}
          >
            {selectAll.selectNoneLabel}
          </Button>
        </div>
      ) : null}
      <div data-slot="checkbox-list" className="mt-1 flex flex-col gap-3">
        {children}
      </div>
      {footer ? (
        <p
          id={footerId}
          data-slot="checkbox-list-footer"
          className="mt-1 text-sm text-muted-foreground"
        >
          {footer}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          data-slot="checkbox-list-error"
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

type CheckboxOptionGroupProps = OptionGroupProps;

/**
 * A headed section of a `CheckboxListField` ("Empty disks", "Erase and reuse"): a `group` named by
 * its visible heading and described by the line under it. Leave out a section that has no options
 * rather than render it empty.
 */
function CheckboxOptionGroup(props: CheckboxOptionGroupProps) {
  return <OptionGroup dataSlot="checkbox-option-group" {...props} />;
}

export { CheckboxListField, CheckboxOptionGroup };
export type {
  CheckboxListFieldProps,
  CheckboxListSelectAll,
  CheckboxOptionGroupProps,
};
