// SPDX-License-Identifier: GPL-3.0-or-later
// One entry of the motion reel: its name, its causes and Replay, the Full and Reduced panes side by
// side (stacked at 390), the timing in words and the opacity check's status line. A cause changes
// the entry's state, which both panes draw, so the motion runs in both at once; 400ms later both
// panes are walked for anything still faded. Replay puts the panes back where they were before the
// last cause, without motion, and runs it again. Development only (UI-11).
import { Button, StatusIcon } from "@omv-webui/react-ui-components";
import { RotateCcw } from "lucide-react";
import {
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Faded } from "./check.ts";
import { CHECK_AFTER_MS, checkSentence, fadedIn } from "./check.ts";
import { MotionScope } from "./helpers/MotionScope.tsx";
import type { CheckResult } from "./reel.ts";
import { ReelContext } from "./reel.ts";
import type { AnyEntry, Cause } from "./types.ts";

interface State {
  s: unknown;
  /** The state before the last cause, for Replay. */
  prev: unknown;
  last: Cause<unknown> | null;
  /** Bumped to draw the panes afresh, with no motion: a reset or a replay's rewind. */
  mount: number;
  replaying: boolean;
}

type Action =
  | { type: "cause"; cause: Cause<unknown> }
  | { type: "update"; change: (s: unknown) => unknown }
  | { type: "rewind" }
  | { type: "reset"; initial: unknown };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "cause":
      return {
        ...state,
        prev: state.s,
        s: action.cause.apply(state.s),
        last: action.cause,
        replaying: false,
      };
    case "update":
      return { ...state, s: action.change(state.s) };
    case "rewind":
      return {
        ...state,
        s: state.prev,
        mount: state.mount + 1,
        replaying: true,
      };
    case "reset":
      return {
        s: action.initial,
        prev: action.initial,
        last: null,
        mount: state.mount + 1,
        replaying: false,
      };
  }
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
const frame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const NOT_CHECKED = "Press a cause to check it.";

export function Entry({ def }: { def: AnyEntry }) {
  const settings = use(ReelContext);
  const [state, dispatch] = useReducer(reducer, {
    s: def.initial,
    prev: def.initial,
    last: null,
    mount: 0,
    replaying: false,
  });
  const [line, setLine] = useState(NOT_CHECKED);
  const [passed, setPassed] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const reducedRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  // Each commit resolves the causes waiting for it, so a View Transition can wait for the DOM.
  const waitersRef = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const resolve of waiters) {
      resolve();
    }
  });

  const check = (): { passed: boolean; sentence: string } => {
    const failures: { pane: string; faded: Faded[] }[] = [
      {
        pane: "Full",
        faded: fullRef.current ? fadedIn(fullRef.current) : [],
      },
      {
        pane: "Reduced",
        faded: reducedRef.current ? fadedIn(reducedRef.current) : [],
      },
    ];
    const ok = failures.every((f) => f.faded.length === 0);
    const sentence = checkSentence(failures);
    setLine(sentence);
    setPassed(ok);
    return { passed: ok, sentence };
  };

  const run = (cause: Cause<unknown>) => {
    const commit = () =>
      new Promise<void>((resolve) => {
        waitersRef.current.push(resolve);
        dispatch({ type: "cause", cause });
      });
    const root = rootRef.current;
    if (def.wrap && root) {
      def.wrap(commit, root);
    } else {
      void commit();
    }
  };

  const runAndCheck = (cause: Cause<unknown>) => {
    window.clearTimeout(timerRef.current);
    run(cause);
    timerRef.current = window.setTimeout(check, CHECK_AFTER_MS);
  };

  // Replay: the rewind draws the panes as they were, then the cause runs again on the next frame.
  const replay = useEffectEvent(() => {
    if (state.last) {
      runAndCheck(state.last);
    }
  });
  useEffect(() => {
    if (!state.replaying) {
      return;
    }
    const id = requestAnimationFrame(() => {
      replay();
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [state.replaying, state.mount]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  // "Check every motion": from the start, each cause in turn, each checked 400ms after it ran.
  const runAllRef = useRef<() => Promise<CheckResult[]>>(async () => []);
  useEffect(() => {
    runAllRef.current = async () => {
      window.clearTimeout(timerRef.current);
      dispatch({ type: "reset", initial: def.initial });
      await frame();
      await frame();
      const results: CheckResult[] = [];
      for (const cause of def.causes) {
        run(cause);
        await wait(CHECK_AFTER_MS);
        const result = check();
        results.push({
          entry: def.id,
          title: def.title,
          cause: cause.label,
          ...result,
        });
        await wait(80);
      }
      return results;
    };
  });
  const { register } = settings;
  useEffect(() => {
    register(def.id, () => runAllRef.current());
    return () => {
      register(def.id, null);
    };
  }, [register, def.id]);

  const { Stage } = def;
  const update = (change: (s: unknown) => unknown) => {
    dispatch({ type: "update", change });
  };
  const headId = `rl-${def.id}`;

  return (
    <article
      ref={rootRef}
      className="rl-entry"
      id={`entry-${def.id}`}
      data-entry={def.id}
      aria-labelledby={headId}
    >
      <header className="rl-entry-head">
        <h3 id={headId} className="rl-entry-title">
          {def.title}
        </h3>
        <div className="rl-causes" role="group" aria-label="Causes">
          {def.causes.map((cause) => (
            <Button
              key={cause.id}
              variant="neutral"
              size="sm"
              onClick={() => {
                runAndCheck(cause);
              }}
            >
              {cause.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            disabled={state.last === null}
            onClick={() => {
              window.clearTimeout(timerRef.current);
              dispatch({ type: "rewind" });
            }}
          >
            <RotateCcw aria-hidden="true" />
            Replay
          </Button>
        </div>
      </header>
      <div className="rl-panes">
        <section className="rl-pane" aria-label={settings.fullLabel}>
          <p className="rl-pane-label">{settings.fullLabel}</p>
          <MotionScope reduced={settings.fullReduced} className="rl-stage">
            <div ref={fullRef} className="rl-stage-inner" data-pane="full">
              <Stage
                key={state.mount}
                state={state.s}
                update={update}
                pane="full"
              />
            </div>
          </MotionScope>
        </section>
        <section className="rl-pane" aria-label="Reduced">
          <p className="rl-pane-label">Reduced</p>
          <MotionScope reduced className="rl-stage">
            <div
              ref={reducedRef}
              className="rl-stage-inner"
              data-pane="reduced"
            >
              <Stage
                key={state.mount}
                state={state.s}
                update={update}
                pane="reduced"
              />
            </div>
          </MotionScope>
        </section>
      </div>
      <p className="rl-timing">
        {def.timing} Reduced: {def.reducedTiming}
      </p>
      {def.note ? <p className="rl-timing">{def.note}</p> : null}
      <p
        className="rl-check"
        role="status"
        data-passed={passed === null ? undefined : String(passed)}
      >
        <StatusIcon
          status={passed === null ? "unknown" : passed ? "ok" : "warning"}
        />
        <span>{line}</span>
      </p>
    </article>
  );
}
