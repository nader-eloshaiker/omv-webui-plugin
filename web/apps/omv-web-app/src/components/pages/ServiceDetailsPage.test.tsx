// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Services through the whole app on MSW: three route-backed tabs, the status beside the
// heading with the pending check first, the output read when a tab opens and on Refresh (never
// polled), no call while the module is pending or the service is off (D13), unwrapped output as text
// (D14, UI-2), the error and empty states, and a normal user kept off the page without a call.
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

async function services(
  path: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({ signedIn: true, path, ...options });
  await screen.findByRole("heading", { level: 1, name: "Services" });
  return app;
}

const reads = (call: string) => seenCalls.filter((c) => c.call === call);
const tabs = () => screen.getByRole("navigation", { name: "Services" });

describe("Service details", () => {
  it("opens on the SMB/CIFS tab from the menu's address, and names the tab in the document title", async () => {
    const { app } = await services("/diagnostics/services");
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(
        "/diagnostics/services/smb",
      ),
    );
    expect(
      within(tabs()).getByRole("link", { name: "SMB/CIFS" }),
    ).toHaveAttribute("aria-current", "page");
    expect(within(tabs()).getByRole("link", { name: "NFS" })).toHaveAttribute(
      "href",
      "/ui/diagnostics/services/nfs",
    );
    await waitFor(() =>
      expect(document.title).toBe("SMB/CIFS – Services – openmediavault"),
    );
    // The menu marks Services on every tab.
    expect(
      screen
        .getByRole("navigation", { name: "Main navigation" })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent("Services");
  });

  it("does not ask for the output of a service that is off", async () => {
    await services("/diagnostics/services/smb");
    expect(
      await screen.findByText("SMB/CIFS is off, so there is nothing to show."),
    ).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 2, name: "SMB/CIFS" });
    expect(heading.parentElement).toHaveTextContent("SMB/CIFSDisabledOff");
    // The settings link once, as the empty state's action: the Windows and Mac sharing page.
    const links = screen.getAllByRole("link", {
      name: "Windows and Mac sharing settings",
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/ui/services/smb");
    expect(callNames()).not.toContain("SMB.getStats");
  });

  it("reads a running service's output when the tab opens, and again only on Refresh", async () => {
    const { user } = await services("/diagnostics/services/ssh");
    const output = await screen.findByRole("region", { name: "Status of SSH" });
    expect(output).toHaveTextContent(
      "Currently logged in users:No users connected",
    );
    expect(output).toHaveAttribute("data-wrap", "false");
    expect(
      screen.getByRole("heading", { level: 2, name: "SSH" }).parentElement,
    ).toHaveTextContent("SSHOKRunning");
    expect(reads("SSH.getStats")).toHaveLength(1);
    expect(reads("SSH.getStats")[0]?.background).toBe(false);
    expect(screen.getByText(/^Read at /)).toHaveAttribute("role", "status");
    expect(
      screen.getByRole("link", { name: "Open SSH settings" }),
    ).toHaveAttribute("href", "/ui/services/ssh");

    const refresh = screen.getByRole("button", { name: "Refresh" });
    await user.click(refresh);
    await waitFor(() => expect(reads("SSH.getStats")).toHaveLength(2));
    expect(reads("SSH.getStats")[1]?.background).toBe(false);
    await waitFor(() => expect(refresh).toHaveAccessibleName("Refresh"));
    expect(refresh).toHaveFocus();
  });

  it("waits for pending changes instead of asking for an output the server would refuse", async () => {
    await services("/diagnostics/services/ssh", { scenario: "pendingChanges" });
    expect(
      await screen.findByText(
        /^Changed SSH settings are saved but not applied yet\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "SSH" }).parentElement,
    ).toHaveTextContent(
      "Not applied yetChanged settings are waiting to be applied.",
    );
    expect(callNames()).not.toContain("SSH.getStats");
  });

  it("reads the output once by itself, in the background, when the pending changes are applied", async () => {
    const { mock, app } = await services("/diagnostics/services/ssh", {
      scenario: "pendingChanges",
    });
    await screen.findByText(
      /^Changed SSH settings are saved but not applied yet\./,
    );
    mock.dirty = false;
    await act(() => app.queryClient.invalidateQueries());
    await screen.findByRole("region", { name: "Status of SSH" });
    expect(reads("SSH.getStats")).toHaveLength(1);
    expect(reads("SSH.getStats")[0]?.background).toBe(true);
  });

  it("shows wide output without wrapping it, as text", async () => {
    const { user } = await services("/diagnostics/services/smb", {
      scenario: "serviceOutputs",
    });
    const output = await screen.findByRole("region", {
      name: "Status of SMB/CIFS",
    });
    expect(output).toHaveTextContent("Samba version 4.22.4");
    expect(output).toHaveTextContent("photos/holiday.jpg");
    expect(output).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("button", { name: "Copy output" }),
    ).toBeInTheDocument();
    // Only the open tab's output is read.
    expect(reads("NFS.getStats")).toHaveLength(0);
    await user.click(within(tabs()).getByRole("link", { name: "NFS" }));
    expect(
      await screen.findByRole("region", { name: "Status of NFS" }),
    ).toHaveTextContent("/export/media");
    // StrictMode mounts the new tab twice; the first read is cancelled with it.
    expect(reads("NFS.getStats").length).toBeGreaterThanOrEqual(1);
    expect(reads("NFS.getStats").every((c) => !c.background)).toBe(true);
  });

  it("says when a running service has nothing to show", async () => {
    const { user } = await services("/diagnostics/services/smb", {
      scenario: "serviceOutputsEmpty",
    });
    expect(
      await screen.findByText(
        "Nothing to show. No one is connected right now.",
      ),
    ).toBeInTheDocument();
    await user.click(within(tabs()).getByRole("link", { name: "NFS" }));
    expect(
      await screen.findByText("Nothing is shared over NFS right now."),
    ).toBeInTheDocument();
  });

  it("shows a running SMB/CIFS service's connections in the service-down scenario", async () => {
    await services("/diagnostics/services/smb", { scenario: "serviceDown" });
    const output = await screen.findByRole("region", {
      name: "Status of SMB/CIFS",
    });
    expect(output).toHaveTextContent("Samba version");
    expect(output).not.toHaveTextContent("Service disabled");
  });

  it("shows the server's own text when it reports the service disabled anyway", async () => {
    await services("/diagnostics/services/nfs", {
      answers: {
        servicesGetStatus: {
          status: 200,
          value: {
            total: 1,
            data: [{ name: "nfs", title: "NFS", enabled: true, running: true }],
          },
        },
      },
    });
    expect(
      await screen.findByRole("region", { name: "Status of NFS" }),
    ).toHaveTextContent("Service disabled");
  });

  it("says plainly when the output could not be read, with the server's message", async () => {
    await services("/diagnostics/services/ssh", {
      answers: { sshGetStats: "pendingChanges" },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the status of SSH.");
    expect(alert).toHaveTextContent(
      "Please apply the configuration changes first.",
    );
    expect(
      within(alert).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("reads the output anyway when whether the service is on could not be read", async () => {
    await services("/diagnostics/services/ssh", {
      answers: {
        servicesGetStatus: { status: 500, message: "systemctl failed." },
      },
    });
    expect(
      await screen.findByText("Could not read whether SSH is on."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Status of SSH" }),
    ).toBeInTheDocument();
  });

  it("refuses a normal user on every tab without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/diagnostics/services",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    for (const call of [
      "Services.getStatus",
      "SMB.getStats",
      "NFS.getStats",
      "SSH.getStats",
    ]) {
      expect(callNames()).not.toContain(call);
    }
  });
});
