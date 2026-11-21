// SPDX-License-Identifier: GPL-3.0-or-later
// Wiping a disk in the production build, under the snippet's headers (UI-1, Trusted Types enforced),
// on the contract's examples: the system disk and a RAID member refused in words, and a free disk wiped
// by keyboard alone through the checked dialog and the typed confirmation (phase 5 disks design 3).
// DiskMgmt.wipe is sent only after the typed name matches and the disk was read again. Any CSP or
// Trusted Types violation, console error, page error or request to another origin fails a test
// (support/fixtures.ts).
import { CONTRACT_EXAMPLES } from "@omv-webui/react-api-omv/examples";
import type { Page } from "@playwright/test";
import copy from "../src/locales/en/common.json" with { type: "json" };
import { expect, test } from "./support/fixtures.ts";

// Typed into the mock only; no real system is involved.
const PASSWORD = "not-a-real-password";
const WIPE_HANDLE = CONTRACT_EXAMPLES.diskMgmtWipe.started.value;

async function signIn(page: Page) {
  await page.goto("/ui/");
  await page.getByLabel(copy.signIn.username).fill("example-admin");
  await page.getByLabel(copy.signIn.password).fill(PASSWORD);
  await page.getByRole("button", { name: copy.signIn.submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: copy.dashboard.title }),
  ).toBeVisible();
}

/**
 * Answers on top of the shared mock: the RAID arrays (the default example is a mirror of sdb and sdc,
 * so the test VM's state, no array, is chosen where a disk must be free), and the end of the wipe task.
 * Every other call falls through to the shared mock.
 */
async function answerDisks(
  page: Page,
  arrays: "none" | "mirrors",
): Promise<string[]> {
  // Every call, in order, including those answered here (the shared mock sees only the rest).
  const calls: string[] = [];
  await page.route("**/rpc.php", async (route) => {
    const body = route.request().postDataJSON() as {
      service?: string;
      method?: string;
      params?: { filename?: string };
    } | null;
    const call = `${body?.service ?? ""}.${body?.method ?? ""}`;
    calls.push(call);
    const reply = (response: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ response, error: null }),
      });
    if (call === "MdMgmt.enumerateDevices") {
      await reply(CONTRACT_EXAMPLES.mdMgmtEnumerateDevices[arrays].value);
      return;
    }
    if (call === "Exec.getOutput" && body?.params?.filename === WIPE_HANDLE) {
      await reply(CONTRACT_EXAMPLES.execGetOutput.wipeFinished.value);
      return;
    }
    await route.fallback();
  });
  return calls;
}

const section = (page: Page) =>
  page.getByRole("region", { name: copy.wipe.title });

test("the system disk and a RAID member are refused in words, with no way round", async ({
  page,
  rpc,
}) => {
  await answerDisks(page, "mirrors");
  await signIn(page);
  await page.goto("/ui/storage/disks/nvme0n1");
  await expect(section(page).getByText(copy.wipe.blocked.system)).toBeVisible();
  const button = section(page).getByRole("button", { name: copy.wipe.open });
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.goto("/ui/storage/disks/sdb");
  await expect(
    section(page).getByText(
      "It is part of the RAID array nas:0. Wiping it would damage the array.",
    ),
  ).toBeVisible();
  await expect(
    section(page).getByRole("button", { name: copy.wipe.open }),
  ).toHaveAttribute("aria-disabled", "true");
  // The only link leads to where the array is managed, never to a wipe without these checks (P3).
  for (const href of await section(page)
    .getByRole("link")
    .evaluateAll((links) => links.map((l) => l.getAttribute("href")))) {
    expect(href).toBe("/#/storage/md");
  }
  expect(rpc.calls).not.toContain("DiskMgmt.wipe");
});

test("a free disk is wiped by keyboard alone, after the check and the typed name", async ({
  page,
  rpc,
}) => {
  const calls = await answerDisks(page, "none");
  await signIn(page);
  await page.goto("/ui/storage/disks/sdb");
  const open = section(page).getByRole("button", { name: copy.wipe.open });
  await expect(open).toHaveAttribute("aria-disabled", "false");
  await open.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
    "Wipe disk /dev/sdb?",
  );
  await expect(dialog).toContainText("Serial number EXAMPLE-SERIAL-0003");
  await expect(
    dialog.getByRole("button", { name: copy.wipe.cancel }),
  ).toBeFocused();
  // The buttons follow the content, as in every confirmation: Wipe disk (still unavailable), then
  // round to the method (one tab stop) and the typed field.
  const confirm = dialog.getByRole("button", { name: copy.wipe.confirm });
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("radio", { name: copy.wipe.quick }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const field = dialog.getByRole("textbox", {
    name: "Type /dev/sdb to confirm.",
  });
  await expect(field).toBeFocused();
  await page.keyboard.type("/dev/sdb");
  // Enter in the field confirms nothing.
  await page.keyboard.press("Enter");
  expect(rpc.calls).not.toContain("DiskMgmt.wipe");
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: copy.wipe.cancel }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await expect(confirm).toHaveAttribute("aria-disabled", "false");
  const before = calls.length;
  await page.keyboard.press("Enter");

  await expect(section(page).getByText("/dev/sdb was wiped.")).toBeVisible();
  const after = calls.slice(before);
  const wipeAt = after.indexOf("DiskMgmt.wipe");
  expect(wipeAt).toBeGreaterThan(0);
  expect(after.slice(0, wipeAt)).toEqual(
    expect.arrayContaining([
      "DiskMgmt.getList",
      "FileSystemMgmt.getList",
      "FileSystemMgmt.enumerateFilesystems",
      "MdMgmt.enumerateDevices",
    ]),
  );
  expect(rpc.calls.filter((c) => c === "DiskMgmt.wipe")).toHaveLength(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
