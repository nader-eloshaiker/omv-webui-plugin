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
  FormColumn,
  Input,
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

describe("field widths", () => {
  it("sizes a control by what it holds, never past its column, full by default", () => {
    render(
      <FormColumn data-testid="column">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl width="name" />
        </Field>
        <Field>
          <FieldLabel>Fixed address</FieldLabel>
          <FieldControl width="address" />
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <FieldControl />
        </Field>
        <Input aria-label="Search" width="wide" />
      </FormColumn>,
    );
    const name = screen.getByRole("textbox", { name: "Name" });
    expect(name).toHaveAttribute("data-width", "name");
    expect(name).toHaveClass("w-[calc(24ch+1.625rem)]", "max-w-full");
    expect(name).not.toHaveClass("w-full");
    expect(screen.getByRole("textbox", { name: "Fixed address" })).toHaveClass(
      "w-[calc(16ch+1.625rem)]",
    );
    const description = screen.getByRole("textbox", { name: "Description" });
    expect(description).toHaveAttribute("data-width", "full");
    expect(description).toHaveClass("w-full");
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveClass(
      "w-[calc(40ch+1.625rem)]",
    );
    expect(screen.getByTestId("column")).toHaveClass("max-w-160");
  });

  it("lets a caller's class win over the width step", () => {
    render(
      <Field>
        <FieldLabel>Port</FieldLabel>
        <FieldControl width="number" className="w-32" />
      </Field>,
    );
    const port = screen.getByRole("textbox", { name: "Port" });
    expect(port).toHaveClass("w-32");
    expect(port).not.toHaveClass("w-[calc(8ch+1.625rem)]");
  });
});
