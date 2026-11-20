// SPDX-License-Identifier: GPL-3.0-or-later
// Everything behind sign-in. It renders nothing the moment the session is gone, so no read under it
// fetches again after the server data has been dropped. The idle warning lives here.
import { Outlet } from "@tanstack/react-router";
import { useSession } from "../../session/sessionContext.ts";
import { IdleWarning } from "../organisms/IdleWarning.tsx";

export function SignedInLayout() {
  const session = useSession();
  if (session.status !== "signedIn") {
    return null;
  }
  return (
    <>
      <Outlet />
      <IdleWarning />
    </>
  );
}
