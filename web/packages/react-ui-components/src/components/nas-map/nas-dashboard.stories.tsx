// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DemoDashboard } from "../../fixtures/nas-dashboard";
import { Phone } from "../../fixtures/story-frames";

/**
 * The dashboard composed from the library's pieces, as the page will compose it (rethink 6, 6.8):
 * the welcome, the answer (`NasAnswer`), what needs you (`AttentionList`), the map (`NasMap`), then
 * `FirstSteps` or `Shortcuts` beside `NasFacts`. Every state the dashboard lab showed. The meter in
 * each storage row is the library's `CapacityMeter`, standing in for the segment bar.
 */
const meta = {
  title: "Patterns/Dashboard",
  component: DemoDashboard,
  args: { state: "all-ok" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DemoDashboard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A new NAS: the welcome, the first steps under it, the unused disks, the example row and the captions. */
export const NewNas: Story = { args: { state: "new-nas" } };

/** A new interface on an existing NAS: the one-line welcome over the answer, and the captions. */
export const NewInterface: Story = { args: { state: "new-interface" } };

/** Everything is working: no "needs you", the answer with its reason. */
export const AllOk: Story = { args: { state: "all-ok" } };

/** Four things need you, worst first, three then "1 more"; the problem rows of the map lead. */
export const NeedsYou: Story = { args: { state: "needs-you" } };

/** A disk is failing: the critical row first, its connector and storage at risk. */
export const DiskCritical: Story = { args: { state: "disk-critical" } };

/** 24 disks in 8 storage: the eight-disk array folds its healthy disks into a strip, rows beyond six fold. */
export const TwentyFourDisks: Story = { args: { state: "many" } };

/** Eight file systems on eight disks: six rows, then "3 more, all OK". */
export const EightFileSystems: Story = { args: { state: "eight" } };

/** Storage but no shared folders: the folders column's caption, and its action is the accent. */
export const NoSharedFolders: Story = { args: { state: "no-folders" } };

/** Nothing has arrived: still placeholders, "Reading the NAS…", never "Everything is working". */
export const Loading: Story = { args: { state: "loading" } };

/** The disks could not be read: the error in place with "Try again"; the answer says so. */
export const LaneFailing: Story = { args: { state: "lane-failed" } };

/** "Show tips" off on a new NAS: no example row and no captions; first steps become Shortcuts. */
export const TipsOff: Story = { args: { state: "new-nas", tips: false } };

/** At 390px: each row stacks, its connectors vertical; the band stacks. */
export const Phone390: Story = {
  args: { state: "needs-you" },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/** A new NAS at 390px. */
export const Phone390NewNas: Story = {
  args: { state: "new-nas" },
  decorators: [(Story) => <Phone>{Story()}</Phone>],
};

/**
 * The first visit: the NAS assembles row by row (fades done within 400ms, slides and connectors to
 * about 900ms), once. "Show me around" plays it again. "A problem arrives" draws its row's
 * connectors again and the answer's words crossfade; "It resolves" folds the row away.
 */
export const FirstVisitAndCauses: Story = {
  args: { state: "all-ok", seen: false, causes: true },
  parameters: { matrix: false },
};

/** A ghost becoming real: on a new NAS, "Storage is added" turns the unused row into a storage row. */
export const GhostBecomesReal: Story = {
  args: { state: "new-nas", causes: true },
  parameters: { matrix: false },
};

/** The same causes with motion reduced (`MotionScope reduced`): each motion is a short fade. */
export const ReducedMotion: Story = {
  args: { state: "all-ok", seen: false, causes: true, reduced: true },
  parameters: { matrix: false },
};
