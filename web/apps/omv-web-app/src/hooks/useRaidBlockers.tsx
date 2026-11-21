// SPDX-License-Identifier: GPL-3.0-or-later
// The RAID refusals in words (phase 5 RAID design 4.1, 5.1): why a disk cannot be added to an array or
// taken out of it now, each sentence with what to wait for. A disk the server names sits in the
// sentence as text (Slotted, UI-2).
import { Identifier } from "@omv-webui/react-ui-components";
import { useTranslation } from "react-i18next";
import { Slotted } from "../components/atoms/Slotted.tsx";
import type { AddBlocker, RemoveBlocker } from "../raid/raidModel.ts";
import { useRaidWords } from "./useRaidWords.tsx";

export function useAddBlockerText() {
  const { t } = useTranslation();
  const words = useRaidWords();
  return (blocker: AddBlocker, level: string) => {
    switch (blocker.kind) {
      case "level":
        return t("raidAdd.blocked.level", { level: words.levelWord(level) });
      case "notRunning":
        return t("raidAdd.blocked.notRunning");
      case "unknown":
        return t("raidState.unknownBlocks");
      case "rolesUnknown":
        return t("raidRole.unreadBlocks");
      case "rebuilding":
        return blocker.disk === null ? (
          t("raidAdd.blocked.rebuildingNoDisk")
        ) : (
          <Slotted
            sentence={(tokens) => t("raidAdd.blocked.rebuilding", tokens)}
            values={{ disk: <Identifier>{blocker.disk}</Identifier> }}
          />
        );
      case "busy":
        return t("raidAdd.blocked.busy", {
          what: words.busyWord(blocker.what),
        });
      case "changing":
        return t("raidAdd.blocked.changing");
    }
  };
}

export function useRemoveBlockerText() {
  const { t } = useTranslation();
  const words = useRaidWords();
  return (blocker: RemoveBlocker, level: string): string => {
    switch (blocker.kind) {
      case "level":
        return t("raidRemove.blocked.level", { level: words.levelWord(level) });
      case "notRunning":
        return t("raidRemove.blocked.notRunning");
      case "unknown":
        return t("raidState.unknownBlocks");
      case "rolesUnknown":
        return t("raidRole.unreadBlocks");
      case "rebuilding":
        return t("raidRemove.blocked.rebuilding");
      case "degraded":
        return t("raidRemove.blocked.degraded");
      case "busy":
        return t("raidRemove.blocked.busy", {
          what: words.busyWord(blocker.what),
        });
      case "changing":
        return t("raidAdd.blocked.changing");
      case "role":
        return t("raidRemove.blocked.role");
    }
  };
}
