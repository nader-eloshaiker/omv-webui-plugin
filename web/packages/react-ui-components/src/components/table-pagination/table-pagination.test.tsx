// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { TablePagination } from "./table-pagination";

function Pager({
  total,
  onPageSizeChange = () => undefined,
}: {
  total: number;
  onPageSizeChange?: (size: number) => void;
}) {
  const [page, setPage] = React.useState(0);
  const pageSize = 25;
  const pageCount = Math.ceil(total / pageSize);
  const first = page * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);
  return (
    <TablePagination
      aria-label="Pages of shared folders"
      page={page}
      pageCount={pageCount}
      onPageChange={setPage}
      range={`${String(first)}–${String(last)} of ${String(total)}`}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      pageSizeLabel="Rows per page"
      previous={{
        label: "Previous page",
        unavailableReason: "This is the first page.",
      }}
      next={{ label: "Next page", unavailableReason: "This is the last page." }}
    />
  );
}

describe("TablePagination", () => {
  it("moves through the pages, keeps focus on the pressed button and announces the range", async () => {
    const user = userEvent.setup();
    render(<Pager total={60} />);
    expect(
      screen.getByRole("navigation", { name: "Pages of shared folders" }),
    ).toBeInTheDocument();
    const range = screen.getByRole("status");
    expect(range).toHaveTextContent("1–25 of 60");

    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(previous).toHaveAccessibleDescription("This is the first page.");

    await user.click(next);
    expect(range).toHaveTextContent("26–50 of 60");
    expect(previous).not.toHaveAttribute("aria-disabled", "true");
    await user.click(next);
    expect(range).toHaveTextContent("51–60 of 60");
    // At the end the button stays focusable, so focus is not lost, and it says why it is unavailable.
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAccessibleDescription("This is the last page.");
    await user.click(next);
    expect(range).toHaveTextContent("51–60 of 60");
  });

  it("has both buttons unavailable when everything fits on one page", () => {
    render(<Pager total={12} />);
    for (const name of ["Previous page", "Next page"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("offers the page sizes under its label", async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    render(<Pager total={132} onPageSizeChange={onPageSizeChange} />);
    const select = screen.getByRole("combobox", { name: "Rows per page" });
    expect(select).toHaveTextContent("25");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "50" }));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
