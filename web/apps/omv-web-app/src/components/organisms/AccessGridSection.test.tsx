// SPDX-License-Identifier: GPL-3.0-or-later
// The access grid as the folder page and the add flow mount it (phase 5 shares design 3.2, 0.4): the
// group lines, the administrator's row, "Set all shown to" leaving Blocked rows alone, and choices
// set back to what is stored no longer counting as changes; and (phase 5 users design 13.1) each name
// a router link to the person's or group's page, except where there is no such page.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import "../../services/i18n/index.ts";
import {
  accessModel,
  type Access,
  type AccessModel,
} from "../../sharedFolders/accessModel.ts";
import { AccessGridSection } from "./AccessGridSection.tsx";

const MODEL: AccessModel = accessModel(
  [
    { name: "alex", groups: ["users", "family"] },
    { name: "sam", groups: ["users"], comment: "Sam's laptop" },
    { name: "robin", groups: ["users", "family"] },
    { name: "admin", groups: ["users"] },
    { name: "add", groups: ["users"] },
  ],
  [{ name: "family", members: ["alex", "robin"] }],
  {
    privilege: [
      { type: "group", name: "family", perms: 7 },
      { type: "user", name: "robin", perms: 0 },
    ],
  },
);

function Harness({
  onChange,
}: {
  onChange?: (c: Record<string, Access>) => void;
}) {
  const [choices, setChoices] = useState<Record<string, Access>>({});
  return (
    <AccessGridSection
      label="Who can use Photos"
      model={MODEL}
      choices={choices}
      onChoicesChange={(next) => {
        setChoices(next);
        onChange?.(next);
      }}
    />
  );
}

/** The grid inside a router, as the app mounts it, so its name links resolve. */
async function renderGrid(onChange?: (c: Record<string, Access>) => void) {
  const root = createRootRoute({
    component: () => <Harness onChange={onChange} />,
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("radiogroup", { name: /^Access for .?sam.?$/ });
}

const row = (name: string) =>
  screen.getByRole("radiogroup", {
    name: new RegExp(`^Access for .?${name}.?$`),
  });

describe("AccessGridSection", () => {
  it("says what a group adds and what a block takes away", async () => {
    await renderGrid();
    expect(
      screen.getByText(/Also gets Read and write as a member of .family.\./),
    ).toBeVisible();
    expect(
      screen.getByText(/Blocked: cannot open it, even through .family.\./),
    ).toBeVisible();
    expect(screen.getByText("Sam's laptop")).toBeVisible();
    expect(
      within(row("robin")).getByRole("radio", { name: "Blocked" }),
    ).toBeChecked();
  });

  it("shows the administrator's row as unavailable, with its reason", async () => {
    await renderGrid();
    expect(
      screen.getByText(
        "The web interface's administrator account cannot be given access to shared folders.",
      ),
    ).toBeVisible();
  });

  it("forgets a change set back to what is stored", async () => {
    const user = userEvent.setup();
    const seen: Record<string, Access>[] = [];
    await renderGrid((c) => seen.push(c));
    await user.click(
      within(row("sam")).getByRole("radio", { name: "Read only" }),
    );
    expect(seen.at(-1)).toEqual({ "user:sam": "ro" });
    await user.click(
      within(row("sam")).getByRole("radio", { name: "No access" }),
    );
    expect(seen.at(-1)).toEqual({});
  });

  it("links each person and group to their page (13.1)", async () => {
    await renderGrid();
    expect(screen.getByRole("link", { name: "Open robin" })).toHaveAttribute(
      "href",
      "/usermgmt/users/robin",
    );
    expect(
      screen.getByRole("link", { name: "Open group family" }),
    ).toHaveAttribute("href", "/usermgmt/groups/family");
  });

  it("shows a name with no page of its own as text (the administrator, add)", async () => {
    await renderGrid();
    expect(screen.queryByRole("link", { name: "Open admin" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open add" })).toBeNull();
    expect(screen.getByText("add")).toBeVisible();
  });
});
