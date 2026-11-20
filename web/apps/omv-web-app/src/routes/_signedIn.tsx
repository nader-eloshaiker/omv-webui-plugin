// SPDX-License-Identifier: GPL-3.0-or-later
// Every route behind sign-in sits under this layout. Without a session, sign-in is shown instead;
// the address the user asked for is not remembered (UI-3).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignedInLayout } from "../components/templates/SignedInLayout.tsx";

export const Route = createFileRoute("/_signedIn")({
  beforeLoad: ({ context }) => {
    if (context.session.getState().status !== "signedIn") {
      throw redirect({ to: "/sign-in", replace: true });
    }
  },
  component: SignedInLayout,
});
