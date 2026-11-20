// SPDX-License-Identifier: GPL-3.0-or-later
// The drawer opens with focus on the current item, not on the close button (whose tooltip would take
// the first Escape), so one Escape closes it and focus goes back to the toggle.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { UiProvider } from "../ui-provider/ui-provider";
import { SideNavDrawer, SideNavGroup, SideNavItem } from "./side-nav";

function Harness() {
  const [open, setOpen] = React.useState(false);
  return (
    <UiProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open navigation
      </button>
      <SideNavDrawer
        open={open}
        onOpenChange={setOpen}
        label="Navigation"
        closeLabel="Close navigation"
      >
        <SideNavGroup label="Storage">
          <SideNavItem href="#disks">Disks</SideNavItem>
          <SideNavItem href="#shares" current>
            Shared folders
          </SideNavItem>
        </SideNavGroup>
      </SideNavDrawer>
    </UiProvider>
  );
}

describe("SideNavDrawer", () => {
  it("opens on the current item, and one Escape closes it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const current = await screen.findByRole("link", { name: "Shared folders" });
    await waitFor(() => expect(current).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Disks" })).toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveFocus();
  });
});
