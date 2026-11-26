// SPDX-License-Identifier: GPL-3.0-or-later
// The welcome lab as the owner meets it: each candidate greets the mock's NAS by name with figures
// counted from its rows, the answer never says everything is working before the disks' health is
// read, Hide the welcome takes the welcome away and leaves the answer as the page's heading, tips off
// means no welcome, and nothing of the generated look, in the page or in the source. Lab fixtures
// only; nothing here reaches the network.
/// <reference types="node" />
import { act, render, screen } from "@testing-library/react";
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

describe("the welcome lab", () => {
  it("greets the NAS in each candidate with figures from its reads", () => {
    const a = open("candidate=drawn");
    expect(h1()).toBe("Welcome to nas.");
    expect(
      screen.getByText(
        "Its six disks, four drives and six shared folders are on this page, drawn as they are right now.",
      ),
    ).toBeInTheDocument();
    a.unmount();
    const b = open("candidate=annotated");
    expect(h1()).toBe("Now you can see all of nas at a glance.");
    expect(screen.getAllByRole("note")).toHaveLength(3);
    b.unmount();
    open("candidate=start");
    expect(h1()).toBe("Welcome to nas.");
    expect(screen.getByText("Put sde to use.")).toBeInTheDocument();
    expect(screen.getByText("Let computers open a4share.")).toBeInTheDocument();
    expect(
      screen.getByText("sdd is asleep, and the check wakes it up."),
    ).toBeInTheDocument();
  });

  it("says no problems found so far until the check, then everything is working", async () => {
    const user = userEvent.setup();
    open("candidate=drawn&case=later");
    expect(h1()).toBe("No problems found so far.");
    expect(screen.queryByText("Everything is working.")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Check disk health/u }),
    );
    expect(
      screen.getAllByRole("button", { name: /Checking disk health/u }).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(h1()).toContain("Everything is working.");
    expect(
      screen.getByText(/The disks reported no problem at 10:31\./u),
    ).toBeInTheDocument();
  });

  it("hides the welcome and leaves the answer as the page's heading", async () => {
    const user = userEvent.setup();
    open("candidate=annotated");
    await user.click(
      screen.getByRole("button", {
        name: "Hide the welcome to the new interface",
      }),
    );
    expect(h1()).toBe("No problems found so far.");
    expect(screen.queryAllByRole("note")).toHaveLength(0);
  });

  it("shows no welcome with tips off, and the first steps on a new NAS", () => {
    const off = open("candidate=start&tips=off");
    expect(h1()).toBe("No problems found so far.");
    off.unmount();
    open("candidate=drawn&case=new");
    expect(h1()).toBe("Welcome to nas.");
    expect(
      screen.getByRole("heading", { name: /First steps/u }),
    ).toBeInTheDocument();
  });

  it("carries none of the generated look", () => {
    // The two banned words, built so that this file does not carry them either.
    const banned = new RegExp(`\\b(${"qui" + "et"}|${"re" + "al"})\\b`, "iu");
    for (const candidate of ["drawn", "annotated", "start"]) {
      const view = open(`candidate=${candidate}`);
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
