// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a shared folder" through the whole app on the remembering mock (phase 5 shares design 6; owner,
// P4, P5, P8, P9, P14): the pre-flight, failing closed, no file system, the checks in order with focus
// and the count, access at No access and sharing on by default, guest access never preselected with
// its warnings, the long NAS name, the summary, a full run to the result, each failure of 6.6 and the
// handover from Flow A in memory.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15_000 };

async function flow(scenario: ScenarioName = "sharesNone") {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/storage/shared-folders/add",
  });
  await screen.findByRole(
    "heading",
    { level: 2, name: "Add a shared folder" },
    LONG,
  );
  return app;
}

const ready = () => screen.findByRole("textbox", { name: /^Name/ }, LONG);
const params = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);
const fsOption = (device: string) =>
  screen.getByRole("radio", { name: new RegExp(`on ${device}`) });

/** The innermost element whose whole text matches: a sentence with a name set in its own element. */
const sentence = (re: RegExp) => (_: string, el: Element | null) =>
  el !== null &&
  re.test(el.textContent ?? "") &&
  [...el.children].every((c) => !re.test(c.textContent ?? ""));

type User = Awaited<ReturnType<typeof flow>>["user"];

async function fill(user: User, name: string, device = "/dev/sdd1") {
  await ready();
  await user.click(fsOption(device));
  await user.type(screen.getByRole("textbox", { name: /^Name/ }), name);
}

async function giveAccess(user: User, who: string, access = "Read and write") {
  const group = screen.getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${who}.?$`),
  });
  await user.click(within(group).getByRole("radio", { name: access }));
}

async function toSummary(user: User) {
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Ready to add the shared folder");
}

const confirm = (user: User) =>
  user.click(screen.getByRole("button", { name: "Add shared folder" }));

describe("Add a shared folder", () => {
  it("makes, gives access, turns SMB on, shares and applies once, then says how to reach it", async () => {
    const { user } = await flow();
    await fill(user, "Photos");
    await giveAccess(user, "alex");
    await giveAccess(user, "sam", "Read only");
    await toSummary(user);
    const summary = screen.getByText("Ready to add the shared folder")
      .parentElement as HTMLElement;
    expect(summary).toHaveTextContent(
      "Make the shared folder Photos on EXT4 on /dev/sdd1, in the folder Photos.",
    );
    expect(summary).toHaveTextContent("Read and write: alex.");
    expect(summary).toHaveTextContent("Read only: sam.");
    expect(summary).toHaveTextContent(
      "Share it with Windows and Mac computers as \\\\nas\\Photos.",
    );
    expect(summary).toHaveTextContent(
      "Windows and Mac sharing is off now and will be turned on.",
    );
    expect(summary).toHaveTextContent(
      "Then apply the changes. No other change is pending.",
    );
    expect(summary).not.toHaveTextContent("without a password");
    // On arrival focus is on the summary's heading (6.3, 6.8).
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: "Ready to add the shared folder",
        }),
      ).toHaveFocus(),
    );
    expect(callNames()).not.toContain("ShareMgmt.set");
    await confirm(user);

    expect(
      await screen.findByText("Photos is ready.", {}, LONG),
    ).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Steps" });
    for (const label of [
      "Check the choices",
      "Make the shared folder",
      "Give access",
      "Turn on Windows and Mac sharing",
      "Share the folder",
      "Save and share",
      "Check that it is ready",
    ]) {
      expect(steps).toHaveTextContent(`Succeeded${label}`);
    }
    const set = params("ShareMgmt.set")[0];
    expect(set).toMatchObject({
      uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
      name: "Photos",
      reldirpath: "Photos",
      comment: "",
      mode: "770",
    });
    expect(params("ShareMgmt.setPrivileges")[0]?.privileges).toEqual([
      { type: "user", name: "alex", perms: 7 },
      { type: "user", name: "sam", perms: 5 },
    ]);
    expect(params("SMB.setSettings")[0]?.enable).toBe(true);
    expect(params("SMB.setShare")[0]).toMatchObject({
      guest: "no",
      browseable: true,
      readonly: false,
    });
    expect(params("SMB.setShare")[0]).not.toHaveProperty("sharedfoldername");
    expect(params("Config.applyChangesBg")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Open the shared folder" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/ui\/storage\/shared-folders\/[0-9a-f-]{36}$/u),
    );
  }, 40_000);

  it("does not start while other changes are pending, and reads nothing for the form (R1)", async () => {
    await flow("pendingChanges");
    expect(
      await screen.findByText("Some changes are not applied yet", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Apply or undo them before you add a shared folder, so that only its changes are applied at the end.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Apply them now" }),
    ).toBeVisible();
    expect(callNames()).not.toContain("ShareMgmt.getCandidates");
  });

  it("offers nothing when a read it needs fails, with the server's words", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesNone",
      path: "/storage/shared-folders/add",
      answers: {
        userMgmtGetUserList: { status: 500, message: "User list unreadable." },
      },
    });
    expect(
      await screen.findByText(
        "Could not read the people and groups on this NAS.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("User list unreadable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("sends the reader to Add storage when no file system can hold a shared folder", async () => {
    await renderApp({
      signedIn: true,
      scenario: "sharesNone",
      path: "/storage/shared-folders/add",
      answers: { shareMgmtGetCandidates: { status: 200, value: [] } },
    });
    expect(
      await screen.findByText(
        "No file system can hold a shared folder yet. Add storage first: a disk with a file system, mounted.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Add storage" })).toHaveAttribute(
      "href",
      "/ui/storage/filesystems/add",
    );
    expect(
      screen.getByRole("button", {
        name: "File systems that cannot hold a shared folder (4)",
      }),
    ).toBeVisible();
  });

  it("starts with everyone at No access, sharing on and guest access off", async () => {
    const { user } = await flow();
    await ready();
    for (const who of ["family", "alex", "sam"]) {
      const group = screen.getByRole("radiogroup", {
        name: new RegExp(`^Access for .?${who}.?$`),
      });
      expect(
        within(group).getByRole("radio", { name: "No access" }),
      ).toBeChecked();
    }
    expect(
      screen.getByRole("checkbox", {
        name: "Share it with Windows and Mac computers",
      }),
    ).toBeChecked();
    const guest = screen.getByRole("checkbox", {
      name: "Also let in anyone on the network, without a password",
    });
    expect(guest).not.toBeChecked();
    expect(
      screen.getByText(
        "Windows and Mac sharing is off for the whole NAS. Sharing this folder turns it on.",
      ),
    ).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Photos");
    await user.click(guest);
    expect(
      screen.getByText(
        sentence(
          /^Anyone on your network can open\s*Photos\s*without a password\./u,
        ),
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        /^Folders made in this interface let in only the people given access/u,
      ),
    ).toBeVisible();
    // The warning is the box's description, heard when the box is reached (15.2).
    expect(guest).toHaveAccessibleDescription(
      /Anyone who can reach your network.*Anyone on your network can open.*Photos.*without a password\..*Folders made in this interface/su,
    );
    await user.click(guest);
    expect(guest).not.toHaveAccessibleDescription(/without a password\./u);
  });

  it("checks every field on Continue in order, focusing the first and saying how many", async () => {
    const { user } = await flow();
    await ready();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("3 things to fix")).toBeVisible();
    expect(
      screen.getByText("Choose the file system to put it on."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Give at least one person or group access, or untick Share it with Windows and Mac computers.",
      ),
    ).toBeVisible();
    await user.click(fsOption("/dev/sdd1"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("2 things to fix")).toBeVisible();
    const name = screen.getByRole("textbox", { name: /^Name/ });
    expect(name).toHaveFocus();
    expect(
      screen.getByText(
        "Use 1 to 80 characters. Letters outside the Latin alphabet count as two or more.",
      ),
    ).toBeVisible();
    for (const [typed, message] of [
      ["a/b", /^A name cannot contain any of these/u],
      [".hidden", /^A name cannot start with a full stop/u],
      ["Homes", /^Homes is a name Windows and Mac sharing keeps for itself/u],
      ["\u05d0".repeat(41), /^Use 1 to 80 characters/u],
    ] as const) {
      await user.clear(name);
      await user.type(name, typed);
      await user.tab();
      expect(await screen.findByText(message)).toBeVisible();
    }
    await user.clear(name);
    await user.type(name, "Photos");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Share it with Windows and Mac computers",
      }),
    );
    await toSummary(user);
    const summary = screen.getByText("Ready to add the shared folder")
      .parentElement as HTMLElement;
    expect(summary).toHaveTextContent("Nobody has access yet.");
    expect(summary).toHaveTextContent(
      "It is not shared with other computers yet. You can share it later from its page.",
    );
    // Change choices keeps every choice.
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    expect(await screen.findByRole("textbox", { name: /^Name/ })).toHaveValue(
      "Photos",
    );
    expect(fsOption("/dev/sdd1")).toBeChecked();
  });

  it("refuses a name another folder has, ignoring case", async () => {
    const { user } = await flow("sharesSome");
    await fill(user, "photos");
    await user.tab();
    expect(
      await screen.findByText(
        "There is already a shared folder called Photos.",
      ),
    ).toBeVisible();
  });

  it("lets a folder be shared with guests and nobody else, with the warning in the summary", async () => {
    const { user } = await flow();
    await fill(user, "Public");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Also let in anyone on the network, without a password",
      }),
    );
    await toSummary(user);
    const summary = screen.getByText("Ready to add the shared folder")
      .parentElement as HTMLElement;
    expect(summary).toHaveTextContent(
      "Anyone on your network can open it without a password.",
    );
    expect(summary).not.toHaveTextContent("Nobody has access yet.");
    await confirm(user);
    expect(await screen.findByText("Public is ready.", {}, LONG)).toBeVisible();
    expect(params("SMB.setShare")[0]?.guest).toBe("allow");
    expect(callNames()).not.toContain("ShareMgmt.setPrivileges");
  }, 40_000);

  it("cannot share while the NAS's name is too long, and still makes the folder", async () => {
    const { user } = await flow("sharesLongHost");
    await ready();
    const share = screen.getByRole("checkbox", {
      name: "Share it with Windows and Mac computers",
    });
    expect(share).not.toBeChecked();
    expect(share).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        sentence(/This NAS is called\s*nas-living-room1\s*\(16 characters\)/u),
      ),
    ).toBeVisible();
    await user.click(fsOption("/dev/sdd1"));
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Music");
    await toSummary(user);
    await confirm(user);
    expect(await screen.findByText("Music is ready.", {}, LONG)).toBeVisible();
    expect(callNames()).not.toContain("SMB.setSettings");
    expect(callNames()).not.toContain("SMB.setShare");
  }, 40_000);

  it("chooses the file system handed over by Flow A, in memory", async () => {
    const { user } = await renderApp({
      signedIn: true,
      scenario: "sharesNone",
      path: "/storage/filesystems/00000000-0000-4000-8000-000000000008",
    });
    const handover = await screen.findByRole(
      "region",
      { name: "Next: share a folder on it" },
      LONG,
    );
    expect(handover).toHaveTextContent(
      "Make a shared folder on EXT4 on /dev/sdd1, choose who can use it, and share it with your computers.",
    );
    const button = within(handover).getByRole("link", {
      name: "Share a folder on it",
    });
    expect(button).toHaveAttribute("href", "/ui/storage/shared-folders/add");
    await user.click(button);
    await ready();
    expect(
      screen.getByRole("radio", {
        name: /on \/dev\/sdd1 \(the storage you just added\)/u,
      }),
    ).toBeChecked();
    expect(fsOption("/dev/sda1")).not.toBeChecked();
  }, 30_000);

  it("keeps a normal user off the flow without a call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/shared-folders/add",
    });
    expect(
      await screen.findByText(/only administrators/iu, {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("ShareMgmt.getCandidates");
  });
});

describe("when adding a shared folder fails (6.6)", () => {
  async function run(scenario: ScenarioName, name = "Photos") {
    const app = await flow(scenario);
    await fill(app.user, name);
    await giveAccess(app.user, "alex");
    await toSummary(app.user);
    await confirm(app.user);
    return app;
  }

  it("stops at the check when the file system is no longer offered, with nothing done", async () => {
    // The candidates go once the reader has confirmed: step 1 reads them again.
    let gone = false;
    const app = await renderApp({
      signedIn: true,
      scenario: "sharesNone",
      path: "/storage/shared-folders/add",
      answers: {
        shareMgmtGetCandidates: () =>
          gone ? { status: 200, value: [] } : "several",
      },
    });
    await fill(app.user, "Photos");
    await giveAccess(app.user, "alex");
    await toSummary(app.user);
    gone = true;
    await confirm(app.user);
    expect(
      await screen.findByText(
        sentence(
          /cannot hold a shared folder any more: The NAS does not offer this file system/u,
        ),
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Nothing was changed.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Change choices" }),
    ).toBeVisible();
    expect(callNames()).not.toContain("ShareMgmt.set");
  }, 30_000);

  it("says the folder was not made, then the record without its folder, and removes it again", async () => {
    const { user } = await run("sharesAddFails");
    expect(
      await screen.findByText("The shared folder was not made.", {}, LONG),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Failed to store the configuration object 'conf.system.sharedfolder'.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText(
        /^The shared folder was set up, but its folder could not be made on/u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(params("ShareMgmt.set")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove it again" }));
    expect(
      await screen.findByText(
        "The shared folder's record is removed again. Nothing on the disk was changed.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(params("ShareMgmt.delete")[0]).toMatchObject({ recursive: false });
  }, 40_000);

  it("makes the folder on the disk with Try again after the record was made without it", async () => {
    const { user } = await run("sharesAddFailsNoDir");
    await screen.findByText(/its folder could not be made on/u, {}, LONG);
    const before = params("ShareMgmt.set");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Photos is ready.", {}, LONG)).toBeVisible();
    const again = params("ShareMgmt.set")[before.length];
    expect(again?.uuid).not.toBe("fa4b1c66-ef79-11e5-87a0-0002b3a176b4");
  }, 40_000);

  it("offers this step again or Stop here when access could not be saved", async () => {
    const { user } = await run("sharesAddFailsAccess");
    expect(
      await screen.findByText(
        sentence(
          /^Photos\s*was made, but who can use it could not be saved\.$/u,
        ),
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/If you undo them there, the folder's record goes/u),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Try this step again" }),
    );
    expect(await screen.findByText("Photos is ready.", {}, LONG)).toBeVisible();
  }, 40_000);

  it("stops where the reader says, with what is left pending", async () => {
    const { user } = await run("sharesAddFailsShare");
    await screen.findByText(
      /was made, but sharing it with Windows and Mac computers could not be saved/u,
      {},
      LONG,
    );
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(
      await screen.findByText(
        "Stopped here. The steps after this one did not run.",
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("Config.applyChangesBg");
  }, 40_000);

  it("turns SMB on again with this step after it failed", async () => {
    const { user } = await run("sharesAddFailsSmbOn");
    await screen.findByText(
      /was made, but turning on Windows and Mac sharing could not be saved/u,
      {},
      LONG,
    );
    await user.click(
      screen.getByRole("button", { name: "Try this step again" }),
    );
    expect(await screen.findByText("Photos is ready.", {}, LONG)).toBeVisible();
  }, 40_000);

  it("offers to try applying again first after a failed apply (R7)", async () => {
    const { user } = await run("sharesAddFailsApply");
    expect(
      await screen.findByText("Applying the changes failed.", {}, LONG),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Try applying again" }),
    );
    expect(await screen.findByText("Photos is ready.", {}, LONG)).toBeVisible();
  }, 40_000);

  it("says what is not ready after the apply, and offers to check again", async () => {
    await run("sharesAddFailsVerify");
    expect(
      await screen.findByText(
        "The changes are applied, but Windows and Mac sharing is not running is not ready yet.",
        {},
        { timeout: 20_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Check again" })).toBeVisible();
  }, 40_000);

  it("checks again after a cut request and goes on from the first step not done", async () => {
    const { user } = await run("sharesAddFailsCut");
    expect(
      await screen.findByText(
        "Could not tell whether “Make the shared folder” finished.",
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Photos is ready.", {}, LONG)).toBeVisible();
    expect(params("ShareMgmt.set")).toHaveLength(1);
  }, 40_000);
});
