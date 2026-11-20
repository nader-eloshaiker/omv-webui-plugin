# 06 — Plugin packaging

## Package

| Field | Value |
|-------|-------|
| Source and binary package | `openmediavault-webui` |
| Short description | "new web interface for openmediavault" (Debian synopsis style: no leading article) |
| Architecture | `all` (static files only) |
| Depends | `openmediavault (>= 8.6)`, `${misc:Depends}` |
| Build-Depends | `debhelper-compat (= 13)`. The web bundle is built before packaging (`make build`) and shipped as files, so the package build needs no Node toolchain and no network |
| Version | `8.<minor>.<patch>`; the major follows OMV's major |
| Plugin section | `XB-Plugin-Section: system` |
| Licence | GPL-3.0-or-later |

Follow the conventions of the owner's other OMV plugins for `debian/`, the `Makefile` targets (`make test`, `make build`, `make deb`) and release layout.

## Files installed

```
/var/www/openmediavault-webui/                                   root:root, dirs 0755, files 0644
    index.html
    assets/…                                                     content-hashed file names
/usr/share/openmediavault-webui/nginx/openmediavault-webui.conf  the snippet, root:root 0644
/etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf     symbolic link to it
/usr/share/openmediavault/workbench/navigation.d/webui.yaml      link in the stock interface
/usr/share/doc/openmediavault-webui/                             README, copyright, changelog, openapi.json.gz
```

**The snippet in `/etc` is a symbolic link, not a configuration file** *(recommended, 2026-11-21)*. A regular file under `/etc` would be a dpkg conffile: it would stay behind after `remove`, and once `postinst` had deleted a snippet that failed `nginx -t`, dpkg would treat it as deleted by the administrator and never install it again. The snippet carries the UI-1 headers and is not meant to be edited, so it belongs to the package like any other file: dpkg removes the link on `remove` and puts it back on a reinstall.

No daemon, no system user, no datamodel, no backend service, no Salt state, no configuration database entry. Version 1 has no settings.

The files are deliberately **not** placed inside `/var/www/openmediavault/`, which belongs to the `openmediavault` package and is rebuilt by its tooling.

## nginx snippet

OMV's site includes `/etc/nginx/openmediavault-webgui.d/*.conf` at the end of its server block. OMV's own `headers.conf` lives in the same directory and is applied at server level too. The plugin adds one file, [`etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf`](../etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf). It is the only copy: the browser tests read their headers from it, and `tools/lib/nginx-conf.test.mjs` checks that every location sends exactly the UI-1 set ([05](05-security.md)). It passed `A1` and the `A9` browser run on the test VM (journal, 2026-11-19), and the Phase 2 run with Trusted Types enforced (journal, 2026-11-20).

In outline:

- `location = /ui` redirects to `/ui/`.
- `location ^~ /ui/` serves `/var/www/openmediavault-webui/` with `alias` and `try_files $uri /ui/index.html` (deep links get `index.html`), the UI-1 headers and `Cache-Control: no-cache`.
- The nested `location ^~ /ui/assets/` serves the hashed files with the same UI-1 headers and `Cache-Control: public, max-age=31536000, immutable`; a missing file goes to the named location below.
- `location @openmediavault_webui_missing` answers a plain `404 Not found`, with the UI-1 headers and `Cache-Control: no-store`.

Every location repeats the complete header set, because `add_header` in a location replaces the ones inherited from the server block.

What `A1` settled:

- `^~` wins over the stock regular-expression locations: `/ui/index.html` gets these headers, not the stock `index.html` ones, and nothing under `/ui/` reaches PHP.
- `alias` works with `try_files` and a nested **prefix** location for assets. A nested regular-expression location is not needed.
- `$uri/` is left out of `try_files`. With it, a directory without an index answers 403.
- The stock `error_page 404` redirects to the stock interface's 404 page, so a missing asset would get a redirect cached as immutable. The named location returns a plain, uncached 404 instead. Deep links are unaffected, because they fall back to `index.html`.
- `absolute_redirect off` keeps the `/ui` redirect relative.
- **HSTS is not repeated.** OMV sends it only when HTTPS is enabled and forced, and a static snippet cannot follow that setting. When HTTPS is forced, OMV's server-level redirect runs before `/ui/`, and every `rpc.php` reply carries HSTS, so the browser gets the policy on the interface's first call. *(Proposed; owner to confirm.)*
- OMV re-rendering its site leaves the file alone, because its Salt state manages only its own files.
- If the snippet is broken, OMV's nginx state fails its own `nginx -t` and keeps the running configuration, but every later apply that touches nginx fails until the file is fixed. That is why `postinst` must remove a snippet that fails the test.

The snippet contains no variable taken from the request and no proxying.

## Link in the stock interface

`/usr/share/openmediavault/workbench/navigation.d/webui.yaml` adds "New web interface" to the stock menu. Stock navigation entries go through the stock application's router, so the entry points at its external-redirect route, which opens `/ui/` in a new tab (`A5`, observed):

```yaml
version: "1.0"
type: navigation-item
data:
  path: "webui"
  position: 95
  text: "New web interface"
  icon: "mdi:open-in-new"
  url: "/externalRedirect/%2Fui%2F"
```

The new interface has a matching "Open the classic interface" link to `/`.

## Maintainer scripts

`postinst configure`:

1. `dpkg-trigger update-workbench` (so the stock interface picks up the navigation entry), as other OMV plugins do.
2. Put the snippet's link back if an earlier failed configure removed it.
3. `nginx -t`; only if it passes, reload nginx. If it fails, remove the link, reload if what is left passes, and exit with a clear error, which says whether the snippet or something else is at fault. A broken snippet must never take OMV's own interface down. The package stays unconfigured, so it is not reported as installed while `/ui/` is not served.

`postrm remove|purge`: dpkg has removed the link and the files; if `nginx -t` passes, reload nginx; trigger the workbench update.

No `omv-salt` run, no engined restart.

## Upgrade, removal, failure

- **Upgrade:** files are replaced; `index.html` is served with `no-cache` and assets have content-hashed names, so browsers pick up the new build on next load. A tab left open on the old build keeps working until reloaded; if a call fails in a way that suggests a version mismatch, the interface offers a reload.
- **OMV upgrade:** the plugin owns no file of another package. OMV re-rendering its nginx site does not touch the include directory. Before declaring support for a new OMV release, run `tools/contract-drift` and the integration suite against it.
- **Removal:** leaves no file, user or nginx rule behind. The stock interface is as it was.

All of this is checked on the test VM by `tools/package-test` (`make package-test NAS=<ssh destination>`, never the owner's server): clean install, reinstall, upgrade from an older build, removal, purge, and a deliberately broken snippet rolled back by `postinst`, each followed by the headers under `/ui/` and a comparison of the stock interface's replies with those recorded before the package was installed. `omv-upgrade` mode upgrades openmediavault with the plugin installed. CI builds the package in Debian 13 and runs lintian on every pull request (`make docker-deb`).
- **Backend unavailable:** the interface shows a "cannot reach the NAS" state and retries reads.

## Separation for other interface builders

`spec-api-omv`, `ts-api-omv` and `react-api-omv` are independent of the application (D12). They are not published to a registry in version 1; the bundled `openapi.json` is included in `/usr/share/doc/openmediavault-webui/` so the contract a given plugin version was built against is available on the system.

## Licence

GPL-3.0-or-later for everything in the repository. `LICENSE` holds the text; `debian/copyright` is in machine-readable format; each source file carries `SPDX-License-Identifier: GPL-3.0-or-later`. Runtime dependencies must be compatible; the licence of each is checked when it is added (UI-11). Fonts shipped in the package (Inter, a monospace face) are under the SIL Open Font License and are listed in `debian/copyright`.
