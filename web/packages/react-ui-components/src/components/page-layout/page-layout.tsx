// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";

/*
 * The spacing rule (style guide 4.7) as page structure. Four steps, each one level of the hierarchy:
 * `line` between the lines of one thing, `pair` between a heading or a table and what belongs to it
 * alone, `group` between the things of one section, `section` between the sections of a page. The
 * page's header is its first section. Every step follows the density.
 */

/**
 * The page: its header, then its sections, a section step apart. A section with no heading straight
 * under the header (a list page's table and its toolbar) sits two group steps under it instead: with
 * no heading of its own to open it, a full section step would cut it off from the page it belongs to.
 */
function Page({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn(
        "flex min-w-0 flex-col gap-section",
        "[&>[data-slot=page-header]+[data-headed=false]]:-mt-[calc(var(--space-section)-2*var(--space-group))]",
        className,
      )}
      {...props}
    />
  );
}

interface PageHeaderProps extends Omit<
  React.ComponentProps<"header">,
  "title"
> {
  /** The page's one title: the app's `PageTitle`, which also names the tab and takes focus. */
  title: React.ReactNode;
  /** Above the title, a pair step apart: the parent page's link (`Breadcrumbs`). */
  before?: React.ReactNode;
  /** Beside the title on its line: a pending mark. */
  besideTitle?: React.ReactNode;
  /** Under the title, a pair step apart, in secondary text: "EXT4, 7.8 GiB". */
  subtitle?: React.ReactNode;
  /**
   * What the page says first, a group step under the title and a group step apart: the intro, the
   * status line, the page's own actions.
   */
  children?: React.ReactNode;
}

/** The top of a page: the parent's link, the title and its subtitle close together, then the intro. */
function PageHeader({
  title,
  before,
  besideTitle,
  subtitle,
  className,
  children,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn("flex min-w-0 flex-col gap-group", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-pair">
        {before}
        {besideTitle ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {title}
            {besideTitle}
          </div>
        ) : (
          title
        )}
        {subtitle ? (
          <div className="text-body text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

interface PageSectionProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  /** The section's heading, at the section step. Without one the section is a plain group. */
  heading?: React.ReactNode;
  /** The heading's level: 2 under the page title, 3 inside another section. */
  headingLevel?: 2 | 3;
  /** Beside the heading on its line: a count, when it was read, a pending mark. */
  besideHeading?: React.ReactNode;
  /** One or two sentences under the heading, a pair step apart. */
  lead?: React.ReactNode;
}

/**
 * A section of a page on the page ground: its heading and lead close together, then its content a
 * group step under them, the things inside a group step apart. Sections are a section step apart
 * (`Page`). Named by its heading.
 */
function PageSection({
  heading,
  headingLevel = 2,
  besideHeading,
  lead,
  className,
  children,
  ...props
}: PageSectionProps) {
  const headingId = React.useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headed = heading !== undefined && heading !== null;
  return (
    <section
      data-slot="page-section"
      data-headed={headed}
      aria-labelledby={headed ? headingId : undefined}
      className={cn("flex min-w-0 flex-col gap-group", className)}
      {...props}
    >
      {headed || lead ? (
        <div className="flex min-w-0 flex-col gap-pair">
          {headed ? (
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <Heading id={headingId} className="text-section text-foreground">
                {heading}
              </Heading>
              {besideHeading}
            </div>
          ) : null}
          {lead ? <div className="max-w-prose text-body">{lead}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A thing and what belongs to it alone, a pair step apart: a table with its toolbar above and its
 * note below, a field with its help.
 */
function PairStack({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="pair-stack"
      className={cn("flex min-w-0 flex-col gap-pair", className)}
      {...props}
    />
  );
}

export { Page, PageHeader, PageSection, PairStack };
export type { PageHeaderProps, PageSectionProps };
