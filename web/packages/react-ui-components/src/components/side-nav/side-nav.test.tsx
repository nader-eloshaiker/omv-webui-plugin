// SPDX-License-Identifier: GPL-3.0-or-later
// The drawer opens with focus on the current item, not on the close button (whose tooltip would take
// the first Escape), so one Escape closes it and focus goes back to the toggle.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { UiProvider } from "../ui-provider/ui-provider";
import {
  SideNav,
  SideNavDrawer,
  SideNavGroup,
  SideNavItem,
  SideNavList,
} from "./side-nav";

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
        <SideNavGroup label="Storage" current>
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

  it.each([
    ["Tab", false],
    ["Shift+Tab", true],
  ])("keeps %s inside the drawer, at every step", async (_, shift) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const current = await screen.findByRole("link", { name: "Shared folders" });
    await waitFor(() => expect(current).toHaveFocus());
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    for (let step = 0; step < 6; step += 1) {
      await user.tab({ shift });
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
      await act(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          ),
      );
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

function Groups({ page }: { page: "dashboard" | "disks" | "ssh" }) {
  return (
    <SideNav aria-label="Main navigation">
      <SideNavList>
        <SideNavItem href="#dashboard" current={page === "dashboard"}>
          Dashboard
        </SideNavItem>
      </SideNavList>
      <SideNavGroup label="Storage" current={page === "disks"}>
        <SideNavItem href="#disks" current={page === "disks"}>
          Disks
        </SideNavItem>
        <SideNavItem href="#shares">Shared folders</SideNavItem>
      </SideNavGroup>
      <SideNavGroup label="Services" current={page === "ssh"}>
        <SideNavItem href="#ssh" current={page === "ssh"}>
          SSH
        </SideNavItem>
        <SideNavItem href="#wg" classicOnly={{ label: "Classic" }}>
          WireGuard
        </SideNavItem>
      </SideNavGroup>
    </SideNav>
  );
}

describe("SideNavGroup", () => {
  it("opens the current page's group and folds the others", () => {
    render(<Groups page="disks" />);
    expect(screen.getByRole("button", { name: "Storage" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Services" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("link", { name: "Disks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // A folded group's pages stay findable by the browser's find in page, but not reachable.
    expect(screen.queryByRole("link", { name: "SSH" })).toBeNull();
    expect(screen.getByText("SSH")).toBeInTheDocument();
  });

  it("opens and folds a group by keyboard, from its name", async () => {
    const user = userEvent.setup();
    render(<Groups page="disks" />);
    const services = screen.getByRole("button", { name: "Services" });
    services.focus();
    await user.keyboard("{Enter}");
    expect(services).toHaveAttribute("aria-expanded", "true");
    expect(
      await screen.findByRole("link", { name: /^WireGuard/ }),
    ).toHaveTextContent("Classic");
    // Tab goes from the group's name into its pages.
    await user.tab();
    expect(screen.getByRole("link", { name: "SSH" })).toHaveFocus();
    services.focus();
    await user.keyboard(" ");
    expect(services).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "SSH" })).toBeNull(),
    );
  });

  it("follows the current page: the new group opens and the old one folds", () => {
    const { rerender } = render(<Groups page="disks" />);
    rerender(<Groups page="ssh" />);
    expect(screen.getByRole("button", { name: "Services" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Storage" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("names each group by its heading, for the region list of assistive technology", () => {
    render(<Groups page="dashboard" />);
    const names = screen
      .getAllByRole("group")
      .map((g) =>
        document.getElementById(g.getAttribute("aria-labelledby") ?? ""),
      )
      .map((label) => label?.textContent);
    expect(names).toEqual(["Storage", "Services"]);
  });
});
