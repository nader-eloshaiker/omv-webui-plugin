// SPDX-License-Identifier: GPL-3.0-or-later
// The guidance prototype's words for the library's tip parts (rethink P.3), which carry none of
// their own: "Got it" and the name that says which tip it hides, "Show tips" and its hint, the
// palette's entry, the "Hide tips too?" offer, and a glossary term's name. Development only (UI-11);
// the interface's catalogue takes them when the tips reach a page.
import type { CommandItem } from "@omv-webui/react-ui-components";
import { tipsCommand } from "@omv-webui/react-ui-components";

/** A tip's dismiss button: "Got it", named for what the tip is about ("the yellow bar"). */
export function gotIt(about: string): {
  dismissLabel: string;
  dismissName: string;
} {
  return {
    dismissLabel: "Got it",
    dismissName: `Got it, hide the tip about ${about}`,
  };
}

export const SHOW_TIPS_LABEL = "Show tips";
export const SHOW_TIPS_HINT =
  "Tips explain things the first time you meet them.";

/** The palette's entry: "Hide tips" while they show, "Show tips" while they do not. */
export function labTipsCommand(
  show: boolean,
  setShow: (show: boolean) => void,
  group: string,
): CommandItem {
  return tipsCommand({
    show,
    setShow,
    group,
    hideLabel: "Hide tips",
    showLabel: SHOW_TIPS_LABEL,
    hint: SHOW_TIPS_HINT,
    keywords: ["tips", "help", "guidance", "hints"],
  });
}

/** What the person did that showed they are a pro. */
export type OfferCause = "compact" | "keys";

export const OFFER_WORDS: Record<OfferCause, string> = {
  compact: "Compact view on. Hide tips too?",
  keys: "You found the shortcuts. Hide tips too?",
};

export const OFFER_ACTION = "Hide tips";

/** A glossary term's name: "SMB, what it means". */
export const termLabel = (term: string): string => `${term}, what it means`;
