// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { TipsProvider } from "../tip/tips-provider";
import { GlossaryTerm, HelpDisclosure, HelpPopover } from "./help";

const meta = {
  title: "Guidance/Help",
  component: HelpPopover,
  parameters: { layout: "padded" },
  args: {
    label: "What is a workgroup?",
    children: (
      <p>
        The name Windows computers use to find each other on a home network.
        Windows uses WORKGROUP unless someone changed it, so most homes keep it.
      </p>
    ),
  },
} satisfies Meta<typeof HelpPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The (?) beside a label. It opens only when pressed; Escape or a press elsewhere closes it. */
export const BesideALabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium">Workgroup</span>
      <HelpPopover {...args} />
    </div>
  ),
};

/** A technical term in running text, dotted underlined, that opens what it means. */
export const Term: Story = {
  render: () => (
    <p className="m-0 max-w-md text-sm">
      Windows and Mac sharing (
      <GlossaryTerm term="SMB" label="SMB, what it means">
        Server Message Block, the way Windows and Mac computers open folders
        over a network. Forum answers about Samba mean the same thing.
      </GlossaryTerm>
      ) is on for the whole NAS.
    </p>
  ),
};

/** Markup in a term or its meaning is shown as text. */
export const MarkupStaysText: Story = {
  render: () => (
    <p className="m-0 text-sm">
      Read about{" "}
      <GlossaryTerm term="<b>NFS</b>" label="NFS, what it means">
        {"<img src=x onerror=alert(1)> is shown as these characters."}
      </GlossaryTerm>
      .
    </p>
  ),
};

const CHOICE = (
  <>
    <p>
      Choose Windows and Mac unless a device asks for NFS. Windows, Mac, phones
      and most TV boxes open it.
    </p>
    <p>
      Linux and media players suits Linux computers and players such as Kodi set
      up for NFS. You can turn on both later on the folder&apos;s page.
    </p>
  </>
);

function Tips({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <TipsProvider show={show} seen={[]} onSeen={() => undefined}>
      {children}
    </TipsProvider>
  );
}

/** "Which should I choose?" beside a choice: with tips on, a disclosure under the question. */
export const WhichShouldIChoose: Story = {
  render: () => (
    <Tips show>
      <HelpDisclosure question="Which should I choose?">
        {CHOICE}
      </HelpDisclosure>
    </Tips>
  ),
};

/** With tips off it folds into its (?), with the same name and the same answer. */
export const WhichShouldIChooseTipsOff: Story = {
  render: () => (
    <Tips show={false}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">
          How will computers reach it?
        </span>
        <HelpDisclosure question="Which should I choose?">
          {CHOICE}
        </HelpDisclosure>
      </div>
    </Tips>
  ),
};
