// SPDX-License-Identifier: GPL-3.0-or-later
// The drawing of the NAS's front as assistive technology and the stylesheet meet it: named by its
// label; the pictures hidden and the words read as lists; the brackets placed over their bays; the
// stick in a slot of the bays' columns; the small drawing one image whose outlines say whether the
// disks were checked; the motions keyed on data attributes; text shown as text.
import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it } from "vitest";
import {
  FRONT_BAYS,
  FRONT_BOARD,
  FRONT_GROUPS,
  FRONT_HOST,
  FRONT_LABELS,
  NEW_FRONT_GROUPS,
} from "../../fixtures/nas-front-fixtures";
import { NasFront } from "./nas-front";

function large(props: Partial<React.ComponentProps<typeof NasFront>> = {}) {
  return render(
    <NasFront
      host={FRONT_HOST}
      bays={FRONT_BAYS}
      board={FRONT_BOARD}
      groups={FRONT_GROUPS}
      label={FRONT_LABELS.large}
      {...props}
    />,
  );
}

function small(props: Partial<React.ComponentProps<typeof NasFront>> = {}) {
  return render(
    <NasFront
      host={FRONT_HOST}
      bays={FRONT_BAYS}
      board={FRONT_BOARD}
      size="small"
      checked={false}
      label={FRONT_LABELS.before}
      {...props}
    />,
  );
}

const nb = (words: string) => words.replace(/\u00a0/gu, " ");

describe("NasFront, large", () => {
  it("is a figure named by its label, its words read as lists", () => {
    large();
    const figure = screen.getByRole("figure", { name: FRONT_LABELS.large });
    const lists = within(figure).getAllByRole("list");
    expect(lists).toHaveLength(2);
    const [disks, drives] = lists as [HTMLElement, HTMLElement];
    expect(
      within(disks)
        .getAllByRole("listitem")
        .map((li) => nb(li.textContent)),
    ).toEqual([
      "sdaHard disk, 3.6 TiB36 °C",
      "sdbHard disk, 3.6 TiB35 °C",
      "sdcHard disk, 3.6 TiB37 °C",
      "sddDisk, 3.6 TiBAsleep",
      "sdeSSD, 931.5 GiB31 °C",
    ]);
    expect(
      within(drives)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Data driveEXT4", "RAID array", "tankZFS pool", "Not in use"]);
    expect(within(figure).getByText("nvme0n1")).toBeInTheDocument();
  });

  it("hides the pictures, the host name and the brackets from assistive technology", () => {
    const { container } = large();
    const hidden = (part: string) =>
      [...container.querySelectorAll(`[data-part="${part}"]`)].every(
        (el) => el.closest('[aria-hidden="true"]') !== null,
      );
    expect(hidden("bays")).toBe(true);
    expect(hidden("host")).toBe(true);
    expect(hidden("m2")).toBe(true);
    expect(hidden("bracket")).toBe(true);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
    // The host's name is drawn on the chassis, said only in the label.
    expect(screen.getByText(FRONT_HOST)).toHaveAttribute("aria-hidden", "true");
  });

  it("draws one bay per disk as its kind, and the stick upright in an M.2 slot", () => {
    const { container } = large();
    const bays = container.querySelectorAll('[data-part="bay"]');
    expect([...bays].map((b) => b.getAttribute("data-kind"))).toEqual([
      "hdd",
      "hdd",
      "hdd",
      "disk",
      "ssd",
    ]);
    const stick = container.querySelector('[data-part="stick"]');
    expect(stick?.className).toMatch(/grid-cols-subgrid/u);
    expect(stick?.className).toMatch(/col-span-full/u);
    const picture = stick?.querySelector('[data-slot="drive-picture"]');
    expect(picture).toHaveAttribute("data-kind", "nvme");
    expect(picture).toHaveAttribute("data-orientation", "upright");
    expect(stick?.querySelector('[data-part="socket"]')).not.toBeNull();
    expect(stick?.querySelector('[data-part="screw"]')).not.toBeNull();
  });

  it("gives the chassis a column per bay, shared by the board and the words", () => {
    const figure = large().container.querySelector<HTMLElement>(
      '[data-slot="nas-front"]',
    );
    // Set through the CSSOM by React, never written into markup (UI-1).
    expect(figure?.style.getPropertyValue("--n")).toBe("5");
  });

  it("places each bracket over the bays of its drive", () => {
    const { container } = large();
    const groups = [
      ...container.querySelectorAll<HTMLElement>('[data-part="group"]'),
    ];
    expect(groups.map((g) => g.style.gridColumn)).toEqual([
      "1 / span 1",
      "2 / span 2",
      "4 / span 1",
      "5 / span 1",
    ]);
    expect(groups.map((g) => g.style.getPropertyValue("--i"))).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(groups.map((g) => g.hasAttribute("data-dashed"))).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("dashes the bracket of a new NAS, whose every disk is ready for storage", () => {
    const { container } = large({ groups: NEW_FRONT_GROUPS });
    const group = container.querySelector<HTMLElement>('[data-part="group"]');
    expect(group?.style.gridColumn).toBe("1 / span 5");
    expect(group).toHaveAttribute("data-dashed", "true");
    expect(group?.querySelector('[data-part="bracket"]')?.className).toMatch(
      /border-dashed/u,
    );
    expect(screen.getByText("Ready for storage")).toBeInTheDocument();
  });

  it("has no board without a stick", () => {
    const { container } = large({ board: [] });
    expect(container.querySelector('[data-part="board"]')).toBeNull();
    expect(
      container
        .querySelector<HTMLElement>('[data-slot="nas-front"]')
        ?.style.getPropertyValue("--n"),
    ).toBe("5");
  });

  it("marks the first visit for the assembly, and nothing otherwise", () => {
    const { container, rerender } = large({ assemble: true });
    const figure = container.querySelector('[data-slot="nas-front"]');
    expect(figure).toHaveAttribute("data-assemble", "full");
    rerender(
      <NasFront
        host={FRONT_HOST}
        bays={FRONT_BAYS}
        label={FRONT_LABELS.large}
      />,
    );
    expect(figure).not.toHaveAttribute("data-assemble");
    expect(figure).not.toHaveAttribute("data-checked");
  });

  it("draws no health without `checked`: every caddy in the drawing's line", () => {
    const { container } = large();
    for (const caddy of container.querySelectorAll('[data-part="caddy"]')) {
      expect(caddy.className).toMatch(/border-art-line/u);
      expect(caddy.className).not.toMatch(/border-dashed/u);
    }
  });

  it("shows text that looks like markup as text", () => {
    const { container } = large({
      bays: FRONT_BAYS.map((bay, i) =>
        i === 0 ? { ...bay, detail: "<b>Not read</b>" } : bay,
      ),
    });
    expect(screen.getByText("<b>Not read</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });

  it("merges the caller's class name and props", () => {
    const { container } = large({ className: "mt-8", id: "front" });
    const figure = container.querySelector('[data-slot="nas-front"]');
    expect(figure).toHaveClass("mt-8");
    expect(figure).toHaveAttribute("id", "front");
  });
});

describe("NasFront, small", () => {
  it("is one image named by its label, its parts hidden", () => {
    const { container } = small();
    const image = screen.getByRole("img", { name: FRONT_LABELS.before });
    expect(image.tagName).toBe("FIGURE");
    expect(screen.queryByRole("list")).toBeNull();
    expect(container.querySelector('[data-part="labels"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container.querySelector('[data-part="board"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shows the caddies and the device names only: no kind, size, temperature or bracket", () => {
    const { container } = small({ groups: [] });
    expect(container.querySelector('[data-part="fact"]')).toBeNull();
    expect(container.querySelector('[data-part="groups"]')).toBeNull();
    expect(container.querySelector('[data-part="stick-words"]')).toBeNull();
    expect(
      [...container.querySelectorAll('[data-part="device"]')].map(
        (d) => d.textContent,
      ),
    ).toEqual(["sda", "sdb", "sdc", "sdd", "sde"]);
  });

  it("dashes each caddy in the Unknown stroke before the check", () => {
    const { container } = small({ checked: false });
    const figure = container.querySelector('[data-slot="nas-front"]');
    expect(figure).toHaveAttribute("data-checked", "false");
    expect(figure).not.toHaveAttribute("data-landed");
    for (const caddy of container.querySelectorAll('[data-part="caddy"]')) {
      expect(caddy.className).toMatch(/border-dashed/u);
      expect(caddy.className).toMatch(/border-unknown-stroke/u);
    }
  });

  it("draws each caddy solid after the check", () => {
    const { container } = small({
      checked: true,
      label: FRONT_LABELS.after,
    });
    expect(
      screen.getByRole("img", { name: FRONT_LABELS.after }),
    ).toHaveAttribute("data-checked", "true");
    for (const caddy of container.querySelectorAll('[data-part="caddy"]')) {
      expect(caddy.className).toMatch(/border-art-line/u);
      expect(caddy.className).not.toMatch(/border-dashed/u);
    }
  });

  it("wipes the dashed line away off the solid one when the result lands on the page", () => {
    const { container } = small({ checked: true, landed: true });
    const figure = container.querySelector('[data-slot="nas-front"]');
    expect(figure).toHaveAttribute("data-landed", "true");
    const caddies = [
      ...container.querySelectorAll<HTMLElement>('[data-part="caddy"]'),
    ];
    for (const caddy of caddies) {
      // The caddy's own line is solid already; the dashed one lies over it only while it wipes.
      expect(caddy.className).toMatch(/(^| )border-art-line( |$)/u);
      expect(caddy.className).toMatch(/after:border-dashed/u);
    }
    // Disk by disk: each bay carries its place for the stagger.
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-part="bay"]')].map(
        (b) => b.style.getPropertyValue("--i"),
      ),
    ).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("ignores `landed` before the check", () => {
    const { container } = small({ checked: false, landed: true });
    expect(
      container.querySelector('[data-slot="nas-front"]'),
    ).not.toHaveAttribute("data-landed");
  });
});
