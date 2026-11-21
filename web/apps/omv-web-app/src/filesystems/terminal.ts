// SPDX-License-Identifier: GPL-3.0-or-later
// mke2fs writes its progress counters with backspaces ("0/64\b\b\b\b\b     \b\b\b\b\bdone", observed on
// the VM). A terminal moves its cursor back over them; the output block would otherwise show the
// counter and the word run together. This replays each backspace as the terminal does: the cursor
// steps back one place and what follows overwrites. Everything else is left for the TaskLog, which
// removes the remaining control characters itself (UI-2).

/** One line with its backspaces replayed. */
export function replayBackspaces(line: string): string {
  if (!line.includes("\b")) {
    return line;
  }
  const cells: string[] = [];
  let cursor = 0;
  for (const char of line) {
    if (char === "\b") {
      cursor = Math.max(0, cursor - 1);
      continue;
    }
    cells[cursor] = char;
    cursor += 1;
  }
  return cells.join("").trimEnd();
}

/** A task's output as lines for the output block: backspaces replayed, no empty last line. */
export function taskLines(output: string): string[] {
  if (output === "") {
    return [];
  }
  const lines = output.split(/\r?\n/).map(replayBackspaces);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}
