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

  describe("when narrow", () => {
    function stacked() {
      render(
        <Table aria-label="Disks">
          <TableHeader>
            <TableRow>
              <TableHead>Disk</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Temperature</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell narrow="title">/dev/sda</TableCell>
              <TableCell narrow="aside">OK</TableCell>
              <TableCell label="Temperature">{null}</TableCell>
              <TableCell>
                <button type="button">Open</button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
    }

    it("says a line's column word before its value, hidden until the table stacks", () => {
      stacked();
      const [, , temperature] = screen.getAllByRole("cell");
      const label = temperature?.querySelector("[data-slot=table-cell-label]");
      expect(label).toHaveTextContent("Temperature");
      expect(label).toHaveClass("hidden", "@max-[40rem]:block");
    });

    it("leaves out a line with no value when stacked", () => {
      stacked();
      const [, , temperature] = screen.getAllByRole("cell");
      expect(
        temperature?.querySelector("[data-slot=table-cell-value]"),
      ).toBeEmptyDOMElement();
      expect(temperature).toHaveClass(
        "@max-[40rem]:has-[>[data-slot=table-cell-value]:empty]:hidden",
      );
    });

    it("places the title, its aside and the lines, and hides the header", () => {
      stacked();
      const [title, aside, , actions] = screen.getAllByRole("cell");
      expect(title).toHaveAttribute("data-narrow", "title");
      expect(aside).toHaveAttribute("data-narrow", "aside");
      expect(actions).toHaveAttribute("data-narrow", "line");
      // A line with no label carries no word of its own.
      expect(actions?.querySelector("[data-slot=table-cell-label]")).toBeNull();
      expect(document.querySelector("thead")).toHaveClass(
        "@max-[40rem]:hidden",
      );
    });

    it("keeps the table's roles when it is drawn as blocks", () => {
      stacked();
      expect(screen.getByRole("table", { name: "Disks" })).toHaveAttribute(
        "role",
        "table",
      );
      for (const row of screen.getAllByRole("row")) {
        expect(row).toHaveAttribute("role", "row");
      }
      for (const cell of screen.getAllByRole("cell")) {
        expect(cell).toHaveAttribute("role", "cell");
      }
    });
  });
});
