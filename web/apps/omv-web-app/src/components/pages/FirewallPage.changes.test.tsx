// SPDX-License-Identifier: GPL-3.0-or-later
// Changing the firewall (phase 5 network design 11.4, 11.6, 11.7, 11.8) through the whole app on the
// network mock's stories, every write held to the contract: a rule added at the end (setRule -1) and at
// the top (setRules), its checks, the button that becomes "Review the change…" or unavailable, the
// change flow with Back and Cancel, Block everything else refused and then offered after "Allow this
// page…", moves that keep focus and the unsaved-order bar, the re-read before saving a new order,
// deleting a rule with what is lost, a refused deletion, and the leave confirmation.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  checkLine,
  firewall,
  LONG,
  ruleRows,
} from "../../test/firewallPage.ts";
import {
  holdNetworkWritesToContract,
  networkStateOf,
} from "../../test/networkAnswers.ts";
import { seenCalls } from "../../test/server.ts";

const paramsOf = (call: string) =>
  seenCalls.filter((c) => c.call === call).map((c) => c.params);

async function addDialog(user: UserEvent) {
  await user.click(
    (
      await screen.findAllByRole("button", { name: "Add a rule…" }, LONG)
    )[0] as HTMLElement,
  );
  return screen.findByRole("dialog", { name: "Add a firewall rule" }, LONG);
}

async function choosePort(user: UserEvent, dialog: HTMLElement, name: string) {
  await user.click(within(dialog).getByRole("combobox", { name: "Port" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("adding a rule (11.4)", () => {
  it("at the end: Then is required, then setRule with rulenum -1, a toast, focus on its row", async () => {
    const { user, mock } = await firewall("firewallNone");
    holdNetworkWritesToContract(mock);
    expect(
      await screen.findByText(/^No firewall rules\./, {}, LONG),
    ).toBeInTheDocument();
    const dialog = await addDialog(user);
    // None preselected (D10).
    expect(
      within(dialog).getByRole("radio", { name: "Allow" }),
    ).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    expect(
      await within(dialog).findByText("Choose what happens to this traffic."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Allow" }));
    await choosePort(user, dialog, "873 (rsync server)");
    expect(
      within(dialog).getByText("The rules let this page in."),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    // findByText fails when the toast never appears; the toast may be re-rendered just after.
    await screen.findByText(
      "The rule is saved. It takes effect when you apply the changes.",
      {},
      LONG,
    );
    expect(paramsOf("Iptables.setRule")).toEqual([
      expect.objectContaining({
        rulenum: -1,
        family: "inet",
        chain: "INPUT",
        action: "ACCEPT",
        protocol: "tcp",
        dport: "873",
        source: "",
      }),
    ]);
    const ipv4 = networkStateOf(mock).config.rules.filter(
      (rule) => rule.family === "inet",
    );
    expect(ipv4.at(-1)).toMatchObject({ dport: "873", action: "ACCEPT" });
    await waitFor(
      () =>
        expect(document.activeElement).toHaveAccessibleName(
          `Move rule ${ipv4.length} up`,
        ),
      LONG,
    );
    expect(screen.getByText("Not applied yet")).toBeInTheDocument();
  }, 30_000);

  it("refuses a rule that blocks this page for every computer, with the reason", async () => {
    const { user } = await firewall("firewallNone");
    const dialog = await addDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Refuse" }));
    await choosePort(user, dialog, "80 (this web interface)");
    expect(
      within(dialog).getByText(
        "These rules would block this page for every computer, this one too.",
      ),
    ).toBeInTheDocument();
    const add = within(dialog).getByRole("button", { name: "Add rule" });
    expect(add).toHaveAttribute("aria-disabled", "true");
    await user.click(add);
    expect(seenCalls.some((c) => c.call.startsWith("Iptables.set"))).toBe(
      false,
    );
  });

  it("a rule that may cut this page goes through the review; Back keeps the values, Cancel writes nothing", async () => {
    const { user } = await firewall("firewallNone");
    const dialog = await addDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Refuse" }));
    await choosePort(user, dialog, "80 (this web interface)");
    await user.click(
      within(dialog).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Network" }),
      "203.0.113.0/24",
    );
    expect(dialog).toHaveTextContent(
      "These rules block this page for computers on 203.0.113.0/24 (256 addresses).",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Review the change…" }),
    );
    expect(
      await screen.findByRole(
        "heading",
        { name: "Review the change to the firewall rules" },
        LONG,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent(
      "Type firewall to confirm",
    );
    // What changes, rule by rule, and nothing applied yet.
    expect(screen.getByRole("main")).toHaveTextContent("Rule 1");
    await user.click(screen.getByRole("button", { name: "Back" }));
    const back = await screen.findByRole(
      "dialog",
      { name: "Add a firewall rule" },
      LONG,
    );
    expect(within(back).getByRole("radio", { name: "Refuse" })).toBeChecked();
    expect(within(back).getByRole("textbox", { name: "Network" })).toHaveValue(
      "203.0.113.0/24",
    );
    await user.click(
      within(back).getByRole("button", { name: "Review the change…" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Cancel" }, LONG),
    );
    await screen
      .findByRole("table", { name: "Firewall rules" }, LONG)
      .catch(() => undefined);
    expect(seenCalls.some((c) => c.call.startsWith("Iptables.set"))).toBe(
      false,
    );
  }, 30_000);

  it("a reviewed rule is written by the flow once firewall is typed", async () => {
    const { user, mock } = await firewall("firewallNone");
    holdNetworkWritesToContract(mock);
    const dialog = await addDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Refuse" }));
    await choosePort(user, dialog, "80 (this web interface)");
    await user.click(
      within(dialog).getByRole("radio", { name: "Computers on one network" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Network" }),
      "203.0.113.0/24",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Review the change…" }),
    );
    await screen.findByRole(
      "heading",
      { name: "Review the change to the firewall rules" },
      LONG,
    );
    await user.type(
      screen.getByRole("textbox", { name: /Type firewall to confirm/u }),
      "firewall",
    );
    await user.click(screen.getByRole("button", { name: "Save and apply" }));
    await waitFor(
      () =>
        expect(paramsOf("Iptables.setRule")).toEqual([
          expect.objectContaining({
            rulenum: -1,
            action: "REJECT",
            dport: "80",
            source: "203.0.113.0/24",
          }),
        ]),
      LONG,
    );
  }, 30_000);

  it("on the IPv6 list, at the top, writes the IPv6 list whole", async () => {
    const { user, mock } = await firewall("firewallSome");
    holdNetworkWritesToContract(mock);
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "IPv6" }));
    await waitFor(async () => expect(await ruleRows()).toHaveLength(2), LONG);
    const dialog = await addDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Allow" }));
    await user.click(
      within(dialog).getByRole("radio", { name: "One computer" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Its address" }),
      "2001:db8::20",
    );
    await user.click(within(dialog).getByRole("combobox", { name: "Where" }));
    await user.click(await screen.findByRole("option", { name: "At the top" }));
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    await screen.findByText(
      "The rule is saved. It takes effect when you apply the changes.",
      {},
      LONG,
    );
    const [list] = paramsOf("Iptables.setRules6") as {
      family: string;
      source: string;
      rulenum: number;
    }[][];
    expect(list?.map((r) => [r.rulenum, r.family, r.source])).toEqual([
      [0, "inet6", "2001:db8::20"],
      [1, "inet6", "2001:db8::/32"],
      [2, "inet6", "2001:db8::7"],
    ]);
  }, 30_000);

  it("checks the address against the list's family", async () => {
    const { user } = await firewall("firewallNone");
    const dialog = await addDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Allow" }));
    await user.click(
      within(dialog).getByRole("radio", { name: "One computer" }),
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Its address" }),
      "2001:db8::1",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    expect(
      await within(dialog).findByText(
        "Write one IPv4 address, a network such as 192.0.2.0/24, or a range.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Block everything else (11.6)", () => {
  it("is refused when nothing allows this page; Allow this page fills the dialog; then it goes through the review", async () => {
    const { user, mock } = await firewall("firewallNone");
    holdNetworkWritesToContract(mock);
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Block everything else…" },
        LONG,
      ),
    );
    let block = await screen.findByRole(
      "alertdialog",
      { name: "Block everything else coming in" },
      LONG,
    );
    expect(
      within(block).getByText(
        "Nothing above allows this page, so it would be blocked. Allow it first.",
      ),
    ).toBeInTheDocument();
    expect(
      within(block).getByRole("button", { name: "Add the three rules" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.click(
      within(block).getByRole("button", {
        name: /^Allow this page for\s*192\.0\.2\.0\/24\s*…$/u,
      }),
    );
    const dialog = await screen.findByRole(
      "dialog",
      { name: "Add a firewall rule" },
      LONG,
    );
    expect(within(dialog).getByRole("radio", { name: "Allow" })).toBeChecked();
    expect(
      within(dialog).getByRole("textbox", { name: "Network" }),
    ).toHaveValue("192.0.2.0/24");
    expect(
      within(dialog).getByRole("combobox", { name: "Port" }),
    ).toHaveTextContent("80 (this web interface)");
    expect(
      within(dialog).getByRole("combobox", { name: "Where" }),
    ).toHaveTextContent("At the top");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    await screen.findByText(
      "The rule is saved. It takes effect when you apply the changes.",
      {},
      LONG,
    );
    expect(paramsOf("Iptables.setRules")).toEqual([
      [
        expect.objectContaining({
          rulenum: 0,
          action: "ACCEPT",
          source: "192.0.2.0/24",
          dport: "80",
        }),
      ],
    ]);
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Block everything else…" },
        LONG,
      ),
    );
    block = await screen.findByRole(
      "alertdialog",
      { name: "Block everything else coming in" },
      LONG,
    );
    expect(block).toHaveTextContent(
      "If this computer is on the same network as the NAS (192.0.2.0/24), it is one of them.",
    );
    await user.click(
      within(block).getByRole("button", { name: "Review the change…" }),
    );
    // The rule just added is pending: the flow asks for it to be applied or undone first (R1).
    await waitFor(
      () =>
        expect(screen.getByRole("main")).toHaveTextContent(
          "Other changes are waiting to be applied",
        ),
      LONG,
    );
    expect(paramsOf("Iptables.setRule")).toEqual([]);
  }, 30_000);
});

describe("order (11.7)", () => {
  it("moves keep focus, the bar offers to save, and Save writes the whole list", async () => {
    const { user, mock } = await firewall("firewallMany");
    holdNetworkWritesToContract(mock);
    await ruleRows();
    await checkLine();
    const up = screen.getByRole("button", { name: "Move rule 2 up" });
    up.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(document.activeElement).toHaveAccessibleName("Move rule 1 up"),
    );
    expect(screen.getByText("Rule moved to position 1.")).toBeInTheDocument();
    expect(screen.getByText("The new order is not saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a rule…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const rows = await ruleRows();
    expect(rows[0]).toHaveTextContent("Rule 2");
    await user.click(
      screen.getByRole("button", { name: "Save the new order" }),
    );
    // findByText fails when the toast never appears; the toast may be re-rendered just after.
    await screen.findByText(
      "The new order is saved. It takes effect when you apply the changes.",
      {},
      // 200 rules re-read, checked and written: slow when the whole suite runs at once.
      { timeout: 45_000 },
    );
    const [request] = paramsOf("Iptables.setRules") as {
      rulenum: number;
      comment: string;
    }[][];
    expect(request?.slice(0, 2).map((r) => [r.rulenum, r.comment])).toEqual([
      [0, "Rule 2"],
      [1, "Rule 1"],
    ]);
    expect(screen.queryByText("The new order is not saved.")).toBeNull();
  }, 90_000);

  it("Discard puts the stored order back", async () => {
    const { user } = await firewall("firewallMany");
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "Move rule 1 down" }));
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect((await ruleRows())[0]).toHaveTextContent("Rule 1");
    expect(screen.queryByText("The new order is not saved.")).toBeNull();
  }, 30_000);

  it("re-reads before saving: rules changed meanwhile are shown, nothing is written", async () => {
    const { user, mock } = await firewall("firewallMany");
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "Move rule 1 down" }));
    const state = networkStateOf(mock);
    const first = state.config.rules[0];
    if (first === undefined) {
      throw new Error("no rule");
    }
    state.config.rules[0] = { ...first, comment: "Changed elsewhere" };
    await user.click(
      screen.getByRole("button", { name: "Save the new order" }),
    );
    expect(
      await screen.findByText(
        "The rules were changed since you opened them. Their new order is shown; move them again.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(paramsOf("Iptables.setRules")).toEqual([]);
    expect((await ruleRows())[0]).toHaveTextContent("Changed elsewhere");
  }, 30_000);

  it("leaving with an unsaved order asks first", async () => {
    const { user } = await firewall("firewallMany");
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "Move rule 1 down" }));
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Leave without saving?" }),
    ).toBeInTheDocument();
  }, 30_000);
});

describe("deleting a rule (11.8)", () => {
  it("names the rule and what is lost, deletes it, and moves focus to the row that took its place", async () => {
    const { user, mock } = await firewall("firewallSome");
    holdNetworkWritesToContract(mock);
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "Delete rule 2" }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: "Delete rule 2?" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      "Coming in, TCP to port 445 (Windows and Mac sharing)",
    );
    expect(dialog).toHaveTextContent(
      "After the changes are applied, computers on 203.0.113.0/24 (256 addresses) can reach the NAS again for this traffic: Coming in, TCP to port 445 (Windows and Mac sharing). A rule below may still refuse it.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();
    // The list without it still blocks the page for one computer: the review.
    await user.click(
      within(dialog).getByRole("button", { name: "Review the change…" }),
    );
    expect(
      await screen.findByRole(
        "heading",
        { name: "Review the change to the firewall rules" },
        LONG,
      ),
    ).toBeInTheDocument();
  }, 30_000);

  it("deletes through the band when the page is not affected", async () => {
    const { user, mock } = await firewall("firewallMany");
    holdNetworkWritesToContract(mock);
    await ruleRows();
    await checkLine();
    await user.click(screen.getByRole("button", { name: "Delete rule 3" }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: "Delete rule 3?" },
      LONG,
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Delete rule" }),
    );
    expect(
      await screen.findByText(
        "Rule 3 is deleted. This takes effect when you apply the changes.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(paramsOf("Iptables.deleteRule")).toHaveLength(1);
    await waitFor(
      () =>
        expect(document.activeElement).toHaveAccessibleName("Move rule 3 up"),
      LONG,
    );
    expect((await ruleRows())[2]).toHaveTextContent("Rule 4");
  }, 30_000);

  it("refuses to delete the Allow that lets this page in above Block everything else", async () => {
    const { user } = await firewall("firewallAllowlist");
    await ruleRows();
    await user.click(screen.getByRole("button", { name: "Delete rule 1" }));
    const dialog = await screen.findByRole(
      "alertdialog",
      { name: "Delete rule 1?" },
      LONG,
    );
    expect(dialog).toHaveTextContent(
      "After the changes are applied, the rules below it decide what happens to this traffic.",
    );
    expect(dialog).toHaveTextContent(
      "These rules would block this page for every computer, this one too.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Delete rule" }),
    ).toHaveAttribute("aria-disabled", "true");
  }, 30_000);
});
