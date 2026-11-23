// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FirewallRuleList,
  type FirewallRuleListLabels,
  type FirewallRuleListProps,
  type FirewallRuleRow,
} from "./firewall-rule-list";

const labels: FirewallRuleListLabels = {
  name: "Firewall rules",
  columns: {
    position: "#",
    then: "Then",
    traffic: "Traffic",
    peer: "From / To",
    note: "Note",
    actions: "Actions",
  },
  actions: {
    allow: "Allow",
    refuse: "Refuse",
    ignore: "Ignore",
    log: "Note in the log",
    count: "Count only",
  },
  moveUp: (n) => `Move rule ${String(n)} up`,
  moveDown: (n) => `Move rule ${String(n)} down`,
  alreadyFirst: "Already first",
  alreadyLast: "Already last",
  change: "Change…",
  changeName: (n) => `Change rule ${String(n)}`,
  delete: "Delete…",
  deleteName: (n) => `Delete rule ${String(n)}`,
  moved: (from, to) => `Rule ${String(from)} is now rule ${String(to)}.`,
  orderUnsaved: "The new order is not saved.",
  discard: "Discard",
};

const RULES: FirewallRuleRow[] = [
  {
    id: "ssh",
    action: "allow",
    traffic: "Coming in, TCP to port 22 (SSH)",
    peer: "Computers on 192.0.2.0/24 (256 addresses)",
  },
  {
    id: "smb",
    action: "refuse",
    traffic: "Coming in, TCP to port 445 (Windows and Mac sharing)",
    peer: "Any computer",
    note: "No sharing from the guest network",
  },
  {
    id: "rest",
    action: "ignore",
    traffic: "Coming in, any kind",
    peer: "Any computer",
  },
];

function Live({
  initial = RULES,
  ...props
}: Partial<FirewallRuleListProps<FirewallRuleRow>> & {
  initial?: FirewallRuleRow[];
}) {
  const [rules, setRules] = React.useState(initial);
  const unsaved = rules !== initial;
  return (
    <FirewallRuleList
      labels={labels}
      rules={rules}
      onOrderChange={setRules}
      unsaved={unsaved}
      saveLabel="Save the new order"
      onDiscard={() => setRules(initial)}
      {...props}
    />
  );
}

function positions() {
  return screen
    .getAllByRole("rowheader")
    .map((cell) => cell.closest("tr")?.getAttribute("data-action"));
}

describe("FirewallRuleList", () => {
  it("lists the rules in order in a named scrolling region, with neutral action icons", () => {
    render(<Live />);
    expect(
      screen.getByRole("region", { name: "Firewall rules" }),
    ).toHaveAttribute("tabindex", "0");
    const table = screen.getByRole("table", { name: "Firewall rules" });
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(["1", "2", "3"]);
    for (const icon of table.querySelectorAll("tbody svg")) {
      expect(icon.getAttribute("class")).not.toMatch(/ok|critical|warning/);
    }
    expect(within(table).getByText("Refuse")).toBeInTheDocument();
  });

  it("keeps focus on the same button of the moved row and says where it went", async () => {
    const user = userEvent.setup();
    render(<Live />);
    await user.click(screen.getByRole("button", { name: "Move rule 2 up" }));
    expect(positions()).toEqual(["refuse", "allow", "ignore"]);
    // The moved rule is now rule 1: its Move up keeps focus and is unavailable there.
    const moved = screen.getByRole("button", { name: "Move rule 1 up" });
    expect(moved).toHaveFocus();
    expect(moved).toHaveAttribute("aria-disabled", "true");
    expect(moved).toHaveAccessibleDescription("Already first");
    expect(
      document.querySelector('[data-slot="firewall-rule-list-announcer"]'),
    ).toHaveTextContent("Rule 2 is now rule 1.");

    // Keyboard: Enter on the focused Move down moves it back down.
    screen.getByRole("button", { name: "Move rule 1 down" }).focus();
    await user.keyboard("{Enter}");
    expect(positions()).toEqual(["allow", "refuse", "ignore"]);
    expect(
      screen.getByRole("button", { name: "Move rule 2 down" }),
    ).toHaveFocus();
    expect(
      document.querySelector('[data-slot="firewall-rule-list-announcer"]'),
    ).toHaveTextContent("Rule 1 is now rule 2.");
  });

  it("does nothing for the first row's Move up and the last row's Move down", async () => {
    const user = userEvent.setup();
    const onOrderChange = vi.fn();
    render(
      <FirewallRuleList
        labels={labels}
        rules={RULES}
        onOrderChange={onOrderChange}
      />,
    );
    const last = screen.getByRole("button", { name: "Move rule 3 down" });
    expect(last).toHaveAccessibleDescription("Already last");
    await user.click(last);
    await user.click(screen.getByRole("button", { name: "Move rule 1 up" }));
    expect(onOrderChange).not.toHaveBeenCalled();
  });

  it("shows the unsaved-order bar after a move, with the caller's save button and Discard", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Live onSave={onSave} />);
    expect(screen.queryByText("The new order is not saved.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Move rule 3 up" }));
    expect(screen.getByText("The new order is not saved.")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Save the new order" }),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(positions()).toEqual(["allow", "refuse", "ignore"]);
    expect(screen.queryByText("The new order is not saved.")).toBeNull();
  });

  it("names Change and Delete by the rule's position", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(<Live onChange={onChange} onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: "Change rule 2" }));
    expect(onChange).toHaveBeenCalledWith(RULES[1], 2);
    await user.click(screen.getByRole("button", { name: "Delete rule 3" }));
    expect(onDelete).toHaveBeenCalledWith(RULES[2], 3);
  });

  it("shows the caller's empty state when there are no rules", () => {
    render(<Live initial={[]} empty={<p>No firewall rules.</p>} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No firewall rules.")).toBeInTheDocument();
  });

  it("holds every move while the order is being saved", () => {
    render(
      <FirewallRuleList
        labels={labels}
        rules={RULES}
        onOrderChange={() => undefined}
        unsaved
        saving
        saveLabel="Save the new order"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Move rule 2 up" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Save the new order" }),
    ).toHaveAttribute("aria-busy", "true");
  });
});
