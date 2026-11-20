// SPDX-License-Identifier: GPL-3.0-or-later
// The formatting rules of format.ts with the catalogue's words, for components.
import { useTranslation } from "react-i18next";
import { durationParts, wholePercent } from "./format.ts";

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

  return { duration, percent, clock };
}
