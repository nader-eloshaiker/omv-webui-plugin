#!/usr/bin/env node
// PreToolUse(Bash) hook: when a grep, rg or git grep searches for a code identifier (a camelCase or
// PascalCase name, or pkg.Symbol), remind the agent that the LSP tool answers "who calls this" and
// "where is this defined" and grep cannot tell a call from a comment or a same-named symbol.
// It never blocks and never rewrites the command: grep stays right for strings, copy keys and docs.
// Each identifier is reminded once per session.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const command = input.tool_input?.command;
if (typeof command !== "string") process.exit(0);

// The text of each grep/rg invocation, up to the next pipeline or command separator. A pipe with no
// space on either side (Foo|Bar) is an alternation inside the pattern, not a pipeline.
const invocations = [
  ...command.matchAll(
    /(?:^|[\s;&|(])(?:git\s+grep|grep|egrep|rg)\s((?:[^|;&\n]|(?<=\S)\|(?=[^\s|]))*)/g,
  ),
].map((m) => m[1]);
if (invocations.length === 0) process.exit(0);

// A lower-to-upper case change marks a code name (RpcError, useShareMgmtGetList, rpc.Client);
// a plain word, an ALL_CAPS constant or a dotted copy key (shares.page.title) does not have one.
const identifier = /^(?:[A-Za-z_]\w*\.)?[A-Za-z_]*[a-z][A-Z]\w*$/;
const names = new Set();
for (const text of invocations) {
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^['"]|['"]$/g, "").replace(/^\\b|\\b$/g, "");
    if (token.startsWith("-") || token.includes("/")) continue;
    // A file name (rpcClient.ts, session.inc) is a path, not a search term.
    if (/\.(?:[jt]sx?|mjs|inc|php|md|json|ya?ml|css|html)$/.test(token)) continue;
    // An alternation (Foo|Bar) searches for each of its names.
    for (const part of token.split(/\\?\|/))
      if (identifier.test(part)) names.add(part);
  }
}
if (names.size === 0) process.exit(0);

const seenFile = join(
  tmpdir(),
  `grep-lsp-reminder-${input.session_id ?? "none"}.json`,
);
let seen = [];
try {
  if (existsSync(seenFile)) seen = JSON.parse(readFileSync(seenFile, "utf8"));
} catch {}
const fresh = [...names].filter((n) => !seen.includes(n));
if (fresh.length === 0) process.exit(0);
try {
  writeFileSync(seenFile, JSON.stringify([...seen, ...fresh]));
} catch {}

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext:
        `Reminder: ${fresh.join(", ")} looks like a code identifier. If the question is who calls it, ` +
        "where it is defined or what implements it, use the LSP tool (findReferences, goToDefinition, " +
        "incomingCalls; load it with ToolSearch select:LSP). grep cannot tell a call from a comment, a " +
        "string or a same-named symbol. The grep still runs; it remains right for strings, copy keys and docs.",
    },
  }),
);
