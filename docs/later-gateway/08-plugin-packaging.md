# 08 — Plugin packaging

How the interface and its gateway are delivered as one openmediavault plugin, without modifying openmediavault.

The package is `openmediavault-webui`. Internal identifiers (the daemon, its system user and group, unit names, directories, the `conf.service.gateway` datamodel) keep the name `gateway`. This is deliberate: OMV's own web account is called `openmediavault-webgui`, and a system user named `openmediavault-webui` beside it would invite exactly the group mix-up SR-ISO-2 forbids. Nothing a user reads says "gateway": the plugin list, the settings page title ("New web interface") and the documentation all describe the interface.

## Package

| Field | Value |
|-------|-------|
| Source / binary package | `openmediavault-webui`. One package containing the interface and the gateway; never split |
| Short description | "A new web interface for openmediavault" |
| Architecture | `any` (the gateway is a compiled binary); built for `amd64`, `arm64`, `armhf` |
| Depends | `openmediavault (>= 8.6)`, `nginx`, `${shlibs:Depends}`, `${misc:Depends}` |
| Build-Depends | `debhelper-compat (= 13)`, `golang-go (>= <pinned>)`; the web bundle is built before packaging and shipped as files, so the package build needs no Node toolchain and no network |
| Version | `8.<minor>.<patch>`; major follows OMV's major |
| Plugin section | `XB-Plugin-Section: system` |

The Go module is vendored. The package build runs offline.

## Files installed

```
/usr/sbin/omv-gatewayd                                        0755 root:root
/usr/share/openmediavault-gateway/contract.d/                 0755 root:root   (fragments from other packages)
/var/www/openmediavault-gateway/                              0755 root:root   static interface, files 0644
/lib/systemd/system/openmediavault-gateway.service
/lib/systemd/system/openmediavault-gateway.socket
/usr/share/openmediavault/datamodels/conf.service.gateway.json
/usr/share/openmediavault/datamodels/rpc.gateway.json
/usr/share/openmediavault/engined/rpc/gateway.inc
/usr/share/openmediavault/engined/module/gateway.inc
/usr/share/openmediavault/confdb/create.d/conf.service.gateway.sh
/usr/share/openmediavault/workbench/{component.d,route.d,navigation.d}/…   settings page in the legacy workbench
/srv/salt/omv/deploy/gateway/                                 Salt states and templates
```

Created at deploy time by Salt:

```
/etc/openmediavault-gateway/config.json                       0640 root:openmediavault-gateway
/etc/nginx/sites-available/openmediavault-gateway             0644 root:root   (+ symlink in sites-enabled)
/etc/nginx/openmediavault-webgui.d/90-gateway-lockdown.conf   only when legacy lockdown is on
```

Created at run time by systemd:

```
/run/openmediavault-gateway/http.sock                         0660 root:www-data
/var/spool/openmediavault-gateway/                            0750 openmediavault-gateway:root   (uploads; only if an upload operation ships)
```

## Users and groups

`postinst` on first install:

```sh
adduser --system --group --no-create-home --home /nonexistent \
        --shell /usr/sbin/nologin openmediavault-gateway
adduser openmediavault-gateway openmediavault-engined
```

Nothing else. In particular **not** `openmediavault-config` (that group reads `config.xml`), not `openmediavault-webgui`, not `www-data` (SR-ISO-1..2). The package's self-check (`C` verifications in [04](04-security-requirements.md)) inspects `id openmediavault-gateway` and fails the install test if the set differs.

`postrm purge` removes the user, the configuration directory and the nginx site, and re-runs the nginx deploy so the stock site is as it was.

## systemd unit

`openmediavault-gateway.socket`:

```ini
[Socket]
ListenStream=/run/openmediavault-gateway/http.sock
SocketMode=0660
SocketUser=root
SocketGroup=www-data
RuntimeDirectory=openmediavault-gateway
RuntimeDirectoryMode=0755
Backlog=128

[Install]
WantedBy=sockets.target
```

`openmediavault-gateway.service`:

```ini
[Unit]
Description=openmediavault API gateway
Requires=openmediavault-gateway.socket
After=openmediavault-engined.service
Wants=openmediavault-engined.service

[Service]
Type=notify
ExecStart=/usr/sbin/omv-gatewayd --config /etc/openmediavault-gateway/config.json
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=2

User=openmediavault-gateway
Group=openmediavault-gateway
SupplementaryGroups=openmediavault-engined
UMask=0077

# No network at all: nginx reaches us through the passed socket, we reach engined through a path socket.
PrivateNetwork=yes
RestrictAddressFamilies=AF_UNIX
IPAddressDeny=any

# File system: read-only everything, see only what is needed.
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectProc=invisible
ProcSubset=pid
TemporaryFileSystem=/var/lib:ro /etc:ro
BindReadOnlyPaths=/var/lib/openmediavault/engined.sock
BindReadOnlyPaths=/etc/openmediavault-gateway
BindReadOnlyPaths=/usr/share/openmediavault-gateway
BindReadOnlyPaths=/etc/ssl/certs /etc/resolv.conf /etc/nsswitch.conf /etc/passwd /etc/group
InaccessiblePaths=-/etc/openmediavault -/etc/shadow -/etc/ssl/private -/root -/srv -/media -/mnt

# Privileges.
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictNamespaces=yes
RestrictRealtime=yes
RemoveIPC=yes
KeyringMode=private
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources @mount @debug @cpu-emulation @obsolete @raw-io @reboot @swap
SystemCallErrorNumber=EPERM

# Resources.
MemoryMax=256M
TasksMax=64
LimitNOFILE=1024
LimitCORE=0

[Install]
WantedBy=multi-user.target
```

Notes for the implementer:

- This unit is a starting point to be proven on a test system, not copied on faith. Several lines interact (`TemporaryFileSystem=` over `/etc` and `/var/lib` with selective binds; a unix socket bound read-only must still be connectable; `PrivateTmp=yes` hides the system temporary directory, which matters for file-mode downloads). Phase 4 has a task to bring the unit up line by line and record what had to change and why. `A7` covers `PrivateNetwork` with a path socket.
- The target is `systemd-analyze security openmediavault-gateway` at 2.0 or lower (SR-ISO-5). The achieved score and the remaining exposures are recorded in this document when Phase 4 completes.
- `Type=notify`: the daemon signals readiness after the contract is loaded and the backend socket is found. A daemon that cannot load its contract exits non-zero and does not serve.
- If a file-mode download or an upload operation ships, the directories it needs are added as explicit `BindReadOnlyPaths=` / `ReadWritePaths=` lines, each with a comment naming the operation.

## nginx site

A dedicated server block. Template (Salt/Jinja) essentials:

```nginx
limit_req_zone  $binary_remote_addr zone=omvgw_api:1m rate=20r/s;
limit_conn_zone $binary_remote_addr zone=omvgw_conn:1m;

upstream omvgw { server unix:/run/openmediavault-gateway/http.sock; keepalive 8; }

server {
    listen {{ port }} ssl;
    listen [::]:{{ port }} ssl;          # when IPv6 is enabled
    http2 on;
    server_name {{ names | join(' ') }};
    server_tokens off;

    ssl_certificate     {{ cert }};
    ssl_certificate_key {{ key }};
    ssl_protocols TLSv1.2 TLSv1.3;
    # ciphers: Mozilla intermediate profile at release time

    root /var/www/openmediavault-gateway;
    index index.html;
    client_max_body_size 1m;
    client_body_timeout 10s;
    client_header_timeout 5s;
    large_client_header_buffers 4 8k;

    # Document and asset headers (SR-UI-1). 'always' so error pages carry them too.
    include /etc/nginx/snippets/openmediavault-gateway-headers.conf;

    location = /index.html { add_header Cache-Control "no-store" always; include …headers.conf; }
    location /assets/      { add_header Cache-Control "public, max-age=31536000, immutable" always; include …headers.conf; }
    location /             { try_files $uri /index.html; }

    location /api/ {
        limit_req  zone=omvgw_api burst=40 nodelay;
        limit_conn omvgw_conn 20;

        proxy_pass http://omvgw;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host              $http_host;
        proxy_set_header X-Real-IP         $remote_addr;      # overwrites any client value
        proxy_set_header X-Server-Addr     $server_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   "";                # not used; cleared
        proxy_set_header Forwarded         "";
        proxy_buffering off;                                  # event streams
        proxy_read_timeout 180s;
        proxy_hide_header X-Powered-By;
    }

    location ~ /\.  { return 404; }
}
```

- No `listen 80`. No redirect server (SR-TLS-1).
- The plugin's own `Strict-Transport-Security` line is rendered only when OMV's `conf.webadmin` has `forcesslonly` set (SR-TLS-3).
- The header snippet carries the CSP and companions of SR-UI-1 verbatim.
- nginx must keep reading the certificate OMV manages; the Salt state resolves the selected certificate reference to OMV's certificate paths the same way the stock site template does, and re-deploys when the certificate changes.

## Why not OMV's configured port

The new interface does not share the port OMV's own interface is configured on, by default. Two reasons:

1. **Same port means same origin.** Browsers isolate pages by scheme, host and port. On a shared port the stock interface and the new one could script each other, and the stock interface has known places where untrusted content can become script (review IDs `M11`, `M12`). That would let a flaw in the old interface drive the new one, session and all (D6, SR-ISO-6).
2. **OMV's configured port is plain HTTP on a default install.** The new interface is HTTPS only (SR-TLS-1).

**Replace mode (planned, to verify).** Once an administrator no longer wants the stock interface, the new one can take over OMV's configured HTTPS port, so there is a single address and nothing extra to remember. This is safe because in that mode the stock pages are no longer served on that origin (it implies `legacylockdown: full`). It requires OMV to have HTTPS enabled. Whether a plugin can do this cleanly through the stock server block's include directory, without editing OMV's site file, is assumption `A15` in [09](09-implementation-plan.md#phase-0--verify-the-ground). Until that is verified, the separate port is the only mode.

## Settings (OMV side)

Datamodel `conf.service.gateway`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enable` | boolean | `false` | Enabling requires `sslcertificateref` |
| `port` | integer 1024–65535 | `8443` | Must differ from OMV's own ports while the stock interface is served; see "Why not OMV's configured port" below |
| `uiroot` | path | `/var/www/openmediavault-gateway` | Directory of the interface's static files; changing it is `elevated` |
| `sslcertificateref` | uuid | empty | A certificate from OMV's store. The settings page has a "Create and use a self-signed certificate" button that calls OMV's own certificate creation and fills this field, so a first-time user needs no detour |
| `hostnames` | list of host names | empty | Extra names accepted in `Host`, in addition to the system host name, its FQDN and `<hostname>.local` |
| `idletimeout` | integer 1–60 (min) | `15` | |
| `sessionlifetime` | integer 1–24 (h) | `12` | |
| `stepupwindow` | integer 1–15 (min) | `5` | |
| `loginfailurecap` | integer 1–20 | `2` | See [05](05-authentication-and-sessions.md#rate-limiting); help text explains the PAM relationship |
| `loginfailurewindow` | integer 60–3600 (s) | `900` | |
| `maxconcurrency` | integer 2–32 | `8` | |
| `allowpluginuserops` | boolean | `false` | SR-CON-6 |
| `legacylockdown` | enum `off` \| `downloads` \| `nonpost` \| `full` | `off` | Below |

RPC service `Gateway` (in engined, admin-only, parameters validated): `get`, `set`, `getStatus` (unit state, loaded contract version, skipped fragments), `notifyLogin` (internal; sends the new-browser e-mail through OMV's notification mechanism). `set` marks the `gateway` module dirty; applying runs the Salt state.

A settings page is provided **in the legacy workbench** (YAML manifests), because that is where an administrator is when they first install the plugin. The same settings are later available in the new interface through the contract, as `elevated` operations.

The engined module `gateway.inc` participates in OMV's apply cycle: deploys `nginx` and `gateway` states, starts or stops the units, and listens for certificate and host-name changes so the site is re-rendered.

`config.json` for the daemon is rendered from these settings plus facts Salt knows: the gateway origin, the allowed host names, OMV's administrator account and group names, whether OMV forces HTTPS, the limits. It contains no secrets.

## Legacy lockdown

Off by default. Each stage adds rules to `/etc/nginx/openmediavault-webgui.d/90-gateway-lockdown.conf`, which the stock server block already includes. The file is removed when the stage is lowered, the plugin is disabled, or the package is removed.

| Stage | Effect on the stock interface | Closes (review ID class) | Breaks |
|-------|-------------------------------|--------------------------|--------|
| `off` | none | — | — |
| `downloads` | `download.php` answers 403 | `H2`; the download half of `H1` | Log download and performance graphs in the stock interface |
| `nonpost` | additionally, `rpc.php` answers 405 to anything but `POST` | the GET half of `H1` | Nothing known in the stock interface; `A9` verifies |
| `full` | additionally, `rpc.php` answers 403 and `/` serves a page pointing to the new interface | everything in the legacy web layer | The stock interface entirely, including the settings page above |

Requirements on the mechanism:

- nginx location precedence must be verified (`A9`): the rules use exact-match locations (`location = /download.php`), which take precedence over the stock regular-expression location for PHP files.
- `full` can only be set from the new interface (it would otherwise cut the branch the administrator is sitting on), is `elevated`, and the interface explains how to undo it from a shell: `omv-confdbadm` / an `omv-gateway-lockdown off` helper shipped by the package, which resets the setting and re-deploys.
- Lockdown is a mitigation, not a fix. The documentation shown beside the setting says what is still reachable at each stage.

## Upgrade, removal, failure

- **Upgrade:** `postinst` restarts the daemon; sessions are lost (acceptable; stated in release notes). Configuration migrations use OMV's `omv-confdbadm migrate` with a version check, as other plugins do.
- **OMV upgrade:** the plugin owns no file of another package and patches nothing, so there are no conffile conflicts. `tools/contract-drift` is run against each new OMV release before the plugin declares compatibility.
- **Removal:** stops and disables the units, removes the site and any lockdown file, re-deploys nginx. `purge` additionally removes the user and configuration.
- **Daemon down:** nginx answers 502 for `/api/`; the static interface shows a "service unavailable" state. The stock interface is unaffected (unless `full` lockdown is on, hence the shell helper).
- **Backend down:** the gateway answers 503 `backend_unavailable`; it does not exit.

## Separating the interface from the gateway

They ship as one package. The design keeps them separable, so that someone else can build a different interface on the same gateway, and so that the package could later be split without redesign.

- **The contract is the only interface between them.** The gateway contains nothing specific to this interface: no page knowledge, no view logic, no assumptions about routes. Anything the interface needs goes through a contract operation.
- **The contract is published.** The bundled `openapi.json` is installed at `/usr/share/openmediavault-gateway/openapi.json` and versioned ([07](07-api-contract.md#versioning)). An alternative interface generates its client from it.
- **The interface is a directory of static files.** The nginx site serves whatever is in the configured document root (`uiroot`, default `/var/www/openmediavault-gateway`). Another interface is another package that installs its files elsewhere and is selected in the settings.
- **The source tree keeps the boundary.** `gateway/` and `contract/` do not import or reference anything under `web/`. CI builds and tests the gateway without the `web/` workspace present.
- **The Debian source can produce two binary packages** from the same tree later (`openmediavault-webui-gateway` plus an interface package depending on it), with `openmediavault-webui` remaining as the name users install. Not done now.

What an alternative interface must accept, because the security model depends on it:

- It is served **from the gateway's own origin** as packaged static files. There is no cross-origin access and there never will be (SR-REQ-6), so an interface hosted elsewhere cannot work.
- It runs under the same Content Security Policy (SR-UI-1): no inline script, no third-party origins.
- It uses the session credential as specified in [05](05-authentication-and-sessions.md): cookie plus request token in `sessionStorage`.
- Installing one is an administrator decision with root-equivalent consequences, since its script runs with the administrator's session. The settings page says so where `uiroot` is chosen, and changing it is an `elevated` operation.

## Licence

GPL-3.0-or-later for everything in this repository: the gateway daemon, the web interface, the contract, and the OMV glue (RPC service, module, datamodels, Salt states, workbench manifests). The licence text is in `LICENSE`; each source file carries an SPDX identifier (`SPDX-License-Identifier: GPL-3.0-or-later`). Dependencies must be compatible with it, checked at each release with the dependency review (SR-SUP-1).
