// SPDX-License-Identifier: GPL-3.0-or-later
import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "../../components/pages/LandingPage.tsx";

export const Route = createFileRoute("/_signedIn/")({
  component: LandingPage,
});
