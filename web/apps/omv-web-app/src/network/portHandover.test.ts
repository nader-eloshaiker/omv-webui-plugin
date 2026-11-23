// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { handOverPort, takeHandedOverPort } from "./portHandover.ts";

describe("the port handed over to the set-up form", () => {
  it("is taken once, then forgotten", () => {
    handOverPort("enp3s0");
    expect(takeHandedOverPort()).toBe("enp3s0");
    expect(takeHandedOverPort()).toBeNull();
  });

  it("holds only a kernel interface name", () => {
    handOverPort("eth0/../x");
    expect(takeHandedOverPort()).toBeNull();
  });

  it("keeps the last port handed over", () => {
    handOverPort("enp3s0");
    handOverPort("enp4s0");
    expect(takeHandedOverPort()).toBe("enp4s0");
  });
});
