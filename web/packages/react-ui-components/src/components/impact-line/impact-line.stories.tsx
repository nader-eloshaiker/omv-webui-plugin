// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { IsolatedIdentifier } from "../text/isolated-identifier";
import { ImpactLine, type ImpactClass } from "./impact-line";

// The English words of phase 5 network design 0.5 and 1.9 (`network.impact.*`, `netChange.effect.*`).
const WORDS: Record<ImpactClass, React.ReactNode> = {
  none: "This page keeps working.",
  brief:
    "This page may stop responding for a few seconds while the network restarts, then carries on.",
  moves: (
    <>
      This page stops working at <IsolatedIdentifier value="192.0.2.10" />. The
      NAS will be at <IsolatedIdentifier value="192.0.2.20" />.
    </>
  ),
  mayCut:
    "If this setting is wrong, this page loses the NAS, and you need another way in to put it right.",
  refused: (
    <>
      This page reaches the NAS over IPv4 through{" "}
      <IsolatedIdentifier value="enp2s0" />. Connect this computer through
      another interface first, then change <IsolatedIdentifier value="enp2s0" />{" "}
      from there.
    </>
  ),
};

const meta = {
  title: "Components/ImpactLine",
  component: ImpactLine,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
  args: { impact: "none", children: WORDS.none },
} satisfies Meta<typeof ImpactLine>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Not affected: a screen with a check mark. */
export const None: Story = {};

/** Brief interruption: the pause shape. */
export const Brief: Story = {
  args: { impact: "brief", children: WORDS.brief },
};

/** Moves: an arrow, with the specific line. */
export const Moves: Story = {
  args: {
    impact: "moves",
    children: WORDS.moves,
    detail: (
      <>
        Open the NAS at its new address afterwards:{" "}
        <IsolatedIdentifier value="http://192.0.2.20/ui/" />
      </>
    ),
  },
};

export const MovesWithoutDetail: Story = {
  args: { impact: "moves", children: WORDS.moves },
};

/** May cut: the warning shape, in the neutral ink. */
export const MayCut: Story = {
  args: {
    impact: "mayCut",
    children: WORDS.mayCut,
    detail:
      "Your router chooses the NAS's new address, and this page cannot know it in advance. Many routers give the same address back.",
  },
};

export const MayCutWithoutDetail: Story = {
  args: { impact: "mayCut", children: WORDS.mayCut },
};

/** Refused: a barred circle, with the reason. */
export const Refused: Story = {
  args: { impact: "refused", children: WORDS.refused },
};

/** Every class, one under the other: told apart by shape and words, never by colour. */
export const EveryClass: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(Object.keys(WORDS) as ImpactClass[]).map((impact) => (
        <ImpactLine key={impact} impact={impact} live={false}>
          {WORDS[impact]}
        </ImpactLine>
      ))}
    </div>
  ),
};

/**
 * Under a form's buttons, live as the form changes: the class line is a polite region and the Save
 * button's description, and the button's own words follow the class (design 5.2, 19.2). Nothing
 * moves, so reduced motion changes nothing here.
 */
export const LiveUnderTheButtons: Story = {
  render: function Render() {
    const order: ImpactClass[] = ["none", "brief", "mayCut", "moves"];
    const [step, setStep] = React.useState(0);
    const impact = order[step % order.length] ?? "none";
    const review = impact === "moves" || impact === "mayCut";
    return (
      <div className="flex flex-col gap-3">
        <Button
          variant="neutral"
          size="sm"
          className="self-start"
          onClick={() => setStep((n) => n + 1)}
        >
          Change a field (story control)
        </Button>
        <div className="flex gap-2">
          <Button variant="neutral">Cancel</Button>
          <Button aria-describedby="impact-under-save">
            {review ? "Review the change…" : "Save"}
          </Button>
        </div>
        <ImpactLine id="impact-under-save" impact={impact}>
          {WORDS[impact]}
        </ImpactLine>
      </div>
    );
  },
};

/** 320px wide: the words wrap beside the icon. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: Moves.args,
};
