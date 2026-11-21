// SPDX-License-Identifier: GPL-3.0-or-later
import { Copy, Download } from "lucide-react";
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
  /** Shown and announced after copying: "Output copied". */
  copiedLabel: string;
  /**
   * Shown and announced where the browser has no clipboard (a page served over plain HTTP): the output
   * is selected instead. "Output selected. Press Ctrl+C to copy."
   */
  selectedLabel: string;
  /** The download control: its name ("Download output") and the file's name ("install-updates.log"). */
  download?: { label: string; fileName: string };
  /** Shown while there is no output yet: "Waiting for output…". */
  emptyLabel?: React.ReactNode;
  /**
   * Set when the task has ended: the result, best as a status pill with the fixed word and a plain
   * sentence. Announced through a polite live region and kept on screen (5.7).
   */
  endMessage?: React.ReactNode;
  /**
   * `true` (the default): long lines wrap, as task output reads best. `false`: lines keep their
   * length and the block scrolls sideways inside itself, for output printed as columns (`smbstatus`,
   * `exportfs`), which wrapping would scramble. The page itself never scrolls sideways.
   */
  wrap?: boolean;
  /**
   * `default`: up to 20rem tall, for a task's output in a dialog or a panel. `page`: the output is the
   * page's content and grows with it up to 70% of the viewport height before it scrolls.
   */
  size?: "default" | "page";
  /**
   * `true` (the default): the view follows new output while the reader is at the bottom, as a running
   * task's should. `false`: a snapshot that does not grow opens at its first line.
   */
  follow?: boolean;
  /** The region is busy: a refresh of the output is under way. The output stays readable. */
  busy?: boolean;
  className?: string;
}

// Within this many pixels of the end counts as "at the bottom", so a sub-pixel scroll position does
// not stop the view following.
const BOTTOM_SLACK = 8;
// How long the copy confirmation stays visible. It is also announced, so nothing depends on seeing it.
const CONFIRMATION_MS = 4000;

function plainText(lines: readonly TaskLogLine[]) {
  return lines
    .map((line) =>
      typeof line === "string"
        ? stripControl(line)
        : `${stripControl(line.time)}  ${stripControl(line.text)}`,
    )
    .join("\n");
}

/**
 * Task and log output on the terminal pair (style guide 5.7). Every line is a text node: backend
 * output is never parsed as markup, and terminal escape sequences are removed. The view follows new
 * output while the reader is at the bottom and stops when they scroll up. Copy and download take the
 * cleaned text.
 */
function TaskLog({
  lines,
  label,
  copyLabel,
  copiedLabel,
  selectedLabel,
  download,
  emptyLabel,
  endMessage,
  wrap = true,
  size = "default",
  follow = true,
  busy,
  className,
}: TaskLogProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const followRef = React.useRef(true);
  const [notice, setNotice] = React.useState("");
  // Output lines have no identity but their position, and the list only grows at the end.
  const rows = lines.map((line, position) => ({ key: position, line }));

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && follow && followRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines, follow]);

  React.useEffect(() => {
    if (notice === "") {
      return undefined;
    }
    const timer = window.setTimeout(() => setNotice(""), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (element) {
      followRef.current =
        element.scrollHeight - element.scrollTop - element.clientHeight <=
        BOTTOM_SLACK;
    }
  };

  const copy = async () => {
    try {
      if (!(navigator.clipboard as Clipboard | undefined)) {
        throw new Error("no clipboard");
      }
      await navigator.clipboard.writeText(plainText(lines));
      setNotice(copiedLabel);
    } catch {
      // No clipboard (a page served over plain HTTP has none): select the output so the reader can
      // copy it with the keyboard, and say so.
      const element = scrollRef.current;
      if (element) {
        element.focus();
        window.getSelection()?.selectAllChildren(element);
      }
      setNotice(selectedLabel);
    }
  };

  // The download is a real link with a `download` attribute, given a blob of the cleaned text on
  // demand: nothing leaves the page and no address is navigated to. The link is rendered by React, so
  // no code assigns an address (UI-3).
  const downloadRef = React.useRef<HTMLAnchorElement>(null);
  const [downloadUrl, setDownloadUrl] = React.useState<string | undefined>();
  // Once the link carries the new blob, follow it; the blob is released when it is replaced or the log
  // goes away.
  React.useEffect(() => {
    if (downloadUrl === undefined) {
      return undefined;
    }
    downloadRef.current?.click();
    return () => URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);
  const save = () => {
    setDownloadUrl(
      URL.createObjectURL(
        new Blob([plainText(lines)], { type: "text/plain;charset=utf-8" }),
      ),
    );
  };

  return (
    <div data-slot="task-log" className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <div
          ref={scrollRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          aria-busy={busy || undefined}
          data-wrap={wrap}
          data-size={size}
          onScroll={onScroll}
          className={cn(
            "min-h-24 overflow-auto rounded-card bg-terminal py-3 ps-3.5 pe-20 font-mono text-sm leading-relaxed text-terminal-foreground",
            wrap
              ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
              : "whitespace-pre",
            size === "page" ? "max-h-[70vh]" : "max-h-80",
          )}
        >
          {rows.length === 0 && emptyLabel ? (
            <p data-slot="task-log-empty" className="text-terminal-muted">
              {emptyLabel}
            </p>
          ) : null}
          {rows.map(({ key, line }) => (
            <div key={key} data-slot="task-log-line">
              {typeof line === "string" ? null : (
                <span className="text-terminal-muted">
                  {stripControl(line.time)}
                  {"  "}
                </span>
              )}
              {stripControl(typeof line === "string" ? line : line.text)}
            </div>
          ))}
        </div>
        <div className="absolute end-2 top-2 flex gap-1">
          <IconButton
            label={copyLabel}
            icon={<Copy />}
            size="icon-sm"
            disabled={rows.length === 0}
            onClick={() => {
              void copy();
            }}
            className="bg-terminal text-terminal-muted hover:bg-terminal hover:text-terminal-foreground focus-visible:outline-terminal-foreground data-disabled:bg-terminal data-disabled:opacity-50"
          />
          {download ? (
            <IconButton
              label={download.label}
              icon={<Download />}
              size="icon-sm"
              disabled={rows.length === 0}
              onClick={save}
              className="bg-terminal text-terminal-muted hover:bg-terminal hover:text-terminal-foreground focus-visible:outline-terminal-foreground data-disabled:bg-terminal data-disabled:opacity-50"
            />
          ) : null}
        </div>
      </div>
      {download ? (
        <a
          ref={downloadRef}
          href={downloadUrl}
          download={download.fileName}
          hidden
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : null}
      <p
        role="status"
        data-slot="task-log-notice"
        className="min-h-5 text-sm text-muted-foreground"
      >
        {notice}
      </p>
      <div
        role="status"
        data-slot="task-log-end"
        className="text-base text-foreground empty:hidden"
      >
        {endMessage}
      </div>
    </div>
  );
}

export { TaskLog };
export type { TaskLogProps };
