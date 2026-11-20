// SPDX-License-Identifier: GPL-3.0-or-later
// Test support for UI-13: what browser storage holds, so a test can prove it is preferences only.
// It lives beside the preference stores because only code here may reach storage (lint); nothing in
// the interface imports it.

export interface StorageSnapshot {
  local: Record<string, string>;
  session: Record<string, string>;
}

const entries = (storage: Storage): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((key): key is string => key !== null)
      .map((key) => [key, storage.getItem(key) ?? ""]),
  );

export function storageSnapshot(): StorageSnapshot {
  return { local: entries(localStorage), session: entries(sessionStorage) };
}

export function clearStorage(): void {
  localStorage.clear();
  sessionStorage.clear();
}
