// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a named type step beside a text colour", () => {
    expect(cn("text-caption font-semibold", "text-warning-label")).toBe(
      "text-caption font-semibold text-warning-label",
    );
    expect(cn("text-section", "text-foreground")).toBe(
      "text-section text-foreground",
    );
  });

  it("lets a later type step win over an earlier one", () => {
    expect(cn("text-caption", "text-body")).toBe("text-body");
    expect(cn("text-sm", "text-caption")).toBe("text-caption");
  });

  it("lets a later corner win, as for any radius", () => {
    expect(cn("rounded-control", "rounded-full")).toBe("rounded-full");
  });
});
