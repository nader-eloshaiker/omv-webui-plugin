// SPDX-License-Identifier: GPL-3.0-or-later
// Services > NFS, "Linux and Unix sharing", through the whole app on MSW (phase 5 services design 1;
// P10 to P12, P17): loading, each failed read, the state line in each state, turning it on (a save to
// the band, refused with no version chosen) and off (a plain confirmation naming the folders), the
// entries grouped by folder with their words, addresses and notes, sharing a folder from the dialog
// (its folder choice with the refused folders, turning NFS on in the same save), backend text as text,
// and a normal user kept off the page without a call. The NFS answers remember (test/nfsAnswers.ts).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { SharedFolder } from "@omv-webui/react-api-omv/generated";
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import { nfsEntry, nfsMock, type NfsMockState } from "../../test/nfsAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames, seenCalls, server } from "../../test/server.ts";

const LONG = { timeout: 15_000 };
const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const BASE = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value
  .data[0] as SharedFolder;
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${(0x200 + n).toString(16).padStart(12, "0")}`;
const sharedFolder = (
  n: number,
  name: string,
  over: Partial<SharedFolder> = {},
): SharedFolder => ({
  ...BASE,
  uuid: uuid(n),
  name,
  comment: "",
  reldirpath: `${name}/`,
  description: `${name} [on /dev/sdb1, ${name}/]`,
  status: "OK",
  ...over,
});
const PHOTOS = sharedFolder(1, "Photos");
const MEDIA = sharedFolder(2, "Media");
const HOLIDAY = sharedFolder(3, "Holiday", { reldirpath: "Holiday Photos/" });
const MISSING = sharedFolder(4, "Gone", { status: "Missing" });
const FOLDERS = [PHOTOS, MEDIA, HOLIDAY, MISSING];
const NAMES = Object.fromEntries(FOLDERS.map((f) => [f.uuid, f.name]));

const folderList = (folders: SharedFolder[]) => ({
  status: 200,
  value: { total: folders.length, data: folders },
});

async function page(
  start: Partial<NfsMockState> = {},
  answers: Answers = {},
  scenario: "admin" | "user" = "admin",
) {
  const nfs = nfsMock({ names: NAMES, ...start });
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/services/nfs",
    answers: {
      ...nfs.answers,
      servicesGetStatus: nfs.servicesGetStatus,
      shareMgmtGetList: folderList(FOLDERS),
      ...answers,
    },
  });
  nfs.attach(app.mock);
  if (scenario === "admin") {
    await screen.findByRole(
      "heading",
      { level: 1, name: "Linux and Unix sharing" },
      LONG,
    );
  }
  return { ...app, nfs };
}

const paramsOf = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);

/** Two entries for Media, one for Photos with options set in the classic interface. */
const SOME = () => [
  nfsEntry(1, MEDIA.uuid, "Media", { client: "192.0.2.10", options: "rw" }),
  nfsEntry(2, MEDIA.uuid, "Media", { client: "192.0.2.0/24", options: "ro" }),
  nfsEntry(3, PHOTOS.uuid, "Photos", {
    client: "*",
    options: "ro",
    extraoptions: "subtree_check,insecure,no_root_squash",
  }),
];

describe("Linux and Unix sharing", () => {
  it("says it is loading while the settings are on their way", async () => {
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as {
          service?: string;
          method?: string;
        };
        if (body.service === "NFS" && body.method === "getSettings") {
          await delay("infinite");
        }
        return undefined;
      }),
    );
    await renderApp({
      signedIn: true,
      path: "/services/nfs",
      answers: nfsMock().answers,
    });
    expect(
      await screen.findByText("Loading Linux and Unix sharing…", {}, LONG),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Turn/u })).toBeNull();
  });

  it("says it is off, and turns it on as a save to the band, keeping the versions", async () => {
    const { user } = await page({ enable: false, running: false });
    const line = await screen.findByText(
      "Off. No folder can be reached over NFS.",
      {},
      LONG,
    );
    expect(line.parentElement).toHaveTextContent("Disabled");
    expect(screen.getByText("Linux and Unix sharing is off.")).toBeVisible();
    expect(
      screen.getByText("NFS versions offered: NFSv3, NFSv4, NFSv4.1, NFSv4.2."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "No folder is shared with Linux and Unix computers yet. Share one here, or from its own page.",
      ),
    ).toBeVisible();
    const button = screen.getByRole("button", { name: "Turn on" });
    await user.click(button);
    expect(
      await screen.findByText(
        "Linux and Unix sharing will turn on when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("NFS.setSettings")).toEqual([
      { enable: true, versions: ["3", "4", "4.1", "4.2"] },
    ]);
    expect(
      await screen.findByText(
        "Turned on. It starts when you apply the pending changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    // 1.6: focus stays on the switch, now showing the other verb.
    const after = await screen.findByRole("button", { name: "Turn off…" });
    await waitFor(() => expect(after).toHaveFocus());
  }, 30_000);

  it("refuses to turn it on while no NFS version is chosen", async () => {
    const { user } = await page({
      enable: false,
      running: false,
      versions: [],
    });
    const button = await screen.findByRole("button", { name: "Turn on" }, LONG);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(
      "No NFS version is chosen, so it cannot be turned on. Choose them in the classic interface.",
    );
    await user.click(button);
    expect(callNames()).not.toContain("NFS.setSettings");
  });

  it("lists the entries grouped by folder, with their words, addresses and notes", async () => {
    await page({ shares: SOME() });
    expect(await screen.findByText("On.", {}, LONG)).toBeVisible();
    const table = screen.getByRole("region", { name: "Shared folders" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    // The folder named and linked on its first row only.
    expect(
      within(rows[0]!).getByRole("link", { name: "Open shared folder Media" }),
    ).toHaveAttribute("href", `/ui/storage/shared-folders/${MEDIA.uuid}`);
    expect(within(rows[1]!).queryByRole("link")).toBeNull();
    expect(rows[0]).toHaveTextContent("The computer at 192.0.2.10");
    expect(rows[0]).toHaveTextContent("Read and write");
    expect(rows[0]).toHaveTextContent("nas:/export/Media");
    expect(rows[0]).toHaveTextContent("NFSv4nas:/Media");
    expect(rows[1]).toHaveTextContent("Computers on 192.0.2.0/24");
    expect(rows[1]).toHaveTextContent("Read only");
    expect(rows[1]).not.toHaveTextContent("nas:/export");
    expect(rows[2]).toHaveTextContent("Any computer that can reach the NAS");
    expect(rows[2]).toHaveTextContent(
      "Its administrator acts as the NAS's administrator",
    );
    expect(rows[2]).toHaveTextContent(
      "Other NFS options set in the classic interface",
    );
    expect(
      within(rows[0]!).getByRole("button", {
        name: "Copy the NFS address of Media",
      }),
    ).toBeVisible();
    expect(
      within(rows[0]!).getByRole("button", {
        name: "Copy the NFSv4 address of Media",
      }),
    ).toBeVisible();
  });

  it("shows only the export address when no NFSv4 version is offered", async () => {
    await page({ shares: SOME().slice(0, 1), versions: ["3"] });
    const table = await screen.findByRole(
      "region",
      { name: "Shared folders" },
      LONG,
    );
    expect(table).toHaveTextContent("nas:/export/Media");
    expect(table).not.toHaveTextContent("NFSv4");
  });

  it("shows values set in the classic interface, and markup, as text", async () => {
    await page({
      shares: [
        nfsEntry(1, MEDIA.uuid, "Media", {
          client: '<img src=x onerror="alert(1)">',
          options: "rw,sync",
        }),
      ],
    });
    const table = await screen.findByRole(
      "region",
      { name: "Shared folders" },
      LONG,
    );
    expect(table).toHaveTextContent(
      '<img src=x onerror="alert(1)"> (set in the classic interface)',
    );
    expect(table).toHaveTextContent("rw,sync (set in the classic interface)");
    expect(table.querySelector("img")).toBeNull();
  });

  it("turns off after naming the folders that stop being reachable", async () => {
    const { user } = await page({ shares: SOME() });
    await user.click(
      await screen.findByRole("button", { name: "Turn off…" }, LONG),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Turn off Linux and Unix sharing?",
    });
    expect(dialog).toHaveTextContent(
      "2 folders are shared now (Media, Photos).",
    );
    expect(dialog).toHaveTextContent(
      "Computers that use these folders may stop responding until they are told the folders are gone. Close their files first.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("NFS.setSettings");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    expect(
      await screen.findByText(
        "Linux and Unix sharing will turn off when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("NFS.setSettings")).toEqual([
      { enable: false, versions: ["3", "4", "4.1", "4.2"] },
    ]);
    expect(
      await screen.findByRole("button", { name: "Turn on" }, LONG),
    ).toBeVisible();
  }, 30_000);

  it("says when no folder is shared in the turn-off confirmation", async () => {
    const { user } = await page();
    await user.click(
      await screen.findByRole("button", { name: "Turn off…" }, LONG),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "Turn off Linux and Unix sharing?",
      }),
    ).toHaveTextContent(
      "No folder is shared over NFS now. Turning it off stops the NFS service.",
    );
  });

  it("says when it is on but not running, with the service details", async () => {
    await page({ running: false });
    const line = await screen.findByText(
      "On, but not running. Folders shared over NFS cannot be reached. The NFS service details may say why.",
      {},
      LONG,
    );
    expect(line.parentElement).toHaveTextContent("Critical");
    expect(
      screen.getByRole("link", { name: "Open the NFS service details" }),
    ).toHaveAttribute("href", "/ui/diagnostics/services/nfs");
  });

  it("shows no switch and no table when the settings cannot be read", async () => {
    await page(
      {},
      { nfsGetSettings: { status: 500, message: "Settings unreadable." } },
    );
    expect(
      await screen.findByText(
        "Could not read whether Linux and Unix sharing is on.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Settings unreadable.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Turn/u })).toBeNull();
    expect(screen.queryByRole("region", { name: "Shared folders" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("keeps the switch when only the entries cannot be read", async () => {
    await page({}, { nfsGetShareList: "folderGone" });
    expect(
      await screen.findByText(
        "Could not read the folders shared with Linux and Unix computers.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Failed to execute XPath query/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Turn off…" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Share a folder…" }),
    ).toBeNull();
  });

  it("names no folder it could not read, and offers no sharing without the folders", async () => {
    const { user } = await page(
      { shares: SOME() },
      { shareMgmtGetList: { status: 500, message: "Folders unreadable." } },
    );
    const table = await screen.findByRole(
      "region",
      { name: "Shared folders" },
      LONG,
    );
    expect(
      await within(table).findAllByText(
        "A shared folder this page could not read",
        {},
        LONG,
      ),
    ).toHaveLength(2);
    expect(within(table).queryByRole("link")).toBeNull();
    const add = screen.getByRole("button", { name: "Share a folder…" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    expect(add).toHaveAccessibleDescription(
      "Could not read the shared folders.",
    );
    await user.click(add);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("links what is shared now and the classic settings", async () => {
    await page();
    await screen.findByText("On.", {}, LONG);
    expect(
      screen.getByRole("link", { name: "What is shared now" }),
    ).toHaveAttribute("href", "/ui/diagnostics/services/nfs");
    expect(
      screen.getByRole("link", {
        name: /^NFS settings in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/services/nfs/settings");
  });

  it("keeps a normal user off the page without a call", async () => {
    await page({}, {}, "user");
    expect(
      await screen.findByText(/only administrators/iu, {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("NFS.getSettings");
    expect(callNames()).not.toContain("NFS.getShareList");
  });
});

describe("sharing a folder from this page (1.4)", () => {
  it("lists the folders with the refused ones unavailable, lets a computer in, and returns focus", async () => {
    const { user } = await page({ shares: SOME() });
    const add = await screen.findByRole(
      "button",
      { name: "Share a folder…" },
      LONG,
    );
    await user.click(add);
    const dialog = await screen.findByRole("dialog", {
      name: "Share a folder with Linux and Unix computers",
    });
    const folder = within(dialog).getByRole("combobox", { name: "Folder" });
    expect(folder).toHaveTextContent("Photos");
    await user.click(folder);
    const holiday = await screen.findByRole("option", { name: /^Holiday/u });
    expect(holiday).toHaveTextContent(
      "Its folder on the disk has a space in its name.",
    );
    expect(holiday).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: /^Gone/u })).toHaveTextContent(
      "It cannot be reached now.",
    );
    await user.click(screen.getByRole("option", { name: /^Media/u }));
    expect(
      within(dialog).getByRole("radio", { name: "One computer" }),
    ).toBeChecked();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Its address or name" }),
      "192.0.2.20",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Let them in" }),
    );
    expect(
      await screen.findByText(
        /Media.* is set to be shared with .*192\.0\.2\.20.*\. Apply the changes to share it\./u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(paramsOf("NFS.setShare")).toEqual([
      {
        uuid: NEW_OBJECT,
        sharedfolderref: MEDIA.uuid,
        mntentref: NEW_OBJECT,
        client: "192.0.2.20",
        options: "ro",
        extraoptions: "subtree_check,insecure",
        comment: "",
      },
    ]);
    expect(callNames()).not.toContain("NFS.setSettings");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Share a folder with Linux and Unix computers",
        }),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Share a folder…" }),
      ).toHaveFocus(),
    );
    const table = screen.getByRole("region", { name: "Shared folders" });
    expect(
      await within(table).findByText("192.0.2.20", {}, LONG),
    ).toBeVisible();
  }, 30_000);

  it("refuses a computer already let in to that folder, before any write", async () => {
    const { user } = await page({ shares: SOME() });
    await user.click(
      await screen.findByRole("button", { name: "Share a folder…" }, LONG),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Folder" }));
    await user.click(await screen.findByRole("option", { name: /^Media/u }));
    await user.click(
      within(dialog).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Network" }),
      "192.0.2.128/24",
    );
    await user.tab();
    expect(
      within(dialog).getByText(
        "192.0.2.128/24 is not the start of a network. Did you mean 192.0.2.0/24?",
      ),
    ).toBeVisible();
    const field = within(dialog).getByRole("textbox", { name: "Network" });
    await user.clear(field);
    await user.type(field, "192.0.2.0/24");
    await user.click(
      within(dialog).getByRole("button", { name: "Let them in" }),
    );
    await waitFor(
      () =>
        expect(dialog).toHaveTextContent(
          /192\.0\.2\.0\/24 may already use .*Media.*\. Change that entry instead\./u,
        ),
      LONG,
    );
    expect(callNames()).not.toContain("NFS.setShare");
  }, 30_000);

  it("turns NFS on in the same save when it is off", async () => {
    const { user } = await page({ enable: false, running: false });
    await user.click(
      await screen.findByRole("button", { name: "Share a folder…" }, LONG),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Linux and Unix sharing is off for the whole NAS. Saving this turns it on.",
      ),
    ).toBeVisible();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Its address or name" }),
      "media-player.example.org",
    );
    expect(
      within(dialog).getByText(
        "The NAS looks this name up when it starts NFS. If the name changes address later, the new address is not let in until NFS restarts.",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Let them in" }),
    );
    await waitFor(
      () => expect(paramsOf("NFS.setSettings")).toHaveLength(1),
      LONG,
    );
    expect(paramsOf("NFS.setSettings")[0]).toEqual({
      enable: true,
      versions: ["3", "4", "4.1", "4.2"],
    });
    expect(paramsOf("NFS.setShare")[0]).toMatchObject({
      sharedfolderref: PHOTOS.uuid,
      client: "media-player.example.org",
    });
    // setShare first, then setSettings.
    const order = callNames().filter((c) => c.startsWith("NFS.set"));
    expect(order).toEqual(["NFS.setShare", "NFS.setSettings"]);
  }, 30_000);
});
