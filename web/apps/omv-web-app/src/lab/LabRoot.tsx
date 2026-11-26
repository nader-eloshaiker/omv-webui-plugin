// SPDX-License-Identifier: GPL-3.0-or-later
// The design lab at /ui/lab: the prototypes the owner reviews before a pattern moves into the library
// and the pages. Development only: main.tsx loads it behind import.meta.env.DEV, so a production
// build emits none of it (UI-11; tools/build-check looks for the lab controls' "lx-labbar" class).
// The query string selects what is shown; it never acts (UI-4):
// screen=nas-map the dashboard prototype, the NAS map (src/lab/dashboard/NasMapLab.tsx), also what
// /ui/lab opens with no screen; screen=add-folder and screen=add-person the form prototypes
// (src/lab/forms/FormsLab.tsx); screen=folders-table and screen=disks-table the table prototypes
// (src/lab/tables/TablesLab.tsx); screen=motion the motion reel (src/lab/reel/MotionLab.tsx);
// screen=guidance the guidance prototype (src/lab/guidance/GuidanceLab.tsx); screen=charts the
// chart candidates (src/lab/charts-lab/ChartsLab.tsx).
import ChartsLab from "./charts-lab/ChartsLab.tsx";
import { CHARTS_SCREENS } from "./charts-lab/states.ts";
import NasMapLab from "./dashboard/NasMapLab.tsx";
import FormsLab from "./forms/FormsLab.tsx";
import { FORM_SCREENS } from "./forms/states.ts";
import GuidanceLab from "./guidance/GuidanceLab.tsx";
import { GUIDANCE_SCREENS } from "./guidance/states.ts";
import "./lab.css";
import MotionLab from "./reel/MotionLab.tsx";
import { REEL_SCREENS } from "./reel/states.ts";
import { TABLE_SCREENS } from "./tables/states.ts";
import TablesLab from "./tables/TablesLab.tsx";

/**
 * The dashboard, form, table, motion, guidance and chart prototypes (rethink spec 8), each in the
 * system's own look with its own controls. Any other screen, or none, opens the dashboard prototype.
 */
export default function LabRoot() {
  const screen = new URLSearchParams(window.location.search).get("screen");
  if (TABLE_SCREENS.some((s) => s === screen)) {
    return <TablesLab />;
  }
  if (REEL_SCREENS.some((s) => s === screen)) {
    return <MotionLab />;
  }
  if (GUIDANCE_SCREENS.some((s) => s === screen)) {
    return <GuidanceLab />;
  }
  if (CHARTS_SCREENS.some((s) => s === screen)) {
    return <ChartsLab />;
  }
  if (FORM_SCREENS.some((s) => s === screen)) {
    return <FormsLab />;
  }
  return <NasMapLab />;
}
