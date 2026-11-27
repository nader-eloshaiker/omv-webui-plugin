// SPDX-License-Identifier: GPL-3.0-or-later
// The drive pictures: every kind at every size, decorative, drawn in the neutral inks from classes
// alone (no colour written into the drawing), at the pixel size of their box; the NVMe stick lying
// flat or standing upright; and the kind read from the contract's rows, never guessed.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrivePicture } from "./drive-picture";
import {
  DRIVE_PICTURE_BOX,
  driveKindOf,
  drivePictureBox,
} from "./drive-picture-model";

const KINDS = ["hdd", "ssd", "nvme", "disk"] as const;
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
    expect(svgs).toHaveLength(12);
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

  it("makes every drive as tall as the others at its size, as wide as its device's proportion", () => {
    for (const size of ["tile", "large"] as const) {
      const { hdd, ssd, disk } = DRIVE_PICTURE_BOX[size];
      const stick = drivePictureBox("nvme", size, "upright");
      for (const box of [ssd, disk, stick]) {
        expect(box.h).toBe(hdd.h);
      }
      // 3.5" 101.6 x 147mm and 2.5" 69.85 x 100mm: one proportion; M.2 2280: 22 x 80mm.
      expect(ssd.w).toBe(hdd.w);
      expect(stick.w / stick.h).toBeGreaterThan(0.25);
      expect(stick.w / stick.h).toBeLessThan(0.3);
    }
    expect(DRIVE_PICTURE_BOX.marker.ssd).toEqual(DRIVE_PICTURE_BOX.marker.hdd);
    expect(DRIVE_PICTURE_BOX.tile.hdd.h).toBe(56);
  });

  it("stands the NVMe stick upright on request, its lying box turned on its side, and leaves the others as they are", () => {
    const { container } = render(
      <>
        {KINDS.flatMap((kind) =>
          SIZES.map((size) => (
            <DrivePicture
              key={`${kind}-${size}`}
              kind={kind}
              size={size}
              orientation="upright"
            />
          )),
        )}
      </>,
    );
    for (const size of SIZES) {
      const lying = DRIVE_PICTURE_BOX[size].nvme;
      expect(drivePictureBox("nvme", size, "upright")).toEqual({
        w: lying.h,
        h: lying.w,
      });
      expect(drivePictureBox("nvme", size)).toEqual(lying);
      const svg = container.querySelector(
        `svg[data-kind="nvme"][data-size="${size}"]`,
      );
      expect(svg).toHaveAttribute("data-orientation", "upright");
      expect(svg).toHaveAttribute("width", String(lying.h));
      expect(svg).toHaveAttribute("height", String(lying.w));
      // The same drawing, turned a quarter round in its own coordinates: no style, no colour.
      const turn = svg?.querySelector(":scope > g");
      expect(turn?.getAttribute("transform")).toBe(
        `translate(0 ${String(lying.w)}) rotate(-90)`,
      );
      expect(turn?.getAttribute("class")).toBeNull();
      expect(turn?.getAttribute("style")).toBeNull();
      for (const kind of ["hdd", "ssd", "disk"] as const) {
        const other = container.querySelector(
          `svg[data-kind="${kind}"][data-size="${size}"]`,
        );
        expect(other).not.toHaveAttribute("data-orientation");
        expect(other?.querySelector(":scope > g")).toBeNull();
        expect(drivePictureBox(kind, size, "upright")).toEqual(
          DRIVE_PICTURE_BOX[size][kind],
        );
      }
    }
    // The tile stick standing up is the temperature scale's length tall.
    expect(drivePictureBox("nvme", "tile", "upright").h).toBe(56);
  });

  it("draws a disk of no known kind as a plain drive that claims none, in the hard disk's box", () => {
    const { container } = render(
      <>
        {SIZES.map((size) => (
          <DrivePicture key={size} kind="disk" size={size} />
        ))}
      </>,
    );
    for (const size of SIZES) {
      expect(DRIVE_PICTURE_BOX[size].disk).toEqual(DRIVE_PICTURE_BOX[size].hdd);
    }
    for (const svg of container.querySelectorAll("svg")) {
      const parts = [...svg.querySelectorAll("[data-part]")].map((p) =>
        p.getAttribute("data-part"),
      );
      expect(parts[0]).toBe("body");
      // A body and a blank label: no platter, hub or arm, no chips, no connector, no stick.
      expect(new Set(parts)).toEqual(
        new Set(
          svg.getAttribute("data-size") === "marker"
            ? ["body", "faint"]
            : ["body", "faint", "pin"],
        ),
      );
    }
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
