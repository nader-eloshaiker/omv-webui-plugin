## What and why

<!-- What does this change, and what problem does it solve? Name the phase
(docs/07-implementation-plan.md) or the issue it belongs to. -->

## Tested on

<!-- "Mock (MSW) only", or the OMV version on the test VM and what you
checked there. Leave out host names, IP addresses, user names and serial
numbers. -->

## Checklist

- [ ] `make test` passes (once the workspace exists)
- [ ] The `UI-*` rules in `docs/05-security.md` still hold
- [ ] Only the transport module talks to `rpc.php`; request and response
      types come from the contract, regenerated rather than hand-written
- [ ] Colour changes went through `node tools/colour-audit.mjs`
- [ ] Owner decisions and verified assumptions are in `docs/journal.md`
- [ ] No personal data, and no detail of unfixed openmediavault weaknesses
      beyond their review ID
