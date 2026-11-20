// SPDX-License-Identifier: GPL-3.0-or-later
// The account's SSH keys, read-only in Phase 3 (phase 3 design 5.5): each by its comment, or "Key n",
// with the key shortened in the middle, a toggle to show all of it, and a copy button that copies the
// key exactly as stored. Every part of a key is rendered as text (UI-2).
import {
  CopyButton,
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
  ExternalLink,
} from "@omv-webui/react-ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { parseSshKey, shortKey } from "../../account/account.ts";
import { CLASSIC } from "../../navigation/navigation.ts";

function SshKey({ text, n }: { text: string; n: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const key = parseSshKey(text);
  const name = key.comment ?? t("account.keyN", { n });
  return (
    <li className="flex flex-col gap-1 border-t border-border py-3 first:border-t-0 first:pt-0">
      <p dir="auto" className="font-medium break-words">
        {name}
      </p>
      <p className="font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">
        {shortKey(key.body)}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Disclosure open={open} onOpenChange={setOpen}>
          <DisclosureTrigger variant="inline">
            {open ? t("account.hideKey") : t("account.showKey")}
          </DisclosureTrigger>
          <DisclosurePanel>
            <p className="font-mono text-sm break-all whitespace-pre-wrap">
              {text}
            </p>
          </DisclosurePanel>
        </Disclosure>
        <CopyButton
          text={text}
          size="sm"
          label={`${t("account.copyKey")}: ${name}`}
          copiedLabel={t("common.copied")}
          selectedLabel={t("common.copySelected")}
        >
          {t("account.copyKey")}
        </CopyButton>
      </div>
    </li>
  );
}

export function SshKeyList({
  keys,
  admin,
}: {
  keys: readonly string[];
  admin: boolean;
}) {
  const { t } = useTranslation();
  if (keys.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p>{t("account.noKeys")}</p>
        <p className="text-muted-foreground">
          {admin ? (
            <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
              {t("account.noKeysAdminLink")}
            </ExternalLink>
          ) : (
            t("account.noKeysUser")
          )}
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {keys.map((text, i) => (
        <SshKey key={`${String(i)}-${text}`} text={text} n={i + 1} />
      ))}
    </ul>
  );
}
