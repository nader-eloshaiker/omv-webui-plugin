// SPDX-License-Identifier: GPL-3.0-or-later
// The theme preference: stored as one word and nothing else (UI-13), checked when read back, and put
// on <html> as a class only for an explicit choice.
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme } from "../services/theme/applyTheme.ts";
import { installTheme } from "../services/theme/index.ts";
import { clearStorage, storageSnapshot } from "./storageSnapshot.ts";
import { THEME_STORAGE_KEY, useThemeStore } from "./useThemeStore.ts";

afterEach(() => {
  useThemeStore.setState({ preference: "system" });
  clearStorage();
  document.documentElement.className = "";
});

describe("useThemeStore", () => {
  it("is dark until the person chooses (owner, 2026-11-27)", () => {
    expect(useThemeStore.getInitialState().preference).toBe("dark");
  });

  it("stores the preference and nothing else", () => {
    useThemeStore.getState().setPreference("dark");
    const { local, session } = storageSnapshot();
    expect(Object.keys(local)).toEqual([THEME_STORAGE_KEY]);
    expect(JSON.parse(local[THEME_STORAGE_KEY] ?? "")).toEqual({
      state: { preference: "dark" },
      version: 1,
    });
    expect(session).toEqual({});
  });

  it("reads a stored choice back, and ignores anything that is not one", async () => {
    const storage = useThemeStore.persist.getOptions().storage;
    await storage?.setItem(THEME_STORAGE_KEY, {
      state: { preference: "light" },
      version: 1,
    });
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().preference).toBe("light");

    await storage?.setItem(THEME_STORAGE_KEY, {
      state: { preference: "<b>dark</b>" as "dark" },
      version: 1,
    });
    useThemeStore.setState({ preference: "system" });
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().preference).toBe("system");
  });
});

describe("applyTheme", () => {
  it.each([
    ["system", ""],
    ["light", "light"],
    ["dark", "dark"],
  ] as const)("%s sets the class %j on <html>", (preference, className) => {
    const root = document.createElement("html");
    root.className = "light dark";
    applyTheme(preference, root);
    expect(root.className).toBe(className);
  });

  it("follows the store once installed", () => {
    const uninstall = installTheme();
    useThemeStore.getState().setPreference("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useThemeStore.getState().setPreference("system");
    expect(document.documentElement.className).toBe("");
    uninstall();
  });
});
