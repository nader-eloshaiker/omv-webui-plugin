// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ScheduleField,
  type ScheduleFieldLabels,
  type ScheduleFieldProps,
} from "./schedule-field";
import {
  defaultScheduleValue,
  type ScheduleFieldValue,
} from "./schedule-value";

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

function Controlled({
  initial = defaultScheduleValue,
  onValueChange,
  ...props
}: Partial<ScheduleFieldProps> & { initial?: ScheduleFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ScheduleField
      labels={labels}
      weekdayNames={weekdayNames}
      monthNames={monthNames}
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

async function choose(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  option: string,
) {
  await user.click(screen.getByRole("combobox", { name }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("ScheduleField", () => {
  it("opens every day at 03:00 on a schedule", () => {
    render(<Controlled />);
    expect(screen.getByRole("radio", { name: "On a schedule" })).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "How often" }),
    ).toHaveTextContent("Every day");
    const at = screen.getByRole("group", { name: "At" });
    expect(
      within(at).getByRole("combobox", { name: "Hour" }),
    ).toHaveTextContent("03");
    expect(
      within(at).getByRole("combobox", { name: "Minute" }),
    ).toHaveTextContent("00");
  });

  it("hides the schedule's controls when it runs only when started, and keeps its parts", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.click(
      screen.getByRole("radio", { name: "Only when I start it" }),
    );
    expect(screen.queryByRole("combobox", { name: "How often" })).toBeNull();
    expect(onValueChange).toHaveBeenLastCalledWith({
      ...defaultScheduleValue,
      mode: "manual",
    });
  });

  it("shows each frequency's own controls", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await choose(user, "How often", "Every hour");
    expect(
      screen.getByRole("combobox", { name: "At minutes past" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "At" })).toBeNull();

    await choose(user, "How often", "Every week");
    expect(screen.getByRole("combobox", { name: "On" })).toHaveTextContent(
      "Monday",
    );
    expect(screen.getByRole("group", { name: "At" })).toBeInTheDocument();

    await choose(user, "How often", "Every month");
    expect(screen.getByRole("combobox", { name: "On day" })).toHaveTextContent(
      "1",
    );

    await choose(user, "How often", "Custom");
    const custom = screen.getByRole("group", { name: "Custom" });
    expect(custom).toHaveAccessibleDescription(labels.customNote as string);
    expect(
      within(custom)
        .getAllByRole("combobox")
        .map((select) => select.textContent),
    ).toEqual(["00", "03", "Every day", "Every month", "Every weekday"]);
  });

  it("says that months without the day are skipped only above day 28", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        initial={{ ...defaultScheduleValue, frequency: "monthly" }}
      />,
    );
    expect(
      screen.queryByText("Months without this day are skipped."),
    ).toBeNull();
    await choose(user, "On day", "31");
    expect(
      screen.getByRole("combobox", { name: "On day" }),
    ).toHaveAccessibleDescription("Months without this day are skipped.");
  });

  it("offers Every … first in each Custom select", async () => {
    const user = userEvent.setup();
    render(
      <Controlled initial={{ ...defaultScheduleValue, frequency: "custom" }} />,
    );
    await user.click(screen.getByRole("combobox", { name: "Weekday" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Every weekday",
      ...weekdayNames,
    ]);
  });

  it("shows a stored schedule as itself and drops it once a Custom select changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Controlled
        onValueChange={onValueChange}
        storedNote="Set in the classic interface: every 2 hours, at 0 and 30 minutes past."
        initial={{
          ...defaultScheduleValue,
          frequency: "custom",
          custom: {
            minute: "0,30",
            hour: "*/2",
            day: "*",
            month: "*",
            weekday: "*",
          },
          stored: true,
        }}
      />,
    );
    const custom = screen.getByRole("group", { name: "Custom" });
    expect(custom).toHaveAccessibleDescription(
      expect.stringContaining("every 2 hours"),
    );
    const minute = within(custom).getByRole("combobox", { name: "Minute" });
    expect(minute).toHaveTextContent("0,30");
    expect(minute).toHaveClass("font-mono");
    await choose(user, "Month", "June");
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stored: false,
        custom: {
          minute: "0,30",
          hour: "*/2",
          day: "*",
          month: "6",
          weekday: "*",
        },
      }),
    );
    expect(screen.queryByText(/every 2 hours/)).toBeNull();
  });

  it("keeps a stored schedule while another frequency is looked at", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Controlled
        onValueChange={onValueChange}
        initial={{ ...defaultScheduleValue, frequency: "custom", stored: true }}
      />,
    );
    await choose(user, "How often", "Every day");
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ frequency: "daily", stored: true }),
    );
  });

  it("leaves out every minute with hour precision", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        precision="hour"
        frequencies={["daily", "weekly", "monthly", "custom"]}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Minute" })).toBeNull();
    await user.click(screen.getByRole("combobox", { name: "How often" }));
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Every day", "Every week", "Every month", "Custom"]);
    await user.click(screen.getByRole("option", { name: "Custom" }));
    expect(
      within(screen.getByRole("group", { name: "Custom" }))
        .getAllByRole("combobox")
        .map((select) => select.getAttribute("aria-labelledby") !== null),
    ).toHaveLength(4);
  });

  it("can offer only the schedule, named by the legend", () => {
    render(
      <Controlled offerManual={false} clock="Times are the NAS's clock." />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByRole("group", { name: "When" }),
    ).toHaveAccessibleDescription("Times are the NAS's clock.");
  });

  it("gives the NAS-clock line as the When choice's description", () => {
    render(<Controlled clock="Times are the NAS's clock (NAS time)." />);
    expect(
      screen.getByRole("radiogroup", { name: "When" }),
    ).toHaveAccessibleDescription("Times are the NAS's clock (NAS time).");
  });

  it("shows each error under its part and as its description", () => {
    render(
      <Controlled
        initial={{ ...defaultScheduleValue, frequency: "weekly" }}
        errors={{
          weekday: "Choose a day of the week.",
          time: "Choose a time.",
        }}
      />,
    );
    const weekday = screen.getByRole("combobox", { name: "On" });
    expect(weekday).toHaveAttribute("aria-invalid", "true");
    expect(weekday).toHaveAccessibleDescription("Choose a day of the week.");
    expect(
      screen.getByRole("combobox", { name: "Hour" }),
    ).toHaveAccessibleDescription("Choose a time.");
  });

  it("is reached and changed with the keyboard alone", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.tab();
    expect(screen.getByRole("radio", { name: "On a schedule" })).toHaveFocus();
    await user.tab();
    const often = screen.getByRole("combobox", { name: "How often" });
    expect(often).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onValueChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ frequency: "weekly" }),
    );
  });

  it("stays focusable when unavailable, says why, and changes nothing", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Controlled
        onValueChange={onValueChange}
        disabled
        disabledReason="Saving…"
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "When" });
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(group).toHaveAccessibleDescription("Saving…");
    await user.click(
      screen.getByRole("radio", { name: "Only when I start it" }),
    );
    const often = screen.getByRole("combobox", { name: "How often" });
    expect(often).toHaveAttribute("aria-disabled", "true");
    await user.click(often);
    expect(screen.queryByRole("option")).toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
