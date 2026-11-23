// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  PORT_ANY,
  PORT_OTHER,
  PortField,
  type PortFieldProps,
  type PortFieldValue,
} from "./port-field";

// The English words of phase 5 network design 11.3, 11.4 and 11.10 (`fwRule.*`, `firewall.service.*`).
const labels = {
  label: "Port",
  any: "Any port",
  other: "Another port or range…",
  field: "Port or range",
  fieldPlaceholder: "1024-65535",
  fieldHint: "One port, such as 22, or a range, such as 1024-65535.",
};

const KNOWN = [
  { value: "22", label: "22 (SSH)" },
  { value: "80", label: "80 (this web interface)" },
  { value: "443", label: "443 (secure web)" },
  { value: "445", label: "445 (Windows and Mac sharing)" },
  { value: "139", label: "139 (older Windows sharing)" },
  { value: "2049", label: "2049 (NFS)" },
  { value: "111", label: "111 (NFS helper)" },
  { value: "873", label: "873 (rsync server)" },
  { value: "53", label: "53 (name servers)" },
  { value: "123", label: "123 (the clock)" },
  { value: "25", label: "25 (email)" },
  { value: "587", label: "587 (email)" },
];

const meta = {
  title: "Components/PortField",
  component: PortField,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    labels,
    knownPorts: KNOWN,
    value: { choice: PORT_ANY, text: "" },
    onValueChange: () => undefined,
  },
} satisfies Meta<typeof PortField>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live({
  initial,
  ...props
}: Partial<PortFieldProps> & { initial: PortFieldValue }) {
  const [value, setValue] = React.useState(initial);
  return (
    <PortField
      labels={labels}
      knownPorts={KNOWN}
      {...props}
      value={value}
      onValueChange={setValue}
    />
  );
}

/** The default for a new rule. */
export const AnyPort: Story = {
  render: () => <Live initial={{ choice: PORT_ANY, text: "" }} />,
};

export const KnownPort: Story = {
  render: () => <Live initial={{ choice: "445", text: "" }} />,
};

export const AnotherPort: Story = {
  render: () => <Live initial={{ choice: PORT_OTHER, text: "8080" }} />,
};

export const AnotherRange: Story = {
  render: () => <Live initial={{ choice: PORT_OTHER, text: "1024-65535" }} />,
};

export const InvalidPort: Story = {
  render: () => (
    <Live
      initial={{ choice: PORT_OTHER, text: "70000" }}
      error="Write one port from 1 to 65535, or a range such as 1024-65535."
    />
  ),
};

export const InvalidRange: Story = {
  render: () => (
    <Live
      initial={{ choice: PORT_OTHER, text: "65535-1024" }}
      error="Write one port from 1 to 65535, or a range such as 1024-65535."
    />
  ),
};

/** Ping or any kind of traffic: no port, and the line says why. */
export const UnavailableForPing: Story = {
  render: () => (
    <Live
      initial={{ choice: PORT_ANY, text: "" }}
      unavailableReason="A port can be chosen only for TCP or UDP."
    />
  ),
};

/** While the rule is being saved. */
export const Disabled: Story = {
  render: () => <Live initial={{ choice: PORT_OTHER, text: "22" }} disabled />,
};

/** 320px wide. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  render: () => (
    <Live
      initial={{ choice: PORT_OTHER, text: "1024-65535" }}
      error="Write one port from 1 to 65535, or a range such as 1024-65535."
    />
  ),
};
