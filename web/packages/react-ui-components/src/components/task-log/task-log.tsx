// SPDX-License-Identifier: GPL-3.0-or-later
import { Copy } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { IconButton } from "../button/button";
import { stripControl } from "./strip-control";

/** A line of output, optionally with its timestamp (shown in the quieter terminal ink). */
export type TaskLogLine = string | { time: string; text: string };

interface TaskLogProps {
  lines: readonly TaskLogLine[];
  /** The region's name: "Output of Install updates". */
  label: string;
  /** The copy control's name: "Copy output". */
  copyLabel: string;
  /** Announced after copying: "Output copied". */
  copiedLabel: string;
  /**
   * Set when the task has ended: the result in words ("Finished: 3 packages upgraded"). Announced
   * through a polite live region and kept on screen (5.7).
   */
  endMessage?: React.ReactNode;
  className?: string;
}

// Within this many pixels of the end counts as "at the bottom", so a sub-pixel scroll position does
// not stop the view following.
const BOTTOM_SLACK = 8;

function lineText(line: TaskLogLine) {
  return typeof line === "string" ? line : line.text;
}

/**
 * Task and log output on the terminal pair (style guide 5.7). Every line is a text node: backend
 * output is never parsed as markup, and terminal escape sequences are removed. The view follows new
 * output while the reader is at the bottom and stops when they scroll up.
 */
function TaskLog({
  lines,
  label,
  copyLabel,
  copiedLabel,
  endMessage,
  className,
}: TaskLogProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const followRef = React.useRef(true);
  const [announcement, setAnnouncement] = React.useState("");
  // Output lines have no identity but their position, and the list only grows at the end.
  const rows = lines.map((line, position) => ({ key: position, line }));

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && followRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (element) {
      followRef.current =
        element.scrollHeight - element.scrollTop - element.clientHeight <=
        BOTTOM_SLACK;
    }
  };

  const copy = async () => {
    const text = lines
      .map((line) =>
        typeof line === "string"
          ? stripControl(line)
          : `${line.time}  ${stripControl(line.text)}`,
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setAnnouncement("");
      setAnnouncement(copiedLabel);
    } catch {
      // No clipboard (a page served over plain HTTP has none): select the output so the reader can
      // copy it with the keyboard.
      const element = scrollRef.current;
      if (element) {
        window.getSelection()?.selectAllChildren(element);
      }
    }
  };

  return (
    <div data-slot="task-log" className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <div
          ref={scrollRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          onScroll={onScroll}
          className="max-h-80 min-h-24 overflow-auto rounded-card bg-terminal py-3 ps-3.5 pe-12 font-mono text-sm leading-relaxed whitespace-pre-wrap text-terminal-foreground [overflow-wrap:anywhere]"
        >
          {rows.map(({ key, line }) => (
            <div key={key} data-slot="task-log-line">
              {typeof line === "string" ? null : (
                <span className="text-terminal-muted">
                  {stripControl(line.time)}
                  {"  "}
                </span>
              )}
              {stripControl(lineText(line))}
            </div>
          ))}
        </div>
        <IconButton
          label={copyLabel}
          icon={<Copy />}
          size="icon-sm"
          onClick={() => {
            void copy();
          }}
          className="absolute end-2 top-2 bg-terminal text-terminal-muted hover:bg-terminal hover:text-terminal-foreground focus-visible:outline-terminal-foreground"
        />
      </div>
      <p
        role="status"
        className="text-base font-medium text-foreground empty:hidden"
      >
        {endMessage}
      </p>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export { TaskLog };
export type { TaskLogProps };
