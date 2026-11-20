// SPDX-License-Identifier: GPL-3.0-or-later
// A reader for the small subset of nginx configuration the plugin's snippet uses: directives,
// blocks, comments and quoted strings, tokenised as nginx's own reader does (ngx_conf_read_token).
// No dependency. It lets the tests take the UI-1 headers from etc/nginx/ rather than from a copy,
// so the snippet stays their single source.

/**
 * @typedef {object} Directive
 * @property {string} name
 * @property {string[]} args
 * @property {Directive[] | undefined} block  the directives inside `{ }`, if the directive has a block
 * @property {number} line  1-based line of the directive's name
 */

/** @typedef {{ name: string, value: string }} Header */

const QUOTE_ESCAPES = {
  '"': '"',
  "'": "'",
  "\\": "\\",
  n: "\n",
  r: "\r",
  t: "\t",
};

/** @param {string} text */
function* tokens(text) {
  let i = 0;
  let line = 1;
  const fail = (/** @type {string} */ why) => {
    throw new SyntaxError(`nginx: ${why} (line ${line})`);
  };
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      line += 1;
      i += 1;
    } else if (c === " " || c === "\t" || c === "\r") {
      i += 1;
    } else if (c === "#") {
      while (i < text.length && text[i] !== "\n") {
        i += 1;
      }
    } else if (c === ";" || c === "{" || c === "}") {
      yield { kind: c, line };
      i += 1;
    } else if (c === '"' || c === "'") {
      const start = line;
      let value = "";
      i += 1;
      for (;;) {
        if (i >= text.length) {
          line = start;
          fail("unterminated quoted string");
        }
        const d = text[i];
        if (d === c) {
          i += 1;
          break;
        }
        if (d === "\\" && i + 1 < text.length) {
          const next = text[i + 1];
          const escaped =
            QUOTE_ESCAPES[/** @type {keyof typeof QUOTE_ESCAPES} */ (next)];
          value += escaped ?? `\\${next}`;
          i += 2;
          continue;
        }
        if (d === "\n") {
          line += 1;
        }
        value += d;
        i += 1;
      }
      const after = text[i];
      if (after !== undefined && !/[\s;{}]/.test(after)) {
        fail("a quoted string must be followed by a space, ';', '{' or '}'");
      }
      yield { kind: "word", value, line: start };
    } else {
      let value = "";
      while (i < text.length && !/[\s;{}"'#]/.test(text[i])) {
        if (text[i] === "\\") {
          fail("an escape outside quotes is not supported here");
        }
        value += text[i];
        i += 1;
      }
      if (text[i] === '"' || text[i] === "'") {
        fail("a quote inside a word");
      }
      yield { kind: "word", value, line };
    }
  }
}

/**
 * Parse nginx configuration text into a directive tree.
 * @param {string} text
 * @returns {Directive[]}
 */
export function parseNginxConf(text) {
  /** @type {Directive[][]} */
  const stack = [[]];
  /** @type {Directive[]} */
  const open = [];
  /** @type {{ words: string[], line: number } | null} */
  let current = null;
  for (const token of tokens(text)) {
    if (token.kind === "word") {
      if (current) {
        current.words.push(token.value);
      } else {
        current = { words: [token.value], line: token.line };
      }
      continue;
    }
    if (token.kind === "}") {
      if (current) {
        throw new SyntaxError(
          `nginx: "${current.words[0]}" is not terminated by ';' (line ${current.line})`,
        );
      }
      if (open.length === 0) {
        throw new SyntaxError(`nginx: unexpected '}' (line ${token.line})`);
      }
      open.pop();
      stack.pop();
      continue;
    }
    if (!current) {
      throw new SyntaxError(
        `nginx: unexpected '${token.kind}' (line ${token.line})`,
      );
    }
    const [name, ...args] = current.words;
    /** @type {Directive} */
    const directive = { name, args, block: undefined, line: current.line };
    stack[stack.length - 1].push(directive);
    current = null;
    if (token.kind === "{") {
      directive.block = [];
      open.push(directive);
      stack.push(directive.block);
    }
  }
  if (current) {
    throw new SyntaxError(
      `nginx: "${current.words[0]}" is not terminated by ';' (line ${current.line})`,
    );
  }
  if (open.length > 0) {
    const last = open[open.length - 1];
    throw new SyntaxError(
      `nginx: "${last.name}" block is not closed (line ${last.line})`,
    );
  }
  return stack[0];
}

/**
 * The `location` block whose arguments are exactly `args`, searched at every depth.
 * @param {readonly Directive[]} directives
 * @param {readonly string[]} args  e.g. ["^~", "/ui/"] or ["@name"]
 * @returns {Directive}
 */
export function findLocation(directives, args) {
  const found = [...locations(directives)].filter(
    (d) =>
      d.args.length === args.length && d.args.every((a, i) => a === args[i]),
  );
  if (found.length !== 1) {
    throw new Error(
      `nginx: expected one location ${args.join(" ")}, found ${found.length}`,
    );
  }
  return found[0];
}

/**
 * Every `location` block, at every depth, in file order.
 * @param {readonly Directive[]} directives
 * @returns {Generator<Directive>}
 */
export function* locations(directives) {
  for (const d of directives) {
    if (d.name === "location" && d.block) {
      yield d;
      yield* locations(d.block);
    }
  }
}

/**
 * The arguments of the one directive `name` directly inside `block` (not in nested blocks).
 * @param {Directive} block
 * @param {string} name
 * @returns {string[]}
 */
export function directiveArgs(block, name) {
  const found = (block.block ?? []).filter((d) => d.name === name);
  if (found.length !== 1) {
    throw new Error(
      `nginx: expected one ${name} in ${block.name} ${block.args.join(" ")}, found ${found.length}`,
    );
  }
  return found[0].args;
}

/**
 * The response headers a location sets itself, in order. Only `add_header name value always` is
 * accepted: without `always`, nginx drops the header from error responses, which UI-1 does not allow.
 * @param {Directive} location
 * @returns {Header[]}
 */
export function headersOf(location) {
  return (location.block ?? [])
    .filter((d) => d.name === "add_header")
    .map((d) => {
      if (d.args.length !== 3 || d.args[2] !== "always") {
        throw new Error(
          `nginx: add_header on line ${d.line} must be "add_header <name> <value> always"`,
        );
      }
      return { name: d.args[0], value: d.args[1] };
    });
}
