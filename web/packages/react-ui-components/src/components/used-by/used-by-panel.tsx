// SPDX-License-Identifier: GPL-3.0-or-later
import { CircleAlert, CircleHelp } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { ServerMessage } from "../text/server-message";

interface Referrer {
  id: string;
  /**
   * What refers to the object, in words: "SMB share", "Copied by the copy job", "Offered to the rsync
   * server as". Or the whole entry as one sentence, with no `name`: "Holds the home folders."
   */
  kind: React.ReactNode;
  /**
   * Its name, from the backend, rendered as text and never cut short. Leave it out for an entry that
   * is only a sentence. An empty string is treated as no name.
   */
  name?: string;
  /**
   * How the name is set. `identifier` (the default): the mono face, for names a reader copies or
   * compares (a share, an rsync server name, a path). `text`: the body face, medium weight, isolated
   * with `dir="auto"`, for a name someone wrote (a copy job's note, design 0.2), which may be
   * right-to-left.
   */
  nameStyle?: "identifier" | "text";
  /**
   * A control that opens it, such as a router link. Give it the full name, not just "Open":
   * `aria-label="Open SMB share media"`, since several rows sit side by side.
   */
  action?: React.ReactNode;
}

interface Retry {
  /** One plain sentence: "Could not check whether anything uses this shared folder." */
  message: React.ReactNode;
  /** The backend's words, labelled as from the server (UI-9). */
  serverMessage?: { label: React.ReactNode; text: string };
  retryLabel: React.ReactNode;
  onRetry: () => void;
}

interface UsedByPanelProps {
  /** "Used by". */
  title: React.ReactNode;
  /** The heading's level in the page outline. */
  headingLevel?: 2 | 3 | 4;
  referrers: readonly Referrer[];
  /**
   * Shown only when every source was read and nothing refers to the object: "Nothing uses this shared
   * folder." It says what was found, not what to do.
   */
  emptyText: React.ReactNode;
  /** The sources are being read: the text announced meanwhile ("Checking what uses it…"). */
  loading?: { label: string };
  /** No source could be read. The panel then says nothing about whether the object is in use. */
  error?: Retry;
  /** Some sources could not be read: the list may be incomplete, and it says so. */
  partial?: Retry;
  /**
   * The backend says the object is in use but no known referrer was found (UX audit 4.8): a message
   * such as "Used by an add-on or setting this interface does not show yet" and a link to the classic
   * interface (an `ExternalLink` with a fixed address, UI-3). Leave the link out where the message
   * alone says where to look.
   */
  unknownUse?: { message: React.ReactNode; classicLink?: React.ReactNode };
  /**
   * The act that is blocked while the object is in use, shown unavailable with the blocker named in
   * words beside it (never only in a tooltip): "Delete" with "Remove the 2 shares that use it first."
   */
  blockedAction?: { label: React.ReactNode; reason: React.ReactNode };
  className?: string;
}

function RetryNotice({ notice }: { notice: Retry }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 text-base text-foreground">
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-foreground"
        />
        <span>{notice.message}</span>
      </p>
      {notice.serverMessage ? (
        <ServerMessage label={notice.serverMessage.label}>
          {notice.serverMessage.text}
        </ServerMessage>
      ) : null}
      <div>
        <Button variant="neutral" size="sm" onClick={notice.onRetry}>
          {notice.retryLabel}
        </Button>
      </div>
    </div>
  );
}

const HEADINGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * Pattern G, "Used by" (UX audit 4.8): on a file system, shared folder, user or certificate, what
 * refers to it, so a delete, unmount or wipe that is unavailable says why. A state it could not read
 * is never shown as "nothing uses it".
 */
function UsedByPanel({
  title,
  headingLevel = 3,
  referrers,
  emptyText,
  loading,
  error,
  partial,
  unknownUse,
  blockedAction,
  className,
}: UsedByPanelProps) {
  const reasonId = React.useId();
  const Heading = HEADINGS[headingLevel];
  let body: React.ReactNode;
  if (loading) {
    body = (
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-4 w-2/3 rounded-sm bg-muted-strong motion-safe:animate-breathe" />
        <div className="h-4 w-1/2 rounded-sm bg-muted-strong motion-safe:animate-breathe" />
      </div>
    );
  } else if (error) {
    body = <RetryNotice notice={error} />;
  } else if (referrers.length > 0) {
    body = (
      <ul className="flex flex-col">
        {referrers.map((referrer) => (
          <li
            key={referrer.id}
            className="flex flex-col gap-x-3 gap-y-1 border-t border-border py-row first:border-t-0 sm:flex-row sm:items-center"
          >
            <span className="text-sm text-muted-foreground sm:w-32 sm:shrink-0">
              {referrer.kind}
            </span>
            {/* Present even without a name, so the action keeps its place at the end of the row. */}
            <span
              data-slot="used-by-name"
              dir={referrer.nameStyle === "text" ? "auto" : undefined}
              className={cn(
                "min-w-0 flex-1 text-sm text-foreground [overflow-wrap:anywhere] empty:hidden sm:empty:block",
                referrer.nameStyle === "text" ? "font-medium" : "font-mono",
              )}
            >
              {referrer.name}
            </span>
            {referrer.action}
          </li>
        ))}
      </ul>
    );
  } else if (unknownUse) {
    body = (
      <div className="flex items-start gap-2 text-base text-foreground">
        <CircleHelp
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="flex flex-col gap-1">
          <p>{unknownUse.message}</p>
          {unknownUse.classicLink ? <div>{unknownUse.classicLink}</div> : null}
        </div>
      </div>
    );
  } else if (!partial) {
    body = <p className="text-base text-muted-foreground">{emptyText}</p>;
  }
  return (
    <section
      data-slot="used-by-panel"
      aria-busy={loading ? true : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-card surface-raised p-card",
        className,
      )}
    >
      <Heading className="text-base font-semibold text-foreground">
        {title}
      </Heading>
      <span role="status" className="sr-only">
        {loading?.label}
      </span>
      {body}
      {partial && !loading && !error ? <RetryNotice notice={partial} /> : null}
      {blockedAction ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {/* Neutral, not red: it would open a confirmation, and only that dialog's button is red. */}
          <Button
            variant="neutral"
            disabled
            focusableWhenDisabled
            aria-describedby={reasonId}
          >
            {blockedAction.label}
          </Button>
          <p id={reasonId} className="text-sm text-muted-foreground">
            {blockedAction.reason}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export { UsedByPanel };
export type { Referrer, UsedByPanelProps };
