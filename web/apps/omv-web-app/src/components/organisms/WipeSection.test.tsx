// SPDX-License-Identifier: GPL-3.0-or-later
// Wiping a disk through the whole app on MSW (phase 5 disks design 3; owner, P1 to P9): every refusal
// is the interface's own and names the blocker, a failed check refuses everything (fail closed), the
// dialog checks again on open and once more on "Wipe disk", serial number included, and only the
// typed device name confirms. DiskMgmt.wipe is called only after all of it, with the fresh row's
// stable device file. The running panel, stopping a secure wipe, and the results.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Answers, FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { act, screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import {
  scenarioAnswers,
  type MockSession,
  type ScenarioName,
} from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { answer, callNames, seenCalls, server } from "../../test/server.ts";

const VM_DISKS = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data;
const SDB = VM_DISKS[2];
const WIPE_HANDLE = CONTRACT_EXAMPLES.diskMgmtWipe.started.value;
const DETECTED =
  CONTRACT_EXAMPLES.fileSystemMgmtEnumerateFilesystems.vmFilesystems.value;
const CONFIGURED = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value;

const ok = (value: unknown): FixedAnswer => ({ status: 200, value });

/**
 * An accessible name with a device in code type: happy-dom lays `<code>` out as a block, so its name
 * gets a space before the punctuation that follows; a browser's does not.
 */
const named = (text: string) => (name: string) =>
  name.replace(/\s+(?=[?.,])/g, "") === text;

async function diskPage(
  name: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    path: `/storage/disks/${name}`,
    ...options,
  });
  const section = await screen.findByRole("region", {
    name: "Wipe this disk",
  });
  return { ...app, section };
}

const wipeButton = (section: HTMLElement) =>
  within(section).getByRole("button", { name: "Wipe disk…" });

/** Wait until the page has read what the disks hold: the button is available, or a blocker shows. */
async function settled(section: HTMLElement) {
  await waitFor(() =>
    expect(
      within(section).queryByText("Checking what is on this disk…"),
    ).toBeNull(),
  );
}

async function openConfirmation(
  user: Awaited<ReturnType<typeof diskPage>>["user"],
  section: HTMLElement,
  device = "/dev/sdb",
) {
  await settled(section);
  await waitFor(() =>
    expect(wipeButton(section)).toHaveAttribute("aria-disabled", "false"),
  );
  await user.click(wipeButton(section));
  return screen.findByRole("alertdialog", {
    name: named(`Wipe disk ${device}?`),
  });
}

const wipeCalls = () => seenCalls.filter((c) => c.call === "DiskMgmt.wipe");

/** Replace some answers mid-test: what the server answers from now on. */
function serverNow(scenario: ScenarioName, mock: MockSession, change: Answers) {
  answer({ ...scenarioAnswers(scenario, mock), ...change });
}

/** A wipe that keeps running, printing shred's progress (hand-written, design 3.5). */
const SECURE_RUNNING: FixedAnswer = ok({
  filename: WIPE_HANDLE,
  pos: 80,
  output:
    "shred: /dev/sdb: pass 1/1 (random)...\nshred: /dev/sdb: pass 1/1 (random)...1.2GiB/3.7TiB 32%\n",
  pendingOutput: false,
  running: true,
});

describe("the wipe section", () => {
  it.each([
    [
      "admin",
      "nvme0n1",
      "This is the system disk: openmediavault runs from it, so it cannot be wiped.",
    ],
    ["admin", "sr0", "This disk is read-only, so it cannot be wiped."],
    [
      "disksNas",
      "sda",
      "It holds the file system data, which is in use. Shared folders or services use it.",
    ],
    ["disksNas", "sdb", "It holds the file system media, which is in use."],
    [
      "disksNas",
      "sde",
      "It is part of the RAID array /dev/md0. Wiping it would damage the array.",
    ],
    [
      "disksSwap",
      "sdb",
      "It holds swap space, disk space the NAS can use as extra memory.",
    ],
    ["disksSwap", "sdc", "A file system is being created on it now."],
    // The captured ZFS mirror: both its disks, though nothing of the pool is a file system on them.
    [
      "fsZfs",
      "sdb",
      "It is part of the ZFS pool tank. Wiping it would damage the pool.",
    ],
    [
      "fsZfs",
      "sdc",
      "It is part of the ZFS pool tank. Wiping it would damage the pool.",
    ],
    [
      "disksSwap",
      "sda",
      "It holds the file system archive, which is set up on this NAS.",
    ],
  ] as const)(
    "%s %s: refuses with the blocker in words (P1, P5)",
    async (scenario, name, words) => {
      const { section, user } = await diskPage(name, { scenario });
      await waitFor(() => expect(section).toHaveTextContent(words));
      const button = wipeButton(section);
      expect(button).toHaveAttribute("aria-disabled", "true");
      const description = document.getElementById(
        button.getAttribute("aria-describedby") ?? "",
      );
      expect(description).toHaveTextContent(words);
      await user.click(button);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      // No way round a refusal (P3): the only links lead where the blocker can be removed.
      // The file system's own page carries the unmount or removal, and the array's page taking a
      // disk out or deleting the array, each with its own refusals; a pool's in the classic pages.
      for (const link of within(section).queryAllByRole("link")) {
        expect(link.getAttribute("href")).toMatch(
          /^(\/#\/storage\/filesystems|\/#\/storage\/md|\/#\/storage\/zfs\/pools|\/ui\/storage\/filesystems\/[0-9a-f-]+|\/ui\/storage\/md\/md[0-9]+)$/,
        );
      }
      expect(wipeCalls()).toHaveLength(0);
    },
  );

  it("says it is checking while what the disk holds is still being read, not that the check failed", async () => {
    // Hold the detected file systems' reply until the test lets it go (seen on the VM: the page
    // first said "Could not check" and kept the button unavailable while the reads were running).
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: unknown };
        if (body.method === "enumerateFilesystems") {
          await held;
        }
        return undefined;
      }),
    );
    const { section } = await diskPage("sdd");
    expect(
      within(section).getByText("Checking what is on this disk…"),
    ).toBeInTheDocument();
    expect(within(section).queryByText(/^Could not check/)).toBeNull();
    expect(wipeButton(section)).toHaveAttribute("aria-disabled", "true");
    release();
    await settled(section);
    await waitFor(() =>
      expect(wipeButton(section)).toHaveAttribute("aria-disabled", "false"),
    );
    expect(within(section).queryByText(/^Could not check/)).toBeNull();
  });

  it("names an encrypted container on the disk, and warns about storage it cannot trace (P4)", async () => {
    const { section, user } = await diskPage("sdd", { scenario: "disksSwap" });
    const dialog = await openConfirmation(user, section, "/dev/sdd");
    expect(dialog).toHaveTextContent("crypto_LUKS");
    expect(dialog).toHaveTextContent(
      "This NAS also has storage that this page cannot trace to a disk, such as encrypted disks, LVM or ZFS.",
    );
    expect(wipeCalls()).toHaveLength(0);
  });

  it("says what to do, with the page where it can be done", async () => {
    const { section } = await diskPage("sda", { scenario: "disksNas" });
    await within(section).findByText(
      "Stop using it and unmount it under File systems first.",
      { exact: false },
    );
    expect(
      within(section).getByRole("link", { name: "Open file system data" }),
    ).toHaveAttribute(
      "href",
      "/ui/storage/filesystems/00000000-0000-4000-8000-000000000503",
    );
  });

  it("refuses a disk whose file system is set up but not mounted, before Apply (P1)", async () => {
    const row = { ...CONFIGURED.data[0], mounted: false, _used: false };
    const { section } = await diskPage("sda", {
      answers: { fileSystemMgmtGetList: ok({ total: 1, data: [row] }) },
    });
    await waitFor(() =>
      expect(section).toHaveTextContent(
        "It holds the file system EXT4 on /dev/sda1, which is set up on this NAS.",
      ),
    );
    expect(wipeButton(section)).toHaveAttribute("aria-disabled", "true");
  });

  it.each(["disksUseFails", "disksRaidFails"] as const)(
    "%s: refuses every disk when it could not check what the disks hold (fail closed)",
    async (scenario) => {
      const { section, user } = await diskPage("sdc", { scenario });
      expect(
        await within(section).findByText(
          "Could not check what this disk holds, so it cannot be wiped now.",
        ),
      ).toBeInTheDocument();
      expect(within(section).getByText(/exit|backend/)).toBeInTheDocument();
      expect(within(section).queryByText(/mock trace/)).toBeNull();
      expect(wipeButton(section)).toHaveAttribute("aria-disabled", "true");
      const reads = callNames().length;
      await user.click(
        within(section).getByRole("button", { name: "Try again" }),
      );
      await waitFor(() => expect(callNames().length).toBeGreaterThan(reads));
      expect(wipeButton(section)).toHaveAttribute("aria-disabled", "true");
      expect(wipeCalls()).toHaveLength(0);
    },
  );

  it("takes the RAID plugin's 404 for 'not installed', not for a failure", async () => {
    const { section } = await diskPage("sdb", {
      scenario: "disksNoRaidPlugin",
    });
    await settled(section);
    await waitFor(() =>
      expect(wipeButton(section)).toHaveAttribute("aria-disabled", "false"),
    );
    expect(callNames()).toContain("MdMgmt.enumerateDevices");
  });
});

describe("the wipe dialog", () => {
  it("checks again on open, names the disk, and confirms only the typed device name (P2)", async () => {
    const { section, user } = await diskPage("sdb");
    await settled(section);
    const before = callNames().length;
    await user.click(wipeButton(section));
    // It opens at once, checking.
    await screen.findByRole("alertdialog");
    const dialog = await screen.findByRole("alertdialog", {
      name: named("Wipe disk /dev/sdb?"),
    });
    expect(callNames().slice(before)).toEqual(
      expect.arrayContaining([
        "DiskMgmt.getList",
        "FileSystemMgmt.getList",
        "FileSystemMgmt.enumerateFilesystems",
        "MdMgmt.enumerateDevices",
      ]),
    );
    expect(dialog).toHaveAccessibleDescription(
      "Everything on this disk is erased: its partitions, file systems and files. This cannot be undone.",
    );
    expect(within(dialog).getAllByText("/dev/sdb")[0]?.tagName).toBe("CODE");
    expect(dialog).toHaveTextContent("VMware Virtual SATA Hard Drive");
    expect(dialog).toHaveTextContent("Serial number EXAMPLE-SERIAL-0003");
    expect(dialog).toHaveTextContent("8.0 GiB (8.6 GB on the label)");
    expect(dialog).toHaveTextContent(
      "No file system was found. Anything else on it, such as data from another computer, is erased too.",
    );
    expect(dialog).toHaveTextContent(
      "Its monitoring and power settings are kept.",
    );
    expect(
      within(dialog).getByRole("radio", { name: "Quick wipe (recommended)" }),
    ).toBeChecked();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());

    const confirm = within(dialog).getByRole("button", { name: "Wipe disk" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAccessibleDescription(
      "The Wipe disk button is available once the name matches.",
    );
    const field = within(dialog).getByRole("textbox", {
      name: "Type /dev/sdb to confirm.",
    });
    await user.type(field, "/DEV/SDB");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    await user.click(confirm);
    expect(wipeCalls()).toHaveLength(0);
    await user.clear(field);
    await user.type(field, "/dev/sdb ");
    expect(confirm).toHaveAttribute("aria-disabled", "false");
    // Enter in the field does nothing: there is no form.
    await user.type(field, "{Enter}");
    expect(wipeCalls()).toHaveLength(0);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    // Changing the method keeps what was typed.
    await user.click(
      within(dialog).getByRole("radio", { name: "Secure wipe" }),
    );
    expect(field).toHaveValue("/dev/sdb ");
    expect(dialog).toHaveTextContent(
      "A secure wipe keeps running on the NAS if you reload this page or sign out",
    );
  });

  it("checks once more on Wipe disk, then wipes with the fresh row's stable device file", async () => {
    const { section, user } = await diskPage("sdb");
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    const before = seenCalls.length;
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    await waitFor(() => expect(wipeCalls()).toHaveLength(1));
    const after = seenCalls.slice(before).map((c) => c.call);
    const wipeAt = after.indexOf("DiskMgmt.wipe");
    expect(after.slice(0, wipeAt)).toEqual(
      expect.arrayContaining([
        "DiskMgmt.getList",
        "FileSystemMgmt.getList",
        "FileSystemMgmt.enumerateFilesystems",
        "MdMgmt.enumerateDevices",
      ]),
    );
    expect(wipeCalls()[0]?.params).toEqual({
      devicefile: SDB.devicefile,
      secure: false,
    });
    expect(wipeCalls()[0]?.background).toBe(false);

    const heading = await within(section).findByRole("heading", {
      level: 3,
      name: "Wiping /dev/sdb",
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(
      within(section).getByText("Wiping /dev/sdb started."),
    ).toHaveAttribute("role", "status");
    expect(
      await within(section).findByText("/dev/sdb was wiped."),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: "Add storage on this disk" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems/add");
    // When it ends, what the disks hold is read again.
    const listReads = (calls: typeof seenCalls) =>
      calls.filter((c) => c.call === "FileSystemMgmt.enumerateFilesystems")
        .length;
    await waitFor(() =>
      expect(listReads(seenCalls.slice(before))).toBeGreaterThan(
        listReads(seenCalls.slice(before, before + wipeAt + 1)),
      ),
    );
    // The handle stays inside the task helper (UI-5).
    expect(document.body.textContent).not.toContain(WIPE_HANDLE);
    // Dismiss returns to the section, and the disk is known to be empty now (P9).
    await user.click(within(section).getByRole("button", { name: "Dismiss" }));
    expect(wipeButton(section)).toBeInTheDocument();
  });

  it("says the disk is empty for the session after the wipe, here and in the Disks list (P9)", async () => {
    const { section, user, app } = await diskPage("sdb");
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    await within(section).findByText("/dev/sdb was wiped.");
    expect(await screen.findAllByText(/^Empty \(wiped at /)).not.toHaveLength(
      0,
    );
    await act(() => app.router.navigate({ to: "/storage/disks" }));
    await screen.findByRole("heading", { level: 1, name: "Disks" });
    expect(await screen.findAllByText(/^Empty \(wiped at /)).toHaveLength(1);
  });

  it("refuses on open when a blocker appeared since the page was read", async () => {
    const { section, user, mock } = await diskPage("sdb");
    await settled(section);
    serverNow("admin", mock, {
      fileSystemMgmtEnumerateFilesystems: ok([
        ...DETECTED,
        {
          ...DETECTED[0],
          canonicaldevicefile: "/dev/sdb1",
          parentdevicefile: "/dev/sdb",
          devicefiles: ["/dev/sdb1"],
          uuid: "00000000-0000-4000-8000-000000000901",
          devicefile: "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000901",
          label: "usb-copy",
          mounted: true,
          _used: false,
        },
      ]),
    });
    await user.click(wipeButton(section));
    const dialog = await screen.findByRole("alertdialog", {
      name: "This disk cannot be wiped now",
    });
    expect(dialog).toHaveTextContent(
      "It holds the file system usb-copy, which is in use.",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Wipe disk" }),
    ).toBeNull();
    const close = within(dialog).getByRole("button", { name: "Close" });
    await waitFor(() => expect(close).toHaveFocus());
    // The page's section updates to match.
    await waitFor(() =>
      expect(section).toHaveTextContent(
        "It holds the file system usb-copy, which is in use.",
      ),
    );
    await user.click(close);
    expect(wipeCalls()).toHaveLength(0);
  });

  it("catches a file system mounted between opening and confirming, and wipes nothing", async () => {
    const { section, user, mock } = await diskPage("sdb");
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    serverNow("admin", mock, {
      fileSystemMgmtGetList: ok({
        total: 2,
        data: [
          ...CONFIGURED.data,
          {
            ...CONFIGURED.data[0],
            canonicaldevicefile: "/dev/sdb1",
            parentdevicefile: "/dev/sdb",
            devicefiles: ["/dev/sdb1"],
            label: "new-data",
          },
        ],
      }),
    });
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    const refused = await screen.findByRole("alertdialog", {
      name: "This disk cannot be wiped now",
    });
    expect(refused).toHaveTextContent(
      "It holds the file system new-data, which is in use.",
    );
    expect(wipeCalls()).toHaveLength(0);
  });

  it("catches another disk taking this disk's name, by its serial number (P2)", async () => {
    const { section, user, mock } = await diskPage("sdb");
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    serverNow("admin", mock, {
      diskMgmtGetList: ok({
        total: VM_DISKS.length,
        data: VM_DISKS.map((d) =>
          d.devicename === "sdb"
            ? {
                ...d,
                serialnumber: "EXAMPLE-SERIAL-0099",
                devicefile:
                  "/dev/disk/by-id/ata-VMware_Virtual_SATA_Hard_Drive_EXAMPLE-SERIAL-0099",
              }
            : d,
        ),
      }),
    });
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    const changed = await screen.findByRole("alertdialog", {
      name: "This disk changed",
    });
    expect(changed).toHaveTextContent(
      "The disk now called /dev/sdb is not the one this page showed. Its details have been read again; check them before you wipe it.",
    );
    expect(wipeCalls()).toHaveLength(0);
  });

  it("says when the disk is no longer connected, and wipes nothing", async () => {
    const { section, user, mock } = await diskPage("sdb");
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    serverNow("admin", mock, {
      diskMgmtGetList: ok({
        total: VM_DISKS.length - 1,
        data: VM_DISKS.filter((d) => d.devicename !== "sdb"),
      }),
    });
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    // The page itself re-reads too, so it shows the disk as not connected (design 2.9), whether or
    // not the dialog's own "no longer connected" is still on screen.
    expect(
      await screen.findByText(
        /^(No disk called sdb is connected\.|This disk is no longer connected\.)/,
      ),
    ).toBeInTheDocument();
    expect(wipeCalls()).toHaveLength(0);
  });

  it("closes on Escape without wiping, and gives focus back to Wipe disk…", async () => {
    const { section, user } = await diskPage("sdb");
    await openConfirmation(user, section);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(wipeButton(section)).toHaveFocus());
    expect(wipeCalls()).toHaveLength(0);
  });

  it("keeps the dialog open when the wipe cannot start, and says nothing was erased", async () => {
    const { section, user } = await diskPage("sdb", {
      answers: {
        diskMgmtWipe: {
          status: 500,
          message: "Device '/dev/sdb' is busy.",
        },
      },
    });
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    expect(
      await within(dialog).findByText("The wipe did not start."),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Device '/dev/sdb' is busy.");
    expect(dialog).not.toHaveTextContent("mock trace");
    expect(wipeCalls()).toHaveLength(1);
    // Nothing retries by itself (UI-14), and the section is still the plain one.
    expect(within(section).queryByRole("heading", { level: 3 })).toBeNull();
  });
});

describe("a running wipe", () => {
  it("shows a secure wipe's progress, and stops it after a plain confirmation (P8)", async () => {
    const { section, user } = await diskPage("sdb", {
      answers: {
        execGetOutput: ({ params }) =>
          (params as { filename?: unknown }).filename === WIPE_HANDLE
            ? SECURE_RUNNING
            : "appliedFinished",
      },
    });
    const dialog = await openConfirmation(user, section);
    await user.click(
      within(dialog).getByRole("radio", { name: "Secure wipe" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    await waitFor(() =>
      expect(wipeCalls()[0]?.params).toMatchObject({ secure: true }),
    );
    const bar = await within(section).findByRole("progressbar");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "32"));
    expect(within(section).getAllByText("32% done")).not.toHaveLength(0);
    expect(section).toHaveTextContent(
      "Secure wipe. This takes many hours. You can leave this page or sign out",
    );
    expect(
      within(section).queryByRole("button", { name: "Wipe disk…" }),
    ).toBeNull();
    // A disk being wiped is refused (P1): no "Wipe disk…" while it runs, and it says so where the
    // page lists what the disk is used for.
    expect(screen.getAllByText("Being wiped")).not.toHaveLength(0);
    // The task is in the Tasks menu by its name.
    expect(
      screen.getByRole("button", { name: /^Tasks: 1 running/ }),
    ).toBeInTheDocument();

    await user.click(
      within(section).getByRole("button", { name: "Stop wiping" }),
    );
    const stop = await screen.findByRole("alertdialog", {
      name: named("Stop wiping /dev/sdb?"),
    });
    expect(stop).toHaveAccessibleDescription(
      "The part already overwritten stays erased; the rest of the disk is not wiped. Run a quick wipe afterwards so the NAS sees the disk as empty.",
    );
    await waitFor(() =>
      expect(
        within(stop).getByRole("button", { name: "Keep wiping" }),
      ).toHaveFocus(),
    );
    await user.click(within(stop).getByRole("button", { name: "Stop wiping" }));
    await waitFor(() => expect(callNames()).toContain("Exec.stop"));
    expect(
      await within(section).findByText("Wiping /dev/sdb was stopped."),
    ).toBeInTheDocument();
    expect(wipeButton(section)).toBeInTheDocument();
  });

  it("has no stop for a quick wipe", async () => {
    const { section, user } = await diskPage("sdb", {
      answers: {
        execGetOutput: ({ params }) =>
          (params as { filename?: unknown }).filename === WIPE_HANDLE
            ? ok({ ...(SECURE_RUNNING.value as object), output: "" })
            : "appliedFinished",
      },
    });
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    expect(
      await within(section).findByText("Quick wipe. This takes a few seconds."),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Stop wiping" }),
    ).toBeNull();
  });

  it("shows the panel again after leaving the page and coming back", async () => {
    const { section, user, app } = await diskPage("sdb", {
      answers: {
        execGetOutput: ({ params }) =>
          (params as { filename?: unknown }).filename === WIPE_HANDLE
            ? SECURE_RUNNING
            : "appliedFinished",
      },
    });
    const dialog = await openConfirmation(user, section);
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdb to confirm.",
      }),
      "/dev/sdb",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    await within(section).findByRole("heading", { name: "Wiping /dev/sdb" });
    await act(() => app.router.navigate({ to: "/services/ssh" }));
    await screen.findByRole("heading", { level: 1, name: "SSH" });
    await act(() =>
      app.router.navigate({
        to: "/storage/disks/$disk",
        params: { disk: "sdb" },
      }),
    );
    const again = await screen.findByRole("region", { name: "Wipe this disk" });
    expect(
      await within(again).findByRole("heading", { name: "Wiping /dev/sdb" }),
    ).toBeInTheDocument();
    expect(wipeCalls()).toHaveLength(1);
  });

  it("says a failed wipe did not finish, and Wipe again… re-runs the checks, never by itself", async () => {
    const { section, user } = await diskPage("sdc", { scenario: "wipeFails" });
    const dialog = await openConfirmation(user, section, "/dev/sdc");
    await user.type(
      within(dialog).getByRole("textbox", {
        name: "Type /dev/sdc to confirm.",
      }),
      "/dev/sdc",
    );
    await user.click(within(dialog).getByRole("button", { name: "Wipe disk" }));
    const failure = await within(section).findByRole("alert");
    expect(failure).toHaveTextContent("The wipe of /dev/sdc did not finish.");
    expect(failure).toHaveTextContent(
      "Part of the disk may already be erased. Read the output for the reason.",
    );
    expect(failure).toHaveTextContent("Device or resource busy");
    expect(failure).not.toHaveTextContent("mock trace");
    // OMV answered the first poll with the failure, so no output was read: the open output says so,
    // and does not claim the wipe wrote nothing.
    const output = within(section).getByRole("region", {
      name: "Output of the wipe of /dev/sdc",
    });
    expect(output).toHaveTextContent(
      "The output of this task could not be read.",
    );
    expect(output).not.toHaveTextContent("This task wrote no output.");
    expect(wipeCalls()).toHaveLength(1);
    const reads = seenCalls.filter(
      (c) => c.call === "MdMgmt.enumerateDevices",
    ).length;
    await user.click(
      within(section).getByRole("button", { name: "Wipe again…" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: named("Wipe disk /dev/sdc?"),
      }),
    ).toBeInTheDocument();
    expect(
      seenCalls.filter((c) => c.call === "MdMgmt.enumerateDevices").length,
    ).toBeGreaterThan(reads);
    expect(wipeCalls()).toHaveLength(1);
  });
});
