// SPDX-License-Identifier: GPL-3.0-or-later
// The chosen charts at real size, where the owner judges them: a copy of one row of the NAS map (the
// dashboard lab's markup and stylesheet) with the waffle in its storage cell, a copy of the "Right
// now" strip with the two live charts, and the temperatures along one scale under them; then the
// Disks page's temperatures, the bay in its order as caddies (the lead's suggestion: the spread on
// the dashboard, the place in the bay on the Disks page).
// Development only (UI-11).
import type { IconName } from "@omv-webui/react-ui-components";
import { Icon, StatusIcon } from "@omv-webui/react-ui-components";
import type { ItemProps } from "../dashboard/Bay.tsx";
import { SlotTile } from "../dashboard/Bay.tsx";
import type { Layout, MapDisk } from "../dashboard/model.ts";
import type { Series } from "./feed.ts";
import { PairedStrip } from "./LiveCharts.tsx";
import type { DiskTemp, Space } from "./model.ts";
import { spanWords } from "./model.ts";
import { Waffle } from "./SpaceCharts.tsx";
import { TempCaddies, TempStacks } from "./TempCharts.tsx";

const noop = () => undefined;

function item(key: string): ItemProps {
  return {
    ref: noop,
    "data-key": key,
    "data-trace": undefined,
    tabIndex: 0,
    onPointerEnter: noop,
    onPointerLeave: noop,
    onFocus: noop,
    onBlur: noop,
  };
}

/** DiskMgmt.getList's sda, as the dashboard lab has it. */
const SDA: MapDisk = {
  id: "d:sda",
  device: "sda",
  kind: "hdd",
  size: "3.6 TiB",
  health: "ok",
  word: "OK",
  temp: 36,
  power: "awake",
  feeds: ["s:data"],
};

/** ShareMgmt.getList on the Data drive, with the ways in that reach each (SMB and NFS share lists). */
const FOLDERS: { name: string; via: IconName[]; words: string }[] = [
  { name: "Photos", via: ["service-smb"], words: "Windows and Mac" },
  {
    name: "Music",
    via: ["service-smb", "service-nfs"],
    words: "Windows and Mac and Linux",
  },
  { name: "Documents", via: ["service-smb"], words: "Windows and Mac" },
];

export function InPlace({
  space,
  series,
  paused,
  disks,
  readAt,
  layout,
  onNote,
}: {
  space: Space;
  series: Series;
  disks: readonly DiskTemp[];
  readAt: string;
  paused: boolean;
  layout: Layout;
  onNote: (words: string) => void;
}) {
  const tone = space.over ? "warning" : undefined;
  return (
    <div className="ch-inplace">
      <p className="ch-size-title">On the dashboard</p>
      <section
        className="dm-map"
        data-layout={layout}
        aria-labelledby="ch-map-title"
      >
        <header className="dm-map-head">
          <h3 id="ch-map-title" className="dm-region-title">
            Your NAS
          </h3>
        </header>
        <div className="dm-body">
          <div className="dm-grid">
            <div className="dm-cols">
              <span className="dm-edge" />
              <span className="dm-col" data-col="disks">
                <span className="dm-col-title">Disks</span>
              </span>
              <span className="dm-col" data-col="storage">
                <span className="dm-col-title">Storage</span>
              </span>
              <span className="dm-col" data-col="folders">
                <span className="dm-col-title">Shared folders</span>
              </span>
            </div>
            <ul className="dm-rows">
              <li
                className="dm-row"
                data-kind="storage"
                data-tone={tone}
                aria-label={space.name}
              >
                <span className="dm-edge" aria-hidden="true">
                  {tone ? <StatusIcon status={tone} /> : null}
                </span>
                <span className="dm-cell dm-cell-disks">
                  <span className="dm-bay">
                    <span className="dm-slot-wrap">
                      <SlotTile
                        disk={SDA}
                        alsoIn={[]}
                        item={item("sda")}
                        onOpen={onNote}
                      />
                    </span>
                  </span>
                  <span className="dm-wire" aria-hidden="true" />
                </span>
                <span className="dm-cell dm-cell-storage">
                  <span className="dm-store" data-health={tone}>
                    <button
                      type="button"
                      className="dm-store-main"
                      onClick={() => {
                        onNote(`Opens ${space.name}.`);
                      }}
                    >
                      <Icon name="file-system" size={20} motion="none" />
                      <span className="dm-store-words">
                        <span className="dm-store-name">
                          <bdi>{space.name}</bdi>
                        </span>
                        <span className="dm-store-tech">{space.tech}</span>
                      </span>
                    </button>
                    <span className="ch-inplace-meter">
                      <Waffle space={space} size="map" />
                    </span>
                  </span>
                </span>
                <span className="dm-cell dm-cell-folders" data-tone={tone}>
                  <span
                    className="dm-wire"
                    data-tone={tone}
                    aria-hidden="true"
                  />
                  <span className="dm-folders">
                    {FOLDERS.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        className="dm-folder"
                        aria-label={`${f.name}: reached by ${f.words}`}
                        onClick={() => {
                          onNote(`Opens the shared folder ${f.name}.`);
                        }}
                      >
                        <Icon name="shared-folder" size={16} motion="none" />
                        <span className="dm-folder-name">{f.name}</span>
                        <span className="dm-folder-via">
                          {f.via.map((w) => (
                            <span key={w} className="dm-folder-way">
                              <Icon name={w} size={16} motion="none" />
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
      <section
        className="dm-live"
        data-layout={layout}
        aria-labelledby="ch-live-title"
      >
        <header className="dm-region-head">
          <h3 id="ch-live-title" className="dm-region-title">
            Right now
          </h3>
          <p className="dm-region-note">
            {spanWords(series.cpu, series.dropped)}, a reading every 2 seconds
            {paused ? ", paused" : ""}
          </p>
        </header>
        <PairedStrip s={series} />
      </section>
      <section
        className="dm-live"
        data-layout={layout}
        aria-labelledby="ch-temps-title"
      >
        <header className="dm-region-head">
          <h3 id="ch-temps-title" className="dm-region-title">
            Disk temperatures
          </h3>
          <p className="dm-region-note">Read at {readAt}</p>
        </header>
        <TempStacks disks={disks} readAt={readAt} />
      </section>
      <p className="ch-size-title">On the Disks page</p>
      <section
        className="dm-live"
        data-layout={layout}
        aria-labelledby="ch-bay-title"
      >
        <header className="dm-region-head">
          <h3 id="ch-bay-title" className="dm-region-title">
            Temperatures in the bay
          </h3>
          <p className="dm-region-note">Read at {readAt}</p>
        </header>
        <TempCaddies disks={disks} readAt={readAt} />
      </section>
    </div>
  );
}
