// SPDX-License-Identifier: GPL-3.0-or-later
// The idle warning (docs/03, "Idle timeout"). OMV ends a session `timeout` minutes after the last
// call it counted; the activity clock follows exactly those calls (the transport's onActivity), so
// background polling never holds the warning off (UI-14). Shortly before the end, a dialog counts down
// and offers "Stay signed in" (one deliberate foreground call) and "Sign out". When the time is up,
// the interface asks with a background call, which cannot extend the session: a 401 ends it on the
// spot (sign-in with a notice); an answer means another tab kept it alive, and it asks again later.
import {
  getWebGuiGetAutoLogoutSettingsQueryKey,
  useWebGuiGetAutoLogoutSettings,
} from "@omv-webui/react-api-omv/generated";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ServerMessage,
} from "@omv-webui/react-ui-components";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNow } from "../../hooks/useNow.ts";
import { formatCountdown, idlePhase } from "../../session/idle.ts";
import { useLastActivity } from "../../session/sessionContext.ts";
import { useSignOut } from "../../session/useSignOut.ts";

/** The background read that asks whether the session outlived the clock. Never shares a cache entry. */
const EXPIRY_CHECK_KEY = [
  ...getWebGuiGetAutoLogoutSettingsQueryKey(),
  "expiry-check",
] as const;
const EXPIRY_CHECK_INTERVAL_MS = 15_000;

export function IdleWarning() {
  const { t } = useTranslation();
  // The setting changes only when an administrator changes it; read it once per session.
  const settings = useWebGuiGetAutoLogoutSettings({
    query: { staleTime: Infinity, retry: false },
  });
  const timeout = settings.data?.timeout;
  const lastActivity = useLastActivity();
  const now = useNow(timeout ? 1000 : null);
  const phase = idlePhase(now, lastActivity, timeout);

  useWebGuiGetAutoLogoutSettings({
    request: { background: true },
    query: {
      queryKey: EXPIRY_CHECK_KEY,
      enabled: phase.kind === "expired",
      refetchInterval: EXPIRY_CHECK_INTERVAL_MS,
      retry: false,
      staleTime: 0,
      gcTime: 0,
    },
  });

  const { signOut, pending: signingOut } = useSignOut();
  const [staying, setStaying] = useState(false);
  const [stayFailure, setStayFailure] = useState<string | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  const stay = async () => {
    if (staying) {
      return;
    }
    setStaying(true);
    setStayFailure(null);
    // A foreground call: the server counts it, and so does the activity clock.
    const result = await settings.refetch();
    setStaying(false);
    if (result.error) {
      setStayFailure(result.error.message);
    }
  };

  const open = phase.kind === "warning";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape is a deliberate answer too: the safe one.
        if (!next) {
          void stay();
        }
      }}
    >
      <DialogContent initialFocus={stayRef}>
        <DialogHeader>
          <DialogTitle>{t("idle.title")}</DialogTitle>
          <DialogDescription>
            {t("idle.body", {
              time: formatCountdown(
                phase.kind === "warning" ? phase.remainingMs : 0,
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        {stayFailure ? (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-critical-label">{t("idle.stayFailed")}</p>
            <ServerMessage label={t("app.serverMessage")}>
              {stayFailure}
            </ServerMessage>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="neutral"
            loading={signingOut}
            onClick={() => void signOut()}
          >
            {t("idle.signOut")}
          </Button>
          <Button ref={stayRef} loading={staying} onClick={() => void stay()}>
            {t("idle.stay")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
