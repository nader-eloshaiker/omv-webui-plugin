// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's attention list (phase 3 design 1.4), worst first, shown only when it has rows. A
// needed restart is a monitored condition that wants attention soon, so it is a Warning (not pending
// yellow: the band's Apply cannot fix it). A clock difference is advice, so it has no status colour,
// only a clock icon and its words. Each row links to the fixed classic page that fixes it (UI-3).
import { Card, ExternalLink, StatusPill } from "@omv-webui/react-ui-components";
import { Clock } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AttentionRow } from "../../dashboard/dashboard.ts";
import { useFormat } from "../../format/useFormat.ts";
import { CLASSIC, CLASSIC_HOME } from "../../navigation/navigation.ts";

export function AttentionList({ rows }: { rows: readonly AttentionRow[] }) {
  const { t } = useTranslation();
  const format = useFormat();
  const labelId = useId();
  if (rows.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-2">
      <h2 id={labelId} className="sr-only">
        {t("dashboard.attention.label")}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <Card
            key={row.kind}
            render={<li />}
            className="flex-row flex-wrap items-start gap-x-3 gap-y-2 p-4"
          >
            {row.kind === "restart" ? (
              <StatusPill status="warning" className="shrink-0">
                {t("dashboard.attention.warning")}
              </StatusPill>
            ) : (
              <Clock
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            )}
            <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
              <p>
                {row.kind === "restart"
                  ? t("dashboard.attention.restart")
                  : t("dashboard.attention.clock", {
                      duration: format.duration(row.seconds),
                    })}
              </p>
              <p>
                {row.kind === "restart" ? (
                  <ExternalLink
                    href={CLASSIC_HOME}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("dashboard.attention.restartLink")}
                  </ExternalLink>
                ) : (
                  <ExternalLink
                    href={CLASSIC.dateTime}
                    newTabLabel={t("app.newTab")}
                  >
                    {t("dashboard.attention.clockLink")}
                  </ExternalLink>
                )}
              </p>
            </div>
          </Card>
        ))}
      </ul>
    </section>
  );
}
