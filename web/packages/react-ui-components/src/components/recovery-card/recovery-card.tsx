// SPDX-License-Identifier: GPL-3.0-or-later
import { TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { Button } from "../button/button";
import { CopyButton } from "../copy-button/copy-button";
import { ExternalLink } from "../external-link/external-link";
import { Identifier } from "../text/identifier";
import { IsolatedIdentifier } from "../text/isolated-identifier";

/**
 * Why the card is shown (phase 5 network design 1.6): the page lost the NAS since the change; the
 * router may have given the NAS an address the page cannot know; the new address does not open.
 */
type RecoveryVariant = "lost" | "unknownAddress" | "newFails";

/** A link the caller allows: only an address typed in this session (UI-3, design P7). */
interface RecoveryLink {
  href: string;
  /** "Open the NAS at its new address". */
  label: React.ReactNode;
}

/** Each step, shown only when the caller passes it, in the design's order and numbered. */
interface RecoverySteps {
  /** 1. "Wait two minutes, then try again." with "Try again" (one read; no write). */
  wait?: {
    text: React.ReactNode;
    tryAgainLabel: React.ReactNode;
    onTryAgain: () => void;
    /** The read is running: the button keeps focus and reports it is busy. */
    busy?: boolean;
  };
  /** 2. A new fixed address: "Open the NAS at its new address: <url></url>". */
  newAddress?: {
    url: string;
    text: (url: React.ReactElement) => React.ReactNode;
    /** "Copy the new address". */
    copyLabel: string;
    link?: RecoveryLink;
    /** "This computer must be on the same network as the new address. …" */
    note?: React.ReactNode;
  };
  /** 3. An automatic address or none known: "… under the name <name></name>. … try <url></url>." */
  find?: {
    name: string;
    /** `http://{{hostname}}.local/ui/`: text only, never a link (the name came from the NAS). */
    url: string;
    text: (parts: {
      name: React.ReactElement;
      url: React.ReactElement;
    }) => React.ReactNode;
    copyLabel: string;
  };
  /** 4. A changed name: "Open the NAS by its new name: <url></url>, or at its address <address></address>." */
  newName?: {
    url: string;
    address: string;
    text: (parts: {
      url: React.ReactElement;
      address: React.ReactElement;
    }) => React.ReactNode;
    urlCopyLabel: string;
    addressCopyLabel: string;
    /** For the new name typed in this session only. */
    link?: RecoveryLink;
  };
  /** 5. A firewall change: "If a firewall rule blocks this computer, …" */
  firewall?: { text: React.ReactNode };
  /**
   * 6. At the NAS itself: "If nothing else works, connect a screen and keyboard …, and:" with one
   * line per command. The commands are typed at another machine, so they are code, not copy buttons.
   */
  console?: {
    intro: React.ReactNode;
    commands: readonly {
      id: string;
      command: string;
      /** "type <command></command> and choose Configure network interface. …" */
      text: (command: React.ReactElement) => React.ReactNode;
    }[];
  };
  /** 7. "The note you copied before applying has the settings that worked." */
  note?: { text: React.ReactNode };
}

interface RecoveryCardProps extends Omit<
  React.ComponentProps<"section">,
  "title" | "children" | "role"
> {
  variant: RecoveryVariant;
  /** The variant's first line (`netRecover.lost`, `.unknownAddress`, `.newFails`). */
  title: React.ReactNode;
  /** The title's level in the page outline. */
  headingLevel?: 2 | 3 | 4;
  steps: RecoverySteps;
  /** What every copy button says after a press. */
  copy: { copiedLabel: string; selectedLabel: string };
  /** Appended to a link's name: "(opens in a new tab)". */
  newTabLabel: string;
  /**
   * `true` (the default) where the card appears because the page lost the NAS: its title is an
   * `alert`, announced once when the card first appears. `false` where it is read ahead of time
   * (inside the review summary's Disclosure, under the moved card).
   */
  announce?: boolean;
}

/** The copy button of a value the sentence above it shows, named for that value. */
function CopyValue({
  value,
  copyLabel,
  copy,
}: {
  value: string;
  copyLabel: string;
  copy: RecoveryCardProps["copy"];
}) {
  return (
    <CopyButton
      text={value}
      label={copyLabel}
      copiedLabel={copy.copiedLabel}
      selectedLabel={copy.selectedLabel}
      size="sm"
    />
  );
}

const HEADINGS = { 2: "h2", 3: "h3", 4: "h4" } as const;

/**
 * The way back when this page cannot reach the NAS after a network change (phase 5 network design
 * 1.6). A card with the warning shape in the neutral ink, not red: nothing the NAS monitors has
 * failed, this page lost its way to it. Its steps are an ordered list in reading order, each shown
 * only when the caller passes it; values are text with a copy button, commands are code, and a link
 * appears only where the caller passes one.
 *
 * It needs nothing from the network: every word and value is a prop and its icons are in the bundle,
 * so the caller must have them in hand before the change is applied.
 */
function RecoveryCard({
  variant,
  title,
  headingLevel = 2,
  steps,
  copy,
  newTabLabel,
  announce = true,
  className,
  ...props
}: RecoveryCardProps) {
  const titleId = React.useId();
  const Heading = HEADINGS[headingLevel];
  const { wait, newAddress, find, newName, firewall, note } = steps;
  const atNas = steps.console;
  return (
    <section
      data-slot="recovery-card"
      data-variant={variant}
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4 text-foreground",
        className,
      )}
      {...props}
    >
      {/* Only the title is assertive: the steps are read in order after it, not shouted. */}
      <div
        role={announce ? "alert" : undefined}
        className="flex items-start gap-2"
      >
        <TriangleAlert
          aria-hidden="true"
          className="mt-[0.15em] size-5 shrink-0 text-muted-foreground"
        />
        <Heading
          id={titleId}
          className="text-lg leading-snug font-semibold [overflow-wrap:anywhere]"
        >
          {title}
        </Heading>
      </div>
      <ol
        data-slot="recovery-steps"
        className="flex list-decimal flex-col gap-3 ps-6 text-base marker:text-muted-foreground marker:tabular-nums"
      >
        {wait ? (
          <li data-step="wait" className="ps-1">
            <div className="flex flex-col items-start gap-2">
              <p>{wait.text}</p>
              <Button
                variant="neutral"
                size="sm"
                loading={wait.busy}
                onClick={wait.onTryAgain}
              >
                {wait.tryAgainLabel}
              </Button>
            </div>
          </li>
        ) : null}
        {newAddress ? (
          <li data-step="newAddress" className="ps-1">
            <div className="flex flex-col items-start gap-1.5">
              <p className="[overflow-wrap:anywhere]">
                {newAddress.text(<IsolatedIdentifier value={newAddress.url} />)}
              </p>
              <CopyValue
                value={newAddress.url}
                copyLabel={newAddress.copyLabel}
                copy={copy}
              />
              {newAddress.link ? (
                <p>
                  <ExternalLink
                    href={newAddress.link.href}
                    newTabLabel={newTabLabel}
                  >
                    {newAddress.link.label}
                  </ExternalLink>
                </p>
              ) : null}
              {newAddress.note ? (
                <p className="text-muted-foreground">{newAddress.note}</p>
              ) : null}
            </div>
          </li>
        ) : null}
        {find ? (
          <li data-step="find" className="ps-1">
            <div className="flex flex-col items-start gap-1.5">
              <p className="[overflow-wrap:anywhere]">
                {find.text({
                  name: <IsolatedIdentifier value={find.name} />,
                  url: <IsolatedIdentifier value={find.url} />,
                })}
              </p>
              <CopyValue
                value={find.url}
                copyLabel={find.copyLabel}
                copy={copy}
              />
            </div>
          </li>
        ) : null}
        {newName ? (
          <li data-step="newName" className="ps-1">
            <div className="flex flex-col items-start gap-1.5">
              <p className="[overflow-wrap:anywhere]">
                {newName.text({
                  url: <IsolatedIdentifier value={newName.url} />,
                  address: <IsolatedIdentifier value={newName.address} />,
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyValue
                  value={newName.url}
                  copyLabel={newName.urlCopyLabel}
                  copy={copy}
                />
                <CopyValue
                  value={newName.address}
                  copyLabel={newName.addressCopyLabel}
                  copy={copy}
                />
              </div>
              {newName.link ? (
                <p>
                  <ExternalLink
                    href={newName.link.href}
                    newTabLabel={newTabLabel}
                  >
                    {newName.link.label}
                  </ExternalLink>
                </p>
              ) : null}
            </div>
          </li>
        ) : null}
        {firewall ? (
          <li data-step="firewall" className="ps-1">
            <p>{firewall.text}</p>
          </li>
        ) : null}
        {atNas ? (
          <li data-step="console" className="ps-1">
            <div className="flex flex-col items-start gap-1.5">
              <p>{atNas.intro}</p>
              <ul className="flex list-disc flex-col gap-1.5 ps-5 marker:text-muted-foreground">
                {atNas.commands.map((line) => (
                  <li key={line.id} className="[overflow-wrap:anywhere]">
                    {line.text(
                      <Identifier
                        dir="ltr"
                        data-slot="recovery-command"
                        className="rounded-sm bg-muted px-1 py-0.5"
                      >
                        {line.command}
                      </Identifier>,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ) : null}
        {note ? (
          <li data-step="note" className="ps-1">
            <p>{note.text}</p>
          </li>
        ) : null}
      </ol>
    </section>
  );
}

export { RecoveryCard };
export type { RecoveryCardProps, RecoveryLink, RecoverySteps, RecoveryVariant };
