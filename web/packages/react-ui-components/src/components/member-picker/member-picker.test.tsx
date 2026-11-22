// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  MemberPicker,
  type MemberPickerProps,
  type MemberPickerRow,
} from "./member-picker";

const BASE: Omit<MemberPickerProps, "rows" | "value" | "onChange"> = {
  legend: "Groups",
  hint: "Groups give no other powers on the NAS.",
  changedLabel: "Changed",
  search: { label: "Search groups", clearLabel: "Clear the search" },
  show: { label: "Show", all: "All groups", ticked: "Groups alex is in" },
  countText: (count, total) =>
    `In ${String(count)} of ${String(total)} groups.`,
  filteredEmpty: {
    message: (search) => `No groups match "${search}".`,
    clearLabel: "Clear the search",
  },
  pagination: {
    "aria-label": "Pages of groups",
    pageSizeLabel: "Rows per page",
    previous: {
      label: "Previous page",
      unavailableReason: "This is the first page.",
    },
    next: { label: "Next page", unavailableReason: "This is the last page." },
    range: (first, last, shown) =>
      `${String(first)}–${String(last)} of ${String(shown)}`,
  },
  empty: { message: "There are no groups yet." },
};

const FEW: readonly MemberPickerRow[] = [
  { id: "family", name: "family", description: "Everyone at home" },
  { id: "kids", name: "kids" },
  {
    id: "users",
    name: "users",
    unavailableReason: "This is alex's main group, set outside this interface.",
  },
];

/** Twelve groups: past the threshold, so the search and the filter are offered. */
const TWELVE: readonly MemberPickerRow[] = [
  ...FEW,
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `team${String(i + 1)}`,
    name: `team${String(i + 1)}`,
    description: i === 0 ? "Office laptops" : undefined,
  })),
];

/** Holds the ticked ids as the app would, and reports each call. */
function Picker({
  rows = FEW,
  initial = ["family", "users"],
  saved,
  onChange = () => undefined,
  ...rest
}: Partial<Omit<MemberPickerProps, "value" | "initialValue">> & {
  initial?: string[];
  saved?: string[];
}) {
  const [value, setValue] = React.useState<string[]>(initial);
  return (
    <MemberPicker
      {...BASE}
      {...rest}
      rows={rows}
      value={value}
      initialValue={saved ?? initial}
      onChange={(next, change) => {
        setValue(next);
        onChange(next, change);
      }}
    />
  );
}

function boxes() {
  return screen.queryAllByRole("checkbox");
}

describe("MemberPicker", () => {
  it("is a group named by its legend, one checkbox per row named by the row's name", () => {
    render(<Picker />);
    const group = screen.getByRole("group", { name: "Groups" });
    expect(group).toHaveAccessibleDescription(
      "Groups give no other powers on the NAS.",
    );
    expect(boxes()).toHaveLength(3);
    const family = screen.getByRole("checkbox", { name: "family" });
    expect(family).toHaveAttribute("aria-checked", "true");
    expect(family).toHaveAccessibleDescription("Everyone at home");
    expect(screen.getByText("family", { selector: "code" })).toHaveAttribute(
      "dir",
      "auto",
    );
    expect(screen.getByText("Everyone at home")).toHaveAttribute("dir", "auto");
  });

  it("can be named by a heading of the page instead of a legend", () => {
    render(
      <>
        <h2 id="groups-heading">Groups</h2>
        <Picker legend={undefined} aria-labelledby="groups-heading" />
      </>,
    );
    expect(screen.getByRole("group", { name: "Groups" })).toBeInTheDocument();
  });

  it("says how many are ticked, politely", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const count = screen.getByText("In 2 of 3 groups.");
    expect(count).toHaveAttribute("role", "status");
    await user.click(screen.getByRole("checkbox", { name: "kids" }));
    expect(count).toHaveTextContent("In 3 of 3 groups.");
  });

  it("reports the whole new list and the one change, keeping ids it does not show", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Picker initial={["family", "_ssh", "users"]} onChange={onChange} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "kids" }));
    expect(onChange).toHaveBeenLastCalledWith(
      ["family", "_ssh", "users", "kids"],
      { id: "kids", checked: true },
    );
    await user.click(screen.getByRole("checkbox", { name: "family" }));
    expect(onChange).toHaveBeenLastCalledWith(["_ssh", "users", "kids"], {
      id: "family",
      checked: false,
    });
  });

  it("marks a changed row with the word and an edge, describes its box by it, and clears it when set back", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const kids = screen.getByRole("checkbox", { name: "kids" });
    const row = kids.closest("li");
    expect(row).not.toHaveAttribute("data-changed");
    await user.click(kids);
    expect(row).toHaveAttribute("data-changed", "true");
    expect(within(row!).getByText("Changed")).toBeInTheDocument();
    expect(kids).toHaveAccessibleDescription("Changed");
    await user.click(kids);
    expect(row).not.toHaveAttribute("data-changed");
  });

  it("makes an unavailable row focusable but unchangeable, with its reason as text and description", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    const users = screen.getByRole("checkbox", { name: "users" });
    expect(users).toHaveAttribute("aria-disabled", "true");
    expect(users).toHaveAccessibleDescription(
      "This is alex's main group, set outside this interface.",
    );
    expect(
      screen.getByText(
        "This is alex's main group, set outside this interface.",
      ),
    ).toBeVisible();
    await user.click(users);
    await user.click(screen.getByText("users", { selector: "code" }));
    act(() => users.focus());
    expect(users).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).not.toHaveBeenCalled();
    expect(users).toHaveAttribute("aria-checked", "true");
  });

  it("offers no search or filter at ten rows or fewer", () => {
    render(<Picker rows={TWELVE.slice(0, 10)} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Show" })).toBeNull();
    expect(boxes()).toHaveLength(10);
  });

  it("past ten rows puts the search and the filter first, then one stop per box; Space toggles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker rows={TWELVE} onChange={onChange} />);
    await user.tab();
    expect(
      screen.getByRole("searchbox", { name: "Search groups" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "Show" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "family" })).toHaveFocus();
    await user.tab();
    const kids = screen.getByRole("checkbox", { name: "kids" });
    expect(kids).toHaveFocus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith(["family", "users", "kids"], {
      id: "kids",
      checked: true,
    });
    // The unavailable row is still a stop, so its reason is heard.
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "users" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "team1" })).toHaveFocus();
  });

  it("searches names and descriptions", async () => {
    const user = userEvent.setup();
    render(<Picker rows={TWELVE} />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search groups" }),
      "office",
    );
    expect(boxes().map((box) => box.textContent)).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "team1" })).toBeInTheDocument();
    // The count stays the count of ticked rows among all rows.
    expect(screen.getByText("In 2 of 12 groups.")).toBeInTheDocument();
  });

  it("filters to ticked rows, and keeps a row cleared there in view until the filter changes", async () => {
    const user = userEvent.setup();
    render(<Picker rows={TWELVE} />);
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(
      await screen.findByRole("option", { name: "Groups alex is in" }),
    );
    expect(boxes()).toHaveLength(2);
    const family = screen.getByRole("checkbox", { name: "family" });
    await user.click(family);
    expect(family).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: "family" })).toHaveFocus();
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(await screen.findByRole("option", { name: "All groups" }));
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(
      await screen.findByRole("option", { name: "Groups alex is in" }),
    );
    expect(screen.queryByRole("checkbox", { name: "family" })).toBeNull();
  });

  it("shows the filtered-empty state, whose button clears the search and returns focus to it", async () => {
    const user = userEvent.setup();
    render(<Picker rows={TWELVE} />);
    const search = screen.getByRole("searchbox", { name: "Search groups" });
    await user.type(search, "zz");
    expect(screen.getByText('No groups match "zz".')).toBeInTheDocument();
    expect(boxes()).toHaveLength(0);
    const [, clearState] = screen.getAllByRole("button", {
      name: "Clear the search",
    });
    await user.click(clearState!);
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(boxes()).toHaveLength(12);
  });

  it("shows the empty state, with the caller's action, for no rows", () => {
    render(
      <Picker
        rows={[]}
        initial={[]}
        empty={{
          message: "There are no groups yet.",
          action: <a href="#add">Add a group</a>,
        }}
      />,
    );
    expect(screen.getByText("There are no groups yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add a group" }),
    ).toBeInTheDocument();
    expect(boxes()).toHaveLength(0);
    expect(
      screen.queryByText(/groups\.$/, { selector: "[role=status]" }),
    ).toBeNull();
  });

  it("works with one row", () => {
    render(<Picker rows={[{ id: "family", name: "family" }]} initial={[]} />);
    expect(boxes()).toHaveLength(1);
    expect(screen.getByText("In 0 of 1 groups.")).toBeInTheDocument();
  });

  it("pages 1,000 rows at 50, and searches across every page", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 1000 }, (_, i) => ({
      id: `user${String(i).padStart(4, "0")}`,
      name: `user${String(i).padStart(4, "0")}`,
    }));
    render(<Picker rows={many} initial={["user0001", "user0999"]} />);
    expect(boxes()).toHaveLength(50);
    expect(screen.getByText("1–50 of 1000")).toBeInTheDocument();
    expect(screen.getByText("In 2 of 1000 groups.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 1000")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "user0050" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("searchbox", { name: "Search groups" }),
      "user099",
    );
    expect(boxes()).toHaveLength(10);
    expect(screen.getByText("1–10 of 10")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "user0999" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("loads with five hidden skeleton lines and an announced label", () => {
    render(
      <Picker rows={[]} initial={[]} loading={{ label: "Loading groups…" }} />,
    );
    const group = screen.getByRole("group", { name: "Groups" });
    expect(group).toHaveAttribute("aria-busy", "true");
    expect(
      group.querySelectorAll('[data-slot="member-picker-skeleton"]'),
    ).toHaveLength(5);
    expect(screen.getByText("Loading groups…")).toHaveAttribute(
      "role",
      "status",
    );
    expect(boxes()).toHaveLength(0);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("shows a read failure with the server's words and a retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <Picker
        rows={[]}
        initial={[]}
        error={{
          message: "Could not read the groups.",
          serverMessage: {
            label: "Message from the server",
            text: "Failed to execute command 'getent group': exit code 2",
          },
          retryLabel: "Try again",
          onRetry,
        }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not read the groups.");
    expect(alert).toHaveTextContent("exit code 2");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("while saving, makes every box unavailable but focusable and says so once", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker onChange={onChange} saving={{ label: "Saving…" }} />);
    for (const box of boxes()) {
      expect(box).toHaveAttribute("aria-disabled", "true");
      expect(box).toHaveAccessibleDescription(/Saving…/);
    }
    expect(screen.getAllByText("Saving…")).toHaveLength(1);
    expect(screen.getByText("Saving…")).toHaveAttribute("role", "status");
    await user.tab();
    expect(screen.getByRole("checkbox", { name: "family" })).toHaveFocus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("checkbox", { name: "kids" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders markup-looking names and descriptions as text", () => {
    render(
      <Picker
        rows={[
          {
            id: "x",
            name: '<img src=x onerror="alert(1)">',
            description: "<b>not bold</b>",
          },
        ]}
        initial={[]}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: '<img src=x onerror="alert(1)">' }),
    ).toBeInTheDocument();
    expect(screen.getByText("<b>not bold</b>")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
  });
});
