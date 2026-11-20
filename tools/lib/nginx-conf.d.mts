// SPDX-License-Identifier: GPL-3.0-or-later
// Types for nginx-conf.mjs, for the TypeScript browser test that reads the snippet's headers.

export interface Directive {
  name: string;
  args: string[];
  /** The directives inside `{ }`, if the directive has a block. */
  block: Directive[] | undefined;
  /** 1-based line of the directive's name. */
  line: number;
}

export interface Header {
  name: string;
  value: string;
}

export function parseNginxConf(text: string): Directive[];
export function findLocation(
  directives: readonly Directive[],
  args: readonly string[],
): Directive;
export function locations(
  directives: readonly Directive[],
): Generator<Directive>;
export function directiveArgs(block: Directive, name: string): string[];
export function headersOf(location: Directive): Header[];
