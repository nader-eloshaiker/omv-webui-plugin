// SPDX-License-Identifier: GPL-3.0-or-later
// The density preference: stored as one word and nothing else (UI-13), checked when read back, and put
// on <html> as `data-density` only for compact.
import { afterEach, describe, expect, it } from "vitest";
import { applyDensity, installDensity } from "../services/density/index.ts";
import { clearStorage, storageSnapshot } from "./storageSnapshot.ts";
import { DENSITY_STORAGE_KEY, useDensityStore } from "./useDensityStore.ts";

afterEach(() => {
  useDensityStore.setState({ density: "comfortable" });
  clearStorage();
  delete document.documentElement.dataset.density;
});

describe("useDensityStore", () => {
  it("stores the choice and nothing else", () => {
    useDensityStore.getState().setDensity("compact");
    const { local, session } = storageSnapshot();
    expect(Object.keys(local)).toEqual([DENSITY_STORAGE_KEY]);
    expect(JSON.parse(local[DENSITY_STORAGE_KEY] ?? "")).toEqual({
      state: { density: "compact" },
      version: 1,
    });
    expect(session).toEqual({});
  });

  it("reads a stored choice back, and ignores anything that is not one", async () => {
    const storage = useDensityStore.persist.getOptions().storage;
    await storage?.setItem(DENSITY_STORAGE_KEY, {
      state: { density: "compact" },
      version: 1,
    });
    await useDensityStore.persist.rehydrate();
    expect(useDensityStore.getState().density).toBe("compact");

    await storage?.setItem(DENSITY_STORAGE_KEY, {
      state: { density: "tiny" as "compact" },
      version: 1,
    });
    useDensityStore.setState({ density: "comfortable" });
    await useDensityStore.persist.rehydrate();
    expect(useDensityStore.getState().density).toBe("comfortable");
  });
});

describe("applyDensity", () => {
  it("marks <html> only for compact", () => {
    const root = document.createElement("html");
    applyDensity("compact", root);
    expect(root.dataset.density).toBe("compact");
    applyDensity("comfortable", root);
    expect(root.hasAttribute("data-density")).toBe(false);
  });

  it("follows the store once installed", () => {
    const off = installDensity();
    useDensityStore.getState().setDensity("compact");
    expect(document.documentElement.dataset.density).toBe("compact");
    useDensityStore.getState().setDensity("comfortable");
    expect(document.documentElement.hasAttribute("data-density")).toBe(false);
    off();
  });
});
