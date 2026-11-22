// SPDX-License-Identifier: GPL-3.0-or-later
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "../../utils";

interface SegmentedChoiceOption<V extends string = string> {
  value: V;
  /** One to three short words: "Read and write". Rendered as given, as text. */
  label: React.ReactNode;
  /** This option cannot be chosen here; say why next to the control (style guide 5.3). */
  disabled?: boolean;
}

const trackClass = cva(
  // The joined buttons sit in one track with the control edge (3:1 on every ground). No overflow
  // clipping anywhere, so a segment's focus ring is drawn whole, outside the track's edge.
  "flex max-w-full gap-0.5 rounded-control border border-input bg-surface p-0.5 " +
    "aria-invalid:border-critical-stroke data-disabled:border-border data-disabled:bg-muted",
  {
    variants: {
      layout: {
        row: "w-fit flex-row",
        stack: "w-full flex-col",
      },
    },
    defaultVariants: { layout: "row" },
  },
);

const segmentClass = cva(
  // A segment may shrink below its label in a row: that is how "it does not fit" is measured
  // (`overflow-hidden` clips the label, never the segment's own focus ring). It then stacks.
  "relative flex min-w-0 shrink cursor-default items-center overflow-hidden rounded-sm text-foreground select-none " +
    "hover:bg-muted focus-visible:z-10 " +
    // Checked is more than colour: the 10% action tint, the label in the action ink and semibold,
    // and an inset edge in the same ink (its audited pair on the tint, 3.10), plus aria-checked.
    "data-checked:bg-action/10 data-checked:font-semibold data-checked:text-action-label data-checked:inset-ring data-checked:inset-ring-action-label " +
    "data-disabled:cursor-not-allowed data-disabled:text-subtle-foreground data-disabled:hover:bg-transparent " +
    "data-checked:data-disabled:bg-surface data-checked:data-disabled:text-muted-foreground data-checked:data-disabled:inset-ring-input",
  {
    variants: {
      size: {
        // In a table row (36px): a 30px track, 24px segments (the WCAG 2.5.8 minimum target).
        sm: "min-h-6 px-2 py-0.5 text-sm",
        md: "min-h-7 px-2.5 py-0.5 text-base",
      },
      layout: {
        row: "justify-center text-center",
        stack: "w-full justify-start text-start",
      },
    },
    defaultVariants: { size: "md", layout: "row" },
  },
);

// The sizer's labels take a segment's horizontal padding and type size.
const sizerItemClass = cva("", {
  variants: {
    size: { sm: "px-2 text-sm", md: "px-2.5 text-base" },
  },
  defaultVariants: { size: "md" },
});

interface SegmentedChoiceProps<V extends string = string>
  extends
    Omit<
      React.ComponentProps<"div">,
      | "aria-label"
      | "children"
      | "defaultValue"
      | "dir"
      | "onChange"
      | "ref"
      | "role"
    >,
    VariantProps<typeof segmentClass> {
  /** The options, in reading order: three or four short words. */
  options: readonly SegmentedChoiceOption<V>[];
  /** The chosen value, or `null` while none is. */
  value: V | null;
  /** Called with the newly chosen value: a click, Space, an arrow key, Home or End. */
  onValueChange: (value: V) => void;
  /**
   * The group's name, always given, since the control has no visible legend of its own: "Access for
   * alex". Several choices sit side by side, so each name says what it is for.
   */
  "aria-label": string;
  /** The whole group cannot be changed now. Give `disabledReason` with it. */
  disabled?: boolean;
  /** Why the group is unavailable, shown under it and given as its description: "Saving…". */
  disabledReason?: React.ReactNode;
  /** The message for a refused choice; marks the group invalid, under it with the critical icon. */
  error?: React.ReactNode;
  /** Identifies the value when a form is submitted. */
  name?: string;
  /** Forwarded to the `radiogroup` element. */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Measures whether the options fit side by side in the width the choice is given, and stacks them
 * when they do not, so a long label (a translation 40% longer, 320px, 200% zoom) wraps into a
 * vertical stack instead of being cut short. All or nothing: a row never breaks into two rows.
 *
 * The width must come from the container (a block, a grid track, a table cell sized by the table),
 * not from the choice's own content, or a stack would hold its narrower width and never unstack.
 */
function useStacked(
  wrapper: React.RefObject<HTMLDivElement | null>,
  track: React.RefObject<HTMLDivElement | null>,
  remeasureKey: string,
) {
  const [stacked, setStacked] = React.useState(false);
  const stackedRef = React.useRef(false);
  // What a row needs beyond its labels (paddings, gaps, the edge), read while it was a row.
  const overheadRef = React.useRef(0);

  const measure = React.useCallback(() => {
    const outer = wrapper.current;
    const inner = track.current;
    if (!outer || !inner) {
      return;
    }
    const segments = Array.from(
      inner.querySelectorAll<HTMLElement>(
        '[data-slot="segmented-choice-item"]',
      ),
    );
    const labels = segments.map(
      (segment) =>
        segment.querySelector<HTMLElement>(
          '[data-slot="segmented-choice-label"]',
        )?.offsetWidth ?? 0,
    );
    const labelWidth = labels.reduce((sum, width) => sum + width, 0);
    let next = stackedRef.current;
    if (!stackedRef.current) {
      const overflow = segments.reduce(
        (sum, segment) =>
          sum + Math.max(0, segment.scrollWidth - segment.clientWidth),
        0,
      );
      overheadRef.current = inner.offsetWidth + overflow - labelWidth;
      next = overflow > 0;
    } else if (labelWidth + overheadRef.current + 1 <= outer.clientWidth) {
      next = false;
    }
    if (next !== stackedRef.current) {
      stackedRef.current = next;
      setStacked(next);
    }
  }, [wrapper, track]);

  // Different options or a different size: measure again from a row.
  React.useLayoutEffect(() => {
    if (stackedRef.current) {
      stackedRef.current = false;
      setStacked(false);
    } else {
      measure();
    }
  }, [remeasureKey, measure]);

  React.useLayoutEffect(() => {
    const outer = wrapper.current;
    const inner = track.current;
    if (typeof ResizeObserver === "undefined" || !outer || !inner) {
      return undefined;
    }
    // Delivered after layout and before paint, so the first frame is already the right layout.
    const observer = new ResizeObserver(() => measure());
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [wrapper, track, measure]);

  return stacked;
}

/**
 * A compact choice of one from three or four short words, drawn as joined buttons (phase 5 shares
 * design 12.1). Radio semantics on Base UI's RadioGroup: one tab stop, the arrow keys move and
 * choose, Home and End go to the first and last option. It has no visible legend, so it is always
 * named with `aria-label`. When the words do not fit side by side, the options stack.
 */
function SegmentedChoice<V extends string = string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  disabled,
  disabledReason,
  error,
  name,
  size,
  className,
  ref,
  onKeyDown,
  ...props
}: SegmentedChoiceProps<V>) {
  const id = React.useId();
  const reasonId = `${id}-reason`;
  const errorId = `${id}-error`;
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const itemsRef = React.useRef(new Map<string, HTMLElement>());
  const stacked = useStacked(
    wrapperRef,
    trackRef,
    `${size ?? "md"}:${options.map((option) => option.value).join("\u0000")}`,
  );
  const layout = stacked ? "stack" : "row";
  const showReason = disabled && disabledReason !== undefined;
  const describedBy =
    [ariaDescribedBy, showReason ? reasonId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const setTrackRef = (element: HTMLDivElement | null) => {
    trackRef.current = element;
    if (typeof ref === "function") {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  };

  // Base UI's RadioGroup has no Home and End; added here on top of its arrow-key movement.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      disabled ||
      (event.key !== "Home" && event.key !== "End")
    ) {
      return;
    }
    const enabled = options.filter((option) => !option.disabled);
    const target =
      event.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
    if (!target) {
      return;
    }
    event.preventDefault();
    itemsRef.current.get(target.value)?.focus();
    if (target.value !== value) {
      onValueChange(target.value);
    }
  };

  return (
    <div
      ref={wrapperRef}
      data-slot="segmented-choice"
      data-layout={layout}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      <RadioGroup
        {...props}
        ref={setTrackRef}
        value={value}
        onValueChange={(next) => onValueChange(next as V)}
        disabled={disabled}
        name={name}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onKeyDown={handleKeyDown}
        className={trackClass({ layout })}
      >
        {options.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            ref={(element: HTMLElement | null) => {
              if (element) {
                itemsRef.current.set(option.value, element);
              } else {
                itemsRef.current.delete(option.value);
              }
            }}
            data-slot="segmented-choice-item"
            className={segmentClass({ size, layout })}
          >
            {/* The label twice in one grid cell: the bold copy, hidden, holds the width, so choosing
                an option never shifts its neighbours. Only the visible copy is in the name. */}
            <span
              data-slot="segmented-choice-label"
              className={cn(
                "inline-grid [overflow-wrap:anywhere]",
                stacked ? "whitespace-normal" : "whitespace-nowrap",
              )}
            >
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 font-semibold"
              >
                {option.label}
              </span>
              <span className="col-start-1 row-start-1">{option.label}</span>
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>
      {stacked ? (
        // While stacked, the choice still asks its container for a row's width: this hidden line of
        // the labels wraps (so its narrowest need is the widest label) but would lie in one line if
        // it could (so its widest need is the row). A container that sizes by content, such as the
        // access grid's column, then still offers the row width, and the choice can unstack. The
        // extra 4px at the end is the slack the unstack check needs. `-mt-1` cancels the gap.
        <div
          aria-hidden="true"
          data-slot="segmented-choice-sizer"
          className="invisible -mt-1 flex h-0 flex-wrap gap-0.5 overflow-hidden border-x border-transparent ps-0.5 pe-1.5"
        >
          {options.map((option) => (
            <span
              key={option.value}
              className={cn(
                sizerItemClass({ size }),
                "font-semibold whitespace-nowrap",
              )}
            >
              {option.label}
            </span>
          ))}
        </div>
      ) : null}
      {showReason ? (
        <p
          id={reasonId}
          data-slot="segmented-choice-reason"
          className="text-sm text-muted-foreground"
        >
          {disabledReason}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          data-slot="segmented-choice-error"
          className="flex items-start gap-1.5 text-sm text-critical-label"
        >
          <CircleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-critical-stroke"
          />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export { SegmentedChoice };
export type { SegmentedChoiceOption, SegmentedChoiceProps };
