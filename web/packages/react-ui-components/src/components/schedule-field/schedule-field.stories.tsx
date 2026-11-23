// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  ScheduleField,
  type ScheduleFieldLabels,
  type ScheduleFieldProps,
} from "./schedule-field";
import {
  defaultScheduleValue,
  type ScheduleFieldValue,
} from "./schedule-value";

// The English words of phase 5 services design 5.2 field 6. In the app they come from the catalogue,
// and the weekday and month names from the locale.
const labels: ScheduleFieldLabels = {
  legend: "When",
  manual: "Only when I start it",
  schedule: "On a schedule",
  frequency: "How often",
  frequencies: {
    hourly: "Every hour",
    daily: "Every day",
    weekly: "Every week",
    monthly: "Every month",
    custom: "Custom",
  },
  at: "At",
  hour: "Hour",
  minute: "Minute",
  weekday: "On",
  day: "On day",
  dayNote: "Months without this day are skipped.",
  minutesPast: "At minutes past",
  custom: {
    minute: "Minute",
    hour: "Hour",
    day: "Day of the month",
    month: "Month",
    weekday: "Weekday",
  },
  every: {
    minute: "Every minute",
    hour: "Every hour",
    day: "Every day",
    month: "Every month",
    weekday: "Every weekday",
  },
  customNote:
    "With both a day of the month and a weekday, it runs on days that are either.",
};

const weekdayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const clock = "Times are the NAS's clock.";

const meta = {
  title: "Components/ScheduleField",
  component: ScheduleField,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: {
    labels,
    weekdayNames,
    monthNames,
    value: defaultScheduleValue,
    onValueChange: () => undefined,
  },
} satisfies Meta<typeof ScheduleField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the value, so every select can be used. */
function Live({
  initial = defaultScheduleValue,
  ...props
}: Partial<ScheduleFieldProps> & { initial?: ScheduleFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ScheduleField
      labels={labels}
      weekdayNames={weekdayNames}
      monthNames={monthNames}
      clock={clock}
      {...props}
      value={value}
      onValueChange={setValue}
    />
  );
}

export const OnlyWhenStarted: Story = {
  render: () => <Live initial={{ ...defaultScheduleValue, mode: "manual" }} />,
};

/** A new copy job's default: every day at 03:00. */
export const EveryDay: Story = { render: () => <Live /> };

export const EveryHour: Story = {
  render: () => (
    <Live
      initial={{ ...defaultScheduleValue, frequency: "hourly", minute: "15" }}
    />
  ),
};

export const EveryWeek: Story = {
  render: () => (
    <Live
      initial={{
        ...defaultScheduleValue,
        frequency: "weekly",
        weekday: "7",
        hour: "22",
        minute: "30",
      }}
    />
  ),
};

export const EveryMonth: Story = {
  render: () => (
    <Live
      initial={{ ...defaultScheduleValue, frequency: "monthly", day: "1" }}
    />
  ),
};

/** Above day 28 the note says months without that day are skipped. */
export const EveryMonthOnDay31: Story = {
  render: () => (
    <Live
      initial={{ ...defaultScheduleValue, frequency: "monthly", day: "31" }}
    />
  ),
};

export const Custom: Story = {
  render: () => (
    <Live
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: {
          minute: "45",
          hour: "1",
          day: "15",
          month: "*",
          weekday: "6",
        },
      }}
    />
  ),
};

/** Every Custom select on its "Every …" option. */
export const CustomEveryField: Story = {
  render: () => (
    <Live
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: { minute: "*", hour: "*", day: "*", month: "*", weekday: "*" },
      }}
    />
  ),
};

/** Several values in one part, set in the classic interface: shown as stored until changed. */
export const StoredSeveralValues: Story = {
  render: () => (
    <Live
      storedNote="Set in the classic interface: in January and July, on day 1 and 15, at 02:00 and 14:00, at 0 and 30 minutes past. It is kept as it is until you change a field below."
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: {
          minute: "0,30",
          hour: "2,14",
          day: "1,15",
          month: "1,7",
          weekday: "*",
        },
        stored: true,
      }}
    />
  ),
};

/** "Every N" from the classic interface, with the line about runs that overlap. */
export const StoredEveryN: Story = {
  render: () => (
    <Live
      storedNote={
        <>
          <p>
            Set in the classic interface: every 10 minutes. It is kept as it is
            until you change a field below.
          </p>
          <p className="mt-1">
            A copy job this often may still be running when the next one is due;
            the next one then does not run.
          </p>
        </>
      }
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: {
          minute: "*/10",
          hour: "*",
          day: "*",
          month: "*",
          weekday: "*",
        },
        stored: true,
      }}
    />
  ),
};

/** The browser's time zone differs from the NAS's. */
export const NasTime: Story = {
  render: () => (
    <Live clock="Times are the NAS's clock (NAS time, UTC+01:00). This browser is on UTC−05:00." />
  ),
};

export const Errors: Story = {
  render: () => (
    <Live
      initial={{ ...defaultScheduleValue, frequency: "weekly" }}
      errors={{
        weekday: "Choose a day of the week.",
        time: "Choose a time at least 5 minutes after the last run's usual end.",
      }}
    />
  ),
};

export const CustomError: Story = {
  render: () => (
    <Live
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: { minute: "*", hour: "*", day: "*", month: "*", weekday: "*" },
      }}
      errors={{
        custom:
          "A copy job every minute would start again before it ends. Choose a minute.",
      }}
    />
  ),
};

/** Long weekday and month names from the locale (here Portuguese and Greek). */
export const LongLocaleNames: Story = {
  render: () => (
    <Live
      weekdayNames={[
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
        "domingo",
      ]}
      monthNames={[
        "Ιανουαρίου",
        "Φεβρουαρίου",
        "Μαρτίου",
        "Απριλίου",
        "Μαΐου",
        "Ιουνίου",
        "Ιουλίου",
        "Αυγούστου",
        "Σεπτεμβρίου",
        "Οκτωβρίου",
        "Νοεμβρίου",
        "Δεκεμβρίου",
      ]}
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: {
          minute: "0",
          hour: "3",
          day: "*",
          month: "9",
          weekday: "4",
        },
      }}
    />
  ),
};

/**
 * The disks slice's self-test form: whole hours only, no Every hour and no "only when started"
 * (it has its own on/off checkbox).
 */
export const HoursOnly: Story = {
  render: () => (
    <Live
      precision="hour"
      offerManual={false}
      frequencies={["daily", "weekly", "monthly", "custom"]}
      initial={{ ...defaultScheduleValue, frequency: "weekly", weekday: "7" }}
    />
  ),
};

export const HoursOnlyCustom: Story = {
  render: () => (
    <Live
      precision="hour"
      offerManual={false}
      frequencies={["daily", "weekly", "monthly", "custom"]}
      initial={{ ...defaultScheduleValue, frequency: "custom" }}
    />
  ),
};

export const DisabledWithReason: Story = {
  render: () => (
    <Live
      initial={{ ...defaultScheduleValue, frequency: "weekly" }}
      disabled
      disabledReason="Saving…"
    />
  ),
};

/** 320px wide: the selects stack and nothing scrolls sideways. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Live
      initial={{
        ...defaultScheduleValue,
        frequency: "custom",
        custom: {
          minute: "0",
          hour: "3",
          day: "1",
          month: "*",
          weekday: "*",
        },
      }}
    />
  ),
};
