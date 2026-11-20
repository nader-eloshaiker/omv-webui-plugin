// SPDX-License-Identifier: GPL-3.0-or-later
import { Check, Copy } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button, IconButton, type ButtonProps } from "../button/button";
import { controlClass } from "../field/control-class";

type CopyState = "idle" | "copied" | "selected";

type CopyButtonProps = Omit<
  ButtonProps,
  "children" | "onClick" | "size" | "loading" | "aria-label"
> & {
  /** Exactly what is copied: the full path or the whole key, never a shortened form. */
  text: string;
  /**
   * The button's name, naming the object when several sit side by side: "Copy full path of media".
   * The name of an icon-only button and its tooltip; for a button with words, its words unless
   * `children` gives shorter ones, which must then be the start of this name (WCAG 2.5.3).
   */
  label: string;
  /** Shown and announced after copying: "Copied". */
  copiedLabel: string;
  /**
   * Shown and announced where the browser has no clipboard: "Selected. Press Ctrl+C to copy." A page
   * served over plain HTTP has none (the Clipboard API needs a secure context).
   */
  selectedLabel: string;
  /** `icon-sm` and `icon`: only the icon, as in a table cell. `sm` and `md`: the icon and words. */
  size?: "icon-sm" | "icon" | "sm" | "md";
  /** Visible words for the `sm` and `md` sizes: "Copy key". */
  children?: React.ReactNode;
  /** After each press, with what happened. */
  onCopy?: (result: Exclude<CopyState, "idle">) => void;
};

// How long "Copied" stays. It is also announced, so nothing depends on seeing it in time.
const CONFIRMATION_MS = 4000;

/**
 * Copies a value to the clipboard (a path, a key). Where the browser has no clipboard, it shows the
 * value in a read-only field beside the button, selected and focused, and says "Press Ctrl+C to copy",
 * as the task log does with its output. The field goes when focus leaves it. The result is shown
 * beside the button and announced politely.
 */
function CopyButton({
  text,
  label,
  copiedLabel,
  selectedLabel,
  size = "icon-sm",
  variant,
  children,
  onCopy,
  className,
  ...buttonProps
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>("idle");
  const fieldRef = React.useRef<HTMLInputElement>(null);
  const noticeId = React.useId();

  React.useEffect(() => {
    if (state !== "copied") {
      return undefined;
    }
    const timer = window.setTimeout(() => setState("idle"), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  // The fallback field is rendered on the same press; select its whole value once it exists.
  React.useEffect(() => {
    if (state === "selected") {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  }, [state]);

  const copy = async () => {
    try {
      const clipboard = navigator.clipboard as Clipboard | undefined;
      if (!window.isSecureContext || !clipboard) {
        throw new Error("no clipboard");
      }
      await clipboard.writeText(text);
      setState("copied");
      onCopy?.("copied");
    } catch {
      setState("selected");
      onCopy?.("selected");
    }
  };

  const icon = state === "copied" ? <Check /> : <Copy />;
  const press = () => {
    void copy();
  };
  const iconOnly = size === "icon-sm" || size === "icon";

  return (
    <span
      data-slot="copy-button"
      data-state={state}
      className={cn("inline-flex max-w-full flex-wrap items-center", className)}
    >
      {iconOnly ? (
        <IconButton
          {...buttonProps}
          label={label}
          icon={icon}
          size={size}
          variant={variant ?? "ghost"}
          onClick={press}
        />
      ) : (
        <Button
          {...buttonProps}
          aria-label={children ? label : undefined}
          size={size}
          variant={variant ?? "neutral"}
          onClick={press}
        >
          <span aria-hidden="true" className="contents">
            {icon}
          </span>
          {children ?? label}
        </Button>
      )}
      <span
        id={noticeId}
        role="status"
        data-slot="copy-button-notice"
        className="text-xs text-muted-foreground not-empty:ms-1.5"
      >
        {state === "copied"
          ? copiedLabel
          : state === "selected"
            ? selectedLabel
            : ""}
      </span>
      {state === "selected" ? (
        <input
          ref={fieldRef}
          readOnly
          value={text}
          aria-label={label}
          aria-describedby={noticeId}
          onBlur={() => setState("idle")}
          className={cn(controlClass, "mt-1 h-7 basis-full font-mono text-sm")}
        />
      ) : null}
    </span>
  );
}

export { CopyButton };
export type { CopyButtonProps };
