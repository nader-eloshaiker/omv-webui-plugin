// SPDX-License-Identifier: GPL-3.0-or-later
// The SSH page's firewall line (phase 5 network design 13.4) through the whole app on MSW: shown with a
// link to the firewall page when the stored rules block SSH for every computer, and not otherwise.
import type { FixedAnswer } from "@omv-webui/react-api-omv/mocks";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../../test/renderApp.tsx";
import { callNames } from "../../test/server.ts";

const LONG = { timeout: 5000 };

const rule = (over: Record<string, unknown>) => ({
  uuid: "00000000-0000-4000-8000-000000000201",
  family: "inet",
  rulenum: 0,
  chain: "INPUT",
  action: "REJECT",
  source: "",
  sport: "",
  destination: "",
  dport: "22",
  protocol: "tcp",
  extraoptions: "",
  comment: "",
  ...over,
});

const rules = (list: unknown[]): FixedAnswer => ({ status: 200, value: list });

async function sshPage(list: unknown[]) {
  const view = await renderApp({
    signedIn: true,
    path: "/services/ssh",
    answers: { iptablesGetRules: () => rules(list) },
  });
  await screen.findByRole("checkbox", { name: "Turn on SSH" }, LONG);
  await waitFor(() => expect(callNames()).toContain("Iptables.getRules"), LONG);
  return view;
}

describe("the SSH page's firewall line (13.4)", () => {
  it("says the firewall blocks SSH for every computer, with a link to the rules", async () => {
    const { user } = await sshPage([rule({})]);
    expect(
      await screen.findByText(
        "The firewall blocks SSH for every computer.",
        { exact: false },
        LONG,
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Open the firewall rules" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Firewall rules" }, LONG),
    ).toBeInTheDocument();
  });

  it("says nothing when the rules block SSH for some computers only", async () => {
    await sshPage([rule({ source: "203.0.113.0/24" })]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(
      screen.queryByText("The firewall blocks SSH for every computer.", {
        exact: false,
      }),
    ).toBeNull();
  });
});
