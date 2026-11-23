// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's page (phase 5 services design 4, D3). The one path parameter is the job's UUID, and
// only a value that passes the pattern reaches the page: anything else becomes null, shown as "This
// copy job no longer exists" without a call (UI-4). Nothing in the address names a call.
import { createFileRoute } from "@tanstack/react-router";
import { CopyJobRoutePage } from "../../../../../components/pages/CopyJobPage.tsx";
import { isJobAddress } from "../../../../../services/jobModel.ts";

export const Route = createFileRoute("/_signedIn/services/rsync/jobs/$job")({
  params: {
    parse: ({ job }) => ({ job: isJobAddress(job) ? job : null }),
    stringify: ({ job }) => ({ job: job ?? "" }),
  },
  component: CopyJobRoutePage,
});
