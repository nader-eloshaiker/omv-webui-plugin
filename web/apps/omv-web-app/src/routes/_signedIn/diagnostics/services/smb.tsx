// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostics > Services, the SMB/CIFS tab: a static route of its own (UI-4: no part of the address names
// a method). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmbDetailsPage } from "../../../../components/pages/ServiceDetailsPage.tsx";

export const Route = createFileRoute("/_signedIn/diagnostics/services/smb")({
  component: SmbDetailsPage,
});
