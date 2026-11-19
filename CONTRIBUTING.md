# Contributing

Thanks for helping. Issues and pull requests are welcome.

The project is early: the design is complete and Phase 0 (checking the design's assumptions on a test system) is in progress. There is no application code yet, so the most useful contributions now are comments on the design and reports of how openmediavault behaves on your system.

## Before you start

- Read [AGENTS.md](AGENTS.md) for the rules that always apply (they are for people too) and the [README](README.md) for the order to read the design in.
- The work is split into phases in [docs/07-implementation-plan.md](docs/07-implementation-plan.md). Say which phase or issue a change belongs to.
- For anything larger than a fix, open an issue first so we can agree on the approach.
- Problems in openmediavault itself (`rpc.php`, login, sessions, the stock interface) belong to the [openmediavault project](https://github.com/openmediavault/openmediavault/issues), not here.

## Security

Never open a public issue or pull request about a security problem. Follow [SECURITY.md](SECURITY.md) and report it privately.

Some weaknesses in openmediavault's web layer are known privately and not yet fixed upstream. The docs refer to them by review ID only (`H1`, `M9`, ...). Don't add reproduction steps, payloads or request sequences for them anywhere in the repository, issues or pull requests.

## Making a change

- **Don't modify openmediavault.** The plugin installs beside it and never patches files owned by another package.
- **The `UI-*` rules in [docs/05-security.md](docs/05-security.md) are binding.** If one seems wrong or impossible, raise it in an issue rather than working around it.
- **Only the transport module talks to the backend**, and request and response types come from the OpenAPI contract, regenerated rather than hand-written.
- **Colour changes go through the audit:** run `node tools/colour-audit.mjs` before changing `design/tokens.css`.
- **Plain words in the interface.** Assume no Linux knowledge; a destructive action says exactly what will be lost.

`make test` arrives with the workspace in Phase 1, and CI will run it on every pull request. Workflows from first-time contributors start once the maintainer approves them.

## Testing

- Check screens and their states on the mock backend (MSW) first.
- Use a disposable openmediavault 8 virtual machine for what only a real backend can show. Don't test against a NAS that holds data you care about.
- In the pull request, say what you tested on: "mock only", or the openmediavault version and what you checked.

## Commits and pull requests

- `main` is protected: every change reaches it through a pull request from a branch, including the maintainer's. Nobody pushes to `main` directly.
- One topic per pull request. Rebase on `main` rather than merging it in: `main` keeps a linear history, and pull requests are squashed or rebased, never merged with a merge commit.
- Commit messages: an imperative subject, and a body explaining why.
- Sign off every commit (`git commit -s`). The sign-off certifies the [Developer Certificate of Origin](https://developercertificate.org): you wrote the change or have the right to submit it under the project's licence, GPL-3.0-or-later.
- Don't include host names, IP addresses, user names or serial numbers from a real system in code, docs, logs, captured responses or screenshots. Use `NAS_HOST` and documentation addresses (`192.0.2.0/24`).
- Record owner decisions and verified assumptions as dated entries in `docs/journal.md`.

## Releases

The maintainer tags releases as `v<version>`. Packaging is described in [docs/06-plugin-packaging.md](docs/06-plugin-packaging.md).

## Code of conduct

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
