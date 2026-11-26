// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { MotionScope } from "../motion/motion-scope";
import { StatusLabel } from "../status/status";
import { Crossfade } from "./crossfade";

const meta = {
  title: "Motion/Crossfade",
  component: Crossfade,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Crossfade>;
export default meta;
type Story = StoryObj<typeof meta>;

function HealthDemo({ reduced }: { reduced?: "crossfade" | "cut" }) {
  const [warning, setWarning] = React.useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setWarning((w) => !w);
        }}
      >
        {warning ? "Clear the warning" : "Report a warning on sdb"}
      </Button>
      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
        Disk sdb:{" "}
        <Crossfade contentKey={warning ? "warning" : "ok"} reduced={reduced}>
          {warning ? (
            <StatusLabel status="warning">Warning</StatusLabel>
          ) : (
            <StatusLabel status="ok">OK</StatusLabel>
          )}
        </Crossfade>
      </p>
    </div>
  );
}

/**
 * A disk's state changes: the new word fades in over the old one in 160ms, in the same place, so
 * nothing beside it moves. Nothing happens when the story first draws.
 */
export const StateChange: Story = {
  args: { contentKey: "ok", children: null },
  render: () => <HealthDemo />,
};

/**
 * The same change inside a reduced scope: the default keeps the 160ms fade, because a fade is not
 * travel.
 */
export const ReducedKeepsTheFade: Story = {
  args: { contentKey: "ok", children: null },
  render: () => (
    <MotionScope reduced>
      <HealthDemo />
    </MotionScope>
  ),
};

/** With `reduced="cut"` the change is instant under reduced motion; the word says it. */
export const ReducedCut: Story = {
  args: { contentKey: "ok", children: null },
  render: () => (
    <MotionScope reduced>
      <HealthDemo reduced="cut" />
    </MotionScope>
  ),
};

/** A whole sentence swapping, as the dashboard's answer does when something needs the person. */
export const LongSentence: Story = {
  args: { contentKey: "ok", children: null },
  render: function Sentence() {
    const [attention, setAttention] = React.useState(false);
    return (
      <div className="flex max-w-md flex-col items-start gap-3">
        <Button
          variant="neutral"
          size="sm"
          onClick={() => {
            setAttention((a) => !a);
          }}
        >
          {attention ? "Resolve it" : "Fill the Media file system"}
        </Button>
        <Crossfade
          contentKey={attention ? "attention" : "ok"}
          className="text-title"
        >
          {attention
            ? "One thing needs you: Media is 97 % full and has 12 GiB left."
            : "Everything is working."}
        </Crossfade>
      </div>
    );
  },
};
