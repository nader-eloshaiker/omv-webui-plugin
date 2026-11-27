// SPDX-License-Identifier: GPL-3.0-or-later
// The dashboard's first steps (rethink 6.2 E, P.2, P.3 G1; style guide 10 rule 9), as the library's
// checklist: a tick when done, an empty circle when not, the current step's button in the accent.
//
// Which steps: on a new NAS (nothing to keep files on, no shared folder) the storage and the first
// shared folder come first; then, for everyone, the factory password (only when signed in as the
// factory account, which alone can change it here; the NAS cannot tell whether it was changed, so
// it is never ticked), secure sign-in (WebGui.getSettings) and email alerts (EmailNotification.get).
// Each read is its own: one that failed says so on its step with "Try again", and is never ticked.
//
// They show while OMV's welcome flag is set, or on a new NAS (G1: keyed to the NAS's state). Hiding
// asks first, because it hides them for every administrator and the classic interface's welcome too,
// and this interface cannot bring them back. Links go to a route here where one exists and otherwise
// to a fixed page of the classic interface (UI-3).
import {
  getSystemGetInformationQueryKey,
  useEmailNotificationGet,
  useWebGuiDismissWelcomeMessage,
  useWebGuiGetSettings,
  type SystemInformation,
} from "@omv-webui/react-api-omv/generated";
import { useToast, type FirstStep } from "@omv-webui/react-ui-components";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BellRing,
  ExternalLink as ExternalIcon,
  KeyRound,
  Lock,
} from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  emailAlerts,
  FACTORY_ACCOUNT,
  httpsState,
} from "../dashboard/dashboard.ts";
import { CLASSIC, CLASSIC_HTTPS_SETTINGS } from "../navigation/navigation.ts";

export type StepId = "storage" | "folder" | "password" | "https" | "alerts";

export interface DashboardStep extends FirstStep {
  id: StepId;
  /** The map action it offers, so the map does not offer it again (each action once a screen). */
  offers?: "add-storage" | "add-folder";
  /** Its icon as a shortcut, when tips are off. */
  icon?: ReactNode;
  /** Its link opens the classic interface in a new tab. */
  external?: boolean;
}

const readOf = (q: { data: unknown; isError: boolean }) =>
  q.data !== undefined ? "read" : q.isError ? "failed" : "checking";

export function useFirstSteps({
  info,
  username,
  newNas,
  hasStorage,
  hasFolders,
}: {
  info: Pick<SystemInformation, "displayWelcomeMessage"> | undefined;
  username: string | null;
  /** The NAS has nothing on it yet (`isNewNas`). */
  newNas: boolean;
  /** Storage other than the system drive exists. */
  hasStorage: boolean;
  hasFolders: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const welcome = info?.displayWelcomeMessage === true;
  const eligible = welcome || newNas;
  const webGui = useWebGuiGetSettings({ query: { enabled: eligible } });
  const email = useEmailNotificationGet({ query: { enabled: eligible } });
  const dismiss = useWebGuiDismissWelcomeMessage();
  const [confirming, setConfirming] = useState(false);

  const classic = (href: string): ReactElement => (
    <a href={href} target="_blank" rel="noopener noreferrer" />
  );
  const external = (words: string) => (
    <>
      {words}
      <ExternalIcon aria-hidden="true" />
      <span className="sr-only"> {t("app.newTab")}</span>
    </>
  );

  const steps: DashboardStep[] = [];
  if (newNas) {
    steps.push(
      {
        id: "storage",
        title: t("dashboard.steps.storage.title"),
        detail: t("dashboard.steps.storage.detail"),
        actionLabel: t("dashboard.steps.storage.action"),
        done: hasStorage,
        render: <Link to="/storage/filesystems/add" />,
        offers: "add-storage",
      },
      {
        id: "folder",
        title: t("dashboard.steps.folder.title"),
        detail: t("dashboard.steps.folder.detail"),
        actionLabel: t("dashboard.steps.folder.action"),
        done: hasFolders,
        render: <Link to="/storage/shared-folders/add" />,
        offers: "add-folder",
      },
    );
  }
  if (username === FACTORY_ACCOUNT) {
    steps.push({
      id: "password",
      title: t("dashboard.steps.password.title"),
      detail: t("dashboard.steps.password.detail"),
      actionLabel: t("dashboard.steps.password.action"),
      done: false,
      render: <Link to="/account/password" />,
      icon: <KeyRound />,
    });
  }

  const webGuiRead = readOf(webGui);
  const https =
    webGui.data === undefined
      ? null
      : httpsState(webGui.data.enablessl, window.location.protocol);
  steps.push({
    id: "https",
    title: t("dashboard.steps.https.title"),
    detail:
      webGuiRead === "failed"
        ? t("checklist.https.readFailed")
        : webGuiRead === "checking"
          ? t("dashboard.steps.checking")
          : https === "onButNotUsed"
            ? t("dashboard.steps.https.onButNotUsed")
            : t("dashboard.steps.https.detail"),
    done: https === "on" || https === "onButNotUsed",
    icon: <Lock />,
    ...(webGuiRead === "failed"
      ? {
          actionLabel: t("common.tryAgain"),
          onAction: () => void webGui.refetch(),
        }
      : {
          actionLabel: external(t("dashboard.steps.https.action")),
          render: classic(CLASSIC_HTTPS_SETTINGS),
          external: true,
        }),
  });

  const emailRead = readOf(email);
  const alerts = email.data === undefined ? null : emailAlerts(email.data);
  steps.push({
    id: "alerts",
    title: t("dashboard.steps.alerts.title"),
    detail:
      emailRead === "failed"
        ? t("checklist.email.readFailed")
        : emailRead === "checking"
          ? t("dashboard.steps.checking")
          : alerts === "done" && email.data !== undefined
            ? t("checklist.email.done", { address: email.data.primaryemail })
            : alerts === "incomplete"
              ? t("dashboard.steps.alerts.incomplete")
              : t("dashboard.steps.alerts.detail"),
    done: alerts === "done",
    icon: <BellRing />,
    ...(emailRead === "failed"
      ? {
          actionLabel: t("common.tryAgain"),
          onAction: () => void email.refetch(),
        }
      : {
          actionLabel: external(t("dashboard.steps.alerts.action")),
          render: classic(CLASSIC.notifications),
          external: true,
        }),
  });

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

  return {
    steps,
    /** Whether the steps may show at all (before "Show tips" and whether any is left). */
    eligible,
    /** OMV's welcome flag is set, so "Hide first steps" can clear it. */
    hideable: welcome,
    hiding: {
      open: confirming,
      start: () => {
        dismiss.reset();
        setConfirming(true);
      },
      close: () => {
        if (!dismiss.isPending) {
          setConfirming(false);
        }
      },
      confirm: hide,
      pending: dismiss.isPending,
      error: dismiss.error,
    },
  };
}
