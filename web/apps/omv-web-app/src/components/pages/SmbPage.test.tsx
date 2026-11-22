// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SMB/CIFS, "Windows and Mac sharing", through the whole app on the remembering mock (phase
// 5 shares design 5; owner, P12): the state line in each state, turning it on (a save to the band,
// checked against the name rule first) and off (a plain confirmation naming the folders), the shares
// table with each folder linked to its page, and the table's own failure with the switch kept.
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15_000 };

async function page(
  scenario: ScenarioName,
  answers: Parameters<typeof renderApp>[0] extends infer O
    ? O extends { answers?: infer A }
      ? A
      : never
    : never = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/services/smb",
    answers,
  });
  await screen.findByRole(
    "heading",
    { level: 1, name: "Windows and Mac sharing" },
    LONG,
  );
  return app;
}

const stateLine = async (text: string) => screen.findByText(text, {}, LONG);
const settingsSent = () =>
  seenCalls
    .filter((c) => c.call === "SMB.setSettings")
    .map((c) => c.params as Record<string, unknown>);

describe("Windows and Mac sharing", () => {
  it("says it is off, and turns it on as a save to the band, keeping every other setting", async () => {
    const { user } = await page("sharesNone");
    const line = await stateLine(
      "Off. No folder can be reached from Windows or Mac computers.",
    );
    expect(line.parentElement).toHaveTextContent("Disabled");
    expect(screen.getByText("Windows and Mac sharing is off.")).toBeVisible();
    expect(
      screen.getByText(
        "No folder is shared with Windows and Mac computers yet. Open a shared folder to share it.",
      ),
    ).toBeVisible();
    const button = screen.getByRole("button", { name: "Turn on" });
    await user.click(button);
    expect(
      await screen.findByText(
        "Windows and Mac sharing will turn on when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    const sent = settingsSent()[0];
    expect(sent?.enable).toBe(true);
    expect(sent).toHaveProperty("workgroup");
    expect(sent).toHaveProperty("homesenable");
    expect(
      await stateLine(
        "Turned on. It starts when you apply the pending changes.",
      ),
    ).toBeVisible();
    const after = await screen.findByRole("button", { name: "Turn off…" });
    await waitFor(() => expect(after).toHaveFocus());
  }, 30_000);

  it("says it is on, lists the shares with their pages and addresses, and turns off after naming them", async () => {
    const { user } = await page("sharesSome");
    expect(await stateLine("On.")).toBeVisible();
    const table = await screen.findByRole("region", { name: "Shared folders" });
    const photos = within(table).getByRole("link", {
      name: "Open shared folder Photos",
    });
    expect(photos.getAttribute("href")).toMatch(
      /^\/ui\/storage\/shared-folders\/[0-9a-f-]{36}$/u,
    );
    expect(table).toHaveTextContent("\\\\nas\\Photos");
    const rows = within(table).getAllByRole("row");
    expect(rows[2]).toHaveTextContent("Public");
    expect(rows[2]).toHaveTextContent("On");
    await user.click(screen.getByRole("button", { name: "Turn off…" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Turn off Windows and Mac sharing?",
    });
    expect(dialog).toHaveTextContent(
      "2 folders are shared now (Photos, Public).",
    );
    expect(dialog).toHaveTextContent(
      "If you are using a shared folder from this computer, close its files first.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("SMB.setSettings");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    expect(
      await screen.findByText(
        "Windows and Mac sharing will turn off when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(settingsSent()[0]?.enable).toBe(false);
    expect(
      await screen.findByRole("button", { name: "Turn on" }),
    ).toBeVisible();
  }, 30_000);

  it("says when it is on but not running, with the service details", async () => {
    await page("sharesSmbDown");
    const line = await stateLine(
      "On, but not running. Shared folders cannot be reached. The SMB service details may say why.",
    );
    expect(line.parentElement).toHaveTextContent("Critical");
    expect(
      screen.getByRole("link", { name: "Open the SMB service details" }),
    ).toHaveAttribute("href", "/ui/diagnostics/services/smb");
  });

  it("shows no switch when the settings cannot be read", async () => {
    await page("sharesSome", {
      smbGetSettings: { status: 500, message: "Settings unreadable." },
    });
    expect(
      await stateLine("Could not read whether Windows and Mac sharing is on."),
    ).toBeVisible();
    expect(screen.getByText("Settings unreadable.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Turn/u })).toBeNull();
  });

  it("keeps the switch when only the shares cannot be read", async () => {
    await page("sharesSome", {
      smbGetShareList: { status: 500, message: "Share list unreadable." },
    });
    expect(
      await screen.findByText(
        "Could not read the folders shared with Windows and Mac computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Share list unreadable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Turn off…" })).toBeVisible();
  });

  it("refuses to turn it on while the NAS's name is longer than 15 characters", async () => {
    const { user } = await page("sharesLongHost");
    const button = await screen.findByRole("button", { name: "Turn on" }, LONG);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("link", {
        name: /^Network settings in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/network/general");
    await user.click(button);
    expect(callNames()).not.toContain("SMB.setSettings");
  });

  it("links who is connected and the classic settings", async () => {
    await page("sharesSome");
    await stateLine("On.");
    expect(
      screen.getByRole("link", { name: "Who is connected now" }),
    ).toHaveAttribute("href", "/ui/diagnostics/services/smb");
    expect(
      screen.getByRole("link", {
        name: /^SMB\/CIFS settings in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/services/smb/settings");
  });

  it("keeps a normal user off the page without a call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/services/smb",
    });
    expect(
      await screen.findByText(/only administrators/iu, {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("SMB.getSettings");
  });
});
