# SPDX-License-Identifier: GPL-3.0-or-later
# `make test` runs every check a pull request must pass (.agents/rules/verification.md). The
# workspace is under web/. The contract-drift check needs an OMV source tree: set OMV_SOURCE_DIR,
# or it is skipped here (CI always runs it against a pinned tree).

.PHONY: test install lint typecheck unit format-check contract tools colour drift

install: web/node_modules/.modules.yaml

web/node_modules/.modules.yaml: web/pnpm-lock.yaml web/package.json
	cd web && pnpm install --frozen-lockfile

test: install lint typecheck unit format-check contract tools colour drift

lint: install
	cd web && pnpm lint

typecheck: install
	cd web && pnpm typecheck

unit: install
	cd web && pnpm test

format-check: install
	cd web && pnpm format:check && pnpm exec prettier --check ../tools/lib ../tools/contract-bootstrap ../tools/contract-capture ../tools/contract-drift

# Lint the contract, rebuild the bundle and the client, and check the files written from it.
contract: install
	cd web && pnpm api:spec:lint && pnpm api:spec:build && pnpm api:react:build && pnpm api:check

tools:
	node --test 'tools/**/*.test.mjs'

colour:
	node tools/colour-audit.mjs contrast --quiet

drift:
	@if [ -n "$$OMV_SOURCE_DIR" ]; then node tools/contract-drift/drift.mjs --omv "$$OMV_SOURCE_DIR"; \
	else echo "drift: skipped (OMV_SOURCE_DIR is not set)"; fi
