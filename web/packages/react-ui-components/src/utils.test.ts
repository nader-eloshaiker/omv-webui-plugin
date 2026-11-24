// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a named type step beside a text colour", () => {
    expect(cn("text-section text-foreground")).toBe(
      "text-section text-foreground",
    );
    expect(cn("text-caption text-tertiary-foreground")).toBe(
      "text-caption text-tertiary-foreground",
    );
  });

  it("lets a later class of the same kind win for the design system's own names", () => {
    expect(cn("text-body", "text-sm")).toBe("text-sm");
    expect(cn("p-card", "p-4")).toBe("p-4");
    expect(cn("min-h-control", "min-h-control-sm")).toBe("min-h-control-sm");
    expect(cn("shadow-raised", "shadow-floating")).toBe("shadow-floating");
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("ease-standard", "ease-settle")).toBe("ease-settle");
    expect(cn("rounded-control", "rounded-full")).toBe("rounded-full");
  });

  it("keeps a size beside a later status colour, and lets a later type step win", () => {
    expect(cn("text-caption font-semibold", "text-warning-label")).toBe(
      "text-caption font-semibold text-warning-label",
    );
    expect(cn("text-caption", "text-body")).toBe("text-body");
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });
});
