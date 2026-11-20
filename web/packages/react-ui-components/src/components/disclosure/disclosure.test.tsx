// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure, DisclosurePanel, DisclosureTrigger } from "./disclosure";

describe("Disclosure", () => {
  it("opens and closes from the keyboard and says so", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure>
        <DisclosureTrigger>Advanced</DisclosureTrigger>
        <DisclosurePanel>
          <label>
            Extra configuration lines
            <textarea defaultValue="" />
          </label>
        </DisclosurePanel>
      </Disclosure>,
    );
    const trigger = screen.getByRole("button", { name: "Advanced" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox")).toBeNull();

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const area = screen.getByRole("textbox");
    expect(trigger.getAttribute("aria-controls")).toBe(
      area.closest("[data-slot=disclosure-panel]")?.id,
    );

    await user.type(area, "MaxAuthTries 3");
    trigger.focus();
    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Kept mounted while closed, so what was typed survives.
    await user.keyboard(" ");
    expect(screen.getByRole("textbox")).toHaveValue("MaxAuthTries 3");
  });

  it("starts open when asked, with the count in its name", () => {
    render(
      <Disclosure defaultOpen>
        <DisclosureTrigger>Advanced (2 lines set)</DisclosureTrigger>
        <DisclosurePanel>Two lines</DisclosurePanel>
      </Disclosure>,
    );
    expect(
      screen.getByRole("button", { name: "Advanced (2 lines set)" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Two lines")).toBeVisible();
  });
});
