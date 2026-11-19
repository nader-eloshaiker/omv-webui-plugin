# Verifying a change before committing

What has to be green before a change is reported as done, and how to check the things a green test
run does not prove. The release gate is [docs/08-test-and-verification.md](../../docs/08-test-and-verification.md);
this file is the everyday version of it.

## TypeScript

Four commands, and `typecheck` is the one most often skipped because `pnpm test` passes without it:
Vitest transpiles rather than type-checks, so a type error survives a green test run.

```
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`make test` at the repository root runs these plus the colour audit and the contract checks.

### Run the narrow battery while iterating, the full one before the pull request

The four commands are the gate, not the loop. While iterating, run only what the diff can break:

```
pnpm --filter <package> test        # or: pnpm test <path/to/file.test.ts>
pnpm typecheck
```

Then run the full battery once before the pull request. That is the only run whose result may be
reported as "tests pass". If only a filtered run was executed, say which one.

Widen the run the moment the diff widens: a change to a shared package, the contract, anything
generated, or a lint rule has left the narrow battery's coverage.

Long test runs go in the background (Claude Code: the Bash tool's `run_in_background`); see the
[provider map](../README.md#provider-map). Only one test run on the machine at a time.

## The contract

After any change under `web/packages/spec-api-omv/src/`:

```
pnpm api:spec:lint
pnpm api:spec:build
pnpm api:react:build
```

Commit the regenerated output in the same change. `tools/contract-drift` must be clean against the
pinned OMV source tree. Generated code is never edited by hand.

## Colour

Before and after changing `design/tokens.css` or any colour in a component:

```
node tools/colour-audit.mjs contrast --quiet    # exit 1 if a required pair fails
node tools/colour-audit.mjs                     # contrast + distinct + neutrals, full report
```

A new colour family adds its pairs to `PAIRS` in the script in the same change, and the numbers the
style guide quotes are updated from the script's output. See the `colour-theory` skill.

## Built output - the security rules are checked on the bundle, not the source

Several `UI-*` rules can only be proven on what ships. After `pnpm build`, check `web/apps/omv-web-app/dist/`:

- `index.html` has no inline `<script>` content, no `<style>` element and no `style=` attribute
  (UI-1).
- No request to another origin: no CDN, font host, analytics or update check anywhere in the bundle
  (UI-7).
- No MSW, test utilities, example data or source maps with sources (UI-11).

**A grep that finds nothing is not evidence.** A harness may replace the shell's `grep` with a
wrapper that silently skips binary-looking and gitignored files, and `dist/` is gitignored. Check
built output with `/usr/bin/grep` or `python3 -I`, and say which in the report. A script that
decides on grep's exit code calls `/usr/bin/grep`.

## Seeing it - when a change needs a browser

A browser is the most expensive check. Spend it where nothing else answers the question.

**Open a browser when** the change is visual and nothing asserts it: a new surface, a layout or
density change, a state whose appearance is the behaviour (empty, error, pending changes), both
themes, or anything about headers and the Content Security Policy.

**Do not open one when** a Testing Library test renders the states in question, or nothing rendered
changed (wiring, a query key, a type, a copy edit).

Where the data comes from has two forms, and a request to verify names one:

- **the mock**: `pnpm dev:mock`, then the route. Holds no state; right for any screen state an
  example reaches.
- **the test VM**: the dev server pointed at `$NAS_HOST`, or the packaged plugin installed on the VM.
  Right for writes read back, tasks, sessions, headers and CSP.

**When the request names neither, ask.** Do not assume the mock's default and report "cannot
reproduce".

Hard limits:

- **The test VM by default.** The owner's own server only when the request names it, and then only
  under ground rule 2 of `docs/07-implementation-plan.md`: read-only unless the owner agrees a
  change, none of the excluded tests, the agent's own accounts in a browser context of their own.
- **Credentials come from the env files** (`$OMV_WEBUI_ENV` for the VM, `$OMV_WEBUI_OWNER_ENV` for
  the owner's server; see ground rule 2),
  never from the repository or a chat, and are never printed. Scripts read them. Typing a password or
  one-time code into a page needs the owner's yes, asked once per session after checking the
  credential is in the file.
- Never trigger `alert`, `confirm` or `prompt` in a driven browser; a modal dialog stops the session.
- A CSP check reads the browser console for violations and the response headers for each of `/ui/`,
  an asset, a deep link and a missing file.

A scripted press is not a click: `element.click()` moves no focus, so focus after an action is
asserted in a Testing Library test with `userEvent`, not judged from a driven browser.

## Markdown

Run Prettier over any markdown file you edited before committing. The usual failure is editing a
cell of a wide table without re-padding the column.

## Before reporting done

- Say exactly which commands ran and their result. A step that was skipped is reported as skipped.
- No AI attribution in the commit, the pull request or the code; commits are signed off as the
  owner only (`git commit -s`).
- No personal data in anything committed: no real host names, addresses, user names or serial
  numbers. Captured responses are scrubbed.
- No detail of an undisclosed OMV weakness anywhere in the repository (review IDs and class only).
