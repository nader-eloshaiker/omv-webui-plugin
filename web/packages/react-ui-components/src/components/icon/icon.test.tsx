// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it } from "vitest";
import {
  ACTION_ICON_NAMES,
  Icon,
  IconBadge,
  IconPlate,
  OBJECT_ICON_NAMES,
} from "./icon";

describe("Icon", () => {
  it("is decorative by default: hidden from assistive technology, no role, no name", () => {
    const { container } = render(<Icon name="shared-folder" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("is an image with that name when it is given a label", () => {
    render(<Icon name="disk-nvme" label="NVMe drive" />);
    const img = screen.getByRole("img", { name: "NVMe drive" });
    expect(img).not.toHaveAttribute("aria-hidden");
  });

  it("draws at 16, 20 and 24px with a 1.75px stroke at each size, 20 by default", () => {
    const { container, rerender } = render(<Icon name="person" />);
    const svg = () => container.querySelector("svg");
    expect(svg()).toHaveAttribute("width", "20");
    expect(svg()).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg()).toHaveClass("size-5");
    expect(Number(svg()?.getAttribute("stroke-width")) * (20 / 24)).toBeCloseTo(
      1.75,
    );
    for (const [size, cls] of [
      [16, "size-4"],
      [24, "size-6"],
    ] as const) {
      rerender(<Icon name="person" size={size} />);
      expect(svg()).toHaveAttribute("height", String(size));
      expect(svg()).toHaveClass(cls);
      expect(
        Number(svg()?.getAttribute("stroke-width")) * (size / 24),
      ).toBeCloseTo(1.75);
    }
  });

  it("draws every name in the set with a plane and an outline in currentColor", () => {
    for (const name of [...OBJECT_ICON_NAMES, ...ACTION_ICON_NAMES]) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).toHaveAttribute("data-icon", name);
      expect(svg, name).toHaveAttribute("stroke", "currentColor");
      expect(svg?.children.length, name).toBeGreaterThan(0);
      // Only `create` is drawn without a plane: something new is empty until it is made.
      if (name !== "create") {
        expect(svg?.querySelector('[data-part="plane"]'), name).not.toBeNull();
      }
      unmount();
    }
  });

  it("marks objects and actions apart, and an action icon's motion and state", () => {
    const { container, rerender } = render(<Icon name="share" />);
    const svg = () => container.querySelector("svg");
    expect(svg()).toHaveAttribute("data-kind", "action");
    expect(svg()).toHaveAttribute("data-motion", "auto");
    expect(svg()).toHaveAttribute("data-state", "rest");
    rerender(<Icon name="share" state="done" motion="none" />);
    expect(svg()).toHaveAttribute("data-state", "done");
    expect(svg()).toHaveAttribute("data-motion", "none");
    rerender(<Icon name="group" />);
    expect(svg()).toHaveAttribute("data-kind", "object");
  });

  it("cuts a badge out of the drawing and draws it in its status's shape", () => {
    const { container } = render(
      <>
        <Icon name="disk-hdd" badge="warning" />
        <Icon name="disk-hdd" badge="critical" />
      </>,
    );
    const [warning, critical] = container.querySelectorAll("svg");
    const clip = warning?.querySelector("clipPath");
    const clipId = clip?.getAttribute("id") ?? "";
    expect(clipId).toMatch(/^icon-cut-[\w-]+$/);
    expect(warning?.querySelector("g[clip-path]")).toHaveAttribute(
      "clip-path",
      `url(#${clipId})`,
    );
    // Two icons on one page never share a cut.
    expect(critical?.querySelector("clipPath")?.getAttribute("id")).not.toBe(
      clipId,
    );
    const badge = warning?.querySelector('[data-slot="icon-badge"]');
    expect(badge).toHaveAttribute("data-status", "warning");
    expect(badge?.querySelector("polygon")).toHaveClass(
      "fill-warning",
      "stroke-warning-stroke",
    );
    // A badge that is there from the start does not move.
    expect(badge).not.toHaveAttribute("data-changed");
  });

  it("draws Unknown as a hollow ring and pending with the clock's hands in its ink", () => {
    const { container } = render(
      <>
        <Icon name="disk" badge="unknown" />
        <Icon name="shared-folder" badge="pending" />
      </>,
    );
    const [unknown, pending] = container.querySelectorAll(
      '[data-slot="icon-badge"]',
    );
    expect(unknown?.querySelector("circle")).toHaveClass(
      "fill-none",
      "stroke-unknown-stroke",
    );
    expect(pending?.querySelector("circle")).toHaveClass("fill-pending");
    expect(pending?.querySelector("path")).toHaveClass(
      "stroke-pending-foreground",
    );
  });

  it("puts an object's create mark in the cut, with the check it becomes", () => {
    const { container } = render(<Icon name="person" mark="create" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-mark", "create");
    expect(svg?.querySelector("clipPath")).not.toBeNull();
    const mark = svg?.querySelector('[data-slot="icon-mark"]');
    expect(mark?.querySelector('[data-part="mark"]')).not.toBeNull();
    expect(mark?.querySelector('[data-part="done"]')).toHaveAttribute(
      "pathLength",
      "1",
    );
  });

  it("merges className last and forwards the ref and native props", () => {
    const ref = React.createRef<SVGSVGElement>();
    const { container } = render(
      <Icon
        ref={ref}
        name="nas"
        className="text-muted-foreground size-8"
        data-testid="nas"
      />,
    );
    const svg = container.querySelector("svg");
    expect(ref.current).toBe(svg);
    expect(svg).toHaveAttribute("data-testid", "nas");
    expect(svg).toHaveClass("text-muted-foreground", "size-8");
    expect(svg).not.toHaveClass("size-5");
  });
});

describe("IconBadge", () => {
  it("crossfades in when its status changes after the first render, not before", () => {
    const { container, rerender } = render(
      <svg>
        <IconBadge status="warning" />
      </svg>,
    );
    const badge = () => container.querySelector('[data-slot="icon-badge"]');
    expect(badge()).not.toHaveAttribute("data-changed");
    rerender(
      <svg>
        <IconBadge status="ok" />
      </svg>,
    );
    expect(badge()).toHaveAttribute("data-status", "ok");
    expect(badge()).toHaveAttribute("data-changed");
  });
});

describe("IconPlate", () => {
  it("holds the icon at 20 on the 32px plate, still, and decorative beside a title", () => {
    const { container } = render(<IconPlate name="shared-folder" />);
    const plate = container.querySelector('[data-slot="icon-plate"]');
    expect(plate).toHaveClass("size-8", "bg-muted");
    const svg = plate?.querySelector("svg");
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("data-motion", "none");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("names the icon when the plate stands alone", () => {
    render(<IconPlate name="group" label="Group" />);
    expect(screen.getByRole("img", { name: "Group" })).toBeInTheDocument();
  });
});
