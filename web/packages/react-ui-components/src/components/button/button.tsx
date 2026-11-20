// SPDX-License-Identifier: GPL-3.0-or-later
import { Button as BaseButton } from "@base-ui/react/button";
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
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      data-slot="button"
      disabled={disabled || loading}
      focusableWhenDisabled={focusableWhenDisabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />
      ) : null}
      {children}
    </BaseButton>
  );
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

export { Button, IconButton };
export type { ButtonProps, IconButtonProps };
