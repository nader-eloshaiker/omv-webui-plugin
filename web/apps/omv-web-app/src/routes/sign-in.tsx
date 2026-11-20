// SPDX-License-Identifier: GPL-3.0-or-later
// The only route an unauthenticated user sees. It takes no parameters: nothing in the URL decides
// where sign-in goes next (UI-3).
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignInPage } from "../components/pages/SignInPage.tsx";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: ({ context }) => {
    if (context.session.getState().status === "signedIn") {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: SignInPage,
});
