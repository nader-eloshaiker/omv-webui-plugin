// SPDX-License-Identifier: GPL-3.0-or-later
// Signing out: Session.logout, then forget everything this page session learned (dropServerState)
// and show sign-in. A 401 means the session had already ended, which is the same outcome.
import { useSessionLogout } from "@omv-webui/react-api-omv/generated";
import { dropServerState } from "@omv-webui/react-api-omv/query";
import { isRpcError } from "@omv-webui/react-api-omv/transport";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSessionStore } from "./sessionContext.ts";

export function useSignOut() {
  const queryClient = useQueryClient();
  const store = useSessionStore();
  const navigate = useNavigate();
  const logout = useSessionLogout();
  // The backend's message when there is one (UI-9); otherwise the page says it in its own words.
  const [failure, setFailure] = useState<{ message?: string } | null>(null);

  const finish = () => {
    // The signed-in layout renders nothing once the session is gone, so no read of it refetches
    // after the cache is dropped.
    store.dispatch({ type: "signedOut" });
    dropServerState(queryClient);
    void navigate({ to: "/sign-in", replace: true });
  };

  const signOut = async () => {
    setFailure(null);
    try {
      await logout.mutateAsync();
      finish();
    } catch (error) {
      if (isRpcError(error) && error.kind === "session") {
        finish();
        return;
      }
      setFailure(isRpcError(error) ? { message: error.message } : {});
    }
  };

  return { signOut, pending: logout.isPending, failure };
}
