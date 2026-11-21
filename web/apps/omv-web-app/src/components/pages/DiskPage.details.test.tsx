// SPDX-License-Identifier: GPL-3.0-or-later
// A disk's health details through the whole app on MSW (phase 5 disks design 2.4), and the owner's rule
// that disks are not woken on their own: no read that runs smartctl is made on page load, on window
// focus, on reconnecting, after a background task ends (which invalidates every query), or on coming
// back to the page; only the reader's press reads, for that disk only, and the result is kept.
import { configApplyChangesBg } from "@omv-webui/react-api-omv/generated";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls, server } from "../../test/server.ts";

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
const waking = () => callNames().filter((c) => WAKING.includes(c));
const DETAILS = [
  "Smart.getInformation",
  "Smart.getAttributes",
  "Smart.getSelfTestLogs",
];
const count = (call: string) => seenCalls.filter((c) => c.call === call).length;

const SDA = "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0101";

afterEach(() => {
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

async function diskPage(
  name: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    scenario: "disksNas",
    path: `/storage/disks/${name}`,
    ...options,
  });
  const details = await screen.findByRole("region", { name: "Health details" });
  return { ...app, details };
}

async function readDetails(
  user: Awaited<ReturnType<typeof renderApp>>["user"],
  details: HTMLElement,
) {
  await user.click(
    within(details).getByRole("button", { name: "Read health details" }),
  );
  await within(details).findByRole("button", { name: "Read again" });
}

describe("a disk's health details", () => {
  it("makes no waking read on load, focus, reconnect, after a task ends, or on coming back", async () => {
    const { app, details } = await diskPage("sda");
    expect(
      within(details).getByText(
        "Detailed readings come from the disk itself and are read only when you ask. Reading them wakes this disk if it has gone to sleep.",
      ),
    ).toBeInTheDocument();
    expect(waking()).toEqual([]);

    // Window focus and reconnecting refetch what TanStack Query may refetch.
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await Promise.resolve();
    });
    // A background task ends: the query client invalidates every query (query.ts).
    const id = taskRegistry.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    await waitFor(() =>
      expect(taskRegistry.get(id)?.state).not.toBe("running"),
    );
    await act(() => app.queryClient.invalidateQueries());

    // Leaving and coming back.
    await act(() => app.router.navigate({ to: "/storage/disks" }));
    await screen.findByRole("heading", { level: 1, name: "Disks" });
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sda" },
      }),
    );
    await screen.findByRole("region", { name: "Health details" });
    await waitFor(() => expect(app.queryClient.isFetching()).toBe(0));
    expect(waking()).toEqual([]);
  });

  it("reads the three parts of this disk only, once, on the press, and keeps them for the session", async () => {
    const { app, user, details } = await diskPage("sda");
    const button = within(details).getByRole("button", {
      name: "Read health details",
    });
    await user.click(button);
    await within(details).findByRole("button", { name: "Read again" });
    for (const call of DETAILS) {
      const calls = seenCalls.filter((c) => c.call === call);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.params).toEqual({ devicefile: SDA });
      expect(calls[0]?.background).toBe(false);
    }
    expect(count("Smart.getExtendedInformation")).toBe(0);
    // Focus stays on the one button, now "Read again"; the result is announced.
    expect(within(details).getByRole("button", { name: "Read again" })).toBe(
      button,
    );
    expect(button).toHaveFocus();
    expect(
      await within(details).findByText("Health details of /dev/sda read."),
    ).toHaveAttribute("role", "status");
    expect(
      within(details).getByText(
        /^Read at .*\. The readings do not update by themselves\.$/,
      ),
    ).toBeInTheDocument();

    // A task ending, focus, and leaving and coming back read nothing again; the result is still shown.
    const id = taskRegistry.start("Applying changes", () =>
      configApplyChangesBg({ modules: [], force: false }),
    );
    await waitFor(() =>
      expect(taskRegistry.get(id)?.state).not.toBe("running"),
    );
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });
    await act(() => app.router.navigate({ to: "/storage/disks" }));
    await screen.findByRole("heading", { level: 1, name: "Disks" });
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sda" },
      }),
    );
    const again = await screen.findByRole("region", { name: "Health details" });
    expect(
      within(again).getByText("Example NAS HDD family"),
    ).toBeInTheDocument();
    await waitFor(() => expect(app.queryClient.isFetching()).toBe(0));
    for (const call of DETAILS) {
      expect(count(call)).toBe(1);
    }

    // Read again reads again.
    await user.click(within(again).getByRole("button", { name: "Read again" }));
    await waitFor(() => expect(count("Smart.getAttributes")).toBe(2));
    expect(count("Smart.getInformation")).toBe(2);
    expect(count("Smart.getSelfTestLogs")).toBe(2);
  });

  it("shows a healthy hard disk in plain words", async () => {
    const { user, details } = await diskPage("sda");
    await readDetails(user, details);
    expect(
      within(details).getByText("Example NAS HDD family"),
    ).toBeInTheDocument();
    expect(
      within(details).getByText("Hard disk, 5,400 rpm"),
    ).toBeInTheDocument();
    expect(within(details).getByText("82.00A82").tagName).toBe("DD");
    expect(
      within(details).getByText("4,000,787,030,016 bytes [4.00 TB]"),
    ).toBeInTheDocument();
    // 26,280 hours.
    expect(within(details).getAllByText("3 years").length).toBeGreaterThan(0);
    expect(
      within(details).getByText(
        "All 14 readings are within the disk's limits.",
      ),
    ).toBeInTheDocument();
    expect(
      within(details).getByText("Damaged areas replaced"),
    ).toBeInTheDocument();
    expect(
      within(details).getByText(
        "Areas that went bad and were replaced by spare ones. A rising number is a warning sign.",
      ),
    ).toBeInTheDocument();
    expect(within(details).getByText("41 °C")).toBeInTheDocument();
    // The self-test results, newest first.
    const tests = within(details).getByRole("table", {
      name: "Self-test results of /dev/sda",
    });
    const rows = within(tests).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent(/^About 10 hours agoShortPassed/);
    expect(rows[2]).toHaveTextContent("Running, 40% left");
    expect(rows[3]).toHaveTextContent("Stopped before it finished");
    expect(rows[3]).toHaveTextContent("Aborted by host");
  });

  it("opens every reading behind a disclosure", async () => {
    const { user, details } = await diskPage("sda");
    await readDetails(user, details);
    const show = within(details).getByRole("button", {
      name: "Show all 14 readings",
    });
    await user.click(show);
    expect(show).toHaveAccessibleName("Hide the readings");
    const all = within(details).getByRole("table", {
      name: "All readings of /dev/sda",
    });
    expect(within(all).getAllByRole("row")).toHaveLength(15);
    expect(within(all).getByText("Reallocated_Sector_Ct")).toBeInTheDocument();
    expect(within(all).getAllByText("Warns of failure").length).toBeGreaterThan(
      0,
    );
  });

  it("shows a failing disk's readings and its failed test with the block", async () => {
    const { user, details } = await diskPage("sdb");
    await readDetails(user, details);
    expect(
      within(details).getByText(/^\d+ of 14 readings: Critical$/),
    ).toBeInTheDocument();
    expect(
      within(details).getAllByText("Outside its limit now").length,
    ).toBeGreaterThan(0);
    const tests = within(details).getByRole("table", {
      name: "Self-test results of /dev/sdb",
    });
    const first = within(tests).getAllByRole("row")[1] as HTMLElement;
    expect(first).toHaveTextContent("Long");
    expect(first).toHaveTextContent("Failed");
    expect(first).toHaveTextContent("Completed: read failure");
    expect(within(first).getByText("1953524160").tagName).toBe("CODE");
    expect(first).toHaveTextContent("Block 1953524160");
  });

  it("says an NVMe disk reports no table and keeps no log in this form", async () => {
    const { user, details } = await diskPage("nvme0n1");
    await readDetails(user, details);
    expect(
      within(details).getByText(
        "This disk does not report a table of readings. NVMe and SAS disks report their health in another form, which is in the full report below.",
      ),
    ).toBeInTheDocument();
    expect(
      within(details).getByText(
        "No self-test results are recorded on this disk.",
      ),
    ).toBeInTheDocument();
  });

  it("shows each part's failure, with the server's message, for a disk that passes no readings through", async () => {
    const { user, details } = await diskPage("sdd");
    await readDetails(user, details);
    for (const part of [
      "Could not read the information about the disk.",
      "Could not read the readings.",
      "Could not read the self-test results.",
    ]) {
      expect(within(details).getByText(part)).toBeInTheDocument();
    }
    expect(
      within(details).getAllByText(
        "Device '/dev/sdd' does not support S.M.A.R.T. or it is not enabled.",
      ),
    ).toHaveLength(3);
    expect(
      within(details).getByText(
        "Some USB enclosures and virtual disks do not pass health readings through.",
      ),
    ).toBeInTheDocument();
    expect(details).not.toHaveTextContent("mock trace");
    // "Try again" reads that part only.
    const before = count("Smart.getAttributes");
    await user.click(
      within(details).getAllByRole("button", { name: "Try again" })[1]!,
    );
    await waitFor(() => expect(count("Smart.getAttributes")).toBe(before + 1));
    expect(count("Smart.getInformation")).toBe(1);
  });

  it("keeps the other parts when one part fails", async () => {
    const { user, details } = await diskPage("sda", {
      answers: {
        smartGetSelfTestLogs: {
          status: 500,
          message: "The log could not be read.",
        },
      },
    });
    await readDetails(user, details);
    expect(
      within(details).getByText("Could not read the self-test results."),
    ).toBeInTheDocument();
    expect(
      within(details).getByText("Example NAS HDD family"),
    ).toBeInTheDocument();
    expect(
      within(details).queryByText(
        "Some USB enclosures and virtual disks do not pass health readings through.",
      ),
    ).not.toBeInTheDocument();
  });

  it("reads the full report once, on first opening, as text without wrapping", async () => {
    const { user, details } = await diskPage("sdb");
    await readDetails(user, details);
    const show = within(details).getByRole("button", {
      name: "Show the full report",
    });
    await user.click(show);
    const report = await within(details).findByRole("region", {
      name: "Full health report of /dev/sdb",
    });
    expect(count("Smart.getExtendedInformation")).toBe(1);
    expect(
      seenCalls.find((c) => c.call === "Smart.getExtendedInformation")?.params,
    ).toEqual({
      devicefile: "/dev/disk/by-id/ata-Example_HDD_4TB_EXAMPLE-SERIAL-0102",
    });
    expect(report).toHaveAttribute("data-wrap", "false");
    expect(report).toHaveTextContent('<script>alert("not markup")</script>');
    expect(report.querySelector("script")).toBeNull();
    expect(report).toHaveTextContent("Line 2000:");
    await user.click(
      within(details).getByRole("button", { name: "Hide the full report" }),
    );
    await user.click(
      within(details).getByRole("button", { name: "Show the full report" }),
    );
    await within(details).findByRole("region", {
      name: "Full health report of /dev/sdb",
    });
    expect(count("Smart.getExtendedInformation")).toBe(1);
  });

  it("says the report could not be read, and reads it again on Try again", async () => {
    const { user, details } = await diskPage("sda", {
      answers: {
        smartGetExtendedInformation: {
          status: 500,
          message: "smartctl failed.",
        },
      },
    });
    await readDetails(user, details);
    await user.click(
      within(details).getByRole("button", { name: "Show the full report" }),
    );
    expect(
      await within(details).findByText("Could not read the full report."),
    ).toBeInTheDocument();
    expect(within(details).getByText("smartctl failed.")).toBeInTheDocument();
    await user.click(
      within(details).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() => expect(count("Smart.getExtendedInformation")).toBe(2));
  });

  it("says a sleeping disk is asleep before the first read", async () => {
    const { details } = await diskPage("sdb", { scenario: "disksAsleep" });
    expect(details).toHaveTextContent(
      "Reading them wakes this disk if it has gone to sleep. This disk is asleep now.",
    );
  });

  it("shows the reading state while the reads run", async () => {
    const { user, details } = await diskPage("sda");
    // Hold Smart.getInformation a moment, so the reading state can be seen.
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: unknown };
        if (body.method === "getInformation") {
          await delay(300);
        }
        return undefined;
      }),
    );
    await user.click(
      within(details).getByRole("button", { name: "Read health details" }),
    );
    expect(
      await within(details).findByText(
        "Reading the health details of /dev/sda…",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      within(details).getByRole("button", { name: "Reading…" }),
    ).toHaveAttribute("aria-busy", "true");
    await within(details).findByRole("button", { name: "Read again" });
  });
});
