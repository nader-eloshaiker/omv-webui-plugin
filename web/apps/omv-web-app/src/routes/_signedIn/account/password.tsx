// SPDX-License-Identifier: GPL-3.0-or-later
// The stock address of the password form (the set-up checklist links here): the account page, with
// focus on "Change password". No menu item of its own: "Your account" is current for it.
import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "../../../components/pages/AccountPage.tsx";

export const Route = createFileRoute("/_signedIn/account/password")({
  component: () => <AccountPage focus="password" />,
});
