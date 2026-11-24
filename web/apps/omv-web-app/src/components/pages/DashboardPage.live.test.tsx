// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard when its chart chunk cannot be loaded (dashboard spec 8.3, adversarial note 9: a stale
// cache after an upgrade): each plot says so with "Try again", which tries the import again, and the
// figures keep working from the main chunk. The chunk is the one module replaced here; the network
// is still MSW serving the contract's examples.
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";

const imports = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../dashboard/liveCharts.tsx", () => {
  imports.count += 1;
  throw new Error("Failed to fetch dynamically imported module");
});

describe("Right now without its chart chunk", () => {
  it("says the chart could not be loaded, keeps the figures, and tries again on request", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "checklistHidden",
    });
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
    const live = screen.getByRole("region", { name: "Right now" });
    const processor = within(live).getByRole("group", { name: "Processor" });
    expect(
      await within(processor).findByText("The chart could not be loaded."),
    ).toBeInTheDocument();
    expect(
      within(live).getByRole("group", { name: "Memory" }),
    ).toHaveTextContent("The chart could not be loaded.");
    // The figures come from the main chunk and still work.
    expect(processor).toHaveTextContent("<1 %");
    // The rest of the page is unaffected.
    expect(screen.getByRole("region", { name: "Storage" })).toBeInTheDocument();
    const before = imports.count;
    await user.click(
      within(processor).getByRole("button", { name: "Try again" }),
    );
    expect(
      await within(processor).findByText("The chart could not be loaded."),
    ).toBeInTheDocument();
    expect(imports.count).toBeGreaterThan(before);
  });
});
