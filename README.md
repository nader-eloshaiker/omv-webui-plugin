# omv-webui-plugin

`openmediavault-webui`: an unofficial, community plugin that gives [openmediavault](https://www.openmediavault.org) 8 a new web interface.

The plugin installs a new single-page application beside the stock one. It talks to OMV's existing backend endpoint (`rpc.php`) with the user's existing login. It does not modify openmediavault, and the stock interface keeps working.

> **Status: design complete; Phase 0 (verifying the design's assumptions on a test system) in progress.** There is no code to install yet. This repository holds the design and the implementation plan.

## Read in this order

| # | Document | What it answers |
|---|----------|-----------------|
| 00 | [Overview](docs/00-overview.md) | Goals, non-goals, glossary, the facts the design rests on |
| 01 | [Decisions](docs/01-decisions.md) | Every decision taken and why, including why the backend endpoint is unchanged |
| 02 | [Architecture](docs/02-architecture.md) | How it is served, the workspace layout, the layers of the application |
| 03 | [RPC transport](docs/03-rpc-transport.md) | How `rpc.php` behaves: requests, login, errors, tasks, downloads, quirks |
| 04 | [API contract](docs/04-api-contract.md) | The hand-written OpenAPI contract and the generated client |
| 05 | [Security](docs/05-security.md) | What the interface must do, and what it inherits and cannot fix |
| 06 | [Plugin packaging](docs/06-plugin-packaging.md) | Debian package, files, nginx, install and removal |
| 07 | [Implementation plan](docs/07-implementation-plan.md) | Phases, tasks, acceptance criteria, hand-off notes |
| 08 | [Test and verification](docs/08-test-and-verification.md) | What is tested and the release gate |
| — | [Style guide](docs/design/style-guide.md) | Visual design, colour system, components |

Implementing agents start with [AGENTS.md](AGENTS.md).

`docs/later-gateway/` holds a complete, parked design for replacing `rpc.php` with a hardened API gateway. It is **not** part of the current build. See [its README](docs/later-gateway/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately: see [SECURITY.md](SECURITY.md).

## Relationship to openmediavault

This is not the official openmediavault interface and is not endorsed by the openmediavault project.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
