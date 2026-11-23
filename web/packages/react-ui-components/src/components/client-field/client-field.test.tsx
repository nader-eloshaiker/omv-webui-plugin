// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ClientField,
  type ClientChoiceOrRange,
  type ClientFieldProps,
  type ClientFieldValue,
} from "./client-field";

const words = {
  legend: "Who may connect",
  one: {
    label: "One computer",
    hint: "Only the computer at this address may connect.",
    fieldLabel: "Its address or name",
    placeholder: "192.0.2.10",
  },
  network: {
    label: "Computers on one network",
    hint: "Every computer on this network may connect.",
    fieldLabel: "Network",
    placeholder: "192.0.2.0/24",
    fieldHint:
      "Write the network's first address, a slash and its size, as your router shows it.",
  },
  any: {
    label: "Any computer that can reach the NAS",
    hint: "Any computer on your network, and any that reaches it from outside, may connect.",
  },
} satisfies Partial<ClientFieldProps>;

function Controlled({
  initial,
  onValueChange,
  ...props
}: Partial<ClientFieldProps> & { initial: ClientFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ClientField
      {...words}
      {...props}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

describe("ClientField", () => {
  it("offers the three choices in order, Any computer last", () => {
    render(<Controlled initial={{ choice: "one", text: "" }} />);
    const group = screen.getByRole("radiogroup", { name: "Who may connect" });
    const radios = screen.getAllByRole("radio");
    expect(group).toBeInTheDocument();
    expect(
      radios.map((radio) => radio.getAttribute("aria-labelledby")),
    ).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "One computer" })).toBeChecked();
    expect(
      screen.getByRole("radio", {
        name: "Any computer that can reach the NAS",
      }),
    ).not.toBeChecked();
  });

  it("shows the chosen choice's field only, and keeps the text when the choice changes", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Controlled
        initial={{ choice: "one", text: "192.0.2.10" }}
        onValueChange={onValueChange}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Its address or name" }),
    ).toHaveValue("192.0.2.10");
    expect(screen.queryByRole("textbox", { name: "Network" })).toBeNull();
    await user.click(
      screen.getByRole("radio", { name: "Computers on one network" }),
    );
    expect(onValueChange).toHaveBeenLastCalledWith({
      choice: "network",
      text: "192.0.2.10",
    });
    expect(
      screen.getByRole("textbox", { name: "Network" }),
    ).toHaveAccessibleDescription(words.network.fieldHint);
  });

  it("reports each character typed and the moment the field is left", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onBlur = vi.fn();
    render(
      <Controlled
        initial={{ choice: "network", text: "" }}
        onValueChange={onValueChange}
        onBlur={onBlur}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Network" }),
      "10.0.0.0/8",
    );
    expect(onValueChange).toHaveBeenLastCalledWith({
      choice: "network",
      text: "10.0.0.0/8",
    });
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("shows the caller's error for the chosen choice, as the field's description", () => {
    render(
      <Controlled
        initial={{ choice: "network", text: "192.0.2.5/24" }}
        network={{
          ...words.network,
          error:
            "192.0.2.5/24 is not the start of a network. Did you mean 192.0.2.0/24?",
        }}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Network" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining("is not the start of a network"),
    );
  });

  it("shows a warning under the chosen choice, in its field's and the group's description", () => {
    const warning =
      "This network holds 65,536 addresses. Every computer on it may connect.";
    render(
      <Controlled
        initial={{ choice: "network", text: "10.1.0.0/16" }}
        warning={warning}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(warning);
    expect(
      screen.getByRole("textbox", { name: "Network" }),
    ).toHaveAccessibleDescription(expect.stringContaining(warning));
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      expect.stringContaining(warning),
    );
  });

  it("puts a warning that appears into a live region that was already there", async () => {
    const user = userEvent.setup();
    function AnyWarning() {
      const [value, setValue] = React.useState<ClientFieldValue>({
        choice: "one",
        text: "",
      });
      return (
        <ClientField
          {...words}
          value={value}
          onValueChange={setValue}
          warning={
            value.choice === "any"
              ? "Any computer that can reach this NAS may use Photos."
              : undefined
          }
        />
      );
    }
    const { container } = render(<AnyWarning />);
    const regions = container.querySelectorAll(
      "[data-slot=client-field-warning-region]",
    );
    expect(regions).toHaveLength(3);
    const last = regions[2]!;
    expect(last).toHaveAttribute("aria-live", "polite");
    expect(last).toBeEmptyDOMElement();
    await user.click(
      screen.getByRole("radio", {
        name: "Any computer that can reach the NAS",
      }),
    );
    expect(last).toHaveTextContent(
      "Any computer that can reach this NAS may use Photos.",
    );
  });

  it("shows a stored classic value with no choice selected", () => {
    render(
      <Controlled
        initial={{ choice: null, text: "" }}
        stored={{
          value: "*.example.org",
          description:
            "Set in the classic interface. It is kept until you choose one of these.",
        }}
      />,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText("*.example.org").tagName).toBe("CODE");
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(
      expect.stringContaining("*.example.org"),
    );
  });

  it("hides the stored value once a choice is made", async () => {
    const user = userEvent.setup();
    render(
      <Controlled
        initial={{ choice: null, text: "" }}
        stored={{
          value: "@trusted-hosts",
          description: "Set in the classic interface.",
        }}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "One computer" }));
    expect(screen.queryByText("@trusted-hosts")).toBeNull();
  });

  it("offers the rsync server's first choice and can leave out Any computer", () => {
    render(
      <Controlled
        initial={{ choice: "anyWithPassword", text: "" }}
        any={undefined}
        anyWithPassword={{ label: "Any computer with the name and password" }}
      />,
    );
    const names = screen
      .getAllByRole("radio")
      .map((radio) => radio.closest("label")?.textContent);
    expect(names).toEqual([
      "Any computer with the name and password",
      "One computer",
      "Computers on one network",
    ]);
    expect(
      screen.getByRole("radio", {
        name: "Any computer with the name and password",
      }),
    ).toBeChecked();
  });

  it("stays focusable when unavailable, says why, and changes nothing", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <ClientField
        {...words}
        value={{ choice: "one", text: "192.0.2.10" }}
        onValueChange={onValueChange}
        disabled
        disabledReason="Turn on the rsync server first."
      />,
    );
    const group = screen.getByRole("radiogroup");
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(group).toHaveAccessibleDescription(
      expect.stringContaining("Turn on the rsync server first."),
    );
    await user.tab();
    expect(screen.getByRole("radio", { name: "One computer" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await user.click(
      screen.getByRole("radio", { name: "Computers on one network" }),
    );
    const input = screen.getByRole("textbox", { name: "Its address or name" });
    await user.click(input);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-disabled", "true");
    await user.type(input, "x");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("renders a hostile stored value as inert text", () => {
    const { container } = render(
      <Controlled
        initial={{ choice: null, text: "" }}
        stored={{
          value: '<img src=x onerror="alert(1)">',
          description: "Set elsewhere.",
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByText('<img src=x onerror="alert(1)">'),
    ).toBeInTheDocument();
  });

  describe("the firewall's range, family and stored negation", () => {
    const range = {
      label: "A range of addresses",
      firstLabel: "First address",
      lastLabel: "Last address",
      firstPlaceholder: "192.0.2.10",
      lastPlaceholder: "192.0.2.20",
    };

    function WithRange({
      initial,
      onValueChange,
      ...props
    }: Partial<ClientFieldProps<ClientChoiceOrRange>> & {
      initial: ClientFieldValue<ClientChoiceOrRange>;
    }) {
      const [value, setValue] = React.useState(initial);
      return (
        <ClientField
          {...words}
          range={range}
          family="ipv4"
          {...props}
          value={value}
          onValueChange={(next) => {
            setValue(next);
            onValueChange?.(next);
          }}
        />
      );
    }

    it("offers the range after the network, before Any computer", () => {
      render(<WithRange initial={{ choice: "one", text: "" }} />);
      expect(
        screen.getAllByRole("radio").map((radio) => radio.textContent ?? ""),
      ).toHaveLength(4);
      const names = screen
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")?.textContent);
      expect(names).toEqual([
        "One computer",
        "Computers on one network",
        "A range of addresses",
        "Any computer that can reach the NAS",
      ]);
    });

    it("takes a first and a last address, keeping the first as the text", async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <WithRange
          initial={{ choice: "one", text: "192.0.2.10" }}
          onValueChange={onValueChange}
        />,
      );
      await user.click(
        screen.getByRole("radio", { name: "A range of addresses" }),
      );
      const first = screen.getByRole("textbox", { name: "First address" });
      expect(first).toHaveValue("192.0.2.10");
      expect(first).toHaveAttribute("inputmode", "decimal");
      await user.type(
        screen.getByRole("textbox", { name: "Last address" }),
        "192.0.2.20",
      );
      expect(onValueChange).toHaveBeenLastCalledWith({
        choice: "range",
        text: "192.0.2.10",
        last: "192.0.2.20",
      });
    });

    it("shows each address's error and the pair's under both fields", () => {
      render(
        <WithRange
          initial={{ choice: "range", text: "192.0.2.30", last: "192.0.2.300" }}
          range={{
            ...range,
            lastError:
              "Write one IPv4 address, a network such as 192.0.2.0/24, or a range.",
            error: "The first address must come before the last.",
          }}
        />,
      );
      const first = screen.getByRole("textbox", { name: "First address" });
      const last = screen.getByRole("textbox", { name: "Last address" });
      expect(first).toHaveAttribute("aria-invalid", "true");
      expect(first).toHaveAccessibleDescription(
        "The first address must come before the last.",
      );
      expect(last).toHaveAccessibleDescription(
        expect.stringContaining("Write one IPv4 address"),
      );
    });

    it("leaves the touch keyboard alone for IPv6", () => {
      render(
        <WithRange
          initial={{ choice: "network", text: "2001:db8::/64" }}
          family="ipv6"
        />,
      );
      expect(
        screen.getByRole("textbox", { name: "Network" }),
      ).not.toHaveAttribute("inputmode");
    });

    it("keeps a stored negation until Remove, then moves focus to the choices", async () => {
      const user = userEvent.setup();
      function WithExcept() {
        const [except, setExcept] = React.useState(true);
        return (
          <WithRange
            initial={{ choice: "network", text: "192.0.2.0/24" }}
            except={
              except
                ? {
                    label: "Every address except",
                    description: "(set in the classic interface)",
                    removeLabel: "Remove",
                    onRemove: () => setExcept(false),
                  }
                : undefined
            }
          />
        );
      }
      render(<WithExcept />);
      const group = screen.getByRole("radiogroup", { name: "Who may connect" });
      expect(group).toHaveAccessibleDescription(
        expect.stringContaining("Every address except"),
      );
      await user.click(screen.getByRole("button", { name: "Remove" }));
      expect(screen.queryByText("Every address except")).toBeNull();
      expect(
        screen.getByRole("radio", { name: "Computers on one network" }),
      ).toHaveFocus();
    });
  });
});
