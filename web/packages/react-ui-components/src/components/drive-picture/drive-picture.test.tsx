// SPDX-License-Identifier: GPL-3.0-or-later
// The drive pictures: every kind at every size, decorative, drawn in the neutral inks from classes
// alone (no colour written into the drawing), at the pixel size of their box; and the kind read from
// the contract's rows, never guessed.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrivePicture } from "./drive-picture";
import { DRIVE_PICTURE_BOX, driveKindOf } from "./drive-picture-model";

const KINDS = ["hdd", "ssd", "nvme"] as const;
const SIZES = ["marker", "tile", "large"] as const;

describe("DrivePicture", () => {
  it("draws each kind at each size, decoratively, at its box's size", () => {
    const { container } = render(
      <>
        {KINDS.flatMap((kind) =>
          SIZES.map((size) => (
            <DrivePicture key={`${kind}-${size}`} kind={kind} size={size} />
          )),
        )}
      </>,
    );
    const svgs = container.querySelectorAll("svg[data-slot=drive-picture]");
    expect(svgs).toHaveLength(9);
    for (const kind of KINDS) {
      for (const size of SIZES) {
        const svg = container.querySelector(
          `svg[data-kind="${kind}"][data-size="${size}"]`,
        );
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute("aria-hidden", "true");
        const { w, h } = DRIVE_PICTURE_BOX[size][kind];
        expect(svg).toHaveAttribute("width", String(w));
        expect(svg).toHaveAttribute("height", String(h));
      }
    }
  });

  it("writes no colour into the drawing: every part takes its ink from a class", () => {
    const { container } = render(
      <>
        {KINDS.flatMap((kind) =>
          SIZES.map((size) => (
            <DrivePicture key={`${kind}-${size}`} kind={kind} size={size} />
          )),
        )}
      </>,
    );
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.querySelectorAll("[fill], [stroke], [style]")).toHaveLength(0);
      for (const part of svg.querySelectorAll("svg > *")) {
        expect(part.getAttribute("data-part")).toMatch(/^[a-z]+$/u);
        // Only the neutral text and divider inks: no status, series, accent or brand colour.
        expect(part.getAttribute("class")).toMatch(
          /^((fill|stroke)-(none|muted|muted-foreground|foreground|border)\s?)+$/u,
        );
      }
    }
  });

  it("keeps the hard disk to SSD proportion, and the tile's length is the temperature scale's", () => {
    for (const size of SIZES) {
      const { hdd, ssd } = DRIVE_PICTURE_BOX[size];
      expect(ssd.h / hdd.h).toBeGreaterThan(0.7);
      expect(ssd.h / hdd.h).toBeLessThan(0.9);
    }
    expect(DRIVE_PICTURE_BOX.tile.hdd.h).toBe(56);
    expect(DRIVE_PICTURE_BOX.tile.nvme.w).toBe(56);
  });
});

describe("driveKindOf", () => {
  it("knows an NVMe SSD by its name and the others by Smart.getInformation, and never guesses", () => {
    expect(driveKindOf({ devicename: "nvme0n1" })).toBe("nvme");
    expect(
      driveKindOf(
        { devicename: "sda" },
        { rotationrate: "Solid State Device" },
      ),
    ).toBe("ssd");
    expect(
      driveKindOf({ devicename: "sdb" }, { rotationrate: "7200 rpm" }),
    ).toBe("hdd");
    expect(driveKindOf({ devicename: "sdc" })).toBeNull();
    expect(driveKindOf({ devicename: "sdc" }, { rotationrate: "" })).toBeNull();
  });
});
