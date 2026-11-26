// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's icons that act out their action (rethink 7.7): on the button's own hover or focus after
// an 80ms intent delay, once per hover-enter; on press; and on success. The library's icon set draws
// the ones it has (create, undo, restart, apply, check health, share, mount, wipe, a status badge);
// Give access and Refresh are lucide stand-ins that move as a whole. Delete and Wipe do nothing on
// hover. Development only (UI-11).
import type { IconName } from "@omv-webui/react-ui-components";
import { Button, Crossfade, Icon } from "@omv-webui/react-ui-components";
import { KeyRound, LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "../../../hooks/useMotionPreference.ts";
import type { StageProps } from "../types.ts";

export type Act =
  | "create"
  | "undo"
  | "refresh"
  | "restart"
  | "apply"
  | "access"
  | "health"
  | "share"
  | "mount"
  | "delete"
  | "wipe";

export interface IconsState {
  /** How many times each one has succeeded or been pressed. */
  done: Partial<Record<Act, number>>;
  badge: "warning" | "ok";
}

const LIBRARY: { act: Act; icon: IconName; words: string }[] = [
  { act: "create", icon: "create", words: "Create" },
  { act: "undo", icon: "undo", words: "Undo" },
  { act: "restart", icon: "restart", words: "Restart" },
  { act: "apply", icon: "apply", words: "Apply" },
  { act: "health", icon: "check-health", words: "Check health" },
  { act: "share", icon: "share", words: "Share" },
  { act: "mount", icon: "mount", words: "Mount" },
];

function RefreshButton({
  presses,
  onPress,
}: {
  presses: number;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(presses);
  const [phase, setPhase] = useState<"rest" | "turning" | "spinner">("rest");
  if (seen !== presses) {
    setSeen(presses);
    setPhase("turning");
  }
  // One turn per refresh; a refresh still running after 300ms hands over to the spinner, and this
  // one finishes at 900ms.
  useEffect(() => {
    if (phase === "rest") {
      return;
    }
    const timer = window.setTimeout(
      () => {
        setPhase(phase === "turning" ? "spinner" : "rest");
      },
      phase === "turning" ? 300 : 600,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);
  return (
    <Button
      variant="neutral"
      size="sm"
      onClick={onPress}
      aria-busy={phase === "spinner" || undefined}
    >
      {phase === "spinner" ? (
        <LoaderCircle
          aria-hidden="true"
          className={reduced ? undefined : "rl-spin"}
        />
      ) : (
        <RotateCw
          key={presses}
          aria-hidden="true"
          className={phase === "turning" && !reduced ? "rl-turn" : undefined}
        />
      )}
      {phase === "spinner" ? "Refreshing…" : "Refresh"}
    </Button>
  );
}

export function IconsStage({ state, update }: StageProps<IconsState>) {
  const press = (act: Act) => {
    update((s) => ({
      ...s,
      done: { ...s.done, [act]: (s.done[act] ?? 0) + 1 },
    }));
  };
  const n = (act: Act) => state.done[act] ?? 0;
  return (
    <div className="rl-icons">
      <div className="rl-iconrow">
        {LIBRARY.map(({ act, icon, words }) => (
          <Button
            key={act}
            variant="neutral"
            size="sm"
            onClick={() => {
              press(act);
            }}
          >
            <Icon
              key={n(act)}
              name={icon}
              size={16}
              state={n(act) > 0 ? "done" : "rest"}
            />
            {words}
          </Button>
        ))}
        <Button
          variant="neutral"
          size="sm"
          className="rl-access"
          onClick={() => {
            press("access");
          }}
        >
          <KeyRound
            key={n("access")}
            aria-hidden="true"
            className={n("access") > 0 ? "rl-key rl-key-done" : "rl-key"}
          />
          Give access
        </Button>
        <RefreshButton
          presses={n("refresh")}
          onPress={() => {
            press("refresh");
          }}
        />
        <Button variant="neutral" size="sm">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
        <Button
          variant="neutral"
          size="sm"
          onClick={() => {
            press("wipe");
          }}
        >
          <Icon
            key={n("wipe")}
            name="wipe"
            size={16}
            motion="none"
            state={n("wipe") > 0 ? "done" : "rest"}
          />
          Wipe
        </Button>
      </div>
      <p className="rl-badge-line">
        <Icon name="disk-hdd" size={24} badge={state.badge} />
        <span>
          Disk sdb:{" "}
          <Crossfade contentKey={state.badge}>
            {state.badge === "ok" ? "OK" : "Warning"}
          </Crossfade>
        </span>
      </p>
    </div>
  );
}
