// SPDX-License-Identifier: GPL-3.0-or-later
// A ZFS file system's page, its snapshots, its settings, and deleting a file system and a pool through
// the whole app on the remembering mock (phase 5 ZFS design 4.3 to 5.5, 9; owner, P7 to P9, P15): a
// snapshot taken without a confirmation, a roll-back offered on the newest only and typed, a snapshot
// deleted with its name typed and its change applied, a limit below what it holds refused, what uses it
// found by its folder (FsTab.getByFsName is never called), and the deletes refusing while other
// changes are pending and sending the folder Zfs.listPools reported.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15000 };
const RUN = { timeout: 30000 };
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const params = (call: string) =>
  calls(call).map((c) => c.params as Record<string, unknown>);

async function fsPage(
  scenario: ScenarioName,
  path = "/storage/zfs/fs/tank/media",
) {
  const app = await renderApp({ signedIn: true, scenario, path });
  await screen.findByRole("heading", { level: 2, name: "Snapshots" }, LONG);
  return app;
}

describe("a file system's page (4.3)", () => {
  it("shows its space, what uses it, and never asks FsTab for a ZFS name", async () => {
    await fsPage("zfsMirror");
    expect(screen.getByText("ZFS file system on pool tank")).toBeVisible();
    expect(
      await screen.findByText("Nothing uses this file system yet.", {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("FsTab.getByFsName");
    // Its every property is read only on the reader's press.
    expect(
      calls("Zfs.getObjectDetails").filter(
        (c) => (c.params as { type?: string }).type === "Filesystem",
      ),
    ).toHaveLength(0);
  });

  it("names the shared folder that uses it, by its folder, and refuses the delete", async () => {
    await fsPage("zfsShared");
    expect(
      (await screen.findAllByText("media", {}, LONG)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Delete file system…" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/Shared folders use it: media\./)).toBeVisible();
  });
});

describe("snapshots (5)", () => {
  it("takes a snapshot at once, then offers roll back on the newest only", async () => {
    const { user } = await fsPage("zfsMirror");
    const table = await screen.findByRole(
      "table",
      { name: "Snapshots of tank/media" },
      LONG,
    );
    expect(
      within(table).getAllByRole("button", { name: /^Roll tank\/media back/ }),
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Take a snapshot now" }),
    );
    await waitFor(
      () => expect(calls("Zfs.quickSnapshot")).toHaveLength(1),
      LONG,
    );
    expect(
      (
        await screen.findAllByText(
          (_, el) =>
            el?.tagName === "P" &&
            /^Snapshot \S+ taken\.$/.test(el.textContent ?? ""),
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(params("Zfs.quickSnapshot")[0]).toEqual({
      name: "tank/media",
      recursive: false,
    });
    await waitFor(
      () =>
        expect(
          within(
            screen.getByRole("table", { name: "Snapshots of tank/media" }),
          ).getAllByRole("row"),
        ).toHaveLength(4),
      LONG,
    );
  });

  it("rolls back to the newest snapshot after the file system's name is typed", async () => {
    const { user } = await fsPage("zfsMirror");
    await user.click(
      await screen.findByRole(
        "button",
        { name: /^Roll tank\/media back to snapshot/ },
        LONG,
      ),
    );
    const dialog = await screen.findByRole("alertdialog");
    const confirm = await within(dialog).findByRole(
      "button",
      { name: "Roll back" },
      LONG,
    );
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.type(within(dialog).getByRole("textbox"), "tank/media");
    await user.click(confirm);
    await waitFor(
      () => expect(calls("Zfs.rollbackSnapshot")).toHaveLength(1),
      LONG,
    );
    expect(String(params("Zfs.rollbackSnapshot")[0]?.name)).toMatch(
      /^tank\/media@/,
    );
  });

  it("deletes a snapshot after its name is typed, and saves the change it leaves pending", async () => {
    const { user } = await fsPage("zfsMirror");
    const table = await screen.findByRole(
      "table",
      { name: "Snapshots of tank/media" },
      LONG,
    );
    const [first] = within(table).getAllByRole("button", {
      name: /^Delete snapshot /,
    });
    await user.click(first as HTMLElement);
    const dialog = await screen.findByRole("alertdialog");
    const field = await within(dialog).findByRole("textbox", {}, LONG);
    const name =
      /Type (\S+) to confirm/.exec(dialog.textContent ?? "")?.[1] ?? "";
    await user.type(field, name);
    await user.click(
      within(dialog).getByRole("button", { name: "Delete snapshot" }),
    );
    await waitFor(
      () => expect(calls("Config.applyChangesBg")).toHaveLength(1),
      RUN,
    );
    expect(params("Zfs.deleteObjectBg")[0]).toMatchObject({
      type: "Snapshot",
      mp: "",
      recursive: false,
    });
  }, 60000);
});

describe("settings (4.4)", () => {
  it("refuses a size limit below what it holds, in words, before calling", async () => {
    const { user } = await fsPage("zfsMirror");
    await user.click(screen.getByRole("radio", { name: "Up to:" }));
    const field = screen.getByRole("textbox", { name: "Size limit" });
    await user.clear(field);
    await user.type(field, "1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        /It already holds .*\. Choose a limit above that/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("Zfs.setProperties");
  });

  it("saves compression off and says the change waits for the band", async () => {
    const { user } = await fsPage("zfsMirror");
    await user.click(screen.getByRole("radio", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Saved\. The changes take effect/, {}, LONG),
    ).toBeVisible();
    expect(params("Zfs.setProperties")[0]).toEqual({
      type: "Filesystem",
      name: "tank/media",
      properties: [{ property: "compression", value: "off", modified: true }],
    });
  });
});

describe("deleting a file system, then the pool (9)", () => {
  it("deletes tank/media with its folder from the list, then the pool's own folder", async () => {
    const { user } = await fsPage("zfsMirror");
    await user.click(
      await screen.findByRole("button", { name: "Delete file system…" }, LONG),
    );
    let dialog = await screen.findByRole("alertdialog");
    await user.type(
      await within(dialog).findByRole("textbox", {}, LONG),
      "tank/media",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete file system" }),
    );
    expect(
      await screen.findByText("tank/media was deleted.", {}, RUN),
    ).toBeVisible();
    expect(params("Zfs.deleteObjectBg")[0]).toEqual({
      type: "Filesystem",
      name: "tank/media",
      mp: "/tank/media",
      recursive: false,
    });
    await user.click(screen.getByRole("link", { name: "Open pool tank" }));
    await user.click(
      await screen.findByRole("button", { name: "Delete pool…" }, LONG),
    );
    dialog = await screen.findByRole("alertdialog");
    await user.type(
      await within(dialog).findByRole("textbox", {}, LONG),
      "tank",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete pool" }),
    );
    expect(
      await screen.findByText("Pool tank was deleted.", {}, RUN),
    ).toBeVisible();
    expect(params("Zfs.deleteObjectBg")[1]).toEqual({
      type: "Pool",
      name: "tank",
      mp: "/tank",
      recursive: false,
    });
    expect(calls("Config.applyChangesBg")).toHaveLength(2);
  }, 90000);

  it("refuses to start while other changes are pending (P15)", async () => {
    const { user } = await fsPage("zfsMirror");
    // A saved setting leaves changes pending.
    await user.click(screen.getByRole("radio", { name: "Off" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Saved\. The changes take effect/, {}, LONG);
    await user.click(
      screen.getByRole("button", { name: "Delete file system…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByText(
        /an undo cannot bring back what was deleted/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Delete file system" }),
    ).toBeNull();
    expect(callNames()).not.toContain("Zfs.deleteObjectBg");
  });
});
