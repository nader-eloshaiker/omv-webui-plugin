# SPDX-License-Identifier: GPL-3.0-or-later
# `make test` runs every check a pull request must pass (.agents/rules/verification.md). The
# workspace is under web/. The contract-drift check needs an OMV source tree: set OMV_SOURCE_DIR,
# or it is skipped here (CI always runs it against a pinned tree).

.PHONY: test install lint typecheck unit format-check contract tools build-check colour drift browser

install: web/node_modules/.modules.yaml

web/node_modules/.modules.yaml: web/pnpm-lock.yaml web/package.json
	cd web && pnpm install --frozen-lockfile

test: install lint typecheck unit format-check contract tools build-check colour drift

lint: install
	cd web && pnpm lint

typecheck: install
	cd web && pnpm typecheck

unit: install
	cd web && pnpm test

format-check: install
	cd web && pnpm format:check && pnpm exec prettier --check ../tools/lib ../tools/contract-bootstrap ../tools/contract-capture ../tools/contract-drift ../tools/build-check

# Lint the contract, rebuild the bundle and the client, and check the files written from it.
contract: install
	cd web && pnpm api:spec:lint && pnpm api:spec:build && pnpm api:react:build && pnpm api:check

tools:
	node --test 'tools/**/*.test.mjs'

# Build the production bundle, then check what ships for UI-1, UI-7 and UI-11 (tools/build-check).
build-check: install
	cd web && pnpm build
	node tools/build-check/check.mjs web/apps/omv-web-app/dist

# Not part of `make test`: the production build in Chromium under the nginx snippet's headers, with
# and without Trusted Types enforced. Needs the browser once: cd web && pnpm test:browser:install.
browser: install
	cd web && pnpm test:browser

colour:
	node tools/colour-audit.mjs contrast --quiet

drift:
	@if [ -n "$$OMV_SOURCE_DIR" ]; then node tools/contract-drift/drift.mjs --omv "$$OMV_SOURCE_DIR"; \
	else echo "drift: skipped (OMV_SOURCE_DIR is not set)"; fi
