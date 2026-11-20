// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import { cn } from "../../utils";

type CardProps = useRender.ComponentProps<"div">;

/**
 * A card (style guide 4.3): a `surface` with a hairline border and the card corner, no shadow, 16px
 * padding inside its parts. A `div` by default; pass `render` for the element the page needs, such as
 * `<section aria-labelledby={titleId} />` for a named region or `<li />` in a list of cards.
 */
function Card({ render, className, ...props }: CardProps) {
  return useRender({
    render,
    defaultTagName: "div",
    props: {
      "data-slot": "card",
      className: cn(
        "flex min-w-0 flex-col rounded-card border border-border bg-surface text-foreground",
        className,
      ),
      ...props,
    },
  });
}

/** The title row, with an optional action at the end (`CardHeader` wraps under 640px). */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4",
        className,
      )}
      {...props}
    />
  );
}

interface CardTitleProps extends React.ComponentProps<"h2"> {
  /** The heading's level in the page outline: 2 under the page title, 3 inside a section. */
  level?: 2 | 3 | 4;
}

/** The card's name, 16px semibold (4.1). A heading, so the card is reachable by heading navigation. */
function CardTitle({ level = 2, className, ...props }: CardTitleProps) {
  const Heading = `h${String(level)}` as "h2" | "h3" | "h4";
  return (
    <Heading
      data-slot="card-title"
      className={cn(
        "text-lg leading-tight font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** One or two plain sentences under the title: what the card is for. */
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("basis-full text-base text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * The body. While its first read is in flight, set `aria-busy` here and put skeletons of the real
 * layout inside, with a polite "Loading …" for assistive technology.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("flex flex-col gap-4 p-4", className)}
      {...props}
    />
  );
}

/** Quiet links or buttons at the end, start-aligned and separated by the divider. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
export type { CardProps, CardTitleProps };
