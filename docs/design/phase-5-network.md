# Phase 5, network slice: the NAS's name, its interfaces, the firewall and the proxy: design

The network slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the NAS's
name and domain (Network > General), its network interfaces (a list, an interface's page, setting
up and changing a network port, Wi-Fi, bonds, VLANs and bridges, removing an interface's settings,
blinking a port's light so it can be found), the firewall (rules in plain words, adding, changing,
ordering and deleting them) and the proxy. Above all it designs the safeguard the owner asked for:
what this page does when a change can cut the browser, and the administrator with it, off from the
NAS (section 1).

**Status: agreed by the owner on 2026-11-23, P1–P19 as recommended (section 21), with P1 as A, B and E and P2's two IPv6 firewall methods cleared.** The methods the owner cleared on
2026-11-23 and the two network reads already in the contract (`getGeneralSettings`,
`enumerateDevicesList`) cover everything here except the IPv6 firewall rules, which need two more
methods (15.0). This slice can cut the administrator off from the NAS (an address changed or
mistyped, a port's settings removed, a Wi-Fi password wrong, a firewall rule that blocks this page),
cuts other computers off (a name changed, a port removed, a firewall rule), removes protection (a
firewall rule deleted) and handles stored secrets (the Wi-Fi password, the proxy passwords). Every
such point is in section 21, and nothing in this slice is built before the owner agrees.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-1, UI-3, UI-4, UI-6, UI-8 and UI-14 above all), the journal entries of 2026-11-20 (the UX
audit's answers: Q2 a flow refuses to start while other changes are pending, Q7 a link to the new
address after turning on HTTPS is allowed because nothing in it comes from a reply or a URL), of
2026-11-21 (destructive slices agreed before building; the interface enforces its own safeguards)
and of 2026-11-23 (the network methods cleared; stored network secrets removed from replies; the
keep-or-roll-back safeguard), the [UX audit](ux-audit.md) (the backend facts B1 to B4 and B11 in
its section 0, the job-runner rules R1 to R10 in 4.1, Flow E for the HTTPS precedent in 4.6, the
apply-model findings in 3.3), and the conventions of [phase-3-pages.md](phase-3-pages.md) (the
pending band, the set-up checklist), [phase-5-monitoring.md](phase-5-monitoring.md) (the dashboard's
network card, its words for a connection and a speed, 1.5), and
[phase-5-services.md](phase-5-services.md) (secrets removed from replies and typed again, values
set in the classic interface kept, refusals with no classic link round them, `ClientField`), each in
its section 0, which every page here reuses unchanged. Where this document and the style guide
disagree, the style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x tree): the `Network` and `Iptables` RPC services;
their `rpc.network`, `rpc.iptables` and `conf.system.network.*` datamodels and OMV's format checks
for host and domain names; the engine modules that listen to the network settings
(`systemd-networkd`, `hosts`, `hostname`, `avahi`, `halt`, `issue`, `collectd`, `postfix`, `samba`,
`apt`, `profile`, `iptables`) and the queued-job module `task`; the netplan, hosts, host-name and
firewall deploy templates and the queued job that switches an interface off when its settings are
removed; `Config.applyChanges` and `revertChanges`; the session's check of the signed-in computer's
address; the install-time import of the installer's network settings; `omv-firstaid`'s network and
backup modules; and the classic workbench's network pages. Two reads are already observed on the test
VM (the monitoring domain): `enumerateDevicesList` and `getGeneralSettings`. Anything marked
**[verify]** is checked on the mock and the VM, by capture, before it is relied on (section 18.2).
Anything marked **[owner]** needs the owner's answer before that part is built.

Every method used here is administrator-only (read from source: each checks the administrator role).
A normal user sees nothing new (section 14).

## Scope of this slice (recommended)

| Built here                                                                                                                                                                                                                     | Left to the classic interface, and why                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The name of this NAS** (Network > General): its name and its domain, with what changes for other computers                                                                                                                   | Nothing: the classic page has the same two fields                                                                                                                                         |
| **Network interfaces**: a list with which one this page uses, each one's connection and addresses; an interface's page (what it is doing now, how it is set up); **blink a port's light**                                      | The traffic counters as a chart (Diagnostics > Performance statistics stays in the classic interface)                                                                                     |
| **Set up or change a network port**: IPv4 and IPv6 each automatic, fixed or off; the router address; name servers and search domains; packet size; Wake-on-LAN; under Advanced the hardware address, route priority and a note | Nothing; every field of the classic form is here, the rare ones one click away                                                                                                            |
| **Wi-Fi**: join a network (name, security, password, frequency, hidden), with the same address settings                                                                                                                        | Nothing                                                                                                                                                                                   |
| **Bonds, VLANs and bridges**: make, change and remove them; three bond modes in plain words                                                                                                                                    | The other four bond modes (`balance-rr`, `balance-xor`, `broadcast`, `balance-tlb`) and the bond's timing settings (link checks, delays, transmit hash): shown as set, changed there (P3) |
| **Remove an interface's settings**                                                                                                                                                                                             | Nothing                                                                                                                                                                                   |
| **Firewall rules for IPv4** in plain words: add, change, order, delete; "Block everything else" with the two rules it needs first; **IPv6 rules** once 15.0 is cleared                                                         | A rule's other options, "every address except", and the port on the far side when it is not the one that matters: shown and kept, never written here (P10)                                |
| **Proxy**: the web, secure web and file-transfer proxies, each on or off with its address, port and sign-in                                                                                                                    | Nothing                                                                                                                                                                                   |
| **The safeguard** (section 1) for every change that can cut this page off, and a network-aware apply confirmation in the pending band                                                                                          | Nothing                                                                                                                                                                                   |

Not offered by OMV at all, so not here either: more than one address per interface and family, routes
other than one router per family, and a time-limited trial of new network settings (section 1.1).

The recommendation rests on what the earlier slices rested on: each action kept can be told in one
plain sentence, including what it costs, and the ones left out cannot be told without networking
knowledge (P3). Unlike the earlier slices, the classic interface is **not** a safer place for the
actions left out: it has no safeguard at all (UX audit 3.3). That is why the interface pages here
include the risky actions with their checks rather than sending the reader to the classic interface
for them.

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the four
async states, the settings-form rules, the pending mark, the shared catalogue), the monitoring
domain's (connection and speed words, background and foreground reads), the shares slice's (direction
controls made visible in names, refusals with no classic link round them) and the services slice's
(secrets removed from replies and typed again, values set in the classic interface kept until
replaced, `ClientField`'s address and network checks). This section adds only what is new.

### 0.1 The words

| OMV or networking term                              | The interface says                                                                                           | Introduced as (`network.term.*`)                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network interface (`conf.system.network.interface`) | **network interface**, then "interface"                                                                      | "A network interface is one way the NAS connects to a network: a network port with a cable, Wi-Fi, or one made from them (a bond, a VLAN or a bridge)."                                                             |
| `devicename`                                        | **its name**, as the NAS calls it                                                                            | "The NAS names each interface itself, such as enp2s0. The name stays the same unless the hardware changes."                                                                                                         |
| `type` `ethernet`                                   | **network port** (Ethernet)                                                                                  | "A socket for a network cable."                                                                                                                                                                                     |
| A device with no settings (no configuration object) | **not set up here**                                                                                          | "The NAS has this port, but it has no settings here. It gets no address, and the NAS cannot be reached through it."                                                                                                 |
| `link`, `speed`                                     | **Connected at 1 Gbit/s**, **Not connected** (the monitoring domain's 1.5.2 words)                           |                                                                                                                                                                                                                     |
| `method` `dhcp`                                     | **Automatic (DHCP)**                                                                                         | "The router gives the NAS its address. The address can change, though most routers keep giving the same one."                                                                                                       |
| `method` / `method6` `static`                       | **Fixed address**                                                                                            | "You choose the address. It never changes, and no other device on the network may use it."                                                                                                                          |
| `method` / `method6` `manual`                       | **Off**                                                                                                      | "The interface gets no address of this kind."                                                                                                                                                                       |
| `method6` `auto`                                    | **Automatic** (router announcements)                                                                         | "The NAS makes its own address from what the router announces. Most home networks with IPv6 use this."                                                                                                              |
| `method6` `dhcp`                                    | **Automatic (DHCPv6)**                                                                                       | "A DHCPv6 server on the network gives the NAS its address. Choose this only if your network has one."                                                                                                               |
| `netmask`, `netmask6`, `prefix`                     | **network size**, written `/24`                                                                              | "Which addresses are on the same local network as the NAS. /24 means the first three numbers belong to the network, as in 192.0.2.x: 256 addresses."                                                                |
| `gateway`, `gateway6`                               | **router address** (gateway)                                                                                 | "The router the NAS sends traffic through to reach other networks and the internet. It must be on the same network as the NAS."                                                                                     |
| `dnsnameservers`                                    | **name servers** (DNS)                                                                                       | "Name servers turn names such as example.org into addresses. The NAS uses them for updates, email notifications, its clock and copy jobs to named computers. They do not change how other computers find this NAS." |
| `dnssearch`                                         | **search domains**                                                                                           | "When the NAS looks up a short name, it also tries it with these endings, so backup can find backup.example.org."                                                                                                   |
| `mtu`                                               | **packet size** (MTU)                                                                                        | "The largest piece of data the NAS sends in one go, in bytes. Keep the standard size unless every device on this network uses larger (jumbo) packets."                                                              |
| `wol`                                               | **Wake-on-LAN**                                                                                              | "Lets another computer switch the NAS on through this port."                                                                                                                                                        |
| `altmacaddress`                                     | **hardware address** (MAC address)                                                                           | "The port's own address on the network. Changing it makes your router see a different device, so it may give the NAS a different address."                                                                          |
| `routemetric`, `routemetric6`                       | **route priority** (metric)                                                                                  | "When the NAS has more than one router address, it uses the one with the lower number first."                                                                                                                       |
| `type` `bond`                                       | **bond**                                                                                                     | "A bond makes two or more network ports work as one. If a cable or a switch port fails, the others carry on."                                                                                                       |
| `slaves` (bond, bridge)                             | **ports in the bond**, **interfaces in the bridge**                                                          |                                                                                                                                                                                                                     |
| `bondprimary`                                       | **main port**                                                                                                | "The port the bond uses while it works. The others take over if it fails."                                                                                                                                          |
| `type` `vlan`                                       | **VLAN**                                                                                                     | "A VLAN is a separate network that shares a cable with others, told apart by a number, its VLAN ID. Your switch must be set up with the same number."                                                               |
| `vlanrawdevice`                                     | **runs on**                                                                                                  |                                                                                                                                                                                                                     |
| `type` `bridge`                                     | **bridge**                                                                                                   | "A bridge joins interfaces into one network, like a small switch inside the NAS. It is mostly used to give virtual machines and containers their own place on your network."                                        |
| `type` `wifi`                                       | **Wi-Fi**                                                                                                    |                                                                                                                                                                                                                     |
| `wpassid`                                           | **network name**                                                                                             |                                                                                                                                                                                                                     |
| `wpapsk`                                            | **Wi-Fi password**                                                                                           |                                                                                                                                                                                                                     |
| `keymanagement` `psk` / `sae`                       | **WPA2-Personal** / **WPA3-Personal** (the router's own words)                                               |                                                                                                                                                                                                                     |
| `hidden`                                            | **hidden network**                                                                                           | "The network does not announce its name, so the NAS looks for it by name."                                                                                                                                          |
| `band`                                              | **frequency**: Automatic, 2.4 GHz, 5 GHz                                                                     |                                                                                                                                                                                                                     |
| `hostname`                                          | **name of this NAS**                                                                                         | "The name other computers use to find this NAS. Letters, digits and hyphens."                                                                                                                                       |
| `domainname`                                        | **domain**                                                                                                   | "The name of your network, written after the NAS's name, as in {{host}}.example.org. Leave it empty if your network has none."                                                                                      |
| Firewall (`iptables`)                               | **firewall**                                                                                                 | "The firewall decides which network traffic the NAS lets in and out. It checks its rules from the top and follows the first one that fits. Traffic that no rule fits is let through."                               |
| `chain` `INPUT` / `OUTPUT`                          | **Coming in** / **Going out**                                                                                |                                                                                                                                                                                                                     |
| `action` `ACCEPT`                                   | **Allow**                                                                                                    | "Let it through."                                                                                                                                                                                                   |
| `action` `REJECT`                                   | **Refuse**                                                                                                   | "Turn it away and tell the other computer, so it gives up at once."                                                                                                                                                 |
| `action` `DROP`                                     | **Ignore**                                                                                                   | "Turn it away without an answer. The other computer waits, then gives up."                                                                                                                                          |
| `action` `LOG`                                      | **Note in the log**                                                                                          | "Write a line in the system log, then carry on with the next rule."                                                                                                                                                 |
| `action` empty                                      | **Count only**                                                                                               | "Do nothing, and carry on with the next rule."                                                                                                                                                                      |
| `source`, `destination`                             | **from**, **to**                                                                                             |                                                                                                                                                                                                                     |
| `sport`, `dport`                                    | **port** ("port 22", "ports 1024 to 65535")                                                                  | "A port is a numbered door into a computer; each service has its own, such as 22 for SSH."                                                                                                                          |
| `protocol`                                          | **kind of traffic**: TCP, UDP, ping (ICMP), any kind; "not TCP" and the like as set in the classic interface |                                                                                                                                                                                                                     |
| `extraoptions` (a rule)                             | **other options**                                                                                            | "Options set in the classic interface. They are kept as they are."                                                                                                                                                  |
| Proxy (`conf.system.network.proxy`)                 | **proxy**                                                                                                    | "A proxy is a computer that fetches web pages and files for the NAS. You need one only when your network requires it."                                                                                              |
| `identify`                                          | **blink its light**                                                                                          | "The light beside the port's socket blinks, so you can find the right cable."                                                                                                                                       |

Each intro's key is `network.term.` and the OMV field or type it explains (`network.term.gateway`,
`network.term.bond`, `network.term.mtu`); the general terms are `network.term.interface`,
`network.term.hostname`, `network.term.domain`, `network.term.firewall` and `network.term.proxy`.

"Interface" in the sense of this web interface never appears on these pages; they say "this page".
"netplan", "networkd", "iptables", "chain", "SLAAC", "LACP" and "MTU" appear only in technical places
(the server's own messages, task output) and, where the classic interface's word helps someone find
the same setting there, once in brackets.

### 0.2 Formatting

| What                                       | Rule                                                                                                                                                                                                                           | Example                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| An interface (`{{iface}}`)                 | Its name in `Identifier` (mono), its kind as a word after it in `muted-foreground`; in sentences the name alone, isolated (`dir="ltr"`, `<bdi>`)                                                                               | `enp2s0` Network port          |
| An IPv4 address and its network size       | `Identifier`, address then `/` and the prefix length                                                                                                                                                                           | `192.0.2.10/24`                |
| A network                                  | Its first address and size, with the count in words after it (the services slice's 0.2 count)                                                                                                                                  | `192.0.2.0/24` (256 addresses) |
| An IPv6 address                            | Its shortest form (RFC 5952), `Identifier`, `/64` after it; a link-local address (`fe80::`) is labelled "(this network only)"                                                                                                  | `2001:db8::10/64`              |
| A hardware address                         | Lower case, colons, `Identifier`                                                                                                                                                                                               | `00:00:5e:00:53:01`            |
| Speed                                      | The monitoring domain's rule                                                                                                                                                                                                   | "Connected at 1 Gbit/s"        |
| Packet size                                | "{{n}} bytes", tabular; `mtu` 0 is "Standard", followed by what the port uses now                                                                                                                                              | "Standard (now 1500 bytes)"    |
| Name servers, search domains               | A list, one per line, each in `Identifier`                                                                                                                                                                                     |                                |
| A web address of this page (`{{pageUrl}}`) | Built in the browser: the scheme and port of the address this page was opened at, the host given, and `/ui/`; an IPv6 address in brackets. Shown as text in `Identifier` with `CopyButton`; a link only where 1.6 says so (P7) | `http://192.0.2.20/ui/`        |
| Ports                                      | "port {{n}}", "ports {{from}} to {{to}}", tabular                                                                                                                                                                              | "port 445"                     |
| Durations                                  | "{{n}} seconds", "{{n}} minutes"                                                                                                                                                                                               |                                |

### 0.3 States in this slice

**Network interfaces have no status pill** (the monitoring domain's D8): an unplugged second port is
normal, and the reader is by definition connected through some interface. What an interface is doing
is said in words with a neutral icon of its own shape:

| Reading                                                                                                         | Words                                                           | Mark                                                               |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `link` true                                                                                                     | "Connected at {{speed}}", or "Connected" when the speed is `-1` | lucide `Cable`                                                     |
| `link` false                                                                                                    | "Not connected"                                                 | lucide `Unplug`                                                    |
| A member of a bond or bridge (`_readonly`, or named in another interface's `slaves`)                            | "Part of {{parent}}" with a router link                         | lucide `Link`                                                      |
| A device with no settings                                                                                       | "Not set up here"                                               | lucide `CircleDashed`, neutral                                     |
| Settings saved this session and not applied, or the settings differ from what the interface uses now (0.4, 1.8) | "Not applied yet"                                               | the pending mark                                                   |
| A read failed                                                                                                   | "Could not read this interface."                                | the Unknown ring with the word Unknown, as the monitoring domain's |

`state` (the kernel's word) is shown on an interface's page only, as a fact: `UP` "Working", `DOWN`
"Switched off", `LOWERLAYERDOWN` "Waiting for the interfaces it runs on", `DORMANT` "Waiting (for
example, to join a Wi-Fi network)", `NOTPRESENT` "The hardware is missing", `TESTING` "Being tested",
`UNKNOWN` "Not reported", anything else as received in `Identifier`.

**Settings and what is in effect are both shown** when they differ: "Set up: Fixed address
192.0.2.20/24" and below it "In use now: 192.0.2.10/24" with "Not applied yet" (4.2). Nothing claims
a setting is in effect because it was saved.

**Firewall rules and the proxy** are settings, not statuses: no pills. The firewall's check of this
page (11.5) is a fact in words with the warning-shape neutral `InlineAlert` where it finds a block.

### 0.4 Which connection this page uses

The heart of the safeguard. The page works out, in the browser, which network interface and which
address it reaches the NAS through, from three things it already has: the address it was opened at
(`location.hostname`, `location.port`, `location.protocol`), the interfaces and the addresses they use
now (`Network.enumerateDevicesList`), and the NAS's name (`Network.getGeneralSettings`). No cleared
method says which address the browser came from, and the browser cannot learn its own address
(read from source; section 1.1), so the page never claims more than these three things show.

| The page was opened at                                                                                                                                                                              | It concludes                                             | The connection line (`network.connection.*`)                                                                                                                               | What counts as "this page's interface"                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| An IPv4 or IPv6 address that an interface uses now (`address` or `address6` of a row)                                                                                                               | **Known**: that interface, that address, that family     | "This page reaches the NAS at {{address}} through {{iface}}."                                                                                                              | That interface and everything under it (below)                                    |
| The NAS's name: `{{hostname}}`, `{{hostname}}.{{domain}}` or `{{hostname}}.local`, without regard to case, with exactly one interface (not loopback, not virtual, not a member) that has an address | **Probably known**: that interface; either family        | "This page reaches the NAS by its name, {{host}}, most likely through {{iface}}."                                                                                          | As for Known, and the NAS's name                                                  |
| The NAS's name, with several interfaces that have addresses                                                                                                                                         | **Name only**                                            | "This page reaches the NAS by its name, {{host}}. It cannot tell through which interface."                                                                                 | Every interface, and the NAS's name                                               |
| An address that no interface reports (a router passing it on, a VPN, a second address the NAS does not report)                                                                                      | **Not known**                                            | "This page reaches the NAS at {{host}}. No interface of the NAS reports that address, so this page cannot tell which one it uses. A router or a VPN may be passing it on." | Every interface                                                                   |
| Any other name (a name your router or another server gives the NAS, a VPN's name)                                                                                                                   | **Not known**, by name                                   | "This page reaches the NAS as {{host}}. It cannot tell through which interface."                                                                                           | Every interface                                                                   |
| `localhost`, `127.0.0.1`, `::1`                                                                                                                                                                     | **Not known** (a tunnel, or a browser on the NAS itself) | "This page reaches the NAS through a tunnel or on the NAS itself. It cannot tell which interface the tunnel uses."                                                         | Every interface                                                                   |
| An address of an interface this NAS has no settings for (a VPN's or a container's, type `virtual` or not set up here)                                                                               | **Known**, outside the network settings                  | "This page reaches the NAS at {{address}} through {{iface}}, which the network settings here do not manage."                                                               | That interface only; changes to the others are "Brief interruption" at most (0.5) |

- **Everything under an interface** counts with it: a VLAN's parent; a bond's ports; a bridge's
  interfaces, and the ports of a bond inside it. Removing or changing any of them changes the
  connection.
- **The family** is the address's: IPv4 for `192.0.2.10`, IPv6 for `[2001:db8::10]`. By name, both
  count, since the browser may use either.
- **The web ports** are this page's port (`location.port`, or 80 for `http:` and 443 for `https:`),
  and the web interface's other port from `WebGui.getSettings` (`port`, and `sslport` when HTTPS is
  on), since a redirect may pass through it. **The SSH port** is `SSH.get`'s `port` when SSH is on.
  The firewall check (11.5) uses them.
- **Read when**: on opening any network page; again immediately before every save of an interface,
  the name or the firewall; again when the apply confirmation opens; and after applying (1.5). A
  failed read makes the conclusion **Not known**, never Known.
- **OMV reports one address per interface and family** (read from source: the first global address,
  and for IPv6 the link-local one when there is no global one). A second address, or an IPv6 address
  the computer made for privacy, is not reported, so a page opened at it is "Not known" **[verify]**
  which IPv6 address `address6` reports when there are several.
- The connection line is a `role="status"` line at the top of the Interfaces page, the firewall page
  and every form that can change the connection, with lucide `Monitor` (neutral). It is a fact, not
  a warning.

### 0.5 What a change does to this page

Every change in this slice is put in one of five classes, by the rules of this table, before it is
saved and again before it is applied. The class decides the confirmation (section 1) and the words.

| Class (`network.impact.*`) | Words                                                                                             | Saved and applied                                                           | Confirmation               |
| -------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------- |
| **Not affected**           | "This page keeps working."                                                                        | Saved; applied from the band                                                | The band's                 |
| **Brief interruption**     | "This page may stop responding for a few seconds while the network restarts, then carries on."    | Saved; applied from the band, which waits for the NAS to answer again (1.8) | The band's, with this line |
| **Moves**                  | "This page stops working at {{old}}. The NAS will be at {{new}}."                                 | Through the change flow (1.4)                                               | Typed (1.4)                |
| **May cut**                | "If this setting is wrong, this page loses the NAS, and you need another way in to put it right." | Through the change flow                                                     | Typed                      |
| **Refused**                | The refusal's reason (0.8)                                                                        | Not saved                                                                   |                            |

| Change                                                                      | On this page's interface (0.4)                                                                                                                                                                                                                            | On another interface                                   | Notes                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| The name of this NAS                                                        | **Moves** when the page was opened by the old name; otherwise **Not affected**                                                                                                                                                                            |                                                        | Other computers that use the name are affected either way (2.3) |
| The domain                                                                  | **Moves** when the page was opened at `{{hostname}}.{{domain}}`; otherwise **Not affected**                                                                                                                                                               |                                                        |                                                                 |
| A fixed address changed (same family as the page)                           | **Moves**                                                                                                                                                                                                                                                 | **Brief interruption** **[verify]**                    |                                                                 |
| Automatic to fixed                                                          | **Moves** when the new address differs from the one in use; **Brief interruption** when it is the same                                                                                                                                                    | **Brief interruption**                                 |                                                                 |
| Fixed to automatic; a new hardware address                                  | **May cut** (the router chooses the new address, which this page cannot know)                                                                                                                                                                             | **Brief interruption**                                 |                                                                 |
| The page's family turned Off; both families Off                             | **Refused**                                                                                                                                                                                                                                               | Both Off: allowed, with its line (5.5)                 |                                                                 |
| The router address; the network size                                        | **May cut** (a computer on another network reaches the NAS through the router)                                                                                                                                                                            | **Brief interruption**                                 |                                                                 |
| Name servers, search domains, route priority, Wake-on-LAN, the note         | **Brief interruption**                                                                                                                                                                                                                                    | **Brief interruption**                                 | The page does not use the NAS's name servers (0.1)              |
| Packet size                                                                 | **May cut**                                                                                                                                                                                                                                               | **Brief interruption**                                 |                                                                 |
| Wi-Fi network name, password, security or frequency                         | **May cut** (a wrong password means the NAS cannot join)                                                                                                                                                                                                  | **Brief interruption**                                 |                                                                 |
| Settings removed                                                            | **Refused**                                                                                                                                                                                                                                               | **Brief interruption**, with what is lost (10)         |                                                                 |
| A VLAN added on it, or removed                                              | **Brief interruption**                                                                                                                                                                                                                                    | **Brief interruption**                                 |                                                                 |
| Made part of a new bond or bridge                                           | **Refused**                                                                                                                                                                                                                                               | allowed for ports with no settings of their own (7, 9) | OMV offers only ports with no settings (read from source)       |
| The other family's settings (IPv6 when the page uses IPv4, and the reverse) | **Brief interruption**                                                                                                                                                                                                                                    |                                                        |                                                                 |
| Firewall rules                                                              | by the check (11.5): blocks this page for every computer **Refused**; may block it for some computers **May cut**; does not block it **Not affected**                                                                                                     |                                                        | The firewall restarts without touching interfaces               |
| The proxy                                                                   | **Not affected**                                                                                                                                                                                                                                          |                                                        |                                                                 |
| Blink its light                                                             | the blink dialog's own line (4.4)                                                                                                                                                                                                                         | **Not affected**                                       |                                                                 |
| Anything, when the conclusion is **Name only** or **Not known**             | **May cut** for every interface change and every firewall change that blocks the web ports for anyone; **Not affected** for the proxy; a firewall list that blocks the web ports for every computer, whatever the NAS's address, stays **Refused** (11.5) |                                                        | Never **Refused** on a guess about the interface                |

When the page's interface is **Known, outside the network settings** (a VPN), interface changes are
**Brief interruption** at most, firewall changes are checked as usual.

### 0.6 Passwords in this slice

Read from source: the stored **Wi-Fi password** (`wpapsk`) is in the reply of every read and write of
an interface: `enumerateDevicesList`, `getInterfaceList`, `getInterface` (and its five aliases),
every `set…Iface`, `deleteInterface`; and in `enumerateDevices` and `enumerateConfiguredDevices`,
which are not used (15.3). The three **proxy passwords** are in `getProxy`'s reply (`httppassword`,
`httpspassword`, `ftppassword`) and `setProxy`'s (`http.password`, `https.password`,
`ftp.password`). Under UI-6 the interface must never hold them:

- **The transport removes them** before anything else sees the reply. Where the page says "Set", the
  field is replaced by whether it was set (`x-omv-presence`, built in the services slice); elsewhere
  it is removed (`x-omv-omit`). `enumerateDevicesList` already omits `data[].wpapsk`.
- **A save needs them again.** OMV's writes replace the whole object (B11), and these fields are
  required: `setWirelessIface` refuses a request without `wpapsk` and stores whatever it is sent, so
  an empty password replaces the stored one and the NAS then tries to join with no password (read
  from source) **[verify]**. `setProxy` likewise needs all three passwords. **There is no way to save
  a Wi-Fi interface or the proxy and keep a stored password this page does not have.** So:
  - every save of a Wi-Fi interface asks for the Wi-Fi password: "Type the Wi-Fi password to save.
    The NAS does not give it back to this page." (the same password, or a new one) (P8);
  - every save of the proxy asks, for each proxy that has a stored password, either for it again or
    to remove it (12.3) (P9).
- The fields are `SecretField`s: never pre-filled, masked with a deliberate reveal, cleared from form
  state after every request, never in a toast, the URL, a dialog, a log, the "Copy the current
  settings" text (1.4) or the task title (UI-6). A "Put back how it was" of a Wi-Fi change asks for
  the password again (1.7).

### 0.7 Pending changes in this slice

Read from source (the engine modules' listeners); every row **[verify]** by `dirtyModules` after each
call alone on the VM (18.2).

| Action                                               | Marks pending                                                                                                                                                                                          | Applied by                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| The name or the domain (`setGeneralSettings`)        | `systemd-networkd`, `hosts`, `hostname`, `avahi`, `postfix`, `samba`                                                                                                                                   | The band, or the change flow when it is **Moves** |
| An interface set up (`set…Iface`, new)               | `systemd-networkd`, `hosts`, `avahi`, `halt`, `issue`, `collectd`                                                                                                                                      | The band, or the change flow                      |
| An interface changed (`set…Iface`, existing)         | `systemd-networkd`, `hosts`, `avahi`, `halt`, `issue`                                                                                                                                                  | The band, or the change flow                      |
| An interface's settings removed (`deleteInterface`)  | `systemd-networkd`, `hosts`, `avahi`, `halt`, `issue`, `collectd`, and `task` (a queued job that switches the interface off and clears its addresses, run at apply before the network is set up again) | The band                                          |
| Firewall rules (`setRule`, `setRules`, `deleteRule`) | `iptables`                                                                                                                                                                                             | The band, or the change flow when **May cut**     |
| The proxy (`setProxy`)                               | `apt`, `profile`                                                                                                                                                                                       | The band                                          |
| Blink (`identify`)                                   | nothing: a task that acts at once                                                                                                                                                                      |                                                   |

The band's words already exist (`modules.*`): `systemd-networkd` "Network", `hosts` "Host names on
the network", `hostname` "Host name", `avahi` "Network discovery (Zeroconf)", `halt` "Shutdown",
`issue` "Console welcome message", `collectd` "Performance statistics", `postfix` "Email
notifications", `samba` "Windows and Mac sharing (SMB)", `apt` "Software packages", `profile`
"Command-line environment", `iptables` "Firewall", `task` "Queued system jobs".

**A queued job outlives Undo** (read from source, **[verify]**): removing an interface's settings
queues a job that switches the interface off. Undo (`Config.revertChangesBg`) brings the settings
back and clears the pending list, but does not remove the queued job, which then runs at the next
apply that includes `task` (another interface removed, or a shared folder change that queues a job of
its own), possibly long after, and switches the restored interface off. This design's answer is in
10.4 (P14).

**The pending mark** appears beside what this session saved since the last apply (the name card, an
interface's row and its settings card, a firewall rule, the proxy card), and beside an interface whose
settings differ from what it uses now, whoever saved them (4.2).

### 0.8 The interface's own refusals

OMV refuses a few things itself (read from source): a second interface of the same kind and name; a
bond or bridge port already in another bond or bridge; a bond in one of three modes without a main
port; a domain named `local`, `example`, `invalid` or `test`. It checks nothing else: not that an
address is an address, that the router address is on the interface's network, that two interfaces do
not share an address, that a VLAN's parent is not removed from under it, or that a firewall rule
blocks the page that saves it. Every refusal below is **also** the interface's own (journal,
2026-11-21), checked before the call and again just before it, and a refusal offers no classic link
that would do the same thing without the check (P18).

| Action                                                      | Refused when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Section |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Save the name                                               | Not 1 to 63 letters, digits and hyphens, or starting or ending with a hyphen; the domain is `local`, `example`, `invalid` or `test`, or not a domain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 2       |
| Save an interface's addresses                               | A fixed address that is not one, or is its network's first or last address (IPv4), or `0.0.0.0`, a loopback, multicast or link-local address; a network size of /0, or IPv4 /31 to /32 with a router address; a router address not on the interface's network, or the same as the NAS's address; an address another interface uses; a name server that is not an address; a search domain that is not a domain; a fixed IPv4 address with a router address and no name server (the classic form's rule); a packet size from 1 to 575 bytes, or under 1280 bytes while IPv6 is on, or over 9216 bytes; a hardware address that is a group address (odd first byte) or all zeros | 5       |
| Change this page's interface (0.4, Known or Probably known) | The page's family turned Off; both families turned Off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 5.5     |
| Remove an interface's settings                              | It is this page's interface or under it (0.4, Known or Probably known); a VLAN runs on it (remove the VLAN first); it is part of a bond or bridge (it has no settings of its own)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 10      |
| Make a bond or bridge                                       | A chosen interface is this page's interface or under it; has settings of its own; is part of another bond or bridge; a VLAN runs on it; a bond with no port; a bond's main port not among its ports                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 7, 9    |
| Add a VLAN                                                  | The ID is not 1 to 4094; that parent already has a VLAN with that ID                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 8       |
| Save a Wi-Fi interface                                      | The network name is empty or over 32 bytes; the password is not 8 to 63 characters (or 64 hexadecimal digits for WPA2-Personal) **[verify]** that WPA3-Personal networks in use accept the same lengths                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 6       |
| Save the firewall rules                                     | The rules would block this page for every computer (11.5); a port that is not a port or range; a port with a kind of traffic other than TCP or UDP; an address that is not one address, one network or one range                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 11      |
| Save the proxy                                              | An address that is not a computer's name or address; a port outside 1 to 65535; a stored password neither typed again nor removed (12.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 12      |
| Apply from the band                                         | A pending firewall rule set would block this page for every computer, or this page's interface has lost its settings or its family (1.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 1.8     |
| Any of them                                                 | An action on the same object is already running in this session; the object changed since the page read it; a read these rules need failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | all     |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message. "The page could not tell" is never read
as "safe": it makes the class **May cut** (0.5).

### 0.9 Writing back

OMV's writes here replace the whole object (B11); every field is required. Every write is **read,
change, write** (R4), the read made immediately before the write:

- **`setGeneralSettings`** sends `hostname` (in lower case: OMV sets the system name in lower case
  whatever it is sent, read from source) and `domainname` (empty allowed).
- **`set…Iface`, existing**: the object from `getInterface` with only the changed fields;
  `dnsnameservers` and `dnssearch` as `getInterface` returns them (comma-separated; OMV accepts commas
  and stores spaces), `slaves` as a list, `netmask6` an integer, `devicename` and `type`-specific
  fields as read. **New**: the type's fields below and the classic form's defaults for the rest:
  IPv4 Automatic (DHCP), IPv6 Off, `routemetric` 0, `netmask6` 64, `routemetric6` 1, `mtu` 0, `wol`
  false, `altmacaddress`, `comment`, `dnsnameservers` and `dnssearch` empty.
- **`setBondIface`** also sends `bondtransmithashpolicy`, which the method reads although its RPC
  datamodel does not name it (read from source) **[verify]** what happens without it: as read, or
  `layer2` for a new bond. A new bond gets `bondmiimon` 100 (the classic form's default: OMV's own
  stored default of 0 checks no link, so the bond would never notice a failed port **[verify]**),
  `bonddowndelay` and `bondupdelay` 0, and `devicename` empty (OMV chooses the next `bond` name).
- **`setVlanIface`** sends `vlanrawdevice` and `vlanid`; OMV names it `{{parent}}.{{id}}` itself.
- **`setBridgeIface`** sends `devicename` empty for a new bridge (OMV chooses the next `br` name).
- **`setWirelessIface`** sends `wpapsk` typed in this request, never one held (0.6).
- **`deleteInterface`** sends the `uuid` read for that interface.
- **`setRule`** (add, change one rule): a new rule with `rulenum` -1 (OMV adds it at the end; 11.4
  then moves it when asked), `family` `inet`, `extraoptions` empty or one of 11.6's two fixed values;
  a changed rule as `getRule` returned it with only the changed fields.
- **`setRules`** (a new order): the whole list from `getRules`, every field as read, `rulenum`
  renumbered 0 to n-1 in the new order. OMV replaces the list and gives every rule a new identifier
  (read from source), so nothing here keeps a rule's identifier across a reorder (D9).
- **`deleteRule`** sends the rule's `uuid`; the gap it leaves in the numbering is harmless (OMV sorts
  by number).
- **`setProxy`** sends all fifteen fields from `getProxy` with the changes, each password typed or
  empty (removed) (12.3).
- **A second administrator** saving the same object between the read and the write is not detected by
  OMV; the interface narrows the window and says nothing it cannot know. The change flow re-reads
  just before it saves and refuses when the object changed (1.4).

---

## 1. The safeguard: changes that can cut this page off

The owner asked for a keep-or-roll-back safeguard: apply a network change, and if the administrator
cannot confirm it works, go back to how it was. This section first says what OMV can and cannot do,
read from source, then lays out the options, then designs the recommended one (P1).

### 1.1 What OMV offers, and what it does not

| #   | Fact (read from source)                                                                                                                                                                                                                                           | What it means here                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Saving only writes the settings and marks modules pending; nothing reaches the system until `Config.applyChanges` (B1)                                                                                                                                            | A change can be read, checked and undone before it does anything                                                                                                      |
| N2  | Before apply, `Config.revertChangesBg` restores every pending setting from the copy OMV keeps (B4). It is global: it undoes everyone's pending changes                                                                                                            | Undo is complete only when nothing else was pending (R1)                                                                                                              |
| N3  | After a successful apply, OMV deletes that copy ("unlink revisions")                                                                                                                                                                                              | **Nothing in OMV can put the previous settings back after apply.** Only a client that remembers them and writes them again can                                        |
| N4  | Applying the network runs `netplan apply`, which sets up every interface the NAS has settings for at once. It does not use netplan's own `netplan try`, which waits for a confirmation and goes back by itself after two minutes                                  | The one mechanism that would give a true roll-back exists in the system but is not reachable: using it means changing OMV (AGENTS.md rule 4)                          |
| N5  | Applying the firewall restarts its service, which removes every rule (IPv4 and IPv6) and adds the stored ones in order. It sets no default: traffic no rule fits is let through. A rule that fails stops the rest from being added                                | A broken rule leaves the NAS more open, not less; a wrong rule takes effect at once                                                                                   |
| N6  | No cleared method waits and then acts. A task runs what it was started with and ends                                                                                                                                                                              | Nothing can be left running on the NAS to undo a change if the browser does not come back                                                                             |
| N7  | The applying task keeps running on the NAS when the browser loses it (R8)                                                                                                                                                                                         | A change applied from a page that is then cut off is still applied in full                                                                                            |
| N8  | This page may only talk to the address it was loaded from (UI-1: `connect-src 'self'`, `img-src 'self' data:`)                                                                                                                                                    | It cannot test whether the NAS answers at a new address                                                                                                               |
| N9  | The sign-in lives in a cookie for the address it was made at, and the NAS ties a session to the address of the computer that signed in                                                                                                                            | At a new address, or when this computer now reaches the NAS from another address (through a router or VPN), the administrator signs in again                          |
| N10 | No cleared method returns the address this computer comes from, and the browser cannot learn it                                                                                                                                                                   | The firewall check cannot know whether a rule for "computers on 203.0.113.0/24" includes this computer (11.5)                                                         |
| N11 | At the NAS itself, `omv-firstaid` has "Configure network interface": it deletes **every** interface's settings, sets up the one port chosen, and applies. It has no entry for the firewall. Stopping the firewall service removes every rule until the next start | The way back from a cut-off exists, but needs a screen and keyboard on the NAS (or the virtual machine's console), and costs any bond, VLAN, bridge or Wi-Fi settings |
| N12 | `omv-firstaid` also has "Restore configuration backup", which puts back the newest copy of the settings file it finds. After an apply, OMV has deleted its own copy (N3)                                                                                          | Whether a copy exists after a network apply is **[verify]** (18.2 #13); the design does not promise it                                                                |

**Conclusion: a real roll-back is not possible within this project's rules.** To put the old
settings back when the browser cannot reach the NAS, something must be running on the NAS that
waits and acts. OMV has nothing that does (N3, N4, N6); the plugin may add no daemon and no backend
method (docs/05, "What the plugin adds"); and the gateway that could is parked
([later-gateway](../later-gateway/README.md)). So this design **does not show a countdown, a "will go
back in 60 seconds" message, or a Keep button that implies the change would otherwise be undone.** It
makes a cut-off much less likely, tells the reader before applying what will happen and how to get
back, notices afterwards whether the page still reaches the NAS, and offers to put the old settings
back where that is possible: while this page can still reach the NAS.

### 1.2 The options (P1)

| Option                                                                                   | What it gives                                                                                                                                                                                                                                                                                                        | What it costs, and what it cannot do                                                                                                                                                                                                                                                                                                         | Verdict                                                                                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. Know the connection, check, confirm, watch** (1.3 to 1.8)                           | Knows which interface and address this page uses (0.4); refuses the obvious self-cuts (0.8); a typed confirmation that doubles as a typing check for a new address; the change applied on its own; a reconnect check afterwards; recovery steps shown before applying and again offline; "Copy the current settings" | Cannot undo a change that has cut the page off; cannot test a new address (N8); cannot know this computer's address (N10)                                                                                                                                                                                                                    | **Recommended**                                                                             |
| **B. A + "Put back how it was"** while the page still reaches the NAS (1.7)              | After a change that worked for this page but broke something else (a second port, the proxy, a rule that blocks a media player), one button writes the remembered settings and applies again                                                                                                                         | Helps only while this page can reach the NAS and is not reloaded; needs the Wi-Fi password typed again; refused if someone changed the same thing since                                                                                                                                                                                      | **Recommended, as part of A**                                                               |
| **C. A timed roll-back through a scheduled task**                                        | Before applying, a one-off scheduled task (`Cron.*`) is saved to write the old settings back and apply them two minutes later; if the page reaches the NAS again, it deletes the task                                                                                                                                | `Cron.*` is not cleared; it runs any command as the administrator of the NAS, so this page would write administrator commands with settings inside them; the task must itself be applied first and removed after (two more applies); cron's minute steps make the window imprecise; it is a backend in all but name, which docs/05 rules out | Not recommended                                                                             |
| **D. A real roll-back on the NAS** (the parked gateway, or a timer the package installs) | A true keep-or-go-back with a countdown, as `netplan try` does                                                                                                                                                                                                                                                       | A daemon or backend of the plugin's own: against docs/05 and the parked-gateway rule; the owner's decision alone                                                                                                                                                                                                                             | Not now                                                                                     |
| **E. Ask upstream** for a trial apply of the network (`netplan try`) and the firewall    | The right place for a roll-back: OMV knows what it applied                                                                                                                                                                                                                                                           | Not in this project's hands; years, perhaps never                                                                                                                                                                                                                                                                                            | **Recommended alongside A**, as a suggestion to upstream once the owner's disclosures allow |
| **F. Leave the connection's interface and the firewall to the classic interface**        | No risk taken by this interface                                                                                                                                                                                                                                                                                      | The classic interface has no safeguard at all (UX audit 3.3); the reader is more likely to be cut off there                                                                                                                                                                                                                                  | Not recommended                                                                             |

### 1.3 The recommended safeguard, in one view

1. **Know the connection** (0.4) on every network page, in words at the top.
2. **Classify every change** (0.5) before it is saved, and again from the server's state before it is
   applied.
3. **Refuse what is certain to cut this page off** (0.8), and say how to do it safely instead:
   "Connect this computer through another interface first, then change {{iface}} from there."
4. **Apply a change that moves or may cut the connection on its own**, through the change flow
   (1.4): it refuses to start while other changes are pending (R1, Q2), shows what changes and what
   it does to this page, offers the current settings to copy and the recovery steps to read **before**
   anything happens, and asks for a typed confirmation.
5. **Watch after applying** (1.5): wait for the NAS to answer at the address it should, for as long
   as that may take, and say plainly what happened.
6. **When the page cannot reach the NAS**, show the recovery card (1.6), which needs nothing from the
   NAS.
7. **When it can**, offer "Keep the new settings" and "Put back how it was" (1.7), and say that
   nothing goes back by itself.
8. **Everything else** is saved to the band as usual, and the band's apply confirmation runs the same
   check from the server's state, so a change saved elsewhere or before a reload is caught too (1.8).

### 1.4 The change flow

Opened by **Save** on any form whose change is **Moves** or **May cut** (0.5): the button reads
"Review the change…" instead of "Save" as soon as the form's values make it so, with the class's
words under it, so the reader sees before pressing that this is not an ordinary save. It runs in
place on the page it was opened from (an interface's page, the name page, the firewall page), as a
step view that replaces the form; Back returns to the form with its values. The route does not change
(R9), and the flow's state lives in memory only (UI-5, UI-13).

**Step 1, pre-flight (R1).** `System.getInformation`'s `dirtyModules` is read. If anything is
pending, `PreflightNotice`: "Other changes are waiting to be applied: {{modules}}. Apply or undo them
first, so that this change is applied on its own and can be undone on its own." with "Apply them
now" (the band's apply, with its own confirmation and watch) and "Undo them" (the band's Undo with
its confirmation). The flow continues when nothing is pending.

**Step 2, the summary.** `h2` "Review the change to {{object}}" (an interface's name, "the name of
this NAS" or "the firewall rules"):

1. The connection line (0.4).
2. **What changes**: a two-column table "Now" and "After", only the rows that change, plus, for an
   interface, its address rows whether they change or not. Values in `Identifier`. Under 640 px the
   two columns stack, "Now" first, each value labelled.
3. **What it does to this page**: the class's words (0.5) in the warning-shape neutral `InlineAlert`,
   then the specific line (1.9: `netChange.effect.*`), such as "This page stops working at
   192.0.2.10. Open the NAS at its new address afterwards: http://192.0.2.20/ui/".
4. **What it does to other computers**: one line per effect the change has (2.3, 5.6, 10.2, 11.5),
   such as "Windows computers that use \\\\{{old}} must use \\\\{{new}}."
5. **Before you apply**, a `Card` with three items, each with its own control:
   - "Keep a note of the current settings, in case you need to set them again by hand." with
     `CopyButton` "Copy the current settings" (plain text: the interface's name, how each family gets
     its address, the addresses with their sizes, the router addresses, the name servers, the search
     domains and the packet size; never a password).
   - "If this page cannot reach the NAS afterwards" as a `Disclosure` holding the recovery steps of
     1.6, so they can be read while the page still works.
   - "Nothing puts the old settings back by itself. If the NAS cannot be reached afterwards, the
     steps above are the way back."
6. **Confirmation (P6)**: a `TypeToConfirmField`:
   - when the change gives the NAS a new fixed address that this page will use: "Type the new
     address to confirm it: {{address}}". This is also a check: a mistyped address is the commonest
     way to lose a NAS, and typing it a second time catches it;
   - when it gives the NAS a new name this page uses: "Type the new name to confirm it: {{name}}";
   - otherwise: "Type the interface's name to confirm: {{iface}}" (for the firewall: "Type
     firewall to confirm").
7. Buttons: "Back" (neutral), "Cancel" (neutral, focused when the step opens) and **"Save and
   apply"** in the destructive form (style guide 5.4: it can cut access), unavailable until the typed
   text matches. Enter does not confirm.

**Step 3, the run.** `JobStepList` with three steps (R5):

| Step                   | Call                                                                                                                                                                  | Says while running                    | On failure (R6)                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Save the settings   | The read again (R4; refused with "{{object}} was changed since you opened it. Review the change again." when it differs from what the summary showed), then the write | "Saving…"                             | The server's message; "Try again"; nothing is pending from this flow                                                                                                     |
| 2. Apply the change    | R10's re-read, then `Config.applyChangesBg` with exactly this change's modules (0.7), followed by the task helper                                                     | "Applying… The network restarts now." | Applying failed with output: the R7 plan; "Try applying again" first; "Undo this change" (safe: R1 held) followed by R7's forced apply of the modules that were deployed |
| 3. Reach the NAS again | 1.5                                                                                                                                                                   | 1.5's words                           | 1.5's outcomes                                                                                                                                                           |

**Step 4, the result**: 1.5's outcome, then 1.7's choices when the page reaches the NAS.

**Refresh, a second tab, the session ending** (R8): the flow's memory is gone. If the apply had
started, it runs on to the end on the NAS (N7). On reopening, the Interfaces page reads the state as
always: pending changes are in the band (with 1.8's check), applied ones are simply the settings, and
no step re-runs by itself (UI-14). "Put back how it was" is no longer offered: the old settings were
only in that page's memory, and the note copied in step 2 is the way back.

### 1.5 After applying: the reconnect check

While the apply runs, the task helper follows its output. When the network restarts, its reads fail
with no reply (the transport's `network` kind). The flow does not call that a failure: it moves to
**"Waiting for the NAS to answer…"** and sends one small read (`System.getInformation`, as a
background read, `updatelastaccess: false`) every 2 seconds. No write is ever retried (UI-14).

| Expected (from 0.5)                                                                          | Waits for this page's address                                                  | When the NAS answers                                                                                                                                                                                         | When it does not within the time                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Brief interruption** (band, 1.8) and **May cut** with the same address                     | up to 60 seconds                                                               | Follows the apply task to its end with the handle it holds; then reads the interfaces again and checks this page's interface: "Connected again. This page reaches the NAS at {{address}} through {{iface}}." | The recovery card (1.6), variant **lost**                       |
| **May cut** with a new automatic address (fixed to automatic, a new hardware address, Wi-Fi) | up to 120 seconds at the old address (many routers give the same address back) | As above, or "The NAS kept the address {{address}}."                                                                                                                                                         | Recovery card, variant **unknown address**                      |
| **Moves** to a new address                                                                   | 30 seconds at the old address, to catch a change that did not take effect      | "The NAS still answers at {{old}}. The change may not have been applied." then reads the pending state: still pending, the apply's failure plan; nothing pending, the interfaces read again and shown        | The **moved** card (below): the expected outcome, not a failure |
| **Moves** to a new name                                                                      | up to 60 seconds by the old name (name caches may keep it working for a while) | As above, then the moved card's words for the name, since the old name will stop working                                                                                                                     | The moved card for the name                                     |

- **The moved card** (`role="status"`, not an error): "The NAS is now at {{newUrl}}." with the
  address as text and `CopyButton`, an `ExternalLink` "Open the NAS at its new address" (opens a new
  tab, so this page keeps its instructions; P7), and "You need to sign in again there. If it does not
  open within two minutes, follow these steps." with the recovery steps (1.6) below.
- **A sign-in needed** (a 401 after the NAS answers, N9): "The NAS answers, but this page needs you to
  sign in again." with "Sign in" (the app's own sign-in route; no address from anywhere else).
- **Counting** is shown as elapsed time ("Waiting for the NAS to answer… 18 seconds"), never as a
  countdown to anything. Under reduced motion, the indicator does not move (style guide 4.5).
- The wait can be left: "Stop waiting" shows the recovery card at once. Leaving the page stops the
  checks; the apply goes on (N7).

### 1.6 The recovery card

Shown when the page cannot reach the NAS, and inside the summary's `Disclosure` before applying. It
needs nothing from the NAS: its words and icons are in the main bundle (not in a catalogue file loaded
later), and the values it shows (the old and new addresses, the name, the interface) were read before
the apply. It is a `Card` with a warning-shape neutral icon (not red: nothing the NAS monitors has
failed; this page lost its way to it), `role="alert"` once when it first appears.

Variants and their first line:

- **lost**: "This page cannot reach the NAS since the change."
- **unknown address**: "The NAS may have been given a new address by your router, and this page
  cannot know it."
- **moved, and the new address does not open**: "The NAS does not open at its new address."

Then the steps, numbered, each shown only when it applies:

1. "Wait two minutes, then try again." with "Try again" (one read; no write).
2. **A new fixed address**: "Open the NAS at its new address: {{newUrl}}" (text, `CopyButton`, and
   the link of P7). "This computer must be on the same network as the new address. If you mistyped it,
   it may be on another network."
3. **An automatic address, or not known**: "Find the NAS's address: your router's list of connected
   devices shows it under the name {{hostname}}. On most computers you can also try {{localUrl}}."
   (`{{localUrl}}` is `http://{{hostname}}.local/ui/` as text with `CopyButton`, never a link: the
   name came from the NAS, UI-3.)
4. **A changed name**: "Open the NAS by its new name: {{newNameUrl}}, or at its address
   {{addressUrl}}." (the new name typed in this session may be a link, P7; the address read from the
   NAS is text.)
5. **A firewall change**: "If a firewall rule blocks this computer, use a computer the rules still
   let in, then change the rules."
6. **At the NAS itself**, always last: "If nothing else works, connect a screen and keyboard to the
   NAS (or open the virtual machine's console), sign in as root, and:"
   - for interface changes: "type omv-firstaid and choose Configure network interface. It replaces
     every network setting with the one port you set up there: bonds, VLANs, bridges and Wi-Fi
     settings are removed and must be made again."
   - for firewall changes: "type systemctl stop openmediavault-firewall. This removes every firewall
     rule until the NAS restarts or the next change is applied. Then open this page and change the
     rules."
     The commands are shown in `Identifier` (mono), not as copy buttons: they are typed at another
     machine.
7. "The note you copied before applying has the settings that worked." (when the summary's copy was
   used in this page).

### 1.7 Keep the new settings, or put back how it was

When the page reaches the NAS after a change applied by the flow, the result card says what is in
effect now, then:

"Check that what you need still works: other computers reaching the NAS, its shared folders,
anything that uses {{iface}}. Nothing puts the old settings back by itself."

- **"Keep the new settings"** (filled primary): dismisses the card and forgets the remembered
  settings. Nothing is sent: it only says the reader is done.
- **"Put back how it was…"** (neutral): opens a `ConfirmDialog`: title "Put back the previous
  settings of {{object}}?", body "The settings from before this change are saved and applied again.
  This page then checks it can still reach the NAS, as it did for this change." For a Wi-Fi interface
  the dialog has the Wi-Fi password field (0.6). Buttons "Cancel" (focused) and "Put back". It runs
  the flow's steps 1 to 4 with the remembered settings (no new typed confirmation: they are the
  settings this page was working with), and the same watch.

What "the remembered settings" are, held in memory only for this page (UI-13), never with a password:

| Change                                                             | Put back by                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| The name, the domain                                               | `setGeneralSettings` with the old values                     |
| An interface changed                                               | `set…Iface` with the object as it was read before the change |
| An interface set up                                                | `deleteInterface` of the new one                             |
| An interface's settings removed (only when it was not this page's) | `set…Iface` with the old object as new (a new identifier)    |
| Firewall rules                                                     | `setRules` with the old list in its old order                |

Put back is **unavailable**, with the reason beside it, when: the page was reloaded, signed out or
moved (the memory is gone; "The previous settings were only kept by the page you applied from. Use
the note you copied."); the object changed since this page wrote it ("{{object}} was changed since
this change. Change it by hand."); other changes are pending (R1, with the pre-flight's offer); the
change moved the page to a new address (this page is no longer the one connected).

### 1.8 The band's apply confirmation for network changes

The band's apply confirmation already warns in general terms when a network module is pending
(`pending.connectionWarning`). This slice replaces that line, whenever `systemd-networkd`, `hosts`,
`hostname` or `iptables` is pending, with the same check run **from the server's state**, because the
band applies whatever is pending, including changes saved in the classic interface, by another
administrator, or before a reload:

- **Interfaces**: the stored settings (`getInterfaceList`) are compared with what each interface uses
  now (`enumerateDevicesList`). For this page's interface: a stored fixed address different from the
  one in use is **Moves**; stored Off for the page's family, or no stored settings at all, is
  **Refused**; a stored automatic method while it now has an address, a stored packet size or
  hardware address different from the one in use, or a Wi-Fi interface pending, is **May cut**; any
  other pending network change is **Brief interruption**. When this page's interface is not known,
  any pending interface change is **May cut**.
- **The name**: the stored name (`getGeneralSettings`) is compared with the name this page was opened
  by.
- **Firewall**: the stored rules (`getRules`) are what the apply will put in place, so the check of
  11.5 runs on them.

The confirmation then says, under "What is applied", one line per finding with its class's words. It
escalates:

- **Brief interruption** or **Not affected**: the band's ordinary confirmation, with the line; on
  apply, the band's progress waits for the NAS as 1.5 does for 60 seconds instead of reporting the
  first failed read as a failure.
- **Moves** or **May cut**: the confirmation gains the summary's "Before you apply" items (1.4, 5)
  and the typed confirmation (1.4, 6), and its apply button takes the destructive form "Apply
  {{count}} changes". After apply, 1.5's watch and 1.6's card.
- **Refused**: "Apply" is unavailable with the reason ("The pending firewall rules would block this
  page for every computer." or "The pending settings leave {{iface}}, which this page uses, without
  an address."), a router link to where it can be changed, and "Undo {{count}} changes" offered. No
  classic link is offered (P18).

### 1.9 Copy

| Key                                 | English                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network.connection.known`          | This page reaches the NAS at <address></address> through <iface></iface>.                                                                                                                                                       |
| `network.connection.probable`       | This page reaches the NAS by its name, <host></host>, most likely through <iface></iface>.                                                                                                                                      |
| `network.connection.nameOnly`       | This page reaches the NAS by its name, <host></host>. It cannot tell through which interface.                                                                                                                                   |
| `network.connection.unknownAddress` | This page reaches the NAS at <host></host>. No interface of the NAS reports that address, so this page cannot tell which one it uses. A router or a VPN may be passing it on.                                                   |
| `network.connection.otherName`      | This page reaches the NAS as <host></host>. It cannot tell through which interface.                                                                                                                                             |
| `network.connection.tunnel`         | This page reaches the NAS through a tunnel or on the NAS itself. It cannot tell which interface the tunnel uses.                                                                                                                |
| `network.connection.unmanaged`      | This page reaches the NAS at <address></address> through <iface></iface>, which the network settings here do not manage.                                                                                                        |
| `network.connection.readFailed`     | This page could not read the NAS's interfaces, so it cannot tell which one it uses.                                                                                                                                             |
| `network.impact.none`               | This page keeps working.                                                                                                                                                                                                        |
| `network.impact.brief`              | This page may stop responding for a few seconds while the network restarts, then carries on.                                                                                                                                    |
| `network.impact.moves`              | This page stops working at <old></old>. The NAS will be at <new></new>.                                                                                                                                                         |
| `network.impact.mayCut`             | If this setting is wrong, this page loses the NAS, and you need another way in to put it right.                                                                                                                                 |
| `network.impact.otherWay`           | Connect this computer through another interface first, then change <iface></iface> from there.                                                                                                                                  |
| `netChange.review`                  | Review the change…                                                                                                                                                                                                              |
| `netChange.preflight`               | Other changes are waiting to be applied: <list></list>. Apply or undo them first, so that this change is applied on its own and can be undone on its own.                                                                       |
| `netChange.applyOthers`             | Apply them now                                                                                                                                                                                                                  |
| `netChange.undoOthers`              | Undo them                                                                                                                                                                                                                       |
| `netChange.title`                   | Review the change to <object></object>                                                                                                                                                                                          |
| `netChange.object.name`             | the name of this NAS                                                                                                                                                                                                            |
| `netChange.object.firewall`         | the firewall rules                                                                                                                                                                                                              |
| `netChange.now`                     | Now                                                                                                                                                                                                                             |
| `netChange.after`                   | After                                                                                                                                                                                                                           |
| `netChange.effectTitle`             | What it does to this page                                                                                                                                                                                                       |
| `netChange.effect.newAddress`       | This page stops working at <old></old>. Open the NAS at its new address afterwards: <new></new>                                                                                                                                 |
| `netChange.effect.newName`          | This page stops working at <old></old>. Open the NAS by its new name afterwards: <new></new>                                                                                                                                    |
| `netChange.effect.automatic`        | Your router chooses the NAS's new address, and this page cannot know it in advance. Many routers give the same address back.                                                                                                    |
| `netChange.effect.mtu`              | If any device on this network does not take packets of <size></size>, this page and other computers may lose the NAS.                                                                                                           |
| `netChange.effect.gateway`          | If this computer is on another network than the NAS, it reaches the NAS through the router. A wrong router address cuts it off.                                                                                                 |
| `netChange.effect.wifi`             | If the network name or password is wrong, the NAS cannot join the Wi-Fi network, and this page loses it.                                                                                                                        |
| `netChange.effect.firewall`         | The rules may block this page for some computers: <list></list>. This page cannot tell whether this computer is one of them.                                                                                                    |
| `netChange.othersTitle`             | What it does to other computers                                                                                                                                                                                                 |
| `netChange.beforeTitle`             | Before you apply                                                                                                                                                                                                                |
| `netChange.copyNote`                | Keep a note of the current settings, in case you need to set them again by hand.                                                                                                                                                |
| `netChange.copy`                    | Copy the current settings                                                                                                                                                                                                       |
| `netChange.copied`                  | Current settings copied.                                                                                                                                                                                                        |
| `netChange.recoveryOpen`            | If this page cannot reach the NAS afterwards                                                                                                                                                                                    |
| `netChange.noRollback`              | Nothing puts the old settings back by itself. If the NAS cannot be reached afterwards, the steps above are the way back.                                                                                                        |
| `netChange.typeAddress`             | Type the new address to confirm it: <value></value>                                                                                                                                                                             |
| `netChange.typeName`                | Type the new name to confirm it: <value></value>                                                                                                                                                                                |
| `netChange.typeIface`               | Type the interface's name to confirm: <value></value>                                                                                                                                                                           |
| `netChange.typeFirewall`            | Type firewall to confirm                                                                                                                                                                                                        |
| `netChange.back`                    | Back                                                                                                                                                                                                                            |
| `netChange.cancel`                  | Cancel                                                                                                                                                                                                                          |
| `netChange.confirm`                 | Save and apply                                                                                                                                                                                                                  |
| `netChange.step.save`               | Save the settings                                                                                                                                                                                                               |
| `netChange.step.apply`              | Apply the change                                                                                                                                                                                                                |
| `netChange.step.reach`              | Reach the NAS again                                                                                                                                                                                                             |
| `netChange.saving`                  | Saving…                                                                                                                                                                                                                         |
| `netChange.applying`                | Applying… The network restarts now.                                                                                                                                                                                             |
| `netChange.changedSince`            | <object></object> was changed since you opened it. Review the change again.                                                                                                                                                     |
| `netChange.undo`                    | Undo this change                                                                                                                                                                                                                |
| `netChange.waiting`                 | Waiting for the NAS to answer… <elapsed></elapsed>                                                                                                                                                                              |
| `netChange.stopWaiting`             | Stop waiting                                                                                                                                                                                                                    |
| `netChange.connectedAgain`          | Connected again. This page reaches the NAS at <address></address> through <iface></iface>.                                                                                                                                      |
| `netChange.keptAddress`             | The NAS kept the address <address></address>.                                                                                                                                                                                   |
| `netChange.stillOld`                | The NAS still answers at <old></old>. The change may not have been applied.                                                                                                                                                     |
| `netChange.moved`                   | The NAS is now at <new></new>.                                                                                                                                                                                                  |
| `netChange.openNew`                 | Open the NAS at its new address                                                                                                                                                                                                 |
| `netChange.signInThere`             | You need to sign in again there. If it does not open within two minutes, follow these steps.                                                                                                                                    |
| `netChange.signInAgain`             | The NAS answers, but this page needs you to sign in again.                                                                                                                                                                      |
| `netChange.signIn`                  | Sign in                                                                                                                                                                                                                         |
| `netChange.checkTitle`              | Check that what you need still works: other computers reaching the NAS, its shared folders, anything that uses <iface></iface>. Nothing puts the old settings back by itself.                                                   |
| `netChange.keep`                    | Keep the new settings                                                                                                                                                                                                           |
| `netChange.putBack`                 | Put back how it was…                                                                                                                                                                                                            |
| `netChange.putBackTitle`            | Put back the previous settings of <object></object>?                                                                                                                                                                            |
| `netChange.putBackBody`             | The settings from before this change are saved and applied again. This page then checks it can still reach the NAS, as it did for this change.                                                                                  |
| `netChange.putBackConfirm`          | Put back                                                                                                                                                                                                                        |
| `netChange.putBackGone`             | The previous settings were only kept by the page you applied from. Use the note you copied.                                                                                                                                     |
| `netChange.putBackChanged`          | <object></object> was changed since this change. Change it by hand.                                                                                                                                                             |
| `netChange.putBackMoved`            | This page no longer reaches the NAS at the address it changed.                                                                                                                                                                  |
| `netRecover.lost`                   | This page cannot reach the NAS since the change.                                                                                                                                                                                |
| `netRecover.unknownAddress`         | The NAS may have been given a new address by your router, and this page cannot know it.                                                                                                                                         |
| `netRecover.newFails`               | The NAS does not open at its new address.                                                                                                                                                                                       |
| `netRecover.wait`                   | Wait two minutes, then try again.                                                                                                                                                                                               |
| `netRecover.tryAgain`               | Try again                                                                                                                                                                                                                       |
| `netRecover.newAddress`             | Open the NAS at its new address: <url></url>                                                                                                                                                                                    |
| `netRecover.sameNetwork`            | This computer must be on the same network as the new address. If you mistyped it, it may be on another network.                                                                                                                 |
| `netRecover.find`                   | Find the NAS's address: your router's list of connected devices shows it under the name <name></name>. On most computers you can also try <url></url>.                                                                          |
| `netRecover.newName`                | Open the NAS by its new name: <url></url>, or at its address <address></address>.                                                                                                                                               |
| `netRecover.firewall`               | If a firewall rule blocks this computer, use a computer the rules still let in, then change the rules.                                                                                                                          |
| `netRecover.console`                | If nothing else works, connect a screen and keyboard to the NAS (or open the virtual machine's console), sign in as root, and:                                                                                                  |
| `netRecover.firstaid`               | type <command>omv-firstaid</command> and choose Configure network interface. It replaces every network setting with the one port you set up there: bonds, VLANs, bridges and Wi-Fi settings are removed and must be made again. |
| `netRecover.stopFirewall`           | type <command>systemctl stop openmediavault-firewall</command>. This removes every firewall rule until the NAS restarts or the next change is applied. Then open this page and change the rules.                                |
| `netRecover.note`                   | The note you copied before applying has the settings that worked.                                                                                                                                                               |
| `netApply.lineMoves`                | <iface></iface>: this page stops working at <old></old>; the NAS will be at <new></new>.                                                                                                                                        |
| `netApply.lineMayCut`               | <iface></iface>: if its settings are wrong, this page loses the NAS.                                                                                                                                                            |
| `netApply.lineBrief`                | Network: this page may stop responding for a few seconds.                                                                                                                                                                       |
| `netApply.lineFirewall`             | Firewall: the rules may block this page for some computers: <list></list>.                                                                                                                                                      |
| `netApply.refusedFirewall`          | The pending firewall rules would block this page for every computer.                                                                                                                                                            |
| `netApply.refusedIface`             | The pending settings leave <iface></iface>, which this page uses, without an address.                                                                                                                                           |
| `netApply.changeRules`              | Change the firewall rules                                                                                                                                                                                                       |
| `netApply.changeIface`              | Open <iface></iface>                                                                                                                                                                                                            |
| `netApply.confirm_one` / `_other`   | Apply {{count}} change / Apply {{count}} changes                                                                                                                                                                                |

---

## 2. Network > General: the name of this NAS

**Question it answers:** what is this NAS called on the network? **Leads to:** changing its name or
domain.

Route `/network/general`; the menu item "General" under Network gains the route (section 14).

### 2.1 Data

`Network.getGeneralSettings` (`hostname`, `domainname`), the connection (0.4). Refreshed on opening,
window focus and after a save. Before a save: `getGeneralSettings` again (R4).

### 2.2 Layout

1. Page title "Name of this NAS".
2. Intro: `network.term.hostname` (0.1).
3. The connection line, only when the page was opened by name (0.4).
4. **The name card** (one form, the settings-form rules of Phase 3):
   - **Name** (`TextField`, required, placeholder none, `autocomplete="off"`, `spellcheck=false`):
     hint "Letters, digits and hyphens, at most 63. Capital letters are saved as small letters."
   - **Domain** (`TextField`, optional): hint `network.term.domain`, and "If your network has no
     domain of its own, leave it empty or use internal, which is set aside for private networks."
   - Under the fields, `text-sm muted-foreground`, how others find it now (built from the stored
     values, as text in `Identifier`): "Other computers find this NAS as {{host}}, as {{host}}.local
     on most computers, and as \\\\{{host}} from Windows." and, with a domain, "and as
     {{host}}.{{domain}} where your network's name servers know it."
   - When the name or domain differs from the stored value, an "If you change it" list appears under
     the fields (2.3), and Save reads "Review the change…" when 0.5 says **Moves**.
   - Buttons: **Save** (filled primary) and "Discard changes".
5. Footer, `text-sm muted-foreground`: `ExternalLink` "Name in the classic interface" →
   `/#/network/general`.

### 2.3 What a new name changes

Shown as a list under the fields while the value differs, and repeated in the flow's "What it does to
other computers" (1.4):

- "Windows and Mac computers that open \\\\{{old}} or smb://{{old}} must use the new name."
- "Computers that reach shared folders over NFS, or copy files to or from this NAS, by its name must
  be changed to the new name."
- "Bookmarks to this NAS by its name stop working."
- "If this NAS has a certificate for its secure address (HTTPS) made for the old name, browsers warn
  that the certificate does not match." (only when `WebGui.getSettings` has HTTPS on)
- "Your router may keep showing the old name until the NAS next asks it for an address."
- For a changed domain only: "Names under the old domain, such as {{host}}.{{oldDomain}}, stop
  working."

The name that other computers use for Windows sharing is the first 15 characters of the name
**[verify]** (18.2 #3); a name longer than 15 characters adds: "Windows computers that use old-style
names see only the first 15 characters: {{short}}."

### 2.4 States

| State               | Look                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Loading             | Skeletons of the card's two fields; "Loading the name of this NAS…"                                                   |
| Read failed         | `EmptyState variant="error"`: "Could not read the name of this NAS." + server message + "Try again". No form          |
| Saving              | Save shows "Saving…", fields read-only                                                                                |
| Saved               | Toast "The new name is saved. It takes effect when you apply the changes." and the band; the pending mark on the card |
| Save refused by OMV | The server's message under the form, `aria-describedby` on the field it names                                         |
| Populated           | As 2.2                                                                                                                |

### 2.5 Keyboard

Tab order: the connection line's link (when shown), Name, Domain, the list (not focusable), Save,
Discard changes, the footer link. Errors move focus to the first field in error after a refused save.

### 2.6 Copy

| Key                             | English                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `netGeneral.title`              | Name of this NAS                                                                                                                       |
| `netGeneral.loading`            | Loading the name of this NAS…                                                                                                          |
| `netGeneral.loadFailed`         | Could not read the name of this NAS.                                                                                                   |
| `netGeneral.name`               | Name                                                                                                                                   |
| `netGeneral.nameHint`           | Letters, digits and hyphens, at most 63. Capital letters are saved as small letters.                                                   |
| `netGeneral.domain`             | Domain                                                                                                                                 |
| `netGeneral.domainHint`         | If your network has no domain of its own, leave it empty or use internal, which is set aside for private networks.                     |
| `netGeneral.foundAs`            | Other computers find this NAS as <host></host>, as <local></local> on most computers, and as <unc></unc> from Windows.                 |
| `netGeneral.foundAsDomain`      | It is also <fqdn></fqdn> where your network's name servers know it.                                                                    |
| `netGeneral.ifChanged`          | If you change it                                                                                                                       |
| `netGeneral.effect.smb`         | Windows and Mac computers that open <unc></unc> or <smb></smb> must use the new name.                                                  |
| `netGeneral.effect.nfs`         | Computers that reach shared folders over NFS, or copy files to or from this NAS, by its name must be changed to the new name.          |
| `netGeneral.effect.bookmarks`   | Bookmarks to this NAS by its name stop working.                                                                                        |
| `netGeneral.effect.certificate` | If this NAS has a certificate for its secure address (HTTPS) made for the old name, browsers warn that the certificate does not match. |
| `netGeneral.effect.router`      | Your router may keep showing the old name until the NAS next asks it for an address.                                                   |
| `netGeneral.effect.domain`      | Names under the old domain, such as <fqdn></fqdn>, stop working.                                                                       |
| `netGeneral.effect.short`       | Windows computers that use old-style names see only the first 15 characters: <short></short>.                                          |
| `netGeneral.save`               | Save                                                                                                                                   |
| `netGeneral.saving`             | Saving…                                                                                                                                |
| `netGeneral.discard`            | Discard changes                                                                                                                        |
| `netGeneral.saved`              | The new name is saved. It takes effect when you apply the changes.                                                                     |
| `netGeneral.err.name`           | Use 1 to 63 letters, digits and hyphens, not starting or ending with a hyphen.                                                         |
| `netGeneral.err.domain`         | Write a domain such as example.org: parts of letters, digits and hyphens, separated by dots.                                           |
| `netGeneral.err.local`          | local is used by the names computers find each other by (.local). Choose another, such as internal.                                    |
| `netGeneral.err.reserved`       | <value></value> is set aside and cannot be a domain.                                                                                   |
| `netGeneral.classicLink`        | Name in the classic interface                                                                                                          |

---

## 3. Network > Interfaces

**Question it answers:** how is the NAS connected, at which addresses, and which interface does this
page use? **Leads to:** an interface's page; setting up a port, Wi-Fi, a bond, a VLAN or a bridge.

Route `/network/interfaces`; the menu item "Interfaces" gains the route (section 14).

### 3.1 Data

`Network.enumerateDevicesList` (whole list: `start: 0, limit: -1`, the monitoring domain's call; what
each interface uses now, and for one with settings its stored fields), `Network.getInterfaceList`
(whole; the stored settings, with `wpapsk` replaced by whether it is set), `Network.getGeneralSettings`,
`System.getInformation` (the shell's: `dirtyModules`). Refreshed on opening, Refresh, window focus,
after a save and after an apply. Not polled: the dashboard's card is the live view.

### 3.2 Layout

1. Page title "Network interfaces". Intro: `network.term.interface` (0.1).
2. **The connection line** (0.4), `role="status"`.
3. **Attention lines**, worst first, each one line with a router link to the interface, only when they
   apply:
   - "{{iface}} is set up with a fixed address but has no address now." (stored static, no live
     address)
   - "{{iface}} is set up but not connected." (stored settings, `link` false; not shown for Wi-Fi
     that is off)
   - "{{iface}} has settings that are not applied yet." (stored differs from in use, 1.8's
     comparison), with the pending mark
   - "This page reaches the NAS through {{iface}}, which has no settings here. The next network change
     applied from anywhere may leave it without an address." (P17) with "Set it up as it is now…"
4. Toolbar: **"Set up…"** (neutral, a `Menu`): "A network port", "Wi-Fi", "A bond (combined ports)",
   "A VLAN", "A bridge". An item with nothing to choose from is unavailable with its reason ("Every
   network port is set up already.", "The NAS has no Wi-Fi hardware that is free.", "A bond needs at
   least one network port with no settings."). Refresh (icon button, "Refresh the list").
5. **The table**, one row per interface, loopback (`lo`) left out and virtual interfaces counted under
   the table as the dashboard does ("Also 12 virtual interfaces, used by containers or VPNs, not
   shown."); members are listed under their bond or bridge, indented, so a bond and its ports read
   together:

   | Order | Header     | Display                                                                                                                                                                                                      |
   | ----- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | 1     | Interface  | Router link with its name (`Identifier`) and kind word; under it, `text-sm`, "This page uses it" with the `Monitor` icon when it is this page's (0.4), "Part of {{parent}}", "Runs on {{parent}}" for a VLAN |
   | 2     | Connection | 0.3's words and icon                                                                                                                                                                                         |
   | 3     | IPv4       | How (Automatic (DHCP), Fixed address, Off, Not set up here) and the address in use with its size, or "No address"                                                                                            |
   | 4     | IPv6       | As IPv4                                                                                                                                                                                                      |
   | 5     |            | The pending mark with "Not applied yet" when 0.3 says so                                                                                                                                                     |

   Rows are 44 px on narrow screens; the table scrolls in its own region below 720 px, with the first
   column fixed.

6. Footer, `text-sm muted-foreground`: "Traffic charts are in the classic interface." and
   `ExternalLink` "Network interfaces in the classic interface" → `/#/network/interfaces`.

### 3.3 States

| State                         | Look                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading                       | The connection line as "Working out which interface this page uses…", three row skeletons                                                                                            |
| `enumerateDevicesList` failed | `EmptyState variant="error"`: "Could not read the network interfaces." + server message + "Try again"; the connection line as `network.connection.readFailed`; "Set up…" unavailable |
| `getInterfaceList` failed     | Rows show what is in use; the IPv4 and IPv6 "How" as "Settings not read"; "Set up…" unavailable with "Could not read the network settings."                                          |
| Empty (only `lo` and virtual) | `EmptyState variant="empty"`: "This NAS reports no network port besides virtual ones." (should not happen on a reachable NAS)                                                        |
| Populated                     | As 3.2                                                                                                                                                                               |

### 3.4 Copy

| Key                                       | English                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interfaces.title`                        | Network interfaces                                                                                                                                            |
| `interfaces.loading`                      | Working out which interface this page uses…                                                                                                                   |
| `interfaces.attn.noAddress`               | <iface></iface> is set up with a fixed address but has no address now.                                                                                        |
| `interfaces.attn.notConnected`            | <iface></iface> is set up but not connected.                                                                                                                  |
| `interfaces.attn.notApplied`              | <iface></iface> has settings that are not applied yet.                                                                                                        |
| `interfaces.attn.unmanaged`               | This page reaches the NAS through <iface></iface>, which has no settings here. The next network change applied from anywhere may leave it without an address. |
| `interfaces.attn.adopt`                   | Set it up as it is now…                                                                                                                                       |
| `interfaces.add`                          | Set up…                                                                                                                                                       |
| `interfaces.add.port`                     | A network port                                                                                                                                                |
| `interfaces.add.wifi`                     | Wi-Fi                                                                                                                                                         |
| `interfaces.add.bond`                     | A bond (combined ports)                                                                                                                                       |
| `interfaces.add.vlan`                     | A VLAN                                                                                                                                                        |
| `interfaces.add.bridge`                   | A bridge                                                                                                                                                      |
| `interfaces.add.noPort`                   | Every network port is set up already.                                                                                                                         |
| `interfaces.add.noWifi`                   | The NAS has no Wi-Fi hardware that is free.                                                                                                                   |
| `interfaces.add.noBond`                   | A bond needs at least one network port with no settings.                                                                                                      |
| `interfaces.add.noVlan`                   | A VLAN needs an interface with settings to run on.                                                                                                            |
| `interfaces.add.noBridge`                 | A bridge needs at least one interface with no settings.                                                                                                       |
| `interfaces.refresh`                      | Refresh the list                                                                                                                                              |
| `interfaces.col.iface`                    | Interface                                                                                                                                                     |
| `interfaces.col.connection`               | Connection                                                                                                                                                    |
| `interfaces.col.ipv4`                     | IPv4                                                                                                                                                          |
| `interfaces.col.ipv6`                     | IPv6                                                                                                                                                          |
| `interfaces.thisPage`                     | This page uses it                                                                                                                                             |
| `interfaces.partOf`                       | Part of <parent></parent>                                                                                                                                     |
| `interfaces.runsOn`                       | Runs on <parent></parent>                                                                                                                                     |
| `interfaces.how.dhcp`                     | Automatic (DHCP)                                                                                                                                              |
| `interfaces.how.auto`                     | Automatic                                                                                                                                                     |
| `interfaces.how.dhcp6`                    | Automatic (DHCPv6)                                                                                                                                            |
| `interfaces.how.static`                   | Fixed address                                                                                                                                                 |
| `interfaces.how.off`                      | Off                                                                                                                                                           |
| `interfaces.how.notSetUp`                 | Not set up here                                                                                                                                               |
| `interfaces.how.unread`                   | Settings not read                                                                                                                                             |
| `interfaces.noAddress`                    | No address                                                                                                                                                    |
| `interfaces.linkLocal`                    | (this network only)                                                                                                                                           |
| `interfaces.virtualHidden_one` / `_other` | Also {{count}} virtual interface, used by containers or VPNs, not shown. / Also {{count}} virtual interfaces, used by containers or VPNs, not shown.          |
| `interfaces.loadFailed`                   | Could not read the network interfaces.                                                                                                                        |
| `interfaces.settingsFailed`               | Could not read the network settings.                                                                                                                          |
| `interfaces.empty`                        | This NAS reports no network port besides virtual ones.                                                                                                        |
| `interfaces.footerLine`                   | Traffic charts are in the classic interface.                                                                                                                  |
| `interfaces.classicLink`                  | Network interfaces in the classic interface                                                                                                                   |

---

## 4. An interface's page

**Question it answers:** what is this interface doing now, and how is it set up? **Leads to:**
changing its settings, blinking its light, removing its settings.

Route `/network/interfaces/$iface`, where `$iface` is the interface's name, validated as a kernel
interface name (1 to 15 characters, none of them `/`, a space or a control character; D3) and matched
to a row of `enumerateDevicesList`; no match shows "This NAS has no interface named {{iface}}." with a
link back. Breadcrumbs: Network interfaces > {{iface}}.

### 4.1 Data

`Network.getInformation` (`devicename`: what it uses now), the interface's row of `getInterfaceList`
and, before a change, `Network.getInterface` (`uuid`) (R4), the connection (0.4), the bond and bridge
rows that name it. Refreshed on opening, Refresh, window focus, after a save and after an apply.

### 4.2 Layout

1. Page title: the name in `Identifier` and the kind word ("enp2s0 Network port").
2. When it is this page's interface (0.4): a neutral `InlineAlert` with the `Monitor` icon: "This page
   reaches the NAS through this interface. A change here that could cut this page off goes through
   extra checks before it is applied."
3. **Now** (`FactList`, from `getInformation`): Connection (0.3), State (0.3's words), IPv4 address
   in use and its router address, IPv6 address in use and its router address, Hardware address,
   Packet size in use, Speed. For a VLAN: "VLAN ID {{id}}, runs on {{parent}}". For a bond or bridge:
   its ports or interfaces, each a router link with its connection.
4. **Settings** (`Card` "Settings", from the stored row): IPv4 how and the fixed values; IPv6 how and
   the fixed values; Name servers (or "From the router" when empty and an automatic method is on, or
   "None" otherwise); Search domains; Packet size ("Standard" or "{{n}} bytes"); Wake-on-LAN; and,
   when set, Hardware address set here, Route priority, Note. For Wi-Fi: Network name, Security,
   Wi-Fi password "Set" (from `x-omv-presence`), Frequency, Hidden network. For a bond: Mode (7.2's
   words), Main port, and the timing settings as text. When a stored value differs from what is in
   use (1.8's comparison), the "In use now" value under it and "Not applied yet" with the pending
   mark. Button **"Change settings"** (neutral) opens the form in place (5).
5. **Not set up here** (a device with no settings): instead of the card, "This port has no settings
   here, so it gets no address and the NAS cannot be reached through it." and **"Set up this port…"**
   (filled primary), which opens the form with the classic defaults. When it carries this page's
   connection (P17): "This page reaches the NAS through this port, which has an address from outside
   these settings. Set it up as it is now, so that the next network change keeps it." and **"Set it
   up as it is now…"**, which opens the form filled with a fixed address equal to the one in use, its
   size and router address, and IPv6 as Automatic (the reader may change any of it; the change is
   then classified as any other).
6. **Part of a bond or bridge**: "This port is part of {{parent}}. Its settings are the bond's." (or
   the bridge's) with a router link; no settings card.
7. **Find this port** (`Card`, network ports only, the classic interface offers it for Ethernet only):
   "Blink its light…" (neutral) (4.4).
8. **Remove its settings** (`Card`, apart at the end, only when it has settings): one sentence and
   "Remove settings…" (neutral, opening the destructive confirmation of 10), or the refusal's reason
   in its place (10.1).
9. Footer link: "Network interfaces in the classic interface".

### 4.3 States

| State                   | Look                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Loading                 | Skeletons of Now and Settings                                                                                                 |
| `getInformation` failed | Now: `EmptyState variant="error"` "Could not read what {{iface}} is doing now." + message + "Try again"; Settings still shown |
| Settings read failed    | Settings: "Could not read the settings of {{iface}}." + "Try again"; "Change settings" and "Remove settings…" unavailable     |
| Saving, applying        | As 5.8 and 1.4                                                                                                                |
| Populated               | As 4.2                                                                                                                        |

### 4.4 Blink its light

`Dialog` "Blink the light of {{iface}}":

1. "The light beside the port's socket blinks, so you can find the right cable. Not every port can do
   this."
2. **How long** (`SegmentedChoice`): 5, 10 (default), 15 or 30 seconds (OMV allows 1 to 30; these are
   the classic form's choices).
3. When this is this page's interface, or one under it: the warning-shape neutral `InlineAlert`:
   "While it blinks, some ports stop carrying data, so this page may not respond for {{seconds}}."
   (OMV's own note says communication is not possible during the time, read from source.)
4. Buttons "Cancel" (focused) and **"Blink"** (filled primary).

On Blink: `Network.identify` (`devicename`, `seconds`) through the task helper; the dialog shows
"Blinking for {{seconds}}…" with the elapsed time; at the end "Done. Did you see the light?" and
"Close". A failure shows the server's message as text, such as the port not supporting it: "This
port could not blink its light: {{message}}". While it runs on this page's interface, the page waits
as 1.5's **Brief interruption** does, for the time chosen plus 10 seconds.

### 4.5 Keyboard

Tab order: breadcrumbs, the connection alert's link (none), Now's links (members), Change settings,
Set up this port, Blink its light, Remove settings, the footer link. After a save, focus stays on
"Change settings"; after removing, focus moves to the Interfaces page's title.

### 4.6 Copy

| Key                                 | English                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iface.notFound`                    | This NAS has no interface named <iface></iface>.                                                                                                                 |
| `iface.backToList`                  | Back to the network interfaces                                                                                                                                   |
| `iface.thisPage`                    | This page reaches the NAS through this interface. A change here that could cut this page off goes through extra checks before it is applied.                     |
| `iface.now`                         | Now                                                                                                                                                              |
| `iface.fact.connection`             | Connection                                                                                                                                                       |
| `iface.fact.state`                  | State                                                                                                                                                            |
| `iface.fact.ipv4`                   | IPv4 address                                                                                                                                                     |
| `iface.fact.ipv6`                   | IPv6 address                                                                                                                                                     |
| `iface.fact.gateway`                | Router address                                                                                                                                                   |
| `iface.fact.mac`                    | Hardware address                                                                                                                                                 |
| `iface.fact.mtu`                    | Packet size                                                                                                                                                      |
| `iface.fact.speed`                  | Speed                                                                                                                                                            |
| `iface.fact.vlan`                   | VLAN ID <id></id>, runs on <parent></parent>                                                                                                                     |
| `iface.fact.members`                | Ports                                                                                                                                                            |
| `iface.state.up`                    | Working                                                                                                                                                          |
| `iface.state.down`                  | Switched off                                                                                                                                                     |
| `iface.state.lowerDown`             | Waiting for the interfaces it runs on                                                                                                                            |
| `iface.state.dormant`               | Waiting (for example, to join a Wi-Fi network)                                                                                                                   |
| `iface.state.notPresent`            | The hardware is missing                                                                                                                                          |
| `iface.state.testing`               | Being tested                                                                                                                                                     |
| `iface.state.unknown`               | Not reported                                                                                                                                                     |
| `iface.settings`                    | Settings                                                                                                                                                         |
| `iface.inUseNow`                    | In use now: <value></value>                                                                                                                                      |
| `iface.dnsFromRouter`               | From the router                                                                                                                                                  |
| `iface.dnsNone`                     | None                                                                                                                                                             |
| `iface.mtuStandard`                 | Standard                                                                                                                                                         |
| `iface.mtuBytes`                    | {{count}} bytes                                                                                                                                                  |
| `iface.passwordSet`                 | Set                                                                                                                                                              |
| `iface.change`                      | Change settings                                                                                                                                                  |
| `iface.notSetUp`                    | This port has no settings here, so it gets no address and the NAS cannot be reached through it.                                                                  |
| `iface.setUp`                       | Set up this port…                                                                                                                                                |
| `iface.unmanaged`                   | This page reaches the NAS through this port, which has an address from outside these settings. Set it up as it is now, so that the next network change keeps it. |
| `iface.adopt`                       | Set it up as it is now…                                                                                                                                          |
| `iface.member`                      | This port is part of <parent></parent>. Its settings are the bond's.                                                                                             |
| `iface.memberBridge`                | This interface is part of <parent></parent>. Its settings are the bridge's.                                                                                      |
| `iface.find`                        | Find this port                                                                                                                                                   |
| `iface.blinkOpen`                   | Blink its light…                                                                                                                                                 |
| `iface.loadNowFailed`               | Could not read what <iface></iface> is doing now.                                                                                                                |
| `iface.loadSettingsFailed`          | Could not read the settings of <iface></iface>.                                                                                                                  |
| `ifaceBlink.title`                  | Blink the light of <iface></iface>                                                                                                                               |
| `ifaceBlink.body`                   | The light beside the port's socket blinks, so you can find the right cable. Not every port can do this.                                                          |
| `ifaceBlink.howLong`                | How long                                                                                                                                                         |
| `ifaceBlink.seconds_one` / `_other` | {{count}} second / {{count}} seconds                                                                                                                             |
| `ifaceBlink.thisPage`               | While it blinks, some ports stop carrying data, so this page may not respond for <duration></duration>.                                                          |
| `ifaceBlink.cancel`                 | Cancel                                                                                                                                                           |
| `ifaceBlink.confirm`                | Blink                                                                                                                                                            |
| `ifaceBlink.running`                | Blinking for <duration></duration>…                                                                                                                              |
| `ifaceBlink.done`                   | Done. Did you see the light?                                                                                                                                     |
| `ifaceBlink.close`                  | Close                                                                                                                                                            |
| `ifaceBlink.failed`                 | This port could not blink its light: <message></message>                                                                                                         |

---

## 5. Set up or change a network port

The form used for a network port, and the address part shared by every kind (Wi-Fi, bond, VLAN,
bridge: 6 to 9). New: route `/network/interfaces/add/port` (from "Set up…" or "Set up this port…",
the chosen port handed over in memory, not in the address). Existing: in place on the interface's
page.

### 5.1 Data

New: `Network.getEthernetCandidates` (ports with no settings). Existing: `Network.getInterface`
(`uuid`), read when the form opens and again before the save (R4). Both: the connection (0.4), every
interface's addresses (for the duplicate check), `getGeneralSettings` (the domain for the search
domains hint).

### 5.2 The fields

1. **Port** (new only; `Select` of the candidates by name with their hardware address and connection,
   "enp3s0 · 00:00:5e:00:53:02 · Not connected"); existing: the name as text.
2. Fieldset **IPv4**, legend "IPv4":
   - **How the NAS gets its IPv4 address** (`RadioGroupField`): "Automatically from the router (DHCP)"
     (default for a new port), "A fixed address I choose", "Off". Each with its term's sentence (0.1)
     as the description.
   - With a fixed address: **Address** (`TextField`, placeholder `192.0.2.10`); **Network size**
     (`TextField` that takes `24` or `/24` or `255.255.255.0`; sent as the dotted form OMV stores;
     placeholder `24`), with the network it makes shown under it as it is typed: "Network 192.0.2.0/24:
     192.0.2.1 to 192.0.2.254, 254 addresses for devices"; **Router address** (`TextField`, optional,
     placeholder `192.0.2.1`), hint `network.term.gateway`.
   - Under the fixed fields, `text-sm muted-foreground`: "Choose an address no other device uses.
     Your router's list of connected devices shows which are taken, and its settings show which
     addresses it hands out by itself; choose one outside those."
3. Fieldset **IPv6**, legend "IPv6":
   - **How the NAS gets its IPv6 address**: "Automatically (router announcements)", "Automatically
     from a DHCPv6 server", "A fixed address I choose", "Off" (default for a new port: Off, the classic
     default). Four choices, each with its sentence.
   - With a fixed address: **Address**, **Prefix length** (`NumberField`, default 64, hint "Almost
     always 64."), **Router address** (optional).
4. Fieldset **Name servers (DNS)**:
   - **Name servers** (`TextareaField`, one address per line or separated by commas; placeholder
     `192.0.2.1`). Hint: with an automatic method on, "Leave it empty to use the ones your router
     gives."; with only fixed addresses, "Required with a router address: without one, the NAS cannot
     look up names for updates, email notifications and its clock." Under it, always
     (`ifaceForm.dnsNotFinding`): "They do not change how other computers find this NAS."
   - **Search domains** (`TextareaField`, optional; placeholder the domain from General, or
     `example.org`). Hint `network.term.dnssearch`.
5. `Disclosure` **"Advanced"** (closed unless one of its fields differs from its default):
   - **Packet size** (`NumberField` with "bytes", 0 shown as "Standard"; a choice "Standard" /
     "Jumbo packets (9000 bytes)" / "Another size"); hint `network.term.mtu`.
   - **Wake-on-LAN** (`CheckboxField`): "Let other computers switch the NAS on through this port".
     Hint: "The computer's own settings must also allow it."
   - **Hardware address** (`TextField`, optional, placeholder `00:00:5e:00:53:01`): "Use a different
     hardware address". Hint `network.term.altmacaddress`.
   - **Route priority** for IPv4 and for IPv6 (`NumberField`, 0 to 65535, shown only with a fixed
     address and a router address), hint `network.term.routemetric`.
   - **Note** (`TextField`, stored as OMV's tags, `comment`), hint "Only for you; the NAS does not use
     it."
6. **Save** (filled primary), reading "Review the change…" when the change is **Moves** or **May
   cut** (0.5), and **Cancel**. Under the buttons, the class's words for this change, updated as the
   fields change (`aria-live="polite"`).

### 5.3 Checks in the browser

On blur and on Save, each with its message under the field (`aria-describedby`): every refusal of
0.8's "Save an interface's addresses" row, with these words:

| Check                               | Message                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Not an IPv4 address                 | Write an IPv4 address such as 192.0.2.10.                                                                             |
| The network's first or last address | <value></value> is the address of the network itself. Choose one between <first></first> and <last></last>.           |
| A reserved address                  | <value></value> cannot be the NAS's address.                                                                          |
| Network size                        | Write a size from 1 to 32, such as 24, or a mask such as 255.255.255.0.                                               |
| Router not on the network           | The router address <value></value> is not on the network <network></network>. Check the address and the network size. |
| Router is the NAS                   | The router address must be the router's, not the NAS's own.                                                           |
| Used by another interface           | <iface></iface> already uses <value></value>.                                                                         |
| Not an IPv6 address                 | Write an IPv6 address such as 2001:db8::10.                                                                           |
| Prefix length                       | Write a prefix length from 1 to 128; it is almost always 64.                                                          |
| Name server                         | <value></value> is not an address. Write each name server's address, such as 192.0.2.1.                               |
| No name server                      | Add a name server, or the NAS cannot look up names.                                                                   |
| Search domain                       | <value></value> is not a domain such as example.org.                                                                  |
| Packet size                         | Write a size from 576 to 9216 bytes, or choose Standard. With IPv6 on, the smallest is 1280.                          |
| Hardware address                    | Write six pairs of hexadecimal digits separated by colons, such as 00:00:5e:00:53:01, with an even first pair.        |

### 5.4 The change's class, while typing

As the fields change, the line under the buttons gives 0.5's class for the change against the stored
settings and the connection, so the reader sees before saving whether it is an ordinary save. On this
page's interface the more specific line follows, such as "This page stops working at 192.0.2.10. The
NAS will be at 192.0.2.20." or "Your router chooses the NAS's new address, and this page cannot know
it in advance."

### 5.5 Refused on this page's interface

When the interface is this page's (Known or Probably known), choosing **Off** for the page's family,
or Off for both families, shows the reason under the choice and Save stays unavailable:
"This page reaches the NAS over IPv4 through enp2s0. Turning IPv4 off would cut it off." followed by
`network.impact.otherWay`. On any other interface, both families Off is allowed and says: "With both
off, the NAS cannot be reached through {{iface}}."

### 5.6 What it does to other computers

Listed under the class line and in the flow's summary when they apply:

- A fixed address changed: "Computers that reach the NAS at {{old}} (shared folders, bookmarks, copy
  jobs) must use {{new}}."
- Automatic to fixed: "Your router may still hand out {{address}} to another device. Choose an address
  outside the ones it hands out by itself, or reserve it there for the NAS."
- A hardware address set or changed: "Your router sees the NAS as a new device: an address reserved
  for it there no longer applies."
- Wake-on-LAN turned off: "Other computers can no longer switch the NAS on through {{iface}}."

### 5.7 Saving

**Not affected** or **Brief interruption**: Save writes (0.9), the toast "The settings of {{iface}}
are saved. They take effect when you apply the changes." and the band; the form closes, focus returns
to "Change settings", the pending mark on the card. **Moves** or **May cut**: the change flow (1.4).
New ports: on save, the Interfaces page's row appears with the pending mark, and focus moves to it.

### 5.8 States

| State                          | Look                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Loading (candidates, settings) | Skeletons of the fieldsets                                                                                            |
| Candidates read failed         | `EmptyState variant="error"`: "Could not read which ports are free." + message + "Try again"                          |
| No candidates                  | "Every network port is set up already." and a router link back                                                        |
| Saving                         | Save shows "Saving…", fields read-only                                                                                |
| Save refused by OMV            | The server's message under the form; values kept                                                                      |
| Changed elsewhere              | "{{iface}} was changed since you opened it. Its new settings are shown; make your change again." and the form reloads |

### 5.9 Copy

| Key                          | English                                                                                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ifaceForm.titleNew`         | Set up a network port                                                                                                                                                                           |
| `ifaceForm.titleChange`      | Change the settings of <iface></iface>                                                                                                                                                          |
| `ifaceForm.port`             | Port                                                                                                                                                                                            |
| `ifaceForm.portOption`       | <name></name> · <mac></mac> · <connection></connection>                                                                                                                                         |
| `ifaceForm.ipv4`             | IPv4                                                                                                                                                                                            |
| `ifaceForm.ipv4How`          | How the NAS gets its IPv4 address                                                                                                                                                               |
| `ifaceForm.ipv4.dhcp`        | Automatically from the router (DHCP)                                                                                                                                                            |
| `ifaceForm.ipv4.static`      | A fixed address I choose                                                                                                                                                                        |
| `ifaceForm.off`              | Off                                                                                                                                                                                             |
| `ifaceForm.address`          | Address                                                                                                                                                                                         |
| `ifaceForm.size`             | Network size                                                                                                                                                                                    |
| `ifaceForm.sizeShows`        | Network <network></network>: <first></first> to <last></last>, <count></count> addresses for devices                                                                                            |
| `ifaceForm.gateway`          | Router address                                                                                                                                                                                  |
| `ifaceForm.optional`         | Optional                                                                                                                                                                                        |
| `ifaceForm.fixedHint`        | Choose an address no other device uses. Your router's list of connected devices shows which are taken, and its settings show which addresses it hands out by itself; choose one outside those.  |
| `ifaceForm.ipv6`             | IPv6                                                                                                                                                                                            |
| `ifaceForm.ipv6How`          | How the NAS gets its IPv6 address                                                                                                                                                               |
| `ifaceForm.ipv6.auto`        | Automatically (router announcements)                                                                                                                                                            |
| `ifaceForm.ipv6.dhcp`        | Automatically from a DHCPv6 server                                                                                                                                                              |
| `ifaceForm.ipv6.static`      | A fixed address I choose                                                                                                                                                                        |
| `ifaceForm.prefix`           | Prefix length                                                                                                                                                                                   |
| `ifaceForm.prefixHint`       | Almost always 64.                                                                                                                                                                               |
| `ifaceForm.dns`              | Name servers (DNS)                                                                                                                                                                              |
| `ifaceForm.dnsServers`       | Name servers                                                                                                                                                                                    |
| `ifaceForm.dnsAutoHint`      | Leave it empty to use the ones your router gives.                                                                                                                                               |
| `ifaceForm.dnsStaticHint`    | Required with a router address: without one, the NAS cannot look up names for updates, email notifications and its clock.                                                                       |
| `ifaceForm.dnsNotFinding`    | They do not change how other computers find this NAS.                                                                                                                                           |
| `ifaceForm.search`           | Search domains                                                                                                                                                                                  |
| `ifaceForm.advanced`         | Advanced                                                                                                                                                                                        |
| `ifaceForm.mtu`              | Packet size                                                                                                                                                                                     |
| `ifaceForm.mtu.standard`     | Standard                                                                                                                                                                                        |
| `ifaceForm.mtu.jumbo`        | Jumbo packets (9000 bytes)                                                                                                                                                                      |
| `ifaceForm.mtu.other`        | Another size                                                                                                                                                                                    |
| `ifaceForm.bytes`            | bytes                                                                                                                                                                                           |
| `ifaceForm.wol`              | Let other computers switch the NAS on through this port                                                                                                                                         |
| `ifaceForm.wolHint`          | The computer's own settings must also allow it.                                                                                                                                                 |
| `ifaceForm.mac`              | Use a different hardware address                                                                                                                                                                |
| `ifaceForm.metric4`          | IPv4 route priority                                                                                                                                                                             |
| `ifaceForm.metric6`          | IPv6 route priority                                                                                                                                                                             |
| `ifaceForm.note`             | Note                                                                                                                                                                                            |
| `ifaceForm.noteHint`         | Only for you; the NAS does not use it.                                                                                                                                                          |
| `ifaceForm.save`             | Save                                                                                                                                                                                            |
| `ifaceForm.cancel`           | Cancel                                                                                                                                                                                          |
| `ifaceForm.saving`           | Saving…                                                                                                                                                                                         |
| `ifaceForm.refusedFamily`    | This page reaches the NAS over <family></family> through <iface></iface>. Turning <family></family> off would cut it off.                                                                       |
| `ifaceForm.bothOff`          | With both off, the NAS cannot be reached through <iface></iface>.                                                                                                                               |
| `ifaceForm.other.address`    | Computers that reach the NAS at <old></old> (shared folders, bookmarks, copy jobs) must use <new></new>.                                                                                        |
| `ifaceForm.other.dhcpPool`   | Your router may still hand out <address></address> to another device. Choose an address outside the ones it hands out by itself, or reserve it there for the NAS.                               |
| `ifaceForm.other.mac`        | Your router sees the NAS as a new device: an address reserved for it there no longer applies.                                                                                                   |
| `ifaceForm.other.wol`        | Other computers can no longer switch the NAS on through <iface></iface>.                                                                                                                        |
| `ifaceForm.saved`            | The settings of <iface></iface> are saved. They take effect when you apply the changes.                                                                                                         |
| `ifaceForm.candidatesFailed` | Could not read which ports are free.                                                                                                                                                            |
| `ifaceForm.changedElsewhere` | <iface></iface> was changed since you opened it. Its new settings are shown; make your change again.                                                                                            |
| `ifaceForm.err.*`            | The messages of 5.3, one key each: `ipv4`, `networkAddress`, `reserved`, `size`, `gatewayNetwork`, `gatewaySelf`, `duplicate`, `ipv6`, `prefix`, `dnsServer`, `dnsNone`, `search`, `mtu`, `mac` |

---

## 6. Wi-Fi

Route `/network/interfaces/add/wifi` (new); existing in place on its page. Data:
`Network.getWirelessCandidates` (new), `getInterface` (existing).

### 6.1 The fields, before the address part

1. **Wi-Fi hardware** (new only; `Select` of the candidates).
2. **Network name** (`TextField`, required, `autocomplete="off"`): "The name of your Wi-Fi network,
   exactly as your devices show it, with capitals."
3. **Hidden network** (`CheckboxField`): "The network does not announce its name". Hint
   `network.term.hidden`.
4. **Security** (`RadioGroupField`): "WPA2-Personal" (default), "WPA3-Personal". Hint: "Choose what
   your router uses. WPA3 is newer; older routers offer only WPA2."
5. **Wi-Fi password** (`SecretField`, required on every save, 0.6): new: "Wi-Fi password"; existing:
   "Password: Set" and the field "Type the Wi-Fi password to save" with the hint "The NAS does not
   give it back to this page. Type the same password to keep it, or a new one." Reveal control
   "Show password".
6. **Frequency** (`SegmentedChoice`): Automatic (default), 2.4 GHz, 5 GHz. Hint: "Automatic lets the
   NAS choose. 2.4 GHz reaches further; 5 GHz is faster."

Then 5.2's address part, with IPv4 Automatic by default.

### 6.2 On this page's Wi-Fi

When this page reaches the NAS through this Wi-Fi interface, a change to the name, password, security
or frequency is **May cut** (0.5), with `netChange.effect.wifi` and the flow. The summary's "What
changes" shows the network name and "Password: changed" or "Password: the same" (never the password;
whether it is the same is not known to this page, so it says "typed again").

### 6.3 Copy

| Key                      | English                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `wifi.titleNew`          | Join a Wi-Fi network                                                                          |
| `wifi.hardware`          | Wi-Fi hardware                                                                                |
| `wifi.name`              | Network name                                                                                  |
| `wifi.nameHint`          | The name of your Wi-Fi network, exactly as your devices show it, with capitals.               |
| `wifi.hidden`            | The network does not announce its name                                                        |
| `wifi.security`          | Security                                                                                      |
| `wifi.securityHint`      | Choose what your router uses. WPA3 is newer; older routers offer only WPA2.                   |
| `wifi.wpa2`              | WPA2-Personal                                                                                 |
| `wifi.wpa3`              | WPA3-Personal                                                                                 |
| `wifi.password`          | Wi-Fi password                                                                                |
| `wifi.passwordSet`       | Password: Set                                                                                 |
| `wifi.passwordAgain`     | Type the Wi-Fi password to save                                                               |
| `wifi.passwordAgainHint` | The NAS does not give it back to this page. Type the same password to keep it, or a new one.  |
| `wifi.show`              | Show password                                                                                 |
| `wifi.frequency`         | Frequency                                                                                     |
| `wifi.frequency.auto`    | Automatic                                                                                     |
| `wifi.frequencyHint`     | Automatic lets the NAS choose. 2.4 GHz reaches further; 5 GHz is faster.                      |
| `wifi.typedAgain`        | Password: typed again                                                                         |
| `wifi.err.name`          | Write the network name, at most 32 characters.                                                |
| `wifi.err.password`      | Write the password, 8 to 63 characters (or 64 hexadecimal digits).                            |
| `wifi.saved`             | The Wi-Fi settings of <iface></iface> are saved. They take effect when you apply the changes. |

---

## 7. A bond

Route `/network/interfaces/add/bond` (new); existing in place on its page. Data:
`Network.enumerateBondSlaves` (`uuid` the new marker or the bond's, `unused` true: ports with no
settings, and the bond's own ports when it exists).

### 7.1 The fields, before the address part

1. Intro: `network.term.bond`.
2. **Ports in the bond** (`CheckboxListField` of the candidates, each with its connection; at least
   one, OMV's rule; with one only, the warning-shape neutral `InlineAlert` "A bond of one port does
   not protect against anything. Choose at least two."). Ports that are refused (0.8) are not offered;
   this page's own port is listed unavailable with "This page reaches the NAS through it." and
   `network.impact.otherWay`.
3. **What the bond does** (`RadioGroupField`, three choices, P3):

   | Choice                                       | Stored                       | Description                                                                                                                                                                                         |
   | -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | **Keep working if a port fails** (default)   | `bondmode` 1 (active-backup) | "One port carries the traffic, and another takes over if its cable or switch port fails. Works with any switch."                                                                                    |
   | **Combine the ports' speed (802.3ad)**       | 4                            | "Traffic is spread over every port, and if one fails the others carry on. Your switch must support 802.3ad (also called LACP) and have it turned on for these ports, or the NAS cannot be reached." |
   | **Combine the speed without switch support** | 6 (balance-alb)              | "Traffic is spread over the ports without help from the switch. Some switches and routers get confused by it; if computers lose the NAS now and then, choose one of the others."                    |

   A bond set in the classic interface to another mode shows it as "{{mode}} (set in the classic
   interface)" as the selected choice; it is kept on save unless another choice is made.

4. **Main port** (`Select` of the chosen ports; required for the first and third choice, OMV's rule):
   "The port the bond uses while it works. Choose the fastest or best-connected one."
5. `Disclosure` "Advanced": the timing settings as text ("Checks each port's link every 100 ms";
   "Waits 0 ms before using a port that comes back") and "Changed in the classic interface."

Then 5.2's address part. A new bond is named by the NAS (`bond0`, `bond1`…); the summary says "The NAS
names it bond0." **[verify]** that the name is known only after saving (OMV picks the next free one).

### 7.2 What it does to other computers

Under the fields: "The bond gets its own hardware address, so your router sees it as a new device and
may give it a new address." **[verify]** which hardware address the bond uses.

### 7.3 Copy

| Key                    | English                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bond.titleNew`        | Make a bond                                                                                                                                                                                       |
| `bond.ports`           | Ports in the bond                                                                                                                                                                                 |
| `bond.onePort`         | A bond of one port does not protect against anything. Choose at least two.                                                                                                                        |
| `bond.thisPagePort`    | This page reaches the NAS through it.                                                                                                                                                             |
| `bond.mode`            | What the bond does                                                                                                                                                                                |
| `bond.mode.backup`     | Keep working if a port fails                                                                                                                                                                      |
| `bond.mode.backupHint` | One port carries the traffic, and another takes over if its cable or switch port fails. Works with any switch.                                                                                    |
| `bond.mode.lacp`       | Combine the ports' speed (802.3ad)                                                                                                                                                                |
| `bond.mode.lacpHint`   | Traffic is spread over every port, and if one fails the others carry on. Your switch must support 802.3ad (also called LACP) and have it turned on for these ports, or the NAS cannot be reached. |
| `bond.mode.alb`        | Combine the speed without switch support                                                                                                                                                          |
| `bond.mode.albHint`    | Traffic is spread over the ports without help from the switch. Some switches and routers get confused by it; if computers lose the NAS now and then, choose one of the others.                    |
| `bond.mode.classic`    | <mode></mode> (set in the classic interface)                                                                                                                                                      |
| `bond.primary`         | Main port                                                                                                                                                                                         |
| `bond.primaryHint`     | The port the bond uses while it works. Choose the fastest or best-connected one.                                                                                                                  |
| `bond.advanced`        | Advanced                                                                                                                                                                                          |
| `bond.miimon`          | Checks each port's link every <ms></ms> ms                                                                                                                                                        |
| `bond.updelay`         | Waits <ms></ms> ms before using a port that comes back                                                                                                                                            |
| `bond.downdelay`       | Waits <ms></ms> ms before giving up on a port that goes down                                                                                                                                      |
| `bond.timingClassic`   | Changed in the classic interface.                                                                                                                                                                 |
| `bond.named`           | The NAS names it <name></name>.                                                                                                                                                                   |
| `bond.newMac`          | The bond gets its own hardware address, so your router sees it as a new device and may give it a new address.                                                                                     |
| `bond.err.noPort`      | Choose at least one port.                                                                                                                                                                         |
| `bond.err.primary`     | Choose the main port.                                                                                                                                                                             |
| `bond.saved`           | The bond is saved. It takes effect when you apply the changes.                                                                                                                                    |

---

## 8. A VLAN

Route `/network/interfaces/add/vlan` (new); existing in place on its page. Data:
`Network.getVlanCandidates` (interfaces with settings that are not VLANs).

### 8.1 The fields, before the address part

1. Intro: `network.term.vlan`.
2. **Runs on** (`Select` of the candidates; new only; existing as text).
3. **VLAN ID** (`NumberField`, 1 to 4094, required; new only, OMV names the VLAN by it): hint "The
   number your switch uses for this network. 1 is often the switch's own default network; ask whoever
   set up the switch."
4. Under them: "The NAS names it {{parent}}.{{id}}."

Then 5.2's address part, IPv4 Automatic by default. On this page's interface's parent: **Brief
interruption** (0.5). The address part's checks also refuse an address on the same network as the
parent's: "{{parent}} already uses the network {{network}}. A VLAN is a separate network; give it
addresses of its own." (two interfaces on one network confuse which one answers) **[verify]**.

### 8.2 Copy

| Key                    | English                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `vlan.titleNew`        | Add a VLAN                                                                                                                  |
| `vlan.runsOn`          | Runs on                                                                                                                     |
| `vlan.id`              | VLAN ID                                                                                                                     |
| `vlan.idHint`          | The number your switch uses for this network. 1 is often the switch's own default network; ask whoever set up the switch.   |
| `vlan.named`           | The NAS names it <name></name>.                                                                                             |
| `vlan.err.id`          | Write a VLAN ID from 1 to 4094.                                                                                             |
| `vlan.err.taken`       | <parent></parent> already has a VLAN with ID <id></id>.                                                                     |
| `vlan.err.sameNetwork` | <parent></parent> already uses the network <network></network>. A VLAN is a separate network; give it addresses of its own. |
| `vlan.saved`           | The VLAN is saved. It takes effect when you apply the changes.                                                              |

---

## 9. A bridge

Route `/network/interfaces/add/bridge` (new); existing in place on its page. Data:
`Network.enumerateBridgeSlaves` (`uuid`, `unused` true).

### 9.1 The fields, before the address part

1. Intro: `network.term.bridge`.
2. **Interfaces in the bridge** (`CheckboxListField`; optional, OMV allows a bridge with none, which
   joins only virtual machines and containers): hint "The interfaces it joins to your network. A
   bridge with none joins only virtual machines and containers on this NAS." Interfaces with settings
   of their own are not offered (0.8) **[verify]** whether OMV's list includes a bond that has
   settings; this page's own interface is listed unavailable with `network.impact.otherWay`.
3. Under them: "The NAS names it br0." (the next free name).

Then 5.2's address part. The bridge gets its own hardware address: the line of 7.2.

### 9.2 Copy

| Key                  | English                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bridge.titleNew`    | Make a bridge                                                                                                       |
| `bridge.members`     | Interfaces in the bridge                                                                                            |
| `bridge.membersHint` | The interfaces it joins to your network. A bridge with none joins only virtual machines and containers on this NAS. |
| `bridge.named`       | The NAS names it <name></name>.                                                                                     |
| `bridge.saved`       | The bridge is saved. It takes effect when you apply the changes.                                                    |

---

## 10. Remove an interface's settings

### 10.1 When it is refused

In place of the button on the interface's page (4.2, 8), with the reason (0.8):

- This page's interface: "This page reaches the NAS through {{iface}}. Removing its settings would cut
  it off." and `network.impact.otherWay`.
- Under this page's interface (a bond's port, a VLAN's parent, a bridge's interface): "This page
  reaches the NAS through {{top}}, which runs on {{iface}}." and the same.
- A VLAN runs on it: "The VLAN {{vlan}} runs on {{iface}}. Remove the VLAN first." with a router link.

### 10.2 The confirmation

`ConfirmDialog` (destructive form, no typing: nothing on a disk is lost, and before apply Undo brings
it back; D7):

1. Title: "Remove the settings of {{iface}}?"
2. "After the changes are applied, {{iface}} has no address, and the NAS cannot be reached through it.
   It uses {{addresses}} now." (Which other computers use that address is not knowable, so the
   dialog does not guess.)
3. What else is lost, one line each when it applies:
   - a bond: "Its ports {{ports}} are freed and have no settings."
   - a bridge: "Its interfaces {{members}} are freed and have no settings. Virtual machines and
     containers that use it lose their network."
   - Wi-Fi: "The network name and the Wi-Fi password stored for it are deleted."
   - Wake-on-LAN on: "Other computers can no longer switch the NAS on through it."
   - a fixed address: "Its fixed address {{address}} is free for other devices."
4. Buttons: "Cancel" (focused), **"Remove settings"** (destructive form).

On confirm: `deleteInterface` (0.9), toast "The settings of {{iface}} are removed. This takes effect
when you apply the changes." and the band; the page shows "Not set up here" for a port, or returns to
the Interfaces page for a bond, VLAN, bridge or Wi-Fi interface (which no longer exist after apply)
with focus on its title. The connection is re-read; the apply confirmation's check (1.8) applies.

### 10.3 Classes

Removing another interface's settings is **Brief interruption** for this page (0.5): the whole
network is set up again at apply **[verify]** whether unchanged interfaces drop at all.

### 10.4 Undo after a removal (P14)

Because a queued job outlives Undo (0.7) **[verify]**, when the pending changes include a removed
interface and the reader chooses Undo (the band's, or the flow's), the Undo confirmation adds: "The
NAS also queued a job to switch {{iface}} off. Undo cannot remove it, so it would run at a later,
unrelated apply. After undoing, this page applies the queued jobs and the network at once, which
switches {{iface}} off and on again." After the revert succeeds, the interface applies
`Config.applyChangesBg` with `modules: ["task", "systemd-networkd"]` and `force: true`, as the R7
plan does, with 1.5's **Brief interruption** wait. The band's Undo of changes it did not see saved
(another administrator, a reload) cannot know of a removal in them except by comparing the stored
interfaces before and after the revert; it does so (`getInterfaceList` read before and after) and
offers the same forced apply when an interface came back.

### 10.5 Copy

| Key                         | English                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ifaceDelete.section`       | Remove its settings                                                                                                                                                                                                                                     |
| `ifaceDelete.sectionBody`   | Without settings, the interface gets no address and the NAS cannot be reached through it.                                                                                                                                                               |
| `ifaceDelete.open`          | Remove settings…                                                                                                                                                                                                                                        |
| `ifaceDelete.refusedThis`   | This page reaches the NAS through <iface></iface>. Removing its settings would cut it off.                                                                                                                                                              |
| `ifaceDelete.refusedUnder`  | This page reaches the NAS through <top></top>, which runs on <iface></iface>.                                                                                                                                                                           |
| `ifaceDelete.refusedVlan`   | The VLAN <vlan></vlan> runs on <iface></iface>. Remove the VLAN first.                                                                                                                                                                                  |
| `ifaceDelete.title`         | Remove the settings of <iface></iface>?                                                                                                                                                                                                                 |
| `ifaceDelete.body`          | After the changes are applied, <iface></iface> has no address, and the NAS cannot be reached through it.                                                                                                                                                |
| `ifaceDelete.usesNow`       | It uses <addresses></addresses> now.                                                                                                                                                                                                                    |
| `ifaceDelete.bondPorts`     | Its ports <ports></ports> are freed and have no settings.                                                                                                                                                                                               |
| `ifaceDelete.bridgeMembers` | Its interfaces <members></members> are freed and have no settings. Virtual machines and containers that use it lose their network.                                                                                                                      |
| `ifaceDelete.wifi`          | The network name and the Wi-Fi password stored for it are deleted.                                                                                                                                                                                      |
| `ifaceDelete.wol`           | Other computers can no longer switch the NAS on through it.                                                                                                                                                                                             |
| `ifaceDelete.fixed`         | Its fixed address <address></address> is free for other devices.                                                                                                                                                                                        |
| `ifaceDelete.cancel`        | Cancel                                                                                                                                                                                                                                                  |
| `ifaceDelete.confirm`       | Remove settings                                                                                                                                                                                                                                         |
| `ifaceDelete.done`          | The settings of <iface></iface> are removed. This takes effect when you apply the changes.                                                                                                                                                              |
| `ifaceDelete.undoNote`      | The NAS also queued a job to switch <iface></iface> off. Undo cannot remove it, so it would run at a later, unrelated apply. After undoing, this page applies the queued jobs and the network at once, which switches <iface></iface> off and on again. |

---

## 11. Network > Firewall

**Question it answers:** what traffic do the firewall's rules let in and out, and do they let this page
in? **Leads to:** adding, changing, ordering and deleting rules.

Route `/network/firewall`; the menu item "Firewall" gains the route (section 14).

### 11.1 Data

`Iptables.getRules` (the IPv4 rules, sorted by `rulenum`), with P2 `Iptables.getRules6`;
`WebGui.getSettings` (the web ports), `SSH.get` (`enable`, `port`), the connection (0.4). Refreshed on
opening, Refresh, window focus and after a save. Before every write: `getRules` again (R4), or
`getRule` for a single rule.

### 11.2 How OMV's firewall works, read from source

- **Order**: the rules are applied in number order. For traffic, the first rule that fits and says
  Allow, Refuse or Ignore decides; "Note in the log" and "Count only" do not decide, and the next
  rule is checked.
- **The default is to let through**: OMV sets no default, and when it stops the firewall it sets "let
  through" for both directions. Traffic no rule fits is let through **[verify]** on the VM after an
  apply.
- **Nothing is let back in by itself**: OMV adds no rule for replies to the NAS's own connections, or
  for the NAS talking to itself. A rule that refuses everything coming in therefore also stops
  updates, email notifications, the clock and name lookups, unless rules before it allow those (11.6).
- **Applying** restarts the firewall: every rule is removed and the stored ones added, IPv4 and IPv6
  together (N5). Rules that other programs on the NAS add to the same lists are removed too, until
  those programs add them again **[verify]**.
- **IPv4 and IPv6 are separate lists.** The IPv4 rules do nothing to IPv6 traffic, and the reverse.
- **Fields**: a rule's from and to are one address, a network (`192.0.2.0/24`), a range
  (`192.0.2.10-192.0.2.20`) or empty (any), each optionally preceded by `!` (every address except);
  a port is one port or a range (`1024-65535`), optionally with `!`; a port needs TCP or UDP.

### 11.3 Layout

1. Page title "Firewall rules". Intro: `network.term.firewall`.
2. The connection line (0.4).
3. **What the rules do to this page** (11.5), `role="status"`: "The rules let this page in." (with
   the neutral `Monitor` icon), or the warning-shape neutral `InlineAlert` with the finding.
4. Summary line, `text-sm`: "No rules. Every computer that can reach the NAS can use all of its
   services." or "{{in}} rules for traffic coming in and {{out}} for traffic going out. Traffic that
   no rule fits is let through."
5. **IPv6**: with P2, `PageTabs` "IPv4" and "IPv6", the same page for each list. Without it, a line:
   "These rules are for IPv4. IPv6 traffic is not checked by them; IPv6 rules are in the classic
   interface." with `ExternalLink` → `/#/network/firewall/rules/inet6`.
6. Toolbar: **"Add a rule…"** (neutral), **"Block everything else…"** (neutral; only when the list
   does not already end with a rule that refuses or ignores all traffic coming in), Refresh.
7. **The list**, an ordered table (one row per rule, in order; the number is the position, 1 first):

   | Order | Header    | Display                                                                                                                                                                                                                                              |
   | ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1     | #         | Position, tabular                                                                                                                                                                                                                                    |
   | 2     | Then      | The action's word with its icon (11.3's icons below)                                                                                                                                                                                                 |
   | 3     | Traffic   | Direction and kind: "Coming in, TCP to port 22 (SSH)", "Going out, UDP to port 53 (name servers)", "Coming in, any kind"                                                                                                                             |
   | 4     | From / To | The other computer: "Any computer", "The computer at 192.0.2.10", "Computers on 192.0.2.0/24 (256 addresses)", "Computers from 192.0.2.10 to 192.0.2.20", "Every computer except …"; and, when set, the NAS's side "to the NAS's address 192.0.2.10" |
   | 5     | Note      | The rule's note; "Other options: `{{options}}` (set in the classic interface)"; "This NAS talking to itself" and "Replies to connections this NAS starts" for 11.6's two rules                                                                       |
   | 6     |           | "Move rule {{n}} up" and "Move rule {{n}} down" (icon buttons with those names and tooltips), "Change…", "Delete…"                                                                                                                                   |

   The icons are neutral and differ in shape: Allow `ArrowRight`, Refuse `Ban`, Ignore `EyeOff`, Note
   in the log `NotebookPen`, Count only `Hash`. **Allow is not green and Refuse is not red**: a rule is
   a setting, not a state the NAS monitors (style guide 2).

   Known ports are named after the number: 22 "SSH" (or the SSH page's port when changed), this page's
   port "this web interface", the web interface's other port, 443 "secure web", 445 "Windows and Mac
   sharing", 139 "older Windows sharing", 2049 "NFS", 111 "NFS helper", 873 "rsync server", 53 "name
   servers", 123 "the clock", 25 and 587 "email".

8. When the order was changed on the page and not saved: a bar under the toolbar "The new order is
   not saved." with **"Save the new order"** (filled primary, or "Review the change…" when the check
   says **May cut**) and "Discard". The check (11.5) runs on the new order while it is shown.
9. Footer: `ExternalLink` "Firewall in the classic interface" → `/#/network/firewall/rules`.

Empty: `EmptyState variant="empty"`: "No firewall rules. Every computer that can reach the NAS can
use all of its services. Add a rule to refuse or allow traffic." with "Add a rule…".

### 11.4 Add or change a rule

`Dialog` "Add a firewall rule" or "Change rule {{n}}", one column:

1. **Direction** (`RadioGroupField`): "Coming in to the NAS" (default), "Going out from the NAS".
2. **Then** (`RadioGroupField`, required, none preselected for a new rule): Allow, Refuse, Ignore,
   "Note in the log and carry on", each with its sentence (0.1). "Count only" is shown, selected, only
   for a rule set so in the classic interface.
3. **Kind of traffic** (`SegmentedChoice`): TCP (default), UDP, Ping (ICMP), Any kind. A rule set in
   the classic interface to "not TCP" and the like shows it as "{{kind}} (set in the classic
   interface)", kept unless changed.
4. **Port** (TCP and UDP only; `Select`): "Any port" (default), the known ports of 11.3 by name and
   number, "Another port or range…" (a `TextField`: "22" or "1024-65535"). With Ping or Any kind:
   "A port can be chosen only for TCP or UDP." and no field.
5. **From** (coming in) or **To** (going out): the other computer, `ClientField` with a fourth
   choice: "Any computer" (default), "One computer", "Computers on one network", "A range of
   addresses" (two fields, first and last); IPv4 only on the IPv4 list. The services slice's wide
   network warning applies.
6. Shown only when set in the classic interface: "Every address except" (`!`), the port on the other
   side (`sport` coming in, or the NAS's port going out), the NAS's own address, other options. Each as
   text with "(set in the classic interface)", kept unless the reader chooses "Remove" beside it.
7. **Where** (new rules only; `Select`): "At the end of the list" (default), "At the top", "Before
   rule {{n}}" for each rule.
8. **Note** (`TextField`, optional).
9. The check line for the list with this rule (11.5), updated as the fields change.
10. Buttons: "Cancel" (focused for a change, the first field for a new rule) and **"Add rule"** or
    **"Save rule"**, reading "Review the change…" when the check says **May cut**, unavailable with
    the reason when it says **Refused**.

On save: at the end, `setRule` with `rulenum` -1; at another place, or a change, `setRules` with the
whole list (0.9); toast "The rule is saved. It takes effect when you apply the changes." and the band.
Focus moves to the rule's row.

### 11.5 The check: what the rules do to this page

Run in the browser on a list of rules (the stored one, a changed one shown on the page, or one with a
rule added, changed or deleted), for **this page** and for **SSH**. Inputs: the connection (0.4: the
NAS address and family when known), the web ports and the SSH port (0.4). This computer's own address
is not known (N10), so every rule that names some computers is "some computers", never "this
computer".

For each port it walks the rules for traffic coming in (TCP to that port, to the NAS's address) and,
separately, for replies going out (TCP from that port, to the other computer), in order:

| A rule                                                                                                                                                                                         | Fits this traffic for                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Wrong direction, kind (`udp`, `icmp`, `!tcp`) or port                                                                                                                                          | nobody: skipped                                 |
| Kind `tcp`, `all`, `!udp` or `!icmp`; its port empty or including this port (with `!`, excluding it); the NAS's side empty or including the NAS's address (when known; when not known, "some") |                                                 |
| … with the other computer empty                                                                                                                                                                | **every computer**                              |
| … with the other computer set (an address, network, range, or `!` one)                                                                                                                         | **some computers**, named                       |
| … with a port on the other side (the browser's port is chosen at random), or other options                                                                                                     | **some computers** ("cannot tell")              |
| 11.6's "replies" rule                                                                                                                                                                          | nobody, for a new connection                    |
| 11.6's "talking to itself" rule                                                                                                                                                                | nobody, unless the connection is a tunnel (0.4) |

Walking down: a rule for every computer that allows ends the walk (let in); one that refuses or
ignores ends it (blocked); "Note in the log" and "Count only" go on. A rule for some computers is
recorded (allowed for them, or blocked for them) and the walk goes on for everyone else. The end of
the list lets in.

| Result for this page                                 | Class (0.5)      | Words                                                                                                      |
| ---------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Let in for every computer                            | **Not affected** | "The rules let this page in."                                                                              |
| Blocked for every computer (coming in or going out)  | **Refused**      | "These rules would block this page for every computer, this one too."                                      |
| Let in only for some computers, blocked for the rest | **May cut**      | "These rules let only {{who}} open this page. This page cannot tell whether this computer is one of them." |
| Blocked for some computers, let in for the rest      | **May cut**      | "These rules block this page for {{who}}. This page cannot tell whether this computer is one of them."     |
| A rule it cannot tell about decides                  | **May cut**      | "Rule {{n}} has options this page cannot read, so it cannot tell whether that rule blocks this page."      |

`{{who}}` lists the rules' computers in 0.2's words, at most three then "and {{count}} more". When the
connection is Known and its interface's network is among the allowed, the line adds: "If this
computer is on the same network as the NAS ({{network}}), it is one of them."

**SSH** (when on) gets the same walk, but its results are lines in "What it does to other computers",
never a refusal: "SSH: blocked for every computer. If this page is cut off, SSH will not be a way
back in."

**The web interface's other port**: "The address with http:// stops working; this page uses
https://." (and the reverse), a line, not a class.

With P2, the IPv6 list is checked the same way when the page uses IPv6 or a name. Without P2, the IPv4
check of a page reached over IPv6 is **Not affected** for this page, with the line "This page uses
IPv6, which these rules do not check."

### 11.6 Block everything else

`Dialog` "Block everything else coming in":

1. "This adds three rules at the end of the list:"
   1. "Allow all traffic of this NAS talking to itself" (programs on the NAS talk to each other this
      way);
   2. "Allow replies to connections this NAS starts" (so updates, email notifications, the clock and
      name lookups keep working);
   3. "Refuse all other traffic coming in."
2. "After it, only what the rules above allow can reach the NAS. Anything you have not allowed, such
   as Windows and Mac sharing or a media player, stops working."
3. The check on the list with the three added. When this page is not let in for anyone above them,
   **Refused**: "Nothing above allows this page, so it would be blocked. Allow it first." with
   **"Allow this page for {{network}}…"** when the connection is Known (opens 11.4 filled: Allow, TCP,
   this page's port, computers on the network of this page's interface, at the top). When it is let in
   only for some computers: **May cut**, the flow (1.4) with its typed confirmation.
4. Buttons "Cancel" (focused) and **"Add the three rules"**.

The two allowing rules are stored with fixed other options: `-i lo` and
`-m conntrack --ctstate ESTABLISHED,RELATED`, both with `protocol` `all`, `chain` `INPUT`, `action`
`ACCEPT`. They are the only other options this interface ever writes, recognised by their exact value
and shown in their own words; any other value is "set in the classic interface" (P11) **[verify]**
that OMV's script runs both as written and that the NAS's updates, clock and email work after.

### 11.7 Order

Each row's "Move up" and "Move down" (no dragging, so nothing needs a pointer) change the order on the
page only, with the bar of 11.3, 8. The moved row keeps focus. "Save the new order" re-reads the rules
(R4; when they differ from what the page started from: "The rules were changed since you opened them.
Their new order is shown; move them again."), runs the check on the new order, and writes it with
`setRules`. "Discard" puts the stored order back. Leaving the page with an unsaved order asks the app's
leave confirmation.

### 11.8 Delete a rule

`ConfirmDialog` (destructive form, no typing):

1. Title: "Delete rule {{n}}?"
2. The rule in its row's words.
3. What is lost: for Refuse and Ignore, "After the changes are applied, {{who}} can reach {{what}}
   again, unless a rule below refuses it."; for Allow, "After the changes are applied, the rules below
   it decide what happens to this traffic."; for Note in the log, "This traffic is no longer noted in
   the system log."
4. The check on the list without it; **May cut** turns the button into "Review the change…" and the
   flow; **Refused** makes it unavailable with the reason (deleting an Allow above "Block everything
   else" can block this page).
5. Buttons "Cancel" (focused) and **"Delete rule"**.

On confirm: `deleteRule`; toast "Rule {{n}} is deleted. This takes effect when you apply the
changes."; focus moves to the row that took its place, or to "Add a rule…".

### 11.9 States

| State                                    | Look                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                  | Skeletons of the check line and three rows                                                                                       |
| `getRules` failed                        | `EmptyState variant="error"`: "Could not read the firewall rules." + server message + "Try again"; no check; toolbar unavailable |
| `WebGui.getSettings` or `SSH.get` failed | The check uses this page's port only, and says "Could not read the SSH settings, so SSH is not checked."                         |
| Empty                                    | 11.3's empty state                                                                                                               |
| Saving                                   | The dialog's button shows "Saving…"                                                                                              |
| Populated                                | As 11.3                                                                                                                          |

### 11.10 Copy

| Key                          | English                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firewall.title`             | Firewall rules                                                                                                                                                |
| `firewall.pageLetIn`         | The rules let this page in.                                                                                                                                   |
| `firewall.pageRefused`       | These rules would block this page for every computer, this one too.                                                                                           |
| `firewall.pageOnlySome`      | These rules let only <who></who> open this page. This page cannot tell whether this computer is one of them.                                                  |
| `firewall.pageBlockedSome`   | These rules block this page for <who></who>. This page cannot tell whether this computer is one of them.                                                      |
| `firewall.pageCannotTell`    | Rule <n></n> has options this page cannot read, so it cannot tell whether that rule blocks this page.                                                         |
| `firewall.sameNetwork`       | If this computer is on the same network as the NAS (<network></network>), it is one of them.                                                                  |
| `firewall.ipv6Page`          | This page uses IPv6, which these rules do not check.                                                                                                          |
| `firewall.sshBlocked`        | SSH: blocked for every computer. If this page is cut off, SSH will not be a way back in.                                                                      |
| `firewall.sshSome`           | SSH: blocked for <who></who>.                                                                                                                                 |
| `firewall.otherScheme`       | The address with <scheme></scheme> stops working; this page uses <current></current>.                                                                         |
| `firewall.none`              | No rules. Every computer that can reach the NAS can use all of its services.                                                                                  |
| `firewall.counts`            | <in></in> rules for traffic coming in and <out></out> for traffic going out. Traffic that no rule fits is let through.                                        |
| `firewall.ipv4Only`          | These rules are for IPv4. IPv6 traffic is not checked by them; IPv6 rules are in the classic interface.                                                       |
| `firewall.ipv6Link`          | IPv6 rules in the classic interface                                                                                                                           |
| `firewall.tab.ipv4`          | IPv4                                                                                                                                                          |
| `firewall.tab.ipv6`          | IPv6                                                                                                                                                          |
| `firewall.add`               | Add a rule…                                                                                                                                                   |
| `firewall.blockRest`         | Block everything else…                                                                                                                                        |
| `firewall.col.position`      | #                                                                                                                                                             |
| `firewall.col.then`          | Then                                                                                                                                                          |
| `firewall.col.traffic`       | Traffic                                                                                                                                                       |
| `firewall.col.who`           | From / To                                                                                                                                                     |
| `firewall.col.note`          | Note                                                                                                                                                          |
| `firewall.action.accept`     | Allow                                                                                                                                                         |
| `firewall.action.reject`     | Refuse                                                                                                                                                        |
| `firewall.action.drop`       | Ignore                                                                                                                                                        |
| `firewall.action.log`        | Note in the log                                                                                                                                               |
| `firewall.action.count`      | Count only                                                                                                                                                    |
| `firewall.dir.in`            | Coming in                                                                                                                                                     |
| `firewall.dir.out`           | Going out                                                                                                                                                     |
| `firewall.traffic`           | <direction></direction>, <kind></kind>                                                                                                                        |
| `firewall.trafficPort`       | <direction></direction>, <kind></kind> to <port></port>                                                                                                       |
| `firewall.kind.tcp`          | TCP                                                                                                                                                           |
| `firewall.kind.udp`          | UDP                                                                                                                                                           |
| `firewall.kind.icmp`         | ping (ICMP)                                                                                                                                                   |
| `firewall.kind.all`          | any kind                                                                                                                                                      |
| `firewall.kind.classic`      | <kind></kind> (set in the classic interface)                                                                                                                  |
| `firewall.port_one`          | port <port></port>                                                                                                                                            |
| `firewall.portRange`         | ports <from></from> to <to></to>                                                                                                                              |
| `firewall.portNamed`         | <port></port> (<name></name>)                                                                                                                                 |
| `firewall.service.ssh`       | SSH                                                                                                                                                           |
| `firewall.service.thisPage`  | this web interface                                                                                                                                            |
| `firewall.service.web`       | the web interface                                                                                                                                             |
| `firewall.service.secureWeb` | secure web                                                                                                                                                    |
| `firewall.service.smb`       | Windows and Mac sharing                                                                                                                                       |
| `firewall.service.netbios`   | older Windows sharing                                                                                                                                         |
| `firewall.service.nfs`       | NFS                                                                                                                                                           |
| `firewall.service.rpcbind`   | NFS helper                                                                                                                                                    |
| `firewall.service.rsyncd`    | rsync server                                                                                                                                                  |
| `firewall.service.dns`       | name servers                                                                                                                                                  |
| `firewall.service.ntp`       | the clock                                                                                                                                                     |
| `firewall.service.mail`      | email                                                                                                                                                         |
| `firewall.who.any`           | Any computer                                                                                                                                                  |
| `firewall.who.one`           | The computer at <address></address>                                                                                                                           |
| `firewall.who.network`       | Computers on <network></network> (<count></count> addresses)                                                                                                  |
| `firewall.who.range`         | Computers from <first></first> to <last></last>                                                                                                               |
| `firewall.who.except`        | Every computer except <who></who>                                                                                                                             |
| `firewall.who.nasSide`       | to the NAS's address <address></address>                                                                                                                      |
| `firewall.note.self`         | This NAS talking to itself                                                                                                                                    |
| `firewall.note.replies`      | Replies to connections this NAS starts                                                                                                                        |
| `firewall.note.classic`      | Other options: <options></options> (set in the classic interface)                                                                                             |
| `firewall.moveUp`            | Move rule {{n}} up                                                                                                                                            |
| `firewall.moveDown`          | Move rule {{n}} down                                                                                                                                          |
| `firewall.change`            | Change…                                                                                                                                                       |
| `firewall.delete`            | Delete…                                                                                                                                                       |
| `firewall.orderUnsaved`      | The new order is not saved.                                                                                                                                   |
| `firewall.saveOrder`         | Save the new order                                                                                                                                            |
| `firewall.discardOrder`      | Discard                                                                                                                                                       |
| `firewall.orderChanged`      | The rules were changed since you opened them. Their new order is shown; move them again.                                                                      |
| `firewall.empty`             | No firewall rules. Every computer that can reach the NAS can use all of its services. Add a rule to refuse or allow traffic.                                  |
| `firewall.loadFailed`        | Could not read the firewall rules.                                                                                                                            |
| `firewall.sshUnread`         | Could not read the SSH settings, so SSH is not checked.                                                                                                       |
| `firewall.classicLink`       | Firewall in the classic interface                                                                                                                             |
| `fwRule.titleNew`            | Add a firewall rule                                                                                                                                           |
| `fwRule.titleChange`         | Change rule <n></n>                                                                                                                                           |
| `fwRule.direction`           | Direction                                                                                                                                                     |
| `fwRule.dir.in`              | Coming in to the NAS                                                                                                                                          |
| `fwRule.dir.out`             | Going out from the NAS                                                                                                                                        |
| `fwRule.then`                | Then                                                                                                                                                          |
| `fwRule.logGo`               | Note in the log and carry on                                                                                                                                  |
| `fwRule.kind`                | Kind of traffic                                                                                                                                               |
| `fwRule.port`                | Port                                                                                                                                                          |
| `fwRule.anyPort`             | Any port                                                                                                                                                      |
| `fwRule.otherPort`           | Another port or range…                                                                                                                                        |
| `fwRule.portField`           | Port or range                                                                                                                                                 |
| `fwRule.portHint`            | One port, such as 22, or a range, such as 1024-65535.                                                                                                         |
| `fwRule.portOnlyTcpUdp`      | A port can be chosen only for TCP or UDP.                                                                                                                     |
| `fwRule.from`                | From                                                                                                                                                          |
| `fwRule.to`                  | To                                                                                                                                                            |
| `fwRule.range`               | A range of addresses                                                                                                                                          |
| `fwRule.rangeFirst`          | First address                                                                                                                                                 |
| `fwRule.rangeLast`           | Last address                                                                                                                                                  |
| `fwRule.classicValue`        | <value></value> (set in the classic interface)                                                                                                                |
| `fwRule.remove`              | Remove                                                                                                                                                        |
| `fwRule.where`               | Where                                                                                                                                                         |
| `fwRule.where.end`           | At the end of the list                                                                                                                                        |
| `fwRule.where.top`           | At the top                                                                                                                                                    |
| `fwRule.where.before`        | Before rule <n></n>                                                                                                                                           |
| `fwRule.note`                | Note                                                                                                                                                          |
| `fwRule.cancel`              | Cancel                                                                                                                                                        |
| `fwRule.add`                 | Add rule                                                                                                                                                      |
| `fwRule.save`                | Save rule                                                                                                                                                     |
| `fwRule.saving`              | Saving…                                                                                                                                                       |
| `fwRule.saved`               | The rule is saved. It takes effect when you apply the changes.                                                                                                |
| `fwRule.err.then`            | Choose what happens to this traffic.                                                                                                                          |
| `fwRule.err.port`            | Write one port from 1 to 65535, or a range such as 1024-65535.                                                                                                |
| `fwRule.err.range`           | The first address must come before the last.                                                                                                                  |
| `fwRule.err.address`         | Write one IPv4 address, a network such as 192.0.2.0/24, or a range.                                                                                           |
| `fwBlock.title`              | Block everything else coming in                                                                                                                               |
| `fwBlock.adds`               | This adds three rules at the end of the list:                                                                                                                 |
| `fwBlock.self`               | Allow all traffic of this NAS talking to itself                                                                                                               |
| `fwBlock.selfWhy`            | Programs on the NAS talk to each other this way.                                                                                                              |
| `fwBlock.replies`            | Allow replies to connections this NAS starts                                                                                                                  |
| `fwBlock.repliesWhy`         | So updates, email notifications, the clock and name lookups keep working.                                                                                     |
| `fwBlock.refuse`             | Refuse all other traffic coming in.                                                                                                                           |
| `fwBlock.after`              | After it, only what the rules above allow can reach the NAS. Anything you have not allowed, such as Windows and Mac sharing or a media player, stops working. |
| `fwBlock.notAllowed`         | Nothing above allows this page, so it would be blocked. Allow it first.                                                                                       |
| `fwBlock.allowPage`          | Allow this page for <network></network>…                                                                                                                      |
| `fwBlock.cancel`             | Cancel                                                                                                                                                        |
| `fwBlock.confirm`            | Add the three rules                                                                                                                                           |
| `fwDelete.title`             | Delete rule <n></n>?                                                                                                                                          |
| `fwDelete.lostBlock`         | After the changes are applied, <who></who> can reach <what></what> again, unless a rule below refuses it.                                                     |
| `fwDelete.lostAllow`         | After the changes are applied, the rules below it decide what happens to this traffic.                                                                        |
| `fwDelete.lostLog`           | This traffic is no longer noted in the system log.                                                                                                            |
| `fwDelete.cancel`            | Cancel                                                                                                                                                        |
| `fwDelete.confirm`           | Delete rule                                                                                                                                                   |
| `fwDelete.done`              | Rule <n></n> is deleted. This takes effect when you apply the changes.                                                                                        |

---

## 12. Network > Proxy

**Question it answers:** does the NAS use a proxy to reach the internet? **Leads to:** setting one.

Route `/network/proxy`; the menu item "Proxy" gains the route.

### 12.1 Data

`Network.getProxy` (each password replaced by whether it is set), refreshed on opening and window
focus; again before the save (R4).

### 12.2 Layout

1. Page title "Proxy". Intro: `network.term.proxy`, then "The NAS uses it to download updates and
   software, and programs run at the command line use it to reach the internet. This page itself does
   not go through it."
2. Three cards, one form: **"Web (HTTP)"**, **"Secure web (HTTPS)"**, **"File transfer (FTP)"**. In
   each:
   - **"Use a proxy for {{kind}}"** (`CheckboxField`); the fields below are enabled when it is ticked;
   - **Proxy address** (`TextField`, a computer's name or address; placeholder `proxy.example.org`);
   - **Port** (`NumberField`, 1 to 65535; OMV's defaults 8080, 4443 and 2121 for new values);
   - **User name** (`TextField`, optional);
   - **Password**: 12.3.
3. **Save** (filled primary), "Discard changes". Saving is **Not affected** (0.5): to the band.
4. Footer: `ExternalLink` "Proxy in the classic interface" → `/#/network/proxy`.

### 12.3 Passwords

For each of the three with a stored password (`x-omv-presence` true), whether or not that proxy is
ticked, the card shows "Password: Set" and a required choice (0.6, P9):

- **"Keep it: type it again"** (`SecretField`), or
- **"Remove the stored password"**.

Without a stored password: an optional "Password" field. The save is unavailable until every stored
password is typed again or removed, with "Type the stored password again, or remove it, for: {{list}}."

### 12.4 States

| State       | Look                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Loading     | Skeletons of the three cards                                                                    |
| Read failed | `EmptyState variant="error"`: "Could not read the proxy settings." + message + "Try again"      |
| Saving      | Save shows "Saving…"                                                                            |
| Saved       | Toast "The proxy settings are saved. They take effect when you apply the changes." and the band |

### 12.5 Copy

| Key                   | English                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy.title`         | Proxy                                                                                                                                                         |
| `proxy.uses`          | The NAS uses it to download updates and software, and programs run at the command line use it to reach the internet. This page itself does not go through it. |
| `proxy.http`          | Web (HTTP)                                                                                                                                                    |
| `proxy.https`         | Secure web (HTTPS)                                                                                                                                            |
| `proxy.ftp`           | File transfer (FTP)                                                                                                                                           |
| `proxy.use`           | Use a proxy for <kind></kind>                                                                                                                                 |
| `proxy.host`          | Proxy address                                                                                                                                                 |
| `proxy.port`          | Port                                                                                                                                                          |
| `proxy.user`          | User name                                                                                                                                                     |
| `proxy.password`      | Password                                                                                                                                                      |
| `proxy.passwordSet`   | Password: Set                                                                                                                                                 |
| `proxy.keep`          | Keep it: type it again                                                                                                                                        |
| `proxy.remove`        | Remove the stored password                                                                                                                                    |
| `proxy.needPasswords` | Type the stored password again, or remove it, for: <list></list>.                                                                                             |
| `proxy.save`          | Save                                                                                                                                                          |
| `proxy.discard`       | Discard changes                                                                                                                                               |
| `proxy.saving`        | Saving…                                                                                                                                                       |
| `proxy.saved`         | The proxy settings are saved. They take effect when you apply the changes.                                                                                    |
| `proxy.loadFailed`    | Could not read the proxy settings.                                                                                                                            |
| `proxy.err.host`      | Write the proxy's name or address, such as proxy.example.org.                                                                                                 |
| `proxy.err.port`      | Write a port from 1 to 65535.                                                                                                                                 |
| `proxy.classicLink`   | Proxy in the classic interface                                                                                                                                |

---

## 13. How the network fits the other pages

### 13.1 The pending band

1.8 replaces the band's general connection warning with the check; `pending/modules.ts`'s
`mayCutConnection` becomes the module set that triggers the check (`systemd-networkd`, `hosts`,
`hostname`, `iptables`), and stays as it is for `nginx`, `phpfpm` and `certificates`, which this slice
does not change. The band's apply gains 1.5's wait whenever a network module is pending. Undo gains
10.4's line when an interface was removed.

### 13.2 Dashboard

The network card (the monitoring domain's 1.5) keeps its layout: each row's name becomes a router link
to the interface's page, the row this page uses gains "This page uses it" (0.4, `text-sm`), and the
footer link becomes the router link "Network interfaces" → `/network/interfaces`. Still no status
colour.

### 13.3 The set-up checklist and the top bar

The checklist's name item (Phase 3) changes its classic link to the router link "Change the name" →
`/network/general`. The top bar's host name comes from the shell's `System.getInformation`, which is
read again after every apply, so a new name appears there once applied, not when saved.

### 13.4 Shared folders and services

The addresses the shares and services slices build from the host name (`\\NAS_HOST\share`, the NFS and
rsync addresses) read the shell's name and follow it after apply; nothing changes there. The SSH page
(`/services/ssh`) adds one line when the firewall check (11.5) finds SSH blocked for every computer:
"The firewall blocks SSH for every computer." with a router link to the firewall page.

### 13.5 HTTPS, later

The system slice's "Use a secure connection" (UX audit Flow E) moves the page too. It reuses 1.5's
wait, the moved card and the recovery card as they are.

---

## 14. A normal user, navigation and routes

### 14.1 A normal user

Nothing new. Every method here is administrator-only. A normal user who types one of these addresses
gets the "only administrators" page, and nothing is called first (UI-4).

### 14.2 Navigation and routes

| Route                                                                   | Page   | Menu                                           | Notes                                                                                                                 |
| ----------------------------------------------------------------------- | ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/network/general`                                                      | 2      | Network > General (exists; gains its route)    | The menu keeps OMV's word; the page title says what it is                                                             |
| `/network/interfaces`                                                   | 3      | Network > Interfaces (exists; gains its route) |                                                                                                                       |
| `/network/interfaces/$iface`                                            | 4      | none (Interfaces current)                      | `$iface` a validated interface name; nothing in it names a call                                                       |
| `/network/interfaces/add/port`                                          | 5      | none                                           | Opens the form; no step runs on load (R9); a port chosen on another page is handed over in memory, not in the address |
| `/network/interfaces/add/wifi`, `/add/bond`, `/add/vlan`, `/add/bridge` | 6 to 9 | none                                           | As above                                                                                                              |
| `/network/firewall`                                                     | 11     | Network > Firewall (exists; gains its route)   | With P2, the IPv6 tab is a page state, not a route                                                                    |
| `/network/proxy`                                                        | 12     | Network > Proxy (exists; gains its route)      |                                                                                                                       |

The `add/…` routes have two segments after `interfaces`, so they never collide with an interface's
page, which has one. The change flow (1.4) has no route of its own (R9). Each item's classic link moves
to its page's footer, as every built page's does.

---

## 15. Backend methods

### 15.0 Methods that need the owner's clearance

The methods cleared on 2026-11-23 cover the name, the interfaces, the IPv4 firewall and the proxy. The
IPv6 firewall needs two more. Both are administrator-only (read from source).

| Method                                         | Why it is needed                                                                                                                                                     | What is lost without it                                                                                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`Iptables.getRules6`** (no parameters)       | Reading the IPv6 rules, so the firewall page can show them and the check (11.5) can tell whether they block a page reached over IPv6                                 | IPv6 rules are neither shown nor checked; the page says they are in the classic interface (11.3, 5); a page reached over IPv6 cannot be checked against them, so a pending IPv6 rule change makes the band's check **May cut** for such a page |
| **`Iptables.setRules6`** (the whole IPv6 list) | Reordering IPv6 rules, as `setRules` does for IPv4. Adding, changing and deleting one rule already work through `setRule` and `deleteRule`, which take either family | IPv6 rules can be added, changed and deleted (with `getRules6`) but not reordered                                                                                                                                                              |

**Not asked for, said plainly:** none. `enumerateDevices`, `enumerateConfiguredDevices` and the five
type-named getters are cleared but not needed (15.3).

### 15.1 The facts read from source, per method

Every method checks the administrator role. OMV ignores parameters its RPC datamodel does not name,
except where noted, and booleans and integers must be real JSON booleans and integers. "Marks pending"
is through the engine modules' listeners, **[verify]** each by `dirtyModules`.

| Method                                                                                                                 | Parameters (from the datamodel)                                                                                                                                                                                                                                                                                                                     | Marks pending                                                                                               | Task    | Quirks read from source                                                                                                                                                                                                                                                                                                              | Contract notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Network.getGeneralSettings`                                                                                           | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | `hostname`, `domainname`                                                                                                                                                                                                                                                                                                             | Exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Network.setGeneralSettings`                                                                                           | `hostname` (OMV's host-name format: 1 to 63 letters, digits and hyphens, no hyphen at either end), `domainname` (OMV's domain format, or empty); both required                                                                                                                                                                                      | `systemd-networkd`, `hosts`, `hostname`, `avahi`, `postfix`, `samba`                                        | no      | The stored model also refuses `local`, `example`, `invalid` and `test`. The system name is set in lower case                                                                                                                                                                                                                         | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: access` (a page opened by name loses it). Stricter: `hostname` lower case only; `domainname` at most 253 and not the four                                                                                                                                                                                                                                                                                                                          |
| `Network.enumerateDevicesList`                                                                                         | paging fields                                                                                                                                                                                                                                                                                                                                       | nothing                                                                                                     | no      | Every device the system has, with its stored settings when it has any; `wpapsk` included                                                                                                                                                                                                                                             | Exists; `x-omv-omit: [data[].wpapsk]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Network.getInterfaceList`                                                                                             | paging fields, `search`                                                                                                                                                                                                                                                                                                                             | nothing                                                                                                     | no      | The stored objects with `_used`, `_readonly` (a bond's port) and `slaves` as a list; `dnsnameservers` and `dnssearch` space-separated as stored; **`wpapsk` included**                                                                                                                                                               | **New, cleared.** Read-only. `x-omv-presence: [data[].wpapsk]`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Network.getInterface`                                                                                                 | `uuid`                                                                                                                                                                                                                                                                                                                                              | nothing                                                                                                     | no      | The stored object; `dnsnameservers` and `dnssearch` comma-separated; `slaves` a list; **`wpapsk` included**; any type                                                                                                                                                                                                                | **New, cleared.** `x-omv-presence: [wpapsk]`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Network.getInformation`                                                                                               | `devicename` (no pattern)                                                                                                                                                                                                                                                                                                                           | nothing                                                                                                     | no      | What the device uses now: one address per family (the first global one; IPv6 falls back to the link-local one), its router addresses, hardware address, packet size, state, link, speed, counters; no stored setting and no secret. For a name the system does not have, the defaults (`state` "UNKNOWN", empty fields) **[verify]** | **New, cleared.** Read-only. Stricter: `devicename` a kernel interface name (1 to 15 characters, no `/`, space or control character)                                                                                                                                                                                                                                                                                                                                                                    |
| `Network.identify`                                                                                                     | `devicename`, `seconds` (1 to 30)                                                                                                                                                                                                                                                                                                                   | nothing                                                                                                     | **yes** | Blinks the port's light; OMV's own note says communication is not possible during the time                                                                                                                                                                                                                                           | **New, cleared.** `x-omv-task`; `x-omv-destructive: service`. Stricter: `devicename` as above; `seconds` one of 5, 10, 15, 30                                                                                                                                                                                                                                                                                                                                                                           |
| `Network.getEthernetCandidates`                                                                                        | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | Ethernet devices with no settings, as `getInformation` rows                                                                                                                                                                                                                                                                          | **New, cleared.** Read-only; a list reply, no secret                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Network.setEthernetIface`                                                                                             | 18, all required: `uuid`, `devicename`, `method`, `address`, `netmask`, `gateway`, `routemetric`, `method6`, `address6`, `netmask6` (integer), `gateway6`, `routemetric6`, `dnsnameservers`, `dnssearch` (comma, semicolon or space lists), `mtu`, `wol`, `comment`, `altmacaddress`. No pattern on `devicename`, `address`, `netmask` or `gateway` | New: `systemd-networkd`, `hosts`, `avahi`, `halt`, `issue`, `collectd`. Change: the same without `collectd` | no      | Refuses a second interface of the same type and name. Replies with the stored object, `wpapsk` included (empty)                                                                                                                                                                                                                      | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: access`; `x-omv-omit: [wpapsk]`. Stricter: each address field an IPv4 or IPv6 address or empty, by its method; `netmask` the dotted form; `dnsnameservers` addresses, `dnssearch` domains; `mtu` 0 or 576 to 9216; `altmacaddress` a unicast address or empty; `devicename` a kernel interface name; `comment` one line, at most 255                                                                                                               |
| `Network.enumerateBondSlaves`                                                                                          | `uuid`, `unused` (both required)                                                                                                                                                                                                                                                                                                                    | nothing                                                                                                     | no      | With `unused`: Ethernet devices with no settings and in no bond, bridge or VLAN; for an existing bond, also its ports                                                                                                                                                                                                                | **New, cleared.** Read-only; a list reply                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Network.setBondIface`                                                                                                 | `setEthernetIface`'s fields except `altmacaddress`, plus `slaves` (Ethernet names), `bondprimary`, `bondmode` (0 to 6), `bondmiimon`, `bonddowndelay`, `bondupdelay`                                                                                                                                                                                | as an interface                                                                                             | no      | **Reads `bondtransmithashpolicy`, which its datamodel does not name**; refuses an empty `bondprimary` in modes 1, 5 and 6; refuses a new bond whose port is in another bond; a new bond's `devicename` is chosen by OMV                                                                                                              | **New, cleared.** As `setEthernetIface`. Stricter: `slaves` at least one; `bondprimary` one of `slaves` or empty by mode; `bondtransmithashpolicy` declared, one of OMV's five                                                                                                                                                                                                                                                                                                                          |
| `Network.getVlanCandidates`                                                                                            | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | Interfaces with settings that are not VLANs                                                                                                                                                                                                                                                                                          | **New, cleared.** Read-only; a list reply                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Network.setVlanIface`                                                                                                 | `setEthernetIface`'s fields plus `vlanid` (1 to 4095), `vlanrawdevice`                                                                                                                                                                                                                                                                              | as an interface                                                                                             | no      | Names it `{{parent}}.{{id}}` itself; no check that the parent has settings                                                                                                                                                                                                                                                           | **New, cleared.** As `setEthernetIface`. Stricter: `vlanid` 1 to 4094                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Network.getWirelessCandidates`                                                                                        | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | Wi-Fi devices with no settings                                                                                                                                                                                                                                                                                                       | **New, cleared.** Read-only; a list reply                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Network.setWirelessIface`                                                                                             | `setEthernetIface`'s fields plus `band`, `wpassid`, `wpapsk`, `keymanagement` (`psk`, `sae`), `hidden`; all required                                                                                                                                                                                                                                | as an interface                                                                                             | no      | **`wpapsk` is required and stored as sent**: an empty one replaces the stored password. No length check. Replies with it                                                                                                                                                                                                             | **New, cleared.** As `setEthernetIface`; `wpapsk` `x-omv-secret`, 8 to 63 characters or 64 hexadecimal digits; `wpassid` 1 to 32 bytes, no control character; `x-omv-omit: [wpapsk]`                                                                                                                                                                                                                                                                                                                    |
| `Network.enumerateBridgeSlaves`                                                                                        | `uuid`, `unused`                                                                                                                                                                                                                                                                                                                                    | nothing                                                                                                     | no      | With `unused`: devices with no Ethernet settings, in no bond, bridge or VLAN, except bridges, Wi-Fi and loopback; for an existing bridge, also its interfaces **[verify]** whether a bond with settings is listed                                                                                                                    | **New, cleared.** Read-only; a list reply                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Network.setBridgeIface`                                                                                               | `setEthernetIface`'s fields except `altmacaddress`, plus `slaves` (Ethernet, bond and VLAN names); `devicename` `br` and a number, or empty                                                                                                                                                                                                         | as an interface                                                                                             | no      | Refuses a new bridge whose interface is in another bridge; a new bridge's name is chosen by OMV                                                                                                                                                                                                                                      | **New, cleared.** As `setEthernetIface`. Stricter: `slaves` never an interface with settings of its own (checked by the page; the schema keeps OMV's names)                                                                                                                                                                                                                                                                                                                                             |
| `Network.deleteInterface`                                                                                              | `uuid`                                                                                                                                                                                                                                                                                                                                              | the interface's modules, `collectd`, and `task`                                                             | no      | **Queues a job** that switches the interface off and clears its addresses (and removes a bond, VLAN or bridge), run at apply. No check that a VLAN runs on it. Replies with the deleted object, `wpapsk` included                                                                                                                    | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: access`; `x-omv-omit: [wpapsk]`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Network.getProxy`                                                                                                     | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | Fifteen flattened fields, **the three passwords included**                                                                                                                                                                                                                                                                           | **New, cleared.** `x-omv-presence: [httppassword, httpspassword, ftppassword]`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Network.setProxy`                                                                                                     | fifteen, all required; passwords one line                                                                                                                                                                                                                                                                                                           | `apt`, `profile`                                                                                            | no      | Replies in the stored, nested shape (`http.password` and so on), passwords included                                                                                                                                                                                                                                                  | **New, cleared.** `x-omv-dirty`; the passwords `x-omv-secret`; `x-omv-omit: [http.password, https.password, ftp.password]`. Stricter: hosts a name or address, or empty                                                                                                                                                                                                                                                                                                                                 |
| `Iptables.getRules`                                                                                                    | none                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                     | no      | The IPv4 rules as stored, in no guaranteed order                                                                                                                                                                                                                                                                                     | **New, cleared.** Read-only; a list reply, no secret; the page sorts by `rulenum`                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Iptables.getRule`                                                                                                     | `uuid`                                                                                                                                                                                                                                                                                                                                              | nothing                                                                                                     | no      | One rule                                                                                                                                                                                                                                                                                                                             | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Iptables.setRule`                                                                                                     | 12, all required: `uuid`, `rulenum` (-1 or more), `chain` (`INPUT`, `OUTPUT`), `action` (`ACCEPT`, `REJECT`, `DROP`, `LOG`, empty), `family` (`inet`, `inet6`), `source`, `sport`, `destination`, `dport`, `protocol`, `extraoptions`, `comment`. The addresses, ports and options are free text                                                    | `iptables`                                                                                                  | no      | `rulenum` -1 adds it at the end; other numbers are kept as sent, without renumbering the rest                                                                                                                                                                                                                                        | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: access`. Stricter: `family` `inet` (and `inet6` with P2); `protocol` exactly one of `tcp`, `udp`, `icmp` (`icmpv6` for IPv6), `all`, each optionally with `!`; ports one port or range, optionally with `!`, or empty; addresses one address, network or range of the family, optionally with `!`, or empty; `extraoptions` any string (the interface writes only empty, 11.6's two values, or the value it read); `comment` one line, at most 255 |
| `Iptables.setRules`                                                                                                    | a list of `setRule`'s objects without `-1` and with `family` `inet`                                                                                                                                                                                                                                                                                 | `iptables`                                                                                                  | no      | Removes every IPv4 rule and stores the list; every rule gets a new identifier                                                                                                                                                                                                                                                        | **New, cleared.** As `setRule`, for each item                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Iptables.deleteRule`                                                                                                  | `uuid`                                                                                                                                                                                                                                                                                                                                              | `iptables`                                                                                                  | no      | Replies with the deleted rule                                                                                                                                                                                                                                                                                                        | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: access`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Iptables.getRules6`, `setRules6`                                                                                      | as the IPv4 pair, `family` `inet6`                                                                                                                                                                                                                                                                                                                  | `iptables`                                                                                                  | no      |                                                                                                                                                                                                                                                                                                                                      | **To clear** (15.0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Config.applyChangesBg`, `revertChangesBg`, `System.getInformation`, `WebGui.getSettings`, `SSH.get`, `Exec.getOutput` | as in the contract                                                                                                                                                                                                                                                                                                                                  |                                                                                                             |         |                                                                                                                                                                                                                                                                                                                                      | Exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 15.2 Every request in this slice

| Method                                                                                                                        | Where                                                  | When                                              | Kind       | Contract status     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- | ---------- | ------------------- |
| `Network.getGeneralSettings`                                                                                                  | every network page (0.4), General                      | open, focus, before a write                       | foreground | Exists              |
| `Network.setGeneralSettings`                                                                                                  | General, the flow, Put back                            | after the reader's action                         | foreground | New, cleared        |
| `Network.enumerateDevicesList`                                                                                                | every network page (0.4), Interfaces, the flow's watch | open, Refresh, focus, before a write, after apply | foreground | Exists              |
| `Network.getInterfaceList`                                                                                                    | Interfaces, an interface's page, the band's check      | open, Refresh, focus, before apply                | foreground | New, cleared        |
| `Network.getInterface`                                                                                                        | the forms, the flow                                    | open, before a write                              | foreground | New, cleared        |
| `Network.getInformation`                                                                                                      | an interface's page                                    | open, Refresh, focus                              | foreground | New, cleared        |
| `Network.identify`                                                                                                            | Blink its light                                        | after a confirmation                              | task       | New, cleared        |
| `Network.getEthernetCandidates`, `getWirelessCandidates`, `getVlanCandidates`, `enumerateBondSlaves`, `enumerateBridgeSlaves` | "Set up…" and the forms                                | open                                              | foreground | New, cleared        |
| `Network.setEthernetIface`, `setWirelessIface`, `setBondIface`, `setVlanIface`, `setBridgeIface`                              | the forms, the flow, Put back                          | after the reader's action                         | foreground | New, cleared        |
| `Network.deleteInterface`                                                                                                     | Remove settings, Put back                              | after a confirmation                              | foreground | New, cleared        |
| `Network.getProxy`, `setProxy`                                                                                                | Proxy                                                  | open, before a write; Save                        | foreground | New, cleared        |
| `Iptables.getRules`, `getRule`                                                                                                | Firewall, the band's check, the SSH page's line        | open, focus, before a write, before apply         | foreground | New, cleared        |
| `Iptables.setRule`, `setRules`, `deleteRule`                                                                                  | Firewall, the flow, Put back                           | after the reader's action                         | foreground | New, cleared        |
| `Iptables.getRules6`, `setRules6`                                                                                             | Firewall (IPv6 tab)                                    | as the IPv4 pair                                  | foreground | **To clear** (15.0) |
| `System.getInformation`                                                                                                       | the flow's watch (1.5)                                 | every 2 seconds while waiting                     | background | Exists              |
| `WebGui.getSettings`, `SSH.get`                                                                                               | the connection (0.4), the firewall check               | open                                              | foreground | Exist               |
| `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.getOutput`                                                           | the flow, the band, 10.4                               | after a confirmation                              | task       | Exist               |

Paging reads send all five fields with `limit: null` (or `-1` where the monitoring domain observed it)
for a whole list. Every captured example is scrubbed before commit (AGENTS.md rule 2): the host name
becomes `NAS_HOST`, domains `example.org`, addresses come from 192.0.2.0/24, 198.51.100.0/24,
203.0.113.0/24 and 2001:db8::/32, hardware addresses from the documentation range
`00:00:5e:00:53:00` to `00:00:5e:00:53:ff`, Wi-Fi network names become `EXAMPLE-NETWORK`, every
password becomes `EXAMPLE-PASSWORD` (so the transport's removal is proved on the mock), proxies become
`proxy.example.org`, and UUIDs are replaced.

### 15.3 Not used, and kept out of the contract

`Network.enumerateDevices` and `enumerateConfiguredDevices`: they return the same rows as
`enumerateDevicesList` and `getInterfaceList`, but as a bare list, and `x-omv-omit` and
`x-omv-presence` need an object reply to reach the Wi-Fi password in each row (docs/04); the paged
methods carry the same data in an object (D6). `getEthernetIface`, `getBondIface`, `getVlanIface`,
`getWirelessIface` and `getBridgeIface`: each is `getInterface` under another name (read from source).

---

## 16. Components

### 16.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer), contributed back to the
library.

| Component                    | Why                                                                                                                            | States to cover                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ConnectionLine`** (new)   | 0.4's line, every variant, with its icon, as a status                                                                          | each row of 0.4; long names; an IPv6 address; right-to-left surrounding text; 320 px                                                                                 |
| **`ImpactLine`** (new)       | 0.5's class words with a shape per class (none, a pause icon, an arrow, the warning shape), live as a form changes             | each class; with and without the specific line; reduced motion                                                                                                       |
| **`AddressFields`** (new)    | 5.2's IPv4, IPv6 and name-server fieldsets with their checks and the network-size readout; used by every kind of interface     | each method of each family; every error of 5.3; the three network-size forms; the refused-family line; disabled with a reason; long locale labels; 320 px; 200% zoom |
| **`NowAfterTable`** (new)    | 1.4's comparison of settings                                                                                                   | changed and unchanged rows; long values; stacked under 640 px with labels                                                                                            |
| **`ReconnectWatch`** (new)   | 1.5: waiting with elapsed time, connected again, the moved card, sign-in needed, stop waiting                                  | each outcome; reduced motion; the elapsed time announced every 15 seconds, not every tick                                                                            |
| **`RecoveryCard`** (new)     | 1.6's variants and steps; renders with no network and no catalogue fetch                                                       | each variant; every step on and off; commands in mono; dark theme; 320 px                                                                                            |
| **`FirewallRuleList`** (new) | 11.3's ordered table with move buttons and the unsaved-order bar                                                               | 0, 1 and 200 rules; first and last rows' move buttons unavailable; classic values; the two fixed rules; unsaved order; keyboard moves keeping focus                  |
| **`PortField`** (new)        | 11.4's port: any, known ports by name, another port or range                                                                   | each; an invalid port and range; disabled for ping and any kind                                                                                                      |
| `ClientField` (extend)       | A fourth choice, a range of addresses; IPv4-only and IPv6-only modes; a stored `!` value shown as set in the classic interface | the new choice valid and invalid; each mode; the classic value                                                                                                       |
| `SecretField` (extend)       | 12.3's "Keep it: type it again" or "Remove the stored password"                                                                | both; required; cleared after a request                                                                                                                              |

### 16.2 Reused as they are

`PreflightNotice`, `JobStepList`, `JobResult`, `JobFailure`, `AlsoPendingNotice`, `ConfirmDialog`,
`Dialog`, `TypeToConfirmField`, `FactList`, `Identifier`, `CopyButton`, `ExternalLink`,
`InlineAlert` (warning-shape neutral), `Disclosure`, `EmptyState`, `RadioGroupField`,
`SegmentedChoice`, `Select`, `CheckboxField`, `CheckboxListField`, `TextField`, `NumberField`,
`TextareaField`, `PageTabs`, `Menu`, `Card`, `Breadcrumbs`, `Skeleton`, `Status` (the Unknown ring).

### 16.3 In the app

- `network/connection.ts`: 0.4, with tests for every row: IPv4 and bracketed IPv6 literals (with a
  zone, as `[fe80::1%25eth0]`), the name forms in any case, the one-interface inference, virtual
  interfaces, members, `localhost`, a failed read.
- `network/impact.ts`: 0.5 from a before-and-after pair and the connection; 1.8 from stored settings
  against what is in use.
- `network/ip.ts`: IPv4 and IPv6 parsing and printing (RFC 5952), network sizes from a prefix or a
  mask, first and last addresses, membership in a network or range; shared with
  `services/clientRules.ts`, which moves its parsing here.
- `network/firewallCheck.ts`: 11.5's walk, with table-driven tests for every row of its two tables,
  including `!` values, ranges, LOG and empty actions, the two fixed rules and other options.
- `network/ruleWords.ts`: 11.3's words and known ports.
- `network/ifaceModel.ts`: rows, members and what runs on what, 0.8's refusals, 0.9's writes.
- `network/changeFlow.ts`: 1.4 to 1.7, in the session store as Flow A's (memory only), including the
  remembered settings for Put back, never a password.
- `network/recovery.ts`: which variant and steps 1.6 shows.
- `network/proxyModel.ts`, `network/generalModel.ts`.
- Pages: `NetworkGeneralPage`, `InterfacesPage`, `InterfacePage`, `AddInterfacePage` (one page, the
  kind from its route), `FirewallPage`, `ProxyPage`; `PendingChanges`, `DashboardPage`,
  `SetupChecklist` and the SSH page changed.

---

## 17. Mock scenarios to add

Written by hand from the captured shapes, remembering what the pages do (settings, rules, pending
changes, apply, undo, and the connection going and coming back), so every journey can be walked on
`pnpm dev:mock`. **The mock runs at `localhost`**, which 0.4 reads as a tunnel; each scenario
therefore sets the address the page appears to be opened at, through a development-only setting of
the mock (never in the production bundle: UI-11's build check covers it; D17).

| Scenario                       | What it shows                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `networkOne`                   | One port, automatic IPv4 and IPv6, the page opened at its IPv4 address                                                                                                 |
| `networkTwo`                   | Two ports, one with a fixed address and one not set up; the page at the fixed one                                                                                      |
| `networkByName`                | The page opened by name with one interface (probable), and with two (name only)                                                                                        |
| `networkUnknown`               | The page opened at an address no interface reports                                                                                                                     |
| `networkVpn`                   | The page reached through a virtual interface                                                                                                                           |
| `networkUnmanaged`             | The page's port has no settings here (P17)                                                                                                                             |
| `networkLayers`                | A bond of two ports with a VLAN on it, and a bridge with one interface; the page on the VLAN                                                                           |
| `networkWifi`                  | A Wi-Fi interface with a stored password (the example carries `EXAMPLE-PASSWORD`), Wi-Fi candidates, the page over Wi-Fi                                               |
| `networkPending`               | Stored settings that differ from what is in use; a pending firewall list that blocks the page; a pending removal (for 10.4)                                            |
| `networkApply`                 | Apply that loses the connection for 8 seconds then answers; never answers; answers with a 401; keeps answering at the old address                                      |
| `networkReadFails`             | Each read failing in turn                                                                                                                                              |
| `firewallNone`, `firewallSome` | No rules; a handful in plain cases                                                                                                                                     |
| `firewallAllowlist`            | Allow 192.0.2.0/24 then Block everything else with its two rules                                                                                                       |
| `firewallClassic`              | Rules with `!` addresses, a port on the other side, other options, "not TCP", Count only                                                                               |
| `firewallBlocksPage`           | A list that refuses the web port for every computer, and one that drops all replies going out                                                                          |
| `firewallMany`                 | 200 rules                                                                                                                                                              |
| `proxySet`                     | Three proxies, two with stored passwords                                                                                                                               |
| `networkHostile`               | Notes, network names and Wi-Fi names of 200 characters (32 bytes for the Wi-Fi name), right-to-left, and text that looks like markup; interface names of 15 characters |

---

## 18. Checks before calling it done

### 18.1 On the mock, and in every build

- Every page in both themes, at 1280 and 320 px and at 200% zoom; the tables scroll only in their own
  region; the forms are one column on narrow screens; the change flow's comparison stacks.
- A keyboard-only pass of each journey: change the name (band); change this page's fixed address
  through the flow with its typed confirmation, the wait and the moved card; turn this page's port to
  automatic and reach the recovery card; set up a second port; make a bond, a VLAN and a bridge;
  remove one; blink a port; add rules, move them with the buttons, Block everything else, delete one;
  save the proxy with a stored password typed again; Undo a removal (10.4).
- Screen reader: the connection line, the class line under Save (polite), the summary read in order,
  the typed confirmation's label with its value, each step's word, the wait (announced when it
  starts, every 15 seconds, and at its end), the recovery card (once, as an alert), the firewall
  check line, each rule's words, a move ("Rule moved to position 2.").
- Greyscale and the deficiency emulations: the impact classes and the firewall actions carry shapes
  and words; nothing is told by colour.
- The built output: no inline script or style, no third-party origin, no task handle in the DOM, no
  Wi-Fi or proxy password in any rendered or cached state (a test reads the query and mutation caches
  after each secret-bearing read and write on the mock, whose examples carry `EXAMPLE-PASSWORD`)
  (UI-1, UI-5, UI-6, UI-7); no link built from an address or name that came from a reply (a test
  over the moved and recovery cards: only values typed in the session become links, P7); the
  recovery card's strings in the main bundle (a build check); the mock's address setting absent
  (UI-11); the routes make no call on load beyond reads (UI-4); nothing written to browser storage
  but preferences (UI-13).
- `connection`, `impact`, `ip`, `firewallCheck` and `ruleWords` tests for every rule of 0.4, 0.5,
  0.8 and 11.5.

### 18.2 On the test VM: facts to verify

The VM (OMV 8.6.1) needs, before this slice's tests: a snapshot; **a second virtual network adapter
on its own network** (and a third for the bond and bridge tests), so the browser reaches the VM
through one adapter while another is changed; and the hypervisor's console at hand for the recovery
tests. The first adapter, which the test runner, SSH and the other slices' tests use, is never changed
by a test, except in #5, which runs last, through the second adapter, with the console ready, and
ends by reverting to the snapshot. Read-only captures first. Afterwards the VM is as before: the same
interfaces and settings, no rule, no proxy, the same name, nothing pending.

1. **Pending modules** by `dirtyModules` after each write alone: the name; a port set up, changed and
   removed; a bond, VLAN, bridge; a rule added, changed, reordered, deleted; the proxy. In particular
   `task` after a removal, and `collectd` for a new interface.
2. **Shapes**: `getInterfaceList` and `getInterface` for each kind, with `wpapsk` (on the mock for
   Wi-Fi: the VM has none) and the list separators; `enumerateDevicesList` for a bond, its ports, a
   VLAN and a bridge (`type`, `_readonly`, `slaves`); `getInformation` for a name the system does not
   have; which `address6` is reported with a global and a link-local address, and with two global
   ones; `getProxy`'s and `setProxy`'s replies; `getRules` and `setRules`' replies and the new
   identifiers.
3. **The name**: OMV's messages for `local`, `example`, a hyphen at the end, 64 characters; capitals
   sent; the `.local` name and the Windows name after a change, and the Windows name of a 16-character
   name; the router's view where one is available.
4. **What an apply interrupts**, timed from the browser on the first adapter: a change on the second
   adapter only (does the first drop at all?); a name-server change on the first; a packet size change
   on the second; adding and removing a VLAN on the second.
5. **The page's own address** (last, through the second adapter, with the console ready): a fixed
   address changed; when the old address stops answering and the new one starts; what the task helper
   sees (`Exec.getOutput` failing with no reply, and whether the handle still works if the old
   address answers again); the 401 at the new address (a new sign-in); fixed to automatic: whether the
   lease gives the same address; a new hardware address: whether it gives another; the recovery steps
   followed at the console, `omv-firstaid` "Configure network interface" removing every other
   interface's settings.
6. **Removing an interface's settings**: its address gone after apply; the queued job in place after
   Undo, and run by a later apply that includes `task` alone (and whether the interface then stays
   off); 10.4's forced apply clearing it.
7. **A port with no settings carrying the connection** (P17): with the second adapter configured
   outside OMV, whether an apply of an unrelated network change removes its address.
8. **Layers**: a VLAN's parent removed with the VLAN present (what netplan does); a bond without
   `bondtransmithashpolicy` (the error); a bond's hardware address and its lease; `bondmiimon` 0
   against 100 on pulling a port (on the VM: setting the virtual link down); whether
   `enumerateBridgeSlaves` lists a bond with settings; a VLAN on the same network as its parent.
9. **Blink**: on the VM's virtual adapter (most likely "Operation not supported"; its message), and
   whether traffic stops for its time.
10. **The firewall**: the default after an apply (let through); first-fit order; LOG goes on; a rule
    that fails stops the rest and leaves the earlier ones; 11.6's two fixed rules as OMV's script writes
    them, and updates, the clock and email after Block everything else; IPv4 rules leaving IPv6
    traffic alone; rules other programs added to the same lists removed by an apply; a rule blocking
    this page from the browser's network (from the console: the page is cut off, and
    `systemctl stop openmediavault-firewall` restores it).
11. **The proxy**: `apt` going through a proxy (or failing at a documentation address) after apply;
    the command-line environment's variables.
12. **The session**: with a router between the browser and the second adapter (where the VM's network
    allows it), whether a change that makes the NAS see the browser from another address ends the
    session ("Invalid IP address").
13. **`omv-firstaid` "Restore configuration backup"**: which copies exist after a network apply, and
    whether restoring one brings back network settings (N12).
14. **`setWirelessIface`** (no Wi-Fi on the VM): on the mock only, from the captured shapes of the
    other kinds; if Wi-Fi hardware becomes available, an empty password's effect and a wrong
    password's.

---

## 19. Adversarial pass

The main journeys walked twice more: changing this page's interface (a new fixed address, automatic,
a packet size) and adding rules up to Block everything else. Findings and what changed in this design:

### 19.1 Trying to break it

| Probe                                                                                    | Finding                                                                                            | Change made                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new fixed address mistyped (192.0.2.200 for 192.0.2.20)                                | The NAS moves to an address the reader did not mean, possibly on no network the computer can reach | The typed confirmation asks for the new address again (P6); the router-on-the-network check; the recovery card's "If you mistyped it" line           |
| A new address on another network                                                         | The browser cannot reach it, though the change "worked"                                            | The summary's effect line and the recovery card's same-network step; when the page's interface network differs from the new one, the summary says so |
| Fixed to automatic on this page's port                                                   | The new address is not knowable here                                                               | **May cut**, the 120-second wait at the old address, the recovery card's "find the address" step with the router list and `.local` as text           |
| Removing this page's port; making it a bond port                                         | Certain cut-off                                                                                    | **Refused**, with "connect another way first" (0.8, 10.1); OMV itself does not offer a port with settings for a bond                                 |
| The page opened by name with two ports, one removed                                      | Cannot tell which one carries the page                                                             | **May cut** with the typed confirmation, never Refused on a guess (0.5)                                                                              |
| A change saved in the classic interface, then Apply in the band here                     | The band would apply a cut-off with a generic warning                                              | 1.8 checks the server's state; Moves and May cut get the typed confirmation; a certain block makes Apply unavailable with Undo offered               |
| Two tabs: one in the flow, the other applying from the band                              | The flow's change rides the band's apply                                                           | R10 in the band lists the flow's modules as also pending; the flow's step 2 re-reads and refuses when the object changed                             |
| Reload while waiting after apply                                                         | The flow's memory is gone; the apply continues                                                     | R8: the pages read the state; the band shows anything still pending; Put back is no longer offered; the copied note is the way back                  |
| The session ends during the wait                                                         | The watch's reads answer 401                                                                       | "The NAS answers, but this page needs you to sign in again." (1.5), not "lost"                                                                       |
| The NAS is slow to come back (DHCP, a switch's port learning)                            | 60 seconds may be too short                                                                        | 120 seconds for automatic addresses; "Stop waiting" and "Try again" on the card; nothing is retried that writes (UI-14)                              |
| An allow-list for 192.0.2.0/24 while this computer comes over a VPN from 198.51.100.0/24 | This page cannot know which address this computer has                                              | **May cut** with "cannot tell", the typed confirmation, and the same-network hint only when it applies (11.5)                                        |
| A rule refusing "every computer except 192.0.2.10"                                       | `!` values turn "some" into "almost all"                                                           | `!` values count as some computers, named as "Every computer except …"; May cut                                                                      |
| A rule dropping every reply going out                                                    | This page is blocked though nothing coming in is                                                   | The walk covers replies going out; Refused                                                                                                           |
| A rule with other options from the classic interface decides                             | The check cannot read it                                                                           | "cannot tell" is May cut, never Not affected                                                                                                         |
| Block everything else with nothing allowing this page                                    | Certain cut-off                                                                                    | Refused, with "Allow this page for {{network}}…" filled in (11.6)                                                                                    |
| Block everything else without the replies rule                                           | Updates, the clock, email and name lookups stop                                                    | The two fixed rules are part of the action, in their own words (11.6, P11)                                                                           |
| 0 rules, 1, 200                                                                          | 200 rows with two move buttons each is a long list, but the check is one pass                      | Empty state; the table scrolls in its region; move buttons (no drag); `firewallMany`                                                                 |
| A wrong Wi-Fi password over Wi-Fi                                                        | The NAS cannot join; cut off                                                                       | May cut with the typed confirmation; the password never shown in the summary ("typed again")                                                         |
| Saving Wi-Fi or the proxy without the stored password                                    | OMV would store an empty password                                                                  | The password is required on every save (0.6, P8, P9)                                                                                                 |
| Undo after removing an interface                                                         | A queued job switches it off at a later, unrelated apply                                           | 10.4's line and forced apply (P14) **[verify]**                                                                                                      |
| A port carrying the page without settings here                                           | The next network apply may leave it without an address                                             | The Interfaces page leads with it and offers "Set it up as it is now" (P17) **[verify]**                                                             |
| The page reached at an IPv6 address the NAS does not report (a privacy address)          | It would match no interface                                                                        | Not known, which fails safe (0.4)                                                                                                                    |
| A VLAN's parent removed                                                                  | The VLAN is left with nothing to run on                                                            | Refused while a VLAN runs on it (0.8)                                                                                                                |
| A packet size of 9000 on this page's port with a switch that does not take it            | Cut off                                                                                            | May cut, with its own effect line                                                                                                                    |
| Capitals in the name; `local` as domain                                                  | OMV lower-cases the first and refuses the second                                                   | The hint says so; the refusal's own words (2.6)                                                                                                      |
| Blinking this page's port for 30 seconds                                                 | The page may stop responding                                                                       | The warning and the wait for the time chosen (4.4)                                                                                                   |
| Names, notes, Wi-Fi names of 200 characters, right-to-left, markup-like                  | Must stay text and not break sentences                                                             | Text only (UI-2); `dir="auto"` and isolation; `networkHostile`                                                                                       |
| A link to the new address                                                                | UI-3 forbids following an address from a reply                                                     | Links only from values typed in this session; addresses read from the NAS are text (P7)                                                              |
| The mock's apparent-address setting shipping                                             | It would let a setting choose what the page believes                                               | Development only, absent from the production bundle by build check (D17)                                                                             |

### 19.2 Without sight

- **Hearing the class**: a sighted reader sees "Review the change…" instead of "Save"; a screen
  reader hears it too, because the button's name changes and the class line under it is a polite live
  region. Found: the class line first sat above the fields, out of reading order after them; it now
  follows the buttons and is part of the Save button's description.
- **The typed confirmation**: its label includes the value to type, and the value is also in
  `Identifier` with a copy button, so it can be heard, read and copied.
- **The wait**: announced when it starts, every 15 seconds with the elapsed time, and at its end
  (polite; the recovery card assertive, once). Found: announcing every 2-second poll would chatter;
  only the elapsed time is announced, on its own schedule.
- **The recovery card**: an ordered list in reading order; the commands are code, read as written.
- **Moves in the firewall list**: each button names the rule's position ("Move rule 3 up"); after a
  move focus stays on the same button of the moved row, now at its new position, and a polite message
  says where it went. The first row's "Move up" and the last row's "Move down" are unavailable with a
  tooltip ("Already first").
- **Colour alone**: none. Firewall actions carry icons of different shapes and words; the impact
  classes carry shapes and words; interfaces have no status colour.
- **200% zoom and 320 px**: the comparison stacks with labels; the forms are one column; the tables
  scroll in their own region with the first column fixed; the unsaved-order bar wraps its buttons.

---

## 20. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID  | Decision                                                                                                                                                                                                                                                                                                             | Why                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D1  | Routes follow the classic interface's paths (`/network/general`, `/network/interfaces`, `/network/firewall`, `/network/proxy`) _(recommended)_                                                                                                                                                                       | Existing users recognise them; the menu items gain their routes                              |
| D2  | Page titles say what each is ("Name of this NAS", "Network interfaces", "Firewall rules", "Proxy"); the menu keeps OMV's words _(recommended)_                                                                                                                                                                       | The earlier slices' rule                                                                     |
| D3  | An interface's page is addressed by its **name** _(recommended)_                                                                                                                                                                                                                                                     | A port with no settings has no identifier, and the name is what the reader sees              |
| D4  | A new port gets IPv4 Automatic and IPv6 Off; a new VLAN, bond and bridge the same _(recommended)_                                                                                                                                                                                                                    | The classic form's defaults                                                                  |
| D5  | A new bond checks its ports' links every 100 ms _(recommended)_                                                                                                                                                                                                                                                      | The classic form's default; OMV's stored default checks nothing [verify]                     |
| D6  | `getInterfaceList` and `getInterface` for every kind; `enumerateDevices`, `enumerateConfiguredDevices` and the type-named getters unused _(recommended)_                                                                                                                                                             | Object replies the transport can clean; one read path                                        |
| D7  | Removing an interface's settings and deleting a rule use the destructive form without typing _(recommended)_                                                                                                                                                                                                         | They cut access or remove protection; nothing on a disk is lost, and Undo works before apply |
| D8  | No status colour for interfaces or firewall actions _(recommended)_                                                                                                                                                                                                                                                  | Settings and facts, not monitored states (the monitoring domain's D8)                        |
| D9  | Firewall rules are changed in dialogs; no route per rule _(recommended)_                                                                                                                                                                                                                                             | A reorder gives every rule a new identifier                                                  |
| D10 | A new rule has no action preselected _(recommended)_                                                                                                                                                                                                                                                                 | Allow and Refuse both have consequences; neither is a safe default                           |
| D11 | The watch polls every 2 seconds, for 60 seconds (same address), 120 (automatic) or 30 (moved) _(recommended)_                                                                                                                                                                                                        | Long enough for DHCP and a switch to settle; short enough to say something useful            |
| D12 | The recovery card's words are in the main bundle _(recommended)_                                                                                                                                                                                                                                                     | It must show when the NAS is gone                                                            |
| D13 | The name is sent in lower case _(recommended)_                                                                                                                                                                                                                                                                       | OMV lower-cases it anyway; the page shows what will be stored                                |
| D14 | VLAN IDs 1 to 4094 _(recommended)_                                                                                                                                                                                                                                                                                   | 4095 is reserved by the standard; OMV allows it                                              |
| D15 | Packet sizes 576 to 9216 bytes, at least 1280 with IPv6 _(recommended)_                                                                                                                                                                                                                                              | The ranges real networks use; IPv6 needs 1280                                                |
| D16 | Catalogue: `network.*` (terms, connection, impact), `netChange.*`, `netRecover.*`, `netApply.*`, `netGeneral.*`, `interfaces.*`, `iface.*`, `ifaceForm.*`, `ifaceBlink.*`, `ifaceDelete.*`, `wifi.*`, `bond.*`, `vlan.*`, `bridge.*`, `firewall.*`, `fwRule.*`, `fwBlock.*`, `fwDelete.*`, `proxy.*` _(recommended)_ | The system slice's HTTPS flow reuses `netChange.*` and `netRecover.*`                        |
| D17 | The mock's apparent address is a development-only scenario setting _(recommended)_                                                                                                                                                                                                                                   | The mock runs at `localhost`; production reads only `location`                               |
| D18 | New proxies get OMV's stored default ports (8080, 4443, 2121) _(recommended)_                                                                                                                                                                                                                                        | The classic form shows 8080 for HTTPS too; OMV's own default is 4443                         |
| D19 | Blinking offers 5, 10, 15 and 30 seconds, 10 by default _(recommended)_                                                                                                                                                                                                                                              | The classic form's choices                                                                   |
| D20 | Known ports are named in the firewall list, using the NAS's own SSH and web ports _(recommended)_                                                                                                                                                                                                                    | A number alone means nothing to most readers                                                 |

---

## 21. For the owner to agree

The clearance question, the scope, and the access-cutting, protection-removing and secret-handling
points of this slice. The design is built only once these are agreed. Each has a recommendation.

1. **P1, the safeguard.** No real roll-back is possible within the project's rules (1.1): OMV
   deletes its copy of the old settings at apply, uses `netplan apply` rather than `netplan try`, and
   has nothing that waits and acts; the plugin may add no daemon; this page can test no other address.
   **Recommended: A with B, and E** (1.2): know the connection; classify every change; refuse the
   certain self-cuts; apply a connection change on its own through a flow with the current settings to
   copy, the recovery steps to read first and a typed confirmation; watch afterwards and say plainly
   what happened; offer "Put back how it was" while the page still reaches the NAS; and suggest a
   trial apply to upstream. No countdown and no claim that anything goes back by itself.
   **Alternatives:** C, a timed roll-back through a scheduled task (needs `Cron.*`, which runs any
   command as the NAS's administrator, and is a backend in all but name); D, the gateway or a timer
   the package installs (against docs/05 today); F, leaving these changes to the classic interface,
   which has no safeguard.
2. **P2, two more methods.** `Iptables.getRules6` and `setRules6`, for the IPv6 firewall. **Recommended:
   clear them.** Without them, IPv6 rules stay in the classic interface and are not checked here
   (15.0). (`enumerateDevices`, `enumerateConfiguredDevices` and the type-named getters are cleared
   but not used: 15.3.)
3. **P3, the scope.** Built: the name; interfaces of every kind with blink and removal; IPv4 firewall
   rules (and IPv6 with P2) with Block everything else; the proxy; the safeguard. Left to the classic
   interface: four bond modes and the bond's timing settings, a rule's other options, `!` values and
   far-side ports (shown and kept), traffic charts. Three bond modes offered, in plain words.
   **Recommended: as written.** (Scope, 7.1)
4. **P4, which connection this page uses.** Worked out from the address the page was opened at, the
   interfaces' addresses and the NAS's name (0.4); "probably" when opened by name with one interface;
   "cannot tell" otherwise, which makes every interface change May cut and never Refused.
   **Recommended: as written.**
5. **P5, refusals.** Refused on this page's interface (or under it): removing its settings, turning
   off its family or both, making it part of a bond or bridge; refused everywhere: a firewall list that
   blocks this page for every computer, a router address off the network, an address another interface
   uses, a VLAN's parent with the VLAN still on it (0.8). Each says how to do it safely ("connect
   through another interface first"). **Recommended: as written.**
6. **P6, the typed confirmation** for Moves and May cut: the new address typed again when there is
   one (it doubles as a typing check), the new name when the page uses it, otherwise the interface's
   name (or "firewall"). **Recommended: as written.** The alternative is a plain confirmation with a
   tick box "I can reach the NAS another way". (1.4)
7. **P7, links to the new address.** A link may be built from an address or name the reader typed in
   this session, as Q7 allowed for HTTPS; an address or name read from the NAS (the `.local` name, an
   address in use) is shown as text with a copy button, never a link (UI-3). The link opens a new tab.
   **Recommended: as written.** The alternative is text everywhere. (1.5, 1.6)
8. **P8, the Wi-Fi password.** The transport removes it from every reply and the page says "Set";
   because OMV requires it on every save and stores what it is sent, every save of a Wi-Fi interface
   asks for it, the same or a new one. **Recommended: as written.** The alternative is to leave Wi-Fi
   to the classic interface. (0.6, 6)
9. **P9, the proxy passwords.** As P8: every save asks, for each stored password, to type it again or
   to remove it. **Recommended: as written.** (12.3)
10. **P10, the firewall in plain words.** Allow, Refuse, Ignore, Note in the log; coming in and going
    out; known ports named; no colour on actions; classic values kept and never rewritten silently;
    this interface writes no other options except 11.6's two. **Recommended: as written.** (11)
11. **P11, Block everything else.** One action adding three rules: the NAS talking to itself, replies
    to its own connections, then refuse the rest; refused when nothing above allows this page, with an
    offer to allow it for this page's network. The two allowing rules are the only other options this
    interface writes, from a fixed list. **Recommended: as written.** The alternative is no catch-all
    rule here at all. (11.6)
12. **P12, pending changes.** Changes that move or may cut this page go through the change flow, which
    refuses to start while anything else is pending and applies only its own change; everything else
    goes to the band, whose apply confirmation runs the same check on the server's state and refuses
    a certain cut-off with Undo offered. **Recommended: as written.** (1.4, 1.8)
13. **P13, destructive confirmations.** Removing an interface's settings and deleting a rule: the
    destructive form, naming the object and what is lost, without typing. **Recommended: as written.**
    The alternative is typing the interface's name to remove its settings. (10.2, 11.8)
14. **P14, Undo after a removal.** A queued job that switches the interface off outlives Undo
    **[verify]**; after an Undo that brings an interface back, this page applies the queued jobs and the
    network at once, which switches it off and on. **Recommended: as written, if the VM confirms the
    leftover.** The alternative is to say so and do nothing. (10.4)
15. **P15, the name.** Lower case; the domain optional, with `internal` suggested and the four reserved
    names refused in words; every effect on other computers listed before saving. **Recommended: as
    written.** (2)
16. **P16, blinking this page's port.** Allowed, with the warning that the page may not respond for
    the time chosen, and the wait. **Recommended: as written.** The alternative is to refuse blinking
    this page's port. (4.4)
17. **P17, a port without settings carrying the connection.** If the VM shows that the next network
    apply removes its address, the Interfaces page leads with it and offers "Set it up as it is now",
    and network changes other than that one are May cut. **Recommended: as written, depending on
    18.2 #7**; if its address survives, a plain line instead.
18. **P18, no way round a refusal.** A refused action offers no classic link that does the same without
    the check, as for the earlier slices. **Recommended: as written.** (0.8)
19. **P19, honest outcomes.** "Keep the new settings" sends nothing and says nothing goes back by
    itself; "Put back how it was" is offered only while this page reaches the NAS and has the old
    settings in memory; after a reload the copied note is the way back. **Recommended: as written.**
    (1.7)

---

## 22. What the test VM is expected to show, and what would change this design

Nothing network-specific in this slice has been observed yet beyond the two existing reads (section
18.2 is the plan). These assumptions carry the most weight; if the VM shows otherwise, the build
follows the VM and a "Changes made during the build" section records each change, as the earlier
slices do.

| #   | Assumption                                                                                                                    | If it does not hold                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | The pending modules are those of 0.7                                                                                          | R10's expected sets and the band's words change; nothing else                                            |
| 2   | A change on another interface interrupts this page only briefly, or not at all                                                | If not at all, those changes become Not affected; if for long, the band's wait grows                     |
| 3   | A changed fixed address stops answering at the old address within 30 seconds of the apply, and the NAS answers at the new one | The moved card's timing follows the VM                                                                   |
| 4   | The apply task keeps running when the page loses it, and its handle works again if the old address answers                    | If the handle is lost, the flow reads the pending state instead of the output when the NAS answers again |
| 5   | A new address means a new sign-in                                                                                             | If the session carries over (it should not, N9), the moved card drops its sign-in line                   |
| 6   | Undo leaves the queued switch-off job in place                                                                                | If Undo clears it, 10.4 and P14 are dropped                                                              |
| 7   | A port carrying the page without settings loses its address at the next network apply                                         | P17 drops to a plain line                                                                                |
| 8   | Traffic no rule fits is let through after an apply                                                                            | If a default refuse exists, the check's end of the list refuses, and the empty state's words change      |
| 9   | 11.6's two fixed rules work as OMV's script writes them                                                                       | If not, Block everything else is not offered (P11's alternative)                                         |
| 10  | `getInformation` reports the first global IPv6 address                                                                        | The connection's IPv6 matching follows what it reports; unmatched stays Not known                        |
| 11  | `omv-firstaid`'s network module replaces every interface's settings                                                           | The recovery card's warning about bonds and VLANs follows what it does                                   |

---

## 23. Changes made during the build

None yet: this section is filled in during the build, as the earlier slices' are.
