// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it } from "vitest";
import {
  PORT_ANY,
  PORT_OTHER,
  PortField,
  type PortFieldProps,
  type PortFieldValue,
} from "./port-field";

const labels = {
  label: "Port",
  any: "Any port",
  other: "Another port or range…",
  field: "Port or range",
  fieldPlaceholder: "1024-65535",
  fieldHint: "One port, such as 22, or a range, such as 1024-65535.",
};

const knownPorts = [
  { value: "22", label: "22 (SSH)" },
  { value: "445", label: "445 (Windows and Mac sharing)" },
];

function Live({
  initial,
  ...props
}: Partial<PortFieldProps> & { initial: PortFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <PortField
        labels={labels}
        knownPorts={knownPorts}
        {...props}
        value={value}
        onValueChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe("PortField", () => {
  it("offers Any port, the known ports by name, and another port or range", async () => {
    const user = userEvent.setup();
    render(<Live initial={{ choice: PORT_ANY, text: "" }} />);
    const select = screen.getByRole("combobox", { name: "Port" });
    expect(select).toHaveTextContent("Any port");
    await user.click(select);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Any port",
      "22 (SSH)",
      "445 (Windows and Mac sharing)",
      "Another port or range…",
    ]);
    await user.click(screen.getByRole("option", { name: "22 (SSH)" }));
    expect(screen.getByTestId("value")).toHaveTextContent(
      JSON.stringify({ choice: "22", text: "" }),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("reveals the text field for another port or range and keeps what was typed", async () => {
    const user = userEvent.setup();
    render(<Live initial={{ choice: PORT_OTHER, text: "" }} />);
    const field = screen.getByRole("textbox", { name: "Port or range" });
    await user.type(field, "1024-65535");
    expect(screen.getByTestId("value")).toHaveTextContent(
      JSON.stringify({ choice: PORT_OTHER, text: "1024-65535" }),
    );
    expect(field).toHaveAttribute("dir", "ltr");
  });

  it("shows the caller's error under the field, as its description", () => {
    render(
      <Live
        initial={{ choice: PORT_OTHER, text: "70000" }}
        error="Write one port from 1 to 65535, or a range such as 1024-65535."
      />,
    );
    const field = screen.getByRole("textbox", { name: "Port or range" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining("Write one port from 1 to 65535"),
    );
  });

  it("says why no port can be chosen, in place of the controls", () => {
    render(
      <Live
        initial={{ choice: PORT_ANY, text: "" }}
        unavailableReason="A port can be chosen only for TCP or UDP."
      />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("group", { name: "Port" })).toHaveTextContent(
      "A port can be chosen only for TCP or UDP.",
    );
  });
});
