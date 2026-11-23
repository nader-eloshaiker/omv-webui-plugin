// SPDX-License-Identifier: GPL-3.0-or-later
// Which interface and address this page reaches the NAS through (phase 5 network design 0.4), in
// words: the library's ConnectionLine (a `status` line with the neutral Monitor icon, a fact and not
// a warning) with the `network.connection.*` sentence of each conclusion. The interface's name comes
// from the NAS: it is text, isolated, with any bidirectional control shown (UI-2).
import { ConnectionLine } from "@omv-webui/react-ui-components";
import { Trans } from "react-i18next";
import { inertBidi } from "../../format/isolate.ts";
import type { Connection } from "../../network/connection.ts";

export function NetworkConnectionLine({
  connection,
  className,
}: {
  connection: Connection;
  className?: string;
}) {
  switch (connection.kind) {
    case "loading":
    case "tunnel":
    case "readFailed":
      return (
        <ConnectionLine className={className}>
          <Trans i18nKey={`network.connection.${connection.kind}`} />
        </ConnectionLine>
      );
    case "known":
    case "unmanaged":
      return (
        <ConnectionLine
          className={className}
          address={connection.address}
          iface={inertBidi(connection.iface)}
        >
          {(parts) => (
            <Trans
              i18nKey={`network.connection.${connection.kind === "known" ? "known" : "unmanaged"}`}
              components={{ address: parts.address, iface: parts.iface }}
            />
          )}
        </ConnectionLine>
      );
    case "probable":
      return (
        <ConnectionLine
          className={className}
          host={inertBidi(connection.host)}
          iface={inertBidi(connection.iface)}
        >
          {(parts) => (
            <Trans
              i18nKey="network.connection.probable"
              components={{ host: parts.host, iface: parts.iface }}
            />
          )}
        </ConnectionLine>
      );
    case "nameOnly":
    case "unknownAddress":
    case "otherName":
      return (
        <ConnectionLine className={className} host={inertBidi(connection.host)}>
          {(parts) => (
            <Trans
              i18nKey={`network.connection.${connection.kind}`}
              components={{ host: parts.host }}
            />
          )}
        </ConnectionLine>
      );
  }
}
