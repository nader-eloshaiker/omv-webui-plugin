// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Identifier } from "../text/identifier";
import { CopyButton } from "./copy-button";

const PATH = "/srv/dev-disk-by-uuid-0e8c4b1f-6a2d-4c3e-9f1a-5b7d2e8c9a01/media";

const meta = {
  title: "Components/CopyButton",
  component: CopyButton,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
  args: {
    text: PATH,
    label: "Copy full path of media",
    copiedLabel: "Copied",
    selectedLabel: "Selected. Press Ctrl+C to copy.",
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In a table cell, after the path: only the icon, with its name as the tooltip. */
export const Idle: Story = {
  render: (args) => (
    <p className="flex flex-wrap items-center gap-1 font-mono text-sm">
      <Identifier>{PATH}</Identifier>
      <CopyButton {...args} />
    </p>
  ),
};

export const WithWords: Story = {
  args: {
    text: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq3x8Lr0Zk9vVxQm2uYtP4Jc7sWnE1fHbD6aR5oLmKz laptop-2024",
    label: "Copy key laptop-2024",
    size: "sm",
    children: "Copy key",
  },
};

/**
 * After a press where the clipboard works (HTTPS): the check mark and "Copied", announced. Shown here
 * by pressing the button on load; Storybook itself runs on a secure origin.
 */
export const Copied: Story = {
  render: (args) => <AutoPress {...args} />,
};

/**
 * Where the browser has no clipboard (a page over plain HTTP): the value in a read-only field,
 * selected, and "Press Ctrl+C to copy". Shown here by hiding the clipboard from the button.
 */
export const FallbackSelected: Story = {
  render: (args) => <AutoPress {...args} withoutClipboard />,
};

function AutoPress({
  withoutClipboard = false,
  ...args
}: React.ComponentProps<typeof CopyButton> & { withoutClipboard?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let restore: (() => void) | undefined;
    if (withoutClipboard) {
      const own = Object.getOwnPropertyDescriptor(window, "isSecureContext");
      Object.defineProperty(window, "isSecureContext", {
        configurable: true,
        get: () => false,
      });
      restore = () => {
        if (own) {
          Object.defineProperty(window, "isSecureContext", own);
        } else {
          Reflect.deleteProperty(window, "isSecureContext");
        }
      };
    }
    ref.current?.querySelector("button")?.click();
    return () => restore?.();
  }, [withoutClipboard]);
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-1">
      <Identifier className="text-sm">{PATH}</Identifier>
      <CopyButton {...args} />
    </div>
  );
}
