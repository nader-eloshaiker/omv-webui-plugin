# SPDX-License-Identifier: GPL-3.0-or-later
# `make test` runs every check a pull request must pass (.agents/rules/verification.md). The
# workspace is under web/. The contract-drift check needs an OMV source tree: set OMV_SOURCE_DIR,
# or it is skipped here (CI always runs it against a pinned tree).
#
# Packaging (docs/06-plugin-packaging.md): `make build` builds the web bundle, then `make deb` (on a
# Debian 13 host) or `make docker-deb` (anywhere with Docker) builds the package from it. The package
# build itself needs no Node toolchain and no network.

.PHONY: test install lint typecheck unit format-check contract tools build build-check colour drift browser deb docker-deb package-test clean

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
build: install
	cd web && pnpm build
	node tools/build-check/check.mjs web/apps/omv-web-app/dist

build-check: build

# Not part of `make test`: the production build in Chromium under the nginx snippet's headers, with
# and without Trusted Types enforced. Needs the browser once: cd web && pnpm test:browser:install.
browser: install
	cd web && pnpm test:browser

colour:
	node tools/colour-audit.mjs contrast --quiet

drift:
	@if [ -n "$$OMV_SOURCE_DIR" ]; then node tools/contract-drift/drift.mjs --omv "$$OMV_SOURCE_DIR"; \
	else echo "drift: skipped (OMV_SOURCE_DIR is not set)"; fi

# Requires a Debian 13 build host (apt install build-essential debhelper fakeroot) and `make build`.
deb:
	dpkg-buildpackage -us -uc -b

# The package in a Debian 13 container, then lintian; the .deb lands in dist/. Run `make build` first.
# The container gets a copy of the tree without node_modules and .git.
DEBIAN_IMAGE ?= debian:trixie
docker-deb:
	@test -f web/apps/omv-web-app/dist/index.html || { echo "Run make build first."; exit 1; }
	mkdir -p dist
	docker run --rm -v "$(CURDIR)":/src:ro -v "$(CURDIR)/dist":/dist $(DEBIAN_IMAGE) sh -ec '\
		apt-get update -qq && \
		apt-get install -y -qq --no-install-recommends build-essential debhelper fakeroot lintian >/dev/null && \
		mkdir /build && tar -C /src --exclude=./.git --exclude="*/node_modules" --exclude=./dist --exclude=./scratch --exclude=./omv-source -cf - . | tar -C /build -xf - && \
		cd /build && dpkg-buildpackage -us -uc -b && \
		lintian --fail-on error --info ../*.changes && \
		cp ../*.deb /dist/'
	ls -l dist/*.deb

# The package's install, upgrade, removal and broken-snippet checks, on a disposable test VM only
# (never the owner's server): make package-test NAS=<ssh destination>. See tools/package-test.
package-test:
	tools/package-test/run.sh $(NAS)

clean:
	rm -rf debian/openmediavault-webui debian/.debhelper debian/files debian/*.substvars debian/debhelper-build-stamp debian/*.debhelper.log
