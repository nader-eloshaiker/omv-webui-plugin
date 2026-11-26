// SPDX-License-Identifier: GPL-3.0-or-later
// The "Animations" preference reaches the library's motion: through MotionProvider for components,
// and through the adapters for code that may sit outside one or runs outside React. The first-time
// flags reach `useFirstTime` the same way.
import {
  MotionProvider,
  useReducedMotion as useLibraryReducedMotion,
} from "@omv-webui/react-ui-components";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { clearStorage, storageSnapshot } from "../stores/storageSnapshot.ts";
import { useMotionStore } from "../stores/useMotionStore.ts";
import { SEEN_STORAGE_KEY, useSeenStore } from "../stores/useSeenStore.ts";
import { forgetFirstTime, useFirstTime } from "./useFirstTime.ts";
import {
  reducedMotionAt,
  useMotionPreference,
  useReducedMotion,
} from "./useMotionPreference.ts";

afterEach(() => {
  useMotionStore.setState({ motion: "full" });
  useSeenStore.setState({ seen: [] });
  clearStorage();
});

describe("the Animations preference", () => {
  it("reaches the library through MotionProvider", () => {
    function Preference({ children }: { children: ReactNode }) {
      return (
        <MotionProvider reduced={useMotionPreference()}>
          {children}
        </MotionProvider>
      );
    }
    const { result } = renderHook(() => useLibraryReducedMotion(), {
      wrapper: Preference,
    });
    expect(result.current).toBe(false);
    act(() => {
      useMotionStore.getState().setMotion("reduced");
    });
    expect(result.current).toBe(true);
  });

  it("is followed by the adapter outside a provider", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      useMotionStore.getState().setMotion("reduced");
    });
    expect(result.current).toBe(true);
  });

  it("is read outside React for any element", () => {
    const element = document.createElement("div");
    expect(reducedMotionAt(element)).toBe(false);
    useMotionStore.getState().setMotion("reduced");
    expect(reducedMotionAt(element)).toBe(true);
  });
});

describe("useFirstTime", () => {
  it("is a first time until done, stores only the flag's name, and comes again once forgotten", () => {
    const { result } = renderHook(() =>
      useFirstTime("motion.first-pending-flight"),
    );
    expect(result.current.first).toBe(true);
    act(() => {
      result.current.done();
    });
    expect(result.current.first).toBe(false);
    expect(useSeenStore.getState().seen).toEqual([
      "motion.first-pending-flight",
    ]);
    expect(
      JSON.parse(storageSnapshot().local[SEEN_STORAGE_KEY] ?? "{}"),
    ).toEqual({ state: { seen: ["motion.first-pending-flight"] }, version: 1 });
    act(() => {
      forgetFirstTime("motion.first-pending-flight");
    });
    expect(result.current.first).toBe(true);
  });

  it("forgets one flag and keeps the others", () => {
    useSeenStore.setState({ seen: ["motion.table-bars", "tip.palette"] });
    forgetFirstTime("motion.table-bars");
    expect(useSeenStore.getState().seen).toEqual(["tip.palette"]);
  });
});
