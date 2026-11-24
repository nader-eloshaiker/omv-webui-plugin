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

You need Node.js 24 or later and pnpm (the version is pinned in `web/package.json`; `corepack enable` provides it). Every command runs from `web/`, which is the pnpm workspace.

```sh
cd web
pnpm install
```

### The app

| Command | What it does |
| --- | --- |
| `pnpm --filter omv-web-app dev:mock` | The app on a mock backend (MSW) that answers from the contract's examples. No NAS needed. Open `http://localhost:5173/ui/` and sign in with any user name and password. The panel in the bottom corner switches between mock scenarios (a healthy NAS, failing disks, a normal user, and so on). |
| `pnpm --filter omv-web-app dev` | The app against a real OMV 8 test system: `rpc.php` and `download.php` are proxied to `NAS_HOST`. Set it in the environment (`NAS_HOST=nas.example.org pnpm --filter omv-web-app dev`) or as a `NAS_HOST=` line in `~/.config/omv-webui/test.env` (or another file named by `OMV_WEBUI_ENV`). Use a disposable test system, not a NAS you depend on. |
| `pnpm build` | The production bundle in `web/apps/omv-web-app/dist/`. |
| `pnpm --filter omv-web-app preview` | Serves the last production build. |

Add `--port <n>` to a dev command to use another port. In development, the design lab (three early looks, mock only) is at `/ui/lab`.

### The component library

`pnpm --filter @omv-webui/react-ui-components storybook` starts Storybook at `http://localhost:6006`, with the stories of every shared component.

### Checks

| Command | What it does |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | Lint, type check and formatting for the whole workspace. |
| `pnpm test` | The unit tests, one package at a time, with at most four test workers. |
| `pnpm test:browser` | Builds, then runs the browser tests on the production bundle under the plugin's real headers. Run `pnpm test:browser:install` once first to get the browser. |
| `make test` (repository root) | Everything a pull request must pass: the commands above plus the contract checks and the colour audit. |

The rules for what has to pass before a change is done are in [.agents/rules/verification.md](.agents/rules/verification.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately: see [SECURITY.md](SECURITY.md).

## Relationship to openmediavault

This is not the official openmediavault interface and is not endorsed by the openmediavault project.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).
