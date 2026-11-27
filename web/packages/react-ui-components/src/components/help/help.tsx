// SPDX-License-Identifier: GPL-3.0-or-later
import { Popover } from "@base-ui/react/popover";
import { CircleHelp } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "../disclosure/disclosure";
import { useShowTips } from "../tip/tips-context";

// Help when asked (rethink P.3, layer G3, 3.8): answers the person opens themselves. None opens by
// itself and none fades. The popovers are Base UI's Popover, non-modal: the button says whether it
// is open and which panel it opens, Escape or a press elsewhere closes it and focus goes back to the
// button. The panel floats under the button, so nothing on the page moves.

const panelClass =
  "flex w-max max-w-[min(20rem,calc(100vw-3rem))] flex-col gap-1.5 rounded-control surface-floating px-3.5 py-3 " +
  "text-start text-sm/relaxed text-popover-foreground outline-hidden origin-(--transform-origin) [&_p]:m-0 " +
  "transition-[opacity,scale] duration-fast ease-enter data-starting-style:scale-95 data-starting-style:opacity-0 " +
  "data-ending-style:opacity-0 data-ending-style:ease-exit";

function HelpPanel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Popover.Popup>) {
  return (
    <Popover.Portal>
      <Popover.Positioner
        side="bottom"
        align="start"
        sideOffset={6}
        className="z-50"
      >
        <Popover.Popup className={cn(panelClass, className)} {...props}>
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  );
}

type HelpPopoverProps = Omit<
  React.ComponentProps<typeof Popover.Trigger>,
  "children" | "aria-label"
> & {
  /** The question it answers, which is the button's name: "What is a workgroup?". */
  label: string;
  /** The answer: one or two plain sentences. */
  children: React.ReactNode;
};

/** The (?) beside a label, opening a small answer under it. */
function HelpPopover({
  label,
  children,
  className,
  ...props
}: HelpPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        data-slot="help-popover"
        aria-label={label}
        className={cn(
          "inline-grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground",
          "transition-colors duration-fast ease-standard hover:bg-muted-strong hover:text-foreground",
          "data-popup-open:bg-muted-strong data-popup-open:text-foreground [&_svg]:size-4",
          className,
        )}
        {...props}
      >
        <CircleHelp aria-hidden="true" />
      </Popover.Trigger>
      <HelpPanel aria-label={label}>{children}</HelpPanel>
    </Popover.Root>
  );
}

type GlossaryTermProps = Omit<
  React.ComponentProps<typeof Popover.Trigger>,
  "children" | "aria-label"
> & {
  /** The term as it is written in the running text: "SMB". */
  term: string;
  /** The button's name, which says it explains the term: "SMB, what it means". */
  label: string;
  /** What it means: one or two plain sentences, after the term in the panel. */
  children: React.ReactNode;
};

/** A technical term in running text that opens what it means. */
function GlossaryTerm({
  term,
  label,
  children,
  className,
  ...props
}: GlossaryTermProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        data-slot="glossary-term"
        aria-label={label}
        className={cn(
          "inline cursor-help rounded-sm bg-transparent p-0 text-inherit underline decoration-dotted underline-offset-3",
          "transition-colors duration-fast ease-standard hover:text-link data-popup-open:text-link",
          className,
        )}
        {...props}
      >
        {term}
      </Popover.Trigger>
      <HelpPanel className="block">
        <Popover.Title render={<span />} className="font-semibold">
          {term}
        </Popover.Title>{" "}
        {children}
      </HelpPanel>
    </Popover.Root>
  );
}

interface HelpDisclosureProps {
  /** The question, which is the trigger's words: "Which should I choose?". */
  question: string;
  /** The answer. */
  children: React.ReactNode;
  className?: string;
}

/**
 * "Which should I choose?" beside a choice. With tips on, a disclosure under the question; with tips
 * off (the enclosing `TipsProvider`), its (?) icon with the same name and the same answer.
 */
function HelpDisclosure({
  question,
  children,
  className,
}: HelpDisclosureProps) {
  const [show] = useShowTips();
  if (!show) {
    return (
      <HelpPopover label={question} className={className}>
        {children}
      </HelpPopover>
    );
  }
  return (
    <Disclosure className={cn("max-w-prose", className)}>
      <DisclosureTrigger variant="inline">{question}</DisclosureTrigger>
      <DisclosurePanel>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground [&_p]:m-0">
          {children}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}

export { GlossaryTerm, HelpDisclosure, HelpPopover };
export type { GlossaryTermProps, HelpDisclosureProps, HelpPopoverProps };
