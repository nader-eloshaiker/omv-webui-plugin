# Phase 5, dashboard and monitoring: design

The first domain of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): four new
dashboard cards, new attention rows, charts on the Usage card, and three Diagnostics pages (System
logs, Processes, Services). Ready to build. Normative sources: the [style guide](style-guide.md), the
`UI-*` rules in [05](../05-security.md), the journal entries of 2026-11-21 ("Owner decisions for Phase
5's first domain", binding), and the conventions of [phase-3-pages.md](phase-3-pages.md) section 0,
which every page here reuses unchanged. Where this document and the style guide disagree, the style
guide wins; raise it.

Backend facts were read from OMV's source (8.6.x). Anything marked **[verify]** is checked on the mock
and the VM, by capture, before it is relied on. Anything marked **[owner]** needs the owner's answer
before that part is built. Judgement calls are listed in section 12.

Every method used here is administrator-only. A normal user sees nothing new (section 5).

---

## 0. Conventions added for this domain

Phase 3's section 0 (formatting, classic links, the four async states, the pending mark, shared
catalogue entries) applies throughout. This section adds only what is new.

### 0.1 Formatting

| What | Rule | Example |
| --- | --- | --- |
| Network speed | Decimal bit units, as network equipment is labelled: under 1000 Mbit/s in Mbit/s, otherwise Gbit/s with at most one decimal (dropped when whole). `-1` is "Speed not reported" | `100 Mbit/s`, `1 Gbit/s`, `2.5 Gbit/s` |
| Temperature | Whole degrees Celsius, tabular, non-breaking space before the unit. `""` is "Not reported" | `34 °C` |
| Date and time of a log entry | From `ts` (epoch seconds), in the browser's locale and time zone, `Intl.DateTimeFormat` with `dateStyle: "medium"`, `timeStyle: "medium"`. Never parse the server's `date` text | `21 Nov 2026, 10:12:04` |
| Large counts | Locale grouping, tabular | `4,210` |
| Percent from a server percentage | Phase 3's rule: whole number, `<1%` above 0 and under 1. A server value of `-1` means "no reading" | `86%` |
| Sizes in MiB from `top` | Multiplied by 1,048,576 and shown with Phase 3's byte rule, so they match the dashboard's units | `7.6 GiB` |
| Server-written text (service titles, log messages, command output, disk models, comments) | As received, as text (UI-2), `dir="auto"` on free-text cells so a right-to-left value does not reorder its row | |

### 0.2 Status words and the shared `health.*` keys

The pills use the fixed words (style guide 5.5): **OK, Warning, Critical, Unknown, Disabled**. Phase 3
gave each page its own status keys (`sharedFolders.status.*`). This domain adds status pills to five
surfaces, so it introduces one shared set, and later pages use it too:

| Key | English |
| --- | --- |
| `health.ok` | OK |
| `health.warning` | Warning |
| `health.critical` | Critical |
| `health.unknown` | Unknown |
| `health.disabled` | Disabled |

The status itself always stays beside its reason, in words, never in a tooltip.

### 0.3 Classic links used here

All are `ExternalLink`s with "… in the classic interface" in the visible words (Phase 3, 0.2). Each
is a literal path written in the code, never built from a reply (UI-3). None takes an identifier from
a reply: a link to one disk's or one file system's own classic page would need its UUID or device
path in the address, so the links go to the list page instead.

| Target | Path |
| --- | --- |
| Storage > File systems | `/#/storage/filesystems` |
| Storage > Disk health (S.M.A.R.T.) > Settings | `/#/storage/smart/settings` |
| Storage > Disk health (S.M.A.R.T.) > Devices | `/#/storage/smart/devices` |
| Network > Interfaces | `/#/network/interfaces` |
| Services > SMB/CIFS > Settings | `/#/services/smb/settings` |
| Services > NFS > Settings | `/#/services/nfs/settings` |
| Services > Rsync > Server > Settings | `/#/services/rsync/server/settings` |
| Diagnostics > System logs > Logs (download, clear) | `/#/diagnostics/system-logs/logs` |
| Diagnostics > System logs > Remote | `/#/diagnostics/system-logs/remote` |

SSH is built in this interface, so its links are router links to `/services/ssh`.

### 0.4 Reads, polls and the idle timeout (UI-14)

- **A background poll** is a read the interface makes on its own (a timer, window focus, or a
  pending module leaving `dirtyModules`). It always sends `updatelastaccess: false`, so watching the
  dashboard or the process list never keeps an idle session alive. The idle warning and sign-out
  happen on a page that only polls, as they should.
- **A foreground read** is one the reader asked for: "Check disk health", choosing a log, "Refresh",
  "Try again". It counts as activity.
- Polls stop while the browser tab is hidden (TanStack Query's default; do not set
  `refetchIntervalInBackground`) and resume, with one read, when it is shown again.
- No poll, read or retry starts by itself after a failure. A failed background read waits for the
  next tick; the reader may press "Try again" sooner.
- Nothing read here is written to browser storage (UI-13). Results kept "for the session" live in
  memory and go at sign-out or reload.

### 0.5 Reading a list in one request

`Network.enumerateDevicesList` and `Smart.getListBg` take the common list parameters. Every caller
sends all four of `start`, `limit`, `sortfield`, `sortdir`, with `null` where unused (OMV reads them
unconditionally). Whole-list reads send `start: 0, limit: -1` **[verify]** that `-1` returns every
row on each method (source: `applyFilter` treats it as "no paging").

---

## 1. Dashboard (administrator)

**Question it answers:** is the NAS fine, and is there anything I should do? **Leads to:** whatever
needs attention, or nothing.

### 1.1 Layout

Phase 3's page (1.1) with four more cards. One column under 1024px content width; two columns at
1024px and wider (`max-w-5xl`, as now). Top to bottom:

1. Page title "Dashboard".
2. **Attention list**, only when it has rows (1.7). Worst first.
3. **Set-up checklist**, while `displayWelcomeMessage` is true (unchanged).
4. Cards, in pairs, in this order (one column: the same order, top to bottom):
   | Row | Left | Right | The question the row answers |
   | --- | --- | --- | --- |
   | 1 | **Storage** (1.2) | **Disk health** (1.3) | Is my data safe? |
   | 2 | **Services** (1.4) | **Network** (1.5) | Can my computers reach it? |
   | 3 | **Usage**, with its chart (1.6) | **System** (unchanged) | How busy is it, and what is it? |
5. The freshness line (1.9).

The cards keep `items-start`, so a short card does not stretch to its neighbour's height. Each card is
a `section` labelled by its title (`h2`), as Phase 3's are. Pending configuration is still not
repeated on the page; the band and the top bar say it.

### 1.2 Storage card

**Data:** `FileSystemMgmt.enumerateMountedFilesystems` with `{ includeroot: true }`, polled every
20 s in the background. The reply is a plain list, unsorted; rows for file systems that are not
mounted are dropped by the server without a word (1.2.5).

#### 1.2.1 Anatomy

1. Title "Storage".
2. **Roll-up line**, only when a file system is at Warning or Critical: the worst pill and "1 of 3
   file systems: Warning" (`dashboard.storage.rollUp`). Nothing when all are below their levels:
   a file system below its warning level is not claimed as OK (1.2.3), so there is no OK roll-up.
3. A list, one item per file system, sorted worst first (1.2.4). At most **six** items show; with
   more, a `Disclosure` button after the sixth: "Show all 14 file systems" / "Show fewer". Problems
   are at the top by the sort, so they are never behind the disclosure.
4. Footer link: "File systems in the classic interface" → `/#/storage/filesystems`.

Each item:

| Element | Field | Display |
| --- | --- | --- |
| Name (the meter's label) | `label`, else `canonicaldevicefile`, else `devicefile` | A label is plain text, medium weight, wraps. A device path is `Identifier` (mono), breaks anywhere. The root row (`mountpoint` `/`) is named "System drive" whatever its label |
| Second line, `text-sm muted-foreground` | root row; `comment` | Root row: "Where openmediavault is installed". Otherwise the comment, if any, as text, `dir="auto"`, clamped to two lines. Nothing when empty |
| Meter | `percentage` (0 to 100), max 100 | `CapacityMeter`. Value text "{{percent}} full · {{free}} free of {{size}}", with `available` and `size` (byte strings, parsed) |
| Threshold pill | `percentage`, `usagewarnthreshold`, `available` | The meter's `threshold` prop (Warning or Critical, 1.2.3) |
| Warning level, `text-xs muted-foreground` | `usagewarnthreshold` | 1 to 100: "Warns at {{threshold}}". 0: "No warning level set". The root row's level comes from the server's environment (85 by default) and is shown the same way |

`used` is not used: the server sends it as formatted text ("12.34 GiB"), not bytes. The meter's
figure is the server's own `percentage`, the same figure the classic interface shows and the one the
warning level is compared with. On ext4 and similar file systems some space is kept back for the
system, so `free` and `size` need not add up to exactly `percentage`; the figures are each correct,
and the design does not compute a fourth one that disagrees with the classic interface (section 12,
D5).

A `percentage` of `-1` (the server could not read the figures) shows the meter's no-reading form,
with the value text "Could not read how full it is" and an Unknown pill. `size` or `available` of
`"-1"`: the same.

#### 1.2.2 Why the system drive is included

`includeroot: true` adds the drive openmediavault runs from. It is not a data disk, but when it fills
(logs, containers, a stuck update) the NAS stops working properly, and the stock dashboard does not
show it. The server already supplies a warning level for it (85% unless changed), so it is treated
exactly like any other file system. If the `sharerootfs` plugin is installed, the server does not add
it twice. Observed on the VM: the root row has `mountpoint` `/`, an empty `label`, a
`canonicaldevicefile` of the system partition, and `usagewarnthreshold` 85.

#### 1.2.3 State of one file system

| Condition | State | Pill | Why |
| --- | --- | --- | --- |
| `percentage` is 100, or `available` is 0 | **Critical** | Critical | Nothing more can be written. This is a failure, whatever level was configured, so it applies with level 0 too |
| `usagewarnthreshold` > 0 and `percentage` ≥ `usagewarnthreshold` | **Warning** | Warning | The administrator's own level was crossed (style guide 5.6: the bar takes the warning fill only with the pill) |
| `percentage` is `-1` | **Unknown** | Unknown | No reading is never drawn as fine |
| Otherwise | below its level | none | The meter stays the usage blue, with its numbers. No OK pill: with level 0 nothing is monitored, and "OK" would be a claim |

"At or over" (`≥`) matches the brief and OMV's monitoring, which alerts when usage exceeds the level;
the dashboard tells the reader one step early rather than one step late. **[verify]** OMV's monit
rule (`>` against `≥`); if it is `>`, keep `≥` here and say nothing: the difference is one percent.

#### 1.2.4 Sort order

1. Critical, then Warning, then Unknown, then the rest (the roll-up's own severity order).
2. Within a state, the fullest first (`percentage` descending).
3. Ties by name, in natural order.

The order is recomputed on each poll. In practice it changes only when a file system crosses a level,
which is exactly when it should move up.

#### 1.2.5 States

| State | Look |
| --- | --- |
| Loading (first read) | Two `CapacityMeter loading` skeletons with label bars; `aria-busy` on the card; "Loading the file systems…" for assistive technology |
| Error, never read | `EmptyState variant="error"` inside the card: "Could not read the file systems." + server message + "Try again" |
| Empty (no rows, which with `includeroot` should not happen) | `EmptyState variant="empty"`: "No file systems are mounted. A file system holds your files on a disk; you create one under File systems." Action: `ExternalLink` "Open File systems in the classic interface" |
| Background poll failed | Last items stay; under the list, the card's stale line (1.9.2) |
| Populated | As above |

**Missing file systems [owner].** A file system that is set up but whose disk is gone (unplugged,
failed, renamed) is silently left out of this reply, so the card cannot show it, and the owner's scope
includes it ("a file system nearly full or missing"). Only `FileSystemMgmt.getList` reports it (its
`status` 3, "missing"), and that method is not among the nine the owner cleared. It enumerates every
file system on every disk, which is heavier than this card's read, and **[verify]** whether it wakes a
sleeping disk. Recommended (section 12, D3): add `FileSystemMgmt.getList` to the contract and read it
once when the dashboard opens and on "Try again", not on the 20 s poll, for the missing rows only. When
it is agreed, a missing file system appears in this list as an item with a Critical pill, no meter,
and the reason "Missing. Its disk may be disconnected or have failed.", and in the attention list
(1.7). Until then the card is built without it.

### 1.3 Disk health card

**Data:** `Smart.getListBg` (a background task; result through the task helper), **only when the
reader presses "Check disk health"** (owner decision). Nothing reads disk health on its own: not on
page load, not on a timer, not on window focus, not after a reload.

#### 1.3.1 Why it is read only when asked, in the reader's words

The method runs the disk-health tool on every disk that supports it without the "do not wake" option,
so a disk that has spun down to save power spins up. The stock dashboard does this every minute,
which keeps sleeping disks awake. The card says so before the first check:

"Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save
power; the disk spins up, which takes a few seconds."

#### 1.3.2 Which disks: all of them

The check shows **every disk the reply lists**, monitored or not, with each disk's monitoring state
beside it. Reasons:

- Monitoring is off from the factory, for the whole NAS and for each disk (UX audit J5, 3.7). The
  stock widget shows only monitored disks and so says "No monitored devices." on a new NAS, which
  reads as "nothing to worry about" when nothing has been looked at.
- The cost of the check (waking disks) is paid for every disk whatever the filter: the method reads
  them all. Hiding readings already taken would be dishonest.
- "Monitoring off" next to a disk is the most useful thing the card can say: the NAS will not test
  that disk on a schedule or email about it.

#### 1.3.3 Anatomy

**Before the first check this session:**

1. Title "Disk health".
2. The sentence of 1.3.1.
3. Button **"Check disk health"** (neutral, not the filled primary: the dashboard has no primary
   action).

**While checking** (the task is running):

- The button shows its loading state, "Checking…", and ignores presses.
- A status line (`role="status"`, polite): "Checking disk health. You can leave this page; the result
  is kept." The task is also in the top bar's Tasks menu as "Check disk health", with its elapsed
  time (style guide 5.7).
- If there was an earlier result, it stays on screen as it was (not dimmed), and its "Checked at"
  line now reads "Checked at {{time}}. Checking again…".

**After a check:**

1. Title "Disk health".
2. **Roll-up line**: the worst pill and "1 of 5 disks: Critical" (`dashboard.disks.rollUp`), or with
   all OK: OK pill and "5 disks: OK" (`dashboard.disks.allOk`). Unknown ranks above OK (the library's
   `rollUp`).
3. **Monitoring line**, when monitoring is off for some or all disks (1.3.5).
4. A list, one item per disk, sorted worst first, then by device name in natural order. No limit:
   disk counts on this class of NAS are small, and every disk read is shown.
5. A line `text-xs muted-foreground tabular-nums`: "Checked at {{time}}. The readings do not update
   by themselves." and the button **"Check again"** (neutral, small).
6. Footer link: "Disk health in the classic interface" → `/#/storage/smart/devices`.

Each disk item:

| Element | Field | Display |
| --- | --- | --- |
| Pill | `overallstatus` | 1.3.4 |
| Device | `canonicaldevicefile` | `Identifier`, e.g. `/dev/sda`. This is what the classic interface and the attention row call it |
| Model and size | `model`, `size` (byte string) | "{{model}}, {{size}}", the model as text. Empty model: the size alone |
| Temperature | `temperature` (a numeric string such as `"30"`, or `""`) | "34 °C", tabular. `""`: nothing is shown (not every disk reports it; a "Not reported" on every USB disk is noise) |
| Reason | `overallstatus` | For anything but OK, the sentence of 1.3.4, as text beside the pill, never in a tooltip |
| Monitoring | `monitor` | When false: "Monitoring off" in `muted-foreground`. When true: nothing (it is the normal state once set up) |

The serial number, WWN and `/dev/disk/by-id` path are not shown on the dashboard: the device name,
model and size identify the disk, and the serial belongs on the disk's own page. Temperature carries
no status: the warning levels for it are disk-health settings this card does not read, and a colour
without a configured level would be invented.

#### 1.3.4 Disk states

| `overallstatus` | State | Reason text |
| --- | --- | --- |
| `GOOD` | OK | none |
| `BAD_SECTOR` | Warning | "A few damaged areas (bad sectors). Keep your backup up to date and check this disk again soon." |
| `BAD_ATTRIBUTE_IN_THE_PAST` | Warning | "It was once used outside its safe limits, for example too hot. It reports no problem now." |
| `BAD_SECTOR_MANY` | Critical | "Many damaged areas (bad sectors). It may fail soon. Copy your data off it and replace it." |
| `BAD_ATTRIBUTE_NOW` | Critical | "It is working outside its safe limits now. It may fail soon. Copy your data off it and replace it." |
| `BAD_STATUS` | Unknown | "Its health could not be read." |
| anything else | Unknown | "Health reading not recognised: <code></code>" (the code in mono, as text) |

`BAD_ATTRIBUTE_IN_THE_PAST` is an error in the stock widget. Here it is a **Warning** (section 12,
D4): Critical means failed or failing now (style guide 2), and this state says the opposite of "now".

#### 1.3.5 Monitoring off

| Case | Look |
| --- | --- |
| Off for every disk | A neutral `InlineAlert` above the list: "Monitoring is off for every disk. With it on, the NAS tests your disks on a schedule and can email you before one fails." and `ExternalLink` "Turn on monitoring in the classic interface" → `/#/storage/smart/settings`, with the hint under it: "Turn it on in Settings first, then for each disk under Devices." |
| Off for some | One line under the roll-up, `text-sm`: "Monitoring is off for 2 of 5 disks." and `ExternalLink` "Turn it on under Devices in the classic interface" → `/#/storage/smart/devices` |
| On for all | Nothing |

This is advice, not a monitored state, so it has no status colour (as the clock row in Phase 3). It
is the entry point Flow D (UX audit 4.5) will replace when it is built.

#### 1.3.6 Keeping the result

- The result is kept in memory for the session: leaving the dashboard and coming back shows it with
  its "Checked at" time. A reload or a new sign-in forgets it, and the card returns to "before the
  first check" (UI-13: no server data in browser storage).
- The task handle never leaves the task helper (UI-5); the card keeps the registry's task id and the
  parsed result.
- A second press while a check runs is ignored (the button is loading). A check started in another
  tab is that tab's own.
- The disk rows of the attention list (1.7) come from this result and go when it is forgotten.

#### 1.3.7 States

| State | Look |
| --- | --- |
| Not checked (no result this session) | 1.3.3, "before the first check". The card makes no request |
| Checking, first time | The sentence, the loading button, the status line; under it two list-row skeletons |
| Checking again | The previous result stays, with "Checked at {{time}}. Checking again…" |
| Check failed (task failed, or the reply could not be read) | `InlineAlert tone="critical"` in the card: "Could not check disk health." + server message (UI-9), and "Try again" (a foreground read). A previous result, if any, stays below it with its time |
| Empty (`total` 0) | `EmptyState variant="empty"`: "No disk reported its health. Some USB enclosures and virtual disks do not pass health readings through." |
| Populated | 1.3.3 |

Observed on the VM: of its five virtual disks, the NVMe disk reports `GOOD` with a temperature and
the four SATA disks report `BAD_STATUS` with none, and monitoring is off for all five. So the VM shows
the "Unknown" items and the "off for every disk" alert as they are designed. The result arrives as
JSON text in `Exec.getOutput`'s `output` once the task ends; the task helper parses it.

### 1.4 Services card

**Data:** `Services.getStatus`, polled every 20 s in the background. Each row: `name`, `title` (already
translated by the server), `enabled` (the saved setting), `running` (whether it is running now).

#### 1.4.1 Anatomy

1. Title "Services".
2. **Roll-up line**: with a problem, the worst pill and "1 of 4 services that are on: Critical"
   (`dashboard.services.rollUp`); otherwise OK pill and "All 4 services that are on are running"
   (`dashboard.services.allOk`). With none on, no roll-up (see the empty state).
3. A list of the **services that are on** (`enabled` true), one item each, worst first, then by
   `title` in natural order.
4. One line for the **services that are off**: "Off: NFS, Rsync server." (`dashboard.services.off`),
   the titles joined with the locale's list format (`Intl.ListFormat`). Nothing when none are off.
5. Footer link (router): "Service details" → `/diagnostics/services`.

Each item: the pill, the `title` as text (medium weight), and for anything but OK its reason beside
the pill.

| Condition | Pill | Reason |
| --- | --- | --- |
| The service's module is in `dirtyModules` | `StatusPill status="pending"` "Not applied yet" | "Changed settings are waiting to be applied." |
| `enabled` and `running` | OK | none |
| `enabled` and not `running` | Critical | "On, but not running." |
| not `enabled` and `running` | listed among the off services, with "(still running)" after its title | |

**Why the pending check comes first.** `enabled` is the saved setting, which changes on Save, before
Apply. A reader who has just turned SMB on and saved would otherwise see "Critical: on, but not
running" for something that is simply not applied yet. The service's `name` is its module name for
the core services (`samba`, `nfs`, `ssh`, `rsyncd`) **[verify]** for plugins; when the name is not a
module the system information reports, this check does not apply and the row falls through to the
rules below it.

"Disabled" is not shown as a pill for each off service: a column of grey pills for things the reader
chose to turn off is noise, so they are summarised in one line, as the brief asks.

#### 1.4.2 States

| State | Look |
| --- | --- |
| Loading | Three list-row skeletons (pill width plus a title bar) |
| Error, never read | `EmptyState variant="error"`: "Could not read the services." + server message + "Try again" |
| Empty: none on (`total` > 0, all off) | `EmptyState variant="empty"`: "No services are on. Turn on SMB/CIFS or NFS to share folders with other computers." Under it the off line. No action button: each service has its own settings page, and the off line names them |
| Empty: no rows at all | "No services were reported." (should not happen; core always reports four) |
| Background poll failed | Last items stay; the card's stale line (1.9.2) |

### 1.5 Network card

**Data:** `Network.enumerateDevicesList` with `start: 0, limit: -1, sortfield: "devicename",
sortdir: "asc"`, polled every 20 s in the background. The reply includes the loopback device
(`lo`); the card leaves it out. The Wi-Fi key (`wpapsk`) is omitted by the contract (UI-6) and never
reaches the page.

#### 1.5.1 Which interfaces

- Left out: `type` `loopback`, or `devicename` `lo`.
- **Virtual interfaces** (`type` `virtual`: the `veth…`, `tun…`, `tap…` devices that containers and
  VPNs create) are not listed; one line under the list counts them: "Also 12 virtual interfaces,
  used by containers or VPNs, not shown." (`dashboard.network.virtualHidden`). A NAS running a few
  containers has dozens of them, and they would bury the real ports.
- Everything else is listed: Ethernet, Wi-Fi, bond, VLAN, bridge, and unknown types.

#### 1.5.2 Each interface

| Element | Field | Display |
| --- | --- | --- |
| Name | `devicename` | `Identifier` (mono), e.g. `enp3s0` |
| Kind | `type` | A word after the name, `muted-foreground`: Ethernet, Wi-Fi, Bond, VLAN, Bridge. Absent or `unknown`: nothing |
| Connection | `link`, `speed` | A neutral icon (lucide `Cable` when connected, `Unplug` when not) and words: "Connected at 1 Gbit/s"; speed `-1`: "Connected"; `link` false: "Not connected" |
| IPv4 | `address`, `prefix` | "IPv4" label, then `{address}/{prefix}` in mono. Empty: "No address" |
| IPv6 | `address6`, `prefix6` | "IPv6" label, then `{address6}/{prefix6}` in mono. Empty: "No address" |

Order: the server's, by name. Connected interfaces are not moved up: the port list stays in the same
order on every poll.

**No status colour for the link** (section 12, D8). An unplugged second port is normal on a NAS with
two, and the reader of this page is, by definition, connected over some interface. "Not connected" is
a fact in words with its own icon shape, not an alarm.

Not shown: the MAC address (`ether`), gateways, netmasks, MTU and the traffic counters. They belong on
the network pages; the card answers "is it connected, and at what address".

Footer link: "Network interfaces in the classic interface" → `/#/network/interfaces`.

#### 1.5.3 States

| State | Look |
| --- | --- |
| Loading | Two list-row skeletons |
| Error, never read | `EmptyState variant="error"`: "Could not read the network interfaces." + server message + "Try again" |
| Empty (only `lo` and virtual) | "No network interfaces were found besides virtual ones." (should not happen on a reachable NAS) |
| Background poll failed | Last items stay; the card's stale line (1.9.2) |

### 1.6 Usage card: the chart

The meters and the average load stay as Phase 3 built them (1.3 there). Under them, a chart of the
processor and memory over the last ten minutes.

#### 1.6.1 What it shows, and from where

- **Two series, one chart:** "Processor" (`cpuUtilization`, percent) and "Memory" (`memUsed` /
  `memTotal`, percent, computed as the meter computes it so the chart's last point equals the meter).
  Both are percentages, so they share one axis from 0 to 100%.
- **Source: the shell's `System.getInformation` poll**, every 20 s, already running for an
  administrator for the pending-changes indicator (A7: there is no history on the server; the chart
  shows only what this browser has sampled). Each successful reply adds one sample, stamped with the
  **browser's** time of receipt (`dataUpdatedAt`), so a wrong NAS clock cannot bend the time axis.
- **Window: the last 10 minutes**, up to 30 samples. Older samples are dropped.
- **Samples are kept for the session**, in memory, from sign-in, whichever page is open (the poll is
  the shell's, not the dashboard's). Coming back to the dashboard shows the line so far, not an empty
  chart. A reload or sign-out starts again (section 12, D9).
- **Gaps are gaps.** When two consecutive samples are more than 50 s apart (the poll paused in a hidden
  tab, or failed), the line breaks there. Nothing is interpolated across it.

**Cadence: 20 s is enough; no faster poll for the chart.** The chart answers "has it been busy for a
while, or is this a spike?", which ten minutes of 20 s samples answers. A faster poll would multiply
the server's work (`getInformation` runs several commands) for a smoother line. If a reader needs a
finer view, the Processes page updates every 5 s.

#### 1.6.2 Look

- Header row: "Last 10 minutes" (`text-sm font-medium`) on the leading side.
- Plot about 120px high, full card width, on `surface`. Horizontal gridlines at 0, 50 and 100% in
  `border`, labelled at the leading edge in `text-xs muted-foreground tabular-nums`. Time labels at
  the two ends of the x axis: the first sample's clock time and "Now".
- **Processor**: `series-1`, solid line, a filled circle marker on the last point.
  **Memory**: `series-2`, dashed line, a hollow square marker on the last point (style guide 3.9:
  each series its own dash and marker, so neither colour nor greyscale alone tells them apart).
- **Direct labels** at the right end of each line: "Processor 12%", "Memory 41%" in
  `text-xs foreground` (chart text uses text tokens, never the series colour). When the two end
  points are closer than a label's height, the labels stack and keep their order by value. A small
  legend (line swatch with its dash, and the name) sits under the plot as well; it is never the only
  link between a line and its name.
- No animation; new points appear in place (style guide 4.5). No hover tooltip is needed: the readings
  table (1.6.3) gives every value.
- At 320px the plot keeps its height and narrows; the time labels and direct labels stay inside.

#### 1.6.3 For assistive technology

- The SVG is `role="img"` with `aria-labelledby` pointing at a visually hidden summary, regenerated
  on each sample but **not** a live region (a reader would hear it every 20 s):
  "Processor and memory over the last {{duration}}. Processor now {{cpuNow}}, highest {{cpuMax}},
  lowest {{cpuMin}}. Memory now {{memNow}}, highest {{memMax}}, lowest {{memMin}}."
- A `Disclosure` under the chart: **"Show the readings"** / **"Hide the readings"**. It opens a small
  table (newest first): Time | Processor | Memory, tabular, the time in the locale's hours:minutes:
  seconds. A gap shows as one row "No readings" between the times on either side. This is the chart's
  full text alternative, and the way to read exact values with or without a pointer.
- The chart itself is not focusable. The disclosure button is in the tab order after the load
  average's text.

#### 1.6.4 States

| State | Look |
| --- | --- |
| Fewer than 2 samples | The plot area at its full height with gridlines and the sentence centred in it, `text-sm muted-foreground`: "Not enough readings yet. The chart fills in while you are signed in, one reading every 20 seconds." The disclosure is hidden |
| Loading (no system information yet) | The meters' skeletons as now; the plot area as a skeleton block of the same height |
| Readings stopped (the poll is failing) | The line ends at the last good sample; the freshness line says why (1.9) |
| Populated | As above |

### 1.7 Attention list: new rows

The list keeps Phase 3's form (1.4 there): a `surface` card row per item, a pill or a neutral icon,
the sentence, one action. It is ordered **worst first**, then by a fixed order of kinds, so rows do not
change places between polls:

| Order | Row | When | Mark | Copy | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | File system full | 1.2.3 Critical | Critical | "{{name}} is full. Nothing more can be saved on it until you delete or move some files." | `ExternalLink` "Open File systems in the classic interface" → `/#/storage/filesystems` |
| 2 | File system missing **[owner]** | 1.2.5, if agreed | Critical | "{{name}} is missing. Its disk may be disconnected or have failed. Shared folders on it cannot be reached." | same |
| 3 | Disk failing | the session's last check reported Critical (1.3.4) | Critical | "Disk {{device}} ({{model}}) may fail soon: {{reason}}" then "Copy your data off it and replace it." | `ExternalLink` "Open Disk health in the classic interface" → `/#/storage/smart/devices` |
| 4 | Service not running | 1.4.1 Critical (on, not running, not pending) | Critical | One row for all of them: "SMB/CIFS is on, but not running." / "2 services are on, but not running: SMB/CIFS, NFS." Then "Computers cannot use it until it starts." / "…until they start." | For one core service: its settings link (below). For several, or a plugin's: router link "Look for the reason in the system logs" → `/diagnostics/system-logs` |
| 5 | File system nearly full | 1.2.3 Warning | Warning | "{{name}} is {{percent}} full, at or above its warning level of {{threshold}}." | `ExternalLink` "Open File systems in the classic interface" |
| 6 | Disk warning | last check reported Warning | Warning | "Disk {{device}} ({{model}}): {{reason}}" | `ExternalLink` "Open Disk health in the classic interface" |
| 7 | Restart needed | unchanged | Warning | unchanged | unchanged |
| 8 | Clocks differ | unchanged | clock icon | unchanged | unchanged |

- One row per file system and per disk, because each has its own name and its own action; one row
  for services, because the fix is the same and five rows would shout.
- The settings link for one core service: SMB/CIFS → "Open SMB/CIFS settings in the classic
  interface" (`/#/services/smb/settings`); NFS → `/#/services/nfs/settings`; Rsync server →
  `/#/services/rsync/server/settings`; SSH → router link "Open SSH settings" (`/services/ssh`). The
  link is chosen from the fixed `name`, never built from it.
- **A disk with monitoring off** gets the row too (section 12, D2). Its sentence ends with "Monitoring
  is off for this disk, so the NAS will not email you about it."
- Disk rows say when they were read: the action line also shows "Read at {{time}}." in
  `muted-foreground`, since disk readings do not update by themselves.
- **No row for "disk health not checked"**: the card says so; a permanent row would train the reader
  to ignore the list.
- **No row for Unknown** (a file system with no reading, a disk whose health could not be read): it is
  not a failure; the card shows the Unknown pill and its reason.
- Each row is a list item whose accessible text reads as one sentence: the pill word, then the copy.

### 1.8 Polling cadence on the dashboard

| Card | Method | Cadence | Kind |
| --- | --- | --- | --- |
| System, Usage, chart, restart and clock rows | `System.getInformation` (the shell's) | 20 s | background |
| Storage | `FileSystemMgmt.enumerateMountedFilesystems` | 20 s | background |
| Services | `Services.getStatus` | 20 s | background |
| Network | `Network.enumerateDevicesList` | 20 s | background |
| Disk health | `Smart.getListBg` (task) | never on its own; on "Check disk health" | foreground |
| Missing file systems **[owner]** | `FileSystemMgmt.getList` | on opening the dashboard and on "Try again" | background on open, foreground on "Try again" |

One rhythm for every card (section 12, D6): the stock dashboard polls these every 10 s, so 20 s is
gentler than what OMV already does, and one rhythm lets one freshness line describe the page. The
three new reads are cheap (`systemctl is-active` per service, sysfs, `df` per file system) and each is
its own query, so a slow one never holds up the others. All four also read once on window focus
(background). They are enabled only for the administrator role; a normal user's dashboard makes none
of these calls.

### 1.9 Freshness

#### 1.9.1 The page line (unchanged copy)

"Updated every 20 seconds. Last update {{time}}." It now describes every card that polls, which share
the cadence. It reports the shell's `System.getInformation`, as before.

#### 1.9.2 A card's own stale line

When one card's background read fails but the page's does not, that card keeps its last items and
shows, at its foot, `text-xs muted-foreground`: "Could not update since {{time}}." and a small "Try
again" (a foreground read of that card only). It is announced politely, once, when it first appears,
as the page line's failure is. A card that has never been read shows its error state instead (its
table above).

### 1.10 Keyboard and focus

Reading order is the visual order: attention-row links, checklist controls, then the cards in the
order of 1.1. Inside the cards the focus stops are: Storage's "Show all…" and footer link; Disk
health's "Check disk health" (or "Check again"), its monitoring link, footer link; Services' footer
link; Network's footer link; Usage's "Show the readings"; System's links; any "Try again". Rows are
not focusable (nothing to open). After "Check disk health" focus stays on the button (it turns into
"Checking…", then "Check again"); the result is announced by the task announcer ("Check disk health:
Succeeded") and by the card's status line ("Disk health checked: 1 of 5 disks: Critical."). If the
attention list gains rows from the result, they appear above, and focus does not move.

### 1.11 Copy

| Key | English |
| --- | --- |
| `dashboard.attention.critical` | Critical |
| `dashboard.storage.title` | Storage |
| `dashboard.storage.loading` | Loading the file systems… |
| `dashboard.storage.loadFailed` | Could not read the file systems. |
| `dashboard.storage.empty` | No file systems are mounted. A file system holds your files on a disk; you create one under File systems. |
| `dashboard.storage.emptyLink` | Open File systems in the classic interface |
| `dashboard.storage.rollUp_one` / `_other` | {{count}} of {{total}} file systems: {{status}} |
| `dashboard.storage.systemDrive` | System drive |
| `dashboard.storage.systemDriveHint` | Where openmediavault is installed |
| `dashboard.storage.value` | {{percent}} full · {{free}} free of {{size}} |
| `dashboard.storage.noReading` | Could not read how full it is |
| `dashboard.storage.warnsAt` | Warns at {{threshold}} |
| `dashboard.storage.noLevel` | No warning level set |
| `dashboard.storage.missing` | Missing. Its disk may be disconnected or have failed. |
| `dashboard.storage.showAll` | Show all {{count}} file systems |
| `dashboard.storage.showFewer` | Show fewer |
| `dashboard.storage.link` | File systems in the classic interface |
| `dashboard.disks.title` | Disk health |
| `dashboard.disks.intro` | Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save power; the disk spins up, which takes a few seconds. |
| `dashboard.disks.check` | Check disk health |
| `dashboard.disks.checking` | Checking… |
| `dashboard.disks.checkAgain` | Check again |
| `dashboard.disks.taskLabel` | Check disk health |
| `dashboard.disks.checkingLine` | Checking disk health. You can leave this page; the result is kept. |
| `dashboard.disks.checkedAt` | Checked at {{time}}. The readings do not update by themselves. |
| `dashboard.disks.checkingAgain` | Checked at {{time}}. Checking again… |
| `dashboard.disks.announce` | Disk health checked: {{summary}} |
| `dashboard.disks.failed` | Could not check disk health. |
| `dashboard.disks.empty` | No disk reported its health. Some USB enclosures and virtual disks do not pass health readings through. |
| `dashboard.disks.rollUp_one` / `_other` | {{count}} of {{total}} disks: {{status}} |
| `dashboard.disks.allOk_one` / `_other` | {{count}} disk: OK / {{count}} disks: OK |
| `dashboard.disks.modelSize` | {{model}}, {{size}} |
| `dashboard.disks.monitorOff` | Monitoring off |
| `dashboard.disks.monitorOffAll` | Monitoring is off for every disk. With it on, the NAS tests your disks on a schedule and can email you before one fails. |
| `dashboard.disks.monitorOffAllLink` | Turn on monitoring in the classic interface |
| `dashboard.disks.monitorOffAllHint` | Turn it on in Settings first, then for each disk under Devices. |
| `dashboard.disks.monitorOffSome` | Monitoring is off for {{count}} of {{total}} disks. |
| `dashboard.disks.monitorOffSomeLink` | Turn it on under Devices in the classic interface |
| `dashboard.disks.link` | Disk health in the classic interface |
| `dashboard.disks.reason.BAD_SECTOR` | A few damaged areas (bad sectors). Keep your backup up to date and check this disk again soon. |
| `dashboard.disks.reason.BAD_ATTRIBUTE_IN_THE_PAST` | It was once used outside its safe limits, for example too hot. It reports no problem now. |
| `dashboard.disks.reason.BAD_SECTOR_MANY` | Many damaged areas (bad sectors). It may fail soon. Copy your data off it and replace it. |
| `dashboard.disks.reason.BAD_ATTRIBUTE_NOW` | It is working outside its safe limits now. It may fail soon. Copy your data off it and replace it. |
| `dashboard.disks.reason.BAD_STATUS` | Its health could not be read. |
| `dashboard.disks.reason.other` | Health reading not recognised: <code></code> |
| `dashboard.services.title` | Services |
| `dashboard.services.loadFailed` | Could not read the services. |
| `dashboard.services.rollUp_one` / `_other` | {{count}} of {{total}} services that are on: {{status}} |
| `dashboard.services.allOk_one` / `_other` | The {{count}} service that is on is running / All {{count}} services that are on are running |
| `dashboard.services.notRunning` | On, but not running. |
| `dashboard.services.pending` | Changed settings are waiting to be applied. |
| `dashboard.services.off` | Off: {{list}}. |
| `dashboard.services.stillRunning` | {{title}} (still running) |
| `dashboard.services.noneOn` | No services are on. Turn on SMB/CIFS or NFS to share folders with other computers. |
| `dashboard.services.noneReported` | No services were reported. |
| `dashboard.services.link` | Service details |
| `dashboard.network.title` | Network |
| `dashboard.network.loadFailed` | Could not read the network interfaces. |
| `dashboard.network.empty` | No network interfaces were found besides virtual ones. |
| `dashboard.network.type.ethernet` | Ethernet |
| `dashboard.network.type.wifi` | Wi-Fi |
| `dashboard.network.type.bond` | Bond |
| `dashboard.network.type.vlan` | VLAN |
| `dashboard.network.type.bridge` | Bridge |
| `dashboard.network.connectedAt` | Connected at {{speed}} |
| `dashboard.network.connected` | Connected |
| `dashboard.network.notConnected` | Not connected |
| `dashboard.network.ipv4` | IPv4 |
| `dashboard.network.ipv6` | IPv6 |
| `dashboard.network.noAddress` | No address |
| `dashboard.network.virtualHidden_one` / `_other` | Also {{count}} virtual interface, used by containers or VPNs, not shown. / Also {{count}} virtual interfaces, used by containers or VPNs, not shown. |
| `dashboard.network.link` | Network interfaces in the classic interface |
| `dashboard.chart.title` | Last 10 minutes |
| `dashboard.chart.cpu` | Processor |
| `dashboard.chart.memory` | Memory |
| `dashboard.chart.endLabel` | {{series}} {{percent}} |
| `dashboard.chart.now` | Now |
| `dashboard.chart.notEnough` | Not enough readings yet. The chart fills in while you are signed in, one reading every 20 seconds. |
| `dashboard.chart.summary` | Processor and memory over the last {{duration}}. Processor now {{cpuNow}}, highest {{cpuMax}}, lowest {{cpuMin}}. Memory now {{memNow}}, highest {{memMax}}, lowest {{memMin}}. |
| `dashboard.chart.showReadings` | Show the readings |
| `dashboard.chart.hideReadings` | Hide the readings |
| `dashboard.chart.colTime` | Time |
| `dashboard.chart.gap` | No readings |
| `dashboard.cardStale` | Could not update since {{time}}. |
| `dashboard.attention.fsFull` | {{name}} is full. Nothing more can be saved on it until you delete or move some files. |
| `dashboard.attention.fsMissing` | {{name}} is missing. Its disk may be disconnected or have failed. Shared folders on it cannot be reached. |
| `dashboard.attention.fsWarning` | {{name}} is {{percent}} full, at or above its warning level of {{threshold}}. |
| `dashboard.attention.fsLink` | Open File systems in the classic interface |
| `dashboard.attention.diskCritical` | Disk <device></device> ({{model}}) may fail soon: {{reason}} |
| `dashboard.attention.diskWarning` | Disk <device></device> ({{model}}): {{reason}} |
| `dashboard.attention.diskUnmonitored` | Monitoring is off for this disk, so the NAS will not email you about it. |
| `dashboard.attention.diskReadAt` | Read at {{time}}. |
| `dashboard.attention.diskLink` | Open Disk health in the classic interface |
| `dashboard.attention.serviceDown_one` | {{title}} is on, but not running. Computers cannot use it until it starts. |
| `dashboard.attention.serviceDown_other` | {{count}} services are on, but not running: {{list}}. Computers cannot use them until they start. |
| `dashboard.attention.serviceLink.samba` | Open SMB/CIFS settings in the classic interface |
| `dashboard.attention.serviceLink.nfs` | Open NFS settings in the classic interface |
| `dashboard.attention.serviceLink.rsyncd` | Open Rsync server settings in the classic interface |
| `dashboard.attention.serviceLink.ssh` | Open SSH settings |
| `dashboard.attention.serviceLogs` | Look for the reason in the system logs |
| `format.speedMbit` | {{value}} Mbit/s |
| `format.speedGbit` | {{value}} Gbit/s |
| `format.celsius` | {{value}} °C |

The disk rows' reason (`{{reason}}`) is the 1.3.4 sentence. `<device>` and `<code>` are `Trans` slots
rendering the value as text in `Identifier`. In the attention row for a critical disk the reason's own
last sentence ("Copy your data off it and replace it.") is already part of `{{reason}}`; the row adds
nothing after it.

---

## 2. System logs (Diagnostics > System logs)

**Question it answers:** what has the NAS recorded about what happened? **Leads to:** understanding a
problem; downloading or clearing a log in the classic interface.

Administrators only. Route `/diagnostics/system-logs`. Data: `LogFile.getList`.

### 2.1 How the log is read

- **Once, when the reader chooses it** (owner decision, recommended): `LogFile.getList` with
  `{ id, start: 0, limit: -1, sortfield: "ts", sortdir: "desc" }`; for `apt_term`, which has no
  times, `sortfield: "rownum"`. The server re-reads and re-parses the whole log on every call
  whatever page is asked for, so one read is the cheapest way.
- Then **paged, searched and sorted in the browser**. Nothing more is asked of the server until the
  reader presses "Refresh" or chooses another log.
- The read is a foreground read (the reader chose it). It is blocking on the server and can take a
  few seconds for a long journal; the page says so while it waits (2.6).
- The server reads at most the last 100,000 lines of a log (`OMV_MAX_LOGFILE_LINES`). **[verify]** the
  reply size and time for a full syslog on the VM; if a full read is too slow to be usable, the
  fallback is to ask for the newest 5,000 entries (`limit: 5000`) and say so, and the owner is told.
- The rows stay in memory while the page is open, and for five minutes after leaving it (the query's
  `gcTime`), so a quick look elsewhere does not force a re-read. After that, coming back reads the
  chosen log again.

No log is read before the reader chooses one (section 12, D10). The chosen log, search, sort, page
and page size are kept in a small in-memory store for the session (as Phase 3's shared-folder table
state), not in the address (UI-4) and not in browser storage.

### 2.2 Layout

1. Page title "System logs".
2. Intro: "What the NAS has recorded. Choose a log to read it. Times are shown in this computer's
   time zone."
3. **Toolbar** (wraps on narrow screens):
   - The **log picker** (2.3), label "Log".
   - The **search field**, label "Search this log", placeholder "Word or number", with its clear
     button; Escape clears it. Hidden until a log has been read.
   - On the trailing side: **"Refresh"** (neutral), disabled until a log is chosen, with the reason
     "Choose a log first".
4. **Count line** (`role="status"`, polite), `text-sm tabular-nums`: "4,210 entries, read at
   10:12:04." With a search: "12 of 4,210 entries match." Nothing before the first read.
5. The **table** (2.4).
6. **Pagination** (`TablePagination`): rows per page 25, 50 (default), 100, 200.
7. **Footer**, `text-sm`: "To download or clear a log, use the classic interface." with
   `ExternalLink` "System logs in the classic interface" → `/#/diagnostics/system-logs/logs`; and a
   second line: "To send logs to another server:" `ExternalLink` "Remote logging in the classic
   interface" → `/#/diagnostics/system-logs/remote`.

### 2.3 The log picker

The library `Select` (Base UI), not a native `select`: a native one fires `change` on every arrow key
in some browsers, and each change here is a full read on the server. Base UI's commits on Enter or a
click. Eleven options are grouped (more than seven need grouping), in this order:

| Group | Option | `id` | Columns (2.4) |
| --- | --- | --- | --- |
| **The whole system** | All system messages (syslog) | `syslog` | journal |
| | General messages | `messages` | journal |
| | Background services (daemon) | `daemon` | journal |
| | Signing in and permissions (auth) | `auth` | journal |
| | Since the last start (boot) | `boot` | journal |
| | Hardware and drivers (kernel) | `dmesg` | journal |
| **Storage, sharing and updates** | Disk health monitoring (S.M.A.R.T.) | `smartd` | time and message |
| | File access over SMB/CIFS (audit) | `smbdaudit` | audit |
| | Rsync jobs | `rsync` | time and message |
| | Rsync server | `rsyncd` | journal |
| | Software updates | `apt_term` | message only |

- The plain name comes first and the technical name, where it helps someone following instructions,
  second in brackets. The stock interface's names are the bracketed parts.
- Placeholder before a choice: "Choose a log".
- Plugins register further logs (`clamav`, `proftpd`, `nut`, …), but no method lists them, so they
  are not offered; the footer's classic link reaches them. **[owner]** a later change could offer
  known plugin logs when the plugin is installed.
- `dpkg` and `apt_history` are registered by OMV but not offered by the stock interface; they are not
  offered here either.

Choosing a log reads it (2.1), resets the search, the sort to its default, and the page to 1.
Choosing the same log again does nothing (Refresh is for reading again).

### 2.4 Columns

Three layouts, by log:

**Journal logs** (`syslog`, `messages`, `daemon`, `auth`, `boot`, `dmesg`, `rsyncd`):

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Time | `ts` | 0.1 date and time, tabular, `whitespace-nowrap`. Sortable |
| 2 | Message | `message` | Mono 13px, `whitespace-pre-wrap`, breaks anywhere, `dir="auto"`. Not sortable (alphabetical order of log lines answers no question) |

`hostname` is not shown: on one NAS it is the same on every row. The server's `date` text is never
shown or parsed.

**Time and message** (`smartd`, `rsync`): the same two columns.

**Message only** (`apt_term`): one column, Message. Above the table, `text-sm muted-foreground`: "This
log has no times. The newest lines are at the top." Sort: by `rownum`, newest first, with the toggle
"Oldest first" as a button in the toolbar in place of a sortable header.

**Audit** (`smbdaudit`):

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Time | `ts` | as above, sortable |
| 2 | User | `username` | text, sortable |
| 3 | Computer | `clientipaddr` | mono, sortable |
| 4 | Shared folder | `servicename` | text, sortable |
| 5 | File | `filename` | mono, breaks anywhere; `filepath` under it in `muted-foreground` mono when it differs from the file name |
| 6 | Action | `operation` | text as received (e.g. `openat`, `unlinkat`), mono, sortable |
| 7 | Result | `result` | text as received (`ok`, `fail`), sortable. Not a status pill: a refused file operation is a recorded event, not the NAS's health |

`hostname`, `clientnetbiosname`, `servicerootdir` are not shown. The table scrolls sideways inside its
own frame at narrow widths (style guide 5.2); the page does not.

**Sorting.** Default: Time, newest first (`ts` descending, ties by `rownum` descending, so entries
written in the same second keep their order). Pressing a sortable header sorts by it ascending; again
reverses it. `aria-sort` and the polite "Sorted by {{column}}, {{direction}}" announcement, as Phase 3.

**Rows.** Height grows with the message; long messages wrap and are never truncated. No row is
focusable or selectable (there is nothing to open). Copying a message is ordinary text selection.

### 2.5 Search

- In the browser, case-insensitive substring over the columns shown for that log (for the journal:
  the message and the formatted time; for the audit: every shown column). Run 200 ms after typing
  stops; resets to page 1.
- No hint about matching hidden fields is needed (unlike Phase 3's server search): only what is shown
  is searched.
- With no match: `EmptyState variant="filtered"`: "No entries match "{{search}}"." Action "Clear the
  search" (focus moves to the search field).
- The search term is shown inside quotes as text (UI-2).

### 2.6 States

| State | Look |
| --- | --- |
| Nothing chosen | `EmptyState variant="empty"` in the table's place: "Choose a log above to read it." The search field and pagination are hidden |
| Reading (first read of a log) | Header row and `TableSkeletonRows` (10); the count line reads "Reading the log… A long log can take a few seconds."; `aria-busy` on the table. The picker stays usable: choosing another log abandons this read (the query is cancelled in the browser; the server finishes its work anyway) |
| Reading again (Refresh) | The current rows stay, with `aria-busy`; "Refresh" shows its loading state "Refreshing…"; afterwards the count line is announced: "4,215 entries, read at 10:14:30." The search and sort are kept; the page goes to 1 (new entries arrive at the top) |
| Error | In the table body: `EmptyState variant="error"`: "Could not read this log." + server message + "Try again" (a foreground read of the same log). The picker stays usable |
| Empty log | `EmptyState variant="empty"`: "This log is empty." For `smbdaudit`: "Nothing is recorded here until auditing is turned on for a shared folder in the SMB/CIFS settings." For `rsync`: "Nothing is recorded here until an rsync job has run." |
| Filtered empty | 2.5 |
| At the server's limit | When the count is 100,000 or more **[verify]** the exact cap in entries: a line under the count, `text-sm muted-foreground`: "Only the newest 100,000 lines of this log are read. Download the log in the classic interface for all of it." |
| Populated | The table |

### 2.7 Keyboard

Tab order: Log picker, search, its clear button, Refresh (and "Oldest first" for the updates log),
each sortable header, rows per page, Previous, Next, the footer links. The table frame scrolls with
the keyboard when focused (it is a focusable region labelled by the log's name). After a refresh,
focus stays on Refresh.

### 2.8 Copy

| Key | English |
| --- | --- |
| `logs.title` | System logs |
| `logs.intro` | What the NAS has recorded. Choose a log to read it. Times are shown in this computer's time zone. |
| `logs.picker` | Log |
| `logs.pickerPlaceholder` | Choose a log |
| `logs.group.system` | The whole system |
| `logs.group.storage` | Storage, sharing and updates |
| `logs.id.syslog` | All system messages (syslog) |
| `logs.id.messages` | General messages |
| `logs.id.daemon` | Background services (daemon) |
| `logs.id.auth` | Signing in and permissions (auth) |
| `logs.id.boot` | Since the last start (boot) |
| `logs.id.dmesg` | Hardware and drivers (kernel) |
| `logs.id.smartd` | Disk health monitoring (S.M.A.R.T.) |
| `logs.id.smbdaudit` | File access over SMB/CIFS (audit) |
| `logs.id.rsync` | Rsync jobs |
| `logs.id.rsyncd` | Rsync server |
| `logs.id.apt_term` | Software updates |
| `logs.search` | Search this log |
| `logs.searchPlaceholder` | Word or number |
| `logs.clearSearch` | Clear the search |
| `logs.refresh` | Refresh |
| `logs.refreshing` | Refreshing… |
| `logs.refreshReason` | Choose a log first |
| `logs.count_one` / `_other` | {{count}} entry, read at {{time}}. / {{count}} entries, read at {{time}}. |
| `logs.countMatching_one` / `_other` | {{count}} of {{total}} entries matches. / {{count}} of {{total}} entries match. |
| `logs.reading` | Reading the log… A long log can take a few seconds. |
| `logs.limit` | Only the newest 100,000 lines of this log are read. Download the log in the classic interface for all of it. |
| `logs.tableLabel` | Entries of {{log}} |
| `logs.col.time` | Time |
| `logs.col.message` | Message |
| `logs.col.user` | User |
| `logs.col.computer` | Computer |
| `logs.col.share` | Shared folder |
| `logs.col.file` | File |
| `logs.col.action` | Action |
| `logs.col.result` | Result |
| `logs.noTimes` | This log has no times. The newest lines are at the top. |
| `logs.oldestFirst` | Oldest first |
| `logs.newestFirst` | Newest first |
| `logs.nothingChosen` | Choose a log above to read it. |
| `logs.loadFailed` | Could not read this log. |
| `logs.empty` | This log is empty. |
| `logs.empty.smbdaudit` | Nothing is recorded here until auditing is turned on for a shared folder in the SMB/CIFS settings. |
| `logs.empty.rsync` | Nothing is recorded here until an rsync job has run. |
| `logs.filteredEmpty` | No entries match "{{search}}". |
| `logs.pageSize` | Rows per page |
| `logs.classicNote` | To download or clear a log, use the classic interface. |
| `logs.classicLink` | System logs in the classic interface |
| `logs.remoteNote` | To send logs to another server: |
| `logs.remoteLink` | Remote logging in the classic interface |

Sorting and paging reuse Phase 3's `sharedFolders.sorted`, `.ascending`, `.descending`, `.range`,
`.rangeMatching`, `.previous`, `.next`, `.firstPageReason` and `.lastPageReason` wording; the builder
moves those to a shared `table.*` namespace when the second table uses them, keeping the English.

---

## 3. Processes (Diagnostics > Processes)

**Question it answers:** what is the NAS busy with right now? **Leads to:** knowing which program uses
the processor or the memory (nothing on the page acts on a process).

Administrators only. Route `/diagnostics/processes`. Data: `System.getTopInfo` with
`{ format: "json" }`, polled every **5 s** in the background (the stock page's rate), with a pause
control. Each read takes about a second on the server. The capture from the VM confirms the key
names used here: every value is a string (`mem_total` `"3914.0"` in MiB, `swap_total` `"0.0"`,
`%CPU` `"0.0"`), `VIRT`, `RES`, `SHR` are byte strings, and `S` is one letter. Parse each number;
an unparsable value is "Not reported".

### 3.1 Why 5 s, and the pause

Five seconds is the rate the stock page uses, and fast enough to watch a busy program come and go.
Because the table re-sorts by processor use on every read, rows change places while the reader looks
at them. The **pause** stops that: the reader freezes the list, reads it, and resumes. The poll also
stops while the tab is hidden (0.4). Searching, sorting and paging do not pause it; the reader may.

### 3.2 Layout

1. Page title "Processes".
2. Intro: "The programs running on the NAS right now, and how much of the processor and memory each
   one uses."
3. **Summary** (3.3): a `FactList` in a card, two columns at 640px and wider.
4. **Update line** with the pause control (3.5).
5. **Toolbar**: search field, label "Search processes", placeholder "Program or user".
6. The **table** (3.4), then `TablePagination`: 25, 50 (default), 100 rows per page.

### 3.3 Summary

| Label | Fields | Display |
| --- | --- | --- |
| Processes | `tasks_total`, `tasks_running`, `tasks_sleeping`, `tasks_stopped`, `tasks_zombie` | "142: 1 running, 141 sleeping". Stopped and zombie are added only when above 0: ", 1 stopped", ", 2 finished but not cleared away (zombie)" |
| Memory | `mem_total`, `mem_used`, `mem_buff_cache` (MiB) | `CapacityMeter`: "{{used}} of {{total}} in use ({{percent}})". Under it, `text-sm muted-foreground`: "Another {{cache}} holds recently used files and is freed when programs need it." |
| Swap | `swap_total`, `swap_used` (MiB) | `CapacityMeter`: "{{used}} of {{total}} in use ({{percent}})", with the hint "Disk space used as extra memory when memory runs short." `swap_total` parsed to 0 (the VM sends `"0.0"`): "No swap space is set up." and no meter |
| Average load | `load_1m`, `load_5m`, `load_15m` | As the dashboard: "1 min 0.42 · 5 min 0.38 · 15 min 0.30" |

**"Processes", not "Tasks".** `top` calls them tasks, but "Tasks" in this interface is the top bar's
list of long-running jobs (style guide 5.7). Using one word for two things would send readers to the
wrong place. `time`, `uptime` and `users` are not shown: the dashboard has the time and the uptime,
and the count of console sign-ins helps nobody here.

The memory figures here come from `top`, the dashboard's from `System.getInformation`; they can differ
by a little because they are read at different moments and computed slightly differently. Each page is
consistent with itself.

### 3.4 Process table

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Program | `COMMAND` | Mono, wraps, breaks anywhere, `dir="auto"`. Sortable |
| 2 | Processor | `%CPU` | Whole percent (0.1 rule; `top` gives one decimal, so `0.3` shows `<1%`, `0.0` shows `0%`), right-aligned, tabular. Sortable. **Default sort: descending** |
| 3 | Memory | `RES` (bytes) | Binary units, one decimal, right-aligned, tabular. Sortable |
| 4 | State | `S` | A word (3.4.1), plain text. Sortable |
| 5 | User | `USER` | Text. Sortable |
| 6 | Processor time | `TIME+` | As received, mono, tabular (minutes:seconds.hundredths). Sortable by its parsed value |
| 7 | ID | `PID` | Mono, right-aligned, tabular. Sortable (numeric) |

Not shown: `PR` and `NI` (scheduling priority), `VIRT` (reserved, not used, memory: always large and
misleading), `SHR`, `%MEM` (the Memory column gives the amount; a second figure for the same thing
invites comparison). Section 12, D12.

Sorting is in the browser, numeric for numbers (parse the strings), natural order for text. Ties by
`PID`. Sort, search, page and page size are kept across reads; the rows change in place.

#### 3.4.1 State words

Plain text, no colour, no pill: a process's state is not the NAS's health.

| `S` | Word |
| --- | --- |
| `R` | Running |
| `S` | Sleeping |
| `I` | Idle |
| `D` | Waiting for a disk or device |
| `T` | Stopped |
| `t` | Stopped by a debugger |
| `Z` | Finished, not cleared away (zombie) |
| anything else | The letter, in mono |

A footnote under the table, `text-sm muted-foreground`: "Sleeping means waiting for something to do,
which is normal for most programs."

### 3.5 Update line and pause

`text-xs muted-foreground tabular-nums`, with a small neutral button after it:

| State | Line | Button |
| --- | --- | --- |
| Updating | "Updated every 5 seconds. Last update {{time}}." | **"Pause updates"** (icon `Pause`) |
| Paused | "Updates paused. Showing the list from {{time}}." | **"Resume updates"** (icon `Play`). Resuming reads at once (foreground: the reader asked) |
| A background read failed | "Could not update since {{time}}. The list may be out of date." | "Try again" beside the pause button |

The button's visible label changes with the state (so no `aria-pressed`). Pressing it announces the
new line politely. The paused state is kept in memory for the session; leaving the page and coming
back while paused shows the frozen list with its time, and the poll does not run.

### 3.6 States

| State | Look |
| --- | --- |
| Loading (first read) | The summary as `FactListSkeleton` with meter skeletons; the table header with `TableSkeletonRows` (10); "Loading the processes…" for assistive technology |
| Error, never read | `EmptyState variant="error"` in place of summary and table: "Could not read the processes." + server message + "Try again" |
| Populated | As above |
| Background read failed | Last values stay; 3.5 |
| Filtered empty | `EmptyState variant="filtered"`: "No processes match "{{search}}"." Action "Clear the search" |
| Field missing (a key `top` did not give) | "Not reported" for that fact or cell only |

The figures are not a live region: a reader would hear the list every 5 s.

### 3.7 Keyboard

Tab order: Pause updates (and Try again), search, its clear button, each sortable header, rows per
page, Previous, Next. Rows are not focusable. The table scrolls inside its frame.

### 3.8 Copy

| Key | English |
| --- | --- |
| `processes.title` | Processes |
| `processes.intro` | The programs running on the NAS right now, and how much of the processor and memory each one uses. |
| `processes.summary` | Summary |
| `processes.count` | Processes |
| `processes.countValue` | {{total}}: {{running}} running, {{sleeping}} sleeping |
| `processes.countStopped` | , {{count}} stopped |
| `processes.countZombie` | , {{count}} finished but not cleared away (zombie) |
| `processes.memory` | Memory |
| `processes.memoryValue` | {{used}} of {{total}} in use ({{percent}}) |
| `processes.cache` | Another {{cache}} holds recently used files and is freed when programs need it. |
| `processes.swap` | Swap |
| `processes.swapHint` | Disk space used as extra memory when memory runs short. |
| `processes.swapNone` | No swap space is set up. |
| `processes.load` | Average load |
| `processes.fresh` | Updated every 5 seconds. Last update {{time}}. |
| `processes.paused` | Updates paused. Showing the list from {{time}}. |
| `processes.stale` | Could not update since {{time}}. The list may be out of date. |
| `processes.pause` | Pause updates |
| `processes.resume` | Resume updates |
| `processes.search` | Search processes |
| `processes.searchPlaceholder` | Program or user |
| `processes.tableLabel` | Processes |
| `processes.col.program` | Program |
| `processes.col.cpu` | Processor |
| `processes.col.memory` | Memory |
| `processes.col.state` | State |
| `processes.col.user` | User |
| `processes.col.time` | Processor time |
| `processes.col.pid` | ID |
| `processes.state.R` | Running |
| `processes.state.S` | Sleeping |
| `processes.state.I` | Idle |
| `processes.state.D` | Waiting for a disk or device |
| `processes.state.T` | Stopped |
| `processes.state.t` | Stopped by a debugger |
| `processes.state.Z` | Finished, not cleared away (zombie) |
| `processes.stateNote` | Sleeping means waiting for something to do, which is normal for most programs. |
| `processes.loading` | Loading the processes… |
| `processes.loadFailed` | Could not read the processes. |
| `processes.filteredEmpty` | No processes match "{{search}}". |

---

## 4. Services (Diagnostics > Services)

**Question it answers:** what are the file-sharing and SSH services doing right now: who is connected,
what is shared? **Leads to:** the service's settings.

Administrators only. Three views, one per service, each its own static route:

| Tab | Route | Status read | Output read | Module |
| --- | --- | --- | --- | --- |
| SMB/CIFS | `/diagnostics/services/smb` | `Services.getStatus`, `samba` | `SMB.getStats` | `samba` |
| NFS | `/diagnostics/services/nfs` | `Services.getStatus`, `nfs` | `NFS.getStats` | `nfs` |
| SSH | `/diagnostics/services/ssh` | `Services.getStatus`, `ssh` | `SSH.getStats` | `ssh` |

`/diagnostics/services` (the menu item) redirects to `/diagnostics/services/smb`. Each route is static
(UI-4): no part of the address names a method.

### 4.1 Layout

1. Page title "Services".
2. Intro: "What the file-sharing and SSH services are doing right now."
3. **Page tabs**: a `nav` labelled "Services" with three links, SMB/CIFS, NFS, SSH; the current one
   has `aria-current="page"`, the selected tint and the leading bar as the side navigation does (a
   new `PageTabs` component, section 8). They are links, not ARIA tabs, because each is its own
   address.
4. The **tab's heading** (`h2`): the service's name, with its status pill and reason beside it (4.2).
5. One sentence of what the output shows (4.4).
6. The **output block** (4.3), or a state in its place (4.5).
7. Under it: "Read at {{time}}." and **"Refresh"** (neutral), and the settings link (4.4).

### 4.2 Status beside the heading

From `Services.getStatus` (the dashboard's query, shared and already warm when coming from there; read
in the background on opening the page and every 20 s) and the system information's `dirtyModules`:

| Condition | Pill | Reason |
| --- | --- | --- |
| module in `dirtyModules` | pending "Not applied yet" | "Changed settings are waiting to be applied." |
| `enabled`, `running` | OK | "Running" |
| `enabled`, not `running` | Critical | "On, but not running." |
| not `enabled` | Disabled | "Off" |

### 4.3 The output block

- The string the method returns, split into lines, shown on the **terminal pair** (style guide 5.7) in
  Roboto Mono 13px, as text nodes (UI-2), with control characters removed (the `TaskLog` cleaning).
- **Lines do not wrap**: `smbstatus` and `exportfs` print columns that wrapping would scramble. The
  block scrolls sideways inside itself; it is a focusable region (`tabIndex=0`, labelled "Status of
  SMB/CIFS") so the keyboard can scroll it, and the page itself never scrolls sideways. It grows with
  its content up to 70% of the viewport height, then scrolls vertically too.
- A **"Copy output"** control (the `TaskLog` copy, with its plain-HTTP fallback).
- No live region; no follow-the-tail (the text does not grow).
- The output is in the NAS's own language and format; the page does not translate or parse it.

### 4.4 Per service

| Tab | Sentence above the output | Settings link |
| --- | --- | --- |
| SMB/CIFS | "Who is connected to shared folders over SMB/CIFS (the file sharing Windows and macOS use), and which files they have open." | `ExternalLink` "Open SMB/CIFS settings in the classic interface" → `/#/services/smb/settings` |
| NFS | "Which folders are shared over NFS, and with which computers." | `ExternalLink` "Open NFS settings in the classic interface" → `/#/services/nfs/settings` |
| SSH | "Who is signed in over SSH now, and the open connections." | Router link "Open SSH settings" → `/services/ssh` |

### 4.5 Reading the output, and its states

The output is read **when the tab opens** (a foreground read: the reader navigated to it) and when the
reader presses **Refresh**. It does not poll: the output is a snapshot the reader reads, and a block
that changes under a text selection loses it.

Before reading, the page checks what it already knows, so it does not ask for an output that cannot
come:

1. **The module is pending** (`dirtyModules` has `samba`, `nfs` or `ssh`): the server would refuse
   with "apply the pending changes first". The page does not call; it shows a neutral `InlineAlert`
   with the pending mark: "Changed {{service}} settings are saved but not applied yet. Its status can
   be read once they are applied. Apply them in the band at the top of the page." When the module
   leaves `dirtyModules` (seen on the 20 s poll) while the tab is open, the page reads the output once
   by itself (a background read).
2. **The service is off** (`enabled` false): the page does not call; `EmptyState variant="empty"`:
   "{{service}} is off, so there is nothing to show." with the settings link as its action.
3. Otherwise it calls the method.

| State | Look |
| --- | --- |
| Status not known yet | The heading without a pill (a pill-width skeleton); the output block's skeleton |
| Reading | The output block as a skeleton of six mono lines on the terminal ground; "Reading the status of {{service}}…" for assistive technology. On Refresh, the old output stays with `aria-busy`, and Refresh shows "Refreshing…" |
| Pending | 1 above |
| Off | 2 above |
| On, not running | The Critical pill beside the heading, and the output is still read and shown: it may say why. If the read fails, the error below |
| Error | `EmptyState variant="error"`: "Could not read the status of {{service}}." + server message + "Try again". If the message is the server's "apply the pending changes first" (another administrator saved in between), the same: the server's message says what to do |
| The server says "Service disabled" anyway | The text is shown in the block as received; the status pill (refreshed after the read) catches up |
| Empty output (only whitespace) | In the block's place, `text-sm`: "Nothing to show. No one is connected right now." (SMB, SSH) / "Nothing is shared over NFS right now." (NFS) |
| Populated | The block |

The status read (`Services.getStatus`) and the output read are independent: a failed status read
leaves the heading without a pill and a small "Could not read whether {{service}} is on." with "Try
again"; the output is then read anyway (the server's own reply will say if it is disabled).

### 4.6 Keyboard

Tab order: the three tab links, the settings link (when in the empty state), the output region, Copy
output, Refresh, the settings link. Arriving on a tab moves focus to nothing in particular (ordinary
page navigation; the skip link and the page title come first). After Refresh, focus stays on Refresh
and "Read at {{time}}." is announced politely.

### 4.7 Copy

| Key | English |
| --- | --- |
| `serviceDetails.title` | Services |
| `serviceDetails.intro` | What the file-sharing and SSH services are doing right now. |
| `serviceDetails.tabs` | Services |
| `serviceDetails.name.smb` | SMB/CIFS |
| `serviceDetails.name.nfs` | NFS |
| `serviceDetails.name.ssh` | SSH |
| `serviceDetails.running` | Running |
| `serviceDetails.notRunning` | On, but not running. |
| `serviceDetails.off` | Off |
| `serviceDetails.pendingReason` | Changed settings are waiting to be applied. |
| `serviceDetails.what.smb` | Who is connected to shared folders over SMB/CIFS (the file sharing Windows and macOS use), and which files they have open. |
| `serviceDetails.what.nfs` | Which folders are shared over NFS, and with which computers. |
| `serviceDetails.what.ssh` | Who is signed in over SSH now, and the open connections. |
| `serviceDetails.outputLabel` | Status of {{service}} |
| `serviceDetails.copy` | Copy output |
| `serviceDetails.copied` | Output copied |
| `serviceDetails.selected` | Output selected. Press Ctrl+C to copy. |
| `serviceDetails.readAt` | Read at {{time}}. |
| `serviceDetails.refresh` | Refresh |
| `serviceDetails.refreshing` | Refreshing… |
| `serviceDetails.reading` | Reading the status of {{service}}… |
| `serviceDetails.pending` | Changed {{service}} settings are saved but not applied yet. Its status can be read once they are applied. Apply them in the band at the top of the page. |
| `serviceDetails.disabled` | {{service}} is off, so there is nothing to show. |
| `serviceDetails.loadFailed` | Could not read the status of {{service}}. |
| `serviceDetails.statusFailed` | Could not read whether {{service}} is on. |
| `serviceDetails.emptyConnections` | Nothing to show. No one is connected right now. |
| `serviceDetails.emptyNfs` | Nothing is shared over NFS right now. |
| `serviceDetails.link.smb` | Open SMB/CIFS settings in the classic interface |
| `serviceDetails.link.nfs` | Open NFS settings in the classic interface |
| `serviceDetails.link.ssh` | Open SSH settings |

---

## 5. A normal user

Every method in this document refuses a normal user ("Invalid context role."). So:

- The dashboard for a normal user is exactly Phase 3's (1.6 there). None of the new queries is
  enabled for the user role: no request is made, so there is no refusal to handle.
- The chart's samples are not collected: the user's shell does not poll `System.getInformation` (the
  Phase 2 hook polls only for an administrator).
- The Diagnostics group stays out of a normal user's menu (its items are administrator-only already).
- A normal user who types `/diagnostics/system-logs`, `/diagnostics/processes` or any
  `/diagnostics/services/…` address gets the existing "only administrators" page, and the route makes
  no call first (UI-4).

---

## 6. Navigation and routes

| Item | New route | Roles | Replaces |
| --- | --- | --- | --- |
| Diagnostics > System logs | `/diagnostics/system-logs` | admin | `ClassicOnlyPage` for `diagnostics/system-logs` |
| Diagnostics > Processes | `/diagnostics/processes` | admin | `ClassicOnlyPage` for `diagnostics/processes` |
| Diagnostics > Services | `/diagnostics/services` → `/diagnostics/services/smb` | admin | `ClassicOnlyPage` for `diagnostics/services` |
| (no menu item) | `/diagnostics/services/smb`, `/nfs`, `/ssh` | admin | the stock sub-pages |

- Each is a static file route, more specific than `$group/$item`, as Phase 3's are. `BuiltRoute` gains
  the three menu routes; `isCurrent` treats any `/diagnostics/services/…` address as the Services
  item's.
- The navigation entries keep their `classic` paths. System logs' classic path becomes
  `/#/diagnostics/system-logs/logs` (the stock group page has two sub-pages; the logs one is meant).
- Route-level code splitting: each page is its own chunk.
- Document titles: "System logs – openmediavault", "Processes – openmediavault", "SMB/CIFS – Services
  – openmediavault" (and NFS, SSH), with `app.documentTitle`.
- System information, Performance statistics and Report stay classic links.

---

## 7. Every request in this domain

| Method | Where | When | Kind | Contract notes |
| --- | --- | --- | --- | --- |
| `FileSystemMgmt.enumerateMountedFilesystems` `{includeroot: true}` | Storage card | 20 s, focus | background | Plain list reply; `size`, `available`, `blocks` byte strings; `used` formatted text (not used); `percentage` int, -1 no reading |
| `FileSystemMgmt.getList` **[owner]** | Storage card, missing rows | dashboard open, "Try again" | background / foreground | Only if agreed (1.2.5) |
| `Smart.getListBg` → `Exec.getOutput` | Disk health card | on "Check disk health" | foreground, task | `x-omv-task`; `serialnumber` and `wwn` scrubbed in captures and never shown; `temperature` numeric string or `""` |
| `Services.getStatus` | Services card, Services page | 20 s, focus | background | `title` is server-translated text |
| `Network.enumerateDevicesList` | Network card | 20 s, focus | background | `wpapsk` omitted (`x-omv-omit`, UI-6); `stats` may be `{}` or `[]`; addresses and MAC scrubbed in captures |
| `LogFile.getList` | System logs | on choosing a log, Refresh, Try again | foreground | `id` from the fixed list only; `search` is not sent |
| `System.getTopInfo` `{format: "json"}` | Processes | 5 s while not paused and visible; Resume, Try again | background (poll), foreground (Resume, Try again) | Every value a string; keys as captured |
| `SMB.getStats`, `NFS.getStats`, `SSH.getStats` | Services page | on opening the tab, Refresh, Try again; once after the module is applied | foreground (background for the after-apply read) | Plain string reply; user names and addresses scrubbed in captures |
| `System.getInformation` (existing) | shell, chart, pending checks | 20 s | background | unchanged |

None of these changes state; none is `x-omv-dirty` or `x-omv-destructive`. Download and clear of a log
(`LogFile.getContent`, `LogFile.clear`) stay out of the contract for this domain.

---

## 8. Components

### 8.1 New in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component | Why | States to cover |
| --- | --- | --- |
| `LineChart` (being built) | The Usage chart. Requirements from this design: series as `{ id, label, points: {t, value}[] }` with `series-1..4` and a dash pattern and end marker per series; a fixed y domain with labelled gridlines; time labels at both ends; **gaps** where consecutive points are further apart than a given interval (no interpolation); direct end labels that avoid collisions; `role="img"` with the caller's summary text; an empty state with the caller's sentence at full plot height; no animation; fits 320px | 0 points, 1 point, 2 points, full window, a gap, two series ending at the same value, 320px, both themes, greyscale |
| `PageTabs` | Route-backed sub-navigation (Services page; later SMB, NFS and others with sub-pages): a `nav` of links with `aria-current`, the selected tint and the leading bar of the side navigation turned to an underline | default, current, focus, hover, wrapping at 320px with longer labels |
| `HealthList` / `HealthListItem` | The card lists of Disk health, Services and Storage's missing rows: pill, name (plain or mono), detail line, reason beside the pill, an optional muted note ("Monitoring off") | each status, long names, reason wrapping, skeleton row |
| `Select` groups | The log picker's two groups (Base UI `Select.Group` and `GroupLabel`) | grouped, keyboard through groups, long option text |
| `TaskLog` options | The service output: `wrap={false}` (no wrapping, own horizontal scroll, focusable region) and a taller `size="page"` (up to 70vh) | wrapped and not, long lines, short output |

### 8.2 Reused as they are

`Card`, `FactList`, `CapacityMeter` (with `threshold`), `StatusPill` (with `pending`) and `rollUp`,
`EmptyState`, `InlineAlert`, `Table*`, `TableSkeletonRows`, `TablePagination` (page sizes passed in),
`SearchField`, `Disclosure`, `ExternalLink`, `Identifier`, `Skeleton`, `Button` (with `loading`),
`CopyButton`, the task announcer and the Tasks menu.

### 8.3 In the app

- `dashboard.ts` gains pure functions, each tested by itself: the file-system state and sort (1.2.3,
  1.2.4), the disk state from `overallstatus` (1.3.4), the service state with the pending check
  (1.4.1), the interface filter (1.5.1), the speed formatter, the attention rows and their order
  (1.7), and the chart's sample buffer with its gap rule (1.6.1).
- An in-memory session store holds: the chart samples, the last disk-health result and its time, the
  logs page's view state, and the processes page's pause, sort, search and page. It is cleared at
  sign-out with the task registry. None of it touches browser storage.

---

## 9. Mock scenarios to add

Built from scrubbed captures (verification rule). At least:

| Method | Scenarios |
| --- | --- |
| `enumerateMountedFilesystems` | normal (root plus two data file systems, levels 85 and 0); one at Warning; one full; one with `percentage` -1; root only; more than six file systems |
| `Smart.getListBg` | all GOOD, all monitored; mixed (one of each state); all unmonitored; empty; the task fails; one unrecognised code |
| `Services.getStatus` | all running; one on and not running; none on; a plugin service; with `samba` in `dirtyModules` (combined with the system-information scenario) |
| `enumerateDevicesList` | one port connected; two ports, one unplugged; with twelve `veth` interfaces; no IPv6; speed -1; a Wi-Fi interface (its `wpapsk` is a documentation value, removed by the transport before anything sees it) |
| `LogFile.getList` | syslog with 5,000 entries (paging and search); empty; `smbdaudit`; `apt_term`; an error; one with a 2,000-character message and one with markup-looking text |
| `System.getTopInfo` | normal; with zombie and stopped processes; swap 0; a command line 500 characters long |
| `SMB/NFS/SSH.getStats` | wide output; empty; "Service disabled"; the pending-changes error |

---

## 10. Checks before calling it done

- Both themes; greyscale; deuteranopia and protanopia emulation. Pills keep their words; the two chart
  series stay apart by dash and marker in greyscale; "Connected" and "Not connected" differ by icon
  shape and word.
- 320 CSS px and 200% zoom: the cards stack in the 1.1 order; disk and interface items wrap; the log
  and process tables and the service output scroll inside their frames only; the chart stays legible.
- Keyboard-only pass of the dashboard (1.10), System logs (2.7), Processes (3.7), Services (4.6).
- Screen reader hears: each card's loading; "Checking disk health…" and the result; a card's stale
  line, once; the log count after a read or refresh; the pause and resume lines; "Read at" after a
  refresh; the sort and page announcements; a failed read (`role="alert"`). It does **not** hear the
  20 s or 5 s updates.
- In the network panel: no new request for a normal user; every poll carries `updatelastaccess:
  false`; no `Smart.getListBg` until the button is pressed, including after a reload; one
  `LogFile.getList` per choice or refresh, none per keystroke or page change.
- Session expiry: leaving the dashboard or the process list open past the idle timeout shows the idle
  warning and signs out (UI-14).

---

## 11. Adversarial pass

### 11.1 Trying to break it

| Probe | Finding | Design response |
| --- | --- | --- |
| A service just turned on and saved, not applied | `enabled` is the saved value, so "on, but not running" would raise a Critical row for something merely pending | The pending check comes first (1.4.1, 4.2); no Critical, no attention row, a pending mark instead |
| A service turned off and saved, not applied | Off but still running | Listed among the off ones with "(still running)" and the pending mark |
| Another administrator saves SMB while the Services tab is open | The output read refuses with "apply the pending changes first" | The error state shows the server's message; the 20 s poll then sees `samba` dirty and shows the pending state |
| Monitoring off on a new NAS | Stock says "No monitored devices", reads as fine | Every disk shown, with "Monitoring off" and a way to turn it on (1.3.2, 1.3.5) |
| Pressing "Check disk health" repeatedly, or in two tabs | Several checks wake disks several times | The button ignores presses while a check runs; another tab is its own, and the reader chose it |
| Reload after a check | Result lost; readings never stored | Card returns to "not checked"; disk rows leave the attention list; nothing reads S.M.A.R.T. by itself |
| A failing disk with monitoring off | A filter on `monitor` would hide a failing disk already read | Shown in the card and in the attention list, with the "monitoring is off" sentence (D2) |
| A USB enclosure that hides SMART | `BAD_STATUS`, or the disk is not listed | Unknown with "Its health could not be read."; empty state names USB enclosures |
| 0 file systems, 1, 20 | A long card | Empty state; worst first; six shown, the rest behind "Show all" |
| File system full with level 0 | No level, but writes fail | Critical whatever the level (1.2.3) |
| `percentage` -1 | Meter would show 0 as empty | No-reading meter and Unknown pill; never drawn as fine |
| A data disk unplugged | Its file system vanishes from the reply without a word | Needs `FileSystemMgmt.getList` (1.2.5, owner); until then the card cannot see it, and this is stated here rather than hidden |
| Twenty Docker containers | Forty `veth` interfaces | Virtual ones counted, not listed (1.5.1) |
| The browser tab hidden for an hour | Polls stop; chart has a hole | Gaps drawn as gaps; one read on return; the idle timeout still applies |
| The NAS clock wrong by hours | Chart's time axis would be skewed | Samples are stamped with the browser's time |
| A syslog of 100,000 lines | Large reply, slow read, memory in the browser | One read, paged in the browser; the "reading can take a few seconds" line; the limit line; **[verify]** size and time, with a fallback to the newest 5,000 |
| Arrow keys through the log picker | A native select would read each log in turn | Base UI `Select` commits only on Enter or click (2.3) |
| Choosing a second log while the first is reading | Two reads, the first answer arriving last | The first query is cancelled in the browser; only the current log's rows are shown |
| A log message 5,000 characters long, right-to-left, or `<script>` text | Layout, UI-2 | Text nodes; wraps and breaks anywhere; `dir="auto"`; markup shown literally |
| `apt_term` has no times | A Time column would be empty | Its own layout, sorted by line number, and a sentence saying so |
| Audit log with audit off | Empty, looks broken | Empty sentence says how audit is turned on |
| Processes re-sort every 5 s | Rows jump under the reader | Pause control; the frozen list says when it is from |
| Processes page left open all day | Would poll forever and keep the session alive | Background reads; the idle timeout signs out (UI-14) |
| `top` keys differ by version | Empty columns | "Not reported" per cell; keys verified by capture before building |
| `smbstatus` output 300 characters wide at 320px | Page would scroll sideways | Output block scrolls inside itself; not wrapped |
| The output contains a user name that looks like markup | UI-2 | Text nodes on the terminal pair; control characters stripped |
| Typing `/diagnostics/services/../../rpc` or an unknown tab | URL as a call | Static routes; unknown addresses are the not-found page; no route builds a call (UI-4) |
| A normal user types a diagnostics address | Refused methods | The "only administrators" page, no call (5) |

### 11.2 Without sight

| Probe | Requirement |
| --- | --- |
| Tab through each page | Orders in 1.10, 2.7, 3.7, 4.6; skip link first (shell); focus never lands inside the chart |
| Loading | `aria-busy` and a polite "Loading …" per card and per page region; skeletons hidden from assistive technology |
| Disk check | "Checking disk health…" on start; the task announcer and the card's summary on end |
| Live figures | The 20 s and 5 s updates are not announced; only stale notices, once, and the reader's own actions (refresh, pause) |
| The chart | A summary sentence as its name; every reading in the "Show the readings" table |
| Colour | Every status has its word; disk, service and file-system reasons are text beside the pill; chart series have dash and marker; link state has an icon shape and a word |
| 200% zoom | Single column; tables and the output block scroll in their own frames only |

---

## 12. Decisions taken

Judgement calls made in this design that the owner may want to see. Each is the recommended answer;
the design is built this way unless the owner says otherwise.

| ID | Decision | Why |
| --- | --- | --- |
| D1 | The disk-health check shows **every disk the reply lists**, monitored or not, with "Monitoring off" beside unmonitored ones, and a pointer to turn monitoring on when it is off for every disk *(recommended)* | Monitoring is off from the factory; the method reads every disk anyway; a filter would hide readings already taken (1.3.2) |
| D2 | A failing disk gets an attention row **even when its monitoring is off**, with a sentence saying the NAS will not email about it *(recommended)* | The reading is in hand; hiding a failing disk because a setting is off would be dishonest |
| D3 | **Agreed by the owner, 2026-11-21.** Missing file systems need `FileSystemMgmt.getList`, which is not among the nine cleared methods. Recommended: add it, read once on opening the dashboard and on "Try again", used only for missing rows, after checking on the VM that it does not wake a sleeping disk *(recommended)* | The scope names "missing"; the cleared method drops missing file systems silently (1.2.5) |
| D4 | `BAD_ATTRIBUTE_IN_THE_PAST` is a **Warning**, not Critical as in the stock widget *(recommended)* | Critical means failed or failing now; this state reports a past event and no current problem |
| D5 | The Storage meter shows the server's `percentage` and the words "{{percent}} full · {{free}} free of {{size}}"; no used-bytes figure *(recommended)* | `used` arrives as formatted text; computing it from size minus free would disagree with the percentage on file systems that keep space back, and with the classic interface |
| D6 | **One 20 s rhythm** for every dashboard poll; the chart uses the existing shell poll *(recommended)* | Gentler than the stock dashboard's 10 s; one freshness line describes the page; ten minutes of 20 s samples answers the chart's question |
| D7 | Cards ordered Storage and Disk health first, then Services and Network, then Usage and System *(recommended)* | The NAS's job is keeping data; the Phase 3 cards move down a row |
| D8 | A network port's link is a **fact, not a status**: no pill, no colour; virtual interfaces are counted, not listed *(recommended)* | A spare unplugged port is normal; containers create dozens of virtual interfaces |
| D9 | Chart samples are collected from sign-in for the whole session, on any page, from the shell's existing poll, kept in memory, last 10 minutes *(recommended)* | Still "only what the open page sampled" (A7): this browser, this session, nothing stored; returning to the dashboard does not empty the chart |
| D10 | System logs: **no log is read until the reader chooses one**; the choice is kept in memory, not in the address; eleven stock logs grouped in two; the host name column is dropped; entries in a table (mono messages), not on the terminal pair *(recommended)* | A full read is heavy; an address that reads a log on load is a step towards UI-4 trouble; a single NAS's host name is noise; a sortable, paged list is a table |
| D11 | Log times in the **browser's** time zone, said in the intro *(recommended)* | `ts` is epoch seconds; the server's `date` text is in its locale and cannot be parsed reliably |
| D12 | Processes: "Processes" not "Tasks"; columns Program, Processor, Memory (resident), State, User, Processor time, ID; `PR`, `NI`, `VIRT`, `SHR`, `%MEM` dropped; whole-number percentages *(recommended)* | "Tasks" is taken by the top bar; the dropped columns need Linux knowledge or mislead |
| D13 | Service details as three route-backed tabs; the output is read on opening the tab and on Refresh, not polled; the page checks `dirtyModules` and `enabled` before calling *(recommended)* | Each tab is a view with its own address; a snapshot that changes under a selection loses it; the pending and off states are known without a refused call |
| D14 | Service output **does not wrap** and scrolls inside its own block *(recommended)* | The outputs are column tables; wrapping scrambles them |
| D15 | A shared `health.*` catalogue namespace for the status words *(recommended)* | Five surfaces use them here; one source keeps the words fixed |
| D16 | Storage shows at most six file systems before "Show all" *(recommended)* | Problems sort to the top; a card of twenty meters buries the rest of the page |
