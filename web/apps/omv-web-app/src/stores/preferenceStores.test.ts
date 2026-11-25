// SPDX-License-Identifier: GPL-3.0-or-later
// The animations, tips and first-time preferences: each stores only its own small value (UI-13), and
// each checks what it reads back.
import { afterEach, describe, expect, it } from "vitest";
import { clearStorage, storageSnapshot } from "./storageSnapshot.ts";
import { MOTION_STORAGE_KEY, useMotionStore } from "./useMotionStore.ts";
import { hasSeen, SEEN_STORAGE_KEY, useSeenStore } from "./useSeenStore.ts";
import { TIPS_STORAGE_KEY, useTipsStore } from "./useTipsStore.ts";

afterEach(() => {
  useMotionStore.setState({ motion: "full" });
  useTipsStore.setState({ show: true, offered: false });
  useSeenStore.setState({ seen: [] });
  clearStorage();
});

describe("useMotionStore", () => {
  it("stores the one word, and nothing else", () => {
    useMotionStore.getState().setMotion("reduced");
    const { local, session } = storageSnapshot();
    expect(Object.keys(local)).toEqual([MOTION_STORAGE_KEY]);
    expect(JSON.parse(local[MOTION_STORAGE_KEY] ?? "")).toEqual({
      state: { motion: "reduced" },
      version: 1,
    });
    expect(session).toEqual({});
  });

  it("ignores anything but the two words when read back", async () => {
    const storage = useMotionStore.persist.getOptions().storage;
    await storage?.setItem(MOTION_STORAGE_KEY, {
      state: { motion: "none" as "full" },
      version: 1,
    });
    await useMotionStore.persist.rehydrate();
    expect(useMotionStore.getState().motion).toBe("full");
  });
});

describe("useTipsStore", () => {
  it("stores two booleans, and nothing else", () => {
    useTipsStore.getState().setShow(false);
    useTipsStore.getState().setOffered(true);
    const { local } = storageSnapshot();
    expect(Object.keys(local)).toEqual([TIPS_STORAGE_KEY]);
    expect(JSON.parse(local[TIPS_STORAGE_KEY] ?? "")).toEqual({
      state: { show: false, offered: true },
      version: 1,
    });
  });

  it("keeps tips on unless false was stored, and the offer unmade unless true was", async () => {
    const storage = useTipsStore.persist.getOptions().storage;
    await storage?.setItem(TIPS_STORAGE_KEY, {
      state: {
        show: "no" as unknown as boolean,
        offered: 1 as unknown as boolean,
      },
      version: 1,
    });
    await useTipsStore.persist.rehydrate();
    expect(useTipsStore.getState()).toMatchObject({
      show: true,
      offered: false,
    });
  });
});

describe("useSeenStore", () => {
  it("stores the names seen, once each", () => {
    useSeenStore.getState().markSeen("tip.palette");
    useSeenStore.getState().markSeen("tip.palette");
    expect(hasSeen("tip.palette")(useSeenStore.getState())).toBe(true);
    expect(hasSeen("tip.trace")(useSeenStore.getState())).toBe(false);
    const { local } = storageSnapshot();
    expect(Object.keys(local)).toEqual([SEEN_STORAGE_KEY]);
    expect(JSON.parse(local[SEEN_STORAGE_KEY] ?? "")).toEqual({
      state: { seen: ["tip.palette"] },
      version: 1,
    });
  });

  it("keeps only known names when read back", async () => {
    const storage = useSeenStore.persist.getOptions().storage;
    await storage?.setItem(SEEN_STORAGE_KEY, {
      state: {
        seen: ["tip.trace", "someone@example.org", "tip.trace", 7] as never,
      },
      version: 1,
    });
    await useSeenStore.persist.rehydrate();
    expect(useSeenStore.getState().seen).toEqual(["tip.trace"]);
  });

  it("forgets everything on reset", () => {
    useSeenStore.getState().markSeen("tip.first-save");
    useSeenStore.getState().reset();
    expect(useSeenStore.getState().seen).toEqual([]);
  });
});
