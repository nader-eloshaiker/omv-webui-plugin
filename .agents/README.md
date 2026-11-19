# `.agents/` - the agent-neutral home of rules, skills, subagents and hooks

Everything that tells an AI coding agent how to work in this repository lives here, written so it
reads the same whichever assistant runs it. A harness that only discovers files under its own
folder (Claude Code reads `.claude/`) gets symlinks back to these files, never copies.

- `rules/` - the mandatory rules, indexed by the Rules table in the root [AGENTS.md](../AGENTS.md).
- `skills/` - every project skill.
- `subagents/` - every subagent definition.
- `hooks/` - scripts a harness runs around tool calls.

The design in `docs/` is the source of truth for **what** to build. These files say **how** to work
on it. Where a rule here and a design document disagree, the design document wins, and the `UI-*`
rules in [docs/05-security.md](../docs/05-security.md) win over everything. Fix the rule here in the
same change.

**The rules, skills and subagent prompts name no provider.** They say "the frontier model tier",
"the language-server tool", "the browser tool", "run it in the background". What each of those means
for a given harness is in the [provider map](#provider-map) below, and only there. Adding support
for another assistant means adding its column to that map and its symlinks, not editing a rule.

## Skills

> [!NOTE]
> **`.agents/skills/` is the single source of truth.** Every skill is a real directory there, and
> each has a matching symlink in `.claude/skills/` pointing back at it, because Claude Code only
> discovers project skills there. **Add a skill by creating it in `.agents/skills/<name>/` and
> symlinking it:** `ln -s ../../.agents/skills/<name> .claude/skills/<name>`. Never create a real
> directory under `.claude/skills/`; the two copies will drift.

## Subagents

> [!NOTE]
> Every subagent is a **real file** in `.agents/subagents/` with a **symlink** in `.claude/agents/`,
> exactly as with skills. **Add one by creating `.agents/subagents/<name>.md` and symlinking it:**
> `ln -s ../../.agents/subagents/<name>.md .claude/agents/<name>.md`. The frontmatter (`name`,
> `description`, `model`, `tools`) is in Claude Code's format; the body is the neutral prompt. A
> `model:` value pins a tier from the provider map, and `inherit` takes the caller's.

## Hooks

`.agents/hooks/` holds the scripts that `.claude/settings.json` wires into Claude Code. That file is
committed so every checkout and worktree gets the same hooks and the language-server plugin.

- `grep-lsp-reminder.mjs` (before each shell command) - when a `grep`, `rg` or `git grep` searches
  for a code identifier (a camelCase or PascalCase name, or `pkg.Symbol`), it reminds the agent once
  per session per name that the language-server tool answers who calls it and where it is defined.
  It never blocks or rewrites the command: grep stays right for strings, copy keys and docs.

Personal settings stay in `.claude/settings.local.json`, which is gitignored.

## Commands named in these files

The rules name the workspace scripts the reference application uses (`pnpm lint`, `pnpm typecheck`,
`pnpm test`, `pnpm format:check`, `pnpm api:spec:lint`, `pnpm api:spec:build`, `pnpm api:react:build`,
`pnpm dev`, `pnpm dev:mock`, `make test`). They are created in Phase 1 of
[docs/07-implementation-plan.md](../docs/07-implementation-plan.md). Until a script exists, say so
rather than reporting it as passed.

## Provider map

The rules use the neutral term on the left. The value for each harness in use is on the right.

**This table is the source of truth for every harness.** A rule may name one harness's value in
brackets at a hot path, such as "(Claude Code: the Bash tool's `run_in_background`)"; that copies the
value from here as a shortcut, and every other harness still reads this table. A harness with no
column has no mapping yet: add its column before it works on the repository. Until then, read the
neutral term as the intent and find its equivalent.

| Neutral term in the rules                          | Claude Code                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Instruction file it loads                          | `CLAUDE.md`, a one-line shim importing the `AGENTS.md` beside it                                             |
| Skill and subagent discovery folders               | `.claude/skills/`, `.claude/agents/` (symlinks only)                                                         |
| Project hooks and plugins                          | `.claude/settings.json`                                                                                      |
| Frontier model tier (builders, design rulings)     | Opus                                                                                                         |
| Fast model tier (browser walks, read-only lookups) | Sonnet (`model: sonnet` in a subagent's frontmatter)                                                         |
| The language-server tool                           | `LSP` - deferred; load it once with ToolSearch query `select:LSP`                                            |
| The browser tool                                   | Claude in Chrome (`mcp__claude-in-chrome__*`, loaded with one ToolSearch call); Playwright for scripted runs |
| Reasoning effort per task                          | `low`, `medium`, `high`, `xhigh`, `max`; the Agent tool's `effort` parameter, else the session's effort      |
| Shell `grep` that skips files silently             | `grep` may be a wrapper that skips binary-looking and ignored files; the real one is `/usr/bin/grep`         |
| Spawn a builder into its own worktree              | the Agent tool with `isolation: "worktree"`                                                                  |
| Run a command in the background                    | the Bash tool's `run_in_background`; a foreground call times out at two minutes                              |
| Attribution the harness injects (and we strip)     | a `Co-Authored-By: Claude` trailer, a `claude.ai` session link, a "Generated with Claude Code" footer        |
