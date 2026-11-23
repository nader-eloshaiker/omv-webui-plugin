// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { EmptyState } from "../empty-state/empty-state";
import { ImpactLine } from "../impact-line/impact-line";
import { Identifier } from "../text/identifier";
import { IsolatedIdentifier } from "../text/isolated-identifier";
import {
  FirewallRuleList,
  type FirewallAction,
  type FirewallRuleListLabels,
  type FirewallRuleListProps,
  type FirewallRuleRow,
} from "./firewall-rule-list";

// The English words of phase 5 network design 11.3 and 11.10 (`firewall.*`). In the app each row's
// words come from `network/ruleWords.ts`.
const labels: FirewallRuleListLabels = {
  name: "Firewall rules",
  columns: {
    position: "#",
    then: "Then",
    traffic: "Traffic",
    peer: "From / To",
    note: "Note",
    actions: "Actions",
  },
  actions: {
    allow: "Allow",
    refuse: "Refuse",
    ignore: "Ignore",
    log: "Note in the log",
    count: "Count only",
  },
  moveUp: (n) => `Move rule ${String(n)} up`,
  moveDown: (n) => `Move rule ${String(n)} down`,
  alreadyFirst: "Already first",
  alreadyLast: "Already last",
  change: "Change…",
  changeName: (n) => `Change rule ${String(n)}`,
  delete: "Delete…",
  deleteName: (n) => `Delete rule ${String(n)}`,
  moved: (from, to) => `Rule ${String(from)} is now rule ${String(to)}.`,
  orderUnsaved: "The new order is not saved.",
  discard: "Discard",
};

const ip = (value: string) => <IsolatedIdentifier value={value} />;

const RULES: FirewallRuleRow[] = [
  {
    id: "self",
    action: "allow",
    traffic: "Coming in, any kind",
    peer: "Any computer",
    note: "This NAS talking to itself",
  },
  {
    id: "replies",
    action: "allow",
    traffic: "Coming in, any kind",
    peer: "Any computer",
    note: "Replies to connections this NAS starts",
  },
  {
    id: "web",
    action: "allow",
    traffic: "Coming in, TCP to port 80 (this web interface)",
    peer: <>Computers on {ip("192.0.2.0/24")} (256 addresses)</>,
  },
  {
    id: "ssh",
    action: "allow",
    traffic: "Coming in, TCP to port 22 (SSH)",
    peer: <>The computer at {ip("192.0.2.10")}</>,
    note: "The office laptop",
  },
  {
    id: "smb-guest",
    action: "refuse",
    traffic: "Coming in, TCP to port 445 (Windows and Mac sharing)",
    peer: (
      <>
        Computers from {ip("192.0.2.100")} to {ip("192.0.2.150")}
      </>
    ),
    note: "Guest devices",
  },
  {
    id: "log-nfs",
    action: "log",
    traffic: "Coming in, TCP to port 2049 (NFS)",
    peer: <>Every computer except computers on {ip("192.0.2.0/24")}</>,
  },
  {
    id: "classic",
    action: "count",
    traffic: "Coming in, not TCP (set in the classic interface)",
    peer: <>Any computer, to the NAS&apos;s address {ip("192.0.2.10")}</>,
    note: (
      <>
        Other options: <Identifier dir="ltr">-m limit --limit 5/min</Identifier>{" "}
        (set in the classic interface)
      </>
    ),
  },
  {
    id: "rest",
    action: "ignore",
    traffic: "Coming in, any kind",
    peer: "Any computer",
  },
];

const meta = {
  title: "Components/FirewallRuleList",
  component: FirewallRuleList,
  args: {
    labels,
    rules: RULES,
    onOrderChange: () => undefined,
    onChange: () => undefined,
    onDelete: () => undefined,
  },
} satisfies Meta<typeof FirewallRuleList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the order, so moves can be tried with the keyboard and the bar appears. */
function Live({
  initial,
  saveLabel = "Save the new order",
  saveNote,
  ...props
}: Partial<FirewallRuleListProps<FirewallRuleRow>> & {
  initial: FirewallRuleRow[];
}) {
  const [rules, setRules] = React.useState(initial);
  return (
    <FirewallRuleList
      labels={labels}
      onChange={() => undefined}
      onDelete={() => undefined}
      {...props}
      rules={rules}
      onOrderChange={setRules}
      unsaved={rules !== initial}
      saveLabel={saveLabel}
      saveNote={saveNote}
      onSave={() => undefined}
      onDiscard={() => setRules(initial)}
    />
  );
}

/**
 * The list with the two fixed rules, every action's icon (neutral, of different shapes: Allow is not
 * green, Refuse is not red), a range, an exception and values set in the classic interface. Move a
 * rule with the keyboard: focus stays on the same button of the moved row.
 */
export const Rules: Story = {
  render: () => <Live initial={RULES} />,
};

export const NoRules: Story = {
  render: () => (
    <Live
      initial={[]}
      empty={
        <EmptyState
          title="No firewall rules"
          action={<Button variant="neutral">Add a rule…</Button>}
        >
          Every computer that can reach the NAS can use all of its services. Add
          a rule to refuse or allow traffic.
        </EmptyState>
      }
    />
  ),
};

/** One rule: both of its move buttons are unavailable and say why. */
export const OneRule: Story = {
  render: () => <Live initial={RULES.slice(3, 4)} />,
};

const ACTIONS: FirewallAction[] = ["allow", "refuse", "ignore", "log", "count"];
const MANY: FirewallRuleRow[] = Array.from({ length: 200 }, (_, index) => ({
  id: `rule-${String(index)}`,
  action: ACTIONS[index % ACTIONS.length] ?? "allow",
  traffic: `Coming in, TCP to port ${String(1024 + index)}`,
  peer: <>The computer at {ip(`192.0.2.${String((index % 250) + 1)}`)}</>,
  note: index % 7 === 0 ? `Media player ${String(index)}` : undefined,
}));

/** 200 rules: the table scrolls in its own region; the position column stays in view sideways. */
export const TwoHundredRules: Story = {
  render: () => <Live initial={MANY} />,
};

/** The order was changed and not saved: the bar with the caller's save button and Discard. */
export const UnsavedOrder: Story = {
  args: {
    unsaved: true,
    saveLabel: "Save the new order",
    rules: [RULES[0], RULES[1], RULES[3], RULES[2], ...RULES.slice(4)].filter(
      (rule): rule is FirewallRuleRow => rule !== undefined,
    ),
  },
};

/** The check says May cut for the new order: the save button reads "Review the change…". */
export const UnsavedOrderMayCut: Story = {
  args: {
    unsaved: true,
    saveLabel: "Review the change…",
    saveNote: (
      <ImpactLine impact="mayCut">
        The rules may block this page for some computers: computers from{" "}
        {ip("192.0.2.100")} to {ip("192.0.2.150")}. This page cannot tell
        whether this computer is one of them.
      </ImpactLine>
    ),
    rules: [RULES[4], ...RULES.slice(0, 4), ...RULES.slice(5)].filter(
      (rule): rule is FirewallRuleRow => rule !== undefined,
    ),
  },
};

/** Saving the order: Save is busy, and nothing can be moved meanwhile. */
export const SavingTheOrder: Story = {
  args: { ...UnsavedOrder.args, saving: true },
};

/** 320px wide: the bar wraps its buttons; the table scrolls in its region, not the page. */
export const At320px: Story = {
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  args: UnsavedOrder.args,
};

/** Text that looks like markup renders as text. */
export const HostileNote: Story = {
  args: {
    rules: [
      {
        id: "hostile",
        action: "refuse",
        traffic: "Coming in, any kind",
        peer: "Any computer",
        note: '<img src=x onerror="alert(1)">',
      },
    ],
  },
};
