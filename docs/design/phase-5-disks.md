# Phase 5, storage slice 1, disks and disk health: design

The first storage slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the
Disks list, a disk's own page with its health details, monitoring and power settings, wiping a disk,
the three Disk health (S.M.A.R.T.) pages, and UX-audit Flow D, "Watch disk health and tell me".

**Status: for the owner's agreement before building.** This slice has a destructive action (wiping a
disk), so the owner agrees the design first (journal, 2026-11-21, "Storage is built in slices").
Section 17 lists the destructive-action points to agree; section 16 lists the other judgement calls,
each taken as recommended unless the owner says otherwise.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-8 above all), the journal entries of 2026-11-21 (binding: storage in slices; the interface
enforces its own safeguards for destructive actions; S.M.A.R.T. is read only when asked), the
conventions of [phase-3-pages.md](phase-3-pages.md) section 0 and
[phase-5-monitoring.md](phase-5-monitoring.md) section 0, which every page here reuses unchanged, and
the job-runner rules R1 to R10 of the [UX audit](ux-audit.md) (4.1). Where this document and the style
guide disagree, the style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x). Anything marked **[verify]** is checked on the mock
and the VM, by capture, before it is relied on. Anything marked **[owner]** needs the owner's answer
before that part is built.

Every method used here is administrator-only. A normal user sees nothing new (section 9).

---

## 0. Conventions added for this slice

The Phase 3 conventions (formatting, classic links, the four async states, the settings-form rules,
the pending mark, the shared catalogue) and the monitoring domain's (temperature, `health.*` status
words, background and foreground reads) apply throughout. This section adds only what is new.

### 0.1 Formatting

| What | Rule | Example |
| --- | --- | --- |
| Disk size | Phase 3's byte rule (binary, one decimal). On a disk's own page and in the wipe confirmation only, the size printed on the disk's label follows in brackets: decimal units, at most one decimal, dropped when whole, so the reader can match it to the physical disk | `3.6 TiB (4 TB on the label)` |
| Device name | `canonicaldevicefile`, in `Identifier` (mono). It is what the classic interface, the dashboard and the attention list call the disk | `/dev/sdb` |
| Serial number, WWN, stable device paths | `Identifier`, breaks anywhere. Shown on screen only; never in a URL, a document title, a toast, browser storage or a log (UI-5, UI-13) | `WD-WX00000000000` |
| Power-on time | From hours: Phase 3's duration rule with a years unit added (two largest units) | `3 years, 41 days` |
| Hour of a schedule | The locale's hours and minutes, minutes always `00` (`Intl.DateTimeFormat`, `hour: "2-digit", minute: "2-digit"`) | `03:00` |
| Weekday and month names | `Intl.DateTimeFormat` in the browser's locale, `weekday: "long"`, `month: "long"`. OMV's weekday numbers are 1 Monday to 7 Sunday | `Sunday`, `March` |
| Spin-down time | From OMV's standby value: 1 to 240 is that many times 5 seconds; 241 to 251 is (value − 240) times 30 minutes; 252 is 21 minutes; 255 is 21 minutes 15 seconds; shown with the duration rule | `20 minutes`, `1 hour` |
| Text from a disk (model, firmware, attribute names, self-test text, the full report) | As received, as text (UI-2), `dir="auto"` on free-text cells | |

### 0.2 Status words

The pills use the fixed words and the shared keys: `health.ok`, `health.warning`, `health.critical`,
`health.unknown`, `health.disabled`. A disk's overall state and its reason sentence are the monitoring
domain's (1.3.4 there, `overallstatus` to state). Those reason keys move from `dashboard.disks.reason.*`
to a shared `diskHealth.reason.*` namespace when the second page uses them, keeping the English.

Not statuses, and so never coloured or pilled:

- **A disk's power state** (Awake, Asleep): a fact. The stock interface draws "Active" orange and
  "Sleep" green (UX audit 3.6); here it is a word.
- **What a disk is used for**: a fact.
- **Whether a disk is watched, and whether a scheduled test is on**: configuration, in words.

The one temperature status: where the interface has read the configured limit (the Overview and a
disk's page), a temperature at or above the disk's limit is **Warning**, and at or above the limit
plus 5 °C is **Critical**. These are OMV's own levels: the monitoring service records a temperature
at the limit and sends its alert email at the limit plus 5 °C (read from OMV's monitoring
configuration template). Where no limit is set, a temperature has no status.

### 0.3 Classic links used here

All are `ExternalLink`s with "… in the classic interface" in the visible words, literal paths written
in the code, never built from a reply (UI-3). None takes an identifier.

| Target | Path |
| --- | --- |
| Storage > Disks | `/#/storage/disks` |
| Storage > File systems (unmount, create) | `/#/storage/filesystems` |
| Storage > RAID management (the RAID plugin) | `/#/storage/md` **[verify]** the plugin's list route |
| Storage > Disk health (S.M.A.R.T.) > Devices | `/#/storage/smart/devices` |
| Storage > Disk health (S.M.A.R.T.) > Scheduled tests | `/#/storage/smart/tasks` |
| System > Notification > Settings (email) | `/#/system/notification/settings` |
| System > Notification > Events | `/#/system/notification/events` |

The dashboard's links to `/#/storage/smart/settings` and `/#/storage/smart/devices` become router
links to the new pages (section 8).

### 0.4 What wakes a disk

The owner's rule (journal, 2026-11-21): reading S.M.A.R.T. can wake a sleeping disk, so **nothing
reads it on its own**. Every read below is classified, and only the reader's own press makes a
waking read.

| Method | Wakes a sleeping disk? | When this slice calls it |
| --- | --- | --- |
| `DiskMgmt.getList` | No: it asks each disk with "do not wake" (`--nocheck=standby`); the temperature comes only from a reading already cached on the server | On opening a page, Refresh, after a rescan or a wipe |
| `FileSystemMgmt.getList` | Not known; the owner accepted reading it once per visit (journal, 2026-11-21). **[verify]** | With `DiskMgmt.getList` |
| `MdMgmt.enumerateDevices` (RAID plugin) | No smartctl (runs mdadm and reads the kernel's RAID state); not observable on the VM, which has no RAID plugin | With `DiskMgmt.getList` |
| `Smart.getSettings`, `Smart.getDeviceSettings`, `Smart.getScheduleList`, `Smart.getScheduledTest` | No: configuration and udev only **[verify]** | On opening a page |
| `Smart.getListBg` ("Check disk health") | **Yes, every disk** | Only on "Check disk health" |
| `Smart.getInformation`, `Smart.getAttributes`, `Smart.getSelfTestLogs` | **Yes, that disk** | Only on "Read health details" |
| `Smart.getExtendedInformation` | **Yes, that disk** | Only on "Show the full report" |
| `Smart.executeScheduledTest` | **Yes, that disk**, and it starts a test inside it | Only on "Run now", after a confirmation |
| `Smart.setDeviceSettings` | Possibly: the server checks that the disk supports health readings **[verify]** | Only on Save |
| `DiskMgmt.rescan` | Possibly **[verify]** | Only on "Look for new disks" |
| `DiskMgmt.wipe` | Yes, that disk | Only after the typed confirmation |

Every page that has a waking action says so beside the button, in one sentence, before the first
press. A waking read is a foreground read (the reader asked). No page polls in this slice: every list
here is a snapshot with its "Read at" time and a Refresh control (section 16, D3).

### 0.5 Naming a disk in an address

A disk's page is `/storage/disks/$disk`, where `$disk` is the disk's kernel name (`devicename` in
`DiskMgmt.getList`: `sda`, `nvme0n1`, `mmcblk0`), validated against `^[a-z][a-z0-9]{0,31}$`.

- The page reads `DiskMgmt.getList` and finds the row whose `devicename` equals the parameter. Every
  later call uses that row's `devicefile` from the reply, never the address (UI-4). A parameter that
  fails the pattern, or names no connected disk, shows the not-found state (2.9) and makes no
  disk-specific call.
- The kernel name can change when the NAS restarts (`sdb` becomes `sdc`). A bookmark can therefore
  open a different disk. The page always shows model and serial number at the top, and the wipe
  confirmation re-checks the serial number before it acts (3.3).
- The serial number, WWN and stable `/dev/disk/by-id/…` paths are **not** used in addresses: they are
  identifiers of a real device, and an address lands in the browser's history (UI-13 in spirit).
- A disk whose `devicename` does not match the pattern (for example a hardware RAID controller's
  `cciss!c0d0`) **[verify]** has no page of its own; its list row shows its name as text, with no
  link, and the footer's classic link reaches it.

### 0.6 What a disk is used for: how the interface decides

The server does not refuse to wipe a disk that is in use (UX audit B14). The interface's own
safeguard (journal, 2026-11-21) rests on these rules, which also fill the "Used for" column.

**Inputs**, read together: `DiskMgmt.getList`, `FileSystemMgmt.getList`,
`FileSystemMgmt.enumerateFilesystems`, and, when the RAID plugin is installed,
`MdMgmt.enumerateDevices`.

`FileSystemMgmt.getList` lists only the file systems OMV has a mount entry for (status 1 available,
3 missing) and those being created (status 2). It does not list the system's own root and boot
partitions, a file system OMV has not set up (such as one on a disk from another computer), or swap
(observed on the test VM, 2026-11-21, and read from source: on the VM it listed only the one data file
system, while the root, the EFI partition and the CD drive's file system were left out). The two rows
below that need those, "Swap space" and "File system not used on this NAS", therefore use
`FileSystemMgmt.enumerateFilesystems`, which lists every file system the system detects, swap (type
`swap`) included. `getList` calls it itself, so reading both touches the disks no more than
`getList` alone (read from source).

**A disk's names** are its `canonicaldevicefile`, `devicefile` and every entry of `devicelinks`. A
partition belongs to a disk when, with its trailing partition number removed (`/dev/sdb3` to
`/dev/sdb`; `/dev/nvme0n1p2` and `/dev/mmcblk0p1` to the part before the final `p` and digits), it is
one of the disk's names. **[verify]** the forms `devicefiles`, `parentdevicefile` and the RAID member
list arrive in.

| Use | Found when | Wipe |
| --- | --- | --- |
| **System disk** | `isroot` is true | Refused |
| **Read-only** | `isreadonly` is true | Refused |
| **File system in use** | a file-system row with `mounted` true, or `_used` true, whose `parentdevicefile` or any of `devicefiles` belongs to the disk | Refused |
| **File system set up on this NAS** | any row of `FileSystemMgmt.getList` with status 1 or 3 (every such row has OMV's mount entry), belonging to the disk | Refused |
| **File system being created** | a row with `status` 2 whose `parentdevicefile` belongs to the disk | Refused |
| **Swap space** | a file system of type `swap` belonging to the disk in `FileSystemMgmt.enumerateFilesystems` (`getList` never lists swap; the test VM has no swap, so this is inferred from source) | Refused (section 17, P5) |
| **RAID member** | the disk, or one of its partitions, is in an array's `devices` | Refused |
| **Being wiped** | a wipe of this disk is running in this session's task registry | Refused |
| **File system not used on this NAS** | a file system in `FileSystemMgmt.enumerateFilesystems` belonging to the disk that has no row in `getList` and is none of the above (for example a disk from another computer) | Allowed, named in the confirmation |
| **Nothing found** | none of the above | Allowed |

**Fail closed.** If `FileSystemMgmt.getList` fails, or the RAID plugin is installed and its read
fails, the interface does not know what the disks hold: "Used for" says "Not known" and no disk can be
wiped until a read succeeds (3.1).

**Whether the RAID plugin is installed** is decided by the reply to `MdMgmt.enumerateDevices`: OMV
answers an unknown service with HTTP 404 and "RPC service 'MdMgmt' not found." **[verify]** how this
reaches the transport (status and code). That reply means "not installed": the page claims nothing
about RAID. Any other failure is "could not check" (fail closed).

**Storage this interface cannot trace.** A file system whose parent is neither a disk nor a RAID
array this interface knows (`/dev/dm-…`, `/dev/mapper/…`: encrypted disks, LVM, or ZFS pools of the
ZFS plugin) cannot be traced to its disks. When such a file system is mounted or set up, the wipe
confirmation of every disk with "Nothing found" or "File system not used on this NAS" carries one more
sentence saying so (3.3). The interface cannot refuse what it cannot see; it says what it cannot see
(section 17, P4). The ZFS slice will replace this sentence with the pool membership.

### 0.7 One pending module for this whole slice

Every setting in this slice marks the same module, `smartmontools`, which the band calls "Disk health
(S.M.A.R.T.)" (`modules.smartmontools`): the disk health settings, each disk's monitoring, scheduled
self-tests, **and each disk's power settings** (read from OMV's module listeners). So:

- The pending mark ("Not applied yet") appears beside the title of the three Disk health pages and of
  every disk's page whenever `smartmontools` is in `dirtyModules`.
- The saved line under a form is the Phase 3 sentence, moved to a shared key `common.savedPending`
  ("Saved. The changes take effect when you apply them in the band at the top of the page."), keeping
  `ssh.saved` as an alias until the SSH page is moved over.
- Saving email settings in the classic interface also marks `smartmontools` pending: OMV rewrites the
  monitoring configuration so alerts go to the new address. Section 7 says so.

Wiping, rescanning and starting a self-test change no configuration and mark nothing pending.

---

## 1. Storage > Disks

**Question it answers:** which disks does the NAS have, what is each one used for, and is any of them
in trouble? **Leads to:** a disk's page.

Administrators only. Route `/storage/disks`.

### 1.1 Data

- `DiskMgmt.getList` with `start: 0, limit: null, sortfield: "devicename", sortdir: "asc"` (the
  whole-list form observed in the monitoring domain), `FileSystemMgmt.getList` (the same whole-list
  parameters), `FileSystemMgmt.enumerateFilesystems` and `MdMgmt.enumerateDevices` (0.6), in parallel, on opening the page, on Refresh, after
  "Look for new disks" and after a wipe ends. All are foreground reads. Nothing polls.
- **[verify]** `DiskMgmt.getList` is synchronous and asks each disk once; its time with five disks on
  the VM. If it is slow, the fallback is `DiskMgmt.getListBg` through the task helper, and the owner is
  told.
- **[verify]** RAID arrays, encrypted devices and loop devices are not rows of `DiskMgmt.getList`.
- Health and temperature come from the session's disk-health check (the monitoring domain's 1.3.6
  store), when there is one. This page can start that check too; it is the same check, with the same
  store and the same task, so the dashboard card fills as well.

### 1.2 Layout

1. Page title "Disks".
2. Intro: "The disks connected to the NAS and what each one holds. Open a disk to see its health,
   change its power settings or wipe it."
3. **Health line** (1.4).
4. **Toolbar**: "Look for new disks" and "Refresh" (both neutral; this page has no filled primary,
   nothing is created here), and on the trailing side "Read at {{time}}." (`text-xs muted-foreground
   tabular-nums`).
5. **Rescan status line** (`role="status"`, polite), only after "Look for new disks" (1.5).
6. The **table** (1.3), not paged.
7. Footer: `ExternalLink` "Disks in the classic interface" → `/#/storage/disks`.

### 1.3 Columns

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Disk | `canonicaldevicefile` | A router link to the disk's page, the name in `Identifier`. Accessible name "Open disk /dev/sdb". Sortable (natural order) |
| 2 | Model | `model`, `serialnumber` | The model as text, wraps. Under it, `text-xs muted-foreground`, the serial number in `Identifier`. Empty model: "Model not reported" in `muted-foreground`. Empty serial: nothing |
| 3 | Size | `size` (byte string) | 0.1, right-aligned, tabular. Sortable |
| 4 | Used for | 0.6 | One line per use, joined in reading order: system disk first, then file systems, then RAID (1.3.1) |
| 5 | Health | the session check | The pill and, for anything but OK, the reason beside it (the monitoring domain's 1.3.4); then the temperature if known (from the check, else `DiskMgmt`'s cached `temperature`). Before any check: "Not checked" in `muted-foreground`. Not in the check's reply (no health readings): "Not reported" |
| 6 | Power | `powermode` | A word, no colour (1.3.2) |

The serial number is shown in the list (section 16, D1): a NAS often has several disks of the same
model and size, and the serial number, printed on each disk's label, is the only way to tell which
physical disk a row is.

No row is selectable and there is no row action: each disk's actions are on its page, and the
destructive one sits apart there (style guide 5.2). The rows keep the device order on every read;
problems are led by the roll-up (1.4), not by moving rows.

#### 1.3.1 "Used for" words

| Use (0.6) | Words |
| --- | --- |
| System disk | "System disk (openmediavault runs from it)" |
| File system in use | "File system {{name}}, in use" |
| File system set up, not mounted | "File system {{name}}, set up but not mounted" |
| File system being created | "A file system is being created" |
| File system not used on this NAS | "File system {{name}}, not used on this NAS" |
| Swap | "Swap space" |
| RAID member | "Part of RAID {{array}}" (the array's `name`, else its device file, in `Identifier`) |
| Being wiped (this session) | "Being wiped" |
| Wiped in this session, nothing found since | "Empty (wiped at {{time}})" |
| Nothing found | "No file system found" |
| The check failed | "Not known" in `muted-foreground` |

`{{name}}` is the file system's `label` as text, else its type and device ("ext4 on <code>/dev/sdb1</code>").
"No file system found" is said rather than "Empty": without reading the disk the interface cannot
claim that nothing is on it (old partitions, for example). After a wipe in this session it knows, and
says "Empty".

#### 1.3.2 Power words

| `powermode` | Word |
| --- | --- |
| starts with `ACTIVE` or `IDLE` | "Awake" |
| starts with `STANDBY` | "Asleep (spun down)" |
| `SLEEP` | "Asleep" |
| `UNKNOWN`, `ERROR`, empty, anything else | "Not reported" in `muted-foreground` |

### 1.4 Health line

A region above the toolbar (`role="status"`, polite), with the same check as the dashboard card:

| State | Line | Button |
| --- | --- | --- |
| Not checked this session | "Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save power." | "Check disk health" (neutral) |
| Checking | "Checking disk health. You can leave this page; the result is kept." | "Checking…" (loading) |
| Checked | The roll-up: the worst pill and "1 of 5 disks: Critical", or "5 disks: OK", then "Checked at {{time}}." | "Check again" (neutral, small) |
| Check failed | `InlineAlert tone="critical"`: "Could not check disk health." + server message (UI-9) | "Try again" |

### 1.5 Look for new disks

`DiskMgmt.rescan`, then the three reads of 1.1. For a disk plugged in while the NAS runs.

- While it runs: the button shows "Looking…" and ignores presses.
- After: the status line reads "Looked for new disks at {{time}}." and either "Found 1 new disk:
  /dev/sdf." (the devices not in the previous read) or "No new disk found. A disk connected a moment
  ago can take a few seconds to appear; press Refresh if it is not listed." No timer re-reads by
  itself.
- Failed: `InlineAlert tone="critical"` under the toolbar: "Could not look for new disks." + server
  message. The list stays.

### 1.6 States

| State | Look |
| --- | --- |
| Loading | Header row and `TableSkeletonRows` (4); "Loading the disks…" for assistive technology |
| Error (`DiskMgmt.getList` failed) | `EmptyState variant="error"` in the table body: "Could not read the disks." + server message + "Try again" |
| Empty (no rows; the system disk is always listed, so this should not happen) | `EmptyState variant="empty"`: "No disks were found. Connect a disk, then press Look for new disks." |
| "Used for" not known (`FileSystemMgmt.getList`, or the RAID read, failed) | The rows, with "Not known" in Used for, and above the table `InlineAlert tone="critical"`: "Could not check what the disks hold. No disk can be wiped until this has been checked." + server message + "Try again" |
| Refreshing | Rows stay with `aria-busy`; Refresh shows "Refreshing…"; afterwards "Read at" is announced |
| Populated | The table |

### 1.7 Keyboard

Tab order: the health line's button, Look for new disks, Refresh, the Disk and Size headers, each
row's disk link, the footer link. After Refresh or a rescan, focus stays on the button pressed.

### 1.8 Copy

| Key | English |
| --- | --- |
| `disks.title` | Disks |
| `disks.intro` | The disks connected to the NAS and what each one holds. Open a disk to see its health, change its power settings or wipe it. |
| `disks.loading` | Loading the disks… |
| `disks.loadFailed` | Could not read the disks. |
| `disks.empty` | No disks were found. Connect a disk, then press Look for new disks. |
| `disks.useFailed` | Could not check what the disks hold. No disk can be wiped until this has been checked. |
| `disks.readAt` | Read at {{time}}. |
| `disks.refresh` | Refresh |
| `disks.refreshing` | Refreshing… |
| `disks.rescan` | Look for new disks |
| `disks.rescanning` | Looking… |
| `disks.rescanDone` | Looked for new disks at {{time}}. |
| `disks.rescanFound_one` / `_other` | Found {{count}} new disk: {{list}}. / Found {{count}} new disks: {{list}}. |
| `disks.rescanNone` | No new disk found. A disk connected a moment ago can take a few seconds to appear; press Refresh if it is not listed. |
| `disks.rescanFailed` | Could not look for new disks. |
| `disks.tableLabel` | Disks |
| `disks.col.disk` | Disk |
| `disks.col.model` | Model |
| `disks.col.size` | Size |
| `disks.col.use` | Used for |
| `disks.col.health` | Health |
| `disks.col.power` | Power |
| `disks.openDisk` | Open disk {{device}} |
| `disks.noModel` | Model not reported |
| `disks.notChecked` | Not checked |
| `disks.notReported` | Not reported |
| `disks.use.system` | System disk (openmediavault runs from it) |
| `disks.use.fsInUse` | File system {{name}}, in use |
| `disks.use.fsSetUp` | File system {{name}}, set up but not mounted |
| `disks.use.fsCreating` | A file system is being created |
| `disks.use.fsUnused` | File system {{name}}, not used on this NAS |
| `disks.use.fsOnDevice` | {{type}} on <device></device> |
| `disks.use.swap` | Swap space |
| `disks.use.raid` | Part of RAID <array></array> |
| `disks.use.wiping` | Being wiped |
| `disks.use.wiped` | Empty (wiped at {{time}}) |
| `disks.use.none` | No file system found |
| `disks.use.unknown` | Not known |
| `disks.power.awake` | Awake |
| `disks.power.standby` | Asleep (spun down) |
| `disks.power.sleep` | Asleep |
| `disks.power.unknown` | Not reported |
| `disks.health.intro` | Disk health is read only when you ask. Reading it wakes any disk that has gone to sleep to save power. |
| `disks.health.checkedAt` | Checked at {{time}}. |
| `disks.classicLink` | Disks in the classic interface |

The check's own words (`check`, `checking`, `checkAgain`, `checkingLine`, `failed`, `rollUp`, `allOk`,
`announce`, `taskLabel`) are the dashboard's `dashboard.disks.*`, moved to a shared `diskCheck.*`
namespace, keeping the English.

---

## 2. A disk's page

**Question it answers:** what is this disk, what is on it, is it healthy, and how is it set up?
**Leads to:** reading its health in detail, watching it, changing its power settings, wiping it.

Administrators only. Route `/storage/disks/$disk` (0.5). No menu item of its own; the Disks item is
current while it is open.

### 2.1 Data on opening

All are reads that do not wake the disk (0.4):

- `DiskMgmt.getList`, `FileSystemMgmt.getList`, `FileSystemMgmt.enumerateFilesystems`,
  `MdMgmt.enumerateDevices` (the Disks list's queries,
  shared and already warm when coming from there);
- `Smart.getDeviceSettings` with the row's `devicefile` (2.5);
- `Smart.getSettings` (the NAS-wide monitoring state and limits);
- `Smart.getScheduleList` (this disk's scheduled self-tests).

The health details (2.4) are read only on request.

### 2.2 Layout

1. **Breadcrumbs** (a new library component, section 12): "Disks" (router link) › "/dev/sdb" (the
   current page, `aria-current="page"`).
2. **Page title**: "Disk /dev/sdb", the device in `Identifier`. Beside it, the pending mark when
   `smartmontools` is pending (0.7). Under it, `text-sm muted-foreground`: "{{model}}, {{size}}".
3. **Summary card** (2.3).
4. **Health details** (2.4), `h2` "Health details".
5. **Monitoring** (2.5), `h2` "Monitoring", with its `h3` "Scheduled self-tests" (2.6).
6. **Power settings** (2.7), `h2` "Power settings".
7. **Wipe this disk** (section 3), `h2` "Wipe this disk", last, after a 24px gap and a divider, so it
   sits apart from everything that is only a setting.

One column throughout; at 1024px and wider the summary card's facts take two columns. Document title:
"/dev/sdb – Disks – openmediavault" (`app.documentTitle`); the serial number is never in it.

### 2.3 Summary card

A `FactList`, in this order:

| Label | Value |
| --- | --- |
| Used for | 1.3.1, one line per use. A file system's name is text for now (the file-systems slice adds its page). When its `_used` is true, a line after it, `text-sm muted-foreground`: "Shared folders or services use it." |
| Health | The session check's pill, reason and "Checked at {{time}}"; or "Not checked this session." with the router link "Check disk health on the Disk health page" → `/storage/smart/overview` |
| Temperature | From the check, else `DiskMgmt`'s cached reading: "34 °C", with the temperature status of 0.2 beside it when a limit is set ("At or above its limit of 50 °C"). None: "Not read" |
| Power | 1.3.2 |
| Model | `model` (and `vendor` before it when it is not already the model's first word) |
| Serial number | `serialnumber` in `Identifier`, with a `CopyButton` ("Copy serial number") |
| Size | 0.1, with the label size |
| Connection | `hotpluggable` true: "Removable while running (USB or a hot-swap bay)"; false: "Built in" |

Then a `Disclosure` **"Other names for this disk"** / "Hide other names": a short sentence, "The
device name (/dev/sdb) can change when the NAS restarts. These names stay the same.", then "Stable
name" (`devicefile`), "Other names" (each of `devicelinks`, one per line), "World Wide Name" (`wwn`,
when not empty), all in `Identifier`.

When `israid` is true: a line under the card, `text-sm`: "This is a set of disks made by a hardware
RAID controller, which the NAS sees as one disk." **[verify]** what `israid` reports (it is not
membership of a software RAID array).

### 2.4 Health details

Read **only when the reader presses "Read health details"**. It wakes this disk, and only this disk.

**Before reading:**

- "Detailed readings come from the disk itself and are read only when you ask. Reading them wakes
  this disk if it has gone to sleep." When the power word is Asleep, a second sentence: "This disk is
  asleep now."
- Button **"Read health details"** (neutral).

**Reading:** `Smart.getInformation`, `Smart.getAttributes` and `Smart.getSelfTestLogs` with the row's
`devicefile`, in parallel. The button shows "Reading…"; the three parts show skeletons; a status
line: "Reading the health details of /dev/sdb…". Each part shows its own result or error: one failure
does not hide the others.

**After:** "Read at {{time}}. The readings do not update by themselves." and **"Read again"**
(neutral, small). The result is kept in memory for the session, per disk (UI-13); a reload forgets
it.

#### 2.4.1 About this disk (`h3`)

A `FactList` from `Smart.getInformation`, known keys only, in this order, each shown only when
present:

| Label | Key | Display |
| --- | --- | --- |
| Model family | `modelfamily` | text |
| Model | `devicemodel` | text |
| Firmware version | `firmwareversion` | `Identifier` |
| Kind of disk | `rotationrate` | "Solid State Device" (the tool's words): "Solid-state (no moving parts)"; a speed: "Hard disk, {{rpm}} rpm"; anything else as text |
| Capacity reported by the disk | `usercapacity` | as text (the tool's own form, for example "4,000,787,030,016 bytes [4.00 TB]") |
| Time powered on | `poweronhours` | 0.1 duration |
| Times switched on | `powercycles` | locale grouping |

Other keys are not shown here (their names are the tool's lower-cased labels, not words); the full
report (2.4.4) has everything.

#### 2.4.2 Key readings (`h3`)

From `Smart.getAttributes`. First a roll-up line over every reading's `assessment`, with the library's
`rollUp`: "All 30 readings are within the disk's limits." with an OK pill, or the worst pill and "1 of
30 readings: Critical". `assessment` maps to a state as `overallstatus` does (0.2), with a short
reason: `BAD_ATTRIBUTE_IN_THE_PAST` "Was outside its limit in the past", `BAD_ATTRIBUTE_NOW` "Outside
its limit now", `BAD_SECTOR` "Some damaged areas", `BAD_SECTOR_MANY` "Many damaged areas", anything
else Unknown "Not recognised".

Then a `FactList` of the readings that matter most to an owner, each shown only when the disk reports
it, with a plain name, the value in words, and the pill and reason when not OK:

| Reading (`id`) | Plain name | Value | One-line meaning, `text-sm muted-foreground` |
| --- | --- | --- | --- |
| 5 | Damaged areas replaced | "{{count}}" | "Areas that went bad and were replaced by spare ones. A rising number is a warning sign." |
| 197 | Areas waiting to be checked | "{{count}}" | "Areas the disk had trouble reading. It should be 0." |
| 198 | Areas that could not be read | "{{count}}" | "It should be 0." |
| 187 | Errors it could not correct | "{{count}}" | "It should be 0." |
| 199 | Connection errors | "{{count}}" | "Usually a loose or faulty cable, not the disk itself." |
| 9 | Time powered on | duration from hours | none |
| 12 | Times switched on | "{{count}}" | none |
| 194, else 190 | Temperature | "{{value}} °C" | none |

The value is the leading whole number of `rawvalue`. When it has none (some disks write "12345h+06m"
or "34 (Min/Max 20/45)"), the leading number is used if there is one, else the raw text is shown as
received in `Identifier`.

A `Disclosure` **"Show all {{count}} readings"** / "Hide the readings" opens the full table, preceded
by one sentence:

"Value, Worst and Limit are the disk's own scores, usually counting down from 100 or 200. A reading
is a problem when its value falls to its limit. The raw value is the disk's own count, which means
something only for some readings."

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | ID | `id` | tabular, right-aligned |
| 2 | Name | `attrname` | `Identifier` (the disk's own name for it), breaks anywhere |
| 3 | Value | `value` | tabular |
| 4 | Worst | `worst` | tabular |
| 5 | Limit | `threshold` | tabular; 0: "None" |
| 6 | Raw value | `rawvalue` | `Identifier`, as received |
| 7 | Kind | `prefailure` | true: "Warns of failure"; false: "Wear and age" |
| 8 | Status | `assessment`, `whenfailed` | the pill (OK included here, since this is the full table) and, when `whenfailed` is not empty or `-`, the text as received after it |

The server's English `description` for each reading is not shown: it is not translated (UI-2 is not
the issue; one language mixed into another is). The table scrolls inside its own frame.

**No reading table.** NVMe and SAS disks return an empty list (they report health differently):
"This disk does not report a table of readings. NVMe and SAS disks report their health in another
form, which is in the full report below."

#### 2.4.3 Self-test results (`h3`)

From `Smart.getSelfTestLogs`: the tests the disk has run, newest first (the disk's own order), as
recorded **by the disk** (the NAS keeps no record of its own).

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | When | `lifetime` (power-on hours at the test) | With the current `poweronhours` known: "About {{duration}} ago"; else "At {{hours}} hours powered on". Tabular |
| 2 | Test | `description` | "Short offline" and "Short captive": "Short"; "Extended offline" and "Extended captive": "Long"; anything else as received |
| 3 | Result | `status`, `remaining` | The words of 2.4.3.1. For anything but "Passed", the disk's own text follows in `text-xs muted-foreground`, as received |
| 4 | First problem at | `lbaoffirsterror` | `-` or empty: nothing; otherwise "Block {{value}}" in `Identifier` |

##### 2.4.3.1 Result words

The tool's text is English whatever the NAS's language; it is matched, case-insensitively:

| `status` | Pill | Words |
| --- | --- | --- |
| starts with "Completed without error" | OK | "Passed" |
| contains "in progress" | none | "Running, {{remaining}} left" |
| starts with "Aborted" | none | "Stopped before it finished" |
| starts with "Interrupted" | none | "Interrupted, for example by a restart" |
| contains "failure" or "Fatal" | Critical | "Failed" |
| anything else | Unknown | the text as received |

Empty: "No self-test results are recorded on this disk." and, `text-sm muted-foreground`, "Some disks,
such as NVMe disks, keep their results in a form shown only in the full report." The tool recognises
only short and long tests here; others (such as a transport check) are only in the full report.

#### 2.4.4 The full report

A `Disclosure` **"Show the full report"** / "Hide the full report". Opening it the first time reads
`Smart.getExtendedInformation` (a foreground read; the disk is awake by now). The text is shown in
the `TaskLog` block with `wrap={false}` and `size="page"`: the terminal pair, no wrapping, its own
scroll, focusable, labelled "Full health report of /dev/sdb", with "Copy report". Reading: six mono
skeleton lines. Error: "Could not read the full report." + server message + "Try again". The report is
kept with the other details.

#### 2.4.5 States

| State | Look |
| --- | --- |
| Not read this session | 2.4, before reading |
| Reading | Skeletons per part, the status line |
| Disk does not report its health | Each part's error state shows the server's message, which says so (for example "does not support S.M.A.R.T."). Above them, once, `text-sm`: "Some USB enclosures and virtual disks do not pass health readings through." |
| One part failed | That part: "Could not read the {{part}}." + server message + "Try again" (that part only) |
| Populated | 2.4.1 to 2.4.4 |

### 2.5 Monitoring

**Whether the NAS watches this disk.** A small settings form (Phase 3, 0.4).

**Data:** `Smart.getDeviceSettings {devicefile}`. The server answers a disk with no monitoring settings
saved with an error (its database query finds no object). **[verify]** the reply's code and text for
that case on the VM. The interface recognises exactly that reply as "no settings saved": watching is
off, and a save creates the settings with OMV's new-object identifier. Any other error is the error
state below. When the session's health check has this disk, its `monitor` and `uuid` are used to
confirm the reading. If the interface ever takes a real failure for "no settings", the save fails
safely: the server refuses a second settings object for the same disk.

**Fields:**

1. Checkbox **"Watch this disk's health"** (`enable`). Hint: "The NAS checks this disk regularly,
   records problems, and emails you about them when email is set up."
2. `Disclosure` **"Temperature limit for this disk"**: a radio group,
   - "Same as for all disks ({{limit}})" (`tempmax` 0), where `{{limit}}` is the NAS-wide limit from
     `Smart.getSettings` ("50 °C") or "no limit";
   - "Its own limit", with a number field "Limit", unit °C, 1 to 100, required when chosen. Hint:
     "Recorded at this temperature, and emailed at {{alert}}." (the limit plus 5 °C, 0.2).

   `tempdiff` is not shown here and is sent back unchanged (read, change, write: UX audit R4).

**Rules:**

- **Global monitoring off** (`Smart.getSettings` `enable` false): a neutral `InlineAlert` above the
  form: "Monitoring is off for the whole NAS, so no disk is watched, even when this is ticked." and a
  router link "Open the disk health settings" → `/storage/smart/settings`.
- **Scheduled self-tests exist** for this disk (`_used` true) and the disk is watched: the checkbox is
  unavailable (`aria-disabled`, focusable) with the reason below it, in words: "This disk has 2
  scheduled self-tests. Delete them under Scheduled self-tests below before you stop watching it." A
  self-test of a disk that is not watched never runs, and nothing would say so. The server does not
  enforce this; the stock interface does, and so does this one.
- **The disk was not in the last health check** (the session has a check, and this disk is not in its
  reply, so it reported no health readings): hint under the checkbox, "This disk did not report its
  health in the last check, so it may not support monitoring. Saving checks this." The server
  refuses unsupported disks with its own message.

**Buttons:** Save (filled primary of this form) and Discard changes. Save calls
`Smart.setDeviceSettings` with `uuid`, `devicefile`, `enable`, `tempdiff` and `tempmax` (all five; the
server reads the last two even though its schema omits them). Then the save-then-apply loop of Phase
3 (3.4 there) with the shared saved line (0.7). The page has more than one form, so each form's Save
is filled only while that form has unsaved changes; otherwise it is the disabled-but-focusable
outline (Phase 3, 0.4: one filled primary per view).

| State | Look |
| --- | --- |
| Loading | The checkbox's skeleton |
| Error | "Could not read whether this disk is watched." + server message + "Try again". The form is not shown |
| Saving | "Saving…", fields read-only |
| Save failed | `FormAlert` critical "The monitoring setting was not saved." + server message; focus to it; edits kept |
| Pending | The pending mark beside the page title; the band |

### 2.6 Scheduled self-tests of this disk (`h3`)

The rows of `Smart.getScheduleList` whose `devicefile` is one of this disk's names, in the Self-tests
page's table (6.3) without its Disk column, with the same row actions (Run now, Edit, Delete) and
their dialogs. Under it, **"Add a self-test"** (neutral) opens the add dialog (6.4) with this disk
chosen.

- Empty: "No self-tests are scheduled for this disk. A regular short test lets the disk find problems
  early."
- The disk is not watched: `text-sm`, above the list: "Self-tests run only while the disk is watched."
- Router link at the end: "All scheduled self-tests" → `/storage/smart/self-tests`.

### 2.7 Power settings

How the disk saves power: when it spins down, its own power-saving level, its noise level, and its
write cache. OMV sends them to the disk with the disk-health tool, each time the NAS starts or wakes,
and when the changes are applied (read from OMV's configuration template). The owner's spin-down
plugin (`openmediavault-spindown`) reads and writes the same spin-down time, so the two pages always
agree.

**Data:** the row's `hdparm` object in `DiskMgmt.getList` (absent when nothing is saved).

#### 2.7.1 Nothing saved yet

The NAS does not touch the disk's power settings now. The section shows:

- "The NAS does not set this disk's power settings now, so the disk uses its own."
- Button **"Choose power settings"** (neutral), which reveals the form (2.7.2) with the starting values
  of 2.7.3 and moves focus to its first field.
- Under the button, `text-sm muted-foreground`: "Once saved, these settings can be changed but not
  removed. The NAS then sends all four to the disk each time it starts or wakes." (OMV has no method
  to delete them; the classic interface cannot either.)

#### 2.7.2 Fields

One intro sentence: "These settings are for hard disks. Solid-state and NVMe disks usually ignore
them."

| Field | Control | Values | Hint |
| --- | --- | --- | --- |
| **Spin down after** (`spindowntime`) | `Select` with groups (more than seven options) | "Never" (0); group **Minutes**: 5 (60), 10 (120), 20 (240), 30 (241); group **Hours**: 1 hour (242), 2 hours (244), 3 hours (246), 4 hours (248), 5 hours (250), 5 hours 30 minutes (251). A saved value not in the list is kept as one more option, "{{duration}} (set elsewhere)" (0.1) | "When the disk has not been used for this long, it stops spinning to save power, and starts again when it is needed, which takes a few seconds. Some disks ignore this and keep spinning; the spin-down add-on (openmediavault-spindown) can put them to sleep after the same time." |
| **Power-saving level** (`apm`) | `Select` with groups | "Off: the disk does not save power by itself" (0); group **Can spin down by itself**: "Lowest power use (level 1)", "Low power use (level 64)", "Balanced (level 127)"; group **Keeps spinning**: "Low power use (level 128)", "Balanced (level 192)", "Highest performance (level 254)". Another saved value: "Level {{value}} (set elsewhere)" | "How hard the disk itself works to save power. From level 128 up it does not spin down by itself. Many disks do not support this setting." |
| **Noise level** (`aam`) | `Select` (three options) | "Off" (0), "Quiet, slower" (128), "Fast, louder" (254) | "Lets the disk move more quietly but more slowly. Many newer disks do not support this and ignore it." |
| **Use the disk's write cache** (`writecache`) | Checkbox | on, off | "Makes writing faster. If the power fails suddenly, the last few seconds of writes can be lost; a battery backup (UPS) protects against that. Most disks come with it on." |

The level numbers stay in brackets for anyone following instructions written for the classic
interface, which shows them.

#### 2.7.3 Starting values when nothing is saved

OMV sends every field, including "off" values: a field left at its default is not "left alone". The
form therefore starts at: Spin down after **Never**, Power-saving level **Off**, Noise level **Off**
(OMV's defaults), and **write cache on**, which differs from OMV's default of off (section 17, P6).
Most disks come with the write cache on, and saving "off" with the other settings would silently
slow the disk. The owner's spin-down plugin keeps the disk's current write cache for the same reason;
this interface cannot read the current state, so it starts from the common factory one, visibly, with
the hint.

#### 2.7.4 Warning: monitoring keeps the disk awake

When "Spin down after" is not Never, the disk is watched, global monitoring is on, and the NAS-wide
"when a disk is asleep" setting is "Check it anyway" (`powermode` `never`), a neutral `InlineAlert`
under the field: "Disk monitoring checks this disk every {{interval}} and wakes it to do so, so it may
never stay asleep. To let it sleep, change what happens to sleeping disks in the disk health
settings." and a router link "Open the disk health settings". Advice, not a status: no colour.

#### 2.7.5 Saving

Save and Discard changes, as 2.5. Save calls `DiskMgmt.setHdParm` with all six fields: `uuid` (the
saved object's, or OMV's new-object identifier), `devicefile` (the row's), `apm`, `aam`,
`spindowntime`, `writecache`. Then the save-then-apply loop. **[verify]** whether applying (which
restarts OMV's power-settings service and sends every disk's settings again) wakes a sleeping disk; if
it does, the saved line adds "Applying sends these settings to the disk, which wakes it if it is
asleep."

| State | Look |
| --- | --- |
| Nothing saved | 2.7.1 |
| Populated | The form with the saved values |
| Saving | "Saving…", fields read-only |
| Save failed | `FormAlert` critical "The power settings were not saved." + server message (for example the server's "already exists" when another administrator saved first) |
| Pending | The pending mark; the band |

### 2.8 Keyboard and focus

Tab order: breadcrumb link, the summary's links and Copy serial number, "Other names for this disk",
Read health details (then, after reading: Read again, Show all readings, the readings table region,
Show the full report, the report region and Copy report), the monitoring form (checkbox, Temperature
limit disclosure and its radios and field, Save, Discard changes), the self-test rows' Actions
buttons, Add a self-test, All scheduled self-tests, the power form (Choose power settings, or each
field, Save, Discard changes), then the wipe section (section 3). After Read health details, focus
stays on the button (now Read again); "Health details of /dev/sdb read." is announced politely.

### 2.9 States of the page

| State | Look |
| --- | --- |
| Loading | Title skeleton; the summary as `FactListSkeleton`; the sections' headings with skeletons |
| `DiskMgmt.getList` failed | `EmptyState variant="error"` in place of the content: "Could not read this disk." + server message + "Try again" |
| No such disk (pattern fails, or no row) | `EmptyState variant="empty"`: "No disk called {{name}} is connected. Its name may have changed when the NAS restarted." and a router link "Show all disks" → `/storage/disks`. `{{name}}` is the address's value, which passed the pattern or is not shown ("This disk is not connected.") |
| Disk gone after a re-read (unplugged) | The same empty state; a running wipe's panel stays (3.5) |
| Populated | 2.2 |

### 2.10 Copy

| Key | English |
| --- | --- |
| `disk.breadcrumb` | Disks |
| `disk.title` | Disk <device></device> |
| `disk.subtitle` | {{model}}, {{size}} |
| `disk.documentTitle` | {{device}} – Disks |
| `disk.loading` | Loading the disk… |
| `disk.loadFailed` | Could not read this disk. |
| `disk.notFound` | No disk called {{name}} is connected. Its name may have changed when the NAS restarted. |
| `disk.notFoundNoName` | This disk is not connected. |
| `disk.showAll` | Show all disks |
| `disk.fact.use` | Used for |
| `disk.fact.useShared` | Shared folders or services use it. |
| `disk.fact.health` | Health |
| `disk.fact.healthNotChecked` | Not checked this session. |
| `disk.fact.healthCheckLink` | Check disk health on the Disk health page |
| `disk.fact.checkedAt` | Checked at {{time}} |
| `disk.fact.temperature` | Temperature |
| `disk.fact.notRead` | Not read |
| `disk.fact.tempAtLimit` | At or above its limit of {{limit}} |
| `disk.fact.tempAtAlert` | At or above its alert level of {{alert}} |
| `disk.fact.power` | Power |
| `disk.fact.model` | Model |
| `disk.fact.serial` | Serial number |
| `disk.fact.copySerial` | Copy serial number |
| `disk.fact.size` | Size |
| `disk.fact.sizeLabel` | {{size}} ({{label}} on the label) |
| `disk.fact.connection` | Connection |
| `disk.fact.removable` | Removable while running (USB or a hot-swap bay) |
| `disk.fact.builtIn` | Built in |
| `disk.names.show` | Other names for this disk |
| `disk.names.hide` | Hide other names |
| `disk.names.intro` | The device name ({{device}}) can change when the NAS restarts. These names stay the same. |
| `disk.names.stable` | Stable name |
| `disk.names.links` | Other names |
| `disk.names.wwn` | World Wide Name |
| `disk.hardwareRaid` | This is a set of disks made by a hardware RAID controller, which the NAS sees as one disk. |
| `disk.details.title` | Health details |
| `disk.details.intro` | Detailed readings come from the disk itself and are read only when you ask. Reading them wakes this disk if it has gone to sleep. |
| `disk.details.asleep` | This disk is asleep now. |
| `disk.details.read` | Read health details |
| `disk.details.reading` | Reading… |
| `disk.details.readingLine` | Reading the health details of {{device}}… |
| `disk.details.readAt` | Read at {{time}}. The readings do not update by themselves. |
| `disk.details.readAgain` | Read again |
| `disk.details.announce` | Health details of {{device}} read. |
| `disk.details.noPassThrough` | Some USB enclosures and virtual disks do not pass health readings through. |
| `disk.details.partFailed` | Could not read the {{part}}. |
| `disk.details.part.information` | information about the disk |
| `disk.details.part.readings` | readings |
| `disk.details.part.tests` | self-test results |
| `disk.details.about` | About this disk |
| `disk.details.modelFamily` | Model family |
| `disk.details.model` | Model |
| `disk.details.firmware` | Firmware version |
| `disk.details.kind` | Kind of disk |
| `disk.details.kindSsd` | Solid-state (no moving parts) |
| `disk.details.kindHdd` | Hard disk, {{rpm}} rpm |
| `disk.details.capacity` | Capacity reported by the disk |
| `disk.details.powerOnTime` | Time powered on |
| `disk.details.powerCycles` | Times switched on |
| `disk.details.keyReadings` | Key readings |
| `disk.details.allWithin_one` / `_other` | The {{count}} reading is within the disk's limits. / All {{count}} readings are within the disk's limits. |
| `disk.details.rollUp_one` / `_other` | {{count}} of {{total}} readings: {{status}} |
| `disk.details.assess.pastBad` | Was outside its limit in the past |
| `disk.details.assess.nowBad` | Outside its limit now |
| `disk.details.assess.someSectors` | Some damaged areas |
| `disk.details.assess.manySectors` | Many damaged areas |
| `disk.details.assess.other` | Not recognised |
| `disk.details.attr.5` | Damaged areas replaced |
| `disk.details.attr.5.meaning` | Areas that went bad and were replaced by spare ones. A rising number is a warning sign. |
| `disk.details.attr.197` | Areas waiting to be checked |
| `disk.details.attr.197.meaning` | Areas the disk had trouble reading. It should be 0. |
| `disk.details.attr.198` | Areas that could not be read |
| `disk.details.attr.198.meaning` | It should be 0. |
| `disk.details.attr.187` | Errors it could not correct |
| `disk.details.attr.187.meaning` | It should be 0. |
| `disk.details.attr.199` | Connection errors |
| `disk.details.attr.199.meaning` | Usually a loose or faulty cable, not the disk itself. |
| `disk.details.attr.9` | Time powered on |
| `disk.details.attr.12` | Times switched on |
| `disk.details.attr.temperature` | Temperature |
| `disk.details.showAll` | Show all {{count}} readings |
| `disk.details.hideAll` | Hide the readings |
| `disk.details.tableIntro` | Value, Worst and Limit are the disk's own scores, usually counting down from 100 or 200. A reading is a problem when its value falls to its limit. The raw value is the disk's own count, which means something only for some readings. |
| `disk.details.tableLabel` | All readings of {{device}} |
| `disk.details.col.id` | ID |
| `disk.details.col.name` | Name |
| `disk.details.col.value` | Value |
| `disk.details.col.worst` | Worst |
| `disk.details.col.limit` | Limit |
| `disk.details.col.raw` | Raw value |
| `disk.details.col.kind` | Kind |
| `disk.details.col.status` | Status |
| `disk.details.limitNone` | None |
| `disk.details.kindPrefail` | Warns of failure |
| `disk.details.kindAge` | Wear and age |
| `disk.details.noTable` | This disk does not report a table of readings. NVMe and SAS disks report their health in another form, which is in the full report below. |
| `disk.details.tests` | Self-test results |
| `disk.details.testsTableLabel` | Self-test results of {{device}} |
| `disk.details.testsCol.when` | When |
| `disk.details.testsCol.test` | Test |
| `disk.details.testsCol.result` | Result |
| `disk.details.testsCol.firstProblem` | First problem at |
| `disk.details.testAgo` | About {{duration}} ago |
| `disk.details.testAtHours` | At {{hours}} hours powered on |
| `disk.details.testShort` | Short |
| `disk.details.testLong` | Long |
| `disk.details.result.passed` | Passed |
| `disk.details.result.running` | Running, {{remaining}} left |
| `disk.details.result.aborted` | Stopped before it finished |
| `disk.details.result.interrupted` | Interrupted, for example by a restart |
| `disk.details.result.failed` | Failed |
| `disk.details.block` | Block {{value}} |
| `disk.details.testsEmpty` | No self-test results are recorded on this disk. |
| `disk.details.testsEmptyHint` | Some disks, such as NVMe disks, keep their results in a form shown only in the full report. |
| `disk.details.reportShow` | Show the full report |
| `disk.details.reportHide` | Hide the full report |
| `disk.details.reportLabel` | Full health report of {{device}} |
| `disk.details.reportCopy` | Copy report |
| `disk.details.reportFailed` | Could not read the full report. |
| `disk.monitoring.title` | Monitoring |
| `disk.monitoring.watch` | Watch this disk's health |
| `disk.monitoring.watchHint` | The NAS checks this disk regularly, records problems, and emails you about them when email is set up. |
| `disk.monitoring.globalOff` | Monitoring is off for the whole NAS, so no disk is watched, even when this is ticked. |
| `disk.monitoring.settingsLink` | Open the disk health settings |
| `disk.monitoring.hasTests_one` / `_other` | This disk has {{count}} scheduled self-test. Delete it under Scheduled self-tests below before you stop watching it. / This disk has {{count}} scheduled self-tests. Delete them under Scheduled self-tests below before you stop watching it. |
| `disk.monitoring.notInCheck` | This disk did not report its health in the last check, so it may not support monitoring. Saving checks this. |
| `disk.monitoring.tempShow` | Temperature limit for this disk |
| `disk.monitoring.tempSame` | Same as for all disks ({{limit}}) |
| `disk.monitoring.tempNoLimit` | no limit |
| `disk.monitoring.tempOwn` | Its own limit |
| `disk.monitoring.tempLimit` | Limit |
| `disk.monitoring.tempHint` | Recorded at this temperature, and emailed at {{alert}}. |
| `disk.monitoring.tempRange` | Enter a whole number from 1 to 100. |
| `disk.monitoring.loadFailed` | Could not read whether this disk is watched. |
| `disk.monitoring.saveFailed` | The monitoring setting was not saved. |
| `disk.tests.title` | Scheduled self-tests |
| `disk.tests.empty` | No self-tests are scheduled for this disk. A regular short test lets the disk find problems early. |
| `disk.tests.notWatched` | Self-tests run only while the disk is watched. |
| `disk.tests.add` | Add a self-test |
| `disk.tests.all` | All scheduled self-tests |
| `disk.power.title` | Power settings |
| `disk.power.intro` | These settings are for hard disks. Solid-state and NVMe disks usually ignore them. |
| `disk.power.notSet` | The NAS does not set this disk's power settings now, so the disk uses its own. |
| `disk.power.choose` | Choose power settings |
| `disk.power.noRemove` | Once saved, these settings can be changed but not removed. The NAS then sends all four to the disk each time it starts or wakes. |
| `disk.power.spindown` | Spin down after |
| `disk.power.spindownHint` | When the disk has not been used for this long, it stops spinning to save power, and starts again when it is needed, which takes a few seconds. Some disks ignore this and keep spinning; the spin-down add-on (openmediavault-spindown) can put them to sleep after the same time. |
| `disk.power.never` | Never |
| `disk.power.groupMinutes` | Minutes |
| `disk.power.groupHours` | Hours |
| `disk.power.setElsewhere` | {{value}} (set elsewhere) |
| `disk.power.apm` | Power-saving level |
| `disk.power.apmHint` | How hard the disk itself works to save power. From level 128 up it does not spin down by itself. Many disks do not support this setting. |
| `disk.power.apm.0` | Off: the disk does not save power by itself |
| `disk.power.apm.groupSpinDown` | Can spin down by itself |
| `disk.power.apm.groupSpinning` | Keeps spinning |
| `disk.power.apm.1` | Lowest power use (level 1) |
| `disk.power.apm.64` | Low power use (level 64) |
| `disk.power.apm.127` | Balanced (level 127) |
| `disk.power.apm.128` | Low power use (level 128) |
| `disk.power.apm.192` | Balanced (level 192) |
| `disk.power.apm.254` | Highest performance (level 254) |
| `disk.power.apm.other` | Level {{value}} (set elsewhere) |
| `disk.power.aam` | Noise level |
| `disk.power.aamHint` | Lets the disk move more quietly but more slowly. Many newer disks do not support this and ignore it. |
| `disk.power.aam.0` | Off |
| `disk.power.aam.128` | Quiet, slower |
| `disk.power.aam.254` | Fast, louder |
| `disk.power.writeCache` | Use the disk's write cache |
| `disk.power.writeCacheHint` | Makes writing faster. If the power fails suddenly, the last few seconds of writes can be lost; a battery backup (UPS) protects against that. Most disks come with it on. |
| `disk.power.monitorWakes` | Disk monitoring checks this disk every {{interval}} and wakes it to do so, so it may never stay asleep. To let it sleep, change what happens to sleeping disks in the disk health settings. |
| `disk.power.applyWakes` | Applying sends these settings to the disk, which wakes it if it is asleep. |
| `disk.power.saveFailed` | The power settings were not saved. |
| `common.savedPending` | Saved. The changes take effect when you apply them in the band at the top of the page. |
| `format.duration.years_one` / `_other` | {{count}} year / {{count}} years |
| `format.sizeDecimal` | {{value}} {{unit}} |

---

## 3. Wipe a disk

**Question it answers:** can I erase this disk to use it for something else, and what exactly will I
lose? **Leads to:** an empty disk, ready for a new file system.

`DiskMgmt.wipe {devicefile, secure}`, a background task (`x-omv-task`), destructive to data
(`x-omv-destructive: data`, UI-8). It acts at once: no apply, nothing pending, and nothing can undo it.
The server checks only that the device exists (UX audit B14). Every refusal below is this interface's
own (journal, 2026-11-21).

### 3.1 The section on the disk's page

`h2` "Wipe this disk", last on the page, after a divider:

- "Wiping erases everything on the disk so it can be used for something new, such as a new file
  system."
- Button **"Wipe disk…"** (neutral with the destructive form only on the dialog's confirm button,
  style guide 3.6; the ellipsis says a dialog follows).

**When the disk cannot be wiped**, the button is unavailable (`aria-disabled`, focusable) and the
blocker is named in words beside it, never only in a tooltip (UX audit 4.8), each with what to do:

| Blocker (0.6) | Words | What to do |
| --- | --- | --- |
| System disk | "This is the system disk: openmediavault runs from it, so it cannot be wiped." | none |
| Read-only | "This disk is read-only, so it cannot be wiped." | none |
| File system in use | "It holds the file system {{name}}, which is in use." (+ "Shared folders or services use it." when `_used`) | "Stop using it and unmount it under File systems first." `ExternalLink` "File systems in the classic interface" |
| File system set up | "It holds the file system {{name}}, which is set up on this NAS." | "Remove it under File systems first." same link |
| File system being created | "A file system is being created on it now." | none |
| Swap | "It holds swap space, disk space the NAS can use as extra memory." | none (section 17, P5) |
| RAID member | "It is part of the RAID array {{array}}. Wiping it would damage the array." | "Remove it from the array under RAID management first." `ExternalLink` "RAID management in the classic interface" |
| Being wiped | "It is being wiped now." | the running panel (3.5) |
| Could not check | "Could not check what this disk holds, so it cannot be wiped now." + server message | "Try again" (re-reads 0.6's inputs) |

Several blockers: each on its own line, in this order. No classic link is offered to get round a
refusal (section 17, P3).

### 3.2 The check before the dialog

Pressing "Wipe disk…" re-reads `DiskMgmt.getList`, `FileSystemMgmt.getList` and (when installed)
`MdMgmt.enumerateDevices` (UX audit R3, R4: what can fail cheaply fails before anything is destroyed).
The dialog opens at once with "Checking what is on this disk…" (`aria-busy`, Cancel available), then
shows one of:

- **A refusal**, if a blocker appeared since the page was read: the dialog's title "This disk cannot
  be wiped now", the blocker of 3.1, and only a "Close" button (focused). The page's section updates to
  match.
- **The disk changed**: the re-read row for this device has a different `serialnumber` or `model`
  from the one the page showed (another disk took its name, 0.5): title "This disk changed", "The disk
  now called /dev/sdb is not the one this page showed. Its details have been read again; check them
  before you wipe it.", and "Close". The page shows the new disk.
- **The disk is gone**: "This disk is no longer connected." and "Close".
- **The confirmation** (3.3).

### 3.3 The confirmation

`ConfirmDialog variant="destructive"` (warning-shape icon, the red confirm button, focus on Cancel,
no form so Enter does not confirm, Escape and Cancel close it, the scrim does not).

1. **Title** (`h2` of the dialog): "Wipe disk /dev/sdb?" with the device in code type.
2. **The disk, named exactly**, as a short list under the title: the model; "Serial number {{serial}}"
   in `Identifier`; the size with its label size ("3.6 TiB (4 TB on the label)"). This is the
   identification the reader matches against the physical disk.
3. **The consequence**, one sentence, in the body colour: "Everything on this disk is erased: its
   partitions, file systems and files. This cannot be undone."
4. **What is on it now** (`h3` "On this disk now"), a list:
   - each file system not used on this NAS: "The file system {{name}} ({{type}}, {{size}}). It is not
     used on this NAS. Its files are lost.";
   - with nothing found: "No file system was found. Anything else on it, such as data from another
     computer, is erased too.";
   - when the NAS has storage this page cannot trace (0.6): "This NAS also has storage that this page
     cannot trace to a disk, such as encrypted disks, LVM or ZFS. If this disk is part of it, wiping it
     destroys that storage and its files.";
   - always last: "Its monitoring and power settings are kept."
5. **How to wipe** (a radio group, legend "How to wipe"):
   - **"Quick wipe (recommended)"** (default). Hint: "Erases the partition table and the start and end
     of the disk, so the NAS sees it as empty. Takes a few seconds. The old files stay on the disk until
     they are overwritten, and recovery tools could still find them."
   - **"Secure wipe"**. Hint: "Overwrites the whole disk once, so the old files cannot be recovered.
     Takes many hours: often 2 hours or more for each TB on a hard disk. You can stop it, but the disk
     is then only partly wiped. On a solid-state disk it may not reach every part of the disk."
6. **Type to confirm** (`TypeToConfirmField`): "Type /dev/sdb to confirm." The device name, in code
   type. The match is exact and case-sensitive, surrounding spaces ignored (`typedMatches`). Changing
   the method keeps what was typed.
7. **Buttons**: "Cancel" (focused on open) and **"Wipe disk"** (`destructive`), unavailable until the
   typed name matches, with the reason as the field's hint: "The Wipe disk button is available once
   the name matches."

**On "Wipe disk":** the button shows "Checking again…" and the interface re-reads the three lists
once more. If a blocker or a change appeared, the dialog switches to the refusal or "This disk
changed" (3.2), and nothing is wiped. Otherwise it starts `DiskMgmt.wipe` with the fresh row's
`devicefile` (the stable `/dev/disk/by-id/…` path, as the stock interface sends) and `secure` from the
radio, through the task helper, closes the dialog, and moves focus to the running panel's heading.
There is no second confirmation: one named, typed confirmation is the gate (style guide 5.4).

If starting the task fails (the call itself is refused), the dialog stays open with the error under
the buttons: "The wipe did not start." + server message. Nothing was erased.

### 3.4 Pending changes elsewhere

Wiping is not a configuration change, so the job runner's pre-flight (R1) does not apply: pending
changes from elsewhere neither block nor ride along. A file system whose mount is saved but not
applied already counts as "set up" (0.6) and blocks the wipe.

### 3.5 While it runs

The section's body becomes the running panel (`JobProgress`, style guide 5.7):

- Heading `h3`: "Wiping /dev/sdb", the pill "Running", and "Running for {{duration}}" (tabular,
  updated each second without announcement).
- Quick: "Quick wipe. This takes a few seconds."
- Secure: a progress bar when the output's last line ends in a percentage (`shred` prints "…pass 1/1
  …1.2GiB/3.7TiB 32%") **[verify]** the line format; "{{percent}} done" beside it. With no percentage
  yet: the indeterminate form, "Working…" under reduced motion. Under it: "Secure wipe. This takes many
  hours. You can leave this page or sign out; the wipe continues on the NAS. Its progress is shown here
  and in Tasks while you stay signed in."
- `Disclosure` "Show the output" / "Hide the output": the `TaskLog` with the task's output, following
  the tail.
- **Secure only: "Stop wiping"** (neutral). It opens a plain confirmation (`ConfirmDialog`, default
  variant, focus on the cancel button): title "Stop wiping /dev/sdb?", body "The part already
  overwritten stays erased; the rest of the disk is not wiped. Run a quick wipe afterwards so the NAS
  sees the disk as empty.", buttons "Keep wiping" and "Stop wiping". It calls `Exec.stop` through the
  task helper. A quick wipe has no stop control: it takes seconds, and stopping it halfway helps
  nothing.
- The task is in the top bar's Tasks menu as "Wipe disk /dev/sdb" for the whole session. Leaving the
  page does not stop it; coming back shows the panel again from the registry. A reload or a new
  sign-in loses the handle (UI-5); the wipe goes on on the NAS, and the page can no longer show it
  (UX audit R8; section 15).
- Elsewhere on the page the forms stay usable. "Used for" says "Being wiped", and "Wipe disk…" is
  unavailable with "It is being wiped now."
- Announced politely on start: "Wiping /dev/sdb started."

### 3.6 When it ends

The three lists are re-read, and the task announcer reads the result. The panel stays until
dismissed ("Dismiss", which returns the section to 3.1).

| Result | Panel | After |
| --- | --- | --- |
| **Succeeded** | `JobResult` succeeded: "/dev/sdb was wiped." then "It is now empty and ready to use. To store files on it, create a file system on it." and `ExternalLink` "Create a file system in the classic interface" → `/#/storage/filesystems` (the file-systems slice will make this a router link). "Show the output" | "Used for" reads "Empty (wiped at {{time}})" on this page and in the Disks list, for the session, until a read finds something on the disk |
| **Failed** | `JobFailure`: "The wipe of /dev/sdb did not finish." then "Part of the disk may already be erased. Read the output for the reason." The output is open. "Wipe again…" reopens the whole flow from 3.2 (never automatically: UI-14) | "Used for" from the re-read |
| **Stopped** | `JobResult` with the Cancelled pill: "Wiping /dev/sdb was stopped." then "The part already overwritten is erased; the rest is not. Run a quick wipe so the NAS sees the disk as empty." and "Wipe disk…" | as above |

### 3.7 Keyboard and screen readers

- The dialog: focus on Cancel; Tab order Cancel, the method radios (one tab stop, arrows between
  them), the typed field, Wipe disk (unavailable but focusable). The consequence sentence is the
  dialog's description (`aria-describedby`), so it is read with the title.
- The typed field's label is the "Type /dev/sdb to confirm." sentence; its hint is linked.
- On start, focus moves to the running panel's heading. On the end, it stays where it is; the result is
  announced. "Stop wiping" and "Dismiss" are buttons in the panel.
- Escape in the dialog is Cancel. Nothing destroys data on Enter.

### 3.8 Copy

| Key | English |
| --- | --- |
| `wipe.title` | Wipe this disk |
| `wipe.intro` | Wiping erases everything on the disk so it can be used for something new, such as a new file system. |
| `wipe.open` | Wipe disk… |
| `wipe.blocked.system` | This is the system disk: openmediavault runs from it, so it cannot be wiped. |
| `wipe.blocked.readOnly` | This disk is read-only, so it cannot be wiped. |
| `wipe.blocked.fsInUse` | It holds the file system {{name}}, which is in use. |
| `wipe.blocked.fsInUseDo` | Stop using it and unmount it under File systems first. |
| `wipe.blocked.fsSetUp` | It holds the file system {{name}}, which is set up on this NAS. |
| `wipe.blocked.fsSetUpDo` | Remove it under File systems first. |
| `wipe.blocked.fsCreating` | A file system is being created on it now. |
| `wipe.blocked.swap` | It holds swap space, disk space the NAS can use as extra memory. |
| `wipe.blocked.raid` | It is part of the RAID array <array></array>. Wiping it would damage the array. |
| `wipe.blocked.raidDo` | Remove it from the array under RAID management first. |
| `wipe.blocked.wiping` | It is being wiped now. |
| `wipe.blocked.unchecked` | Could not check what this disk holds, so it cannot be wiped now. |
| `wipe.fsLink` | File systems in the classic interface |
| `wipe.raidLink` | RAID management in the classic interface |
| `wipe.checking` | Checking what is on this disk… |
| `wipe.refusedTitle` | This disk cannot be wiped now |
| `wipe.changedTitle` | This disk changed |
| `wipe.changedBody` | The disk now called {{device}} is not the one this page showed. Its details have been read again; check them before you wipe it. |
| `wipe.goneBody` | This disk is no longer connected. |
| `wipe.close` | Close |
| `wipe.dialogTitle` | Wipe disk <device></device>? |
| `wipe.serial` | Serial number <serial></serial> |
| `wipe.consequence` | Everything on this disk is erased: its partitions, file systems and files. This cannot be undone. |
| `wipe.holdsTitle` | On this disk now |
| `wipe.holds.fsUnused` | The file system {{name}} ({{type}}, {{size}}). It is not used on this NAS. Its files are lost. |
| `wipe.holds.none` | No file system was found. Anything else on it, such as data from another computer, is erased too. |
| `wipe.holds.untraceable` | This NAS also has storage that this page cannot trace to a disk, such as encrypted disks, LVM or ZFS. If this disk is part of it, wiping it destroys that storage and its files. |
| `wipe.holds.settingsKept` | Its monitoring and power settings are kept. |
| `wipe.method` | How to wipe |
| `wipe.quick` | Quick wipe (recommended) |
| `wipe.quickHint` | Erases the partition table and the start and end of the disk, so the NAS sees it as empty. Takes a few seconds. The old files stay on the disk until they are overwritten, and recovery tools could still find them. |
| `wipe.secure` | Secure wipe |
| `wipe.secureHint` | Overwrites the whole disk once, so the old files cannot be recovered. Takes many hours: often 2 hours or more for each TB on a hard disk. You can stop it, but the disk is then only partly wiped. On a solid-state disk it may not reach every part of the disk. |
| `wipe.typePrompt` | Type {{device}} to confirm. |
| `wipe.typeHint` | The Wipe disk button is available once the name matches. |
| `wipe.cancel` | Cancel |
| `wipe.confirm` | Wipe disk |
| `wipe.checkingAgain` | Checking again… |
| `wipe.startFailed` | The wipe did not start. |
| `wipe.taskLabel` | Wipe disk {{device}} |
| `wipe.started` | Wiping {{device}} started. |
| `wipe.runningTitle` | Wiping <device></device> |
| `wipe.runningFor` | Running for {{duration}} |
| `wipe.quickRunning` | Quick wipe. This takes a few seconds. |
| `wipe.secureRunning` | Secure wipe. This takes many hours. You can leave this page or sign out; the wipe continues on the NAS. Its progress is shown here and in Tasks while you stay signed in. |
| `wipe.percentDone` | {{percent}} done |
| `wipe.working` | Working… |
| `wipe.showOutput` | Show the output |
| `wipe.hideOutput` | Hide the output |
| `wipe.outputLabel` | Output of the wipe of {{device}} |
| `wipe.stop` | Stop wiping |
| `wipe.stopTitle` | Stop wiping <device></device>? |
| `wipe.stopBody` | The part already overwritten stays erased; the rest of the disk is not wiped. Run a quick wipe afterwards so the NAS sees the disk as empty. |
| `wipe.stopKeep` | Keep wiping |
| `wipe.doneTitle` | {{device}} was wiped. |
| `wipe.doneBody` | It is now empty and ready to use. To store files on it, create a file system on it. |
| `wipe.createFsLink` | Create a file system in the classic interface |
| `wipe.failedTitle` | The wipe of {{device}} did not finish. |
| `wipe.failedBody` | Part of the disk may already be erased. Read the output for the reason. |
| `wipe.again` | Wipe again… |
| `wipe.stoppedTitle` | Wiping {{device}} was stopped. |
| `wipe.stoppedBody` | The part already overwritten is erased; the rest is not. Run a quick wipe so the NAS sees the disk as empty. |
| `wipe.dismiss` | Dismiss |

---

## 4. Disk health (S.M.A.R.T.): Overview

**Question it answers:** does the NAS watch my disks, how are they, and will it tell me when one
starts to fail? **Leads to:** setting up monitoring (Flow D), a disk's page.

Administrators only. The menu item "Disk health (S.M.A.R.T.)" (`nav.items.storage.smart`) opens
`/storage/smart`, which redirects to `/storage/smart/overview`.

### 4.1 The three Disk health pages

1. Page title "Disk health", with the pending mark when `smartmontools` is pending (0.7).
2. Intro: "Whether the NAS watches your disks for signs of failure, and how it tells you."
3. `PageTabs` (a `nav` labelled "Disk health"): **Overview** (`/storage/smart/overview`),
   **Self-tests** (`/storage/smart/self-tests`), **Settings** (`/storage/smart/settings`). Each is its
   own static route, as the service details are.

### 4.2 Data

`Smart.getSettings`, `DiskMgmt.getList`, `Smart.getScheduleList`, `EmailNotification.get` (already in
the contract; its password is omitted by the transport), and `Smart.getDeviceSettings` for each disk
of `DiskMgmt.getList` (2.5's rule for "no settings saved"). All are foreground reads on opening the
tab, none wakes a disk (0.4). Health from the session check.

### 4.3 Layout

1. **Monitoring card** (`h2` "Monitoring"), 4.4.
2. **Health line**, as the Disks list's (1.4).
3. **Disks table** (`h2` "Disks"), 4.5.
4. Footer: `ExternalLink` "Disk health in the classic interface" → `/#/storage/smart/devices`.

### 4.4 Monitoring card

Worst first: what is off comes before what is on.

| Case | Card |
| --- | --- |
| Global monitoring off | A neutral `InlineAlert`: "Monitoring is off. The NAS does not check your disks and will not tell you when one starts to fail." Then the filled primary **"Set up monitoring"** (router link styled as a button → `/storage/smart/set-up`) |
| On, some disks not watched | "Monitoring is on for {{watched}} of {{total}} disks." and the filled primary "Set up monitoring" |
| On, every disk watched | "Monitoring is on for every disk." No primary button; a router link "Set up monitoring again" → `/storage/smart/set-up`, for adding self-tests |
| On, any case | A second line: "Watched disks are checked every {{interval}}. {{sleeping}}" where `{{sleeping}}` is the sentence for `powermode` (5.2, field 3, in its short form) |
| No scheduled self-test | A line: "No self-tests are scheduled." with a router link "Add a self-test" → `/storage/smart/self-tests` |
| Email | Configured (`enable` true and `primaryemail` not empty): "Problems are emailed to {{address}}." (the address as text, `dir="auto"`). Otherwise: "Email is not set up, so problems are only recorded in the NAS's log." Either way, `ExternalLink` "Email settings in the classic interface" → `/#/system/notification/settings`, and under it `text-sm muted-foreground`: "Alerts are sent only while "S.M.A.R.T." is ticked under Notification > Events in the classic interface (it is from the factory)." with `ExternalLink` "Notification events in the classic interface" → `/#/system/notification/events` |

"Watched" counts the disks of `DiskMgmt.getList` whose device settings have `enable` true; while global
monitoring is off, none is watched, whatever their own setting.

### 4.5 Disks table

| Order | Header | Display |
| --- | --- | --- |
| 1 | Disk | Router link to the disk's page (`Identifier`), and the model under it in `text-xs muted-foreground` |
| 2 | Health | The session check's pill and reason, or "Not checked" / "Not reported" (1.3) |
| 3 | Temperature | From the check (else `DiskMgmt`'s cached reading), with the limit status of 0.2 against the disk's own limit, else the NAS-wide one. None: "Not read" |
| 4 | Watched | "Yes"; "No"; with global off: "No (monitoring is off)". Words, no pill |
| 5 | Self-tests | The first of this disk's scheduled tests in words ("Short, every Sunday at 03:00", 6.2), "and {{count}} more" when there are more; "None" |

Order: the device order, as the Disks list. Not paged.

### 4.6 States

| State | Look |
| --- | --- |
| Loading | The card as `FactListSkeleton`; the table with `TableSkeletonRows` (4) |
| `Smart.getSettings` failed | The card's place: `EmptyState variant="error"`: "Could not read the monitoring settings." + server message + "Try again". The table still shows |
| `DiskMgmt.getList` failed | The table's place: "Could not read the disks." + server message + "Try again" |
| A disk's device settings could not be read | Its Watched cell: "Not known"; one line above the table: "Could not read whether {{count}} disks are watched." with "Try again" |
| `EmailNotification.get` failed | The email line: "Could not read the email settings." and the classic link |
| Populated | 4.3 |

### 4.7 Keyboard

Tab order: the tabs, Set up monitoring (or its link), Add a self-test, the email and events links, the
health line's button, each disk link, the footer link.

### 4.8 Copy

| Key | English |
| --- | --- |
| `smart.title` | Disk health |
| `smart.intro` | Whether the NAS watches your disks for signs of failure, and how it tells you. |
| `smart.tabs` | Disk health |
| `smart.tab.overview` | Overview |
| `smart.tab.selfTests` | Self-tests |
| `smart.tab.settings` | Settings |
| `smart.overview.monitoring` | Monitoring |
| `smart.overview.off` | Monitoring is off. The NAS does not check your disks and will not tell you when one starts to fail. |
| `smart.overview.setUp` | Set up monitoring |
| `smart.overview.setUpAgain` | Set up monitoring again |
| `smart.overview.some` | Monitoring is on for {{watched}} of {{total}} disks. |
| `smart.overview.all` | Monitoring is on for every disk. |
| `smart.overview.interval` | Watched disks are checked every {{interval}}. {{sleeping}} |
| `smart.overview.noTests` | No self-tests are scheduled. |
| `smart.overview.addTest` | Add a self-test |
| `smart.overview.emailOn` | Problems are emailed to {{address}}. |
| `smart.overview.emailOff` | Email is not set up, so problems are only recorded in the NAS's log. |
| `smart.overview.emailLink` | Email settings in the classic interface |
| `smart.overview.eventsNote` | Alerts are sent only while "S.M.A.R.T." is ticked under Notification > Events in the classic interface (it is from the factory). |
| `smart.overview.eventsLink` | Notification events in the classic interface |
| `smart.overview.emailFailed` | Could not read the email settings. |
| `smart.overview.disks` | Disks |
| `smart.overview.tableLabel` | Disks and their monitoring |
| `smart.overview.col.disk` | Disk |
| `smart.overview.col.health` | Health |
| `smart.overview.col.temperature` | Temperature |
| `smart.overview.col.watched` | Watched |
| `smart.overview.col.tests` | Self-tests |
| `smart.overview.yes` | Yes |
| `smart.overview.no` | No |
| `smart.overview.noGlobalOff` | No (monitoring is off) |
| `smart.overview.notKnown` | Not known |
| `smart.overview.watchFailed_one` / `_other` | Could not read whether {{count}} disk is watched. / Could not read whether {{count}} disks are watched. |
| `smart.overview.moreTests_one` / `_other` | and {{count}} more |
| `smart.overview.none` | None |
| `smart.overview.settingsFailed` | Could not read the monitoring settings. |
| `smart.overview.classicLink` | Disk health in the classic interface |

---

## 5. Disk health: Settings

**Question it answers:** how does the NAS watch my disks? **Leads to:** saving, then applying.

Route `/storage/smart/settings`. Data: `Smart.getSettings`. A settings form (Phase 3, 0.4).

### 5.1 Layout

The three-page frame (4.1), then the form in a card, then Save (filled primary) and Discard changes,
then the saved line.

### 5.2 Fields

| # | Field | Control | Values and hint |
| --- | --- | --- | --- |
| 1 | **Watch disk health** (`enable`) | Checkbox | Hint: "The NAS checks each watched disk regularly, records problems in its log, and emails you when email is set up. Choose the disks to watch on the Overview or on each disk's page." While unticked with disks watched, a line under it: "With this off, no disk is checked and no self-test runs." |
| 2 | **Check every** (`interval`, seconds) | Number field, unit "minutes", 1 to 1440, required | Shown in whole minutes. Hint: "How often the NAS checks each watched disk. Every 30 minutes suits most homes." A saved value that is not whole minutes (the server allows 10 seconds and up) shows its rounded value and the hint "Now every {{seconds}} seconds, set elsewhere. Saving rounds it to whole minutes." |
| 3 | **When a disk is asleep at check time** (`powermode`) | Radio group, four options (the cap) | "Check it anyway; the check wakes the disk up" (`never`), short form "Sleeping disks are woken for each check."; "Skip only disks in deep sleep; a disk that has only spun down is woken up" (`sleep`), short form "Only disks in deep sleep are left asleep."; **"Skip the check, so the disk stays asleep (recommended)"** (`standby`), short form "Sleeping disks are left asleep."; "Skip also while the disk is spinning but resting; checks happen only while it is busy" (`idle`), short form "Resting and sleeping disks are left alone." Hint: "A disk that is asleep at every check is not checked until it is awake at one." |
| 4 | **Temperature warning** (`tempmax`) | Checkbox "Warn when a disk gets too hot", then a number field "Warn at", unit °C, 1 to 100, required when ticked | Off is `tempmax` 0. Hint under the number: "The NAS records it at this temperature and emails you at {{alert}}. Solid-state and NVMe disks often run hotter than hard disks; set their own limit on each disk's page." |
| 5 | `Disclosure` **"More"**: **Record temperature changes** (`tempdiff`) | Checkbox "Record temperature changes", then a number field "Of at least", unit °C, 1 to 100 | Off is `tempdiff` 0. Hint: "Writes a line in the NAS's log each time a disk's temperature changes by this much." |

The server's `powermode` default is `never` (the stock behaviour, which wakes sleeping disks every 30
minutes); the form shows what is saved and recommends `standby` in words. Flow D sets `standby` unless
the reader says otherwise (7.3).

**[verify]** in the installed monitoring service's manual that a scheduled self-test still runs when a
disk is asleep at that time (the self-test overrides "skip while asleep"). If so, field 3's hint adds:
"Scheduled self-tests still run, and wake the disk." If not, it adds: "A self-test due while the disk
is asleep is skipped too."

### 5.3 Saving

Save calls `Smart.setSettings` with all five fields (UX audit B11), the form's values for the shown
ones and the read value for any not shown. Then the save-then-apply loop of Phase 3 (3.4 there).

| State | Look |
| --- | --- |
| Loading | Skeleton of the form |
| Error | "Could not read the monitoring settings." + server message + "Try again" |
| Saving | "Saving…", fields read-only |
| Save failed | `FormAlert` critical "The monitoring settings were not saved." + server message |
| Pending | The pending mark beside the title; the band |

### 5.4 Keyboard

Tab order: the tabs, Watch disk health, Check every, the radio group (one stop, arrows inside), Warn
when a disk gets too hot, Warn at, More, its checkbox and field, Save, Discard changes.

### 5.5 Copy

| Key | English |
| --- | --- |
| `smart.settings.watch` | Watch disk health |
| `smart.settings.watchHint` | The NAS checks each watched disk regularly, records problems in its log, and emails you when email is set up. Choose the disks to watch on the Overview or on each disk's page. |
| `smart.settings.watchOffWarn` | With this off, no disk is checked and no self-test runs. |
| `smart.settings.interval` | Check every |
| `smart.settings.minutes` | minutes |
| `smart.settings.intervalHint` | How often the NAS checks each watched disk. Every 30 minutes suits most homes. |
| `smart.settings.intervalOdd` | Now every {{seconds}} seconds, set elsewhere. Saving rounds it to whole minutes. |
| `smart.settings.intervalRange` | Enter a whole number of minutes from 1 to 1440. |
| `smart.settings.asleep` | When a disk is asleep at check time |
| `smart.settings.asleepHint` | A disk that is asleep at every check is not checked until it is awake at one. |
| `smart.settings.asleepTestsRun` | Scheduled self-tests still run, and wake the disk. |
| `smart.settings.asleepTestsSkipped` | A self-test due while the disk is asleep is skipped too. |
| `smart.settings.mode.never` | Check it anyway; the check wakes the disk up |
| `smart.settings.mode.sleep` | Skip only disks in deep sleep; a disk that has only spun down is woken up |
| `smart.settings.mode.standby` | Skip the check, so the disk stays asleep (recommended) |
| `smart.settings.mode.idle` | Skip also while the disk is spinning but resting; checks happen only while it is busy |
| `smart.settings.modeShort.never` | Sleeping disks are woken for each check. |
| `smart.settings.modeShort.sleep` | Only disks in deep sleep are left asleep. |
| `smart.settings.modeShort.standby` | Sleeping disks are left asleep. |
| `smart.settings.modeShort.idle` | Resting and sleeping disks are left alone. |
| `smart.settings.tempWarn` | Warn when a disk gets too hot |
| `smart.settings.tempAt` | Warn at |
| `smart.settings.tempHint` | The NAS records it at this temperature and emails you at {{alert}}. Solid-state and NVMe disks often run hotter than hard disks; set their own limit on each disk's page. |
| `smart.settings.tempRange` | Enter a whole number from 1 to 100. |
| `smart.settings.more` | More |
| `smart.settings.tempDiff` | Record temperature changes |
| `smart.settings.tempDiffAt` | Of at least |
| `smart.settings.tempDiffHint` | Writes a line in the NAS's log each time a disk's temperature changes by this much. |
| `smart.settings.loadFailed` | Could not read the monitoring settings. |
| `smart.settings.loading` | Loading the monitoring settings… |
| `smart.settings.saveFailed` | The monitoring settings were not saved. |

---

## 6. Disk health: Self-tests

**Question it answers:** which self-tests does the NAS run on my disks, and when? **Leads to:**
adding, changing, deleting or running one.

Route `/storage/smart/self-tests`. Data: `Smart.getScheduleList` (whole list), `Smart.getSettings`,
`DiskMgmt.getList` and each disk's `Smart.getDeviceSettings` (for the disk picker and the
"not watched" note). None wakes a disk.

### 6.1 What a self-test is, on the page

Intro under the tabs: "A self-test is a check the disk runs on itself. A short test takes a few
minutes; a long test reads the whole disk and takes hours. The disk keeps working meanwhile, a little
slower. The NAS starts each test at its time; its result is in the disk's health details."

### 6.2 The schedule in words

Each test is stored as month, day of month, weekday and hour, each a value or "every" (`*`). The
interface writes them in words:

| Stored | Words |
| --- | --- |
| hour h, everything else every | "Every day at {{hour}}" |
| weekday w, hour h, others every | "Every {{weekday}} at {{hour}}" |
| day d, hour h, others every | "On day {{day}} of every month at {{hour}}" |
| month m, day d, hour h, weekday every | "Every year on {{day}} {{month}} at {{hour}}" |
| hour every | "Every hour" plus any of the parts above in their own words ("Every hour on {{weekday}}s") |
| anything else | "In {{months}}, on {{days}}, on {{weekdays}}, at {{hours}}", each part "every month", "every day", "every weekday", "every hour" when it is every |

Day of month and weekday together: the test runs only on days that match both (the monitoring
service's own rule, which differs from cron's). The custom form says so (6.4).

Test kinds (`type`):

| `type` | Name | One line |
| --- | --- | --- |
| `S` | Short self-test | "A quick check of the disk's main parts. Takes a few minutes." |
| `L` | Long self-test | "Reads the whole disk. Takes hours on a large disk, and the disk is slower meanwhile." |
| `C` | Transport check | "Looks for damage from shipping. Only some disks support it. Takes a few minutes." |
| `O` | Data collection | "Updates the disk's own health readings. Takes a few minutes." |

### 6.3 Layout and table

1. The three-page frame (4.1) and the intro (6.1).
2. Global monitoring off: neutral `InlineAlert`: "Monitoring is off for the whole NAS, so no self-test
   runs." with a router link "Open the settings" → `/storage/smart/settings`.
3. Toolbar: **"Add a self-test"** (filled primary).
4. The table:

| Order | Header | Display |
| --- | --- | --- |
| 1 | Disk | Router link to the disk's page (`Identifier`), model under it (`text-xs muted-foreground`). The disk is not connected (`size` `"-1"`): its stored device as text and "Not connected" under it |
| 2 | Test | 6.2's name |
| 3 | When | 6.2's words |
| 4 | Runs | "Yes"; "No, turned off" (`enable` false); "No, the disk is not watched"; "No, monitoring is off"; "No, the disk is not connected". The first that applies |
| 5 | Note | `comment` as text, `dir="auto"`, clamped to two lines |
| 6 | Actions | A menu button "Actions" (accessible name "Actions for the short self-test of /dev/sdb") with **Run now**, **Edit**, a separator, **Delete** |

Rows in the server's order, grouped by disk in device order. Not paged. No row selection: each row
has its visible Actions button (UX audit 3.6: no icon-only or selection-first actions).

5. Footer: `ExternalLink` "Scheduled tests in the classic interface" → `/#/storage/smart/tasks`.

"Run now" is unavailable, with the reason in the menu item's description, when the disk is not
connected ("The disk is not connected.") or not watched ("Watch this disk first; the NAS starts tests
only on watched disks."). **[verify]** that `Smart.executeScheduledTest` fails for a disk with no
monitoring settings, as the source suggests.

### 6.4 Add and edit

A `Dialog` (not a route: nothing about a test belongs in the address), title "Add a self-test" or
"Change the self-test", a form:

| # | Field | Control | Values |
| --- | --- | --- | --- |
| 1 | **Disk** | `Select` | Each disk of `DiskMgmt.getList`: "/dev/sdb, {{model}}, {{size}}". Disks that are not watched are listed but unavailable, with "Not watched" after them; under the field, when any is: "A self-test runs only on a watched disk. Turn on watching on the disk's page." Edit: the test's disk chosen |
| 2 | **Test** | `Select`, four options | 6.2's names, each with its line as the option's description. Default Short |
| 3 | **How often** | Radio group, four options | "Every day", "Every week" (default), "Every month", "Custom" |
| 4 | When "Every week": **On** | `Select` | Monday to Sunday, the locale's names. Default Sunday |
| 5 | When "Every month": **On day** | `Select` | 1 to 31. Default 1. Above 28: hint "Months without this day are skipped." |
| 6 | When not "Custom": **At** | `Select` | 00:00 to 23:00, the locale's form. Default 03:00 |
| 7 | When "Custom": **Month**, **Day of the month**, **Weekday**, **Hour** | Four `Select`s, each with "Every …" first | Hint above them: "The test runs when all four match. With both a day of the month and a weekday, it runs only on days that are both." |
| 8 | **Run this test on its schedule** (`enable`) | Checkbox, default ticked | Hint: "Untick to keep the test but stop it running." |
| 9 | **Note** (`comment`) | Text field, optional, up to 200 characters | Hint: "For your own reference." |

Edit opens with the stored values: a stored schedule that fits "Every day", "Every week" or "Every
month" opens on that choice; anything else opens on "Custom". The stored `devicefile` is matched to a
disk by 0.6's names; a test whose disk is not connected opens with the Disk field showing "Not
connected: {{device}}", and saving keeps that device.

**Validation** (on blur and on Save):

- A long test with hour "Every hour": "A long test takes hours. Choose an hour, or it would start again
  before it finishes." (the interface's own rule; the server would accept it).
- A long test every day: a warning under How often, not blocking: "A long test every day keeps the disk
  busy for hours each day."
- Everything sent matches the exact forms the stock interface sends (`*`, `00`–`23`, `01`–`12`,
  `01`–`31`, `1`–`7`); the contract's request schema is anchored, stricter than OMV's own patterns,
  which are not.

**Save** calls `Smart.setScheduledTest` with all nine fields (`uuid` OMV's new-object identifier for
a new test, `enable`, `devicefile`, `comment`, `type`, `hour`, `month`, `dayofmonth`, `dayofweek`). On
success the dialog closes, focus returns to the button that opened it (or the row's Actions button),
the list is re-read, and the saved line appears under the toolbar (0.7). On failure the dialog stays
open with `FormAlert` "The self-test was not saved." + server message.

### 6.5 Delete

`ConfirmDialog`, default variant (a schedule is configuration; nothing on a disk is lost, and Undo in
the band can still bring it back before Apply): title "Delete the short self-test of /dev/sdb?", body
"It no longer runs once you apply the changes. The disk's past results are kept.", buttons "Cancel"
(focused) and "Delete self-test". Calls `Smart.deleteScheduledTest {uuid}`; then the saved line and the
band. Failure: the error in the dialog.

### 6.6 Run now

`Smart.executeScheduledTest {uuid}`, a background task. It starts the test inside the disk, wakes the
disk, and for a long test keeps it busy for hours. It changes no configuration.

**Confirmation** (`ConfirmDialog`, default variant, focus on Cancel):

- Title: "Start a {{test}} on /dev/sdb now?" ("short self-test", "long self-test", "transport check",
  "data collection").
- Body, by kind:
  - Short, transport check, data collection: "The disk checks itself for a few minutes. It wakes up if
    it is asleep. Your files are not changed, and the disk can be used meanwhile."
  - Long: "The disk reads its whole surface. This takes hours on a large disk, and the disk is slower
    meanwhile. It wakes up if it is asleep. Your files are not changed."
- Buttons: "Cancel" and "Start the test".

**Running**: the task is in Tasks as "Self-test of /dev/sdb"; it usually ends within seconds, because
it only sends the command. A status line under the toolbar (or under the disk page's list): "Starting
the test on /dev/sdb…".

**When the task ends**, an inline result under the toolbar, kept until dismissed:

- The server reports a failure: "The test could not be started on /dev/sdb." + server message.
- The task succeeded and its output contains "Testing has begun" or "Self-test has begun"
  **[verify]** the exact lines for ATA and NVMe disks: "/dev/sdb started a {{test}}. The disk runs it by
  itself; the result appears in its health details when it finishes, in about {{duration}}." ("a few
  minutes" for short ones; for a long test, "several hours"). Router link "Open the disk" →
  `/storage/disks/sdb`.
- The task succeeded but the output contains neither line: "The NAS sent the test to /dev/sdb, but the
  disk's reply does not say it started. Read the output for the reason." with the output open. The
  server counts only a wrong command as a failure (read from source), so a disk that could not be
  reached still ends as "Succeeded"; this line is the honest reading of that.
- Each result has "Show the output" (the `TaskLog`).

A second "Run now" on the same disk while its test runs is allowed: the disk itself refuses to start
a second test, and the output says so.

### 6.7 States

| State | Look |
| --- | --- |
| Loading | `TableSkeletonRows` (3) |
| Error | "Could not read the scheduled self-tests." + server message + "Try again" |
| Empty | `EmptyState variant="empty"`: "No self-tests are scheduled. A regular short test lets each disk find problems early." Actions: "Add a self-test" and the router link "Set up monitoring" → `/storage/smart/set-up` |
| Populated | 6.3 |
| Pending | The pending mark beside the title; the band |

### 6.8 Keyboard

Tab order: the tabs, the settings link (when shown), Add a self-test, each row's disk link and
Actions button, the footer link. The Actions menu: arrows between items, Escape closes and returns
focus to the button. The dialog: focus to its first field on open; closing returns focus to the
opener.

### 6.9 Copy

| Key | English |
| --- | --- |
| `smart.tests.intro` | A self-test is a check the disk runs on itself. A short test takes a few minutes; a long test reads the whole disk and takes hours. The disk keeps working meanwhile, a little slower. The NAS starts each test at its time; its result is in the disk's health details. |
| `smart.tests.globalOff` | Monitoring is off for the whole NAS, so no self-test runs. |
| `smart.tests.settingsLink` | Open the settings |
| `smart.tests.add` | Add a self-test |
| `smart.tests.tableLabel` | Scheduled self-tests |
| `smart.tests.col.disk` | Disk |
| `smart.tests.col.test` | Test |
| `smart.tests.col.when` | When |
| `smart.tests.col.runs` | Runs |
| `smart.tests.col.note` | Note |
| `smart.tests.col.actions` | Actions |
| `smart.tests.notConnected` | Not connected |
| `smart.tests.runs.yes` | Yes |
| `smart.tests.runs.off` | No, turned off |
| `smart.tests.runs.notWatched` | No, the disk is not watched |
| `smart.tests.runs.globalOff` | No, monitoring is off |
| `smart.tests.runs.notConnected` | No, the disk is not connected |
| `smart.tests.actions` | Actions |
| `smart.tests.actionsFor` | Actions for the {{test}} of {{device}} |
| `smart.tests.runNow` | Run now |
| `smart.tests.edit` | Edit |
| `smart.tests.delete` | Delete |
| `smart.tests.runNowNotConnected` | The disk is not connected. |
| `smart.tests.runNowNotWatched` | Watch this disk first; the NAS starts tests only on watched disks. |
| `smart.tests.classicLink` | Scheduled tests in the classic interface |
| `smart.tests.type.S` | Short self-test |
| `smart.tests.type.L` | Long self-test |
| `smart.tests.type.C` | Transport check |
| `smart.tests.type.O` | Data collection |
| `smart.tests.typeHint.S` | A quick check of the disk's main parts. Takes a few minutes. |
| `smart.tests.typeHint.L` | Reads the whole disk. Takes hours on a large disk, and the disk is slower meanwhile. |
| `smart.tests.typeHint.C` | Looks for damage from shipping. Only some disks support it. Takes a few minutes. |
| `smart.tests.typeHint.O` | Updates the disk's own health readings. Takes a few minutes. |
| `smart.tests.typeLower.S` | short self-test |
| `smart.tests.typeLower.L` | long self-test |
| `smart.tests.typeLower.C` | transport check |
| `smart.tests.typeLower.O` | data collection |
| `smart.tests.summary` | {{type}}, {{when}} |
| `smart.tests.when.daily` | Every day at {{hour}} |
| `smart.tests.when.weekly` | Every {{weekday}} at {{hour}} |
| `smart.tests.when.monthly` | On day {{day}} of every month at {{hour}} |
| `smart.tests.when.yearly` | Every year on {{day}} {{month}} at {{hour}} |
| `smart.tests.when.hourly` | Every hour |
| `smart.tests.when.hourlyOn` | Every hour on {{weekday}}s |
| `smart.tests.when.custom` | In {{months}}, on {{days}}, on {{weekdays}}, at {{hours}} |
| `smart.tests.when.everyMonth` | every month |
| `smart.tests.when.everyDay` | every day |
| `smart.tests.when.everyWeekday` | every weekday |
| `smart.tests.when.everyHour` | every hour |
| `smart.tests.when.dayN` | day {{day}} |
| `smart.tests.dialog.addTitle` | Add a self-test |
| `smart.tests.dialog.editTitle` | Change the self-test |
| `smart.tests.dialog.disk` | Disk |
| `smart.tests.dialog.diskOption` | {{device}}, {{model}}, {{size}} |
| `smart.tests.dialog.diskNotWatched` | Not watched |
| `smart.tests.dialog.diskNotWatchedHint` | A self-test runs only on a watched disk. Turn on watching on the disk's page. |
| `smart.tests.dialog.diskNotConnected` | Not connected: {{device}} |
| `smart.tests.dialog.test` | Test |
| `smart.tests.dialog.often` | How often |
| `smart.tests.dialog.daily` | Every day |
| `smart.tests.dialog.weekly` | Every week |
| `smart.tests.dialog.monthly` | Every month |
| `smart.tests.dialog.custom` | Custom |
| `smart.tests.dialog.on` | On |
| `smart.tests.dialog.onDay` | On day |
| `smart.tests.dialog.dayOver28` | Months without this day are skipped. |
| `smart.tests.dialog.at` | At |
| `smart.tests.dialog.month` | Month |
| `smart.tests.dialog.dayOfMonth` | Day of the month |
| `smart.tests.dialog.weekday` | Weekday |
| `smart.tests.dialog.hour` | Hour |
| `smart.tests.dialog.everyMonth` | Every month |
| `smart.tests.dialog.everyDay` | Every day |
| `smart.tests.dialog.everyWeekday` | Every weekday |
| `smart.tests.dialog.everyHour` | Every hour |
| `smart.tests.dialog.customHint` | The test runs when all four match. With both a day of the month and a weekday, it runs only on days that are both. |
| `smart.tests.dialog.enable` | Run this test on its schedule |
| `smart.tests.dialog.enableHint` | Untick to keep the test but stop it running. |
| `smart.tests.dialog.note` | Note |
| `smart.tests.dialog.noteHint` | For your own reference. |
| `smart.tests.dialog.noteTooLong` | Use at most 200 characters. |
| `smart.tests.dialog.longHourly` | A long test takes hours. Choose an hour, or it would start again before it finishes. |
| `smart.tests.dialog.longDaily` | A long test every day keeps the disk busy for hours each day. |
| `smart.tests.dialog.save` | Save |
| `smart.tests.dialog.cancel` | Cancel |
| `smart.tests.saveFailed` | The self-test was not saved. |
| `smart.tests.deleteTitle` | Delete the {{test}} of <device></device>? |
| `smart.tests.deleteBody` | It no longer runs once you apply the changes. The disk's past results are kept. |
| `smart.tests.deleteConfirm` | Delete self-test |
| `smart.tests.deleteFailed` | The self-test was not deleted. |
| `smart.tests.runTitle` | Start a {{test}} on <device></device> now? |
| `smart.tests.runBodyShort` | The disk checks itself for a few minutes. It wakes up if it is asleep. Your files are not changed, and the disk can be used meanwhile. |
| `smart.tests.runBodyLong` | The disk reads its whole surface. This takes hours on a large disk, and the disk is slower meanwhile. It wakes up if it is asleep. Your files are not changed. |
| `smart.tests.runConfirm` | Start the test |
| `smart.tests.runTaskLabel` | Self-test of {{device}} |
| `smart.tests.runStarting` | Starting the test on {{device}}… |
| `smart.tests.runFailed` | The test could not be started on {{device}}. |
| `smart.tests.runStarted` | {{device}} started a {{test}}. The disk runs it by itself; the result appears in its health details when it finishes, in about {{duration}}. |
| `smart.tests.durationShort` | a few minutes |
| `smart.tests.durationLong` | several hours |
| `smart.tests.runUnclear` | The NAS sent the test to {{device}}, but the disk's reply does not say it started. Read the output for the reason. |
| `smart.tests.openDisk` | Open the disk |
| `smart.tests.showOutput` | Show the output |
| `smart.tests.hideOutput` | Hide the output |
| `smart.tests.loading` | Loading the scheduled self-tests… |
| `smart.tests.loadFailed` | Could not read the scheduled self-tests. |
| `smart.tests.empty` | No self-tests are scheduled. A regular short test lets each disk find problems early. |
| `smart.tests.setUpLink` | Set up monitoring |

---

## 7. Flow D: "Set up disk monitoring"

The UX audit's Flow D (4.5), J5 "Check health and be told". Route `/storage/smart/set-up`, no menu
item; reached from the Overview, the Self-tests page's empty state, and the dashboard's Disk health
card (section 8). Breadcrumbs: "Disk health" › "Set up monitoring". It follows the job runner rules
R1 to R10 with the library's job-runner parts.

### 7.1 What it saves the owner

| | Stock (J5) | Flow D here |
| --- | --- | --- |
| Pages | about 13, in 3 menu sections | 1 |
| Saves | 12 (one per disk for monitoring, one per disk for each test) | 0 by the reader; one confirmation |
| Applies | 2 | 0 by the reader; the flow applies once |
| Email | set up in the same journey | linked; set up in the classic interface if it is not yet (audit Flow D's email fields stay out of this slice: the owner's brief) |

### 7.2 Pre-flight (R1)

On opening, the page reads `System.getInformation`'s `dirtyModules` (the shell's, already warm). If
anything is pending, the flow does not start (owner, Q2): `PreflightNotice` "Some changes are not
applied yet", the band's list of what is pending in words, and "Apply them now" / "Undo them", with
the band's own confirmations. When nothing is pending any more, the flow continues to 7.3.

### 7.3 Decisions, in one form

`JobRunner` with the title "Set up disk monitoring" (`h2`; the page title is "Disk health").

**A. Which disks.** The list comes from the session's disk-health check, because only that reply says
which disks can report their health, whether each is watched, and its settings identifier. Reading it
wakes every disk (0.4), so:

- No check this session: "To list the disks that can report their health, the NAS reads every disk.
  This wakes any disk that has gone to sleep." and the button "Check disk health" (the shared check).
  The rest of the form waits, shown but unavailable, under it.
- A check this session: "Using the disk health checked at {{time}}." and "Check again" (small).

Then a checkbox list "Watch these disks", one item per disk in the check that is not watched yet:

- Label: the device (`Identifier`), the model, the size; under it, `text-xs muted-foreground`, the
  serial number. The health pill and reason beside it when it is not OK.
- Ticked by default, except a disk whose health could not be read (`BAD_STATUS`): unticked, with "Its
  health could not be read, so watching it may not work."
- With more than nine disks, "Select all" and "Select none" above the list (independent options cap
  at nine before grouping).
- Disks already watched are not in the list. One line under it: "Already watched: /dev/sda,
  /dev/nvme0n1." Disks not in the check (no health readings) are not offered: "Not listed because they
  report no health readings: /dev/sdf." when there are any.
- None left to tick: "Every disk that can report its health is already watched." and the form goes on
  with the self-tests and the NAS-wide choices.

**B. Regular self-test** (radio group, four options):

1. **"A short test every week (recommended)"** (default), with "On" (weekday, default Sunday) and "At"
   (hour, default 03:00).
2. "A long test every month", with "On day" (1 to 28, default 1) and "At" (default 03:00). Hint: "A long
   test reads the whole disk and takes hours; the disk is slower meanwhile."
3. "Both: a short test every week and a long test every month", with both sets of fields.
4. "No scheduled test".

Disks that already have scheduled tests (from `Smart.getScheduleList`) get none added, and say so:
"/dev/sdb already has 1 scheduled self-test and keeps it." This applies to watched disks too: the flow
adds tests to every disk it watches or that is already watched and has none.

**C. Sleeping disks** (checkbox): **"Let sleeping disks sleep"**, hint: "The NAS skips a check while a
disk is asleep, instead of waking it." Its starting state and what it saves follow the saved
`powermode` exactly:

| Saved `powermode` | Starts | Ticked saves | Unticked saves |
| --- | --- | --- | --- |
| `never` (factory) | ticked | `standby` | `never` |
| `sleep` | unticked | `standby` | `sleep` (kept) |
| `standby` | ticked | `standby` (kept) | `never` |
| `idle` | ticked | `idle` (kept) | `never` |

**D. Temperature** (checkbox, unticked unless `tempmax` is set): "Warn me when a disk gets too hot",
with "Warn at" (°C, default 55, the saved value when there is one), and the Settings page's hint
(5.2, field 4), including that the email comes at the limit plus 5 °C.

**E. How you are told** (read only, no field): the email line and the events note of 4.4, with their
classic links. When email is not set up: "You can run this now and set up email afterwards; alerts
start reaching you once both are applied."

Buttons at the end: **"Continue"** (filled) to the summary; the page's breadcrumb leads back.

### 7.4 Summary and confirmation (R2)

`JobSummary`, title "Ready to set up disk monitoring", one item per choice, in plain words:

- "Turn on disk monitoring for the NAS." (only when it is off)
- "Watch 3 disks: /dev/sdb, /dev/sdc, /dev/sdd."
- "Run a short self-test on 3 disks every Sunday at 03:00." / "…a long self-test on 3 disks on day 1 of
  every month at 03:00." / both / nothing. Then, when it applies: "/dev/sde already has scheduled
  self-tests and keeps them."
- "Skip checks while a disk is asleep, so it stays asleep." / "Check disks even when they are asleep,
  which wakes them."
- "Record a disk that reaches 55 °C, and email you when it reaches 60 °C." / "No temperature warning."
- "Problems are emailed to {{address}}." / "Email is not set up, so problems are only recorded in the
  NAS's log for now."
- "The NAS checks each watched disk every 30 minutes. You can change this in the settings." (the saved
  interval)
- Last: "Then the changes are applied, which restarts disk monitoring. Nothing on your disks is
  changed."

Buttons: **"Set up monitoring"** (filled) and "Change choices". No typed confirmation: nothing is
erased.

### 7.5 The steps (R3, R5)

`JobStepList`, each step with its state word (Waiting, Running, Succeeded, Failed, Cancelled):

| # | Step label | Calls | Notes |
| --- | --- | --- | --- |
| 1 | "Turn on monitoring for the NAS" (or "Update the monitoring settings" when it was on) | `Smart.getSettings` (re-read, R4), then `Smart.setSettings` with `enable: true`, the chosen `powermode` and `tempmax`, and the read `interval` and `tempdiff` | Skipped (and shown Succeeded with "Already as chosen") when nothing changes |
| 2 … | "Watch {{device}}", one step per chosen disk | For a disk with saved settings (`uuid` is not the new-object one), `Smart.getDeviceSettings` (R4); then `Smart.setDeviceSettings` with `enable: true` and the read `tempdiff` and `tempmax` (0 for a new one) | A failure here does not stop the other disks (audit Flow D) |
| … | "Schedule a short self-test for {{device}}" (and "…a long self-test…"), one step per disk and kind | `Smart.setScheduledTest` with the new-object `uuid`, `enable: true`, the disk's `devicefile`, the kind, and the schedule; `comment` empty | Only for a disk whose watch step succeeded or that was already watched |
| n−1 | "Apply the changes" | Re-read `dirtyModules` (R10); then `Config.applyChangesBg` | 7.6 |
| n | "Check that monitoring is on" | `Smart.getSettings`, `Smart.getDeviceSettings` per disk, `Smart.getScheduleList` | Reads only; none wakes a disk |

### 7.6 Failures (R6, R7, R10)

- **A disk's step fails** (for example "does not support S.M.A.R.T."): the step shows Failed with the
  server's message; the other disks' steps run. Before the apply step, `JobFailure`: "{{failed}} of
  {{total}} disks could not be set." then the list ("/dev/sdd: " + server message), and three choices:
  "Try {{device}} again" (one per failed disk, or "Try them again"), **"Continue without them"**
  (filled; applies what succeeded), and "Undo the changes" (`Config.revertChangesBg`, safe because the
  pre-flight held: nothing else was pending). The flow never retries by itself (UI-14).
- **Step 1 fails**: the flow stops before any disk step (nothing else is useful without it): the
  failure, "Try this step again", and "Stop here" (nothing was saved).
- **Other changes became pending meanwhile** (R10: `dirtyModules` holds more than `smartmontools`):
  `AlsoPendingPrompt` "Other changes are pending too", "Also pending from elsewhere: NFS. Applying
  applies them too.", "Apply them too" / "Stop here". "Stop here" leaves this flow's changes saved and
  pending, with the band.
- **Apply fails** (R7): "Applying the changes failed." + server message; "Try applying again" first,
  "Undo the changes" second (R7's forced re-apply after an undo is the band's existing behaviour).
- **The check step finds a difference** (a disk not on, a test missing): the step shows Failed with
  "Saved and applied, but {{device}} is not shown as watched yet." and "Check again".

### 7.7 Result

`JobResult` succeeded, announced politely:

- Title: "Disk monitoring is set up."
- "The NAS watches 4 disks and checks each every 30 minutes. A short self-test runs on each every
  Sunday at 03:00."
- Email: "Problems are emailed to {{address}}." or "Email is not set up yet. Set it up so the NAS can
  tell you about problems." with `ExternalLink` "Set up email in the classic interface".
- Router link "Go to Disk health" → `/storage/smart/overview`.

A reload or sign-out mid-run ends the flow view (R8); the Overview shows what was saved and applied,
and the band shows what is still pending.

### 7.8 Keyboard and screen readers

The decisions are one form in reading order: Check disk health (when shown), the disk checkboxes,
Select all and Select none (when shown), the test radio group and its fields, Let sleeping disks
sleep, Warn me, Warn at, the two classic links, Continue. The summary is a heading and a list, then
its two buttons. It is not a destructive confirmation, so focus moves to its heading, and Tab reaches
"Set up monitoring" then "Change choices". During the run, step
changes are announced politely and a failure assertively, with focus moved to the failure's heading
(UX audit 7).

### 7.9 Copy

| Key | English |
| --- | --- |
| `smart.setup.breadcrumb` | Set up monitoring |
| `smart.setup.title` | Set up disk monitoring |
| `smart.setup.documentTitle` | Set up monitoring – Disk health |
| `smart.setup.preflightTitle` | Some changes are not applied yet |
| `smart.setup.preflightBody` | Apply or undo them before you set up monitoring, so that only these changes are applied at the end. |
| `smart.setup.applyThem` | Apply them now |
| `smart.setup.undoThem` | Undo them |
| `smart.setup.needCheck` | To list the disks that can report their health, the NAS reads every disk. This wakes any disk that has gone to sleep. |
| `smart.setup.usingCheck` | Using the disk health checked at {{time}}. |
| `smart.setup.disks` | Watch these disks |
| `smart.setup.diskOption` | {{device}}, {{model}}, {{size}} |
| `smart.setup.badStatus` | Its health could not be read, so watching it may not work. |
| `smart.setup.selectAll` | Select all |
| `smart.setup.selectNone` | Select none |
| `smart.setup.alreadyWatched` | Already watched: {{list}}. |
| `smart.setup.notListed` | Not listed because they report no health readings: {{list}}. |
| `smart.setup.allWatched` | Every disk that can report its health is already watched. |
| `smart.setup.tests` | Regular self-test |
| `smart.setup.tests.short` | A short test every week (recommended) |
| `smart.setup.tests.long` | A long test every month |
| `smart.setup.tests.both` | Both: a short test every week and a long test every month |
| `smart.setup.tests.none` | No scheduled test |
| `smart.setup.tests.longHint` | A long test reads the whole disk and takes hours; the disk is slower meanwhile. |
| `smart.setup.tests.keeps_one` / `_other` | {{device}} already has {{count}} scheduled self-test and keeps it. / {{device}} already has {{count}} scheduled self-tests and keeps them. |
| `smart.setup.sleep` | Let sleeping disks sleep |
| `smart.setup.sleepHint` | The NAS skips a check while a disk is asleep, instead of waking it. |
| `smart.setup.temp` | Warn me when a disk gets too hot |
| `smart.setup.told` | How you are told |
| `smart.setup.emailLater` | You can run this now and set up email afterwards; alerts start reaching you once both are applied. |
| `smart.setup.continue` | Continue |
| `smart.setup.summaryTitle` | Ready to set up disk monitoring |
| `smart.setup.sum.globalOn` | Turn on disk monitoring for the NAS. |
| `smart.setup.sum.watch_one` / `_other` | Watch {{count}} disk: {{list}}. / Watch {{count}} disks: {{list}}. |
| `smart.setup.sum.short_one` / `_other` | Run a short self-test on {{count}} disk {{when}}. / Run a short self-test on {{count}} disks {{when}}. |
| `smart.setup.sum.long_one` / `_other` | Run a long self-test on {{count}} disk {{when}}. / Run a long self-test on {{count}} disks {{when}}. |
| `smart.setup.sum.whenWeekly` | every {{weekday}} at {{hour}} |
| `smart.setup.sum.whenMonthly` | on day {{day}} of every month at {{hour}} |
| `smart.setup.sum.noTests` | Add no scheduled self-test. |
| `smart.setup.sum.keeps` | {{list}} already have scheduled self-tests and keep them. |
| `smart.setup.sum.sleepOn` | Skip checks while a disk is asleep, so it stays asleep. |
| `smart.setup.sum.sleepOff` | Check disks even when they are asleep, which wakes them. |
| `smart.setup.sum.tempOn` | Record a disk that reaches {{limit}}, and email you when it reaches {{alert}}. |
| `smart.setup.sum.tempOff` | No temperature warning. |
| `smart.setup.sum.emailOn` | Problems are emailed to {{address}}. |
| `smart.setup.sum.emailOff` | Email is not set up, so problems are only recorded in the NAS's log for now. |
| `smart.setup.sum.interval` | The NAS checks each watched disk every {{interval}}. You can change this in the settings. |
| `smart.setup.sum.apply` | Then the changes are applied, which restarts disk monitoring. Nothing on your disks is changed. |
| `smart.setup.confirm` | Set up monitoring |
| `smart.setup.back` | Change choices |
| `smart.setup.steps` | Steps |
| `smart.setup.step.global` | Turn on monitoring for the NAS |
| `smart.setup.step.globalUpdate` | Update the monitoring settings |
| `smart.setup.step.unchanged` | Already as chosen |
| `smart.setup.step.watch` | Watch {{device}} |
| `smart.setup.step.short` | Schedule a short self-test for {{device}} |
| `smart.setup.step.long` | Schedule a long self-test for {{device}} |
| `smart.setup.step.apply` | Apply the changes |
| `smart.setup.step.verify` | Check that monitoring is on |
| `smart.setup.someFailed` | {{failed}} of {{total}} disks could not be set. |
| `smart.setup.tryDisk` | Try {{device}} again |
| `smart.setup.tryAll` | Try them again |
| `smart.setup.continueWithout` | Continue without them |
| `smart.setup.undo` | Undo the changes |
| `smart.setup.globalFailed` | The monitoring settings could not be saved. |
| `smart.setup.tryStep` | Try this step again |
| `smart.setup.stop` | Stop here |
| `smart.setup.alsoTitle` | Other changes are pending too |
| `smart.setup.alsoBody` | Also pending from elsewhere: {{list}}. Applying applies them too. |
| `smart.setup.applyToo` | Apply them too |
| `smart.setup.applyFailed` | Applying the changes failed. |
| `smart.setup.tryApply` | Try applying again |
| `smart.setup.verifyDiff` | Saved and applied, but {{device}} is not shown as watched yet. |
| `smart.setup.checkAgain` | Check again |
| `smart.setup.doneTitle` | Disk monitoring is set up. |
| `smart.setup.doneBody_one` / `_other` | The NAS watches {{count}} disk and checks it every {{interval}}. / The NAS watches {{count}} disks and checks each every {{interval}}. |
| `smart.setup.doneTests` | {{tests}} |
| `smart.setup.doneEmailOff` | Email is not set up yet. Set it up so the NAS can tell you about problems. |
| `smart.setup.emailLink` | Set up email in the classic interface |
| `smart.setup.toOverview` | Go to Disk health |

---

## 8. The dashboard's Disk health card, and other links in

The monitoring domain's card (1.3 there) stays as built, with its links moved into this slice's pages:

| Where | Was | Becomes |
| --- | --- | --- |
| Card footer | `ExternalLink` "Disk health in the classic interface" | Router link "Open Disk health" → `/storage/smart/overview` |
| Each disk item's device | text | Router link to `/storage/disks/$disk` (accessible name "Open disk /dev/sdb"), with `devicename` from the check's reply, used only if it passes 0.5's pattern; otherwise the device stays text |
| Monitoring off for every disk | `ExternalLink` "Turn on monitoring in the classic interface" and the two-step hint | Router link "Set up disk monitoring" → `/storage/smart/set-up`; the hint goes |
| Monitoring off for some | `ExternalLink` "Turn it on under Devices in the classic interface" | Router link "Set up disk monitoring" → `/storage/smart/set-up` |
| Attention rows for a failing or warning disk | `ExternalLink` "Open Disk health in the classic interface" | Router link "Open disk /dev/sdb" → that disk's page (same pattern rule) |

The check itself, its sentence and its session store are unchanged; the Disks list, the Overview, a
disk's page and Flow D read the same store, so a check started anywhere fills every one of them.

Catalogue changes: `dashboard.disks.link` "Open Disk health"; `dashboard.disks.monitorOffAllLink` and
`dashboard.disks.monitorOffSomeLink` "Set up disk monitoring"; `dashboard.disks.monitorOffAllHint`
removed; `dashboard.attention.diskLink` "Open disk <device></device>"; new
`dashboard.disks.openDisk` "Open disk {{device}}".

The Storage card and its file-system links are unchanged (the file-systems slice).

---

## 9. A normal user

Every method in this slice refuses a normal user ("Invalid context role."). So:

- The Disks and Disk health items stay out of a normal user's menu (they are administrator-only
  already).
- A normal user who types `/storage/disks`, `/storage/disks/sda`, any `/storage/smart/…` address gets
  the existing "only administrators" page, and the route makes no call first (UI-4).
- The dashboard for a normal user is unchanged (no Disk health card).

---

## 10. Navigation and routes

| Item | Route | Roles | Replaces |
| --- | --- | --- | --- |
| Storage > Disks | `/storage/disks` | admin | `ClassicOnlyPage` for `storage/disks` |
| (no menu item) | `/storage/disks/$disk` | admin | the stock hdparm form and the wipe dialogs |
| Storage > Disk health (S.M.A.R.T.) | `/storage/smart` → `/storage/smart/overview` | admin | `ClassicOnlyPage` for `storage/smart` |
| (tabs) | `/storage/smart/overview`, `/storage/smart/self-tests`, `/storage/smart/settings` | admin | the stock Devices, Scheduled tests and Settings pages |
| (no menu item) | `/storage/smart/set-up` | admin | the J5 journey |

- Static file routes, more specific than `$group/$item`, as Phase 3's are. `BuiltRoute` gains
  `/storage/disks` and `/storage/smart`; `isCurrent` treats `/storage/disks/…` as the Disks item's and
  `/storage/smart/…` as Disk health's.
- `$disk` is validated by 0.5's pattern in the route's `params.parse`; a failing value renders the
  not-found state and makes no call.
- The navigation entries keep their `classic` paths.
- Route-level code splitting: each page is its own chunk.
- Document titles: "Disks – openmediavault", "{{device}} – Disks – openmediavault", "Overview – Disk
  health – openmediavault" (and Self-tests, Settings), "Set up monitoring – Disk health –
  openmediavault".

---

## 11. Every request in this slice

| Method | Where | When | Kind | Contract notes |
| --- | --- | --- | --- | --- |
| `DiskMgmt.getList` | Disks, a disk's page, Overview, Self-tests, the wipe checks | open, Refresh, after rescan or wipe, before a wipe | foreground | New. Paged shape; `serialnumber`, `wwn` and the by-id `devicelinks` scrubbed in captures (the capture tool already does this for disk-health replies); `size` a byte string **[verify]**; `temperature` numeric string or `""`; `hdparm` optional object; `powermode` open string |
| `DiskMgmt.rescan` | Disks | Look for new disks | foreground | New. Returns `null`. Not destructive, no dirty module |
| `DiskMgmt.wipe` | a disk's page | after the typed confirmation and the re-check | task | New. `x-omv-task`, `x-omv-destructive: data`. Request `{devicefile, secure}`, both required |
| `DiskMgmt.setHdParm` | a disk's page | Save | foreground | New. `x-omv-dirty: [smartmontools]`. Request schema stricter than OMV's: `apm` 0 to 254 and `spindowntime` 0 to 255 (OMV's request and storage schemas disagree; the storage one is what is enforced) |
| `FileSystemMgmt.getList` | as `DiskMgmt.getList` | with it | foreground | Exists (monitoring domain) |
| `MdMgmt.enumerateDevices` | as `DiskMgmt.getList` | with it | foreground | New (RAID plugin). "Plugin not installed" is HTTP 404 "RPC service 'MdMgmt' not found." (observed); any other error fails closed |
| `Smart.getListBg` → `Exec.getOutput` | Disks, Overview, a disk's page (via the link), Flow D, dashboard | Check disk health | foreground, task | Exists |
| `Smart.getSettings` | Overview, Settings, a disk's page, Flow D | open | foreground | New |
| `Smart.setSettings` | Settings, Flow D | Save, Flow D step 1 | foreground | New. `x-omv-dirty: [smartmontools]`; all five fields required; `tempmax` and `tempdiff` 0 to 255 (the storage schema's limit) |
| `Smart.getDeviceSettings` | a disk's page, Overview, Self-tests, Flow D | open; Flow D steps | foreground | New. The "no settings saved" error is an expected reply **[verify]** its code |
| `Smart.setDeviceSettings` | a disk's page, Flow D | Save, Flow D steps | foreground | New. `x-omv-dirty: [smartmontools]`. Request schema declares `tempdiff` and `tempmax` and requires them (OMV reads them without declaring them); `uuid` required |
| `Smart.getInformation`, `Smart.getAttributes`, `Smart.getSelfTestLogs` | a disk's page | Read health details | foreground | New. Wake the disk (documented in each operation's description); `serialnumber`, `wwn` scrubbed; open response objects (keys vary by disk) |
| `Smart.getExtendedInformation` | a disk's page | Show the full report | foreground | New. Plain string; scrubbed of serial numbers, WWNs and host names in captures |
| `Smart.getScheduleList` | a disk's page, Overview, Self-tests, Flow D | open | foreground | New. Paged; `devicefile` is the canonical path here, unlike `getScheduledTest` |
| `Smart.setScheduledTest` | Self-tests, a disk's page, Flow D | Save, Flow D steps | foreground | New. `x-omv-dirty: [smartmontools]`. Request patterns anchored, each the stock interface's values or `*`: `hour` 00 to 23, `month` 01 to 12, `dayofmonth` 01 to 31, `dayofweek` 1 to 7 (the exact patterns are written in the contract); `comment` max 200 |
| `Smart.deleteScheduledTest` | Self-tests, a disk's page | Delete | foreground | New. `x-omv-dirty: [smartmontools]` |
| `Smart.executeScheduledTest` | Self-tests, a disk's page | Run now | task | New. `x-omv-task`. Not destructive. The description says the task succeeds even when the disk was not reached |
| `EmailNotification.get` | Overview, Flow D | open | foreground | Exists; password omitted |
| `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*`, `System.getInformation` | Flow D, the band, the task helper | as now | | Exist |

`Smart.getList`, `Smart.enumerateDevices`, `Smart.enumerateMonitoredDevices` (wake every disk; the
task version is used instead), `DiskMgmt.enumerateDevices`, `DiskMgmt.getListBg` (unless the 1.1
fallback is needed), `DiskMgmt.getHdParm` and `Smart.getScheduledTest` (the list replies already carry
what they return) stay out of the contract for this slice.

---

## 12. Components

### 12.1 New in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component | Why | States to cover |
| --- | --- | --- |
| `RadioGroupField` | Wipe method, how often, when a disk is asleep, the Flow D test choice, a disk's temperature limit (Base UI `RadioGroup`, one tab stop, arrows inside, a legend, a hint per option, an error) | default, hover, focus, checked, disabled with reason, error, long option text and hints, 320px |
| `Breadcrumbs` | A disk's page and Flow D (style guide 5.1: breadcrumbs below the second level): a `nav` labelled "Breadcrumb", an ordered list of router links, the last one `aria-current="page"` and not a link | two and three levels, a long mono last item that wraps, 320px |
| `NumberField` (a `Field` variant) | Interval, temperature limits: a numeric input with a visible unit after it ("minutes", "°C"), `inputMode="numeric"`, range errors in words | default, focus, error, disabled, with and without unit, 200% zoom |
| `TaskLog` progress | The secure wipe's bar: an optional `progress` (0 to 100) the caller parses, shown with `JobProgress`'s bar | none, 0, mid, 100, reduced motion |

### 12.2 Reused as they are

`ConfirmDialog` (default and destructive), `TypeToConfirmField` and `typedMatches`, `Dialog`, the
job-runner parts (`JobRunner`, `PreflightNotice`, `JobSummary`, `JobStepList`, `JobProgress`,
`JobResult`, `JobFailure`, `AlsoPendingPrompt`), `Card`, `FactList`, `StatusPill` and `rollUp`,
`HealthList`, `EmptyState`, `InlineAlert`, `FormAlert`, `Table*`, `TableSkeletonRows`, `Select` with
groups, `Menu`, `CheckboxField`, `Disclosure`, `ExternalLink`, `Identifier`, `CopyButton`, `TaskLog`
(`wrap={false}`, `size="page"`), `PageTabs`, `Skeleton`, `Button` (with `loading`), the task announcer
and the Tasks menu.

No new colour, token or variant: the slice uses the status, pending, destructive and neutral
families as they are. The colour audit is not affected.

### 12.3 In the app

Pure functions, each tested by itself:

- `diskUse(disk, fileSystems, arrays, session)`: 0.6, returning the uses, the wipe blockers and the
  "untraceable" flag; the partition-to-disk rule; fail-closed on missing inputs.
- `powerWord(powermode)`, `spinDownDuration(value)`, `labelSize(bytes)`.
- `scheduleWords(job)` and the form mapping both ways (6.2, 6.4).
- `testResultWord(status)` (2.4.3.1), `attributeValue(rawvalue)`.
- `tempStatus(reading, deviceLimit, globalLimit)` (0.2).
- Flow D's plan: from the choices and the reads, the ordered steps and the summary items.

The session store gains: health details per disk (with their time), the "wiped at" marks, and the
registry ids of running wipes and test starts. Cleared at sign-out with the task registry; none of it
touches browser storage (UI-13).

---

## 13. Mock scenarios to add

Built from scrubbed captures where the VM can show them (verification rule); hand-written ones say so.

| Method | Scenarios |
| --- | --- |
| `DiskMgmt.getList` | the VM's five disks (captured); a NAS with an NVMe system disk, two data disks in use, one empty disk, one USB disk with an old file system, one RAID member; a disk asleep (`STANDBY`, no temperature); a disk with power settings saved; a read-only disk; twenty disks; two disks of the same model and size; a model 200 characters long, one right-to-left, one that looks like markup; an empty model and serial; an error |
| `DiskMgmt.rescan` | `null`; followed by a list with one more disk; an error |
| `DiskMgmt.wipe` | quick, succeeded (captured, on a VM scratch disk); secure, running with `shred` progress lines then succeeded; failed part-way; stopped |
| `DiskMgmt.setHdParm` | saved; the server's "already exists" refusal |
| `FileSystemMgmt.getList` | the existing scenarios, plus: a file system on a partition and one on a whole disk; a multi-disk btrfs; one being created (status 2) on an empty disk; swap; a file system on `/dev/mapper/…` (untraceable); one not set up (from another computer); an error |
| `MdMgmt.enumerateDevices` | one mirror of two disks; the plugin not installed (the 404 reply); an error |
| `Smart.getSettings` | factory (off, 1800, `never`, 0, 0); on with `standby` and `tempmax` 50; an interval of 45 seconds |
| `Smart.setSettings` | saved; an error |
| `Smart.getDeviceSettings` | watched; not watched; no settings saved (the database error); with `_used`; an unrelated error |
| `Smart.setDeviceSettings` | saved; "does not support S.M.A.R.T."; "already exists" |
| `Smart.getInformation` | a hard disk; a solid-state disk; an NVMe disk; an error for a disk without support |
| `Smart.getAttributes` | healthy; damaged areas replaced at Warning; pending areas at Critical; empty (NVMe); raw values with "h+m" and "(Min/Max …)" |
| `Smart.getSelfTestLogs` | several passed; one running; one failed with a block; aborted; empty |
| `Smart.getExtendedInformation` | a long report (2,000 lines); one with a line that looks like markup; an error |
| `Smart.getScheduleList` | empty; tests on three disks; a test of a disconnected disk (`size` `"-1"`); a test turned off; a test of an unwatched disk; a custom schedule |
| `Smart.setScheduledTest`, `deleteScheduledTest` | saved; an error |
| `Smart.executeScheduledTest` | started ("Testing has begun"); task succeeded without that line; failed |
| `Config.applyChangesBg` and `System.getInformation` | Flow D: nothing pending; `smartmontools` pending; `smartmontools` and `nfs` pending (R10); apply failed |

---

## 14. Checks before calling it done

- Both themes; greyscale; deuteranopia and protanopia emulation. Pills keep their words; power and
  "Used for" are words; the wipe dialog's destructive button is the only red control and carries
  "Wipe disk".
- 320 CSS px and 200% zoom: the tables scroll inside their frames only; the summary facts stack; the
  wipe dialog fits with the typed field and its target wrapping and device paths breaking safely; the
  Flow D form is one column.
- Keyboard-only: Disks (1.7), a disk's page (2.8), the wipe (3.7), Overview (4.7), Settings (5.4),
  Self-tests (6.8), Flow D (7.8).
- Screen reader hears: loading of each page; "Checking disk health…" and the result; "Health details
  of /dev/sdb read."; the saved line; the wipe's start and result; a test start's result; each Flow D
  step and a failure (assertively). It does not hear the elapsed-time counter.
- In the network panel: no `Smart.getListBg`, `getInformation`, `getAttributes`, `getSelfTestLogs`,
  `getExtendedInformation` or `executeScheduledTest` until the reader presses their buttons, including
  after a reload; `DiskMgmt.wipe` only after the typed confirmation, preceded by the three re-reads;
  no request at all for a normal user.
- On the VM with a disposable extra disk: a quick wipe of a disk holding a file system not set up;
  refusal of the system disk and of a disk with a mounted file system; a secure wipe started and
  stopped; Flow D from factory settings to applied, then put back (the capture tool's undo).

---

## 15. Adversarial pass

### 15.1 Trying to break it

| Probe | Finding | Design response |
| --- | --- | --- |
| Wipe the system disk by calling the page for its name | The server would wipe it (B14) | Refused by `isroot` (3.1); the dialog never opens |
| Wipe a disk whose file system is mounted | The server would wipe it, leaving a dangling mount entry and shared folders on nothing | Refused with the file system named and what to do (3.1); re-checked when the dialog opens and again on confirm (3.2, 3.3) |
| A file system mounted in another tab between opening the dialog and confirming | Stale check | The second re-read on "Wipe disk" (3.3) catches it |
| `sdb` and `sdc` swap names after a restart, with a bookmark to `/storage/disks/sdb` | The page could show, and wipe, a different physical disk than the reader expects | Model and serial at the top; the dialog names the serial; on confirm the serial is compared with what the page showed (3.2, "This disk changed") |
| A disk in an LVM group or an encrypted container whose file system is mounted | The interface cannot see the link; it would offer the wipe | Said in the dialog (0.6, 3.3) and raised to the owner (17, P4); the ZFS slice replaces it for pools |
| RAID plugin not installed, but an array made by hand | No RAID check possible | The "nothing found" sentence covers unknown content; raised with P4 |
| `FileSystemMgmt.getList` throws for an unknown backend type (a known OMV quirk) | No check possible | Fail closed: no disk can be wiped, with the server's message (0.6, 1.6) |
| Type the name with a trailing space, or in capitals | | Surrounding spaces ignored; case-sensitive (3.3) |
| Press Enter in the typed field | A form would submit | No form; Enter does nothing (`ConfirmDialog`) |
| Start a secure wipe, then reload | The handle is lost (UI-5); the wipe continues unseen | Said before it starts ("…while you stay signed in", 3.5). "Used for" then shows what the re-read finds. A later slice could recognise a wipe in progress from server state (R8); raised in 17, P7 |
| Start two wipes of the same disk in two tabs | No lock on the server | Each tab refuses while its own registry has one; across tabs the second one's re-read cannot see the first. The second wipe overwrites the same disk again; no extra loss. Accepted and stated |
| A wipe that fails half-way | Part of the disk erased | Failed panel says so; "Wipe again…" restarts the whole checked flow, never by itself (3.6) |
| Stop a secure wipe | The partition table at the start is gone, the backup at the end remains | The stop confirmation tells the reader to run a quick wipe after (3.5) |
| Pressing "Check disk health" or "Read health details" repeatedly | Disks woken repeatedly | Buttons ignore presses while reading; every waking read is on request, said beside the button (0.4) |
| Reload after reading health details | Lost | Kept in memory only (UI-13); the section returns to "not read"; nothing re-reads by itself |
| A disk that hides its health (USB enclosure) | Errors from every S.M.A.R.T. call | The server's message plus one plain sentence (2.4.5); not offered in Flow D (7.3) |
| `getDeviceSettings` fails for a reason other than "no settings" | Could be taken as "off" | Only the verified reply is "no settings"; everything else is an error. A wrong reading fails safely at save (2.5) |
| Turn off watching for a disk with scheduled tests | Tests would silently never run | The checkbox is unavailable with the reason (2.5) |
| Save power settings with defaults | OMV would turn the write cache off | The form starts with it on, visibly (2.7.3; 17, P6) |
| Save a spin-down time while monitoring wakes the disk every 30 minutes | Spin-down never seen to work | The warning names the cause and the setting (2.7.4) |
| A long test every hour | Never finishes | Refused in the form (6.4) |
| A schedule with garbage values | The server's unanchored patterns accept them | The form only produces the exact values; the contract's patterns are anchored (6.4, 11) |
| "Run now" on a disk that cannot be reached | The task reports success anyway (server quirk) | The result reads the output and says when it does not show the test began (6.6) |
| Flow D with other administrators' changes pending | Their changes ride our apply | Pre-flight refuses to start (R1, Q2); R10 asks again before applying (7.6) |
| Flow D with one disk that refuses monitoring | The whole set-up could stop | Per-disk failure, the rest continue, a clear choice before applying (7.6) |
| Flow D: reload mid-run | Journal lost | R8: the Overview and the band show the real state (7.7) |
| 0 disks besides the system disk; 1; 20 | | Each page's states; tables not paged but in their own scroll frames; Flow D's Select all at more than nine |
| A model or comment 200 characters long, right-to-left, or `<img onerror>` text | Layout, UI-2 | Text nodes, `dir="auto"`, wrapping; markup shown literally |
| A test note longer than 200 characters set elsewhere | Edit would fail validation | The field shows it and asks to shorten it before saving |
| The serial number in a shared screenshot | Personal data on screen | Shown only on screen, never in URLs, titles, toasts or storage (0.1, 0.5); section 16, D1 |
| A normal user types `/storage/disks/sda` | Refused methods | "Only administrators" page, no call (9) |
| `/storage/disks/..%2F..%2Frpc` or `/storage/disks/SDA` | URL as an identifier | Pattern rejects it; not-found state; no call (0.5) |

### 15.2 Without sight

| Probe | Requirement |
| --- | --- |
| Tab through each page | The orders in 1.7, 2.8, 3.7, 4.7, 5.4, 6.8, 7.8; skip link first (shell) |
| The wipe dialog | Title and consequence read together on open; focus on Cancel; the typed field's label is the sentence with the name; the reason the confirm button is unavailable is its hint |
| Waking reads | The sentence that says it wakes disks is before the button in reading order, not after |
| A running wipe | Start announced once; the elapsed time not announced; the result announced; progress as `aria-valuenow` with "32% done" |
| Health readings | Each pill has its word; each reading's plain name is its label; the full table has headers; the report block is a labelled region |
| Colour | Power, use and watching are words; every status has its word and icon shape; the destructive button differs by words and icon, not only colour |
| 200% zoom | One column; tables, the readings table and the report scroll in their own frames only |

---

## 16. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID | Decision | Why |
| --- | --- | --- |
| D1 | The **serial number is shown** in the Disks list (small, under the model), on a disk's page with a copy control, in Flow D's list and in the wipe confirmation; never in an address, a title, a toast or storage *(recommended)* | It is printed on the disk's label and is the only way to tell identical disks apart, which matters most when wiping or replacing one. It is personal data, so it stays on screen only |
| D2 | A disk's page is addressed by its **kernel name** (`sdb`), validated and resolved through the list; the serial and stable paths are not used in addresses *(recommended)* | A name in an address lands in history; the kernel name is short and not identifying. The risk that it changes after a restart is met by showing and re-checking the serial (0.5, 3.2) |
| D3 | **Nothing polls** in this slice; every list is read on opening, on Refresh and after an action, with its "Read at" time *(recommended)* | Disk lists change rarely; one of the reads may touch disks; a snapshot with a time is honest |
| D4 | **One disk-health check, shared** by the dashboard, the Disks list, the Overview, a disk's page and Flow D *(recommended)* | One waking read, made once, fills every view; the reader learns one button |
| D5 | A disk's **health details are read per disk**, on request; the overall state comes only from the shared check, never computed by the interface *(recommended)* | Waking one disk is cheaper than waking all; OMV's overall state rule is the server's, and a second one here could disagree |
| D6 | The full reading table and the full report sit **behind disclosures**; key readings are shown in plain words; the server's untranslated reading descriptions are not shown *(recommended)* | Progressive disclosure; a mixed-language page reads as broken |
| D7 | **Flow D lists disks from the health check**, which the flow offers to run first *(recommended)* | Only that reply says which disks can report their health, which are watched, and their settings identifiers; reading monitoring settings one by one cannot tell a USB disk that will refuse |
| D8 | Flow D **sets "skip the check while asleep"** (`standby`) unless the reader unticks it, and keeps a gentler saved choice *(recommended)* | The owner's stance on waking disks; the factory value wakes sleeping disks every 30 minutes |
| D9 | Flow D's default test is **a short test every Sunday at 03:00**; disks that already have tests get none added *(recommended)* | The audit's default; no duplicates; the reader can choose long, both or none |
| D10 | Email stays **in the classic interface**, linked with whether it is set up; the "S.M.A.R.T." notification event is mentioned, not read *(recommended)* | The owner's brief for this slice; the events method is not in the contract |
| D11 | The **temperature status** (Warning at the limit, Critical at the limit plus 5 °C) is shown only where the configured limit is read *(recommended)* | These are OMV's own levels; without a limit, a colour would be invented |
| D12 | **Scheduled tests are added and changed in a dialog**, not a route; the schedule is built from Every day / week / month / Custom *(recommended)* | Nothing about a test belongs in an address; four presets cover what owners schedule |
| D13 | Watching a disk with scheduled tests **cannot be turned off** until they are deleted *(recommended)* | Mirrors the stock interface's rule, which the server does not enforce; otherwise tests silently stop |
| D14 | A **long test every hour is refused** in the form *(recommended)* | It would never finish; the server accepts it |
| D15 | "Run now" **confirms first** (plain, not destructive) and reads the output to say whether the disk started the test *(recommended)* | It wakes the disk and a long test loads it for hours; the server reports success even when the disk was not reached |
| D16 | Deleting a scheduled test is a **plain confirmation**, not destructive *(recommended)* | It is configuration, undoable until applied; no data is lost |
| D17 | Power settings use **plain-word options with OMV's level numbers in brackets**, grouped; the owner's spin-down plugin is named in the spin-down hint *(recommended)* | Plain words first; the numbers match instructions written for the classic interface; the plugin reads the same setting and helps disks that ignore it |
| D18 | Power settings are **not shown as a form until "Choose power settings"**, which says they cannot be removed afterwards *(recommended)* | OMV has no delete for them, and saving sends every field, so the first save is a real step |
| D19 | Disks shows **"No file system found"**, not "Empty", unless this session wiped the disk *(recommended)* | Without reading the disk, emptiness cannot be claimed |
| D20 | The disk's **label size** ("4 TB on the label") is shown beside the binary size on a disk's page and in the wipe confirmation only *(recommended)* | It is how the owner bought and labelled the disk; binary sizes stay the rule everywhere else |
| D21 | Moved catalogue namespaces: `diskHealth.reason.*` and `diskCheck.*` from `dashboard.disks.*`, `common.savedPending` from `ssh.saved`, English unchanged *(recommended)* | Several pages now use them |
| D22 | Self-test rows carry a visible **"Actions" menu button** each (Run now, Edit, Delete); the Disks list has **no row actions**, and Wipe lives only on a disk's page, last and apart *(recommended)* | No icon-only or select-first actions (UX audit 3.6); one path to the destructive action, beside the disk's full identity |
| D23 | Disk health has **three tabs**, Overview, Self-tests and Settings, mirroring the stock Devices, Scheduled tests and Settings, and Flow D is its own page reached from them *(recommended)* | Existing users find things where OMV puts them; the flow keeps a focused page |

---

## 17. For the owner to agree

The destructive-action points of this slice. The design is built only once these are agreed.

1. **P1, what is refused.** Wiping is refused, with the blocker named in words and what to do, for:
   the system disk; a read-only disk; a disk holding a file system that is mounted, used by shared
   folders or services, set up on this NAS (including a mount saved but not applied), or being
   created; a RAID member; a disk being wiped; and any disk when the interface could not check what
   the disks hold (fail closed). (3.1, 0.6)
2. **P2, how it is confirmed.** One destructive dialog that names the disk by device, model, serial
   number and size (with the label size), says in one sentence that everything is erased and cannot
   be undone, lists what is on it now, offers Quick (default) or Secure, and asks to type the device
   name (`/dev/sdb`). Focus on Cancel, Enter does not confirm, no second dialog. The interface
   re-checks the disk when the dialog opens and again on "Wipe disk", including that the serial number
   is still the one shown. (3.2, 3.3) Typing the device name rather than the serial number is a
   choice: it is what the title shows and short enough to type correctly.
3. **P3, no way round a refusal.** A refused wipe offers no link to the classic interface (which would
   wipe without these checks); it names what to do instead. (3.1)
4. **P4, storage the interface cannot trace.** For encrypted disks, LVM, ZFS pools and RAID arrays made
   without the plugin, the interface cannot tell which disks they use. It does not refuse; it adds a
   sentence to the confirmation of every disk that could be part of such storage. The alternative is
   to refuse every "nothing found" disk while such storage is mounted, which would block wiping a new
   disk on those systems. (0.6, 3.3)
5. **P5, swap space.** A disk holding a swap partition is refused, because the interface cannot tell
   whether the NAS is using it. `FileSystemMgmt.getList` never lists swap; `enumerateFilesystems`
   would (inferred from source: `getMountCandidates` filters swap out of its list; the test VM has no
   swap to observe), so the check reads it (0.6).
6. **P6, write cache on by default.** When a disk's power settings are first saved, the form starts
   with the write cache **on**, unlike OMV's default of off, because OMV sends every field and "off"
   would silently slow the disk. Not destructive, but it changes what a save does. (2.7.3)
7. **P7, a secure wipe after a reload.** A wipe continues on the NAS when the page is reloaded or the
   session ends, but the page can no longer show it. The design says so before it starts. Recognising a
   running wipe from server state needs a way to list background tasks, which UI-5 rules out as
   designed; the owner may prefer to accept this as stated. (3.5)
8. **P8, stopping a secure wipe.** Allowed, after a plain confirmation that says the disk is then only
   partly wiped and to run a quick wipe after. A quick wipe has no stop. (3.5)
9. **P9, after the wipe.** The disk shows "Empty (wiped at …)" for the session, and the result links
   to creating a file system in the classic interface until the file-systems slice replaces it. (3.6)
