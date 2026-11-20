// SPDX-License-Identifier: GPL-3.0-or-later
import { cva } from "class-variance-authority";
import * as React from "react";
import {
  Field,
  FieldControl,
  FieldError,
  FieldHint,
  FieldLabel,
} from "../field/field";

const textareaClass = cva(
  // The input look (control-class), at the height of its rows instead of the 32px of a line.
  "h-auto min-h-0 resize-y py-1.5 leading-normal",
  {
    variants: {
      // Lines a program reads (configuration, keys): the mono face, no spelling marks.
      mono: { true: "font-mono text-sm", false: "" },
    },
    defaultVariants: { mono: false },
  },
);

type TextareaFieldProps = Omit<
  React.ComponentProps<"textarea">,
  "className" | "children"
> & {
  label: React.ReactNode;
  /** What the lines do, in plain words, below the control. */
  hint?: React.ReactNode;
  /** The message for a refused value; marks the field invalid. */
  error?: React.ReactNode;
  /** Configuration lines, keys or other text a program reads: mono, no spell check or autocorrect. */
  mono?: boolean;
  /** The height it starts at, in lines. */
  rows?: number;
  /** It grows with its content up to this many lines, then scrolls. The reader can still resize it. */
  maxRows?: number;
  /** Classes for the field around the control. */
  className?: string;
};

/** The vertical padding and border the height has to include beside the lines. */
function verticalChrome(style: CSSStyleDeclaration) {
  return (
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth)
  );
}

/**
 * Several lines of text in a form, on Base UI's Field (label above, hint and error linked through
 * `aria-describedby`). It grows with what is typed, from `rows` to `maxRows` lines, by setting its
 * height through the DOM's style API, which the Content Security Policy allows (UI-1); no style
 * attribute is written into markup. Controlled (`value`, `onChange`) or not (`defaultValue`), like a
 * native textarea; `ref` reaches the textarea.
 */
function TextareaField({
  label,
  hint,
  error,
  mono = false,
  rows = 4,
  maxRows = 12,
  className,
  disabled,
  ref,
  ...textareaProps
}: TextareaFieldProps) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const fit = React.useCallback(() => {
    const element = innerRef.current;
    if (!element) {
      return;
    }
    const style = window.getComputedStyle(element);
    const line = parseFloat(style.lineHeight);
    const chrome = verticalChrome(style);
    if (!Number.isFinite(line) || !Number.isFinite(chrome)) {
      return;
    }
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const max = line * maxRows + chrome;
    element.style.height = "auto";
    const wanted = element.scrollHeight + border;
    element.style.height = `${String(Math.min(wanted, max))}px`;
    element.style.overflowY = wanted > max ? "auto" : "hidden";
  }, [maxRows]);

  // Fit on mount and whenever a controlled value changes from outside (Discard changes).
  React.useLayoutEffect(fit, [fit, textareaProps.value]);

  // Base UI's control tracks `value`, `defaultValue`, `name` and the change handlers for the field's
  // state, so they go to it; it renders the textarea given below and chains both `onInput`s. Its
  // props are typed for an input; every textarea prop passed here is one the element accepts.
  const controlProps = textareaProps as unknown as React.ComponentProps<
    typeof FieldControl
  >;

  const setRefs = React.useCallback(
    (element: HTMLTextAreaElement | null) => {
      innerRef.current = element;
      if (typeof ref === "function") {
        ref(element);
      } else if (ref) {
        ref.current = element;
      }
    },
    [ref],
  );

  return (
    <Field
      data-slot="textarea-field"
      invalid={error ? true : undefined}
      disabled={disabled}
      className={className}
    >
      <FieldLabel>{label}</FieldLabel>
      <FieldControl
        {...controlProps}
        ref={setRefs}
        disabled={disabled}
        className={textareaClass({ mono })}
        render={
          <textarea
            rows={rows}
            onInput={fit}
            {...(mono
              ? {
                  spellCheck: false,
                  autoCapitalize: "off",
                  autoCorrect: "off",
                }
              : {})}
          />
        }
      />
      {hint ? <FieldHint>{hint}</FieldHint> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export { TextareaField };
export type { TextareaFieldProps };
