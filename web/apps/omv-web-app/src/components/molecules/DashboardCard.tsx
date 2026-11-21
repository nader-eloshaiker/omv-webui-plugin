// SPDX-License-Identifier: GPL-3.0-or-later
// One card of the dashboard (phase 5 design 1.1): a `section` named by its title, its content, and
// a footer with its link. `busy` while the first read is in flight, with a polite "Loading …" for
// assistive technology (the skeletons are hidden from it).
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@omv-webui/react-ui-components";
import { useId, type ReactNode } from "react";

export function DashboardCard({
  title,
  busy,
  busyLabel,
  footer,
  children,
}: {
  title: string;
  busy?: boolean;
  busyLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <Card render={<section aria-labelledby={titleId} />}>
      <CardHeader>
        <CardTitle id={titleId}>{title}</CardTitle>
      </CardHeader>
      <CardContent aria-busy={busy || undefined}>
        {busy && busyLabel ? (
          <p role="status" className="sr-only">
            {busyLabel}
          </p>
        ) : null}
        {children}
      </CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}
