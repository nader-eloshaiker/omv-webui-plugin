// SPDX-License-Identifier: GPL-3.0-or-later
// The one-at-a-time rule as data: the first waiting tip in reading order has the turn, and a tip
// that has it keeps it until it lets go.
import { afterEach, describe, expect, it } from "vitest";
import {
  EMPTY_QUEUE,
  firstInReadingOrder,
  releaseTurn,
  wantTurn,
} from "./tipQueue.ts";

function anchors(...names: string[]): Record<string, Element> {
  const out: Record<string, Element> = {};
  for (const name of names) {
    const el = document.createElement("div");
    el.dataset.name = name;
    document.body.append(el);
    out[name] = el;
  }
  return out;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the tip queue", () => {
  it("names the tip whose anchor comes first in the document", () => {
    const a = anchors("first", "second", "third");
    const wanting = new Map([
      ["c", a.third!],
      ["a", a.first!],
      ["b", a.second!],
    ]);
    expect(firstInReadingOrder(wanting)).toBe("a");
    expect(firstInReadingOrder(new Map())).toBeNull();
  });

  it("gives the turn to the first in reading order, and the next once it lets go", () => {
    const a = anchors("first", "second");
    let q = wantTurn(EMPTY_QUEUE, "later", a.second!);
    expect(q.turn).toBe("later");
    q = releaseTurn(q, "later");
    q = wantTurn(q, "later", a.second!);
    q = wantTurn(q, "earlier", a.first!);
    // "later" held the turn before "earlier" became due: it keeps it.
    expect(q.turn).toBe("later");
    q = releaseTurn(q, "later");
    expect(q.turn).toBe("earlier");
    q = releaseTurn(q, "earlier");
    expect(q.turn).toBeNull();
  });

  it("returns the same queue when nothing changes", () => {
    const a = anchors("first");
    const q = wantTurn(EMPTY_QUEUE, "a", a.first!);
    expect(wantTurn(q, "a", a.first!)).toBe(q);
    expect(releaseTurn(q, "b")).toBe(q);
  });
});
