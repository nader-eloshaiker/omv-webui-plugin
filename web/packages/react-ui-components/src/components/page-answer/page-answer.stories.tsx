// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { HealthRing, HealthRingSkeleton, type HealthArea } from "../ring/ring";
import { Skeleton } from "../skeleton/skeleton";
import { StatusPill } from "../status/status";
import type { HealthStatus } from "../status/status-kinds";
import { Identifier } from "../text/identifier";
import {
  PageAnswer,
  PageAnswerAction,
  PageAnswerAside,
  PageAnswerBody,
  PageAnswerDescription,
  PageAnswerHeadline,
  PageAnswerHeadlineSkeleton,
  PageAnswerKicker,
} from "./page-answer";

const area = (
  id: string,
  label: string,
  status: HealthStatus,
  statusLabel: string,
): HealthArea => ({ id, label, status, statusLabel });

const ATTENTION = [
  area("storage", "Storage", "warning", "Warning"),
  area("disks", "Disks", "unknown", "Not checked"),
  area("services", "Services", "ok", "All running"),
  area("system", "System", "warning", "Restart needed"),
];
const NOT_CHECKED = [
  area("storage", "Storage", "ok", "Nothing full"),
  area("disks", "Disks", "unknown", "Not checked"),
  area("services", "Services", "ok", "All running"),
  area("system", "System", "ok", "OK"),
];
const ALL_OK = NOT_CHECKED.map((a) =>
  a.id === "disks" ? { ...a, status: "ok" as const, statusLabel: "OK" } : a,
);
const CRITICAL = [
  area("storage", "Storage", "critical", "Critical"),
  area("disks", "Disks", "ok", "OK"),
  area("services", "Services", "ok", "All running"),
  area("system", "System", "ok", "OK"),
];

function Figure({ top, bottom }: { top: string; bottom: string }) {
  return (
    <>
      <span>{top}</span>
      <span className="text-caption font-medium text-muted-foreground">
        {bottom}
      </span>
    </>
  );
}

function Answer({
  status,
  statusLabel,
  headline,
  description,
  action,
  areas,
  figure,
  ringSize = "lg",
}: {
  ringSize?: "md" | "lg";
  status: HealthStatus;
  statusLabel: string;
  headline: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  areas: HealthArea[];
  figure: React.ReactNode;
}) {
  const titleId = React.useId();
  return (
    <PageAnswer aria-labelledby={titleId}>
      <PageAnswerBody>
        <h1 id={titleId} className="text-section text-muted-foreground">
          Dashboard
        </h1>
        <PageAnswerKicker>
          <StatusPill status={status}>{statusLabel}</StatusPill>
          <Identifier>nas</Identifier>
          <span aria-hidden="true">·</span>
          <span>Updated at 10:42:07</span>
        </PageAnswerKicker>
        <PageAnswerHeadline>{headline}</PageAnswerHeadline>
        {description}
        {action ? <PageAnswerAction>{action}</PageAnswerAction> : null}
      </PageAnswerBody>
      <PageAnswerAside>
        <HealthRing
          size={ringSize}
          legend="beside"
          label="Health of this NAS"
          areas={areas}
          figure={figure}
        />
      </PageAnswerAside>
    </PageAnswer>
  );
}

const meta = {
  title: "Components/Page answer",
  component: PageAnswer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageAnswer>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Two things need the reader: the count as the headline, the worst named under it, no button. */
export const Attention: Story = {
  render: () => (
    <Answer
      status="warning"
      statusLabel="Warning"
      headline="2 things need you"
      description={
        <>
          <PageAnswerDescription>
            Worst first: Data is almost full.
          </PageAnswerDescription>
          <PageAnswerDescription>
            Disk health has not been checked since you signed in.
          </PageAnswerDescription>
        </>
      }
      areas={ATTENTION}
      figure={<Figure top="2" bottom="to fix" />}
    />
  ),
};

/** One critical problem: its card's own title is the headline. */
export const OneCritical: Story = {
  render: () => (
    <Answer
      status="critical"
      statusLabel="Critical"
      headline={
        <>
          File system{" "}
          <span className="isolate">Photos and home videos 2009 to now</span> is
          full
        </>
      }
      areas={CRITICAL}
      figure={<Figure top="1" bottom="to fix" />}
    />
  ),
};

/** The usual visit: nothing wrong, but disk health is read only on request, so one button. */
export const NoProblemsNotChecked: Story = {
  render: () => (
    <Answer
      status="unknown"
      statusLabel="Not checked"
      headline="No problems found"
      description={
        <PageAnswerDescription>
          Disk health has not been checked since you signed in.
        </PageAnswerDescription>
      }
      action={<Button variant="neutral">Check disk health</Button>}
      areas={NOT_CHECKED}
      figure={<Figure top="3/4" bottom="checked" />}
    />
  ),
};

/** After a disk check found every disk OK. */
export const EverythingOk: Story = {
  render: () => (
    <Answer
      status="ok"
      statusLabel="OK"
      headline="Everything is OK"
      description={
        <PageAnswerDescription>
          Disk health was checked at 10:41. The rest is read while this page is
          open.
        </PageAnswerDescription>
      }
      areas={ALL_OK}
      figure="OK"
    />
  ),
};

/** The first read is in flight: the title is real; the rest are bars of their real heights. */
export const Loading: Story = {
  render: function LoadingStory() {
    const titleId = React.useId();
    return (
      <PageAnswer aria-labelledby={titleId} aria-busy="true">
        <PageAnswerBody className="w-full">
          <h1 id={titleId} className="text-section text-muted-foreground">
            Dashboard
          </h1>
          <Skeleton className="w-48 text-caption" />
          <PageAnswerHeadlineSkeleton />
          <Skeleton className="w-4/5 max-w-[60ch]" />
          <p role="status" className="sr-only">
            Loading the system information…
          </p>
        </PageAnswerBody>
        <PageAnswerAside>
          <HealthRingSkeleton size="lg" areas={4} />
        </PageAnswerAside>
      </PageAnswer>
    );
  },
};

/** At 390px the ring moves under the headline, at the medium size, its legend beside it. */
export const AtPhoneWidth: Story = {
  render: () => (
    <Phone>
      <Answer
        status="unknown"
        statusLabel="Not checked"
        headline="No problems found"
        description={
          <PageAnswerDescription>
            Disk health has not been checked since you signed in.
          </PageAnswerDescription>
        }
        action={<Button variant="neutral">Check disk health</Button>}
        areas={NOT_CHECKED}
        figure={<Figure top="3/4" bottom="checked" />}
        ringSize="md"
      />
    </Phone>
  ),
};
