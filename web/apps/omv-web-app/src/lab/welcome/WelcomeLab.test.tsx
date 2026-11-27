// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard design in the lab as the owner meets it: the welcome greets the mock's NAS by name with
// figures counted from its rows, the answer never says everything is working before the disks' health
// is read and carries the check itself, the strip gives one status per area, "Right now" shows its
// figures, Hide the welcome leaves the answer as the page's heading, tips off means no welcome, and
// nothing of the generated look, in the page or in the source. Lab fixtures only; nothing here
// reaches the network.
/// <reference types="node" />
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import "../../services/i18n/index.ts";
import WelcomeLab from "./WelcomeLab.tsx";

function open(query: string) {
  window.history.replaceState(
    null,
    "",
    `/ui/lab?screen=welcome&still=1&${query}`,
  );
  return render(<WelcomeLab />);
}

afterEach(() => {
  document.documentElement.removeAttribute("data-motion");
  document.documentElement.removeAttribute("data-density");
});

const h1 = () => screen.getByRole("heading", { level: 1 }).textContent;

describe("the dashboard design", () => {
  it("greets the NAS on a first visit with figures from its reads", () => {
    open("case=existing");
    expect(h1()).toBe("Welcome to nas.");
    expect(
      screen.getByText(
        "Its six disks, four drives and six shared folders are on this page, drawn as they are right now.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No problems found so far.",
      }),
    ).toBeInTheDocument();
  });

  it("gives one status per area, each a link to its part of the page", () => {
    open("case=later");
    const strip = screen.getByRole("navigation", {
      name: "The NAS at a glance",
    });
    const links = within(strip).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(strip.textContent).toContain("Not checked");
    expect(strip.textContent).toContain("6 disks, 1 asleep");
    expect(links[0]).toHaveAttribute("href", "#wl-temps");
  });

  it("carries the check in the answer, and says everything is working only after it", async () => {
    const user = userEvent.setup();
    open("case=later");
    expect(h1()).toBe("No problems found so far.");
    expect(screen.getByText(/the check waits for you\./u)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Check disk health/u }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(h1()).toContain("Everything is working.");
    expect(
      screen.getByText(/The disks reported no problem at 10:31\./u),
    ).toBeInTheDocument();
  });

  it("leads with what needs you, worst first", () => {
    open("case=later&nas=needs");
    expect(h1()).toContain("One thing needs you.");
    expect(
      screen.getByRole("region", { name: "What needs you" }),
    ).toHaveTextContent("Data drive is almost full");
  });

  it("lays the regions across the row in the order the person uses them", () => {
    // The first of a name: the list of what needs you carries its own hidden heading as well.
    const heading = (name: string) =>
      screen.getAllByRole("heading", { name })[0] as HTMLElement;
    const inOrder = (...names: string[]) =>
      names
        .map(heading)
        .every(
          (h, i, all) =>
            i === 0 ||
            Boolean(
              (all[i - 1] as HTMLElement).compareDocumentPosition(h) &
              Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        );
    const foot = ["Disk temperatures", "This NAS", "Shortcuts"];

    // Something needs you: the list first, then "Right now", the map's regions, and the foot.
    let view = open("case=later&nas=needs");
    expect(inOrder("What needs you", "Right now", ...foot)).toBe(true);
    view.unmount();

    view = open("case=later");
    expect(inOrder("Right now", ...foot)).toBe(true);
    view.unmount();

    // A new NAS: the first steps before "Right now".
    view = open("case=new");
    expect(inOrder("First steps", "Right now", ...foot)).toBe(true);
    view.unmount();
  });
  it("shows the live figures large, with the charts' text alternatives", () => {
    open("case=later");
    const now = screen.getByRole("region", { name: "Right now" });
    expect(within(now).getAllByRole("img")).toHaveLength(2);
    expect(now.textContent).toMatch(/Processor/u);
    expect(now.textContent).toMatch(/MiB\/s/u);
  });

  it("hides the welcome on its button, and shows none with tips off", async () => {
    const user = userEvent.setup();
    const view = open("case=existing");
    await user.click(
      screen.getByRole("button", {
        name: "Hide the welcome to the new interface",
      }),
    );
    expect(h1()).toBe("No problems found so far.");
    view.unmount();
    open("case=existing&tips=off");
    expect(h1()).toBe("No problems found so far.");
    expect(screen.queryByText(/You could also/u)).toBeNull();
  });

  it("puts the first steps beside the instruments on a new NAS", () => {
    open("case=new");
    expect(h1()).toBe("Welcome to nas.");
    expect(
      screen.getByRole("heading", { name: /First steps/u }),
    ).toBeInTheDocument();
  });

  it("carries none of the generated look", () => {
    // The two banned words, built so that this file does not carry them either.
    const banned = new RegExp(`\\b(${"qui" + "et"}|${"re" + "al"})\\b`, "iu");
    for (const which of ["existing", "new", "later"]) {
      const view = open(`case=${which}`);
      const text = view.container.textContent;
      expect(text).not.toMatch(/[·•|]/u);
      expect(text).not.toMatch(banned);
      expect(view.container.querySelector("style")).toBeNull();
      view.unmount();
    }
    // The source too, comments included; the patterns are looked for outside this file.
    const files = readdirSync(import.meta.dirname);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(`${import.meta.dirname}/${file}`, "utf8");
      expect(source, file).not.toMatch(banned);
      if (!file.endsWith(".test.tsx")) {
        expect(source, file).not.toMatch(
          /style=\{|radial-gradient|blur\(|uppercase|animate-pulse/u,
        );
      }
    }
  });
});
