// SPDX-License-Identifier: GPL-3.0-or-later
// Network > General, "Name of this NAS" (phase 5 network design 2) through the whole app on MSW, with
// the network mock's stories and the contract's examples: how others find it now, "If you change it"
// (the certificate line only with HTTPS on, the 15-character line), the checks in the browser, an
// ordinary save to the band sending the name in lower case, OMV's refusals (400 and 500) as text under
// the field they name, the change flow opening in place when the page was opened by the old name
// (networkByName), the connection line only then, the states of 2.4, and a normal user.
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls, server } from "../../test/server.ts";

async function page(scenario: ScenarioName, answers = {}) {
  const view = await renderApp({
    signedIn: true,
    scenario,
    path: "/network/general",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Name of this NAS" });
  const name = await screen.findByRole("textbox", { name: "Name" });
  return {
    ...view,
    name,
    domain: screen.getByRole("textbox", { name: "Domain" }),
  };
}

const save = () =>
  screen.getByRole("button", { name: /^(Save|Review the change…)$/u });

describe("2.2: the name card", () => {
  it("shows the stored name and how other computers find it, without a connection line at an address", async () => {
    const { name, domain } = await page("networkOne");
    expect(name).toHaveValue("nas");
    expect(domain).toHaveValue("");
    expect(
      screen.getByText(/^Other computers find this NAS as/u),
    ).toHaveTextContent(
      "Other computers find this NAS as nas, as nas.local on most computers, and as \\\\nas from Windows.",
    );
    expect(screen.queryByText(/^This page reaches the NAS/u)).toBeNull();
    expect(save()).toHaveAttribute("aria-disabled", "true");
    expect(save()).toHaveAccessibleDescription("No changes to save");
    expect(
      screen.getByRole("link", { name: /^Name in the classic interface/u }),
    ).toHaveAttribute("href", "/#/network/general");
  });

  it("lists what a new name changes for other computers while it differs", async () => {
    const { user, name } = await page("networkOne");
    await user.clear(name);
    await user.type(name, "averyveryLongname1");
    const list = screen.getByRole("heading", { name: "If you change it" })
      .parentElement as HTMLElement;
    expect(list).toHaveTextContent(
      "Windows and Mac computers that open \\\\nas or smb://nas must use the new name.",
    );
    expect(list).toHaveTextContent(
      "Bookmarks to this NAS by its name stop working.",
    );
    expect(list).toHaveTextContent(
      "Windows computers that use old-style names see only the first 15 characters: averyverylongna.",
    );
    // HTTPS is off: no certificate line.
    expect(list).not.toHaveTextContent(/certificate/u);
    // Discard puts the stored values back and the list goes.
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(name).toHaveValue("nas");
    expect(
      screen.queryByRole("heading", { name: "If you change it" }),
    ).toBeNull();
  });

  it("adds the certificate line only when HTTPS is on", async () => {
    const { user, name } = await page("networkOne", {
      webGuiGetSettings: "https",
    });
    await user.type(name, "2");
    expect(
      await screen.findByText(
        /browsers warn that the certificate does not match/u,
      ),
    ).toBeVisible();
  });

  it("shows the connection line when the page was opened by name", async () => {
    await page("networkByName");
    expect(
      await screen.findByText(/^This page reaches the NAS by its name/u),
    ).toHaveTextContent(
      "This page reaches the NAS by its name, nas.example.org, most likely through enp2s0.",
    );
  });
});

describe("0.8: the checks in the browser", () => {
  it("refuses a name that is not one, on blur and on Save, and focuses it", async () => {
    const { user, name, domain } = await page("networkOne");
    await user.clear(name);
    await user.type(name, "nas-");
    await user.click(domain);
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining(
        "Use 1 to 63 letters, digits and hyphens, not starting or ending with a hyphen.",
      ),
    );
    await user.click(save());
    expect(name).toHaveFocus();
    expect(callNames()).not.toContain("Network.setGeneralSettings");
  });

  it("refuses local and the reserved domains in words", async () => {
    const { user, name, domain } = await page("networkOne");
    await user.type(domain, "local");
    await user.click(name);
    expect(domain).toHaveAccessibleDescription(
      expect.stringContaining(
        "local is used by the names computers find each other by (.local). Choose another, such as internal.",
      ),
    );
    await user.clear(domain);
    await user.type(domain, "Example");
    await user.click(name);
    expect(domain).toHaveAccessibleDescription(
      expect.stringContaining("Example is set aside and cannot be a domain."),
    );
  });
});

describe("2.4: saving", () => {
  it("saves to the band in lower case, with the toast and the pending mark", async () => {
    const { user, name, domain } = await page("networkOne");
    const readsBefore = callNames().filter(
      (c) => c === "Network.getGeneralSettings",
    ).length;
    await user.clear(name);
    await user.type(name, "Nas-Two");
    await user.type(domain, "internal");
    expect(save()).toHaveAccessibleName("Save");
    await user.click(save());
    expect(
      await screen.findByText(
        "The new name is saved. It takes effect when you apply the changes.",
      ),
    ).toBeVisible();
    const sent = seenCalls.find((c) => c.call === "Network.setGeneralSettings");
    expect(sent?.params).toEqual({
      hostname: "nas-two",
      domainname: "internal",
    });
    // Read again just before the write (R4).
    const calls = callNames();
    const beforeWrite = calls.slice(
      0,
      calls.indexOf("Network.setGeneralSettings"),
    );
    expect(
      beforeWrite.filter((c) => c === "Network.getGeneralSettings").length,
    ).toBeGreaterThan(readsBefore);
    const card = screen.getByRole("region", { name: /^Name of this NAS/u });
    expect(await within(card).findByText("Not applied yet")).toBeVisible();
    await waitFor(() => expect(name).toHaveValue("nas-two"));
  });

  it("shows OMV's refusal of a name (400) as text under the name, and focuses it", async () => {
    const { user, name } = await page("networkOne", {
      networkSetGeneralSettings: "hyphenAtEnd",
    });
    await user.type(name, "2");
    await user.click(save());
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining(
          "hostname: The value 'nas-' is not a valid hostname.",
        ),
      ),
    );
    expect(name).toHaveFocus();
    expect(name).toHaveValue("nas2");
  });

  it("shows OMV's refusal of a domain (500) as text under the domain", async () => {
    const { user, domain } = await page("networkOne", {
      networkSetGeneralSettings: "domainLocal",
    });
    await user.type(domain, "home");
    await user.click(save());
    await waitFor(() =>
      expect(domain).toHaveAccessibleDescription(
        expect.stringContaining('domainname: The value "local" must not match'),
      ),
    );
    expect(domain).toHaveFocus();
  });
});

describe("1.4: a new name that moves this page", () => {
  it("reads Review the change… with what it does to this page, and opens the flow in place", async () => {
    const { user, name } = await page("networkByName");
    await user.clear(name);
    await user.type(name, "store");
    const review = screen.getByRole("button", { name: "Review the change…" });
    // The class's line is the button's description (19.2).
    const described = document.getElementById(
      review.getAttribute("aria-describedby") ?? "",
    );
    expect(described).toHaveTextContent(
      "This page stops working at nas.example.org. The NAS will be at store.example.org.",
    );
    await user.click(review);
    expect(
      await screen.findByRole("heading", {
        name: "Review the change to the name of this NAS",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("textbox", {
        name: "Type the new name to confirm it: store",
      }),
    ).toBeVisible();
    expect(callNames()).not.toContain("Network.setGeneralSettings");
    // Back returns to the form with its values.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue(
      "store",
    );
  });
});

describe("2.4: states", () => {
  it("says it is loading while the name is on its way", async () => {
    const { app } = await renderApp({
      signedIn: true,
      scenario: "networkOne",
      path: "/account/settings",
    });
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: string };
        if (body.method === "getGeneralSettings") {
          await delay("infinite");
        }
        return undefined;
      }),
    );
    await app.router.navigate({ to: "/network/general" });
    expect(
      await screen.findByText("Loading the name of this NAS…"),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("when the name cannot be read: the server's message and Try again, and no form", async () => {
    await renderApp({
      signedIn: true,
      scenario: "networkReadFailsName",
      path: "/network/general",
    });
    expect(
      await screen.findByText("Could not read the name of this NAS."),
    ).toBeVisible();
    expect(screen.getByText(/Failed to execute XPath query/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });
});

describe("hostile values", () => {
  it("shows a long domain as text", async () => {
    const { domain } = await page("networkHostile");
    expect((domain as HTMLInputElement).value.length).toBe(200);
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("14.1: a normal user", () => {
  it("gets the only-administrators page, and nothing is called first", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/network/general",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeVisible();
    for (const call of callNames()) {
      expect(call.startsWith("Network.")).toBe(false);
    }
  });
});
