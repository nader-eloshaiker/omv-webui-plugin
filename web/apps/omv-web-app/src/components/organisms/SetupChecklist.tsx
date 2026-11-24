// SPDX-License-Identifier: GPL-3.0-or-later
// First steps, the set-up checklist (UX audit Q11; phase 3 design 2; dashboard spec 10.1), for
// administrators while OMV's own welcome flag is set. Each step is one row: a mark, the title, one
// short line and the next step; why it matters is behind its "Details" (foundation 11, 12). The marks
// are neutral: these are configuration choices, not monitored health, so states are told apart by
// shape and a word for assistive technology, never by a status colour. The order is fixed by
// importance and never changes as steps change. Each step's read is its own: one failure shows "Not
// checked" with a retry on that step only.
//
// Links go to a fixed route of this interface where one exists (the password form, the name of this
// NAS: phase 5 network design 13.3) and otherwise to a fixed page of the classic interface (UI-3). A
// step that is not done draws its link as a button, so the next step looks pressable at rest; it
// wraps inside the card at any width. The HTTPS step names the secure port as text and builds no link
// from it (owner, 2026-11-20).
//
// Progress counts the four steps with something to do (password, HTTPS, email alerts, updates); the
// password can never be confirmed by the NAS and says so, so the count never claims what it cannot
// see. The name and the time zone are values for the reader to judge and are not counted. Hiding
// asks first, because it hides the steps for every administrator and this interface cannot bring
// them back.
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
  buttonClass,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  ConfirmDialog,
  ExternalLink,
  ProgressRing,
  useToast,
} from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
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
import { routerLinkClass } from "../../shell/linkClass.ts";
import { IdentifierText } from "../atoms/IdentifierText.tsx";
import { FirstStep, type StepState } from "../molecules/FirstStep.tsx";

interface Props {
  info: Pick<SystemInformation, "hostname" | "availablePkgUpdates">;
  /** The signed-in account's name, when the server said it. */
  username: string | null;
  /** Its place in the page grid, and in the rise-in order. */
  className?: string;
  index?: number;
}

/** A query's state as a step sees it: in flight, failed with nothing to show, or read. */
function readState(query: {
  data: unknown;
  isError: boolean;
}): "checking" | "failed" | "read" {
  if (query.data !== undefined) {
    return "read";
  }
  return query.isError ? "failed" : "checking";
}

/** A step not done: its link drawn as a button that wraps rather than leave the card. */
const stepButton = cn(
  buttonClass({ variant: "neutral", size: "sm" }),
  "max-w-full shrink no-underline hover:no-underline",
);

function ClassicLink({
  href,
  next = false,
  children,
}: {
  href: string;
  /** The step is not done: the link is its next step, drawn as a button. */
  next?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <ExternalLink
      href={href}
      newTabLabel={t("app.newTab")}
      className={next ? stepButton : undefined}
    >
      {children}
    </ExternalLink>
  );
}

/** The steps with something to do, which the progress counts. */
const COUNTED = 4;

export function SetupChecklist({ info, username, className, index }: Props) {
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

  const word = (state: StepState): string | undefined =>
    state === "value" ? undefined : t(`checklist.state.${state}`);

  // 1. The factory password: OMV cannot report it, so it is never Done, and the step says so.
  const factory = username === FACTORY_ACCOUNT;
  const password = (
    <FirstStep
      state="notChecked"
      stateLabel={t("checklist.state.cannotCheck")}
      title={t("checklist.password.title")}
      line={t("checklist.password.short")}
      details={
        <p>
          {factory
            ? t("checklist.password.body")
            : t("checklist.password.bodyOtherAdmin")}
        </p>
      }
      action={
        factory ? (
          <Link
            to="/account/password"
            className={cn(stepButton, "text-foreground")}
          >
            {t("checklist.password.link")}
          </Link>
        ) : undefined
      }
    />
  );

  // 2. HTTPS, from the web interface settings.
  const webGuiRead = readState(webGui);
  let httpsStep: StepState;
  let https: ReactNode;
  if (webGuiRead !== "read" || webGui.data === undefined) {
    httpsStep = webGuiRead === "checking" ? "checking" : "notChecked";
    https = (
      <FirstStep
        state={httpsStep}
        stateLabel={word(httpsStep)}
        title={t("checklist.https.title")}
        line={webGuiRead === "failed" ? t("checklist.https.readFailed") : null}
        retry={
          webGuiRead === "failed" ? () => void webGui.refetch() : undefined
        }
      />
    );
  } else {
    const state = httpsState(webGui.data.enablessl, window.location.protocol);
    httpsStep = state === "off" ? "notDone" : "done";
    https = (
      <FirstStep
        state={httpsStep}
        stateLabel={word(httpsStep)}
        title={t("checklist.https.title")}
        line={
          state === "off"
            ? t("checklist.https.notDoneShort")
            : state === "on"
              ? t("checklist.https.done")
              : t("checklist.https.doneOnHttp")
        }
        details={
          state === "off" ? (
            <p>{t("checklist.https.notDoneWhy")}</p>
          ) : state === "onButNotUsed" ? (
            <p>
              {t("checklist.https.secureNoLink")}{" "}
              <Trans
                i18nKey="checklist.https.securePort"
                components={{
                  port: <IdentifierText value={String(webGui.data.sslport)} />,
                }}
              />
            </p>
          ) : undefined
        }
        action={
          state === "off" ? (
            <ClassicLink href={CLASSIC_HTTPS_SETTINGS} next>
              {t("checklist.https.link")}
            </ClassicLink>
          ) : undefined
        }
      />
    );
  }

  // 3. Email alerts. The transport has already removed the mail password from this reply.
  const emailRead = readState(email);
  let alertsStep: StepState;
  let alerts: ReactNode;
  if (emailRead !== "read" || email.data === undefined) {
    alertsStep = emailRead === "checking" ? "checking" : "notChecked";
    alerts = (
      <FirstStep
        state={alertsStep}
        stateLabel={word(alertsStep)}
        title={t("checklist.email.title")}
        line={emailRead === "failed" ? t("checklist.email.readFailed") : null}
        retry={emailRead === "failed" ? () => void email.refetch() : undefined}
      />
    );
  } else {
    const state = emailAlerts(email.data);
    alertsStep = state === "done" ? "done" : "notDone";
    alerts = (
      <FirstStep
        state={alertsStep}
        stateLabel={word(alertsStep)}
        title={t("checklist.email.title")}
        line={
          state === "done"
            ? t("checklist.email.done", { address: email.data.primaryemail })
            : state === "off"
              ? t("checklist.email.offShort")
              : t("checklist.email.incomplete")
        }
        details={
          state === "done" ? undefined : (
            <>
              {state === "off" ? <p>{t("checklist.email.offWhy")}</p> : null}
              <p>{t("checklist.email.applyHint")}</p>
            </>
          )
        }
        action={
          <ClassicLink href={CLASSIC.notifications} next={state !== "done"}>
            {t("checklist.email.link")}
          </ClassicLink>
        }
      />
    );
  }

  // 4. Updates, from the dashboard's own read. A count of 0 can also mean the list was never fetched.
  const count = info.availablePkgUpdates ?? 0;
  const updatesStep: StepState = count > 0 ? "notDone" : "notChecked";
  const updates = (
    <FirstStep
      state={updatesStep}
      stateLabel={word(updatesStep)}
      title={t("checklist.updates.title")}
      line={
        count > 0
          ? t("checklist.updates.available", { count })
          : t("checklist.updates.noneShort")
      }
      details={count > 0 ? undefined : <p>{t("checklist.updates.noneWhy")}</p>}
      action={
        <ClassicLink href={CLASSIC.updates} next={count > 0}>
          {t("checklist.updates.link")}
        </ClassicLink>
      }
    />
  );

  // 5. The name: only the reader can judge it.
  const name = (
    <FirstStep
      state="value"
      title={t("checklist.name.title")}
      line={
        <Trans
          i18nKey="checklist.name.body"
          components={{ name: <IdentifierText value={info.hostname} /> }}
        />
      }
      details={<p>{t("checklist.name.why")}</p>}
      action={
        <Link to="/network/general" className={routerLinkClass}>
          {t("checklist.name.link")}
        </Link>
      }
    />
  );

  // 6. The time zone, from the date and time settings.
  const timeRead = readState(time);
  const zone =
    timeRead !== "read" || time.data === undefined ? (
      <FirstStep
        state={timeRead === "checking" ? "checking" : "notChecked"}
        stateLabel={word(timeRead === "checking" ? "checking" : "notChecked")}
        title={t("checklist.timezone.title")}
        line={timeRead === "failed" ? t("checklist.timezone.readFailed") : null}
        retry={timeRead === "failed" ? () => void time.refetch() : undefined}
      />
    ) : (
      <FirstStep
        state="value"
        title={t("checklist.timezone.title")}
        line={
          <Trans
            i18nKey="checklist.timezone.body"
            components={{ zone: <IdentifierText value={time.data.timezone} /> }}
          />
        }
        details={
          <>
            <p>{t("checklist.timezone.why")}</p>
            <p>
              {time.data.ntpenable
                ? t("checklist.timezone.ntpOn")
                : t("checklist.timezone.ntpOff")}
            </p>
          </>
        }
        action={
          <ClassicLink href={CLASSIC.dateTime}>
            {t("checklist.timezone.link")}
          </ClassicLink>
        }
      />
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
  // The password is never done: the NAS cannot tell.
  const done = [httpsStep, alertsStep, updatesStep].filter(
    (state) => state === "done",
  ).length;
  const progress = { done, total: COUNTED };

  return (
    <Card
      render={<section aria-labelledby={titleId} />}
      className={cn(
        index === undefined ? undefined : "motion-safe:animate-rise stagger",
        className,
      )}
      style={
        index === undefined
          ? undefined
          : ({ "--stagger-index": Math.min(index, 6) } as CSSProperties)
      }
    >
      <CardHeader className="flex-nowrap items-center gap-x-3">
        <ProgressRing
          aria-labelledby={titleId}
          value={done}
          max={COUNTED}
          valueText={t("checklist.progress", progress)}
          figure={t("checklist.progressFigure", progress)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <CardTitle id={titleId}>{t("checklist.title")}</CardTitle>
          <p aria-hidden="true" className="text-sm text-muted-foreground">
            {t("checklist.progress", progress)}
          </p>
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="shrink-0"
          aria-describedby={hintId}
          onClick={() => {
            dismiss.reset();
            setConfirming(true);
          }}
        >
          {t("checklist.hide")}
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {password}
          {https}
          {alerts}
          {updates}
          {name}
          {zone}
        </ul>
        {/* Before the button is pressed, what hiding does: the dialog says it again. */}
        <p id={hintId} className="text-caption text-tertiary-foreground">
          {t("checklist.hideHint")}
        </p>
      </CardContent>
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
