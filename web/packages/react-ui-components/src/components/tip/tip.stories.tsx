// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Server } from "lucide-react";
import * as React from "react";
import { Button } from "../button/button";
import { Toaster } from "../toast/toast";
import { ShowTipsSwitch } from "./show-tips-switch";
import { Tip } from "./tip";
import { TipsProvider } from "./tips-provider";
import { useHideTipsOffer } from "./use-hide-tips-offer";

/**
 * The app passes its stored "Show tips" and first-time flags; a story keeps them in its own state,
 * with a button to forget the flags so each tip can be seen again.
 */
function StoryTips({
  initialShow = true,
  children,
}: {
  initialShow?: boolean;
  children: React.ReactNode;
}) {
  const [show, setShow] = React.useState(initialShow);
  const [seen, setSeen] = React.useState<string[]>([]);
  const onSeen = React.useCallback((id: string) => {
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
  }, []);
  return (
    <TipsProvider
      show={show}
      onShowChange={setShow}
      seen={seen}
      onSeen={onSeen}
    >
      <div className="flex max-w-xl flex-col items-start gap-4">
        {children}
        <Button
          variant="plain"
          size="sm"
          onClick={() => {
            setSeen([]);
          }}
        >
          Forget which tips were seen
        </Button>
      </div>
    </TipsProvider>
  );
}

const meta = {
  title: "Guidance/Tip",
  component: Tip,
  parameters: { layout: "padded" },
  args: {
    id: "tip.first-save",
    dismissLabel: "Got it",
    dismissName: "Got it, hide the tip about the yellow bar",
    children: "Saved. Your change waits in the yellow bar until you apply it.",
  },
  render: (args) => (
    <StoryTips>
      <Tip {...args} />
    </StoryTips>
  ),
} satisfies Meta<typeof Tip>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One plain line beside what it explains: no box, no tint and no edge. "Got it" folds it up. */
export const Default: Story = {};

/** The welcome, the one tip at body size, leading with the NAS and carrying its links. */
export const Lead: Story = {
  args: {
    id: "tip.new-interface",
    size: "lead",
    icon: <Server />,
    dismissName: "Got it, hide the tip about the new interface",
    actions: (
      <Button variant="ghost" size="sm">
        What is different
      </Button>
    ),
    children:
      "Welcome to the new interface. Your settings and files are the same; only the way you see them is new.",
  },
};

/**
 * A tip that waits for its cause: it rises in after the first save (a short fade under reduced
 * motion), never when the page opens.
 */
export const AfterACause: Story = {
  render: function AfterSave(args) {
    const [saved, setSaved] = React.useState(false);
    return (
      <StoryTips>
        <Button
          variant="primary"
          onClick={() => {
            setSaved(true);
          }}
        >
          Save
        </Button>
        <Tip {...args} when={saved} />
      </StoryTips>
    );
  },
};

/** Two tips due at once: the first in reading order shows, the second after it has gone. */
export const OneAtATime: Story = {
  render: (args) => (
    <StoryTips>
      <Tip {...args} />
      <Tip
        id="tip.trace"
        dismissLabel="Got it"
        dismissName="Got it, hide the tip about pointing at the map"
      >
        Point at a folder, a disk or a way in to see what belongs to it.
      </Tip>
    </StoryTips>
  ),
};

/** A long line wraps beside its icon at a phone's width, and the button stays with it. */
export const LongLine: Story = {
  args: {
    id: "tip.palette",
    dismissName: "Got it, hide the tip about the search",
    children:
      "Press / to go anywhere: type a page, a setting, a shared folder such as Family photos from the summer of 2024, or a disk.",
  },
};

/** Markup in a tip's words is shown as text. */
export const MarkupStaysText: Story = {
  args: {
    id: "tip.trace",
    dismissName: "Got it, hide the tip about the map",
    children: "<b>Point</b> at <img src=x onerror=alert(1)> the map.",
  },
};

/** With "Show tips" off no tip shows; the switch turns them back on. */
export const TipsOff: Story = {
  render: (args) => (
    <StoryTips initialShow={false}>
      <ShowTipsSwitch
        label="Show tips"
        hint="Tips explain things the first time you meet them."
        className="w-72"
      />
      <Tip {...args} />
    </StoryTips>
  ),
};

/** "Show tips" as a row of the account menu, beside Theme and Density. */
export const SwitchRow: Story = {
  render: () => (
    <StoryTips>
      <ShowTipsSwitch
        label="Show tips"
        hint="Tips explain things the first time you meet them."
        className="w-72"
      />
    </StoryTips>
  ),
};

function OfferDemo() {
  const [offered, setOffered] = React.useState(false);
  const { offer } = useHideTipsOffer({
    offered,
    onOffered: () => {
      setOffered(true);
    },
    actionLabel: "Hide tips",
  });
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          offer("Compact view on. Hide tips too?");
        }}
      >
        Switch to compact
      </Button>
      <p className="m-0 text-sm text-muted-foreground">
        {offered
          ? "The offer has been made in this browser, so it does not come again."
          : "The first switch to compact offers to hide tips too."}
      </p>
    </div>
  );
}

/**
 * The "Hide tips too?" offer: a toast, once, the first time a person shows they are a pro. It stays
 * for 8 seconds or until dismissed, and is not made while tips are off.
 */
export const HideTipsOffer: Story = {
  parameters: { matrix: false },
  render: () => (
    <StoryTips>
      <OfferDemo />
      <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
    </StoryTips>
  ),
};
