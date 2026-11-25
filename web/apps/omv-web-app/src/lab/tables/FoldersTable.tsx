// SPDX-License-Identifier: GPL-3.0-or-later
// Prototype: the shared folders table, redesigned (rethink spec 4.9 "Shared folders", 8 row 4).
// Development only (UI-11). Every row is a lab fixture: "who can open it" has no per-row read yet
// (open owner decision 4). The lab's cause buttons change the fixtures in memory; nothing is written
// to the backend (UI-4), and the menu's actions only say what they would open.
import {
  Button,
  CapacityMeter,
  CopyButton,
  EmptyState,
  FactList,
  FactListItem,
  FactListLabel,
  FactListValue,
  Icon,
  InlineAlert,
  MenuItem,
  MenuSeparator,
  SearchField,
  ServerMessage,
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
import { FolderMinus, KeyRound, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useId, useRef, useState } from "react";
import { Help } from "../forms/parts.tsx";
import { useWide } from "../forms/states.ts";
import { useFlip, useRowGrid } from "./grid.ts";
import type {
  Drive,
  Folder,
  FolderFilter,
  FolderSortKey,
  SortDir,
} from "./model.ts";
import {
  accessWords,
  bytesText,
  driveOf,
  DRIVES,
  filterCounts,
  folderHealth,
  FOLDERS,
  folderSummary,
  fullPath,
  groupFolders,
  matchesFilter,
  matchesSearch,
  middleTruncate,
  NEW_FOLDER,
  sortFolders,
} from "./model.ts";
import type { Chip, SummaryPart } from "./parts.tsx";
import {
  FilterChips,
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
import type { FolderTableState } from "./states.ts";

type Phase = "ready" | "loading" | "error";

const SERVICE: Record<
  Folder["services"][number],
  { icon: "service-smb" | "service-nfs"; words: string }
> = {
  smb: { icon: "service-smb", words: "Windows and Mac" },
  nfs: { icon: "service-nfs", words: "Linux" },
};

function seed(state: FolderTableState) {
  return {
    folders: state === "empty" ? [] : [...FOLDERS],
    phase: (state === "loading"
      ? "loading"
      : state === "error" || state === "stale"
        ? "error"
        : "ready") as Phase,
    keptRows: state === "stale",
    selected: new Set<string>(state === "selected" ? ["photos", "films"] : []),
    expanded: new Set<string>(state === "expanded" ? ["photos"] : []),
    menuRow: state === "menu" ? "photos" : null,
    filter: (state === "filtered" ? "unreachable" : "all") as FolderFilter,
    query: state === "no-match" ? "holiday" : "",
  };
}

export function FoldersTable({
  state,
  tips,
  chrome,
  onNote,
}: {
  state: FolderTableState;
  tips: boolean;
  chrome: boolean;
  onNote: (text: string) => void;
}) {
  const [initial] = useState(() => seed(state));
  const [folders, setFolders] = useState<Folder[]>(initial.folders);
  const [drives, setDrives] = useState<Drive[]>([...DRIVES]);
  const [phase, setPhase] = useState<Phase>(initial.phase);
  const [keptRows, setKeptRows] = useState(initial.keptRows);
  const [selected, setSelected] = useState(initial.selected);
  const [expanded, setExpanded] = useState(initial.expanded);
  const [menuRow, setMenuRow] = useState<string | null>(initial.menuRow);
  const [filter, setFilter] = useState<FolderFilter>(initial.filter);
  const [query, setQuery] = useState(initial.query);
  const [sort, setSort] = useState<{ key: FolderSortKey; dir: SortDir }>({
    key: "status",
    dir: "ascending",
  });
  const [technical, setTechnical] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [arrived, setArrived] = useState<string | null>(null);
  const [changed, setChanged] = useState<Set<string>>(() => new Set());
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useWide(frameRef, 640);
  const baseId = useId();
  useFlip(bodyRef);

  const showRows = phase === "ready" || (phase === "error" && keptRows);
  const visible = sortFolders(
    folders.filter(
      (f) =>
        matchesFilter(f, drives, filter) && matchesSearch(f, drives, query),
    ),
    drives,
    sort.key,
    sort.dir,
  );
  const groups = groupFolders(visible, drives);
  const order = groups.flatMap((g) => g.folders.map((f) => f.id));
  const counts = filterCounts(folders, drives);

  const toggle = (set: Set<string>, id: string, on?: boolean) => {
    const next = new Set(set);
    if (on ?? !next.has(id)) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  };
  const byId = (id: string) => folders.find((f) => f.id === id);
  const open = (id: string) => {
    onNote(`Opens ${byId(id)?.name ?? ""}'s page.`);
  };

  const grid = useRowGrid(order, {
    onOpen: open,
    onToggleSelect: (id) => {
      setSelected((s) => toggle(s, id));
    },
    onExpand: (id, on) => {
      setExpanded((s) => toggle(s, id, on));
    },
    onMenu: (id) => {
      setMenuRow(id);
    },
    onEscape: () => {
      setSelected(new Set());
    },
    searchRef,
  });

  // ─── Lab causes: what a refresh or a create would bring (7.5) ───────────────────────────────
  const mark = (rows: string[]) => {
    setChanged(new Set(rows));
    window.setTimeout(() => {
      setChanged(new Set());
    }, 1600);
  };
  const flipMedia = () => {
    const media = drives.find((d) => d.id === "media");
    const mounted = !media?.mounted;
    setDrives((list) =>
      list.map((d) =>
        d.id === "media"
          ? { ...d, mounted, free: mounted ? 2.9 * 1024 ** 4 : null }
          : d,
      ),
    );
    mark(folders.filter((f) => f.drive === "media").map((f) => f.id));
  };
  const create = (folder: Folder) => {
    setFolders((list) => [...list.filter((f) => f.id !== folder.id), folder]);
    setArrived(folder.id);
    setFilter("all");
    setQuery("");
    window.setTimeout(() => {
      setArrived(null);
    }, 2400);
  };
  const retry = () => {
    setPhase("loading");
    window.setTimeout(() => {
      setPhase("ready");
      setKeptRows(false);
    }, 900);
  };

  const summary: SummaryPart[] =
    phase === "loading"
      ? ["Reading shared folders…"]
      : phase === "error" && !keptRows
        ? ["Shared folders could not be read"]
        : folderSummary(folders, drives).map((part) =>
            part.includes("not reachable")
              ? { text: part, status: "warning" as const }
              : part,
          );
  const addButton =
    folders.length === 0 && phase === "ready" ? null : (
      <Button
        variant="primary"
        onClick={() => {
          onNote("Opens Add a shared folder.");
        }}
      >
        <Icon name="shared-folder" mark="create" size={16} />
        Add a shared folder
      </Button>
    );

  const chips: Chip<FolderFilter>[] = [
    { value: "all", label: "All", count: counts.all },
    {
      value: "unreachable",
      label: "Not reachable",
      count: counts.unreachable,
      status: "warning",
    },
    { value: "shared", label: "Shared", count: counts.shared },
    { value: "unshared", label: "Not shared", count: counts.unshared },
  ];
  const chipName = chips.find((c) => c.value === filter)?.label ?? "";

  const menuFor = (folder: Folder) => (
    <>
      <MenuItem
        onClick={() => {
          open(folder.id);
        }}
      >
        <Icon name="shared-folder" size={16} />
        Open
      </MenuItem>
      <MenuItem
        onClick={() => {
          onNote(`Opens Give access to ${folder.name}.`);
        }}
      >
        <KeyRound aria-hidden="true" />
        Give access…
      </MenuItem>
      {folder.services.length === 0 ? (
        <MenuItem
          onClick={() => {
            onNote(`Opens Share ${folder.name}.`);
          }}
        >
          <Icon name="share" size={16} />
          Share…
        </MenuItem>
      ) : (
        <MenuItem
          onClick={() => {
            onNote(`Asks to stop sharing ${folder.name}.`);
          }}
        >
          <Icon name="share" size={16} />
          Stop sharing…
        </MenuItem>
      )}
      <MenuItem
        onClick={() => {
          onNote(`Opens ${folder.name}'s Linux sharing.`);
        }}
      >
        <Icon name="service-nfs" size={16} />
        Share with Linux…
      </MenuItem>
      <MenuItem
        onClick={() => {
          onNote(`Opens Keep a copy of ${folder.name}.`);
        }}
      >
        <Icon name="copy-job" size={16} />
        Keep a copy…
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        onClick={() => {
          onNote(`Asks to remove ${folder.name} and keep its files.`);
        }}
      >
        <FolderMinus aria-hidden="true" />
        Remove, keep the files…
      </MenuItem>
      <MenuItem
        onClick={() => {
          onNote(
            `Asks you to type ${folder.name} to delete it with its files.`,
          );
        }}
      >
        <Trash2 aria-hidden="true" />
        Delete with its files…
      </MenuItem>
    </>
  );

  const quickFor = (folder: Folder, tabbable: boolean) => (
    <>
      {folder.services.length === 0 ? (
        <Quick
          icon={<Icon name="share" size={16} />}
          tabbable={tabbable}
          onClick={() => {
            onNote(`Opens Share ${folder.name}.`);
          }}
        >
          Share
        </Quick>
      ) : (
        <Quick
          icon={<Icon name="share" size={16} />}
          tabbable={tabbable}
          onClick={() => {
            onNote(`Asks to stop sharing ${folder.name}.`);
          }}
        >
          Stop sharing
        </Quick>
      )}
      {folder.services.includes("smb") ? (
        <CopyButton
          text={`\\\\nas\\${folder.name}`}
          label={`Copy the Windows address of ${folder.name}`}
          copiedLabel="Copied"
          selectedLabel="Selected. Press Ctrl+C to copy."
          size="sm"
          variant="ghost"
          tabIndex={tabbable ? 0 : -1}
        >
          Copy address
        </CopyButton>
      ) : null}
    </>
  );

  // ─── Columns ────────────────────────────────────────────────────────────────────────────────
  const columns = 7 + (technical ? 3 : 0);
  const sortProps = (key: FolderSortKey) => ({
    sort: sort.key === key ? sort.dir : ("none" as const),
    onSort: () => {
      setSort((s) => ({
        key,
        dir:
          s.key === key && s.dir === "ascending" ? "descending" : "ascending",
      }));
    },
  });

  const row = (folder: Folder) => {
    const drive = driveOf(folder, drives);
    const health = folderHealth(folder, drives);
    const isSelected = selected.has(folder.id);
    const isExpanded = expanded.has(folder.id);
    const tabbable = grid.current === folder.id;
    const detailId = `${baseId}-${folder.id}`;
    const path = fullPath(folder, drives);
    return (
      <Fragment key={folder.id}>
        <TableRow
          {...grid.rowProps(folder.id)}
          data-flip={folder.id}
          data-tone={health === "ok" ? undefined : health}
          data-changed={changed.has(folder.id) || undefined}
          data-arrived={arrived === folder.id || undefined}
          selected={isSelected}
          aria-selected={isSelected}
          aria-expanded={isExpanded}
          aria-level={1}
          className="lt-row"
        >
          <TableCell className="lt-select">
            <SelectCell
              name={folder.name}
              checked={isSelected}
              onChange={() => {
                setSelected((s) => toggle(s, folder.id));
              }}
            />
          </TableCell>
          <TableCell>
            <Identity
              icon={<Icon name="shared-folder" size={20} />}
              name={folder.name}
              line={folder.description || undefined}
              onOpen={() => {
                open(folder.id);
              }}
              tabbable={tabbable}
            />
          </TableCell>
          <TableCell>
            <StatusCell
              status={health}
              word={health === "ok" ? undefined : "Not reachable"}
              reason={health === "ok" ? undefined : "Its drive is not mounted"}
            />
          </TableCell>
          <TableCell>
            <ReachedBy services={folder.services} />
          </TableCell>
          <TableCell>
            <WhoCanOpen folder={folder} />
          </TableCell>
          <TableCell>
            <DriveCell drive={drive} />
          </TableCell>
          {technical ? (
            <>
              <TableCell mono className="lt-tech">
                <span className="lt-path" title={path}>
                  {middleTruncate(path, 30)}
                </span>
                <CopyButton
                  text={path}
                  label={`Copy the full path of ${folder.name}`}
                  copiedLabel="Copied"
                  selectedLabel="Selected. Press Ctrl+C to copy."
                  size="icon-sm"
                  tabIndex={tabbable ? 0 : -1}
                />
              </TableCell>
              <TableCell mono>{folder.relPath}</TableCell>
              <TableCell>{folder.inUse ? "Yes" : "No"}</TableCell>
            </>
          ) : null}
          <TableCell className="lt-end">
            <RowActions
              name={folder.name}
              quick={quickFor(folder, tabbable)}
              menu={menuFor(folder)}
              menuOpen={menuRow === folder.id}
              onMenuOpenChange={(o) => {
                setMenuRow(o ? folder.id : null);
              }}
              expanded={isExpanded}
              onExpandedChange={(o) => {
                setExpanded((s) => toggle(s, folder.id, o));
              }}
              detailId={detailId}
              tabbable={tabbable}
            />
          </TableCell>
        </TableRow>
        {isExpanded ? (
          <tr id={detailId} className="lt-detail-row" aria-level={2}>
            <td colSpan={columns}>
              <FolderDetail folder={folder} drive={drive} path={path} />
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  const tableBody = (): ReactNode => {
    if (phase === "loading") {
      return (
        <TableBody>
          <TableSkeletonRows rows={4} columns={columns} />
        </TableBody>
      );
    }
    if (phase === "error" && !keptRows) {
      return (
        <TableBody>
          <TableStateRow colSpan={columns}>
            <EmptyState
              variant="error"
              title="Could not read the shared folders"
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
              Check that the NAS is on, then try again. Nothing was changed.
            </EmptyState>
          </TableStateRow>
        </TableBody>
      );
    }
    if (folders.length === 0) {
      return (
        <TableBody>
          <TableStateRow colSpan={columns}>
            <TeachingEmpty
              tips={tips}
              onAdd={() => {
                onNote("Opens Add a shared folder.");
              }}
            />
          </TableStateRow>
        </TableBody>
      );
    }
    if (visible.length === 0) {
      return (
        <TableBody>
          <TableStateRow colSpan={columns}>
            <NoMatch
              query={query}
              chip={filter === "all" ? null : chipName}
              onClear={() => {
                setQuery("");
                setFilter("all");
              }}
            />
          </TableStateRow>
        </TableBody>
      );
    }
    return groups.map((group) => (
      <TableBody
        key={group.drive?.id ?? "all"}
        data-flip={`g-${group.drive?.id ?? "all"}`}
      >
        {group.drive ? (
          <TableGroupRow
            colSpan={columns}
            className="lt-group"
            heading={
              <span className="lt-group-head">
                <Icon name="file-system" size={16} />
                {group.drive.name}
                <span className="lt-group-count">
                  {group.folders.length === 1
                    ? "1 folder"
                    : `${String(group.folders.length)} folders`}
                </span>
                {group.health === "ok" ? null : (
                  <SummaryProblem status={group.health}>
                    Not mounted
                  </SummaryProblem>
                )}
              </span>
            }
          />
        ) : null}
        {group.folders.map(row)}
      </TableBody>
    ));
  };

  // ─── The page ───────────────────────────────────────────────────────────────────────────────
  const selection = [...selected].filter((id) =>
    folders.some((f) => f.id === id),
  );
  return (
    <div className="lt-page">
      <PageHead
        title="Shared folders"
        help={
          <Help tips={tips} question="What is a shared folder?">
            A shared folder is a folder on one of the NAS's drives that your
            computers can open over the network. You choose who can open it and
            how computers reach it.
          </Help>
        }
      />
      {/* With no folders, the teaching state says it; the summary would only repeat it. */}
      {folders.length === 0 && phase === "ready" ? null : (
        <TableSummary parts={summary} action={addButton} />
      )}
      {chrome ? (
        <LabCauses>
          <button type="button" onClick={flipMedia}>
            {drives.find((d) => d.id === "media")?.mounted
              ? "Media drive stops"
              : "Media drive comes back"}
          </button>
          <button
            type="button"
            onClick={() => {
              create(
                folders.length === 0 ? (FOLDERS[0] ?? NEW_FOLDER) : NEW_FOLDER,
              );
            }}
          >
            {folders.length === 0
              ? "Create Photos"
              : "Return from creating Videos"}
          </button>
          <span>"Who can open it" is lab data (owner decision 4).</span>
        </LabCauses>
      ) : null}
      {phase === "error" && keptRows ? (
        <InlineAlert
          tone="neutral"
          icon="warning"
          title="Reading again failed, so these are the folders as read at 10:31."
          className="lt-stale"
        >
          <ServerMessage label="The NAS said">
            Connection timed out.
          </ServerMessage>
          <Button variant="neutral" size="sm" onClick={retry}>
            Try again
          </Button>
        </InlineAlert>
      ) : null}
      <div ref={frameRef} className="lt-frame" data-narrow={!wide || undefined}>
        {showRows && folders.length > 0 ? (
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
                onClick={() => {
                  onNote(
                    `Asks to stop sharing ${String(selection.length)} folders.`,
                  );
                }}
              >
                <Icon name="share" size={16} />
                Stop sharing…
              </Button>
              <Button
                variant="neutral"
                size="sm"
                onClick={() => {
                  onNote(
                    `Opens Give access to ${String(selection.length)} folders.`,
                  );
                }}
              >
                <KeyRound aria-hidden="true" />
                Give access…
              </Button>
            </SelectionBar>
          ) : (
            <TableToolbar
              aria-label="Find shared folders"
              className="lt-toolbar"
            >
              <SearchField
                ref={searchRef}
                size="sm"
                label={<span className="sr-only">Search shared folders</span>}
                clearLabel="Clear the search"
                placeholder="Search"
                value={query}
                onValueChange={setQuery}
                className="lt-search"
              />
              <FilterChips
                label="Show"
                value={filter}
                chips={chips}
                onChange={setFilter}
              />
              {wide ? (
                <label className="lt-switch">
                  <Switch checked={technical} onCheckedChange={setTechnical} />
                  Technical columns
                </label>
              ) : (
                <div className="lt-narrow-tools">
                  <SortSelect
                    value={`${sort.key}:${sort.dir}`}
                    options={[
                      ["status:ascending", "Status, worst first"],
                      ["name:ascending", "Name, A to Z"],
                      ["free:ascending", "Drive, least free first"],
                    ]}
                    onChange={(v) => {
                      const [key, dir] = v.split(":") as [
                        FolderSortKey,
                        SortDir,
                      ];
                      setSort({ key, dir });
                    }}
                  />
                  <Button
                    variant="neutral"
                    size="sm"
                    aria-pressed={selecting}
                    onClick={() => {
                      setSelecting(!selecting);
                    }}
                  >
                    {selecting ? "Done" : "Select"}
                  </Button>
                </div>
              )}
            </TableToolbar>
          )
        ) : null}
        <div ref={bodyRef}>
          {wide || !showRows || folders.length === 0 || visible.length === 0 ? (
            <Table
              role="treegrid"
              aria-label="Shared folders"
              aria-multiselectable
              busy={phase === "loading"}
              busyLabel="Reading shared folders…"
              className="lt-table"
              frameLabel={
                technical ? "Shared folders, scrolls sideways" : undefined
              }
            >
              <TableHeader>
                <TableRow>
                  <TableHead className="lt-select">
                    <span className="sr-only">Selected</span>
                  </TableHead>
                  <TableHead {...sortProps("name")}>Folder</TableHead>
                  <TableHead {...sortProps("status")}>Status</TableHead>
                  <TableHead>Reached by</TableHead>
                  <TableHead>Who can open it</TableHead>
                  <TableHead {...sortProps("free")}>Drive</TableHead>
                  {technical ? (
                    <>
                      <TableHead>Full path</TableHead>
                      <TableHead>Folder on the drive</TableHead>
                      <TableHead>In use</TableHead>
                    </>
                  ) : null}
                  <TableHead className="lt-end">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {tableBody()}
            </Table>
          ) : (
            <FolderList
              folders={visible}
              drives={drives}
              selected={selected}
              selecting={selecting || selection.length > 0}
              arrived={arrived}
              onToggle={(id) => {
                setSelected((s) => toggle(s, id));
              }}
              onOpen={open}
              menuFor={menuFor}
              menuRow={menuRow}
              onMenu={setMenuRow}
            />
          )}
        </div>
        {showRows && folders.length > 0 ? (
          <TableLastRefreshed
            action={
              <Button variant="ghost" size="sm" onClick={retry}>
                Refresh
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

/**
 * How computers reach a folder. Empty is a plain dash in the table, whose column says what it is
 * missing; in the list form, which has no column, it is a labelled value.
 */
function ReachedBy({
  services,
  labelled,
}: {
  services: Folder["services"];
  labelled?: boolean;
}) {
  if (services.length === 0) {
    return labelled ? (
      <span className="lt-secondary">Reached by: no computer</span>
    ) : (
      <Missing label="No computer can reach it" />
    );
  }
  return (
    <span className="lt-services">
      {services.map((s) => (
        <span key={s} className="lt-service">
          <Icon name={SERVICE[s].icon} size={16} />
          {SERVICE[s].words}
        </span>
      ))}
    </span>
  );
}

function WhoCanOpen({
  folder,
  labelled,
}: {
  folder: Folder;
  labelled?: boolean;
}) {
  const { access } = folder;
  if (access.kind === "nobody") {
    return labelled ? (
      <span className="lt-secondary">Who can open it: nobody</span>
    ) : (
      <Missing label="Nobody can open it" />
    );
  }
  return (
    <span className="lt-service">
      <Icon name={access.kind === "everyone" ? "group" : "person"} size={16} />
      {accessWords(access)}
    </span>
  );
}

/** The drive with its free-space bar (4.5): the library's meter, small, its figure beside it. */
function DriveCell({ drive }: { drive: Drive }) {
  // Not mounted: no bar to draw, so the free space is a labelled value instead.
  if (drive.free === null) {
    return (
      <span className="lt-drive">
        <span className="lt-drive-name">{drive.name}</span>
        <span className="lt-line2">Free space: unknown</span>
      </span>
    );
  }
  return (
    <span className="lt-drive">
      <span className="lt-drive-name">{drive.name}</span>
      <CapacityMeter
        variant="compact"
        label={`Space on ${drive.name}`}
        value={drive.size - drive.free}
        max={drive.size}
        valueText={`${bytesText(drive.free)} free`}
        className="lt-meter"
      />
    </span>
  );
}

/** The expanded row (4.7): the technical facts, each copyable, and the addresses computers use. */
function FolderDetail({
  folder,
  drive,
  path,
}: {
  folder: Folder;
  drive: Drive;
  path: string;
}) {
  const copy = (text: string, what: string) => (
    <CopyButton
      text={text}
      label={`Copy ${what} of ${folder.name}`}
      copiedLabel="Copied"
      selectedLabel="Selected. Press Ctrl+C to copy."
      size="icon-sm"
    />
  );
  return (
    <div className="lt-detail">
      <FactList className="lt-facts">
        <FactListItem>
          <FactListLabel>Full path</FactListLabel>
          <FactListValue variant="identifier">
            <span className="lt-copyline">
              <span>{path}</span>
              {copy(path, "the full path")}
            </span>
          </FactListValue>
        </FactListItem>
        {folder.services.length === 0 ? (
          <FactListItem>
            <FactListLabel>Sharing</FactListLabel>
            <FactListValue>
              No computer can open {folder.name} until you share it.
            </FactListValue>
          </FactListItem>
        ) : null}
        {folder.access.kind === "nobody" ? (
          <FactListItem>
            <FactListLabel>Who can open it</FactListLabel>
            <FactListValue>
              Nobody can open {folder.name} yet. Give access from its menu.
            </FactListValue>
          </FactListItem>
        ) : null}
        <FactListItem>
          <FactListLabel>Kept on</FactListLabel>
          <FactListValue>
            {drive.name}{" "}
            <span className="lt-term">{`${drive.type} on ${drive.device}`}</span>
          </FactListValue>
        </FactListItem>
        {folder.services.includes("smb") ? (
          <FactListItem>
            <FactListLabel>Windows address</FactListLabel>
            <FactListValue variant="identifier">
              <span className="lt-copyline">
                <span>{`\\\\nas\\${folder.name}`}</span>
                {copy(`\\\\nas\\${folder.name}`, "the Windows address")}
              </span>
            </FactListValue>
          </FactListItem>
        ) : null}
        {folder.services.includes("smb") ? (
          <FactListItem>
            <FactListLabel>Mac address</FactListLabel>
            <FactListValue variant="identifier">
              <span className="lt-copyline">
                <span>{`smb://nas/${folder.name}`}</span>
                {copy(`smb://nas/${folder.name}`, "the Mac address")}
              </span>
            </FactListValue>
          </FactListItem>
        ) : null}
        <FactListItem>
          <FactListLabel>In use</FactListLabel>
          <FactListValue variant={folder.inUse ? "text" : "missing"}>
            {folder.inUse
              ? "Yes: sharing or a copy job refers to it"
              : "No: nothing refers to it"}
          </FactListValue>
        </FactListItem>
      </FactList>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────────────────────

/**
 * The teaching empty state (4.8, 4.10): in the frame, at the table's left edge, one sentence, one
 * accent action, one text button, and a ghost row of what will appear ("Example"). Nothing
 * assembles or fades in: it is there when the page is. With tips off the ghost goes; the sentence
 * and the action stay (G1).
 */
function TeachingEmpty({ tips, onAdd }: { tips: boolean; onAdd: () => void }) {
  return (
    <div className="lt-teach">
      <div className="lt-teach-main">
        <div className="lt-teach-words">
          <p className="lt-teach-title">This NAS has no shared folders yet</p>
          <p className="lt-teach-line">
            A shared folder is a folder your computers can open over the
            network, for example Photos for the whole family.
          </p>
          <div className="lt-teach-actions">
            <Button variant="primary" onClick={onAdd}>
              <Icon name="shared-folder" mark="create" size={16} />
              Add a shared folder
            </Button>
            <Button variant="ghost" onClick={onAdd}>
              How sharing works
            </Button>
          </div>
        </div>
      </div>
      {tips ? (
        <div className="lt-ghost" aria-hidden="true">
          <span className="lt-ghost-tag">Example</span>
          <span className="lt-ghost-cell" data-i="0">
            <span className="lt-plate">
              <Icon name="shared-folder" size={20} />
            </span>
            <span className="lt-ghost-name">Photos</span>
          </span>
          <span className="lt-ghost-cell" data-i="1">
            <Icon name="service-smb" size={16} />
            Windows and Mac
          </span>
          <span className="lt-ghost-cell" data-i="2">
            <Icon name="person" size={16} />6 people
          </span>
          <span className="lt-ghost-cell lt-ghost-bar" data-i="3">
            <span>
              <span />
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function NoMatch({
  query,
  chip,
  onClear,
}: {
  query: string;
  chip: string | null;
  onClear: () => void;
}) {
  const what =
    query.trim() === ""
      ? `No folder is in "${chip ?? ""}".`
      : `No folder matches "${query}"${chip ? ` in "${chip}"` : ""}.`;
  return (
    <EmptyState
      variant="filtered"
      className="lt-nomatch"
      action={
        <Button variant="neutral" size="sm" onClick={onClear}>
          {query.trim() === "" ? "Show all" : "Clear search"}
        </Button>
      }
    >
      {what}
    </EmptyState>
  );
}

// ─── The list form, under 640px (4.8) ─────────────────────────────────────────────────────────

function FolderList({
  folders,
  drives,
  selected,
  selecting,
  arrived,
  onToggle,
  onOpen,
  menuFor,
  menuRow,
  onMenu,
}: {
  folders: Folder[];
  drives: readonly Drive[];
  selected: Set<string>;
  selecting: boolean;
  arrived: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  menuFor: (folder: Folder) => ReactNode;
  menuRow: string | null;
  onMenu: (id: string | null) => void;
}) {
  return (
    <ul className="lt-list" aria-label="Shared folders">
      {folders.map((folder) => {
        const drive = driveOf(folder, drives);
        const health = folderHealth(folder, drives);
        return (
          <li
            key={folder.id}
            data-flip={folder.id}
            data-tone={health === "ok" ? undefined : health}
            data-selected={selected.has(folder.id) || undefined}
            data-arrived={arrived === folder.id || undefined}
            className="lt-item"
          >
            {selecting ? (
              <span className="lt-item-select">
                <SelectCell
                  name={folder.name}
                  checked={selected.has(folder.id)}
                  onChange={() => {
                    onToggle(folder.id);
                  }}
                />
              </span>
            ) : null}
            <div className="lt-item-body">
              <div className="lt-item-line1">
                <span className="lt-plate" aria-hidden="true">
                  <Icon name="shared-folder" size={20} />
                </span>
                <button
                  type="button"
                  className="lt-name lt-item-name"
                  onClick={() => {
                    onOpen(folder.id);
                  }}
                >
                  <bdi>{folder.name}</bdi>
                </button>
                <StatusCell
                  status={health}
                  word={health === "ok" ? undefined : "Not reachable"}
                />
              </div>
              <div className="lt-item-line2">
                <ReachedBy services={folder.services} labelled />
                <WhoCanOpen folder={folder} labelled />
              </div>
              <div className="lt-item-line3">
                <DriveCell drive={drive} />
              </div>
            </div>
            <div className="lt-item-end">
              <RowActions
                name={folder.name}
                menu={menuFor(folder)}
                menuOpen={menuRow === folder.id}
                onMenuOpenChange={(o) => {
                  onMenu(o ? folder.id : null);
                }}
                tabbable
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Lab furniture ────────────────────────────────────────────────────────────────────────────

export function SortSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="lt-sortby">
      Sort by
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map(([v, words]) => (
          <option key={v} value={v}>
            {words}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The lab's cause buttons: what a refresh or a create would bring. Hidden with chrome=0. */
export function LabCauses({ children }: { children: ReactNode }) {
  return (
    <div className="lt-causes" role="group" aria-label="Lab: causes">
      <span className="lt-causes-tag">Lab</span>
      {children}
    </div>
  );
}
