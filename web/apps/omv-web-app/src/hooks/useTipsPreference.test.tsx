// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" and the first-time flags reach the library's tips through the adapters: the switch
// writes the stored preference, a seeded view does not, "Got it" and a first success store the
// tip's flag and nothing else, and the "Hide tips too?" offer is made once in this browser.
import {
  ShowTipsSwitch,
  Tip,
  TipsProvider,
  Toaster,
  UiProvider,
} from "@omv-webui/react-ui-components";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { clearStorage, storageSnapshot } from "../stores/storageSnapshot.ts";
import { hasSeen, useSeenStore } from "../stores/useSeenStore.ts";
import { TIPS_STORAGE_KEY, useTipsStore } from "../stores/useTipsStore.ts";
import {
  endTip,
  useStoredHideTipsOffer,
  useTipsPreference,
} from "./useTipsPreference.ts";

afterEach(() => {
  useTipsStore.setState({ show: true, offered: false });
  useSeenStore.setState({ seen: [] });
  clearStorage();
});

function Stored({
  show,
  onShowChange,
  children,
}: {
  show?: boolean;
  onShowChange?: (show: boolean) => void;
  children: ReactNode;
}) {
  return (
    <TipsProvider {...useTipsPreference({ show, onShowChange })}>
      {children}
    </TipsProvider>
  );
}

const SWITCH = (
  <ShowTipsSwitch
    label="Show tips"
    hint="Tips explain things the first time you meet them."
  />
);

const TRACE_LINE =
  "Point at a folder, a disk or a way in to see what belongs to it.";

const TRACE = (
  <Tip
    id="tip.trace"
    dismissLabel="Got it"
    dismissName="Got it, hide the tip about pointing at the map"
  >
    {TRACE_LINE}
  </Tip>
);

describe("useTipsPreference", () => {
  it("writes the stored preference from the switch, both ways, and nothing else", async () => {
    const user = userEvent.setup();
    render(<Stored>{SWITCH}</Stored>);
    const toggle = screen.getByRole("switch", { name: "Show tips" });
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

  it("follows a seeded view without writing the store, and reports a change to it", async () => {
    const user = userEvent.setup();
    let told: boolean | null = null;
    render(
      <Stored
        show={false}
        onShowChange={(show) => {
          told = show;
        }}
      >
        {SWITCH}
      </Stored>,
    );
    const toggle = screen.getByRole("switch", { name: "Show tips" });
    expect(toggle).not.toBeChecked();
    expect(useTipsStore.getState().show).toBe(true);
    await user.click(toggle);
    expect(told).toBe(true);
  });

  it("stores the flag on Got it, and the tip stays away on the next visit", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Stored>{TRACE}</Stored>);
    await user.click(screen.getByRole("button", { name: /^Got it/ }));
    expect(hasSeen("tip.trace")(useSeenStore.getState())).toBe(true);
    await waitFor(() => {
      expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    });
    unmount();
    render(<Stored>{TRACE}</Stored>);
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
  });

  it("ends a tip on its first success, from outside the tip", async () => {
    render(<Stored>{TRACE}</Stored>);
    expect(screen.getByText(TRACE_LINE)).toBeInTheDocument();
    act(() => {
      endTip("tip.trace");
    });
    await waitFor(() => {
      expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    });
  });

  it("never shows a tip with tips off in the store, and does not count it as seen", () => {
    useTipsStore.setState({ show: false });
    render(<Stored>{TRACE}</Stored>);
    expect(screen.queryByText(TRACE_LINE)).not.toBeInTheDocument();
    expect(hasSeen("tip.trace")(useSeenStore.getState())).toBe(false);
  });
});

const COMPACT = "Compact view on. Hide tips too?";

function Offer() {
  const { offer } = useStoredHideTipsOffer("Hide tips");
  return (
    <button
      type="button"
      onClick={() => {
        offer(COMPACT);
      }}
    >
      Switch to compact
    </button>
  );
}

function offerPage() {
  render(
    <UiProvider>
      <Stored>
        <Offer />
      </Stored>
      <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
    </UiProvider>,
  );
}

const press = (name: string) => {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
};

describe("useStoredHideTipsOffer", () => {
  it("records the offer, and its button turns tips off in the store", () => {
    offerPage();
    press("Switch to compact");
    expect(screen.getByText(COMPACT)).toBeInTheDocument();
    expect(useTipsStore.getState().offered).toBe(true);
    press("Hide tips");
    expect(useTipsStore.getState().show).toBe(false);
  });

  it("is made once only, in this browser", () => {
    useTipsStore.setState({ offered: true });
    offerPage();
    press("Switch to compact");
    expect(screen.queryByText(COMPACT)).not.toBeInTheDocument();
  });

  it("is not made when tips are off in the store, and is not used up", () => {
    useTipsStore.setState({ show: false });
    offerPage();
    press("Switch to compact");
    expect(screen.queryByText(COMPACT)).not.toBeInTheDocument();
    expect(useTipsStore.getState().offered).toBe(false);
  });
});
