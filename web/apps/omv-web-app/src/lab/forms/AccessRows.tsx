// SPDX-License-Identifier: GPL-3.0-or-later
// The people picker (rethink spec 3.11): rows with an avatar or icon, a name, one line saying who is
// in a group or what reaches a folder, and one segmented control each. Development only (UI-11); the
// library's PeoplePicker will replace the AccessGrid's first view with it. Pros press 1, 2 or 3 on a
// focused row to set its level (3.10).
import { SegmentedChoice } from "@omv-webui/react-ui-components";
import type { CSSProperties, KeyboardEvent } from "react";
import { FormIcon } from "./FormIcon.tsx";
import type { Access } from "./model.ts";

export interface AccessRow {
  key: string;
  kind: "person" | "group" | "folder";
  name: string;
  line: string;
  value: Access;
  /** A short tag after the name: "through family". */
  tag?: string;
}

const OPTIONS = [
  { value: "rw" as const, label: "Read and change" },
  { value: "ro" as const, label: "Read only" },
  { value: "none" as const, label: "No access" },
];

const BY_KEY: Record<string, Access> = { "1": "rw", "2": "ro", "3": "none" };

export function AccessRows({
  label,
  rows,
  onChange,
  flagged,
}: {
  label: string;
  rows: AccessRow[];
  onChange: (key: string, value: Access) => void;
  flagged?: boolean;
}) {
  return (
    <ul
      className="lf-rows"
      aria-label={label}
      data-flagged={flagged || undefined}
    >
      {rows.map((row, i) => (
        <li
          key={row.key}
          className="lf-row"
          data-level={row.value}
          onKeyDown={(event: KeyboardEvent) => {
            const level = BY_KEY[event.key];
            if (level && !event.ctrlKey && !event.metaKey && !event.altKey) {
              event.preventDefault();
              onChange(row.key, level);
            }
          }}
          style={{ "--i": i } as CSSProperties}
        >
          {row.kind === "person" ? (
            <span className="lf-row-avatar" aria-hidden="true">
              {row.name.slice(0, 2)}
            </span>
          ) : (
            <span className="lf-row-icon" aria-hidden="true">
              <FormIcon
                name={row.kind === "group" ? "group" : "shared-folder"}
                size={20}
              />
            </span>
          )}
          <span className="lf-row-words">
            <span className="lf-row-name">
              {row.name}
              {row.tag ? <span className="lf-row-tag">{row.tag}</span> : null}
            </span>
            <span className="lf-row-line">{row.line}</span>
          </span>
          <SegmentedChoice
            className="lf-row-choice"
            size="sm"
            aria-label={`Access for ${row.name}`}
            options={OPTIONS}
            value={row.value}
            onValueChange={(value) => {
              onChange(row.key, value);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
