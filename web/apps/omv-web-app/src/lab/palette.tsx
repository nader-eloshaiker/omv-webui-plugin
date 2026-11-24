// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's command palette and shortcuts: development only (UI-11). The expert's path through the
// same screens a beginner uses: "/" or Ctrl+K (Cmd+K) opens it, typing narrows it, Enter goes.
// "g" then "o", "s" or "f" jumps straight to Overview, Storage or Photos. Nothing here runs a
// change without the page it belongs to: actions open the place where the change is made.
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV } from "./data.ts";
import { useLab } from "./state.ts";
import { cx } from "./util.ts";

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keys?: string;
  run: () => void;
}

export function Palette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const lab = useLab();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = [
      {
        id: "p-o",
        label: "Overview",
        group: "Go to",
        keys: "g o",
        run: () => {
          lab.go("dashboard");
        },
      },
      {
        id: "p-s",
        label: "Disks and file systems",
        group: "Go to",
        hint: "Storage",
        keys: "g s",
        run: () => {
          lab.go("storage");
        },
      },
      {
        id: "p-p",
        label: "Performance",
        group: "Go to",
        hint: "Diagnostics",
        keys: "g p",
        run: () => {
          lab.go("activity");
        },
      },
      {
        id: "p-f",
        label: "Photos",
        group: "Go to",
        hint: "Shared folder",
        keys: "g f",
        run: () => {
          lab.go("folder");
        },
      },
      ...NAV.flatMap((g) =>
        g.items
          .filter((i) => !i.screen)
          .map((i) => ({
            id: `n-${g.id}-${i.id}`,
            label: i.label,
            group: "Go to",
            hint: i.classic ? `${g.label} · classic interface` : g.label,
            run: () => {
              lab.notInLab(i.label);
            },
          })),
      ),
    ];
    const actions: Command[] = [
      ...(lab.pending.length > 0
        ? [
            {
              id: "a-apply",
              label: `Apply ${lab.pending.length} pending ${lab.pending.length === 1 ? "change" : "changes"}`,
              group: "Do",
              hint: lab.pending.join(", "),
              run: lab.apply,
            },
          ]
        : []),
      {
        id: "a-share",
        label: "Share Photos with Linux and Unix",
        group: "Do",
        hint: "Opens Photos, Sharing",
        run: () => {
          lab.go("folder");
        },
      },
      {
        id: "a-check",
        label: "Check the health of disk sdb",
        group: "Do",
        hint: "Opens Storage",
        run: () => {
          lab.go("storage", { disk: "sdb" });
        },
      },
      {
        id: "a-density",
        label:
          lab.density === "compact"
            ? "Show comfortable rows"
            : "Show compact rows",
        group: "View",
        run: () => {
          lab.setDensity(lab.density === "compact" ? "comfortable" : "compact");
        },
      },
    ];
    return [...actions, ...pages];
  }, [lab]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands.slice(0, 9);
    }
    return commands
      .filter((c) =>
        `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const run = (c: Command | undefined) => {
    if (!c) {
      return;
    }
    onClose();
    c.run();
  };

  return (
    <dialog
      ref={ref}
      className="lx-palette"
      aria-label="Go to or do"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className="lx-palette-field">
        <Search size={16} aria-hidden />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="lx-palette-list"
          aria-activedescendant={
            shown[active] ? `lx-cmd-${shown[active].id}` : undefined
          }
          aria-label="Search pages and actions"
          placeholder="Search pages and actions"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(shown.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(shown[active]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="lx-palette-list" role="listbox" className="lx-palette-list">
        {shown.length === 0 ? (
          <li className="lx-palette-empty">
            Nothing matches “{query}”. Try a page name, like “disks”.
          </li>
        ) : null}
        {shown.map((c, i) => (
          <li
            key={c.id}
            id={`lx-cmd-${c.id}`}
            role="option"
            aria-selected={i === active}
            className={cx("lx-palette-item", i === active && "is-active")}
            onPointerMove={() => {
              setActive(i);
            }}
            onClick={() => {
              run(c);
            }}
          >
            <span className="lx-palette-group">{c.group}</span>
            <span className="lx-palette-label">{c.label}</span>
            {c.hint ? <span className="lx-palette-hint">{c.hint}</span> : null}
            {c.keys ? <kbd className="lx-palette-keys">{c.keys}</kbd> : null}
            {i === active ? (
              <CornerDownLeft
                size={14}
                aria-hidden
                className="lx-palette-enter"
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="lx-palette-foot">
        <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to go ·{" "}
        <kbd>g</kbd> then <kbd>o</kbd>, <kbd>s</kbd> or <kbd>f</kbd> from
        anywhere
      </p>
    </dialog>
  );
}
