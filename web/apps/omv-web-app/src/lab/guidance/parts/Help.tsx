// SPDX-License-Identifier: GPL-3.0-or-later
// Help when asked (rethink P.3, layer G3): answers the person opens themselves. None of them opens
// by itself and none fades. Development only (UI-11) until the owner has seen them.
//
//   HelpPopover   the (?) beside a label: a button named with its question, opening a small
//                 popover under it.
//   GlossaryTerm  a technical term in running text ("SMB") that opens what it means.
//   HelpDisclosure "Which should I choose?" as a disclosure; with tips off it folds into its (?)
//                 icon, which keeps the same name and opens the same answer.
//
// The popovers are non-modal: the button says whether it is open (aria-expanded) and which panel it
// opens (aria-controls); the panel follows it in reading order and floats over what is below, so
// nothing moves. Escape closes and keeps focus on the button; a press elsewhere closes.
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "@omv-webui/react-ui-components";
import { CircleHelp } from "lucide-react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useShowTips } from "./tipsContext.ts";

/** Open, and closed again by Escape or a press outside `root`. */
function usePopover(root: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, root]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      root.current?.querySelector("button")?.focus();
    }
  };
  return { open, setOpen, onKeyDown };
}

/** The (?) beside a label. `label` is its question: "What is a workgroup?". */
export function HelpPopover({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { open, setOpen, onKeyDown } = usePopover(rootRef);
  const id = useId();
  return (
    <div ref={rootRef} className="g-pop" onKeyDown={onKeyDown}>
      <button
        type="button"
        className="g-pop-q"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <CircleHelp aria-hidden="true" />
      </button>
      <div id={id} hidden={!open} className="g-pop-panel">
        {children}
      </div>
    </div>
  );
}

/** A technical term in running text that opens what it means. */
export function GlossaryTerm({
  term,
  meaning,
}: {
  /** The term as it is written: "SMB". */
  term: string;
  /** One or two plain sentences. */
  meaning: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const { open, setOpen, onKeyDown } = usePopover(rootRef);
  const id = useId();
  return (
    <span ref={rootRef} className="g-term" onKeyDown={onKeyDown}>
      <button
        type="button"
        className="g-term-word"
        aria-label={`${term}, what it means`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {term}
      </button>
      <span id={id} hidden={!open} className="g-pop-panel g-term-panel">
        <span className="g-term-name">{term}</span> {meaning}
      </span>
    </span>
  );
}

/**
 * "Which should I choose?" beside a choice. With tips on, a disclosure under the question; with
 * tips off, its (?) icon with the same name.
 */
export function HelpDisclosure({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  const [show] = useShowTips();
  const [open, setOpen] = useState(false);
  if (!show) {
    return <HelpPopover label={question}>{children}</HelpPopover>;
  }
  return (
    <Disclosure open={open} onOpenChange={setOpen} className="g-help">
      <DisclosureTrigger variant="inline">{question}</DisclosureTrigger>
      <DisclosurePanel>
        <div className="g-help-body">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}
