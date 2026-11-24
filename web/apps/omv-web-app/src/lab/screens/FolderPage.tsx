// SPDX-License-Identifier: GPL-3.0-or-later
// The lab's detail page, the shared folder Photos, in three directions: development only (UI-11).
// A summary header answers what this is, where it lives, who can open it and how it is shared;
// the sections below change those things. Explanations are one click away, never a wall.
import {
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Folder,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { CopyDirection, DeletePicture } from "../art.tsx";
import type { Person } from "../data.ts";
import { PEOPLE, percent, size, STATUS_WORD } from "../data.ts";
import { pulse } from "../motion.ts";
import { useLab } from "../state.ts";
import { Avatar, Mark, Meter, More, Pill, Toggle } from "../ui.tsx";
import { cx, vars } from "../util.ts";
import { Flow } from "./parts.tsx";

type SaveState = "idle" | "saving" | "saved";

/** Save, then a short settle: the label becomes a tick and "Saved", and the button rests again. */
function SaveButton({
  state,
  label,
  onClick,
  disabled,
  buttonRef,
}: {
  state: SaveState;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx("lx-btn lx-btn--primary lx-save", `is-${state}`)}
      onClick={onClick}
      disabled={disabled || state !== "idle"}
      aria-live="polite"
    >
      <span className="lx-save-idle">{label}</span>
      <span className="lx-save-busy" aria-hidden={state !== "saving"}>
        <span className="lx-spinner" aria-hidden="true" />
        Saving…
      </span>
      <span className="lx-save-done" aria-hidden={state !== "saved"}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="lx-tick"
        >
          <path d="M3.5 8.4l3 3 6-6.4" pathLength={1} />
        </svg>
        Saved
      </span>
    </button>
  );
}

function CopyText({ text, what }: { text: string; what: string }) {
  const lab = useLab();
  return (
    <span className="lx-copyable">
      <code className="lx-mono">{text}</code>
      <button
        type="button"
        className="lx-iconbtn lx-iconbtn--sm"
        aria-label={`Copy ${what}`}
        onClick={() => {
          void navigator.clipboard.writeText(text);
          lab.toast(`${what[0]?.toUpperCase() ?? ""}${what.slice(1)} copied.`);
        }}
      >
        <Copy size={13} aria-hidden />
      </button>
    </span>
  );
}

function Sharing() {
  const lab = useLab();
  const [saved, setSaved] = useState({ smb: true, nfs: false, bin: false });
  const [smb, setSmb] = useState(saved.smb);
  const [nfs, setNfs] = useState(saved.nfs);
  const [bin, setBin] = useState(saved.bin);
  const [state, setState] = useState<SaveState>("idle");
  const btn = useRef<HTMLButtonElement>(null);
  const changes: string[] = [];
  if (smb !== saved.smb || bin !== saved.bin) {
    changes.push("Windows and Mac (SMB)");
  }
  if (nfs !== saved.nfs) {
    changes.push("Linux and Unix (NFS)");
  }
  const dirty = changes.length > 0 && state === "idle";
  const ids = { smb: useId(), nfs: useId(), bin: useId() };
  const save = () => {
    setState("saving");
    window.setTimeout(() => {
      setState("saved");
      for (const c of changes) {
        lab.addPending(c, btn.current);
      }
      window.setTimeout(() => {
        setState("idle");
        setSaved({ smb, nfs, bin });
      }, 1500);
    }, 650);
  };
  return (
    <div className="lx-form">
      <div className="lx-row">
        <div className="lx-row-text">
          <p className="lx-row-title">Windows and Mac</p>
          <p className="lx-row-help" id={ids.smb}>
            Photos shows up on Windows and Mac computers on your network.
          </p>
        </div>
        <Toggle
          checked={smb}
          onChange={setSmb}
          label="Share with Windows and Mac"
          describedBy={ids.smb}
        />
      </div>
      <div className={cx("lx-row lx-row--sub", !smb && "is-disabled")}>
        <div className="lx-row-text">
          <p className="lx-row-title">Recycle bin</p>
          <p className="lx-row-help" id={ids.bin}>
            {smb
              ? "Files deleted from a computer go to a recycle bin first, so they can be brought back."
              : "Needs sharing with Windows and Mac."}
          </p>
        </div>
        <Toggle
          checked={bin && smb}
          onChange={(v) => {
            if (smb) {
              setBin(v);
            }
          }}
          label="Recycle bin"
          describedBy={ids.bin}
        />
      </div>
      <div className="lx-row">
        <div className="lx-row-text">
          <p className="lx-row-title">Linux and Unix</p>
          <p className="lx-row-help" id={ids.nfs}>
            Photos can be mounted by Linux computers and media players that use
            NFS.
          </p>
        </div>
        <Toggle
          checked={nfs}
          onChange={setNfs}
          label="Share with Linux and Unix"
          describedBy={ids.nfs}
        />
      </div>
      <More summary="Which should I use?">
        <p>
          Most homes need only <strong>Windows and Mac</strong> (also called
          SMB): it works on Windows, macOS, phones and most TVs. Turn on{" "}
          <strong>Linux and Unix</strong> (NFS) only if a device asks for NFS by
          name.
        </p>
      </More>
      <div
        className={cx("lx-savebar", (dirty || state !== "idle") && "is-open")}
        inert={!dirty && state === "idle"}
      >
        <div className="lx-savebar-clip">
          <div className="lx-savebar-inner">
            <div className="lx-preview">
              <p className="lx-preview-title">When you save and apply</p>
              <ul>
                {smb !== saved.smb ? (
                  <li>
                    {smb
                      ? "Photos appears on Windows and Mac computers as"
                      : "Windows and Mac computers can no longer open"}{" "}
                    <CopyText text="\\nas\Photos" what="the Windows address" />
                  </li>
                ) : null}
                {bin !== saved.bin && smb ? (
                  <li>
                    Files deleted over the network go to a recycle bin in
                    Photos.
                  </li>
                ) : null}
                {nfs !== saved.nfs ? (
                  <li>
                    {nfs
                      ? "Linux computers can mount"
                      : "Linux computers can no longer mount"}{" "}
                    <CopyText
                      text="nas:/export/Photos"
                      what="the NFS address"
                    />
                  </li>
                ) : null}
                <li className="lx-preview-note">
                  Saving does not change anything yet. You apply saved changes
                  from the yellow bar.
                </li>
              </ul>
            </div>
            <div className="lx-savebar-actions">
              <button
                type="button"
                className="lx-btn lx-btn--quiet"
                disabled={state !== "idle"}
                onClick={() => {
                  setSmb(saved.smb);
                  setNfs(saved.nfs);
                  setBin(saved.bin);
                }}
              >
                Discard
              </button>
              <SaveButton
                state={state}
                label="Save sharing"
                onClick={save}
                buttonRef={btn}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ACCESS: { id: Person["access"]; label: string }[] = [
  { id: "rw", label: "Read and write" },
  { id: "ro", label: "Read only" },
  { id: "none", label: "No access" },
];

function Access() {
  const lab = useLab();
  const [rows, setRows] = useState(PEOPLE);
  const [picked, setPicked] = useState<string[]>([]);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = rows.some((r, i) => r.access !== PEOPLE[i]?.access);
  const set = (id: string, access: Person["access"]) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, access } : r)));
  };
  return (
    <div className="lx-form">
      <div className={cx("lx-toolbar", picked.length > 0 && "has-selection")}>
        {picked.length > 0 ? (
          <>
            <span className="lx-toolbar-count lx-num">
              {picked.length} selected
            </span>
            <span className="lx-toolbar-label">Set to</span>
            {ACCESS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="lx-btn lx-btn--secondary"
                onClick={() => {
                  for (const id of picked) {
                    set(id, a.id);
                  }
                  setPicked([]);
                }}
              >
                {a.label}
              </button>
            ))}
          </>
        ) : (
          <span className="lx-toolbar-hint">
            Tick several to change them together.
          </span>
        )}
      </div>
      <ul className="lx-people">
        {rows.map((p, i) => (
          <li
            key={p.id}
            className={cx(
              "lx-person lx-enter",
              picked.includes(p.id) && "is-selected",
            )}
            style={vars({ "--i": i })}
          >
            <input
              type="checkbox"
              aria-label={`Select ${p.name}`}
              checked={picked.includes(p.id)}
              onChange={() => {
                setPicked((s) =>
                  s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id],
                );
              }}
            />
            <Avatar initials={p.initials} group={p.kind === "group"} />
            <span className="lx-person-name">
              <span className="lx-mono">{p.name}</span>
              <span className="lx-person-kind">
                {p.kind === "group" ? "Group" : "Person"}
                {p.via ? ` · also gets Read and write through ${p.via}` : ""}
              </span>
            </span>
            <div
              className="lx-seg"
              role="radiogroup"
              aria-label={`Access for ${p.name}`}
            >
              {ACCESS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={p.access === a.id}
                  className={cx("lx-seg-opt", p.access === a.id && "is-on")}
                  onClick={() => {
                    set(p.id, a.id);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <More summary="What do these mean?">
        <p>
          <strong>Read and write</strong>: open, add, change and delete files.{" "}
          <strong>Read only</strong>: open and copy files, but not change them.{" "}
          <strong>No access</strong>: the folder does not open for them. A
          person gets the most generous of their own setting and their
          groups&apos; settings.
        </p>
      </More>
      <div
        className={cx("lx-savebar", (dirty || state !== "idle") && "is-open")}
        inert={!dirty && state === "idle"}
      >
        <div className="lx-savebar-clip">
          <div className="lx-savebar-inner lx-savebar-inner--row">
            <p className="lx-savebar-text">
              {rows.filter((r, i) => r.access !== PEOPLE[i]?.access).length}{" "}
              unsaved {""}
              {rows.filter((r, i) => r.access !== PEOPLE[i]?.access).length ===
              1
                ? "change"
                : "changes"}
              . Access changes take effect as soon as they are saved.
            </p>
            <div className="lx-savebar-actions">
              <button
                type="button"
                className="lx-btn lx-btn--quiet"
                disabled={state !== "idle"}
                onClick={() => {
                  setRows(PEOPLE);
                }}
              >
                Discard
              </button>
              <SaveButton
                state={state}
                label="Save access"
                onClick={() => {
                  setState("saving");
                  window.setTimeout(() => {
                    setState("saved");
                    lab.toast("Access to Photos saved.");
                    window.setTimeout(() => {
                      setState("idle");
                    }, 1400);
                  }, 600);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Where() {
  const lab = useLab();
  const fs = lab.nas.fileSystems.find((f) => f.id === "pool");
  if (!fs) {
    return null;
  }
  const pct = percent(fs.usedTiB, fs.sizeTiB);
  return (
    <div className="lx-form">
      <ol className="lx-lineage" aria-label="Where Photos is stored">
        {fs.disks.map((d) => (
          <li key={d} className="lx-lineage-node">
            <Mark
              status={
                lab.nas.disks.find((x) => x.id === d)?.status ?? "unknown"
              }
              size={14}
            />
            <span className="lx-mono">{d}</span>
            <span className="lx-lineage-sub">disk</span>
          </li>
        ))}
        <li className="lx-lineage-arrow" aria-hidden="true">
          <ChevronRight size={16} />
        </li>
        <li className="lx-lineage-node">
          <Mark status={fs.status} size={14} />
          <span>{fs.label}</span>
          <span className="lx-lineage-sub">
            {fs.type} · {fs.layout.toLowerCase()}
          </span>
        </li>
        <li className="lx-lineage-arrow" aria-hidden="true">
          <ChevronRight size={16} />
        </li>
        <li className="lx-lineage-node is-self">
          <Folder size={14} aria-hidden />
          <span>Photos</span>
          <span className="lx-lineage-sub">this folder</span>
        </li>
      </ol>
      <div className="lx-capline">
        <span className="lx-num">
          {fs.label}: {size(fs.usedTiB)} of {size(fs.sizeTiB)} used ({pct}%)
        </span>
        {pct >= 85 ? <Pill status="warning">Almost full</Pill> : null}
      </div>
      <Meter
        value={fs.usedTiB}
        max={fs.sizeTiB}
        status={pct >= 85 ? "warning" : "ok"}
        label={`${fs.label} ${pct}% used`}
      />
      <More summary="Technical details">
        <dl className="lx-tech">
          <div>
            <dt>Path on the NAS</dt>
            <dd>
              <CopyText
                text="/srv/dev-disk-by-label-pool/Photos"
                what="the path"
              />
            </dd>
          </div>
          <div>
            <dt>File system</dt>
            <dd>
              <CopyText
                text="/dev/sdc (btrfs raid1 with /dev/sdd)"
                what="the device"
              />
            </dd>
          </div>
          <div>
            <dt>Folder permissions</dt>
            <dd>
              <code className="lx-mono">drwxrwsr-x root:users</code>
            </dd>
          </div>
        </dl>
      </More>
    </div>
  );
}

/** Who can reach Photos and how: stored on, the folder, the ways it is shared, the people. */
function Reach() {
  const lab = useLab();
  const pool = lab.nas.fileSystems.find((f) => f.id === "pool");
  const access = (a: string) =>
    a === "rw" ? "Read and write" : a === "ro" ? "Read only" : "No access";
  return (
    <Flow
      compact
      columns={[
        {
          title: "Stored on",
          nodes: [
            {
              id: "pool",
              label: "pool",
              sub: pool ? `${percent(pool.usedTiB, pool.sizeTiB)}% full` : "",
              status: pool?.status ?? "unknown",
              links: ["photos"],
            },
          ],
        },
        {
          title: "Folder",
          nodes: [
            {
              id: "photos",
              label: "Photos",
              sub: "Family photos",
              status: "ok",
              links: ["smb", "nfs"],
              kind: "folder",
            },
          ],
        },
        {
          title: "Shared over",
          nodes: [
            {
              id: "smb",
              label: "Windows and Mac",
              sub: "On · \\\\nas\\Photos",
              status: "ok",
              links: PEOPLE.filter((p) => p.access !== "none").map((p) => p.id),
              kind: "svc",
            },
            {
              id: "nfs",
              label: "Linux and Unix",
              sub: "Off",
              status: "unknown",
              links: [],
              kind: "svc",
              off: true,
            },
          ],
        },
        {
          title: "People",
          nodes: PEOPLE.map((p) => ({
            id: p.id,
            label: p.name,
            sub: access(p.access),
            status:
              p.access === "none" ? ("unknown" as const) : ("ok" as const),
            links: [],
            off: p.access === "none",
          })),
        },
      ]}
    />
  );
}

function UsedBy() {
  return (
    <ul className="lx-usedby">
      <li>
        <span className="lx-usedby-kind">Shared as</span>
        <span>
          <code className="lx-mono">Photos</code> for Windows and Mac
        </span>
      </li>
      <li>
        <span className="lx-usedby-kind">Copy job</span>
        <CopyDirection
          from="Photos"
          to="Backups"
          when="Every night at 02:00 · last ran today, finished"
        />
      </li>
    </ul>
  );
}

function DeleteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const lab = useLab();
  const ref = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const armed = typed === "Photos";
  const inputId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open && !d.open) {
      setTyped("");
      d.showModal();
      cancel.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="lx-dialog"
      aria-labelledby="lx-del-h"
      onClose={onClose}
    >
      <div className="lx-dialog-icon">
        <Mark status="warning" size={22} />
      </div>
      <DeletePicture />
      <h2 id="lx-del-h" className="lx-dialog-title">
        Delete the shared folder Photos and its files?
      </h2>
      <p className="lx-dialog-text">
        Every file in Photos is deleted from <strong>pool</strong>. This cannot
        be undone.
      </p>
      <ul className="lx-dialog-list">
        <li>Windows and Mac computers lose the share Photos.</li>
        <li>The copy job Photos to Backups stops working.</li>
      </ul>
      <label htmlFor={inputId} className="lx-label">
        Type <strong className="lx-mono">Photos</strong> to confirm
      </label>
      <input
        id={inputId}
        className="lx-input"
        value={typed}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setTyped(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
      />
      <div className="lx-dialog-actions">
        <button
          ref={cancel}
          type="button"
          className="lx-btn lx-btn--secondary"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className={cx("lx-btn lx-btn--danger", armed && "is-armed")}
          disabled={!armed}
          onClick={() => {
            onClose();
            lab.toast("Nothing was deleted: this is a prototype.");
          }}
        >
          <Trash2 size={14} aria-hidden /> Delete Photos and its files
        </button>
      </div>
    </dialog>
  );
}

function Header({ onDelete }: { onDelete: () => void }) {
  const lab = useLab();
  const fs = lab.nas.fileSystems.find((f) => f.id === "pool");
  const pct = fs ? percent(fs.usedTiB, fs.sizeTiB) : 0;
  const people = PEOPLE.filter((p) => p.access !== "none");
  return (
    <header className="lx-detailhead lx-enter">
      <nav className="lx-crumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className="lx-plainlink"
          onClick={() => {
            lab.go("storage");
          }}
        >
          Storage
        </button>
        <ChevronRight size={13} aria-hidden />
        <span>Shared folders</span>
        <ChevronRight size={13} aria-hidden />
        <span aria-current="page">Photos</span>
      </nav>
      <div className="lx-detailhead-main">
        <span className="lx-foldertile" aria-hidden="true">
          <Folder size={26} />
        </span>
        <div className="lx-detailhead-title">
          <h1 className="lx-h1">Photos</h1>
          <p className="lx-pagemeta">Family photos</p>
        </div>
        <button
          type="button"
          className="lx-btn lx-btn--quiet lx-btn--dangerquiet"
          onClick={onDelete}
        >
          <Trash2 size={14} aria-hidden /> Delete…
        </button>
      </div>
      <dl className="lx-summary">
        <div>
          <dt>Shared with</dt>
          <dd>
            <Mark status="ok" size={14} /> Windows and Mac
          </dd>
        </div>
        <div>
          <dt>Stored on</dt>
          <dd>
            {fs ? <Mark status={fs.status} size={14} /> : null} pool · {pct}%
            full
            {fs && fs.status !== "ok" ? (
              <span className="lx-vh"> ({STATUS_WORD[fs.status]})</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Who can open it</dt>
          <dd className="lx-avatars">
            {people.map((p) => (
              <Avatar
                key={p.id}
                initials={p.initials}
                group={p.kind === "group"}
              />
            ))}
            <span>{people.length} people and groups</span>
          </dd>
        </div>
        <div>
          <dt>Copies</dt>
          <dd>Nightly to Backups</dd>
        </div>
      </dl>
      {fs && pct >= 85 ? (
        <div className="lx-callout lx-callout--warning" role="note">
          <Mark status="warning" size={18} />
          <p>
            <strong>pool, where Photos is stored, is {pct}% full.</strong> When
            it is full, nobody can add photos. {size(fs.sizeTiB - fs.usedTiB)}{" "}
            is left.
          </p>
          <button
            type="button"
            className="lx-link"
            onClick={() => {
              lab.go("storage");
            }}
          >
            See what uses pool <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : null}
    </header>
  );
}

const SECTIONS: {
  id: string;
  title: string;
  lead: string;
  body: () => ReactNode;
}[] = [
  {
    id: "sharing",
    title: "Sharing",
    lead: "Which computers can open Photos over the network.",
    body: () => <Sharing />,
  },
  {
    id: "access",
    title: "Who can open it",
    lead: "People and groups, and what they may do.",
    body: () => <Access />,
  },
  {
    id: "where",
    title: "Where it is stored",
    lead: "The disks and file system that hold Photos.",
    body: () => <Where />,
  },
  {
    id: "reach",
    title: "How people reach it",
    lead: "From the disks to the people who can open Photos. Point at anything to trace it.",
    body: () => <Reach />,
  },
  {
    id: "usedby",
    title: "Used by",
    lead: "What stops working if Photos goes away.",
    body: () => <UsedBy />,
  },
];

function Tabs() {
  const [tab, setTab] = useState("sharing");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
      el.style.setProperty("--ind-x", `${active?.offsetLeft ?? 0}px`);
      el.style.setProperty("--ind-w", `${active?.offsetWidth ?? 0}px`);
    };
    measure();
    void document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [tab]);
  const current = SECTIONS.find((s) => s.id === tab) ?? SECTIONS[0];
  return (
    <div
      className="lx-card lx-enter lx-loadable lx-tabcard"
      style={vars({ "--i": 1 })}
    >
      <div className="lx-tablist" role="tablist" aria-label="Photos" ref={list}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`lx-tab-${s.id}`}
            aria-selected={tab === s.id}
            aria-controls="lx-tabpanel"
            tabIndex={tab === s.id ? 0 : -1}
            className="lx-tabbtn"
            onClick={() => {
              setTab(s.id);
            }}
            onKeyDown={(e) => {
              const i = SECTIONS.findIndex((x) => x.id === tab);
              const step =
                e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
              if (step) {
                const next =
                  SECTIONS[(i + step + SECTIONS.length) % SECTIONS.length];
                if (next) {
                  setTab(next.id);
                  document.getElementById(`lx-tab-${next.id}`)?.focus();
                }
              }
            }}
          >
            {s.title}
          </button>
        ))}
        <span className="lx-tabind" aria-hidden="true" />
      </div>
      {current ? (
        <div
          className="lx-tabpanel"
          role="tabpanel"
          id="lx-tabpanel"
          aria-labelledby={`lx-tab-${current.id}`}
          key={current.id}
        >
          <p className="lx-lead">{current.lead}</p>
          {current.body()}
        </div>
      ) : null}
    </div>
  );
}

export function FolderPage() {
  const lab = useLab();
  const [deleting, setDeleting] = useState(false);
  const tile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pulse(tile.current?.querySelector(".lx-foldertile") ?? null);
  }, []);
  const header = (
    <Header
      onDelete={() => {
        setDeleting(true);
      }}
    />
  );
  return (
    <div
      className={cx("lx-page lx-detail", `lx-detail--${lab.dir}`)}
      ref={tile}
    >
      {header}
      {lab.dir === "instrument" ? (
        <Tabs />
      ) : (
        <div className="lx-sections">
          {lab.dir === "sky" ? (
            <nav className="lx-toc" aria-label="On this page">
              <p className="lx-toc-title">On this page</p>
              <ul>
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a href={`#lx-sec-${s.id}`}>{s.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {SECTIONS.map((s, i) => (
            <section
              key={s.id}
              id={`lx-sec-${s.id}`}
              className={cx(
                "lx-section lx-enter lx-loadable",
                lab.dir === "sky" && "lx-card",
              )}
              aria-labelledby={`lx-sec-${s.id}-h`}
              style={vars({ "--i": i + 1 })}
            >
              <div className="lx-section-head">
                {lab.dir === "atlas" ? (
                  <span className="lx-h2-num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <h2 className="lx-h2" id={`lx-sec-${s.id}-h`}>
                  {s.title}
                </h2>
                <p className="lx-lead">{s.lead}</p>
              </div>
              <div className="lx-section-body">{s.body()}</div>
            </section>
          ))}
        </div>
      )}
      <DeleteDialog
        open={deleting}
        onClose={() => {
          setDeleting(false);
        }}
      />
      <span className="lx-vh">
        <Check size={1} />
      </span>
    </div>
  );
}
