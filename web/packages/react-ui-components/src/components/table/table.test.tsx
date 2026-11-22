// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
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

  it("makes the scrolling frame a named, focusable region when asked", () => {
    const { rerender } = render(
      <Table aria-label="Processes" frameLabel="Processes, scrolls sideways">
        <TableBody>
          <TableRow>
            <TableCell>systemd</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const frame = screen.getByRole("region", {
      name: "Processes, scrolls sideways",
    });
    expect(frame).toHaveAttribute("tabindex", "0");
    expect(frame).toHaveAttribute("data-slot", "table-frame");
    rerender(
      <Table aria-label="Processes">
        <TableBody />
      </Table>,
    );
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

describe("TableGroupRow", () => {
  function PoolDisks({
    heading = "Mirror, 2 disks",
    description = "Protected: one disk of the two can fail without losing files.",
  }: {
    heading?: string;
    description?: string;
  }) {
    return (
      <Table aria-label="Disks of pool tank">
        <TableHeader>
          <TableRow>
            <TableHead>Disk</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableGroupRow
            colSpan={2}
            id="group-mirror-0"
            heading={heading}
            description={description}
          />
          <TableRow>
            <TableCell mono>/dev/sdb</TableCell>
            <TableCell>Working</TableCell>
          </TableRow>
        </TableBody>
        <TableBody>
          <TableGroupRow colSpan={2} heading="Read cache, 1 disk" />
          <TableRow>
            <TableCell mono>/dev/nvme0n1</TableCell>
            <TableCell>Working</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  it("is a row-group header spanning the columns", () => {
    render(<PoolDisks />);
    const header = screen.getByRole("rowheader", { name: /Mirror, 2 disks/ });
    expect(header.tagName).toBe("TH");
    expect(header).toHaveAttribute("scope", "rowgroup");
    expect(header).toHaveAttribute("colspan", "2");
    expect(header).toHaveAttribute("id", "group-mirror-0");
    expect(header.closest("tr")).toHaveAttribute(
      "data-slot",
      "table-group-row",
    );
  });

  it("shows the description under the heading, and nothing when there is none", () => {
    render(<PoolDisks />);
    const [mirror, cache] = screen.getAllByRole("rowheader");
    expect(mirror).toHaveTextContent(
      "Mirror, 2 disksProtected: one disk of the two can fail without losing files.",
    );
    expect(cache).toHaveTextContent(/^Read cache, 1 disk$/);
  });

  it("opens each body, so each group's rows follow their own heading", () => {
    render(<PoolDisks />);
    const bodies = document.querySelectorAll("tbody");
    expect(bodies).toHaveLength(2);
    bodies.forEach((body) => {
      expect(body.firstElementChild).toHaveAttribute(
        "data-slot",
        "table-group-row",
      );
    });
  });

  it("renders the heading and description as text, not markup", () => {
    render(
      <PoolDisks
        heading={'<img src="x" alt="injected"> Mirror'}
        description="<script>alert(1)</script>"
      />,
    );
    expect(
      screen.getByText('<img src="x" alt="injected"> Mirror'),
    ).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("img, script")).toBeNull();
  });
});
