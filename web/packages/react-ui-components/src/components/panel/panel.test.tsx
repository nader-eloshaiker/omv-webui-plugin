// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Panel } from "./panel";
import { panelClass } from "./panel-class";

describe("Panel", () => {
  it("is a section named by its title, raised by default, the note beside the title", () => {
    render(
      <Panel title="Right now" note="Since 10:31, a reading every 2 seconds.">
        <p>Processor 17 %</p>
      </Panel>,
    );
    const region = screen.getByRole("region", { name: "Right now" });
    expect(region.tagName).toBe("SECTION");
    expect(region).toHaveAttribute("data-ground", "raised");
    expect(region.className).toMatch(/\bsurface-raised\b/u);
    expect(region.className).toMatch(/\bp-card\b/u);
    expect(
      screen.getByRole("heading", { level: 2, name: "Right now" }),
    ).toBeVisible();
    expect(
      screen.getByText("Since 10:31, a reading every 2 seconds."),
    ).toBeVisible();
  });

  it("is a plain div with no heading when what is inside carries its own", () => {
    const { container } = render(
      <Panel>
        <h2>First steps</h2>
      </Panel>,
    );
    const panel = container.firstElementChild;
    expect(panel?.tagName).toBe("DIV");
    expect(panel).not.toHaveAttribute("aria-labelledby");
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("draws the plate on the muted ground with no shadow, and names each ground in --ground", () => {
    const { container } = render(
      <Panel ground="plate" title="Your NAS" headingLevel={3} />,
    );
    const plate = container.firstElementChild;
    expect(plate).toHaveAttribute("data-ground", "plate");
    expect(plate?.className).toMatch(/\bbg-muted\b/u);
    expect(plate?.className).not.toMatch(/surface-raised|shadow/u);
    expect(plate?.className).toMatch(/--ground:var\(--theme-muted\)/u);
    expect(panelClass()).toMatch(/--ground:var\(--theme-surface\)/u);
    expect(screen.getByRole("heading", { level: 3 })).toBeVisible();
  });

  it("takes another element through render, and merges a class last", () => {
    render(
      <ul>
        <Panel render={<li />} title="Disk temperatures" className="p-4" />
      </ul>,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveAttribute("data-slot", "panel");
    expect(item.className).toMatch(/\bp-4\b/u);
    expect(item.className).not.toMatch(/\bp-card\b/u);
  });
});
