// SPDX-License-Identifier: GPL-3.0-or-later
// Region B, "Needs you" (rethink spec 6.2 B, 7.6): only when something does. Rows, not cards: the
// status icon, the title, one line and the next step, worst first. The worst row's button is the
// region's one filled accent, the others are outlined (A2). At most three, then "N more". A new row
// rises in at its place; one that no longer needs the person leaves and gives up its height.
// Lab-local candidate for *AttentionList (spec 8 row 1). Development only (UI-11).
import {
  Button,
  LeavingItem,
  StatusIcon,
  useLeavingItems,
} from "@omv-webui/react-ui-components";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { Attention } from "./model.ts";
import { attentionRows, HEALTH_WORD } from "./model.ts";

export function NeedsYou({
  list,
  onAct,
}: {
  list: readonly Attention[];
  onAct: (row: Attention) => void;
}) {
  const [all, setAll] = useState(false);
  // The rows there at first are not news; one that arrives later rises in.
  const [initial] = useState(() => new Set(list.map((a) => a.id)));
  // One array per change of the list: the leaving list keeps the rows that drop out of it.
  const { shown, more } = useMemo(
    () => attentionRows(list, all ? list.length : 3),
    [list, all],
  );
  const { entries, left } = useLeavingItems(shown, (a) => a.id);
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="dm-needs" aria-labelledby="dm-needs-title">
      <h2 id="dm-needs-title" className="sr-only">
        What needs you
      </h2>
      <ul className="dm-needs-list">
        {entries.map(({ key, item, leaving }, i) => (
          <LeavingItem
            key={key}
            leaving={leaving}
            onLeft={() => {
              left(key);
            }}
          >
            <div
              className="dm-need"
              data-health={item.health}
              data-new={!initial.has(key) || undefined}
            >
              <span className="dm-need-icon">
                <StatusIcon status={item.health} />
                <span className="sr-only">{HEALTH_WORD[item.health]}:</span>
              </span>
              <span className="dm-need-words">
                <span className="dm-need-title">{item.title}</span>
                <span className="dm-need-line">{item.line}</span>
              </span>
              <Button
                variant={i === 0 ? "primary" : "primaryOutline"}
                size="md"
                className="dm-need-action"
                onClick={() => {
                  onAct(item);
                }}
              >
                {item.action}
              </Button>
            </div>
          </LeavingItem>
        ))}
      </ul>
      {more > 0 || all ? (
        <button
          type="button"
          className="dm-needs-more"
          aria-expanded={all}
          onClick={() => {
            setAll(!all);
          }}
        >
          <ChevronDown aria-hidden="true" />
          {all ? "Show fewer" : `${String(more)} more`}
        </button>
      ) : null}
    </section>
  );
}
