// SPDX-License-Identifier: GPL-3.0-or-later
// "Right now" (owner, 2026-11-26: the live readouts are two charts with four series): processor and
// memory on one percent scale, and one network port mirrored, in above the line and out below. For
// administrators only.
//
// The readings are only those this tab took (live/liveSamples.ts): the shell's System.getInformation
// and interface replies, each a background call (UI-14). While this region is on screen the shell
// reads every 2 seconds, on other pages every 10, never while the tab is hidden (live/liveDemand.ts).
// The charts never fill history backwards and never fetch; a failed poll leaves what they drew.
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import {
  LIVE_WINDOW_MS,
  LivePair,
  liveSpan,
  type LiveSpan,
  type LiveSummary,
} from "@omv-webui/react-ui-components";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { liveInterface, liveSeries } from "../../dashboard/nasModel.ts";
import { formatBytes } from "../../format/format.ts";
import { useLiveSamples } from "../../live/useLive.ts";

/** "10:31", on this computer's clock. */
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

const decimal = (v: number, digits: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function DashboardLive({
  devices,
  stale,
  updatedAt,
}: {
  /** Network.enumerateDevicesList, once read. */
  devices: readonly NetworkDevice[] | undefined;
  /** The shell's last poll failed: the charts keep what they drew, and say since when. */
  stale: boolean;
  updatedAt: number;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const { system, traffic } = useLiveSamples();
  const iface = liveInterface(devices ?? []);
  const s = liveSeries(system, traffic, iface, LIVE_WINDOW_MS);

  const percent = (v: number) =>
    t("dashboard.now.percent", { value: Math.round(v) });
  const rate = (v: number) =>
    t("dashboard.now.rate", { value: decimal(v, v < 1 ? 2 : 1) });
  const scale = (v: number) =>
    t("dashboard.now.rate", { value: String(Math.round(v * 100) / 100) });

  const spanWords = (span: LiveSpan): string => {
    switch (span.kind) {
      case "none":
        return t("dashboard.now.spanNone");
      case "one":
        return t("dashboard.now.spanOne", { time: clock(span.at) });
      case "since":
        return t("dashboard.now.spanSince", { time: clock(span.from) });
      case "window":
        return t("dashboard.now.spanWindow");
    }
  };
  const describe =
    (format: (v: number) => string) =>
    (summary: LiveSummary): string => {
      const { name, range, span } = summary;
      if (range === null) {
        return t("dashboard.now.describeNone", { name });
      }
      const now =
        range.now === null
          ? t("dashboard.now.describeNoValue")
          : t("dashboard.now.describeNow", { value: format(range.now) });
      const min = format(range.min);
      const max = format(range.max);
      switch (span.kind) {
        case "one":
        case "none":
          return t("dashboard.now.describeOne", { name, now });
        case "since":
          return t("dashboard.now.describeSince", {
            name,
            now,
            min,
            max,
            time: clock(span.from),
          });
        case "window":
          return t("dashboard.now.describeWindow", { name, now, min, max });
      }
    };

  const caption = t("dashboard.now.caption", {
    span: spanWords(liveSpan(s.processor, s.dropped)),
  });
  const missing = t("dashboard.now.noReading");

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <h2 id={titleId} className="text-section text-foreground">
        {t("dashboard.now.title")}
      </h2>
      <LivePair
        percent={{
          title: t("dashboard.now.percentTitle"),
          aside:
            s.memUsed === null || s.memTotal === null
              ? undefined
              : t("dashboard.now.memoryAside", {
                  used: formatBytes(s.memUsed),
                  total: formatBytes(s.memTotal),
                }),
          series: [
            { name: t("dashboard.now.processor"), points: s.processor },
            { name: t("dashboard.now.memory"), points: s.memory },
          ],
          dropped: s.dropped,
          format: percent,
          missing,
          describe: describe(percent),
        }}
        mirror={{
          title: t("dashboard.now.mirrorTitle"),
          aside: iface ?? undefined,
          above: {
            name: t("dashboard.now.in"),
            label: t("dashboard.now.inLabel"),
            points: s.received,
          },
          below: {
            name: t("dashboard.now.out"),
            label: t("dashboard.now.outLabel"),
            points: s.sent,
          },
          dropped: s.dropped,
          format: rate,
          formatScale: scale,
          missing,
          describe: describe(rate),
          describeScales: (a, b) =>
            t("dashboard.now.scales", { in: scale(a), out: scale(b) }),
          note: t("dashboard.now.note"),
        }}
        caption={caption}
      />
      {stale ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("dashboard.now.stale", { time: clock(updatedAt) })}
        </p>
      ) : null}
    </section>
  );
}
