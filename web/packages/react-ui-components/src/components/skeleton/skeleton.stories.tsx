// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Lines at the height of the text they stand in for: a 16px title, then 14px body lines. */
export const Lines: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <span className="text-lg leading-tight">
        <Skeleton className="w-32" />
      </span>
      <Skeleton />
      <Skeleton className="w-4/5" />
      <Skeleton className="w-2/3" />
    </div>
  ),
};

/** Blocks for a control and a meter, as a form and a usage card show while loading. */
export const Blocks: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="w-24" />
        <Skeleton shape="block" className="h-8" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="w-20" />
        <Skeleton shape="block" className="h-2 rounded-full" />
        <Skeleton className="w-40" />
      </div>
    </div>
  ),
};

/** On the card surface and on the page ground: the `muted` step reads on both, in both themes. */
export const OnSurfaceAndPage: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-surface p-4">
        <Skeleton className="w-1/2" />
      </div>
      <div className="rounded-card bg-page p-4">
        <Skeleton className="w-1/2" />
      </div>
    </div>
  ),
};

/**
 * What a reader who asked for reduced motion sees: the same bars, still. In the product this comes
 * from the operating system setting; here the pulse is switched off by class to show it.
 */
export const ReducedMotion: Story = {
  render: () => (
    <div className="flex flex-col gap-1">
      <Skeleton className="w-28 motion-safe:animate-none" />
      <Skeleton className="motion-safe:animate-none" />
      <Skeleton shape="block" className="h-8 motion-safe:animate-none" />
    </div>
  ),
};
