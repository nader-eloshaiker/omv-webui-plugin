// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
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
import { StatusPill } from "../status/status";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Components/Card",
  component: Card,
  decorators: [(Story) => <div className="max-w-xl">{Story()}</div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card render={<section aria-labelledby="card-system" />}>
      <CardHeader>
        <CardTitle id="card-system">System</CardTitle>
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
  ),
};

export const WithDescriptionAndFooter: Story = {
  render: () => (
    <Card render={<section aria-labelledby="card-setup" />}>
      <CardHeader>
        <CardTitle id="card-setup">Set up your NAS</CardTitle>
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
  ),
};

export const WithQuietFooterLink: Story = {
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
          <StatusPill status="warning">Warning</StatusPill>
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
