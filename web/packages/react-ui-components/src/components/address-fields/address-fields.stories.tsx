// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { IsolatedIdentifier } from "../text/isolated-identifier";
import {
  AddressFields,
  type AddressFieldsErrors,
  type AddressFieldsLabels,
  type AddressFieldsProps,
  type AddressFieldsValue,
} from "./address-fields";

// The English words of phase 5 network design 0.1, 5.2 and 5.9 (`ifaceForm.*`, `network.term.*`).
const labels: AddressFieldsLabels = {
  optional: "Optional",
  ipv4: {
    legend: "IPv4",
    how: "How the NAS gets its IPv4 address",
    methods: {
      dhcp: {
        label: "Automatically from the router (DHCP)",
        hint: "The router gives the NAS its address. The address can change, though most routers keep giving the same one.",
      },
      static: {
        label: "A fixed address I choose",
        hint: "You choose the address. It never changes, and no other device on the network may use it.",
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
    routerHint:
      "The router the NAS sends traffic through to reach other networks and the internet. It must be on the same network as the NAS.",
    fixedHint:
      "Choose an address no other device uses. Your router's list of connected devices shows which are taken, and its settings show which addresses it hands out by itself; choose one outside those.",
  },
  ipv6: {
    legend: "IPv6",
    how: "How the NAS gets its IPv6 address",
    methods: {
      auto: {
        label: "Automatically (router announcements)",
        hint: "The NAS makes its own address from what the router announces. Most home networks with IPv6 use this.",
      },
      dhcp: {
        label: "Automatically from a DHCPv6 server",
        hint: "A DHCPv6 server on the network gives the NAS its address. Choose this only if your network has one.",
      },
      static: {
        label: "A fixed address I choose",
        hint: "You choose the address. It never changes, and no other device on the network may use it.",
      },
      manual: {
        label: "Off",
        hint: "The interface gets no address of this kind.",
      },
    },
    address: "Address",
    addressPlaceholder: "2001:db8::10",
    prefix: "Prefix length",
    prefixHint: "Almost always 64.",
    router: "Router address",
    routerPlaceholder: "2001:db8::1",
  },
  dns: {
    legend: "Name servers (DNS)",
    servers: "Name servers",
    serversPlaceholder: "192.0.2.1",
    serversHint: "Leave it empty to use the ones your router gives.",
    serversNote: "They do not change how other computers find this NAS.",
    search: "Search domains",
    searchPlaceholder: "example.org",
    searchHint:
      "When the NAS looks up a short name, it also tries it with these endings, so backup can find backup.example.org.",
  },
};

// The same fields in German, about 40% longer, to show nothing depends on English widths.
const GERMAN: AddressFieldsLabels = {
  optional: "Freiwillig",
  ipv4: {
    ...labels.ipv4,
    legend: "IPv4",
    how: "Wie das NAS seine IPv4-Adresse bekommt",
    methods: {
      dhcp: {
        label: "Automatisch vom Router (DHCP)",
        hint: "Der Router gibt dem NAS seine Adresse. Die Adresse kann sich ändern, auch wenn die meisten Router immer dieselbe vergeben.",
      },
      static: {
        label: "Eine feste Adresse, die ich auswähle",
        hint: "Sie wählen die Adresse. Sie ändert sich nie, und kein anderes Gerät im Netzwerk darf sie verwenden.",
      },
      manual: {
        label: "Aus",
        hint: "Die Schnittstelle bekommt keine Adresse dieser Art.",
      },
    },
    address: "Adresse",
    size: "Netzwerkgröße",
    router: "Adresse des Routers",
    routerHint:
      "Der Router, über den das NAS andere Netzwerke und das Internet erreicht. Er muss im selben Netzwerk wie das NAS sein.",
    fixedHint:
      "Wählen Sie eine Adresse, die kein anderes Gerät verwendet. Die Liste der verbundenen Geräte Ihres Routers zeigt, welche vergeben sind.",
  },
  ipv6: {
    ...labels.ipv6,
    how: "Wie das NAS seine IPv6-Adresse bekommt",
    prefix: "Präfixlänge",
    prefixHint: "Fast immer 64.",
  },
  dns: {
    ...labels.dns,
    legend: "Namensserver (DNS)",
    servers: "Namensserver",
    serversHint:
      "Leer lassen, um die Namensserver zu verwenden, die Ihr Router mitteilt.",
    search: "Suchdomänen",
  },
};

const DHCP: AddressFieldsValue = {
  ipv4: { method: "dhcp", address: "", size: "", router: "" },
  ipv6: { method: "manual", address: "", prefix: "64", router: "" },
  dns: { servers: "", search: "" },
};

const FIXED: AddressFieldsValue = {
  ipv4: {
    method: "static",
    address: "192.0.2.20",
    size: "24",
    router: "192.0.2.1",
  },
  ipv6: { method: "auto", address: "", prefix: "64", router: "" },
  dns: { servers: "192.0.2.1", search: "example.org" },
};

const READOUT = (
  <>
    Network <IsolatedIdentifier value="192.0.2.0/24" />:{" "}
    <IsolatedIdentifier value="192.0.2.1" /> to{" "}
    <IsolatedIdentifier value="192.0.2.254" />, 254 addresses for devices
  </>
);

const meta = {
  title: "Components/AddressFields",
  component: AddressFields,
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
  args: { labels, value: DHCP, onValueChange: () => undefined },
} satisfies Meta<typeof AddressFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the value, so a story can be clicked and typed into. */
function Live({
  initial,
  ...props
}: Partial<AddressFieldsProps> & { initial: AddressFieldsValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <AddressFields
      labels={labels}
      {...props}
      value={value}
      onValueChange={setValue}
    />
  );
}

/** A new port: IPv4 from the router, IPv6 off (the classic default). */
export const Automatic: Story = {
  render: () => <Live initial={DHCP} />,
};

/** A fixed IPv4 address with its network size, the readout under it, and the router. */
export const FixedIPv4: Story = {
  render: () => (
    <Live
      initial={FIXED}
      sizeReadout={READOUT}
      labels={{
        ...labels,
        dns: {
          ...labels.dns,
          serversHint:
            "Required with a router address: without one, the NAS cannot look up names for updates, email notifications and its clock.",
        },
      }}
    />
  ),
};

export const IPv4Off: Story = {
  render: () => (
    <Live
      initial={{
        ...DHCP,
        ipv4: { ...DHCP.ipv4, method: "manual" },
        ipv6: FIXED.ipv6,
      }}
    />
  ),
};

export const IPv6Automatic: Story = {
  render: () => (
    <Live initial={{ ...DHCP, ipv6: { ...DHCP.ipv6, method: "auto" } }} />
  ),
};

export const IPv6FromDhcpServer: Story = {
  render: () => (
    <Live initial={{ ...DHCP, ipv6: { ...DHCP.ipv6, method: "dhcp" } }} />
  ),
};

export const FixedIPv6: Story = {
  render: () => (
    <Live
      initial={{
        ...DHCP,
        ipv6: {
          method: "static",
          address: "2001:db8::20",
          prefix: "64",
          router: "2001:db8::1",
        },
      }}
    />
  ),
};

/** The network size as typed: `24`. */
export const SizeAsNumber: Story = {
  render: () => <Live initial={FIXED} sizeReadout={READOUT} />,
};

/** The network size as typed: `/24`. */
export const SizeWithSlash: Story = {
  render: () => (
    <Live
      initial={{ ...FIXED, ipv4: { ...FIXED.ipv4, size: "/24" } }}
      sizeReadout={READOUT}
    />
  ),
};

/** The network size as typed: a dotted mask. */
export const SizeAsMask: Story = {
  render: () => (
    <Live
      initial={{ ...FIXED, ipv4: { ...FIXED.ipv4, size: "255.255.255.0" } }}
      sizeReadout={READOUT}
    />
  ),
};

const v = (value: string) => <IsolatedIdentifier value={value} />;

// Every message of design 5.3 that these fields show, each under its own field.
const ERRORS: Record<
  string,
  { value: AddressFieldsValue; errors: AddressFieldsErrors }
> = {
  NotAnIPv4Address: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, address: "192.0.2.300" } },
    errors: { "ipv4.address": "Write an IPv4 address such as 192.0.2.10." },
  },
  NetworkItself: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, address: "192.0.2.0" } },
    errors: {
      "ipv4.address": (
        <>
          {v("192.0.2.0")} is the address of the network itself. Choose one
          between {v("192.0.2.1")} and {v("192.0.2.254")}.
        </>
      ),
    },
  },
  Reserved: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, address: "127.0.0.1" } },
    errors: {
      "ipv4.address": <>{v("127.0.0.1")} cannot be the NAS&apos;s address.</>,
    },
  },
  NetworkSize: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, size: "33" } },
    errors: {
      "ipv4.size":
        "Write a size from 1 to 32, such as 24, or a mask such as 255.255.255.0.",
    },
  },
  RouterNotOnTheNetwork: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, router: "198.51.100.1" } },
    errors: {
      "ipv4.router": (
        <>
          The router address {v("198.51.100.1")} is not on the network{" "}
          {v("192.0.2.0/24")}. Check the address and the network size.
        </>
      ),
    },
  },
  RouterIsTheNAS: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, router: "192.0.2.20" } },
    errors: {
      "ipv4.router":
        "The router address must be the router's, not the NAS's own.",
    },
  },
  UsedByAnotherInterface: {
    value: { ...FIXED, ipv4: { ...FIXED.ipv4, address: "192.0.2.10" } },
    errors: {
      "ipv4.address": (
        <>
          {v("enp3s0")} already uses {v("192.0.2.10")}.
        </>
      ),
    },
  },
  NotAnIPv6Address: {
    value: {
      ...FIXED,
      ipv6: {
        method: "static",
        address: "2001:db8::g",
        prefix: "64",
        router: "",
      },
    },
    errors: { "ipv6.address": "Write an IPv6 address such as 2001:db8::10." },
  },
  PrefixLength: {
    value: {
      ...FIXED,
      ipv6: {
        method: "static",
        address: "2001:db8::20",
        prefix: "129",
        router: "",
      },
    },
    errors: {
      "ipv6.prefix":
        "Write a prefix length from 1 to 128; it is almost always 64.",
    },
  },
  NameServer: {
    value: {
      ...FIXED,
      dns: { ...FIXED.dns, servers: "192.0.2.1\nrouter.lan" },
    },
    errors: {
      "dns.servers": (
        <>
          {v("router.lan")} is not an address. Write each name server&apos;s
          address, such as 192.0.2.1.
        </>
      ),
    },
  },
  NoNameServer: {
    value: { ...FIXED, dns: { ...FIXED.dns, servers: "" } },
    errors: {
      "dns.servers": "Add a name server, or the NAS cannot look up names.",
    },
  },
  SearchDomain: {
    value: { ...FIXED, dns: { ...FIXED.dns, search: "example..org" } },
    errors: {
      "dns.search": (
        <>{v("example..org")} is not a domain such as example.org.</>
      ),
    },
  },
};

function errorStory(key: string): Story {
  const entry = ERRORS[key];
  return {
    render: () =>
      entry ? (
        <Live
          initial={entry.value}
          errors={entry.errors}
          sizeReadout={READOUT}
        />
      ) : (
        <></>
      ),
  };
}

export const ErrorNotAnIPv4Address = errorStory("NotAnIPv4Address");
export const ErrorNetworkItself = errorStory("NetworkItself");
export const ErrorReserved = errorStory("Reserved");
export const ErrorNetworkSize = errorStory("NetworkSize");
export const ErrorRouterNotOnTheNetwork = errorStory("RouterNotOnTheNetwork");
export const ErrorRouterIsTheNAS = errorStory("RouterIsTheNAS");
export const ErrorUsedByAnotherInterface = errorStory("UsedByAnotherInterface");
export const ErrorNotAnIPv6Address = errorStory("NotAnIPv6Address");
export const ErrorPrefixLength = errorStory("PrefixLength");
export const ErrorNameServer = errorStory("NameServer");
export const ErrorNoNameServer = errorStory("NoNameServer");
export const ErrorSearchDomain = errorStory("SearchDomain");

/** This page's family turned off: the refusal under the choice (design 5.5); Save stays unavailable. */
export const RefusedFamily: Story = {
  render: () => (
    <Live
      initial={{ ...DHCP, ipv4: { ...DHCP.ipv4, method: "manual" } }}
      familyNotes={{
        ipv4: (
          <>
            This page reaches the NAS over IPv4 through {v("enp2s0")}. Turning
            IPv4 off would cut it off. Connect this computer through another
            interface first, then change {v("enp2s0")} from there.
          </>
        ),
      }}
    />
  ),
};

/** Both families off on another interface: allowed, with its line. */
export const BothOff: Story = {
  render: () => (
    <Live
      initial={{
        ...DHCP,
        ipv4: { ...DHCP.ipv4, method: "manual" },
        ipv6: { ...DHCP.ipv6, method: "manual" },
      }}
      familyNotes={{
        ipv4: (
          <>With both off, the NAS cannot be reached through {v("enp3s0")}.</>
        ),
      }}
    />
  ),
};

/** Unavailable, with the reason once above: every control stays focusable and says why. */
export const Disabled: Story = {
  render: () => (
    <Live
      initial={FIXED}
      sizeReadout={READOUT}
      disabled
      disabledReason="Another change to enp2s0 is running. Wait for it to finish."
    />
  ),
};

/** Long locale labels (German): every label, hint and choice wraps; nothing is cut off. */
export const LongLocaleLabels: Story = {
  render: () => <Live initial={FIXED} labels={GERMAN} sizeReadout={READOUT} />,
};

/** 320px wide: one column, the fixed fields under their choice, nothing scrolls sideways. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Live
      initial={{
        ...FIXED,
        ipv6: {
          method: "static",
          address: "2001:db8:85a3::8a2e:370:7334",
          prefix: "64",
          router: "2001:db8:85a3::1",
        },
      }}
      sizeReadout={READOUT}
      errors={ERRORS.RouterNotOnTheNetwork?.errors}
    />
  ),
};

/**
 * At 200% zoom (a 640px-wide frame stands in for a 1280px window): one column, labels and hints wrap.
 * View it with the browser zoomed to check.
 */
export const At200PercentZoom: Story = {
  decorators: [(Story) => <div className="w-160">{Story()}</div>],
  render: () => <Live initial={FIXED} labels={GERMAN} sizeReadout={READOUT} />,
};
