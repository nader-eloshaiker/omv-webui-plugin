// SPDX-License-Identifier: GPL-3.0-or-later
// "Blink its light" (phase 5 network design 4.4; P16, D19): how long (5, 10, 15 or 30 seconds, 10 by
// default), the warning when the port is this page's (or under it, or the page cannot tell), Cancel
// focused and Blink. Network.identify runs as a task through the task helper (never Exec directly; the
// handle stays in the registry, UI-5). While it blinks the dialog says so with the elapsed time; at the
// end "Done. Did you see the light?", or the server's message as text when the port could not blink.
// On this page's port the page waits as 1.5's Brief interruption does, for the time chosen plus 10
// seconds: a read with no reply is not a failure, the wait is shown with "Stop waiting", and if the NAS
// does not answer in time the recovery card's first step. On the test VM the port kept carrying
// traffic while it blinked, so the warning says "some ports". Nothing retries by itself (UI-14).
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineAlert,
  IsolatedIdentifier,
  ReconnectWatch,
  SegmentedChoice,
} from "@omv-webui/react-ui-components";
import { useEffect, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { whenSettled } from "../../hooks/useBandActions.ts";
import { useNetworkApi } from "../../hooks/useNetworkApi.ts";
import { useNetworkWords } from "../../hooks/useNetworkWords.ts";
import { useNow } from "../../hooks/useNow.ts";
import { useReconnectWatch } from "../../hooks/useReconnectWatch.ts";
import { blinkWaitSeconds } from "../../network/changeFlow.ts";
import { beginAction, endAction } from "../../network/networkSession.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { NetworkRecoveryCard } from "../molecules/NetworkRecoveryCard.tsx";

/** The classic form's choices (D19); OMV allows 1 to 30, the contract these four. */
const BLINK_SECONDS = [5, 10, 15, 30] as const;
type BlinkSeconds = (typeof BLINK_SECONDS)[number];

type Phase =
  | { kind: "choose" }
  | { kind: "running"; seconds: BlinkSeconds; startedAt: number }
  | { kind: "done" }
  | { kind: "failed"; message: string | null }
  | { kind: "lost" }
  | { kind: "busy" };

export function IfaceBlinkDialog({
  open,
  onOpenChange,
  devicename,
  affectsPage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devicename: string;
  /** The port is this page's, under it, or the page cannot tell (impact.blinkAffectsPage). */
  affectsPage: boolean;
}) {
  const { t } = useTranslation();
  const api = useNetworkApi();
  const words = useNetworkWords();
  const watch = useReconnectWatch();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const howLongId = useId();
  const [seconds, setSeconds] = useState<BlinkSeconds>(10);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [trying, setTrying] = useState(false);
  const running = phase.kind === "running";
  const now = useNow(running ? 1000 : null);
  const object = {
    kind: "iface",
    devicename,
    type: "ethernet",
  } as const;

  // A finished blink moves focus to Close, so the reader hears how it ended and can leave.
  useEffect(() => {
    if (phase.kind !== "choose" && phase.kind !== "running") {
      closeRef.current?.focus();
    }
  }, [phase.kind]);

  const finish = (next: Phase) => {
    endAction(object);
    setPhase(next);
  };

  const failureOf = (id: number): Phase => {
    const task = taskRegistry.get(id);
    return { kind: "failed", message: task?.error?.message ?? null };
  };

  const blink = () => {
    if (!beginAction(object)) {
      setPhase({ kind: "busy" });
      return;
    }
    const chosen = seconds;
    const id = taskRegistry.start(
      t("ifaceBlink.task", { iface: devicename }),
      api.identify({ devicename, seconds: chosen }),
    );
    setPhase({ kind: "running", seconds: chosen, startedAt: Date.now() });
    if (affectsPage) {
      watch.start({
        expectation: { kind: "same", timeout: blinkWaitSeconds(chosen) },
        taskId: id,
        modules: [],
        onDone: (state) => {
          switch (state.outcome.kind) {
            case "applyFailed":
              finish(failureOf(id));
              break;
            case "recovery":
              finish({ kind: "lost" });
              break;
            default:
              finish({ kind: "done" });
          }
        },
      });
    } else {
      void whenSettled(id).then((task) => {
        finish(
          task?.state === "done"
            ? { kind: "done" }
            : { kind: "failed", message: task?.error?.message ?? null },
        );
      });
    }
  };

  const close = () => {
    watch.reset();
    setPhase({ kind: "choose" });
    onOpenChange(false);
  };

  const tryAgain = async () => {
    setTrying(true);
    try {
      if (await watch.tryAgain()) {
        setPhase({ kind: "done" });
      }
    } finally {
      setTrying(false);
    }
  };

  const duration = (count: number) => (
    <NodeSlot value={t("ifaceBlink.seconds", { count })} />
  );
  const iface = <IsolatedIdentifier value={inertBidi(devicename)} />;
  const waiting = watch.state?.phase === "waiting";

  let body;
  switch (phase.kind) {
    case "choose":
      body = (
        <>
          <div className="flex flex-col gap-1.5">
            <p id={howLongId} className="text-base font-medium">
              {t("ifaceBlink.howLong")}
            </p>
            <SegmentedChoice
              aria-label={t("ifaceBlink.howLong")}
              options={BLINK_SECONDS.map((s) => ({
                value: String(s),
                label: t("ifaceBlink.seconds", { count: s }),
              }))}
              value={String(seconds)}
              onValueChange={(value) => {
                const next = BLINK_SECONDS.find((s) => String(s) === value);
                if (next !== undefined) {
                  setSeconds(next);
                }
              }}
            />
          </div>
          {affectsPage ? (
            <InlineAlert tone="neutral" icon="warning">
              <Trans
                i18nKey="ifaceBlink.thisPage"
                components={{ duration: duration(seconds) }}
              />
            </InlineAlert>
          ) : null}
        </>
      );
      break;
    case "running": {
      const elapsed = Math.max(0, Math.floor((now - phase.startedAt) / 1000));
      body = waiting ? null : (
        <div className="flex flex-col gap-1">
          <p role="status">
            <Trans
              i18nKey="ifaceBlink.running"
              components={{ duration: duration(phase.seconds) }}
            />
          </p>
          <p className="text-sm text-muted-foreground" aria-hidden="true">
            <Trans
              i18nKey="ifaceBlink.elapsed"
              components={{
                elapsed: <NodeSlot value={words.elapsed(elapsed)} />,
              }}
            />
          </p>
        </div>
      );
      break;
    }
    case "done":
      body = <p role="status">{t("ifaceBlink.done")}</p>;
      break;
    case "failed":
      body = (
        <p role="alert" className="[overflow-wrap:anywhere]">
          <Trans
            i18nKey="ifaceBlink.failed"
            components={{
              message: (
                <NodeSlot
                  value={<span dir="auto">{phase.message ?? ""}</span>}
                />
              ),
            }}
          />
        </p>
      );
      break;
    case "lost":
      body = (
        <NetworkRecoveryCard
          variant="lost"
          steps={[{ code: "netRecover.wait" }]}
          onTryAgain={() => void tryAgain()}
          trying={trying}
          allowLinks={false}
          headingLevel={3}
        />
      );
      break;
    case "busy":
      body = (
        <p role="status">
          <Trans i18nKey="ifaceBlink.busy" components={{ iface }} />
        </p>
      );
      break;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While the light blinks the dialog stays: it is the only place that says how it ends.
        if (!next && !running) {
          close();
        }
      }}
    >
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey="ifaceBlink.title" components={{ iface }} />
          </DialogTitle>
          <DialogDescription>{t("ifaceBlink.body")}</DialogDescription>
        </DialogHeader>
        {body}
        {running && waiting ? (
          <ReconnectWatch
            state="waiting"
            elapsedSeconds={watch.elapsed}
            waiting={(s) => (
              <Trans
                i18nKey="netChange.waiting"
                components={{ elapsed: <NodeSlot value={words.elapsed(s)} /> }}
              />
            )}
            stopLabel={t("netChange.stopWaiting")}
            onStop={watch.stop}
          />
        ) : null}
        <DialogFooter>
          {phase.kind === "choose" ? (
            <>
              <Button ref={cancelRef} variant="neutral" onClick={close}>
                {t("ifaceBlink.cancel")}
              </Button>
              <Button onClick={blink}>{t("ifaceBlink.confirm")}</Button>
            </>
          ) : phase.kind === "running" ? null : (
            <Button ref={closeRef} variant="neutral" onClick={close}>
              {t("ifaceBlink.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
