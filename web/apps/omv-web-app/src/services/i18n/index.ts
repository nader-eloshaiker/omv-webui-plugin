// SPDX-License-Identifier: GPL-3.0-or-later
// i18next with the English catalogue bundled, so the first paint is already in words and nothing is
// fetched (UI-7). Every user-facing string comes from src/locales; keys are typed (i18next.d.ts).
// Interpolated values are rendered by React as text (UI-2), so i18next does not escape them again.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "../../locales/en/common.json";

export const defaultNS = "common";
export const resources = { en: { common } } as const;

void i18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en"],
  ns: [defaultNS],
  defaultNS,
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
