// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import {
  RadioGroupField,
  RadioOption,
} from "../radio-group-field/radio-group-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "../select/select";
import {
  SCHEDULE_FREQUENCIES,
  type ScheduleCustomParts,
  type ScheduleFieldValue,
  type ScheduleFrequency,
} from "./schedule-value";

/** Every word the field shows. All come from the caller's catalogue. */
interface ScheduleFieldLabels {
  /** The question: "When". */
  legend: React.ReactNode;
  /** "Only when I start it". */
  manual: React.ReactNode;
  manualHint?: React.ReactNode;
  /** "On a schedule". */
  schedule: React.ReactNode;
  scheduleHint?: React.ReactNode;
  /** "How often". */
  frequency: React.ReactNode;
  /** Each frequency's words in the How often list: "Every hour", "Every day", … "Custom". */
  frequencies: Readonly<Record<ScheduleFrequency, string>>;
  /** The time's label: "At". */
  at: React.ReactNode;
  /** The hour and minute selects' own names, heard after "At": "Hour", "Minute". */
  hour: string;
  minute: string;
  /** The weekday's label: "On". */
  weekday: React.ReactNode;
  /** The day of the month's label: "On day". */
  day: React.ReactNode;
  /** Under On day when the day is above 28: "Months without this day are skipped." */
  dayNote?: React.ReactNode;
  /** Every hour's minute: "At minutes past". */
  minutesPast: React.ReactNode;
  /** Custom's five labels: "Minute", "Hour", "Day of the month", "Month", "Weekday". */
  custom: Readonly<Record<keyof ScheduleCustomParts, React.ReactNode>>;
  /** Each Custom select's first option: "Every minute", "Every hour", "Every day", … */
  every: Readonly<Record<keyof ScheduleCustomParts, string>>;
  /** A line above Custom's selects: "With both a day of the month and a weekday, it runs on days…" */
  customNote?: React.ReactNode;
}

/** Refusals, each shown under the part it concerns and given as its description. */
interface ScheduleFieldErrors {
  /** Of the When choice as a whole. */
  mode?: React.ReactNode;
  frequency?: React.ReactNode;
  /** Of At (hour and minute). */
  time?: React.ReactNode;
  weekday?: React.ReactNode;
  day?: React.ReactNode;
  minutesPast?: React.ReactNode;
  /** Of Custom as a whole: "This value cannot be set here." */
  custom?: React.ReactNode;
}

interface ScheduleFieldProps {
  labels: ScheduleFieldLabels;
  /** The seven weekday names in the locale's words, Monday first (value `"1"` to `"7"`). */
  weekdayNames: readonly string[];
  /** The twelve month names in the locale's words, January first. */
  monthNames: readonly string[];
  value: ScheduleFieldValue;
  onValueChange: (value: ScheduleFieldValue) => void;
  /**
   * `minute` (the default): times have hours and minutes, and Custom has a Minute select. `hour`:
   * times are whole hours and there is no Minute anywhere, for a schedule stored without minutes
   * (the disks slice's self-tests). `minute` is then left as it is.
   */
  precision?: "minute" | "hour";
  /** The frequencies offered, in order. All five by default. */
  frequencies?: readonly ScheduleFrequency[];
  /**
   * `true` (the default): the When choice offers "Only when I start it" and "On a schedule". `false`:
   * only the schedule, with `labels.legend` naming its group; `mode` is left as it is.
   */
  offerManual?: boolean;
  /**
   * Shown on Custom while `value.stored`: the stored schedule in words, with its values, and that it
   * is kept until a select below is changed.
   */
  storedNote?: React.ReactNode;
  /** The line under the field: "Times are the NAS's clock (NAS time)." */
  clock?: React.ReactNode;
  errors?: ScheduleFieldErrors;
  /**
   * Unavailable: every control stays focusable and says so (`aria-disabled`), with `disabledReason`
   * as the description. Nothing can be changed.
   */
  disabled?: boolean;
  /** Why it is unavailable, under the legend: "Saving…". */
  disabledReason?: React.ReactNode;
  /** How a number reads in a list. Two digits for hours and minutes, plain for days by default. */
  formatNumber?: (value: number, part: "minute" | "hour" | "day") => string;
  className?: string;
}

interface Option {
  value: string;
  label: string;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const defaultFormat = (value: number, part: "minute" | "hour" | "day") =>
  part === "day" ? String(value) : String(value).padStart(2, "0");

/** A stored value no option offers stays visible as itself until it is changed (design 0.7). */
function withStored(options: readonly Option[], value: string) {
  return options.some((option) => option.value === value)
    ? { options, odd: null }
    : { options: [...options, { value, label: value }], odd: value };
}

interface ScheduleSelectProps {
  label: React.ReactNode;
  /** Hides the label, for a select named inside a labelled group (At's hour and minute). */
  labelHidden?: boolean;
  value: string;
  options: readonly Option[];
  onValueChange: (value: string) => void;
  note?: React.ReactNode;
  error?: React.ReactNode;
  /** Ids of lines outside the select that describe it (a group's error). */
  describedBy?: string;
  unavailable: boolean;
  className?: string;
}

/** One labelled select of the field, on the library's Select. */
function ScheduleSelect({
  label,
  labelHidden = false,
  value,
  options: baseOptions,
  onValueChange,
  note,
  error,
  describedBy: outerDescribedBy,
  unavailable,
  className,
}: ScheduleSelectProps) {
  const id = React.useId();
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  const { options, odd } = withStored(baseOptions, value);
  const describedBy =
    [note ? noteId : null, error ? errorId : null, outerDescribedBy ?? null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div
      data-slot="schedule-select"
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <Select
        items={options}
        value={value}
        readOnly={unavailable}
        // Read-only alone still let the list open on a slow runner; an unavailable select never opens.
        {...(unavailable ? { open: false } : null)}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onValueChange(next);
          }
        }}
      >
        <SelectLabel
          className={cn(
            labelHidden && "sr-only",
            unavailable && "text-muted-foreground",
          )}
        >
          {label}
        </SelectLabel>
        <SelectTrigger
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          {...(unavailable ? { "aria-disabled": true } : null)}
          data-odd={odd !== null || undefined}
          className={cn(
            odd !== null && "font-mono",
            unavailable &&
              "cursor-not-allowed bg-muted text-subtle-foreground hover:bg-muted",
          )}
        />
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className={option.value === odd ? "font-mono" : undefined}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {note ? (
        <p id={noteId} className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
      {error ? <PartError id={errorId}>{error}</PartError> : null}
    </div>
  );
}

function PartError({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      data-slot="schedule-field-error"
      className="flex items-start gap-1.5 text-sm text-critical-label"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
      />
      <span>{children}</span>
    </p>
  );
}

/**
 * When something runs (phase 5 services design 0.7 and 5.2 field 6): "Only when I start it" or "On a
 * schedule", and with a schedule a How often list (Every hour, Every day, Every week, Every month,
 * Custom) followed by the chosen frequency's selects: At (hour and minute), On (weekday), On day,
 * At minutes past, or Custom's five parts, each with an "Every …" first option. A stored schedule the
 * selects cannot make opens on Custom with the caller's sentence and its values, and is kept until a
 * Custom select is changed.
 *
 * Controlled and wordless: every word, weekday and month name comes from the caller, so the locale
 * decides; the caller maps the value to what it stores and checks it. Every control is a Base UI
 * Select or radio, so the keyboard reaches and changes each one. The selects stack at 320px.
 */
function ScheduleField({
  labels,
  weekdayNames,
  monthNames,
  value,
  onValueChange,
  precision = "minute",
  frequencies = SCHEDULE_FREQUENCIES,
  offerManual = true,
  storedNote,
  clock,
  errors = {},
  disabled = false,
  disabledReason,
  formatNumber = defaultFormat,
  className,
}: ScheduleFieldProps) {
  const id = React.useId();
  const legendId = `${id}-legend`;
  const reasonId = `${id}-reason`;
  const clockId = `${id}-clock`;
  const atId = `${id}-at`;
  const timeErrorId = `${id}-time-error`;
  const customId = `${id}-custom`;
  const customNoteId = `${id}-custom-note`;
  const storedId = `${id}-stored`;
  const customErrorId = `${id}-custom-error`;
  const withMinutes = precision === "minute";

  const set = (patch: Partial<ScheduleFieldValue>) =>
    onValueChange({ ...value, ...patch });
  const setCustom = (patch: Partial<ScheduleCustomParts>) =>
    onValueChange({
      ...value,
      custom: { ...value.custom, ...patch },
      stored: false,
    });

  const numbers = (
    from: number,
    to: number,
    part: "minute" | "hour" | "day",
  ): Option[] =>
    range(from, to).map((n) => ({
      value: String(n),
      label: formatNumber(n, part),
    }));
  const hours = numbers(0, 23, "hour");
  const minutes = numbers(0, 59, "minute");
  const days = numbers(1, 31, "day");
  const weekdays: Option[] = weekdayNames.map((name, index) => ({
    value: String(index + 1),
    label: name,
  }));
  const months: Option[] = monthNames.map((name, index) => ({
    value: String(index + 1),
    label: name,
  }));
  const every = (part: keyof ScheduleCustomParts, options: Option[]) => [
    { value: "*", label: labels.every[part] },
    ...options,
  ];

  const time = (
    <div
      role="group"
      aria-labelledby={atId}
      aria-describedby={errors.time ? timeErrorId : undefined}
      data-slot="schedule-field-time"
      className="flex flex-col gap-1"
    >
      <p
        id={atId}
        className={cn(
          "text-base font-medium text-foreground",
          disabled && "text-muted-foreground",
        )}
      >
        {labels.at}
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <ScheduleSelect
          label={labels.hour}
          labelHidden
          value={value.hour}
          options={hours}
          onValueChange={(hour) => set({ hour })}
          unavailable={disabled}
          describedBy={errors.time ? timeErrorId : undefined}
          className="w-24"
        />
        {withMinutes ? (
          <ScheduleSelect
            label={labels.minute}
            labelHidden
            value={value.minute}
            options={minutes}
            onValueChange={(minute) => set({ minute })}
            unavailable={disabled}
            describedBy={errors.time ? timeErrorId : undefined}
            className="w-24"
          />
        ) : null}
      </div>
      {errors.time ? (
        <PartError id={timeErrorId}>{errors.time}</PartError>
      ) : null}
    </div>
  );

  let parts: React.ReactNode = null;
  switch (value.frequency) {
    case "hourly":
      parts = withMinutes ? (
        <ScheduleSelect
          label={labels.minutesPast}
          value={value.minute}
          options={minutes}
          onValueChange={(minute) => set({ minute })}
          error={errors.minutesPast}
          unavailable={disabled}
          className="w-24"
        />
      ) : null;
      break;
    case "daily":
      parts = time;
      break;
    case "weekly":
      parts = (
        <>
          <ScheduleSelect
            label={labels.weekday}
            value={value.weekday}
            options={weekdays}
            onValueChange={(weekday) => set({ weekday })}
            error={errors.weekday}
            unavailable={disabled}
            className="max-w-xs"
          />
          {time}
        </>
      );
      break;
    case "monthly":
      parts = (
        <>
          <ScheduleSelect
            label={labels.day}
            value={value.day}
            options={days}
            onValueChange={(day) => set({ day })}
            note={Number(value.day) > 28 ? labels.dayNote : undefined}
            error={errors.day}
            unavailable={disabled}
            className="max-w-xs"
          />
          {time}
        </>
      );
      break;
    case "custom": {
      const describedBy =
        [
          labels.customNote ? customNoteId : null,
          value.stored && storedNote ? storedId : null,
          errors.custom ? customErrorId : null,
        ]
          .filter(Boolean)
          .join(" ") || undefined;
      parts = (
        <div
          role="group"
          aria-labelledby={customId}
          aria-describedby={describedBy}
          data-slot="schedule-field-custom"
          className="flex flex-col gap-3"
        >
          {/* Custom's own name for the group: the How often list above shows the same word. */}
          <p id={customId} className="sr-only">
            {labels.frequencies.custom}
          </p>
          {value.stored && storedNote ? (
            <div
              id={storedId}
              data-slot="schedule-field-stored"
              className="rounded-control border border-border bg-muted px-3 py-2 text-sm text-foreground"
            >
              {storedNote}
            </div>
          ) : null}
          {labels.customNote ? (
            <p id={customNoteId} className="text-sm text-muted-foreground">
              {labels.customNote}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {withMinutes ? (
              <ScheduleSelect
                label={labels.custom.minute}
                value={value.custom.minute}
                options={every("minute", minutes)}
                onValueChange={(minute) => setCustom({ minute })}
                unavailable={disabled}
              />
            ) : null}
            <ScheduleSelect
              label={labels.custom.hour}
              value={value.custom.hour}
              options={every("hour", hours)}
              onValueChange={(hour) => setCustom({ hour })}
              unavailable={disabled}
            />
            <ScheduleSelect
              label={labels.custom.day}
              value={value.custom.day}
              options={every("day", days)}
              onValueChange={(day) => setCustom({ day })}
              unavailable={disabled}
            />
            <ScheduleSelect
              label={labels.custom.month}
              value={value.custom.month}
              options={every("month", months)}
              onValueChange={(month) => setCustom({ month })}
              unavailable={disabled}
            />
            <ScheduleSelect
              label={labels.custom.weekday}
              value={value.custom.weekday}
              options={every("weekday", weekdays)}
              onValueChange={(weekday) => setCustom({ weekday })}
              unavailable={disabled}
            />
          </div>
          {errors.custom ? (
            <PartError id={customErrorId}>{errors.custom}</PartError>
          ) : null}
        </div>
      );
      break;
    }
  }

  const scheduleControls = (
    <div data-slot="schedule-field-schedule" className="flex flex-col gap-4">
      <ScheduleSelect
        label={labels.frequency}
        value={value.frequency}
        options={frequencies.map((frequency) => ({
          value: frequency,
          label: labels.frequencies[frequency],
        }))}
        onValueChange={(frequency) => {
          if ((SCHEDULE_FREQUENCIES as readonly string[]).includes(frequency)) {
            set({ frequency: frequency as ScheduleFrequency });
          }
        }}
        error={errors.frequency}
        unavailable={disabled}
        className="max-w-xs"
      />
      {parts}
    </div>
  );

  const clockLine = clock ? (
    <p
      id={clockId}
      data-slot="schedule-field-clock"
      className="text-sm text-muted-foreground"
    >
      {clock}
    </p>
  ) : null;

  return (
    <div
      data-slot="schedule-field"
      className={cn("flex flex-col gap-2", className)}
    >
      {offerManual ? (
        <RadioGroupField
          legend={labels.legend}
          value={value.mode}
          onValueChange={(mode) => {
            if (mode === "manual" || mode === "schedule") {
              set({ mode });
            }
          }}
          error={errors.mode}
          disabled={disabled}
          focusableWhenDisabled
          disabledReason={disabledReason}
          aria-describedby={clock ? clockId : undefined}
        >
          <RadioOption
            value="manual"
            label={labels.manual}
            hint={labels.manualHint}
          />
          <RadioOption
            value="schedule"
            label={labels.schedule}
            hint={labels.scheduleHint}
          >
            {value.mode === "schedule" ? scheduleControls : null}
          </RadioOption>
        </RadioGroupField>
      ) : (
        <div
          role="group"
          aria-labelledby={legendId}
          aria-describedby={
            [
              disabled && disabledReason ? reasonId : null,
              clock ? clockId : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          className="flex flex-col gap-1"
        >
          <p
            id={legendId}
            className={cn(
              "text-base font-medium text-foreground",
              disabled && "text-muted-foreground",
            )}
          >
            {labels.legend}
          </p>
          {disabled && disabledReason ? (
            <p id={reasonId} className="text-sm text-muted-foreground">
              {disabledReason}
            </p>
          ) : null}
          <div className="mt-1">{scheduleControls}</div>
        </div>
      )}
      {clockLine}
    </div>
  );
}

export { ScheduleField };
export type { ScheduleFieldErrors, ScheduleFieldLabels, ScheduleFieldProps };
