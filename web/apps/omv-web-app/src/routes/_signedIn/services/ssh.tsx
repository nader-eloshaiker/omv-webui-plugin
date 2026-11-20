// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SSH, built in this interface; more specific than /$group/$item, so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SshPage } from "../../../components/pages/SshPage.tsx";

export const Route = createFileRoute("/_signedIn/services/ssh")({
  component: SshPage,
});
