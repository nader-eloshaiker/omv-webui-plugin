// SPDX-License-Identifier: GPL-3.0-or-later
// Services > Rsync > Rsync server, through the whole app on the remembering services mock (phase 5
// services design 9, 10; 0.3, 0.4, 0.8, 0.10; P13, P17): loading, each failed read, the state line in
// each state, turning it on (a save to the band) and off (a plain confirmation naming the folders), the
// folders offered with their words, offering a folder (defaults, the name rule and uniqueness ignoring
// case, the sign-in and its warning, who may connect, the password typed twice), changing one with a
// sign-in (the password asked again, cleared after the request whatever its result), the read-only case
// for several sign-ins, stopping, and no password in the query cache.
import type { Answers } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { describe, expect, it } from "vitest";
import type { ScenarioName } from "../../mocks/scenarios.ts";
import { SERVICES_FOLDERS } from "../../mocks/servicesScenarios.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames, seenCalls, server } from "../../test/server.ts";

const LONG = { timeout: 15_000 };
const NEW_OBJECT = "fa4b1c66-ef79-11e5-87a0-0002b3a176b4";
const PASSWORD = "EXAMPLE-PASSWORD";

async function tab(scenario: ScenarioName, answers: Answers = {}) {
  const app = await renderApp({
    signedIn: true,
    scenario,
    path: "/services/rsync/server",
    answers,
  });
  await screen.findByRole("heading", { level: 1, name: "Rsync" }, LONG);
  return app;
}

const sent = (call: string) =>
  seenCalls
    .filter((c) => c.call === call)
    .map((c) => c.params as Record<string, unknown>);

const table = async () =>
  (
    await screen.findAllByRole("region", { name: "Folders offered" }, LONG)
  )[0] as HTMLElement;

async function openOffer(user: Awaited<ReturnType<typeof tab>>["user"]) {
  await user.click(
    await screen.findByRole("button", { name: "Offer a folder…" }, LONG),
  );
  return screen.findByRole("dialog", {
    name: "Offer a folder to the rsync server",
  });
}

async function chooseFolder(
  user: Awaited<ReturnType<typeof tab>>["user"],
  dialog: HTMLElement,
  name: RegExp,
) {
  await user.click(within(dialog).getByRole("combobox", { name: "Folder" }));
  await user.click(await screen.findByRole("option", { name }));
}

async function rowActions(
  user: Awaited<ReturnType<typeof tab>>["user"],
  folder: string,
  action: "Change…" | "Stop offering…",
) {
  await user.click(
    await screen.findByRole("button", { name: `Actions for ${folder}` }, LONG),
  );
  await user.click(await screen.findByRole("menuitem", { name: action }));
}

describe("the rsync server tab (9)", () => {
  it("shows the tabs, the intro and the no-encryption warning, and links SSH and the classic settings", async () => {
    await tab("servicesNone");
    const tabs = screen.getByRole("navigation", { name: "Rsync pages" });
    expect(
      within(tabs).getByRole("link", { name: "Rsync server" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(tabs).getByRole("link", { name: "Copy jobs" }),
    ).toHaveAttribute("href", "/ui/services/rsync");
    expect(
      screen.getByText(
        "The rsync server does not encrypt. Files and passwords cross the network as they are. Use it only on a network you trust.",
      ),
    ).toBeVisible();
    const ssh = screen
      .getByText(/^Another computer can also copy files over SSH/u)
      .closest("p") as HTMLElement;
    expect(within(ssh).getByRole("link", { name: "SSH" })).toHaveAttribute(
      "href",
      "/ui/services/ssh",
    );
    expect(
      screen.getByRole("link", {
        name: /^Rsync server settings in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/services/rsync/server/settings");
  });

  it("says Loading while the settings are read", async () => {
    const { app } = await renderApp({
      signedIn: true,
      scenario: "servicesNone",
      path: "/",
    });
    // In front of the scenario's answers: the settings read never answers.
    server.use(
      http.post("*/rpc.php", async ({ request }) => {
        const body = (await request.clone().json()) as {
          service?: string;
          method?: string;
        };
        if (body.service === "Rsyncd" && body.method === "getSettings") {
          await delay("infinite");
        }
        return undefined;
      }),
    );
    await app.router.navigate({ to: "/services/rsync/server" });
    await waitFor(
      () => expect(screen.getByText("Loading the rsync server…")).toBeVisible(),
      LONG,
    );
    expect(screen.queryByRole("button", { name: "Turn on" })).toBeNull();
  });

  it("says it is off with no folder offered, and turns it on as a save to the band", async () => {
    const { user } = await tab("servicesNone");
    const line = await screen.findByText(
      "Off. No folder is offered to other computers over rsync.",
      {},
      LONG,
    );
    expect(line.parentElement).toHaveTextContent("Disabled");
    expect(screen.getByText("It listens on port 873.")).toBeVisible();
    expect(
      await screen.findByText(
        "No folder is offered to the rsync server yet.",
        {},
        LONG,
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(
      await screen.findByText(
        "The rsync server will turn on when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(sent("Rsyncd.setSettings")).toEqual([
      { enable: true, port: 873, extraoptions: "" },
    ]);
    expect(
      await screen.findByText(
        "Turned on. It starts when you apply the pending changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    const off = await screen.findByRole("button", { name: "Turn off…" });
    await waitFor(() => expect(off).toHaveFocus());
  }, 30_000);

  it("lists the folders offered with their address, access, sign-in and who may connect", async () => {
    await tab("servicesSome");
    expect(await screen.findByText("On.", {}, LONG)).toBeVisible();
    const region = await table();
    const rows = within(region).getAllByRole("row");
    expect(rows).toHaveLength(3);
    const media = rows.find((r) =>
      r.textContent?.includes("rsync://nas/media/"),
    );
    const photos = rows.find((r) =>
      r.textContent?.includes("rsync://nas/photos/"),
    );
    expect(media).toBeDefined();
    expect(photos).toBeDefined();
    expect(media).toHaveTextContent("Copy to and from it");
    expect(media).toHaveTextContent(
      "NoneAnyone who may connect can use it without a password.",
    );
    expect(media).toHaveTextContent("The computer at 192.0.2.10");
    expect(photos).toHaveTextContent("Copy from it (read only)");
    expect(photos).toHaveTextContent("Name and password: copier");
    expect(photos).toHaveTextContent("Any computer with the name and password");
    expect(
      within(region).getByRole("link", { name: "Open shared folder Media" }),
    ).toHaveAttribute(
      "href",
      `/ui/storage/shared-folders/${SERVICES_FOLDERS.media}`,
    );
    expect(
      within(region).getByRole("button", {
        name: "Copy the address of media",
      }),
    ).toBeVisible();
  });

  it("turns off after naming the folders offered, Cancel first", async () => {
    const { user } = await tab("servicesSome");
    await user.click(
      await screen.findByRole("button", { name: "Turn off…" }, LONG),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Turn off the rsync server?",
    });
    expect(dialog).toHaveTextContent(
      "2 folders are offered now (Media, Photos).",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    expect(callNames()).not.toContain("Rsyncd.setSettings");
    await user.click(within(dialog).getByRole("button", { name: "Turn off" }));
    expect(
      await screen.findByText(
        "The rsync server will turn off when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(sent("Rsyncd.setSettings")).toEqual([
      { enable: false, port: 873, extraoptions: "" },
    ]);
  }, 30_000);

  it("says when it is on but not running, with the system logs", async () => {
    await tab("servicesDown");
    const line = await screen.findByText(
      "On, but not running. Other computers cannot copy to or from this NAS. The system logs may say why.",
      {},
      LONG,
    );
    expect(line.parentElement).toHaveTextContent("Critical");
    expect(
      screen.getByRole("link", { name: "Open System logs" }),
    ).toHaveAttribute("href", "/ui/diagnostics/system-logs");
  });

  it("shows no switch when the settings cannot be read", async () => {
    await tab("servicesSome", {
      rsyncdGetSettings: { status: 500, message: "Settings unreadable." },
    });
    expect(
      await screen.findByText(
        "Could not read whether the rsync server is on.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Settings unreadable.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Turn/u })).toBeNull();
  });

  it("keeps the switch when only the folders cannot be read", async () => {
    await tab("servicesSome", {
      rsyncdGetModuleList: { status: 500, message: "Modules unreadable." },
    });
    expect(
      await screen.findByText(
        "Could not read the folders offered to the rsync server.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(screen.getByText("Modules unreadable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Turn off…" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Offer a folder…" }),
    ).toBeNull();
  });

  it("keeps a normal user off the page without a call", async () => {
    await renderApp({
      signedIn: true,
      scenario: "user",
      path: "/services/rsync/server",
    });
    expect(
      await screen.findByText(/only administrators/iu, {}, LONG),
    ).toBeVisible();
    expect(callNames()).not.toContain("Rsyncd.getSettings");
  });

  it("never holds a stored password in the query cache or the page", async () => {
    const { app, user } = await tab("servicesSome");
    await table();
    await rowActions(user, "Photos", "Change…");
    await screen.findByRole("dialog", {
      name: /^Change how .*Photos.* is offered$/u,
    });
    await screen.findByText("Password: Set", {}, LONG);
    const cache = JSON.stringify(
      app.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => q.state.data),
    );
    expect(cache).toContain("copier");
    expect(cache).not.toContain(PASSWORD);
    expect(markupOf()).not.toContain(PASSWORD);
  });
});

describe("offering a folder (10)", () => {
  it("opens with read only, a sign-in and any computer with it, and offers under the folder's name", async () => {
    const { app, user } = await tab("servicesSome");
    const dialog = await openOffer(user);
    expect(
      within(dialog).getByRole("radio", { name: "Copy from it (read only)" }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", {
        name: "Ask for a name and password",
      }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("radio", {
        name: "Any computer with the name and password",
      }),
    ).toBeChecked();
    expect(
      within(dialog).queryByRole("radio", {
        name: "Any computer that can reach the NAS",
      }),
    ).toBeNull();
    expect(dialog).toHaveTextContent(
      "Who can use it, on the folder's page, does not apply to the rsync server",
    );
    await user.click(within(dialog).getByRole("combobox", { name: "Folder" }));
    // Offered folders are not offered again.
    expect(screen.queryByRole("option", { name: /^Media/u })).toBeNull();
    await user.click(await screen.findByRole("option", { name: /^Backup/u }));
    const name = within(dialog).getByRole("textbox", { name: "Offered as" });
    expect(name).toHaveValue("Backup");
    expect(dialog).toHaveTextContent(
      "Other computers use this name: rsync://nas/Backup/.",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "copier2",
    );
    await user.type(
      within(dialog).getByLabelText("Password", { selector: "input" }),
      "pw-Q7xz",
    );
    await user.type(
      within(dialog).getByLabelText("Type it again", { selector: "input" }),
      "other",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    expect(
      await within(dialog).findByText("The two passwords are not the same."),
    ).toBeVisible();
    expect(callNames()).not.toContain("Rsyncd.setModule");
    const again = within(dialog).getByLabelText("Type it again", {
      selector: "input",
    });
    await user.clear(again);
    await user.type(again, "pw-Q7xz");
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    expect(
      await screen.findByText(
        /^.?Backup.? will be offered as .?Backup.? when you apply the changes\.$/u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(sent("Rsyncd.setModule")).toEqual([
      {
        uuid: NEW_OBJECT,
        enable: true,
        sharedfolderref: SERVICES_FOLDERS.backup,
        name: "Backup",
        comment: "",
        uid: "nobody",
        gid: "users",
        readonly: true,
        writeonly: false,
        maxconnections: 0,
        list: true,
        hostsallow: "",
        hostsdeny: "",
        authusers: true,
        usechroot: true,
        users: [{ name: "copier2", password: "pw-Q7xz" }],
        extraoptions: "",
      },
    ]);
    const region = await table();
    await waitFor(() =>
      expect(region).toHaveTextContent("rsync://nas/Backup/"),
    );
    expect(
      within(region)
        .getAllByRole("row")
        .find((r) => r.textContent?.includes("rsync://nas/Backup/")),
    ).toHaveTextContent("Not applied yet");
    // The typed password is nowhere once the request is over.
    expect(markupOf()).not.toContain("pw-Q7xz");
    expect(
      JSON.stringify(
        app.queryClient
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      ),
    ).not.toContain("pw-Q7xz");
  }, 40_000);

  it("refuses a name outside the rule and one taken, ignoring case", async () => {
    const { user } = await tab("servicesSome");
    const dialog = await openOffer(user);
    await chooseFolder(user, dialog, /^Holiday Photos/u);
    const name = within(dialog).getByRole("textbox", { name: "Offered as" });
    // "Holiday Photos" has a space: no name is proposed (D8).
    expect(name).toHaveValue("");
    await user.type(name, "My Photos");
    await user.tab();
    expect(
      within(dialog).getByText(
        'Use 1 to 64 letters, digits, ".", "_" or "-", starting with a letter or digit.',
      ),
    ).toBeVisible();
    await user.clear(name);
    await user.type(name, "MEDIA");
    await user.tab();
    expect(
      within(dialog).getByText(
        "Another folder is offered as MEDIA. Choose another name.",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    expect(callNames()).not.toContain("Rsyncd.setModule");
  });

  it("without a sign-in warns, offers no 'any computer', and needs one computer or network", async () => {
    const { user } = await tab("servicesSome");
    const dialog = await openOffer(user);
    await chooseFolder(user, dialog, /^Backup/u);
    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Ask for a name and password",
      }),
    );
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        /Without a name and password, every computer allowed below can copy from .?Backup.? over rsync\./u,
      ),
    );
    // One sentence: the folder's name sits inside it, not on a line of its own.
    const warning = within(dialog)
      .getByText(/^Without a name and password/u)
      .closest("span") as HTMLElement;
    expect(warning).toHaveTextContent(
      /^Without a name and password, every computer allowed below can copy from .?Backup.? over rsync\.$/u,
    );
    expect(within(warning).getByText("Backup").tagName).toBe("BDI");
    expect(
      within(dialog).queryByRole("radio", {
        name: "Any computer with the name and password",
      }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("radio", {
        name: "Any computer that can reach the NAS",
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("radio", { name: "One computer" }),
    ).toBeChecked();
    expect(within(dialog).queryByLabelText("Type it again")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    expect(
      await within(dialog).findByText(
        "Write one address, such as 192.0.2.10, or one computer name.",
      ),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Network" }),
      "192.0.2.5/24",
    );
    await user.tab();
    expect(
      await within(dialog).findByText(
        "192.0.2.5/24 is not the start of a network. Did you mean 192.0.2.0/24?",
      ),
    ).toBeVisible();
    const network = within(dialog).getByRole("textbox", { name: "Network" });
    await user.clear(network);
    await user.type(network, "192.0.2.0/24");
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    await waitFor(() => expect(sent("Rsyncd.setModule")).toHaveLength(1));
    expect(sent("Rsyncd.setModule")[0]).toMatchObject({
      authusers: false,
      users: [],
      hostsallow: "192.0.2.0/24",
      readonly: true,
    });
  }, 30_000);

  it("says the rsync server is off and offering does not turn it on", async () => {
    const { user } = await tab("servicesNone");
    const dialog = await openOffer(user);
    expect(dialog).toHaveTextContent(
      "The rsync server is off. Offering a folder does not turn it on.",
    );
  });

  it("shows OMV's refusal of a name taken elsewhere", async () => {
    const { user } = await tab("servicesSome", {
      rsyncdSetModule: "nameTaken",
    });
    const dialog = await openOffer(user);
    await chooseFolder(user, dialog, /^Backup/u);
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "a");
    await user.type(
      within(dialog).getByLabelText("Password", { selector: "input" }),
      "pw",
    );
    await user.type(
      within(dialog).getByLabelText("Type it again", { selector: "input" }),
      "pw",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Offer folder" }),
    );
    expect(
      await within(dialog).findByText("The folder was not offered.", {}, LONG),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("is not unique");
    // Cleared after the request, whatever its result.
    expect(
      within(dialog).getByLabelText("Password", { selector: "input" }),
    ).toHaveValue("");
    expect(
      within(dialog).getByLabelText("Type it again", { selector: "input" }),
    ).toHaveValue("");
  }, 30_000);
});

describe("changing and stopping (10.2, 10.4)", () => {
  it("asks for the password again, and clears it after a failed request", async () => {
    const { user } = await tab("servicesSome", {
      rsyncdSetModule: { status: 500, message: "Saving refused." },
    });
    await table();
    await rowActions(user, "Photos", "Change…");
    const dialog = await screen.findByRole("dialog", {
      name: /^Change how .*Photos.* is offered$/u,
    });
    expect(
      await within(dialog).findByText("Password: Set", {}, LONG),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("textbox", { name: "Offered as" }),
    ).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "copier",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("Enter the password."),
    ).toBeVisible();
    expect(callNames()).not.toContain("Rsyncd.setModule");
    const field = within(dialog).getByLabelText("Password", {
      selector: "input",
    });
    expect(field).toHaveValue("");
    await user.type(field, "retyped");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("The changes were not saved.", {}, LONG),
    ).toBeVisible();
    expect(within(dialog).getByText("Saving refused.")).toBeVisible();
    expect(sent("Rsyncd.setModule")[0]).toMatchObject({
      name: "photos",
      users: [{ name: "copier", password: "retyped" }],
    });
    expect(
      within(dialog).getByLabelText("Password", { selector: "input" }),
    ).toHaveValue("");
    expect(markupOf()).not.toContain("retyped");
  }, 30_000);

  it("saves a change with the password typed again, and Change asks for a new one twice", async () => {
    const { user } = await tab("servicesSome");
    await table();
    await rowActions(user, "Photos", "Change…");
    const dialog = await screen.findByRole("dialog", {
      name: /^Change how .*Photos.* is offered$/u,
    });
    await within(dialog).findByText("Password: Set", {}, LONG);
    await user.click(within(dialog).getByRole("button", { name: "Change" }));
    await user.type(
      within(dialog).getByLabelText("New password", { selector: "input" }),
      "newer",
    );
    await user.type(
      within(dialog).getByLabelText("Type it again", { selector: "input" }),
      "newer",
    );
    await user.click(
      within(dialog).getByRole("radio", { name: "Copy to and from it" }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        /^The changes to how .?Photos.? is offered are saved\. Apply them to use them\.$/u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(sent("Rsyncd.setModule")[0]).toMatchObject({
      uuid: expect.not.stringMatching(NEW_OBJECT) as unknown,
      name: "photos",
      readonly: false,
      writeonly: false,
      authusers: true,
      users: [{ name: "copier", password: "newer" }],
    });
  }, 30_000);

  it("opens a folder with several sign-ins read-only, with the classic link", async () => {
    const { user } = await tab("modulesMany");
    expect(await table()).toHaveTextContent(
      "3 sign-ins (set in the classic interface)",
    );
    await rowActions(user, "Backup", "Change…");
    const dialog = await screen.findByRole("dialog", {
      name: /^Change how .*Backup.* is offered$/u,
    });
    expect(
      await within(dialog).findByText(
        "This folder has 3 sign-ins set in the classic interface. Change it there.",
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("link", {
        name: /^Rsync server folders in the classic interface/u,
      }),
    ).toHaveAttribute("href", "/#/services/rsync/server/modules");
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).queryByLabelText("Password")).toBeNull();
  });

  it("stops offering after a plain confirmation that names the address and the sign-in", async () => {
    const { user } = await tab("servicesSome");
    await table();
    await rowActions(user, "Photos", "Stop offering…");
    const dialog = await screen.findByRole("alertdialog", {
      name: /^Stop offering .*Photos.* to the rsync server\?$/u,
    });
    expect(dialog).toHaveTextContent(
      "After the changes are applied, other computers cannot reach rsync://nas/photos/.",
    );
    expect(dialog).toHaveTextContent(
      "Its name and password are removed with it.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    await user.click(
      within(dialog).getByRole("button", { name: "Stop offering" }),
    );
    expect(
      await screen.findByText(
        /^.?Photos.? will stop being offered when you apply the changes\.$/u,
        {},
        LONG,
      ),
    ).toBeVisible();
    expect(sent("Rsyncd.deleteModule")).toHaveLength(1);
    const region = await table();
    await waitFor(() =>
      expect(region).not.toHaveTextContent("rsync://nas/photos/"),
    );
  }, 30_000);
});
