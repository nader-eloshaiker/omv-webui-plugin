// SPDX-License-Identifier: GPL-3.0-or-later
// Services > SMB/CIFS, "Windows and Mac sharing" (phase 5 shares design 5), built in this interface;
// more specific than /$group/$item, so it wins. Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { SmbPage } from "../../../components/pages/SmbPage.tsx";

export const Route = createFileRoute("/_signedIn/services/smb")({
  component: SmbPage,
});
