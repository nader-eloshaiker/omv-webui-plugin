// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { FieldRequired } from "../field/field";
import {
  ClientField,
  type ClientFieldProps,
  type ClientFieldValue,
} from "./client-field";

// The English words of phase 5 services design 0.4. In the app they come from the catalogue.
const words = {
  legend: (
    <>
      Who may connect<FieldRequired>Required</FieldRequired>
    </>
  ),
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

const anyWarning =
  "Any computer that can reach this NAS may use Photos. NFS asks for no password, so this includes visitors' computers and anything that gets into your network.";

const meta = {
  title: "Components/ClientField",
  component: ClientField,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: {
    ...words,
    value: { choice: "one", text: "" },
    onValueChange: () => undefined,
  },
} satisfies Meta<typeof ClientField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the value, so a story can be clicked and typed into. */
function Live({
  initial,
  ...props
}: Partial<ClientFieldProps> & { initial: ClientFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <ClientField {...words} {...props} value={value} onValueChange={setValue} />
  );
}

/** A new NFS entry: One computer is chosen, the narrowest (P10). */
export const OneComputer: Story = {
  render: () => <Live initial={{ choice: "one", text: "" }} />,
};

export const OneComputerByName: Story = {
  render: () => (
    <Live initial={{ choice: "one", text: "media-player.home.example.org" }} />
  ),
};

export const Network: Story = {
  render: () => <Live initial={{ choice: "network", text: "192.0.2.0/24" }} />,
};

/** Any computer, set apart by 16px, with its warning under it. */
export const AnyComputer: Story = {
  render: () => (
    <Live initial={{ choice: "any", text: "" }} warning={anyWarning} />
  ),
};

export const InvalidAddress: Story = {
  render: () => (
    <Live
      initial={{ choice: "one", text: "192.0.2.300" }}
      one={{
        ...words.one,
        error: "Write one address, such as 192.0.2.10, or one computer name.",
      }}
    />
  ),
};

export const InvalidName: Story = {
  render: () => (
    <Live
      initial={{ choice: "one", text: "*.example.org" }}
      one={{
        ...words.one,
        error: "Write one address, such as 192.0.2.10, or one computer name.",
      }}
    />
  ),
};

export const NetworkNotItsStart: Story = {
  render: () => (
    <Live
      initial={{ choice: "network", text: "192.0.2.5/24" }}
      network={{
        ...words.network,
        error:
          "192.0.2.5/24 is not the start of a network. Did you mean 192.0.2.0/24?",
      }}
    />
  ),
};

export const NetworkOfEveryComputer: Story = {
  render: () => (
    <Live
      initial={{ choice: "network", text: "0.0.0.0/0" }}
      network={{
        ...words.network,
        error:
          "A network of /0 is every computer. Choose Any computer instead.",
      }}
    />
  ),
};

export const WideIPv4Network: Story = {
  render: () => (
    <Live
      initial={{ choice: "network", text: "10.1.0.0/16" }}
      warning="This network holds 65,536 addresses. Every computer on it may connect."
    />
  ),
};

export const WideIPv6Network: Story = {
  render: () => (
    <Live
      initial={{ choice: "network", text: "2001:db8::/32" }}
      warning="This network holds a very large number of addresses. Every computer on it may connect."
    />
  ),
};

/** A value set in the classic interface that is none of the choices: kept until one is chosen. */
export const StoredClassicValue: Story = {
  render: () => (
    <Live
      initial={{ choice: null, text: "" }}
      stored={{
        value: "*.example.org",
        description:
          "Set in the classic interface. It is kept as it is until you choose one of these.",
      }}
    />
  ),
};

export const StoredSeveralEntries: Story = {
  render: () => (
    <Live
      initial={{ choice: null, text: "" }}
      stored={{
        value: "192.0.2.10 192.0.2.11 198.51.100.0/24 @trusted-media-players",
        description:
          "Set in the classic interface. It is kept as it is until you choose one of these.",
      }}
    />
  ),
};

/** Nothing chosen and nothing stored: the group's own error. */
export const NothingChosen: Story = {
  render: () => (
    <Live
      initial={{ choice: null, text: "" }}
      error="Choose who may connect."
    />
  ),
};

/**
 * An rsync server folder that asks for a name and password: who may connect is optional, and its
 * first choice is any computer with the name and password, stored empty (design 0.4).
 */
export const RsyncServerOptional: Story = {
  render: () => (
    <Live
      initial={{ choice: "anyWithPassword", text: "" }}
      legend="Who may connect"
      anyWithPassword={{
        label: "Any computer with the name and password",
        hint: "Whoever has a rsync sign-in for this folder may connect, from any computer.",
      }}
      any={{
        ...words.any,
        hint: "Any computer on your network, and any that reaches it from outside, may connect with the name and password.",
      }}
    />
  ),
};

/** An rsync server folder that asks for no password: required, and Any computer is not offered. */
export const RsyncServerRequired: Story = {
  render: () => <Live initial={{ choice: "one", text: "" }} any={undefined} />,
};

export const DisabledWithReason: Story = {
  render: () => (
    <Live
      initial={{ choice: "network", text: "192.0.2.0/24" }}
      disabled
      disabledReason="Turn on Linux and Unix sharing first."
    />
  ),
};

/** 320px wide: the fields sit under their radio and nothing scrolls sideways. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Live
      initial={{ choice: "network", text: "2001:db8:85a3::/48" }}
      warning="This network holds a very large number of addresses. Every computer on it may connect."
    />
  ),
};

/** Text that looks like markup renders as text. */
export const HostileStoredValue: Story = {
  render: () => (
    <Live
      initial={{ choice: null, text: "" }}
      stored={{
        value: '<img src=x onerror="alert(1)">',
        description: "Set in the classic interface.",
      }}
    />
  ),
};
