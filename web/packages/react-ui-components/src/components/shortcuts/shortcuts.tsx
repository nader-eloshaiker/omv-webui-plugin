// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import * as React from "react";
import { cn } from "../../utils";

interface ShortcutsProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  /** "Shortcuts". */
  title: React.ReactNode;
  /** The heading's level: 2 by default. */
  headingLevel?: 2 | 3;
  /** `ShortcutsItem`s. */
  children: React.ReactNode;
}

/**
 * A short list of text actions (rethink 6.2 E): what the dashboard offers that the map does not, in
 * the place of the first steps when they are done or tips are off. Each action is on the screen once:
 * the map keeps its own. Rows parted by hairlines; no tiles (style guide 10, rule 14).
 */
function Shortcuts({
  title,
  headingLevel = 2,
  className,
  children,
  ...props
}: ShortcutsProps) {
  const titleId = React.useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      data-slot="shortcuts"
      aria-labelledby={titleId}
      className={cn("flex min-w-0 flex-col", className)}
      {...props}
    >
      <Heading id={titleId} className="mb-1.5 text-section text-foreground">
        {title}
      </Heading>
      <ul className="flex flex-col divide-y divide-border">{children}</ul>
    </section>
  );
}

type ShortcutsItemProps = useRender.ComponentProps<"button"> & {
  /** The action's icon, decorative. */
  icon?: React.ReactNode;
};

/**
 * One shortcut: its icon and its words, in the link ink. A button by default; pass `render` for the
 * router's link or an external link. The words say where it goes; no arrow (style guide 10, rule 1).
 */
function ShortcutsItem({
  icon,
  render,
  className,
  children,
  ...props
}: ShortcutsItemProps) {
  const element = useRender({
    render,
    defaultTagName: "button",
    props: {
      type: render ? undefined : "button",
      ...props,
      "data-slot": "shortcuts-item",
      className: cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-1.5 text-start text-sm font-medium text-link hover:underline hover:underline-offset-3 focus-visible:outline-offset-0 compact:min-h-8.5",
        className,
      ),
      children: (
        <>
          {icon ? (
            <span
              aria-hidden="true"
              className="inline-grid w-5 place-items-center text-muted-foreground [&>svg]:size-4.5"
            >
              {icon}
            </span>
          ) : null}
          {children}
        </>
      ),
    },
  });
  return <li>{element}</li>;
}

export { Shortcuts, ShortcutsItem };
export type { ShortcutsItemProps, ShortcutsProps };
