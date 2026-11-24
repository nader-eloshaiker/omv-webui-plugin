# Security policy

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

Report it through GitHub's private vulnerability reporting:

1. Open this repository's **Security** tab and choose **Report a vulnerability**, or go straight to [the report form](https://github.com/nader-eloshaiker/omv-webui-plugin/security/advisories/new).
2. Describe the problem: what is affected (the interface, the package or the nginx rules), the version or commit, what an attacker could do, and how to see it happen.
3. Submit. You need only a GitHub account. No email address or other contact details are exchanged.

The report is visible only to you and the maintainer. The conversation about it, and the fix, stay in that private advisory until it is published.

## What happens next

1. The maintainer confirms the report and how serious it is in the advisory.
2. A fix is prepared in private and released.
3. The advisory is published with the fix. Where the problem affects a released version, a CVE ID is requested through GitHub, which assigns CVE IDs for advisories published on it, so the issue can be tracked in vulnerability databases.
4. You are credited in the advisory, unless you ask not to be.

There is no release yet. Problems in the current code are still welcome through the same form.

## Scope

In scope: the web interface this plugin ships and its packaging (the files it installs and the nginx rules it adds).

Out of scope here, report to the openmediavault project instead (see its `SECURITY.md`): `rpc.php`, `download.php`, session handling, `omv-engined` and its RPC services, the stock web interface, and other plugins.

## What this plugin does and does not change

The plugin is a new interface on OMV's existing backend endpoint and login. **It is exactly as secure as openmediavault's own web layer, and no more.** It cannot fix weaknesses in that layer. It is written so as not to add any: see [docs/05-security.md](docs/05-security.md).
