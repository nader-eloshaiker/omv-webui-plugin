// SPDX-License-Identifier: GPL-3.0-or-later
// One of our translated sentences with server values in it ("{{model}}, {{size}}"; "Problems are
// emailed to {{address}}."). Each value is rendered as text inside its own <bdi>, so a right-to-left
// model or address keeps its direction without reordering the sentence around it, and nothing of the
// value is ever read as markup (UI-2). The sentence is built by the caller's `t` with the tokens it is
// given in place of the values, so a translation keeps its own word order.
import type { ReactNode } from "react";
import { splitSlots } from "../../disks/disksList.ts";
import { slotToken } from "../../format/isolate.ts";

export function Slotted<K extends string>({
  sentence,
  values,
}: {
  /** The sentence with each value's token in its place: `(tokens) => t("key", tokens)`. */
  sentence: (tokens: Record<K, string>) => string;
  /** Each slot's value: server text, or an element (an Identifier). */
  values: Record<K, ReactNode>;
}) {
  const names = Object.keys(values) as K[];
  const tokens = Object.fromEntries(
    names.map((n, i) => [n, slotToken(i)]),
  ) as Record<K, string>;
  const byToken = new Map(names.map((n, i) => [slotToken(i), n]));
  const parts = splitSlots(sentence(tokens), [...byToken.keys()]);
  let offset = 0;
  return (
    <>
      {parts.map((part) => {
        const at = offset;
        if ("text" in part) {
          offset += part.text.length;
          return <span key={`t${String(at)}`}>{part.text}</span>;
        }
        offset += part.slot.length;
        const name = byToken.get(part.slot);
        return (
          <bdi key={`s${String(at)}`}>
            {name === undefined ? null : values[name]}
          </bdi>
        );
      })}
    </>
  );
}
