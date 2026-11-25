// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriveBay, DriveBaySkeleton, type DriveSlot } from "./drive-bay";

const SLOTS: DriveSlot[] = [
  {
    id: "sda",
    device: "sda",
    kind: "disk",
    status: "unknown",
    statusLabel: "Not checked",
    role: "System",
    detail: "34 °C",
    link: <a href="#/storage/disks/sda" />,
  },
  {
    id: "sdb",
    device: "sdb",
    kind: "disk",
    status: "unknown",
    statusLabel: "Not checked",
    role: "Data",
    detail: "Asleep",
  },
];

describe("DriveBay", () => {
  it("shows each slot's device, state, role and detail, and links the slots that have a page", () => {
    render(<DriveBay aria-label="The disks in this NAS" slots={SLOTS} />);
    const bay = screen.getByRole("figure", { name: "The disks in this NAS" });
    const items = within(bay).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const link = within(items[0] as HTMLElement).getByRole("link");
    expect(link).toHaveAttribute("href", "#/storage/disks/sda");
    expect(link).toHaveAccessibleName(/sda.*Not checked.*System.*34 °C/);
    expect(within(items[1] as HTMLElement).queryByRole("link")).toBeNull();
    expect(within(items[1] as HTMLElement).getByText("Asleep")).toBeVisible();
  });

  it("draws the generic face for a disk of unknown kind, not a hard disk's vents", () => {
    const { container } = render(
      <DriveBay aria-label="Disks" slots={[SLOTS[1] as DriveSlot]} />,
    );
    // The hard disk and SSD faces carry seven vent lines; the generic face carries one plate line.
    expect(container.querySelectorAll("path.stroke-art-faint")).toHaveLength(1);
  });

  it("turns the caddy's edge and word when a result lands, slot after slot, and draws no light", () => {
    const { container, rerender } = render(
      <DriveBay aria-label="Disks" slots={SLOTS} />,
    );
    // No light, no dot: the state is the icon and the word under the caddy (style guide 10).
    expect(container.querySelectorAll("li svg circle")).toHaveLength(0);
    expect(container.querySelector(".rounded-full")).toBeNull();

    rerender(
      <DriveBay
        aria-label="Disks"
        slots={SLOTS.map((slot, i) => ({
          ...slot,
          status: i === 0 ? "ok" : "critical",
          statusLabel: i === 0 ? "OK" : "Critical",
        }))}
      />,
    );
    const second = container.querySelectorAll("li")[1] as HTMLElement;
    const body = second.querySelector("svg rect");
    expect(body?.getAttribute("class")).toMatch(/stroke-critical-stroke/);
    // The change waits two stagger steps per slot, read from the slot's --stagger-index.
    expect(body?.getAttribute("class")).toMatch(
      /transition-delay:calc\(min\(var\(--stagger-index,0\),11\)\*var\(--motion-stagger\)\*2\)/,
    );
    expect(second.style.getPropertyValue("--stagger-index")).toBe("1");
    expect(within(second).getByText("Critical")).toBeVisible();
    expect(
      container.querySelector("[data-slot=drive-bay]")?.className,
    ).not.toMatch(/gradient|bg-linear/);
  });
});

describe("DriveBaySkeleton", () => {
  it("stands in for the caddies, hidden from assistive technology", () => {
    const { container } = render(<DriveBaySkeleton slots={4} />);
    const root = container.querySelector("[data-slot=drive-bay-skeleton]");
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(
      container.querySelectorAll("[data-slot=skeleton][data-shape=block]"),
    ).toHaveLength(4);
  });
});
