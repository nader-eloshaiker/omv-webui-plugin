// SPDX-License-Identifier: GPL-3.0-or-later
// Task and log output arrives from the backend as raw terminal text. It is shown as text nodes only
// (UI-2); this removes what a terminal would interpret, so nothing reaches the page as an instruction:
// ANSI escape sequences (colour, cursor movement, window titles), other control characters, and the
// bidirectional overrides that can make a line read differently from what it holds. Style guide 5.7:
// ANSI codes are stripped, never passed through. A scanner rather than regular expressions, so the
// sequences are matched by their grammar (ECMA-48) and not by a pattern that has to list them.

const ESC = 0x1b;
const BEL = 0x07;
const CSI_8BIT = 0x9b;
const OSC_8BIT = 0x9d;
const ST_8BIT = 0x9c;
const TAB = 0x09;

// Embeddings, overrides, isolates and the invisible direction marks.
const BIDI = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066,
  0x2067, 0x2068, 0x2069,
]);

/** The index of the last character of a control sequence whose parameters start at `from`. */
function endOfCsi(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      return i;
    }
    if (code < 0x20 || code > 0x3f) {
      // Not a parameter or intermediate byte: a malformed sequence ends here, dropping what was read.
      return i - 1;
    }
    i += 1;
  }
  return text.length - 1;
}

/** The index of the last character of an operating-system command whose body starts at `from`. */
function endOfOsc(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === BEL || code === ST_8BIT) {
      return i;
    }
    if (code === ESC && text[i + 1] === "\\") {
      return i + 1;
    }
  }
  return text.length - 1;
}

/** The index of the last character of the escape sequence that starts at `at`. */
function endOfEscape(text: string, at: number): number {
  const code = text.charCodeAt(at);
  if (code === CSI_8BIT) {
    return endOfCsi(text, at + 1);
  }
  if (code === OSC_8BIT) {
    return endOfOsc(text, at + 1);
  }
  const next = text[at + 1];
  if (next === "[") {
    return endOfCsi(text, at + 2);
  }
  if (next === "]") {
    return endOfOsc(text, at + 2);
  }
  const nextCode = text.charCodeAt(at + 1);
  return nextCode >= 0x40 && nextCode <= 0x5f ? at + 1 : at;
}

/** One line of output, cleaned for display as text. A carriage return keeps what was written last. */
export function stripControl(line: string): string {
  const text = line.slice(line.lastIndexOf("\r") + 1);
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === ESC || code === CSI_8BIT || code === OSC_8BIT) {
      i = endOfEscape(text, i);
    } else if (
      code === TAB ||
      (code >= 0x20 && code < 0x7f) ||
      (code > 0x9f && !BIDI.has(code))
    ) {
      out += text[i];
    }
  }
  return out;
}
