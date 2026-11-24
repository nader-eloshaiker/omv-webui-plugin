// SPDX-License-Identifier: GPL-3.0-or-later
// Add or change a firewall rule (phase 5 network design 11.4): direction, Then (none chosen for a new
// rule, D10), the kind of traffic, the port, the other computer (the library's ClientField with the
// range choice, limited to the list's family), values set in the classic interface shown and kept
// unless removed, Where (new rules only), the note, and the check on the list with this rule (11.5).
// The button reads "Review the change…" when the check says May cut, and is unavailable with the
// reason when it says Refused. The dialog stays mounted while the change flow shows (Back returns to
// it with its values); the page saves.
import {
  Button,
  ClientField,
  Dialog,
  DialogContent,
  DialogTitle,
  Field,
  FieldControl,
  FieldHint,
  FieldLabel,
  InlineAlert,
  IsolatedIdentifier,
  PORT_ANY,
  PORT_OTHER,
  PortField,
  RadioGroupField,
  RadioOption,
  SegmentedChoice,
  type ClientChoiceOrRange,
  type ClientFieldValue,
  type PortFieldValue,
} from "@omv-webui/react-ui-components";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { FirewallContext } from "../../hooks/useFirewallContext.ts";
import { opensFlow } from "../../hooks/useNetworkWords.ts";
import type { FirewallRule } from "../../network/dto.ts";
import { checkList, type ListCheck } from "../../network/firewallCheck.ts";
import {
  planEdit,
  type EditPlan,
  type FirewallEdit,
} from "../../network/firewallEdits.ts";
import {
  checkRuleDraft,
  draftOf,
  NEW_RULE_DRAFT,
  parseOptions,
  type Direction,
  type Kind,
  type KindDraft,
  type OtherDraft,
  type PortDraft,
  type RuleAction,
  type RuleDraft,
  type RuleProblem,
  type Where,
} from "../../network/firewallModel.ts";
import { classifyFirewall, type Impact } from "../../network/impact.ts";
import type { Family } from "../../network/ip.ts";
import { knownPorts } from "../../network/ruleWords.ts";
import { networkWarning } from "../../services/clientRules.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { FirewallCheckLine } from "../molecules/FirewallCheckLine.tsx";
import { SelfTestSelect } from "../molecules/SelfTestSelect.tsx";

export type RuleDialogMode =
  | { kind: "add"; prefill?: { draft: RuleDraft; where: Where } }
  | { kind: "change"; rule: FirewallRule; position: number };

const KINDS: readonly Kind[] = ["tcp", "udp", "icmp", "all"];

/** The form's own values, which a RuleDraft is made from. */
interface FormState {
  direction: Direction;
  action: RuleAction | null;
  kind: KindDraft;
  port: PortFieldValue;
  /** A stored port the choices cannot show ("!22"), kept until removed. */
  portClassic: string | null;
  other: ClientFieldValue<ClientChoiceOrRange>;
  /** A stored other computer the choices cannot show ("!192.0.2.0/24"), kept until a choice is made. */
  otherClassic: string | null;
  otherPort: string;
  nasSide: string;
  extraoptions: string;
  comment: string;
  where: string;
}

const whereValue = (where: Where): string =>
  where.kind === "before" ? `before:${String(where.position)}` : where.kind;

function whereOf(value: string): Where {
  if (value === "top") {
    return { kind: "top" };
  }
  const before = /^before:(\d+)$/u.exec(value);
  return before === null
    ? { kind: "end" }
    : { kind: "before", position: Number(before[1]) };
}

function formOf(
  draft: RuleDraft,
  where: Where,
  known: readonly string[],
): FormState {
  const portOf = (port: PortDraft): PortFieldValue => {
    if (port.kind !== "text") {
      return { choice: PORT_ANY, text: "" };
    }
    return known.includes(port.text)
      ? { choice: port.text, text: "" }
      : { choice: PORT_OTHER, text: port.text };
  };
  const otherOf = (
    other: OtherDraft,
  ): ClientFieldValue<ClientChoiceOrRange> => {
    switch (other.kind) {
      case "any":
        return { choice: "any", text: "", last: "" };
      case "one":
      case "network":
        return { choice: other.kind, text: other.text, last: "" };
      case "range":
        return { choice: "range", text: other.first, last: other.last };
      case "classic":
        return { choice: null, text: "", last: "" };
    }
  };
  return {
    direction: draft.direction,
    action: draft.action,
    kind: draft.kind,
    port: portOf(draft.port),
    portClassic: draft.port.kind === "classic" ? draft.port.text : null,
    other: otherOf(draft.other),
    otherClassic: draft.other.kind === "classic" ? draft.other.text : null,
    otherPort: draft.otherPort,
    nasSide: draft.nasSide,
    extraoptions: draft.extraoptions,
    comment: draft.comment,
    where: whereValue(where),
  };
}

const takesPort = (kind: KindDraft) =>
  kind.kind === "tcp" || kind.kind === "udp";

function draftOfForm(form: FormState): RuleDraft {
  let port: PortDraft = { kind: "any" };
  if (form.portClassic !== null) {
    port = { kind: "classic", text: form.portClassic };
  } else if (takesPort(form.kind) && form.port.choice !== PORT_ANY) {
    port = {
      kind: "text",
      text: form.port.choice === PORT_OTHER ? form.port.text : form.port.choice,
    };
  }
  const value = form.other;
  let other: OtherDraft;
  switch (value.choice) {
    case "one":
    case "network":
      other = { kind: value.choice, text: value.text };
      break;
    case "range":
      other = { kind: "range", first: value.text, last: value.last ?? "" };
      break;
    case null:
      other = { kind: "classic", text: form.otherClassic ?? "" };
      break;
    default:
      other = { kind: "any" };
  }
  return {
    direction: form.direction,
    action: form.action,
    kind: form.kind,
    port,
    other,
    otherPort: form.otherPort,
    nasSide: form.nasSide,
    extraoptions: form.extraoptions,
    comment: form.comment,
  };
}

export interface RuleDialogSubmit {
  edit: FirewallEdit;
  plan: EditPlan;
  impact: Impact;
}

export function FirewallRuleDialog({
  open,
  onClose,
  family,
  mode,
  stored,
  context,
  saving,
  error,
  onSubmit,
  finalFocus,
}: {
  open: boolean;
  onClose: () => void;
  family: Family;
  mode: RuleDialogMode;
  /** The stored list, in order. */
  stored: readonly FirewallRule[];
  context: FirewallContext;
  saving: boolean;
  /** Why the last save did not happen, in the page's words. */
  error: ReactNode;
  onSubmit: (submit: RuleDialogSubmit) => void;
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const ports = knownPorts(context.names);
  const knownValues = ports.map((p) => String(p.port));
  const [form, setForm] = useState<FormState>(() => {
    if (mode.kind === "change") {
      return formOf(draftOf(mode.rule), { kind: "end" }, knownValues);
    }
    const start = mode.prefill ?? {
      draft: NEW_RULE_DRAFT,
      where: { kind: "end" } as Where,
    };
    return formOf(start.draft, start.where, knownValues);
  });
  const [tried, setTried] = useState(false);
  const [blurred, setBlurred] = useState<{ port: boolean; other: boolean }>({
    port: false,
    other: false,
  });
  const cancelRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const checkId = useId();
  const reasonId = useId();
  const kindLabelId = useId();
  const v6 = family === 6;

  // After a refused save, focus goes to the first field the check refused, once its message shows.
  const [askFocus, setAskFocus] = useState(0);
  useEffect(() => {
    if (askFocus === 0) {
      return;
    }
    popupRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-invalid] input, [data-invalid] [role="radio"]',
      )
      ?.focus();
  }, [askFocus]);

  const edit = (change: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...change }));

  const draft = draftOfForm(form);
  const problems = checkRuleDraft(draft, family);
  const problem = (field: RuleProblem["field"]) =>
    problems.find((p) => p.field === field);
  const show = (field: "action" | "port" | "other") =>
    tried || (field !== "action" && blurred[field]);
  const problemText = (p: RuleProblem | undefined): ReactNode => {
    if (p === undefined) {
      return undefined;
    }
    if (p.code === "fwRule.err.address" && v6) {
      return t("fwRule.err.address6");
    }
    return t(p.code);
  };

  const firewallEdit: FirewallEdit | null =
    problems.length > 0
      ? null
      : mode.kind === "change"
        ? { kind: "change", rule: mode.rule, draft }
        : { kind: "add", draft, where: whereOf(form.where) };
  const plan =
    firewallEdit === null ? null : planEdit(stored, family, firewallEdit);
  const check: ListCheck | null =
    plan === null || !context.settled
      ? null
      : checkList(plan.after, family, context.check);
  const impact = check === null ? null : classifyFirewall(check);
  const review = opensFlow(impact);
  const refused = impact?.class === "refused";
  const cannotSendBack =
    plan?.call.kind === "cannotSendBack" ? plan.call.position : null;
  const unavailable = refused || cannotSendBack !== null;

  const submit = () => {
    if (saving) {
      return;
    }
    if (firewallEdit === null || plan === null || impact === null) {
      setTried(true);
      setAskFocus((n) => n + 1);
      return;
    }
    if (unavailable) {
      return;
    }
    onSubmit({ edit: firewallEdit, plan, impact });
  };

  const sideWord = form.direction === "in" ? t("fwRule.from") : t("fwRule.to");
  const placeholder = (v4: string, v6text: string) => (v6 ? v6text : v4);
  const wide =
    form.other.choice === "network"
      ? networkWarning({ choice: "network", text: form.other.text })
      : null;
  const warning =
    wide?.kind === "count"
      ? t("fwRule.networkWide", {
          count: new Intl.NumberFormat(i18n.language).format(wide.count),
        })
      : wide?.kind === "huge"
        ? t("fwRule.networkHuge")
        : undefined;
  const otherProblem = show("other") ? problem("other") : undefined;
  const otherError = (choice: ClientChoiceOrRange) =>
    form.other.choice === choice &&
    otherProblem !== undefined &&
    (choice !== "range" || otherProblem.code === "fwRule.err.address")
      ? problemText(otherProblem)
      : undefined;

  const classicRows: {
    id: "port" | "otherPort" | "nasSide" | "options";
    value: ReactNode;
    remove: () => void;
  }[] = [];
  if (form.portClassic !== null) {
    const text = form.portClassic;
    classicRows.push({
      id: "port",
      value: <Classic value={text} />,
      remove: () => edit({ portClassic: null }),
    });
  }
  if (form.otherPort.trim() !== "") {
    const text = form.otherPort;
    classicRows.push({
      id: "otherPort",
      value: <Classic value={text} />,
      remove: () => edit({ otherPort: "" }),
    });
  }
  if (form.nasSide.trim() !== "") {
    const text = form.nasSide;
    classicRows.push({
      id: "nasSide",
      value: <Classic value={text} />,
      remove: () => edit({ nasSide: "" }),
    });
  }
  if (form.extraoptions.trim() !== "") {
    const options = parseOptions(form.extraoptions);
    const text = form.extraoptions;
    classicRows.push({
      id: "options",
      value:
        options.kind === "self" ? (
          t("firewall.note.self")
        ) : options.kind === "replies" ? (
          t("firewall.note.replies")
        ) : (
          <Classic value={text} />
        ),
      remove: () => edit({ extraoptions: "" }),
    });
  }

  const title =
    mode.kind === "change" ? (
      <Trans
        i18nKey="fwRule.titleChange"
        components={{ n: <NodeSlot value={String(mode.position)} /> }}
      />
    ) : (
      t("fwRule.titleNew")
    );
  const buttonLabel = saving
    ? t("fwRule.saving")
    : review
      ? t("netChange.review")
      : mode.kind === "change"
        ? t("fwRule.save")
        : t("fwRule.add");
  const describedBy =
    [check === null ? null : checkId, unavailable ? reasonId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const whereOptions = [
    { value: "end", label: t("fwRule.where.end") },
    { value: "top", label: t("fwRule.where.top") },
    ...stored.map((_, i) => ({
      value: `before:${String(i + 1)}`,
      label: t("fwRule.where.before", { n: i + 1 }),
    })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) {
          onClose();
        }
      }}
    >
      <DialogContent
        ref={popupRef}
        aria-labelledby={titleId}
        initialFocus={mode.kind === "change" ? cancelRef : undefined}
        finalFocus={finalFocus}
        className="sm:max-w-2xl"
      >
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogTitle id={titleId}>{title}</DialogTitle>
          <RadioGroupField
            legend={t("fwRule.direction")}
            value={form.direction}
            onValueChange={(next) => {
              if (next === "in" || next === "out") {
                edit({ direction: next });
              }
            }}
            disabled={saving}
          >
            <RadioOption value="in" label={t("fwRule.dir.in")} />
            <RadioOption value="out" label={t("fwRule.dir.out")} />
          </RadioGroupField>
          <RadioGroupField
            legend={t("fwRule.then")}
            value={form.action ?? ""}
            onValueChange={(next) => {
              if (
                next === "accept" ||
                next === "reject" ||
                next === "drop" ||
                next === "log" ||
                next === "count"
              ) {
                edit({ action: next });
              }
            }}
            error={show("action") ? problemText(problem("action")) : undefined}
            disabled={saving}
          >
            <RadioOption
              value="accept"
              label={t("firewall.action.accept")}
              hint={t("network.term.accept")}
            />
            <RadioOption
              value="reject"
              label={t("firewall.action.reject")}
              hint={t("network.term.reject")}
            />
            <RadioOption
              value="drop"
              label={t("firewall.action.drop")}
              hint={t("network.term.drop")}
            />
            <RadioOption
              value="log"
              label={t("fwRule.logGo")}
              hint={t("network.term.log")}
            />
            {mode.kind === "change" && mode.rule.action === "" ? (
              <RadioOption
                value="count"
                label={t("firewall.action.count")}
                hint={t("network.term.count")}
              />
            ) : null}
          </RadioGroupField>
          <div className="flex flex-col gap-1">
            <span id={kindLabelId} className="text-base font-medium">
              {t("fwRule.kind")}
            </span>
            <SegmentedChoice<Kind>
              aria-label={t("fwRule.kind")}
              options={KINDS.map((kind) => ({
                value: kind,
                label: t(`fwRule.kindChoice.${kind}`),
              }))}
              value={form.kind.kind === "classic" ? null : form.kind.kind}
              onValueChange={(next) => edit({ kind: { kind: next } })}
              disabled={saving}
            />
            {form.kind.kind === "classic" ? (
              <p className="text-sm text-muted-foreground">
                <Trans
                  i18nKey="firewall.kind.classic"
                  components={{ kind: <Classic value={form.kind.text} bare /> }}
                />
              </p>
            ) : null}
          </div>
          {form.portClassic !== null ? null : (
            <PortField
              labels={{
                label: t("fwRule.port"),
                any: t("fwRule.anyPort"),
                other: t("fwRule.otherPort"),
                field: t("fwRule.portField"),
                fieldPlaceholder: "1024-65535",
                fieldHint: t("fwRule.portHint"),
              }}
              hint={t("network.term.port")}
              value={form.port}
              onValueChange={(port) => edit({ port })}
              knownPorts={ports.map((p) => ({
                value: String(p.port),
                label: t("fwRule.knownPort", {
                  port: p.port,
                  name: t(p.service),
                }),
              }))}
              error={show("port") ? problemText(problem("port")) : undefined}
              onBlur={() => setBlurred((b) => ({ ...b, port: true }))}
              unavailableReason={
                takesPort(form.kind) ? undefined : t("fwRule.portOnlyTcpUdp")
              }
              disabled={saving}
            />
          )}
          <ClientField<ClientChoiceOrRange>
            legend={sideWord}
            value={form.other}
            onValueChange={(other) =>
              edit({
                other,
                otherClassic: other.choice === null ? form.otherClassic : null,
              })
            }
            onBlur={() => setBlurred((b) => ({ ...b, other: true }))}
            family={v6 ? "ipv6" : "ipv4"}
            any={{ label: t("fwRule.any") }}
            one={{
              label: t("fwRule.one"),
              fieldLabel: t("fwRule.oneField"),
              placeholder: placeholder("192.0.2.10", "2001:db8::10"),
              error: otherError("one"),
            }}
            network={{
              label: t("fwRule.network"),
              fieldLabel: t("fwRule.networkField"),
              placeholder: placeholder("192.0.2.0/24", "2001:db8::/32"),
              fieldHint: v6
                ? t("fwRule.networkFieldHint6")
                : t("fwRule.networkFieldHint"),
              error: otherError("network"),
            }}
            range={{
              label: t("fwRule.range"),
              firstLabel: t("fwRule.rangeFirst"),
              lastLabel: t("fwRule.rangeLast"),
              firstPlaceholder: placeholder("192.0.2.10", "2001:db8::10"),
              lastPlaceholder: placeholder("192.0.2.20", "2001:db8::20"),
              firstError: otherError("range"),
              error:
                form.other.choice === "range" &&
                otherProblem?.code === "fwRule.err.range"
                  ? problemText(otherProblem)
                  : undefined,
            }}
            stored={
              form.otherClassic === null
                ? undefined
                : {
                    value: inertBidi(form.otherClassic),
                    description: t("fwRule.classicKept"),
                  }
            }
            warning={warning}
            disabled={saving}
          />
          {classicRows.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              <h3 className="text-base font-medium">
                {t("fwRule.classicTitle")}
              </h3>
              <ul className="flex flex-col gap-2">
                {classicRows.map((row) => {
                  const what = t(`fwRule.classicField.${row.id}`);
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-border bg-muted px-3 py-2"
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        {what}: {row.value}
                      </span>
                      <Button
                        type="button"
                        variant="neutral"
                        size="sm"
                        aria-label={t("fwRule.removeName", { what })}
                        disabled={saving}
                        onClick={row.remove}
                      >
                        {t("fwRule.remove")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {mode.kind === "add" ? (
            <SelfTestSelect
              label={t("fwRule.where.label")}
              value={form.where}
              options={whereOptions}
              onValueChange={(where) => edit({ where })}
              disabled={saving}
            />
          ) : null}
          <Field>
            <FieldLabel>{t("fwRule.note")}</FieldLabel>
            <FieldControl
              value={form.comment}
              maxLength={255}
              dir="auto"
              autoComplete="off"
              readOnly={saving}
              onChange={(event) => edit({ comment: event.target.value })}
            />
            <FieldHint>{t("fwRule.noteHint")}</FieldHint>
          </Field>
          {check === null ? null : (
            <FirewallCheckLine id={checkId} check={check} />
          )}
          {cannotSendBack === null ? null : (
            <InlineAlert id={reasonId} tone="neutral" icon="warning">
              <Trans
                i18nKey="firewall.cannotSendBack"
                components={{ n: <NodeSlot value={String(cannotSendBack)} /> }}
              />
            </InlineAlert>
          )}
          {error ? (
            <p role="alert" className="text-sm text-critical-label">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              ref={cancelRef}
              type="button"
              variant="neutral"
              disabled={saving}
              onClick={onClose}
            >
              {t("fwRule.cancel")}
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={unavailable}
              focusableWhenDisabled
              aria-describedby={describedBy}
            >
              {buttonLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A value set in the classic interface: "{{value}} (set in the classic interface)", or the value alone. */
function Classic({ value, bare = false }: { value: string; bare?: boolean }) {
  const shown = <IsolatedIdentifier value={inertBidi(value)} />;
  return bare ? (
    shown
  ) : (
    <Trans i18nKey="fwRule.classicValue" components={{ value: shown }} />
  );
}
