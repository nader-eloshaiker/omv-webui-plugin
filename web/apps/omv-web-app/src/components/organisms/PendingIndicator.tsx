// SPDX-License-Identifier: GPL-3.0-or-later
// The pending pill in the top bar (foundation 10; style guide 5.8), for administrators: a quiet chip
// while nothing waits, the pending gold with the count once something does, popping as the count rises.
// The pending flight lands here (pending/flight.ts). Pressing it brings the reader to the band: to the
// top of the page, where the band comes back out of the pill, with focus on the band.
import { useTasks } from "@omv-webui/react-api-omv/tasks";
import {
  PendingPill,
  prefersReducedMotion,
} from "@omv-webui/react-ui-components";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSystemInformation } from "../../hooks/useSystemInformation.ts";
import { usePendingFlight } from "../../pending/flight.ts";
import { pendingModules } from "../../pending/modules.ts";
import { PENDING_BAND_ID } from "../../shell/ids.ts";

export function PendingIndicator() {
  const { t } = useTranslation();
  const info = useSystemInformation();
  // The band's apply and undo run as tasks under these names (useBandActions); while one runs the pill
  // shows a spinner in place of its mark.
  const bandTasks = new Set([
    t("pending.applyTask"),
    t("pending.undoTask"),
    t("netApply.queuedTask"),
  ]);
  const applying = useTasks().some(
    (task) => task.state === "running" && bandTasks.has(task.label),
  );
  const pillRef = useRef<HTMLButtonElement>(null);
  usePendingFlight(pillRef);
  const count = pendingModules(info.data?.dirtyModules).length;
  const dirty = info.data?.configDirty === true || count > 0;
  const shown = !dirty ? 0 : count > 0 ? count : null;
  return (
    <PendingPill
      ref={pillRef}
      count={shown}
      applying={applying}
      disabled={shown === 0}
      label={
        shown === 0
          ? t("pending.indicatorNone")
          : shown === null
            ? t("pending.indicatorUnknown")
            : t("pending.indicator", { count: shown })
      }
      word={t("pending.indicatorShort")}
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        document
          .getElementById(PENDING_BAND_ID)
          ?.focus({ preventScroll: true });
      }}
    />
  );
}
