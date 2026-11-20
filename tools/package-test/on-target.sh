#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
#
# on-target.sh: the package's lifecycle checks (docs/07, Phase 4), run as root ON A DISPOSABLE OMV 8
# TEST VM. Copied there and started by run.sh; never run it on a server that matters, because it
# installs, removes and purges the package and installs a deliberately broken build.
#
#   on-target.sh lifecycle <deb>    clean install, reinstall, upgrade from an older build, removal,
#                                   purge, and a broken snippet rolled back by postinst. Ends with
#                                   <deb> installed.
#   on-target.sh omv-upgrade <deb>  <deb> installed, then openmediavault upgraded to its candidate
#                                   version: the plugin's files and snippet must survive. One-shot.
#
# Requests go to the loopback address only, over HTTP and HTTPS (when nginx listens on 443). The
# stock interface's replies are recorded before the package is installed and compared after each
# step: status, headers (less the ones that change on every request) and a hash of the body.
set -eu

PKG=openmediavault-webui
WEBROOT=/var/www/openmediavault-webui
SNIPPET=/etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf
SHARE=/usr/share/openmediavault-webui
NAV=/usr/share/openmediavault/workbench/navigation.d/webui.yaml
NAVJSON=/var/www/openmediavault/assets/navigation-config.json
WORK=$(mktemp -d /tmp/omv-webui-package-test.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
export DEBIAN_FRONTEND=noninteractive

FAILED=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; FAILED=$((FAILED + 1)); }
check() { # check <description> <command...>
    d=$1; shift
    if "$@" >/dev/null 2>&1; then pass "$d"; else fail "$d"; fi
}
step() { echo; echo "== $*"; }

ORIGINS="http://127.0.0.1"
if ss -ltn | grep -q ':443 '; then ORIGINS="$ORIGINS https://127.0.0.1"; fi

# The stock interface's paths. /ui and /ui/ are included: after removal they must answer as they
# did before the package was installed.
STOCK_PATHS="/ / /index.html /favicon.ico /assets/navigation-config.json /assets/route-config.json /does-not-exist /ui /ui/"

# One request, normalised: status line, sorted headers less Date/ETag/Last-Modified and with cookie
# values blanked, and the body's hash.
fetch() { # fetch <url> [POST]
    if [ "${2:-}" = POST ]; then
        curl -sk -o "$WORK/body" -D "$WORK/head" -X POST -H 'Content-Type: application/json' \
            -d '{"service":"System","method":"getInformation","params":null}' "$1" || :
    else
        curl -sk -o "$WORK/body" -D "$WORK/head" "$1" || :
    fi
    tr -d '\r' <"$WORK/head" | sed -n '1p'
    tr -d '\r' <"$WORK/head" | sed '1d;/^$/d' |
        grep -viE '^(date|expires|etag|last-modified|content-length|transfer-encoding|connection):' |
        sed -E 's/^(set-cookie: *[^=]+=)[^;]*/\1<value>/I' | sort
    echo "body $(sha256sum <"$WORK/body" | cut -c1-16)"
}

# The stock replies, one block per request. Optionally leave out a path (the menu, while installed).
snapshot() { # snapshot <file> [path-to-leave-out]
    : >"$1"
    for o in $ORIGINS; do
        for p in $STOCK_PATHS; do
            [ "$p" = "${2:-}" ] && continue
            case "$p" in /ui | /ui/) [ -n "${3:-}" ] && continue ;; esac
            { echo "### GET $o$p"; fetch "$o$p"; } >>"$1"
        done
        { echo "### POST $o/rpc.php"; fetch "$o/rpc.php" POST; } >>"$1"
    done
}

same_as_baseline() { # same_as_baseline <description> [path-to-leave-out] [skip-ui]
    snapshot "$WORK/now" "${2:-}" "${3:-}"
    snapshot_filter "$WORK/baseline" "${2:-}" "${3:-}" >"$WORK/base-filtered"
    if diff -u "$WORK/base-filtered" "$WORK/now" >"$WORK/diff"; then
        pass "$1"
    else
        fail "$1"
        sed 's/^/        /' "$WORK/diff" | head -40
    fi
}

# The baseline with the same paths left out as the current snapshot.
snapshot_filter() { # snapshot_filter <file> [path] [skip-ui]
    awk -v leave="${2:-}" -v skipui="${3:-}" '
        /^### / { split($0, a, " "); url = a[3]; sub(/^https?:\/\/[^\/]+/, "", url)
                  keep = !(leave != "" && url == leave) && !(skipui != "" && (url == "/ui" || url == "/ui/")) }
        keep { print }' "$1"
}

header_of() { # header_of <url> <header-name>: the header's value, or nothing
    curl -sk -D - -o /dev/null "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d: -f2- | sed 's/^ //'
}
status_of() { curl -sk -o /dev/null -w '%{http_code}' "$1"; }

nginx_ok() { nginx -t -q; }
nginx_active() { systemctl is-active --quiet nginx.service; }
pkg_status() { dpkg-query -W -f='${db:Status-Abbrev}' "$PKG" 2>/dev/null || echo "un"; }

# What every installed state must show.
installed_checks() {
    check "package configured (ii)" sh -c "[ \"\$(dpkg-query -W -f='\${db:Status-Abbrev}' $PKG)\" = 'ii ' ]"
    check "dpkg --verify: every file as shipped" sh -c "[ -z \"\$(dpkg --verify $PKG)\" ]"
    check "snippet is the package's link" sh -c "[ \"\$(readlink $SNIPPET)\" = $SHARE/nginx/openmediavault-webui.conf ]"
    check "web root owned by root, dirs 0755, files 0644" sh -c "
        [ -z \"\$(find $WEBROOT ! -user root -o ! -group root)\" ] &&
        [ -z \"\$(find $WEBROOT -type d ! -perm 0755)\" ] &&
        [ -z \"\$(find $WEBROOT -type f ! -perm 0644)\" ]"
    check "www-data cannot write to the web root" sh -c "! su -s /bin/sh www-data -c 'test -w $WEBROOT || test -w $WEBROOT/index.html || test -w $WEBROOT/assets'"
    check "nginx -t passes and nginx is running" sh -c "nginx -t -q && systemctl is-active --quiet nginx.service"
    check "menu entry in the stock interface" grep -q '/externalRedirect/%2Fui%2F' "$NAVJSON"
    css=$(cd "$WEBROOT/assets" && ls ./*.css | head -1 | sed 's|^\./||')
    for o in $ORIGINS; do
        check "$o/ui redirects to /ui/" sh -c "[ \"\$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' $o/ui)\" = '301 $o/ui/' ]"
        check "$o/ui/ is the interface, with UI-1 headers" sh -c "
            [ \"\$(curl -sk $o/ui/ | sha256sum)\" = \"\$(sha256sum <$WEBROOT/index.html)\" ] &&
            curl -sk -D - -o /dev/null $o/ui/ | tr -d '\r' | grep -qi \"^Content-Security-Policy: default-src 'none'.*require-trusted-types-for 'script'\" &&
            curl -sk -D - -o /dev/null $o/ui/ | tr -d '\r' | grep -qi '^Cache-Control: no-cache$'"
        check "$o deep link answers with index.html" sh -c "[ \"\$(curl -sk $o/ui/storage/shared-folders | sha256sum)\" = \"\$(sha256sum <$WEBROOT/index.html)\" ]"
        check "$o asset is immutable" sh -c "[ \$(curl -sk -o /dev/null -w '%{http_code}' $o/ui/assets/$css) = 200 ] &&
            curl -sk -D - -o /dev/null $o/ui/assets/$css | tr -d '\r' | grep -qi '^Cache-Control: public, max-age=31536000, immutable$'"
        check "$o missing asset is a plain, uncached 404" sh -c "[ \"\$(curl -sk $o/ui/assets/missing-0000.js)\" = 'Not found' ] &&
            [ \$(curl -sk -o /dev/null -w '%{http_code}' $o/ui/assets/missing-0000.js) = 404 ] &&
            curl -sk -D - -o /dev/null $o/ui/assets/missing-0000.js | tr -d '\r' | grep -qi '^Cache-Control: no-store$'"
    done
    same_as_baseline "stock interface replies unchanged (menu file aside)" /assets/navigation-config.json skip-ui
}

nothing_left_checks() {
    check "no web root" test ! -e "$WEBROOT"
    check "no snippet" sh -c "[ ! -e $SNIPPET ] && [ ! -L $SNIPPET ]"
    check "nothing in $SHARE" test ! -e "$SHARE"
    check "no menu entry file" test ! -e "$NAV"
    check "menu entry gone from the stock interface" sh -c "! grep -q externalRedirect/%2Fui%2F $NAVJSON"
    check "nginx -t passes and nginx is running" sh -c "nginx -t -q && systemctl is-active --quiet nginx.service"
    check "nginx configuration has no /ui/ location" sh -c "! nginx -T 2>/dev/null | grep -q 'location \\^~ /ui/'"
    same_as_baseline "every reply as before the package was installed, /ui included"
}

# A copy of <deb> with its version changed, and optionally a file added or the snippet broken.
repack() { # repack <deb> <out> <version> [extra-asset|break-snippet]
    rm -rf "$WORK/repack"
    dpkg-deb -R "$1" "$WORK/repack"
    sed -i "s/^Version: .*/Version: $3/" "$WORK/repack/DEBIAN/control"
    case "${4:-}" in
        extra-asset)
            echo 'old build' >"$WORK/repack$WEBROOT/assets/package-test-old.js"
            chmod 0644 "$WORK/repack$WEBROOT/assets/package-test-old.js"
            ;;
        break-snippet)
            printf '\nthis_is_not_an_nginx_directive;\n' >>"$WORK/repack$SHARE/nginx/openmediavault-webui.conf"
            ;;
    esac
    (cd "$WORK/repack" && find . -type f ! -path './DEBIAN/*' -exec md5sum {} + | sed 's| \./| |' >DEBIAN/md5sums)
    dpkg-deb -b --root-owner-group "$WORK/repack" "$2" >/dev/null
}

prepare_clean() {
    step "Prepare: no package and no hand-deployed copy"
    if dpkg-query -W "$PKG" >/dev/null 2>&1; then
        dpkg --purge "$PKG" >/dev/null 2>&1 || apt-get purge -y -qq "$PKG" >/dev/null
    fi
    # Earlier phases deployed the build by hand. Remove that copy only if no package owns it.
    for f in "$SNIPPET" "$WEBROOT"; do
        if [ -e "$f" ] || [ -L "$f" ]; then
            if dpkg -S "$f" >/dev/null 2>&1; then echo "  $f belongs to a package; stopping"; exit 2; fi
            rm -rf "$f"
        fi
    done
    nginx -t -q && systemctl reload nginx.service
    omv-mkworkbench all >/dev/null 2>&1 || :
    sleep 1
    check "starting point: nginx -t passes" nginx_ok
    snapshot "$WORK/baseline"
    echo "  baseline: $(grep -c '^###' "$WORK/baseline") replies recorded over: $ORIGINS"
}

lifecycle() {
    deb=$1
    prepare_clean

    step "Clean install"
    apt-get install -y -qq "$deb" >"$WORK/apt.log" 2>&1 || { fail "apt-get install"; cat "$WORK/apt.log"; }
    installed_checks

    step "Reinstall the same version"
    apt-get install -y -qq --reinstall "$deb" >"$WORK/apt.log" 2>&1 || { fail "apt-get install --reinstall"; cat "$WORK/apt.log"; }
    installed_checks

    step "Upgrade from an older build (whose extra asset the new one does not have)"
    apt-get purge -y -qq "$PKG" >/dev/null 2>&1
    ver=$(dpkg-deb -f "$deb" Version)
    repack "$deb" "$WORK/older.deb" "${ver%~*}~dev0" extra-asset
    apt-get install -y -qq "$WORK/older.deb" >"$WORK/apt.log" 2>&1 || { fail "install the older build"; cat "$WORK/apt.log"; }
    check "older build serves its extra asset" sh -c "[ \$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ui/assets/package-test-old.js) = 200 ]"
    apt-get install -y -qq "$deb" >"$WORK/apt.log" 2>&1 || { fail "upgrade"; cat "$WORK/apt.log"; }
    check "upgraded to $ver" sh -c "[ \"\$(dpkg-query -W -f='\${Version}' $PKG)\" = '$ver' ]"
    check "the old build's asset is gone" test ! -e "$WEBROOT/assets/package-test-old.js"
    installed_checks

    step "Remove"
    apt-get remove -y -qq "$PKG" >"$WORK/apt.log" 2>&1 || { fail "apt-get remove"; cat "$WORK/apt.log"; }
    sleep 1
    nothing_left_checks

    step "Purge"
    apt-get purge -y -qq "$PKG" >"$WORK/apt.log" 2>&1 || { fail "apt-get purge"; cat "$WORK/apt.log"; }
    check "dpkg no longer knows the package" sh -c "! dpkg-query -W -f='\${db:Status-Abbrev}' $PKG 2>/dev/null | grep -q '^[a-z][a-z]'"
    nothing_left_checks

    step "A broken snippet is rolled back by postinst"
    repack "$deb" "$WORK/broken.deb" "$ver" break-snippet
    if apt-get install -y -qq "$WORK/broken.deb" >"$WORK/apt.log" 2>&1; then
        fail "install of the broken build reports failure"
    else
        pass "install of the broken build reports failure"
    fi
    check "postinst explained the failure" grep -q "nginx refused this package's snippet" "$WORK/apt.log"
    check "package left unconfigured (iF), not installed" sh -c "[ \"\$(dpkg-query -W -f='\${db:Status-Abbrev}' $PKG)\" = 'iF ' ]"
    check "broken snippet removed" sh -c "[ ! -e $SNIPPET ] && [ ! -L $SNIPPET ]"
    check "nginx -t passes and nginx is running" sh -c "nginx -t -q && systemctl is-active --quiet nginx.service"
    sleep 1
    same_as_baseline "stock interface replies unchanged, /ui not served (menu file aside)" /assets/navigation-config.json
    if dpkg --configure "$PKG" >"$WORK/apt.log" 2>&1; then
        fail "configuring again fails again"
    else
        pass "configuring again fails again"
    fi
    check "and removes the snippet again" sh -c "[ ! -e $SNIPPET ] && [ ! -L $SNIPPET ] && nginx -t -q"
    apt-get purge -y -qq "$PKG" >/dev/null 2>&1 || dpkg --purge "$PKG" >/dev/null 2>&1
    sleep 1
    nothing_left_checks

    step "Leave the good build installed"
    apt-get install -y -qq "$deb" >"$WORK/apt.log" 2>&1 || { fail "apt-get install"; cat "$WORK/apt.log"; }
    installed_checks
}

omv_upgrade() {
    deb=$1
    apt-get update -qq >/dev/null
    from=$(dpkg-query -W -f='${Version}' openmediavault)
    to=$(apt-cache policy openmediavault | awk '/Candidate:/ { print $2 }')
    step "OMV upgrade: openmediavault $from -> $to, with the plugin installed"
    [ "$from" != "$to" ] || { echo "  no newer openmediavault is available; nothing to do"; exit 2; }
    if [ "$(pkg_status)" != "ii " ]; then
        prepare_clean
        apt-get install -y -qq "$deb" >"$WORK/apt.log" 2>&1 || { fail "apt-get install"; cat "$WORK/apt.log"; }
    else
        # The package is already installed: its baseline is the stock replies now, /ui and the menu
        # file aside.
        snapshot "$WORK/baseline" /assets/navigation-config.json skip-ui
    fi
    installed_checks
    apt-get install -y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold \
        openmediavault >"$WORK/apt.log" 2>&1 || { fail "openmediavault upgrade"; tail -30 "$WORK/apt.log"; }
    check "openmediavault is now $to" sh -c "[ \"\$(dpkg-query -W -f='\${Version}' openmediavault)\" = '$to' ]"
    sleep 2
    # The stock replies are expected to change with a new OMV: record them again before comparing.
    snapshot "$WORK/baseline" /assets/navigation-config.json skip-ui
    installed_checks

    step "OMV re-renders its nginx site and the workbench"
    omv-salt deploy run --no-color --quiet nginx >"$WORK/salt.log" 2>&1 || { fail "omv-salt deploy run nginx"; tail -30 "$WORK/salt.log"; }
    omv-mkworkbench all >/dev/null 2>&1 || fail "omv-mkworkbench all"
    sleep 2
    installed_checks
}

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 2; }
[ -f /etc/default/openmediavault ] || { echo "not an openmediavault system"; exit 2; }
case "${1:-}" in
    lifecycle) lifecycle "${2:?the .deb to test}" ;;
    omv-upgrade) omv_upgrade "${2:?the .deb to test}" ;;
    *) echo "usage: on-target.sh lifecycle|omv-upgrade <deb>"; exit 2 ;;
esac

echo
if [ "$FAILED" -eq 0 ]; then echo "package-test: all checks passed"; else echo "package-test: $FAILED check(s) FAILED"; exit 1; fi
