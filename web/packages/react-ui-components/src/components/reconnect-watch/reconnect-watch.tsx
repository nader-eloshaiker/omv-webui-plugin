// SPDX-License-Identifier: GPL-3.0-or-later
import { ArrowRight, LoaderCircle, LogIn, MonitorCheck } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { CopyButton } from "../copy-button/copy-button";
import { ExternalLink } from "../external-link/external-link";
import { IsolatedIdentifier } from "../text/isolated-identifier";

/** The words of a copy button: its name, and what it says after a press. */
interface ReconnectCopyLabels {
  /** "Copy the new address". */
  label: string;
  /** "Copied". */
  copiedLabel: string;
  /** "Selected. Press Ctrl+C to copy." */
  selectedLabel: string;
}

interface ReconnectWaiting {
  state: "waiting";
  /** Seconds since the wait began, from the caller's clock (`useElapsedSeconds` ticks it). */
  elapsedSeconds: number;
  /**
   * The waiting line with the elapsed time in words, counting up, never down (design 1.5):
   * `(s) => t("netChange.waiting", { elapsed: … })`, "Waiting for the NAS to answer… 18 seconds".
   * Called with the true elapsed time for the visible line and with a multiple of
   * `announceEverySeconds` for the announcement.
   */
  waiting: (elapsedSeconds: number) => React.ReactNode;
  /** "Stop waiting". */
  stopLabel: React.ReactNode;
  /** The reader stops waiting: the caller shows the recovery card at once. */
  onStop: () => void;
}

interface ReconnectConnected {
  state: "connected";
  /**
   * What the NAS answered: "Connected again. This page reaches the NAS at 192.0.2.10 through
   * enp2s0.", "The NAS kept the address 192.0.2.10." or "The NAS still answers at 192.0.2.10. The
   * change may not have been applied."
   */
  message: React.ReactNode;
}

interface ReconnectMoved {
  state: "moved";
  /** The new web address of this page, as text: "http://192.0.2.20/ui/". */
  url: string;
  /**
   * "The NAS is now at <new></new>.": a function gets the address isolated, to place in the
   * sentence, where it stays text; the copy button under the sentence copies it.
   */
  message: React.ReactNode | ((url: React.ReactElement) => React.ReactNode);
  copy: ReconnectCopyLabels;
  /**
   * "Open the NAS at its new address", opening a new tab. Only when the caller passes it, and only
   * for an address typed in this session (UI-3, design P7); the library never builds an href.
   */
  link?: { href: string; label: React.ReactNode; newTabLabel: string };
  /** "You need to sign in again there. If it does not open within two minutes, follow these steps." */
  note?: React.ReactNode;
  /** The recovery steps below the card (a `RecoveryCard` with `announce={false}`). */
  children?: React.ReactNode;
}

interface ReconnectSignIn {
  state: "signIn";
  /** "The NAS answers, but this page needs you to sign in again." */
  message: React.ReactNode;
  /** "Sign in". */
  signInLabel: React.ReactNode;
  /** Goes to the app's own sign-in route; no address from anywhere else. */
  onSignIn: () => void;
}

type ReconnectWatchState =
  ReconnectWaiting | ReconnectConnected | ReconnectMoved | ReconnectSignIn;

type ReconnectWatchProps = ReconnectWatchState & {
  /** How often the waiting time is announced (design 19.2): every 15 seconds, not every tick. */
  announceEverySeconds?: number;
  className?: string;
};

function Outcome({
  icon,
  children,
  className,
}: {
  icon: React.ReactElement;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2", className)}>
      <span
        aria-hidden="true"
        className="mt-[0.2em] flex shrink-0 text-muted-foreground [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-2 [overflow-wrap:anywhere]">
        {children}
      </div>
    </div>
  );
}

/**
 * After a network change is applied (phase 5 network design 1.5): the wait for the NAS to answer,
 * then how it ended. Presentational: the caller polls, decides the outcome and passes `state`.
 *
 * - **waiting**: the elapsed time counting up with a progress mark that does not move under reduced
 *   motion (style guide 4.5), and "Stop waiting". The time is announced politely when the wait
 *   starts and every `announceEverySeconds` after, not on every tick (design 19.2).
 * - **connected**, **signIn**: the outcome in words, announced politely.
 * - **moved**: a card (`status`, not an error) with the new address as text and a copy button, and a
 *   link only when the caller passes one.
 *
 * Keep it mounted in one place while `state` changes, so its live regions announce each change.
 */
function ReconnectWatch(props: ReconnectWatchProps) {
  const { announceEverySeconds = 15, className } = props;
  const every = Math.max(1, Math.floor(announceEverySeconds));

  return (
    <div
      data-slot="reconnect-watch"
      data-state={props.state}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* Present from the first render; its text changes only on the announcement's schedule. */}
      <p
        role="status"
        data-slot="reconnect-watch-announcer"
        className="sr-only"
      >
        {props.state === "waiting"
          ? props.waiting(
              Math.floor(Math.max(0, props.elapsedSeconds) / every) * every,
            )
          : null}
      </p>
      {props.state === "waiting" ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="flex items-center gap-2 text-base text-foreground tabular-nums">
            <LoaderCircle
              aria-hidden="true"
              data-slot="reconnect-watch-indicator"
              className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin"
            />
            <span className="min-w-0">
              {props.waiting(props.elapsedSeconds)}
            </span>
          </p>
          <Button variant="neutral" size="sm" onClick={props.onStop}>
            {props.stopLabel}
          </Button>
        </div>
      ) : null}
      {/* The outcome's own region, present while waiting so the outcome is announced on arrival. */}
      <div role="status" data-slot="reconnect-watch-outcome">
        {props.state === "connected" ? (
          <Outcome icon={<MonitorCheck />}>
            <p className="text-base text-foreground">{props.message}</p>
          </Outcome>
        ) : null}
        {props.state === "signIn" ? (
          <Outcome icon={<LogIn />}>
            <p className="text-base text-foreground">{props.message}</p>
            <div>
              <Button variant="primary" size="md" onClick={props.onSignIn}>
                {props.signInLabel}
              </Button>
            </div>
          </Outcome>
        ) : null}
        {props.state === "moved" ? <MovedCard {...props} /> : null}
      </div>
    </div>
  );
}

function MovedCard({
  url,
  message,
  copy,
  link,
  note,
  children,
}: ReconnectMoved) {
  const urlElement = <IsolatedIdentifier value={url} />;
  return (
    <div
      data-slot="reconnect-watch-moved"
      className="flex flex-col gap-3 rounded-card surface-raised p-card"
    >
      <Outcome icon={<ArrowRight className="rtl:-scale-x-100" />}>
        <p className="text-base font-medium text-foreground">
          {typeof message === "function" ? message(urlElement) : message}
        </p>
        <div>
          <CopyButton
            text={url}
            label={copy.label}
            copiedLabel={copy.copiedLabel}
            selectedLabel={copy.selectedLabel}
            size="sm"
          />
        </div>
        {link ? (
          <p>
            <ExternalLink href={link.href} newTabLabel={link.newTabLabel}>
              {link.label}
            </ExternalLink>
          </p>
        ) : null}
        {note ? (
          <p className="text-base text-muted-foreground">{note}</p>
        ) : null}
      </Outcome>
      {children}
    </div>
  );
}

export { ReconnectWatch };
export type {
  ReconnectConnected,
  ReconnectCopyLabels,
  ReconnectMoved,
  ReconnectSignIn,
  ReconnectWaiting,
  ReconnectWatchProps,
  ReconnectWatchState,
};
