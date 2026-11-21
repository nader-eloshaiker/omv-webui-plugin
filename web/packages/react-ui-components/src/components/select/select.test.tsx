// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "./select";

const GROUPS = [
  {
    label: "The whole system",
    items: [
      { value: "syslog", label: "All system messages (syslog)" },
      { value: "auth", label: "Signing in and permissions (auth)" },
    ],
  },
  {
    label: "Storage, sharing and updates",
    items: [
      { value: "smartd", label: "Disk health monitoring (S.M.A.R.T.)" },
      { value: "apt_term", label: "Software updates" },
    ],
  },
];
const ITEMS = GROUPS.flatMap((g) => g.items);

function LogPicker({ onValueChange }: { onValueChange: (v: unknown) => void }) {
  return (
    <Select items={ITEMS} onValueChange={onValueChange}>
      <SelectLabel>Log</SelectLabel>
      <SelectTrigger placeholder="Choose a log" />
      <SelectContent>
        {GROUPS.map((group) => (
          <SelectGroup key={group.label}>
            <SelectGroupLabel>{group.label}</SelectGroupLabel>
            {group.items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

describe("Select groups", () => {
  it("names each group by its label and keeps the options in order", async () => {
    const user = userEvent.setup();
    render(<LogPicker onValueChange={() => undefined} />);
    const trigger = screen.getByRole("combobox", { name: "Log" });
    expect(trigger).toHaveTextContent("Choose a log");
    await user.click(trigger);
    const groups = await screen.findAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAccessibleName("The whole system");
    expect(groups[1]).toHaveAccessibleName("Storage, sharing and updates");
    expect(
      within(groups[1]!)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Disk health monitoring (S.M.A.R.T.)", "Software updates"]);
  });

  it("commits a choice only when it is chosen, not while the highlight moves", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<LogPicker onValueChange={onValueChange} />);
    await user.click(screen.getByRole("combobox", { name: "Log" }));
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(onValueChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Software updates" }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange.mock.calls[0]?.[0]).toBe("apt_term");
  });
});
