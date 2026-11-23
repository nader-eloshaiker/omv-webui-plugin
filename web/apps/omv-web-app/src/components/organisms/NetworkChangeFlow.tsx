// SPDX-License-Identifier: GPL-3.0-or-later
// The change flow (phase 5 network design 1.4 to 1.7): a change that moves this page or may cut it off
// is applied on its own, in place on the page it was opened from (no route, R9), as a step view that
// replaces the form. Its state lives in memory only (networkSession, UI-5, UI-13).
//
// 1. Pre-flight (R1): other pending changes are applied or undone first.
// 2. The summary: the connection line, what changes (Now and After), what it does to this page and to
//    other computers, "Before you apply" (the current settings to copy, never a password; the
//    recovery steps to read; nothing goes back by itself), the typed confirmation. Back, Cancel
//    (focused) and "Save and apply" in the destructive form; Enter does not confirm (no form).
// 3. The run: save (read again first, R4; refused when the object changed since the summary), apply
//    exactly this change's modules through the task helper, reach the NAS again (1.5).
// 4. The result: what is in effect, "Keep the new settings" (sends nothing) and "Put back how it
//    was…" (1.7), or the moved card, or the recovery card (1.6).
// Nothing retries by itself (UI-14). A 401 ends the session for the whole interface (the sign-in
// page); the flow's memory goes with it, as a reload's does (R8).
import { useSystemGetInformation } from "@omv-webui/react-api-omv/generated";
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  InlineAlert,
  IsolatedIdentifier,
  JobFailure,
  JobStepList,
  NowAfterTable,
  ReconnectWatch,
  SecretField,
  TypeToConfirmField,
  type JobStep,
  type NowAfterRow,
  type ReconnectWatchProps,
  type TaskStatus,
} from "@omv-webui/react-ui-components";
import { useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { whenSettled } from "../../hooks/useBandActions.ts";
import { useNetworkApi, type NetworkApi } from "../../hooks/useNetworkApi.ts";
import { useConnection } from "../../hooks/useNetworkReads.ts";
import { useNetworkWords } from "../../hooks/useNetworkWords.ts";
import type { Write } from "../../hooks/useNetworkWrites.ts";
import { useReconnectWatch } from "../../hooks/useReconnectWatch.ts";
import {
  confirmationMatches,
  expectationFor,
  MODULES_FOR,
  putBackAvailability,
  putBackWrite,
  RUN_START,
  runStep,
  wifiPutBackRequest,
  type ChangeAction,
  type Confirmation,
  type CurrentState,
  type FlowObject,
  type PutBack,
  type Remembered,
  type RunState,
  type StepStatus,
  type WatchOutcome,
} from "../../network/changeFlow.ts";
import {
  certainty,
  pageUrl,
  type Connection,
} from "../../network/connection.ts";
import { NEW_OBJECT_UUID } from "../../network/dto.ts";
import type { Impact } from "../../network/impact.ts";
import {
  beginAction,
  closeFlow,
  endAction,
  networkSession,
  openFlow,
  updateFlow,
} from "../../network/networkSession.ts";
import { recoveryCard, type RecoveryChange } from "../../network/recovery.ts";
import { pendingModules } from "../../pending/modules.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { NodeSlot } from "../atoms/NodeSlot.tsx";
import { ModuleNames } from "../molecules/ModuleNames.tsx";
import { NetworkConnectionLine } from "../molecules/NetworkConnectionLine.tsx";
import { NetworkImpactLine } from "../molecules/NetworkImpactLine.tsx";
import { NetworkRecoveryCard } from "../molecules/NetworkRecoveryCard.tsx";
import { StepTask } from "../molecules/StepTask.tsx";
import { FlowPreflight } from "./FlowPreflight.tsx";

/** A change a page hands to the flow, described for the summary and ready to be written. */
export interface NetworkChange {
  /** What changes: `netChange.title`'s object, and the one action per object (0.8). */
  object: FlowObject;
  /** Which modules the flow applies (changeFlow.MODULES_FOR, 0.7). */
  action: Exclude<ChangeAction, "proxy">;
  /** "Now" and "After": the rows that change, and an interface's address rows whether or not. */
  rows: readonly NowAfterRow[];
  /** The class and findings (impact.ts): Moves or May cut. */
  impact: Impact;
  /** "What it does to other computers": one line each, in the page's words (2.3, 5.6, 10.2, 11.5). */
  others?: readonly { id: string; text: ReactNode }[];
  /** "Copy the current settings": plain text (useNetworkWords), never a password. */
  note: string;
  /** What the reader types (changeFlow.confirmationFor). */
  confirmation: Confirmation;
  /** Read again, refuse when changed since the summary, write (useNetworkWrites). */
  write: Write;
  /** A Wi-Fi interface: Put back asks for its password again (0.6, 1.7). */
  wifi?: boolean;
  /** The NAS's name as read for the summary, for the recovery card's "find the address" step. */
  hostname: string;
  /** The new name typed on the name page (a link in the moved and recovery cards, P7). */
  newName?: string;
}

const Value = ({ value }: { value: string }) => (
  <IsolatedIdentifier value={inertBidi(value)} />
);

const STATES: readonly TaskStatus[] = [
  "waiting",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

const taskStatus = (s: StepStatus): TaskStatus =>
  s === "done" ? "succeeded" : s;

const sameConnection = (a: Connection, b: Connection): boolean =>
  JSON.stringify(a, (_k, v: unknown) =>
    typeof v === "bigint" ? String(v) : v,
  ) ===
  JSON.stringify(b, (_k, v: unknown) =>
    typeof v === "bigint" ? String(v) : v,
  );

const recoveryChangeOf = (object: FlowObject): RecoveryChange =>
  object.kind === "iface" ? "iface" : object.kind;

/** Read what Put back is checked against (1.7). */
async function currentState(
  api: NetworkApi,
  remembered: Remembered,
): Promise<CurrentState | null> {
  try {
    switch (remembered.kind) {
      case "name":
        return { kind: "name", general: await api.rereads.general() };
      case "firewall":
        return {
          kind: "firewall",
          rules: await api.rereads.rules(remembered.family),
        };
      case "ifaceChanged":
      case "ifaceAdded":
      case "ifaceRemoved":
        return { kind: "ifaces", stored: await api.rereads.stored() };
    }
  } catch {
    return null;
  }
}

type Mode = "change" | "putBack" | "undo";

export function NetworkChangeFlow({
  change,
  onBack,
  onCancel,
  onDone,
}: {
  change: NetworkChange;
  /** "Back": to the form, with its values. */
  onBack: () => void;
  /** "Cancel": nothing was saved; leave the change. */
  onCancel: () => void;
  /** The flow ended ("Keep the new settings", or closed after a Put back or an Undo). */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const words = useNetworkWords();
  const navigate = useNavigate();
  const api = useNetworkApi();
  const watch = useReconnectWatch();
  const { connection, location, refresh } = useConnection({ focus: false });
  const information = useSystemGetInformation({
    query: { refetchOnMount: "always", staleTime: 0 },
  });
  const session = useMemoryStore(networkSession);
  const copied = session.flow?.copied ?? false;

  const [stage, setStage] = useState<"summary" | "run">("summary");
  const [mode, setMode] = useState<Mode>("change");
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState<RunState>(RUN_START);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [applyTask, setApplyTask] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<"retry" | "undo" | null>(null);
  const [after, setAfter] = useState<{
    connection: Connection | null;
    stillPending: boolean;
    putBack: PutBack | null;
  } | null>(null);
  const [putBackOpen, setPutBackOpen] = useState(false);
  const [passwordKey, setPasswordKey] = useState(0);
  const [passwordTyped, setPasswordTyped] = useState(false);
  const passwordRef = useRef("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  const resultRef = useRef<HTMLDivElement>(null);

  const modules = MODULES_FOR[change.action];
  // The connection the summary showed when the reader confirmed; the run refuses when it changed
  // before the save.
  const [summaryConnection, setSummaryConnection] =
    useState<Connection>(connection);

  // The flow is the session's one (networkSession), forgotten when the page goes (R8).
  useEffect(() => {
    closeFlow();
    openFlow(change.object);
    return () => closeFlow();
  }, [change.object]);

  const objectNode: ReactNode =
    change.object.kind === "iface" ? (
      <Value value={change.object.devicename || change.confirmation.value} />
    ) : (
      t(`netChange.object.${change.object.kind}`)
    );

  const forgetPassword = () => {
    passwordRef.current = "";
    setPasswordTyped(false);
    setPasswordKey((k) => k + 1);
  };

  // ---- The run --------------------------------------------------------------------------------------

  const onWatchDone = async (outcome: WatchOutcome, runMode: Mode) => {
    if (
      outcome.kind !== "connectedAgain" &&
      outcome.kind !== "keptAddress" &&
      outcome.kind !== "stillOld"
    ) {
      setAfter({ connection: null, stillPending: false, putBack: null });
      return;
    }
    const reading = await refresh();
    const pending: readonly string[] = await api.rereads
      .pending()
      .catch(() => []);
    const stillPending = modules.some((m) => pending.includes(m));
    const memory = networkSession.getState().flow?.remembered ?? null;
    const putBack =
      runMode === "change"
        ? putBackAvailability({
            remembered: memory,
            outcome,
            pending,
            current: memory === null ? null : await currentState(api, memory),
          })
        : null;
    setAfter({ connection: reading.connection, stillPending, putBack });
    resultRef.current?.focus();
  };

  const applyStep = (runMode: Mode, applyModules: readonly string[]) => {
    setAfter(null);
    const id = taskRegistry.start(
      t("netChange.step.apply"),
      api.apply(applyModules, runMode === "undo"),
    );
    setApplyTask(id);
    watch.start({
      expectation:
        runMode === "change"
          ? expectationFor(change.impact)
          : { kind: "same", timeout: 60 },
      taskId: id,
      modules: applyModules,
      onDone: (state) => void onWatchDone(state.outcome, runMode),
    });
  };

  const runWrite = async (
    runMode: Mode,
    write: Write,
    applyModules: readonly string[],
    shown: Connection,
  ) => {
    setMode(runMode);
    setStage("run");
    setServerMessage(null);
    watch.reset();
    setApplyTask(null);
    setAfter(null);
    let state = RUN_START;
    setRun(state);
    const step = (event: Parameters<typeof runStep>[1]) => {
      state = runStep(state, event);
      setRun(state);
    };
    if (!beginAction(change.object)) {
      step({ kind: "saveFailed" });
      setServerMessage(null);
      return;
    }
    try {
      // R1 again: other changes became pending since the pre-flight (another tab).
      const pending = await api.rereads.pending();
      if (runMode === "change" && pending.length > 0) {
        setStage("summary");
        void information.refetch();
        return;
      }
      if (runMode === "change") {
        // 0.4: the connection is read again immediately before the save.
        const fresh = await refresh();
        if (!sameConnection(fresh.connection, shown)) {
          step({ kind: "changedSince" });
          return;
        }
      }
      const result = await write();
      if (result.kind === "changedSince") {
        step({ kind: "changedSince" });
        return;
      }
      if (runMode === "change") {
        updateFlow({ remembered: result.remembered });
      } else {
        updateFlow({ remembered: null });
      }
      step({ kind: "saved" });
      applyStep(runMode, applyModules);
    } catch (error) {
      setServerMessage(isRpcError(error) ? error.message : null);
      step({ kind: "saveFailed" });
    } finally {
      endAction(change.object);
      forgetPassword();
    }
  };

  const start = () => {
    if (!confirmationMatches(change.confirmation, typed)) {
      return;
    }
    setSummaryConnection(connection);
    void runWrite("change", change.write, modules, connection);
  };

  /** R7: undo this change (safe: R1 held), then the forced apply of the modules that were deployed. */
  const undoChange = async () => {
    setBusyAction("undo");
    try {
      const id = taskRegistry.start(t("pending.undoTask"), api.revert());
      const task = await whenSettled(id);
      if (task?.state !== "done") {
        return;
      }
      updateFlow({ remembered: null });
      setMode("undo");
      applyStep("undo", modules);
    } finally {
      setBusyAction(null);
    }
  };

  // ---- Put back (1.7) -------------------------------------------------------------------------------

  const [putBackReason, setPutBackReason] = useState<PutBack | null>(null);

  const putBack = async () => {
    const memory = networkSession.getState().flow?.remembered ?? null;
    const pending = await api.rereads.pending().catch(() => null);
    const availability = putBackAvailability({
      remembered: memory,
      outcome: null,
      pending: pending ?? [],
      current: memory === null ? null : await currentState(api, memory),
    });
    if (!availability.available || memory === null || pending === null) {
      setPutBackOpen(false);
      setPutBackReason(
        availability.available
          ? { available: false, code: "netChange.putBackChanged" }
          : availability,
      );
      forgetPassword();
      return;
    }
    const target = putBackWrite(memory);
    let write: Write;
    switch (target.method) {
      case "setGeneralSettings":
        write = async () => {
          await api.setGeneralSettings(target.request);
          return { kind: "saved", remembered: null };
        };
        break;
      case "deleteInterface":
        write = async () => {
          await api.deleteInterface(
            {
              uuid: target.request.uuid,
              devicename:
                memory.kind === "ifaceAdded" ? memory.after.devicename : "",
            },
            change.impact,
          );
          return { kind: "saved", remembered: null };
        };
        break;
      case "setRules":
        if (!target.write.ok) {
          setPutBackReason({
            available: false,
            code: "netChange.putBackChanged",
          });
          setPutBackOpen(false);
          return;
        }
        {
          const rules = target.write;
          write = async () => {
            await api.setRules(rules);
            return { kind: "saved", remembered: null };
          };
        }
        break;
      case "setIface": {
        const stored = target.stored;
        if (stored.type === "wifi") {
          const before =
            memory.kind === "ifaceChanged" || memory.kind === "ifaceRemoved"
              ? memory.before
              : null;
          const request =
            before === null
              ? null
              : wifiPutBackRequest(
                  before,
                  memory.kind === "ifaceRemoved"
                    ? NEW_OBJECT_UUID
                    : before.uuid,
                  passwordRef.current,
                );
          if (request === null) {
            setPutBackReason({
              available: false,
              code: "netChange.putBackChanged",
            });
            setPutBackOpen(false);
            forgetPassword();
            return;
          }
          write = async () => {
            await api.setIface({ type: "wifi", request }, change.impact);
            return { kind: "saved", remembered: null };
          };
        } else {
          write = async () => {
            await api.setIface(stored, change.impact);
            return { kind: "saved", remembered: null };
          };
        }
        break;
      }
    }
    setPutBackOpen(false);
    void runWrite("putBack", write, target.modules, summaryConnection);
  };

  // ---- Rendering ------------------------------------------------------------------------------------

  const pending =
    information.data === undefined
      ? undefined
      : pendingModules(information.data.dirtyModules);

  if (stage === "summary") {
    if (pending === undefined) {
      return information.isError ? (
        <div className="flex flex-col items-start gap-3">
          <InlineAlert tone="critical">{information.error.message}</InlineAlert>
          <Button variant="neutral" onClick={onBack}>
            {t("netChange.back")}
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground">
          {t("app.loading")}
        </p>
      );
    }
    if (connection.kind === "loading") {
      return (
        <p role="status" className="text-muted-foreground">
          {t("network.connection.loading")}
        </p>
      );
    }
    if (pending.length > 0) {
      return (
        <div className="flex flex-col items-start gap-3">
          <FlowPreflight
            modules={pending}
            title={t("pending.label")}
            applyLabel={t("netChange.applyOthers")}
            undoLabel={t("netChange.undoOthers")}
          >
            <p>
              <Trans
                i18nKey="netChange.preflight"
                components={{ list: <ModuleNames ids={pending} /> }}
              />
            </p>
          </FlowPreflight>
          <Button variant="neutral" onClick={onBack}>
            {t("netChange.back")}
          </Button>
        </div>
      );
    }
    return (
      <Summary
        change={change}
        connection={connection}
        location={location}
        objectNode={objectNode}
        typed={typed}
        onTyped={setTyped}
        hintId={hintId}
        cancelRef={cancelRef}
        recovery={recoveryCard({
          variant: null,
          change: recoveryChangeOf(change.object),
          impact: change.impact,
          certainty: certainty(connection),
          location,
          hostname: change.hostname,
          newName: change.newName,
          addressBefore:
            connection.kind === "known" || connection.kind === "unmanaged"
              ? connection.address
              : null,
          copied,
        })}
        onCopied={() => updateFlow({ copied: true })}
        onBack={onBack}
        onCancel={onCancel}
        onConfirm={start}
      />
    );
  }

  // The run's steps: save from the run state; apply and reach from the watch (1.5).
  const watchState = watch.state;
  const outcome = watchState?.phase === "done" ? watchState.outcome : null;
  const applyStatus: TaskStatus =
    run.steps.apply !== "running"
      ? taskStatus(run.steps.apply)
      : outcome?.kind === "applyFailed"
        ? "failed"
        : outcome !== null || watchState?.phase === "waiting"
          ? "succeeded"
          : "running";
  const reachStatus: TaskStatus =
    watchState === null || outcome?.kind === "applyFailed"
      ? "waiting"
      : watchState.phase === "waiting" ||
          (outcome !== null &&
            outcome.kind !== "recovery" &&
            outcome.kind !== "moved" &&
            after === null)
        ? "running"
        : outcome?.kind === "recovery"
          ? "failed"
          : outcome !== null
            ? "succeeded"
            : "waiting";
  const statusLabels = Object.fromEntries(
    STATES.map((s) => [s, t(`addStorage.state.${s}`)]),
  ) as Record<TaskStatus, string>;
  const steps: JobStep[] = [
    {
      id: "save",
      label: t("netChange.step.save"),
      status: taskStatus(run.steps.save),
      detail: run.steps.save === "running" ? t("netChange.saving") : undefined,
    },
    {
      id: "apply",
      label: t("netChange.step.apply"),
      status: applyStatus,
      detail:
        applyTask === null ? undefined : (
          <>
            {applyStatus === "running" ? (
              <p>{t("netChange.applying")}</p>
            ) : null}
            <StepTask
              taskId={applyTask}
              label={t("netChange.step.apply")}
              failed={applyStatus === "failed"}
            />
          </>
        ),
    },
    { id: "reach", label: t("netChange.step.reach"), status: reachStatus },
  ];

  const recoveryFor = (variant: "lost" | "unknownAddress" | "newFails") =>
    recoveryCard({
      variant,
      change: recoveryChangeOf(change.object),
      impact:
        mode === "change" ? change.impact : { class: "brief", findings: [] },
      certainty: certainty(summaryConnection),
      location,
      hostname: change.hostname,
      newName: change.newName,
      addressBefore:
        summaryConnection.kind === "known" ||
        summaryConnection.kind === "unmanaged"
          ? summaryConnection.address
          : null,
      copied,
    });
  const tryAgain = async () => {
    if (await watch.tryAgain()) {
      void onWatchDone({ kind: "connectedAgain" }, mode);
    }
  };

  // The watch, kept in one place while its state changes (its live regions announce each change).
  let watchProps: ReconnectWatchProps | null = null;
  let below: ReactNode = null;
  if (watchState?.phase === "waiting") {
    watchProps = {
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
  } else if (outcome !== null) {
    switch (outcome.kind) {
      case "connectedAgain":
      case "keptAddress":
      case "stillOld":
        if (after !== null) {
          watchProps = {
            state: "connected",
            message: (
              <ReachedMessage
                outcome={outcome}
                connection={after.connection}
                host={location.hostname}
              />
            ),
          };
        }
        break;
      case "moved": {
        const url = pageUrl(location, outcome.new);
        watchProps = {
          state: "moved",
          url,
          message: (u: ReactElement) => (
            <Trans i18nKey="netChange.moved" components={{ new: u }} />
          ),
          copy: {
            label: t("netChange.copyNewAddress"),
            copiedLabel: t("common.copied"),
            selectedLabel: t("common.copySelected"),
          },
          // The new address or name was typed in this session: it may be a link (P7).
          link: {
            href: url,
            label: t("netChange.openNew"),
            newTabLabel: t("app.newTab"),
          },
          note: t("netChange.signInThere"),
          children: (
            <NetworkRecoveryCard
              variant="newFails"
              steps={recoveryFor("newFails").steps}
              onTryAgain={() => void tryAgain()}
              trying={watch.trying}
              allowLinks
              announce={false}
              headingLevel={3}
            />
          ),
        };
        break;
      }
      case "recovery":
        below = (
          <NetworkRecoveryCard
            variant={outcome.variant}
            steps={recoveryFor(outcome.variant).steps}
            onTryAgain={() => void tryAgain()}
            trying={watch.trying}
            allowLinks
            headingLevel={3}
          />
        );
        break;
      case "signInAgain":
        watchProps = {
          state: "signIn",
          message: t("netChange.signInAgain"),
          signInLabel: t("netChange.signIn"),
          onSignIn: () => void navigate({ to: "/sign-in" }),
        };
        break;
      case "applyFailed":
        break;
    }
  }

  const applyFailed =
    outcome?.kind === "applyFailed" ||
    (outcome?.kind === "stillOld" && after?.stillPending === true);
  const reachedOk =
    after !== null &&
    (outcome?.kind === "connectedAgain" ||
      outcome?.kind === "keptAddress" ||
      (outcome?.kind === "stillOld" && !after.stillPending));
  const ifaceWord: ReactNode =
    change.object.kind === "iface" ? (
      objectNode
    ) : connection.kind === "known" ||
      connection.kind === "probable" ||
      connection.kind === "unmanaged" ? (
      <Value value={connection.iface} />
    ) : (
      <Value value={location.hostname} />
    );
  const putBackState = putBackReason ?? after?.putBack ?? null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${hintId}-run`}>
      <h2 id={`${hintId}-run`} className="text-lg font-semibold">
        <Trans
          i18nKey="netChange.title"
          components={{ object: <NodeSlot value={objectNode} /> }}
        />
      </h2>
      <JobStepList
        steps={steps}
        statusLabels={statusLabels}
        label={t("netChange.stepsLabel")}
      />
      {run.failure?.code === "netChange.changedSince" ? (
        <div className="flex flex-col items-start gap-2" role="alert">
          <p>
            <Trans
              i18nKey="netChange.changedSince"
              components={{ object: <NodeSlot value={objectNode} /> }}
            />
          </p>
          <Button variant="neutral" onClick={onBack}>
            {t("netChange.back")}
          </Button>
        </div>
      ) : null}
      {run.failure?.code === "server" ? (
        <JobFailure
          title={t("netChange.saveFailed")}
          message={t("netChange.saveFailedBody")}
          serverMessage={
            serverMessage === null
              ? undefined
              : { label: t("app.serverMessage"), text: serverMessage }
          }
          retryLabel={t("netChange.back")}
          onRetry={onBack}
        />
      ) : null}
      <div className="flex flex-col gap-3">
        {watchProps === null ? null : <ReconnectWatch {...watchProps} />}
        {below}
      </div>
      {applyFailed ? (
        <JobFailure
          title={t("netChange.applyFailed")}
          message={t("netChange.applyFailedBody")}
          retryLabel={t("netChange.tryApplyAgain")}
          onRetry={() => {
            setBusyAction("retry");
            applyStep(mode, modules);
            setBusyAction(null);
          }}
          undo={
            mode === "change"
              ? { label: t("netChange.undo"), onUndo: () => void undoChange() }
              : undefined
          }
          busy={busyAction ?? undefined}
        />
      ) : null}
      {reachedOk ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="flex flex-col items-start gap-3 outline-hidden"
        >
          {mode === "change" ? (
            <>
              <p>
                <Trans
                  i18nKey="netChange.checkTitle"
                  components={{ iface: <NodeSlot value={ifaceWord} /> }}
                />
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    closeFlow();
                    onDone();
                  }}
                >
                  {t("netChange.keep")}
                </Button>
                <Button
                  variant="neutral"
                  disabled={putBackState?.available !== true}
                  focusableWhenDisabled
                  onClick={() =>
                    putBackState?.available === true && setPutBackOpen(true)
                  }
                >
                  {t("netChange.putBack")}
                </Button>
              </div>
              {putBackState !== null && !putBackState.available ? (
                <p className="text-muted-foreground">
                  {putBackState.code === "netChange.preflight" ? (
                    <Trans
                      i18nKey="netChange.preflight"
                      components={{
                        list: <ModuleNames ids={putBackState.modules ?? []} />,
                      }}
                    />
                  ) : (
                    <Trans
                      i18nKey={putBackState.code}
                      components={{ object: <NodeSlot value={objectNode} /> }}
                    />
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <>
              {mode === "undo" ? <p>{t("netChange.undone")}</p> : null}
              <Button
                onClick={() => {
                  closeFlow();
                  onDone();
                }}
              >
                {t("netApply.dismiss")}
              </Button>
            </>
          )}
        </div>
      ) : null}
      <ConfirmDialog
        open={putBackOpen}
        onOpenChange={(open) => {
          setPutBackOpen(open);
          if (!open) {
            forgetPassword();
          }
        }}
        title={
          <Trans
            i18nKey="netChange.putBackTitle"
            components={{ object: <NodeSlot value={objectNode} /> }}
          />
        }
        description={t("netChange.putBackBody")}
        confirmLabel={t("netChange.putBackConfirm")}
        cancelLabel={t("netChange.cancel")}
        confirmDisabled={change.wifi === true && !passwordTyped}
        onConfirm={() => void putBack()}
      >
        {change.wifi === true ? (
          <SecretField
            key={passwordKey}
            label={t("netChange.wifiPassword")}
            hint={t("netChange.wifiPasswordHint")}
            revealLabel={t("password.show")}
            autoComplete="off"
            required
            onChange={(e) => {
              passwordRef.current = e.currentTarget.value;
              setPasswordTyped(e.currentTarget.value !== "");
            }}
          />
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

/** What the NAS answered after the apply, with the connection read again (1.5). */
function ReachedMessage({
  outcome,
  connection,
  host,
}: {
  outcome: WatchOutcome;
  connection: Connection | null;
  host: string;
}) {
  const { t } = useTranslation();
  if (outcome.kind === "stillOld") {
    return (
      <Trans
        i18nKey="netChange.stillOld"
        components={{ old: <Value value={outcome.old} /> }}
      />
    );
  }
  if (outcome.kind === "keptAddress") {
    const address =
      connection?.kind === "known" || connection?.kind === "unmanaged"
        ? connection.address
        : host;
    return (
      <Trans
        i18nKey="netChange.keptAddress"
        components={{ address: <Value value={address} /> }}
      />
    );
  }
  if (connection?.kind === "known" || connection?.kind === "unmanaged") {
    return (
      <Trans
        i18nKey="netChange.connectedAgain"
        components={{
          address: <Value value={connection.address} />,
          iface: <Value value={connection.iface} />,
        }}
      />
    );
  }
  return <>{t("netChange.reached")}</>;
}

/** Step 2, the summary (1.4). */
function Summary({
  change,
  connection,
  location,
  objectNode,
  typed,
  onTyped,
  hintId,
  cancelRef,
  recovery,
  onCopied,
  onBack,
  onCancel,
  onConfirm,
}: {
  change: NetworkChange;
  connection: Connection;
  location: ReturnType<typeof useConnection>["location"];
  objectNode: ReactNode;
  typed: string;
  onTyped: (value: string) => void;
  hintId: string;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  recovery: ReturnType<typeof recoveryCard>;
  onCopied: () => void;
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const matches = confirmationMatches(change.confirmation, typed);
  // Cancel has focus when the summary opens (1.4 item 7, style guide 5.4).
  useEffect(() => {
    cancelRef.current?.focus();
  }, [cancelRef]);
  const others = change.others ?? [];
  return (
    <section className="flex flex-col gap-4" aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="text-lg font-semibold [overflow-wrap:anywhere]"
      >
        <Trans
          i18nKey="netChange.title"
          components={{ object: <NodeSlot value={objectNode} /> }}
        />
      </h2>
      <NetworkConnectionLine connection={connection} />
      <NowAfterTable
        rows={change.rows}
        labels={{
          name: t("netChange.tableName"),
          setting: t("netChange.setting"),
          now: t("netChange.now"),
          after: t("netChange.after"),
          unchanged: t("netChange.unchanged"),
        }}
      />
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">
          {t("netChange.effectTitle")}
        </h3>
        <NetworkImpactLine
          impact={change.impact}
          location={location}
          live={false}
        />
      </div>
      {others.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold">
            {t("netChange.othersTitle")}
          </h3>
          <ul className="list-disc ps-5">
            {others.map((line) => (
              <li key={line.id}>{line.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle level={3}>{t("netChange.beforeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col items-start gap-1.5">
            <p>{t("netChange.copyNote")}</p>
            <CopyButton
              text={change.note}
              label={t("netChange.copy")}
              copiedLabel={t("netChange.copied")}
              selectedLabel={t("common.copySelected")}
              size="sm"
              onCopy={onCopied}
            />
          </div>
          <Disclosure>
            <DisclosureTrigger>{t("netChange.recoveryOpen")}</DisclosureTrigger>
            <DisclosurePanel>
              <NetworkRecoveryCard
                variant={null}
                steps={recovery.steps}
                onTryAgain={() => undefined}
                allowLinks
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
          confirmText={change.confirmation.value}
          prompt={t(change.confirmation.code, {
            value: change.confirmation.value,
          })}
          value={typed}
          onValueChange={onTyped}
        />
        <p id={hintId} className="text-sm text-muted-foreground">
          {t("netChange.typeHint")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" onClick={onBack}>
          {t("netChange.back")}
        </Button>
        <Button ref={cancelRef} variant="neutral" onClick={onCancel}>
          {t("netChange.cancel")}
        </Button>
        <Button
          variant="destructive"
          disabled={!matches}
          focusableWhenDisabled
          aria-describedby={matches ? undefined : hintId}
          onClick={() => matches && onConfirm()}
        >
          {t("netChange.confirm")}
        </Button>
      </div>
    </section>
  );
}
