// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "../disclosure/disclosure";
import {
  RecoveryCard,
  type RecoveryCardProps,
  type RecoverySteps,
} from "./recovery-card";

// The English words of phase 5 network design 1.6 and 1.9 (`netRecover.*`). In the app they are in
// the main bundle, never a catalogue file loaded later: the card must render with no network.
const TITLES = {
  lost: "This page cannot reach the NAS since the change.",
  unknownAddress:
    "The NAS may have been given a new address by your router, and this page cannot know it.",
  newFails: "The NAS does not open at its new address.",
};

const STEPS: Required<RecoverySteps> = {
  wait: {
    text: "Wait two minutes, then try again.",
    tryAgainLabel: "Try again",
    onTryAgain: () => undefined,
  },
  newAddress: {
    url: "http://192.0.2.20/ui/",
    text: (url) => <>Open the NAS at its new address: {url}</>,
    copyLabel: "Copy the new address",
    note: "This computer must be on the same network as the new address. If you mistyped it, it may be on another network.",
  },
  find: {
    name: "nas",
    url: "http://nas.local/ui/",
    text: ({ name, url }) => (
      <>
        Find the NAS&apos;s address: your router&apos;s list of connected
        devices shows it under the name {name}. On most computers you can also
        try {url}.
      </>
    ),
    copyLabel: "Copy http://nas.local/ui/",
  },
  newName: {
    url: "http://backup-nas/ui/",
    address: "http://192.0.2.10/ui/",
    text: ({ url, address }) => (
      <>
        Open the NAS by its new name: {url}, or at its address {address}.
      </>
    ),
    urlCopyLabel: "Copy the address with the new name",
    addressCopyLabel: "Copy the address",
  },
  firewall: {
    text: "If a firewall rule blocks this computer, use a computer the rules still let in, then change the rules.",
  },
  console: {
    intro:
      "If nothing else works, connect a screen and keyboard to the NAS (or open the virtual machine's console), sign in as root, and:",
    commands: [
      {
        id: "firstaid",
        command: "omv-firstaid",
        text: (command) => (
          <>
            type {command} and choose Configure network interface. It replaces
            every network setting with the one port you set up there: bonds,
            VLANs, bridges and Wi-Fi settings are removed and must be made
            again.
          </>
        ),
      },
    ],
  },
  note: {
    text: "The note you copied before applying has the settings that worked.",
  },
};

const FIREWALL_CONSOLE: RecoverySteps["console"] = {
  intro: STEPS.console.intro,
  commands: [
    {
      id: "stopFirewall",
      command: "systemctl stop openmediavault-firewall",
      text: (command) => (
        <>
          type {command}. This removes every firewall rule until the NAS
          restarts or the next change is applied. Then open this page and change
          the rules.
        </>
      ),
    },
  ],
};

const base = {
  copy: {
    copiedLabel: "Copied",
    selectedLabel: "Selected. Press Ctrl+C to copy.",
  },
  newTabLabel: "(opens in a new tab)",
} satisfies Partial<RecoveryCardProps>;

const meta = {
  title: "Components/RecoveryCard",
  component: RecoveryCard,
  decorators: [(Story) => <div className="max-w-2xl">{Story()}</div>],
  args: {
    ...base,
    variant: "lost",
    title: TITLES.lost,
    steps: { wait: STEPS.wait, console: STEPS.console, note: STEPS.note },
  },
} satisfies Meta<typeof RecoveryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Lost after an interface change kept its address: wait, then the console. */
export const Lost: Story = {};

/** The router chooses the new address: find it by name; `nas.local` is text, never a link. */
export const UnknownAddress: Story = {
  args: {
    variant: "unknownAddress",
    title: TITLES.unknownAddress,
    steps: {
      wait: STEPS.wait,
      find: STEPS.find,
      console: STEPS.console,
      note: STEPS.note,
    },
  },
};

/** The new fixed address does not open; no link, since the caller passed none. */
export const NewAddressFails: Story = {
  args: {
    variant: "newFails",
    title: TITLES.newFails,
    steps: {
      wait: STEPS.wait,
      newAddress: STEPS.newAddress,
      console: STEPS.console,
    },
  },
};

/** With the link the caller allows for an address typed in this session (P7). */
export const NewAddressWithLink: Story = {
  args: {
    variant: "newFails",
    title: TITLES.newFails,
    steps: {
      wait: STEPS.wait,
      newAddress: {
        ...STEPS.newAddress,
        link: {
          href: "http://192.0.2.20/ui/",
          label: "Open the NAS at its new address",
        },
      },
      console: STEPS.console,
    },
  },
};

/** A changed name: the new name may be a link (typed here); the address read from the NAS is text. */
export const NameChanged: Story = {
  args: {
    variant: "lost",
    title: TITLES.lost,
    steps: {
      wait: STEPS.wait,
      newName: {
        ...STEPS.newName,
        link: {
          href: "http://backup-nas/ui/",
          label: "Open the NAS by its new name",
        },
      },
      console: STEPS.console,
    },
  },
};

/** A firewall change: its own step and its own command. */
export const FirewallChange: Story = {
  args: {
    variant: "lost",
    title: TITLES.lost,
    steps: {
      wait: STEPS.wait,
      firewall: STEPS.firewall,
      console: FIREWALL_CONSOLE,
      note: STEPS.note,
    },
  },
};

/** Every step on, numbered in reading order. */
export const EveryStep: Story = {
  args: { steps: STEPS },
};

/** Only the console step: every other step off. */
export const ConsoleOnly: Story = {
  args: { steps: { console: STEPS.console } },
};

/** Try again is running: the button keeps focus and says it is busy. */
export const TryingAgain: Story = {
  args: {
    steps: {
      wait: { ...STEPS.wait, busy: true },
      console: STEPS.console,
    },
  },
};

/** Read ahead of time, inside the review summary's Disclosure: not announced. */
export const InTheReviewSummary: Story = {
  render: (args) => (
    <Disclosure defaultOpen>
      <DisclosureTrigger>
        If this page cannot reach the NAS afterwards
      </DisclosureTrigger>
      <DisclosurePanel>
        <RecoveryCard
          {...args}
          headingLevel={3}
          announce={false}
          title="What to do if this page cannot reach the NAS"
        />
      </DisclosurePanel>
    </Disclosure>
  ),
  args: {
    steps: {
      wait: STEPS.wait,
      newAddress: STEPS.newAddress,
      console: STEPS.console,
    },
  },
};

/** 320px wide: the steps and the long command wrap; nothing scrolls sideways. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: {
    steps: {
      wait: STEPS.wait,
      find: STEPS.find,
      firewall: STEPS.firewall,
      console: FIREWALL_CONSOLE,
    },
  },
};
