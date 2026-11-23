// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AddressFields,
  type AddressFieldsLabels,
  type AddressFieldsProps,
  type AddressFieldsValue,
} from "./address-fields";

const labels: AddressFieldsLabels = {
  optional: "Optional",
  ipv4: {
    legend: "IPv4",
    how: "How the NAS gets its IPv4 address",
    methods: {
      dhcp: {
        label: "Automatically from the router (DHCP)",
        hint: "The router gives the NAS its address.",
      },
      static: {
        label: "A fixed address I choose",
        hint: "You choose the address.",
      },
      manual: {
        label: "Off",
        hint: "The interface gets no address of this kind.",
      },
    },
    address: "Address",
    addressPlaceholder: "192.0.2.10",
    size: "Network size",
    sizePlaceholder: "24",
    router: "Router address",
    routerPlaceholder: "192.0.2.1",
    routerHint: "The router the NAS sends traffic through.",
    fixedHint: "Choose an address no other device uses.",
  },
  ipv6: {
    legend: "IPv6",
    how: "How the NAS gets its IPv6 address",
    methods: {
      auto: { label: "Automatically (router announcements)" },
      dhcp: { label: "Automatically from a DHCPv6 server" },
      static: { label: "A fixed address I choose" },
      manual: { label: "Off" },
    },
    address: "IPv6 address",
    prefix: "Prefix length",
    prefixHint: "Almost always 64.",
    router: "IPv6 router address",
  },
  dns: {
    legend: "Name servers (DNS)",
    servers: "Name servers",
    serversHint: "Leave it empty to use the ones your router gives.",
    serversNote: "They do not change how other computers find this NAS.",
    search: "Search domains",
  },
};

const DHCP: AddressFieldsValue = {
  ipv4: { method: "dhcp", address: "", size: "", router: "" },
  ipv6: { method: "manual", address: "", prefix: "64", router: "" },
  dns: { servers: "", search: "" },
};

function Live({
  initial = DHCP,
  onBlur,
  ...props
}: Partial<AddressFieldsProps> & { initial?: AddressFieldsValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <AddressFields
      labels={labels}
      {...props}
      value={value}
      onValueChange={setValue}
      onBlur={onBlur}
    />
  );
}

describe("AddressFields", () => {
  it("groups the fields in three named fieldsets, each method with its sentence", () => {
    render(<Live />);
    expect(screen.getByRole("group", { name: "IPv4" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "IPv6" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Name servers (DNS)" }),
    ).toBeInTheDocument();
    const ipv4 = screen.getByRole("radiogroup", {
      name: "How the NAS gets its IPv4 address",
    });
    expect(within(ipv4).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(ipv4).getByRole("radio", {
        name: "Automatically from the router (DHCP)",
      }),
    ).toHaveAccessibleDescription("The router gives the NAS its address.");
    expect(
      within(
        screen.getByRole("radiogroup", {
          name: "How the NAS gets its IPv6 address",
        }),
      ).getAllByRole("radio"),
    ).toHaveLength(4);
  });

  it("shows the fixed fields only with a fixed address, and keeps them when switching back", async () => {
    const user = userEvent.setup();
    render(<Live />);
    expect(screen.queryByRole("textbox", { name: "Address" })).toBeNull();
    await user.click(
      screen.getAllByRole("radio", {
        name: "A fixed address I choose",
      })[0] as HTMLElement,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Address" }),
      "192.0.2.20",
    );
    expect(
      screen.getByRole("textbox", { name: /^Router address/ }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("radio", {
        name: "Automatically from the router (DHCP)",
      }),
    );
    expect(screen.queryByRole("textbox", { name: "Address" })).toBeNull();
    await user.click(
      screen.getAllByRole("radio", {
        name: "A fixed address I choose",
      })[0] as HTMLElement,
    );
    expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue(
      "192.0.2.20",
    );
  });

  it("links each error and the network-size readout to its field", () => {
    render(
      <Live
        initial={{
          ...DHCP,
          ipv4: {
            method: "static",
            address: "192.0.2.0",
            size: "/24",
            router: "198.51.100.1",
          },
        }}
        sizeReadout="Network 192.0.2.0/24: 192.0.2.1 to 192.0.2.254, 254 addresses for devices"
        errors={{
          "ipv4.address":
            "192.0.2.0 is the address of the network itself. Choose one between 192.0.2.1 and 192.0.2.254.",
          "ipv4.router":
            "The router address 198.51.100.1 is not on the network 192.0.2.0/24. Check the address and the network size.",
        }}
      />,
    );
    const address = screen.getByRole("textbox", { name: "Address" });
    expect(address).toHaveAttribute("aria-invalid", "true");
    expect(address).toHaveAccessibleDescription(
      expect.stringContaining("is the address of the network itself"),
    );
    expect(address).toHaveAttribute("dir", "ltr");
    expect(address).toHaveAttribute("data-field", "ipv4.address");
    const size = screen.getByRole("textbox", { name: "Network size" });
    expect(size).toHaveAccessibleDescription(
      expect.stringContaining("254 addresses for devices"),
    );
    expect(size).not.toHaveAttribute("aria-invalid");
    expect(
      screen.getByRole("textbox", { name: /^Router address/ }),
    ).toHaveAccessibleDescription(
      expect.stringContaining("is not on the network 192.0.2.0/24"),
    );
  });

  it("reports which field was left", async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    render(
      <Live
        initial={{ ...DHCP, ipv6: { ...DHCP.ipv6, method: "static" } }}
        onBlur={onBlur}
      />,
    );
    await user.click(screen.getByRole("textbox", { name: "IPv6 address" }));
    await user.tab();
    expect(onBlur).toHaveBeenCalledWith("ipv6.address");
    expect(
      screen.getByRole("textbox", { name: "Prefix length" }),
    ).toHaveFocus();
    await user.tab();
    expect(onBlur).toHaveBeenCalledWith("ipv6.prefix");
  });

  it("announces the refused-family line under the method choice and describes the choice with it", () => {
    const refusal =
      "This page reaches the NAS over IPv4 through enp2s0. Turning IPv4 off would cut it off.";
    const { rerender } = render(<Live />);
    const region = document.querySelectorAll(
      '[data-slot="address-family-note-region"]',
    )[0];
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    rerender(
      <Live
        initial={{ ...DHCP, ipv4: { ...DHCP.ipv4, method: "manual" } }}
        familyNotes={{ ipv4: refusal }}
      />,
    );
    expect(region).toHaveTextContent(refusal);
    expect(
      screen.getByRole("radiogroup", {
        name: "How the NAS gets its IPv4 address",
      }),
    ).toHaveAccessibleDescription(expect.stringContaining(refusal));
  });

  it("stays focusable when unavailable and says why, without taking changes", async () => {
    const user = userEvent.setup();
    render(
      <Live
        initial={{ ...DHCP, ipv4: { ...DHCP.ipv4, method: "static" } }}
        disabled
        disabledReason="Another change to enp2s0 is running."
      />,
    );
    const address = screen.getByRole("textbox", { name: "Address" });
    expect(address).toHaveAttribute("aria-disabled", "true");
    expect(address).toHaveAccessibleDescription(
      expect.stringContaining("Another change to enp2s0 is running."),
    );
    await user.type(address, "192.0.2.20");
    expect(address).toHaveValue("");
    expect(
      screen.getByRole("textbox", { name: "Name servers" }),
    ).toHaveAccessibleDescription(
      expect.stringContaining("Another change to enp2s0 is running."),
    );
  });
});
