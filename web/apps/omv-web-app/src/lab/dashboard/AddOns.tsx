// SPDX-License-Identifier: GPL-3.0-or-later
// "From your add-ons" (owner decision 8), after region D and before E: plugins this interface knows
// get native tiles (ZFS pools and RAID arrays here; they also stand in their lane of the map), and
// any other installed plugin a tile with its package name and "Open in the classic interface".
// Never a classic widget: those name arbitrary methods and render HTML templates, so drawing them
// would break UI-2, UI-4 and UI-10; no method a widget names is called and its file is never read.
// Full rows of tiles, balanced, so no row leaves a hole. Development only (UI-11).
import type { IconName } from "@omv-webui/react-ui-components";
import {
  Button,
  CapacityMeter,
  IconPlate,
  StatusIcon,
  StatusPill,
} from "@omv-webui/react-ui-components";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { AddOn, Health, Nas } from "./model.ts";
import { HEALTH_WORD, percent, plural, tileColumns, worst } from "./model.ts";

function StateWord({ health, word }: { health: Health; word: string }) {
  return health === "ok" ? (
    <span className="dm-tile-ok">
      <StatusIcon status="ok" />
      {word}
    </span>
  ) : (
    <StatusPill status={health}>{word}</StatusPill>
  );
}

function Tile({
  icon,
  title,
  pkg,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  pkg: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="dm-tile">
      <div className="dm-tile-head">
        <IconPlate name={icon} />
        <span className="dm-tile-titles">
          <span className="dm-tile-title">{title}</span>
          <span className="dm-tile-pkg">{pkg}</span>
        </span>
      </div>
      <div className="dm-tile-body">{children}</div>
      <div className="dm-tile-foot">{action}</div>
    </li>
  );
}

function TileBody({ addOn, nas }: { addOn: AddOn; nas: Nas }) {
  if (addOn.kind === "unknown") {
    return (
      <p className="dm-tile-line">
        This add-on is installed. It has no tile in the new interface yet.
      </p>
    );
  }
  const items = nas.storage.filter((s) => s.kind === addOn.kind);
  return (
    <ul className="dm-tile-items">
      {items.map((s) => {
        const disks = nas.disks.filter((d) => d.feeds.includes(s.id));
        const health = worst([s.health, ...disks.map((d) => d.health)]);
        const bad = disks.filter(
          (d) => d.health === "warning" || d.health === "critical",
        );
        const word =
          bad.length > 0
            ? `${bad.map((d) => d.device).join(", ")} ${bad.length === 1 ? "reports" : "report"} a problem`
            : `${String(disks.length)} of ${plural(disks.length, "disk", "disks")} working`;
        return (
          <li key={s.id} className="dm-tile-item">
            <span className="dm-tile-item-head">
              <span className="dm-tile-name">
                <bdi>{s.name}</bdi>
              </span>
              <span className="dm-tile-tech">{s.tech}</span>
              <span className="dm-tile-state">
                <StateWord health={health} word={HEALTH_WORD[health]} />
              </span>
            </span>
            <span className="dm-tile-line">{word}</span>
            <CapacityMeter
              variant="compact"
              label={`${s.name}: space used`}
              value={s.used}
              max={1}
              valueText={`${percent(s.used)} · ${s.free} free`}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function AddOns({
  nas,
  fit,
  onNote,
}: {
  nas: Nas;
  /** How many tiles fit side by side at this width. */
  fit: number;
  onNote: (text: string) => void;
}) {
  if (nas.addOns.length === 0) {
    return null;
  }
  const columns = tileColumns(nas.addOns.length, fit);
  return (
    <section className="dm-addons" aria-labelledby="dm-addons-title">
      <h2 id="dm-addons-title" className="dm-region-title dm-region-title-sm">
        From your add-ons
      </h2>
      <ul className="dm-tiles" style={{ "--cols": columns } as CSSProperties}>
        {nas.addOns.map((addOn) =>
          addOn.kind === "zfs" ? (
            <Tile
              key={addOn.id}
              icon="zfs-pool"
              title="ZFS pools"
              pkg={addOn.pkg}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onNote("Opens Storage, ZFS pools.");
                  }}
                >
                  Open ZFS pools
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              <TileBody addOn={addOn} nas={nas} />
            </Tile>
          ) : addOn.kind === "raid" ? (
            <Tile
              key={addOn.id}
              icon="raid-array"
              title="RAID arrays"
              pkg={addOn.pkg}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onNote("Opens Storage, RAID arrays.");
                  }}
                >
                  Open RAID arrays
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            >
              <TileBody addOn={addOn} nas={nas} />
            </Tile>
          ) : (
            <Tile
              key={addOn.id}
              icon="plugin"
              title={addOn.pkg.replace(/^openmediavault-/u, "")}
              pkg={addOn.pkg}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onNote(
                      `Opens ${addOn.pkg} in the classic interface, in a new tab.`,
                    );
                  }}
                >
                  Open in the classic interface
                  <ExternalLink aria-hidden="true" />
                </Button>
              }
            >
              <TileBody addOn={addOn} nas={nas} />
            </Tile>
          ),
        )}
      </ul>
    </section>
  );
}
