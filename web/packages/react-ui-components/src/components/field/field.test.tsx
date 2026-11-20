// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldRequired,
} from "./field";

describe("Field", () => {
  it("links the label, the hint and the error to the control", () => {
    render(
      <Field invalid>
        <FieldLabel>
          Port<FieldRequired>Required</FieldRequired>
        </FieldLabel>
        <FieldControl defaultValue="70000" />
        <FieldHint>The port SSH listens on.</FieldHint>
        <FieldError>Enter a port between 1 and 65535.</FieldError>
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: /Port/ });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const hint = screen.getByText("The port SSH listens on.");
    const error = screen
      .getByText("Enter a port between 1 and 65535.")
      .closest("[id]");
    expect(describedBy).toContain(hint.id);
    expect(error).not.toBeNull();
    expect(describedBy).toContain(error?.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
