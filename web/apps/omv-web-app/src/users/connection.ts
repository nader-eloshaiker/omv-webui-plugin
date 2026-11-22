// SPDX-License-Identifier: GPL-3.0-or-later
// Whether this page reached the NAS over HTTPS (UI-12; phase 5 users design 0.7, D9): on a connection
// that is not encrypted, every password field here gets the line that says so.
export const encryptedConnection = (): boolean =>
  window.location.protocol === "https:";
