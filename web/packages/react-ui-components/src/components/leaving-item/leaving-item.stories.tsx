// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Button } from "../button/button";
import { Card, CardContent, CardHeader, CardTitle } from "../card/card";
import { StatusLabel } from "../status/status";
import { LeavingItem } from "./leaving-item";
import { useLeavingItems } from "./use-leaving-items";

interface Row {
  id: string;
  status: "critical" | "warning";
  title: string;
  body: string;
}

const ROWS: Row[] = [
  {
    id: "fs-data",
    status: "critical",
    title: "Data is full",
    body: "Nothing more can be saved on it until you delete or move some files.",
  },
  {
    id: "disk-sdb",
    status: "warning",
    title: "Disk sdb reported a problem",
    body: "A few damaged areas (bad sectors). Keep an eye on it.",
  },
  {
    id: "fs-media",
    status: "warning",
    title: "Media is almost full",
    body: "It is 91% full, at or above its warning level of 85%.",
  },
  {
    id: "restart",
    status: "warning",
    title: "The NAS needs a restart",
    body: "Updates finish installing when it restarts.",
  },
];

function Demo({ columns }: { columns: "one" | "grid" }) {
  const [rows, setRows] = React.useState(ROWS);
  const { entries, left } = useLeavingItems(rows, (row) => row.id);
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="neutral"
          disabled={rows.length === 0}
          onClick={() => {
            setRows((r) => r.slice(1));
          }}
        >
          Resolve the first
        </Button>
        <Button
          variant="neutral"
          onClick={() => {
            setRows(ROWS);
          }}
        >
          Bring them back
        </Button>
      </div>
      <ul
        aria-label="Needs attention"
        className={
          columns === "one"
            ? "flex w-full max-w-lg flex-col gap-gutter [--leave-gap:var(--spacing-gutter)]"
            : "grid w-full grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-gutter"
        }
      >
        {entries.map((entry, i) => (
          <LeavingItem
            key={entry.key}
            leaving={entry.leaving}
            onLeft={() => {
              left(entry.key);
            }}
          >
            <Card
              tone={entry.item.status}
              className="animate-settle-in stagger"
              style={{ "--stagger-index": i } as React.CSSProperties}
            >
              <CardHeader>
                <StatusLabel status={entry.item.status}>
                  {entry.item.status === "critical" ? "Critical" : "Warning"}
                </StatusLabel>
              </CardHeader>
              <CardContent className="gap-1">
                <CardTitle level={3}>{entry.item.title}</CardTitle>
                <p className="text-muted-foreground">{entry.item.body}</p>
              </CardContent>
            </Card>
          </LeavingItem>
        ))}
      </ul>
    </div>
  );
}

const meta = {
  title: "Motion/Leaving item",
  component: LeavingItem,
  parameters: { layout: "padded" },
} satisfies Meta<typeof LeavingItem>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A resolved card leaves: it fades and gives up its height on the exit curve, and the gap closes
 * with it (`--leave-gap` on the list), so the cards below close up instead of jumping. Under reduced
 * motion it is simply gone.
 */
export const OneColumn: Story = {
  args: { leaving: false, onLeft: () => undefined },
  render: () => <Demo columns="one" />,
};

/** In a grid of several columns the card fades and collapses; the next ones then take its place. */
export const InAGrid: Story = {
  args: { leaving: false, onLeft: () => undefined },
  render: () => <Demo columns="grid" />,
};
