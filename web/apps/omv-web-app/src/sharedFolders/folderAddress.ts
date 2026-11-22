// SPDX-License-Identifier: GPL-3.0-or-later
// A shared folder's page is addressed by the folder's UUID (phase 5 shares design 2, D1). The address
// is checked against the contract's UUID pattern before anything is read; a value that fails it never
// reaches a call (UI-4), and the page then finds the row of the whole-list read whose `uuid` matches
// exactly and uses that row's fields for every call, never the address.
const FOLDER_ADDRESS =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/u;

export const isFolderAddress = (value: unknown): value is string =>
  typeof value === "string" && FOLDER_ADDRESS.test(value);
