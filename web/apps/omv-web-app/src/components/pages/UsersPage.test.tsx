// SPDX-License-Identifier: GPL-3.0-or-later
// Users > Users on the remembering users mock (phase 5 users design 1): who can control this NAS, the
// table with its columns, the search and filter with their filtered-empty states, sorting, paging at
// 50, the empty list, a failed read, side reads failing, a person called "add" without a link, and
// server text rendered as text (UI-2).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { LONG } from "../../test/sharedFolderPage.ts";

async function usersPage(
  scenario: ScenarioName,
  answers: NonNullable<Parameters<typeof renderApp>[0]>["answers"] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/usermgmt/users",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Users" }, LONG);
  return app;
}

const table = () => screen.getByRole("table", { name: "Users" });

const rowOf = async (name: string) => {
  const t = await screen.findByRole("table", { name: "Users" }, LONG);
  const link = await within(t).findByRole(
    "link",
    { name: `Open ${name}` },
    LONG,
  );
  const row = link.closest("tr");
  if (row === null) {
    throw new Error("no row");
  }
  return row;
};

const card = () =>
  screen
    .getByRole("heading", { level: 2, name: "Who can control this NAS" })
    .closest("[data-slot=card]") as HTMLElement;

describe("the Users list (1)", () => {
  it("lists each person with their description, email, groups and powers", async () => {
    await usersPage("usersSome");
    const alex = await rowOf("alex");
    expect(alex).toHaveTextContent("Alex at home");
    expect(alex).toHaveTextContent("alex@example.org");
    expect(alex).toHaveTextContent("family");
    const robin = await rowOf("robin");
    expect(robin).toHaveTextContent(/family, kids/);
    expect(robin).toHaveTextContent("Allowed");
    const sam = await rowOf("sam");
    expect(within(sam).getAllByText("None").length).toBeGreaterThan(0);
    expect(
      within(table()).getByRole("link", { name: "Open alex" }),
    ).toHaveAttribute("href", "/ui/usermgmt/users/alex");
    expect(
      screen.getAllByRole("link", { name: "Add a person" })[0],
    ).toHaveAttribute("href", "/ui/usermgmt/users/add");
    expect(
      screen.getByText(/The built-in admin account is not on this list/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Users in the classic interface/ }),
    ).toHaveAttribute("href", "/#/usermgmt/users");
  });

  it("says first who can control the NAS, with links to each person", async () => {
    await usersPage("usersSome");
    await rowOf("alex");
    const summary = card();
    expect(summary).toHaveTextContent(
      /Administrators: .?alex.?, and the built-in admin account\./,
    );
    expect(summary).toHaveTextContent(/May sign in over SSH: .?robin.?\./);
    expect(
      within(summary).getByRole("link", { name: "Open robin" }),
    ).toHaveAttribute("href", "/ui/usermgmt/users/robin");
  });

  it("names the people in system groups that give control of the NAS", async () => {
    await usersPage("usersSystemGroups");
    await rowOf("alex");
    expect(card()).toHaveTextContent(
      /In system groups that give control of the NAS: .?alex.? \(.?sudo.?, .?docker.?\)\./,
    );
    expect(card()).toHaveTextContent(/.?robin.? \(.?root.?\)/);
    // audio is not warned.
    expect(card()).not.toHaveTextContent(/sam/);
  });

  it("searches name, description and email, and says when nothing matches", async () => {
    const { user } = await usersPage("usersSome");
    await rowOf("alex");
    await user.type(
      screen.getByRole("searchbox", { name: "Search people" }),
      "home",
    );
    expect(
      within(table()).getByRole("link", { name: "Open alex" }),
    ).toBeVisible();
    expect(
      within(table()).queryByRole("link", { name: "Open robin" }),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "Search people" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search people" }),
      "zz",
    );
    expect(screen.getByText('No people match "zz".')).toBeVisible();
    await user.click(
      within(table()).getByRole("button", { name: "Clear the search" }),
    );
    expect(
      within(table()).getByRole("link", { name: "Open robin" }),
    ).toBeVisible();
  });

  it("sorts by a column and says so", async () => {
    const { user } = await usersPage("usersSome");
    await rowOf("alex");
    await user.click(screen.getByRole("button", { name: "Name" }));
    const names = within(table())
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(names).toEqual(["sam", "robin", "alex"]);
    expect(screen.getByText("Sorted by Name, descending")).toBeInTheDocument();
  });

  it("pages at 50 rows with many people", async () => {
    await usersPage("usersMany");
    await rowOf("example-user-0001");
    expect(within(table()).getAllByRole("link")).toHaveLength(50);
    expect(screen.getByText("1–50 of 1000")).toBeVisible();
  });

  it("says there is nobody yet, keeping the summary's first line", async () => {
    await usersPage("usersNone");
    expect(
      await screen.findByText(
        /There is nobody on this NAS yet apart from the built-in admin account/,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(card()).toHaveTextContent(
      "Only the built-in admin account is an administrator.",
    );
    expect(card()).not.toHaveTextContent(/SSH/);
  });

  it("says when the list could not be read, with the server's words and a retry", async () => {
    await usersPage("usersReadsFailUserList");
    expect(
      await screen.findByText(
        "Could not read the people on this NAS.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Who can control this NAS" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the list when the groups could not be read, and says so", async () => {
    await usersPage("usersReadsFailGroupList");
    const alex = await rowOf("alex");
    expect(screen.getByText("Could not read the groups.")).toBeVisible();
    expect(alex).toHaveTextContent("Not known");
  });

  it("says SSH could not be checked when SSH.get fails", async () => {
    await usersPage("usersSshUnknown");
    await rowOf("robin");
    expect(card()).toHaveTextContent("Could not check whether SSH is on.");
  });

  it("marks the signed-in person and shows text from the server as text", async () => {
    await usersPage("usersSelf");
    const me = await rowOf("example-admin");
    expect(me).toHaveTextContent("(you)");
  });

  it("shows a person called add as text, with the classic list's link (14.2)", async () => {
    await usersPage("usersHostile");
    await rowOf("alex");
    expect(
      within(table()).queryByRole("link", { name: "Open add" }),
    ).not.toBeInTheDocument();
    expect(
      within(table()).getAllByText(/This person's page cannot open here/)
        .length,
    ).toBeGreaterThan(0);
    // Markup in a description is text, never an element (UI-2).
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getAllByText(/<img/).length).toBeGreaterThan(0);
  });
});
