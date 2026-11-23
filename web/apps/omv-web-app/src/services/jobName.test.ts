// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { jobName } from "./jobName.ts";

const auto = (src: string, dest: string) => `${src} to ${dest}`;

describe("jobName", () => {
  it.each([
    {
      why: "a note is the name",
      row: { comment: "Nightly photos", srcname: "Photos", destname: "Backup" },
      name: "Nightly photos",
    },
    {
      why: "a note keeps its own spacing",
      row: { comment: "  Photos  ", srcname: "a", destname: "b" },
      name: "  Photos  ",
    },
    {
      why: "no note: built from the two sides",
      row: { srcname: "Photos", destname: "Backup" },
      name: "Photos to Backup",
    },
    {
      why: "an empty note: built from the two sides",
      row: { comment: "", srcname: "Photos", destname: "Backup" },
      name: "Photos to Backup",
    },
    {
      why: "a note of spaces only: built from the two sides",
      row: { comment: " \t ", srcname: "Photos", destname: "Backup" },
      name: "Photos to Backup",
    },
    {
      why: "markup in a note stays text",
      row: { comment: "<b>x</b>", srcname: "a", destname: "b" },
      name: "<b>x</b>",
    },
  ])("$why", ({ row, name }) => {
    expect(jobName(row, auto)).toBe(name);
  });
});
