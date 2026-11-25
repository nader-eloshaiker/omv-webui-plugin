// SPDX-License-Identifier: GPL-3.0-or-later
// The reel's empty states (rethink 7.3): the ghost row handing over to the first folder made, and the
// rows coming back when a search is cleared. The empty picture itself does not assemble: an
// entrance nobody caused (style guide 10, rule 19). Development only (UI-11).
import { Button } from "@omv-webui/react-ui-components";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useReducedMotion } from "../helpers/useReducedMotion.ts";
import type { StageProps } from "../types.ts";

// ─── The ghost hands over ─────────────────────────────────────────────────────────────────────

export function HandOverStage({ state }: StageProps<{ created: boolean }>) {
  const reduced = useReducedMotion();
  const [ghost, setGhost] = useState(!state.created);
  return (
    <div className="rl-mini-table" role="table" aria-label="Shared folders">
      <div className="rl-mini-row rl-mini-head" role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Drive</span>
        <span role="columnheader">Reached by</span>
      </div>
      <div className="rl-stack" role="rowgroup">
        {ghost ? (
          <div
            className="rl-mini-row rl-ghost-row"
            data-leaving={state.created || undefined}
            aria-hidden="true"
            onAnimationEnd={(event) => {
              if (state.created && event.target === event.currentTarget) {
                setGhost(false);
              }
            }}
          >
            <span>
              <span className="rl-example">Example</span> Photos
            </span>
            <span>Data drive</span>
            <span>Windows and Mac</span>
          </div>
        ) : null}
        {state.created ? (
          <div
            className={reduced ? "rl-mini-row rl-fade" : "rl-mini-row rl-rise"}
            role="row"
          >
            <span role="cell" className="rl-strong">
              Photos
            </span>
            <span role="cell">Data drive</span>
            <span role="cell">Windows and Mac</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Filter cleared ───────────────────────────────────────────────────────────────────────────

const FOLDERS = [
  ["Photos", "Data drive"],
  ["Music", "Data drive"],
  ["Documents", "Data drive"],
  ["Time Machine", "Backup"],
  ["a4share", "Backup"],
  ["Archive", "tank"],
  ["Films", "tank"],
  ["Scans", "Data drive"],
  ["Recipes", "Data drive"],
  ["Projects", "Backup"],
  ["Downloads", "Data drive"],
  ["Old phones", "tank"],
] as const;

export function FilterStage({ state, update }: StageProps<{ query: string }>) {
  const q = state.query.trim().toLowerCase();
  const rows = FOLDERS.filter(([name]) => name.toLowerCase().includes(q));
  const [returned, setReturned] = useState(false);
  const [was, setWas] = useState(state.query);
  if (was !== state.query) {
    setWas(state.query);
    setReturned(state.query === "");
  }
  return (
    <div className="rl-filter">
      <label className="rl-search">
        <span className="rl-search-label">Search shared folders</span>
        <input
          type="search"
          value={state.query}
          onChange={(event) => {
            const query = event.target.value;
            update(() => ({ query }));
          }}
        />
      </label>
      {rows.length === 0 ? (
        <div className="rl-filtered-empty">
          <p>No shared folder has “{state.query.trim()}” in its name.</p>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              update(() => ({ query: "" }));
            }}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <ul className="rl-folder-list">
          {rows.map(([name, drive], i) => (
            <li
              key={name}
              className={returned ? "rl-return" : undefined}
              style={{ "--i": i } as CSSProperties}
            >
              <span className="rl-strong">{name}</span>
              <span className="rl-muted">{drive}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
