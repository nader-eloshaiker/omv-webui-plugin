// SPDX-License-Identifier: GPL-3.0-or-later
// The candidates the lab shows for each subject, each with its one sentence: what it shows and why,
// and the ones not chosen, one line each. Development only (UI-11).
import { PairedStrip } from "./LiveCharts.tsx";
import { Waffle } from "./SpaceCharts.tsx";
import { TempCaddies, TempStacks } from "./TempCharts.tsx";

export const SPACE_CANDIDATES = [
  {
    id: "waffle",
    title: "The waffle",
    caption:
      "Each square is a fixed share of the drive, used squares in the usage blue and empty ones solid, and the warning mark is a gap with a rule in it, so the room left before the warning can be counted at a glance.",
    Chart: Waffle,
  },
] as const;

export const LIVE_CANDIDATES = [
  {
    id: "paired",
    title: "Two charts, four series",
    caption:
      "Processor and memory share one percent scale, and the network is mirrored with traffic in above the baseline and out below, each half on its own scale; teal is solid and violet dashed in both, and each line is named at its end.",
    Strip: PairedStrip,
  },
] as const;

export const TEMP_CANDIDATES = [
  {
    id: "stacked",
    title: "Along one scale, stacked",
    caption:
      "Disks at the same whole degree stack upward into a column, one marker each with its shape saying its kind, so the spread across the bay reads like a histogram and no marker hides another.",
    Chart: TempStacks,
  },
  {
    id: "caddies",
    title: "In bay order, as caddies",
    caption:
      "Each disk keeps its slot in the bay, drawn as its caddy with the temperature as a level on one shared scale and the alert limit as one line straight across them, so a hot disk is found where it sits.",
    Chart: TempCaddies,
  },
] as const;

/** Round one's candidates the owner did not pick, kept as one line each so the choice is on record. */
export const NOT_CHOSEN = [
  {
    subject: "Space",
    title: "The counted bar",
    line: "A taller bar of equal cells with the figures at its ends; the owner chose the waffle instead.",
  },
  {
    subject: "Space",
    title: "The drive filling",
    line: "The drive drawn from its kind, filling like a level with the mark as a dashed line; the owner chose the waffle instead.",
  },
  {
    subject: "Live",
    title: "One trace each",
    line: "Four charts of one line each in the trace blue, on fixed scales; the owner chose two charts of two series.",
  },
  {
    subject: "Live",
    title: "Figures first, the readings beneath",
    line: "The figures as the headline with each reading as a column beneath; the owner chose two charts of two series.",
  },
  {
    subject: "Temperatures",
    title: "Along one scale, unstacked",
    line: "One marker per disk with its name above it; disks at the same degree were drawn on top of each other.",
  },
  {
    subject: "Temperatures",
    title: "In bay order, as thermometers",
    line: "A thermometer tube per slot on a shared scale; the owner found it easier to read but not outstanding.",
  },
] as const;
