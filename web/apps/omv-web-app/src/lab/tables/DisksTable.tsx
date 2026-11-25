// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: the disks table, redesigned (rethink spec 4.9 "Disks", 8 row 5). Development only
// (UI-11). The drive bay sits above the table and is linked to it both ways: pointing at or focusing
// a slot lights its row, and pointing at or focusing a row lights its slot; selecting a row rings its
// slot. "Check health" runs a simulated check in memory (sleeping disks wake first, each disk's
// health icon traces as it is read, and its slot and row change together); nothing is written to
// the backend (UI-4).
import type { DriveKind, DriveSlot } from "@omv-webui/react-ui-components";
import {
  Button,
  CopyButton,
  DriveBay,
  DriveBaySkeleton,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Icon,
  MenuItem,
  MenuSeparator,
  StatusPill,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableGroupRow,
  TableHead,
  TableHeader,
  TableLastRefreshed,
  TableRow,
  TableSkeletonRows,
  TableStateRow,
  TableToolbar,
} from "@omv-webui/react-ui-components";
import { ArrowRight } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { Tip } from "../forms/parts.tsx";
import { LabCauses } from "./FoldersTable.tsx";
import { reducedMotion, token, useFlip, useRowGrid } from "./grid.ts";
import type { Disk, DiskSortKey, Power, SortDir } from "./model.ts";
import {
  CHECK_RESULT,
  checkable,
  DISKS,
  diskSummary,
  diskTitle,
  groupDisks,
  holdsWords,
  HOT,
  sortDisks,
} from "./model.ts";
import type { SummaryPart } from "./parts.tsx";
import {
  Bytes,
  Identity,
  Missing,
  PageHead,
  Quick,
  RowActions,
  SelectCell,
  SelectionBar,
  StatusCell,
  SummaryProblem,
  TableSummary,
} from "./parts.tsx";
import type { DiskTableState } from "./states.ts";

type Phase = "ready" | "loading" | "error";
type PowerShown = Power | "waking";

const KIND_ICON = {
  hdd: "disk-hdd",
  ssd: "disk-ssd",
  nvme: "disk-nvme",
  usb: "disk-usb",
  optical: "disk-optical",
  disk: "disk",
} as const;

// The bay has no NVMe or optical face yet (a library gap, spec 8 row 5): the nearest faces stand in.
const BAY_FACE: Record<Disk["kind"], DriveKind> = {
  hdd: "hdd",
  ssd: "ssd",
  nvme: "ssd",
  usb: "usb",
  optical: "disk",
  disk: "disk",
};

const HEALTH_WORD = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
} as const;

function checkedDisks(): Disk[] {
  return DISKS.map((d) =>
    checkable(d)
      ? {
          ...d,
          ...CHECK_RESULT[d.id],
          power: d.power === "asleep" ? "awake" : d.power,
        }
      : d,
  );
}

function seed(state: DiskTableState) {
  return {
    disks: state === "checked" ? checkedDisks() : [...DISKS],
    phase: (state === "loading"
      ? "loading"
      : state === "error"
        ? "error"
        : "ready") as Phase,
    selected: new Set<string>(state === "selected" ? ["sdb", "sdd"] : []),
    expanded: new Set<string>(state === "expanded" ? ["sdb"] : []),
    technical: state === "technical",
  };
}

export function DisksTable({
  state,
  tips,
  chrome,
  onNote,
}: {
  state: DiskTableState;
  tips: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const [initial] = useState(() => seed(state));
  const [disks, setDisks] = useState<Disk[]>(initial.disks);
  const [waking, setWaking] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [selected, setSelected] = useState(initial.selected);
  const [expanded, setExpanded] = useState(initial.expanded);
  const [technical, setTechnical] = useState(initial.technical);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [rang, setRang] = useState<string | undefined>(undefined);
  const [queue, setQueue] = useState<string[]>([]);
  const [tracing, setTracing] = useState<string | null>(null);
  const [tipShown, setTipShown] = useState(true);
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: DiskSortKey; dir: SortDir }>({
    key: "health",
    dir: "ascending",
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const baseId = useId();
  useFlip(bodyRef);

  useEffect(
    () => () => {
      for (const t of timersRef.current) {
        window.clearTimeout(t);
      }
    },
    [],
  );
  const later = (ms: number, run: () => void) => {
    timersRef.current.push(window.setTimeout(run, ms));
  };
  // A row whose state just changed shows it once: its wash fades, its pill or power word swaps in.
  const mark = (id: string) => {
    setChanged((s) => new Set(s).add(id));
    later(1600, () => {
      setChanged((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    });
  };

  const groups = groupDisks(sortDisks(disks, sort.key, sort.dir));
  const order = groups.flatMap((g) => g.disks.map((d) => d.id));
  const byId = (id: string) => disks.find((d) => d.id === id);
  const summary = diskSummary(disks);
  const checking = queue.length > 0 || tracing !== null;

  const toggle = (set: Set<string>, id: string, on?: boolean) => {
    const next = new Set(set);
    if (on ?? !next.has(id)) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  };
  const open = (id: string) => {
    onNote(`Opens disk ${byId(id)?.device ?? ""}'s page.`);
  };
  const select = (id: string) => {
    if (!selected.has(id)) {
      setRang(id);
    }
    setSelected((s) => toggle(s, id));
  };

  const grid = useRowGrid(order, {
    onOpen: open,
    onToggleSelect: select,
    onExpand: (id, on) => {
      setExpanded((s) => toggle(s, id, on));
    },
    onMenu: setMenuRow,
    onEscape: () => {
      setSelected(new Set());
    },
  });

  // ─── The simulated health check ─────────────────────────────────────────────────────────────
  // One disk at a time, as the backend reads them. A sleeping disk wakes first (reading it wakes it,
  // which the page says); its health icon traces while it is read; then its slot and its row take
  // the result together.
  const setPower = (id: string, power: Power) => {
    setDisks((list) =>
      list.map((d) =>
        d.id === id
          ? {
              ...d,
              power,
              temperature:
                power === "asleep"
                  ? null
                  : (d.temperature ?? CHECK_RESULT[id]?.temperature ?? null),
            }
          : d,
      ),
    );
  };
  const step = (rest: string[]) => {
    const [id, ...next] = rest;
    setQueue(rest);
    if (id === undefined) {
      setTracing(null);
      return;
    }
    const read = token("--duration-slow", 360) + 520;
    const run = () => {
      setTracing(id);
      later(reducedMotion() ? 500 : read, () => {
        const result = CHECK_RESULT[id];
        if (result) {
          setDisks((list) =>
            list.map((d) => (d.id === id ? { ...d, ...result } : d)),
          );
          mark(id);
        }
        step(next);
      });
    };
    if (byId(id)?.power === "asleep") {
      setWaking((s) => new Set(s).add(id));
      later(600, () => {
        setWaking((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        setPower(id, "awake");
        mark(id);
        run();
      });
    } else {
      run();
    }
  };
  const check = (which: string[]) => {
    if (checking) {
      return;
    }
    const list = order.filter(
      (id) => which.includes(id) && checkable(byId(id) as Disk),
    );
    step(list);
  };
  const toggleSleep = (id: string) => {
    setPower(id, byId(id)?.power === "asleep" ? "awake" : "asleep");
    mark(id);
  };
  const retry = () => {
    setPhase("loading");
    later(900, () => {
      setPhase("ready");
    });
  };

  // ─── Pieces ─────────────────────────────────────────────────────────────────────────────────
  const powerOf = (d: Disk): PowerShown =>
    waking.has(d.id) ? "waking" : d.power;
  const done = queue.length;
  const summaryParts: SummaryPart[] =
    phase === "loading"
      ? ["Reading disks…"]
      : phase === "error"
        ? ["The disks could not be read"]
        : checking
          ? [
              summary.parts[0] ?? "",
              `Checking health, ${String(done)} ${done === 1 ? "disk" : "disks"} to go`,
            ]
          : summary.parts.map((p) =>
              /warning|critical/u.test(p)
                ? { text: p, status: summary.worst }
                : p,
            );
  const action =
    phase !== "ready" ? null : (
      <Button
        variant={summary.checked ? "neutral" : "primary"}
        loading={checking}
        onClick={() => {
          check(order);
        }}
      >
        {checking ? null : <Icon name="check-health" size={16} />}
        {checking
          ? "Checking…"
          : summary.checked
            ? "Check again"
            : "Check health"}
      </Button>
    );

  const slots: DriveSlot[] = disks.map((d) => ({
    id: d.id,
    device: d.device,
    kind: BAY_FACE[d.kind],
    status: tracing === d.id ? "unknown" : d.health,
    statusLabel: tracing === d.id ? "Checking…" : HEALTH_WORD[d.health],
    role: holdsWords(d.holds).replace(/ \(.*\)$/u, ""),
    detail:
      powerOf(d) === "asleep"
        ? "Asleep"
        : d.temperature === null
          ? undefined
          : `${String(d.temperature)}\u00a0°C`,
    link: (
      <button
        type="button"
        data-linked={linked === d.id || undefined}
        data-picked={selected.has(d.id) || undefined}
        data-asleep={powerOf(d) === "asleep" || undefined}
        className="lt-slot"
        onPointerEnter={() => {
          setLinked(d.id);
        }}
        onPointerLeave={() => {
          setLinked(null);
        }}
        onFocus={() => {
          setLinked(d.id);
        }}
        onBlur={() => {
          setLinked(null);
        }}
        onClick={() => {
          grid.focusRow(d.id);
        }}
      />
    ),
  }));

  const menuFor = (d: Disk) => (
    <>
      <MenuItem
        onClick={() => {
          open(d.id);
        }}
      >
        <ArrowRight aria-hidden="true" />
        Open
      </MenuItem>
      {checkable(d) ? (
        <MenuItem
          disabled={checking}
          onClick={() => {
            check([d.id]);
          }}
        >
          <Icon name="check-health" size={16} />
          Check health
        </MenuItem>
      ) : null}
      {d.holds.kind === "empty" ? (
        <MenuItem
          onClick={() => {
            onNote(`Opens Add storage with ${d.device} chosen.`);
          }}
        >
          <Icon name="create" size={16} />
          Add storage…
        </MenuItem>
      ) : null}
      {d.holds.kind === "system" ? null : (
        <>
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              onNote(`Asks you to type ${d.device} to wipe it.`);
            }}
          >
            <Icon name="wipe" size={16} />
            Wipe…
          </MenuItem>
        </>
      )}
    </>
  );

  const columns = 7 + (technical ? 3 : 0);
  const sortProps = (key: DiskSortKey) => ({
    sort: sort.key === key ? sort.dir : ("none" as const),
    onSort: () => {
      setSort((s) => ({
        key,
        dir:
          s.key === key && s.dir === "ascending" ? "descending" : "ascending",
      }));
    },
  });

  const row = (d: Disk) => {
    const isSelected = selected.has(d.id);
    const isExpanded = expanded.has(d.id);
    const tabbable = grid.current === d.id;
    const detailId = `${baseId}-${d.id}`;
    const power = powerOf(d);
    return (
      <Fragment key={d.id}>
        <TableRow
          {...grid.rowProps(d.id)}
          data-flip={d.id}
          data-tone={
            d.health === "ok" || d.health === "unknown" ? undefined : d.health
          }
          data-linked={linked === d.id || undefined}
          data-changed={changed.has(d.id) || undefined}
          selected={isSelected}
          aria-selected={isSelected}
          aria-expanded={isExpanded}
          aria-level={1}
          className="lt-row"
          onPointerEnter={() => {
            setLinked(d.id);
          }}
          onPointerLeave={() => {
            setLinked(null);
          }}
          onFocus={() => {
            grid.activate(d.id);
            setLinked(d.id);
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setLinked(null);
            }
          }}
        >
          <TableCell className="lt-select">
            <SelectCell
              name={d.device}
              checked={isSelected}
              onChange={() => {
                select(d.id);
              }}
            />
          </TableCell>
          <TableCell>
            <Identity
              icon={<Icon name={KIND_ICON[d.kind]} size={20} />}
              name={diskTitle(d)}
              mono={d.device}
              line={
                <>
                  {d.model} <code className="lt-chip-mono">{d.device}</code>
                </>
              }
              onOpen={() => {
                open(d.id);
              }}
              tabbable={tabbable}
            />
          </TableCell>
          <TableCell>
            {tracing === d.id ? (
              <span className="lt-tracing" role="status">
                <Icon name="check-health" size={20} className="lt-trace-icon" />
                Checking…
              </span>
            ) : (
              <StatusCell
                status={d.health}
                reason={d.health === "ok" ? undefined : d.reason}
              />
            )}
          </TableCell>
          <TableCell numeric>
            <Temperature disk={d} power={power} />
          </TableCell>
          <TableCell>
            <HoldsCell
              disk={d}
              tabbable={tabbable}
              onAdd={() => {
                onNote(`Opens Add storage with ${d.device} chosen.`);
              }}
            />
          </TableCell>
          <TableCell>
            <PowerCell power={power} />
          </TableCell>
          {technical ? (
            <>
              <TableCell mono>{d.serial}</TableCell>
              <TableCell mono>{`/dev/${d.device}`}</TableCell>
              <TableCell>{d.model}</TableCell>
            </>
          ) : null}
          <TableCell className="lt-end">
            <RowActions
              name={`disk ${d.device}`}
              quick={
                checkable(d) ? (
                  <Quick
                    icon={<Icon name="check-health" size={16} />}
                    tabbable={tabbable}
                    onClick={() => {
                      check([d.id]);
                    }}
                  >
                    Check health
                  </Quick>
                ) : undefined
              }
              menu={menuFor(d)}
              menuOpen={menuRow === d.id}
              onMenuOpenChange={(o) => {
                setMenuRow(o ? d.id : null);
              }}
              expanded={isExpanded}
              onExpandedChange={(o) => {
                setExpanded((s) => toggle(s, d.id, o));
              }}
              detailId={detailId}
              tabbable={tabbable}
            />
          </TableCell>
        </TableRow>
        {isExpanded ? (
          <tr id={detailId} className="lt-detail-row" aria-level={2}>
            <td colSpan={columns}>
              <DiskDetail disk={d} />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  const selection = [...selected];
  const selectedCheckable = selection.filter((id) => {
    const d = byId(id);
    return d !== undefined && checkable(d);
  });

  return (
    <div className="lt-page">
      <PageHead icon="disk" title="Disks" />
      <TableSummary parts={summaryParts} action={action} />
      {chrome ? (
        <LabCauses>
          <button
            type="button"
            onClick={() => {
              toggleSleep("sdb");
            }}
          >
            {byId("sdb")?.power === "asleep"
              ? "sdb wakes up"
              : "sdb goes to sleep"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDisks([...DISKS]);
              setTracing(null);
              setQueue([]);
            }}
          >
            Forget the check
          </button>
        </LabCauses>
      ) : null}
      {phase === "loading" ? (
        <DriveBaySkeleton slots={7} className="lt-bay" />
      ) : phase === "ready" ? (
        <div className="lt-bay-wrap">
          <DriveBay
            aria-label="The disks in this NAS. Point at a disk to find its row."
            name="nas"
            slots={slots}
            arrived={rang}
            className="lt-bay"
          />
          {tips && tipShown ? (
            <Tip
              onDismiss={() => {
                setTipShown(false);
              }}
            >
              Point at a disk in the picture to find its row below, or at a row
              to find the disk.
            </Tip>
          ) : null}
        </div>
      ) : null}
      <div className="lt-frame">
        {phase === "ready" ? (
          selection.length > 0 ? (
            <SelectionBar
              count={selection.length}
              onClear={() => {
                setSelected(new Set());
              }}
            >
              <Button
                variant="neutral"
                size="sm"
                disabled={selectedCheckable.length === 0 || checking}
                onClick={() => {
                  check(selectedCheckable);
                }}
              >
                <Icon name="check-health" size={16} />
                Check health
              </Button>
            </SelectionBar>
          ) : (
            <TableToolbar
              aria-label="Disk table settings"
              className="lt-toolbar"
            >
              <p className="lt-toolbar-note">
                Checking health wakes any disk that is asleep.
              </p>
              <label className="lt-switch">
                <Switch checked={technical} onCheckedChange={setTechnical} />
                Technical columns
              </label>
            </TableToolbar>
          )
        ) : null}
        <div ref={bodyRef}>
          <Table
            role="treegrid"
            aria-label="Disks"
            aria-multiselectable
            busy={phase === "loading"}
            busyLabel="Reading disks…"
            className="lt-table"
            frameLabel="Disks, scrolls sideways"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="lt-select">
                  <span className="sr-only">Selected</span>
                </TableHead>
                <TableHead {...sortProps("size")}>Disk</TableHead>
                <TableHead {...sortProps("health")}>Health</TableHead>
                <TableHead numeric {...sortProps("temperature")}>
                  Temperature
                </TableHead>
                <TableHead>Holds</TableHead>
                <TableHead>Power</TableHead>
                {technical ? (
                  <>
                    <TableHead>Serial</TableHead>
                    <TableHead {...sortProps("device")}>Device path</TableHead>
                    <TableHead>Model</TableHead>
                  </>
                ) : null}
                <TableHead className="lt-end">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {phase === "loading" ? (
              <TableBody>
                <TableSkeletonRows rows={5} columns={columns} />
              </TableBody>
            ) : phase === "error" ? (
              <TableBody>
                <TableStateRow colSpan={columns}>
                  <EmptyState
                    variant="error"
                    title="Could not read the disks"
                    serverMessage={{
                      label: "The NAS said",
                      text: "Connection timed out.",
                    }}
                    action={
                      <Button variant="neutral" onClick={retry}>
                        Try again
                      </Button>
                    }
                  >
                    Check that the NAS is on, then try again. Nothing was
                    changed.
                  </EmptyState>
                </TableStateRow>
              </TableBody>
            ) : (
              groups.map((g) => (
                <TableBody key={g.id}>
                  <TableGroupRow
                    colSpan={columns}
                    className="lt-group"
                    heading={
                      <span className="lt-group-head">
                        {g.name}
                        <span className="lt-group-count">
                          {g.disks.length === 1
                            ? "1 disk"
                            : `${String(g.disks.length)} disks`}
                        </span>
                        {g.health === "warning" || g.health === "critical" ? (
                          <SummaryProblem status={g.health}>
                            {HEALTH_WORD[g.health]}
                          </SummaryProblem>
                        ) : null}
                      </span>
                    }
                  />
                  {g.disks.map(row)}
                </TableBody>
              ))
            )}
          </Table>
        </div>
        {phase === "ready" ? (
          <TableLastRefreshed
            action={
              <Button variant="ghost" size="sm" onClick={retry}>
                Look for new disks
              </Button>
            }
          >
            Read at 10:36
          </TableLastRefreshed>
        ) : null}
      </div>
    </div>
  );
}

// ─── Cells ────────────────────────────────────────────────────────────────────────────────────

/** Right-aligned with its unit (4.5); a threshold pill only when crossed (4.9). */
function Temperature({ disk, power }: { disk: Disk; power: PowerShown }) {
  if (disk.temperature === null) {
    return (
      <Missing
        label={
          power === "asleep"
            ? "Not read while the disk is asleep"
            : "Not reported"
        }
      />
    );
  }
  return (
    <span className="lt-temp">
      {disk.temperature >= HOT ? (
        <StatusPill status="warning">Hot</StatusPill>
      ) : null}
      <span className="lt-num">
        {disk.temperature}
        {"\u00a0"}
        <span className="lt-unit">°C</span>
      </span>
    </span>
  );
}

function HoldsCell({
  disk,
  tabbable,
  onAdd,
}: {
  disk: Disk;
  tabbable: boolean;
  onAdd: () => void;
}) {
  const { holds } = disk;
  switch (holds.kind) {
    case "system":
      return (
        <span className="lt-holds">
          <span>System</span>
          <span className="lt-line2">openmediavault runs from it</span>
        </span>
      );
    case "fs":
      return (
        <span className="lt-holds">
          <span className="lt-service">
            <Icon name="file-system" size={16} />
            {holds.name}
            <span className="lt-term">{holds.type}</span>
          </span>
        </span>
      );
    case "empty":
      return (
        <span className="lt-holds lt-holds-empty">
          <span className="lt-quiet">Empty</span>
          <Button
            variant="ghost"
            size="sm"
            tabIndex={tabbable ? 0 : -1}
            onClick={onAdd}
            aria-label={`Add storage on ${disk.device}`}
          >
            <Icon name="create" size={16} />
            Add storage
          </Button>
        </span>
      );
    case "removable":
      return <span className="lt-quiet">{holds.what}</span>;
  }
}

/** Awake or asleep (4.9), with the moon when asleep. A change swaps the glyph in place (7.5). */
function PowerCell({ power }: { power: PowerShown }) {
  if (power === "none") {
    return <Missing label="Does not report power" />;
  }
  return (
    <span key={power} className="lt-power" data-power={power}>
      <Icon
        name={power === "asleep" ? "sleep" : "wake"}
        size={16}
        state={power === "awake" ? "done" : "rest"}
        motion="none"
      />
      {power === "asleep" ? "Asleep" : power === "waking" ? "Waking…" : "Awake"}
    </span>
  );
}

function DiskDetail({ disk }: { disk: Disk }) {
  const path = `/dev/${disk.device}`;
  return (
    <div className="lt-detail">
      <FactList className="lt-facts">
        <FactListItem>
          <FactListLabel>Health</FactListLabel>
          <FactListValue>{disk.reason}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Device path</FactListLabel>
          <FactListValue variant="identifier">
            <span className="lt-copyline">
              <span>{path}</span>
              <CopyButton
                text={path}
                label={`Copy the device path of ${disk.device}`}
                copiedLabel="Copied"
                selectedLabel="Selected. Press Ctrl+C to copy."
                size="icon-sm"
              />
            </span>
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Serial number</FactListLabel>
          <FactListValue variant="identifier">
            <span className="lt-copyline">
              <span>{disk.serial}</span>
              <CopyButton
                text={disk.serial}
                label={`Copy the serial number of ${disk.device}`}
                copiedLabel="Copied"
                selectedLabel="Selected. Press Ctrl+C to copy."
                size="icon-sm"
              />
            </span>
          </FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Model</FactListLabel>
          <FactListValue>{disk.model}</FactListValue>
        </FactListItem>
        <FactListItem>
          <FactListLabel>Size</FactListLabel>
          <FactListValue>
            <Bytes n={disk.size} />
          </FactListValue>
        </FactListItem>
      </FactList>
    </div>
  );
}
