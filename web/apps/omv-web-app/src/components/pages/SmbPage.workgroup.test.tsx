// SPDX-License-Identifier: GPL-3.0-or-later
// The workgroup on Windows and Mac sharing, on the remembering services mock (phase 5 services design
// 11.2; 0.10, 0.11; P15): the stored value, OMV's NetBIOS-name rule on blur and on Save (1 to 15 of
// its characters), the save with every other setting kept, OMV's own refusal, and the footer line.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 15_000 };

async function page(answers: Answers = {}) {
  const app = await renderApp({
    signedIn: true,
    scenario: "servicesSome",
    path: "/services/smb",
    answers,
  });
  const heading = await screen.findByRole(
    "heading",
    { level: 2, name: "Workgroup" },
    LONG,
  );
  return { ...app, card: heading.closest("section") as HTMLElement };
}

const sent = () =>
  seenCalls
    .filter((c) => c.call === "SMB.setSettings")
    .map((c) => c.params as Record<string, unknown>);

describe("the workgroup (11.2)", () => {
  it("shows the stored workgroup with what it is, and the new footer line", async () => {
    const { card } = await page();
    expect(card).toHaveTextContent(
      "The name Windows computers use to group computers on a network. Most networks use WORKGROUP.",
    );
    expect(
      within(card).getByRole("textbox", { name: "Workgroup" }),
    ).toHaveValue("WORKGROUP");
    expect(
      screen.getByText(
        "Home folders, protocol versions and other options are in the classic interface.",
      ),
    ).toBeVisible();
  });

  it.each(["BAD/NAME", "X".repeat(16), "Gruppé"])(
    "refuses %s on blur and on Save, without a call",
    async (value) => {
      const { card, user } = await page();
      const field = within(card).getByRole("textbox", { name: "Workgroup" });
      await user.clear(field);
      await user.type(field, value);
      await user.tab();
      const rule =
        "Use 1 to 15 letters, digits, spaces or ! # $ % & ' ( ) - . @ ^ _ { } ~.";
      expect(within(card).getByText(rule)).toBeVisible();
      await user.click(within(card).getByRole("button", { name: "Save" }));
      expect(callNames()).not.toContain("SMB.setSettings");
      expect(field).toHaveFocus();
    },
  );

  it("refuses an empty workgroup", async () => {
    const { card, user } = await page();
    await user.clear(within(card).getByRole("textbox", { name: "Workgroup" }));
    await user.click(within(card).getByRole("button", { name: "Save" }));
    expect(
      within(card).getByText(
        "Use 1 to 15 letters, digits, spaces or ! # $ % & ' ( ) - . @ ^ _ { } ~.",
      ),
    ).toBeVisible();
    expect(callNames()).not.toContain("SMB.setSettings");
  });

  it("saves a valid one with every other setting kept, to the band", async () => {
    const { card, user } = await page();
    const field = within(card).getByRole("textbox", { name: "Workgroup" });
    await user.clear(field);
    await user.type(field, "HOME NET");
    await user.click(within(card).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "The workgroup is saved. Apply the changes to use it.",
        {},
        LONG,
      ),
    ).toBeVisible();
    const [body] = sent();
    expect(body?.workgroup).toBe("HOME NET");
    expect(body?.enable).toBe(true);
    expect(body).toHaveProperty("serverstring");
    expect(body).toHaveProperty("homesenable");
    await waitFor(() => expect(card).toHaveTextContent("Not applied yet"));
    expect(field).toHaveValue("HOME NET");
  }, 30_000);

  it("shows OMV's refusal as text", async () => {
    const { card, user } = await page({ smbSetSettings: "badWorkgroup" });
    const field = within(card).getByRole("textbox", { name: "Workgroup" });
    await user.clear(field);
    await user.type(field, "HOME");
    await user.click(within(card).getByRole("button", { name: "Save" }));
    expect(
      await within(card).findByText("The workgroup was not saved.", {}, LONG),
    ).toBeVisible();
    expect(card).toHaveTextContent("is not a valid NetBIOS name");
  });
});
