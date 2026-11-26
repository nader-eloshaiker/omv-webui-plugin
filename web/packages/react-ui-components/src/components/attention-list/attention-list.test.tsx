// SPDX-License-Identifier: GPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AttentionList, type AttentionItem } from "./attention-list";

const item = (id: string, health: AttentionItem["health"]): AttentionItem => ({
  id,
  health,
  healthLabel: health,
  title: `Thing ${id}`,
  actionLabel: `Act on ${id}`,
});

function renderList(items: AttentionItem[]) {
  return render(
    <AttentionList
      label="What needs you"
      items={items}
      moreLabel={(n) => `${String(n)} more`}
      fewerLabel="Show fewer"
    />,
  );
}

describe("AttentionList", () => {
  it("lists worst first, three, then how many more, and shows them on request", () => {
    renderList([
      item("a", "unknown"),
      item("b", "warning"),
      item("c", "critical"),
      item("d", "warning"),
    ]);
    const region = screen.getByRole("region", { name: "What needs you" });
    expect(
      within(region)
        .getAllByRole("button", { name: /^Act on/ })
        .map((b) => b.textContent),
    ).toEqual(["Act on c", "Act on b", "Act on d"]);
    fireEvent.click(screen.getByRole("button", { name: "1 more" }));
    expect(screen.getByRole("button", { name: "Act on a" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show fewer" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("gives the worst row the filled accent and outlines the others", () => {
    const { container } = renderList([
      item("a", "warning"),
      item("b", "critical"),
    ]);
    const rows = container.querySelectorAll("[data-slot=attention-row]");
    expect(rows[0]).toHaveAttribute("data-health", "critical");
    expect(
      within(rows[0] as HTMLElement).getByRole("button").className,
    ).toMatch(/bg-primary/);
    expect(
      within(rows[1] as HTMLElement).getByRole("button").className,
    ).not.toMatch(/bg-primary/);
  });

  it("says each row's state in words before its title", () => {
    renderList([item("a", "warning")]);
    expect(screen.getByText("warning:")).toHaveClass("sr-only");
  });

  it("renders nothing while nothing needs the person", () => {
    const { container } = renderList([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("raises a row that arrives later, not the ones there at first", () => {
    const { container, rerender } = renderList([item("a", "warning")]);
    expect(container.querySelector("[data-arrived]")).toBeNull();
    rerender(
      <AttentionList
        label="What needs you"
        items={[item("a", "warning"), item("b", "critical")]}
        moreLabel={(n) => `${String(n)} more`}
        fewerLabel="Show fewer"
      />,
    );
    expect(container.querySelector("[data-arrived]")).toHaveAttribute(
      "data-health",
      "critical",
    );
  });

  it("renders backend text as text", () => {
    renderList([
      { ...item("a", "warning"), title: "<img src=x onerror=alert(1)>" },
    ]);
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
  });
});
