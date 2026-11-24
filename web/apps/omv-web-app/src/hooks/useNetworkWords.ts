// SPDX-License-Identifier: GPL-3.0-or-later
// The network safeguard's words that are strings rather than sentences with slots (phase 5 network
// design 0.2, 1.4, 1.5): the elapsed time of the reconnect watch (counting up, never down), and the
// plain-text note behind "Copy the current settings" (never a password, 0.6), and the Save button of
// a form whose change may move or cut this page ("Review the change…", 1.4).
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceRow,
  GeneralSettings,
  IfaceSettings,
} from "../network/dto.ts";
import {
  addressInUse,
  currentSettingsNote,
  type HowKey,
  type NoteLabel,
} from "../network/ifaceModel.ts";
import type { Impact } from "../network/impact.ts";

/** Whether a form's Save opens the change flow (1.4): its change Moves or May cut this page. */
export const opensFlow = (impact: Impact | null): boolean =>
  impact !== null && (impact.class === "moves" || impact.class === "mayCut");

/**
 * A form's Save button for a change classified by impact.ts (1.4, 19.2): "Review the change…" when
 * the change Moves or May cut this page, so the reader sees before pressing that it is not an
 * ordinary save; unavailable when Refused. Put `impactLineId` on the form's NetworkImpactLine (its
 * `id`) and in the button's `aria-describedby`, so the class is heard with the button.
 */
export function useReviewButton(impact: Impact | null) {
  const { t } = useTranslation();
  const impactLineId = useId();
  const review = opensFlow(impact);
  return {
    label: review ? t("netChange.review") : t("common.save"),
    /** Save opens the change flow instead of saving. */
    opensFlow: review,
    /** The change is Refused: Save is unavailable, the impact line says why. */
    refused: impact?.class === "refused",
    impactLineId,
  };
}

export function useNetworkWords() {
  const { t } = useTranslation();

  /** "18 seconds", "1 minute, 5 seconds": elapsed time (1.5), never a countdown. */
  const elapsed = (seconds: number): string => {
    const whole = Math.max(0, Math.floor(seconds));
    if (whole < 60) {
      return t("format.duration.seconds", { count: whole });
    }
    const minutes = t("format.duration.minutes", {
      count: Math.floor(whole / 60),
    });
    const rest = whole % 60;
    return rest === 0
      ? minutes
      : t("format.duration.pair", {
          first: minutes,
          second: t("format.duration.seconds", { count: rest }),
        });
  };

  const noteValue = (label: NoteLabel, value: string): string => {
    if (label === "ipv4How" || label === "ipv6How") {
      return value.startsWith("interfaces.how.") ? t(value as HowKey) : value;
    }
    if (label === "mtu") {
      const now = /^0 \((.*)\)$/u.exec(value);
      if (now !== null) {
        return t("netChange.note.mtuStandardNow", { size: now[1] });
      }
      return value === "0"
        ? t("netChange.note.mtuStandard")
        : t("netChange.note.mtuBytes", { size: value });
    }
    return value;
  };

  const lines = (entries: readonly { label: string; value: string }[]) =>
    entries.map((e) => `${e.label}: ${e.value}`).join("\n");

  /**
   * "Copy the current settings" for an interface (1.4 item 5): its name, how each family gets its
   * address, the addresses with their sizes, the router addresses, the name servers, the search
   * domains and the packet size. Never a password.
   */
  const ifaceNote = (
    settings: IfaceSettings,
    live: Parameters<typeof currentSettingsNote>[1],
  ): string =>
    lines(
      currentSettingsNote(settings, live).map(({ label, value }) => ({
        label: t(`netChange.note.${label}`),
        value: noteValue(label, value),
      })),
    );

  /** The note for the name of this NAS. */
  const nameNote = (general: GeneralSettings): string =>
    lines([
      { label: t("netChange.note.hostname"), value: general.hostname },
      { label: t("netChange.note.domain"), value: general.domainname },
    ]);

  /**
   * The note from what interfaces use now (the band's "Before you apply", 1.8): the stored settings
   * are the pending ones then, so the addresses in use are what worked.
   */
  const liveNote = (rows: readonly DeviceRow[]): string =>
    rows
      .map((row) => {
        const entries = [
          { label: t("netChange.note.iface"), value: row.devicename },
        ];
        const v4 = addressInUse(row, 4);
        if (v4 !== null) {
          entries.push({
            label: t("netChange.note.ipv4Address"),
            value: v4.text,
          });
        }
        if (row.gateway.trim() !== "") {
          entries.push({
            label: t("netChange.note.ipv4Gateway"),
            value: row.gateway.trim(),
          });
        }
        const v6 = addressInUse(row, 6);
        if (v6 !== null) {
          entries.push({
            label: t("netChange.note.ipv6Address"),
            value: v6.text,
          });
        }
        if (row.gateway6.trim() !== "") {
          entries.push({
            label: t("netChange.note.ipv6Gateway"),
            value: row.gateway6.trim(),
          });
        }
        entries.push({
          label: t("netChange.note.mtu"),
          value: t("netChange.note.mtuBytes", { size: String(row.mtu).trim() }),
        });
        return lines(entries);
      })
      .join("\n\n");

  return { elapsed, ifaceNote, nameNote, liveNote };
}
