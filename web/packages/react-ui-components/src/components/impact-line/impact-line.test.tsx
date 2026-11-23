// SPDX-License-Identifier: GPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImpactLine, type ImpactClass } from "./impact-line";

const words: Record<ImpactClass, string> = {
  none: "This page keeps working.",
  brief:
    "This page may stop responding for a few seconds while the network restarts, then carries on.",
  moves:
    "This page stops working at 192.0.2.10. The NAS will be at 192.0.2.20.",
  mayCut:
    "If this setting is wrong, this page loses the NAS, and you need another way in to put it right.",
  refused: "Connect this computer through another interface first.",
};

describe("ImpactLine", () => {
  it("draws a different shape for every class, all in the neutral ink", () => {
    const shapes = new Set<string>();
    for (const impact of Object.keys(words) as ImpactClass[]) {
      const { container, unmount } = render(
        <ImpactLine impact={impact}>{words[impact]}</ImpactLine>,
      );
      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
      shapes.add(
        Array.from(icon?.classList ?? []).find((name) =>
          name.startsWith("lucide-"),
        ) ?? "",
      );
      unmount();
    }
    expect(shapes.size).toBe(5);
  });

  it("is one polite region that announces the new class as the form changes", () => {
    const { rerender } = render(
      <ImpactLine id="impact" impact="none">
        {words.none}
      </ImpactLine>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("id", "impact");
    rerender(
      <ImpactLine
        id="impact"
        impact="moves"
        detail="Open the NAS at its new address afterwards: http://192.0.2.20/ui/"
      >
        {words.moves}
      </ImpactLine>,
    );
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveAttribute("data-impact", "moves");
    expect(region).toHaveTextContent(words.moves);
    expect(region).toHaveTextContent("http://192.0.2.20/ui/");
  });

  it("is not live where the line does not change while read", () => {
    render(
      <ImpactLine impact="mayCut" live={false}>
        {words.mayCut}
      </ImpactLine>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(words.mayCut)).toBeInTheDocument();
  });
});
