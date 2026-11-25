// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips": the switch writes the stored preference, and so does the palette's entry.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearStorage,
  storageSnapshot,
} from "../../../stores/storageSnapshot.ts";
import {
  TIPS_STORAGE_KEY,
  useTipsStore,
} from "../../../stores/useTipsStore.ts";
import { ShowTipsSwitch } from "./ShowTipsSwitch.tsx";
import { tipsCommand } from "./tipsCommand.ts";
import { TipsProvider } from "./TipsProvider.tsx";

afterEach(() => {
  useTipsStore.setState({ show: true, offered: false });
  clearStorage();
});

describe("ShowTipsSwitch", () => {
  it("is named Show tips, says what tips are, and writes the store both ways", async () => {
    const user = userEvent.setup();
    render(<ShowTipsSwitch />);
    const toggle = screen.getByRole("switch", { name: "Show tips" });
    expect(toggle).toHaveAccessibleDescription(
      "Tips explain things the first time you meet them.",
    );
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(useTipsStore.getState().show).toBe(false);
    expect(toggle).not.toBeChecked();
    expect(
      JSON.parse(storageSnapshot().local[TIPS_STORAGE_KEY] ?? "{}"),
    ).toEqual({ state: { show: false, offered: false }, version: 1 });

    await user.click(toggle);
    expect(useTipsStore.getState().show).toBe(true);
  });

  it("follows a provider that seeds the view, and reports a change to it", async () => {
    const user = userEvent.setup();
    let told: boolean | null = null;
    render(
      <TipsProvider
        show={false}
        onShowChange={(show) => {
          told = show;
        }}
      >
        <ShowTipsSwitch />
      </TipsProvider>,
    );
    const toggle = screen.getByRole("switch", { name: "Show tips" });
    expect(toggle).not.toBeChecked();
    // The seed is not written to the store.
    expect(useTipsStore.getState().show).toBe(true);
    await user.click(toggle);
    expect(told).toBe(true);
  });
});

describe("tipsCommand", () => {
  it("offers Hide tips while they show and Show tips while they do not", () => {
    let shown = true;
    const set = (show: boolean) => {
      shown = show;
    };
    const hide = tipsCommand(true, set, "Preferences");
    expect(hide.label).toBe("Hide tips");
    hide.onSelect();
    expect(shown).toBe(false);
    const showItem = tipsCommand(false, set, "Preferences");
    expect(showItem.label).toBe("Show tips");
    showItem.onSelect();
    expect(shown).toBe(true);
  });
});
