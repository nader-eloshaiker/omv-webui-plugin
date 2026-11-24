// SPDX-License-Identifier: GPL-3.0-or-later
// Which interface this page reaches the NAS through (phase 5 network design 0.4), from the
// dashboard's own read of the interfaces: the Network card marks it, and the live Network tile shows
// it. The NAS's name is read only when the page was opened by a name; at an address it is not needed.
import type { NetworkDevice } from "@omv-webui/react-api-omv/generated";
import { useState } from "react";
import {
  parsePageHost,
  workOutConnection,
  type Connection,
} from "../network/connection.ts";
import {
  loading as notYetRead,
  ok,
  type GeneralSettings,
} from "../network/dto.ts";
import { readPageLocation } from "../network/pageLocation.ts";
import { readOf, useGeneralSettings } from "./useNetworkReads.ts";

export function useDashboardConnection(
  devices: readonly NetworkDevice[] | undefined,
): Connection {
  const [location] = useState(readPageLocation);
  const byName = parsePageHost(location.hostname)?.kind === "name";
  const general = useGeneralSettings({
    enabled: byName && devices !== undefined,
    focus: false,
  });
  return workOutConnection({
    location,
    devices: devices === undefined ? notYetRead : ok(devices),
    general: byName ? readOf<GeneralSettings>(general) : notYetRead,
  });
}
