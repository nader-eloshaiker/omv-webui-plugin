// SPDX-License-Identifier: GPL-3.0-or-later
// Disk health > Overview through the whole app on MSW (phase 5 disks design 4): the monitoring card in
// each of its cases, the disks table (health from the session's check only, temperature against the
// limits, watched in words, the first scheduled test), every read failure, no waking read on opening,
// and a normal user kept off without a call.
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const WAKING = [
  "Smart.getListBg",
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
  "Smart.getExtendedInformation",
  "Smart.executeScheduledTest",
  "Smart.enumerateDevices",
  "Smart.enumerateMonitoredDevices",
];

async function overview(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/smart/overview",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Disk health" });
  return app;
}

const card = () => screen.getByRole("region", { name: "Monitoring" });
const table = () =>
  screen.getByRole("table", { name: "Disks and their monitoring" });
const rowOf = async (device: string) => {
  const cell = await within(table()).findByRole("link", {
    name: `Open disk ${device}`,
  });
  return cell.closest("tr") as HTMLElement;
};

const settings = (over: Record<string, unknown>): FixedAnswer => ({
  status: 200,
  value: {
    enable: true,
    interval: 1800,
    powermode: "standby",
    tempdiff: 0,
    tempmax: 50,
    ...over,
  },
});

describe("Disk health overview", () => {
  it("opens from the menu's address, and says plainly that monitoring is off", async () => {
    const { app } = await renderApp({ signedIn: true, path: "/storage/smart" });
    await waitFor(() =>
      expect(app.router.state.location.pathname).toBe(
        "/storage/smart/overview",
      ),
    );
    await screen.findByRole("heading", { level: 1, name: "Disk health" });
    await waitFor(() =>
      expect(document.title).toBe("Overview – Disk health – openmediavault"),
    );
    expect(
      await within(card()).findByText(
        "Monitoring is off. The NAS does not check your disks and will not tell you when one starts to fail.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", { name: "Set up monitoring" }),
    ).toHaveAttribute("href", "/ui/storage/smart/set-up");
    expect(
      await within(card()).findByText("No self-tests are scheduled."),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", { name: "Add a self-test" }),
    ).toHaveAttribute("href", "/ui/storage/smart/self-tests");
    expect(
      await within(card()).findByText(
        "Email is not set up, so problems are only recorded in the NAS's log.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", {
        name: "Email settings in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/notification/settings");
    expect(
      within(card()).getByRole("link", {
        name: "Notification events in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/notification/events");
    // The menu marks Disk health.
    expect(
      screen
        .getByRole("navigation", { name: "Main navigation" })
        .querySelector('[aria-current="page"]'),
    ).toHaveTextContent("Disk health");
  });

  it("lists every disk without waking one: health only after the reader's check", async () => {
    const { user } = await overview();
    const nvme = await rowOf("/dev/nvme0n1");
    expect(nvme).toHaveTextContent("VMware Virtual NVMe Disk");
    expect(nvme).toHaveTextContent("Not checked");
    expect(nvme).toHaveTextContent(/30\s°C/);
    await waitFor(() =>
      expect(nvme).toHaveTextContent("No (monitoring is off)"),
    );
    expect(nvme).toHaveTextContent("None");
    expect(await rowOf("/dev/sda")).toHaveTextContent("Not read");
    for (const call of WAKING) {
      expect(callNames()).not.toContain(call);
    }
    expect(
      screen.getByRole("link", {
        name: "Disk health in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/smart/devices");

    await user.click(screen.getByRole("button", { name: "Check disk health" }));
    await waitFor(() => expect(nvme).toHaveTextContent("OK"), {
      timeout: 5000,
    });
    expect(seenCalls.filter((c) => c.call === "Smart.getListBg")).toHaveLength(
      1,
    );
  });

  it("answers first how the disks are: all well under the OK label, and says so when the check ends", async () => {
    const { user } = await overview({ scenario: "dashboardAllOk" });
    const answer = screen.getByRole("region", { name: "How your disks are" });
    expect(answer).toHaveTextContent(
      "Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save power.",
    );
    await user.click(
      within(answer).getByRole("button", { name: "Check disk health" }),
    );
    const sentence = await within(answer).findByText(
      /^All \d+ disks report no problems\.$/,
      undefined,
      { timeout: 5000 },
    );
    expect(within(answer).getByText("OK")).toBeInTheDocument();
    expect(within(answer).queryByRole("list")).toBeNull();
    expect(
      within(answer).getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();
    expect(
      within(answer)
        .getAllByRole("status")
        .some(
          (el) =>
            el.textContent ===
            `Disk health checked. ${sentence.textContent ?? ""}`,
        ),
    ).toBe(true);
  });

  it("names each disk that needs the reader, with what it means, and says it once", async () => {
    const { user } = await overview({ scenario: "disksNas" });
    const answer = screen.getByRole("region", { name: "How your disks are" });
    await user.click(
      within(answer).getByRole("button", { name: "Check disk health" }),
    );
    expect(
      await within(answer).findByText(
        "1 of 6 disks needs your attention.",
        undefined,
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    const [item, ...others] = within(answer).getAllByRole("listitem");
    expect(others).toHaveLength(0);
    expect(
      within(item as HTMLElement).getByRole("link", {
        name: "Open disk /dev/sdb",
      }),
    ).toBeInTheDocument();
    expect(item).toHaveTextContent("Warning");
    expect(item).toHaveTextContent("A few damaged areas (bad sectors).");
    // The table gives the state, not the reason again.
    const row = await rowOf("/dev/sdb");
    expect(row).toHaveTextContent("Warning");
    expect(row).not.toHaveTextContent("bad sectors");
  });

  it("says an interval under a minute in seconds", async () => {
    await overview({ scenario: "smartOddInterval" });
    expect(
      await within(card()).findByText(
        /^Watched disks are checked every 45 seconds\./,
      ),
    ).toBeInTheDocument();
  });

  it("counts the watched disks, says how often and what happens to a sleeping disk", async () => {
    await overview({ scenario: "disksNas" });
    expect(
      await within(card()).findByText("Monitoring is on for 4 of 7 disks."),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", { name: "Set up monitoring" }),
    ).toBeInTheDocument();
    expect(
      within(card()).getByText(
        "Watched disks are checked every 30 minutes. Sleeping disks are left asleep.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card()).queryByText("No self-tests are scheduled."),
    ).toBeNull();
    const sda = await rowOf("/dev/sda");
    await waitFor(() => expect(sda).toHaveTextContent("Yes"));
    expect(sda).toHaveTextContent("Short self-test, every Sunday at 03:00");
    const sdc = await rowOf("/dev/sdc");
    await waitFor(() => expect(sdc).toHaveTextContent("No"));
    const sde = await rowOf("/dev/sde");
    await waitFor(() =>
      expect(sde).toHaveTextContent(
        "Transport check, in March, on day 15, on Monday, at 05:00",
      ),
    );
  });

  it("says every disk is watched, without a filled button", async () => {
    await overview({
      scenario: "disksNas",
      answers: {
        smartGetDeviceSettings: ({ params }) => ({
          status: 200,
          value: {
            uuid: "00000000-0000-4000-8000-000000000699",
            enable: true,
            devicefile: (params as { devicefile: string }).devicefile,
            devicetype: "",
            tempdiff: 0,
            tempmax: 0,
            _used: false,
          },
        }),
      },
    });
    expect(
      await within(card()).findByText("Monitoring is on for every disk."),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", { name: "Set up monitoring again" }),
    ).toHaveAttribute("href", "/ui/storage/smart/set-up");
    expect(
      within(card()).queryByRole("link", { name: "Set up monitoring" }),
    ).toBeNull();
  });

  it("gives a temperature its status only against a limit it read", async () => {
    await overview({
      scenario: "disksNas",
      answers: { smartGetSettings: settings({ tempmax: 30 }) },
    });
    const sda = await rowOf("/dev/sda");
    expect(sda).toHaveTextContent(
      /34\s°CWarningAt or above its limit of 30\s°C/,
    );
    const sdb = await rowOf("/dev/sdb");
    expect(sdb).toHaveTextContent(
      /41\s°CCriticalAt or above its alert level of 35\s°C/,
    );
  });

  it("names the email address as text", async () => {
    await overview({ scenario: "alertsConfigured" });
    // The address is server text in our sentence: isolated in a <bdi>, so it keeps its direction.
    const line = await within(card()).findByText(
      (_, element) =>
        element?.tagName === "P" &&
        /^Problems are emailed to .+@.+\.$/.test(element.textContent),
    );
    expect(line.querySelector("bdi")?.textContent).toMatch(/^.+@.+$/);
  });

  it("shows each read failure in its own place", async () => {
    await overview({
      answers: {
        smartGetSettings: { status: 500, message: "Settings unreadable." },
        emailNotificationGet: { status: 500, message: "Mail unreadable." },
        smartGetDeviceSettings: { status: 500, message: "Database locked." },
      },
    });
    expect(
      await within(card()).findByText(
        "Could not read the monitoring settings.",
      ),
    ).toBeInTheDocument();
    expect(
      within(card()).getByText("Settings unreadable."),
    ).toBeInTheDocument();
    // The table still shows.
    const nvme = await rowOf("/dev/nvme0n1");
    await waitFor(() => expect(nvme).toHaveTextContent("Not known"));
    expect(
      screen.getByText("Could not read whether 6 disks are watched."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mock trace/)).toBeNull();
  });

  it("says when the email settings could not be read, and keeps the classic link", async () => {
    await overview({
      answers: {
        emailNotificationGet: { status: 500, message: "Mail unreadable." },
      },
    });
    expect(
      await within(card()).findByText("Could not read the email settings."),
    ).toBeInTheDocument();
    expect(
      within(card()).getByRole("link", {
        name: "Email settings in the classic interface (opens in a new tab)",
      }),
    ).toBeInTheDocument();
  });

  it("shows the disks read failure in the table's place", async () => {
    await overview({ scenario: "disksReadFails" });
    expect(
      await screen.findByText("Could not read the disks."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("refuses a normal user without reading anything", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/smart/overview",
    });
    expect(await screen.findByText(/only administrators/i)).toBeInTheDocument();
    expect(
      callNames().filter(
        (c) =>
          c.startsWith("Smart.") ||
          c.startsWith("DiskMgmt.") ||
          c.startsWith("EmailNotification."),
      ),
    ).toEqual([]);
  });
});
