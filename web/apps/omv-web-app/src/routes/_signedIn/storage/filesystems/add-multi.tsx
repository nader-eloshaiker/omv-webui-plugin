// SPDX-License-Identifier: GPL-3.0-or-later
// "Combine disks (BTRFS)", Flow A's multi-disk variant (phase 5 file-systems design 7). No parameter:
// nothing is chosen from the address, and opening it only reads (R9). Its own chunk.
import { createFileRoute } from "@tanstack/react-router";
import { CombineDisksRoutePage } from "../../../../components/pages/AddStoragePage.tsx";

export const Route = createFileRoute(
  "/_signedIn/storage/filesystems/add-multi",
)({
  component: CombineDisksRoutePage,
});
