// SPDX-License-Identifier: GPL-3.0-or-later
import * as React from "react";
import { cn } from "../../utils";
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from "../disclosure/disclosure";
import { Icon } from "../icon/icon";
import { Tip, type TipProps } from "../tip/tip";

type WelcomeLineProps = Omit<TipProps, "size" | "icon" | "actions"> & {
  /**
   * A second sentence after the first, in comfortable density only (owner decision 11): "Your
   * settings and files are the same; only the way you see them is new."
   */
  detail?: React.ReactNode;
  /** "What is different": the disclosure's words and the short list it opens. */
  more?: { label: React.ReactNode; items: readonly string[] };
  /** Links after the disclosure: "Open the classic interface". */
  actions?: React.ReactNode;
};

/**
 * The one-line welcome on an existing NAS seen in the new interface for the first time (rethink P.2,
 * P.3 G2): the NAS's mark, the welcome at body size, "What is different" as a disclosure and a way
 * back to the classic interface, ending in its dismiss button. A first-time `Tip` (its `size="lead"`
 * form), so it needs the app's `TipsProvider`: it shows once per browser while "Show tips" is on,
 * and leaves by folding up (`animate-leave`, at once under reduced motion) on "Got it". Any other
 * action on the page may end it too: the page calls the provider's `endTip` with its `id`.
 */
function WelcomeLine({
  detail,
  more,
  actions,
  className,
  children,
  ...props
}: WelcomeLineProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Tip
      size="lead"
      icon={<Icon name="nas" size={20} motion="none" />}
      className={cn("pb-3 [&>p]:max-w-[calc(100%-2rem)]", className)}
      actions={
        more || actions ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {more ? (
              <Disclosure open={open} onOpenChange={setOpen} className="gap-1">
                <DisclosureTrigger variant="inline">
                  {more.label}
                </DisclosureTrigger>
                <DisclosurePanel>
                  <ul className="mt-1 list-disc ps-4.5 text-sm text-muted-foreground">
                    {more.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </DisclosurePanel>
              </Disclosure>
            ) : null}
            {actions}
          </span>
        ) : undefined
      }
      {...props}
    >
      {children}
      {detail ? <span className="compact:hidden"> {detail}</span> : null}
    </Tip>
  );
}

export { WelcomeLine };
export type { WelcomeLineProps };
