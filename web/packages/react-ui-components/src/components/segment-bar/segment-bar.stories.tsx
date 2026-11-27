// SPDX-License-Identifier: GPL-3.0-or-later
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import {
  FILE_SYSTEMS,
  segmentBarArgs,
  type FileSystemRow,
} from "../../fixtures/chart-fixtures";
import { Phone } from "../../fixtures/story-frames";
import { Button } from "../button/button";
import { MotionScope } from "../motion/motion-scope";
import { StatusLabel } from "../status/status";
import { SegmentBar } from "./segment-bar";

const meta = {
  title: "Components/Segment bar",
  component: SegmentBar,
  args: segmentBarArgs(FILE_SYSTEMS.data, "row"),
} satisfies Meta<typeof SegmentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Data drive in a row of the NAS map: 62 % used, OMV's default mark of 85 % between two segments. */
export const Normal: Story = {};

/** Media, past its mark: only the used part past the rule takes the warning stroke, with the word. */
export const PastTheMark: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.media, "row"),
};

/** tank, whose admin set the mark to 0 (never warn): no wide gap and no rule. */
export const NoMark: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.tank, "row"),
};

/** Backup, whose admin moved the mark to 88 %: it falls inside the 18th segment, which it splits. */
export const MarkInsideASegment: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.backup, "row"),
};

/** The ends: a drive just made (0 %), and a full one past its mark. */
export const EmptyAndFull: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <SegmentBar
        {...segmentBarArgs(
          {
            ...FILE_SYSTEMS.data,
            label: "Photos",
            available: FILE_SYSTEMS.data.size,
            percentage: 0,
          },
          "row",
        )}
      />
      <SegmentBar
        {...segmentBarArgs(
          {
            ...FILE_SYSTEMS.media,
            label: "Scratch",
            available: "0",
            percentage: 100,
          },
          "row",
        )}
      />
    </div>
  ),
};

const ROWS: readonly FileSystemRow[] = [
  FILE_SYSTEMS.data,
  FILE_SYSTEMS.backup,
  FILE_SYSTEMS.tank,
  FILE_SYSTEMS.media,
];

/**
 * Rows of a list, one bar under another: each size has one fixed width, so the same value and the
 * same mark sit at the same place on every row, and the 85 % rules of Data and Media line up.
 */
export const RowsLineUp: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {ROWS.map((row) => (
        <div key={row.devicename} className="flex flex-col gap-1">
          <span className="font-semibold text-foreground">{row.label}</span>
          <SegmentBar {...segmentBarArgs(row, "row")} />
        </div>
      ))}
    </div>
  ),
};

/** The three sizes: a row of a map or a list, a table cell, and the file system's own page. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">Row</h3>
        <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "row")} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">Table cell</h3>
        <FileSystemTable />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm text-muted-foreground">Page</h3>
        <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "page")} />
      </div>
    </div>
  ),
};

/**
 * In the file systems table, rows of 40px (36 compact): the cell has no room for the status word,
 * so the row shows it beside the file system's name.
 */
function FileSystemTable() {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th
            scope="col"
            className="pe-3 pb-2 text-start font-normal text-muted-foreground"
          >
            File system
          </th>
          <th
            scope="col"
            className="pb-2 text-start font-normal text-muted-foreground"
          >
            Space used
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const args = segmentBarArgs(row, "cell");
          return (
            <tr key={row.devicename} className="border-t border-border">
              <td className="h-10 pe-3 compact:h-9">
                <span className="flex flex-wrap items-center gap-x-2.5">
                  <span className="font-semibold text-foreground">
                    {row.label}
                  </span>
                  {args.threshold ? (
                    <StatusLabel status={args.threshold.status}>
                      {args.threshold.label}
                    </StatusLabel>
                  ) : null}
                </span>
              </td>
              <td className="h-10 compact:h-9">
                <SegmentBar {...args} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const TableCell: Story = {
  render: () => <FileSystemTable />,
};

/** The page size past its mark: the headline, the free space, the status word and the legend. */
export const PagePastTheMark: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.media, "page"),
};

/** The page size with the mark inside a segment. */
export const PageMarkInsideASegment: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.backup, "page"),
};

/** The page size with no mark. */
export const PageNoMark: Story = {
  args: segmentBarArgs(FILE_SYSTEMS.tank, "page"),
};

const TiB = 1024 ** 4;

/**
 * A new reading: copying 1 TiB to the Data drive takes it from 62 % to 90 %, past its mark. The fill
 * glides over the glide duration and the status word fades in; nothing moves on load.
 */
function CopyDemo({ size }: { size: "row" | "page" }) {
  const [copied, setCopied] = React.useState(false);
  const base = FILE_SYSTEMS.data;
  const row = copied
    ? {
        ...base,
        available: String(Number(base.available) - TiB),
        percentage:
          base.percentage + Math.round((TiB / Number(base.size)) * 100),
      }
    : base;
  return (
    <div className="flex flex-col items-start gap-4">
      <Button
        variant="neutral"
        size="sm"
        onClick={() => {
          setCopied((c) => !c);
        }}
      >
        {copied ? "Delete the 1 TiB copy" : "Copy 1 TiB to the Data drive"}
      </Button>
      <SegmentBar {...segmentBarArgs(row, size)} />
    </div>
  );
}

export const NewReading: Story = {
  render: () => <CopyDemo size="row" />,
};

/** The same under reduced motion: the new reading is drawn at its value at once. */
export const NewReadingReducedMotion: Story = {
  render: () => (
    <MotionScope reduced>
      <CopyDemo size="page" />
    </MotionScope>
  ),
};

/** At 390px the page size scales down to the column; the row and the cell keep their pixel size. */
export const At390px: Story = {
  render: () => (
    <Phone>
      <div className="flex flex-col gap-6">
        <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.media, "row")} />
        <SegmentBar {...segmentBarArgs(FILE_SYSTEMS.data, "page")} />
      </div>
    </Phone>
  ),
};

/** Text from the backend renders as text: a label that looks like markup stays inert. */
export const MarkupLookingName: Story = {
  render: () => {
    const row = {
      ...FILE_SYSTEMS.data,
      label: "<b>Data</b> & <script>x</script>",
    };
    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-foreground">{row.label}</span>
        <SegmentBar {...segmentBarArgs(row, "row")} />
      </div>
    );
  },
};
