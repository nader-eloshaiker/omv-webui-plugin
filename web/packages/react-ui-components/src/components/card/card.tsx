// SPDX-License-Identifier: GPL-3.0-or-later
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink as ExternalIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { StatusIcon } from "../status/status";

const cardClass = cva(
  "group/card relative flex min-w-0 flex-col rounded-card text-foreground",
  {
    variants: {
      variant: {
        // A surface raised off the page (foundation 6): the surface colour with the raised shadow, in
        // dark an inner top highlight and a soft long shadow, in light a layered soft shadow.
        raised: "surface-raised",
        // A panel inside a card or a dialog: one ground step, no shadow.
        inset: "bg-muted",
        // A card that acts as a whole (a link to its page). Its title says where it goes; it takes
        // the neutral hover and sinks a pixel when pressed (foundation 13). No arrow or chevron
        // (style guide 10). Pass `render={<a href=… />}` or the router's link.
        action:
          "surface-raised cursor-pointer transition-[background-color,box-shadow,translate] duration-fast ease-standard " +
          "hover:bg-muted active:translate-y-px",
      },
    },
    defaultVariants: { variant: "raised" },
  },
);

/** Where an action card goes: here (the default), or out of the interface in a new tab. */
type CardOpens =
  | { opens?: "here"; newTabLabel?: undefined }
  | {
      /**
       * `new-tab`: the card leaves the interface (the classic interface). The card sets
       * `target="_blank"` and `rel="noopener noreferrer"` on its element whatever it is given
       * (UI-3), and adds `newTabLabel` to its name. Put a `CardExternalMark` at the end of its header.
       */
      opens: "new-tab";
      /** Said after the card's name for assistive technology: "(opens in a new tab)". */
      newTabLabel: string;
    };

type CardProps = useRender.ComponentProps<"div"> &
  VariantProps<typeof cardClass> &
  CardOpens & {
    /**
     * @deprecated A card is no longer lit, tinted or edged in its state (style guide 10). Put the
     * state on its title instead: `<CardTitle tone="warning">`, which leads with the status icon.
     * Still accepted, and only written to `data-tone`, so existing callers compile.
     */
    tone?: "none" | "warning" | "critical" | null;
  };

/**
 * A card (foundation 6): a raised surface with the card corner and the density's padding inside its
 * parts. A `div` by default; pass `render` for the element the page needs, such as
 * `<section aria-labelledby={titleId} />` for a named region or `<li />` in a list of cards. Use a
 * card only for a thing handled as one unit (style guide 10): a region of a page sits on the page
 * ground under its heading instead. A card that acts as a whole is `variant="action"`, with no
 * arrow; one that leaves the interface is also `opens="new-tab"` with a fixed address (`render={<a href={CLASSIC_HOME} />}`) and a
 * `CardExternalMark`. Its `aria-labelledby`, on the card or on the element, keeps working: the
 * new-tab words are added to it.
 */
function Card({
  render,
  variant,
  tone,
  opens,
  newTabLabel,
  className,
  children,
  ...props
}: CardProps) {
  const newTabId = React.useId();
  const external = opens === "new-tab";
  let element = render;
  let labelledBy = props["aria-labelledby"];
  if (external && React.isValidElement<Record<string, unknown>>(render)) {
    const own = render.props;
    const Tag = render.type as React.ElementType;
    labelledBy =
      typeof own["aria-labelledby"] === "string"
        ? own["aria-labelledby"]
        : labelledBy;
    const name = labelledBy ? `${labelledBy} ${newTabId}` : undefined;
    // The element's own props win over the card's in the merge, so these are set after them.
    element = (merged) => (
      <Tag
        {...mergeProps(merged, own)}
        target="_blank"
        rel="noopener noreferrer"
        aria-labelledby={name}
      />
    );
  }
  return useRender({
    render: element,
    defaultTagName: "div",
    props: {
      "data-slot": "card",
      "data-variant": variant ?? "raised",
      "data-opens": external ? "new-tab" : undefined,
      "data-tone": tone && tone !== "none" ? tone : undefined,
      className: cn(cardClass({ variant }), className),
      ...props,
      ...(external
        ? {
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-labelledby": labelledBy
              ? `${labelledBy} ${newTabId}`
              : undefined,
          }
        : {}),
      children: external ? (
        <>
          {children}{" "}
          <span id={newTabId} className="sr-only">
            {newTabLabel}
          </span>
        </>
      ) : (
        children
      ),
    },
  });
}

/** The title row, with an optional action at the end (`CardHeader` wraps under 640px). */
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-card pt-card",
        className,
      )}
      {...props}
    />
  );
}

const titleClass = cva("text-section text-foreground", {
  variants: {
    // A card about a thing in a non-OK state leads its title with that state's icon, in the state's
    // stroke. The words of the title say what is wrong; no tint, glow or coloured edge (style guide 10).
    tone: {
      none: "",
      warning: "flex items-start gap-2 [&>[data-icon]]:text-warning-stroke",
      critical: "flex items-start gap-2 [&>[data-icon]]:text-critical-stroke",
    },
  },
  defaultVariants: { tone: "none" },
});

interface CardTitleProps
  extends React.ComponentProps<"h2">, VariantProps<typeof titleClass> {
  /** The heading's level in the page outline: 2 under the page title, 3 inside a section. */
  level?: 2 | 3 | 4;
}

/**
 * The card's name, the Section step (foundation 4). A heading, so it is reachable by heading
 * navigation. With `tone`, it leads with the state's icon; the heading's words carry the state.
 */
function CardTitle({
  level = 2,
  tone,
  className,
  children,
  ...props
}: CardTitleProps) {
  const Heading = `h${String(level)}` as "h2" | "h3" | "h4";
  const lead = tone === "warning" || tone === "critical";
  return (
    <Heading
      data-slot="card-title"
      data-tone={lead ? tone : undefined}
      className={cn(titleClass({ tone }), className)}
      {...props}
    >
      {lead ? (
        <>
          <StatusIcon status={tone} className="mt-[0.2em] size-[1em]" />
          <span className="min-w-0">{children}</span>
        </>
      ) : (
        children
      )}
    </Heading>
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
      className={cn("flex flex-col gap-4 p-card", className)}
      {...props}
    />
  );
}

/** Secondary links or buttons at the end, start-aligned and separated by the divider. */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-card py-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * @deprecated A card that acts carries no arrow or chevron (style guide 10): its title says where
 * it goes, and its hover and press say it acts. Renders nothing; kept so existing callers compile.
 */
function CardChevron(props: React.ComponentProps<"svg">): null {
  void props;
  return null;
}

/**
 * The mark of a card that leaves the interface (`opens="new-tab"`): the external mark at the end of
 * its header, moving up and out on hover and focus: it warns of the new tab. Decorative; the card
 * says "(opens in a new tab)" in its name.
 */
function CardExternalMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <ExternalIcon
      aria-hidden="true"
      data-slot="card-external-mark"
      className={cn(
        "ms-auto size-4 shrink-0 self-center text-tertiary-foreground transition-[translate,color] duration-fast ease-standard",
        "group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5 group-hover/card:text-muted-foreground",
        "group-focus-visible/card:translate-x-0.5 group-focus-visible/card:-translate-y-0.5",
        "rtl:-scale-x-100 rtl:group-hover/card:-translate-x-0.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardChevron,
  CardContent,
  CardDescription,
  CardExternalMark,
  CardFooter,
  CardHeader,
  CardTitle,
};
export type { CardOpens, CardProps, CardTitleProps };
