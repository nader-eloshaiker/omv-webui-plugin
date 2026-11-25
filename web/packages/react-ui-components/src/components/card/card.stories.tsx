// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Clock } from "lucide-react";
import * as React from "react";
import { Button } from "../button/button";
import { CapacityMeter } from "../capacity-meter/capacity-meter";
import { ExternalLink } from "../external-link/external-link";
import {
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "../fact-list/fact-list";
import { StatusLabel } from "../status/status";
import {
  Card,
  CardContent,
  CardDescription,
  CardExternalMark,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Components/Card",
  component: Card,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta;

export default meta;
// Card's props are a union (`opens`), which Storybook's args cannot infer; every story renders.
type Story = StoryObj;

export const Default: Story = {
  render: function DefaultStory() {
    const storyId = React.useId();
    return (
      <Card render={<section aria-labelledby={`${storyId}-card-system`} />}>
        <CardHeader>
          <CardTitle id={`${storyId}-card-system`}>System</CardTitle>
        </CardHeader>
        <CardContent>
          <FactList>
            <FactListItem>
              <FactListLabel>Name</FactListLabel>
              <FactListValue variant="identifier">nas01</FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>openmediavault version</FactListLabel>
              <FactListValue>8.6.1-1 (Synchrony)</FactListValue>
            </FactListItem>
            <FactListItem>
              <FactListLabel>Running for</FactListLabel>
              <FactListValue>12 days, 4 hours</FactListValue>
            </FactListItem>
          </FactList>
        </CardContent>
      </Card>
    );
  },
};

export const WithDescriptionAndFooter: Story = {
  render: function WithDescriptionAndFooterStory() {
    const storyId = React.useId();
    return (
      <Card render={<section aria-labelledby={`${storyId}-card-setup`} />}>
        <CardHeader>
          <CardTitle id={`${storyId}-card-setup`}>Set up your NAS</CardTitle>
          <CardDescription>
            A few things to check after installing. Each item is read from the
            NAS&apos;s current settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Items go here.</p>
        </CardContent>
        <CardFooter>
          <Button variant="neutral">Hide the checklist</Button>
          <span className="text-sm text-muted-foreground">
            Hides it for every administrator, and hides the classic
            interface&apos;s welcome panel too.
          </span>
        </CardFooter>
      </Card>
    );
  },
};

export const WithFooterLink: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <CapacityMeter
          label="Processor"
          value={12}
          max={100}
          valueText="12% in use"
        />
        <CapacityMeter
          label="Memory"
          value={3.1}
          max={7.6}
          valueText="3.1 GiB of 7.6 GiB in use (41%)"
        />
      </CardContent>
      <CardFooter>
        <ExternalLink
          href="/#/diagnostics/system-information"
          newTabLabel="(opens in a new tab)"
          className="text-sm"
        >
          More system details in the classic interface
        </ExternalLink>
      </CardFooter>
    </Card>
  ),
};

/** The first read in flight: the same card, skeletons of its real height, and the busy region named. */
export const LoadingContent: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>System</CardTitle>
      </CardHeader>
      <CardContent aria-busy="true">
        <span role="status" className="sr-only">
          Loading the system information…
        </span>
        <FactListSkeleton rows={7} />
      </CardContent>
    </Card>
  ),
};

/** A row of the attention list: a card per item, its own words, one action. */
export const AttentionRow: Story = {
  render: () => (
    <ul aria-label="Needs attention" className="flex flex-col gap-2">
      <Card render={<li />}>
        <CardContent className="flex-row flex-wrap items-start gap-3">
          <StatusLabel status="warning">Warning</StatusLabel>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p>
              A restart is needed to finish installing updates. Restarting is in
              the classic interface, in the power menu at the top right.
            </p>
            <ExternalLink href="/#/" newTabLabel="(opens in a new tab)">
              Open the classic interface
            </ExternalLink>
          </div>
        </CardContent>
      </Card>
    </ul>
  ),
};

export const LongContent: Story = {
  render: () => (
    <Card className="max-w-xs">
      <CardHeader>
        <CardTitle>
          Gemeinsam genutzte Ordner auf allen angeschlossenen Datenträgern
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="[overflow-wrap:anywhere]">
          {"<img src=x onerror=alert(1)> stays text: "}
          /srv/dev-disk-by-uuid-0e8c4b1f-6a2d-4c3e-9f1a-5b7d2e8c9a01/media
        </p>
      </CardContent>
    </Card>
  ),
};

/**
 * Cards that act (foundation 13): the whole card is the link. Its title says where it goes, the
 * hover and the press say that it acts; no arrow or chevron (style guide 10).
 */
export const ActionCards: Story = {
  render: () => (
    <ul aria-label="Storage" className="grid gap-gutter sm:grid-cols-2">
      <li className="flex">
        <Card variant="action" render={<a href="#disks" />} className="flex-1">
          <CardHeader className="flex-nowrap items-center pb-card">
            <div className="flex min-w-0 flex-col gap-0.5">
              <CardTitle level={3}>Disks</CardTitle>
              <p className="text-caption text-tertiary-foreground tabular-nums">
                4 disks, 14.6&nbsp;TiB in all
              </p>
            </div>
          </CardHeader>
        </Card>
      </li>
      <li className="flex">
        <Card variant="action" render={<a href="#shares" />} className="flex-1">
          <CardHeader className="flex-nowrap items-center pb-card">
            <div className="flex min-w-0 flex-col gap-0.5">
              <CardTitle level={3}>Shared folders</CardTitle>
              <p className="text-caption text-tertiary-foreground tabular-nums">
                6 folders, 3 shared with Windows
              </p>
            </div>
          </CardHeader>
        </Card>
      </li>
    </ul>
  ),
};

/**
 * A card about a thing in a non-OK state: its title leads with the state's icon, and its words say
 * what is wrong. The card itself is not lit, tinted or edged in the state (style guide 10).
 */
export const StateOnTheTitle: Story = {
  render: () => (
    <div className="flex flex-col gap-gutter">
      <Card>
        <CardHeader>
          <CardTitle level={3} tone="warning">
            Disk sdb is running warm
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            It is at 47&nbsp;°C, above the 45&nbsp;°C you set. Check that the
            fans are turning and that nothing blocks the air vents.
          </p>
          <Button variant="neutral" className="self-start">
            Run a quick health check
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle level={3} tone="critical">
            RAID md0 is degraded
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            One of its two disks is missing. The data is still there, but a
            second failure would lose it.
          </p>
        </CardContent>
      </Card>
    </div>
  ),
};

/** An inset panel inside a card: one ground step, no shadow. */
export const Inset: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle level={3}>Technical details</CardTitle>
      </CardHeader>
      <CardContent>
        <Card variant="inset" className="p-card">
          <p className="font-mono text-sm [overflow-wrap:anywhere]">
            /dev/disk/by-uuid/0e8c4b1f-6a2d-4c3e-9f1a-5b7d2e8c9a01
          </p>
        </Card>
      </CardContent>
    </Card>
  ),
};

/** One attention card of the dashboard: its header, title, body and next step, named by the step. */
function AttentionCard({
  tone,
  title,
  body,
  step,
  href,
  external,
}: {
  tone: "warning" | "critical" | "none";
  title: React.ReactNode;
  body: React.ReactNode;
  step: string;
  href: string;
  external?: boolean;
}) {
  const stepId = React.useId();
  const aboutId = React.useId();
  const head =
    tone === "none" ? (
      <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
    ) : (
      <StatusLabel status={tone}>
        {tone === "critical" ? "Critical" : "Warning"}
      </StatusLabel>
    );
  const inner = (
    <>
      <CardHeader className="flex-nowrap items-center">
        {head}
        {external ? <CardExternalMark /> : null}
      </CardHeader>
      <CardContent id={aboutId} className="gap-1">
        <CardTitle level={3}>{title}</CardTitle>
        <p className="text-muted-foreground">{body}</p>
      </CardContent>
      <CardFooter className="border-t-0 pt-0 pb-card">
        <span id={stepId} className="font-medium text-action-label">
          {step}
        </span>
      </CardFooter>
    </>
  );
  return (
    <li className="flex">
      {external ? (
        <Card
          variant="action"
          opens="new-tab"
          newTabLabel="(opens in a new tab)"
          aria-labelledby={stepId}
          aria-describedby={aboutId}
          render={<a href={href} />}
          className="flex-1"
        >
          {inner}
        </Card>
      ) : (
        <Card
          variant="action"
          aria-labelledby={stepId}
          aria-describedby={aboutId}
          render={<a href={href} />}
          className="flex-1"
        >
          {inner}
        </Card>
      )}
    </li>
  );
}

/**
 * Action cards that lead out of this interface to the classic one: the external mark at the end of
 * the header, `target="_blank"` and `rel="noopener noreferrer"` set by the card, and "(opens in a new
 * tab)" added to the name. Beside one that stays here, for comparison.
 */
export const LeavesTheInterface: Story = {
  render: () => (
    <ul
      aria-label="Needs attention"
      className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-gutter"
    >
      <AttentionCard
        tone="warning"
        title="The NAS needs a restart"
        body="Updates finish installing when it restarts. Restarting is in the classic interface, in the power menu at the top right."
        step="Restart from the classic interface"
        href="/"
        external
      />
      <AttentionCard
        tone="none"
        title="The clocks differ by 4 minutes"
        body="If the NAS clock is wrong, schedules and logs will be too."
        step="Check Date and time in the classic interface"
        href="/"
        external
      />
      <AttentionCard
        tone="critical"
        title="Disk sdb may fail soon"
        body="Many damaged areas (bad sectors). It may fail soon. Copy your data off it and replace it."
        step="Open disk sdb"
        href="#/storage/disks/sdb"
      />
    </ul>
  ),
};
