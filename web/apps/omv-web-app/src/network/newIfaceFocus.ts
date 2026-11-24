// SPDX-License-Identifier: GPL-3.0-or-later
// Where focus goes after a new interface is saved (phase 5 network design 5.7: "the Interfaces page's
// row appears with the pending mark, and focus moves to it"): the add page records the new interface's
// name, as OMV gave it in the reply, and navigates to the Interfaces page, which moves focus to that
// row once it is listed and then forgets the request. In memory only, never in the address (UI-4,
// UI-13); emptied when the session ends (app.ts).
import { createMemoryStore } from "../shell/memoryStore.ts";

export interface NewIfaceFocusState {
  /** The interface whose row takes focus on the Interfaces page. */
  devicename: string | null;
}

export const newIfaceFocus = createMemoryStore<NewIfaceFocusState>({
  devicename: null,
});

/** After a new interface is saved: its row takes focus on the Interfaces page (5.7). */
export const requestRowFocus = (devicename: string): void =>
  newIfaceFocus.set({ devicename });

/** The row to focus, read without taking it (a render may run twice). */
export const rowFocusRequest = (): string | null =>
  newIfaceFocus.getState().devicename;

/** The Interfaces page has moved focus to the row: forget the request. */
export const clearRowFocus = (): void =>
  newIfaceFocus.set((s) => (s.devicename === null ? {} : { devicename: null }));
