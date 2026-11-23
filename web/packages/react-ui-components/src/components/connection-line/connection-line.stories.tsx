// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionLine } from "./connection-line";

// The English words of phase 5 network design 1.9 (`network.connection.*`). In the app they come from
// the catalogue through <Trans>, with the parts as its components.
const meta = {
  title: "Components/ConnectionLine",
  component: ConnectionLine,
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
  args: { children: "" },
} satisfies Meta<typeof ConnectionLine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Known: the page was opened at an address an interface uses now. */
export const Known: Story = {
  args: {
    address: "192.0.2.10",
    iface: "enp2s0",
    children: (parts) => (
      <>
        This page reaches the NAS at {parts.address} through {parts.iface}.
      </>
    ),
  },
};

/** Probably known: by the NAS's name, with one interface that has an address. */
export const ProbablyKnown: Story = {
  args: {
    host: "nas.example.org",
    iface: "enp2s0",
    children: (parts) => (
      <>
        This page reaches the NAS by its name, {parts.host}, most likely through{" "}
        {parts.iface}.
      </>
    ),
  },
};

/** Name only: by the NAS's name, with several interfaces that have addresses. */
export const NameOnly: Story = {
  args: {
    host: "nas.local",
    children: (parts) => (
      <>
        This page reaches the NAS by its name, {parts.host}. It cannot tell
        through which interface.
      </>
    ),
  },
};

/** Not known: an address no interface reports. */
export const UnknownAddress: Story = {
  args: {
    host: "198.51.100.7",
    children: (parts) => (
      <>
        This page reaches the NAS at {parts.host}. No interface of the NAS
        reports that address, so this page cannot tell which one it uses. A
        router or a VPN may be passing it on.
      </>
    ),
  },
};

/** Not known, by another name. */
export const OtherName: Story = {
  args: {
    host: "storage.example.org",
    children: (parts) => (
      <>
        This page reaches the NAS as {parts.host}. It cannot tell through which
        interface.
      </>
    ),
  },
};

/** Not known: localhost, a tunnel or a browser on the NAS itself. */
export const Tunnel: Story = {
  args: {
    children:
      "This page reaches the NAS through a tunnel or on the NAS itself. It cannot tell which interface the tunnel uses.",
  },
};

/** Known, outside the network settings (a VPN's interface). */
export const Unmanaged: Story = {
  args: {
    address: "192.0.2.201",
    iface: "wg0",
    children: (parts) => (
      <>
        This page reaches the NAS at {parts.address} through {parts.iface},
        which the network settings here do not manage.
      </>
    ),
  },
};

/** The interfaces could not be read: never Known. */
export const ReadFailed: Story = {
  args: {
    children:
      "This page could not read the NAS's interfaces, so it cannot tell which one it uses.",
  },
};

/** An IPv6 address in its shortest form. */
export const IPv6: Story = {
  args: {
    address: "2001:db8:85a3::8a2e:370:7334",
    iface: "enp2s0",
    children: (parts) => (
      <>
        This page reaches the NAS at {parts.address} through {parts.iface}.
      </>
    ),
  },
};

/** Long names wrap anywhere instead of pushing the page sideways. */
export const LongNames: Story = {
  args: {
    host: "network-attached-storage-in-the-basement-cupboard.home.example.org",
    iface: "enx00005e005301",
    children: (parts) => (
      <>
        This page reaches the NAS by its name, {parts.host}, most likely through{" "}
        {parts.iface}.
      </>
    ),
  },
};

/**
 * Right-to-left surrounding text (Hebrew): the address and the interface stay left to right and in
 * place, and the sentence keeps its own direction.
 */
export const RightToLeft: Story = {
  decorators: [
    (Story) => (
      <div dir="rtl" lang="he">
        {Story()}
      </div>
    ),
  ],
  args: {
    address: "2001:db8::10",
    iface: "enp2s0",
    children: (parts) => (
      <>
        הדף הזה מגיע אל ה-NAS בכתובת {parts.address} דרך {parts.iface}.
      </>
    ),
  },
};

/** 320px wide: the icon stays on the first line and the sentence wraps beside it. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: LongNames.args,
};

/** Text that looks like markup renders as text. */
export const HostileHost: Story = {
  args: {
    host: '<img src=x onerror="alert(1)">',
    children: (parts) => (
      <>
        This page reaches the NAS as {parts.host}. It cannot tell through which
        interface.
      </>
    ),
  },
};
