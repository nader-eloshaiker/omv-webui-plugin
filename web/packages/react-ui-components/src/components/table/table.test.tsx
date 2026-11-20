// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

describe("Table", () => {
  it("states the sort direction on the column header", () => {
    render(
      <Table aria-label="Disks">
        <TableHeader>
          <TableRow>
            <TableHead sort="ascending" onSort={() => undefined}>
              Device
            </TableHead>
            <TableHead sort="none" onSort={() => undefined} numeric>
              Capacity
            </TableHead>
            <TableHead>Health</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell mono>/dev/sda</TableCell>
            <TableCell numeric>3.6 TiB</TableCell>
            <TableCell>OK</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const [device, capacity, health] = screen.getAllByRole("columnheader");
    expect(device).toHaveAttribute("aria-sort", "ascending");
    expect(capacity).toHaveAttribute("aria-sort", "none");
    expect(health).not.toHaveAttribute("aria-sort");
    expect(screen.getByRole("button", { name: "Device" })).toBeInTheDocument();
  });
});
