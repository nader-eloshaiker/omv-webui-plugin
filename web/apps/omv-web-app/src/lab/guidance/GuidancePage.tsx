// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance page (rethink spec 8 row 8, P.3): the four layers of guidance on one page, each a
// region on the page ground under a plain heading, with specimens of the screens they live on.
// Development only (UI-11).
//
// The welcome (P.2) is dismissed by "Got it" or by doing anything on the page: a press or a key
// anywhere here outside the welcome line itself, while it is on screen.
import { useCurrentTip } from "@omv-webui/react-ui-components";
import type { KeyboardEvent, PointerEvent } from "react";
import { endTip } from "../../hooks/useTipsPreference.ts";
import { LayerHelp } from "./LayerHelp.tsx";
import { LayerInterface } from "./LayerInterface.tsx";
import { LayerState } from "./LayerState.tsx";
import { LayerTips } from "./LayerTips.tsx";

/** Keys that only move around the page; they are not doing anything on it. */
const MOVING = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "Escape"]);

export function GuidancePage({
  compact,
  chrome,
  onNote,
  onOpenPalette,
}: {
  compact: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
  onOpenPalette: () => void;
}) {
  const current = useCurrentTip();
  const onAction = (event: PointerEvent | KeyboardEvent) => {
    if ("key" in event && MOVING.has(event.key)) {
      return;
    }
    const target = event.target as Element;
    if (
      current === "tip.new-interface" &&
      !target.closest('[data-tip="tip.new-interface"]')
    ) {
      endTip("tip.new-interface");
    }
  };
  return (
    <div className="g-page" onPointerDown={onAction} onKeyDown={onAction}>
      <header className="g-page-head">
        <h1 className="g-page-title">Guidance</h1>
        <p className="g-page-lede">
          How the interface helps a person who is new to it, in four layers, and
          what the Show tips switch in the account menu does to each.
        </p>
      </header>
      <LayerInterface onNote={onNote} />
      <LayerState compact={compact} chrome={chrome} onNote={onNote} />
      <LayerTips
        compact={compact}
        chrome={chrome}
        onNote={onNote}
        onOpenPalette={onOpenPalette}
      />
      <LayerHelp />
    </div>
  );
}
