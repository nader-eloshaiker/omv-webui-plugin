// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SSH through the whole app on MSW serving the contract's examples: the form's states, the
// one blocking check and the warnings, Save then the pending band, Apply, a failed save, the leave
// prompt, and a normal user kept off the page without a call (UI-4).
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findDashboard } from "../../test/dashboard.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function sshPage(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/services/ssh",
    ...options,
  });
  await screen.findByRole("checkbox", { name: "Turn on SSH" });
  return app;
}

const form = () => screen.getByRole("form", { name: "SSH" });
const save = () =>
  within(form()).getByRole("button", { name: /^Save$|^Saving…$/ });
const discard = () =>
  within(form()).getByRole("button", { name: "Discard changes" });
const port = () => screen.getByRole("textbox", { name: "Port" });
const box = (name: string) => screen.getByRole("checkbox", { name });

describe("the SSH page", () => {
  it("shows the saved settings, with nothing to save yet", async () => {
    await sshPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "SSH" }),
    ).toBeInTheDocument();
    expect(box("Turn on SSH")).toBeChecked();
    expect(port()).toHaveValue("22");
    expect(port()).toHaveAttribute("inputmode", "numeric");
    expect(box("Allow signing in with a password")).toBeChecked();
    expect(box("Allow signing in with a key")).toBeChecked();
    expect(box("Allow the root account to sign in")).toBeChecked();
    expect(box("Allow port forwarding")).not.toBeChecked();
    expect(box("Compress data")).not.toBeChecked();
    expect(
      screen.getByRole("group", { name: "Signing in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Connection" }),
    ).toBeInTheDocument();
    // OMV's default lets root sign in with a password: honest advice, never a block.
    expect(
      screen.getByText(/The root account can sign in with only a password/),
    ).toBeInTheDocument();
    // Disabled but focusable, with the reason.
    expect(save()).toHaveAttribute("aria-disabled", "true");
    expect(save()).toHaveAccessibleDescription("No changes to save");
    expect(discard()).toHaveAttribute("aria-disabled", "true");
    // Nothing pending: no mark.
    expect(screen.queryByText("Not applied yet")).not.toBeInTheDocument();
  });

  it("keeps the extra lines under a closed Advanced section while they are empty", async () => {
    const { user } = await sshPage();
    const advanced = screen.getByRole("button", { name: "Advanced" });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    await user.click(advanced);
    const extra = screen.getByRole("textbox", {
      name: "Extra configuration lines",
    });
    await user.type(extra, "MaxAuthTries 3");
    expect(
      screen.getByRole("button", { name: "Advanced (1 line set)" }),
    ).toBeInTheDocument();
  });

  it("opens Advanced by itself when the extra lines hold text", async () => {
    await sshPage({
      answers: {
        sshGet: {
          status: 200,
          value: {
            enable: true,
            port: 22,
            passwordauthentication: true,
            pubkeyauthentication: true,
            permitrootlogin: false,
            tcpforwarding: false,
            compression: false,
            extraoptions: "MaxAuthTries 3\nLoginGraceTime 30\n",
          },
        },
      },
    });
    expect(
      screen.getByRole("button", { name: "Advanced (2 lines set)" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("textbox", { name: "Extra configuration lines" }),
    ).toHaveValue("MaxAuthTries 3\nLoginGraceTime 30\n");
  });

  it("saves the whole object, then the band and the pending mark appear, and Apply clears them", async () => {
    const { user } = await sshPage();
    await user.click(box("Allow the root account to sign in"));
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    await user.click(save());

    const status = await screen.findByText(
      "Saved. The changes take effect when you apply them in the band at the top of the page.",
    );
    expect(status).toHaveAttribute("role", "status");
    expect(seenCalls.find((c) => c.call === "SSH.set")?.params).toEqual({
      enable: true,
      port: 22,
      passwordauthentication: true,
      pubkeyauthentication: true,
      permitrootlogin: false,
      tcpforwarding: false,
      compression: false,
      extraoptions: "",
    });
    const band = await screen.findByRole("region", { name: "Pending changes" });
    expect(band).toHaveTextContent(
      "2 changes waiting to be applied: Network discovery (Zeroconf), SSH",
    );
    expect(await screen.findByText("Not applied yet")).toBeInTheDocument();
    // Focus stays on Save, now disabled but focusable.
    expect(save()).toHaveFocus();
    expect(save()).toHaveAttribute("aria-disabled", "true");

    await user.click(
      within(band).getByRole("button", { name: "Apply 2 changes" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Apply 2 changes",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Pending changes" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.queryByText("Not applied yet")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/^Saved\./)).not.toBeInTheDocument();
  });

  it("refuses a port it knows cannot work, in words, and sends nothing", async () => {
    const { user } = await sshPage();
    await user.clear(port());
    await user.tab();
    expect(
      screen.getByText("Enter a port number. The usual one is 22."),
    ).toBeInTheDocument();
    expect(port()).toHaveAttribute("aria-invalid", "true");

    await user.type(port(), "70000");
    await user.tab();
    expect(
      screen.getByText("Enter a whole number from 1 to 65535."),
    ).toBeInTheDocument();

    await user.clear(port());
    await user.type(port(), "80");
    await user.click(save());
    expect(
      screen.getByText(
        "Port 80 is already used by this web interface. Choose another, such as 22.",
      ),
    ).toBeInTheDocument();
    expect(port()).toHaveFocus();
    expect(callNames()).not.toContain("SSH.set");
  });

  it("submits with Enter in the port field", async () => {
    const { user } = await sshPage();
    await user.clear(port());
    await user.type(port(), "2222{Enter}");
    await screen.findByText(/^Saved\./);
    expect(seenCalls.find((c) => c.call === "SSH.set")?.params).toMatchObject({
      port: 2222,
    });
  });

  it("warns, without blocking, about turning SSH off and about signing in", async () => {
    const { user } = await sshPage();
    await user.click(box("Turn on SSH"));
    expect(
      screen.getByText(/new SSH connections are refused/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The settings below are used when SSH is on."),
    ).toBeInTheDocument();
    // The fields stay editable while it is off.
    expect(port()).not.toHaveAttribute("readonly");
    await user.click(box("Turn on SSH"));

    await user.click(box("Allow signing in with a password"));
    expect(
      screen.getByText(/Only people with a key on their account/),
    ).toBeInTheDocument();
    await user.click(box("Allow signing in with a key"));
    expect(screen.getByText(/nobody can sign in over SSH/)).toBeInTheDocument();
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("puts the saved values back with Discard changes, keeping focus there", async () => {
    const { user } = await sshPage();
    await user.click(box("Compress data"));
    await user.click(discard());
    expect(box("Compress data")).not.toBeChecked();
    expect(discard()).toHaveFocus();
    expect(discard()).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a failed save with the server's words, focused, and keeps the edits", async () => {
    const { user } = await sshPage({
      answers: { sshSet: { status: 500, message: "<b>Failed</b> to write." } },
    });
    await user.click(box("Compress data"));
    await user.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The SSH settings were not saved.");
    expect(alert).toHaveTextContent("<b>Failed</b> to write.");
    expect(alert.querySelector("b")).toBeNull();
    await waitFor(() => expect(alert).toHaveFocus());
    expect(box("Compress data")).toBeChecked();
    expect(document.body.textContent).not.toContain("mock trace");
  });

  it("asks before leaving with unsaved changes, and can stay or leave", async () => {
    const { user } = await sshPage();
    await user.click(box("Compress data"));
    const nav = screen.getAllByRole("navigation", {
      name: "Main navigation",
    })[0]!;
    await user.click(within(nav).getByRole("link", { name: "Dashboard" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Leave without saving?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Stay on this page" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Stay on this page" }),
    );
    expect(window.location.pathname).toBe("/ui/services/ssh");
    expect(box("Compress data")).toBeChecked();

    await user.click(within(nav).getByRole("link", { name: "Dashboard" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Leave without saving",
      }),
    );
    await findDashboard();
    expect(window.location.pathname).toBe("/ui/");
  });

  it("says when saved settings already wait to be applied on arrival", async () => {
    await sshPage({ scenario: "pendingChanges" });
    expect(screen.getByText("Not applied yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Saved SSH settings are waiting to be applied/),
    ).toBeInTheDocument();
  });

  it("says plainly when the settings cannot be read, with a retry", async () => {
    let fail = true;
    const { user } = await renderApp({
      signedIn: true,
      path: "/services/ssh",
      answers: {
        sshGet: () =>
          fail ? { status: 500, message: "No database." } : "defaults",
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the SSH settings.");
    expect(alert).toHaveTextContent("No database.");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("checkbox", { name: "Turn on SSH" }),
    ).toBeInTheDocument();
  });

  it("sends no state-changing call on load (UI-4)", async () => {
    await sshPage();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      callNames().filter(
        (c) =>
          // Reads only: the firewall line (13.4) reads the interfaces too.
          !/\.(get|is|getInformation|enumerate)/.test(c) &&
          c !== "Zfs.listCompressionTypes",
      ),
    ).toEqual([]);
  });

  it("keeps a normal user off the page without asking the server (UI-4)", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/services/ssh",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("SSH.get");
  });
});
