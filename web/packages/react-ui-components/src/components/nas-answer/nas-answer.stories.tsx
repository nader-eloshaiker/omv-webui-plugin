// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalLink } from "lucide-react";
import * as React from "react";
import { NAS_ANSWER_WORDS } from "../../fixtures/nas-words";
import { Button } from "../button/button";
import { TipsProvider } from "../tip/tips-provider";
import { NasAnswer } from "./nas-answer";
import {
  nasAnswerState,
  nasAnswerTone,
  nasAnswerWords,
} from "./nas-answer-model";
import { WelcomeLine } from "./welcome-line";

/**
 * The dashboard's answer (rethink 6.2 A): one full sentence and its reason, the state's mark beside
 * it. The words come from `nasAnswerState` and the app's catalogue: a read that failed or has not
 * arrived never reads "Everything is working".
 */
const meta = {
  title: "Patterns/NAS answer",
  component: NasAnswer,
  args: {
    status: "ok",
    title: "Everything is working.",
    reason:
      "The disks reported no problem at 10:31. All four drives have space.",
  },
} satisfies Meta<typeof NasAnswer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EverythingIsWorking: Story = {};

/** Something needs you: the count as a sentence; the first row of what needs you says the reason. */
export const NeedsYou: Story = {
  args: {
    status: "warning",
    title: "Four things need you.",
    reason: undefined,
  },
};

export const DiskFailing: Story = {
  args: {
    status: "critical",
    title: "Two things need you.",
    reason: "Disk sda is failing. Copy what matters off Data drive now.",
  },
};

/** A new NAS: the NAS's mark, and nothing claimed about health. */
export const Welcome: Story = {
  args: {
    status: "ok",
    variant: "welcome",
    title: "Welcome to your NAS.",
    reason: "It is running. Here is what is in it, and what to set up first.",
  },
};

/** A read failed: Unknown, and which part could not be read (fail-closed). */
export const ReadFailed: Story = {
  args: {
    status: "unknown",
    ...nasAnswerWords({ kind: "unread", failed: ["disks"] }, NAS_ANSWER_WORDS),
  },
};

/** The first read in flight. */
export const Loading: Story = {
  args: { status: "unknown", title: "Reading the NAS…", loading: true },
};

const ALL_READ = {
  disks: "ok",
  health: "ok",
  storage: "ok",
  folders: "ok",
  ways: "ok",
  network: "ok",
  system: "ok",
} as const;

/** The answer changes: the mark's shape and the words crossfade (7.6). */
export const AProblemArrives: Story = {
  parameters: { matrix: false },
  render: function Arrives() {
    const [bad, setBad] = React.useState(false);
    const state = nasAnswerState({
      reads: ALL_READ,
      needs: bad ? [{ health: "warning" }] : [],
      newNas: false,
      storage: { total: 4, withSpace: 4 },
      checkedAt: "10:31",
    });
    const words = nasAnswerWords(
      state,
      NAS_ANSWER_WORDS,
      "Disk sdb reports a problem. Backup keeps working.",
    );
    return (
      <div className="flex flex-col items-start gap-4">
        <Button
          variant="neutral"
          size="sm"
          onClick={() => {
            setBad((b) => !b);
          }}
        >
          {bad ? "It resolves" : "A problem arrives"}
        </Button>
        <NasAnswer
          status={nasAnswerTone(state)}
          title={words.title}
          reason={words.reason}
        />
      </div>
    );
  },
};

/**
 * The one-line welcome on an existing NAS seen in the new interface (P.2): a first-time `Tip`, so it
 * shows once and folds away on "Got it" (7.2, "The welcome line leaves"). Compact density drops the
 * second sentence.
 */
export const WelcomeToTheNewInterface: Story = {
  render: function WelcomeStory() {
    const [seen, setSeen] = React.useState<string[]>([]);
    return (
      <TipsProvider
        show
        seen={seen}
        onSeen={(id) => {
          setSeen((s) => [...s, id]);
        }}
      >
        <div className="flex flex-col gap-6">
          <WelcomeLine
            id="tip.new-interface"
            dismissLabel="Got it"
            dismissName="Got it, hide the welcome to the new interface"
            detail="Your settings and files are the same; only the way you see them is new."
            more={{
              label: "What is different",
              items: [
                "The menu groups are the ones you know.",
                "Press / to go anywhere, or to run an action by name.",
              ],
            }}
            actions={
              <Button variant="ghost" size="sm">
                Open the classic interface
                <ExternalLink aria-hidden="true" />
              </Button>
            }
          >
            Welcome to the new interface.
          </WelcomeLine>
          <NasAnswer
            status="ok"
            title="Everything is working."
            reason="The disks reported no problem at 10:31. All four drives have space."
          />
          {seen.length > 0 ? (
            <Button
              variant="neutral"
              size="sm"
              className="self-start"
              onClick={() => {
                setSeen([]);
              }}
            >
              Show the welcome again
            </Button>
          ) : null}
        </div>
      </TipsProvider>
    );
  },
};
