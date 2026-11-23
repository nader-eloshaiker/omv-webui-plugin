// SPDX-License-Identifier: GPL-3.0-or-later
// After the band applied network changes (phase 5 network design 1.5, 1.6, 1.8, 10.4): the wait for
// the NAS with the elapsed time and "Stop waiting", then how it ended: connected again, still at the
// old address, the moved card, or the recovery card. The band's values come from the NAS, so the
// moved card has no link (P7, UI-3). Also the offer to apply the queued jobs after an Undo brought an
// interface's settings back (10.4).
import {
  Button,
  InlineAlert,
  IsolatedIdentifier,
  ReconnectWatch,
  type ReconnectWatchProps,
} from "@omv-webui/react-ui-components";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { BandActions } from "../../hooks/useBandActions.ts";
import { useNetworkWords } from "../../hooks/useNetworkWords.ts";
import { bandImpact, bandRecoveryChange } from "../../network/bandApply.ts";
import { certainty, pageUrl } from "../../network/connection.ts";
import { readPageLocation } from "../../network/pageLocation.ts";
import { recoveryCard } from "../../network/recovery.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { NetworkRecoveryCard } from "../molecules/NetworkRecoveryCard.tsx";

export function BandWatch({ actions }: { actions: BandActions }) {
  const { t } = useTranslation();
  const words = useNetworkWords();
  const navigate = useNavigate();
  const { watch, applied, cameBack } = actions;
  const [reached, setReached] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);

  const offer =
    cameBack.length > 0 ? (
      <InlineAlert tone="neutral" icon="warning">
        <div className="flex flex-col items-start gap-2">
          {cameBack.map((iface) => (
            <p key={iface}>
              <Trans
                i18nKey="netApply.cameBack"
                components={{
                  iface: <IsolatedIdentifier value={inertBidi(iface)} />,
                }}
              />
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button onClick={actions.applyQueued}>
              {t("netApply.applyQueued")}
            </Button>
            <Button variant="neutral" onClick={actions.dismissCameBack}>
              {t("netApply.dismiss")}
            </Button>
          </div>
        </div>
      </InlineAlert>
    ) : null;

  const state = watch.state;
  if (state === null || applied === null) {
    return offer;
  }
  const check = applied.check;
  const location = check?.location ?? readPageLocation();
  const close = () => {
    setReached(false);
    setNoAnswer(false);
    actions.dismiss();
  };
  const closeButton = (
    <div>
      <Button variant="neutral" onClick={close}>
        {t("netApply.dismiss")}
      </Button>
    </div>
  );

  if (state.phase === "applying") {
    // The task is followed by the registry; the band says it is applying.
    return offer;
  }
  const tryAgain = async () => {
    const answered = await watch.tryAgain();
    setReached(answered);
    setNoAnswer(!answered);
  };
  const recovery = (variant: "lost" | "unknownAddress" | "newFails") =>
    recoveryCard({
      variant,
      change: bandRecoveryChange(applied.modules),
      impact:
        check === null
          ? { class: "brief", findings: [] }
          : bandImpact(check.check),
      certainty: check === null ? "notKnown" : certainty(check.connection),
      location,
      hostname: check?.hostname ?? "",
      copied: false,
    });

  // One ReconnectWatch in one place while its state changes, so its live regions announce each
  // change (the library's note); the recovery card is an alert of its own.
  let props: ReconnectWatchProps | null = null;
  let below: ReactNode = null;
  if (state.phase === "waiting") {
    props = {
      state: "waiting",
      elapsedSeconds: watch.elapsed,
      waiting: (s) => (
        <Trans
          i18nKey="netChange.waiting"
          components={{ elapsed: <NodeSlot value={words.elapsed(s)} /> }}
        />
      ),
      stopLabel: t("netChange.stopWaiting"),
      onStop: watch.stop,
    };
  } else if (reached) {
    props = { state: "connected", message: t("netApply.connectedAgain") };
    below = closeButton;
  } else {
    const outcome = state.outcome;
    switch (outcome.kind) {
      case "connectedAgain":
      case "keptAddress":
        props = { state: "connected", message: t("netApply.connectedAgain") };
        below = closeButton;
        break;
      case "stillOld":
        props = {
          state: "connected",
          message: (
            <Trans
              i18nKey="netChange.stillOld"
              components={{
                old: <IsolatedIdentifier value={inertBidi(outcome.old)} />,
              }}
            />
          ),
        };
        below = closeButton;
        break;
      case "moved":
        props = {
          state: "moved",
          url: pageUrl(location, outcome.new),
          message: (u) => (
            <Trans i18nKey="netChange.moved" components={{ new: u }} />
          ),
          copy: {
            label: t("netChange.copyNewAddress"),
            copiedLabel: t("common.copied"),
            selectedLabel: t("common.copySelected"),
          },
          note: t("netChange.signInThere"),
          children: (
            <NetworkRecoveryCard
              variant="newFails"
              steps={recovery("newFails").steps}
              onTryAgain={() => void tryAgain()}
              trying={watch.trying}
              allowLinks={false}
              announce={false}
              headingLevel={3}
            />
          ),
        };
        break;
      case "recovery":
        below = (
          <>
            <NetworkRecoveryCard
              variant={outcome.variant}
              steps={recovery(outcome.variant).steps}
              onTryAgain={() => void tryAgain()}
              trying={watch.trying}
              allowLinks={false}
              headingLevel={2}
            />
            {noAnswer ? (
              <p role="status" className="text-muted-foreground">
                {t("netRecover.noAnswer")}
              </p>
            ) : null}
          </>
        );
        break;
      case "signInAgain":
        props = {
          state: "signIn",
          message: t("netChange.signInAgain"),
          signInLabel: t("netChange.signIn"),
          onSignIn: () => void navigate({ to: "/sign-in" }),
        };
        break;
      case "applyFailed":
        // The band says it failed, with "Try applying again" (R7).
        break;
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {props === null ? null : <ReconnectWatch {...props} />}
      {below}
      {offer}
    </div>
  );
}
