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

OMV's site includes `/etc/nginx/openmediavault-webgui.d/*.conf` at the end of its server block. OMV's own `headers.conf` lives in the same directory and is applied at server level too. The plugin adds one file. This version passed `A1` on the test VM (see the journal, 2026-11-19); the browser load under it is still to be done with `A9`:

```nginx
# openmediavault-webui: serve the new interface at /ui/.
# Included inside OMV's server block. Every add_header set is complete, because add_header in a
# location replaces the ones inherited from the server block (OMV's own headers.conf).

location = /ui {
    absolute_redirect off;
    return 301 /ui/;
}

location ^~ /ui/ {
    alias /var/www/openmediavault-webui/;
    try_files $uri /ui/index.html;
    add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
    add_header Cache-Control "no-cache" always;

    location ^~ /ui/assets/ {
        try_files $uri =404;
        error_page 404 @openmediavault_webui_missing;
        add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
}

# A missing asset is a plain 404, not OMV's redirect to its own 404 page, and is never cached.
location @openmediavault_webui_missing {
    types { }
    default_type text/plain;
    add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "no-referrer" always;
        add_header Cross-Origin-Opener-Policy "same-origin" always;
        add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" always;
    add_header Cache-Control "no-store" always;
    return 404 "Not found\n";
}
```

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
