// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab's app shell, in three directions: development only (UI-11). Instrument: an icon
// rail of the six groups with the current group's pages beside it. Sky: one sidebar where only the
// current group is open. Atlas: the groups as tabs across the top and the group's pages under them.
// Under 1024px all three fold into a drawer. The pending changes are a band under the top bar
// (Instrument, Atlas) or a dock at the foot of the window (Sky).
import {
  Activity,
  ChevronDown,
  Cpu,
  ExternalLink,
  HardDrive,
  LayoutGrid,
  Menu,
  Network,
  Rows3,
  Rows4,
  Search,
  Share2,
  User,
  Users,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { NavGroup, NavItem } from "./data.ts";
import { NAV } from "./data.ts";
import { Palette } from "./palette.tsx";
import { Activity as ActivityPage } from "./screens/Activity.tsx";
import { Dashboard } from "./screens/Dashboard.tsx";
import { FolderPage } from "./screens/FolderPage.tsx";
import { Storage } from "./screens/Storage.tsx";
import { usePaletteShortcuts } from "./shortcuts.ts";
import type { Screen } from "./state.ts";
import { useLab } from "./state.ts";
import { Mark } from "./ui.tsx";
import { cx, vars } from "./util.ts";

const ICONS: Record<
  string,
  ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  system: Cpu,
  network: Network,
  storage: HardDrive,
  services: Share2,
  users: Users,
  diagnostics: Activity,
};

function currentGroup(screen: Screen): string {
  if (screen === "dashboard") {
    return "";
  }
  return screen === "activity" ? "diagnostics" : "storage";
}

function isCurrent(item: NavItem, screen: Screen): boolean {
  return item.screen === screen;
}

function useNavigate() {
  const lab = useLab();
  return (item: NavItem) => {
    if (item.screen) {
      lab.go(item.screen);
    } else {
      lab.notInLab(item.label);
    }
  };
}

function NavLink({ item, onDone }: { item: NavItem; onDone?: () => void }) {
  const lab = useLab();
  const navigate = useNavigate();
  const current = isCurrent(item, lab.screen);
  return (
    <li>
      <a
        href={`#${item.id}`}
        className={cx(
          "lx-navlink",
          current && "is-current",
          item.classic && "is-classic",
        )}
        aria-current={current ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          navigate(item);
          onDone?.();
        }}
      >
        <span className="lx-navlink-text">{item.label}</span>
        {item.classic ? (
          <span className="lx-classic" title="Opens in the classic interface">
            Classic
            <ExternalLink size={12} aria-hidden />
          </span>
        ) : null}
      </a>
    </li>
  );
}

function DashboardLink({ onDone }: { onDone?: () => void }) {
  const lab = useLab();
  const current = lab.screen === "dashboard";
  return (
    <a
      href="#dashboard"
      className={cx("lx-navlink lx-navlink--home", current && "is-current")}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        lab.go("dashboard");
        onDone?.();
      }}
    >
      <LayoutGrid size={16} aria-hidden />
      <span className="lx-navlink-text">Overview</span>
    </a>
  );
}

function Brand() {
  const lab = useLab();
  return (
    <div className="lx-brand">
      <span className="lx-brand-mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20">
          <rect x="2" y="3" width="16" height="5" rx="1.6" />
          <rect x="2" y="12" width="16" height="5" rx="1.6" />
          <circle cx="5.5" cy="5.5" r="1" className="lx-brand-led" />
          <circle cx="5.5" cy="14.5" r="1" className="lx-brand-led" />
        </svg>
      </span>
      <span className="lx-brand-name">openmediavault</span>
      <span className="lx-brand-host">{lab.nas.host}</span>
    </div>
  );
}

function PendingChip() {
  const lab = useLab();
  const n = lab.pending.length;
  return (
    <button
      type="button"
      className={cx("lx-pendchip", n > 0 && "is-on")}
      data-pending-target
      aria-label={
        n > 0
          ? `${n} pending ${n === 1 ? "change" : "changes"}`
          : "No pending changes"
      }
      onClick={() => {
        document
          .getElementById("lx-pending")
          ?.scrollIntoView({ block: "nearest" });
      }}
    >
      <Mark status="pending" size={14} />
      <span className="lx-num">{n}</span>
      <span className="lx-pendchip-word">pending</span>
    </button>
  );
}

function TopBar({
  children,
  onMenu,
  onSearch,
}: {
  children?: ReactNode;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const lab = useLab();
  return (
    <header className="lx-top">
      <button
        type="button"
        className="lx-iconbtn lx-menubtn"
        aria-label="Open the menu"
        onClick={onMenu}
      >
        <Menu size={18} aria-hidden />
      </button>
      <Brand />
      {children}
      <div className="lx-top-end">
        <button
          type="button"
          className="lx-search"
          aria-keyshortcuts="/ Control+K Meta+K"
          onClick={onSearch}
        >
          <Search size={15} aria-hidden />
          <span className="lx-search-text">Go to or do…</span>
          <kbd>/</kbd>
        </button>
        <button
          type="button"
          className="lx-iconbtn lx-density"
          aria-pressed={lab.density === "compact"}
          aria-label="Compact rows"
          title={
            lab.density === "compact"
              ? "Compact rows (on)"
              : "Compact rows (off)"
          }
          onClick={() => {
            lab.setDensity(
              lab.density === "compact" ? "comfortable" : "compact",
            );
          }}
        >
          {lab.density === "compact" ? (
            <Rows4 size={18} aria-hidden />
          ) : (
            <Rows3 size={18} aria-hidden />
          )}
        </button>
        <PendingChip />
        <button
          type="button"
          className="lx-iconbtn"
          aria-label="Your account: admin"
          onClick={() => {
            lab.notInLab("Your account");
          }}
        >
          <User size={18} aria-hidden />
        </button>
      </div>
    </header>
  );
}

/** Pending changes: what is saved but not applied, with Apply and Undo. Comes and goes. */
function Pending() {
  const lab = useLab();
  const n = lab.pending.length;
  const open = n > 0;
  const word = n === 1 ? "change" : "changes";
  return (
    <section
      id="lx-pending"
      className={cx("lx-pending", open && "is-open", `is-${lab.phase}`)}
      aria-label="Pending changes"
      inert={!open}
    >
      <div className="lx-pending-clip">
        <div className="lx-pending-inner">
          <Mark status="pending" size={18} />
          <p className="lx-pending-text" aria-live="polite">
            {lab.phase === "applying" ? (
              <>
                Applying {n} {word}… The services restart as needed.
              </>
            ) : lab.phase === "applied" ? (
              <>Applied. {lab.pending.join(", ")} now use the new settings.</>
            ) : (
              <>
                <strong>
                  {n} {word} saved, not applied yet:
                </strong>{" "}
                {lab.pending.join(", ")}
              </>
            )}
          </p>
          <div className="lx-pending-actions">
            <button
              type="button"
              className="lx-btn lx-btn--onpending"
              disabled={lab.phase !== "idle"}
              onClick={lab.undo}
            >
              Undo
            </button>
            <button
              type="button"
              className="lx-btn lx-btn--onpending lx-btn--strong"
              disabled={lab.phase !== "idle"}
              onClick={lab.apply}
            >
              {lab.phase === "applied" ? "Applied" : `Apply ${n} ${word}`}
            </button>
          </div>
          <span className="lx-pending-progress" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function GroupList({
  group,
  onDone,
}: {
  group: NavGroup;
  onDone?: () => void;
}) {
  return (
    <ul className="lx-navlist">
      {group.items.map((item) => (
        <NavLink key={item.id} item={item} onDone={onDone} />
      ))}
    </ul>
  );
}

/** Instrument: a rail of groups, and the chosen group's pages in a panel beside it. */
function RailNav() {
  const lab = useLab();
  const [open, setOpen] = useState(currentGroup(lab.screen) || "storage");
  useEffect(() => {
    const g = currentGroup(lab.screen);
    if (g) {
      setOpen(g);
    }
  }, [lab.screen]);
  const group = NAV.find((g) => g.id === open) ?? NAV[2];
  return (
    <nav className="lx-railnav" aria-label="Main">
      <ul className="lx-rail">
        <li>
          <button
            type="button"
            className={cx(
              "lx-railbtn",
              lab.screen === "dashboard" && "is-current",
            )}
            aria-current={lab.screen === "dashboard" ? "page" : undefined}
            onClick={() => {
              lab.go("dashboard");
            }}
          >
            <LayoutGrid size={18} aria-hidden />
            <span>Overview</span>
          </button>
        </li>
        {NAV.map((g) => {
          const Icon = ICONS[g.icon] ?? Cpu;
          return (
            <li key={g.id}>
              <button
                type="button"
                className={cx(
                  "lx-railbtn",
                  open === g.id && "is-open",
                  currentGroup(lab.screen) === g.id && "is-current",
                )}
                aria-expanded={open === g.id}
                aria-controls="lx-railpanel"
                onClick={() => {
                  setOpen(g.id);
                }}
              >
                <Icon size={18} aria-hidden />
                <span>{g.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {group ? (
        <div className="lx-railpanel" id="lx-railpanel" key={group.id}>
          <p className="lx-railpanel-title">{group.label}</p>
          <GroupList group={group} />
        </div>
      ) : null}
    </nav>
  );
}

/** Sky: one sidebar; the current group is open and the others fold. */
function SideNav() {
  const lab = useLab();
  const [open, setOpen] = useState<string[]>(() => [
    currentGroup(lab.screen) || "storage",
  ]);
  const group = currentGroup(lab.screen);
  useEffect(() => {
    if (group) {
      setOpen((list) => (list.includes(group) ? list : [...list, group]));
    }
  }, [group]);
  return (
    <nav className="lx-sidenav" aria-label="Main">
      <DashboardLink />
      {NAV.map((g) => {
        const Icon = ICONS[g.icon] ?? Cpu;
        const isOpen = open.includes(g.id);
        const holds = currentGroup(lab.screen) === g.id;
        return (
          <div
            key={g.id}
            className={cx(
              "lx-sidegroup",
              isOpen && "is-open",
              holds && "holds-current",
            )}
          >
            <button
              type="button"
              className="lx-sidegroup-head"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen((list) =>
                  list.includes(g.id)
                    ? list.filter((x) => x !== g.id)
                    : [...list, g.id],
                );
              }}
            >
              <Icon size={16} aria-hidden />
              <span>{g.label}</span>
              <ChevronDown
                size={14}
                aria-hidden
                className="lx-sidegroup-chev"
              />
            </button>
            <div className="lx-sidegroup-body">
              <div className="lx-sidegroup-clip">
                <GroupList group={g} />
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Atlas: the groups as tabs; the chosen group's pages under them with a sliding indicator. */
function TabNav() {
  const lab = useLab();
  const [open, setOpen] = useState(currentGroup(lab.screen) || "storage");
  const bar = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const g = currentGroup(lab.screen);
    if (g) {
      setOpen(g);
    }
  }, [lab.screen]);
  useLayoutEffect(() => {
    const list = bar.current;
    if (!list) {
      return;
    }
    // Measured again when the font arrives and when the bar resizes, so the line sits under the
    // right word whatever the text is.
    const measure = () => {
      const active = list.querySelector<HTMLElement>(".is-current");
      list.style.setProperty("--ind-x", `${active?.offsetLeft ?? 0}px`);
      list.style.setProperty("--ind-w", `${active?.offsetWidth ?? 0}px`);
    };
    measure();
    void document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => {
      ro.disconnect();
    };
  }, [lab.screen, open]);
  const group = NAV.find((g) => g.id === open) ?? NAV[2];
  const navigate = useNavigate();
  return (
    <nav className="lx-tabnav" aria-label="Main">
      <ul className="lx-tabs">
        <li>
          <button
            type="button"
            className={cx("lx-tab", lab.screen === "dashboard" && "is-current")}
            aria-current={lab.screen === "dashboard" ? "page" : undefined}
            onClick={() => {
              lab.go("dashboard");
            }}
          >
            Overview
          </button>
        </li>
        {NAV.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              className={cx(
                "lx-tab",
                open === g.id && "is-open",
                currentGroup(lab.screen) === g.id && "is-current",
              )}
              aria-expanded={open === g.id}
              onClick={() => {
                setOpen(g.id);
              }}
            >
              {g.label}
            </button>
          </li>
        ))}
      </ul>
      {group ? (
        <ul className="lx-subtabs" ref={bar} key={group.id}>
          {group.items.map((item, i) => {
            const current = isCurrent(item, lab.screen);
            return (
              <li key={item.id} style={vars({ "--i": i })}>
                <a
                  href={`#${item.id}`}
                  className={cx(
                    "lx-subtab",
                    current && "is-current",
                    item.classic && "is-classic",
                  )}
                  aria-current={current ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item);
                  }}
                >
                  {item.label}
                  {item.classic ? (
                    <ExternalLink size={12} aria-label="classic interface" />
                  ) : null}
                </a>
              </li>
            );
          })}
          <li className="lx-subtabs-ind" aria-hidden="true" />
        </ul>
      ) : null}
    </nav>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open && !d.open) {
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);
  return (
    <dialog ref={ref} className="lx-drawer" aria-label="Menu" onClose={onClose}>
      <div className="lx-drawer-head">
        <Brand />
        <button
          type="button"
          className="lx-iconbtn"
          aria-label="Close the menu"
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <nav aria-label="Main">
        <DashboardLink onDone={onClose} />
        {NAV.map((g) => (
          <div key={g.id} className="lx-drawer-group">
            <p className="lx-drawer-title">{g.label}</p>
            <GroupList group={g} onDone={onClose} />
          </div>
        ))}
      </nav>
    </dialog>
  );
}

function Toasts() {
  const lab = useLab();
  return (
    <div className="lx-toasts" aria-live="polite">
      {lab.toasts.map((t) => (
        <div key={t.id} className="lx-toast">
          <span>{t.text}</span>
          <button
            type="button"
            className="lx-iconbtn lx-iconbtn--sm"
            aria-label="Dismiss"
            onClick={() => {
              lab.dismiss(t.id);
            }}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function Page() {
  const lab = useLab();
  if (lab.screen === "storage") {
    return <Storage />;
  }
  if (lab.screen === "folder") {
    return <FolderPage />;
  }
  if (lab.screen === "activity") {
    return <ActivityPage />;
  }
  return <Dashboard />;
}

export function Shell() {
  const lab = useLab();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const openPalette = useCallback(() => {
    setPalette(true);
  }, []);
  usePaletteShortcuts(openPalette);
  return (
    <div
      className="omv-lab"
      data-dir={lab.dir}
      data-theme={lab.theme}
      data-density={lab.density}
      data-loading={lab.loading || undefined}
    >
      <a className="lx-skip" href="#lx-main">
        Skip to the page
      </a>
      <div className="lx-ambient" aria-hidden="true" />
      <TopBar
        onMenu={() => {
          setDrawer(true);
        }}
        onSearch={openPalette}
      >
        {lab.dir === "atlas" ? <TabNav /> : null}
      </TopBar>
      {lab.dir !== "sky" ? <Pending /> : null}
      <div className="lx-body">
        {lab.dir === "instrument" ? <RailNav /> : null}
        {lab.dir === "sky" ? <SideNav /> : null}
        <main id="lx-main" className="lx-main" tabIndex={-1}>
          <Page />
        </main>
      </div>
      {lab.dir === "sky" ? <Pending /> : null}
      <Drawer
        open={drawer}
        onClose={() => {
          setDrawer(false);
        }}
      />
      <Palette
        open={palette}
        onClose={() => {
          setPalette(false);
        }}
      />
      <Toasts />
    </div>
  );
}
