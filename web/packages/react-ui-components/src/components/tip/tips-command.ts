// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" in the command palette (rethink P.3): one entry that turns tips off while they show
// and on while they do not, so its words always say what selecting it does. The app gives the words.
import type { CommandItem } from "../command-palette/command-palette";

interface TipsCommandOptions {
  /** "Show tips" is on now. */
  show: boolean;
  setShow: (show: boolean) => void;
  /** The palette heading it is listed under: "Preferences". */
  group: string;
  /** The entry while tips show: "Hide tips". */
  hideLabel: string;
  /** The entry while they do not: "Show tips". */
  showLabel: string;
  /** What tips are, in the secondary ink. */
  hint?: string;
  /** More words that find it: "tips", "help". */
  keywords?: readonly string[];
}

/** The palette's entry for "Show tips"; its id is `preference.tips`. */
export function tipsCommand({
  show,
  setShow,
  group,
  hideLabel,
  showLabel,
  hint,
  keywords,
}: TipsCommandOptions): CommandItem {
  return {
    id: "preference.tips",
    label: show ? hideLabel : showLabel,
    group,
    hint,
    keywords,
    onSelect: () => {
      setShow(!show);
    },
  };
}

export type { TipsCommandOptions };
