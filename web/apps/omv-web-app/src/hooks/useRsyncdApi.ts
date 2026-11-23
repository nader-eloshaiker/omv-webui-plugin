// SPDX-License-Identifier: GPL-3.0-or-later
// The rsync server's writes (phase 5 services design 9.3, 10), from the generated hooks, beside its
// re-reads. Every write here is marked x-omv-dirty in the contract, so the pending-changes reads are
// refreshed centrally (the query client's wiring), never per page. Nothing here retries (UI-14). A
// password passes through setModule's request only; the transport removes the sign-ins' passwords
// from its reply (x-omv-omit).
import {
  useRsyncdDeleteModule,
  useRsyncdSetModule,
  useRsyncdSetSettings,
  type RsyncdModuleStored,
  type RsyncdSetModuleRequest,
  type RsyncdSetSettingsRequest,
  type RsyncdSettings,
} from "@omv-webui/react-api-omv/generated";
import { useQueryClient } from "@tanstack/react-query";
import { rsyncdRereads, type RsyncdRereads } from "./useRsyncdReads.ts";

export interface RsyncdApi extends RsyncdRereads {
  /** Rsyncd.setSettings: `port` and `extraoptions` as read, with only `enable` changed. */
  setSettings(request: RsyncdSetSettingsRequest): Promise<RsyncdSettings>;
  /** Rsyncd.setModule: a new module (the new-object UUID) or a change. */
  setModule(request: RsyncdSetModuleRequest): Promise<RsyncdModuleStored>;
  /** Rsyncd.deleteModule: the module and its sign-ins; no file is touched. */
  deleteModule(uuid: string): Promise<RsyncdModuleStored>;
}

export function useRsyncdApi(): RsyncdApi {
  const queryClient = useQueryClient();
  const setSettings = useRsyncdSetSettings();
  // A sign-in's password is in this mutation's variables: kept by nothing once the request is over
  // (gcTime 0, and reset after each request), so it is held only while the request runs (UI-6).
  const setModule = useRsyncdSetModule({ mutation: { gcTime: 0 } });
  const deleteModule = useRsyncdDeleteModule();
  return {
    ...rsyncdRereads(queryClient),
    setSettings: (request) => setSettings.mutateAsync({ data: request }),
    setModule: async (request) => {
      try {
        return await setModule.mutateAsync({ data: request });
      } finally {
        setModule.reset();
      }
    },
    deleteModule: (uuid) => deleteModule.mutateAsync({ data: { uuid } }),
  };
}
