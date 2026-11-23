// SPDX-License-Identifier: GPL-3.0-or-later
// "Set up this port…" on an interface's page opens the set-up form at /network/interfaces/add/port
// with that port chosen (phase 5 network design 4.2 item 5, 5, 14.2). The port is handed over in
// memory, never in the address (UI-4: a URL only selects a view): the interface's page hands it over
// just before it navigates, and the add page takes it once when it opens. Taken means forgotten, so a
// later visit to the add page starts with no port chosen. Only a kernel interface name is held.
import { isInterfaceName } from "./ifaceName.ts";

let handed: string | null = null;

/** The interface's page: the port the form should start with. */
export function handOverPort(devicename: string): void {
  handed = isInterfaceName(devicename) ? devicename : null;
}

/** The add page, once on opening: the port handed over, or null; either way it is then forgotten. */
export function takeHandedOverPort(): string | null {
  const port = handed;
  handed = null;
  return port;
}
