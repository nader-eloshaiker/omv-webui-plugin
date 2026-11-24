// SPDX-License-Identifier: GPL-3.0-or-later
// One of the first steps (dashboard spec 10.1, foundation 11 and 12): one row with a mark, the title,
// one short line and the next step; every explanation is one disclosure away. The state is told by the
// mark's shape for the eye and by a word for assistive technology, never by a status colour: these
// are configuration choices, not monitored health. Read as "{title}: {state}. {line}".
import {
  Button,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  Skeleton,
} from "@omv-webui/react-ui-components";
import { Circle, CircleCheck, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** What the interface found: done, not done, cannot tell, a value only the reader can judge, or reading. */
export type StepState =
  "done" | "notDone" | "notChecked" | "value" | "checking";

const MARKS = {
  done: { Icon: CircleCheck, name: "check" },
  notDone: { Icon: Circle, name: "circle" },
  notChecked: { Icon: CircleHelp, name: "question" },
} as const;

export function FirstStep({
  state,
  stateLabel,
  title,
  line,
  details,
  action,
  retry,
}: {
  state: StepState;
  /** The state in words, for assistive technology only; none for a value. */
  stateLabel?: string;
  /** What to do or check, short. */
  title: string;
  /** One short line: what was found. */
  line: ReactNode;
  /** Why it matters and how, behind "Details". */
  details?: ReactNode;
  /** The one next step, usually a link. */
  action?: ReactNode;
  /** This step's read failed: a retry for it alone. */
  retry?: () => void;
}) {
  const { t } = useTranslation();
  const mark = state === "value" || state === "checking" ? null : MARKS[state];
  return (
    <li
      data-state={state}
      aria-busy={state === "checking" || undefined}
      className="flex gap-3 border-t border-border py-row first:border-t-0 first:pt-0 last:pb-0"
    >
      <span
        aria-hidden="true"
        className="flex h-[1lh] w-4 shrink-0 items-center justify-center"
      >
        {mark ? (
          <mark.Icon data-icon={mark.name} className="size-4 text-foreground" />
        ) : state === "checking" ? (
          <Skeleton shape="block" className="size-4 rounded-full" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-0.5">
            <p className="font-medium text-foreground">
              {title}
              {stateLabel ? (
                <span className="sr-only">{`: ${stateLabel}.`}</span>
              ) : null}
            </p>
            <div className="text-sm text-muted-foreground">{line}</div>
          </div>
          {action || retry ? (
            <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
              {action}
              {retry ? (
                <Button variant="neutral" size="sm" onClick={retry}>
                  {t("common.tryAgain")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {details ? (
          <Disclosure>
            <DisclosureTrigger
              variant="inline"
              aria-label={t("checklist.detailsFor", { title })}
            >
              {t("checklist.details")}
            </DisclosureTrigger>
            <DisclosurePanel>
              <div className="flex max-w-prose flex-col gap-1 text-sm text-muted-foreground">
                {details}
              </div>
            </DisclosurePanel>
          </Disclosure>
        ) : null}
      </div>
    </li>
  );
}
