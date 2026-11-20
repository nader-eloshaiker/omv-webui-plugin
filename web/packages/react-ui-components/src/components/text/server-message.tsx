// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";

interface ServerMessageProps {
  /** Says where the text came from: "Message from the server". */
  label: React.ReactNode;
  /** The backend's own words, as text (UI-9): never parsed, never trimmed of what it says. */
  children: string;
  className?: string;
}

/**
 * The backend's message, shown after the interface's own plain sentence, as a secondary block
 * labelled as coming from the server (UI-9). The reader gets the plain words first and the exact
 * words for a search or a support request second.
 */
function ServerMessage({ label, children, className }: ServerMessageProps) {
  return (
    <div
      data-slot="server-message"
      className={cn("flex flex-col gap-1", className)}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="rounded-control bg-muted px-2.5 py-1.5 font-mono text-sm whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {children}
      </p>
    </div>
  );
}

export { ServerMessage };
export type { ServerMessageProps };
