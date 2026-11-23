// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecoveryCard, type RecoverySteps } from "./recovery-card";

const copy = {
  copiedLabel: "Copied",
  selectedLabel: "Selected. Press Ctrl+C to copy.",
};

const allSteps = (onTryAgain = () => undefined): RecoverySteps => ({
  wait: {
    text: "Wait two minutes, then try again.",
    tryAgainLabel: "Try again",
    onTryAgain,
  },
  newAddress: {
    url: "http://192.0.2.20/ui/",
    text: (url) => <>Open the NAS at its new address: {url}</>,
    copyLabel: "Copy the new address",
    note: "This computer must be on the same network as the new address.",
  },
  find: {
    name: "nas",
    url: "http://nas.local/ui/",
    text: ({ name, url }) => (
      <>
        Find the NAS&apos;s address under the name {name}. You can also try{" "}
        {url}.
      </>
    ),
    copyLabel: "Copy http://nas.local/ui/",
  },
  newName: {
    url: "http://backup-nas/ui/",
    address: "http://192.0.2.10/ui/",
    text: ({ url, address }) => (
      <>
        Open the NAS by its new name: {url}, or at its address {address}.
      </>
    ),
    urlCopyLabel: "Copy the address with the new name",
    addressCopyLabel: "Copy the address",
  },
  firewall: {
    text: "If a firewall rule blocks this computer, use a computer the rules still let in, then change the rules.",
  },
  console: {
    intro:
      "If nothing else works, connect a screen and keyboard to the NAS, sign in as root, and:",
    commands: [
      {
        id: "firstaid",
        command: "omv-firstaid",
        text: (command) => (
          <>type {command} and choose Configure network interface.</>
        ),
      },
    ],
  },
  note: {
    text: "The note you copied before applying has the settings that worked.",
  },
});

describe("RecoveryCard", () => {
  it("announces its title once, assertively, and lists the steps in order", () => {
    render(
      <RecoveryCard
        variant="lost"
        title="This page cannot reach the NAS since the change."
        steps={allSteps()}
        copy={copy}
        newTabLabel="(opens in a new tab)"
      />,
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(
      "This page cannot reach the NAS since the change.",
    );
    const card = screen.getByRole("region", {
      name: "This page cannot reach the NAS since the change.",
    });
    const steps = within(card).getAllByRole("listitem");
    expect(
      steps
        .filter((step) => step.hasAttribute("data-step"))
        .map((step) => step.getAttribute("data-step")),
    ).toEqual([
      "wait",
      "newAddress",
      "find",
      "newName",
      "firewall",
      "console",
      "note",
    ]);
  });

  it("shows only the steps it is given", () => {
    const steps = allSteps();
    render(
      <RecoveryCard
        variant="unknownAddress"
        title="The NAS may have been given a new address by your router."
        steps={{ wait: steps.wait, find: steps.find, console: steps.console }}
        copy={copy}
        newTabLabel="(opens in a new tab)"
      />,
    );
    expect(
      Array.from(document.querySelectorAll("[data-step]")).map((step) =>
        step.getAttribute("data-step"),
      ),
    ).toEqual(["wait", "find", "console"]);
  });

  it("is not live where it is read ahead of time", () => {
    render(
      <RecoveryCard
        variant="lost"
        title="This page cannot reach the NAS since the change."
        steps={allSteps()}
        copy={copy}
        newTabLabel="(opens in a new tab)"
        announce={false}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows values as text with copy buttons, commands as code, and no link unless given", () => {
    render(
      <RecoveryCard
        variant="newFails"
        title="The NAS does not open at its new address."
        steps={allSteps()}
        copy={copy}
        newTabLabel="(opens in a new tab)"
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Copy the new address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy http://nas.local/ui/" }),
    ).toBeInTheDocument();
    const command = screen.getByText("omv-firstaid");
    expect(command.tagName).toBe("CODE");
    expect(screen.queryByRole("button", { name: /omv-firstaid/ })).toBeNull();
  });

  it("links only the address the caller passes", () => {
    const steps = allSteps();
    render(
      <RecoveryCard
        variant="newFails"
        title="The NAS does not open at its new address."
        steps={{
          newAddress: steps.newAddress && {
            ...steps.newAddress,
            link: {
              href: "http://192.0.2.20/ui/",
              label: "Open the NAS at its new address",
            },
          },
        }}
        copy={copy}
        newTabLabel="(opens in a new tab)"
      />,
    );
    const link = screen.getByRole("link", {
      name: /^Open the NAS at its new address ?\(opens in a new tab\)$/,
    });
    expect(link).toHaveAttribute("href", "http://192.0.2.20/ui/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("needs no network: Try again calls back, and nothing is fetched", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onTryAgain = vi.fn();
    render(
      <RecoveryCard
        variant="lost"
        title="This page cannot reach the NAS since the change."
        steps={allSteps(onTryAgain)}
        copy={copy}
        newTabLabel="(opens in a new tab)"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
