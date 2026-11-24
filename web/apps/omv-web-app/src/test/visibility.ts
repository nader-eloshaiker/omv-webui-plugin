// SPDX-License-Identifier: GPL-3.0-or-later
// Tests only: make the tab hidden or visible, as the browser does, and tell the listeners. The event
// goes to the document (this interface's listener) and to the window (TanStack Query's focus
// manager listens there).
export function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("visibilitychange"));
}
