// SPDX-License-Identifier: GPL-3.0-or-later
import type * as React from "react";
import { cn } from "../../utils";
import { Identifier } from "./identifier";

type IsolatedIdentifierProps = Omit<
  React.ComponentProps<"bdi">,
  "children" | "dir"
> & {
  /** The value as text: an address, an interface's name, a host name, a web address. */
  value: string;
};

/**
 * A value written left to right in every language (an address, an interface's name, a web address)
 * inside a translated sentence (phase 5 network design 0.2): the `Identifier` style, isolated from the
 * text around it with `<bdi dir="ltr">`, so a right-to-left sentence neither reorders its dots and
 * colons nor is reordered by them. The value is a prop rather than children, so the element can be
 * handed to the app's `<Trans>` as a component for an empty tag such as `<address></address>`.
 */
function IsolatedIdentifier({
  value,
  className,
  ...props
}: IsolatedIdentifierProps) {
  return (
    <bdi
      data-slot="isolated-identifier"
      dir="ltr"
      className={cn("[overflow-wrap:anywhere]", className)}
      {...props}
    >
      <Identifier>{value}</Identifier>
    </bdi>
  );
}

export { IsolatedIdentifier };
export type { IsolatedIdentifierProps };
