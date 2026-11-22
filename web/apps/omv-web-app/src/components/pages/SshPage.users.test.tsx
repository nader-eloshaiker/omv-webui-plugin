// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SSH and the people (phase 5 users design 13.2): the hints about each person's own SSH
// access and keys link to Users, and a line under "Turn on SSH" says who may sign in over SSH (in
// `_ssh` or `root`), at most five names, or that nobody may yet. Names are text (UI-2).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";

const LONG = { timeout: 15000 };
const person = (name: string, groups: string[]) => ({
  name,
  groups: ["users", ...groups],
  shell: "/usr/bin/sh",
});
const list = (people: ReturnType<typeof person>[]) => ({
  userMgmtGetUserList: {
    status: 200,
    value: { total: people.length, data: people },
  },
});

async function sshPage(answers = {}) {
  await renderApp({ signedIn: true, path: "/services/ssh", answers });
  await screen.findByRole("checkbox", { name: "Turn on SSH" }, LONG);
}

describe("the SSH page and the people (13.2)", () => {
  it("links both hints to Users", async () => {
    await sshPage();
    const links = within(
      screen.getByRole("form", { name: "SSH" }),
    ).getAllByRole("link", { name: "Users" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/ui/usermgmt/users");
    }
  });

  it("says nobody may sign in over SSH yet", async () => {
    await sshPage(list([person("sam", [])]));
    expect(
      await screen.findByText(
        "Nobody may sign in over SSH yet: allow it on a person's page.",
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("names who may, in natural order, members of root too", async () => {
    await sshPage(
      list([
        person("sam", []),
        person("robin", ["_ssh"]),
        person("alex", ["root"]),
      ]),
    );
    expect(
      await screen.findByText(
        /^People who may sign in over SSH: .?alex.? and .?robin.?\.$/,
        {},
        LONG,
      ),
    ).toBeVisible();
  });

  it("names at most five, then how many more, as text", async () => {
    await sshPage(
      list([
        ...["p1", "p2", "p3", "p4", "p5", "p6", "p7"].map((n) =>
          person(n, ["_ssh"]),
        ),
        person("<b>x</b>", ["_ssh"]),
      ]),
    );
    const line = await screen.findByText(
      /^People who may sign in over SSH: .*and 3 more\.$/,
      {},
      LONG,
    );
    expect(line.textContent).toContain("<b>x</b>");
    expect(line.querySelector("b")).toBeNull();
  });
});
