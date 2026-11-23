// SPDX-License-Identifier: GPL-3.0-or-later
// A copy job's display name (phase 5 services design 0.2, `{{job}}`): its note when it has one,
// otherwise "{{src}} to {{dest}}" built from its two sides (`jobs.name.auto`). The note is free text
// from the backend and is returned as it is, to be rendered as text (UI-2); only the test for "has
// one" trims it.

export function jobName(
  row: { comment?: string; srcname: string; destname: string },
  auto: (src: string, dest: string) => string,
): string {
  const note = row.comment ?? "";
  return note.trim() === "" ? auto(row.srcname, row.destname) : note;
}
