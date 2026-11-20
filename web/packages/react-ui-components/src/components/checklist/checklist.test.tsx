// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checklist, ChecklistItem, type ChecklistState } from "./checklist";

describe("ChecklistItem", () => {
  it("reads as one sentence: title, state word, then the sentences", () => {
    render(
      <Checklist>
        <ChecklistItem
          state="notDone"
          stateLabel="Not done"
          title="Use a secure connection (HTTPS)"
        >
          <p>HTTPS is off.</p>
        </ChecklistItem>
      </Checklist>,
    );
    const item = screen.getByRole("listitem");
    // The leading column is drawn for the eye; its word is already in the title.
    const visible = item.querySelector("[data-slot=checklist-item-state]");
    expect(visible).toHaveAttribute("aria-hidden", "true");
    const spoken = Array.from(item.childNodes)
      .filter((node) => node !== visible)
      .map((node) => node.textContent)
      .join("");
    expect(spoken).toBe(
      "Use a secure connection (HTTPS): Not done.HTTPS is off.",
    );
  });

  it("tells the states apart by shape and word, never colour", () => {
    const cases: [ChecklistState, string, string | null][] = [
      ["done", "Done", "check"],
      ["notDone", "Not done", "circle"],
      ["notChecked", "Not checked", "question"],
      ["value", "", null],
      ["checking", "Checking…", null],
    ];
    const shapes = new Set<string>();
    for (const [state, word, icon] of cases) {
      const { container, unmount } = render(
        <ChecklistItem
          state={state}
          stateLabel={word || undefined}
          title="Name of your NAS"
        />,
      );
      const mark = container.querySelector("[data-icon]");
      expect(mark?.getAttribute("data-icon") ?? null).toBe(icon);
      if (icon) {
        shapes.add(icon);
      }
      const column = container.querySelector(
        "[data-slot=checklist-item-state]",
      );
      expect(column).toHaveTextContent(word);
      expect(column?.className).not.toMatch(/(ok|warning|critical|pending)-/);
      unmount();
    }
    expect(shapes.size).toBe(3);
  });

  it("marks a read in flight as busy", () => {
    render(
      <ChecklistItem
        state="checking"
        stateLabel="Checking…"
        title="Get email alerts"
      />,
    );
    expect(screen.getByRole("listitem")).toHaveAttribute("aria-busy", "true");
  });

  it("retries only the item whose read failed", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <Checklist>
        <ChecklistItem
          state="notChecked"
          stateLabel="Not checked"
          title="Get email alerts"
          retry={{ label: "Try again", onRetry }}
        >
          <p>Could not read the email alert settings.</p>
        </ChecklistItem>
        <ChecklistItem state="done" stateLabel="Done" title="Use HTTPS" />
      </Checklist>,
    );
    const retries = screen.getAllByRole("button", { name: "Try again" });
    expect(retries).toHaveLength(1);
    await user.click(retries[0] as HTMLElement);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
