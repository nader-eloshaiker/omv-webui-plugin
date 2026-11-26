// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's dashboard (rethink 7.6, the map as rows of 6.8): a problem arriving and resolving, the
// live readouts, a disk going to sleep and waking, space changing and a pending change landing on
// its folder. The dashboard lab's fixtures: DiskMgmt.getList (`powermode`, temperature),
// FileSystemMgmt.getList (used, free, the 85 % warning mark), ShareMgmt.getList, System.getInformation
// (processor and memory) and the interface's traffic. Development only (UI-11).
import {
  Button,
  Crossfade,
  flyPendingMark,
  popElement,
  StatusIcon,
  StatusLabel,
  useDrawPath,
  useGlide,
} from "@omv-webui/react-ui-components";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../../../hooks/useMotionPreference.ts";
import type { Nas } from "../../dashboard/model.ts";
import { answerOf, needsYou, withSdbWarning } from "../../dashboard/model.ts";
import { NeedsYou } from "../../dashboard/NeedsYou.tsx";
import { RollingNumber, StageNote } from "../parts.tsx";
import type { StageProps } from "../types.ts";
import { twoRowNas } from "./fixtures.ts";

const noop = () => undefined;

// ─── A map row, small: its disks, its storage, its folders ────────────────────────────────────

function Caddy({ asleep = false }: { asleep?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 44"
      className="rl-caddy"
      aria-hidden="true"
      data-asleep={asleep || undefined}
    >
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="41"
        rx="4"
        className="rl-caddy-body"
      />
      <circle cx="16" cy="25" r="9" className="rl-caddy-part" />
      <circle cx="16" cy="25" r="2" className="rl-caddy-part" />
      <path d="M16 18a7 7 0 0 1 7 7" className="rl-arc" />
    </svg>
  );
}

function Moon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="rl-moon">
      <path d="M8.6 7.8A4 4 0 0 1 4.2 3.4 4 4 0 1 0 8.6 7.8Z" />
    </svg>
  );
}

/** A connector between neighbours on a row; `lit` redraws it in the warning tone. */
function Wire({ lit, delay = 0 }: { lit: boolean; delay?: number }) {
  const draw = useDrawPath(lit, { duration: "--duration-slow", delay });
  return (
    <svg
      className="rl-mapwire"
      viewBox="0 0 40 8"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 4H40" className="rl-mapwire-base" />
      <path d="M0 4H40" className="rl-mapwire-lit" ref={draw} />
    </svg>
  );
}

function MiniRow({
  disks,
  storage,
  folders,
  lit = false,
}: {
  disks: ReactNode;
  storage: ReactNode;
  folders: ReactNode;
  lit?: boolean;
}) {
  return (
    <div className="rl-maprow" data-lit={lit || undefined}>
      <div className="rl-maprow-disks">{disks}</div>
      <Wire lit={lit} />
      <div className="rl-maprow-store">{storage}</div>
      <Wire lit={lit} delay={300} />
      <div className="rl-maprow-folders">{folders}</div>
    </div>
  );
}

function Slot({ device, children }: { device: string; children: ReactNode }) {
  return (
    <span className="rl-slot">
      <Caddy />
      <span className="rl-slot-device">{device}</span>
      <span className="rl-slot-state">{children}</span>
    </span>
  );
}

// ─── A problem arrives, and resolves ──────────────────────────────────────────────────────────

function ProblemStage({
  state,
  showMap,
}: StageProps<{ problem: boolean }> & { showMap: boolean }) {
  const nas: Nas = useMemo(() => {
    const base = twoRowNas();
    return state.problem ? withSdbWarning(base) : base;
  }, [state.problem]);
  const answer = answerOf(nas);
  const needs = needsYou(nas);
  const [initial] = useState(state.problem);
  const lit = state.problem && state.problem !== initial;
  const atRisk = state.problem;
  return (
    <div className="rl-problem">
      <div className="rl-answer-block">
        <Crossfade contentKey={answer.title}>
          <span className="rl-answer-words">
            <span className="rl-answer">{answer.title}</span>
            <span className="rl-muted">{answer.reason}</span>
          </span>
        </Crossfade>
      </div>
      <NeedsYou list={needs} onAct={noop} />
      {showMap ? (
        <MiniRow
          lit={lit}
          disks={
            <>
              <Slot device="sdb">
                <Crossfade contentKey={atRisk ? "w" : "ok"}>
                  {atRisk ? (
                    <StatusLabel status="warning">Warning</StatusLabel>
                  ) : (
                    "35 °C"
                  )}
                </Crossfade>
              </Slot>
              <Slot device="sdc">37 °C</Slot>
            </>
          }
          storage={
            <span className="rl-store">
              <span className="rl-strong">Backup</span>
              <span className="rl-muted">Mirror (RAID 1), 2.1 TiB free</span>
              {atRisk ? (
                <StatusLabel status="warning">At risk</StatusLabel>
              ) : null}
            </span>
          }
          folders={
            <>
              <span className="rl-chip" data-risk={atRisk || undefined}>
                {atRisk ? <StatusIcon status="warning" /> : null}
                Time Machine
              </span>
              <span className="rl-chip" data-risk={atRisk || undefined}>
                {atRisk ? <StatusIcon status="warning" /> : null}
                a4share
              </span>
            </>
          }
        />
      ) : null}
    </div>
  );
}

export function ProblemWithMap(props: StageProps<{ problem: boolean }>) {
  return <ProblemStage {...props} showMap />;
}

export function ProblemList(props: StageProps<{ problem: boolean }>) {
  return <ProblemStage {...props} showMap={false} />;
}

// ─── Live readouts ────────────────────────────────────────────────────────────────────────────

/** Readings in turn: System.getInformation's processor and memory, and enp2s0's traffic. */
const READINGS = [
  { cpu: 12, mem: 41, memUsed: 3.2, rx: 4.2, tx: 0.3 },
  { cpu: 31, mem: 43, memUsed: 3.3, rx: 38.6, tx: 1.2 },
  { cpu: 8, mem: 42, memUsed: 3.2, rx: 0.9, tx: 0.2 },
  { cpu: 17, mem: 44, memUsed: 3.4, rx: 12.4, tx: 0.6 },
];

function Figure({
  value,
  digits,
  unit,
}: {
  value: number;
  digits: number;
  unit: string;
}) {
  const shown = useGlide(value) ?? value;
  return (
    <span className="rl-figure">
      {shown.toFixed(digits)} <span className="rl-muted">{unit}</span>
    </span>
  );
}

export function LiveStage({ state }: StageProps<{ n: number }>) {
  const r = READINGS[state.n % READINGS.length] ?? READINGS[0];
  if (!r) {
    return null;
  }
  return (
    <div className="rl-live-strip">
      <dl className="rl-readouts">
        <div>
          <dt>Processor</dt>
          <dd>
            <Figure value={r.cpu} digits={0} unit="%" />
          </dd>
        </div>
        <div>
          <dt>Memory</dt>
          <dd>
            <Figure value={r.mem} digits={0} unit="%" />
            <span className="rl-muted">
              , {r.memUsed.toFixed(1)} of 7.7 GiB
            </span>
          </dd>
        </div>
        <div>
          <dt>Network in</dt>
          <dd>
            <Figure value={r.rx} digits={1} unit="MiB/s" />
          </dd>
        </div>
        <div>
          <dt>Network out</dt>
          <dd>
            <Figure value={r.tx} digits={1} unit="MiB/s" />
          </dd>
        </div>
      </dl>
      <StageNote>
        On the dashboard this line takes a reading every 2 seconds; here it
        takes one when you ask.
      </StageNote>
    </div>
  );
}

// ─── A disk goes to sleep, and wakes ──────────────────────────────────────────────────────────

export function PowerStage({ state }: StageProps<{ asleep: boolean }>) {
  const [initial] = useState(state.asleep);
  return (
    <div className="rl-power">
      <span
        className="rl-slot rl-slot-big"
        data-power={state.asleep ? "asleep" : "awake"}
        data-changed={state.asleep !== initial || undefined}
      >
        <Caddy asleep={state.asleep} />
        <span className="rl-slot-device">sdb</span>
        <span className="rl-slot-state">
          <Crossfade
            contentKey={state.asleep ? "asleep" : "awake"}
            reduced="cut"
          >
            {state.asleep ? (
              <span className="rl-asleep">
                <Moon />
                Asleep
              </span>
            ) : (
              "35 °C"
            )}
          </Crossfade>
        </span>
      </span>
      <StageNote>
        The disk list says powermode {state.asleep ? "STANDBY" : "ACTIVE"} for
        sdb.
      </StageNote>
    </div>
  );
}

// ─── Space changes ────────────────────────────────────────────────────────────────────────────

const TOTAL_GIB = 3686.4;
const WARN_AT = 0.85;

export function SpaceStage({ state }: StageProps<{ added: boolean }>) {
  const reduced = useReducedMotion();
  const usedGib = state.added ? 3136.6 : 3096.6;
  const used = usedGib / TOTAL_GIB;
  const percent = useGlide(used * 100) ?? used * 100;
  const free = useGlide(TOTAL_GIB - usedGib) ?? TOTAL_GIB - usedGib;
  const full = used >= WARN_AT;
  return (
    <div className="rl-space">
      <p className="rl-space-head">
        <span className="rl-strong">Data drive</span>
        <span className="rl-muted">EXT4</span>
        {full ? (
          <span className={reduced ? undefined : "rl-settle"}>
            <StatusLabel status="warning">Almost full</StatusLabel>
          </span>
        ) : null}
      </p>
      <div
        className="rl-spacebar"
        role="meter"
        aria-label="Data drive used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used * 100)}
        data-full={full || undefined}
      >
        <span
          className="rl-spacebar-fill"
          style={{ "--v": used } as CSSProperties}
        />
        <span
          className="rl-spacebar-mark"
          style={{ "--v": WARN_AT } as CSSProperties}
        />
      </div>
      <p className="rl-muted">
        {Math.round(percent)} % used, {Math.round(free)} GiB free. The warning
        mark is at 85 %.
      </p>
    </div>
  );
}

// ─── Pending in the map ───────────────────────────────────────────────────────────────────────

export function PendingStage({ state, update }: StageProps<{ saves: number }>) {
  const reduced = useReducedMotion();
  const saveRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [saves, setSaves] = useState(state.saves);
  const [marked, setMarked] = useState(state.saves > 0);
  const [count, setCount] = useState(1 + state.saves);
  // The flight on its way, and the count it brings.
  const [flying, setFlying] = useState<{ n: number; count: number } | null>(
    null,
  );
  const [landed, setLanded] = useState(false);
  if (saves !== state.saves) {
    setSaves(state.saves);
    if (reduced) {
      setMarked(true);
      setCount(1 + state.saves);
    } else {
      setFlying({ n: state.saves, count: 1 + state.saves });
    }
  }
  useEffect(() => {
    const from = saveRef.current;
    const to = countRef.current;
    if (flying === null || !from || !to) {
      return;
    }
    let live = true;
    void flyPendingMark(from, to).then(() => {
      if (live) {
        setCount(flying.count);
        setMarked(true);
        setLanded(true);
        popElement(countRef.current);
      }
    });
    return () => {
      live = false;
    };
  }, [flying]);
  return (
    <div className="rl-save">
      <div className="rl-topbar">
        <span className="rl-topbar-host">nas</span>
        <span className="rl-pending" ref={countRef}>
          <span className="rl-pending-mark" aria-hidden="true" />
          <span>
            Changes waiting: <RollingNumber value={count} />
          </span>
        </span>
      </div>
      <MiniRow
        disks={<Slot device="sda">36 °C</Slot>}
        storage={
          <span className="rl-store">
            <span className="rl-strong">Data drive</span>
            <span className="rl-muted">EXT4, 1.4 TiB free</span>
          </span>
        }
        folders={
          <>
            <span className="rl-chip">
              Photos
              {marked ? (
                <span
                  className={
                    landed && !reduced
                      ? "rl-chip-pending rl-pop"
                      : "rl-chip-pending"
                  }
                  role="img"
                  aria-label="has a change waiting"
                />
              ) : null}
            </span>
            <span className="rl-chip">Music</span>
            <span className="rl-chip">Documents</span>
          </>
        }
      />
      <div className="rl-savebar">
        <Button
          ref={saveRef}
          variant="primary"
          size="sm"
          onClick={() => {
            update((s) => ({ saves: s.saves + 1 }));
          }}
        >
          Save
        </Button>
        <span className="rl-muted">
          Photos: shared with Windows and Mac, guests kept out.
        </span>
      </div>
    </div>
  );
}
