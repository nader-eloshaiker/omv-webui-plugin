// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard and the rsync server (phase 5 services design 12.2): the row for an rsync server that
// is on but not running leads to its tab here instead of the classic interface, and the map's way in
// for it is on but not running.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";

const LONG = { timeout: 15_000 };

describe("the dashboard's rsync server row (12.2)", () => {
  it("leads to the rsync server tab from what needs you", async () => {
    await renderApp({
      signedIn: true,
      scenario: "checklistHidden",
      answers: {
        servicesGetStatus: {
          status: 200,
          value: {
            total: 1,
            data: [
              {
                name: "rsyncd",
                title: "RSync server",
                enabled: true,
                running: false,
              },
            ],
          },
        },
      },
    });
    const needs = await screen.findByRole(
      "region",
      { name: "What needs you" },
      LONG,
    );
    expect(needs).toHaveTextContent("RSync server is not running");
    expect(
      within(needs).getByRole("link", { name: "Open the rsync server" }),
    ).toHaveAttribute("href", "/ui/services/rsync/server");
    expect(
      within(screen.getByRole("region", { name: "Your NAS" })).getByRole(
        "button",
        { name: /Copies to other NAS \(rsync\): on but not running/ },
      ),
    ).toBeInTheDocument();
  });
});
