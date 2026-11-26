// SPDX-License-Identifier: GPL-3.0-or-later
// Region B, "Needs you" (rethink spec 6.2 B, 7.6), now the library's `AttentionList`: only when
// something does, rows on the page ground parted by hairlines, worst first, the worst row's button the
// one filled accent and the others outlined, three then "N more"; a new row rises in, one that no
// longer needs the person leaves. The lab maps its fixtures onto the library's items. Development only
// (UI-11).
import type { AttentionItem } from "@omv-webui/react-ui-components";
import { AttentionList } from "@omv-webui/react-ui-components";
import type { Attention } from "./model.ts";
import { HEALTH_WORD } from "./model.ts";

export function NeedsYou({
  list,
  onAct,
}: {
  list: readonly Attention[];
  onAct: (row: Attention) => void;
}) {
  const items: AttentionItem[] = list.flatMap((a) =>
    a.health === "ok"
      ? []
      : [
          {
            id: a.id,
            health: a.health,
            healthLabel: HEALTH_WORD[a.health],
            title: a.title,
            detail: a.line,
            actionLabel: a.action,
            onAction: () => {
              onAct(a);
            },
          },
        ],
  );
  return (
    <AttentionList
      className="dm-needs"
      label="What needs you"
      items={items}
      moreLabel={(n) => `${String(n)} more`}
      fewerLabel="Show fewer"
    />
  );
}
