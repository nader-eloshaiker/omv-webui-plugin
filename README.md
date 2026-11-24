# omv-webui-plugin

`openmediavault-webui`: an unofficial, community plugin that gives [openmediavault](https://www.openmediavault.org) 8 a new web interface.

The plugin installs a new single-page application beside the stock one. It talks to OMV's existing backend endpoint (`rpc.php`) with the user's existing login. It does not modify openmediavault, and the stock interface keeps working.

> **Status: Phases 0 to 4 done: the design checked on a test system; the contract, client and transport; the design system and shell; the first pages; and the Debian package. Phase 5 (the remaining pages, domain by domain) is next.** There is no release yet. CI builds a development package on every pull request.

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
| — | [UX audit](docs/design/ux-audit.md) | The stock interface's common jobs counted, and the job-based flows that replace them |

Implementing agents start with [AGENTS.md](AGENTS.md).

`docs/later-gateway/` holds a complete, parked design for replacing `rpc.php` with a hardened API gateway. It is **not** part of the current build. See [its README](docs/later-gateway/README.md).

## Running it locally

You need Node.js 24 or later and pnpm (run `corepack enable` once; it provides the pinned version). Then, from the repository root:

```sh
make dev
```

That installs the dependencies the first time and starts the app on a mock backend, so no NAS is needed. Open `http://localhost:5173/ui/` and sign in with any user name and password. The panel in the bottom corner switches between mock scenarios (a healthy NAS, failing disks, a normal user, and so on). `make` on its own lists every command.

| Command | What it does |
| --- | --- |
| `make dev` | The app on the mock backend. |
| `make dev-nas` | The app against a real OMV 8 test system (see below). |
| `make storybook` | The component library's stories, at `http://localhost:6006`. |
| `make build` | The production bundle in `web/apps/omv-web-app/dist/`, checked for the security rules. |
| `make preview` | Serves the last production build. |
| `make test` | Everything a pull request must pass: lint, types, formatting, unit tests, the contract and the colour audit. |
| `make browser` | The browser tests on the production bundle under the plugin's real headers (the first time, get the browser with `cd web && pnpm test:browser:install`). |

Add `PORT=<n>` for another port: `make dev PORT=5180`. In development, the design lab (three early looks, mock only) is at `/ui/lab`.

**Against a test system.** `make dev-nas` sends the app's backend calls to the system named by `NAS_HOST`. Put a line `NAS_HOST=nas.example.org` in `~/.config/omv-webui/test.env`, or pass it for one run: `NAS_HOST=nas.example.org make dev-nas`. Use a disposable test system, not a NAS you depend on.

**With pnpm.** The same commands exist as pnpm scripts in `web/`, the pnpm workspace: `pnpm dev`, `pnpm dev:nas`, `pnpm storybook`, `pnpm build`, `pnpm preview`, `pnpm test`, `pnpm lint`, `pnpm typecheck` and `pnpm format:check`. Run `pnpm install` there first. Add `--port <n>` for another port.

The rules for what has to pass before a change is done are in [.agents/rules/verification.md](.agents/rules/verification.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately: see [SECURITY.md](SECURITY.md).

## Relationship to openmediavault

This is not the official openmediavault interface and is not endorsed by the openmediavault project.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
