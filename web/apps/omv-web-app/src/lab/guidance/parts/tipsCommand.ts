// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" in words, and its entry in the command palette (rethink P.3): "Hide tips" while they
// show, "Show tips" while they do not. Development only (UI-11) until the owner has seen it.
import type { CommandItem } from "@omv-webui/react-ui-components";

export const SHOW_TIPS_LABEL = "Show tips";
export const SHOW_TIPS_HINT =
  "Tips explain things the first time you meet them.";

/** The palette's entry: "Hide tips" while they show, "Show tips" while they do not. */
export function tipsCommand(
  show: boolean,
  setShow: (show: boolean) => void,
  group: string,
): CommandItem {
  return {
    id: "preference.tips",
    label: show ? "Hide tips" : "Show tips",
    group,
    hint: SHOW_TIPS_HINT,
    keywords: ["tips", "help", "guidance", "hints"],
    onSelect: () => {
      setShow(!show);
    },
  };
}
