// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard and the rsync server (phase 5 services design 12.2): the Services card's rsync server
// row leads to its tab here, and the attention row for an rsync server that is on but not running
// links there instead of the classic interface.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";

const LONG = { timeout: 15_000 };

describe("the dashboard's rsync server row (12.2)", () => {
  it("leads to the rsync server tab from the card and the attention row", async () => {
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
    await screen.findByRole("heading", { level: 1, name: "Dashboard" }, LONG);
    const services = screen.getByRole("region", { name: "Services" });
    expect(
      await within(services).findByRole("link", { name: "RSync server" }, LONG),
    ).toHaveAttribute("href", "/ui/services/rsync/server");
    const attention = await screen.findByRole(
      "region",
      { name: "Needs attention" },
      LONG,
    );
    expect(
      within(attention).getByRole("link", { name: "Open the rsync server" }),
    ).toHaveAttribute("href", "/ui/services/rsync/server");
  });
});
