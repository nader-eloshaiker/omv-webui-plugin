// SPDX-License-Identifier: GPL-3.0-or-later
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AccessGrid,
  type AccessGridProps,
  type AccessGridRow,
} from "./access-grid";

type Access = "rw" | "ro" | "none" | "blocked";

const OPTIONS = [
  { value: "rw", label: "Read and write" },
  { value: "ro", label: "Read only" },
  { value: "none", label: "No access" },
  { value: "blocked", label: "Blocked" },
] as const;

const NORMAL: readonly Access[] = ["rw", "ro", "none"];

function row(
  id: string,
  name: string,
  value: Access,
  extra: Partial<AccessGridRow<Access>> = {},
): AccessGridRow<Access> {
  return {
    id,
    name,
    kind: id.startsWith("group:") ? "Group" : "User",
    value,
    initialValue: value,
    ...extra,
  };
}

const ROWS: readonly AccessGridRow<Access>[] = [
  row("group:family", "family", "rw"),
  row("user:alex", "alex", "none", {
    description: "Alex Smith",
    notes: ["Also gets Read and write as a member of family."],
  }),
  row("user:sam", "sam", "ro", { description: "Office laptop" }),
  row("user:old", "old", "blocked", {
    allowedValues: ["rw", "ro", "none", "blocked"],
    notes: ["Blocked: cannot open it, even through a group."],
  }),
  row("user:admin", "admin", "none", {
    unavailableReason:
      "The web interface's administrator account cannot be given access to shared folders.",
  }),
];

const BASE: Omit<AccessGridProps<Access>, "rows" | "onChange" | "onSetAll"> = {
  "aria-label": "Who can use media",
  columns: { name: "Name", kind: "Kind", access: "Access" },
  options: OPTIONS,
  normalValues: NORMAL,
  accessValues: ["rw", "ro"],
  rowLabel: (name) => `Access for ${name}`,
  changedLabel: "Changed",
  search: { label: "Search people and groups", clearLabel: "Clear the search" },
  show: {
    label: "Show",
    all: "Everyone",
    withAccess: "With access",
    changed: "Changed",
  },
  setAll: {
    label: "Set all shown to",
    applyLabel: (count) => `Apply to ${String(count)} shown`,
  },
  countText: (shown, total) =>
    `${String(shown)} of ${String(total)} people and groups.`,
  filteredEmpty: {
    message: (search) => `No people or groups match "${search}".`,
    clearLabel: "Clear the search",
  },
  pagination: {
    "aria-label": "Pages of people and groups",
    pageSizeLabel: "Rows per page",
    previous: {
      label: "Previous page",
      unavailableReason: "This is the first page.",
    },
    next: { label: "Next page", unavailableReason: "This is the last page." },
    range: (first, last, shown) =>
      `${String(first)}–${String(last)} of ${String(shown)}`,
  },
  empty: { message: "There are no user accounts on this NAS yet." },
};

/** Holds the values as the app would, and reports each call. */
function Grid({
  rows = ROWS,
  onChange = () => undefined,
  onSetAll = () => undefined,
  ...rest
}: Partial<AccessGridProps<Access>>) {
  const [values, setValues] = React.useState<Record<string, Access>>({});
  const shown = rows.map((r) => ({ ...r, value: values[r.id] ?? r.value }));
  return (
    <AccessGrid<Access>
      {...BASE}
      {...rest}
      rows={shown}
      onChange={(id, value) => {
        setValues((before) => ({ ...before, [id]: value }));
        onChange(id, value);
      }}
      onSetAll={(ids, value) => {
        setValues((before) => ({
          ...before,
          ...Object.fromEntries(ids.map((id) => [id, value])),
        }));
        onSetAll(ids, value);
      }}
    />
  );
}

function bodyRows() {
  const table = screen.getByRole("table", { name: "Who can use media" });
  return within(table)
    .getAllByRole("row")
    .filter((r) => within(r).queryByRole("rowheader") !== null);
}

describe("AccessGrid", () => {
  it("is a named table with a row header per row and a choice named by the row", () => {
    render(<Grid />);
    const table = screen.getByRole("table", { name: "Who can use media" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Name", "Kind", "Access"]);
    expect(bodyRows()).toHaveLength(5);
    const alex = screen.getByRole("radiogroup", { name: "Access for alex" });
    expect(
      within(alex).getByRole("radio", { name: "No access" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("rowheader", { name: /alex/ })).toHaveTextContent(
      "alexAlex SmithAlso gets Read and write as a member of family.",
    );
    expect(screen.getByText("alex")).toHaveAttribute("dir", "auto");
    expect(screen.getByText("5 of 5 people and groups.")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("offers the fourth value only on the row that holds it", () => {
    render(<Grid />);
    const old = screen.getByRole("radiogroup", { name: "Access for old" });
    expect(within(old).getAllByRole("radio")).toHaveLength(4);
    expect(within(old).getByRole("radio", { name: "Blocked" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const sam = screen.getByRole("radiogroup", { name: "Access for sam" });
    expect(within(sam).getAllByRole("radio")).toHaveLength(3);
  });

  it("makes an unavailable row's choice unavailable, with the reason as text in the row", () => {
    render(<Grid />);
    const admin = screen.getByRole("radiogroup", { name: "Access for admin" });
    expect(admin).toHaveAttribute("aria-disabled", "true");
    expect(admin).toHaveAccessibleDescription(
      "The web interface's administrator account cannot be given access to shared folders.",
    );
  });

  it("is one tab stop per row, the arrows changing that row only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Grid onChange={onChange} />);
    act(() => {
      screen.getByRole("button", { name: /Apply to/ }).focus();
    });
    // Toolbar, then one stop per available row.
    const family = screen.getByRole("radiogroup", {
      name: "Access for family",
    });
    await user.tab();
    expect(
      within(family).getByRole("radio", { name: "Read and write" }),
    ).toHaveFocus();
    await user.tab();
    const alex = screen.getByRole("radiogroup", { name: "Access for alex" });
    expect(
      within(alex).getByRole("radio", { name: "No access" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("user:alex", "ro");
    await user.tab();
    const sam = screen.getByRole("radiogroup", { name: "Access for sam" });
    expect(within(sam).getByRole("radio", { name: "Read only" })).toHaveFocus();
  });

  it("marks a changed row with the word, describes its choice by it, and clears it when set back", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    const sam = screen.getByRole("radiogroup", { name: "Access for sam" });
    expect(
      screen.queryByText("Changed", {
        selector: "[data-slot=access-grid-changed]",
      }),
    ).toBeNull();
    await user.click(
      within(sam).getByRole("radio", { name: "Read and write" }),
    );
    const samRow = sam.closest("tr");
    expect(samRow).toHaveAttribute("data-changed", "true");
    expect(sam).toHaveAccessibleDescription("Changed");
    await user.click(within(sam).getByRole("radio", { name: "Read only" }));
    expect(samRow).not.toHaveAttribute("data-changed");
  });

  it("uses the app's changed flag over the initial value when given", () => {
    render(<Grid rows={[row("user:sam", "sam", "ro", { changed: true })]} />);
    expect(
      screen.getByRole("radiogroup", { name: "Access for sam" }),
    ).toHaveAccessibleDescription("Changed");
  });

  it("searches names and descriptions", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search people and groups" }),
      "office",
    );
    expect(bodyRows()).toHaveLength(1);
    expect(
      screen.getByRole("radiogroup", { name: "Access for sam" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 5 people and groups.")).toBeInTheDocument();
  });

  it("filters to rows with access and to changed rows", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(
      await screen.findByRole("option", { name: "With access" }),
    );
    expect(
      bodyRows().map((r) => within(r).getByRole("rowheader").textContent),
    ).toEqual(["family", "samOffice laptop"]);
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(await screen.findByRole("option", { name: "Changed" }));
    expect(bodyRows()).toHaveLength(0);
    expect(
      screen.getByText('No people or groups match "".'),
    ).toBeInTheDocument();
  });

  it("keeps a changed row in view until the filter changes, so it never vanishes under the focus", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(
      await screen.findByRole("option", { name: "With access" }),
    );
    const sam = screen.getByRole("radiogroup", { name: "Access for sam" });
    await user.click(within(sam).getByRole("radio", { name: "No access" }));
    expect(
      screen.getByRole("radiogroup", { name: "Access for sam" }),
    ).toBeInTheDocument();
    expect(within(sam).getByRole("radio", { name: "No access" })).toHaveFocus();
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(await screen.findByRole("option", { name: "Everyone" }));
    await user.click(screen.getByRole("combobox", { name: "Show" }));
    await user.click(
      await screen.findByRole("option", { name: "With access" }),
    );
    expect(
      screen.queryByRole("radiogroup", { name: "Access for sam" }),
    ).toBeNull();
  });

  it("shows the filtered-empty state, whose button clears the search and returns focus to it", async () => {
    const user = userEvent.setup();
    render(<Grid />);
    const search = screen.getByRole("searchbox", {
      name: "Search people and groups",
    });
    await user.type(search, "zz");
    expect(
      screen.getByText('No people or groups match "zz".'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply to 0 shown" }),
    ).toHaveAttribute("aria-disabled", "true");
    // The search field's own clear button carries the same words; the state's button is the other.
    const [, clearState] = screen.getAllByRole("button", {
      name: "Clear the search",
    });
    await user.click(clearState!);
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(bodyRows()).toHaveLength(5);
  });

  it("sets every shown row that can take the value, never an unavailable or Blocked row", async () => {
    const user = userEvent.setup();
    const onSetAll = vi.fn();
    render(<Grid onSetAll={onSetAll} />);
    await user.click(
      screen.getByRole("combobox", { name: "Set all shown to" }),
    );
    await user.click(await screen.findByRole("option", { name: "Read only" }));
    await user.click(screen.getByRole("button", { name: "Apply to 3 shown" }));
    expect(onSetAll).toHaveBeenCalledWith(
      ["group:family", "user:alex", "user:sam"],
      "ro",
    );
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Access for old" }),
      ).getByRole("radio", { name: "Blocked" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("sets only the rows the search shows", async () => {
    const user = userEvent.setup();
    const onSetAll = vi.fn();
    render(<Grid onSetAll={onSetAll} />);
    await user.type(
      screen.getByRole("searchbox", { name: "Search people and groups" }),
      "a",
    );
    // family, alex, sam, admin (unavailable) match; admin is not counted.
    await user.click(screen.getByRole("button", { name: "Apply to 3 shown" }));
    expect(onSetAll).toHaveBeenCalledWith(
      ["group:family", "user:alex", "user:sam"],
      "rw",
    );
  });

  it("while saving, makes every row unavailable and says so in each", () => {
    render(<Grid saving={{ label: "Saving…" }} />);
    for (const group of screen.getAllByRole("radiogroup")) {
      expect(group).toHaveAttribute("aria-disabled", "true");
      expect(group).toHaveAccessibleDescription("Saving…");
    }
    expect(screen.getAllByText("Saving…")).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Apply to 0 shown" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("loads with five hidden skeleton rows and an announced label, and no toolbar", () => {
    render(
      <Grid rows={[]} loading={{ label: "Loading people and groups…" }} />,
    );
    const table = screen.getByRole("table", { name: "Who can use media" });
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(
      table.querySelectorAll(
        '[data-slot="table-skeleton-row"][aria-hidden="true"]',
      ),
    ).toHaveLength(5);
    expect(screen.getByText("Loading people and groups…")).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("shows a read failure with the server's words and a retry", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <Grid
        rows={[]}
        error={{
          message: "Could not read the people and groups on this NAS.",
          serverMessage: {
            label: "Message from the server",
            text: "Connection reset by peer",
          },
          retryLabel: "Try again",
          onRetry,
        }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not read the people and groups on this NAS.",
    );
    expect(alert).toHaveTextContent("Connection reset by peer");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when there are no rows", () => {
    render(<Grid rows={[]} />);
    expect(
      screen.getByText("There are no user accounts on this NAS yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("pages past 50 rows, and searches across every page", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 120 }, (_, i) =>
      row(`user:u${String(i)}`, `user${String(i).padStart(3, "0")}`, "none"),
    );
    render(<Grid rows={many} />);
    expect(bodyRows()).toHaveLength(50);
    expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51–100 of 120")).toBeInTheDocument();
    await user.type(
      screen.getByRole("searchbox", { name: "Search people and groups" }),
      "user11",
    );
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText("1–10 of 10")).toBeInTheDocument();
    expect(
      screen.getByText("10 of 120 people and groups."),
    ).toBeInTheDocument();
  });

  it("does not page at 50 rows or fewer", () => {
    const fifty = Array.from({ length: 50 }, (_, i) =>
      row(`user:u${String(i)}`, `user${String(i)}`, "none"),
    );
    render(<Grid rows={fifty} />);
    expect(bodyRows()).toHaveLength(50);
    expect(
      screen.queryByRole("navigation", { name: "Pages of people and groups" }),
    ).toBeNull();
  });

  it("renders names as text, not markup", () => {
    render(
      <Grid rows={[row("user:x", '<img src="x" alt="injected">', "none")]} />,
    );
    expect(
      screen.getByText('<img src="x" alt="injected">'),
    ).toBeInTheDocument();
    expect(screen.queryByAltText("injected")).toBeNull();
  });
});
