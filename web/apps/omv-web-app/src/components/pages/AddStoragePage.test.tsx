// SPDX-License-Identifier: GPL-3.0-or-later
// Flow A, "Add storage", and "Combine disks (BTRFS)" through the whole app on MSW (phase 5 file-systems
// design 6, 7; owner, P1 to P4): the pre-flight, the devices offered by the stricter of the server's list
// and the disk-use model, failing closed, the typed confirmation, every step in order with nothing
// erased before the re-check, each failure plan (R6, R7, R10), the result with the sharing handover, the
// disk handed over from its page in memory only, and a run that outlives its page.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const DISKS = CONTRACT_EXAMPLES.diskMgmtGetList.vmDisks.value.data;
const byName = (name: string) => {
  const disk = DISKS.find((d) => d.devicename === name);
  if (disk === undefined) {
    throw new Error(name);
  }
  return disk;
};
const SDB = byName("sdb");
const SDD = byName("sdd");
const LONG = { timeout: 15_000 };

async function flow(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/filesystems/add",
    ...options,
  });
  await screen.findByRole("heading", {
    level: 2,
    name: /^(Add storage|Combine disks \(BTRFS\))$/,
  });
  return app;
}

const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const option = (device: string) =>
  // happy-dom lays the device's <code> out as a block, so a space can come before the comma.
  screen.findByRole("radio", { name: new RegExp(`^${device}\\s?, `) }, LONG);

/** Choose a device, continue, and type the confirmation. */
async function toSummary(
  user: Awaited<ReturnType<typeof flow>>["user"],
  device: string,
) {
  await user.click(await option(device));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Ready to add storage");
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Erase disk and create file system" });

async function confirm(
  user: Awaited<ReturnType<typeof flow>>["user"],
  typed: string,
) {
  await user.type(
    screen.getByRole("textbox", { name: `Type ${typed} to confirm.` }),
    typed,
  );
  await user.click(confirmButton());
}

const steps = () => screen.getByRole("list", { name: "Steps" });

describe("Flow A: Add storage", () => {
  it("does not start while other changes are pending, and looks for no disk (R1)", async () => {
    await flow({ scenario: "pendingChanges" });
    expect(
      await screen.findByText("Some changes are not applied yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Apply or undo them before you add storage, so that only these changes are applied at the end.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Apply them now" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo them" })).toBeVisible();
    expect(callNames()).not.toContain("FileSystemMgmt.getCandidatesBg");
  });

  it("offers the empty disks, lists every disk that cannot be used with why, and defaults to EXT4 at 85%", async () => {
    const { user } = await flow();
    const sdb = await option("/dev/sdb");
    // Said only while it looks.
    expect(screen.queryByText(/^Looking for disks/)).toBeNull();
    expect(sdb).toHaveAccessibleName(
      /^\/dev\/sdb\s?, VMware Virtual SATA Hard Drive\s?, 8\.0\sGiB$/,
    );
    expect(
      screen.getByRole("group", { name: "Empty disks" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Erase and reuse" })).toBeNull();
    for (const device of ["/dev/sdb", "/dev/sdc", "/dev/sdd"]) {
      expect(await option(device)).not.toBeChecked();
    }
    expect(screen.getAllByText(/^Serial number/).length).toBeGreaterThan(0);
    await user.click(
      screen.getByRole("button", { name: "Disks that cannot be used (3)" }),
    );
    expect(
      screen.getByText(
        "This is the system disk: openmediavault runs from it, so it cannot be wiped.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/which is in use\.$/)).toBeVisible();
    expect(
      screen.getByText("This disk is read-only, so it cannot be wiped."),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Standard (EXT4), recommended" }),
    ).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Warn when it is this full" }),
    ).toHaveTextContent("85%");
    expect(
      screen.getByText(
        "To combine several disks, use Combine disks (BTRFS), or create a RAID array under RAID. RAID makes the disks act as one disk, with any file system on it.",
        { exact: false },
      ),
    ).toBeVisible();
    // Continue with nothing chosen says so; nothing is called.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Choose a disk.")).toBeVisible();
    expect(calls("FileSystemMgmt.getCandidatesBg")).toHaveLength(1);
    for (const call of ["FileSystemMgmt.create", "DiskMgmt.wipe"]) {
      expect(callNames()).not.toContain(call);
    }
  });

  it("fails closed when it cannot check which disks can be used", async () => {
    await flow({ scenario: "fsCandidatesFail" });
    expect(
      await screen.findByText(
        "Could not check which disks can be used.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/wipefs -n \/dev\/sdb/)).toBeVisible();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("creates, sets up and mounts a file system on an empty disk, after the typed confirmation", async () => {
    const { user } = await flow();
    await toSummary(user, "/dev/sdd");
    const summary = screen.getByText("Ready to add storage")
      .parentElement as HTMLElement;
    expect(summary).toHaveTextContent(
      "Use the whole of /dev/sdd (VMware Virtual SATA Hard Drive, serial number EXAMPLE-SERIAL-0005, 8.0 GiB (8.6 GB on the label)). Anything on it is overwritten.",
    );
    expect(summary).toHaveTextContent("Create an EXT4 file system on it.");
    expect(summary).toHaveTextContent("Warn when it is 85% full.");
    expect(summary).toHaveTextContent(
      "Then mount it, which applies the changes for it. Nothing else is pending.",
    );
    expect(summary).toHaveTextContent("Sharing a folder on it comes next.");
    await waitFor(() => expect(summary.parentElement).toHaveFocus());
    // Unavailable until the device name is typed exactly; Enter does nothing.
    expect(confirmButton()).toHaveAttribute("aria-disabled", "true");
    const field = screen.getByRole("textbox", {
      name: "Type /dev/sdd to confirm.",
    });
    await user.type(field, "/DEV/SDD{Enter}");
    expect(confirmButton()).toHaveAttribute("aria-disabled", "true");
    await user.clear(field);
    await user.type(field, "  /dev/sdd {Enter}");
    expect(callNames()).not.toContain("FileSystemMgmt.create");
    expect(confirmButton()).toHaveAttribute("aria-disabled", "false");
    const before = seenCalls.length;
    await user.click(confirmButton());

    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
    const after = seenCalls.slice(before).map((c) => c.call);
    // Step 1's re-check comes first, then the create, the find, the set-up, the checkpoint, the check.
    const at = (call: string) => after.indexOf(call);
    expect(at("FileSystemMgmt.getCandidatesBg")).toBeGreaterThanOrEqual(0);
    expect(at("DiskMgmt.getList")).toBeLessThan(at("FileSystemMgmt.create"));
    expect(at("FileSystemMgmt.getCandidatesBg")).toBeLessThan(
      at("FileSystemMgmt.create"),
    );
    expect(at("FileSystemMgmt.create")).toBeLessThan(
      at("FileSystemMgmt.getMountCandidates"),
    );
    expect(at("FileSystemMgmt.setMountPoint")).toBeLessThan(
      at("Config.applyChangesBg"),
    );
    expect(after).not.toContain("DiskMgmt.wipe");
    // The stable path step 1 read, never the address.
    expect(calls("FileSystemMgmt.create")[0]?.params).toEqual({
      devicefile: SDD.devicefile,
      type: "ext4",
    });
    expect(calls("FileSystemMgmt.setMountPoint")[0]?.params).toEqual({
      id: "/dev/disk/by-uuid/00000000-0000-4000-8000-000000000761",
      usagewarnthreshold: 85,
      comment: "",
    });
    for (const label of [
      "Check /dev/sdd again",
      "Create the EXT4 file system",
      "Find the new file system",
      "Set up the mount",
      "Mount the new file system",
      "Check that it is mounted",
    ]) {
      expect(steps()).toHaveTextContent(`Succeeded${label}`);
    }
    expect(
      screen.getByText(
        /^EXT4 on \/dev\/sdd1 is mounted and ready, with 7\.7\sGiB free\.$/,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open the file system" }),
    ).toHaveAttribute(
      "href",
      "/ui/storage/filesystems/00000000-0000-4000-8000-000000000761",
    );
    const handover = await screen.findByRole("region", {
      name: "Next: share a folder on it",
    });
    expect(handover).toHaveTextContent(
      "Make a shared folder on EXT4 on /dev/sdd1, choose who can use it, and share it with your computers.",
    );
    expect(
      within(handover).getByRole("link", { name: "Share a folder on it" }),
    ).toHaveAttribute("href", "/ui/storage/shared-folders/add");
  }, 30_000);

  it("reads the RAID plugin's 404 as no arrays, and adds the storage all the same", async () => {
    const { user } = await flow({
      answers: { mdMgmtEnumerateDevices: "notInstalled" },
    });
    await toSummary(user, "/dev/sdb");
    expect(screen.queryByText(/^Could not check/)).toBeNull();
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
    // Read on opening and again by step 1, answered 404 each time.
    expect(calls("MdMgmt.enumerateDevices").length).toBeGreaterThanOrEqual(2);
    expect(steps()).toHaveTextContent("SucceededCheck /dev/sdb again");
  }, 30_000);

  it("stops before anything is erased when the disk changed (6.7)", async () => {
    let swapped = false;
    const { user } = await flow({
      answers: {
        diskMgmtGetList: () =>
          !swapped
            ? "vmDisks"
            : {
                status: 200,
                value: {
                  total: DISKS.length,
                  data: DISKS.map((d) =>
                    d.devicename === "sdd"
                      ? { ...d, serialnumber: "EXAMPLE-SERIAL-9999" }
                      : d,
                  ),
                },
              },
      },
    });
    await toSummary(user, "/dev/sdd");
    // Another disk now has the name /dev/sdd (a restart, say).
    swapped = true;
    await confirm(user, "/dev/sdd");
    expect(
      await screen.findByText(
        "The disk now called /dev/sdd is not the one you chose. Nothing was erased. Choose again.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("FileSystemMgmt.create");
    expect(callNames()).not.toContain("DiskMgmt.wipe");
    expect(steps()).toHaveTextContent("FailedCheck /dev/sdd again");
    expect(steps()).toHaveTextContent("WaitingCreate the EXT4 file system");
    await user.click(screen.getByRole("button", { name: "Choose again" }));
    expect(await option("/dev/sdd")).not.toBeChecked();
  }, 30_000);

  it("stops before anything is erased when a blocker appeared, naming it", async () => {
    const configured = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value;
    const sdd1 =
      CONTRACT_EXAMPLES.fileSystemMgmtGetMountCandidates.created.value[0];
    let blocked = false;
    const { user } = await flow({
      answers: {
        fileSystemMgmtGetList: () =>
          blocked
            ? {
                status: 200,
                value: {
                  total: 2,
                  data: [
                    ...configured.data,
                    {
                      ...configured.data[0],
                      ...sdd1,
                      mounted: true,
                      mountpoint: "/srv/x",
                      status: 1,
                    },
                  ],
                },
              }
            : "configured",
      },
    });
    await toSummary(user, "/dev/sdd");
    blocked = true;
    await confirm(user, "/dev/sdd");
    expect(
      await screen.findByText("/dev/sdd cannot be used now.", {}, LONG),
    ).toBeInTheDocument();
    expect(screen.getByText(/which is in use\./)).toBeVisible();
    expect(callNames()).not.toContain("FileSystemMgmt.create");
  }, 30_000);

  it("erases a disk that holds something first, under the same confirmation (D8)", async () => {
    const { user } = await flow({ scenario: "fsReuse" });
    const group = await screen.findByRole(
      "group",
      { name: "Erase and reuse" },
      LONG,
    );
    expect(group).toHaveTextContent(
      "These disks hold something. Everything on the one you choose is erased.",
    );
    expect(group).toHaveTextContent(
      "Holds the file system old-pc (NTFS), not used on this NAS.",
    );
    await toSummary(user, "/dev/sdd");
    expect(
      screen.getByText("Ready to add storage").parentElement,
    ).toHaveTextContent(
      "Everything on it is lost: Holds the file system old-pc (NTFS), not used on this NAS.",
    );
    await confirm(user, "/dev/sdd");
    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
    expect(steps()).toHaveTextContent("SucceededErase /dev/sdd");
    expect(calls("DiskMgmt.wipe")[0]?.params).toEqual({
      devicefile: SDD.devicefile,
      secure: false,
    });
    const order = callNames();
    expect(order.indexOf("DiskMgmt.wipe")).toBeLessThan(
      order.indexOf("FileSystemMgmt.create"),
    );
  }, 30_000);

  it("offers to try mounting again first when the apply fails, and succeeds then (R7)", async () => {
    const { user } = await flow({ scenario: "fsApplyFails" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText("Mounting the new file system failed.", {}, LONG),
    ).toBeInTheDocument();
    expect(steps()).toHaveTextContent("FailedMount the new file system");
    const retry = screen.getByRole("button", { name: "Try mounting again" });
    const undo = screen.getByRole("button", { name: "Undo the mount" });
    // "Try mounting again" first.
    expect(
      retry.compareDocumentPosition(undo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement?.textContent).toContain(
        "Mounting the new file system failed.",
      ),
    );
    await user.click(retry);
    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
  }, 30_000);

  it("undoes the mount after a failed apply, then deploys the four modules again by force (R7)", async () => {
    const { user } = await flow({ scenario: "fsApplyFails" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    await screen.findByText("Mounting the new file system failed.", {}, LONG);
    await user.click(screen.getByRole("button", { name: "Undo the mount" }));
    expect(
      await screen.findByText(
        "The mount was undone. The file system stays on the disk and is listed under Found on the disks, not mounted.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(callNames()).toContain("Config.revertChangesBg");
    const applies = calls("Config.applyChangesBg");
    expect(applies.at(-1)?.params).toEqual({
      modules: ["collectd", "fstab", "monit", "quota"],
      force: true,
    });
  }, 30_000);

  it("pauses at the checkpoint when other changes appeared, and Stop here applies nothing (R10)", async () => {
    const { user } = await flow({ scenario: "fsAlsoPending" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText("Other changes are pending too", {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Also pending from elsewhere/).closest("p"),
    ).toHaveTextContent(/NFS/);
    expect(callNames()).not.toContain("Config.applyChangesBg");
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(
      await screen.findByText(
        "Stopped here. The steps after this one did not run.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("Config.applyChangesBg");
  }, 30_000);

  it("applies the other changes too when the reader says so (R10)", async () => {
    const { user } = await flow({ scenario: "fsAlsoPending" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    await screen.findByText("Other changes are pending too", {}, LONG);
    await user.click(screen.getByRole("button", { name: "Apply them too" }));
    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
  }, 30_000);

  it("never goes on to sharing when the file system is not mounted (B8)", async () => {
    const { user } = await flow({ scenario: "fsNotMounted" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText(
        "The changes were applied, but the file system is not mounted.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(steps()).toHaveTextContent("FailedCheck that it is mounted");
    expect(
      screen.queryByRole("region", { name: "Next: share a folder on it" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Check again" })).toBeVisible();
  }, 30_000);

  it("offers to look again when the new file system has not appeared, then stops with where to find it", async () => {
    const { user } = await flow({ scenario: "fsNotFound" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText(
        "The new file system was created but has not appeared yet.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look again" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Look for new disks" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(await screen.findByText(/^Stopped here\./)).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "It is listed under Found on the disks, not mounted, where you can mount it.",
      ).length,
    ).toBeGreaterThan(0);
    expect(callNames()).not.toContain("FileSystemMgmt.setMountPoint");
  }, 30_000);

  it("says creating failed with the server's words and the output, and retries nothing by itself", async () => {
    const { user } = await flow({ scenario: "fsCreateFails" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    expect(
      await screen.findByText(
        "/dev/sdb was erased, but creating the file system failed.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/is not available after a waiting period of 10 seconds/),
    ).toBeVisible();
    // The output read before the task failed is open: sgdisk made the partition, which then did not
    // appear. It never claims the task wrote nothing.
    const output = screen.getByRole("region", {
      name: "Output of Create the EXT4 file system",
    });
    expect(output).toHaveTextContent("Creating new GPT entries in memory.");
    expect(output).toHaveTextContent(
      "The operation has completed successfully.",
    );
    expect(output).not.toHaveTextContent("This task wrote no output.");
    expect(calls("FileSystemMgmt.create")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Try this step again" }),
    ).toBeVisible();
  }, 30_000);

  it("keeps the run when the reader leaves and comes back", async () => {
    const { user, app } = await flow({ scenario: "fsAlsoPending" });
    await toSummary(user, "/dev/sdb");
    await confirm(user, "/dev/sdb");
    await screen.findByText("Other changes are pending too", {}, LONG);
    await app.router.navigate({ to: "/storage/filesystems" });
    await screen.findByRole("heading", { level: 1, name: "File systems" });
    await app.router.navigate({ to: "/storage/filesystems/add" });
    expect(
      await screen.findByText("Other changes are pending too", {}, LONG),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Steps" })).toBeVisible();
  }, 30_000);

  it("chooses the disk handed over from its page, in memory, and nothing when opened by address", async () => {
    const { user } = await renderApp({
      signedIn: true,
      path: `/storage/disks/${SDD.devicename}`,
    });
    const link = await screen.findByRole(
      "link",
      {
        name: "Add storage on this disk",
      },
      LONG,
    );
    expect(link).toHaveAttribute("href", "/ui/storage/filesystems/add");
    await user.click(link);
    expect(await option("/dev/sdd")).toBeChecked();
    expect(await option("/dev/sdb")).not.toBeChecked();
  }, 30_000);

  it("keeps a normal user off the flow without a call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/filesystems/add",
    });
    await screen.findByText(/only administrators/i);
    expect(callNames().filter((c) => c.startsWith("FileSystemMgmt"))).toEqual(
      [],
    );
  });

  it("offers an empty RAID array, and refuses its member disks", async () => {
    const { user } = await flow({ scenario: "fsRaid" });
    const array = await screen.findByRole(
      "radio",
      { name: /^RAID \/dev\/md0/ },
      LONG,
    );
    // The level in words, and never mdadm's "host:name" (RAID design 0.1, 9.3).
    expect(array).toHaveAccessibleName(
      /RAID \/dev\/md0 \(Mirror \(RAID1\), 2 disks\)/,
    );
    expect(array).not.toHaveAccessibleName(/nas:0/);
    expect(
      screen.queryByRole("radio", { name: /^\/dev\/sdb\s?, / }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /^Disks that cannot be used/ }),
    );
    expect(
      screen.getAllByText(/Wiping it would damage the array\./),
    ).toHaveLength(2);
    await user.click(array);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("button", {
        name: "Erase array and create file system",
      }),
    ).toBeVisible();
  }, 30_000);
});

describe("Combine disks (BTRFS)", () => {
  const box = (device: string) =>
    screen.findByRole(
      "checkbox",
      { name: new RegExp(`^${device}\\s?, `) },
      LONG,
    );

  it("asks for enough disks for the way, and estimates the space with about", async () => {
    const { user } = await flow({ path: "/storage/filesystems/add-multi" });
    expect(
      await screen.findByRole(
        "radio",
        { name: "Mirror (RAID1), recommended" },
        LONG,
      ),
    ).toBeChecked();
    // No size until enough disks are ticked for the way.
    expect(screen.queryByText(/About 0/i)).toBeNull();
    expect(
      screen.getByText(
        "Every file is kept on two disks, so one disk can fail without losing anything. You can use about half the total space.",
      ),
    ).toBeVisible();
    await user.click(await box("/dev/sdb"));
    expect(screen.queryByText(/about \d/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getAllByText("Choose at least 2 disks.").length,
    ).toBeGreaterThan(1);
    await user.click(await box("/dev/sdc"));
    expect(
      screen.getByText(/about half the total space: about 8\.0\sGiB\.$/),
    ).toBeVisible();
    expect(
      screen.getByText(/^Uses all the space and is fast.*About 16\.0\sGiB\.$/),
    ).toBeVisible();
    // A mirror and stripe needs four.
    expect(
      screen.getByText(
        "Like a mirror, and faster with many disks. One disk can fail.",
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole("radio", { name: "Mirror and stripe (RAID10)" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getAllByText(
        "Choose at least 4 disks for this way of combining them.",
      ).length,
    ).toBeGreaterThan(1);
    expect(callNames()).not.toContain("FileSystemMgmt.createBtrfs");
  });

  it("confirms by every device name, then creates one BTRFS file system across them", async () => {
    const { user } = await flow({ path: "/storage/filesystems/add-multi" });
    await user.click(await box("/dev/sdb"));
    await user.click(await box("/dev/sdd"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const summary = (await screen.findByText("Ready to add storage"))
      .parentElement as HTMLElement;
    expect(summary).toHaveTextContent("Erase 2 disks:");
    expect(summary).toHaveTextContent(
      "Combine them into one BTRFS file system: Mirror (RAID1). About 8.0 GiB can be used.",
    );
    const button = screen.getByRole("button", {
      name: "Erase 2 disks and create file system",
    });
    const field = screen.getByRole("textbox", {
      name: "Type /dev/sdb /dev/sdd to confirm.",
    });
    await user.type(field, "/dev/sdd /dev/sdb");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.clear(field);
    await user.type(field, " /dev/sdb    /dev/sdd ");
    expect(button).toHaveAttribute("aria-disabled", "false");
    await user.click(button);
    expect(
      await screen.findByText("The new storage is ready.", {}, LONG),
    ).toBeInTheDocument();
    expect(calls("FileSystemMgmt.createBtrfs")[0]?.params).toEqual({
      profile: "raid1",
      devicefiles: `${SDB.devicefile},${SDD.devicefile}`,
    });
    expect(steps()).toHaveTextContent("SucceededCheck the disks again");
    expect(steps()).toHaveTextContent("SucceededCreate the BTRFS file system");
    // The mirror of two 8 GiB disks holds about 8 GiB, as the summary said; the link opens it.
    expect(
      screen.getByText(/is mounted and ready, with 7\.8\sGiB free\.$/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open the file system" }),
    ).toHaveAttribute(
      "href",
      "/ui/storage/filesystems/00000000-0000-4000-8000-000000000761",
    );
  }, 30_000);
});
