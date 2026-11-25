// SPDX-License-Identifier: GPL-3.0-or-later
// A layer of the guidance page: a region on the page ground under a plain heading, what the layer is
// and what "Show tips" off does to it, then its specimens. A specimen is a fragment of a screen under
// its own small heading, parted from the next by a hairline; nothing is boxed. Development only
// (UI-11).
import type { ReactNode } from "react";
import { useId } from "react";

export function Region({
  title,
  what,
  tipsOff,
  children,
}: {
  title: string;
  /** What the layer is, in one sentence. */
  what: string;
  /** What "Show tips" off does to it, in one sentence. */
  tipsOff: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="g-region" aria-labelledby={id}>
      <header className="g-region-head">
        <h2 id={id} className="g-region-title">
          {title}
        </h2>
        <p className="g-region-what">{what}</p>
        <p className="g-region-off">{tipsOff}</p>
      </header>
      <div className="g-specimens">{children}</div>
    </section>
  );
}

export function Specimen({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      className={className ? `g-specimen ${className}` : "g-specimen"}
      aria-labelledby={id}
    >
      <h3 id={id} className="g-specimen-title">
        {title}
      </h3>
      {children}
    </section>
  );
}
