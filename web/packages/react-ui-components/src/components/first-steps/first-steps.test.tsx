// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import {
  FactListItem,
  FactListLabel,
  FactListValue,
} from "../fact-list/fact-list";
import { NasFacts } from "../nas-facts/nas-facts";
import { Shortcuts, ShortcutsItem } from "../shortcuts/shortcuts";
import { FirstSteps, type FirstStep } from "./first-steps";

const STEPS: FirstStep[] = [
  { id: "a", title: "Name the NAS", done: true, actionLabel: "Rename" },
  {
    id: "b",
    title: "Change the factory password",
    detail: "The factory password may still work.",
    done: false,
    actionLabel: "Change",
  },
  { id: "c", title: "Get alerts by email", done: false, actionLabel: "Set up" },
];

function renderSteps(accent?: "filled" | "outline") {
  return render(
    <FirstSteps
      title="First steps"
      progress={(done, total) => `${String(done)} of ${String(total)} done`}
      stateLabels={{ done: "done", notDone: "not done" }}
      steps={STEPS}
      accent={accent}
    />,
  );
}

describe("FirstSteps", () => {
  it("is a checklist with no numbers: a tick when done, an empty circle when not", () => {
    const { container } = renderSteps();
    expect(screen.getByRole("region", { name: "First steps" })).toBeVisible();
    expect(screen.getByText("1 of 3 done")).toBeVisible();
    expect(
      [...container.querySelectorAll("svg[data-icon]")].map((s) =>
        s.getAttribute("data-icon"),
      ),
    ).toEqual(["check", "circle", "circle"]);
    expect(container.textContent).not.toMatch(/\b[123]\.\s/);
    expect(screen.getByText("(done)", { exact: false })).toHaveClass("sr-only");
  });

  it("offers a button for each step not done, the current one in the accent", () => {
    renderSteps();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change" }).className).toMatch(
      /bg-primary/,
    );
    expect(
      screen.getByRole("button", { name: "Set up" }).className,
    ).not.toMatch(/action-stroke/);
    expect(
      screen.getByRole("button", { name: "Change" }).closest("li"),
    ).toHaveAttribute("aria-current", "step");
  });

  it("outlines the current step when another region holds the filled accent", () => {
    renderSteps("outline");
    expect(
      screen.getByRole("button", { name: "Change" }).className,
    ).not.toMatch(/bg-primary/);
    expect(screen.getByRole("button", { name: "Change" }).className).toMatch(
      /text-action-label/,
    );
  });

  it("drops a step's line in compact density", () => {
    renderSteps();
    expect(
      screen.getByText("The factory password may still work."),
    ).toHaveClass("compact:hidden");
  });
});

describe("Shortcuts and NasFacts", () => {
  it("lists shortcuts as text actions under their heading", () => {
    render(
      <Shortcuts title="Shortcuts">
        <ShortcutsItem>Add a person</ShortcutsItem>
        <ShortcutsItem render={<a href="#classic" />}>
          Open the classic interface
        </ShortcutsItem>
      </Shortcuts>,
    );
    expect(screen.getByRole("region", { name: "Shortcuts" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add a person" }),
    ).toHaveAttribute("type", "button");
    expect(
      screen.getByRole("link", { name: "Open the classic interface" }),
    ).toBeVisible();
  });

  it("gives the NAS's facts as a description list in two columns", () => {
    render(
      <NasFacts title="This NAS">
        <FactListItem>
          <FactListLabel>Name</FactListLabel>
          <FactListValue>nas</FactListValue>
        </FactListItem>
        <FactListItem span="full">
          <FactListLabel>Updates</FactListLabel>
          <FactListValue>33 to install</FactListValue>
        </FactListItem>
      </NasFacts>,
    );
    const list = screen
      .getByRole("region", { name: "This NAS" })
      .querySelector("dl");
    expect(list).toHaveAttribute("data-layout", "grid");
    expect(screen.getByText("33 to install").parentElement).toHaveClass(
      "col-span-full",
    );
  });

  it("lays the steps across the row only when asked, keeping the list's reading order", () => {
    const { container, rerender } = render(
      <FirstSteps
        title="First steps"
        progress={(done, total) => `${String(done)} of ${String(total)} done`}
        stateLabels={{ done: "done", notDone: "not done" }}
        steps={STEPS}
      />,
    );
    const region = () => screen.getByRole("region", { name: "First steps" });
    expect(region()).toHaveAttribute("data-layout", "list");
    expect(region().className).not.toMatch(/@container/u);
    rerender(
      <FirstSteps
        title="First steps"
        progress={(done, total) => `${String(done)} of ${String(total)} done`}
        stateLabels={{ done: "done", notDone: "not done" }}
        steps={STEPS}
        layout="across"
      />,
    );
    expect(region()).toHaveAttribute("data-layout", "across");
    expect(region().className).toMatch(/@container\/first-steps/u);
    expect(container.querySelector("[data-slot=checklist]")?.className).toMatch(
      /@min-\[60rem\]\/first-steps:auto-cols-fr/u,
    );
    // The same steps, buttons and accent: only the layout changes.
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Change" }).className).toMatch(
      /bg-primary/,
    );
  });
});
