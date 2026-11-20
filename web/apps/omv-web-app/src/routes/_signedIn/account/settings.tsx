// SPDX-License-Identifier: GPL-3.0-or-later
// Account > Your account, for every signed-in user. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "../../../components/pages/AccountPage.tsx";

export const Route = createFileRoute("/_signedIn/account/settings")({
  component: () => <AccountPage focus="top" />,
});
