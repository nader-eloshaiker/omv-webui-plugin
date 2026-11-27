// SPDX-License-Identifier: GPL-3.0-or-later
// The first-visit flag: stored as one boolean and nothing else (UI-13), checked when read back.
import { afterEach, describe, expect, it } from "vitest";
import { clearStorage, storageSnapshot } from "./storageSnapshot.ts";
import { useWelcomeStore, WELCOME_STORAGE_KEY } from "./useWelcomeStore.ts";

afterEach(() => {
  useWelcomeStore.setState({ seen: false });
  clearStorage();
});

describe("useWelcomeStore", () => {
  it("stores that the first visit was seen, and nothing else", () => {
    useWelcomeStore.getState().setSeen(true);
    const { local, session } = storageSnapshot();
    expect(Object.keys(local)).toEqual([WELCOME_STORAGE_KEY]);
    expect(JSON.parse(local[WELCOME_STORAGE_KEY] ?? "")).toEqual({
      state: { seen: true },
      version: 1,
    });
    expect(session).toEqual({});
  });

  it("reads it back, and takes anything but true as a first visit", async () => {
    const storage = useWelcomeStore.persist.getOptions().storage;
    await storage?.setItem(WELCOME_STORAGE_KEY, {
      state: { seen: true },
      version: 1,
    });
    await useWelcomeStore.persist.rehydrate();
    expect(useWelcomeStore.getState().seen).toBe(true);

    await storage?.setItem(WELCOME_STORAGE_KEY, {
      state: { seen: "yes" as unknown as boolean },
      version: 1,
    });
    await useWelcomeStore.persist.rehydrate();
    expect(useWelcomeStore.getState().seen).toBe(false);
  });
});
