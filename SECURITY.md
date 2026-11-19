# Security policy

## Reporting a vulnerability

Report privately. Do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repository once it is published; until then, contact the maintainer directly.

## Scope

In scope: the web interface this plugin ships and its packaging (the files it installs and the nginx rules it adds).

Out of scope here, report to the openmediavault project instead (see its `SECURITY.md`): `rpc.php`, `download.php`, session handling, `omv-engined` and its RPC services, the stock web interface, and other plugins.

## What this plugin does and does not change

The plugin is a new interface on OMV's existing backend endpoint and login. **It is exactly as secure as openmediavault's own web layer, and no more.** It cannot fix weaknesses in that layer. It is written so as not to add any: see [docs/05-security.md](docs/05-security.md).
