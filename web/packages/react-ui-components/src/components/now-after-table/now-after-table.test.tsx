// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NowAfterTable, type NowAfterRow } from "./now-after-table";

const labels = {
  name: "What changes",
  setting: "Setting",
  now: "Now",
  after: "After",
  unchanged: "Unchanged",
};

const rows: NowAfterRow[] = [
  {
    id: "method",
    label: "IPv4",
    now: "Automatic (DHCP)",
    after: "A fixed address",
    changed: true,
  },
  {
    id: "address",
    label: "IPv4 address",
    now: "192.0.2.10/24",
    after: "192.0.2.20/24",
    changed: true,
  },
  {
    id: "address6",
    label: "IPv6 address",
    now: "2001:db8::10/64",
    after: "2001:db8::10/64",
    changed: false,
  },
];

describe("NowAfterTable", () => {
  it("names each row by its setting and the columns Now and After", () => {
    render(<NowAfterTable rows={rows} labels={labels} />);
    const table = screen.getByRole("table", { name: "What changes" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Setting", "Now", "After"]);
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent),
    ).toEqual(["IPv4", "IPv4 address", "IPv6 addressUnchanged"]);
  });

  it("sets text values as identifiers, left to right, and marks unchanged rows in words", () => {
    render(<NowAfterTable rows={rows} labels={labels} />);
    const address = screen.getByText("192.0.2.20/24");
    expect(address.tagName).toBe("CODE");
    expect(address).toHaveAttribute("dir", "ltr");
    const changedRow = address.closest("tr");
    expect(changedRow).toHaveAttribute("data-changed", "true");
    const unchangedRow = screen
      .getAllByText("2001:db8::10/64")[0]
      ?.closest("tr");
    expect(unchangedRow).not.toHaveAttribute("data-changed");
    expect(
      within(unchangedRow as HTMLElement).getByText("Unchanged"),
    ).toBeVisible();
  });

  it("labels each value with its column for the stacked layout", () => {
    render(<NowAfterTable rows={rows.slice(0, 1)} labels={labels} />);
    const [now, after] = screen.getAllByRole("cell");
    expect(now).toHaveTextContent("NowAutomatic (DHCP)");
    expect(after).toHaveTextContent("AfterA fixed address");
  });
});
