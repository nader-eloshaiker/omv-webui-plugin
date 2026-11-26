// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import { Switch } from "../switch/switch";
import { useShowTips } from "./tips-context";

type ShowTipsSwitchProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** The switch's name: "Show tips". */
  label: string;
  /** One line under it that says what tips are: "Tips explain things the first time you meet them." */
  hint: string;
};

/**
 * "Show tips" (rethink P.3, decision 3): one switch that turns every first-time tip, caption, ghost
 * example and welcome off, for good, and back on, as a row of the account menu beside Theme and
 * Density. It reads and changes the enclosing `TipsProvider`. Turning tips off never hides a control,
 * a status, a consequence or a technical value.
 */
function ShowTipsSwitch({
  label,
  hint,
  className,
  ...props
}: ShowTipsSwitchProps) {
  const [show, setShow] = useShowTips();
  const id = React.useId();
  const hintId = `${id}-hint`;
  return (
    <div
      data-slot="show-tips-switch"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm text-foreground">
          {label}
        </label>
        <p id={hintId} className="m-0 text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={hintId}
        checked={show}
        onCheckedChange={(checked) => {
          setShow(checked);
        }}
      />
    </div>
  );
}

export { ShowTipsSwitch };
export type { ShowTipsSwitchProps };
