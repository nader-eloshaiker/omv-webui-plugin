// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips": the switch and the palette's entry change the provider's preference, and the "Hide
// tips too?" offer is made once, never with tips off, goes by itself after 8 seconds, and its
// button turns tips off.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "../toast/toast";
import { UiProvider } from "../ui-provider/ui-provider";
import { ShowTipsSwitch } from "./show-tips-switch";
import { tipsCommand } from "./tips-command";
import { useShowTips } from "./tips-context";
import { TipsProvider } from "./tips-provider";
import { HIDE_TIPS_OFFER_MS, useHideTipsOffer } from "./use-hide-tips-offer";

afterEach(() => {
  vi.useRealTimers();
});

function Preference({
  initial = true,
  onShowChange,
  children,
}: {
  initial?: boolean;
  onShowChange?: (show: boolean) => void;
  children: React.ReactNode;
}) {
  const [show, setShow] = React.useState(initial);
  return (
    <TipsProvider
      show={show}
      onShowChange={(next) => {
        setShow(next);
        onShowChange?.(next);
      }}
      seen={[]}
      onSeen={() => undefined}
    >
      {children}
    </TipsProvider>
  );
}

describe("ShowTipsSwitch", () => {
  it("is named by its label, described by its hint, and changes the preference both ways", async () => {
    const user = userEvent.setup();
    const told: boolean[] = [];
    render(
      <Preference onShowChange={(show) => told.push(show)}>
        <ShowTipsSwitch
          label="Show tips"
          hint="Tips explain things the first time you meet them."
        />
      </Preference>,
    );
    const toggle = screen.getByRole("switch", { name: "Show tips" });
    expect(toggle).toHaveAccessibleDescription(
      "Tips explain things the first time you meet them.",
    );
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(told).toEqual([false, true]);
  });
});

describe("tipsCommand", () => {
  it("offers Hide tips while they show and Show tips while they do not", () => {
    let shown = true;
    const set = (show: boolean) => {
      shown = show;
    };
    const words = {
      group: "Preferences",
      hideLabel: "Hide tips",
      showLabel: "Show tips",
    };
    const hide = tipsCommand({ show: true, setShow: set, ...words });
    expect(hide.id).toBe("preference.tips");
    expect(hide.label).toBe("Hide tips");
    hide.onSelect();
    expect(shown).toBe(false);
    const showItem = tipsCommand({ show: false, setShow: set, ...words });
    expect(showItem.label).toBe("Show tips");
    showItem.onSelect();
    expect(shown).toBe(true);
  });
});

const COMPACT = "Compact view on. Hide tips too?";

function Offer({
  offered,
  onOffered,
}: {
  offered: boolean;
  onOffered: () => void;
}) {
  const { offer } = useHideTipsOffer({
    offered,
    onOffered,
    actionLabel: "Hide tips",
  });
  const [show] = useShowTips();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          offer(COMPACT);
        }}
      >
        Switch to compact
      </button>
      <p>{show ? "Tips on" : "Tips off"}</p>
    </>
  );
}

function offerPage({
  tips = true,
  offered = false,
}: { tips?: boolean; offered?: boolean } = {}) {
  const onOffered = vi.fn();
  render(
    <UiProvider>
      <Preference initial={tips}>
        <Offer offered={offered} onOffered={onOffered} />
      </Preference>
      <Toaster closeLabel="Dismiss" regionLabel="Notifications" />
    </UiProvider>,
  );
  return onOffered;
}

const press = (name: string) => {
  act(() => {
    screen.getByRole("button", { name }).click();
  });
};

describe("useHideTipsOffer", () => {
  it("is made once, with a button that turns tips off", () => {
    const onOffered = offerPage();
    press("Switch to compact");
    expect(screen.getByText(COMPACT)).toBeInTheDocument();
    expect(onOffered).toHaveBeenCalledTimes(1);
    press("Switch to compact");
    expect(onOffered).toHaveBeenCalledTimes(1);
    press("Hide tips");
    expect(screen.getByText("Tips off")).toBeInTheDocument();
  });

  it("is not made when the app says it was made before", () => {
    const onOffered = offerPage({ offered: true });
    press("Switch to compact");
    expect(screen.queryByText(COMPACT)).not.toBeInTheDocument();
    expect(onOffered).not.toHaveBeenCalled();
  });

  it("is not made when tips are already off, and is not used up", () => {
    const onOffered = offerPage({ tips: false });
    press("Switch to compact");
    expect(screen.queryByText(COMPACT)).not.toBeInTheDocument();
    expect(onOffered).not.toHaveBeenCalled();
  });

  it("goes by itself after 8 seconds, and leaves tips as they were", async () => {
    vi.useFakeTimers();
    offerPage();
    press("Switch to compact");
    expect(screen.getByText(COMPACT)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIDE_TIPS_OFFER_MS - 500);
    });
    expect(screen.getByText(COMPACT)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText(COMPACT)).not.toBeInTheDocument();
    expect(screen.getByText("Tips on")).toBeInTheDocument();
  });
});
