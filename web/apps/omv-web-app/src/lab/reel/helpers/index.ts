// SPDX-License-Identifier: GPL-3.0-or-later
// The motion helpers of rethink spec 8 row 7, under the names the lab has used. They now live in the
// component library (@omv-webui/react-ui-components, components/motion); the ones that read a
// preference store are the app's adapters in src/hooks. New code imports from those directly; this
// file stays so lab prototypes written against it keep working.
export {
  MotionScope,
  ReducedMotionContext as MotionScopeContext,
  REDUCED_MOTION_TOKENS as REDUCED_TOKENS,
  animateElement as animate,
  curveAt,
  drawPath,
  durationAt,
  heldOrder,
  animationSettled as settled,
  systemReducedMotion,
  timeMs,
  useFlip,
  useSystemReducedMotion,
} from "@omv-webui/react-ui-components";
export type {
  CurveToken,
  DrawPathOptions,
  DurationToken,
  Flip,
  FlipOptions,
} from "@omv-webui/react-ui-components";
export { forgetFirstTime, useFirstTime } from "../../../hooks/useFirstTime.ts";
export {
  reducedMotionAt,
  useReducedMotion,
} from "../../../hooks/useMotionPreference.ts";
