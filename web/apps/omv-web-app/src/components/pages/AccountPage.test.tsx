// SPDX-License-Identifier: GPL-3.0-or-later
// Your account through the whole app on MSW serving the contract's examples: who may edit the
// details, saving them, the password typed twice and never kept (UI-6), a locked account, an
// administrator's view and the note about pending changes, the SSH keys, the leave prompt, and the
// address that lands on the password form.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { storageSnapshot } from "../../stores/storageSnapshot.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const SECRET = "correct horse battery staple";
const ACCOUNT = CONTRACT_EXAMPLES.userMgmtGetUserByContext.user.value;

async function account(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    scenario: "user",
    path: "/account/settings",
    ...options,
  });
  await screen.findByRole("heading", { level: 2, name: "Details" });
  return app;
}

const section = (name: string) => screen.getByRole("region", { name });
const newPassword = () => screen.getByLabelText("New password");
const repeatPassword = () =>
  screen.getByLabelText("Type the new password again");
const changeButton = () =>
  screen.getByRole("button", {
    name: /^Change password$|^Changing password…$/,
  });

describe("a normal user's details", () => {
  it("shows who is signed in and lets them edit description and email", async () => {
    await account();
    expect(
      screen.getByRole("heading", { level: 1, name: "Your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("example-user", { selector: "code" }),
    ).toBeInTheDocument();
    const details = section("Details");
    expect(
      within(details).getByRole("textbox", { name: "Description" }),
    ).toHaveValue("");
    const email = within(details).getByRole("textbox", {
      name: "Email address",
    });
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    const save = within(details).getByRole("button", { name: "Save details" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).toHaveAccessibleDescription("No changes to save");
  });

  it("saves the details and confirms it", async () => {
    const { user } = await account();
    const details = section("Details");
    await user.type(
      within(details).getByRole("textbox", { name: "Description" }),
      "Alex Example",
    );
    await user.type(
      within(details).getByRole("textbox", { name: "Email address" }),
      "alex@example.com",
    );
    await user.click(
      within(details).getByRole("button", { name: "Save details" }),
    );
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(
      seenCalls.find((c) => c.call === "UserMgmt.setUserByContext")?.params,
    ).toEqual({
      email: "alex@example.com",
      comment: "Alex Example",
    });
  });

  it("refuses an address the server would refuse, in words, and sends nothing", async () => {
    const { user } = await account();
    const details = section("Details");
    const email = within(details).getByRole("textbox", {
      name: "Email address",
    });
    await user.type(email, "alex@");
    await user.tab();
    expect(
      screen.getByText(
        "Enter an email address like name@example.com, or leave it empty.",
      ),
    ).toBeInTheDocument();
    await user.click(
      within(details).getByRole("button", { name: "Save details" }),
    );
    expect(email).toHaveFocus();
    expect(callNames()).not.toContain("UserMgmt.setUserByContext");
  });

  it("shows a refused save with the server's words, and keeps the edits", async () => {
    const { user } = await account({
      answers: { userMgmtSetUserByContext: "readOnly" },
    });
    const details = section("Details");
    const comment = within(details).getByRole("textbox", {
      name: "Description",
    });
    await user.type(comment, "Alex");
    await user.click(
      within(details).getByRole("button", { name: "Save details" }),
    );
    const alert = await within(details).findByRole("alert");
    expect(alert).toHaveTextContent("Your details were not saved.");
    expect(alert).toHaveTextContent(
      "Unauthorized attempt to modify the user account",
    );
    await waitFor(() => expect(alert).toHaveFocus());
    expect(comment).toHaveValue("Alex");
  });
});

describe("changing the password", () => {
  it("gives password managers what they need", async () => {
    await account();
    expect(newPassword()).toHaveAttribute("type", "password");
    expect(newPassword()).toHaveAttribute("autocomplete", "new-password");
    expect(repeatPassword()).toHaveAttribute("autocomplete", "new-password");
    const name = section("Change password").querySelector(
      'input[autocomplete="username"]',
    );
    expect(name).toHaveValue("example-user");
    expect(name).toHaveAttribute("readonly");
  });

  it("asks for both fields and for them to match, and sends nothing until they do", async () => {
    const { user } = await account();
    await user.click(changeButton());
    expect(screen.getByText("Enter a new password.")).toBeInTheDocument();
    expect(
      screen.getByText("Type the new password again."),
    ).toBeInTheDocument();
    expect(newPassword()).toHaveFocus();

    await user.type(newPassword(), SECRET);
    await user.type(repeatPassword(), `${SECRET}!`);
    await user.click(changeButton());
    expect(
      screen.getByText("The two passwords are not the same. Type them again."),
    ).toBeInTheDocument();
    expect(newPassword()).toHaveValue("");
    expect(repeatPassword()).toHaveValue("");
    expect(newPassword()).toHaveFocus();
    expect(callNames()).not.toContain("UserMgmt.setPasswordByContext");
  });

  it("changes it, clears both fields, and keeps the password nowhere (UI-6)", async () => {
    const { user, app } = await account();
    await user.type(newPassword(), SECRET);
    await user.type(repeatPassword(), SECRET);
    await user.click(changeButton());
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Password changed. Use the new password the next time you sign in.",
      ),
    ).toBeInTheDocument();
    expect(
      seenCalls.find((c) => c.call === "UserMgmt.setPasswordByContext")?.params,
    ).toEqual({
      password: SECRET,
    });
    expect(newPassword()).toHaveValue("");
    expect(repeatPassword()).toHaveValue("");
    expect(changeButton()).toHaveFocus();
    // A normal user has no band, so nothing is said about applying.
    expect(screen.queryByText(/waiting to be applied/)).not.toBeInTheDocument();

    await waitFor(() =>
      expect(app.queryClient.getMutationCache().getAll()).toHaveLength(0),
    );
    const everything = JSON.stringify([
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
      storageSnapshot(),
      window.location.href,
    ]);
    expect(everything).not.toContain(SECRET);
    expect(document.body.textContent).not.toContain(SECRET);
    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.value).not.toContain(SECRET);
      }
    }
    for (const input of document.querySelectorAll("input")) {
      expect(input.value).not.toContain(SECRET);
    }
  });

  it("clears the fields after a refused change too, and puts focus back", async () => {
    const { user } = await account({
      answers: {
        userMgmtSetPasswordByContext: {
          status: 500,
          message: "Failed to set the password.",
        },
      },
    });
    await user.type(newPassword(), SECRET);
    await user.type(repeatPassword(), SECRET);
    await user.click(changeButton());
    const alert = await within(section("Change password")).findByRole("alert");
    expect(alert).toHaveTextContent("The password was not changed.");
    expect(alert).toHaveTextContent("Failed to set the password.");
    expect(alert).not.toHaveTextContent(SECRET);
    expect(newPassword()).toHaveValue("");
    expect(repeatPassword()).toHaveValue("");
    await waitFor(() => expect(newPassword()).toHaveFocus());
  });

  it("asks before leaving with a password typed and not sent", async () => {
    const { user } = await account();
    await user.type(newPassword(), "half");
    const nav = screen.getAllByRole("navigation", {
      name: "Main navigation",
    })[0]!;
    await user.click(within(nav).getByRole("link", { name: "Dashboard" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Leave without saving?" }),
    ).toBeInTheDocument();
  });

  it("lands on the password form at its own address", async () => {
    await account({ path: "/account/password" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: "Change password" }),
      ).toHaveFocus(),
    );
    expect(document.title).toBe("Your account – openmediavault");
  });
});

describe("a locked account", () => {
  it("shows the details read-only and no password form", async () => {
    await account({ scenario: "readOnlyAccount" });
    const details = section("Details");
    expect(within(details).queryByRole("textbox")).toBeNull();
    expect(
      within(details).getByText("Description").nextElementSibling,
    ).toHaveTextContent("None");
    expect(
      screen.getAllByText(/Your administrator has locked this account/),
    ).toHaveLength(2);
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});

describe("an administrator's account", () => {
  it("shows the details read-only with where email alerts are set, and the password form", async () => {
    await account({ scenario: "admin" });
    const details = section("Details");
    expect(within(details).queryByRole("textbox")).toBeNull();
    expect(details).toHaveTextContent(
      "This page cannot change an administrator's details.",
    );
    expect(
      within(details).getByRole("link", {
        name: "Open Notifications in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/notification/settings");
    expect(newPassword()).toBeInTheDocument();
    const keys = section("SSH keys");
    expect(keys).toHaveTextContent("No SSH keys are added to this account.");
    expect(
      within(keys).getByRole("link", {
        name: "Add keys under Users in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/usermgmt/users");
  });

  it("says when the change left configuration waiting to be applied", async () => {
    let dirty = false;
    const { user } = await account({
      scenario: "admin",
      answers: {
        userMgmtSetPasswordByContext: () => {
          dirty = true;
          return "null";
        },
        systemGetInformation: () =>
          dirty ? "adminPendingChanges" : "adminWelcomeDismissed",
      },
    });
    await user.type(newPassword(), SECRET);
    await user.type(repeatPassword(), SECRET);
    await user.click(changeButton());
    expect(
      await screen.findByText(
        "Changes are now waiting to be applied. Apply them with the band at the top of the page.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Pending changes" }),
    ).toBeInTheDocument();
  });
});

describe("SSH keys", () => {
  it("lists each key by its comment, shortened, with the whole key on request and a copy button", async () => {
    const key = [
      "---- BEGIN SSH2 PUBLIC KEY ----",
      'Comment: "laptop"',
      "AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyExampleKeyExampleKeyEnd1",
      "---- END SSH2 PUBLIC KEY ----",
    ].join("\n");
    const { user } = await account({
      answers: {
        userMgmtGetUserByContext: {
          status: 200,
          value: { ...ACCOUNT, sshpubkeys: [key, "ssh-ed25519 AAAAC3Nza"] },
        },
      },
    });
    const keys = section("SSH keys");
    const items = within(keys).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("laptop");
    // The first and last 12 characters.
    expect(items[0]).toHaveTextContent("AAAAC3NzaC1l…ampleKeyEnd1");
    expect(items[1]).toHaveTextContent("Key 2");
    const show = within(items[0]!).getByRole("button", {
      name: "Show full key",
    });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    expect(
      within(items[0]!).getByRole("button", { name: "Hide full key" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(items[0]!).getByText(/---- BEGIN SSH2 PUBLIC KEY ----/),
    ).toBeVisible();
    expect(
      within(items[0]!).getByRole("button", { name: "Copy key: laptop" }),
    ).toBeInTheDocument();
  });

  it("says when there are none, and who adds them", async () => {
    await account();
    expect(section("SSH keys")).toHaveTextContent(
      "No SSH keys are added to this account.An administrator adds them under Users.",
    );
  });
});

describe("loading the page", () => {
  it("sends no state-changing call (UI-4)", async () => {
    await account();
    expect(callNames().filter((c) => !/\.(get|is)/.test(c))).toEqual([]);
  });
});
