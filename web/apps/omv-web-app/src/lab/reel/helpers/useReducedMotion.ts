// SPDX-License-Identifier: GPL-3.0-or-later
// Kept for the lab files that import it by this path (the chart lab): reduced motion comes from the
// component library, and the two that also read the "Animations" preference from the app's adapter
// (src/hooks/useMotionPreference.ts).
export {
  ReducedMotionContext as MotionScopeContext,
  REDUCED_MOTION_TOKENS as REDUCED_TOKENS,
  systemReducedMotion,
  useSystemReducedMotion,
} from "@omv-webui/react-ui-components";
export {
  reducedMotionAt,
  useReducedMotion,
} from "../../../hooks/useMotionPreference.ts";
