// SPDX-License-Identifier: GPL-3.0-or-later
// The reconnect watch after a network apply (phase 5 network design 1.5), for the change flow and the
// band: it follows the apply task through the task registry, and when a read fails with no reply (the
// transport's `network` kind) it does not call that a failure but waits, sending one small background
// read every 2 seconds (System.getInformation, `updatelastaccess: false`, UI-14), and says what it saw
// through network/changeFlow.ts's watchStep. No write is ever retried (UI-14).
//
// The task registry stops following a task at its first failed read, so the apply's handle cannot be
// followed again once the NAS answers (section 22 #4's other case): the watch then reads the pending
// state instead, as the design says for that case. While the apply's modules stay pending the apply
// is taken to be still running, for up to a minute; then its failure plan is shown.
//
// A 401 ends the session for the whole interface: the transport and the application handle it once
// (the sign-in page, with the route kept in memory), so the watch only records it. The watch stops when
// the component that started it goes (leaving the page stops the checks; the apply goes on, N7).
import { taskRegistry } from "@omv-webui/react-api-omv/tasks";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  elapsedSeconds,
  POLL_SECONDS,
  watchStart,
  watchStep,
  type Expectation,
  type WatchEvent,
  type WatchState,
} from "../network/changeFlow.ts";
import { pendingModules } from "../pending/modules.ts";
import { useNetworkRereads } from "./useNetworkReads.ts";
import { useNow } from "./useNow.ts";

/** How long the apply's modules may stay pending once the NAS answers again. */
export const STILL_APPLYING_MS = 60_000;

export interface WatchRequest {
  expectation: Expectation;
  /** The apply task's id in the task registry (never its handle, UI-5). */
  taskId: number;
  /** The modules the apply deploys. */
  modules: readonly string[];
  /** Called once with the watch's last state when it ends (the outcome is in it). */
  onDone?: (state: Extract<WatchState, { phase: "done" }>) => void;
}

interface Controller {
  dispose(): void;
  stop(): void;
}

export function useReconnectWatch() {
  const rereads = useNetworkRereads();
  const [state, setState] = useState<WatchState | null>(null);
  const [trying, setTrying] = useState(false);
  const controllerRef = useRef<Controller | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    [],
  );

  const start = useCallback(
    ({ expectation, taskId, modules, onDone }: WatchRequest) => {
      controllerRef.current?.dispose();
      let current = watchStart(expectation);
      let disposed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let answeredAt: number | null = null;
      setState(current);

      const dispose = () => {
        disposed = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        unsubscribe();
      };
      const dispatch = (event: WatchEvent) => {
        if (disposed) {
          return;
        }
        current = watchStep(current, event);
        setState(current);
        if (current.phase === "done") {
          dispose();
          onDone?.(current);
        }
      };
      const followingTask = () =>
        current.phase === "applying" && !current.reconnected;

      const poll = async () => {
        timer = undefined;
        if (disposed) {
          return;
        }
        dispatch({ kind: "tick", at: Date.now() });
        if (disposed) {
          return;
        }
        try {
          const info = await rereads.backgroundInformation();
          if (disposed) {
            return;
          }
          const at = Date.now();
          if (current.phase === "waiting") {
            dispatch({ kind: "answered", at });
          }
          if (current.phase === "applying" && current.reconnected) {
            answeredAt ??= at;
            const stillPending = pendingModules(info.dirtyModules).some((m) =>
              modules.includes(m),
            );
            if (!stillPending) {
              dispatch({ kind: "applyFinished", at });
            } else if (at - answeredAt >= STILL_APPLYING_MS) {
              dispatch({ kind: "applyFailed", at });
            }
          }
        } catch (error) {
          if (disposed) {
            return;
          }
          if (isRpcError(error) && error.kind === "session") {
            dispatch({ kind: "unauthorized", at: Date.now() });
          } else if (
            isRpcError(error) &&
            error.kind !== "network" &&
            current.phase === "waiting"
          ) {
            // The NAS answered, with an error of its own: it is reachable again.
            dispatch({ kind: "answered", at: Date.now() });
          }
        }
        schedule();
      };
      const schedule = () => {
        if (!disposed && timer === undefined) {
          timer = setTimeout(() => void poll(), POLL_SECONDS * 1000);
        }
      };

      const onTask = () => {
        if (disposed || !followingTask()) {
          return;
        }
        const task = taskRegistry.get(taskId);
        if (task === undefined || task.state === "running") {
          return;
        }
        const at = Date.now();
        if (task.state === "done") {
          dispatch({ kind: "applyFinished", at });
        } else if (task.state === "failed" && task.error?.kind === "network") {
          dispatch({ kind: "lost", at });
          schedule();
        } else if (task.state === "failed" && task.error?.kind === "session") {
          dispatch({ kind: "unauthorized", at });
        } else {
          dispatch({ kind: "applyFailed", at });
        }
      };
      const unsubscribe = taskRegistry.subscribe(onTask);
      controllerRef.current = {
        dispose,
        stop: () => dispatch({ kind: "stop", at: Date.now() }),
      };
      onTask();
    },
    [rereads],
  );

  /** "Stop waiting": the recovery card at once. The apply goes on (N7). */
  const stop = useCallback(() => controllerRef.current?.stop(), []);

  /** Forget the watch (the flow or the band was dismissed). */
  const reset = useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setState(null);
  }, []);

  /**
   * The recovery card's "Try again" (1.6 step 1): one read, no write. Resolves true when the NAS
   * answered, false when it still does not. A 401 ends the session for the whole interface.
   */
  const tryAgain = useCallback(async (): Promise<boolean> => {
    setTrying(true);
    try {
      await rereads.information();
      return true;
    } catch (error) {
      return isRpcError(error) && error.kind !== "network";
    } finally {
      setTrying(false);
    }
  }, [rereads]);

  const now = useNow(state?.phase === "waiting" ? 1000 : null);
  const elapsed = state === null ? 0 : elapsedSeconds(state, now);
  return { state, elapsed, start, stop, reset, tryAgain, trying };
}
