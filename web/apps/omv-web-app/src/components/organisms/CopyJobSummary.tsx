// SPDX-License-Identifier: GPL-3.0-or-later
// The summary before a copy job is saved (phase 5 services design 5.5, R2): the direction with its
// arrow and sentence, when it runs, the deletion and no-encryption items with the warning shape, how
// it signs in, email, and what happens next. "Save and try it" (filled) and, without deletion, "Save
// and turn on" (neutral); "Back" returns to the form with every choice kept. Neither needs typing:
// nothing has run yet. The library's JobSummary takes one confirm button, so the two are laid out
// here on the same pattern.
import type {
  SharedFolder,
  SshCertificateListDataItem,
} from "@omv-webui/react-api-omv/generated";
import { Button } from "@omv-webui/react-ui-components";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import { useJobWords } from "../../hooks/useJobWords.ts";
import {
  remoteOf,
  sidesOfChoices,
  type JobChoices,
} from "../../services/jobModel.ts";
import { scheduleFields } from "../../services/jobSchedule.ts";
import { FolderNameText } from "../atoms/FolderNameText.tsx";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { JobDirection, JobSideView } from "../molecules/JobDirection.tsx";

export function CopyJobSummary({
  choices,
  folders,
  keys,
  nasZone,
  hasPassword,
  onTry,
  onTurnOn,
  onBack,
  busy = false,
}: {
  choices: JobChoices;
  folders: readonly SharedFolder[] | undefined;
  keys: readonly SshCertificateListDataItem[] | undefined;
  nasZone: string | undefined;
  hasPassword: boolean;
  onTry: () => void;
  /** Absent when the job deletes: it is saved for trial runs only. */
  onTurnOn?: () => void;
  onBack: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const words = useJobWords(nasZone);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const sides = sidesOfChoices(choices);
  const remote = remoteOf(choices);
  const when =
    choices.schedule.mode === "manual"
      ? t("addJob.summary.manual")
      : t("addJob.summary.when", {
          when: words.when({
            ...scheduleFields(choices.schedule),
            enable: true,
          }),
        });
  const items: { id: string; content: ReactNode; warning?: boolean }[] = [
    { id: "when", content: when },
  ];
  if (sides !== null && choices.deletes) {
    items.push({
      id: "deletes",
      warning: true,
      content: (
        <Trans
          i18nKey="addJob.summary.deletes"
          components={{
            src: <JobSideView side={sides.from} folders={folders} />,
            dest: <JobSideView side={sides.to} folders={folders} />,
          }}
        />
      ),
    });
  }
  if (remote !== undefined) {
    const host = <IdentifierText value={inertBidi(remote.host)} />;
    if (remote.via === "ssh") {
      const key = keys?.find((k) => k.uuid === remote.key);
      items.push({
        id: "signIn",
        content: (
          <Trans
            i18nKey="addJob.summary.ssh"
            components={{
              host,
              user: <IdentifierText value={inertBidi(remote.user)} />,
              key: <FolderNameText value={key?.comment ?? remote.key} />,
            }}
          />
        ),
      });
    } else {
      items.push({
        id: "signIn",
        content: (
          <Trans
            i18nKey="addJob.summary.rsyncd"
            values={{
              asUser:
                remote.user === ""
                  ? ""
                  : t("addJob.summary.asUser", {
                      user: inertBidi(remote.user),
                    }),
              withPassword: hasPassword ? t("addJob.summary.withPassword") : "",
            }}
            components={{ host }}
          />
        ),
      });
      items.push({
        id: "noEncryption",
        warning: true,
        content: t("addJob.noEncryption"),
      });
    }
  }
  if (choices.sendemail) {
    items.push({ id: "email", content: t("addJob.summary.email") });
  }
  return (
    <section
      className="flex max-w-2xl flex-col gap-3"
      aria-labelledby="job-summary-title"
    >
      <h2
        id="job-summary-title"
        ref={titleRef}
        tabIndex={-1}
        className="text-lg font-semibold outline-hidden"
      >
        {t("addJob.summary.title")}
      </h2>
      {sides === null ? null : <JobDirection sides={sides} folders={folders} />}
      <ul className="flex list-disc flex-col gap-1 ps-5 text-base marker:text-muted-foreground">
        {items.map((item) =>
          item.warning === true ? (
            <li key={item.id} className="relative list-none">
              <TriangleAlert
                aria-hidden="true"
                className="absolute -start-5 top-[calc((1lh-1rem)/2)] size-4 text-muted-foreground"
              />
              {item.content}
            </li>
          ) : (
            <li key={item.id}>{item.content}</li>
          ),
        )}
      </ul>
      <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm text-muted-foreground">
        <li>{t("addJob.summary.nextTry")}</li>
        {onTurnOn === undefined ? null : <li>{t("addJob.summary.nextOn")}</li>}
      </ol>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button variant="neutral" onClick={onBack} disabled={busy}>
          {t("addJob.back")}
        </Button>
        {onTurnOn === undefined ? null : (
          <Button variant="neutral" onClick={onTurnOn} disabled={busy}>
            {t("addJob.saveOn")}
          </Button>
        )}
        <Button onClick={onTry} loading={busy}>
          {t("addJob.saveTry")}
        </Button>
      </div>
    </section>
  );
}
