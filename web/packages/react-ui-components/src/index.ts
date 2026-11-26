// SPDX-License-Identifier: GPL-3.0-or-later
// The public surface of @omv-webui/react-ui-components. App-agnostic: nothing here knows the API, the
// router or an OMV concept beyond the style guide's vocabulary, and no component carries its own words.
export * from "./components/access-grid/access-grid";
export * from "./components/address-fields/address-fields";
export * from "./components/arrangement/arrangement";
export * from "./components/arrangement/arrangement-model";
export * from "./components/banner/notice-banner";
export * from "./components/breadcrumbs/breadcrumbs";
export * from "./components/button/button";
export { buttonClass, buttonRowClass } from "./components/button/button-class";
export * from "./components/capacity-meter/capacity-meter";
export * from "./components/card/card";
export * from "./components/chart-model/chart-model";
export * from "./components/checkbox-field/checkbox-field";
export * from "./components/checkbox-list-field/checkbox-list-field";
export * from "./components/checkbox/checkbox";
export * from "./components/checklist/checklist";
export * from "./components/client-field/client-field";
export * from "./components/command-palette/command-palette";
export * from "./components/command-palette/use-command-keys";
export * from "./components/confirm-dialog/confirm-dialog";
export * from "./components/connection-line/connection-line";
export * from "./components/connection-map/connection-map";
export * from "./components/connection-map/connection-map-model";
export * from "./components/copy-button/copy-button";
export * from "./components/copy-direction/copy-direction";
export * from "./components/crossfade/crossfade";
export * from "./components/delete-picture/delete-picture";
export * from "./components/density-toggle/density-toggle";
export * from "./components/dialog/dialog";
export * from "./components/direction-summary/direction-summary";
export * from "./components/disclosure/disclosure";
export * from "./components/drive-bay/drive-bay";
export * from "./components/empty-pending-picture/empty-pending-picture";
export * from "./components/empty-state/empty-state";
export * from "./components/external-link/external-link";
export * from "./components/fact-list/fact-list";
export * from "./components/field/field";
export * from "./components/firewall-rule-list/firewall-rule-list";
export {
  flyPendingMark,
  popElement,
  prefersReducedMotion,
  whenLanded,
} from "./components/flight/flight";
export * from "./components/health-list/health-list";
export * from "./components/help/help";
export * from "./components/icon/icon";
export * from "./components/impact-line/impact-line";
export * from "./components/inline-alert/inline-alert";
export * from "./components/job-runner/job-runner";
export * from "./components/leaving-item/leaving-item";
export * from "./components/leaving-item/use-leaving-items";
export * from "./components/line-chart/line-chart";
export * from "./components/live-figure/live-figure";
export * from "./components/live-tile/live-tile";
export * from "./components/member-picker/member-picker";
export * from "./components/menu/menu";
export * from "./components/motion/draw-path";
export * from "./components/motion/motion";
export * from "./components/motion/motion-scope";
export {
  animateElement,
  animationSettled,
  curveAt,
  durationAt,
  timeMs,
} from "./components/motion/motion-tokens";
export type {
  CurveToken,
  DurationToken,
} from "./components/motion/motion-tokens";
export {
  REDUCED_MOTION_TOKENS,
  ReducedMotionContext,
  applyReducedMotion,
  reducedMotionAt,
  systemReducedMotion,
  useReducedMotion,
  useSystemReducedMotion,
} from "./components/motion/reduced-motion";
export * from "./components/motion/use-draw-path";
export * from "./components/motion/use-first-time";
export * from "./components/motion/use-flip";
export * from "./components/new-password-fields/new-password-fields";
export * from "./components/now-after-table/now-after-table";
export * from "./components/number-field/number-field";
export * from "./components/page-answer/page-answer";
export * from "./components/page-tabs/page-tabs";
export * from "./components/pending-band/pending-band";
export * from "./components/pending-pill/pending-pill";
export * from "./components/port-field/port-field";
export * from "./components/progress-bar/progress-bar";
export * from "./components/radio-group-field/radio-group-field";
export * from "./components/reconnect-watch/reconnect-watch";
export * from "./components/reconnect-watch/use-elapsed-seconds";
export * from "./components/recovery-card/recovery-card";
export * from "./components/ring/ring";
export * from "./components/schedule-field/schedule-field";
export * from "./components/schedule-field/schedule-value";
export * from "./components/search-field/search-field";
export * from "./components/secret-field/secret-field";
export * from "./components/segmented-choice/segmented-choice";
export * from "./components/select/select";
export * from "./components/shell/shell";
export * from "./components/side-nav/side-nav";
export * from "./components/size-field/size-field";
export * from "./components/skeleton/skeleton";
export * from "./components/skip-link/skip-link";
export * from "./components/sparkline/sparkline";
export * from "./components/status/status";
export * from "./components/status/status-kinds";
export * from "./components/switch/switch";
export * from "./components/table-pagination/table-pagination";
export * from "./components/table/table";
export * from "./components/task-log/strip-control";
export * from "./components/task-log/task-log";
export * from "./components/task-row/task-row";
export * from "./components/text/identifier";
export * from "./components/text/isolated-identifier";
export * from "./components/text/server-message";
export * from "./components/textarea-field/textarea-field";
export * from "./components/tip/show-tips-switch";
export * from "./components/tip/tip";
export * from "./components/tip/tips-command";
export {
  useCurrentTip,
  useShowTips,
  useTipTurn,
  useTips,
} from "./components/tip/tips-context";
export type { TipsContextValue } from "./components/tip/tips-context";
export * from "./components/tip/tips-provider";
export * from "./components/tip/use-hide-tips-offer";
export * from "./components/toast/toast";
export * from "./components/toast/use-toast";
export * from "./components/tooltip/tooltip";
export * from "./components/top-bar/top-bar";
export * from "./components/type-to-confirm/type-to-confirm-field";
export { typedMatches } from "./components/type-to-confirm/typed-matches";
export * from "./components/ui-provider/ui-provider";
export * from "./components/used-by/used-by-panel";
// The hand-drawn charts the owner chose (journal 2026-11-26, "The charts are settled"): no Recharts.
export * from "./components/disk-temperatures/disk-temperatures";
export * from "./components/disk-temperatures/disk-temperatures-model";
export * from "./components/drive-picture/drive-picture";
export * from "./components/drive-picture/drive-picture-model";
export * from "./components/live-pair/live-pair";
export {
  LIVE_INTERVAL_MS,
  LIVE_WINDOW_MS,
  MIN_RATE_SCALE,
  liveRange,
  liveSpan,
  liveSummary,
  newestOf,
  rateScale,
} from "./components/live-pair/live-pair-model";
export type {
  LivePoint,
  LiveRange,
  LiveSpan,
  LiveSummary,
} from "./components/live-pair/live-pair-model";
export * from "./components/waffle/waffle";
export * from "./components/waffle/waffle-model";
export { cn } from "./utils";
