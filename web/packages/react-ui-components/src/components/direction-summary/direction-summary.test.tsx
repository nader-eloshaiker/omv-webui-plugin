// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Identifier } from "../text/identifier";
import { DirectionSummary } from "./direction-summary";

describe("DirectionSummary", () => {
  it("draws both sides with a decorative arrow and the caller's sentence in full", () => {
    const { container } = render(
      <DirectionSummary
        fromLabel="From"
        toLabel="To"
        from={<a href="/storage/shared-folders/1">Photos</a>}
        to={<Identifier>/srv/copies/photos on backup.example.org</Identifier>}
        sentence="Copies Photos from this NAS to /srv/copies/photos on backup.example.org."
      />,
    );
    const arrow = container.querySelector(
      "[data-slot=direction-summary-arrow]",
    );
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Photos" })).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot=direction-summary-line]"),
    ).toHaveTextContent(
      "From Photos To /srv/copies/photos on backup.example.org",
    );
    expect(
      screen.getByText(
        "Copies Photos from this NAS to /srv/copies/photos on backup.example.org.",
      ),
    ).toBeInTheDocument();
  });

  it("turns the arrow with the text direction and never cuts a side short", () => {
    const { container } = render(
      <DirectionSummary
        dir="rtl"
        from={<span dir="auto">صور العائلة</span>}
        to={<span dir="auto">نسخة احتياطية</span>}
        sentence="ينسخ صور العائلة إلى نسخة احتياطية."
      />,
    );
    const arrow = container.querySelector(
      "[data-slot=direction-summary-arrow]",
    );
    expect(arrow?.getAttribute("class")).toContain("rtl:-scale-x-100");
    const line = container.querySelector("[data-slot=direction-summary-line]");
    expect(line?.className).toContain("[overflow-wrap:anywhere]");
    expect(line?.className).not.toContain("truncate");
  });

  it("can be a live region for a summary that changes", () => {
    render(
      <DirectionSummary
        role="status"
        from="Photos"
        to="Backup"
        sentence="Copies the files of Photos into Backup, both on this NAS."
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copies the files of Photos into Backup, both on this NAS.",
    );
  });

  it("renders markup-looking names as text", () => {
    const { container } = render(
      <DirectionSummary
        from='<img src=x onerror="alert(1)">'
        to="<b>Backup</b>"
        sentence="Copies <img> into <b>Backup</b>."
      />,
    );
    expect(container.querySelectorAll("img, b")).toHaveLength(0);
  });
});
