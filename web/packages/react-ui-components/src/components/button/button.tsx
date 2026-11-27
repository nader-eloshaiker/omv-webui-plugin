// SPDX-License-Identifier: GPL-3.0-or-later
import { Button as BaseButton } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import type { VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "../../utils";
import { Tooltip } from "../tooltip/tooltip";
import { buttonClass } from "./button-class";

type ButtonProps = React.ComponentProps<typeof BaseButton> &
  VariantProps<typeof buttonClass> & {
    /**
     * The work this button started is running. The button keeps its focus and its name, reports
     * `aria-busy`, shows a spinner and ignores further presses until it clears.
     */
    loading?: boolean;
  };

/**
 * The system's button, on Base UI's Button. Pass `render` to draw it as another element (a router
 * link) and `focusableWhenDisabled` where a disabled button must still be reachable to explain why.
 */
function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  focusableWhenDisabled,
  render,
  children,
  ...props
}: ButtonProps) {
  const content = (
    <>
      {loading ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : null}
      {children}
    </>
  );
  const classes = cn(buttonClass({ variant, size }), className);
  if (
    render !== undefined &&
    typeof render !== "function" &&
    render.type !== "button"
  ) {
    // Drawn as a link (`render={<Link />}`, an `<a>`): it stays a link with the button's look, so it
    // keeps the link's role and behaviour. Base UI's Button would either warn that it is not a
    // native button or give it the button role.
    const { nativeButton: _native, ...attributes } = props;
    return (
      <RenderedButton
        {...(attributes as React.HTMLAttributes<HTMLElement>)}
        render={render}
        className={classes}
        aria-busy={loading || undefined}
      >
        {content}
      </RenderedButton>
    );
  }
  return (
    <BaseButton
      data-slot="button"
      render={render}
      disabled={disabled || loading}
      focusableWhenDisabled={focusableWhenDisabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {content}
    </BaseButton>
  );
}

/** A button drawn as another element: that element, with the button's classes and content. */
function RenderedButton({
  render,
  ...props
}: React.HTMLAttributes<HTMLElement> & { render: React.ReactElement }) {
  return useRender({
    render,
    defaultTagName: "a",
    props: { ...props, "data-slot": "button" },
  });
}

type IconButtonProps = Omit<ButtonProps, "children" | "aria-label"> & {
  /** The accessible name, also shown as the tooltip (style guide 4.4). Required: an icon is not a name. */
  label: string;
  /** The icon, 16px; marked decorative here. */
  icon: React.ReactElement;
};

/** A button that is only an icon. Its name comes from `label` and is shown as a tooltip. */
function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "icon",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <Button aria-label={label} variant={variant} size={size} {...props}>
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
      </Button>
    </Tooltip>
  );
}

/** Where a save is: not started, in flight, or just landed. */
type SavePhase = "idle" | "saving" | "saved";

type SaveButtonProps = Omit<ButtonProps, "loading" | "variant"> & {
  /** The caller owns the phase and returns it to `idle` about 1.5s after `saved`. */
  phase: SavePhase;
  /** The words while saving: "Saving…". */
  savingLabel: React.ReactNode;
  /** The words once it landed: "Saved". */
  savedLabel: React.ReactNode;
};

// The three labels share one grid cell, so the button keeps the width of the longest and nothing
// around it moves; the one shown slides in, the others are hidden from assistive technology.
const labelClass =
  "col-start-1 row-start-1 transition-[opacity,translate] duration-base ease-standard " +
  "data-[shown=false]:-translate-y-1.5 data-[shown=false]:opacity-0";

/**
 * The primary button of a settings form, with the save settle (foundation 7.2): its label slides out,
 * a spinner shows while saving, then a tick draws and the button turns OK green with `savedLabel`.
 * Reduced motion: the words change, nothing moves. Announce the outcome in the page's own live
 * region; the button only shows it.
 */
function SaveButton({
  phase,
  savingLabel,
  savedLabel,
  className,
  children,
  ...props
}: SaveButtonProps) {
  const label = (shown: boolean, content: React.ReactNode) => (
    <span
      data-shown={shown}
      aria-hidden={shown ? undefined : true}
      className={labelClass}
    >
      {content}
    </span>
  );
  return (
    <Button
      data-phase={phase}
      variant="primary"
      loading={phase === "saving"}
      className={cn(
        "data-[phase=saved]:border-ok-stroke data-[phase=saved]:bg-ok data-[phase=saved]:text-ok-foreground data-[phase=saved]:hover:bg-ok",
        className,
      )}
      {...props}
    >
      {phase === "saved" ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="m5 12.5 4.5 4.5L19 7.5"
            pathLength={1}
            className="animate-draw [stroke-dasharray:1]"
          />
        </svg>
      ) : null}
      <span className="grid">
        {label(phase === "idle", children)}
        {label(phase === "saving", savingLabel)}
        {label(phase === "saved", savedLabel)}
      </span>
    </Button>
  );
}

export { Button, IconButton, SaveButton };
export type { ButtonProps, IconButtonProps, SaveButtonProps, SavePhase };
