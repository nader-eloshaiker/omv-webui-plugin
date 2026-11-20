// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExternalLink } from "../external-link/external-link";
import {
  FactList,
  FactListItem,
  FactListLabel,
  FactListSkeleton,
  FactListValue,
} from "./fact-list";

const meta = {
  title: "Components/FactList",
  component: FactList,
  decorators: [
    (Story) => (
      <div className="max-w-xl rounded-card border border-border bg-surface p-4">
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof FactList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {
  render: () => (
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
        <FactListLabel>Processor</FactListLabel>
        <FactListValue>
          Intel(R) Celeron(R) N5105 @ 2.00GHz, 4 cores
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Running for</FactListLabel>
        <FactListValue>12 days, 4 hours</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Kernel</FactListLabel>
        <FactListValue variant="identifier">
          Linux 6.12.38+deb13-amd64
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Updates</FactListLabel>
        <FactListValue>
          <span className="flex flex-wrap gap-x-3">
            <span>3 available</span>
            <ExternalLink
              href="/#/system/updatemgmt/updates"
              newTabLabel="(opens in a new tab)"
            >
              Review updates in the classic interface
            </ExternalLink>
          </span>
        </FactListValue>
      </FactListItem>
    </FactList>
  ),
};

export const ValueMissing: Story = {
  render: () => (
    <FactList>
      <FactListItem>
        <FactListLabel>User name</FactListLabel>
        <FactListValue variant="identifier">alex</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Description</FactListLabel>
        <FactListValue variant="missing">None</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Processor</FactListLabel>
        <FactListValue variant="missing">Not reported</FactListValue>
      </FactListItem>
    </FactList>
  ),
};

/** A long path and a long key break inside their column; the page never scrolls sideways. */
export const LongMonoValue: Story = {
  render: () => (
    <FactList>
      <FactListItem>
        <FactListLabel>Full path</FactListLabel>
        <FactListValue variant="identifier">
          /srv/dev-disk-by-uuid-0e8c4b1f-6a2d-4c3e-9f1a-5b7d2e8c9a01/media/films-and-series-archive
        </FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Name</FactListLabel>
        <FactListValue variant="identifier">
          nas-in-the-basement-cupboard-behind-the-boiler.example.internal
        </FactListValue>
      </FactListItem>
    </FactList>
  ),
};

/** Free text from the server: a right-to-left value keeps its own direction, markup stays text. */
export const FreeText: Story = {
  render: () => (
    <FactList>
      <FactListItem>
        <FactListLabel>Description</FactListLabel>
        <FactListValue>מחשב הגיבוי של המשרד</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>Email address</FactListLabel>
        <FactListValue>{"<b>alex</b>@example.com"}</FactListValue>
      </FactListItem>
    </FactList>
  ),
};

export const Skeleton: Story = {
  render: () => (
    <div aria-busy="true">
      <span role="status" className="sr-only">
        Loading the system information…
      </span>
      <FactListSkeleton rows={7} />
    </div>
  ),
};

/** At 320px the label sits above its value. */
export const Narrow: Story = {
  decorators: [(Story) => <div className="w-72">{Story()}</div>],
  render: Normal.render,
};
