// SPDX-License-Identifier: GPL-3.0-or-later
// One firewall list, IPv4 or IPv6 (phase 5 network design 11.3 to 11.9): what the rules do to this
// page (the check, run on the list shown), the summary, the toolbar ("Add a rule…", "Block everything
// else…" only when the list does not already end so, Refresh), the rules in plain words with their
// move buttons, the unsaved-order bar, and the dialogs. A change the check finds Not affected is
// saved to the band; one that May cut this page goes through the change flow (1.4), in place of the
// list; a Refused one is not saved, with the reason. Every save reads the connection and the rules
// again first (0.4, R4) and is refused when the rules changed since the page read them.
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FirewallRuleList,
  IsolatedIdentifier,
  PairStack,
  ServerMessage,
  Skeleton,
  TableToolbar,
  useToast,
  type FirewallAction,
  type FirewallRuleRow,
  type NowAfterRow,
} from "@omv-webui/react-ui-components";
import { RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { FirewallContext } from "../../hooks/useFirewallContext.ts";
import { fillSlots, useFirewallWords } from "../../hooks/useFirewallWords.ts";
import type { NetworkApi } from "../../hooks/useNetworkApi.ts";
import {
  useFirewallRules4,
  useFirewallRules6,
} from "../../hooks/useNetworkReads.ts";
import { opensFlow } from "../../hooks/useNetworkWords.ts";
import { useNetworkWrites } from "../../hooks/useNetworkWrites.ts";
import { confirmationFor, type FlowObject } from "../../network/changeFlow.ts";
import type { FirewallRule } from "../../network/dto.ts";
import {
  checkList,
  type CheckContext,
  type ListCheck,
} from "../../network/firewallCheck.ts";
import {
  planEdit,
  ruleChanges,
  type EditCall,
  type EditPlan,
  type FirewallEdit,
} from "../../network/firewallEdits.ts";
import {
  allowPageDraft,
  offersBlockEverythingElse,
  readRule,
  sortRules,
  type RuleAction,
} from "../../network/firewallModel.ts";
import { classifyFirewall, type Impact } from "../../network/impact.ts";
import type { Family } from "../../network/ip.ts";
import {
  countsLine,
  deleteLoss,
  ruleRow,
  type PortNames,
} from "../../network/ruleWords.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import {
  CheckLineWords,
  FirewallCheckLine,
  VerdictSentence,
} from "../molecules/FirewallCheckLine.tsx";
import {
  ActionWords,
  NoteWords,
  PeerWords,
  RuleSentence,
  TrafficWords,
} from "../molecules/FirewallRuleWords.tsx";
import { WhoWords } from "../molecules/FirewallWhoList.tsx";
import { ReadFailed } from "../molecules/ReadFailed.tsx";
import {
  FirewallRuleDialog,
  type RuleDialogMode,
  type RuleDialogSubmit,
} from "./FirewallRuleDialog.tsx";
import { NetworkChangeFlow, type NetworkChange } from "./NetworkChangeFlow.tsx";

/** An order changed on the page and not saved (11.7): the list it started from, and the new order. */
export interface UnsavedOrder {
  base: readonly FirewallRule[];
  order: readonly FirewallRule[];
}

const ACTION_ICON: Record<RuleAction, FirewallAction> = {
  accept: "allow",
  reject: "refuse",
  drop: "ignore",
  log: "log",
  count: "count",
};

interface Row extends FirewallRuleRow {
  rule: FirewallRule;
}

type Open =
  | { kind: "rule"; key: number; mode: RuleDialogMode }
  | { kind: "block"; key: number }
  | { kind: "delete"; key: number; rule: FirewallRule; position: number };

/** A dialog to open: `Open` without its key, kind by kind. */
type OpenRequest = Open extends infer O
  ? O extends Open
    ? Omit<O, "key">
    : never
  : never;

/** Where focus goes once a save is done (11.4, 11.8): a row by position, or "Add a rule…". */
type FocusAfter = { position: number } | "add";

function useRules(family: Family, focus: boolean) {
  const v4 = useFirewallRules4({ enabled: family === 4, focus });
  const v6 = useFirewallRules6({ enabled: family === 6, focus });
  return family === 4 ? v4 : v6;
}

async function runCall(api: NetworkApi, call: EditCall, family: Family) {
  switch (call.kind) {
    case "setRule":
      for (const request of call.requests) {
        await api.setRule(request);
      }
      return;
    case "setRules":
      await api.setRules(call.write);
      return;
    case "deleteRule":
      await api.deleteRule(call.uuid, family);
      return;
    case "cannotSendBack":
      throw new Error("A list that cannot be sent back was written.");
  }
}

export function FirewallRules({
  family,
  context,
  order,
  onOrder,
  header,
}: {
  family: Family;
  context: FirewallContext;
  order: UnsavedOrder | null;
  onOrder: (order: UnsavedOrder | null) => void;
  /** The connection line and the tabs: shown above the list, hidden while the change flow runs. */
  header: ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const writes = useNetworkWrites();
  const words = useFirewallWords();
  const query = useRules(family, order === null);
  const addRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const orderNoteId = useId();
  const [open, setOpen] = useState<Open | null>(null);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [orderError, setOrderError] = useState<ReactNode>(null);
  const [flow, setFlow] = useState<{
    change: NetworkChange;
    origin: "dialog" | "order";
  } | null>(null);
  // Where focus goes after a save, and a count that asks for it once the list has rendered.
  const focusAfterRef = useRef<FocusAfter | null>(null);
  const [focusAsked, setFocusAsked] = useState(0);
  const keyRef = useRef(0);
  const returnRef = useRef<HTMLElement | null>(null);

  const stored = sortRules(query.data ?? []);
  const shown = order?.order ?? stored;
  const names = context.names;

  useEffect(() => {
    const focusAfter = focusAfterRef.current;
    if (focusAfter === null || flow !== null) {
      return;
    }
    focusAfterRef.current = null;
    if (focusAfter === "add") {
      returnRef.current = addRef.current;
      addRef.current?.focus();
      return;
    }
    const rows = listRef.current?.querySelectorAll<HTMLElement>(
      '[data-slot="firewall-rule-row"]',
    );
    const row =
      rows === undefined || rows.length === 0
        ? undefined
        : rows[Math.min(focusAfter.position, rows.length) - 1];
    const target = row?.querySelector<HTMLElement>("button") ?? addRef.current;
    // A dialog closing now gives focus back to this, not to the control that opened it.
    returnRef.current = target;
    target?.focus();
  }, [focusAsked, flow, query.data]);

  const openDialog = (next: OpenRequest) => {
    keyRef.current += 1;
    returnRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : addRef.current;
    setError(null);
    setOpen({ ...next, key: keyRef.current } as Open);
    setVisible(true);
  };
  // The dialog stays mounted, closed, until the next one opens: it closes with its own focus return,
  // and Back from the change flow opens it again with its values.
  const closeDialog = () => {
    setVisible(false);
    setError(null);
  };

  const failure = (cause: unknown): ReactNode => (
    <span className="flex flex-col gap-1">
      <span>{t("firewall.saveFailed")}</span>
      {isRpcError(cause) ? (
        <ServerMessage label={t("app.serverMessage")}>
          {cause.message}
        </ServerMessage>
      ) : null}
    </span>
  );

  /** "Now" and "After", rule by rule (1.4 item 2). */
  const changeRows = (
    before: readonly FirewallRule[],
    after: readonly FirewallRule[],
  ): NowAfterRow[] =>
    ruleChanges(before, after).map((c, i): NowAfterRow => {
      const sentence = (rule: FirewallRule, position: number) => (
        <RuleSentence row={ruleRow(readRule(rule, position), names)} />
      );
      switch (c.kind) {
        case "added":
          return {
            id: `added-${String(i)}`,
            label: t("firewall.rowLabel", { n: c.position }),
            now: t("firewall.noRule"),
            after: sentence(c.rule, c.position),
            changed: true,
          };
        case "removed":
          return {
            id: `removed-${String(i)}`,
            label: t("firewall.rowLabel", { n: c.position }),
            now: sentence(c.rule, c.position),
            after: t("firewall.noRule"),
            changed: true,
          };
        case "changed":
          return {
            id: `changed-${String(i)}`,
            label: t("firewall.rowLabel", { n: c.position }),
            now: sentence(c.before, c.position),
            after: sentence(c.after, c.position),
            changed: true,
          };
        case "moved": {
          const row = ruleRow(readRule(c.rule, c.from), names);
          return {
            id: `moved-${String(i)}`,
            label: (
              <span>
                <ActionWords word={row.then} />
                {": "}
                <TrafficWords traffic={row.traffic} />
              </span>
            ),
            now: t("firewall.position", { n: c.from }),
            after: t("firewall.position", { n: c.to }),
            changed: true,
          };
        }
      }
    });

  /**
   * Save a change (11.4, 11.6, 11.7, 11.8): read the connection again, run the check on the list
   * afterwards, refuse a Refused one, hand a May cut one to the change flow, write a Not affected one
   * (the write reads the rules again first and refuses when they changed).
   */
  const save = async (
    edit: FirewallEdit,
    origin: "dialog" | "order",
    done: { toast: string; focus: FocusAfter },
  ) => {
    const before = origin === "order" && order !== null ? order.base : stored;
    const setProblem = origin === "order" ? setOrderError : setError;
    setSaving(true);
    setProblem(null);
    try {
      const reading = await context.connection.refresh();
      const fresh: CheckContext = {
        ...context.check,
        connection: reading.connection,
      };
      const plan: EditPlan = planEdit(before, family, edit);
      const call = plan.call;
      if (call.kind === "cannotSendBack") {
        setProblem(
          <Trans
            i18nKey="firewall.cannotSendBack"
            components={{ n: <NodeSlot value={String(call.position)} /> }}
          />,
        );
        return;
      }
      const check = checkList(plan.after, family, fresh);
      const impact = classifyFirewall(check);
      if (impact.class === "refused") {
        setProblem(<VerdictSentence check={check} />);
        return;
      }
      const write = writes.firewall({
        family,
        before,
        write: (api) => runCall(api, call, family),
      });
      if (opensFlow(impact)) {
        setFlow({
          origin,
          change: flowChange({ before, plan, impact, check, write }),
        });
        setVisible(false);
        return;
      }
      const result = await write();
      if (result.kind === "changedSince") {
        if (origin === "order") {
          onOrder(null);
          setOrderError(t("firewall.orderChanged"));
        } else {
          setError(t("firewall.changedSince"));
        }
        return;
      }
      toast.show({ title: done.toast });
      if (origin === "order") {
        onOrder(null);
      } else {
        closeDialog();
      }
      focusAfterRef.current = done.focus;
      setFocusAsked((n) => n + 1);
    } catch (cause) {
      setProblem(failure(cause));
    } finally {
      setSaving(false);
    }
  };

  const object: FlowObject = { kind: "firewall", family };
  const flowChange = (input: {
    before: readonly FirewallRule[];
    plan: EditPlan;
    impact: Impact;
    check: ListCheck;
    write: NetworkChange["write"];
  }): NetworkChange => {
    const general = context.connection.general;
    return {
      object,
      action: "firewall",
      rows: changeRows(input.before, input.plan.after),
      impact: input.impact,
      others: input.check.lines
        .filter(
          (line) =>
            line.code !== "firewall.sameNetwork" &&
            line.code !== "firewall.ipv4Page" &&
            line.code !== "firewall.ipv6Page",
        )
        .map((line, i) => ({
          id: `${line.code}-${String(i)}`,
          text: <CheckLineWords line={line} />,
        })),
      note: words.rulesNote(input.before, names),
      confirmation: confirmationFor(object, input.impact),
      write: input.write,
      hostname: general.state === "ok" ? general.data.hostname : "",
    };
  };

  const submitRule = ({ edit }: RuleDialogSubmit) => {
    const position =
      edit.kind === "change" &&
      open?.kind === "rule" &&
      open.mode.kind === "change"
        ? open.mode.position
        : edit.kind === "add"
          ? edit.where.kind === "top"
            ? 1
            : edit.where.kind === "before"
              ? edit.where.position
              : stored.length + 1
          : 1;
    void save(edit, "dialog", {
      toast: t("fwRule.saved"),
      focus: { position },
    });
  };

  // ---- The view ----------------------------------------------------------------------------------

  let content: ReactNode;
  if (flow !== null) {
    content = (
      <NetworkChangeFlow
        change={flow.change}
        onBack={() => {
          const origin = flow.origin;
          setFlow(null);
          if (origin === "dialog" && open !== null) {
            setVisible(true);
          }
        }}
        onCancel={() => {
          setFlow(null);
          closeDialog();
        }}
        onDone={() => {
          const origin = flow.origin;
          setFlow(null);
          closeDialog();
          if (origin === "order") {
            onOrder(null);
          }
          void query.refetch();
        }}
      />
    );
  } else if (query.data === undefined && query.isError) {
    content = (
      <ReadFailed
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      >
        {t("firewall.loadFailed")}
      </ReadFailed>
    );
  } else if (query.data === undefined) {
    content = (
      <div className="flex flex-col gap-group" aria-busy="true">
        <p role="status" className="sr-only">
          {t("firewall.loading")}
        </p>
        <Skeleton className="h-6 w-80 max-w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  } else {
    const check = context.settled
      ? checkList(shown, family, context.check)
      : null;
    const counts = countsLine(shown);
    const unsaved = order !== null;
    const orderImpact =
      unsaved && check !== null ? classifyFirewall(check) : null;
    const orderRefused = orderImpact?.class === "refused";
    const rows: Row[] = shown.map((rule, i) => {
      const read = readRule(rule, i + 1);
      const row = ruleRow(read, names);
      return {
        id: rule.uuid,
        rule,
        action: read.action === null ? "count" : ACTION_ICON[read.action],
        traffic: <TrafficWords traffic={row.traffic} />,
        peer: <PeerWords row={row} />,
        note: <NoteWords row={row} />,
      };
    });
    const offersBlock = offersBlockEverythingElse(stored);
    content = (
      <div className="flex min-w-0 flex-col gap-group">
        {check === null ? (
          <Skeleton className="h-6 w-96 max-w-full" />
        ) : (
          <FirewallCheckLine check={check} />
        )}
        <p className="text-sm">
          {counts.key === "firewall.none" ? (
            t("firewall.none")
          ) : (
            <Trans
              i18nKey="firewall.counts"
              components={{
                in: <NodeSlot value={String(counts.in)} />,
                out: <NodeSlot value={String(counts.out)} />,
              }}
            />
          )}
        </p>
        <PairStack>
          <TableToolbar aria-label={t("firewall.title")}>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={addRef}
                variant="neutral"
                disabled={unsaved}
                focusableWhenDisabled
                aria-describedby={unsaved ? orderNoteId : undefined}
                onClick={() =>
                  openDialog({ kind: "rule", mode: { kind: "add" } })
                }
              >
                {t("firewall.add")}
              </Button>
              {offersBlock ? (
                <Button
                  variant="neutral"
                  disabled={unsaved}
                  focusableWhenDisabled
                  aria-describedby={unsaved ? orderNoteId : undefined}
                  onClick={() => openDialog({ kind: "block" })}
                >
                  {t("firewall.blockRest")}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                loading={query.isFetching}
                disabled={unsaved}
                focusableWhenDisabled
                aria-describedby={unsaved ? orderNoteId : undefined}
                onClick={() => {
                  void query.refetch();
                  void context.connection.refresh();
                }}
              >
                <RefreshCw aria-hidden="true" />
                {t("firewall.refresh")}
              </Button>
              {unsaved ? (
                <span
                  id={orderNoteId}
                  className="text-sm text-muted-foreground"
                >
                  {t("firewall.orderFirst")}
                </span>
              ) : null}
            </div>
          </TableToolbar>
          {orderError !== null && !unsaved ? (
            <p role="alert" className="text-sm text-critical-label">
              {orderError}
            </p>
          ) : null}
          <div ref={listRef} className="min-w-0">
            <FirewallRuleList<Row>
              rules={rows}
              labels={{
                name: t("firewall.title"),
                columns: {
                  position: t("firewall.col.position"),
                  then: t("firewall.col.then"),
                  traffic: t("firewall.col.traffic"),
                  peer: t("firewall.col.who"),
                  note: t("firewall.col.note"),
                  actions: t("firewall.col.actions"),
                },
                actions: {
                  allow: t("firewall.action.accept"),
                  refuse: t("firewall.action.reject"),
                  ignore: t("firewall.action.drop"),
                  log: t("firewall.action.log"),
                  count: t("firewall.action.count"),
                },
                moveUp: (n) => t("firewall.moveUp", { n }),
                moveDown: (n) => t("firewall.moveDown", { n }),
                alreadyFirst: t("firewall.alreadyFirst"),
                alreadyLast: t("firewall.alreadyLast"),
                change: t("firewall.change"),
                changeName: (n) => t("firewall.changeName", { n }),
                delete: t("firewall.delete"),
                deleteName: (n) => t("firewall.deleteName", { n }),
                moved: (_from, to) => t("firewall.moved", { to }),
                orderUnsaved: t("firewall.orderUnsaved"),
                discard: t("firewall.discardOrder"),
              }}
              onOrderChange={(next) => {
                setOrderError(null);
                const base = order?.base ?? stored;
                const same = next.every(
                  (row, i) => row.rule.uuid === base[i]?.uuid,
                );
                onOrder(
                  same ? null : { base, order: next.map((row) => row.rule) },
                );
              }}
              onChange={
                unsaved
                  ? undefined
                  : (row, position) =>
                      openDialog({
                        kind: "rule",
                        mode: { kind: "change", rule: row.rule, position },
                      })
              }
              onDelete={
                unsaved
                  ? undefined
                  : (row, position) =>
                      openDialog({ kind: "delete", rule: row.rule, position })
              }
              unsaved={unsaved}
              saveLabel={
                opensFlow(orderImpact)
                  ? t("netChange.review")
                  : t("firewall.saveOrder")
              }
              onSave={() => {
                if (order === null || orderRefused) {
                  return;
                }
                void save({ kind: "order", order: order.order }, "order", {
                  toast: t("firewall.orderSaved"),
                  focus: { position: 1 },
                });
              }}
              onDiscard={() => {
                setOrderError(null);
                onOrder(null);
              }}
              saving={saving && unsaved}
              saveNote={
                orderError !== null ? (
                  <p role="alert" className="text-sm text-critical-label">
                    {orderError}
                  </p>
                ) : orderRefused && check !== null ? (
                  <p className="text-sm">
                    <VerdictSentence check={check} />
                  </p>
                ) : null
              }
              empty={
                <EmptyState
                  action={
                    <Button
                      variant="neutral"
                      onClick={() =>
                        openDialog({ kind: "rule", mode: { kind: "add" } })
                      }
                    >
                      {t("firewall.add")}
                    </Button>
                  }
                >
                  {t("firewall.empty")}
                </EmptyState>
              }
            />
          </div>
        </PairStack>
      </div>
    );
  }

  return (
    <>
      {flow === null ? header : null}
      {content}
      {open?.kind === "rule" ? (
        <FirewallRuleDialog
          key={open.key}
          open={visible}
          onClose={closeDialog}
          family={family}
          mode={open.mode}
          stored={stored}
          context={context}
          saving={saving}
          error={error}
          onSubmit={submitRule}
          finalFocus={returnRef}
        />
      ) : null}
      {open?.kind === "block" ? (
        <BlockDialog
          key={open.key}
          open={visible}
          family={family}
          stored={stored}
          context={context}
          saving={saving}
          error={error}
          onClose={closeDialog}
          onAllowPage={(prefill) =>
            openDialog({ kind: "rule", mode: { kind: "add", prefill } })
          }
          onConfirm={() =>
            void save({ kind: "block" }, "dialog", {
              toast: t("fwBlock.saved"),
              focus: { position: stored.length + 1 },
            })
          }
        />
      ) : null}
      {open?.kind === "delete" ? (
        <DeleteDialog
          key={open.key}
          open={visible}
          family={family}
          stored={stored}
          rule={open.rule}
          position={open.position}
          context={context}
          names={names}
          saving={saving}
          error={error}
          onClose={closeDialog}
          onConfirm={() =>
            void save({ kind: "delete", rule: open.rule }, "dialog", {
              toast: fillSlots(t("fwDelete.done"), {
                n: String(open.position),
              }),
              focus: stored.length > 1 ? { position: open.position } : "add",
            })
          }
        />
      ) : null}
    </>
  );
}

/** The check on a planned list, and its class, for a confirmation's button (11.6, 11.8). */
function dialogCheck(
  stored: readonly FirewallRule[],
  family: Family,
  edit: FirewallEdit,
  context: FirewallContext,
) {
  const plan = planEdit(stored, family, edit);
  const check = context.settled
    ? checkList(plan.after, family, context.check)
    : null;
  const impact = check === null ? null : classifyFirewall(check);
  return { plan, check, impact };
}

/** "Block everything else coming in" (11.6). */
function BlockDialog({
  open,
  family,
  stored,
  context,
  saving,
  error,
  onClose,
  onAllowPage,
  onConfirm,
}: {
  open: boolean;
  family: Family;
  stored: readonly FirewallRule[];
  context: FirewallContext;
  saving: boolean;
  error: ReactNode;
  onClose: () => void;
  onAllowPage: (prefill: ReturnType<typeof allowPageDraft>) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { check, impact } = dialogCheck(
    stored,
    family,
    { kind: "block" },
    context,
  );
  const refused = impact?.class === "refused";
  const connection = context.check.connection;
  const network =
    connection.kind === "known" &&
    connection.network !== null &&
    connection.network.family === family
      ? connection.network
      : null;
  const allow =
    network === null ? null : allowPageDraft(network, context.check.ports.page);
  const networkText =
    allow !== null && allow.draft.other.kind === "network"
      ? allow.draft.other.text
      : "";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          onClose();
        }
      }}
      title={t("fwBlock.title")}
      description={t("fwBlock.after")}
      confirmLabel={
        opensFlow(impact) ? t("netChange.review") : t("fwBlock.confirm")
      }
      cancelLabel={t("fwBlock.cancel")}
      pending={saving}
      error={error}
      confirmDisabled={refused || impact === null}
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-2">
        <p>{t("fwBlock.adds")}</p>
        <ol className="flex list-decimal flex-col gap-1 ps-6">
          <li>
            {t("fwBlock.self")}
            <span className="block text-sm text-muted-foreground">
              {t("fwBlock.selfWhy")}
            </span>
          </li>
          <li>
            {t("fwBlock.replies")}
            <span className="block text-sm text-muted-foreground">
              {t("fwBlock.repliesWhy")}
            </span>
          </li>
          <li>{t("fwBlock.refuse")}</li>
        </ol>
      </div>
      {refused ? (
        <div className="flex flex-col items-start gap-2" role="status">
          <p>{t("fwBlock.notAllowed")}</p>
          {allow === null ? null : (
            <Button variant="neutral" onClick={() => onAllowPage(allow)}>
              <Trans
                i18nKey="fwBlock.allowPage"
                components={{
                  network: <IsolatedIdentifier value={networkText} />,
                }}
              />
            </Button>
          )}
        </div>
      ) : check === null ? null : (
        <FirewallCheckLine check={check} />
      )}
    </ConfirmDialog>
  );
}

/** "Delete rule {{n}}?" (11.8): the rule in its words, what is lost, the check on the list without it. */
function DeleteDialog({
  open,
  family,
  stored,
  rule,
  position,
  context,
  names,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  family: Family;
  stored: readonly FirewallRule[];
  rule: FirewallRule;
  position: number;
  context: FirewallContext;
  names: PortNames;
  saving: boolean;
  error: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { check, impact } = dialogCheck(
    stored,
    family,
    { kind: "delete", rule },
    context,
  );
  const read = readRule(rule, position);
  const row = ruleRow(read, names);
  const loss = deleteLoss(read, names);
  const refused = impact?.class === "refused";
  let lost: ReactNode = null;
  if (loss?.key === "fwDelete.lostBlock") {
    lost = (
      <Trans
        i18nKey="fwDelete.lostBlock"
        components={{
          who: (
            <NodeSlot
              value={
                <>
                  <WhoWords word={loss.who.who} inline />
                  {loss.who.nasSide === null ? null : (
                    <>
                      {" "}
                      <Trans
                        i18nKey="firewall.who.nasSide"
                        components={{
                          address: (
                            <NodeSlot
                              value={
                                <WhoWords word={loss.who.nasSide.address} />
                              }
                            />
                          ),
                        }}
                      />
                    </>
                  )}
                </>
              }
            />
          ),
          what: <NodeSlot value={<TrafficWords traffic={loss.what} />} />,
        }}
      />
    );
  } else if (loss !== null) {
    lost = t(loss.key);
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          onClose();
        }
      }}
      variant="destructive"
      title={
        <Trans
          i18nKey="fwDelete.title"
          components={{ n: <NodeSlot value={String(position)} /> }}
        />
      }
      description={<RuleSentence row={row} />}
      confirmLabel={
        opensFlow(impact) ? t("netChange.review") : t("fwDelete.confirm")
      }
      cancelLabel={t("fwDelete.cancel")}
      pending={saving}
      error={error}
      confirmDisabled={refused || impact === null}
      onConfirm={onConfirm}
    >
      {lost === null ? null : <p>{lost}</p>}
      {check === null ? null : <FirewallCheckLine check={check} />}
    </ConfirmDialog>
  );
}
