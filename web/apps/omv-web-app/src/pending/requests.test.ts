// SPDX-License-Identifier: GPL-3.0-or-later
// The palette's "Apply N pending changes" reaches the band as an event and keeps nothing.
import { describe, expect, it, vi } from "vitest";
import { onApplyRequested, requestApply } from "./requests.ts";

describe("requestApply", () => {
  it("tells every listener once, and no one after it unsubscribes", () => {
    const band = vi.fn();
    const off = onApplyRequested(band);
    requestApply();
    expect(band).toHaveBeenCalledOnce();
    off();
    requestApply();
    expect(band).toHaveBeenCalledOnce();
  });
});
