// SPDX-License-Identifier: GPL-3.0-or-later
// The candidates the lab shows for each subject, each with its one sentence: what it shows and why.
// Development only (UI-11).
import { FiguresStrip, PairedStrip, TracesStrip } from "./LiveCharts.tsx";
import { CountedBar, DriveFill, Waffle } from "./SpaceCharts.tsx";
import { TempBay, TempScale } from "./TempCharts.tsx";

export const SPACE_CANDIDATES = [
  {
    id: "counted",
    title: "The counted bar",
    caption:
      "A taller bar of equal cells with the used share on its left and the free amount after it, so the figure you read sits on the part it describes, and the warning mark is a notch that says its value.",
    Chart: CountedBar,
  },
  {
    id: "waffle",
    title: "The waffle",
    caption:
      "Each square is a fixed share of the drive and the squares past the warning mark are hollow, so how much room is left before the warning can be counted at a glance.",
    Chart: Waffle,
  },
  {
    id: "drive",
    title: "The drive filling",
    caption:
      "The drive itself, drawn from its kind, fills like a level with the warning mark as a dashed line, so a mirror shows its two disks filling together.",
    Chart: DriveFill,
  },
] as const;

export const LIVE_CANDIDATES = [
  {
    id: "traces",
    title: "One trace each",
    caption:
      "Each readout is a single line in the trace blue over its fading area, on a fixed scale, with its value written at the line's right end, so the newest figure sits where the eye ends up.",
    Strip: TracesStrip,
  },
  {
    id: "paired",
    title: "Two charts, four series",
    caption:
      "Processor and memory share one percent scale as a solid and a dashed line, and the network is mirrored with traffic in above the baseline and out below, each line named at its end.",
    Strip: PairedStrip,
  },
  {
    id: "figures",
    title: "Figures first, the readings beneath",
    caption:
      "The figures stay the headline and each reading this page took stands beneath them as a column, with memory as a bar of used against total that marks the range seen.",
    Strip: FiguresStrip,
  },
] as const;

export const TEMP_CANDIDATES = [
  {
    id: "scale",
    title: "Along one scale",
    caption:
      "Every disk is a marker on one temperature scale, its shape saying its kind and its name written above it, so the spread across the bay and the hottest disk read at once.",
    Chart: TempScale,
  },
  {
    id: "bay",
    title: "In bay order",
    caption:
      "Each disk keeps its place in the bay as a thermometer on a shared scale with the alert limit as one line across them all, so a hot disk is found where it sits.",
    Chart: TempBay,
  },
] as const;
