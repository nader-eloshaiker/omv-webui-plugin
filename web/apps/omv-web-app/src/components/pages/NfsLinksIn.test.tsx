// SPDX-License-Identifier: GPL-3.0-or-later
// How Linux and Unix sharing fits the other pages (phase 5 services design 12.1 to 12.3, 13): the
// dashboard's Services card row and its attention row lead to /services/nfs; the Shared folders list
// says "Linux and Unix (NFS)" for a folder with an entry, and "not known" when the entries cannot be
// read; the NFS menu item has its route here.
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nfsEntry, nfsMock } from "../../test/nfsAnswers.ts";
import { renderApp } from "../../test/renderApp.tsx";

const LONG = { timeout: 15_000 };
const FOLDER = CONTRACT_EXAMPLES.shareMgmtGetList.populated.value.data[0]!;

const nfsService = (running: boolean): FixedAnswer => ({
  status: 200,
  value: {
    total: 2,
    data: [
      { name: "nfs", title: "NFS", enabled: true, running },
      { name: "ssh", title: "SSH", enabled: true, running: true },
    ],
  },
});

describe("the dashboard (12.2)", () => {
  it("leads the NFS row of the Services card to Linux and Unix sharing", async () => {
    await renderApp({
      signedIn: true,
      answers: { servicesGetStatus: nfsService(true) },
    });
    const services = await screen.findByRole(
      "region",
      { name: "Services" },
      LONG,
    );
    expect(
      await within(services).findByRole("link", { name: "NFS" }, LONG),
    ).toHaveAttribute("href", "/ui/services/nfs");
  });

  it("leads the attention row for NFS on but not running there, not to the classic interface", async () => {
    await renderApp({
      signedIn: true,
      answers: { servicesGetStatus: nfsService(false) },
    });
    const link = await screen.findByRole(
      "link",
      { name: "Open Linux and Unix sharing" },
      LONG,
    );
    expect(link).toHaveAttribute("href", "/ui/services/nfs");
    expect(
      screen.queryByRole("link", { name: /Open NFS settings/u }),
    ).toBeNull();
  });
});

describe("the Shared folders list (12.1)", () => {
  it("says Linux and Unix (NFS) for a folder with an NFS entry", async () => {
    const nfs = nfsMock({
      shares: [nfsEntry(1, FOLDER.uuid, FOLDER.name)],
    });
    await renderApp({
      signedIn: true,
      path: "/storage/shared-folders",
      answers: { ...nfs.answers, shareMgmtGetList: "populated" },
    });
    const table = await screen.findByRole(
      "table",
      { name: "Shared folders" },
      LONG,
    );
    const cells = await within(table).findAllByText(
      "Linux and Unix (NFS)",
      {},
      LONG,
    );
    // Said once in the wide column and once under the name on a narrow screen, for that folder only.
    expect(cells).toHaveLength(2);
    expect(cells[0]?.closest("tr")).toHaveTextContent(FOLDER.name);
  }, 30_000);

  it("leaves the NFS part not known when the entries cannot be read", async () => {
    const nfs = nfsMock({ listFails: { status: 500, message: "Unreadable." } });
    await renderApp({
      signedIn: true,
      path: "/storage/shared-folders",
      answers: { ...nfs.answers, shareMgmtGetList: "populated" },
    });
    const table = await screen.findByRole(
      "table",
      { name: "Shared folders" },
      LONG,
    );
    expect(
      (
        await within(table).findAllByText(
          "Linux and Unix (NFS): not known",
          {},
          LONG,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("the menu (13)", () => {
  it("links NFS to its page here", async () => {
    await renderApp({ signedIn: true });
    const nav = await screen.findByRole("navigation", {}, LONG);
    expect(within(nav).getByRole("link", { name: "NFS" })).toHaveAttribute(
      "href",
      "/ui/services/nfs",
    );
  });
});
