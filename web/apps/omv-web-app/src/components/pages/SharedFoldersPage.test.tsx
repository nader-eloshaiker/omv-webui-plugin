// SPDX-License-Identifier: GPL-3.0-or-later
// Storage > Shared folders through the whole app on MSW serving the contract's examples: how the
// table's page, sort and search map to ShareMgmt.getList, the empty, filtered-empty, error and loading
// states, the problem count from a second read of every folder, backend text as text (UI-2), and a
// normal user kept off the page without a call (UI-4).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls, server } from "../../test/server.ts";

const FOLDER = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data[0];

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
    // The second read, of every folder, for the problem count.
    expect(
      seenCalls.some(
        (c) =>
          c.call === "ShareMgmt.getList" &&
          JSON.stringify(c.params) ===
            JSON.stringify({ start: 0, limit: null }),
      ),
    ).toBe(true);
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells[0]).toBe("a4share");
    expect(cells[1]).toBe("OK");
    expect(cells[2]).toBe("/dev/sda1");
    expect(cells[3]).toBe("a4share/");
    expect(cells[4]).toContain(
      "/srv/dev-disk-by-uuid-00000000-0000-4000-8000-000000000003/a4share/",
    );
    expect(cells[5]).toBe("Phase 0 A4");
    expect(cells[6]).toBe("No");
    expect(
      within(row).getByRole("button", { name: "Copy full path of a4share" }),
    ).toBeInTheDocument();
    expect(
      within(table()).getByRole("columnheader", { name: "Name" }),
    ).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByText("1–1 of 1")).toBeInTheDocument();
    expect(screen.getByText(/^In use: a network share/)).toBeInTheDocument();
    // Nothing is wrong, so there is no problem line.
    expect(screen.queryByText(/cannot be reached/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Add a shared folder (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/shared-folders/create");
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
    expect(
      screen.getByRole("link", {
        name: "Add a shared folder in the classic interface (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "/#/storage/shared-folders/create");
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
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
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
    expect(within(old).getAllByText("Not available")).toHaveLength(2);
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
    await screen.findByRole("heading", { level: 1, name: "Dashboard" });
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
        (c) => !/\.(get|is)/.test(c) && c !== "Zfs.listCompressionTypes",
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
    expect(callNames()).not.toContain("ShareMgmt.getList");
  });
});
