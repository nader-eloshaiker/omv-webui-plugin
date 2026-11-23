// SPDX-License-Identifier: GPL-3.0-or-later
// The set-up checklist (UX audit Q11; phase 3 design 2), for administrators while OMV's own welcome
// flag is set. It is neutral: these are configuration choices, not monitored health, so states are
// told apart by mark and word, never by a status colour. The order is fixed by importance and never
// changes as items change. Each item's read is its own: one failure shows "Not checked" with a retry
// on that item only.
//
// Links go to a fixed route of this interface where one exists (the password form, the name of this
// NAS: phase 5 network design 13.3) and otherwise to a fixed page of the classic interface (UI-3).
// The HTTPS item names the secure port as text and builds no link from it (owner, 2026-11-20). Hiding the checklist asks first, because it hides it for every
// administrator and this interface cannot bring it back.
import {
  getSystemGetInformationQueryKey,
  useEmailNotificationGet,
  useSystemGetTimeSettings,
  useWebGuiDismissWelcomeMessage,
  useWebGuiGetSettings,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checklist,
  ChecklistItem,
  ConfirmDialog,
  ExternalLink,
  useToast,
  type ChecklistState,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  emailAlerts,
  FACTORY_ACCOUNT,
  httpsState,
} from "../../dashboard/dashboard.ts";
import {
  CLASSIC,
  CLASSIC_HTTPS_SETTINGS,
} from "../../navigation/navigation.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";

interface Props {
  info: Pick<SystemInformation, "hostname" | "availablePkgUpdates">;
  /** The signed-in account's name, when the server said it. */
  username: string | null;
}

/** A query's state as a checklist item sees it: in flight, failed with nothing to show, or read. */
function readState(query: {
  data: unknown;
  isPending: boolean;
  isError: boolean;
}): "checking" | "failed" | "read" {
  if (query.data !== undefined) {
    return "read";
  }
  return query.isError ? "failed" : "checking";
}

function ClassicLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ExternalLink href={href} newTabLabel={t("app.newTab")}>
      {children}
    </ExternalLink>
  );
}

export function SetupChecklist({ info, username }: Props) {
  const { t } = useTranslation();
  const titleId = useId();
  const hintId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const webGui = useWebGuiGetSettings();
  const email = useEmailNotificationGet();
  const time = useSystemGetTimeSettings();
  const dismiss = useWebGuiDismissWelcomeMessage();
  const [confirming, setConfirming] = useState(false);

  const stateWord = (state: ChecklistState) =>
    state === "value" ? undefined : t(`checklist.state.${state}`);

  const item = (state: ChecklistState) => ({
    state,
    stateLabel: stateWord(state),
  });

  const retry = (refetch: () => unknown) => ({
    label: t("common.tryAgain"),
    onRetry: () => void refetch(),
  });

  // 1. The factory password: OMV cannot report it, so it is never Done.
  const factory = username === FACTORY_ACCOUNT;
  const password = (
    <ChecklistItem
      {...item("notChecked")}
      title={t("checklist.password.title")}
      action={
        factory ? (
          <Link to="/account/password" className="text-action-label underline">
            {t("checklist.password.link")}
          </Link>
        ) : undefined
      }
    >
      <p>
        {factory
          ? t("checklist.password.body")
          : t("checklist.password.bodyOtherAdmin")}
      </p>
    </ChecklistItem>
  );

  // 2. HTTPS, from the web interface settings.
  const webGuiRead = readState(webGui);
  let https: ReactNode;
  if (webGuiRead !== "read" || webGui.data === undefined) {
    https = (
      <ChecklistItem
        {...item(webGuiRead === "checking" ? "checking" : "notChecked")}
        title={t("checklist.https.title")}
        retry={webGuiRead === "failed" ? retry(webGui.refetch) : undefined}
      >
        {webGuiRead === "failed" ? (
          <p>{t("checklist.https.readFailed")}</p>
        ) : null}
      </ChecklistItem>
    );
  } else {
    const state = httpsState(webGui.data.enablessl, window.location.protocol);
    https = (
      <ChecklistItem
        {...item(state === "off" ? "notDone" : "done")}
        title={t("checklist.https.title")}
        action={
          state === "off" ? (
            <ClassicLink href={CLASSIC_HTTPS_SETTINGS}>
              {t("checklist.https.link")}
            </ClassicLink>
          ) : undefined
        }
      >
        {state === "off" ? <p>{t("checklist.https.notDone")}</p> : null}
        {state === "on" ? <p>{t("checklist.https.done")}</p> : null}
        {state === "onButNotUsed" ? (
          <>
            <p>{t("checklist.https.doneOnHttp")}</p>
            <p>
              {t("checklist.https.secureNoLink")}{" "}
              <Trans
                i18nKey="checklist.https.securePort"
                components={{
                  port: <IdentifierText value={String(webGui.data.sslport)} />,
                }}
              />
            </p>
          </>
        ) : null}
      </ChecklistItem>
    );
  }

  // 3. Email alerts. The transport has already removed the mail password from this reply.
  const emailRead = readState(email);
  let alerts: ReactNode;
  if (emailRead !== "read" || email.data === undefined) {
    alerts = (
      <ChecklistItem
        {...item(emailRead === "checking" ? "checking" : "notChecked")}
        title={t("checklist.email.title")}
        retry={emailRead === "failed" ? retry(email.refetch) : undefined}
      >
        {emailRead === "failed" ? (
          <p>{t("checklist.email.readFailed")}</p>
        ) : null}
      </ChecklistItem>
    );
  } else {
    const state = emailAlerts(email.data);
    alerts = (
      <ChecklistItem
        {...item(state === "done" ? "done" : "notDone")}
        title={t("checklist.email.title")}
        action={
          <ClassicLink href={CLASSIC.notifications}>
            {t("checklist.email.link")}
          </ClassicLink>
        }
      >
        {state === "done" ? (
          <p>
            {t("checklist.email.done", { address: email.data.primaryemail })}
          </p>
        ) : (
          <>
            <p>
              {state === "off"
                ? t("checklist.email.off")
                : t("checklist.email.incomplete")}
            </p>
            <p>{t("checklist.email.applyHint")}</p>
          </>
        )}
      </ChecklistItem>
    );
  }

  // 4. Updates, from the dashboard's own read. A count of 0 can also mean the list was never fetched.
  const count = info.availablePkgUpdates ?? 0;
  const updates = (
    <ChecklistItem
      {...item(count > 0 ? "notDone" : "notChecked")}
      title={t("checklist.updates.title")}
      action={
        <ClassicLink href={CLASSIC.updates}>
          {t("checklist.updates.link")}
        </ClassicLink>
      }
    >
      <p>
        {count > 0
          ? t("checklist.updates.available", { count })
          : t("checklist.updates.none")}
      </p>
    </ChecklistItem>
  );

  // 5. The name: only the reader can judge it.
  const name = (
    <ChecklistItem
      {...item("value")}
      title={t("checklist.name.title")}
      action={
        <Link to="/network/general" className="text-action-label underline">
          {t("checklist.name.link")}
        </Link>
      }
    >
      <p>
        <Trans
          i18nKey="checklist.name.body"
          components={{ name: <IdentifierText value={info.hostname} /> }}
        />
      </p>
    </ChecklistItem>
  );

  // 6. The time zone, from the date and time settings.
  const timeRead = readState(time);
  const zone =
    timeRead !== "read" || time.data === undefined ? (
      <ChecklistItem
        {...item(timeRead === "checking" ? "checking" : "notChecked")}
        title={t("checklist.timezone.title")}
        retry={timeRead === "failed" ? retry(time.refetch) : undefined}
      >
        {timeRead === "failed" ? (
          <p>{t("checklist.timezone.readFailed")}</p>
        ) : null}
      </ChecklistItem>
    ) : (
      <ChecklistItem
        {...item("value")}
        title={t("checklist.timezone.title")}
        action={
          <ClassicLink href={CLASSIC.dateTime}>
            {t("checklist.timezone.link")}
          </ClassicLink>
        }
      >
        <p>
          <Trans
            i18nKey="checklist.timezone.body"
            components={{ zone: <IdentifierText value={time.data.timezone} /> }}
          />
        </p>
        <p>
          {time.data.ntpenable
            ? t("checklist.timezone.ntpOn")
            : t("checklist.timezone.ntpOff")}
        </p>
      </ChecklistItem>
    );

  const hide = () => {
    dismiss.mutate(undefined, {
      onSuccess: () => {
        // The server has cleared the flag: show that now, then read it again.
        queryClient.setQueryData<SystemInformation>(
          getSystemGetInformationQueryKey(),
          (old) => (old ? { ...old, displayWelcomeMessage: false } : old),
        );
        void queryClient.invalidateQueries({
          queryKey: getSystemGetInformationQueryKey(),
        });
        setConfirming(false);
        toast.show({ title: t("checklist.hidden") });
      },
    });
  };

  const failure = dismiss.error;

  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{t("checklist.title")}</CardTitle>
        <CardDescription>{t("checklist.intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Checklist>
          {password}
          {https}
          {alerts}
          {updates}
          {name}
          {zone}
        </Checklist>
      </CardContent>
      <CardFooter>
        <Button
          variant="neutral"
          aria-describedby={hintId}
          onClick={() => {
            dismiss.reset();
            setConfirming(true);
          }}
        >
          {t("checklist.hide")}
        </Button>
        <p id={hintId} className="text-sm text-muted-foreground">
          {t("checklist.hideHint")}
        </p>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && !dismiss.isPending) {
            setConfirming(false);
          }
        }}
        title={t("checklist.hideTitle")}
        description={t("checklist.hideBody")}
        confirmLabel={t("checklist.hide")}
        cancelLabel={t("checklist.hideCancel")}
        pending={dismiss.isPending}
        error={
          failure
            ? `${t("checklist.hideFailed")}${
                isRpcError(failure) ? `\n${failure.message}` : ""
              }`
            : undefined
        }
        onConfirm={hide}
      />
    </Card>
  );
}
