#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
#
# run.sh <ssh-destination> [lifecycle|omv-upgrade]: run the package's lifecycle checks on a
# DISPOSABLE OMV 8 test VM (docs/07, Phase 4). Copies the newest dist/*.deb and on-target.sh there,
# runs them as root, and removes them afterwards. The destination is an SSH alias or user@host that
# reaches root; it is not printed.
#
# Never point this at a server that matters: it installs, removes and purges the package, installs a
# deliberately broken build, and `omv-upgrade` upgrades openmediavault itself. To make that a
# conscious choice, PACKAGE_TEST_DISPOSABLE=yes must be set.
set -eu
NAS=${1:?usage: run.sh <ssh-destination> [lifecycle|omv-upgrade]}
MODE=${2:-lifecycle}
[ "${PACKAGE_TEST_DISPOSABLE:-}" = yes ] || {
    echo "run.sh: set PACKAGE_TEST_DISPOSABLE=yes to confirm the target is a disposable test VM" >&2
    exit 2
}
cd "$(dirname "$0")/../.."
DEB=$(ls -t dist/openmediavault-webui_*_all.deb 2>/dev/null | head -1)
[ -n "$DEB" ] || { echo "run.sh: no dist/*.deb; run make build docker-deb first" >&2; exit 2; }
NAME=$(basename "$DEB")
echo "package-test ($MODE): $NAME"
REMOTE=$(ssh "$NAS" 'mktemp -d /tmp/omv-webui-package-test-in.XXXXXX')
scp -q "$DEB" tools/package-test/on-target.sh "$NAS:$REMOTE/"
status=0
ssh "$NAS" "sh $REMOTE/on-target.sh $MODE $REMOTE/$NAME" || status=$?
ssh "$NAS" "rm -rf $REMOTE"
exit $status
