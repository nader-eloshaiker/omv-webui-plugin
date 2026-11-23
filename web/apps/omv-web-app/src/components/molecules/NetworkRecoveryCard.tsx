// SPDX-License-Identifier: GPL-3.0-or-later
// The recovery card (phase 5 network design 1.6) in words: the library's RecoveryCard with the
// variant's first line and the steps network/recovery.ts chose. It needs nothing from the NAS: every
// word is in the catalogue, which is bundled into the main bundle with the app (services/i18n; a build
// check proves the `netRecover.*` sentences are in a file the page loads first), and every value was
// read before the apply or typed in this session. Only a value typed in this session may become a
// link, and only where the caller allows links at all (P7, UI-3): the band's values come from the NAS.
import {
  RecoveryCard,
  type RecoverySteps,
} from "@omv-webui/react-ui-components";
import { Trans, useTranslation } from "react-i18next";
import type { RecoveryStep, RecoveryVariant } from "../../network/recovery.ts";

export function NetworkRecoveryCard({
  variant,
  steps,
  onTryAgain,
  trying = false,
  allowLinks,
  announce = true,
  headingLevel = 2,
  className,
}: {
  /** Null inside the review summary's Disclosure, before anything is applied. */
  variant: RecoveryVariant | null;
  steps: readonly RecoveryStep[];
  /** "Try again": one read, no write. */
  onTryAgain: () => void;
  trying?: boolean;
  /** Links for values typed in this session (the change flow); never for the band's. */
  allowLinks: boolean;
  announce?: boolean;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}) {
  const { t } = useTranslation();
  const shown: RecoverySteps = {};
  for (const step of steps) {
    switch (step.code) {
      case "netRecover.wait":
        if (variant === null) {
          // Before applying there is nothing to try again.
          break;
        }
        shown.wait = {
          text: t("netRecover.wait"),
          tryAgainLabel: t("netRecover.tryAgain"),
          onTryAgain,
          busy: trying,
        };
        break;
      case "netRecover.newAddress":
        shown.newAddress = {
          url: step.url,
          text: (url) => (
            <Trans i18nKey="netRecover.newAddress" components={{ url }} />
          ),
          copyLabel: t("netChange.copyNewAddress"),
          link:
            allowLinks && step.link
              ? { href: step.url, label: t("netChange.openNew") }
              : undefined,
          note: t("netRecover.sameNetwork"),
        };
        break;
      case "netRecover.find":
        shown.find = {
          name: step.name,
          url: step.url,
          text: (parts) => (
            <Trans i18nKey="netRecover.find" components={parts} />
          ),
          copyLabel: t("netRecover.copyUrl"),
        };
        break;
      case "netRecover.newName":
        shown.newName = {
          url: step.url,
          address: step.address ?? "",
          text: (parts) => (
            <Trans i18nKey="netRecover.newName" components={parts} />
          ),
          urlCopyLabel: t("netRecover.copyNameUrl"),
          addressCopyLabel: t("netRecover.copyAddressUrl"),
          link:
            allowLinks && step.link
              ? { href: step.url, label: t("netChange.openNew") }
              : undefined,
        };
        break;
      case "netRecover.firewall":
        shown.firewall = { text: t("netRecover.firewall") };
        break;
      case "netRecover.console":
        shown.console = {
          intro: t("netRecover.console"),
          commands: [
            {
              id: step.then,
              command: step.command,
              text: (command) => (
                <Trans i18nKey={step.then} components={{ command }} />
              ),
            },
          ],
        };
        break;
      case "netRecover.note":
        shown.note = { text: t("netRecover.note") };
        break;
    }
  }
  return (
    <RecoveryCard
      variant={variant ?? "lost"}
      title={
        variant === null
          ? t("netChange.recoveryOpen")
          : t(`netRecover.${variant}`)
      }
      headingLevel={headingLevel}
      steps={shown}
      copy={{
        copiedLabel: t("common.copied"),
        selectedLabel: t("common.copySelected"),
      }}
      newTabLabel={t("app.newTab")}
      announce={announce}
      className={className}
    />
  );
}
