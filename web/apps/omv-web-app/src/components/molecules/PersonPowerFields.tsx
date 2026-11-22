// SPDX-License-Identifier: GPL-3.0-or-later
// The two choices that give more than shared folders (phase 5 users design 3.2, 3.3; P3, P4, Q5): on a
// person's page and, the same component, in "Add a person" (B7). Each is its own `CheckboxField`, never
// preselected, with its hint; when ticked and it was not ticked before, the warning-shape alert that is
// also the checkbox's description (heard when the box is reached, announced when it appears). A box
// that cannot be changed stays in the tab order (aria-disabled) with its reason as text:
// - administrator: the signed-in person's own (always ticked), any administrator while the reader is
//   not known (0.8, fail closed), the group missing on the NAS, or its read failed;
// - SSH: the group missing, or its read failed.
// Under the SSH box, always, how SSH stands on the NAS when it would stop this from working (0.3).
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  CheckboxField,
  ExternalLink,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CLASSIC } from "../../navigation/navigation.ts";
import { routerLinkClass } from "../../shell/linkClass.ts";
import type { GroupCheck, Powers, SshLine } from "../../users/personPage.ts";
import type { SelfReading } from "../../users/userModel.ts";
import { PersonNameText } from "../atoms/PersonNameText.tsx";

export function PersonPowerFields({
  name,
  value,
  initial,
  onChange,
  adminGroup,
  sshGroup,
  self,
  sshLine,
  inRoot,
  saving = false,
}: {
  /** The person's name for the sentences (in the add flow, as typed so far). */
  name: string;
  value: Powers;
  /** As stored (a new person: both off). A warning shows when a box is ticked and was not. */
  initial: Powers;
  onChange: (next: Powers) => void;
  adminGroup: GroupCheck;
  sshGroup: GroupCheck;
  /** Whether this person is the reader (0.8); "other" in the add flow. */
  self: SelfReading;
  sshLine: SshLine;
  /** In the system group `root`, which lets them in over SSH whatever this box says. */
  inRoot: boolean;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  const slot = { name: <PersonNameText value={name} /> };

  const failedLine = (check: GroupCheck): ReactNode =>
    check.kind === "failed" ? (
      <span className="mt-1 flex flex-col items-start gap-1">
        <span>{t("personCan.optionFailed")}</span>
        {isRpcError(check.error) ? (
          <ServerMessage label={t("app.serverMessage")}>
            {check.error.message}
          </ServerMessage>
        ) : null}
        <Button
          variant="neutral"
          size="sm"
          loading={check.retrying}
          onClick={check.retry}
        >
          {t("common.tryAgain")}
        </Button>
      </span>
    ) : null;

  // Administrator (3.2).
  let adminReason: ReactNode = null;
  if (self === "self") {
    adminReason = t("personCan.adminSelf");
  } else if (self === "unknown" && initial.admin) {
    adminReason = t("personCan.adminUnknownSelf");
  } else if (adminGroup.kind === "missing") {
    adminReason = t("personCan.adminNoGroup");
  }
  const adminUnavailable =
    adminReason !== null ||
    adminGroup.kind === "loading" ||
    adminGroup.kind === "failed";

  // SSH (3.3).
  const sshReason: ReactNode =
    sshGroup.kind === "missing" ? t("personCan.sshNoGroup") : null;
  const sshUnavailable =
    sshReason !== null ||
    sshGroup.kind === "loading" ||
    sshGroup.kind === "failed";

  let line: ReactNode = null;
  switch (sshLine) {
    case "unread":
      line = t("personCan.sshUnread");
      break;
    case "off":
      line = (
        <>
          {t("personCan.sshOff")}{" "}
          <Link to="/services/ssh" className={routerLinkClass}>
            {t("personCan.sshOffLink")}
          </Link>
        </>
      );
      break;
    case "keysOnly":
      line = (
        <>
          <Trans i18nKey="personCan.sshKeysOnly" components={slot} />{" "}
          <ExternalLink href={CLASSIC.users} newTabLabel={t("app.newTab")}>
            {t("users.classicLink")}
          </ExternalLink>
        </>
      );
      break;
    case null:
      break;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CheckboxField
          label={t("personCan.admin")}
          hint={
            <>
              <span className="block">{t("personCan.adminHint")}</span>
              {adminReason === null ? null : (
                <span className="mt-1 block text-foreground">
                  {adminReason}
                </span>
              )}
              {failedLine(adminGroup)}
            </>
          }
          warning={
            value.admin && !initial.admin ? (
              <Trans i18nKey="personCan.adminWarn" components={slot} />
            ) : undefined
          }
          checked={self === "self" ? true : value.admin}
          disabled={adminUnavailable || saving}
          focusableWhenDisabled
          onCheckedChange={(checked: boolean) =>
            onChange({ ...value, admin: checked })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <CheckboxField
          label={t("personCan.ssh")}
          hint={
            <>
              <span className="block">
                <Trans i18nKey="personCan.sshHint" components={slot} />
              </span>
              {sshReason === null ? null : (
                <span className="mt-1 block text-foreground">{sshReason}</span>
              )}
              {failedLine(sshGroup)}
            </>
          }
          warning={
            value.ssh && !initial.ssh ? (
              <Trans i18nKey="personCan.sshWarn" components={slot} />
            ) : undefined
          }
          checked={value.ssh}
          disabled={sshUnavailable || saving}
          focusableWhenDisabled
          onCheckedChange={(checked: boolean) =>
            onChange({ ...value, ssh: checked })
          }
        />
        {line === null ? null : <p className="ms-6 text-sm">{line}</p>}
        {inRoot && !value.ssh ? (
          <p className="ms-6 text-sm">
            <Trans i18nKey="personCan.sshRoot" components={slot} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
