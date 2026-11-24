// SPDX-License-Identifier: GPL-3.0-or-later
// One change to a firewall list, planned (phase 5 network design 11.4, 11.6, 11.7, 11.8, 0.9): the
// list as it would be afterwards, numbered in order, which the check (firewallCheck.ts) runs on, and
// the calls that make it. A new rule at the end is Iptables.setRule with `rulenum` -1; a new rule
// anywhere else, a changed rule and a new order are setRules (or setRules6) with the whole list;
// Block everything else is three setRule calls at the end; a deletion is deleteRule. What changes,
// rule by rule, for the change flow's "Now" and "After" (1.4 item 2). Pure.
import {
  NEW_OBJECT_UUID,
  type FirewallRule,
  type SetRuleRequest,
} from "./dto.ts";
import {
  blockEverythingElseRules,
  changedRuleRequest,
  newRuleRequest,
  placeRule,
  replaceRule,
  setRulesRequest,
  sortRules,
  withoutRule,
  type RuleDraft,
  type RulesWrite,
  type Where,
} from "./firewallModel.ts";
import type { Family } from "./ip.ts";

export type FirewallEdit =
  /** 11.4: a new rule, at the end, at the top or before a rule. */
  | { kind: "add"; draft: RuleDraft; where: Where }
  /** 11.4: a stored rule changed in place. */
  | { kind: "change"; rule: FirewallRule; draft: RuleDraft }
  /** 11.8 */
  | { kind: "delete"; rule: FirewallRule }
  /** 11.6: the three rules at the end. */
  | { kind: "block" }
  /** 11.7: the rules in a new order (the stored rules, moved on the page). */
  | { kind: "order"; order: readonly FirewallRule[] };

export type EditCall =
  | { kind: "setRule"; requests: readonly SetRuleRequest[] }
  | { kind: "setRules"; write: Extract<RulesWrite, { ok: true }> }
  | { kind: "deleteRule"; uuid: string }
  /** A stored rule this page cannot send back as read: the list cannot be written whole here. */
  | { kind: "cannotSendBack"; position: number };

export interface EditPlan {
  /** The list after the change, in order, `rulenum` 0 to n-1. */
  after: FirewallRule[];
  call: EditCall;
}

/** The list numbered 0 to n-1 in the order given. */
export const numbered = (rules: readonly FirewallRule[]): FirewallRule[] =>
  rules.map((rule, rulenum) => ({ ...rule, rulenum }));

/** A setRule request as the rule it would store, at a place in the list. */
const asRule = (request: SetRuleRequest, rulenum: number): FirewallRule => ({
  ...request,
  rulenum,
});

const wholeList = (after: FirewallRule[], family: Family): EditPlan => {
  const write = setRulesRequest(after, family);
  return {
    after,
    call: write.ok
      ? { kind: "setRules", write }
      : { kind: "cannotSendBack", position: write.position },
  };
};

/**
 * The plan of a change to the stored list of one family. Throws for a draft that did not pass
 * checkRuleDraft (firewallModel's own rule: the dialog never asks for one).
 */
export function planEdit(
  stored: readonly FirewallRule[],
  family: Family,
  edit: FirewallEdit,
): EditPlan {
  const sorted = sortRules(stored);
  switch (edit.kind) {
    case "add": {
      const request = newRuleRequest(edit.draft, family);
      const after = numbered(
        placeRule(sorted, asRule(request, sorted.length), edit.where),
      );
      return edit.where.kind === "end"
        ? { after, call: { kind: "setRule", requests: [request] } }
        : wholeList(after, family);
    }
    case "change": {
      const request = changedRuleRequest(edit.rule, edit.draft);
      return wholeList(
        numbered(replaceRule(sorted, asRule(request, edit.rule.rulenum))),
        family,
      );
    }
    case "delete":
      return {
        after: numbered(withoutRule(sorted, edit.rule.uuid)),
        call: { kind: "deleteRule", uuid: edit.rule.uuid },
      };
    case "block": {
      const requests = blockEverythingElseRules(family);
      return {
        after: numbered([
          ...sorted,
          ...requests.map((r, i) => asRule(r, sorted.length + i)),
        ]),
        call: { kind: "setRule", requests },
      };
    }
    case "order":
      return wholeList(numbered(edit.order), family);
  }
}

// ---- What changes, rule by rule (1.4 item 2) ------------------------------------------------------

export type RuleChange =
  /** A rule added at a position (1 first). */
  | { kind: "added"; position: number; rule: FirewallRule }
  /** A rule deleted from a position. */
  | { kind: "removed"; position: number; rule: FirewallRule }
  /** A rule changed in place. */
  | {
      kind: "changed";
      position: number;
      before: FirewallRule;
      after: FirewallRule;
    }
  /** A rule moved from one position to another, unchanged. */
  | { kind: "moved"; from: number; to: number; rule: FirewallRule };

const FIELDS = [
  "family",
  "chain",
  "action",
  "source",
  "sport",
  "destination",
  "dport",
  "protocol",
  "extraoptions",
  "comment",
] as const satisfies readonly (keyof FirewallRule)[];

const sameContent = (a: FirewallRule, b: FirewallRule): boolean =>
  FIELDS.every((key) => a[key] === b[key]);

/**
 * The rules a change adds, removes, changes or moves, matched by identifier, in the new order. A rule
 * counts as moved only when its order among the rules on both lists changed, not because a rule
 * was added or removed before it.
 */
export function ruleChanges(
  before: readonly FirewallRule[],
  after: readonly FirewallRule[],
): RuleChange[] {
  const old = sortRules(before);
  const next = sortRules(after);
  const known = (rule: FirewallRule) => rule.uuid !== NEW_OBJECT_UUID;
  const nextIds = new Set(next.filter(known).map((r) => r.uuid));
  const oldIds = new Set(old.map((r) => r.uuid));
  const rank = (list: readonly FirewallRule[], ids: Set<string>) =>
    new Map(
      list
        .filter((r) => known(r) && ids.has(r.uuid))
        .map((r, i) => [r.uuid, i]),
    );
  const oldRank = rank(old, nextIds);
  const newRank = rank(next, oldIds);
  const oldAt = new Map(old.map((rule, i) => [rule.uuid, i + 1]));
  const changes: RuleChange[] = [];
  next.forEach((rule, i) => {
    const position = i + 1;
    const from = known(rule) ? oldAt.get(rule.uuid) : undefined;
    const was = from === undefined ? undefined : old[from - 1];
    if (from === undefined || was === undefined) {
      changes.push({ kind: "added", position, rule });
    } else if (!sameContent(was, rule)) {
      changes.push({ kind: "changed", position, before: was, after: rule });
    } else if (oldRank.get(rule.uuid) !== newRank.get(rule.uuid)) {
      changes.push({ kind: "moved", from, to: position, rule });
    }
  });
  old.forEach((rule, i) => {
    if (!nextIds.has(rule.uuid)) {
      changes.push({ kind: "removed", position: i + 1, rule });
    }
  });
  return changes;
}
