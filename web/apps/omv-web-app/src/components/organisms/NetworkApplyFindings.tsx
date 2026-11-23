// SPDX-License-Identifier: GPL-3.0-or-later
// The apply confirmation's network part (phase 5 network design 1.8): "What is applied" gains one line
// per finding with its class's words and shape, and the confirmation escalates. Brief interruption or
// Not affected: the lines only. Moves or May cut: the summary's "Before you apply" items (the current
// settings to copy, never a password; the recovery steps to read; nothing goes back by itself) and the
// typed confirmation. Refused: the reason, a router link to where it can be changed, and Undo; no
// classic link (P18). The values come from the NAS, so nothing here is a link built from one (P7).
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  ImpactLine,
  IsolatedIdentifier,
  TypeToConfirmField,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { ApplyCheck } from "../../hooks/useNetworkApplyCheck.ts";
import { useNetworkWords } from "../../hooks/useNetworkWords.ts";
import {
  bandImpact,
  bandRecoveryChange,
  type BandConfirmation,
} from "../../network/bandApply.ts";
import { certainty, standing } from "../../network/connection.ts";
import type { BandLine } from "../../network/impact.ts";
import { recoveryCard } from "../../network/recovery.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import { FirewallWhoList } from "../molecules/FirewallWhoList.tsx";
import { NetworkRecoveryCard } from "../molecules/NetworkRecoveryCard.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** One line under "What is applied", in its class's words. */
export function BandLineText({ line }: { line: BandLine }): ReactNode {
  const { t } = useTranslation();
  switch (line.code) {
    case "netApply.lineMoves":
      return (
        <Trans
          i18nKey="netApply.lineMoves"
          components={{
            iface: <Value value={line.iface} />,
            old: <Value value={line.old} />,
            new: <Value value={line.new} />,
          }}
        />
      );
    case "netApply.lineMayCut":
      return (
        <Trans
          i18nKey="netApply.lineMayCut"
          components={{ iface: <Value value={line.iface} /> }}
        />
      );
    case "netApply.lineFirewall":
      return (
        <Trans
          i18nKey="netApply.lineFirewall"
          components={{ list: <FirewallWhoList recorded={line.who} /> }}
        />
      );
    case "network.impact.moves":
      return (
        <Trans
          i18nKey="network.impact.moves"
          components={{
            old: <Value value={line.old} />,
            new: <Value value={line.new} />,
          }}
        />
      );
    case "netApply.refusedIface":
      return (
        <Trans
          i18nKey="netApply.refusedIface"
          components={{ iface: <Value value={line.iface} /> }}
        />
      );
    case "netApply.lineBrief":
    case "network.impact.mayCut":
    case "netApply.refusedFirewall":
      return t(line.code);
  }
}

/** Where a refused apply's cause can be changed: the firewall page, or the interfaces. */
function RefusedLink({ line }: { line: BandLine }) {
  const { t } = useTranslation();
  if (line.code === "netApply.refusedFirewall") {
    return (
      <Link
        to="/$group/$item"
        params={{ group: "network", item: "firewall" }}
        className={routerLinkClass}
      >
        {t("netApply.changeRules")}
      </Link>
    );
  }
  if (line.code === "netApply.refusedIface") {
    return (
      <Link
        to="/$group/$item"
        params={{ group: "network", item: "interfaces" }}
        className={routerLinkClass}
      >
        <Trans
          i18nKey="netApply.changeIface"
          components={{ iface: <Value value={line.iface} /> }}
        />
      </Link>
    );
  }
  return null;
}

export function NetworkApplyFindings({
  state,
  pending,
  count,
  confirmation,
  typed,
  onTypedChange,
  onUndo,
}: {
  state: { state: "checking" } | { state: "done"; result: ApplyCheck };
  pending: readonly string[];
  count: number;
  /** The typed confirmation, when the apply escalates to it. */
  confirmation: BandConfirmation | null;
  typed: string;
  onTypedChange: (value: string) => void;
  /** "Undo {{count}} changes", offered when the apply is refused. */
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const words = useNetworkWords();
  const hintId = useId();
  if (state.state === "checking") {
    return (
      <p role="status" className="text-muted-foreground">
        {t("netApply.checking")}
      </p>
    );
  }
  const { check, connection, location, devices, hostname } = state.result;
  const refused = check.lines.filter((l) => l.class === "refused");

  // "Copy the current settings": what the page's interface uses now, or every interface with an
  // address when the page cannot tell which one it uses.
  const rows = devices.state === "ok" ? devices.data : [];
  const ownRows = rows.filter(
    (r) => standing(connection, r.devicename) === "this",
  );
  const noteRows = (ownRows.length > 0 ? ownRows : rows).filter(
    (r) => r.devicename !== "lo" && (r.address !== "" || r.address6 !== ""),
  );
  const note = words.liveNote(noteRows);
  const recovery = recoveryCard({
    variant: null,
    change: bandRecoveryChange(pending),
    impact: bandImpact(check),
    certainty: certainty(connection),
    location,
    hostname,
    copied: false,
  });

  return (
    <div className="flex flex-col gap-3">
      {check.lines.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {check.lines.map((line, i) => (
            <li key={`${line.code}:${String(i)}`}>
              <ImpactLine impact={line.class} live={false}>
                <BandLineText line={line} />
              </ImpactLine>
            </li>
          ))}
        </ul>
      ) : null}
      {refused.length > 0 ? (
        <div className="flex flex-col items-start gap-2">
          {refused.map((line, i) => (
            <p key={`${line.code}:${String(i)}`}>
              <RefusedLink line={line} />
            </p>
          ))}
          {onUndo ? (
            <Button variant="neutral" onClick={onUndo}>
              {t("pending.undo", { count })}
            </Button>
          ) : null}
        </div>
      ) : null}
      {confirmation !== null ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle level={3}>{t("netChange.beforeTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {note === "" ? null : (
                <div className="flex flex-col items-start gap-1.5">
                  <p>{t("netChange.copyNote")}</p>
                  <CopyButton
                    text={note}
                    label={t("netChange.copy")}
                    copiedLabel={t("netChange.copied")}
                    selectedLabel={t("common.copySelected")}
                    size="sm"
                  />
                </div>
              )}
              <Disclosure>
                <DisclosureTrigger>
                  {t("netChange.recoveryOpen")}
                </DisclosureTrigger>
                <DisclosurePanel>
                  <NetworkRecoveryCard
                    variant={null}
                    steps={recovery.steps}
                    onTryAgain={() => undefined}
                    allowLinks={false}
                    announce={false}
                    headingLevel={4}
                  />
                </DisclosurePanel>
              </Disclosure>
              <p>{t("netChange.noRollback")}</p>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-1">
            <TypeToConfirmField
              confirmText={confirmation.value}
              prompt={t(confirmation.code, { value: confirmation.value })}
              value={typed}
              onValueChange={onTypedChange}
            />
            <p id={hintId} className="text-sm text-muted-foreground">
              {t("netChange.typeHint")}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
