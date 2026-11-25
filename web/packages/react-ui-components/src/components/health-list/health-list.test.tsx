// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HealthList, HealthListItem, HealthListSkeleton } from "./health-list";

describe("HealthList", () => {
  it("reads each item in order: the status word, the name, the detail and the reason", () => {
    render(
      <HealthList aria-label="Disks">
        <HealthListItem
          status="critical"
          statusLabel="Critical"
          name="/dev/sda"
          nameVariant="identifier"
          detail="Example HDD 4TB, 3.6 TiB"
          reason="It may fail soon."
          note="Monitoring off"
        />
        <HealthListItem status="ok" statusLabel="OK" name="/dev/sdb" />
      </HealthList>,
    );
    const items = within(
      screen.getByRole("list", { name: "Disks" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toBe(
      "Critical/dev/sdaExample HDD 4TB, 3.6 TiBIt may fail soon.Monitoring off",
    );
    expect(items[0]).toHaveAttribute("data-status", "critical");
    expect(within(items[0]!).getByText("/dev/sda")).toHaveClass("font-mono");
    expect(items[1]).toHaveTextContent("OK/dev/sdb");
    expect(
      items[1]?.querySelector("[data-slot=health-list-reason]"),
    ).toBeNull();
  });

  it("renders a markup-looking name as text", () => {
    render(
      <HealthList>
        <HealthListItem
          status="unknown"
          statusLabel="Unknown"
          name={'<img src=x onerror="alert(1)">'}
        />
      </HealthList>,
    );
    const item = screen.getByRole("listitem");
    expect(item.querySelector("img")).toBeNull();
    expect(item).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it("leaves the status out of an item that makes no claim", () => {
    render(
      <HealthList>
        <HealthListItem name="enp2s0" />
      </HealthList>,
    );
    expect(
      screen.getByRole("listitem").querySelector("[data-slot=status-pill]"),
    ).toBeNull();
  });

  it("hides its skeleton rows from assistive technology", () => {
    const { container } = render(<HealthListSkeleton rows={3} />);
    const list = container.querySelector("[data-slot=health-list-skeleton]");
    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(list?.querySelectorAll("li")).toHaveLength(3);
  });
});
