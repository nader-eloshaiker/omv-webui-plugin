// SPDX-License-Identifier: GPL-3.0-or-later
// "Delete this group", last on its page (phase 5 users design 11.1, 11.2; 0.10; P10, P16): one neutral
// button, "Delete {{group}}…" (the destructive form is only on the dialog's confirm button),
// unavailable (aria-disabled, still focusable) with its reason beside it when a read it rests on
// failed, an action on the group is running in this session, or someone has it as their main group
// (set outside this interface: said with no link, P16). Pressing it opens the dialog, which reads
// getGroup, the people, the groups, ShareMgmt.getList, the SMB shares and the pending modules again
// before it shows anything.
import type { UserAccount } from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { Button, ServerMessage } from "@omv-webui/react-ui-components";
import { useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { isolateName } from "../../format/isolate.ts";
import {
  groupDeleteOf,
  groupDeletes,
  isGroupDeleting,
} from "../../groups/deleteGroupFlow.ts";
import { mainGroupMembers } from "../../groups/groupWrites.ts";
import { readName } from "../../groups/nameFree.ts";
import { useGroupsApi } from "../../hooks/useGroupsApi.ts";
import { useNamesText } from "../../hooks/useNamesText.ts";
import { useMemoryStore } from "../../shell/memoryStore.ts";
import { foldersListing } from "../../users/accessByAccount.ts";
import {
  accountId,
  runningOnAccount,
  usersSession,
  type AccountAction,
} from "../../users/usersSession.ts";
import { GroupNameText } from "../atoms/GroupNameText.tsx";
import {
  GroupDeleteDialog,
  type GroupDeleteCheck,
  type GroupDeleteOutcome,
} from "./GroupDeleteDialog.tsx";

export type GroupDeleteBlocker =
  | { kind: "mainGroup"; names: string[] }
  | { kind: "unread"; error: unknown }
  | { kind: "running"; action: AccountAction };

function Blocker({
  blocker,
  group,
  onRetry,
}: {
  blocker: GroupDeleteBlocker;
  group: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const namesText = useNamesText();
  const groupSlot = <GroupNameText value={group} />;
  switch (blocker.kind) {
    case "mainGroup":
      return (
        <p>
          <Trans
            i18nKey="groupDelete.blocked.mainGroup"
            components={{
              name: (
                <bdi dir="auto" className="font-mono">
                  {namesText(blocker.names, 5)}
                </bdi>
              ),
              group: groupSlot,
            }}
          />
        </p>
      );
    case "running":
      return (
        <p>
          {t("groupDelete.blocked.running", {
            action: t(`users.action.${blocker.action}`),
          })}
        </p>
      );
    case "unread":
      return (
        <div className="flex flex-col items-start gap-2">
          <p>
            <Trans
              i18nKey="groupDelete.blocked.unread"
              components={{ group: groupSlot }}
            />
          </p>
          {isRpcError(blocker.error) ? (
            <ServerMessage label={t("app.serverMessage")}>
              {blocker.error.message}
            </ServerMessage>
          ) : null}
          {onRetry === undefined ? null : (
            <Button variant="neutral" size="sm" onClick={onRetry}>
              {t("common.tryAgain")}
            </Button>
          )}
        </div>
      );
  }
}

export function GroupDeleteSection({
  name,
  blockers,
  onRetry,
  onDone,
}: {
  name: string;
  /** From the page's reads (failing closed): the button is unavailable while any applies. */
  blockers: readonly GroupDeleteBlocker[];
  onRetry: () => void;
  onDone: (outcome: GroupDeleteOutcome) => void;
}) {
  const { t } = useTranslation();
  const api = useGroupsApi();
  useMemoryStore(groupDeletes);
  useMemoryStore(usersSession);
  const openRef = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const run = groupDeleteOf(name);
  const deleting = isGroupDeleting(run) || run !== undefined;
  const running = runningOnAccount(accountId("group", name));
  const shown: GroupDeleteBlocker[] = deleting
    ? []
    : [
        ...blockers,
        ...(running === null
          ? []
          : [{ kind: "running" as const, action: running }]),
      ];
  const blocked = shown.length > 0;

  const check = async (): Promise<GroupDeleteCheck> => {
    const refused = (blocker: GroupDeleteBlocker): GroupDeleteCheck => ({
      kind: "refused",
      body: <Blocker blocker={blocker} group={name} />,
    });
    const [read, lists, pending] = await Promise.all([
      readName("group", name, api.group),
      Promise.all([api.folders(), api.users(), api.groups()]).then(
        (data) => ({ data, error: null }),
        (error: unknown) => ({ data: null, error }),
      ),
      api.pending().then(
        (p) => p,
        () => null,
      ),
    ]);
    if (read.kind === "free") {
      return { kind: "gone" };
    }
    if (read.kind === "unknown") {
      return refused({ kind: "unread", error: read.error });
    }
    if (lists.data === null) {
      return refused({ kind: "unread", error: lists.error });
    }
    const [folders, users, groups] = lists.data;
    const main = mainGroupMembers(read.value, users as UserAccount[]);
    if (main.length > 0) {
      return refused({ kind: "mainGroup", names: main });
    }
    const action = runningOnAccount(accountId("group", name));
    if (action !== null) {
      return refused({ kind: "running", action });
    }
    if (pending === null) {
      return refused({ kind: "unread", error: null });
    }
    if (pending.length > 0) {
      return { kind: "preflight", modules: pending };
    }
    const shares = await api.shares().catch(() => []);
    return {
      kind: "confirm",
      group: read.value,
      members: [...(read.value.members ?? [])],
      listing: foldersListing("group", name, folders, users, groups, shares),
    };
  };

  return (
    <section
      aria-labelledby="group-delete"
      className="mt-6 flex flex-col gap-3 border-t border-border pt-6"
    >
      <h2 id="group-delete" className="text-lg font-semibold">
        {t("groupDelete.title")}
      </h2>
      <p className="max-w-prose text-sm">
        <Trans
          i18nKey="groupDelete.intro"
          components={{ group: <GroupNameText value={name} /> }}
        />
      </p>
      <div className="flex flex-col items-start gap-2">
        <Button
          ref={openRef}
          variant="neutral"
          disabled={blocked}
          focusableWhenDisabled
          aria-describedby={blocked ? reasonId : undefined}
          onClick={blocked ? undefined : () => setOpen(true)}
        >
          {t("groupDelete.open", { group: isolateName(name) })}
        </Button>
        {blocked ? (
          <div id={reasonId} className="flex flex-col gap-2 text-sm">
            {shown.map((b) => (
              <Blocker
                key={b.kind}
                blocker={b}
                group={name}
                onRetry={onRetry}
              />
            ))}
          </div>
        ) : null}
      </div>
      <GroupDeleteDialog
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        check={check}
        openerRef={openRef}
        onDone={(outcome) => {
          setOpen(false);
          onDone(outcome);
        }}
      />
    </section>
  );
}
