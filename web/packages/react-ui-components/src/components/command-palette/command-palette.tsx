// SPDX-License-Identifier: GPL-3.0-or-later
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Button as BaseButton } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import {
  CornerDownLeft,
  ExternalLink as ExternalIcon,
  Search,
} from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";
import { keepTabInside } from "../dialog/keep-tab-inside";

interface CommandItem {
  /** Unique among the palette's items. */
  id: string;
  /** What the item is, in words, as in the navigation: "Disks", "Apply 3 pending changes". */
  label: string;
  /** The heading it is listed under: "Do", "Go to". Items keep their order inside a heading. */
  group: string;
  /** Where it lives, in the secondary ink: "Storage", "System, in the classic interface". Searched too. */
  hint?: string;
  /** More words that find it: the group's name, an older name. */
  keywords?: readonly string[];
  /** The keys that reach it from anywhere, shown beside it so the palette teaches them: ["g", "d"]. */
  shortcut?: readonly string[];
  /** The page is in the classic interface: the external mark beside it. */
  external?: boolean;
  /** Runs after the palette has closed. */
  onSelect: () => void;
}

interface CommandGroup {
  label: string;
  items: CommandItem[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every page of the navigation and the actions offered now, in the order they are listed. */
  items: readonly CommandItem[];
  /** The dialog's name: "Go to or do". */
  label: string;
  /** The search field's name and placeholder: "Search pages and actions". */
  inputLabel: string;
  /** Said when nothing matches, given what was typed. */
  emptyMessage: (query: string) => React.ReactNode;
  /** The name of the visually hidden close control: "Close". */
  closeLabel: string;
  /** Spoken after the field's name, and shown at the foot: "Up and down arrows to move, Enter to go, …". */
  keysHint: React.ReactNode;
  /** Said beside an `external` item to assistive technology: "classic interface". */
  externalLabel: string;
}

/** Every word typed must be found in the item's label, hint, heading or keywords. */
function matches(item: CommandItem, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = [
    item.label,
    item.hint ?? "",
    item.group,
    ...(item.keywords ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

function grouped(items: readonly CommandItem[]): CommandGroup[] {
  const groups: CommandGroup[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.label === item.group);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }
  return groups;
}

const kbdClass =
  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-muted-strong px-1 font-mono text-xs leading-none text-muted-foreground";

/**
 * The command palette, "Go to or do…" (foundation 13): the expert's path through the same screens a
 * beginner uses. Typing narrows the list; arrow keys move, Enter goes; the shortcut beside an item
 * teaches it. Built on Base UI's Dialog (focus moves in and back, Escape closes, the page behind is
 * hidden) and Autocomplete in its inline form (the field keeps focus while the arrow keys move the
 * highlight, which is announced as the active option). It rises 8px and scales up from 0.97 over a
 * fading scrim; under reduced motion it fades only.
 */
function CommandPalette({
  open,
  onOpenChange,
  items,
  label,
  inputLabel,
  emptyMessage,
  closeLabel,
  keysHint,
  externalLabel,
}: CommandPaletteProps) {
  const hintId = React.useId();
  const [query, setQuery] = React.useState("");
  const [wasOpen, setWasOpen] = React.useState(open);
  // Open empty every time.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
    }
  }
  const groups = React.useMemo(() => grouped(items), [items]);
  const chosenRef = React.useRef<CommandItem | null>(null);

  const select = (item: CommandItem) => {
    chosenRef.current = item;
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        // Run the choice once the palette has gone, so focus has returned and a page change is
        // not drawn behind a closing dialog.
        if (!isOpen && chosenRef.current) {
          const item = chosenRef.current;
          chosenRef.current = null;
          item.onSelect();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-slow data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-slot="command-palette"
          aria-label={label}
          onKeyDown={keepTabInside}
          className={cn(
            "fixed top-[max(1rem,12dvh)] left-1/2 z-50 flex max-h-[min(36rem,calc(100dvh-2rem))] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden",
            "rounded-card surface-floating text-foreground outline-hidden",
            "origin-top transition-[opacity,scale,translate] duration-slow ease-enter",
            "data-starting-style:translate-y-2 data-starting-style:scale-97 data-starting-style:opacity-0",
            "data-ending-style:scale-97 data-ending-style:opacity-0 data-ending-style:duration-base data-ending-style:ease-exit",
          )}
        >
          <Autocomplete.Root
            open
            inline
            items={groups}
            value={query}
            onValueChange={(value) => setQuery(value)}
            filter={(item: CommandItem, typed: string) => matches(item, typed)}
            itemToStringValue={(item: CommandItem) => item.label}
            autoHighlight="always"
            keepHighlight
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-tertiary-foreground"
              />
              <Autocomplete.Input
                aria-label={inputLabel}
                aria-describedby={hintId}
                placeholder={inputLabel}
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle-foreground compact:h-12"
              />
              <Dialog.Close className="sr-only">{closeLabel}</Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 [scroll-padding-block:0.5rem]">
              <Autocomplete.Empty>
                {query.trim() === "" ? null : (
                  <p className="px-3 py-6 text-center text-muted-foreground">
                    {emptyMessage(query.trim())}
                  </p>
                )}
              </Autocomplete.Empty>
              <Autocomplete.List className="flex flex-col gap-2">
                {(group: CommandGroup) => (
                  <Autocomplete.Group
                    key={group.label}
                    items={group.items}
                    className="flex flex-col"
                  >
                    <Autocomplete.GroupLabel className="px-3 pt-1 pb-1 text-sm font-normal text-muted-foreground">
                      {group.label}
                    </Autocomplete.GroupLabel>
                    <Autocomplete.Collection>
                      {(item: CommandItem) => (
                        <Autocomplete.Item
                          key={item.id}
                          value={item}
                          onClick={() => select(item)}
                          className={cn(
                            "group/command flex min-h-10 cursor-default items-center gap-3 rounded-control px-3 py-1.5 select-none compact:min-h-8",
                            "transition-colors data-highlighted:bg-selected [scroll-margin-block:0.5rem]",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-foreground">
                              {item.label}
                            </span>
                            {item.hint ? (
                              <span className="text-sm text-tertiary-foreground group-data-highlighted/command:text-muted-foreground">
                                {item.hint}
                              </span>
                            ) : null}
                          </span>
                          {item.external ? (
                            <span className="flex shrink-0 text-tertiary-foreground">
                              <ExternalIcon
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              <span className="sr-only">{externalLabel}</span>
                            </span>
                          ) : null}
                          {item.shortcut ? (
                            <span
                              aria-hidden="true"
                              className="flex shrink-0 gap-1"
                            >
                              {item.shortcut.map((key) => (
                                <kbd key={key} className={kbdClass}>
                                  {key}
                                </kbd>
                              ))}
                            </span>
                          ) : null}
                          <CornerDownLeft
                            aria-hidden="true"
                            className="size-3.5 shrink-0 text-selected-label opacity-0 group-data-highlighted/command:opacity-100"
                          />
                        </Autocomplete.Item>
                      )}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
            </div>
            <p
              id={hintId}
              className="hidden border-t border-border px-4 py-2.5 text-caption text-tertiary-foreground sm:block"
            >
              {keysHint}
            </p>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface CommandPaletteTriggerProps extends Omit<
  React.ComponentProps<typeof BaseButton>,
  "children"
> {
  /** "Go to or do…": shown from 640px, and the button's name everywhere. */
  label: string;
}

/**
 * The top bar's way into the palette: a field-shaped button with the `/` key beside its words, so it
 * looks like the search it opens; an icon button under 640px. `aria-keyshortcuts` names `/` and
 * Ctrl+K or Cmd+K.
 */
function CommandPaletteTrigger({
  label,
  className,
  ...props
}: CommandPaletteTriggerProps) {
  return (
    <BaseButton
      data-slot="command-palette-trigger"
      aria-label={label}
      aria-keyshortcuts="/ Control+K Meta+K"
      className={cn(
        "inline-flex h-control shrink-0 items-center gap-2 rounded-control border border-border bg-muted px-2 text-tertiary-foreground shadow-control",
        "transition-colors hover:border-input hover:text-muted-foreground sm:w-60 sm:px-2.5 lg:w-72",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <Search aria-hidden="true" />
      <span aria-hidden="true" className="hidden flex-1 text-start sm:inline">
        {label}
      </span>
      <kbd aria-hidden="true" className={cn(kbdClass, "hidden sm:inline-flex")}>
        /
      </kbd>
    </BaseButton>
  );
}

export { CommandPalette, CommandPaletteTrigger };
export type { CommandItem, CommandPaletteProps, CommandPaletteTriggerProps };
