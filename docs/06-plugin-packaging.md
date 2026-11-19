# 06 — Plugin packaging

## Package

| Field | Value |
|-------|-------|
| Source and binary package | `openmediavault-webui` |
| Short description | "A new web interface for openmediavault" |
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
/etc/nginx/openmediavault-webgui.d/openmediavault-webui.conf     root:root 0644
/usr/share/openmediavault/workbench/navigation.d/webui.yaml      link in the stock interface
/usr/share/doc/openmediavault-webui/                             README, licence, changelog
```

No daemon, no system user, no datamodel, no backend service, no Salt state, no configuration database entry. Version 1 has no settings.

The files are deliberately **not** placed inside `/var/www/openmediavault/`, which belongs to the `openmediavault` package and is rebuilt by its tooling.

## nginx snippet

OMV's site includes `/etc/nginx/openmediavault-webgui.d/*.conf` inside its server block. The plugin adds one file:

```nginx
# openmediavault-webui: serve the new interface at /ui/.
location = /ui { return 301 /ui/; }

location ^~ /ui/ {
    alias /var/www/openmediavault-webui/;
    index index.html;
    try_files $uri $uri/ /ui/index.html;

    # Security headers for the interface (rule UI-1). Set here in full, because add_header
    # in a location replaces the headers inherited from the server block.
    add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
    add_header Cache-Control "no-cache" always;

    location ~* ^/ui/assets/ {
        alias /var/www/openmediavault-webui/assets/;   # see note on alias with regex
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        # repeat the security headers above
    }
}
```

This is a starting point to be proven on a test system in Phase 0 (`A1`), not copied on faith. Points to verify and settle there:

- `^~` makes this prefix location win over the stock regular-expression locations (the one that adds OMV's own headers to `index.html` and the PHP one), so the stricter policy applies and nothing under `/ui/` is ever passed to PHP.
- `alias` combined with `try_files` and with a nested regular-expression location has known pitfalls. If they bite, use `root` with a directory layout that puts the files under a `ui/` directory instead. Record the final snippet in this document.
- If OMV sets `Strict-Transport-Security` in its server-level headers, repeat it here so `/ui/` does not lose it.
- The stock site's handling of unknown paths (`error_page 404`) must not interfere with deep links under `/ui/`.

The snippet contains no variable taken from the request and no proxying.

## Link in the stock interface

A navigation entry in the stock interface's manifest format adds "New web interface" to its menu, pointing to `/ui/`. `A5` confirms how a navigation entry can link outside the stock application's own routes; if it cannot, a small dashboard notice or a line in the plugin's description is used instead. The new interface has a matching "Open the classic interface" link to `/`.

## Maintainer scripts

`postinst configure`:

1. `dpkg-trigger update-workbench` (so the stock interface picks up the navigation entry), as other OMV plugins do.
2. `nginx -t`; only if it passes, reload nginx. If it fails, remove the snippet, reload, and exit with a clear error. A broken snippet must never take OMV's own interface down.

`postrm remove|purge`: remove the snippet (dpkg removes the file), `nginx -t`, reload nginx, trigger the workbench update.

No `omv-salt` run, no engined restart.

## Upgrade, removal, failure

- **Upgrade:** files are replaced; `index.html` is served with `no-cache` and assets have content-hashed names, so browsers pick up the new build on next load. A tab left open on the old build keeps working until reloaded; if a call fails in a way that suggests a version mismatch, the interface offers a reload.
- **OMV upgrade:** the plugin owns no file of another package. OMV re-rendering its nginx site does not touch the include directory. Before declaring support for a new OMV release, run `tools/contract-drift` and the integration suite against it.
- **Removal:** leaves no file, user or nginx rule behind. The stock interface is as it was.
- **Backend unavailable:** the interface shows a "cannot reach the NAS" state and retries reads.

## Separation for other interface builders

`spec-api-omv`, `ts-api-omv` and `react-api-omv` are independent of the application (D12). They are not published to a registry in version 1; the bundled `openapi.json` is included in `/usr/share/doc/openmediavault-webui/` so the contract a given plugin version was built against is available on the system.

## Licence

GPL-3.0-or-later for everything in the repository. `LICENSE` holds the text; `debian/copyright` is in machine-readable format; each source file carries `SPDX-License-Identifier: GPL-3.0-or-later`. Runtime dependencies must be compatible; the licence of each is checked when it is added (UI-11). Fonts shipped in the package (Inter, a monospace face) are under the SIL Open Font License and are listed in `debian/copyright`.
