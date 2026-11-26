// SPDX-License-Identifier: GPL-3.0-or-later
// The candidates the lab shows for each subject, each with its one sentence: what it shows and why,
// and the ones not chosen, one line each. Development only (UI-11).
import { PairedStrip } from "./LiveCharts.tsx";
import { Waffle } from "./SpaceCharts.tsx";
import { TempByKind } from "./TempCharts.tsx";

export const SPACE_CANDIDATES = [
  {
    id: "waffle",
    title: "The waffle",
    caption:
      "Each square is a fixed share of the drive, used squares in the usage blue and empty ones in a solid slate, and the warning mark is a gap with a rule in it, so the room left before the warning can be counted at a glance.",
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
    id: "by-kind",
    title: "By kind, with each array and pool as a group",
    caption:
      "Each RAID array and ZFS pool is a group headed by its name and arrangement, with its disks in it; then the disks in no array or pool, by kind. Each disk is drawn as its kind with its temperature as a filled level on one scale shared by every group, and the alert limit at the same height through every tile. The order within a group is the device order, because the NAS does not report which slot of the case a disk is in.",
    Chart: TempByKind,
  },
] as const;

/** The candidates the owner did not pick, kept as one line each so the choice is on record. */
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
    title: "One thermometer for each disk",
    line: "A thermometer tube per disk on a shared scale, in device order; the owner found it easier to read but not outstanding.",
  },
  {
    subject: "Temperatures",
    title: "Along one scale, stacked",
    line: "Disks at the same whole degree stacked into columns of small pictures; the owner chose the disks by kind, on the dashboard and on the Disks page alike.",
  },
] as const;
