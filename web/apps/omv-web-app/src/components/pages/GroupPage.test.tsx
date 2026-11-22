// SPDX-License-Identifier: GPL-3.0-or-later
// A group's page on the remembering users mock (phase 5 users design 9, 11): not found (and no call
// for an address that fails the pattern), the summary, the members saved with the whole list and the
// pending mark, a list changed elsewhere stopping the save, the description edited in place, a main
// group's member unavailable and the delete refused for it, and deleting a group: emptied, deleted,
// taken off the access lists and applied, the pre-flight, and "Put the members back".
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { calls, LONG, paramsOf } from "../../test/sharedFolderPage.ts";

type Answers = NonNullable<Parameters<typeof renderApp>[0]>["answers"];

async function groupPage(
  scenario: ScenarioName,
  group = "family",
  answers: Answers = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: `/usermgmt/groups/${group}`,
    answers,
  });
  await screen.findByRole("heading", { level: 2, name: /^Members/ }, LONG);
  return app;
}

const box = (name: string) =>
  screen.getByRole("checkbox", { name: new RegExp(`^.?${name}.?`) });

describe("a group's page (9)", () => {
  it("says a group is not there, and makes no call for an address that fails the pattern", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/groups/nosuch",
    });
    expect(
      await screen.findByText(
        /There is no group called .?nosuch.? on this NAS/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Groups" })).toBeVisible();
    expect(calls("UserMgmt.getGroup")).toHaveLength(0);
  });

  it("says there is no such group for an address that is no name", async () => {
    await renderApp({
      signedIn: true,
      scenario: "usersSome",
      path: "/usermgmt/groups/a%20b",
    });
    expect(
      await screen.findByText("There is no such group on this NAS.", {}, LONG),
    ).toBeVisible();
    expect(calls("UserMgmt.getGroupList")).toHaveLength(0);
    expect(calls("UserMgmt.getGroup")).toHaveLength(0);
  });

  it("shows the summary, the members and the delete section", async () => {
    await groupPage("usersSome");
    expect(
      screen.getByRole("heading", { level: 1, name: "family" }),
    ).toBeVisible();
    expect(screen.getAllByText("Everyone at home").length).toBeGreaterThan(0);
    expect(box("alex")).toBeChecked();
    expect(box("sam")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /Delete .?family.?…/ }),
    ).toBeVisible();
    expect(document.title).toMatch(/family – Groups/);
  });

  it("saves the members with the whole list, says it is in effect and marks the section", async () => {
    const { user } = await groupPage("usersSome");
    await user.click(box("sam"));
    expect(
      await screen.findByText("1 change not saved.", {}, LONG),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save members" }));
    await waitFor(
      () => expect(calls("UserMgmt.setGroup")).toHaveLength(1),
      LONG,
    );
    const sent = paramsOf("UserMgmt.setGroup")[0];
    expect(sent).toMatchObject({ name: "family", comment: "Everyone at home" });
    expect([...(sent?.members as string[])].sort()).toContain("sam");
    expect(sent).not.toHaveProperty("gid");
    expect(
      await screen.findByText(
        /Saved\. The NAS also lists Windows and Mac sharing/,
        {},
        LONG,
      ),
    ).toBeVisible();
    const heading = screen.getByRole("heading", { level: 2, name: "Members" });
    await waitFor(
      () => expect(heading.parentElement).toHaveTextContent("Not applied yet"),
      LONG,
    );
    expect(box("sam")).toBeChecked();
  });

  it("stops when the members were changed elsewhere, keeping the ticks", async () => {
    const { user } = await groupPage("usersSome", "family", {
      userMgmtGetGroup: {
        status: 200,
        value: {
          name: "family",
          gid: 1000,
          members: ["kim"],
          system: false,
          comment: "Everyone at home",
        },
      },
    });
    await user.click(box("sam"));
    await user.click(screen.getByRole("button", { name: "Save members" }));
    expect(
      await screen.findByText(
        /were changed elsewhere since you opened this page/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(calls("UserMgmt.setGroup")).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Show the current members" }),
    );
    expect(box("sam")).toBeChecked();
  });

  it("edits the description in place, refusing a colon", async () => {
    const { user } = await groupPage("usersSome");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByRole("textbox", { name: "Description" });
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "Home: all");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText("A description cannot contain a colon or a line break."),
    ).toBeVisible();
    expect(calls("UserMgmt.setGroup")).toHaveLength(0);
    await user.clear(field);
    await user.type(field, "All of us{Enter}");
    await waitFor(
      () => expect(calls("UserMgmt.setGroup")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("UserMgmt.setGroup")[0]).toMatchObject({
      name: "family",
      comment: "All of us",
    });
    expect(
      await screen.findByRole("button", { name: "Edit" }, LONG),
    ).toHaveFocus();
  });

  it("shows a main group's member ticked and unavailable, and refuses to delete it", async () => {
    await groupPage("usersMainGroup", "media");
    const drew = box("drew");
    expect(drew).toBeChecked();
    expect(drew).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getAllByText(/main group, set outside this interface/).length,
    ).toBeGreaterThan(0);
    const del = screen.getByRole("button", { name: /Delete .?media.?…/ });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/It cannot be deleted here\./)).toBeVisible();
    // No way round the refusal (P16).
    const section = del.closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).queryByRole("link"),
    ).not.toBeInTheDocument();
  });
});

describe("deleting a group (11)", () => {
  it("takes everyone out, deletes it, takes it off the access lists and applies", async () => {
    const { user } = await groupPage("usersSome");
    await user.click(
      screen.getByRole("button", { name: /Delete .?family.?…/ }),
    );
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    await within(dialog).findByRole("button", { name: "Delete group" }, LONG);
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(dialog).toHaveTextContent(/are taken out of it/);
    expect(dialog).toHaveTextContent(/Photos.? \(Read and write\)/);
    const off = within(dialog).getByRole("checkbox", {
      name: /Also take .?family.? off the access lists of 2 shared folders/,
    });
    expect(off).toBeChecked();
    await user.click(
      within(dialog).getByRole("button", { name: "Delete group" }),
    );
    expect(
      await screen.findByText(
        /was deleted\. Its members are still on the NAS\./,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("UserMgmt.setGroup")[0]).toMatchObject({
      name: "family",
      members: [],
    });
    expect(paramsOf("UserMgmt.deleteGroup")).toEqual([{ name: "family" }]);
    expect(calls("ShareMgmt.setPrivileges")).toHaveLength(2);
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Go to Groups" })).toBeVisible();
  });

  it("asks to apply or undo other changes first", async () => {
    const { user } = await groupPage("usersPending");
    await user.click(
      screen.getByRole("button", { name: /Delete .?family.?…/ }),
    );
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    expect(
      await within(dialog).findByRole(
        "button",
        { name: "Apply them now" },
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("button", { name: "Delete group" }),
    ).toBeNull();
  });

  it("offers to put the members back when deleting fails after emptying it", async () => {
    const { user } = await groupPage("usersDeleteFailsNotDeleted");
    await user.click(
      screen.getByRole("button", { name: /Delete .?family.?…/ }),
    );
    const dialog = await screen.findByRole("alertdialog", {}, LONG);
    await user.click(
      await within(dialog).findByRole("button", { name: "Delete group" }, LONG),
    );
    const putBack = await within(dialog).findByRole(
      "button",
      { name: "Put the members back" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      /Everyone was taken out of .?family.?, but it was not deleted\./,
    );
    const emptied = paramsOf("UserMgmt.setGroup")[0];
    expect(emptied?.members).toEqual([]);
    await user.click(putBack);
    await waitFor(
      () => expect(calls("UserMgmt.setGroup")).toHaveLength(2),
      LONG,
    );
    expect(
      (paramsOf("UserMgmt.setGroup")[1]?.members as string[]).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await screen.findAllByText(
          /were put back\. It was not deleted\./,
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
