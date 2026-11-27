// SPDX-License-Identifier: GPL-3.0-or-later
// The hand-drawn charts together (journal 2026-11-26, "The charts are settled"): none of the
// generated look (style guide 10) in what they render with a page's words, no style element or style
// string, no colour but a token, no Recharts, and no words of their own in their sources.
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiskTemperatures } from "./components/disk-temperatures/disk-temperatures";
import { DrivePicture } from "./components/drive-picture/drive-picture";
import { LivePair } from "./components/live-pair/live-pair";
import { SegmentBar } from "./components/segment-bar/segment-bar";
import {
  DISKS_24,
  FILE_SYSTEMS,
  livePairArgs,
  liveReadings,
  REST_LABELS,
  segmentBarArgs,
  temperatureGroups,
  temperatureLabels,
  VOLUMES_24,
} from "./fixtures/chart-fixtures";

const SOURCES = [
  "components/segment-bar/segment-bar.tsx",
  "components/segment-bar/segment-bar-model.ts",
  "components/drive-picture/drive-picture.tsx",
  "components/drive-picture/drive-picture-model.ts",
  "components/live-pair/live-pair.tsx",
  "components/live-pair/live-pair-model.ts",
  "components/disk-temperatures/disk-temperatures.tsx",
  "components/disk-temperatures/disk-temperatures-model.ts",
].map((path) => ({ path, text: readFileSync(join(__dirname, path), "utf8") }));

function renderAll() {
  return render(
    <>
      {(["row", "cell", "page"] as const).map((size) => (
        <SegmentBar key={size} {...segmentBarArgs(FILE_SYSTEMS.media, size)} />
      ))}
      <DrivePicture kind="nvme" size="large" />
      <LivePair
        {...livePairArgs(
          liveReadings(40, (i) => (i > 6 ? "copy-in" : "idle")),
          { paused: true },
        )}
      />
      <DiskTemperatures
        groups={temperatureGroups(DISKS_24, VOLUMES_24)}
        labels={temperatureLabels("10:31")}
        mode="dashboard"
        restLabels={REST_LABELS}
        defaultRestOpen
      />
    </>,
  );
}

describe("the hand-drawn charts", () => {
  it("carry none of the generated look in what they render", () => {
    const { container } = renderAll();
    const text = container.textContent;
    expect(text).not.toMatch(/[·•|]/u);
    expect(text).not.toMatch(/\bquiet\b/iu);
    expect(text).not.toMatch(/\breal\b/iu);
    expect(container.querySelector("style")).toBeNull();
    expect(
      container.querySelector(
        "[class*='pulse'], [class*='ping'], [class*='glow'], [class*='blur'], [class*='gradient']",
      ),
    ).toBeNull();
    for (const el of container.querySelectorAll("[class]")) {
      const classes = el.getAttribute("class") ?? "";
      expect(classes).not.toMatch(/\b(uppercase|italic|tracking-[a-z])/u);
      expect(classes).not.toMatch(/\bborder-(l|s)-/u);
    }
  });

  it("write custom geometry through the style prop only, never a colour", () => {
    const { container } = renderAll();
    for (const el of container.querySelectorAll("[style]")) {
      const style = el.getAttribute("style") ?? "";
      expect(style).not.toMatch(/color|fill|stroke|background|#[0-9a-f]{3}/iu);
    }
  });

  it("take every colour from a token and never import Recharts", () => {
    for (const { path, text } of SOURCES) {
      expect(text, path).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(text, path).not.toMatch(/from "recharts"/u);
      expect(text, path).not.toMatch(/dangerouslySetInnerHTML|innerHTML/u);
    }
  });

  it("carry no words of their own: every sentence comes from the caller", () => {
    for (const { path, text } of SOURCES) {
      // Code only: comments and imports are not copy.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/\/\/.*$/gmu, "")
        .replace(/^import .*$/gmu, "");
      // A JSX text node that starts with a capital letter and has a space is a sentence.
      expect(code, path).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]+[^<{]*</u);
      for (const word of [
        "Asleep",
        "Rebuilding",
        "Hard disks",
        "Processor",
        "Network",
        "Almost full",
        "No reading",
      ]) {
        expect(code, path).not.toContain(`"${word}`);
      }
    }
  });
});
