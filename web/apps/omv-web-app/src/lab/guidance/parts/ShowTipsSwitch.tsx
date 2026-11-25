// SPDX-License-Identifier: GPL-3.0-or-later
// "Show tips" (rethink P.3, decision 3): one switch that turns every first-time tip, caption, ghost
// example and welcome off, for good, and back on. It sits in the account menu beside Theme and
// Density, and the palette offers the same as "Hide tips" or "Show tips". Turning tips off never
// hides a control, a status, a consequence or a technical value. Development only (UI-11) until
// the owner has seen it; written to move into the library.
import { Switch } from "@omv-webui/react-ui-components";
import { useId } from "react";
import { SHOW_TIPS_HINT, SHOW_TIPS_LABEL } from "./tipsCommand.ts";
import { useShowTips } from "./tipsContext.ts";

/** The switch with its name and its one-line description, as a row of the account menu. */
export function ShowTipsSwitch({ className }: { className?: string }) {
  const [show, setShow] = useShowTips();
  const id = useId();
  return (
    <div className={className ? `g-switch-row ${className}` : "g-switch-row"}>
      <div className="g-switch-words">
        <label htmlFor={id} className="g-switch-label">
          {SHOW_TIPS_LABEL}
        </label>
        <p id={`${id}-hint`} className="g-switch-hint">
          {SHOW_TIPS_HINT}
        </p>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={show}
        onCheckedChange={(checked) => {
          setShow(checked);
        }}
      />
    </div>
  );
}
