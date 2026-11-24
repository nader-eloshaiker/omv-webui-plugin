// SPDX-License-Identifier: GPL-3.0-or-later
// @omv-webui/react-ui-components/charts: the charts drawn with Recharts (journal 2026-11-24, "Charts
// are drawn with Recharts"). A separate entry point, so Recharts never enters the main barrel or the
// app's entry chunk: it loads only in the route chunks that import from here (UI-11). The scales,
// windows and figures they use are in the main entry (chart-model), which needs no chart library.
export * from "./components/charts/bar-chart";
export * from "./components/charts/chart-parts";
export * from "./components/charts/chart-theme";
export * from "./components/charts/live-chart";
