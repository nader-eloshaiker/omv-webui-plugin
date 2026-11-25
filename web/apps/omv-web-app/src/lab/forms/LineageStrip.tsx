// SPDX-License-Identifier: GPL-3.0-or-later
// The outcome pictures (rethink spec 3.2, 7.4): the result drawn from the form's answers, in the map's
// language at a reduced size. Development only (UI-11); the library's LineageStrip will take these.
// Each line is two paths: a faint dashed track that is always there, and the drawn stroke
// (pathLength 1, dash offset 1 to 0) that draws along its length when the answer turns it on and
// retracts on the exit curve when it turns off. Reduced motion: lines and nodes crossfade.
// The picture is aria-hidden; the consequence summary says the same facts in words.
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTween } from "../motion.ts";
import type { FormIconName } from "./FormIcon.tsx";
import { FormIcon } from "./FormIcon.tsx";
import type { Access } from "./model.ts";

function Line({
  d,
  on,
  index = 0,
}: {
  d: string;
  on: boolean;
  /** Its place in a fan, for the stagger. */
  index?: number;
}) {
  return (
    <g className="lf-line" data-on={on || undefined}>
      <path className="lf-line-track" d={d} />
      <path
        className="lf-line-draw"
        d={d}
        pathLength={1}
        style={{ "--i": index } as CSSProperties}
      />
    </g>
  );
}

function Node({
  x,
  y,
  w,
  h,
  icon,
  state,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  icon: FormIconName;
  /** "new": dashed until it has a name; "off": dashed and faint; "on": solid. */
  state: "new" | "off" | "on";
  children?: ReactNode;
}) {
  return (
    <g className="lf-node" data-state={state}>
      <rect
        className="lf-node-plate"
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={10}
      />
      <g transform={`translate(${x - 10} ${y - 10})`} className="lf-node-icon">
        <FormIcon name={icon} size={20} />
      </g>
      {children}
    </g>
  );
}

/** Text that is cut to fit a node's label: the picture is a sketch; the words are in the summary. */
function fit(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Runs the one travelling light along `path` when `go` turns true (7.4 "It is live"). */
function useLight(go: boolean) {
  const ref = useRef<SVGPathElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!go || !node) {
      return;
    }
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      node.closest("[data-motion='reduced']") !== null;
    if (reduced) {
      return;
    }
    const glide =
      parseFloat(getComputedStyle(node).getPropertyValue("--duration-glide")) ||
      640;
    const animation = node.animate(
      [
        { strokeDashoffset: 0.14, opacity: 1 },
        { strokeDashoffset: -0.9, opacity: 1, offset: 0.92 },
        { strokeDashoffset: -1, opacity: 0 },
      ],
      { duration: glide * 1.6, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
    return () => {
      animation.cancel();
    };
  }, [go]);
  return ref;
}

// ─── Add a shared folder: drive → folder → ways in → people ──────────────────────────────────

export interface FolderPictureProps {
  drive: { name: string; free: string } | null;
  name: string;
  smb: boolean;
  nfs: boolean;
  /** Who can open it, in the order the avatars show. */
  people: string[];
  guest: boolean;
  /** The run succeeded: the light travels once from the drive to the people. */
  live: boolean;
}

export function FolderPicture({
  drive,
  name,
  smb,
  nfs,
  people,
  guest,
  live,
}: FolderPictureProps) {
  const count = Math.round(useTween(people.length, 640));
  const lightRef = useLight(live);
  // Avatars there when the page opens are simply there; only one added by an answer pops in.
  const [opened] = useState(() => new Set(people));
  const shown = people.slice(0, 3);
  const reached = smb || nfs;
  const lightPath = smb
    ? "M 60 75 H 148 C 172 75 172 42 192 42 H 236 C 250 42 250 75 262 75"
    : "M 60 75 H 148 C 172 75 172 108 192 108 H 236 C 250 108 250 75 262 75";
  return (
    <svg
      viewBox="0 0 340 150"
      className="lf-picture"
      aria-hidden="true"
      data-live={live || undefined}
    >
      <Line d="M 60 75 H 96" on={drive !== null} />
      <Line d="M 148 75 C 172 75 172 42 192 42" on={smb} />
      <Line d="M 148 75 C 172 75 172 108 192 108" on={nfs} />
      <Line d="M 236 42 C 250 42 250 75 262 75" on={smb && people.length > 0} />
      <Line
        d="M 236 108 C 250 108 250 75 262 75"
        on={nfs && people.length > 0}
      />
      {reached ? (
        <path
          ref={lightRef}
          className="lf-light"
          d={lightPath}
          pathLength={1}
        />
      ) : null}

      <Node x={34} y={75} w={52} h={44} icon="file-system" state="on" />
      <text className="lf-pic-label" x={34} y={112}>
        {fit(drive?.name ?? "A drive", 12)}
      </text>
      <text className="lf-pic-fact" x={34} y={126}>
        {drive ? `${drive.free} free` : ""}
      </text>

      <Node
        x={122}
        y={75}
        w={52}
        h={44}
        icon="shared-folder"
        state={name ? "on" : "new"}
      />
      <text
        key={name ? "named" : "unnamed"}
        className="lf-pic-label lf-pic-name"
        data-new={name ? undefined : true}
        x={122}
        y={112}
      >
        {name ? fit(name, 14) : "Its name"}
      </text>

      <Node
        x={214}
        y={42}
        w={44}
        h={34}
        icon="smb"
        state={smb ? "on" : "off"}
      />
      <text className="lf-pic-fact" x={214} y={72}>
        Windows, Mac
      </text>
      <Node
        x={214}
        y={108}
        w={44}
        h={34}
        icon="nfs"
        state={nfs ? "on" : "off"}
      />
      <text className="lf-pic-fact" x={214} y={138}>
        Linux, players
      </text>

      <g className="lf-people" data-guest={guest || undefined}>
        {guest ? (
          <circle className="lf-guest-ring" cx={300} cy={75} r={42} />
        ) : null}
        {shown.length === 0 ? (
          <circle className="lf-avatar-ghost" cx={300} cy={75} r={13} />
        ) : null}
        {shown.map((person, i) => (
          <g
            key={person}
            className="lf-avatar"
            style={{ "--i": i } as CSSProperties}
            transform={`translate(${300 + (i - (shown.length - 1) / 2) * 23} 75)`}
          >
            <g className={opened.has(person) ? undefined : "lf-avatar-pop"}>
              <circle r={13} />
              <text y={3.8}>{person.slice(0, 2)}</text>
            </g>
          </g>
        ))}
        <text className="lf-pic-label" x={300} y={112}>
          {people.length === 0
            ? guest
              ? "Anyone"
              : "Nobody"
            : `${count} ${count === 1 ? "person" : "people"}`}
        </text>
        <text className="lf-pic-fact" x={300} y={126}>
          {guest ? "and guests" : ""}
        </text>
      </g>
    </svg>
  );
}

// ─── Add a person: person → groups → folders ─────────────────────────────────────────────────

export interface PersonPictureProps {
  name: string;
  admin: boolean;
  groups: { name: string; on: boolean; opens: string[] }[];
  folders: { name: string; access: Access; through: string | null }[];
}

const FOLDER_Y = [26, 66, 106, 146];
const LEVEL: Record<Access, string> = {
  rw: "read and change",
  ro: "read only",
  none: "no access",
};

export function PersonPicture({
  name,
  admin,
  groups,
  folders,
}: PersonPictureProps) {
  const groupY = (i: number) =>
    groups.length === 1 ? 86 : 50 + (i * 72) / Math.max(1, groups.length - 1);
  const folderY = (folder: string) => {
    const i = folders.findIndex((f) => f.name === folder);
    return FOLDER_Y[i] ?? 26;
  };
  return (
    <svg viewBox="0 0 360 184" className="lf-picture" aria-hidden="true">
      {groups.map((group, gi) => (
        <Line
          key={`p-${group.name}`}
          d={`M 62 86 C 92 86 92 ${groupY(gi)} 122 ${groupY(gi)}`}
          on={group.on}
        />
      ))}
      {groups.map((group, gi) =>
        group.opens.map((folder, fi) => (
          <Line
            key={`${group.name}-${folder}`}
            d={`M 178 ${groupY(gi)} C 204 ${groupY(gi)} 204 ${folderY(folder)} 230 ${folderY(folder)}`}
            on={group.on}
            index={fi + 1}
          />
        )),
      )}
      {folders.map((folder) =>
        folder.access !== "none" && folder.through === null ? (
          <Line
            key={`own-${folder.name}`}
            d={
              // Given to them alone: round the groups, from the person's top or foot.
              folderY(folder.name) < 86
                ? `M 58 70 C 110 -24 196 ${folderY(folder.name)} 230 ${folderY(folder.name)}`
                : `M 58 102 C 110 196 196 ${folderY(folder.name)} 230 ${folderY(folder.name)}`
            }
            on
          />
        ) : null,
      )}

      <Node
        x={36}
        y={86}
        w={52}
        h={44}
        icon={admin ? "administrator" : "person"}
        state={name ? "on" : "new"}
      />
      <text
        key={name ? "named" : "unnamed"}
        className="lf-pic-label lf-pic-name"
        data-new={name ? undefined : true}
        x={36}
        y={124}
      >
        {name ? fit(name, 12) : "Their name"}
      </text>
      {admin ? (
        <text className="lf-pic-fact" x={36} y={138}>
          administrator
        </text>
      ) : null}

      {groups.map((group, gi) => (
        <g key={group.name}>
          <Node
            x={150}
            y={groupY(gi)}
            w={52}
            h={34}
            icon="group"
            state={group.on ? "on" : "off"}
          />
          <text className="lf-pic-fact" x={150} y={groupY(gi) + 29}>
            {group.name}
          </text>
        </g>
      ))}

      {folders.map((folder) => (
        <g key={folder.name}>
          <Node
            x={246}
            y={folderY(folder.name)}
            w={32}
            h={28}
            icon="shared-folder"
            state={folder.access === "none" ? "off" : "on"}
          />
          <text
            className="lf-pic-label lf-pic-start"
            x={268}
            y={folderY(folder.name) - 2}
          >
            {folder.name}
          </text>
          <text
            key={folder.access}
            className="lf-pic-fact lf-pic-start lf-pic-level"
            data-level={folder.access}
            x={268}
            y={folderY(folder.name) + 11}
          >
            {LEVEL[folder.access]}
          </text>
        </g>
      ))}
    </svg>
  );
}
