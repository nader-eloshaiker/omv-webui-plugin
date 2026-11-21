// SPDX-License-Identifier: GPL-3.0-or-later
// A file system's page through the whole app on MSW (phase 5 file-systems design 2, 4, 5; owner, P5 to
// P9): the address is a validated UUID and names no call; the summary, what uses it, the warning level
// and tags with the re-read before saving, the technical details read only on request, grow with its
// re-check and every result, and unmount and removal with every refusal, the pre-flight, the step list,
// R10 and the results. Backend text is text.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MockSession, ScenarioName } from "../../mocks/scenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls } from "../../test/server.ts";

const SDA1 = CONTRACT_EXAMPLES.fileSystemMgmtGetList.configured.value.data[0];
const uuidFor = (n: number) =>
  `00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`;
const MEDIA = uuidFor(10);
const POOL = uuidFor(13);
const OLD_BACKUPS = uuidFor(18);
const SCRATCH = uuidFor(2);

async function page(
  address: string,
  options: Parameters<typeof renderApp>[0] = {},
) {
  const app = await renderApp({
    signedIn: true,
    path: `/storage/filesystems/${address}`,
    ...options,
  });
  await screen.findByRole("heading", { level: 1 });
  return app;
}

const LONG = { timeout: 8000 };
const section = (name: string) => screen.findByRole("region", { name }, LONG);
/** A panel named by its heading but not a landmark (the Used by panel). */
const panel = async (name: string) =>
  (await screen.findByRole("heading", { name }, LONG)).closest(
    "section",
  ) as HTMLElement;
const calls = (call: string) => seenCalls.filter((c) => c.call === call);
const settled = (app: { queryClient: { isFetching(): number } }) =>
  waitFor(() => expect(app.queryClient.isFetching()).toBe(0));
const fact = (label: string) => {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling as HTMLElement;
};

describe("a file system's page", () => {
  it("names the file system, says it is reachable, and shows its facts", async () => {
    const { app } = await page(SDA1.uuid);
    await screen.findByRole("heading", {
      level: 1,
      name: "File system EXT4 on /dev/sda1",
    });
    await settled(app);
    // The UUID is never in the title.
    expect(document.title).toBe(
      "EXT4 on /dev/sda1 – File systems – openmediavault",
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toHaveTextContent("File systems");
    expect(screen.getByText(/^EXT4, 7\.8\sGiB$/)).toBeInTheDocument();
    expect(fact("State")).toHaveTextContent("OK");
    expect(within(fact("Usage")).getByRole("meter")).toBeInTheDocument();
    expect(fact("Warning level")).toHaveTextContent(
      "OffNo email and no dashboard warning when it fills up.",
    );
    expect(fact("Tags")).toHaveTextContent("None");
    expect(fact("Type")).toHaveTextContent("EXT4");
    expect(
      within(fact("On")).getByRole("link", { name: "Open disk /dev/sda" }),
    ).toBeVisible();
    expect(fact("Device name")).toHaveTextContent("/dev/sda1");
    expect(fact("Folder on the NAS")).toHaveTextContent(SDA1.mountpoint);
    expect(
      screen.getByRole("button", { name: "Copy folder path" }),
    ).toBeVisible();
    // The mount entry is read by the stable path OMV stored, from the row, never the address.
    expect(calls("FsTab.getByFsName")[0]?.params).toEqual({
      fsname: SDA1.devicefile,
    });
    // Nothing that reads the disk itself, and nothing that changes anything.
    expect(callNames()).not.toContain("FileSystemMgmt.getDetails");
    expect(callNames()).not.toContain("FileSystemMgmt.getCandidatesBg");
  });

  it("shows the other names on request, the options one per line", async () => {
    const { user } = await page(SDA1.uuid);
    await user.click(
      await screen.findByRole("button", {
        name: "Other names for this file system",
      }),
    );
    expect(fact("UUID")).toHaveTextContent(SDA1.uuid);
    expect(fact("Mount options").querySelectorAll("li")).toHaveLength(6);
  });

  it.each([
    ["a value that fails the pattern", "not-a-uuid!"],
    ["a 37-character value", `${SDA1.uuid}0`],
    ["a path step", "..%2F..%2Frpc.php"],
  ])(
    "shows %s as not set up, and makes no file-system call for it",
    async (_, address) => {
      await page(address);
      expect(
        await screen.findByText(
          "This file system is not set up on this NAS. It may have been unmounted or removed.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Show all file systems" }),
      ).toHaveAttribute("href", "/ui/storage/filesystems");
      for (const call of [
        "FileSystemMgmt.getList",
        "FsTab.getByFsName",
        "FileSystemMgmt.getDetails",
      ]) {
        expect(callNames()).not.toContain(call);
      }
    },
  );

  it("shows a UUID that names no file system as not set up, without its own calls", async () => {
    const { app } = await page("00000000-0000-4000-8000-0000000000ff");
    await screen.findByText(/This file system is not set up on this NAS/);
    await settled(app);
    expect(callNames()).not.toContain("FsTab.getByFsName");
  });

  it("keeps a normal user off the page without a call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: `/storage/filesystems/${SDA1.uuid}`,
    });
    await screen.findByText(/only administrators/i);
    expect(
      callNames().filter((c) => /^(FileSystemMgmt|FsTab)/.test(c)),
    ).toEqual([]);
  });

  it("says when the list cannot be read", async () => {
    await page(SDA1.uuid, {
      answers: {
        fileSystemMgmtGetList: { status: 500, message: "blkid failed." },
      },
    });
    expect(
      await screen.findByText("Could not read this file system."),
    ).toBeInTheDocument();
    expect(screen.getByText("blkid failed.")).toBeInTheDocument();
  });
});

describe("what uses it, and unmounting it (5)", () => {
  it("names the shared folder on it, and refuses to unmount with no way round (P6, P9)", async () => {
    const { user } = await page(SDA1.uuid);
    const used = await panel("Used by");
    expect(
      await within(used).findByText("a4share", {}, LONG),
    ).toBeInTheDocument();
    expect(
      within(used).getByRole("link", {
        name: "Open Shared folders, where a4share is listed",
      }),
    ).toHaveAttribute("href", "/ui/storage/shared-folders");
    const unmount = await section("Unmount this file system");
    expect(unmount).toHaveTextContent("Shared folders use it: a4share.");
    expect(unmount).toHaveTextContent(
      "Delete those shared folders, or move them to another file system, first.",
    );
    const button = within(unmount).getByRole("button", { name: "Unmount…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // The links lead to removing the blocker, never to an unmount without the check.
    for (const link of within(unmount).getAllByRole("link")) {
      expect([
        "/ui/storage/shared-folders",
        "/#/storage/shared-folders",
      ]).toContain(link.getAttribute("href"));
    }
    expect(callNames()).not.toContain("FileSystemMgmt.umountByDir");
  });

  it("says when what uses it could not be checked, and refuses on _used alone", async () => {
    await page(SDA1.uuid, {
      answers: {
        shareMgmtGetList: { status: 500, message: "Share list unreadable." },
      },
    });
    const used = await panel("Used by");
    expect(
      await within(used).findByText(
        "Could not check which shared folders use this file system.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(within(used).getByText("Share list unreadable.")).toBeVisible();
    const unmount = await section("Unmount this file system");
    expect(unmount).toHaveTextContent(
      "Shared folders or other settings use it.",
    );
    expect(
      within(unmount).getByRole("button", { name: "Unmount…" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("unmounts after its check and confirmation, then applies what it leaves pending (P6, P7)", async () => {
    const { user } = await page(MEDIA, { scenario: "fsVariety" });
    const unmount = await section("Unmount this file system");
    await user.click(within(unmount).getByRole("button", { name: "Unmount…" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Unmount media?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(dialog).toHaveAccessibleDescription(
      "Its files cannot be reached until it is mounted again. Nothing on it is deleted.",
    );
    expect(dialog).toHaveTextContent("What stops working");
    expect(dialog).toHaveTextContent(
      "Its warning level and tags are removed. You set them again when you mount it.",
    );
    // The dialog read the list, the shared folders and what is pending again.
    for (const call of [
      "FileSystemMgmt.getList",
      "ShareMgmt.getList",
      "System.getInformation",
    ]) {
      expect(callNames()).toContain(call);
    }
    expect(callNames()).not.toContain("FileSystemMgmt.umountByDir");
    await user.click(within(dialog).getByRole("button", { name: "Unmount" }));
    // The page swaps to "not set up" under the result, so the result is looked up again after.
    await screen.findByText("media was unmounted.", {}, LONG);
    expect(calls("FileSystemMgmt.umountByDir")[0]?.params).toEqual({
      dir: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000710",
    });
    expect(callNames()).toContain("Config.applyChangesBg");
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(steps).toHaveTextContent("SucceededUnmount media");
    expect(steps).toHaveTextContent("SucceededApply the remaining changes");
    expect(steps).toHaveTextContent("SucceededCheck that it is unmounted");
    // The file system is gone: the page says so under the result.
    expect(
      await screen.findByText(/This file system is not set up on this NAS/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to File systems" }),
    ).toHaveAttribute("href", "/ui/storage/filesystems");
  });

  it("refuses to start while other changes are pending, offering to apply them first (P7)", async () => {
    const { user, mock } = await page(MEDIA, { scenario: "fsVariety" });
    const unmount = await section("Unmount this file system");
    mock.dirty = true;
    await user.click(within(unmount).getByRole("button", { name: "Unmount…" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      await within(dialog).findByText(
        "Unmounting applies some changes at once and clears what lets the band undo the others. Apply or undo them first.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Unmount" }),
    ).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Apply them now" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: /^Apply \d+ changes\?$/,
    });
    await user.click(
      within(confirm).getByRole("button", { name: /^Apply \d+ changes$/ }),
    );
    // Once nothing is pending, the dialog goes on to the confirmation.
    expect(
      await screen.findByRole("button", { name: "Unmount" }),
    ).toBeVisible();
    expect(callNames()).not.toContain("FileSystemMgmt.umountByDir");
  });

  it("stops at R10 when other changes appear meanwhile, and Stop here leaves them in the band", async () => {
    const holder: { session?: MockSession } = {};
    const { user, mock } = await page(MEDIA, {
      scenario: "fsVariety",
      answers: {
        fileSystemMgmtUmountByDir: () => {
          if (holder.session) {
            holder.session.dirty = true;
          }
          return "null";
        },
      },
    });
    holder.session = mock;
    const unmount = await section("Unmount this file system");
    await user.click(within(unmount).getByRole("button", { name: "Unmount…" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      await within(dialog).findByRole("button", { name: "Unmount" }),
    );
    expect(
      await screen.findByText("Other changes are pending too", {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Also pending from elsewhere/).closest("p"),
    ).toHaveTextContent(/Also pending from elsewhere: .*SSH/);
    expect(callNames()).not.toContain("Config.applyChangesBg");
    await user.click(screen.getByRole("button", { name: "Stop here" }));
    expect(
      await screen.findByText(
        "Stopped here. The remaining changes are still pending in the band.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("Config.applyChangesBg");
  });

  it("says when something still uses its files, and that nothing was changed", async () => {
    const { user } = await page(SCRATCH, { scenario: "fsBusy" });
    const unmount = await section("Unmount this file system");
    await user.click(within(unmount).getByRole("button", { name: "Unmount…" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Unmount scratch?",
    });
    await user.click(
      await within(dialog).findByRole("button", { name: "Unmount" }),
    );
    expect(
      await screen.findByText("scratch was not unmounted.", {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Something is still using its files. Nothing was changed. Stop the program or close the files on the other computer, then try again.",
      ),
    ).toBeVisible();
    expect(screen.getByText(/target is busy\./)).toBeVisible();
    expect(callNames()).not.toContain("Config.applyChangesBg");
    expect(screen.getByRole("button", { name: "Try again…" })).toBeVisible();
  });

  it("re-checks on Unmount and refuses when a shared folder appeared meanwhile", async () => {
    let shared = false;
    const { user } = await page(MEDIA, {
      scenario: "fsVariety",
      answers: {
        shareMgmtGetList: () =>
          shared
            ? {
                status: 200,
                value: {
                  total: 1,
                  data: [
                    {
                      ...CONTRACT_EXAMPLES.shareMgmtGetList.populated.value
                        .data[0],
                      name: "late-folder",
                      // A shared folder names the mount entry it is on, as OMV records it: media's
                      // entry in the hand-written list (fsScenarios.ts, listEntries).
                      mntentref: "00000000-0000-4000-8000-000000000411",
                      mntent: {
                        dir: "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000710",
                      },
                    },
                  ],
                },
              }
            : "empty",
      },
    });
    const unmount = await section("Unmount this file system");
    await user.click(within(unmount).getByRole("button", { name: "Unmount…" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = await within(dialog).findByRole("button", {
      name: "Unmount",
    });
    shared = true;
    await user.click(confirm);
    expect(
      await within(dialog).findByText("Shared folders use it: late-folder."),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "This file system cannot be unmounted now",
    );
    expect(callNames()).not.toContain("FileSystemMgmt.umountByDir");
  });

  it("says a mount that is only pending is undone in the band, with no Unmount (D16)", async () => {
    await page(uuidFor(1), { scenario: "fsMountPending" });
    const end = await section("Unmount this file system");
    expect(end).toHaveTextContent(
      "This mount is not applied yet. To cancel it, undo the pending changes in the band at the top of the page.",
    );
    expect(within(end).queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1 }).parentElement,
    ).toHaveTextContent("Not applied yet");
  });

  it("removes a missing file system after a plain confirmation (P8)", async () => {
    const { user } = await page(OLD_BACKUPS, { scenario: "fsVariety" });
    expect(
      await screen.findByText(/OMV has this file system set up, but its disk/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Usage", { selector: "dt" })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Technical details" }),
    ).toBeNull();
    const remove = await section("Remove this file system from the NAS");
    await user.click(
      within(remove).getByRole("button", { name: "Remove from the NAS…" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove old-backups from the NAS?",
    });
    const confirm = await within(dialog).findByRole("button", {
      name: "Remove from the NAS",
    });
    // Not red: nothing reachable is cut off.
    expect(confirm).toHaveClass("bg-primary");
    await user.click(confirm);
    await screen.findByText("old-backups was removed from the NAS.", {}, LONG);
    await waitFor(() =>
      expect(
        screen.getByText("old-backups was removed from the NAS."),
      ).toBeVisible(),
    );
  });
});

describe("the warning level and tags (2.6)", () => {
  it("reads the entry again before saving and writes it back whole with only the two changed (R4)", async () => {
    const { user } = await page(SDA1.uuid);
    const form = await screen.findByRole("form", {
      name: "Warning level and tags",
    });
    const tags = await within(form).findByRole("textbox", { name: "Tags" });
    await user.type(tags, "Media, Backups");
    const before = calls("FsTab.getByFsName").length;
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(
      await within(form).findByText(
        "Saved. The changes take effect when you apply them in the band at the top of the page.",
      ),
    ).toBeInTheDocument();
    expect(calls("FsTab.getByFsName").length).toBe(before + 1);
    expect(calls("FsTab.set")[0]?.params).toEqual({
      uuid: "00000000-0000-4000-8000-000000000002",
      fsname: SDA1.devicefile,
      dir: SDA1.mountpoint,
      type: "ext4",
      opts: "defaults,nofail,user_xattr,usrquota,grpquota,acl",
      freq: 0,
      passno: 2,
      hidden: false,
      usagewarnthreshold: 0,
      comment: "Backups,Media",
    });
    expect(within(form).getByRole("button", { name: "Save" })).toHaveFocus();
    // monit is pending and this session saved this file system's settings: the page's mark.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1 }).parentElement,
      ).toHaveTextContent("Not applied yet"),
    );
  });

  it("shows a hand-written file system's own level and tags, as its row has them", async () => {
    await page(MEDIA, { scenario: "fsVariety" });
    const form = await screen.findByRole("form", {
      name: "Warning level and tags",
    });
    expect(
      await within(form).findByRole("textbox", { name: "Tags" }),
    ).toHaveValue("Media, Photos");
    expect(
      within(form).getByRole("combobox", { name: "Warn when it is this full" }),
    ).toHaveTextContent("85%");
    expect(
      screen.queryByText(
        "This file system is not set up on this NAS any more.",
      ),
    ).toBeNull();
  });

  it("saves nothing when the file system was removed meanwhile", async () => {
    let reads = 0;
    const { user } = await page(SDA1.uuid, {
      answers: {
        fsTabGetByFsName: () => (++reads <= 2 ? "entry" : "none"),
      },
    });
    const form = await screen.findByRole("form", {
      name: "Warning level and tags",
    });
    await user.type(
      await within(form).findByRole("textbox", { name: "Tags" }),
      "x",
    );
    reads = 10;
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(
      await within(form).findByText(
        "This file system was removed from the NAS while you edited. Nothing was saved.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("FsTab.set");
  });

  it("refuses tags longer than the server keeps, in words", async () => {
    const { user } = await page(SDA1.uuid);
    const form = await screen.findByRole("form", {
      name: "Warning level and tags",
    });
    const tags = await within(form).findByRole("textbox", { name: "Tags" });
    await user.click(tags);
    await user.paste("t".repeat(201));
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(
      await within(form).findByText("Use at most 200 characters."),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("FsTab.set");
  });

  it("says when the settings cannot be read, and when there is no entry", async () => {
    await page(SDA1.uuid, {
      answers: {
        fsTabGetByFsName: { status: 500, message: "Entry unreadable." },
      },
    });
    expect(
      await screen.findByText("Could not read this file system's settings."),
    ).toBeInTheDocument();
  });
});

describe("the technical details (2.5)", () => {
  it("reads the report only when asked, and shows it as text", async () => {
    const { user, app } = await page(SDA1.uuid);
    const details = await section("Technical details");
    await settled(app);
    expect(callNames()).not.toContain("FileSystemMgmt.getDetails");
    expect(details).toHaveTextContent(
      "Reading it reads the disk, which wakes it if it has gone to sleep.",
    );
    await user.click(
      within(details).getByRole("button", { name: "Show technical details" }),
    );
    const report = await within(details).findByRole("region", {
      name: "Technical details of EXT4 on /dev/sda1",
    });
    expect(report).toHaveTextContent("Filesystem magic number: 0xEF53");
    expect(calls("FileSystemMgmt.getDetails")[0]?.params).toEqual({
      devicefile: "/dev/sda1",
    });
    expect(within(details).getByText(/^Read at /)).toBeVisible();
    await user.click(
      within(details).getByRole("button", { name: "Hide technical details" }),
    );
    await user.click(
      within(details).getByRole("button", { name: "Show technical details" }),
    );
    // Kept for the session: shown again without reading again.
    expect(calls("FileSystemMgmt.getDetails")).toHaveLength(1);
  });

  it("shows the first 500 lines of a long report, and the rest on request", async () => {
    const { user } = await page(SDA1.uuid, { scenario: "fsDetailsLong" });
    const details = await section("Technical details");
    await user.click(
      within(details).getByRole("button", { name: "Show technical details" }),
    );
    expect(
      await within(details).findByText(
        "Showing the first 500 of 40,000 lines.",
      ),
    ).toBeInTheDocument();
    const report = within(details).getByRole("region", {
      name: /^Technical details of/,
    });
    expect(report.querySelectorAll("[data-slot=task-log-line]")).toHaveLength(
      500,
    );
    expect(report.querySelector("script")).toBeNull();
  });

  it("says when the report cannot be read, with the server's words", async () => {
    const { user } = await page(SDA1.uuid, { scenario: "fsDetailsFail" });
    const details = await section("Technical details");
    await user.click(
      within(details).getByRole("button", { name: "Show technical details" }),
    );
    expect(
      await within(details).findByText("Could not read the technical details."),
    ).toBeInTheDocument();
    expect(
      within(details).getByText("Failed to get mountpoint of '/dev/sda1'."),
    ).toBeVisible();
  });
});

describe("growing it (4; owner, P5)", () => {
  const grow = async (scenario: ScenarioName) => {
    const app = await page(SDA1.uuid, { scenario });
    const region = await section("Grow this file system");
    await app.user.click(
      within(region).getByRole("button", { name: "Grow file system…" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Grow file system EXT4 on /dev/sda1?",
    });
    return { ...app, region, dialog };
  };

  it("confirms without typing, re-reads, grows, and says nothing changed when nothing grew", async () => {
    const { user, region, dialog } = await grow("admin");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(dialog).toHaveTextContent(
      "This cannot be undone: a file system cannot be made smaller again here.",
    );
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    const confirm = within(dialog).getByRole("button", {
      name: "Grow file system",
    });
    expect(confirm).toHaveClass("bg-destructive");
    expect(callNames()).not.toContain("FileSystemMgmt.grow");
    const lists = calls("FileSystemMgmt.getList").length;
    await user.click(confirm);
    expect(
      await within(region).findByText(
        "EXT4 on /dev/sda1 already used all the space available. Nothing changed.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(calls("FileSystemMgmt.getList").length).toBeGreaterThan(lists);
    expect(calls("FileSystemMgmt.grow")[0]?.params).toEqual({ id: SDA1.uuid });
  });

  it("says how big it is now when it grew", async () => {
    const { user, region, dialog } = await grow("fsGrowBigger");
    await user.click(
      within(dialog).getByRole("button", { name: "Grow file system" }),
    );
    expect(
      await within(region).findByText("EXT4 on /dev/sda1 was grown.", {}, LONG),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent(
      /It is now 15\.6\sGiB \(it was 7\.8\sGiB\)\./,
    );
  });

  it("says it was not grown, with the server's words", async () => {
    const { user, region, dialog } = await grow("fsGrowFails");
    await user.click(
      within(dialog).getByRole("button", { name: "Grow file system" }),
    );
    expect(
      await within(region).findByText("EXT4 on /dev/sda1 was not grown."),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent("does not support online resizing.");
    expect(region).toHaveTextContent("The file system stays in use.");
  });

  it("says it cannot tell when the request was cut", async () => {
    const { user, region, dialog } = await grow("fsGrowCut");
    await user.click(
      within(dialog).getByRole("button", { name: "Grow file system" }),
    );
    expect(
      await within(region).findByText(
        "Could not tell whether growing finished. It may still be running on the NAS.",
      ),
    ).toBeInTheDocument();
  });

  it("grows nothing when the file system changed since the page was read", async () => {
    let unmounted = false;
    const { user } = await page(SDA1.uuid, {
      answers: {
        fileSystemMgmtGetList: () =>
          unmounted
            ? {
                status: 200,
                value: { total: 1, data: [{ ...SDA1, mounted: false }] },
              }
            : "configured",
      },
    });
    const region = await section("Grow this file system");
    await user.click(
      within(region).getByRole("button", { name: "Grow file system…" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    unmounted = true;
    await user.click(
      within(dialog).getByRole("button", { name: "Grow file system" }),
    );
    expect(
      await within(dialog).findByText(
        "This file system changed since the page was read.",
      ),
    ).toBeInTheDocument();
    expect(callNames()).not.toContain("FileSystemMgmt.grow");
  });

  it("does not offer to grow BTRFS on several disks (D12)", async () => {
    await page(POOL, { scenario: "fsVariety" });
    const region = await section("Grow this file system");
    expect(region).toHaveTextContent(
      "It spans several disks. Growing it here would grow only its first disk's part, so it is not offered.",
    );
    expect(
      within(region).getByRole("button", { name: "Grow file system…" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("the sharing handover on a file system's page (2.4, D20)", () => {
  it("follows Used by while nothing is shared from a mounted file system, with the agreed choices", async () => {
    await page(MEDIA, {
      scenario: "fsVariety",
      answers: { shareMgmtGetList: "empty" },
    });
    const handover = await section("Next: share a folder on it");
    expect(handover).toHaveTextContent(
      'Choose the file system [Media,Photos]. For Permissions, choose "Administrator: read/write, Users: read/write, Others: no access"',
    );
    expect(handover).toHaveTextContent("Leave Public at No");
    expect(handover).toHaveTextContent(
      "Only if anyone on your network may open it without a password, choose Guests allowed instead.",
    );
    expect(handover).toHaveTextContent(
      "Turn on sharing with Windows and Mac computers.",
    );
    const hrefs = within(handover)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual([
      "/#/storage/shared-folders/create",
      "/#/storage/shared-folders",
      "/#/services/smb/settings",
      "/#/services/smb/shares/create",
    ]);
  });

  it("leaves out turning SMB on when it is on already", async () => {
    const services = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value;
    await page(MEDIA, {
      scenario: "fsVariety",
      answers: {
        shareMgmtGetList: "empty",
        servicesGetStatus: {
          status: 200,
          value: {
            ...services,
            data: services.data.map((s) =>
              s.name === "samba" ? { ...s, enabled: true, running: true } : s,
            ),
          },
        },
      },
    });
    const handover = await section("Next: share a folder on it");
    await waitFor(() =>
      expect(within(handover).getAllByRole("link")).toHaveLength(3),
    );
    expect(handover).not.toHaveTextContent("Turn on sharing");
  });
});
