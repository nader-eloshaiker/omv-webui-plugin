// SPDX-License-Identifier: GPL-3.0-or-later
// Typed keys: `t("signIn.title")` is checked against the English catalogue.
import "i18next";
import type common from "../../locales/en/common.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: { common: typeof common };
    returnNull: false;
  }
}
