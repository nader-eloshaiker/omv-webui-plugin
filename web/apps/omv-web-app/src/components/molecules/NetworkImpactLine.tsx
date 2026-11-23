// SPDX-License-Identifier: GPL-3.0-or-later
// What a change does to this page (phase 5 network design 0.5, 1.4 item 3, 19.2): the class's words
// with its own icon shape (the library's ImpactLine), then the specific line of each finding
// (`netChange.effect.*`). Under a form it is a polite live region and part of the Save button's
// description (useReviewButton's `impactLineId`); in the review summary it does not change.
import { ImpactLine, IsolatedIdentifier } from "@omv-webui/react-ui-components";
import { Fragment, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { pageUrl, type PageLocation } from "../../network/connection.ts";
import type { Finding, Impact } from "../../network/impact.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { FirewallWhoList } from "./FirewallWhoList.tsx";

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

/** The specific line of one finding, or null when it has none. */
export function FindingLine({
  finding,
  location,
}: {
  finding: Finding;
  location: PageLocation;
}): ReactNode {
  const { t } = useTranslation();
  switch (finding.class) {
    case "moves":
      return (
        <Trans
          i18nKey={finding.effect}
          components={{
            old: <Value value={finding.old} />,
            new: <Value value={pageUrl(location, finding.new)} />,
          }}
        />
      );
    case "mayCut":
      switch (finding.effect) {
        case "netChange.effect.mtu":
          return (
            <Trans
              i18nKey="netChange.effect.mtu"
              components={{
                size: (
                  <NodeSlot
                    value={t("netChange.note.mtuBytes", {
                      size: String(finding.size ?? ""),
                    })}
                  />
                ),
              }}
            />
          );
        case "netChange.effect.firewall":
          return (
            <Trans
              i18nKey="netChange.effect.firewall"
              components={{
                list: <FirewallWhoList recorded={finding.who ?? []} />,
              }}
            />
          );
        case "netChange.effect.automatic":
        case "netChange.effect.gateway":
        case "netChange.effect.wifi":
          return t(finding.effect);
        case null:
          return null;
      }
      return null;
    case "brief":
    case "refused":
      return null;
  }
}

/** The class's own words (0.5). */
export function ImpactWords({ impact }: { impact: Impact }): ReactNode {
  const { t } = useTranslation();
  switch (impact.class) {
    case "none":
      return t("network.impact.none");
    case "brief":
      return t("network.impact.brief");
    case "mayCut":
      return t("network.impact.mayCut");
    case "moves": {
      const moved = impact.findings.find((f) => f.class === "moves");
      return moved?.class === "moves" ? (
        <Trans
          i18nKey="network.impact.moves"
          components={{
            old: <Value value={moved.old} />,
            new: <Value value={moved.new} />,
          }}
        />
      ) : null;
    }
    case "refused":
      return null;
  }
}

const effectKey = (f: Finding) =>
  f.class === "moves" || f.class === "mayCut"
    ? `${f.class}:${String(f.effect)}`
    : f.class;

export function NetworkImpactLine({
  impact,
  location,
  refusal,
  id,
  live = true,
  className,
}: {
  impact: Impact;
  location: PageLocation;
  /** A Refused change's reason, in the page's words (0.8). */
  refusal?: ReactNode;
  id?: string;
  /** False in the review summary, where it does not change while read. */
  live?: boolean;
  className?: string;
}) {
  const seen = new Set<string>();
  const details = impact.findings.filter((f) => {
    const key = effectKey(f);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const lines = details
    .map((finding, i) => ({
      key: `${effectKey(finding)}:${String(i)}`,
      node: <FindingLine finding={finding} location={location} />,
      has:
        finding.class === "moves" ||
        (finding.class === "mayCut" && finding.effect !== null),
    }))
    .filter((l) => l.has);
  return (
    <ImpactLine
      id={id}
      impact={impact.class}
      live={live}
      className={className}
      detail={
        lines.length === 0 ? undefined : (
          <>
            {lines.map((l, i) => (
              <Fragment key={l.key}>
                {i > 0 ? " " : null}
                {l.node}
              </Fragment>
            ))}
          </>
        )
      }
    >
      {impact.class === "refused" ? refusal : <ImpactWords impact={impact} />}
    </ImpactLine>
  );
}
