// SPDX-License-Identifier: GPL-3.0-or-later
// The formatting rules of format.ts with the catalogue's words, for components.
import { useTranslation } from "react-i18next";
import {
  durationParts,
  formatEpochSeconds,
  speedParts,
  wholePercent,
} from "./format.ts";

export function useFormat() {
  const { t } = useTranslation();

  const duration = (seconds: number): string => {
    const result = durationParts(seconds);
    if (result.kind === "underMinute") {
      return t("format.duration.underMinute");
    }
    const [first, second] = result.parts.map(({ unit, count }) =>
      t(`format.duration.${unit}`, { count }),
    );
    return second === undefined
      ? (first ?? "")
      : t("format.duration.pair", { first, second });
  };

  const percent = (value: number): string => {
    const whole = wholePercent(value);
    return whole === "under1" ? t("format.percentUnder1") : `${String(whole)}%`;
  };

  /** A moment on this computer's clock, in the browser's locale: 10:12:04. */
  const clock = (ms: number): string =>
    new Date(ms).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  /** A count with the locale's grouping: 4,210. */
  const count = (n: number): string => n.toLocaleString(undefined);

  /** A log entry's moment, from epoch seconds, in this computer's locale and time zone (D11). */
  const dateTime = formatEpochSeconds;

  /** A link speed in Mbit/s: "1 Gbit/s"; null when not reported. */
  const speed = (mbit: number): string | null => {
    const parts = speedParts(mbit);
    if (parts === null) {
      return null;
    }
    return t(parts.unit === "mbit" ? "format.speedMbit" : "format.speedGbit", {
      value: parts.value,
    });
  };

  /** Whole degrees Celsius: "34 °C". */
  const celsius = (degrees: number): string =>
    t("format.celsius", { value: String(Math.round(degrees)) });

  return { duration, percent, clock, count, dateTime, speed, celsius };
}
