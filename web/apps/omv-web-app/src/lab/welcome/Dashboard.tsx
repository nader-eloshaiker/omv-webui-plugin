// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard, designed whole (owner, 2026-11-27: "I like the design decisions on /ui but the view
// in the Instrument lab"). Development only (UI-11). Every part the owner settled on /ui is here
// (the answer, what needs you, the NAS map by rows with tracing, the waffle, the paired live charts,
// the temperatures by kind, the first steps, the Shortcuts and This NAS), set in a grid on a
// deliberate structure of grounds, dark first:
//
//   page ground   the welcome, the answer and the side column's text: what is said, not handled;
//   strip         the NAS at a glance, one status per area, read as one line;
//   raised panel  "Right now" and the disk temperatures: instruments, read and moving as one;
//   plate         the map, a drawing on its own sunken ground, so its rows and lines sit on one sheet;
//   side panel    what needs you, the first steps or This NAS: the one list or fact sheet beside the
//                 instruments, which the person works through as one.
//
// At 1440 the answer, the strip, "Right now" with what needs you, and the top of the map are above
// the fold on a later visit. Under 60rem of its own width the page reads top to bottom, what needs
// you before the instruments.
import type { AttentionItem } from "@omv-webui/react-ui-components";
import {
  AttentionList,
  Button,
  FactListItem,
  FactListLabel,
  FactListValue,
  Icon,
  NasFacts,
  Shortcuts,
  ShortcutsItem,
} from "@omv-webui/react-ui-components";
import { ExternalLink as ExternalIcon, Play } from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DashboardTemperatures } from "../../components/organisms/DashboardTemperatures.tsx";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC_HOME } from "../../navigation/navigation.ts";
import { RightNow } from "./Instrument.tsx";
import { useLiveReadings } from "./live.ts";
import type { LabNas } from "./model.ts";
import {
  Answer,
  LabMap,
  NasFront,
  NewNasAnswer,
  Steps,
  WelcomeLinks,
} from "./parts.tsx";
import { labReads } from "./reads.ts";
import { ScanLine } from "./ScanLine.tsx";
import type { CheckState } from "./states.ts";
import { ALSO, COMMON, count, counted, DRAWN, fill, NEEDS } from "./words.ts";

export interface DashProps {
  nas: LabNas;
  newNas: boolean;
  /** The welcome is on screen: a first visit (or Show me around) with tips on, not hidden. */
  welcome: boolean;
  /** Play the first visit's motion on this render. */
  assemble: boolean;
  compact: boolean;
  tips: boolean;
  /** No live readings are taken: the fixed 40, for screenshots. */
  still: boolean;
  check: CheckState;
  /** The check's result arrived while the page was open. */
  landed: boolean;
  onCheck: () => void;
  onHide: () => void;
  onNote: (text: string) => void;
  onShowAround: () => void;
}

/** The later visit's sentence of what still holds (C's idea): each phrase opens its page. */
function Also({
  nas,
  onNote,
}: {
  nas: LabNas;
  onNote: (text: string) => void;
}) {
  const f = nas.facts;
  const parts = [
    ...(f.unused[0]
      ? [
          {
            id: "unused",
            words: fill(ALSO.unused, { device: f.unused[0].device }),
            opens: "Add storage",
          },
        ]
      : []),
    ...(f.unreached[0]
      ? [
          {
            id: "unreached",
            words: fill(ALSO.unreached, { folder: f.unreached[0].name }),
            opens: `the sharing of ${f.unreached[0].name}`,
          },
        ]
      : []),
  ];
  if (parts.length === 0) {
    return null;
  }
  const [before, after] = ALSO.sentence.split("{{list}}");
  return (
    <p className="wl-also">
      {before}
      {parts.map((part, i) => (
        <span key={part.id}>
          {i > 0 ? ALSO.or : null}
          <button
            type="button"
            className="wl-inline-action"
            onClick={() => {
              onNote(`Opens ${part.opens}.`);
            }}
          >
            {part.words}
          </button>
        </span>
      ))}
      {after}
    </p>
  );
}

function ThisNas({
  nas,
  info,
  onShowAround,
  layout = "grid",
}: {
  nas: LabNas;
  info: ReturnType<typeof labReads>["info"];
  onShowAround: () => void;
  layout?: "grid" | "row";
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const updates = info.availablePkgUpdates ?? 0;
  return (
    <NasFacts
      className="wl-panel wl-side"
      layout={layout}
      title={t("dashboard.facts.title")}
      action={
        <Button variant="plain" size="sm" onClick={onShowAround}>
          <Play aria-hidden="true" />
          {t("dashboard.facts.showAround")}
        </Button>
      }
    >
      <FactListItem>
        <FactListLabel>{t("dashboard.facts.name")}</FactListLabel>
        <FactListValue>{nas.facts.host}</FactListValue>
      </FactListItem>
      <FactListItem>
        <FactListLabel>{t("dashboard.facts.version")}</FactListLabel>
        <FactListValue>{info.version}</FactListValue>
      </FactListItem>
      {info.uptime === undefined ? null : (
        <FactListItem>
          <FactListLabel>{t("dashboard.facts.uptime")}</FactListLabel>
          <FactListValue>{format.duration(info.uptime)}</FactListValue>
        </FactListItem>
      )}
      <FactListItem>
        <FactListLabel>{t("dashboard.facts.updates")}</FactListLabel>
        <FactListValue>
          {updates > 0
            ? t("dashboard.facts.updatesCount", { count: updates })
            : t("dashboard.facts.updatesNone")}
        </FactListValue>
      </FactListItem>
    </NasFacts>
  );
}

function LabShortcuts({ onNote }: { onNote: (text: string) => void }) {
  const { t } = useTranslation();
  return (
    <Shortcuts title={t("dashboard.shortcuts.title")} className="wl-shortcuts">
      <ShortcutsItem
        icon={<Icon name="person" mark="create" size={20} />}
        onClick={() => {
          onNote("Opens Add a person.");
        }}
      >
        {t("dashboard.shortcuts.addPerson")}
      </ShortcutsItem>
      <ShortcutsItem
        icon={<Icon name="group" mark="create" size={20} />}
        onClick={() => {
          onNote("Opens Add a group.");
        }}
      >
        {t("dashboard.shortcuts.addGroup")}
      </ShortcutsItem>
      <ShortcutsItem
        icon={<ExternalIcon />}
        render={
          <a href={CLASSIC_HOME} target="_blank" rel="noopener noreferrer" />
        }
      >
        {t("dashboard.shortcuts.classic")}
        <span className="sr-only"> {COMMON.newTab}</span>
      </ShortcutsItem>
    </Shortcuts>
  );
}

export function Dashboard(p: DashProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const f = p.nas.facts;
  const host = f.host;
  const live = useLiveReadings(p.still);
  const reads = useMemo(() => labReads(p.newNas), [p.newNas]);

  // What needs the person: in the lab, a storage past its warning mark (FileSystemMgmt.getList).
  const full = p.nas.storage.filter((s) => s.health !== "ok");
  const pct = (v: number) => t("dashboard.now.percent", { value: v });
  const items: AttentionItem[] = full.map((s) => ({
    id: `fs ${s.id}`,
    health: "warning",
    healthLabel: t("health.warning"),
    title: fill(NEEDS.title, { name: s.name }),
    detail: fill(NEEDS.detail, {
      percent: pct(s.percent),
      mark: pct(s.mark ?? 0),
    }),
    actionLabel: fill(NEEDS.action, { name: s.name }),
    onAction: () => {
      p.onNote(`Opens ${s.name}.`);
    },
  }));
  const needs = full.map((s) => ({
    health: "warning" as const,
    reason: fill(NEEDS.reason, { name: s.name, percent: pct(s.percent) }),
  }));

  const lead = p.newNas
    ? fill(DRAWN.new.lead, {
        disks: counted(f.disks, "disk", "disks"),
        free: count(f.unused.length),
      })
    : fill(DRAWN.existing.lead, {
        disks: counted(f.disks, "disk", "disks"),
        drives: counted(f.drives, "drive", "drives"),
        folders: counted(f.folders, "shared folder", "shared folders"),
      });
  const more = p.newNas ? DRAWN.new.more : fill(DRAWN.existing.more, { host });

  // The one filled accent: what needs you first, then the first step, then the check.
  const checkAccent = items.length === 0 && !p.newNas;

  const side: ReactNode =
    items.length > 0 ? (
      <div className="wl-panel wl-side">
        <div className="wl-panel-head">
          <h2 className="wl-panel-title">{NEEDS.label}</h2>
        </div>
        <AttentionList
          className="wl-needs"
          label={NEEDS.label}
          items={items}
          moreLabel={(n) => t("dashboard.needs.more", { count: n })}
          fewerLabel={t("dashboard.needs.fewer")}
        />
      </div>
    ) : p.newNas ? (
      <div className="wl-panel wl-side">
        <Steps accent="filled" onNote={p.onNote} />
      </div>
    ) : (
      <>
        <ThisNas nas={p.nas} info={reads.info} onShowAround={p.onShowAround} />
        <LabShortcuts onNote={p.onNote} />
      </>
    );
  // The columns are balanced per state so neither leaves a hole: with something needing you, This
  // NAS follows the list and the Shortcuts sit beside the temperatures; on a new NAS the first steps
  // are tall, so This NAS runs as one line under "Right now"; otherwise the temperatures take the
  // whole width.
  const sideTail: ReactNode =
    items.length > 0 ? (
      <ThisNas nas={p.nas} info={reads.info} onShowAround={p.onShowAround} />
    ) : null;
  const mainTail: ReactNode = p.newNas ? (
    <ThisNas
      nas={p.nas}
      info={reads.info}
      onShowAround={p.onShowAround}
      layout="row"
    />
  ) : null;
  const sideLater: ReactNode =
    items.length > 0 ? <LabShortcuts onNote={p.onNote} /> : null;

  return (
    <div className="wl-page" data-welcome={p.welcome || undefined}>
      {p.welcome ? (
        <section
          className="wl-hero wl-a"
          aria-labelledby={titleId}
          data-assemble={p.assemble ? "full" : undefined}
        >
          <div className="wl-a-words">
            <h1 id={titleId} className="wl-display" tabIndex={-1}>
              {fill(DRAWN.title, { host })}
            </h1>
            <p className="wl-lead">{lead}</p>
            {p.compact ? null : <p className="wl-more">{more}</p>}
            <WelcomeLinks onHide={p.onHide} />
          </div>
          <NasFront
            nas={p.nas}
            newNas={p.newNas}
            size="large"
            assemble={p.assemble}
          />
        </section>
      ) : null}

      <div className="wl-top">
        {p.newNas ? (
          p.welcome ? null : (
            <NewNasAnswer />
          )
        ) : (
          <Answer
            nas={p.nas}
            check={p.check}
            onCheck={p.onCheck}
            needs={needs}
            level={p.welcome ? 2 : 1}
            size={p.welcome ? "title" : "hero"}
            accent={checkAccent}
            aside={
              p.welcome ? undefined : (
                <NasFront
                  nas={p.nas}
                  newNas={false}
                  size="small"
                  assemble={false}
                  checked={p.check === "after"}
                  landed={p.landed}
                />
              )
            }
            after={
              p.tips && !p.welcome ? (
                <Also nas={p.nas} onNote={p.onNote} />
              ) : undefined
            }
          />
        )}
        <ScanLine nas={p.nas} check={p.check} />
      </div>

      <div
        className="wl-grid"
        data-side-first={items.length > 0 || p.newNas || undefined}
      >
        <div className="wl-main">
          <RightNow live={live} />
          {mainTail}
        </div>
        <div className="wl-aside">
          {side}
          {sideTail}
        </div>
      </div>

      <div id="wl-map" tabIndex={-1} className="wl-plate">
        <LabMap
          nas={p.nas}
          newNas={p.newNas}
          captions={p.welcome && !p.compact}
          example={p.tips || p.welcome}
          assemble={false}
          check={p.check}
          onCheck={p.onCheck}
          checkInFooter={p.newNas}
          addStorageAccent={false}
          onNote={p.onNote}
        />
      </div>

      <div className="wl-grid" data-whole={sideLater === null || undefined}>
        <div id="wl-temps" tabIndex={-1} className="wl-main wl-panel">
          <DashboardTemperatures
            groups={reads.temperatures}
            state="ok"
            error={null}
            readAt={live.since ?? 0}
            retrying={false}
            onRetry={() => undefined}
          />
        </div>
        {sideLater === null ? null : (
          <div className="wl-aside">{sideLater}</div>
        )}
      </div>
    </div>
  );
}
