// SPDX-License-Identifier: GPL-3.0-or-later
// "Delete this person", last on their page after a divider (phase 5 users design 7.1; 0.8, 0.10;
// P9): what deleting does in one sentence, then "Delete {{name}}…" (neutral; the destructive form is
// only on the dialog's confirm button), unavailable (aria-disabled, still focusable) with the reason
// beside it: the signed-in person, an administrator while the reader is not known (fail closed), a
// read the dialog rests on failed, or an action on them running in this session. Pressing it opens the
// dialog, which reads everything again before it shows anything (7.2).
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { Button, PageSection } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import {
  deleteBlocker,
  isPersonDeleting,
  personDeleteOf,
  personDeletes,
  type DeleteStep,
} from "../../users/deletePersonFlow.ts";
import type { SelfReading } from "../../users/userModel.ts";
import { accountId, usersSession } from "../../users/usersSession.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";
import {
  DeleteBlockerWords,
  PersonDeleteDialog,
  type PersonDeleteOutcome,
} from "./PersonDeleteDialog.tsx";

export function PersonDeleteSection({
  person,
  self,
  unread,
  onRetry,
  onShowCurrent,
  onDone,
}: {
  person: UserAccount;
  self: SelfReading;
  /** A read the dialog rests on failed on the page: the folders, the SMB shares, the home setting. */
  unread: { error: unknown } | null;
  onRetry: () => void;
  onShowCurrent: () => void;
  onDone: (outcome: PersonDeleteOutcome, stoppedAt?: DeleteStep) => void;
}) {
  const { t } = useTranslation();
  useMemoryStore(personDeletes);
  const memory = useMemoryStore(usersSession);
  const openRef = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const name = person.name;
  const run = personDeleteOf(name);
  const deleting = isPersonDeleting(run) || run !== undefined;
  const running = memory.running[accountId("user", name)] ?? null;
  const blocker = deleting
    ? null
    : deleteBlocker({ self, person, unread, running });

  return (
    <PageSection
      heading={t("personDelete.title")}
      className="border-t border-border pt-6"
    >
      <p className="max-w-prose text-sm">
        <Trans
          i18nKey="personDelete.intro"
          components={{ name: <PersonNameText value={name} /> }}
        />
      </p>
      <div className="flex flex-col items-start gap-pair">
        <Button
          ref={openRef}
          variant="neutral"
          disabled={blocker !== null}
          focusableWhenDisabled
          aria-describedby={blocker === null ? undefined : reasonId}
          onClick={blocker === null ? () => setOpen(true) : undefined}
        >
          {t("personDelete.open", { name: isolateName(name) })}
        </Button>
        {blocker === null ? null : (
          <div id={reasonId} className="text-sm">
            <DeleteBlockerWords
              blocker={blocker}
              name={name}
              onRetry={onRetry}
            />
          </div>
        )}
      </div>
      <PersonDeleteDialog
        open={open}
        onClose={() => setOpen(false)}
        person={person}
        self={self}
        openerRef={openRef}
        onShowCurrent={onShowCurrent}
        onDone={(outcome, at) => {
          setOpen(false);
          onDone(outcome, at);
        }}
      />
    </PageSection>
  );
}
