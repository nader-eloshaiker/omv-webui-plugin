// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { TextareaField } from "./textarea-field";

describe("TextareaField", () => {
  it("is a labelled textarea described by its hint and error", () => {
    render(
      <TextareaField
        label="Extra configuration lines"
        hint="These lines are added as they are."
        error="Remove the empty line at the end."
        mono
        defaultValue="ClientAliveInterval 300"
      />,
    );
    const area = screen.getByRole("textbox", {
      name: "Extra configuration lines",
    });
    expect(area.tagName).toBe("TEXTAREA");
    expect(area).toHaveValue("ClientAliveInterval 300");
    expect(area).toHaveAttribute("rows", "4");
    expect(area).toHaveAttribute("spellcheck", "false");
    expect(area).toHaveAttribute("aria-invalid", "true");
    const describedBy = area.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain(
      screen.getByText("These lines are added as they are.").id,
    );
  });

  it("works controlled, and Enter adds a line instead of submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    function Controlled() {
      const [value, setValue] = React.useState("");
      return (
        <form onSubmit={onSubmit}>
          <TextareaField
            label="Extra configuration lines"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </form>
      );
    }
    render(<Controlled />);
    const area = screen.getByRole("textbox");
    await user.type(area, "MaxAuthTries 3{Enter}LoginGraceTime 30");
    expect(area).toHaveValue("MaxAuthTries 3\nLoginGraceTime 30");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("grows with its content up to maxRows, then scrolls", async () => {
    const user = userEvent.setup();
    // jsdom does no layout: give the textarea a line height and a content height to measure.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () =>
        ({
          lineHeight: "20px",
          paddingTop: "6px",
          paddingBottom: "6px",
          borderTopWidth: "1px",
          borderBottomWidth: "1px",
        }) as CSSStyleDeclaration,
    );
    let contentHeight = 92;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => contentHeight,
    );
    render(<TextareaField label="Lines" rows={4} maxRows={6} />);
    const area = screen.getByRole("textbox");
    expect(area.style.height).toBe("94px");
    expect(area.style.overflowY).toBe("hidden");
    contentHeight = 400;
    await user.type(area, "x");
    // Six lines of 20px plus 12px of padding and 2px of border.
    expect(area.style.height).toBe("134px");
    expect(area.style.overflowY).toBe("auto");
  });
});
