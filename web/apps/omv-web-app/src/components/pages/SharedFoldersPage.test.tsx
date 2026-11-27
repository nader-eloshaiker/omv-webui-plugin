// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Shared folders through the whole app on MSW serving the contract's examples: how the
// table's page, sort and search map to ShareMgmt.getList, the empty, filtered-empty, error and loading
// states, the problem count from a second read of every folder, the Sharing column from
// SMB.getShareList and its failure, the Windows and Mac sharing line, this session's unfinished work
// and pending marks, backend text as text (UI-2), and a normal user kept off the page without a call
// (UI-4).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  recordCreated,
  recordSaved,
} from "../../sharedFolders/sharesSession.ts";
import { findDashboard } from "../../test/dashboard.ts";
import { openNavGroup } from "../../test/nav.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls, server } from "../../test/server.ts";

const FOLDER = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data[0];
const SHARE = CONTRACT_EXAMPLES.smbGetShareList.one.value.data[0];
const INFO = CONTRACT_EXAMPLES.systemGetInformation.admin.value;
const SERVICES = CONTRACT_EXAMPLES.servicesGetStatus.sshOnly.value.data;
const WHOLE_LIST = {
  start: 0,
  limit: null,
  sortfield: null,
  sortdir: null,
  search: null,
};

/** One SMB share for the example folder, as getShareList lists it. */
const shareOfFolder = (change: Record<string, unknown> = {}): FixedAnswer => ({
  status: 200,
  value: {
    total: 1,
    data: [
      {
        ...SHARE,
        sharedfolderref: FOLDER.uuid,
        sharedfoldername: FOLDER.name,
        ...change,
      },
    ],
  },
});
/** Services.getStatus with the samba row as given. */
const samba = (enabled: boolean, running: boolean): FixedAnswer => ({
  status: 200,
  value: {
    total: SERVICES.length,
    data: SERVICES.map((s) =>
      s.name === "samba" ? { ...s, enabled, running } : s,
    ),
  },
});
/** System.getInformation with these modules pending. */
const pendingInfo = (modules: string[]): FixedAnswer => ({
  status: 200,
  value: {
    ...INFO,
    ts: Math.floor(Date.now() / 1000),
    configDirty: modules.length > 0,
    dirtyModules: Object.fromEntries(modules.map((m) => [m, ""])),
  },
});
const SMB_ON = {
  smbGetSettings: "on",
  servicesGetStatus: samba(true, true),
} as const;

interface ListParams {
  start: number;
  limit: number | null;
  sortfield?: string;
  sortdir?: string;
  search?: string;
}

/** The table's reads, without the read of every folder for the problem count. */
const pageReads = () =>
  seenCalls
    .filter((c) => c.call === "ShareMgmt.getList")
    .map((c) => c.params as ListParams)
    .filter((p) => p.limit !== null);

const lastPageRead = () => pageReads().at(-1);

/** `total` folders on the server; each page answers with the rows it asks for. */
function folders(total: number) {
  return ({ params }: { params: unknown }): FixedAnswer => {
    const { start, limit } = params as ListParams;
    const count = Math.max(0, Math.min(limit ?? total, total - start));
    return {
      status: 200,
      value: {
        total,
        data: Array.from({ length: count }, (_, i) => ({
          ...FOLDER,
          uuid: `00000000-0000-4000-8000-${String(start + i).padStart(12, "0")}`,
          name: `folder-${String(start + i + 1)}`,
        })),
      },
    };
  };
}

async function sharedFolders(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({
    signedIn: true,
    path: "/storage/shared-folders",
    ...options,
  });
  await screen.findByRole("heading", { level: 1, name: "Shared folders" });
  return app;
}

const table = () => screen.getByRole("table", { name: "Shared folders" });

describe("the shared folders table", () => {
  it("asks for the first 25 by name and shows each folder's details as text", async () => {
    await sharedFolders();
    const row = await within(table()).findByRole("row", { name: /a4share/ });
    expect(lastPageRead()).toEqual({
      start: 0,
      limit: 25,
      sortfield: "name",
      sortdir: "asc",
    });
    // The second read, of every folder, for the problem count, with all five paging fields (11.2);
    // and the whole share list, for the Sharing column.
    for (const call of ["ShareMgmt.getList", "SMB.getShareList"]) {
      expect(
        seenCalls.some(
          (c) =>
            c.call === call &&
            JSON.stringify(c.params) === JSON.stringify(WHOLE_LIST),
        ),
      ).toBe(true);
    }
    const cells = within(row).getAllByRole("cell");
    // The name links to the folder's page by its UUID, never by its name.
    const link = within(cells[0]!).getByRole("link", {
      name: "Open shared folder a4share",
    });
    expect(link).toHaveTextContent(/^a4share$/);
    expect(link).toHaveAttribute(
      "href",
      `/ui/storage/shared-folders/${FOLDER.uuid}`,
    );
    const text = cells.slice(1).map((c) => c.textContent);
    expect(text[0]).toBe("OK");
    expect(text[1]).toBe("/dev/sda1");
    // Not shared: the Sharing cell is empty.
    expect(text[2]).toBe("");
    expect(text[3]).toBe("a4share/");
    expect(text[4]).toContain(
      "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/a4share/",
    );
    expect(text[5]).toBe("Phase 0 A4");
    expect(text[6]).toBe("No");
    expect(
      within(row).getByRole("button", { name: "Copy full path of a4share" }),
    ).toBeInTheDocument();
    expect(
      within(table()).getByRole("columnheader", { name: "Name" }),
    ).toHaveAttribute("aria-sort", "ascending");
    // Sharing is not a server field, so it does not sort.
    const sharing = within(table()).getByRole("columnheader", {
      name: "Sharing",
    });
    expect(sharing).not.toHaveAttribute("aria-sort");
    expect(within(sharing).queryByRole("button")).toBeNull();
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
    expect(screen.getByText(/^In use: a network share/)).toBeInTheDocument();
    // Nothing is wrong, so there is no problem line.
    expect(screen.queryByText(/cannot be reached/)).not.toBeInTheDocument();
    // Adding is in this interface now: a router link, not the classic page.
    expect(
      screen.getByRole("link", { name: "Add a shared folder" }),
    ).toHaveAttribute("href", "/ui/storage/shared-folders/add");
    // The footer names what stays in the classic interface.
    expect(
      screen.getByText(
        /^NFS shares, file permissions on the disk and the advanced SMB options are in the classic interface\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Shared folders in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/shared-folders");
  });

  it("sorts on the server: a header sorts ascending, again descending, and it is announced", async () => {
    const { user } = await sharedFolders();
    await within(table()).findByRole("row", { name: /a4share/ });
    const status = within(table()).getByRole("button", { name: "Status" });
    await user.click(status);
    await waitFor(() =>
      expect(lastPageRead()).toMatchObject({
        start: 0,
        sortfield: "status",
        sortdir: "asc",
      }),
    );
    expect(
      within(table()).getByRole("columnheader", { name: "Status" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByText("Sorted by Status, ascending")).toBeInTheDocument();
    await user.click(status);
    await waitFor(() =>
      expect(lastPageRead()).toMatchObject({
        sortfield: "status",
        sortdir: "desc",
      }),
    );
    expect(
      screen.getByText("Sorted by Status, descending"),
    ).toBeInTheDocument();
  });

  it("pages on the server, keeps focus on the button pressed, and stops at the last page", async () => {
    const { user } = await sharedFolders({
      answers: { shareMgmtGetList: folders(60) },
    });
    await screen.findByText("1–25 of 60");
    const next = screen.getByRole("button", { name: "Next page" });
    await user.click(next);
    await screen.findByText("26–50 of 60");
    expect(lastPageRead()).toMatchObject({ start: 25, limit: 25 });
    expect(next).toHaveFocus();
    await user.click(next);
    await screen.findByText("51–60 of 60");
    expect(lastPageRead()).toMatchObject({ start: 50, limit: 25 });
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).toHaveAccessibleDescription("This is the last page.");
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await screen.findByText("26–50 of 60");
  });

  it("goes back to the last page that exists when folders were deleted elsewhere", async () => {
    let total = 60;
    const { user } = await sharedFolders({
      answers: { shareMgmtGetList: (call) => folders(total)(call) },
    });
    await screen.findByText("1–25 of 60");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("51–60 of 60");
    total = 30;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("26–30 of 30");
    expect(lastPageRead()).toMatchObject({ start: 25, limit: 25 });
  });

  it("searches on the server after typing stops, from the first page, and clears", async () => {
    const { user } = await sharedFolders({
      answers: {
        shareMgmtGetList: ({ params }) => {
          const { search } = params as ListParams;
          return search === undefined || "a4share".includes(search)
            ? "populated"
            : "searchNoMatch";
        },
      },
    });
    await within(table()).findByRole("row", { name: /a4share/ });
    const search = screen.getByRole("searchbox", {
      name: "Search shared folders",
    });
    expect(search).toHaveAccessibleDescription(
      /Search looks at every detail of a folder/,
    );
    await user.type(search, "media");
    // One read for the whole word, after the pause, not one per key.
    await waitFor(() =>
      expect(lastPageRead()).toMatchObject({ start: 0, search: "media" }),
    );
    expect(pageReads().filter((p) => p.search !== undefined)).toHaveLength(1);
    const empty = await screen.findByText('No shared folders match "media".');
    expect(empty).toBeInTheDocument();
    await user.click(
      within(table()).getByRole("button", { name: "Clear the search" }),
    );
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    await within(table()).findByRole("row", { name: /a4share/ });
    expect(lastPageRead()).not.toHaveProperty("search");
  });

  it("says when there are no shared folders at all, hides the search, and links to add one", async () => {
    await sharedFolders({ scenario: "noSharedFolders" });
    expect(
      await screen.findByText(/^There are no shared folders yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    const empty = screen
      .getByText(/^There are no shared folders yet\./)
      .closest("[data-slot='empty-state']") as HTMLElement | null;
    expect(
      within(empty ?? document.body).getByRole("link", {
        name: "Add a shared folder",
      }),
    ).toHaveAttribute("href", "/ui/storage/shared-folders/add");
  });

  it("says plainly when the list cannot be read, keeps the search, and tries again", async () => {
    let fail = true;
    const { user } = await sharedFolders({
      answers: {
        shareMgmtGetList: () =>
          fail
            ? { status: 500, message: "<i>Database</i> is busy." }
            : "populated",
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not read the shared folders.");
    expect(alert).toHaveTextContent("<i>Database</i> is busy.");
    expect(alert.querySelector("i")).toBeNull();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    // The problem count's read failed too: it is simply left out.
    expect(screen.queryByText(/cannot be reached/)).not.toBeInTheDocument();
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await within(table()).findByRole("row", { name: /a4share/ });
  });

  it("shows skeleton rows, busy, until the first page arrives", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { user } = await renderApp({ signedIn: true });
    await findDashboard();
    // Added after the scenario's answers, so it runs first: it holds every ShareMgmt.getList until
    // released, and lets anything else go on to the scenario.
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as { method?: unknown };
        if (body.method === "getList") {
          await gate;
        }
        return undefined;
      }),
    );
    const nav = screen.getAllByRole("navigation", {
      name: "Main navigation",
    })[0]!;
    openNavGroup("Storage", nav);
    await user.click(within(nav).getByRole("link", { name: "Shared folders" }));
    const t = await screen.findByRole("table", { name: "Shared folders" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Loading shared folders…")).toBeInTheDocument();
    expect(t.querySelectorAll('[data-slot="table-skeleton-row"]')).toHaveLength(
      10,
    );
    release();
    await within(t).findByRole("row", { name: /a4share/ });
    expect(t).not.toHaveAttribute("aria-busy");
  });

  it("counts the folders that cannot be reached, from every folder, and can list them first", async () => {
    const { user } = await sharedFolders({ scenario: "folderProblems" });
    const line = await screen.findByText(
      "3 of 4 shared folders cannot be reached.",
    );
    expect(line.parentElement).toHaveTextContent("Critical");
    expect(
      screen.getByText(
        "Folder not found. Its disk may be disconnected or not mounted.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The path leads to a file, not a folder."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Its file system is no longer set up on this NAS."),
    ).toBeInTheDocument();
    // A folder without a file system or a full path says so in words, with nothing to copy.
    const old = within(table()).getByRole("row", { name: /old-disk/ });
    // Twice for the file system (its column, and the narrow layout's line under the name) and once
    // for the full path.
    expect(within(old).getAllByText("Not available")).toHaveLength(3);
    expect(within(old).queryByRole("button", { name: /Copy/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show these first" }));
    await waitFor(() =>
      expect(lastPageRead()).toMatchObject({
        start: 0,
        sortfield: "status",
        sortdir: "asc",
      }),
    );
  });

  it("shows a status a later OMV may add as Unknown, with the code as text", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await sharedFolders({
      answers: {
        shareMgmtGetList: {
          status: 200,
          value: { total: 1, data: [{ ...FOLDER, status: "EFUTURE" }] },
        },
      },
    });
    const row = await within(table()).findByRole("row", { name: /a4share/ });
    expect(within(row).getByText("Unknown")).toBeInTheDocument();
    expect(within(row).getByText("EFUTURE").tagName).toBe("CODE");
  });

  it("renders names and descriptions as text (UI-2)", async () => {
    await sharedFolders({
      answers: {
        shareMgmtGetList: {
          status: 200,
          value: {
            total: 1,
            data: [
              {
                ...FOLDER,
                name: '<img src=x onerror="alert(1)">',
                comment: "<script>alert(1)</script>‮evil",
              },
            ],
          },
        },
      },
    });
    const row = await within(table()).findByRole("row", { name: /img src=x/ });
    expect(row.querySelector("img, script")).toBeNull();
    expect(
      within(row).getByText('<img src=x onerror="alert(1)">'),
    ).toHaveAttribute("dir", "auto");
  });

  it("keeps its page, sort and search while the reader is elsewhere, in memory only", async () => {
    const { user } = await sharedFolders();
    await within(table()).findByRole("row", { name: /a4share/ });
    await user.type(screen.getByRole("searchbox"), "a4");
    await waitFor(() => expect(lastPageRead()).toMatchObject({ search: "a4" }));
    const nav = screen.getAllByRole("navigation", {
      name: "Main navigation",
    })[0]!;
    await user.click(within(nav).getByRole("link", { name: "Dashboard" }));
    await findDashboard();
    openNavGroup("Storage", nav);
    await user.click(within(nav).getByRole("link", { name: "Shared folders" }));
    expect(await screen.findByRole("searchbox")).toHaveValue("a4");
    expect(window.location.href).not.toContain("a4");
    expect(window.location.search).toBe("");
  });

  it("sends no state-changing call on load (UI-4)", async () => {
    await sharedFolders();
    await within(table()).findByRole("row", { name: /a4share/ });
    expect(
      callNames().filter(
        (c) =>
          !/\.(get|is)/.test(c) &&
          c !== "Zfs.listCompressionTypes" &&
          // The shell's combined read: the interface counters (live/useLive.ts), a read.
          c !== "Network.enumerateDevicesList",
      ),
    ).toEqual([]);
  });

  it("keeps a normal user off the page without asking the server (UI-4)", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/storage/shared-folders",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
      ),
    ).toBeInTheDocument();
    for (const call of [
      "ShareMgmt.getList",
      "SMB.getShareList",
      "SMB.getSettings",
    ]) {
      expect(callNames()).not.toContain(call);
    }
  });
});

describe("how each folder is shared (design 1.1 to 1.4)", () => {
  const row = () => within(table()).findByRole("row", { name: /a4share/ });
  const sharingCellOf = async () => (await row()).querySelectorAll("td")[3];

  it("says Windows and Mac when its share is on and SMB is on, and hides the SMB-off line", async () => {
    await sharedFolders({
      answers: { ...SMB_ON, smbGetShareList: shareOfFolder() },
    });
    expect(await sharingCellOf()).toHaveTextContent(/^Windows and Mac$/);
    expect(
      screen.queryByText(/^Windows and Mac sharing is off/),
    ).not.toBeInTheDocument();
  });

  it("adds Guests too on a second line when guest access is on", async () => {
    await sharedFolders({
      answers: {
        ...SMB_ON,
        smbGetShareList: shareOfFolder({ guest: "allow" }),
      },
    });
    const cell = await sharingCellOf();
    expect(within(cell!).getByText("Guests too")).toBeInTheDocument();
  });

  it("says (off) when the share is turned off for the folder", async () => {
    await sharedFolders({
      answers: { ...SMB_ON, smbGetShareList: shareOfFolder({ enable: false }) },
    });
    expect(await sharingCellOf()).toHaveTextContent(
      /^Windows and Mac \(off\)$/,
    );
  });

  it("says (off) and links to Windows and Mac sharing when SMB is off for the NAS", async () => {
    await sharedFolders({
      answers: {
        smbGetSettings: "off",
        servicesGetStatus: samba(false, false),
        smbGetShareList: shareOfFolder(),
      },
    });
    expect(await sharingCellOf()).toHaveTextContent(
      /^Windows and Mac \(off\)$/,
    );
    const line = screen.getByText(
      "Windows and Mac sharing is off, so no folder can be reached from Windows or Mac computers.",
    );
    expect(line.parentElement).toHaveTextContent("Disabled");
    expect(
      screen.getByRole("link", { name: "Open Windows and Mac sharing" }),
    ).toHaveAttribute("href", "/ui/services/smb");
  });

  it("says nothing about SMB while its settings cannot be read", async () => {
    await sharedFolders({
      answers: {
        smbGetSettings: { status: 500, message: "Busy." },
        smbGetShareList: shareOfFolder(),
      },
    });
    // An enabled share reads as shared while SMB's own state is not known.
    expect(await sharingCellOf()).toHaveTextContent(/^Windows and Mac$/);
    expect(
      screen.queryByText(/^Windows and Mac sharing is off/),
    ).not.toBeInTheDocument();
  });

  it("keeps the table when the share list fails: Not known, the server's words as text, and Try again", async () => {
    let fail = true;
    const { user } = await sharedFolders({
      answers: {
        ...SMB_ON,
        smbGetShareList: () =>
          fail
            ? { status: 500, message: "<b>Failed</b> to execute XPath query." }
            : shareOfFolder(),
      },
    });
    expect(await sharingCellOf()).toHaveTextContent(/^Not known$/);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not read which folders are shared with Windows and Mac computers.",
    );
    expect(alert).toHaveTextContent("<b>Failed</b> to execute XPath query.");
    expect(alert.querySelector("b")).toBeNull();
    expect(alert).not.toHaveTextContent("mock trace");
    fail = false;
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(async () =>
      expect(await sharingCellOf()).toHaveTextContent(/^Windows and Mac$/),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lays a row out for a narrow screen with the file system, sharing and path under the name", async () => {
    await sharedFolders({
      answers: { ...SMB_ON, smbGetShareList: shareOfFolder() },
    });
    const first = (await row()).querySelectorAll("td")[0]!;
    const narrow = first.querySelector(".sm\\:hidden");
    expect(narrow).toHaveTextContent("/dev/sda1");
    expect(narrow).toHaveTextContent("Windows and Mac");
    expect(narrow).toHaveTextContent("a4share");
    // The other columns are hidden at that width.
    const hidden = [...(await row()).querySelectorAll("td")].filter((td) =>
      td.classList.contains("max-sm:hidden"),
    );
    expect(hidden).toHaveLength(6);
  });
});

describe("this session's unfinished work and pending marks (design 1.3, 1.5)", () => {
  const made = (smb: boolean) =>
    recordCreated({ uuid: FOLDER.uuid, name: FOLDER.name, smb });

  it("says a folder made here is not saved yet while its change is pending, and marks its name", async () => {
    made(false);
    await sharedFolders({
      answers: {
        systemGetInformation: pendingInfo(["sharedfolders", "systemd"]),
      },
    });
    const line = await screen.findByText(
      /is made, but the NAS has not saved it yet\. Apply the pending changes so it can be used\.$/,
    );
    expect(line).toHaveTextContent(/^a4share is made/);
    const row = await within(table()).findByRole("row", { name: /a4share/ });
    expect(within(row).getByText("Not applied yet")).toBeInTheDocument();
  });

  it("offers to share a folder whose flow chose SMB and that has no share", async () => {
    made(true);
    await sharedFolders({ answers: { smbGetShareList: "none" } });
    await screen.findByText(
      /is not shared with Windows and Mac computers yet\.$/,
    );
    expect(screen.getByRole("link", { name: "Share it" })).toHaveAttribute(
      "href",
      `/ui/storage/shared-folders/${FOLDER.uuid}#sharing`,
    );
  });

  it("says when a folder made here could not be made on the disk, and links to it", async () => {
    made(true);
    await sharedFolders({
      answers: {
        shareMgmtGetList: {
          status: 200,
          value: { total: 1, data: [{ ...FOLDER, status: "ENOENT" }] },
        },
      },
    });
    await screen.findByText(
      /was set up, but its folder could not be made on the disk\.$/,
    );
    expect(screen.getByRole("link", { name: "Open a4share" })).toHaveAttribute(
      "href",
      `/ui/storage/shared-folders/${FOLDER.uuid}`,
    );
  });

  it("marks a folder whose saved section is not applied, and nothing once nothing is pending", async () => {
    recordSaved(FOLDER.uuid, "access");
    await sharedFolders({
      answers: { systemGetInformation: pendingInfo(["sharedfolders"]) },
    });
    const row = await within(table()).findByRole("row", { name: /a4share/ });
    expect(await within(row).findByText("Not applied yet")).toBeInTheDocument();
  });

  it("shows no line and no mark for folders this session did not touch", async () => {
    await sharedFolders({
      answers: { systemGetInformation: pendingInfo(["sharedfolders"]) },
    });
    const row = await within(table()).findByRole("row", { name: /a4share/ });
    expect(within(row).queryByText("Not applied yet")).toBeNull();
    expect(screen.queryByText(/has not saved it yet/)).not.toBeInTheDocument();
  });
});
