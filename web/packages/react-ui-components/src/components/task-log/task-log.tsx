// SPDX-License-Identifier: GPL-3.0-or-later
import { Copy, Download } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button, IconButton } from "../button/button";
import { ConfirmDialog } from "../confirm-dialog/confirm-dialog";
import { stripControl } from "./strip-control";

/** A line of output, optionally with its timestamp (shown in the quieter terminal ink). */
export type TaskLogLine = string | { time: string; text: string };

/** Show only the first lines of a long output until the reader asks for the rest. */
export interface TaskLogLimit {
  /** How many lines to show at first. */
  lines: number;
  /** The line under the frame while it is cut short: "Showing the first 200 of 1,204 lines." */
  partialLabel: (shown: number, total: number) => React.ReactNode;
  /** The control that shows the rest in the same frame: "Show all lines". */
  showAllLabel: string;
}

/**
 * Keep only the newest lines of a long, growing output on screen (phase 5 services design 7.3, D10):
 * a running copy job can print hundreds of thousands. Unlike `limit`, which cuts a finished snapshot
 * at its first lines and offers the rest, a cap drops the oldest lines from view for good, so the
 * page stays fast; copy and download still take every line passed in. (Where the browser has no
 * clipboard, copying selects the lines on screen only; the download has the rest.)
 */
export interface TaskLogCap {
  /** How many of the newest lines to keep on screen: 10,000. */
  lines: number;
  /**
   * The line under the frame once older lines are hidden: "Showing the newest 10,000 lines. The
   * download has every line received." It is also the output's description.
   */
  label: (shown: number, total: number) => React.ReactNode;
}

/**
 * Stop a running task, where stopping is safe (style guide 5.7): a neutral button under the frame
 * that opens a plain confirmation. Leave it out once the task has ended.
 */
export interface TaskLogStop {
  /** The button: "Stop the copy…". */
  label: React.ReactNode;
  /** The confirmation's title: "Stop Photos to Backup?" */
  title: React.ReactNode;
  /** What stopping leaves behind: "Files copied so far stay. …" */
  description: React.ReactNode;
  /** The confirm button: "Stop the copy". */
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  /** Called on confirm; the dialog closes. Show the outcome through the task's state. */
  onStop: () => void;
  /** The stop request is running: the button shows it and ignores presses. */
  pending?: boolean;
}

interface TaskLogProps {
  /**
   * Every line received, oldest first. With `cap`, pass them all: only the newest are drawn, and
   * copy and download take every one.
   */
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
  /**
   * Show only the first `limit.lines` lines of a longer output, with the `partialLabel` line and a
   * `showAllLabel` button under the frame that show the rest. Copy and download always take every
   * line. Output within the limit is shown whole, as without it. For a finished snapshot.
   */
  limit?: TaskLogLimit;
  /**
   * Keep only the newest `cap.lines` lines on screen, with `cap.label` under the frame. For a
   * growing output. `limit` and `cap` answer different outputs: give one or neither; with both,
   * `limit` applies and `cap` is ignored.
   */
  cap?: TaskLogCap;
  /** A Stop control and its confirmation, while the task runs. */
  stop?: TaskLogStop;
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

/** Focuses the output and selects all of it, for the reader to copy with the keyboard. */
function selectOutput(element: HTMLElement | null) {
  if (element) {
    element.focus();
    window.getSelection()?.selectAllChildren(element);
  }
}

/**
 * Task and log output on the terminal pair (style guide 5.7). Every line is a text node: backend
 * output is never parsed as markup, and terminal escape sequences are removed. The view follows new
 * output while the reader is at the bottom and stops when they scroll up. Copy and download take the
 * cleaned text. The output is not a live region (it would chatter); only the copy notice and the
 * `endMessage` are announced.
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
  limit,
  cap,
  stop,
  className,
}: TaskLogProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const followRef = React.useRef(true);
  const [notice, setNotice] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);
  const [confirmingStop, setConfirmingStop] = React.useState(false);
  const partial = limit !== undefined && !showAll && lines.length > limit.lines;
  const capped =
    limit === undefined && cap !== undefined && lines.length > cap.lines;
  // With a cap, the first line drawn is this far into `lines`.
  const offset = capped ? lines.length - cap.lines : 0;
  const shownLines = partial
    ? lines.slice(0, limit.lines)
    : capped
      ? lines.slice(offset)
      : lines;
  // Output lines have no identity but their position in everything received, and the list only
  // grows at the end; a capped view keeps each line's key as older ones leave it.
  const rows = shownLines.map((line, position) => ({
    key: offset + position,
    line,
  }));
  const partialId = `${React.useId()}-partial`;

  // Set when the no-clipboard copy has to show the whole output before it can select it.
  const selectWhenShownRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (showAll && selectWhenShownRef.current) {
      selectWhenShownRef.current = false;
      selectOutput(scrollRef.current);
    }
  }, [showAll]);

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
      // copy it with the keyboard, and say so. A cut-short output is shown whole first, so the
      // selection, like the copy, takes every line.
      if (partial) {
        selectWhenShownRef.current = true;
        setShowAll(true);
      } else {
        selectOutput(scrollRef.current);
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
          aria-describedby={partial || capped ? partialId : undefined}
          data-wrap={wrap}
          data-partial={partial || undefined}
          data-capped={capped || undefined}
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
          {lines.length === 0 && emptyLabel ? (
            <p data-slot="task-log-empty" className="text-terminal-muted">
              {emptyLabel}
            </p>
          ) : null}
          {rows.map(({ key, line }) => (
            // An empty line keeps a line's height, so blank lines that separate sections stay.
            <div key={key} data-slot="task-log-line" className="min-h-[1lh]">
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
            disabled={lines.length === 0}
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
              disabled={lines.length === 0}
              onClick={save}
              className="bg-terminal text-terminal-muted hover:bg-terminal hover:text-terminal-foreground focus-visible:outline-terminal-foreground data-disabled:bg-terminal data-disabled:opacity-50"
            />
          ) : null}
        </div>
      </div>
      {partial ? (
        <div
          data-slot="task-log-partial"
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <p id={partialId} className="text-sm text-muted-foreground">
            {limit.partialLabel(limit.lines, lines.length)}
          </p>
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={() => {
              setShowAll(true);
              // The button goes away with the cut; the reader's focus moves to the output it opened.
              scrollRef.current?.focus({ preventScroll: true });
            }}
          >
            {limit.showAllLabel}
          </Button>
        </div>
      ) : null}
      {capped ? (
        <p
          id={partialId}
          data-slot="task-log-capped"
          className="text-sm text-muted-foreground"
        >
          {cap.label(cap.lines, lines.length)}
        </p>
      ) : null}
      {stop ? (
        <div data-slot="task-log-stop">
          <Button
            type="button"
            variant="neutral"
            size="sm"
            loading={stop.pending}
            onClick={() => setConfirmingStop(true)}
          >
            {stop.label}
          </Button>
          <ConfirmDialog
            open={confirmingStop}
            onOpenChange={setConfirmingStop}
            title={stop.title}
            description={stop.description}
            confirmLabel={stop.confirmLabel}
            cancelLabel={stop.cancelLabel}
            onConfirm={() => {
              setConfirmingStop(false);
              stop.onStop();
            }}
          />
        </div>
      ) : null}
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
