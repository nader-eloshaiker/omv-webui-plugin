// SPDX-License-Identifier: GPL-3.0-or-later
// The links into the file-systems pages from elsewhere (phase 5 file-systems design 9): the dashboard's
// Storage card and attention rows, the disks pages' "Used for", the wipe's blockers and result, and
// "Add storage on this disk", which hands the disk over in memory and never in the address (D17).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";

const SDA1 = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0];

describe("links into the file systems pages (9)", () => {
  it("opens a file system's page from the dashboard's map", async () => {
    const { app, user } = await renderApp({ signedIn: true, path: "/" });
    const map = await screen.findByRole(
      "region",
      { name: "Your NAS" },
      { timeout: 8000 },
    );
    const fs = await within(map).findByRole("button", { name: /\/dev\/sda1/ });
    await user.click(fs);
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(
        `/storage/filesystems/${SDA1.uuid ?? ""}`,
      ),
    );
  });

  it("offers Add storage when there is no file system", async () => {
    await renderApp({ signedIn: true, path: "/", scenario: "storageEmpty" });
    const map = await screen.findByRole(
      "region",
      { name: "Your NAS" },
      { timeout: 8000 },
    );
    const [link] = await within(map).findAllByRole("link", {
      name: "Add storage",
    });
    expect(link).toHaveAttribute("href", "/ui/storage/filesystems/add");
  });

  it("links a disk's file system to its page, and an empty disk to Flow A without the disk in the address", async () => {
    await renderApp({ signedIn: true, path: "/storage/disks" });
    expect(
      await screen.findByRole("link", {
        name: "Open file system EXT4 on /dev/sda1",
      }),
    ).toHaveAttribute("href", `/ui/storage/filesystems/${SDA1.uuid}`);
  });

  it("offers Add storage on an empty disk's page, with an address that names no disk", async () => {
    await renderApp({ signedIn: true, path: "/storage/disks/sdb" });
    const link = await screen.findByRole(
      "link",
      { name: "Add storage on this disk" },
      { timeout: 8000 },
    );
    expect(link).toHaveAttribute("href", "/ui/storage/filesystems/add");
  });

  it("does not offer Add storage on a disk that holds a file system in use", async () => {
    await renderApp({ signedIn: true, path: "/storage/disks/sda" });
    await screen.findByText(/which is in use\./, {}, { timeout: 8000 });
    expect(
      screen.queryByRole("link", { name: "Add storage on this disk" }),
    ).toBeNull();
  });
});
