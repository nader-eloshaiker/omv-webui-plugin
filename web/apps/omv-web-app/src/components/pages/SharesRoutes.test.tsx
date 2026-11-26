// SPDX-License-Identifier: GPL-3.0-or-later
// The shares slice's routes (phase 5 shares design 10.2): a folder's page only by a valid UUID, the add
// flow and the SMB page as static routes, Shared folders current on its sub-pages, and the SMB/CIFS menu
// item leading to its page in this interface. Opening any of them changes nothing (UI-4).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findDashboard } from "../../test/dashboard.ts";
import { openNavGroup } from "../../test/nav.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames } from "../../test/server.ts";

const nav = () =>
  screen.getAllByRole("navigation", { name: "Main navigation" })[0]!;

describe("the shares routes", () => {
  it.each([
    "/storage/shared-folders/00000000-0000-4000-8000-000000000001",
    "/storage/shared-folders/not-a-folder",
    "/storage/shared-folders/add",
  ])(
    "opens %s with Shared folders current, and writes nothing",
    async (path) => {
      await renderApp({ signedIn: true, path });
      // A folder's page reads its lists first; the admin story has a folder with this UUID, whose
      // name is then the page's title.
      await screen.findByRole(
        "heading",
        {
          level: 1,
          name: path.endsWith("-000000000001") ? "a4share" : "Shared folders",
        },
        { timeout: 15000 },
      );
      expect(
        within(nav()).getByRole("link", { name: "Shared folders" }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        callNames().filter(
          (c) =>
            !/\.(get|is)/.test(c) &&
            c !== "Zfs.listCompressionTypes" &&
            // The shell's combined read: the interface counters (live/useLive.ts), a read.
            c !== "Network.enumerateDevicesList",
        ),
      ).toEqual([]);
    },
  );

  it("leads the SMB/CIFS menu item to Windows and Mac sharing", async () => {
    const { user } = await renderApp({ signedIn: true });
    await findDashboard();
    openNavGroup("Services", nav());
    const item = within(nav()).getByRole("link", { name: "SMB/CIFS" });
    expect(item).toHaveAttribute("href", "/ui/services/smb");
    await user.click(item);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Windows and Mac sharing",
      }),
    ).toBeInTheDocument();
  });

  it("keeps a normal user off the new pages without asking the server", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/services/smb",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeInTheDocument();
    expect(callNames().some((c) => c.startsWith("SMB."))).toBe(false);
  });
});
