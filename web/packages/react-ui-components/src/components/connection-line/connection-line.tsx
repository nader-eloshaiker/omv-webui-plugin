// SPDX-License-Identifier: GPL-3.0-or-later
import { Monitor } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { IsolatedIdentifier } from "../text/isolated-identifier";

/** The values of the sentence, each already isolated left to right in the `Identifier` style. */
interface ConnectionLineParts {
  address: React.ReactElement;
  iface: React.ReactElement;
  host: React.ReactElement;
}

interface ConnectionLineProps extends Omit<
  React.ComponentProps<"p">,
  "children" | "role"
> {
  /** The address this page reaches the NAS at, as the page worked it out: "192.0.2.10". */
  address?: string;
  /** The interface's name: "enp2s0". */
  iface?: string;
  /** The host this page was opened at, by name or address: "nas.example.org". */
  host?: string;
  /**
   * The sentence of the conclusion (network design 0.4, `network.connection.*`). A function gets the
   * values as isolated elements to place in the translated sentence, typically through `<Trans>`:
   * `(parts) => <Trans i18nKey="network.connection.known" components={parts} />`. A plain node is
   * rendered as given, for the sentences without values.
   */
  children: React.ReactNode | ((parts: ConnectionLineParts) => React.ReactNode);
}

/**
 * Which connection this page uses (phase 5 network design 0.4): one line with the neutral Monitor
 * icon, at the top of every page and form that can change it. A fact, not a warning, so it carries no
 * status colour; it is a `status` so a conclusion that changes after a read is announced politely.
 * Wordless: the sentence is the caller's, with the values isolated so a right-to-left language keeps
 * them intact.
 */
function ConnectionLine({
  address,
  iface,
  host,
  children,
  className,
  ...props
}: ConnectionLineProps) {
  const parts: ConnectionLineParts = {
    address: <IsolatedIdentifier value={address ?? ""} />,
    iface: <IsolatedIdentifier value={iface ?? ""} />,
    host: <IsolatedIdentifier value={host ?? ""} />,
  };
  return (
    <p
      data-slot="connection-line"
      role="status"
      className={cn(
        "flex items-start gap-2 text-base text-foreground",
        className,
      )}
      {...props}
    >
      <Monitor
        aria-hidden="true"
        className="mt-[0.2em] size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {typeof children === "function" ? children(parts) : children}
      </span>
    </p>
  );
}

export { ConnectionLine };
export type { ConnectionLineParts, ConnectionLineProps };
