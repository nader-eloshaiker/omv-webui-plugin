// SPDX-License-Identifier: GPL-3.0-or-later
// network/firewallEdits.ts: each change's list afterwards and its calls (phase 5 network design 11.4,
// 11.6, 11.7, 11.8, 0.9), a stored rule that cannot be sent back, and what changes rule by rule.
import { describe, expect, it } from "vitest";
import { NEW_OBJECT_UUID } from "./dto.ts";
import { numbered, planEdit, ruleChanges } from "./firewallEdits.ts";
import {
  NEW_RULE_DRAFT,
  REPLIES_OPTIONS,
  SELF_OPTIONS,
  draftOf,
  type RuleDraft,
} from "./firewallModel.ts";
import { rules } from "./fixtures.testing.ts";

const STORED = rules(
  { dport: "22", source: "192.0.2.0/24" },
  { action: "REJECT", dport: "445" },
);
const SSH_REFUSE: RuleDraft = {
  ...NEW_RULE_DRAFT,
  action: "reject",
  port: { kind: "text", text: "22" },
};

describe("a new rule (11.4)", () => {
  it("at the end is one setRule with rulenum -1, checked as the last rule", () => {
    const plan = planEdit(STORED, 4, {
      kind: "add",
      draft: SSH_REFUSE,
      where: { kind: "end" },
    });
    expect(plan.call).toMatchObject({
      kind: "setRule",
      requests: [
        { uuid: NEW_OBJECT_UUID, rulenum: -1, family: "inet", dport: "22" },
      ],
    });
    expect(plan.after.map((r) => [r.rulenum, r.action, r.dport])).toEqual([
      [0, "ACCEPT", "22"],
      [1, "REJECT", "445"],
      [2, "REJECT", "22"],
    ]);
  });

  it("at the top or before a rule is the whole list with setRules, renumbered", () => {
    const top = planEdit(STORED, 4, {
      kind: "add",
      draft: SSH_REFUSE,
      where: { kind: "top" },
    });
    expect(top.call.kind).toBe("setRules");
    if (top.call.kind !== "setRules") {
      return;
    }
    expect(top.call.write.family).toBe(4);
    expect(top.call.write.request.map((r) => [r.rulenum, r.dport])).toEqual([
      [0, "22"],
      [1, "22"],
      [2, "445"],
    ]);
    const before = planEdit(STORED, 4, {
      kind: "add",
      draft: SSH_REFUSE,
      where: { kind: "before", position: 2 },
    });
    expect(before.after.map((r) => r.action)).toEqual([
      "ACCEPT",
      "REJECT",
      "REJECT",
    ]);
    expect(before.after[1]?.uuid).toBe(NEW_OBJECT_UUID);
  });

  it("on the IPv6 list is written with setRules6's family", () => {
    const stored6 = rules({ family: "inet6", source: "2001:db8::/32" });
    const plan = planEdit(stored6, 6, {
      kind: "add",
      draft: SSH_REFUSE,
      where: { kind: "top" },
    });
    expect(plan.call).toMatchObject({
      kind: "setRules",
      write: { family: 6 },
    });
  });
});

describe("a changed rule, a deletion, a new order", () => {
  it("a change keeps the rule's place and writes the whole list", () => {
    const [first] = STORED;
    if (first === undefined) {
      throw new Error("no rule");
    }
    const plan = planEdit(STORED, 4, {
      kind: "change",
      rule: first,
      draft: { ...draftOf(first), comment: "Office SSH" },
    });
    expect(plan.call.kind).toBe("setRules");
    expect(plan.after[0]).toMatchObject({
      uuid: first.uuid,
      comment: "Office SSH",
    });
  });

  it("a deletion is deleteRule, checked on the list without it", () => {
    const [first] = STORED;
    if (first === undefined) {
      throw new Error("no rule");
    }
    const plan = planEdit(STORED, 4, { kind: "delete", rule: first });
    expect(plan.call).toEqual({ kind: "deleteRule", uuid: first.uuid });
    expect(plan.after.map((r) => r.dport)).toEqual(["445"]);
  });

  it("a new order is setRules numbered in that order", () => {
    const reversed = [...STORED].reverse();
    const plan = planEdit(STORED, 4, { kind: "order", order: reversed });
    expect(plan.after.map((r) => [r.rulenum, r.dport])).toEqual([
      [0, "445"],
      [1, "22"],
    ]);
  });

  it("a stored rule that cannot be sent back stops a whole-list write, naming it", () => {
    const odd = rules({ dport: "22" }, { chain: "FORWARD" });
    const plan = planEdit(odd, 4, { kind: "order", order: [...odd].reverse() });
    expect(plan.call).toEqual({ kind: "cannotSendBack", position: 1 });
  });
});

describe("Block everything else (11.6)", () => {
  it("adds the three rules at the end, each with setRule -1", () => {
    const plan = planEdit(STORED, 4, { kind: "block" });
    expect(plan.call.kind).toBe("setRule");
    if (plan.call.kind !== "setRule") {
      return;
    }
    expect(
      plan.call.requests.map((r) => [r.rulenum, r.action, r.extraoptions]),
    ).toEqual([
      [-1, "ACCEPT", SELF_OPTIONS],
      [-1, "ACCEPT", REPLIES_OPTIONS],
      [-1, "REJECT", ""],
    ]);
    expect(plan.after).toHaveLength(5);
    expect(plan.after.map((r) => r.rulenum)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("what changes, rule by rule (1.4 item 2)", () => {
  it("names added, removed, changed and moved rules", () => {
    const [a, b] = STORED;
    if (a === undefined || b === undefined) {
      throw new Error("no rules");
    }
    const added = planEdit(STORED, 4, {
      kind: "add",
      draft: SSH_REFUSE,
      where: { kind: "end" },
    });
    expect(ruleChanges(STORED, added.after)).toEqual([
      expect.objectContaining({ kind: "added", position: 3 }),
    ]);
    expect(ruleChanges(STORED, numbered([b]))).toEqual([
      expect.objectContaining({ kind: "removed", position: 1 }),
    ]);
    expect(
      ruleChanges(STORED, numbered([{ ...a, comment: "new note" }, b])),
    ).toEqual([expect.objectContaining({ kind: "changed", position: 1 })]);
    expect(ruleChanges(STORED, numbered([b, a]))).toEqual([
      expect.objectContaining({ kind: "moved", from: 2, to: 1 }),
      expect.objectContaining({ kind: "moved", from: 1, to: 2 }),
    ]);
  });
});
