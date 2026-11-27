// SPDX-License-Identifier: GPL-3.0-or-later
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../utils";
import { panelClass } from "./panel-class";

type PanelProps = Omit<useRender.ComponentProps<"div">, "title"> &
  VariantProps<typeof panelClass> & {
    /**
     * The region's name, at the Section step: "Right now". With a title the panel is a `section`
     * named by it. Leave it out when what is inside carries its own heading (`FirstSteps`, `NasFacts`).
     */
    title?: React.ReactNode;
    /** One line beside the title, in secondary text: "Since 10:31, a reading every 2 seconds." */
    note?: React.ReactNode;
    /** The title's level in the page outline: 2 under the page's headline, 3 inside a section. */
    headingLevel?: 2 | 3;
  };

/**
 * A region of a page on a deliberate ground (`raised` or `plate`), with an optional title and a note
 * beside it, and the density's card padding inside.
 *
 * A panel groups what the person reads as one: an instrument whose parts move together, a list
 * worked through as one, a drawing on its sheet. It is never a card by habit (style guide 10, rule 7):
 * words that are said rather than handled (a welcome, the answer) and a list that is simply read
 * stay on the page ground under their heading. A `div` by default; pass `render` for another element.
 * To put a ground on a component that renders its own region and heading, give it
 * `className={panelClass({ ground })}` instead of wrapping it.
 */
function Panel({
  render,
  ground,
  title,
  note,
  headingLevel = 2,
  className,
  children,
  ...props
}: PanelProps) {
  const titleId = React.useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titled = title !== undefined && title !== null;
  return useRender({
    render: render ?? (titled ? <section /> : undefined),
    defaultTagName: "div",
    props: {
      "data-slot": "panel",
      "data-ground": ground ?? "raised",
      "aria-labelledby": titled ? titleId : undefined,
      className: cn(panelClass({ ground }), className),
      ...props,
      children: titled ? (
        <>
          <div
            data-slot="panel-header"
            className="mb-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 compact:mb-2.5"
          >
            <Heading id={titleId} className="text-section text-foreground">
              {title}
            </Heading>
            {note === undefined || note === null ? null : (
              <p className="text-caption text-muted-foreground">{note}</p>
            )}
          </div>
          {children}
        </>
      ) : (
        children
      ),
    },
  });
}

export { Panel };
export type { PanelProps };
