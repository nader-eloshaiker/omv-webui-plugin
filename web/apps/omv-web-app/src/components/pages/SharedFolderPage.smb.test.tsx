// SPDX-License-Identifier: GPL-3.0-or-later
// "Windows and Mac computers" on a shared folder's page, on the remembering shares mock (phase 5
// shares design 4; 0.3, 0.9, 0.10; P9 to P11; section 19): sharing a folder (refused while nobody has
// access, the guest warnings, turning SMB on in the same save, the 15-character name rule), changing
// the options with the row read back whole, stopping with a plain confirmation and focus on the
// heading, turning on a share turned off elsewhere, and the share list failing outright.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BACKUPS,
  calls,
  folderPage,
  LONG,
  paramsOf,
  PHOTOS,
} from "../../test/sharedFolderPage.ts";

const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const section = () =>
  screen.getByRole("region", { name: "Windows and Mac computers" });

describe("sharing a folder (4.1, 4.3)", () => {
  it("moves focus to the form's heading when it opens, and back when it is cancelled", async () => {
    const { user } = await folderPage("sharesSome", BACKUPS);
    const open = await within(section()).findByRole(
      "button",
      { name: "Share with Windows and Mac computers…" },
      LONG,
    );
    await user.click(open);
    expect(
      within(section()).getByRole("heading", {
        level: 3,
        name: "Share with Windows and Mac computers",
      }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(section()).getByRole("checkbox", {
        name: "Show it in the network list",
      }),
    ).toHaveFocus();
    await user.click(within(section()).getByRole("button", { name: "Cancel" }));
    expect(
      within(section()).getByRole("button", {
        name: "Share with Windows and Mac computers…",
      }),
    ).toHaveFocus();
  });

  it("moves focus to the form's heading on Change options", async () => {
    const { user } = await folderPage("sharesSome", PHOTOS);
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Change options…" },
        LONG,
      ),
    );
    expect(
      within(section()).getByRole("heading", {
        level: 3,
        name: "Change how it is shared",
      }),
    ).toHaveFocus();
  });

  it("refuses while nobody has access, then shares it with guests once ticked", async () => {
    const { user } = await folderPage("sharesSome", BACKUPS);
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Share with Windows and Mac computers…" },
        LONG,
      ),
    );
    const share = within(section()).getByRole("button", { name: "Share" });
    expect(share).toHaveAttribute("aria-disabled", "true");
    expect(
      within(section()).getByText(
        "Give at least one person or group access first, above.",
      ),
    ).toBeVisible();
    expect(
      within(section()).getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    ).not.toBeChecked();

    await user.click(
      within(section()).getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    );
    expect(
      within(section()).getByText(
        /without a password\. The No access choices above/,
      ),
    ).toBeVisible();
    expect(
      within(section()).getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    ).toHaveAccessibleDescription(
      /Anyone who can reach your network.*Anyone on your network can open .+ without a password\. The No access choices above.*Folders made in this interface/su,
    );
    expect(share).not.toHaveAttribute("aria-disabled", "true");
    await user.click(share);
    await waitFor(() => expect(calls("SMB.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("SMB.setShare")[0]).toMatchObject({
      uuid: NEW_OBJECT,
      sharedfolderref: BACKUPS,
      guest: "allow",
      browseable: true,
      readonly: false,
    });
    expect(calls("SMB.setSettings")).toHaveLength(0);
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", {
            level: 2,
            name: "Windows and Mac computers",
          }),
        ).toHaveFocus(),
      LONG,
    );
    expect(
      (await screen.findAllByText(/is set to be shared\./, {}, LONG)).length,
    ).toBeGreaterThan(0);
    expect(
      await within(section()).findByText("Not applied yet", {}, LONG),
    ).toBeVisible();
  });

  it("turns Windows and Mac sharing on in the same save", async () => {
    const { user } = await folderPage("sharesSome", BACKUPS, {
      answers: { smbGetSettings: "off" },
    });
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Share with Windows and Mac computers…" },
        LONG,
      ),
    );
    expect(
      within(section()).getByText(
        "Windows and Mac sharing is off for the whole NAS. Sharing this folder turns it on.",
      ),
    ).toBeVisible();
    await user.click(
      within(section()).getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    );
    await user.click(within(section()).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(calls("SMB.setSettings")).toHaveLength(1), LONG);
    expect(paramsOf("SMB.setSettings")[0]).toMatchObject({ enable: true });
    expect(calls("SMB.setShare")).toHaveLength(1);
  });

  it("refuses to turn sharing on for a NAS name longer than 15 characters", async () => {
    const { user } = await folderPage("sharesLongHost");
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Share with Windows and Mac computers…" },
        LONG,
      ),
    );
    expect(
      await within(section()).findByText(/\(16 characters\)/, {}, LONG),
    ).toBeVisible();
    expect(within(section()).getByText("nas-living-room1")).toBeVisible();
    expect(
      within(section()).getByRole("link", {
        name: /Network settings in the classic interface/,
      }),
    ).toBeVisible();
    const share = within(section()).getByRole("button", { name: "Share" });
    expect(share).toHaveAttribute("aria-disabled", "true");
    await user.click(share);
    expect(calls("SMB.setShare")).toHaveLength(0);
    expect(calls("SMB.setSettings")).toHaveLength(0);
  });
});

describe("a folder that is shared (4.2)", () => {
  it("changes its options with the row as read, without its computed name", async () => {
    const { user } = await folderPage("sharesSome");
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Change options…" },
        LONG,
      ),
    );
    expect(
      within(section()).getByRole("heading", {
        name: "Change how it is shared",
      }),
    ).toBeVisible();
    await user.click(
      within(section()).getByRole("checkbox", {
        name: "Show it in the network list",
      }),
    );
    await user.click(within(section()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("SMB.setShare")).toHaveLength(1), LONG);
    const sent = paramsOf("SMB.setShare")[0];
    expect(sent).toMatchObject({ sharedfolderref: PHOTOS, browseable: false });
    expect(sent?.uuid).not.toBe(NEW_OBJECT);
    expect(sent).not.toHaveProperty("sharedfoldername");
    // Shown in the network list and read only for everyone both read "No" now.
    await waitFor(
      () => expect(within(section()).getAllByText("No")).toHaveLength(2),
      LONG,
    );
  });

  it("stops sharing after a plain confirmation, then focuses the heading", async () => {
    const { user } = await folderPage("sharesSome");
    await user.click(
      await within(section()).findByRole(
        "button",
        { name: "Stop sharing…" },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(
        /Stop sharing .Photos. with Windows and Mac computers\?/,
      ),
    ).toBeVisible();
    expect(within(dialog).getByText("\\\\nas\\Photos")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Stop sharing" }),
    );
    await waitFor(() => expect(calls("SMB.deleteShare")).toHaveLength(1), LONG);
    await waitFor(
      () =>
        expect(
          screen.getByRole("heading", {
            level: 2,
            name: "Windows and Mac computers",
          }),
        ).toHaveFocus(),
      LONG,
    );
    expect(
      await within(section()).findByText(
        "Not shared with Windows and Mac computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("shows options set in the classic interface and keeps Guests only", async () => {
    const { user } = await folderPage("sharesClassicOptions");
    expect(
      await within(section()).findByText(
        "Some options were set in the classic interface, such as Time Machine. They are kept.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(section()).getByText(/^Guests only: everyone who opens it/),
    ).toBeVisible();
    await user.click(
      within(section()).getByRole("button", { name: "Change options…" }),
    );
    expect(
      within(section()).getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    ).toBeChecked();
    expect(
      within(section()).getByText(
        "Guests only is set in the classic interface. Saving here changes it to also let in people who sign in.",
      ),
    ).toBeVisible();
    await user.click(within(section()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("SMB.setShare")).toHaveLength(1), LONG);
    // Left as it was, Guests only is kept.
    expect(paramsOf("SMB.setShare")[0]).toMatchObject({ guest: "only" });
  });

  it("turns on a share turned off for this folder, without a dialog", async () => {
    const { user, mock } = await folderPage("sharesSome");
    const stored = mock.shares?.config.shares.find(
      (s) => s.sharedfolderref === PHOTOS,
    );
    expect(stored).toBeDefined();
    if (stored !== undefined) {
      stored.enable = false;
    }
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await within(section()).findByText(
        "Set up for Windows and Mac computers, but turned off for this folder.",
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(
      within(section()).getByRole("button", { name: "Turn it on" }),
    );
    await waitFor(() => expect(calls("SMB.setShare")).toHaveLength(1), LONG);
    expect(paramsOf("SMB.setShare")[0]).toMatchObject({ enable: true });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("when the share list cannot be read (4.6, section 19 item 13)", () => {
  it("says so with the server's words, offers no sharing action, and the delete waits", async () => {
    await folderPage("sharesSome", PHOTOS, {
      answers: {
        smbGetShareList: {
          status: 500,
          message: "Failed to execute XPath query.",
        },
      },
    });
    expect(
      await within(section()).findByText(
        "Could not read how this folder is shared.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(section()).getByText("Failed to execute XPath query."),
    ).toBeVisible();
    expect(
      within(section()).queryByRole("button", {
        name: /Share with|Stop sharing|Change options/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove, keep the files…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText(
        "Could not check what uses this shared folder, so it cannot be removed now.",
      ).length,
    ).toBeGreaterThan(0);
  });
});
