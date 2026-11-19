# Parked: a hardened API gateway

**Status: not being built.** Decided 2026-11-19; see [../01-decisions.md](../01-decisions.md#d1-the-interface-talks-to-rpcphp).

These documents are a complete design for replacing OMV's web layer (`rpc.php`, `download.php`, PHP sessions) with a Go daemon, `omv-gatewayd`, that talks to `omv-engined` directly and enforces a contract, its own sessions, request authenticity, rate limits and isolation. They were written before the decision to build the interface on `rpc.php` first.

They are kept because:

- The interface is built so that only its transport module knows about `rpc.php`. If the gateway is ever wanted, that module is replaced and the rest of the interface is unchanged.
- The threat model and the mapping of the private security review's findings remain the best description of what the current web layer does not protect against.

Read them as a self-contained set, in their numeric order. Their cross-references are to each other. Where they mention the package name, the port question, the licence or the repository layout, the current documents in `docs/` take precedence.

An implementer of the current plan needs nothing from this folder.
