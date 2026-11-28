// SPDX-License-Identifier: GPL-3.0-or-later
// "Add a disk" on an array's page (phase 5 RAID design 4.1): what adding a disk does to this array as it
// is, and the button to the add flow; unavailable (focusable, the reason beside it) for a level without
// copies, an array that is not running, Unknown, rebuilding or busy, roles not read, or while this
// session changes it.
import {
  Button,
  buttonClass,
  PageSection,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useAddBlockerText } from "../../hooks/useRaidBlockers.tsx";
import type { ArrayView } from "../../hooks/useRaidView.ts";
import { addDecision, arrayAddress, levelKey } from "../../raid/raidModel.ts";

export function ArrayAddSection({
  view,
  changing,
}: {
  view: ArrayView;
  changing: boolean;
}) {
  const { t } = useTranslation();
  const reasonId = useId();
  const blockerText = useAddBlockerText();
  const { row, state, report } = view;
  const decision = addDecision(levelKey(row.level), state, report, changing);
  const address = arrayAddress(row);
  return (
    <PageSection heading={t("raidAdd.section")}>
      {decision.allowed && address !== null ? (
        <>
          <p className="max-w-prose">{t(`raidAdd.sec.${decision.mode}`)}</p>
          <div>
            <Link
              to="/storage/md/$array/add"
              params={{ array: address }}
              className={buttonClass({ variant: "neutral" })}
            >
              {decision.mode === "replace"
                ? t("raidAdd.openReplace")
                : decision.mode === "spare"
                  ? t("raidAdd.openSpare")
                  : t("raidAdd.open")}
            </Link>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="neutral"
            disabled
            focusableWhenDisabled
            aria-describedby={reasonId}
          >
            {t("raidAdd.open")}
          </Button>
          <p id={reasonId} className="max-w-prose">
            {decision.allowed ? null : blockerText(decision.blocker, row.level)}
          </p>
        </div>
      )}
    </PageSection>
  );
}
