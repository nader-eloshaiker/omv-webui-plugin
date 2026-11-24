// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Proxy (phase 5 network design 12) through the whole app on the network mock's stories,
// every write held to the contract: the three cards, a stored password typed again or removed before
// the save is offered (12.3), setProxy's fifteen fields, no password in the page, the address or the
// query and mutation caches after the save (UI-6), the checks, the re-read before the save, the four
// states, and nothing written on load.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { App } from "../../app.ts";
import type { NetworkScenarioName } from "../../mocks/networkScenarios.ts";
import {
  EXAMPLE_PASSWORD,
  holdNetworkWritesToContract,
  networkStateOf,
} from "../../test/networkAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf, watchStorage } from "../../test/secrets.ts";
import { callNames, seenCalls } from "../../test/server.ts";

const LONG = { timeout: 5000 };
const TYPED = "typed-Proxy-pw9";

async function proxyPage(scenario: NetworkScenarioName) {
  const view = await renderApp({
    scenario,
    signedIn: true,
    path: "/network/proxy",
  });
  await screen.findByRole("heading", { name: "Proxy" }, LONG);
  return view;
}

const card = async (name: string): Promise<HTMLElement> => {
  const heading = await screen.findByRole("heading", { name }, LONG);
  const found = heading.closest<HTMLElement>("[data-proxy]");
  if (found === null) {
    throw new Error(`no card ${name}`);
  }
  return found;
};

const cachesOf = (app: App) =>
  JSON.stringify([
    app.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.state.data),
    app.queryClient
      .getMutationCache()
      .getAll()
      .map((m) => [m.state.variables, m.state.data]),
  ]);

const setProxyParams = () =>
  seenCalls.filter((c) => c.call === "Network.setProxy").map((c) => c.params);

async function answerStored(user: UserEvent) {
  const http = await card("Web (HTTP)");
  await user.click(
    within(http).getByRole("radio", { name: "Keep it: type it again" }),
  );
  await user.type(
    within(http).getByLabelText("Password", { selector: "input" }),
    TYPED,
  );
  const https = await card("Secure web (HTTPS)");
  await user.click(
    within(https).getByRole("radio", { name: "Remove the stored password" }),
  );
}

describe("stored passwords (12.3, P9)", () => {
  it("each must be typed again or removed before saving; the save sends them and keeps none", async () => {
    const { user, mock, app } = await proxyPage("proxySet");
    holdNetworkWritesToContract(mock);
    const storage = watchStorage();
    const http = await card("Web (HTTP)");
    expect(within(http).getByText("Password: Set")).toBeInTheDocument();
    expect(
      within(await card("File transfer (FTP)")).queryByText("Password: Set"),
    ).toBeNull();
    expect(
      within(http).getByRole("textbox", { name: "Proxy address" }),
    ).toHaveValue("proxy.example.org");
    // A change, with the two stored passwords not yet answered.
    const port = within(http).getByRole("textbox", { name: "Port" });
    await user.clear(port);
    await user.type(port, "3130");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("main")).toHaveTextContent(
      "Type the stored password again, or remove it, for: Web (HTTP), Secure web (HTTPS).",
    );
    await answerStored(user);
    expect(save).not.toHaveAttribute("aria-disabled", "true");
    await user.click(save);
    expect(
      await screen.findByText(
        "The proxy settings are saved. They take effect when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(setProxyParams()).toEqual([
      {
        httpenable: true,
        httphost: "proxy.example.org",
        httpport: 3130,
        httpusername: "example-user",
        httppassword: TYPED,
        httpsenable: true,
        httpshost: "proxy.example.org",
        httpsport: 3129,
        httpsusername: "example-user",
        httpspassword: "",
        ftpenable: true,
        ftphost: "proxy.example.org",
        ftpport: 2121,
        ftpusername: "",
        ftppassword: "",
      },
    ]);
    expect(networkStateOf(mock).config.proxy.https.password).toBe("");
    // Nothing keeps a password: not the page, the address, storage or the caches (UI-6).
    await waitFor(() => expect(markupOf()).not.toContain(TYPED));
    expect(markupOf()).not.toContain(EXAMPLE_PASSWORD);
    expect(window.location.href).not.toContain(TYPED);
    expect(storage.wrote(TYPED)).toBe(false);
    await waitFor(() => {
      const caches = cachesOf(app);
      expect(caches).not.toContain(TYPED);
      expect(caches).not.toContain(EXAMPLE_PASSWORD);
    });
    // After the save the form is as read again: the stored password needs its answer again.
    expect(
      within(await card("Web (HTTP)")).getByRole("radio", {
        name: "Keep it: type it again",
      }),
    ).not.toBeChecked();
    expect(screen.getByText("Not applied yet")).toBeInTheDocument();
  }, 30_000);

  it("refuses the save when the settings changed since the page read them, and forgets what was typed", async () => {
    const { user, mock } = await proxyPage("proxySet");
    await answerStored(user);
    networkStateOf(mock).config.proxy.ftp.host = "other.example.org";
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "The proxy settings were changed since you opened them. They are shown as they are now; make your changes again.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(setProxyParams()).toEqual([]);
    await waitFor(async () =>
      expect(
        within(await card("File transfer (FTP)")).getByRole("textbox", {
          name: "Proxy address",
        }),
      ).toHaveValue("other.example.org"),
    );
    expect(markupOf()).not.toContain(TYPED);
  }, 30_000);
});

describe("no proxy yet", () => {
  it("fields wait for the tick; a new password is optional; the checks name the field", async () => {
    const { user, mock } = await proxyPage("firewallNone");
    holdNetworkWritesToContract(mock);
    const ftp = await card("File transfer (FTP)");
    expect(
      within(ftp).getByRole("textbox", { name: "Proxy address" }),
    ).toBeDisabled();
    expect(within(ftp).queryByText("Password: Set")).toBeNull();
    await user.click(
      within(ftp).getByRole("checkbox", {
        name: "Use a proxy for File transfer (FTP)",
      }),
    );
    const host = within(ftp).getByRole("textbox", { name: "Proxy address" });
    expect(host).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await within(ftp).findByText(
        "Write the proxy's name or address, such as proxy.example.org.",
      ),
    ).toBeInTheDocument();
    expect(host).toHaveFocus();
    await user.type(host, "proxy.example.org");
    const port = within(ftp).getByRole("textbox", { name: "Port" });
    await user.clear(port);
    await user.type(port, "70000");
    await user.tab();
    expect(
      await within(ftp).findByText("Write a port from 1 to 65535."),
    ).toBeInTheDocument();
    await user.clear(port);
    await user.type(port, "2121");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(
      "The proxy settings are saved. They take effect when you apply the changes.",
      {},
      LONG,
    );
    expect(setProxyParams()).toEqual([
      expect.objectContaining({
        ftpenable: true,
        ftphost: "proxy.example.org",
        ftpport: 2121,
        ftppassword: "",
        httppassword: "",
      }),
    ]);
  }, 30_000);

  it("Discard changes puts the read values back", async () => {
    const { user } = await proxyPage("firewallNone");
    const http = await card("Web (HTTP)");
    await user.click(
      within(http).getByRole("checkbox", {
        name: "Use a proxy for Web (HTTP)",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(
      within(http).getByRole("checkbox", {
        name: "Use a proxy for Web (HTTP)",
      }),
    ).not.toBeChecked();
    expect(screen.getByText("No changes to save")).toBeInTheDocument();
  });
});

describe("states (12.4) and safety", () => {
  it("loading, then the three cards", async () => {
    await renderApp({
      scenario: "proxySet",
      signedIn: true,
      path: "/network/proxy",
    });
    expect(
      await screen.findByText("Reading the proxy settings…", {}, LONG),
    ).toBeInTheDocument();
    expect(await card("Secure web (HTTPS)")).toBeInTheDocument();
  });

  it("a failed read says so with the server's message and Try again", async () => {
    await proxyPage("networkReadFailsProxy");
    expect(
      await screen.findByText("Could not read the proxy settings.", {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Failed to execute XPath query '//system/network/proxy'.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("shows hostile values as values, never markup", async () => {
    await proxyPage("networkHostile");
    const http = await card("Web (HTTP)");
    const user = within(http).getByRole<HTMLInputElement>("textbox", {
      name: "User name",
    });
    expect(user.value).toContain('<img src=x onerror="alert(1)">');
    expect(document.querySelector("main img")).toBeNull();
    expect(markupOf()).not.toContain(EXAMPLE_PASSWORD);
  });

  it("calls nothing that changes state on load, and keeps a normal user off", async () => {
    await proxyPage("proxySet");
    await card("Web (HTTP)");
    expect(
      callNames().filter(
        (c) =>
          !/\.(get|is|enumerate)/u.test(c) && c !== "Zfs.listCompressionTypes",
      ),
    ).toEqual([]);
  });

  it("a normal user gets the only-administrators page, and no proxy read", async () => {
    await renderApp({
      scenario: "user",
      signedIn: true,
      path: "/network/proxy",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("Network.getProxy");
  });
});
