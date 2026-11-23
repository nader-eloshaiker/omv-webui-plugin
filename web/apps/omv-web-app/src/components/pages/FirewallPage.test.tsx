// SPDX-License-Identifier: GPL-3.0-or-later
// Network > Firewall (phase 5 network design 11) through the whole app on the network mock's stories:
// the check on each kind of list (none, some, an allow-list, rules from the classic interface, a list
// that blocks the page or its replies, 200 rules), the connection by name and at an unknown address,
// the rules in words with known ports named and classic values kept, the IPv6 list, the four states,
// hostile notes as text, and that nothing is written on load or shown to a normal user.
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NetworkScenarioName } from "../../mocks/networkScenarios.ts";
import {
  checkLine,
  firewall,
  LONG,
  ruleRows,
} from "../../test/firewallPage.ts";
import { renderApp } from "../../test/renderApp.tsx";
import { markupOf } from "../../test/secrets.ts";
import { callNames } from "../../test/server.ts";

describe("what the rules do to this page (11.5)", () => {
  it("no rules: the page is let in, the empty state offers a rule", async () => {
    await firewall("firewallNone");
    expect(await checkLine()).toHaveTextContent("The rules let this page in.");
    expect(
      screen.getByText(
        "No rules. Every computer that can reach the NAS can use all of its services.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No firewall rules. Every computer that can reach the NAS can use all of its services. Add a rule to refuse or allow traffic.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Add a rule…" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Block everything else…" }),
    ).toBeInTheDocument();
  });

  it("some rules: blocked for some computers, named, SSH as a line, ports by name", async () => {
    await firewall("firewallSome");
    const line = await checkLine();
    expect(line).toHaveAttribute("data-verdict", "blockedSome");
    expect(line).toHaveTextContent(
      "These rules block this page for the computer at 198.51.100.7. This page cannot tell whether this computer is one of them.",
    );
    expect(line).toHaveTextContent(
      "SSH: blocked for the computer at 198.51.100.7.",
    );
    expect(
      screen.getByText(
        "4 rules for traffic coming in and 0 for traffic going out. Traffic that no rule fits is let through.",
        { exact: false },
      ),
    ).toBeInTheDocument();
    const rows = await ruleRows();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Coming in, TCP to port 22 (SSH)");
    expect(rows[0]).toHaveTextContent(
      "Computers on 192.0.2.0/24 (256 addresses)",
    );
    expect(rows[1]).toHaveTextContent(
      "Coming in, TCP to port 445 (Windows and Mac sharing)",
    );
    expect(rows[2]).toHaveTextContent("Ignore");
    expect(rows[2]).toHaveTextContent("Coming in, any kind");
    expect(rows[3]).toHaveTextContent(
      "Coming in, UDP to port 53 (name servers)",
    );
    // Actions are words with neutral icons, not colours (D8).
    expect(rows[1]?.querySelector("svg")).toHaveClass("text-muted-foreground");
  });

  it("an allow-list lets only some in, with the same-network hint; Block everything else is not offered", async () => {
    await firewall("firewallAllowlist");
    const line = await checkLine();
    expect(line).toHaveAttribute("data-verdict", "onlySome");
    expect(line).toHaveTextContent(
      "These rules let only computers on 192.0.2.0/24 (256 addresses) open this page.",
    );
    expect(line).toHaveTextContent(
      "If this computer is on the same network as the NAS (192.0.2.0/24), it is one of them.",
    );
    const rows = await ruleRows();
    expect(rows[1]).toHaveTextContent("This NAS talking to itself");
    expect(rows[2]).toHaveTextContent("Replies to connections this NAS starts");
    expect(
      screen.queryByRole("button", { name: "Block everything else…" }),
    ).toBeNull();
  });

  it("rules from the classic interface are shown as set there; one it cannot read that only allows does not matter", async () => {
    await firewall("firewallClassic");
    // Rule 6 has other options, but it allows, and nothing else blocks the page.
    expect(await checkLine()).toHaveAttribute("data-verdict", "letIn");
    const rows = await ruleRows();
    expect(rows[0]).toHaveTextContent(
      "Every computer except computers on 192.0.2.0/24 (256 addresses)",
    );
    expect(rows[1]).toHaveTextContent("ports 8000 to 8100");
    expect(rows[1]).toHaveTextContent(
      "Computers from 198.51.100.10 to 198.51.100.20",
    );
    expect(rows[2]).toHaveTextContent(
      "Their port: 53 (set in the classic interface)",
    );
    expect(rows[3]).toHaveTextContent("!tcp (set in the classic interface)");
    expect(rows[4]).toHaveTextContent("Count only");
    expect(rows[5]).toHaveTextContent(
      "Other options: --match owner --uid-owner 0 (set in the classic interface)",
    );
  });

  it.each<[NetworkScenarioName, string]>([
    ["firewallBlocksPage", "in"],
    ["firewallBlocksReplies", "out"],
  ])("%s: the page is blocked for every computer", async (scenario) => {
    await firewall(scenario);
    const line = await checkLine();
    expect(line).toHaveAttribute("data-verdict", "blockedAll");
    expect(line).toHaveTextContent(
      "These rules would block this page for every computer, this one too.",
    );
  });

  it("200 rules: one table, every row, the page let in", async () => {
    await firewall("firewallMany");
    expect(await ruleRows()).toHaveLength(200);
    expect(await checkLine()).toHaveAttribute("data-verdict", "letIn");
  });

  it("opened by name, both lists are checked; IPv6 says nothing about another family", async () => {
    const { user } = await firewall("networkByName");
    await waitFor(
      () =>
        expect(screen.getByRole("main")).toHaveTextContent(
          "This page reaches the NAS by its name, nas.example.org, most likely through enp2s0.",
        ),
      LONG,
    );
    expect(await checkLine()).toHaveTextContent("The rules let this page in.");
    await user.click(screen.getByRole("button", { name: "IPv6" }));
    const line = await checkLine();
    expect(line).toHaveTextContent("The rules let this page in.");
    expect(line).not.toHaveTextContent("which these rules do not check");
  });

  it("at an address no interface reports, the page still checks the rules", async () => {
    await firewall("networkUnknown");
    await waitFor(
      () =>
        expect(screen.getByRole("main")).toHaveTextContent(
          "No interface of the NAS reports that address",
        ),
      LONG,
    );
    expect(await checkLine()).toHaveTextContent("The rules let this page in.");
  });
});

describe("the IPv6 list (P2)", () => {
  it("is a view on the page: its rules, and the line for a page on IPv4", async () => {
    const { user } = await firewall("firewallSome");
    await ruleRows();
    const ipv4 = screen.getByRole("button", { name: "IPv4" });
    expect(ipv4).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "IPv6" }));
    await waitFor(async () => expect(await ruleRows()).toHaveLength(2), LONG);
    const rows = await ruleRows();
    expect(rows[0]).toHaveTextContent("Coming in, TCP to port 8443");
    expect(rows[0]).toHaveTextContent(
      "Computers on 2001:db8::/32 (a very large number of addresses)",
    );
    expect(rows[1]).toHaveTextContent("Note in the log");
    expect(rows[1]).toHaveTextContent("ping (ICMP)");
    expect(await checkLine()).toHaveTextContent(
      "This page uses IPv4, which these rules do not check.",
    );
    expect(window.location.pathname).toBe("/ui/network/firewall");
    expect(callNames()).toContain("Iptables.getRules6");
  });
});

describe("states (11.9)", () => {
  it("loading shows its words, then the rules", async () => {
    await renderApp({
      scenario: "firewallSome",
      signedIn: true,
      path: "/network/firewall",
    });
    expect(
      await screen.findByText("Reading the firewall rules…", {}, LONG),
    ).toBeInTheDocument();
    expect(await ruleRows()).toHaveLength(4);
  });

  it("a failed read says so with the server's message, and no check or toolbar", async () => {
    await firewall("networkReadFailsFirewall");
    expect(
      await screen.findByText("Could not read the firewall rules.", {}, LONG),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Failed to execute XPath query '//system/network/iptables/rule'.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a rule…" })).toBeNull();
    expect(
      document.querySelector('main [data-slot="firewall-check"]'),
    ).toBeNull();
  });

  it("SSH settings that could not be read are not checked, and say so", async () => {
    await firewall("networkReadFailsPorts");
    expect(await checkLine()).toHaveTextContent(
      "Could not read the SSH settings, so SSH is not checked.",
    );
  });
});

describe("safety", () => {
  it("shows hostile notes as text", async () => {
    await firewall("networkHostile");
    const rows = await ruleRows();
    expect(rows[0]).toHaveTextContent('<img src=x onerror="alert(1)">');
    expect(document.querySelector("main img")).toBeNull();
    expect(document.querySelector("main script")).toBeNull();
    expect(markupOf()).not.toContain("<img src=");
  });

  it("calls nothing that changes state on load (UI-4)", async () => {
    await firewall("firewallSome");
    await ruleRows();
    await checkLine();
    expect(
      callNames().filter(
        (c) =>
          !/\.(get|is|enumerate)/u.test(c) && c !== "Zfs.listCompressionTypes",
      ),
    ).toEqual([]);
  });

  it("keeps a normal user off the page without asking the server", async () => {
    await renderApp({
      scenario: "user",
      signedIn: true,
      path: "/network/firewall",
    });
    expect(
      await screen.findByText(
        "Only administrators can open this page. Your account is a normal user account.",
        {},
        LONG,
      ),
    ).toBeInTheDocument();
    expect(callNames().some((c) => c.startsWith("Iptables."))).toBe(false);
  });
});
