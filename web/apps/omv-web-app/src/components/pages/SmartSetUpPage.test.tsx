// SPDX-License-Identifier: GPL-3.0-or-later
// Flow D, "Set up disk monitoring" (phase 5 disks design 7), through the whole app on MSW: the page
// only reads on opening (R9) and never wakes a disk until "Check disk health" is pressed; pending
// changes from elsewhere stop it first (R1); the form's defaults and the sleeping-disks table; the
// summary; the run's calls in order with their exact parameters; each failure and its choices
// (R6, R7, R10); and the result. No retry happens by itself (UI-14).
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { hourName } from "../../disks/setupPlan.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const PATH = "/storage/smart/set-up";

type Options = NonNullable<Parameters<typeof renderApp>[0]>;

async function setUp(options: Options = {}) {
  const app = await renderApp({ signedIn: true, path: PATH, ...options });
  await screen.findByRole("heading", { level: 1, name: "Disk health" });
  return app;
}

/** Press "Check disk health" and wait for the check's result. */
async function checkDisks(user: Awaited<ReturnType<typeof setUp>>["user"]) {
  await user.click(
    await screen.findByRole("button", { name: "Check disk health" }),
  );
  await screen.findByText(
    /^Using the disk health checked at /,
    {},
    { timeout: 5000 },
  );
}

const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const paramsOf = (call: string) => calls(call).map((c) => c.params);

/** The run's last word: the result, or a failure that waits for the reader. */
const ended = () =>
  screen.findByText(
    /^(Disk monitoring is set up\.|Monitoring is not shown as set up yet\.)$/,
    {},
    { timeout: 8000 },
  );

const settings = (over: Record<string, unknown>): FixedAnswer => ({
  status: 200,
  value: {
    enable: false,
    interval: 1800,
    powermode: "never",
    tempdiff: 0,
    tempmax: 0,
    ...over,
  },
});

/**
 * The NAS scenario with a memory: a disk's monitoring and a self-test read back as saved after
 * the run saves them, as on OMV, so the final check can pass.
 */
function rememberingNas() {
  const watched = new Set<string>();
  // The NAS's own tests (diskScenarios.ts), by the device file the list names.
  const tests: { devicefile: string; type: string }[] = [
    { devicefile: "/dev/sda", type: "S" },
    { devicefile: "/dev/sdb", type: "L" },
    { devicefile: "/dev/sdc", type: "S" },
    { devicefile: "/dev/sde", type: "C" },
    { devicefile: "/dev/sdf", type: "S" },
  ];
  return {
    smartSetDeviceSettings: ({ params }: { params: unknown }) => {
      watched.add((params as { devicefile: string }).devicefile);
      return "created" as const;
    },
    smartSetScheduledTest: ({ params }: { params: unknown }) => {
      const p = params as { devicefile: string; type: string };
      tests.push({
        devicefile: p.devicefile.includes("nvme")
          ? "/dev/nvme0n1"
          : p.devicefile,
        type: p.type,
      });
      return "created" as const;
    },
    smartGetDeviceSettings: ({ params }: { params: unknown }): FixedAnswer => {
      const devicefile = (params as { devicefile: string }).devicefile;
      return {
        status: 200,
        value: {
          uuid: "00000000-0000-4000-8000-000000000603",
          enable: watched.has(devicefile),
          devicefile,
          devicetype: "",
          tempdiff: 2,
          tempmax: 0,
          _used: false,
        },
      };
    },
    smartGetScheduleList: (): FixedAnswer => ({
      status: 200,
      value: {
        total: tests.length,
        data: tests.map((test, i) => ({
          uuid: `00000000-0000-4000-8000-0000000008${String(i).padStart(2, "0")}`,
          enable: true,
          devicefile: test.devicefile,
          type: test.type,
          hour: "03",
          month: "*",
          dayofmonth: "*",
          dayofweek: "7",
          comment: "",
          devicelinks: [],
          model: "",
          serialnumber: "",
          size: "-1",
        })),
      },
    }),
  };
}

describe("Set up disk monitoring", () => {
  it("only reads on opening, and wakes no disk until Check disk health is pressed", async () => {
    const { user } = await setUp({ scenario: "disksNas" });
    await waitFor(() =>
      expect(document.title).toBe(
        "Set up monitoring – Disk health – openmediavault",
      ),
    );
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(crumbs).getByRole("link", { name: "Disk health" }),
    ).toHaveAttribute("href", "/ui/storage/smart/overview");
    expect(crumbs).toHaveTextContent(/^Disk health$/);
    expect(
      screen.getByRole("heading", { level: 2, name: "Set up disk monitoring" }),
    ).toBeInTheDocument();

    // The sentence that says it wakes the disks comes before the button.
    const sentence = await screen.findByText(
      /^To list the disks that can report/,
    );
    const button = screen.getByRole("button", { name: "Check disk health" });
    expect(
      sentence.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The rest waits for the check, shown but unavailable.
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByText(
        "Check disk health first; the choices below wait for it.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("Smart.getListBg");
    expect(
      callNames().filter((c) =>
        /^(Smart\.(getInformation|getAttributes|getSelfTestLogs|getExtendedInformation|enumerateDevices|enumerateMonitoredDevices|executeScheduledTest)|.*\.set.*)$/.test(
          c,
        ),
      ),
    ).toEqual([]);

    await checkDisks(user);
    expect(calls("Smart.getListBg")).toHaveLength(1);
  });

  it("does not start while changes from elsewhere are pending, and continues once they are applied", async () => {
    const { user } = await setUp({ scenario: "pendingChanges" });
    expect(
      await screen.findByText("Some changes are not applied yet"),
    ).toBeInTheDocument();
    const notice = screen
      .getByText("Some changes are not applied yet")
      .closest<HTMLElement>('[data-slot="preflight-notice"]');
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent(
      /2 changes waiting to be applied: (Network discovery \(Zeroconf\), SSH|SSH, Network discovery \(Zeroconf\))/,
    );
    expect(
      screen.queryByRole("button", { name: "Check disk health" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply them now" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Apply 2 changes?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Apply 2 changes" }),
    );
    expect(
      await screen.findByRole(
        "button",
        { name: "Check disk health" },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
  });

  it("offers the unwatched disks of the check, with the saved choices as defaults", async () => {
    const { user } = await setUp({ scenario: "disksNas" });
    await checkDisks(user);
    const disks = screen.getByRole("group", { name: "Watch these disks" });
    const boxes = within(disks).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(
      within(disks).getByRole("checkbox", { name: /\/dev\/nvme0n1/ }),
    ).toBeChecked();
    expect(
      within(disks).getByRole("checkbox", { name: /\/dev\/sdc/ }),
    ).toBeChecked();
    expect(disks).toHaveTextContent("Serial number EXAMPLE-SERIAL-0103");
    expect(
      screen.getByText(
        "Already watched: /dev/sda, /dev/sdb, /dev/sde, /dev/sdf.",
      ),
    ).toBeInTheDocument();
    // The USB disk reports no health readings: not offered.
    expect(
      screen.getByText(
        "Not listed because they report no health readings: /dev/sdd.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "/dev/sdc already has 1 scheduled self-test and keeps it.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("radio", {
        name: "A short test every week (recommended)",
      }),
    ).toBeChecked();
    const short = screen.getByRole("group", { name: "Short self-test" });
    expect(
      within(short).getByRole("combobox", { name: "On" }),
    ).toHaveTextContent("Sunday");
    expect(
      within(short).getByRole("combobox", { name: "At" }),
    ).toHaveTextContent("03:00");
    // Saved: standby and a 50 °C limit.
    expect(
      screen.getByRole("checkbox", { name: "Let sleeping disks sleep" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Warn me when a disk gets too hot",
      }),
    ).toBeChecked();
    expect(screen.getByRole("textbox", { name: /^Warn at/ })).toHaveValue("50");
    expect(screen.getByText(/emails you at 55\s°C/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Email is not set up, so problems are only recorded in the NAS's log.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^You can run this now and set up email afterwards/),
    ).toBeInTheDocument();
  });

  it("leaves a disk whose health could not be read unticked, and says why", async () => {
    const { user } = await setUp();
    await checkDisks(user);
    expect(
      screen.getByRole("checkbox", { name: /\/dev\/nvme0n1/ }),
    ).toBeChecked();
    const sda = screen.getByRole("checkbox", { name: /\/dev\/sda/ });
    expect(sda).not.toBeChecked();
    expect(sda).toHaveAccessibleDescription(
      /Its health could not be read, so watching it may not work\./,
    );
    // The read-only CD drive is not named as missing health readings.
    expect(screen.queryByText(/^Not listed because/)).not.toBeInTheDocument();
  });

  it("offers Select all and Select none with more than nine disks", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const name = `sd${String.fromCharCode(97 + i)}`;
      return {
        devicename: name,
        canonicaldevicefile: `/dev/${name}`,
        devicefile: `/dev/disk/by-id/ata-Example_HDD_EXAMPLE-SERIAL-02${String(i).padStart(2, "0")}`,
        devicelinks: [],
        model: "Example HDD 4TB",
        size: "4000787030016",
        temperature: "34",
        description: "",
        vendor: "ATA",
        serialnumber: `EXAMPLE-SERIAL-02${String(i).padStart(2, "0")}`,
        wwn: "",
        overallstatus: "GOOD",
        uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
        monitor: false,
        _used: false,
      };
    });
    const output = JSON.stringify({ total: rows.length, data: rows });
    const { user } = await setUp({
      answers: {
        // Only the disk-health check is polled in this test.
        execGetOutput: {
          status: 200,
          value: {
            filename: "/tmp/bgstatusc32432tu5o6meLM1Slh",
            pos: output.length,
            output,
            pendingOutput: false,
            running: false,
          },
        },
      },
    });
    await checkDisks(user);
    const disks = screen.getByRole("group", { name: "Watch these disks" });
    expect(within(disks).getAllByRole("checkbox")).toHaveLength(10);
    await user.click(
      within(disks).getByRole("button", { name: "Select none" }),
    );
    for (const box of within(disks).getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    await user.click(within(disks).getByRole("button", { name: "Select all" }));
    for (const box of within(disks).getAllByRole("checkbox")) {
      expect(box).toBeChecked();
    }
  });

  it("refuses a temperature limit out of range", async () => {
    const { user } = await setUp({ scenario: "disksNas" });
    await checkDisks(user);
    const field = screen.getByRole("textbox", { name: /^Warn at/ });
    await user.clear(field);
    await user.type(field, "300");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Enter a whole number from 1 to 100."),
    ).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(screen.queryByText("Ready to set up disk monitoring")).toBeNull();
  });

  it("sums up every choice in plain words, then goes back to change them", async () => {
    const { user } = await setUp({ scenario: "disksNas" });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const title = await screen.findByText("Ready to set up disk monitoring");
    const items = within(title.parentElement!)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(items).toEqual([
      "Watch 2 disks: /dev/nvme0n1, /dev/sdc.",
      `Run a short self-test on 1 disk every Sunday at ${hourName(3)}.`,
      "/dev/sda, /dev/sdb, /dev/sdc, /dev/sde, /dev/sdf already have scheduled self-tests and keep them.",
      "Skip checks while a disk is asleep, so it stays asleep.",
      "Record a disk that reaches 50 °C, and email you when it reaches 55 °C.",
      "Email is not set up, so problems are only recorded in the NAS's log for now.",
      "The NAS checks each watched disk every 30 minutes. You can change this in the settings.",
      "Then the changes are applied, which restarts disk monitoring. Nothing on your disks is changed.",
    ]);
    // Nothing was written yet.
    expect(callNames().filter((c) => /\.set/.test(c))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Change choices" }));
    expect(screen.getByRole("checkbox", { name: /\/dev\/sdc/ })).toBeChecked();
  });

  it("runs the steps in order with the exact parameters, and reports the result", async () => {
    const { user } = await setUp({
      scenario: "disksNas",
      answers: rememberingNas(),
    });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    expect(
      await screen.findByText(
        "Disk monitoring is set up.",
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();

    const steps = screen.getByRole("list", { name: "Steps" });
    expect(
      within(steps)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "SucceededUpdate the monitoring settingsAlready as chosen",
      "SucceededWatch /dev/nvme0n1",
      "SucceededWatch /dev/sdc",
      "SucceededSchedule a short self-test for /dev/nvme0n1",
      "SucceededApply the changes",
      "SucceededCheck that monitoring is on",
    ]);

    const writes = callNames().filter((c) =>
      /^(Smart\.set|Config\.apply|Smart\.getDeviceSettings|Smart\.getSettings|System\.getInformation)/.test(
        c,
      ),
    );
    const run = writes.slice(writes.indexOf("Smart.getSettings"));
    // Step 1 re-reads and writes nothing (already as chosen); sdc's saved settings are re-read (R4).
    expect(calls("Smart.setSettings")).toHaveLength(0);
    expect(paramsOf("Smart.setDeviceSettings")).toEqual([
      {
        uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
        devicefile:
          "/dev/disk/by-id/nvme-Example_NVMe_SSD_500GB_EXAMPLE-SERIAL-0100",
        enable: true,
        tempdiff: 0,
        tempmax: 0,
      },
      {
        uuid: "00000000-0000-4000-8000-000000000603",
        devicefile: "/dev/disk/by-id/ata-Example_HDD_8TB_EXAMPLE-SERIAL-0103",
        enable: true,
        tempdiff: 2,
        tempmax: 0,
      },
    ]);
    expect(paramsOf("Smart.setScheduledTest")).toEqual([
      {
        uuid: "fa4b1c66-ef79-11e5-87a0-0002b3a176b4",
        enable: true,
        devicefile:
          "/dev/disk/by-id/nvme-Example_NVMe_SSD_500GB_EXAMPLE-SERIAL-0100",
        comment: "",
        type: "S",
        hour: "03",
        month: "*",
        dayofmonth: "*",
        dayofweek: "7",
      },
    ]);
    expect(run.indexOf("Smart.setScheduledTest")).toBeGreaterThan(
      run.lastIndexOf("Smart.setDeviceSettings"),
    );
    expect(run.indexOf("Config.applyChangesBg")).toBeGreaterThan(
      run.indexOf("Smart.setScheduledTest"),
    );
    // R10: what is pending is read again just before the apply.
    expect(
      run.lastIndexOf(
        "System.getInformation",
        run.indexOf("Config.applyChangesBg"),
      ),
    ).toBeGreaterThan(run.indexOf("Smart.setScheduledTest"));
    expect(paramsOf("Config.applyChangesBg")).toEqual([
      { modules: [], force: false },
    ]);

    expect(
      screen.getByText(
        `The NAS watches 6 disks and checks each every 30 minutes. A short self-test runs on each every Sunday at ${hourName(3)}.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Disk health" }),
    ).toHaveAttribute("href", "/ui/storage/smart/overview");
    expect(
      screen.getByRole("link", {
        name: "Set up email in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/system/notification/settings");
  });

  it.each([
    ["never", true, "standby"],
    ["never", false, "never"],
    ["sleep", true, "standby"],
    ["sleep", false, "sleep"],
    ["standby", true, "standby"],
    ["standby", false, "never"],
    ["idle", true, "idle"],
    ["idle", false, "never"],
  ] as const)(
    "with %s saved and sleeping disks %s, saves %s",
    async (saved, ticked, sent) => {
      const { user } = await setUp({
        answers: { smartGetSettings: settings({ powermode: saved }) },
      });
      await checkDisks(user);
      await user.click(
        screen.getByRole("checkbox", { name: /\/dev\/nvme0n1/ }),
      );
      await user.click(
        screen.getByRole("radio", { name: "No scheduled test" }),
      );
      const sleep = screen.getByRole("checkbox", {
        name: "Let sleeping disks sleep",
      });
      expect(sleep).toHaveAttribute(
        "aria-checked",
        saved === "sleep" ? "false" : "true",
      );
      if ((sleep.getAttribute("aria-checked") === "true") !== ticked) {
        await user.click(sleep);
      }
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await user.click(
        await screen.findByRole("button", { name: "Set up monitoring" }),
      );
      await ended();
      expect(paramsOf("Smart.setSettings")).toEqual([
        {
          enable: true,
          interval: 1800,
          powermode: sent,
          tempdiff: 0,
          tempmax: 0,
        },
      ]);
    },
  );

  it("keeps going when one disk refuses, then offers to try it again, go on without it, or undo", async () => {
    const refusing = ({ params }: { params: unknown }) =>
      (params as { devicefile: string }).devicefile.includes("SERIAL-0103")
        ? { status: 500, message: "Device does not support S.M.A.R.T." }
        : ("created" as const);
    const { user } = await setUp({
      scenario: "disksNas",
      answers: { ...rememberingNas(), smartSetDeviceSettings: refusing },
    });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    const failure = (
      await screen.findByText(
        "1 of 2 disks could not be set.",
        {},
        { timeout: 8000 },
      )
    ).closest<HTMLElement>('[role="alert"]')!;
    expect(failure).toHaveTextContent(
      "/dev/sdc: Device does not support S.M.A.R.T.",
    );
    expect(failure).not.toHaveTextContent("mock trace");
    // The other disk was set; nothing was applied.
    expect(screen.getByRole("list", { name: "Steps" })).toHaveTextContent(
      "SucceededWatch /dev/nvme0n1",
    );
    expect(callNames()).not.toContain("Config.applyChangesBg");
    await waitFor(() =>
      expect(failure.closest('[tabindex="-1"]')).toHaveFocus(),
    );

    await user.click(
      screen.getByRole("button", { name: "Try /dev/sdc again" }),
    );
    await waitFor(() =>
      expect(calls("Smart.setDeviceSettings")).toHaveLength(3),
    );
    expect(
      await screen.findByRole("button", { name: "Continue without them" }),
    ).toBeInTheDocument();
    // Still refused: nothing retried by itself.
    expect(calls("Smart.setDeviceSettings")).toHaveLength(3);

    await user.click(
      screen.getByRole("button", { name: "Continue without them" }),
    );
    await waitFor(() => expect(calls("Config.applyChangesBg")).toHaveLength(1));
    await ended();
  });

  it("undoes the changes when a disk refuses and the reader asks", async () => {
    const { user } = await setUp({
      scenario: "disksNas",
      answers: {
        smartSetDeviceSettings: {
          status: 500,
          message: "Device does not support S.M.A.R.T.",
        },
      },
    });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    await screen.findByText(
      "2 of 2 disks could not be set.",
      {},
      { timeout: 8000 },
    );
    expect(
      screen.getByRole("button", { name: "Try them again" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo the changes" }));
    expect(
      await screen.findByText(
        "The changes were undone. Nothing was set up.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(paramsOf("Config.revertChangesBg")).toEqual([{ filename: "" }]);
    expect(callNames()).not.toContain("Config.applyChangesBg");
  });

  it("stops before any disk when the NAS-wide settings cannot be saved", async () => {
    const { user } = await setUp({
      scenario: "disksNas",
      answers: {
        smartGetSettings: settings({}),
        smartSetSettings: { status: 500, message: "Invalid configuration." },
      },
    });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Turn on disk monitoring for the NAS."),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    const failure = (
      await screen.findByText(
        "The monitoring settings could not be saved.",
        {},
        { timeout: 5000 },
      )
    ).closest<HTMLElement>('[role="alert"]')!;
    expect(failure).toHaveTextContent(
      "The monitoring settings could not be saved.",
    );
    expect(failure).toHaveTextContent("Invalid configuration.");
    expect(callNames()).not.toContain("Smart.setDeviceSettings");
    expect(
      screen.getByRole("button", { name: "Try this step again" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(
      await screen.findByText("Stopped. Nothing was saved."),
    ).toBeInTheDocument();
    expect(calls("Smart.setSettings")).toHaveLength(1);
  });

  it("asks before applying changes that became pending elsewhere (R10)", async () => {
    const { user } = await setUp({ scenario: "smartAlsoPending" });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    expect(
      await screen.findByText(
        "Other changes are pending too",
        {},
        { timeout: 8000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Also pending from elsewhere: /),
    ).toHaveTextContent(
      "Also pending from elsewhere: Linux and Unix sharing (NFS). Applying applies them too.",
    );
    expect(callNames()).not.toContain("Config.applyChangesBg");
    await user.click(screen.getByRole("button", { name: "Apply them too" }));
    await waitFor(() => expect(calls("Config.applyChangesBg")).toHaveLength(1));
    await ended();
  });

  it("offers to apply again or undo when applying fails", async () => {
    const { user } = await setUp({
      scenario: "disksNas",
      answers: {
        ...rememberingNas(),
        configApplyChangesBg: {
          status: 500,
          message:
            "Failed to execute command 'omv-salt deploy run smartmontools'.",
        },
      },
    });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    const failure = (
      await screen.findByText(
        "Applying the changes failed.",
        {},
        { timeout: 8000 },
      )
    ).closest<HTMLElement>('[role="alert"]')!;
    expect(failure).toHaveTextContent("Applying the changes failed.");
    expect(failure).toHaveTextContent("omv-salt deploy run smartmontools");
    expect(calls("Config.applyChangesBg")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Try applying again" }),
    );
    await waitFor(() => expect(calls("Config.applyChangesBg")).toHaveLength(2));
    expect(
      await screen.findByRole("button", { name: "Undo the changes" }),
    ).toBeInTheDocument();
  });

  it("says so when the final check does not find what was saved", async () => {
    const { user } = await setUp({ scenario: "disksNas" });
    await checkDisks(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Set up monitoring" }),
    );
    // The mock holds no state: the disks still read back as not watched.
    const failure = (
      await screen.findByText(
        "Monitoring is not shown as set up yet.",
        {},
        { timeout: 8000 },
      )
    ).closest<HTMLElement>('[role="alert"]')!;
    expect(failure).toHaveTextContent(
      "Saved and applied, but /dev/nvme0n1 is not shown as watched yet.",
    );
    const reads = calls("Smart.getScheduleList").length;
    await user.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() =>
      expect(calls("Smart.getScheduleList").length).toBe(reads + 1),
    );
    await ended();
  });

  it("keeps a normal user off the page without a call", async () => {
    await renderApp({ scenario: "user", signedIn: true, path: PATH });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Disk health" }),
    ).toBeInTheDocument();
    expect(
      callNames().filter(
        (c) => c.startsWith("Smart.") || c.startsWith("DiskMgmt."),
      ),
    ).toEqual([]);
  });
});
