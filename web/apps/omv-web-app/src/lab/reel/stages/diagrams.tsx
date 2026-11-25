// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's diagrams (rethink 7.8): tracing on the map, a disk failing in an arrangement, the erase
// and delete pictures, who a Linux share reaches, and the copy direction. The library's Arrangement,
// TypeToConfirmField and CopyDirection where they fit; the dashboard lab's map for the trace.
// Development only (UI-11).
import {
  Arrangement,
  Button,
  CopyDirection,
  TypeToConfirmField,
  typedMatches,
} from "@omv-webui/react-ui-components";
import { Monitor, Server } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef } from "react";
import { drawPath } from "../helpers/drawPath.ts";
import type { StageProps } from "../types.ts";
import { twoRowNas } from "./fixtures.ts";
import { PaneMap } from "./welcome.tsx";

// ─── Trace ────────────────────────────────────────────────────────────────────────────────────

/**
 * Points at the Photos chip of this pane's map the way a pointer does (React reads pointerover and
 * pointerout), so both panes trace at once; the person can point at any chip themselves. What the
 * trace dims is faded on purpose, so it is marked for the check to skip.
 */
export function TraceStage({ state }: StageProps<{ traced: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  const nas = useMemo(twoRowNas, []);
  useEffect(() => {
    const root = ref.current;
    const chip = root?.querySelector('[data-key="f:photos"]');
    if (!root || !chip) {
      return;
    }
    chip.dispatchEvent(
      new PointerEvent(state.traced ? "pointerover" : "pointerout", {
        bubbles: true,
        relatedTarget: root,
      }),
    );
    const mark = () => {
      for (const el of root.querySelectorAll("[data-trace]")) {
        if (el.getAttribute("data-trace") === "dim") {
          el.setAttribute("data-motion-check", "skip");
        } else {
          el.removeAttribute("data-motion-check");
        }
      }
    };
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-trace"],
    });
    return () => {
      observer.disconnect();
    };
  }, [state.traced]);
  return (
    <div ref={ref}>
      <PaneMap nas={nas} assemble="none" />
    </div>
  );
}

// ─── A disk failing in an arrangement ─────────────────────────────────────────────────────────

export function FailingStage({
  state,
  update,
}: StageProps<{ failing: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  // The failed disk is greyed on purpose: the check skips it.
  useEffect(() => {
    for (const el of ref.current?.querySelectorAll(".opacity-35") ?? []) {
      el.setAttribute("data-motion-check", "skip");
    }
  });
  return (
    <div ref={ref}>
      <Arrangement
        question="What happens if a disk fails?"
        showFailingLabel="Show a disk failing"
        hideFailingLabel="Bring the disk back"
        parityLetter="P"
        failing={state.failing}
        onFailingChange={(failing) => {
          update(() => ({ failing }));
        }}
        options={[
          {
            id: "mirror",
            kind: "mirror",
            disks: 2,
            title: "Mirror (RAID 1)",
            usable: "Half the space: 3.6 TiB from two 3.6 TiB disks",
            survives: "Keeps working when one disk fails",
            whenFailing: "Nothing is lost: the other disk has every block.",
          },
          {
            id: "stripe",
            kind: "stripe",
            disks: 2,
            title: "Stripe (RAID 0)",
            usable: "All the space: 7.2 TiB from two 3.6 TiB disks",
            survives: "Stops working when any disk fails",
            whenFailing:
              "Everything is lost: each file had blocks on the failed disk.",
          },
        ]}
      />
    </div>
  );
}

// ─── Erase picture ────────────────────────────────────────────────────────────────────────────

const ERASED = [
  "Partition sdd1",
  "File system Old backups, EXT4",
  "Shared folder Old phones",
  "Shared folder Letters",
];

function matchedPrefix(typed: string, name: string): number {
  const t = typed.trim();
  let i = 0;
  while (i < t.length && i < name.length && t[i] === name[i]) {
    i += 1;
  }
  return i === t.length ? i / name.length : 0;
}

export function EraseStage({ state, update }: StageProps<{ typed: string }>) {
  const name = "sdd";
  const matched = typedMatches(state.typed, name);
  const progress = matched ? 1 : matchedPrefix(state.typed, name);
  return (
    <div
      className="rl-erase"
      style={{ "--p": progress, "--m": matched ? 1 : 0 } as CSSProperties}
    >
      <ul className="rl-erase-list" aria-label="What is erased">
        {ERASED.map((item) => (
          <li key={item}>
            <span>{item}</span>
            <svg
              className="rl-strike"
              viewBox="0 0 100 2"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M0 1H100" pathLength={1} />
            </svg>
          </li>
        ))}
      </ul>
      <TypeToConfirmField
        confirmText={name}
        prompt={`Type ${name} to confirm.`}
        value={state.typed}
        onValueChange={(typed) => {
          update(() => ({ typed }));
        }}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={!matched}
        className="rl-erase-btn"
      >
        Wipe sdd
      </Button>
    </div>
  );
}

// ─── Delete picture ───────────────────────────────────────────────────────────────────────────

const DEPENDENTS = [
  "Windows and Mac share",
  "Copy job: nightly to backup.example.org",
];

function DeletePictureDrawn() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) {
      return;
    }
    svg.querySelectorAll<SVGPathElement>(".rl-del-link").forEach((path, i) => {
      void drawPath(path, { duration: "--duration-base", delay: i * 45 });
    });
    svg.querySelectorAll<SVGPathElement>(".rl-del-cut").forEach((path, i) => {
      void drawPath(path, {
        duration: "--duration-fast",
        delay: 240 + Math.floor(i / 2) * 45,
      });
    });
  }, []);
  const ys = [16, 56];
  return (
    <figure className="rl-del">
      <span className="rl-del-item">Photos</span>
      <svg
        ref={ref}
        viewBox="0 0 80 72"
        className="rl-del-svg"
        aria-hidden="true"
      >
        {ys.map((y) => (
          <g key={y}>
            <path
              d={`M0 36C40 36 40 ${String(y)} 80 ${String(y)}`}
              className="rl-del-link"
            />
            <path
              d={`M36 ${String((36 + y) / 2 - 4)}l8 8`}
              className="rl-del-cut"
            />
            <path
              d={`M44 ${String((36 + y) / 2 - 4)}l-8 8`}
              className="rl-del-cut"
            />
          </g>
        ))}
      </svg>
      <ul className="rl-del-deps">
        {DEPENDENTS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <figcaption className="sr-only">
        Photos and its files are deleted; the Windows and Mac share and the copy
        job that use it stop working.
      </figcaption>
    </figure>
  );
}

export function DeleteStage({ state }: StageProps<{ opened: number }>) {
  if (state.opened === 0) {
    return <p className="rl-muted">The dialog is closed.</p>;
  }
  return (
    <div
      key={state.opened}
      className="rl-dialog"
      role="group"
      aria-label="Delete Photos?"
    >
      <p className="rl-dialog-title">Delete Photos?</p>
      <DeletePictureDrawn />
      <p className="rl-dialog-line">
        Photos and every file in it are deleted. The Windows and Mac share and
        the copy job that use it stop working.
      </p>
    </div>
  );
}

// ─── Who a Linux share reaches ────────────────────────────────────────────────────────────────

export type Reach = "one" | "network" | "any";

const REACH: Record<Reach, { count: number; words: string }> = {
  one: {
    count: 1,
    words: "Only the computer at 192.0.2.15 can reach this share.",
  },
  network: {
    count: 4,
    words: "Every computer on the network 192.0.2.0/24 can reach this share.",
  },
  any: {
    count: 6,
    words: "Any computer that can reach the NAS can reach this share.",
  },
};

export function ReachStage({ state }: StageProps<{ reach: Reach }>) {
  const { count, words } = REACH[state.reach];
  const step = state.reach === "any" ? 40 : 36;
  return (
    <div className="rl-reach-wrap">
      <div className="rl-reach" data-reach={state.reach} aria-hidden="true">
        <span className="rl-reach-nas">
          <Server />
          NAS
        </span>
        <span className="rl-reach-line" />
        <span className="rl-reach-bracket">
          {Array.from({ length: count }, (_, i) => {
            const x = (i - (count - 1) / 2) * step;
            const d = Math.abs(i - (count - 1) / 2);
            return (
              <span
                key={i}
                className="rl-screen"
                style={{ "--x": x, "--d": Math.floor(d) } as CSSProperties}
              >
                <Monitor />
              </span>
            );
          })}
        </span>
      </div>
      <p className="rl-reach-words">{words}</p>
    </div>
  );
}

// ─── Copy direction ───────────────────────────────────────────────────────────────────────────

export function CopyDirStage({ state }: StageProps<{ runs: number }>) {
  return (
    <div className="rl-copydir" data-run={state.runs > 0 || undefined}>
      <CopyDirection
        key={state.runs}
        from="Photos"
        to="backup.example.org"
        sentence="Copies Photos to backup.example.org"
        detail="Every night at 02:00"
      />
    </div>
  );
}
