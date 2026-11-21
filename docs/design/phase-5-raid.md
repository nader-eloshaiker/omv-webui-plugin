# Phase 5, storage slice 3, RAID: design

The third storage slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the
RAID list, an array's own page (its state, its disks, what uses it), creating an array, adding a disk
(to replace a failed one, as a spare, or to make the array bigger), taking a disk out of an array,
checking an array, deleting an array, the UX audit's Flow F "Replace a failing disk" (its 4.7, J8a),
and how RAID joins Flow A. RAID here is the software RAID of the RAID plugin, `openmediavault-md`.

**Status: for the owner's agreement before building.** This slice erases disks (creating an array and
adding a disk overwrite them), destroys data (deleting an array), has an irreversible action (making an
array bigger) and one that takes away protection (removing a working disk), so the owner agrees the
design first (journal, 2026-11-21, "Storage is built in slices"). Section 18 lists the points to agree;
section 17 lists the other judgement calls, each taken as recommended unless the owner says otherwise.
Every backend method here is in the set the owner cleared on 2026-11-21 (`MdMgmt.*` and the storage
methods of the earlier slices); none needs the review-list question.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-8 above all), the journal entries of 2026-11-20 (Q8: both storage plugins in version 1, each shown
only when installed; Q2: a flow refuses to start while other changes are pending) and of 2026-11-21
(binding: storage in slices, each design agreed before building; the interface enforces its own
safeguards for destructive actions; nothing reads S.M.A.R.T. on its own; sharing is handed to the
classic interface for now), the [UX audit](ux-audit.md) (Flow F in 4.7, the job-runner rules R1 to R10
in 4.1, the adversarial pass in 7), and the conventions of [phase-3-pages.md](phase-3-pages.md),
[phase-5-monitoring.md](phase-5-monitoring.md), [phase-5-disks.md](phase-5-disks.md) and
[phase-5-filesystems.md](phase-5-filesystems.md), each in its section 0, which every page here reuses
unchanged. Where this document and the style guide disagree, the style guide wins; raise it.

Backend facts were read from the RAID plugin's source (`openmediavault-md` 8.1.7, for OMV 8.6.x) and
from OMV's own storage classes. Anything marked **[verify]** is checked on the mock and the VM, by
capture, before it is relied on. Anything marked **[owner]** needs the owner's answer before that part
is built. The test VM has no RAID plugin yet (journal, 2026-11-21); installing it on a snapshot is the
first verification step (section 15).

Every method used here is administrator-only. A normal user sees nothing new (section 10).

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the four
async states, the settings-form rules, the pending mark, the shared catalogue), the monitoring domain's
(status words, background and foreground reads, the idle timeout), the disks slice's (disk names, the
disk-use model, the wipe, what wakes a disk, one confirmation then a step list) and the file-systems
slice's (file-system names, the Used by panel, Flow A and its job runner, the handover to the classic
interface for sharing). This section adds only what is new.

### 0.1 Formatting

| What | Rule | Example |
| --- | --- | --- |
| An array's name for people (`{{array}}`) | "RAID" and the device file in `Identifier`: `devicefile` from `MdMgmt.enumerateDevices`. The existing key `filesystems.raidOn` ("RAID <device></device>") becomes the shared `raid.name` | `RAID /dev/md0` |
| An array's own name | mdadm reports `name` as "host:name". The part after the first colon is shown, as text with `dir="auto"`, on the array's page only and only when it is not just digits (mdadm's default is the array's number). The part before the colon is a host name and is never shown, stored or put in a title (section 17, D3) | `Name: media` |
| RAID level (`{{level}}`) | A shared word list `raidLevel.*`, the same words as Combine disks (BTRFS) where the idea is the same: `raid1`, `mirror` "Mirror (RAID1)"; `raid0`, `stripe` "Stripe (RAID0)"; `raid10` "Mirror and stripe (RAID10)"; `raid5` "Parity (RAID5)"; `raid6` "Double parity (RAID6)"; `raid4` "Parity disk (RAID4)"; `linear` "Joined (linear)"; empty (an array that is not running) "Not known"; anything else as received, in `Identifier` | `Mirror (RAID1)` |
| Array size | `size` (bytes) with Phase 3's byte rule. It is what the array offers to a file system, not the total of its disks | `7.9 GiB` |
| Progress of a sync | From `state`: the first number before `%` with one decimal, and from `finish=` (minutes) the time left with the duration rule, said with "about" | `45.0% done, about 2 hours left` |
| How many disks | "{{working}} of {{numdevices}} disks working", tabular; a spare is counted apart: "and 1 spare" | `1 of 2 disks working` |
| How many disks it can lose | 0.4's protection words | `It can lose 1 disk.` |
| Disk names, serial numbers, label sizes | The disks slice's rules (its 0.1), including the label size in every confirmation that erases a disk | `3.6 TiB (4 TB on the label)` |
| Server-written text (`state` when not recognised, the technical details, error messages) | As received, as text (UI-2), `dir="auto"` | |

### 0.2 An array's state

The pills use the fixed words and the shared `health.*` keys. An array's state is read from
`enumerateDevices`'s `state` (mdadm's own words, with the kernel's progress appended by the server),
its `syncaction`, and the counts of 0.3. `state` is open text; the interface reads it as a
comma-separated list of words, case ignored, and recognises only the words below **[verify]** every
form on the VM by capture (section 15).

| Recognised in `state` (and `syncaction`) | State | Reason, beside the pill |
| --- | --- | --- |
| `state` is `false` or empty | **Unknown** | "Could not read its state." |
| `inactive`, or `not started` | **Critical** | "Not running. Some of its disks are missing, so its files cannot be reached." |
| `failed` | **Critical** | "Failed. Too many of its disks are missing or have failed, so its files cannot be reached." |
| `degraded` and `recovering` | **Critical** | "A disk is missing. Rebuilding onto {{disk}}: {{progress}}. Until this ends it cannot lose another disk." (RAID6 with one disk missing: "…Until this ends it can lose one more disk.") |
| `degraded`, nothing recovering | **Critical** | "A disk is missing or has failed. If one more fails, its files are lost. Replace the disk." (RAID6 with one missing: "…It can lose one more disk, but replace this one soon.") |
| `reshaping` (or `syncaction` `reshape`) | **Warning** | "Being reshaped to use the added disks: {{progress}}. Do not turn off the NAS until this ends." |
| `resyncing` with `PENDING` | **Warning** | "Waiting to synchronise its disks. This starts when something is first written to it." **[verify]** |
| `resyncing` with `DELAYED` | **Warning** | "Waiting to synchronise its disks until another array on the same disks has finished." **[verify]** |
| `resyncing` | **Warning** | "Synchronising its disks: {{progress}}. Its files can be used, but it is not fully protected until this ends." |
| `checking` (or `syncaction` `check`) | **OK** | "Being checked. This can take hours." (no percentage: the server reports none for a check **[verify]**) |
| `repair` in `syncaction` | **OK** | "Being repaired. This can take hours." |
| `clean` or `active`, none of the above | **OK** | none |
| anything else | **Unknown** | "Its state is “{{state}}”, which this page does not recognise." |

- **A degraded array is Critical**, as the style guide names it (its 2: "a degraded array"), even
  while it rebuilds and even for RAID6 with one disk missing: until the rebuild ends, it is short of a
  disk. The words say how much protection is left.
- **A resync or a reshape is Warning**: the array works and nothing needs doing, but it is not fully
  protected, and for a reshape the reader must not turn the NAS off (section 17, D4).
- When `state` does not say `degraded` but 0.3 counts fewer working disks than `numdevices`, the
  array is treated as degraded (the stricter reading wins).
- **Unknown fails closed**: every action that changes the array is unavailable while its state is
  Unknown, with the reason "Its state could not be read, so it cannot be changed now."

Not statuses, and so never coloured or pilled: the level, the size, the name, what uses the array,
and a member's role (0.3), which carries the Critical pill only when the member is Failed or Missing.

### 0.3 A disk's role in an array

`enumerateDevices` lists an array's member devices (`devices`) but not what each one is doing. The
array's technical details (`MdMgmt.getDetail`, mdadm's report) end with one line per member, and the
interface reads each member's role from it **[verify]** the line forms by capture:

| mdadm's words on the member's line | Role | Shown |
| --- | --- | --- |
| `active sync` (with or without more words, such as `writemostly`) | **Working** | the word |
| `spare rebuilding` | **Rebuilding** | the word and the progress of 0.1 |
| `spare` | **Spare** | the word, and "Takes over by itself when a disk fails." |
| `faulty` | **Failed** | the Critical pill and "Failed" |
| `removed` (a line without a device) | **Missing** | a row without a disk: the Critical pill and "Missing: not connected, or failed and taken out" |
| anything else | as received, in `Identifier` | the words; the role is not known |

- **Counts**: working disks are the Working ones; the disks missing are `numdevices` less the Working
  and Rebuilding ones.
- **If the report cannot be read or its table cannot be parsed**, the roles are "Not known" and every
  action that depends on them (removing a disk, 5; replacing, 4) is unavailable: "Could not tell what
  each disk is doing, so this cannot be done now." with "Try again".
- The report is read with the list's data on the array's page (2.1) and does not touch the disks
  (0.5).

### 0.4 What an array protects

From the level and the number of disks it is made for (`numdevices`, written `n`), in words, on the
array's page, in the create form and in every confirmation:

| Level | It can lose | Usable space (each disk counts as the smallest, `s`) |
| --- | --- | --- |
| Mirror (RAID1) | `n − 1` disks: "It can lose {{count}} disks and keep every file." (2 disks: "1 disk") | `s` |
| Parity (RAID5) | 1 disk | `(n − 1) × s` |
| Double parity (RAID6) | 2 disks | `(n − 2) × s` |
| Mirror and stripe (RAID10) | 1 disk, and sometimes more: "It can lose 1 disk, and sometimes more, depending on which ones fail." | `n × s ÷ 2` |
| Stripe (RAID0), Joined (linear) | none: "It cannot lose any disk. If one fails, everything on all of them is lost." | `n × s` (stripe), the total (linear) |

When disks are missing, "It can lose" is reduced by that many, down to "It cannot lose another disk."
Usable space is computed in the browser and said with "about" **[verify]** against `size` after a
create on the VM; the small amount mdadm keeps for its own records is not subtracted.

### 0.5 What touches the disks, and the one poll

The owner's rule is that a background read must not wake a disk; reading S.M.A.R.T. stays the disks
slice's business and nothing here reads it.

| Method | Touches the disks? | When this slice calls it |
| --- | --- | --- |
| `MdMgmt.enumerateDevices` | No: it asks mdadm and the kernel's RAID status and reads OMV's configuration **[verify]** with `/proc/diskstats` on the VM that no member disk is read | On opening a page, Refresh, after an action, and the poll below |
| `MdMgmt.getDetail` | No: mdadm's report from the kernel **[verify]** as above | With `enumerateDevices` on an array's page, and in the poll while that page is open |
| `MdMgmt.getSlaves` | No: the system's device information **[verify]** | On opening an array's page |
| `MdMgmt.getCandidates` | May read each unused disk to look for anything on it **[verify]** whether it wakes one | Only on opening the create and add flows, and in their re-checks; the sentence beside the disk choice says so |
| `DiskMgmt.getList`, `FileSystemMgmt.getList`, `enumerateFilesystems`, `EmailNotification.get` | As in the earlier slices | With the page's reads |
| `MdMgmt.create`, `add`, `grow`, `remove`, `delete`, `DiskMgmt.wipe` | Yes, they write to the disks | Only after their confirmations |
| `MdMgmt.setSyncAction` with `check` | Yes: it reads every disk of the array, for hours | Only after its confirmation (section 6) |

**The one poll** (section 18, P9). The kernel does the long work (synchronising, rebuilding,
reshaping, checking) by itself, and the reader wants to see it move. So, **only while an array shown
on the page is doing one of these**, the RAID list re-reads `enumerateDevices` every 30 seconds, and an
array's page re-reads `enumerateDevices` and that array's `getDetail`. It is a background poll
(the monitoring domain's 0.4: `updatelastaccess: false`, stopped while the tab is hidden, no retry by
itself after a failure). It stops when nothing on the page is syncing, so a healthy, idle NAS is never
polled. Beside the "Read at" time: "Updated every 30 seconds while an array is synchronising, rebuilding
or being checked." The disks of an array that is syncing are awake anyway; the poll reads only the
kernel's state. Nothing else in this slice polls; the dashboard reads the arrays once per visit (9.1).

### 0.6 Naming an array in an address

An array's page is `/storage/md/$array`, where `$array` is the array's kernel name (`md0`, `md127`),
validated against `^md[0-9]{1,3}$` (OMV numbers new arrays from 0 to 255).

- The page reads `enumerateDevices` and finds the row whose `devicefile` is `/dev/` followed by the
  parameter. Every later call uses that row's fields, never the address (UI-4). A parameter that fails
  the pattern, or names no array, shows the not-found state (2.9) and makes no array-specific call.
- **[verify]** that `devicefile` is always `/dev/mdN`. An array whose `devicefile` has another form
  (`/dev/md/name`) has no page: its row shows its name as text, its state and its disks, and "This page
  cannot open this array. Manage it in the classic interface." with the footer's link.
- **The kernel name can change when the NAS restarts** (`md0` becomes `md127`, for example when the
  NAS has not written the array down yet, 0.8). The page always shows the level, the size and the
  member disks at the top, and every action re-checks the array's `uuid` before it acts: a different
  `uuid` stops it with "This array changed" (section 17, D2).
- The array's `uuid` is not used in the address: it is long, and the kernel name is what the classic
  interface, the disks list and the file-systems list call the array.

### 0.7 Which disks may go into an array

Creating an array and adding a disk overwrite the disks they are given. The plugin's own list of
candidates (`MdMgmt.getCandidates`) leaves out read-only disks, disks connected by USB, disks that
another setting refers to, disks already in an array, and any disk on which something was found (a
partition table, a file system, or the marks of an array or other storage) (read from source). The
server checks nothing when it is given a disk (the destructive-operations list read from source). As
in Flow A, **each disk is placed by both the plugin's list and the disks slice's disk-use model (its
0.6), and the stricter wins** (journal, 2026-11-21):

| Group | A disk is here when | Shown as |
| --- | --- | --- |
| **Empty disks** | It is in `getCandidates`, and the disk-use model finds nothing on it ("No file system found", or "Empty (wiped at …)" in this session) | Offered first |
| **Erase and reuse** | It is not in `getCandidates`, the disk-use model allows a wipe ("No file system found", or "File system {{name}}, not used on this NAS"), and it is not connected by USB (`hotpluggable`) | Offered under its own heading, each with what is on it; it gets a quick wipe first, as in Flow A (section 17, D8) |
| **Too small** (adding only) | Otherwise offered, but smaller than the smallest disk of the array (`getSlaves` sizes) | Not offered; under "Cannot be used": "It is smaller than the array's disks ({{size}}). A disk added to an array must be at least as large as the smallest one." |
| **Cannot be used** | Anything else in `DiskMgmt.getList`: the system disk, a read-only disk, a disk with a file system in use, set up or being created, swap, a disk already in an array, a disk being wiped, and a disk connected by USB | Not offered; listed in a `Disclosure` "Disks that cannot be used ({{count}})", each with the disks slice's blocker sentence, and for USB: "It is connected by USB. The RAID plugin does not use USB disks, because a USB connection can drop and break the array." |

- **"Erase and reuse" says what is on the disk**: "Holds the file system {{name}} ({{type}}, {{size}}),
  not used on this NAS." or "No file system was found, but the disk is not empty: it may hold old
  partitions, or be part of a RAID array from another computer."
- **After a reuse disk is erased**, it must appear in `getCandidates` before it is used; if it does
  not (the plugin leaves it out for a reason the interface cannot see, such as another setting that
  refers to it), the flow stops with the disk erased and says so (3.7, 4.7). **[verify]** on the VM
  whether a disk with S.M.A.R.T. monitoring settings saved is still in `getCandidates`.
- **Fail closed**: if `getCandidates` or any disk-use input fails, nothing is offered:
  `EmptyState variant="error"` "Could not check which disks can be used." + server message + "Try
  again".
- The disk is sent to the server by its stable name (`devicefile` from `DiskMgmt.getList`, the
  `/dev/disk/by-id/…` path the wipe uses), so a disk renamed between the check and the call is never
  hit by mistake **[verify]** that mdadm accepts it and that the array then lists the kernel name.

### 0.8 Pending changes in this slice

Every change to an array acts at once on the disks, and also tells OMV to write the arrays down again.
That marks two modules pending (read from the plugin's module): `mdadm`, which the band calls "RAID"
(new key `modules.mdadm`), and `initramfs`, "Start-up image" (existing). Applying them records the
arrays so the NAS starts them under the same names after a restart and covers them in its email alerts,
then rebuilds the start-up image, which takes a minute or two **[verify]** the time on the VM, and what
a restart without applying does to the array's name (0.6).

| Action | Marks pending | Applied by |
| --- | --- | --- |
| Create an array (section 3), add a disk (section 4) | `mdadm`, `initramfs` (and with 3's file-system stage, `fstab`, `collectd`, `monit`, `quota`) | The flow's own checkpoint at its end, after R10 (section 17, D11) |
| Remove a disk (section 5), delete an array (section 7) | `mdadm`, `initramfs` | The band, as any saved change; the result says what applying does |
| Check, stop checking (section 6) | nothing | |
| Saving the email settings in the classic interface | `mdadm` too (the plugin listens for it) | The band |

The flows refuse to start while anything else is pending (Q2, R1), so their checkpoint applies only
their own changes; R10 re-reads before applying and asks when something new appeared. The dialogs do
not apply, so they do not need the pre-flight.

**The pending mark on an array's page** appears when `mdadm` is pending and this session changed this
array since the last apply; `mdadm` alone is pending for other reasons too, so it does not mark every
array.

### 0.9 The interface's own refusals

The server checks almost nothing for these methods: it creates an array on any disks it is given,
adds any disk, removes any member whatever is left, grows any level, and deletes an array without
looking at what is on it (read from source). Every refusal below is the interface's own (journal,
2026-11-21), and a refusal offers no classic link that would do the same thing without the check (the
earlier slices' P3 and P9).

| Action | Refused when | Section |
| --- | --- | --- |
| Create an array | Fewer disks than the level needs; any disk the 0.7 groups do not offer | 3 |
| Add a disk | The level cannot take one here (Stripe, Joined); the array is not running, failed, Unknown, or busy (synchronising, reshaping, rebuilding, being checked); the disk is not offered by 0.7 | 4 |
| Make an array bigger | Any level but Parity (RAID5) and Double parity (RAID6); the array is not OK and idle | 4 |
| Remove a disk | The level has no spare copy (Stripe, Joined); the disk is Rebuilding; a Working disk while the array is degraded, busy, or the roles are not known; more than one disk at a time | 5 |
| Check | The level has no copies to compare (Stripe, Joined); the array is not OK and idle | 6 |
| Delete an array | A file system on it is set up, mounted, used or being created; other storage uses it (`_used`); the reads these rules need failed | 7 |
| Any of them | The array's state is Unknown (0.2); the array changed since the page was read (its `uuid`); an action on this array is already running in this session | all |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message.

### 0.10 When the RAID plugin is not installed

OMV answers `MdMgmt.enumerateDevices` with HTTP 404 "RPC service 'MdMgmt' not found." when the plugin
is not installed (observed on the VM, 2026-11-21), and the app already reads that as "no RAID plugin"
(`isRaidPluginMissing`). This slice adds what the RAID pages show then:

- **The menu item "RAID" is not shown** (Q8: shown only when installed). Whether it is shown is
  decided by the same `enumerateDevices` read, made once after an administrator signs in and kept for
  the session (section 11). While that read is loading, the item is not shown; on any other failure it
  is shown, and the page shows the error.
- **Opening a RAID address anyway** (`/storage/md`, an array's page, a flow) shows, in place of the
  page's content, `EmptyState variant="empty"` with a neutral icon:
  - "RAID needs the openmediavault-md plugin, which is not installed on this NAS."
  - "RAID combines several disks so that your files survive a failed disk. To use it, install
    openmediavault-md under System > Plugins in the classic interface, then come back here."
  - `ExternalLink` "Plugins in the classic interface" → `/#/system/plugins`.
  - No other call is made, and no array-specific address is resolved.
- **Elsewhere nothing claims anything about RAID**, as today: the Disks list has no RAID uses, Flow A
  has no "RAID arrays" group, the dashboard has no RAID rows, and the disks slice's untraceable-storage
  sentence (its P4) still covers arrays made by hand without the plugin.
- If the plugin is removed while a RAID page is open, its next read answers 404 and the page switches
  to this state.

### 0.11 What uses an array

`_used` (on every `enumerateDevices` row) is the server's yes or no: OMV has a mount entry for the
array, or other storage is built on it (read from source). The interface names what it can, with the
library's `UsedByPanel`:

- **File systems on it**: rows of `FileSystemMgmt.getList` whose `canonicaldevicefile` or
  `parentdevicefile` is the array, or a partition of it (`/dev/md0p1`, the disks slice's partition rule
  extended to `md` names), or whose `devicefiles` include it. Each is listed with its name (the
  file-systems slice's 0.1), its state pill, and a router link to its page.
- **A file system found on it but not set up on this NAS** (`enumerateFilesystems`): "File system
  {{name}} ({{type}}), not used on this NAS" with a router link "Open File systems" (its found section).
- **Something else**: `_used` is true and no file system matches: "Used by other storage this page does
  not show, such as LVM." with the footer's classic link.
- **Could not check**: a read failed: the panel's retry form. The refusals of section 7 rest on `_used`
  and `getList` together, and fail closed.

---

## 1. Storage > RAID

**Question it answers:** are my arrays healthy, is any of them short of a disk, and is one busy
synchronising or rebuilding? **Leads to:** an array's page; creating an array.

Administrators only, and only with the plugin installed (0.10). Route `/storage/md`.

### 1.1 Data

In parallel, on opening, on Refresh and after an action this session started ends; plus the poll of
0.5 while an array is syncing:

- `MdMgmt.enumerateDevices` (shared with the disks and file-systems pages' query).
- `FileSystemMgmt.getList` and `FileSystemMgmt.enumerateFilesystems` (shared), for the Used by column.
- `DiskMgmt.getList` (shared), to link each member disk.
- `EmailNotification.get` (exists), for the alerts line (1.5).
- `System.getInformation`'s `dirtyModules` (the shell's, already warm).

### 1.2 Layout

1. Page title "RAID".
2. Intro: "RAID combines several disks so that the NAS keeps working, and your files stay safe, when
   one disk fails. It is not a backup: a file deleted or damaged by mistake is gone from every disk at
   once."
3. **Roll-up line** (1.4), only when something is not fine.
4. **Unfinished work** notice (1.6), only when found.
5. **Toolbar**: **"Create array"** (filled primary, router link to `/storage/md/create`), "Refresh"
   (neutral), and on the trailing side "Read at {{time}}." (`text-xs muted-foreground tabular-nums`)
   and, while polling, the poll sentence of 0.5.
6. The **table** (1.3), not paged.
7. **Alerts line** (1.5).
8. Footer: `ExternalLink` "RAID in the classic interface" → `/#/storage/md`, with one line before it,
   `text-sm muted-foreground`: "Repairing an array after a check, stripes, and array names are in the
   classic interface."

### 1.3 Columns

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Array | `devicefile`, `name` | A router link to the array's page, 0.1's name. Accessible name "Open RAID /dev/md0". No link for an array without a page (0.6). Sortable (natural order) |
| 2 | State | 0.2 | The pill and its reason, never in a tooltip; while syncing, a compact progress bar under the reason (`ProgressBar`, 13.1) with the same figures as text |
| 3 | Level | `level` | 0.1's word |
| 4 | Size | `size` | 0.1, right-aligned, tabular. Sortable |
| 5 | Disks | `devices`, `numdevices`, `DiskMgmt.getList` | "{{working}} of {{numdevices}} disks working" (0.1; from `devices` and the state words, since the list does not read each array's report), then each member device as a router link to its disk page (the disks slice's rule), one per line, in `Identifier` |
| 6 | Used by | 0.11 | The file system's name as a router link to its page, or "Other storage", or "Nothing" |

The rows keep the server's order on every read; problems are led by the roll-up, not by moving rows.
There is no row selection and no row action: each array's actions are on its page, the ones that
destroy or take away protection apart, at the end.

On the list, "working" counts `devices` less any member the state words say is rebuilding or failed
**[verify]** whether `devices` lists failed and spare members; the array's page counts from the
report (0.3), which is exact. Where the two could differ, the list says "{{count}} disks" without
"working", and the page says which.

### 1.4 Roll-up line

`role="status"`, polite, above the toolbar, only when any array is not OK: the worst pill and "1 of 2
arrays: Critical" (`raid.rollUp`). Nothing when every array is OK; there is no "all OK" claim.

### 1.5 Alerts line

`text-sm`, under the table, from `EmailNotification.get`:

- Email on: "When a disk in an array fails, the NAS emails you. Which events send email is set under
  Notifications in the classic interface." with `ExternalLink` "Notification events in the classic
  interface" → `/#/system/notification/events`.
- Email off: "Email notifications are off, so a failed disk is shown only here and on the dashboard."
  with `ExternalLink` "Notification settings in the classic interface" →
  `/#/system/notification/settings`.
- The read failed: nothing (the line is information, not a status).

The RAID event's own switch is not in the contract and is not read (as the disks slice's D10).

### 1.6 Unfinished work (R8)

The job journal lives in memory, so a reload ends a flow view. The list recognises from server state:

| Found | Line | Action |
| --- | --- | --- |
| An array this session created with no file system on it (0.11), whose create flow chose "Use it for files" | "RAID {{device}} has no file system yet." | Router link "Add storage on it" → Flow A with the array chosen in memory (9.3) |
| `mdadm` pending, and this session changed an array | "The NAS has not written down the change to RAID {{device}} yet. Apply the pending changes so it starts the array the same way next time." | none: the band carries Apply |

### 1.7 States

| State | Look |
| --- | --- |
| Plugin not installed | 0.10 |
| Loading | Header row and `TableSkeletonRows` (2); "Loading the RAID arrays…" for assistive technology |
| Error (`enumerateDevices` failed, not 404) | `EmptyState variant="error"` in the table body: "Could not read the RAID arrays." + server message + "Try again". The toolbar stays |
| Empty | `EmptyState variant="empty"`: "There are no RAID arrays yet. Create one to combine two or more disks so that your files survive a failed disk." Action: router link "Create array" (the toolbar has the filled one) |
| Used by not known (a file-system read failed) | The rows, "Not known" in Used by, and above the table `InlineAlert tone="critical"` "Could not check what the arrays hold. Arrays cannot be deleted until this has been checked." + message + "Try again" |
| Refreshing | Rows stay with `aria-busy`; Refresh shows "Refreshing…"; afterwards "Read at" is announced. A poll does not announce |
| Poll failed | The rows stay; beside "Read at": "Could not update since {{time}}." and "Try again" (the monitoring domain's rule) |
| Populated | The table |

### 1.8 Keyboard

Tab order: the unfinished-work actions, Create array, Refresh, the sortable headers, each row's array
link and disk links, the alerts line's link, the footer link. The table scrolls in its own named region
at narrow widths. After Refresh, focus stays on Refresh. A poll never moves focus.

### 1.9 Copy

| Key | English |
| --- | --- |
| `raid.title` | RAID |
| `raid.intro` | RAID combines several disks so that the NAS keeps working, and your files stay safe, when one disk fails. It is not a backup: a file deleted or damaged by mistake is gone from every disk at once. |
| `raid.create` | Create array |
| `raid.refresh` | Refresh |
| `raid.refreshing` | Refreshing… |
| `raid.readAt` | Read at {{time}}. |
| `raid.polling` | Updated every 30 seconds while an array is synchronising, rebuilding or being checked. |
| `raid.pollFailed` | Could not update since {{time}}. |
| `raid.loading` | Loading the RAID arrays… |
| `raid.loadFailed` | Could not read the RAID arrays. |
| `raid.empty` | There are no RAID arrays yet. Create one to combine two or more disks so that your files survive a failed disk. |
| `raid.usedUnknown` | Could not check what the arrays hold. Arrays cannot be deleted until this has been checked. |
| `raid.rollUp_one` / `_other` | {{count}} of {{total}} array: {{status}} / {{count}} of {{total}} arrays: {{status}} |
| `raid.tableLabel` | RAID arrays |
| `raid.col.array` | Array |
| `raid.col.state` | State |
| `raid.col.level` | Level |
| `raid.col.size` | Size |
| `raid.col.disks` | Disks |
| `raid.col.usedBy` | Used by |
| `raid.name` | RAID <device></device> |
| `raid.open` | Open RAID {{device}} |
| `raid.noPage` | This page cannot open this array. Manage it in the classic interface. |
| `raid.disksWorking` | {{working}} of {{total}} disks working |
| `raid.disksCount_one` / `_other` | {{count}} disk / {{count}} disks |
| `raid.andSpares_one` / `_other` | and {{count}} spare / and {{count}} spares |
| `raid.usedBy.other` | Other storage |
| `raid.usedBy.none` | Nothing |
| `raid.usedBy.unknown` | Not known |
| `raid.alerts.on` | When a disk in an array fails, the NAS emails you. Which events send email is set under Notifications in the classic interface. |
| `raid.alerts.onLink` | Notification events in the classic interface |
| `raid.alerts.off` | Email notifications are off, so a failed disk is shown only here and on the dashboard. |
| `raid.alerts.offLink` | Notification settings in the classic interface |
| `raid.unfinished.noFs` | RAID <device></device> has no file system yet. |
| `raid.unfinished.addStorage` | Add storage on it |
| `raid.unfinished.notWritten` | The NAS has not written down the change to RAID <device></device> yet. Apply the pending changes so it starts the array the same way next time. |
| `raid.footerLine` | Repairing an array after a check, stripes, and array names are in the classic interface. |
| `raid.classicLink` | RAID in the classic interface |
| `raid.notInstalled.title` | RAID needs the openmediavault-md plugin, which is not installed on this NAS. |
| `raid.notInstalled.body` | RAID combines several disks so that your files survive a failed disk. To use it, install openmediavault-md under System > Plugins in the classic interface, then come back here. |
| `raid.notInstalled.link` | Plugins in the classic interface |
| `raidState.unread` | Could not read its state. |
| `raidState.inactive` | Not running. Some of its disks are missing, so its files cannot be reached. |
| `raidState.failed` | Failed. Too many of its disks are missing or have failed, so its files cannot be reached. |
| `raidState.rebuilding` | A disk is missing. Rebuilding onto <disk></disk>: {{progress}}. Until this ends it cannot lose another disk. |
| `raidState.rebuildingOneLeft` | A disk is missing. Rebuilding onto <disk></disk>: {{progress}}. Until this ends it can lose one more disk. |
| `raidState.degraded` | A disk is missing or has failed. If one more fails, its files are lost. Replace the disk. |
| `raidState.degradedOneLeft` | A disk is missing or has failed. It can lose one more disk, but replace this one soon. |
| `raidState.reshaping` | Being reshaped to use the added disks: {{progress}}. Do not turn off the NAS until this ends. |
| `raidState.resyncPending` | Waiting to synchronise its disks. This starts when something is first written to it. |
| `raidState.resyncDelayed` | Waiting to synchronise its disks until another array on the same disks has finished. |
| `raidState.resyncing` | Synchronising its disks: {{progress}}. Its files can be used, but it is not fully protected until this ends. |
| `raidState.checking` | Being checked. This can take hours. |
| `raidState.repairing` | Being repaired. This can take hours. |
| `raidState.unrecognised` | Its state is “{{state}}”, which this page does not recognise. |
| `raidState.unknownBlocks` | Its state could not be read, so it cannot be changed now. |
| `raidState.progress` | {{percent}} done, about {{left}} left |
| `raidState.progressNoTime` | {{percent}} done |
| `raidLevel.raid1` … `raidLevel.unknown` | Mirror (RAID1), Stripe (RAID0), Mirror and stripe (RAID10), Parity (RAID5), Double parity (RAID6), Parity disk (RAID4), Joined (linear), Not known |
| `raidProtect.mirror_one` / `_other` | It can lose {{count}} disk and keep every file. / It can lose {{count}} disks and keep every file. |
| `raidProtect.one` | It can lose 1 disk. |
| `raidProtect.two` | It can lose 2 disks. |
| `raidProtect.raid10` | It can lose 1 disk, and sometimes more, depending on which ones fail. |
| `raidProtect.none` | It cannot lose any disk. If one fails, everything on all of them is lost. |
| `raidProtect.noMore` | It cannot lose another disk. |
| `modules.mdadm` | RAID |

---

## 2. An array's page

**Question it answers:** is this array healthy, which disks is it made of and what is each doing, and
what is stored on it? **Leads to:** replacing a failed disk, adding a disk, taking one out, checking
the array, putting storage on it, or deleting it.

Administrators only. Route `/storage/md/$array` (0.6). No menu item of its own; the RAID item is current
while it is open.

### 2.1 Data on opening

- The list page's queries (1.1), shared and warm when coming from there;
- `MdMgmt.getDetail` with the row's `devicefile`, for the roles (0.3) and the technical details (2.7);
- `MdMgmt.getSlaves` with the row's `devicefile`, for each member's size;
- the session's disk-health check (the disks slice's D4), when there is one, for each member's health;
  this page never starts it.

While the array is syncing, 0.5's poll re-reads `enumerateDevices` and `getDetail`.

### 2.2 Layout

1. **Breadcrumbs**: "RAID" (router link) › 0.1's name (current page).
2. **Page title**: "RAID {{device}}". Beside it, the pending mark when 0.8 says so. Under it,
   `text-sm muted-foreground`: "{{level}}, {{size}}".
3. **State line**: the pill and reason of 0.2 in a `role="status"` region (polite; a poll that changes
   the pill announces the new state once; a poll that only moves the percentage does not), the
   `ProgressBar` while syncing, and "Read at {{time}}." with the poll sentence.
4. **What to do now** (2.4), only when the array is degraded, failed or not running, or a member's
   health check says Warning or Critical.
5. **Summary card** (2.3).
6. **Disks** (2.5), `h2` "Disks".
7. **Used by** (2.6), `h2` "Used by".
8. **Add a disk** (section 4), `h2` "Add a disk".
9. **Check this array** (section 6), `h2` "Check this array", only for levels with copies to compare.
10. **Technical details** (2.7), `h2` "Technical details".
11. After a divider and a 24px gap: **"Delete this array"** (section 7).

One column; at 1024px and wider the summary facts take two columns. Document title: "RAID {{device}} –
RAID – openmediavault"; the array's name, UUID and the host name are never in it.

### 2.3 Summary card

A `FactList`:

| Label | Value |
| --- | --- |
| State | 0.2's pill and reason |
| Level | 0.1's word, and under it, `text-sm muted-foreground`, 0.4's protection sentence for the array as it is now |
| Size | `size` (0.1), and "What files can use. Each disk counts as the smallest one in the array." |
| Disks | "{{working}} of {{numdevices}} disks working" (from 0.3), "and {{count}} spare" when there are spares |
| Name | 0.1's own name, when there is one |
| Device name | `devicefile` in `Identifier` |

Then a `Disclosure` "Other names for this array" / "Hide other names": "RAID UUID" (`uuid`, in
`Identifier`, with `CopyButton`). It is what a support forum asks for.

### 2.4 What to do now

A `Card` with an `h3`, the steps as an ordered list, and the action buttons. It is the start of Flow F
(section 8); each case says only what applies:

| Case | Heading | Body and actions |
| --- | --- | --- |
| Degraded, a member **Failed** still connected | "Replace the failed disk" | "The disk {{device}} ({{model}}, serial number {{serial}}) has failed. Replace it with a disk at least {{size}} large." Then two numbered ways (8.2): with a free place for a disk: "Connect the new disk, then press Add the new disk." Without: "Take the failed disk out of the array, turn off the NAS, swap the disks, turn it on, then come back here." Buttons: **"Add the new disk…"** (filled; router link to the add flow, section 4) and "Take the failed disk out…" (neutral; section 5's dialog for that member) |
| Degraded, a disk **Missing** (not connected) | "Replace the missing disk" | "A disk of this array is not connected any more, so the NAS cannot show which one it was. These disks are still in the array: {{list}} (each with its serial number). The disk that is not in this list is the one to replace." Then "Connect a disk at least {{size}} large, then press Add the new disk." and "Look for new disks" (`DiskMgmt.rescan`, then the reads). Button **"Add the new disk…"** |
| Degraded and **rebuilding** | "Rebuilding" | "The NAS is copying everything onto {{disk}}. This takes hours on a large disk. Its files can be used meanwhile. You can leave this page or sign out; rebuilding goes on on the NAS." No button |
| **Not running** or **failed** | "This array is not running" | "Some of its disks are missing. If a disk was unplugged, connect it again and restart the NAS. This page cannot start an array that is missing disks." **[verify]** that reconnecting and restarting brings an array back on the VM |
| A Working member's **health check** is Warning or Critical (and the array is OK) | "A disk in this array may fail soon" | "The disk health check found a problem on {{device}} ({{model}}, serial number {{serial}}): {{reason}}. Replace it before it fails: first add a new disk as a spare, then take {{device}} out; the NAS rebuilds onto the spare at once." Buttons "Add a spare…" (router link to the add flow) and a router link "Open disk {{device}}" for its health details |

The card never claims a disk is failing from anything but the role (0.3) or the session's health
check; "Not checked" members are never warned about.

### 2.5 Disks

A table, one row per member from the report (0.3), plus one row per missing disk:

| Order | Header | Display |
| --- | --- | --- |
| 1 | Disk | The device as a router link to its disk page (the disks slice's rule), in `Identifier`; a missing disk: "Missing" in `muted-foreground` |
| 2 | Model | The model, and under it the serial number in `Identifier` (from `DiskMgmt.getList`, else `getSlaves`) |
| 3 | Size | From `getSlaves`, right-aligned, tabular |
| 4 | Role | 0.3's word; Failed and Missing with the Critical pill; Rebuilding with its progress |
| 5 | Health | From the session's check: the pill and reason; "Not checked" in `muted-foreground` with, once under the table, a router link "Check disk health on the Disks page"; the check wakes every disk, so it is not started here |
| 6 | (actions) | A visible "Take out…" button (neutral) on each row where section 5 allows it, with the accessible name "Take {{device}} out of RAID {{array}}"; where it does not, nothing in the row and the reason in section 5's place |

Removing a disk is the only per-row action, and it opens a dialog that names the disk and the array.
Under the table, `text-sm muted-foreground`: "A spare waits and takes over by itself when a disk fails."
when the array has a spare.

### 2.6 Used by

`UsedByPanel`, `h2` "Used by" (0.11):

- Each file system on it: kind "File system", its name, its state pill, router link "Open file system
  {{name}}".
- A file system not used on this NAS: its sentence and "Open File systems".
- Something else: 0.11's sentence.
- Nothing: "Nothing is stored on this array yet." and the router link **"Add storage on this array"**
  → Flow A with the array chosen in memory (9.3), unless 9.3 refuses the array, when the link is
  absent and its reason is said ("Replace its missing disk first.").
- After this session made the array bigger (section 4) and a file system is on it: "Grow the file
  system so it uses the added space." with the router link "Grow file system {{name}}" → the file
  system's page, where the file-systems slice's grow section is (its section 4).

### 2.7 Technical details

mdadm's report, already read for the roles (`getDetail`): it does not touch the disks, so the section
shows it on "Show technical details" without a warning sentence, as text on the terminal pair
(`TaskLog`, `size="page"`, `wrap={false}`), with "Copy report" and "Hide technical details". Intro:
"mdadm's own report on the array: how it was made and what each disk is doing." The report contains the
host name and the array's UUID; it is shown on screen only, never stored beyond the session's memory
(UI-13). Failed: `InlineAlert tone="critical"` "Could not read the technical details." + message +
"Try again" (and 0.3's roles are "Not known").

### 2.8 Keyboard and focus

Tab order: the breadcrumb link, the What to do now card's buttons, the summary's Other names, the
Disks table (each disk link, each Take out button), Check disk health on the Disks page, the Used by
panel's links, Add a disk…, the check section's button, Show technical details (then the report,
Copy report, Hide), Delete array…. A poll never moves focus, and a row that disappears in a poll
(a removed disk) moves focus to the Disks heading only if focus was in that row.

### 2.9 States of the page

| State | Look |
| --- | --- |
| Plugin not installed | 0.10 |
| Loading | Title skeleton; the summary as `FactListSkeleton`; the sections' headings with skeletons |
| `enumerateDevices` failed | `EmptyState variant="error"`: "Could not read this array." + server message + "Try again" |
| No such array (pattern fails, or no row) | `EmptyState variant="empty"`: "There is no array with this name on this NAS. It may have been deleted, or have a new name after a restart." and router link "Show all arrays" → `/storage/md` |
| Gone after a re-read (deleted in another tab) | The same empty state |
| The `uuid` changed after a re-read (another array now has this name) | An `InlineAlert` (Unknown treatment) above the title: "This is a different array from the one this page showed. Its details have been read again." Every running dialog of this page closes with "This array changed." |
| `getDetail` failed | The page, with roles "Not known" and 0.3's blocked actions |
| Populated | 2.2 |

### 2.10 Copy

| Key | English |
| --- | --- |
| `array.breadcrumb` | RAID |
| `array.title` | RAID {{device}} |
| `array.subtitle` | {{level}}, {{size}} |
| `array.documentTitle` | RAID {{device}} – RAID |
| `array.loading` | Loading the array… |
| `array.loadFailed` | Could not read this array. |
| `array.notFound` | There is no array with this name on this NAS. It may have been deleted, or have a new name after a restart. |
| `array.showAll` | Show all arrays |
| `array.changed` | This is a different array from the one this page showed. Its details have been read again. |
| `array.fact.state` | State |
| `array.fact.level` | Level |
| `array.fact.size` | Size |
| `array.fact.sizeHint` | What files can use. Each disk counts as the smallest one in the array. |
| `array.fact.disks` | Disks |
| `array.fact.name` | Name |
| `array.fact.device` | Device name |
| `array.names.show` | Other names for this array |
| `array.names.hide` | Hide other names |
| `array.names.uuid` | RAID UUID |
| `array.names.copy` | Copy RAID UUID |
| `array.now.failedTitle` | Replace the failed disk |
| `array.now.failedBody` | The disk <device></device> ({{model}}, serial number <serial></serial>) has failed. Replace it with a disk at least {{size}} large. |
| `array.now.wayFree` | If the NAS has a free place for a disk: connect the new disk, then press Add the new disk. |
| `array.now.wayNoFree` | If not: take the failed disk out of the array, turn off the NAS, swap the disks, turn it on, then come back here. |
| `array.now.addNew` | Add the new disk… |
| `array.now.takeOut` | Take the failed disk out… |
| `array.now.missingTitle` | Replace the missing disk |
| `array.now.missingBody` | A disk of this array is not connected any more, so the NAS cannot show which one it was. These disks are still in the array: {{list}}. The disk that is not in this list is the one to replace. |
| `array.now.missingConnect` | Connect a disk at least {{size}} large, then press Add the new disk. |
| `array.now.rescan` | Look for new disks |
| `array.now.rebuildingTitle` | Rebuilding |
| `array.now.rebuildingBody` | The NAS is copying everything onto <disk></disk>. This takes hours on a large disk. Its files can be used meanwhile. You can leave this page or sign out; rebuilding goes on on the NAS. |
| `array.now.stoppedTitle` | This array is not running |
| `array.now.stoppedBody` | Some of its disks are missing. If a disk was unplugged, connect it again and restart the NAS. This page cannot start an array that is missing disks. |
| `array.now.failingTitle` | A disk in this array may fail soon |
| `array.now.failingBody` | The disk health check found a problem on <device></device> ({{model}}, serial number <serial></serial>): {{reason}} Replace it before it fails: first add a new disk as a spare, then take <device></device> out; the NAS rebuilds onto the spare at once. |
| `array.now.addSpare` | Add a spare… |
| `array.now.openDisk` | Open disk {{device}} |
| `array.disks.title` | Disks |
| `array.disks.tableLabel` | Disks of RAID {{device}} |
| `array.disks.col.disk` | Disk |
| `array.disks.col.model` | Model |
| `array.disks.col.size` | Size |
| `array.disks.col.role` | Role |
| `array.disks.col.health` | Health |
| `array.disks.missing` | Missing |
| `array.disks.notChecked` | Not checked |
| `array.disks.checkLink` | Check disk health on the Disks page |
| `array.disks.takeOut` | Take out… |
| `array.disks.takeOutName` | Take {{device}} out of RAID {{array}} |
| `array.disks.spareNote` | A spare waits and takes over by itself when a disk fails. |
| `raidRole.working` | Working |
| `raidRole.rebuilding` | Rebuilding |
| `raidRole.spare` | Spare |
| `raidRole.spareHint` | Takes over by itself when a disk fails. |
| `raidRole.failed` | Failed |
| `raidRole.missing` | Missing: not connected, or failed and taken out |
| `raidRole.unknown` | Not known |
| `raidRole.unreadBlocks` | Could not tell what each disk is doing, so this cannot be done now. |
| `array.usedBy.title` | Used by |
| `array.usedBy.fs` | File system |
| `array.usedBy.openFs` | Open file system {{name}} |
| `array.usedBy.found` | File system {{name}} ({{type}}), not used on this NAS |
| `array.usedBy.openList` | Open File systems |
| `array.usedBy.other` | Used by other storage this page does not show, such as LVM. |
| `array.usedBy.none` | Nothing is stored on this array yet. |
| `array.usedBy.addStorage` | Add storage on this array |
| `array.usedBy.failed` | Could not check what is stored on this array. |
| `array.usedBy.growFs` | Grow the file system so it uses the added space. |
| `array.usedBy.growFsLink` | Grow file system {{name}} |
| `array.details.title` | Technical details |
| `array.details.intro` | mdadm's own report on the array: how it was made and what each disk is doing. |
| `array.details.show` | Show technical details |
| `array.details.hide` | Hide technical details |
| `array.details.label` | Technical details of RAID {{device}} |
| `array.details.copy` | Copy report |
| `array.details.failed` | Could not read the technical details. |

---

## 3. Create an array

**Question it answers:** which disks do I combine, how much protection do I want, and how much space
do I get? **Leads to:** a new array, by default with a file system on it, mounted and ready for
shared folders.

Route `/storage/md/create`, no menu item; reached from the RAID toolbar and empty state, and from Flow
A's combine hint (9.3). Breadcrumbs: "RAID" › "Create array". It follows R1 to R10 with the job-runner
parts, as Flow A does, and reuses Flow A's steps for its file-system stage (section 18, P4).

### 3.1 Pre-flight (R1)

On opening, the page reads `dirtyModules`. If anything is pending, the flow does not start (Q2):
`PreflightNotice` "Some changes are not applied yet", the band's list in words, "Apply them now" /
"Undo them" with the band's own confirmations. Then, in parallel: `MdMgmt.getCandidates` ("Looking for
disks that can go into an array… This reads the disks, which wakes any that have gone to sleep."), the
disk-use inputs (shared, often warm), and `MdMgmt.enumerateDevices`.

### 3.2 Decisions, in one form

`JobRunner` with the title "Create a RAID array" (`h2`; the page title is "RAID").

**C1. Disks** (`CheckboxListField` with groups, legend "Disks to combine"): the groups of 0.7, in order
"Empty disks", "Erase and reuse"; "Disks that cannot be used ({{count}})" as a `Disclosure` under them.
Each option names the disk as Flow A's do: device (`Identifier`), model, size; the serial number under
it; for Erase and reuse, what is on it. None ticked by default. With more than nine offered, "Select
all" and "Select none". Under the list: "Choose at least 2 disks." / "Choose at least {{count}} disks for
{{level}}.", checked on Continue, not on each tick. When the ticked disks differ in size: "These disks
differ in size. Each counts as the smallest, {{size}}; {{lost}} on the larger ones is not used."

- Fewer than two disks offered: `EmptyState variant="empty"`: "An array needs at least two disks that
  can be erased. Connect more disks, or free some that are in use." with "Look for new disks" and the
  "Disks that cannot be used" list open.

**C2. How to protect your files** (`RadioGroupField`, legend "Level", four options; each hint ends with
the usable space for the ticked disks, 0.4, "about"; until enough disks are ticked for a level, its
hint has no size and it says how many it needs; section 18, P3):

1. **"Mirror (RAID1), recommended"** (default). "Every file is kept on every disk. It can lose all but
   one disk. You can use the space of one disk: about {{usable}}." At least 2.
2. "Parity (RAID5)". "It can lose 1 disk. You can use all but one disk's space: about {{usable}}. If a
   second disk fails while it rebuilds, everything is lost." At least 3.
3. "Double parity (RAID6)". "It can lose 2 disks. You can use all but two disks' space: about
   {{usable}}." At least 4.
4. "Mirror and stripe (RAID10)". "Faster than parity. It can lose 1 disk, and sometimes more. You can
   use half the space: about {{usable}}." At least 4.

A level that the ticked count does not allow is not disabled: it stays choosable, and Continue says
"Choose at least {{count}} disks for {{level}}." (so the reader can choose the level first). Stripe is
not offered (section 18, P3); under the group, `text-sm muted-foreground`: "To join disks into one large
space without protection, use Combine disks (BTRFS) under File systems." with a router link.

**C3. Use it for files** (`CheckboxField`, default ticked): "Put a file system on it and mount it, so
you can make shared folders on it." Hint: "Untick this to leave the array empty, for example to use it
for something set up in the classic interface. You can add storage on it later."

When ticked, Flow A's decisions follow, unchanged in words: **C4. Format** with "Standard (EXT4),
recommended" (default), "XFS" and "BTRFS" (F2FS is left out: it is made for flash cards, not arrays;
section 17, D13); **C5. Tags**; **C6. Warn when it is this full** (default 85%). And Flow A's line on
sharing: "Sharing a folder on it with your computers is the next step. This page shows you how when
the storage is ready."

The array gets no name (section 17, D3). Buttons at the end: **"Continue"** (filled).

### 3.3 Summary and confirmation (R2)

`JobSummary` with `typedConfirmation`, title "Ready to create the array". One item per action, in the
order they run:

- "Erase {{count}} disks:" then one line per disk, each as Flow A's erase or use-whole line (device,
  model, serial number, size with the label size; for Erase and reuse, what is lost).
- "Combine them into RAID {{device}}: {{level}}. About {{usable}} can be used. {{protection}}" where
  `{{device}}` is the name the server will give (the next free `/dev/mdN`), said as "a new array" when
  it cannot be known in advance **[verify]**; `{{protection}}` is 0.4's sentence.
- "The disks then synchronise, which takes hours for large disks. The array can be used meanwhile, but
  it is not fully protected until this ends."
- With C3: Flow A's create, tags, level and mount lines, for the array ("Create an EXT4 file system on
  the array." …), then "Then save the array and mount the file system, which applies the changes for
  them. Nothing else is pending." and "Sharing a folder on it comes next, in the classic interface for
  now."
- Without C3: "Then save the array's settings, which applies the changes for it. Nothing else is
  pending."

Then the typed confirmation: "Type {{devices}} to confirm.", every chosen device name separated by
single spaces, in the order listed (Combine disks' rule and its `typedMatches` extension). The confirm
button **"Erase {{count}} disks and create array"** (`destructive`) is unavailable until it matches,
with the hint "The button is available once the names match." Beside it, "Change choices". No form
around the summary; Enter in the typed field does nothing; focus moves to the summary's heading on
arrival. One named, typed confirmation is the gate (style guide 5.4).

### 3.4 The steps (R3, R5)

`JobStepList`, each step with its state word:

| # | Step label | Calls | Notes |
| --- | --- | --- | --- |
| 1 | "Check the disks again" | `getCandidates`, the disk-use inputs, `enumerateDevices` | Every disk must still be offered in the same group, with the same serial number and model. Otherwise the flow stops before anything is erased (3.7) |
| 2 … | "Erase {{device}}", one per Erase and reuse disk | `DiskMgmt.wipe {devicefile, secure: false}`, a task, output in a `Disclosure` | Then `getCandidates` again: the disk must now be a candidate |
| n | "Create the array" | `MdMgmt.create {devices, name: "", level}`: `devices` the stable names (0.7), `level` `mirror`, `raid5`, `raid6` or `raid10` | Synchronous, a few seconds **[verify]**. Its reply names the new array's `devicefile` |
| n+1 | "Find the new array" | `enumerateDevices` | The row whose `devicefile` is the reply's and whose `devices` are exactly the chosen disks (by any of their names). Exactly one must match |
| With C3: n+2 | "Check the array can hold a file system" | `FileSystemMgmt.getCandidatesBg` | It must list the array **[verify]** that a new array appears at once, during its first synchronisation |
| n+3 … n+5 | "Create the {{format}} file system", "Find the new file system", "Set up the mount" | Flow A's steps 3 to 5 on the array's `devicefile` | No partition is made on an array (read from source) |
| last but one | **"Save the array and mount the new file system"** (with C3) or **"Save the array's settings"** (without) | R10: expected exactly `mdadm`, `initramfs` and, with C3, `fstab`, `collectd`, `monit`, `quota` **[verify]**; then `Config.applyChangesBg` | The checkpoint, labelled by what it does, not "Apply" |
| last | "Check the result" | `enumerateDevices` (the array is listed and its state readable); with C3, Flow A's step 7 (mounted, entry exists) | Never claim a mounted file system that is not (UX audit B8) |

While a task step runs, it shows "Running for {{duration}}" and its output, following the tail. The
tasks are in the Tasks menu ("Erase disk {{device}}", "Create file system on RAID {{device}}", "Apply
changes"). The array's first synchronisation is not a task: it is the array's state, shown on its page
and in the list. No step can be cancelled.

### 3.5 Leaving the page

Leaving does not stop the flow (its run lives in memory for the session, as Flow A's does); coming
back shows the step list. A reload or a new sign-in ends the flow view (R8): the RAID list's 1.6
recognises an array with no file system and a pending `mdadm`. The array's synchronisation goes on in
the NAS whatever the browser does.

### 3.6 Result

`JobResult` succeeded, announced politely:

- Title: "The RAID array is ready."
- "RAID {{device}} ({{level}}, about {{size}}) is synchronising its disks. Its files can be used now;
  it is fully protected when this ends." Router link "Open RAID {{device}}".
- With C3: Flow A's "{{name}} is mounted and ready, with {{size}} free.", router link "Open the file
  system", and Flow A's handover card "Next: share a folder on it" (its 6.8), unchanged.
- Without C3: router link "Add storage on this array" (9.3).

### 3.7 Failures (R6, R7, R10)

The flow stops at the failed step, never retries by itself (UI-14), says what succeeded, what failed
(the server's message as text, UI-9) and what did not run; focus moves to the failure's heading.

| Fails at | The system is left | The reader sees | Offered |
| --- | --- | --- | --- |
| 1, a blocker or a change | unchanged | "{{device}} cannot be used now." + the blocker, or "The disk now called {{device}} is not the one you chose. Nothing was erased. Choose again." | "Change choices" |
| 1, a read failed | unchanged | "Could not check the disks again, so nothing was erased." + message | "Try this step again"; "Stop here" |
| 2, an erase | earlier disks erased; this one unchanged or partly erased | "{{device}} could not be erased." + the output open, and "{{erased}} were erased before this step failed. They stay erased." | "Try this step again"; "Stop here" |
| 2, still not a candidate | erased | "{{device}} was erased, but the RAID plugin still does not offer it for an array." | "Check again"; "Stop here" |
| n, create | disks erased (reuse ones); perhaps marks of an unfinished array on some | "The array was not created." + message, and "The disks may now carry parts of an unfinished array. Creating again overwrites them." | "Try this step again"; "Stop here" (the disks then show under Erase and reuse) |
| n+1, not found | an array may exist | "The array was created but has not appeared yet." | "Look again"; "Stop here", with "It is listed under RAID when it appears." |
| n+2 to n+5 | the array exists, perhaps an empty or unmounted file system on it | Flow A's sentences for its steps 3 to 5 | Flow A's offers; "Stop here" says "The array stays. You can add storage on it under File systems, or delete it on its page." |
| Checkpoint, R10 finds more | pending: this flow's and something else | `AlsoPendingPrompt` "Also pending from elsewhere: {{list}}. Saving applies them too." | "Apply them too"; "Stop here" (the changes stay in the band) |
| Checkpoint, apply | some modules deployed, some not; all still pending (B3) | "Saving the array failed." (with C3: "Saving the array and mounting the file system failed.") + message | **"Try again"** first (R7); then "Stop here", the changes stay in the band. No "Undo": undoing pending changes would not remove the array, which already exists on the disks (section 17, D12) |
| Last, not mounted | applied | Flow A's step 7 failure | Flow A's offers |

**Backing out.** The flow offers no automatic undo: the array exists on the disks from step n on. A
reader who wants it gone deletes it on its page (section 7), where the typed confirmation applies like
any other deletion; the result's "Stop here" text says so.

### 3.8 Keyboard and screen readers

The decisions are one form in reading order: the disk checkbox list (each option reads device, model,
size, serial and what is on it), Select all and Select none when shown, "Disks that cannot be used",
Look for new disks (when shown), the level radio group (one tab stop, arrows inside; each hint read
with its option), the combine link, Use it for files, then the file-system fields when ticked, and
Continue. Ticking and unticking announce nothing; the level hints update their size text in place.
The summary, the typed field (its label is the "Type … to confirm." sentence), the confirm button and
Change choices follow. During the run, step changes are announced politely, a failure assertively with
focus on its heading, the result politely.

### 3.9 Copy

Flow A's keys (`addStorage.*`) are reused for the file-system stage, its handover and its failure
sentences; the keys below are new.

| Key | English |
| --- | --- |
| `raidCreate.breadcrumb` | Create array |
| `raidCreate.title` | Create a RAID array |
| `raidCreate.documentTitle` | Create array – RAID |
| `raidCreate.preflightBody` | Apply or undo them before you create an array, so that only these changes are applied at the end. |
| `raidCreate.looking` | Looking for disks that can go into an array… This reads the disks, which wakes any that have gone to sleep. |
| `raidCreate.checkFailed` | Could not check which disks can be used. |
| `raidCreate.disks` | Disks to combine |
| `raidCreate.min` | Choose at least 2 disks. |
| `raidCreate.minFor` | Choose at least {{count}} disks for {{level}}. |
| `raidCreate.mixedSizes` | These disks differ in size. Each counts as the smallest, {{size}}; {{lost}} on the larger ones is not used. |
| `raidCreate.notEnough` | An array needs at least two disks that can be erased. Connect more disks, or free some that are in use. |
| `raidCreate.holds.unknown` | No file system was found, but the disk is not empty: it may hold old partitions, or be part of a RAID array from another computer. |
| `raidCreate.cannot.usb` | It is connected by USB. The RAID plugin does not use USB disks, because a USB connection can drop and break the array. |
| `raidCreate.level` | Level |
| `raidCreate.mirror` | Mirror (RAID1), recommended |
| (the other three options' labels) | `raidLevel.raid5`, `raidLevel.raid6`, `raidLevel.raid10` |
| `raidCreate.mirrorHint` | Every file is kept on every disk. It can lose all but one disk. You can use the space of one disk: about {{usable}}. |
| `raidCreate.raid5Hint` | It can lose 1 disk. You can use all but one disk's space: about {{usable}}. If a second disk fails while it rebuilds, everything is lost. |
| `raidCreate.raid6Hint` | It can lose 2 disks. You can use all but two disks' space: about {{usable}}. |
| `raidCreate.raid10Hint` | Faster than parity. It can lose 1 disk, and sometimes more. You can use half the space: about {{usable}}. |
| `raidCreate.needs` | Needs at least {{count}} disks. |
| `raidCreate.stripeHint` | To join disks into one large space without protection, use Combine disks (BTRFS) under File systems. |
| `raidCreate.stripeLink` | Combine disks (BTRFS) |
| `raidCreate.useForFiles` | Put a file system on it and mount it, so you can make shared folders on it. |
| `raidCreate.useForFilesHint` | Untick this to leave the array empty, for example to use it for something set up in the classic interface. You can add storage on it later. |
| `raidCreate.continue` | Continue |
| `raidCreate.summaryTitle` | Ready to create the array |
| `raidCreate.sum.erase_other` | Erase {{count}} disks: |
| `raidCreate.sum.combine` | Combine them into RAID {{device}}: {{level}}. About {{usable}} can be used. {{protection}} |
| `raidCreate.sum.combineNew` | Combine them into a new array: {{level}}. About {{usable}} can be used. {{protection}} |
| `raidCreate.sum.sync` | The disks then synchronise, which takes hours for large disks. The array can be used meanwhile, but it is not fully protected until this ends. |
| `raidCreate.sum.create.ext4` | Create an EXT4 file system on the array. (and `.xfs`, `.btrfs` with their articles) |
| `raidCreate.sum.saveAndMount` | Then save the array and mount the file system, which applies the changes for them. Nothing else is pending. |
| `raidCreate.sum.save` | Then save the array's settings, which applies the changes for it. Nothing else is pending. |
| `raidCreate.typePrompt` | Type {{devices}} to confirm. |
| `raidCreate.typeHint` | The button is available once the names match. |
| `raidCreate.confirm` | Erase {{count}} disks and create array |
| `raidCreate.step.check` | Check the disks again |
| `raidCreate.step.create` | Create the array |
| `raidCreate.step.find` | Find the new array |
| `raidCreate.step.fsCandidate` | Check the array can hold a file system |
| `raidCreate.step.saveAndMount` | Save the array and mount the new file system |
| `raidCreate.step.save` | Save the array's settings |
| `raidCreate.step.verify` | Check the result |
| `raidCreate.task.createFs` | Create file system on RAID {{device}} |
| `raidCreate.fail.checkRead` | Could not check the disks again, so nothing was erased. |
| `raidCreate.fail.notCandidate` | {{device}} was erased, but the RAID plugin still does not offer it for an array. |
| `raidCreate.fail.create` | The array was not created. |
| `raidCreate.fail.createParts` | The disks may now carry parts of an unfinished array. Creating again overwrites them. |
| `raidCreate.fail.notFound` | The array was created but has not appeared yet. |
| `raidCreate.fail.listedLater` | It is listed under RAID when it appears. |
| `raidCreate.fail.arrayStays` | The array stays. You can add storage on it under File systems, or delete it on its page. |
| `raidCreate.fail.save` | Saving the array failed. |
| `raidCreate.fail.saveAndMount` | Saving the array and mounting the file system failed. |
| `raidCreate.alsoBody` | Also pending from elsewhere: {{list}}. Saving applies them too. |
| `raidCreate.doneTitle` | The RAID array is ready. |
| `raidCreate.doneBody` | RAID <device></device> ({{level}}, about {{size}}) is synchronising its disks. Its files can be used now; it is fully protected when this ends. |
| `raidCreate.openArray` | Open RAID {{device}} |
| `raidCreate.addStorage` | Add storage on this array |

---

## 4. Add a disk: replace a missing one, keep a spare, or make the array bigger

**Question it answers:** I have a new disk; how do I get it into this array, and what will it do
there? **Leads to:** a rebuilding array, an array with a spare, or a bigger array.

Route `/storage/md/$array/add`, no menu item; reached from the array's "Add a disk" section and the
What to do now card. Breadcrumbs: "RAID" › "RAID {{device}}" › "Add a disk". A job runner like section 3.
It adds one disk at a time, except when making the array bigger (section 17, D14).

### 4.1 The section on the array's page

`h2` "Add a disk", with the sentence for the array as it is:

| The array is | Sentence | Button |
| --- | --- | --- |
| Degraded, nothing rebuilding | "Adding a disk replaces the missing one. The NAS then rebuilds onto it." | **"Add the new disk…"** |
| OK and idle, Mirror or RAID10 | "Adding a disk keeps it as a spare: it waits, and the NAS rebuilds onto it by itself when a disk fails. It does not add space." | "Add a spare…" |
| OK and idle, RAID5 or RAID6 | "Adding a disk can keep it as a spare, or make the array bigger." | "Add a disk…" |

Unavailable (`aria-disabled`, focusable), the reason in words beside the button:

| Blocker | Words |
| --- | --- |
| Stripe or Joined | "A {{level}} array cannot take more disks here." |
| Not running, failed, or Unknown | "It is not running, so no disk can be added." / 0.2's Unknown sentence |
| Rebuilding | "It is rebuilding onto {{disk}} now. Wait until this ends." |
| Synchronising, reshaping, or being checked | "It is busy now ({{what}}). Wait until this ends." |
| An action on this array is running in this session | "It is being changed now." |

### 4.2 Pre-flight and reads

As 3.1 (R1, then `getCandidates`, the disk-use inputs, `enumerateDevices`, `getDetail`, `getSlaves`).

### 4.3 Decisions

**A1. What the disk is for** (only for an OK, idle RAID5 or RAID6; otherwise fixed and said as text:
"The disk replaces the missing one." or "The disk is kept as a spare."). `RadioGroupField`, legend
"What the disk is for", no default (section 17, D15):

1. "Keep it as a spare". "It waits, and the NAS rebuilds onto it by itself when a disk fails. It adds no
   space. You can take it out again later."
2. "Make the array bigger". "Adds about {{added}} for each disk. Reshaping the array takes many hours,
   often a day or more for large disks, and cannot be undone. The file system on it is grown afterwards,
   on its page."

**A2. Which disk** (from 0.7's groups, with "Too small"): a `RadioGroupField` with groups (one disk) to
replace or keep as a spare; a `CheckboxListField` with groups (one or more) to make bigger. Each option
as in 3.2. When exactly one disk is offered, it is chosen. With none: `EmptyState variant="empty"`
"No disk can be added right now. Connect a disk at least {{size}} large, or free one that is in use."
with "Look for new disks" and the "Disks that cannot be used" list open.

Buttons: **"Continue"** (filled).

### 4.4 Summary and confirmation

`JobSummary` with `typedConfirmation`, title "Ready to add the disk" ("Ready to add the disks"):

- The erase or use-whole line of each chosen disk (as 3.3).
- Replace: "Add it to RAID {{array}} in place of the missing disk. The NAS then copies {{size}} onto it
  to rebuild the array. This takes hours on a large disk; the array can be used meanwhile, and it is
  protected again when this ends."
- Spare: "Add it to RAID {{array}} as a spare. It waits, and the NAS rebuilds onto it by itself when a
  disk fails."
- Bigger: "Add them to RAID {{array}} and reshape it to use them: it becomes about {{new}} (now
  {{size}}). Reshaping cannot be undone and takes many hours, often a day or more. Do not turn off the
  NAS until it ends. The array can be used meanwhile." and "Then grow the file system on it, on the
  file system's page, so it uses the new space." (when a file system is on it).
- When a member is **Failed**: "Then take the failed disk {{device}} ({{model}}, serial number
  {{serial}}) out of the array, so you can disconnect it." (4.5, its own step).
- "Then save the array's settings, which applies the changes for it. Nothing else is pending."

Typed confirmation: "Type {{devices}} to confirm." (the chosen disks' names). Button **"Erase disk and
add it"** ("Erase {{count}} disks and add them"; for an Empty disk the words are the same, as Flow A's
are), `destructive`. "Change choices" beside it.

Making the array bigger is irreversible and erases the new disks, and is confirmed by the same typed
gate; the summary's "cannot be undone" sentence is the difference (section 18, P5).

### 4.5 The steps

| # | Step label | Calls | Notes |
| --- | --- | --- | --- |
| 1 | "Check the disk and the array again" | `getCandidates`, the disk-use inputs, `enumerateDevices`, `getDetail` | The disks as 3.4 step 1. The array: the same `uuid`, level and `numdevices`, the same roles as summarised, and still not blocked (4.1). Otherwise the flow stops before anything is erased |
| 2 | "Erase {{device}}" (Erase and reuse only) | `DiskMgmt.wipe` quick, then `getCandidates` | As 3.4 |
| 3 | "Add {{device}} to the array" (bigger: "Add the disks and reshape the array") | `MdMgmt.add {devicefile, devices}` (replace, spare) or `MdMgmt.grow {devicefile, devices}` (bigger) | Synchronous, a few seconds; the rebuild or reshape then runs in the kernel **[verify]** |
| 4 | "Check that it was added" | `enumerateDevices`, `getDetail` | The disk is a member; its role is Rebuilding (replace), Spare (spare), or the state says reshaping (bigger) **[verify]** the role of a disk added to a degraded array in the first seconds |
| 5 | "Take the failed disk out of the array" (only with a Failed member) | `MdMgmt.remove {devicefile, devices: [failed member]}` | Safe: a failed disk holds no part of the working array. Its result line says the disk can now be disconnected, by serial number |
| 6 | **"Save the array's settings"** | R10: expected exactly `mdadm`, `initramfs`; then `Config.applyChangesBg` | The checkpoint |

### 4.6 Leaving the page, and the result

The run lives in memory, as section 3's. The rebuild or reshape runs in the kernel and is shown on the
array's page whatever the browser does; it continues when the reader signs out. The result
(`JobResult` succeeded, polite):

| Purpose | Title | Body |
| --- | --- | --- |
| Replace | "Rebuilding has started." | "The NAS is copying everything onto {{device}}. Follow it on the array's page; it takes hours on a large disk. You can leave this page or sign out." With a failed disk taken out: "You can now disconnect {{failed}} ({{model}}, serial number {{serial}})." |
| Spare | "{{device}} is now a spare of RAID {{array}}." | "It takes over by itself when a disk fails." |
| Bigger | "Reshaping has started." | "RAID {{array}} becomes about {{new}} when it ends, which can take a day or more. Do not turn off the NAS until then. Afterwards, grow the file system on it so it uses the new space." with router link "Open RAID {{array}}" (whose Used by panel carries the grow link, 2.6) |

### 4.7 Failures

| Fails at | The system is left | The reader sees | Offered |
| --- | --- | --- | --- |
| 1 | unchanged | As 3.7 step 1; for the array: "RAID {{array}} changed since you chose the disk. Nothing was erased." | "Change choices" (the form, re-read) |
| 2 | as 3.7 step 2 | as 3.7 | as 3.7 |
| 3, add (replace, spare) | the disk erased (reuse) and not added | "{{device}} was not added to RAID {{array}}." + message (for example the server's words when the disk is too small) | "Try this step again"; "Stop here" (the disk then shows as empty) |
| 3, bigger, nothing added | as above | as above | as above |
| 3, bigger, added but not reshaped (the server adds first, then reshapes **[verify]**) | the disk is a spare of the array | "{{device}} was added as a spare, but the array was not made bigger." + message | "Stop here", with "The disk stays as a spare. To use it otherwise, take it out on the array's page." No retry: the server would add it again first, and fail |
| 4, not as expected | unknown | "The NAS did not report the disk in the array as expected." | "Check again"; "Stop here", with the router link to the array's page |
| 5, take out | the new disk added; the failed one still listed | "The new disk was added, but taking out the failed disk failed." + message | "Try this step again"; "Continue" (to the checkpoint: the failed disk can be taken out later on the array's page) |
| 6 | as 3.7's checkpoint | as 3.7 | as 3.7 |

### 4.8 Copy

| Key | English |
| --- | --- |
| `raidAdd.section` | Add a disk |
| `raidAdd.sec.replace` | Adding a disk replaces the missing one. The NAS then rebuilds onto it. |
| `raidAdd.sec.spare` | Adding a disk keeps it as a spare: it waits, and the NAS rebuilds onto it by itself when a disk fails. It does not add space. |
| `raidAdd.sec.either` | Adding a disk can keep it as a spare, or make the array bigger. |
| `raidAdd.openReplace` | Add the new disk… |
| `raidAdd.openSpare` | Add a spare… |
| `raidAdd.open` | Add a disk… |
| `raidAdd.blocked.level` | A {{level}} array cannot take more disks here. |
| `raidAdd.blocked.notRunning` | It is not running, so no disk can be added. |
| `raidAdd.blocked.rebuilding` | It is rebuilding onto <disk></disk> now. Wait until this ends. |
| `raidAdd.blocked.busy` | It is busy now ({{what}}). Wait until this ends. |
| `raidAdd.blocked.changing` | It is being changed now. |
| `raidAdd.busy.resync` | synchronising its disks |
| `raidAdd.busy.reshape` | reshaping |
| `raidAdd.busy.check` | being checked |
| `raidAdd.breadcrumb` | Add a disk |
| `raidAdd.title` | Add a disk to RAID {{device}} |
| `raidAdd.documentTitle` | Add a disk – RAID {{device}} – RAID |
| `raidAdd.fixed.replace` | The disk replaces the missing one. |
| `raidAdd.fixed.spare` | The disk is kept as a spare. |
| `raidAdd.purpose` | What the disk is for |
| `raidAdd.purpose.spare` | Keep it as a spare |
| `raidAdd.purpose.spareHint` | It waits, and the NAS rebuilds onto it by itself when a disk fails. It adds no space. You can take it out again later. |
| `raidAdd.purpose.bigger` | Make the array bigger |
| `raidAdd.purpose.biggerHint` | Adds about {{added}} for each disk. Reshaping the array takes many hours, often a day or more for large disks, and cannot be undone. The file system on it is grown afterwards, on its page. |
| `raidAdd.disk` | Disk |
| `raidAdd.disks` | Disks to add |
| `raidAdd.cannot.small` | It is smaller than the array's disks ({{size}}). A disk added to an array must be at least as large as the smallest one. |
| `raidAdd.none` | No disk can be added right now. Connect a disk at least {{size}} large, or free one that is in use. |
| `raidAdd.summaryTitle_one` / `_other` | Ready to add the disk / Ready to add the disks |
| `raidAdd.sum.replace` | Add it to RAID {{array}} in place of the missing disk. The NAS then copies {{size}} onto it to rebuild the array. This takes hours on a large disk; the array can be used meanwhile, and it is protected again when this ends. |
| `raidAdd.sum.spare` | Add it to RAID {{array}} as a spare. It waits, and the NAS rebuilds onto it by itself when a disk fails. |
| `raidAdd.sum.bigger` | Add them to RAID {{array}} and reshape it to use them: it becomes about {{new}} (now {{size}}). Reshaping cannot be undone and takes many hours, often a day or more. Do not turn off the NAS until it ends. The array can be used meanwhile. |
| `raidAdd.sum.growFs` | Then grow the file system on it, on the file system's page, so it uses the new space. |
| `raidAdd.sum.takeOutFailed` | Then take the failed disk <device></device> ({{model}}, serial number <serial></serial>) out of the array, so you can disconnect it. |
| `raidAdd.sum.save` | Then save the array's settings, which applies the changes for it. Nothing else is pending. |
| `raidAdd.confirm_one` / `_other` | Erase disk and add it / Erase {{count}} disks and add them |
| `raidAdd.step.check` | Check the disk and the array again |
| `raidAdd.step.add` | Add {{device}} to the array |
| `raidAdd.step.grow` | Add the disks and reshape the array |
| `raidAdd.step.verify` | Check that it was added |
| `raidAdd.step.takeOut` | Take the failed disk out of the array |
| `raidAdd.step.save` | Save the array's settings |
| `raidAdd.fail.arrayChanged` | RAID {{array}} changed since you chose the disk. Nothing was erased. |
| `raidAdd.fail.add` | {{device}} was not added to RAID {{array}}. |
| `raidAdd.fail.spareOnly` | {{device}} was added as a spare, but the array was not made bigger. |
| `raidAdd.fail.spareStays` | The disk stays as a spare. To use it otherwise, take it out on the array's page. |
| `raidAdd.fail.notReported` | The NAS did not report the disk in the array as expected. |
| `raidAdd.fail.takeOut` | The new disk was added, but taking out the failed disk failed. |
| `raidAdd.done.replaceTitle` | Rebuilding has started. |
| `raidAdd.done.replaceBody` | The NAS is copying everything onto <device></device>. Follow it on the array's page; it takes hours on a large disk. You can leave this page or sign out. |
| `raidAdd.done.disconnect` | You can now disconnect <device></device> ({{model}}, serial number <serial></serial>). |
| `raidAdd.done.spareTitle` | {{device}} is now a spare of RAID {{array}}. |
| `raidAdd.done.spareBody` | It takes over by itself when a disk fails. |
| `raidAdd.done.biggerTitle` | Reshaping has started. |
| `raidAdd.done.biggerBody` | RAID {{array}} becomes about {{new}} when it ends, which can take a day or more. Do not turn off the NAS until then. Afterwards, grow the file system on it so it uses the new space. |

---

## 5. Take a disk out of an array

**Question it answers:** can I take this disk out, and what does the array lose? **Leads to:** an
array without that disk, and a disk that can be disconnected or reused.

`MdMgmt.remove {devicefile, devices: [one member]}`: the server marks the disk failed, then takes it
out. It is synchronous and quick. It does not erase the disk: the disk keeps the array's marks (read
from source). It marks `mdadm` and `initramfs` pending (0.8).

### 5.1 When it is offered (the Take out button on a member's row, 2.5)

| Member's role | Offered? | Confirmation |
| --- | --- | --- |
| **Failed** | Yes, at any time the array is running | Plain (5.3): nothing is lost |
| **Spare** | Yes, unless it has started rebuilding | Plain: nothing is lost; the array has no spare afterwards |
| **Rebuilding** | No: "It is being rebuilt now. Wait until this ends." | |
| **Working** | Only when the array is OK and idle (not degraded, nothing synchronising, reshaping or being checked), the level keeps copies (Mirror, RAID5, RAID6, RAID10), and the roles are known | Destructive, typed (5.4; section 18, P6) |
| Any, in a Stripe or Joined array | No: "A {{level}} array keeps no spare copy, so taking out a disk would destroy it." | |
| Any, roles not known, array not running or Unknown | No: 0.3's or 0.2's sentence | |

Blocked Working disks say why, once, under the table: "The array is already missing a disk. Taking out
another would leave it without protection, or destroy it." / "It is busy now ({{what}}). Wait until
this ends." One disk at a time (section 17, D14).

### 5.2 The check before the dialog

Pressing "Take out…" re-reads `enumerateDevices` and `getDetail`. The dialog opens at once with
"Checking…" (`aria-busy`, Cancel available), then shows a refusal that appeared since the page was read
(title "This disk cannot be taken out now", the reason, Close), "This array changed" (different
`uuid`), or the confirmation.

### 5.3 A failed or spare disk: plain confirmation

`ConfirmDialog` default variant, focus on Cancel:

1. Title: "Take {{device}} out of RAID {{array}}?"
2. The disk, named: model, serial number, size; its role.
3. Failed: "It has failed and holds no part of the working array, so nothing is lost. Afterwards you
   can disconnect it." Spare: "The array then has no spare. Nothing is lost."
4. "The disk is not erased: it keeps the array's marks. Wipe it before you use it for something
   else."
5. Buttons: "Cancel" (focused) and **"Take out"** (filled).

### 5.4 A working disk: destructive, typed

`ConfirmDialog variant="destructive"`: warning-shape icon, the red confirm button, focus on Cancel, no
form so Enter does not confirm, Escape and Cancel close it, the scrim does not.

1. Title: "Take working disk {{device}} out of RAID {{array}}?"
2. The disk, named exactly: model, serial number, size with the label size, "Working".
3. The consequence, one sentence: "The array then runs without that disk and loses protection:
   {{protection}}" where `{{protection}}` is 0.4's sentence for the array with one disk fewer ("It
   cannot lose another disk." for a two-disk mirror or RAID5).
4. "No file is lost now. If another disk fails before a new one is added and rebuilt, {{loss}}" (for
   no protection left: "everything on the array is lost."; for RAID6: "it can still lose one more.")
5. "To replace a disk that still works, add the new disk as a spare first; then take this one out, and
   the NAS rebuilds onto the spare at once." with the router link "Add a spare instead" (to section 4),
   when the array has no spare.
6. "The disk is not erased: it keeps the array's marks."
7. Type to confirm: "Type {{device}} to confirm." (the disk's device name).
8. Buttons: "Cancel" (focused) and **"Take disk out"** (`destructive`), unavailable until the name
   matches.

### 5.5 On confirm

Both dialogs re-check once more (the button shows "Checking again…": the same two reads), then call
`MdMgmt.remove` with the array's `devicefile` and the member's device as the report names it. The
dialog shows "Taking {{device}} out…" while the call runs (Cancel unavailable), then closes; the section
shows the result, and the array's page reads again.

| Result | Shown in the Disks section (stays until dismissed) |
| --- | --- |
| Taken out | `JobResult` succeeded: "{{device}} was taken out of RAID {{array}}." then "You can now disconnect it (serial number {{serial}}). It still carries the array's marks: wipe it before you use it for something else." with router link "Open disk {{device}}" (its wipe section), and "Apply the pending changes so the NAS remembers the array without it when it next starts." The array's state then reads as 0.2 (degraded, for a working disk) |
| Failed | `JobFailure`: "{{device}} was not taken out." + server message; "Try again…" reopens the dialog |
| The request was cut | `InlineAlert` (Unknown treatment): "Could not tell whether the disk was taken out." and Refresh |

**Undo.** A disk taken out can be added again with section 4. It is then erased first (0.7: the
plugin does not offer a disk that carries marks), so the array rebuilds onto it in full. The result
says so only for a working disk: "To undo this, add the disk again; the array then rebuilds onto it."

**Leaving the page.** The call is short and synchronous; leaving during it does not stop it, and the
next read of the page shows the outcome.

### 5.6 Copy

| Key | English |
| --- | --- |
| `raidRemove.blocked.rebuilding` | It is being rebuilt now. Wait until this ends. |
| `raidRemove.blocked.level` | A {{level}} array keeps no spare copy, so taking out a disk would destroy it. |
| `raidRemove.blocked.degraded` | The array is already missing a disk. Taking out another would leave it without protection, or destroy it. |
| `raidRemove.blocked.busy` | It is busy now ({{what}}). Wait until this ends. |
| `raidRemove.checking` | Checking… |
| `raidRemove.refusedTitle` | This disk cannot be taken out now |
| `raidRemove.changed` | This array changed. |
| `raidRemove.plainTitle` | Take {{device}} out of RAID {{array}}? |
| `raidRemove.failedBody` | It has failed and holds no part of the working array, so nothing is lost. Afterwards you can disconnect it. |
| `raidRemove.spareBody` | The array then has no spare. Nothing is lost. |
| `raidRemove.notErased` | The disk is not erased: it keeps the array's marks. Wipe it before you use it for something else. |
| `raidRemove.confirmPlain` | Take out |
| `raidRemove.workingTitle` | Take working disk {{device}} out of RAID {{array}}? |
| `raidRemove.consequence` | The array then runs without that disk and loses protection: {{protection}} |
| `raidRemove.ifAnother` | No file is lost now. If another disk fails before a new one is added and rebuilt, {{loss}} |
| `raidRemove.loss.all` | everything on the array is lost. |
| `raidRemove.loss.oneMore` | it can still lose one more. |
| `raidRemove.spareFirst` | To replace a disk that still works, add the new disk as a spare first; then take this one out, and the NAS rebuilds onto the spare at once. |
| `raidRemove.spareFirstLink` | Add a spare instead |
| `raidRemove.notErasedShort` | The disk is not erased: it keeps the array's marks. |
| `raidRemove.typePrompt` | Type {{device}} to confirm. |
| `raidRemove.typeHint` | The button is available once the name matches. |
| `raidRemove.confirmWorking` | Take disk out |
| `raidRemove.cancel` | Cancel |
| `raidRemove.checkingAgain` | Checking again… |
| `raidRemove.running` | Taking {{device}} out… |
| `raidRemove.doneTitle` | {{device}} was taken out of RAID {{array}}. |
| `raidRemove.doneBody` | You can now disconnect it (serial number <serial></serial>). It still carries the array's marks: wipe it before you use it for something else. |
| `raidRemove.doneApply` | Apply the pending changes so the NAS remembers the array without it when it next starts. |
| `raidRemove.undo` | To undo this, add the disk again; the array then rebuilds onto it. |
| `raidRemove.openDisk` | Open disk {{device}} |
| `raidRemove.failedTitle` | {{device}} was not taken out. |
| `raidRemove.again` | Try again… |
| `raidRemove.unknown` | Could not tell whether the disk was taken out. |

---

## 6. Check an array

**Question it answers:** do my array's copies still agree? **Leads to:** a running check, and its
finding in the system log.

`MdMgmt.setSyncAction {devicefile, action}`: `check` starts the kernel's check, `idle` stops it. It
writes nothing to the disks' data, reads every disk of the array for hours, and marks nothing pending.
OMV turns off the system's own scheduled checks (read from the plugin's install script) **[verify]** on
the VM that no scheduled check remains, so this is the only way to run one.

### 6.1 The section

`h2` "Check this array", for Mirror, RAID5, RAID6 and RAID10:

- "A check reads every disk of the array and compares the copies, to find damage before a disk is
  needed for a rebuild. It changes nothing. Run it every month or so. It takes about as long as reading
  one whole disk, often many hours, and the NAS is slower meanwhile. It wakes the disks."
- Idle and OK: button **"Check now…"** (neutral).
- Being checked (or repaired): the state line's words, and **"Stop checking…"** (neutral).
- Otherwise unavailable, with the reason: "It is busy now ({{what}}). Wait until this ends." / "A
  degraded array cannot be checked. Replace its missing disk first." / 0.2's Unknown sentence.
- When this session ran a check that has ended: "The check ended at {{time}}. Any differences it found
  are written to the system log." with router link "Open System logs" → `/diagnostics/system-logs`
  **[verify]** the log line mdadm writes and that it states the number of differences.

Repair is not offered (section 18, P8).

### 6.2 The confirmations

Both plain (`ConfirmDialog` default variant, focus on Cancel):

- "Check RAID {{array}}?" — "The NAS reads every disk of the array and compares the copies. Nothing is
  changed. It takes many hours for large disks, and the NAS is slower meanwhile. The disks are woken and
  kept busy until it ends. You can leave this page or sign out; the check goes on on the NAS." Buttons
  "Cancel", **"Start checking"**.
- "Stop checking RAID {{array}}?" — "The check stops where it is. Nothing is changed. You can start it
  again later, from the beginning." Buttons "Keep checking", **"Stop checking"**.

On confirm: re-read `enumerateDevices` (still idle, or still checking), then the call; the state line
shows "Being checked" after the next read, and the poll of 0.5 starts. Failed: `FormAlert` critical in
the dialog "The check did not start." (or "…did not stop.") + message.

### 6.3 Copy

| Key | English |
| --- | --- |
| `raidCheck.title` | Check this array |
| `raidCheck.intro` | A check reads every disk of the array and compares the copies, to find damage before a disk is needed for a rebuild. It changes nothing. Run it every month or so. It takes about as long as reading one whole disk, often many hours, and the NAS is slower meanwhile. It wakes the disks. |
| `raidCheck.open` | Check now… |
| `raidCheck.stopOpen` | Stop checking… |
| `raidCheck.blocked.busy` | It is busy now ({{what}}). Wait until this ends. |
| `raidCheck.blocked.degraded` | A degraded array cannot be checked. Replace its missing disk first. |
| `raidCheck.ended` | The check ended at {{time}}. Any differences it found are written to the system log. |
| `raidCheck.logsLink` | Open System logs |
| `raidCheck.dialogTitle` | Check RAID {{array}}? |
| `raidCheck.dialogBody` | The NAS reads every disk of the array and compares the copies. Nothing is changed. It takes many hours for large disks, and the NAS is slower meanwhile. The disks are woken and kept busy until it ends. You can leave this page or sign out; the check goes on on the NAS. |
| `raidCheck.confirm` | Start checking |
| `raidCheck.stopTitle` | Stop checking RAID {{array}}? |
| `raidCheck.stopBody` | The check stops where it is. Nothing is changed. You can start it again later, from the beginning. |
| `raidCheck.keep` | Keep checking |
| `raidCheck.stopConfirm` | Stop checking |
| `raidCheck.startFailed` | The check did not start. |
| `raidCheck.stopFailed` | The check did not stop. |

---

## 7. Delete an array

**Question it answers:** can I break up this array, and what exactly will I lose? **Leads to:** its
disks free for other use.

`MdMgmt.delete {devicefile}`: the server stops the array and erases the array's marks on every member
disk (read from source). **Everything on the array is lost**: its file systems and files cannot be
read again. Synchronous and quick. It marks `mdadm` and `initramfs` pending (0.8). The server does not
look at what is on the array; this interface does (0.9).

### 7.1 The section

`h2` "Delete this array", last, after a divider:

- "Deleting breaks up the array. Its disks are freed for other use, and everything stored on the array
  is lost."
- Button **"Delete array…"** (neutral; the destructive form is on the dialog's confirm button).

Unavailable (`aria-disabled`, focusable), the blocker in words beside the button, each with what to do:

| Blocker (0.11) | Words | What to do |
| --- | --- | --- |
| A file system on it is mounted, used, or set up (including a mount saved but not applied) | "It holds the file system {{name}}, which is set up on this NAS." | "Unmount it, or remove it from the NAS, on its page first." Router link "Open file system {{name}}" (whose own refusals apply there) |
| A file system is being created on it | "A file system is being created on it now." | none |
| Other storage uses it (`_used`, no file system found) | "Other storage is built on it, such as LVM." | none here; the footer's classic link stays for what this page does not show |
| A read failed | "Could not check what this array holds, so it cannot be deleted now." + message | "Try again" |
| An action on this array is running in this session | "It is being changed now." | none |
| State Unknown | 0.2's sentence | none |

Several blockers: each on its own line. No classic link is offered to get round a refusal.

A synchronising, rebuilding or not-running array can be deleted (nothing is stored on a new array
while it synchronises; a broken one may need to go so its disks can be reused) **[verify]** on the VM
what the server does for an array that is not running.

### 7.2 The check before the dialog

Pressing "Delete array…" re-reads `enumerateDevices`, `FileSystemMgmt.getList`, `enumerateFilesystems`
and `DiskMgmt.getList`. The dialog opens with "Checking what is on this array…", then shows a refusal,
"This array changed" (different `uuid`), "This array no longer exists.", or the confirmation.

### 7.3 The confirmation

`ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm:

1. Title: "Delete RAID {{array}}?"
2. The array, named: level, size, and **its disks**, each with device, model, serial number and size
   with the label size.
3. The consequence, one sentence: "Everything stored on this array is lost, and the array cannot be put
   back together. This cannot be undone."
4. "On this array now" (`h3`), a list: each file system not used on this NAS ("The file system {{name}}
   ({{type}}, {{size}}). It is not used on this NAS. Its files are lost."); with nothing found: "No file
   system was found on it. Anything else on it is lost too."; and always last: "Its disks are not
   wiped: the files on them cannot be read without the array, but are not overwritten either. Wipe a
   disk before you give it away."
5. Type to confirm: "Type {{array}} to confirm." (the array's device name, `/dev/md0`).
6. Buttons: "Cancel" (focused) and **"Delete array"** (`destructive`), unavailable until the name
   matches.

### 7.4 On confirm, and after

The button shows "Checking again…" and the four reads run once more; a blocker or a change switches
the dialog to the refusal. Otherwise `MdMgmt.delete` with the fresh row's `devicefile`; the dialog shows
"Deleting RAID {{array}}…" (Cancel unavailable).

| Result | Shown |
| --- | --- |
| Deleted | The array's page shows, in place of its content, `JobResult` succeeded: "RAID {{array}} was deleted." then "Its disks are free: {{list}}. Apply the pending changes so the NAS forgets the array when it next starts." with router links "Go to RAID" and, for each disk, "Open disk {{device}}". On the Disks page those disks then show "No file system found" |
| Failed | The dialog stays: "RAID {{array}} was not deleted." + server message (for example when something still uses it). "If the array was stopped but not deleted, it shows as not running after a refresh." **[verify]** whether a failure can leave the array stopped |
| The request was cut | "Could not tell whether the array was deleted." and Refresh |

There is no undo. Leaving the page during the call does not stop it.

### 7.5 Keyboard and screen readers

Focus on Cancel; Tab order Cancel, the typed field, Delete array (unavailable but focusable); the
consequence is the dialog's description, read with the title; the typed field's label is the prompt and
its hint is linked. "Deleting RAID {{array}}…" is announced politely; the result politely, a failure
assertively.

### 7.6 Copy

| Key | English |
| --- | --- |
| `raidDelete.title` | Delete this array |
| `raidDelete.intro` | Deleting breaks up the array. Its disks are freed for other use, and everything stored on the array is lost. |
| `raidDelete.open` | Delete array… |
| `raidDelete.blocked.fs` | It holds the file system {{name}}, which is set up on this NAS. |
| `raidDelete.blocked.fsDo` | Unmount it, or remove it from the NAS, on its page first. |
| `raidDelete.blocked.fsLink` | Open file system {{name}} |
| `raidDelete.blocked.creating` | A file system is being created on it now. |
| `raidDelete.blocked.other` | Other storage is built on it, such as LVM. |
| `raidDelete.blocked.unread` | Could not check what this array holds, so it cannot be deleted now. |
| `raidDelete.blocked.changing` | It is being changed now. |
| `raidDelete.checking` | Checking what is on this array… |
| `raidDelete.refusedTitle` | This array cannot be deleted now |
| `raidDelete.gone` | This array no longer exists. |
| `raidDelete.dialogTitle` | Delete RAID {{array}}? |
| `raidDelete.consequence` | Everything stored on this array is lost, and the array cannot be put back together. This cannot be undone. |
| `raidDelete.onItTitle` | On this array now |
| `raidDelete.onIt.fs` | The file system {{name}} ({{type}}, {{size}}). It is not used on this NAS. Its files are lost. |
| `raidDelete.onIt.nothing` | No file system was found on it. Anything else on it is lost too. |
| `raidDelete.onIt.disks` | Its disks are not wiped: the files on them cannot be read without the array, but are not overwritten either. Wipe a disk before you give it away. |
| `raidDelete.typePrompt` | Type {{array}} to confirm. |
| `raidDelete.typeHint` | The button is available once the name matches. |
| `raidDelete.confirm` | Delete array |
| `raidDelete.checkingAgain` | Checking again… |
| `raidDelete.running` | Deleting RAID {{array}}… |
| `raidDelete.doneTitle` | RAID {{array}} was deleted. |
| `raidDelete.doneBody` | Its disks are free: {{list}}. Apply the pending changes so the NAS forgets the array when it next starts. |
| `raidDelete.toList` | Go to RAID |
| `raidDelete.failedTitle` | RAID {{array}} was not deleted. |
| `raidDelete.maybeStopped` | If the array was stopped but not deleted, it shows as not running after a refresh. |
| `raidDelete.unknown` | Could not tell whether the array was deleted. |

---

## 8. Flow F: "Replace a failing disk" (J8a), end to end

The UX audit's Flow F (4.7) for the RAID plugin, in two parts with a physical pause between them. A
single flow is impossible: the swap is physical, and turning off the NAS ends the session. This slice
builds it from the pieces above; this section shows the journey and what carries the reader across
the pause.

### 8.1 How the reader learns of it

- The dashboard's attention row (9.1): "RAID /dev/md0 is missing a disk…" with "Open RAID /dev/md0".
- The email, when email notifications are set up (1.5).
- The RAID list's roll-up, and the Disks list ("Part of RAID /dev/md0" beside the disk, and its health
  when checked).

### 8.2 The journey

| # | Where | What the reader does | Calls |
| --- | --- | --- | --- |
| 1 | The array's page, What to do now (2.4) | Reads which disk failed (device, model, serial number) or which disks remain | reads only |
| 2a | With a free place for a disk: connect the new disk, then "Look for new disks" | | `DiskMgmt.rescan` |
| 2b | Without: "Take the failed disk out…" (5.3, plain), then turn off the NAS (the classic interface's power menu; this interface has none yet), swap the disks, turn it on, sign in, open the array | | `MdMgmt.remove` |
| 3 | "Add the new disk…" (section 4): the replacement is preselected when it is the only disk offered; typed confirmation; steps; when a failed disk is still listed, it is taken out in the same run | | `getCandidates`, `DiskMgmt.wipe` (reuse), `MdMgmt.add`, `MdMgmt.remove` (failed), apply |
| 4 | The array's page shows Rebuilding with its progress, polled (0.5); the reader may leave | | `enumerateDevices`, `getDetail` |
| 5 | When rebuilding ends, the state is OK; the dashboard row is gone at the next visit | | |

**Replacing a disk that still works** (the health check warns, 2.4): add the new disk as a spare
(section 4), then take the failing disk out (5.4, typed); the kernel rebuilds onto the spare at once.

| | Stock (J8a) | Here |
| --- | --- | --- |
| Pages | 3, plus the Disks page to wipe | 1 (the array's page) and the add flow |
| Disk named by | device file; model and serial only on the Disks page | device, model and serial number everywhere it is chosen or removed |
| Confirmations | 3 to 5 dialogs | 1 typed confirmation for the new disk; a plain one for taking out a failed disk |
| Rebuild visible | the list's state text, reloaded every 10 seconds | a progress bar with time left, polled only while it rebuilds |

### 8.3 The pause

Nothing is held in the browser across the pause: after the restart, the array's page reads the array
again and What to do now shows the "missing disk" case. The disk taken out is identified by its serial
number in step 2b's result, so the reader pulls the right one; a NAS whose disks are not labelled can
use the serial number printed on each disk.

---

## 9. How RAID fits Flow A, the dashboard and the other storage pages

### 9.1 Dashboard

| Where | Becomes |
| --- | --- |
| Attention rows | With the plugin installed, `enumerateDevices` is read with the dashboard's other storage reads, once per visit and on "Try again" (never polled). A row per array whose state (0.2) is Critical or Unknown: "RAID {{array}} is missing a disk. If one more fails, its files are lost." (degraded), "RAID {{array}} is rebuilding: {{progress}}. It cannot lose another disk until this ends." (rebuilding, as read), "RAID {{array}} is not running. Its files cannot be reached." (not running, failed), "Could not read the state of RAID {{array}}." (Unknown). Each with router link "Open RAID {{array}}". No row for Warning (synchronising, reshaping) or OK |
| Plugin not installed, or the read failed | No RAID row. A failed read adds nothing (the dashboard's rule: a card or row that could not be read says so only where it lives; the RAID page shows the error) |

### 9.2 Disks and file systems

| Where | Was | Becomes |
| --- | --- | --- |
| Disks list and a disk's page, "Used for": "Part of RAID {{array}}" | the array's name as text | A router link to the array's page; with the array's role for this disk when the page has read it ("Spare in RAID …", "Failed disk in RAID …") |
| A disk's page, wipe blocker for a RAID member | "Remove it from the array under RAID management first." + `ExternalLink` "RAID management in the classic interface" | "Take it out of the array, or delete the array, on the array's page first." + router link "Open RAID {{array}}" (where section 5's and 7's own refusals apply) |
| File systems list and a file system's page, "On": "RAID /dev/md0" | text | A router link to the array's page |
| A file system on an array, its page's grow section | unchanged | unchanged; the array's page links to it after the array was made bigger (2.6) |

Catalogue changes: `disks.use.raid` keeps its English, its `<array>` becomes a link; new
`disks.use.raidSpare` "Spare in RAID <array></array>", `disks.use.raidFailed` "Failed disk in RAID
<array></array>"; `wipe.blocked.raidDo` becomes "Take it out of the array, or delete the array, on the
array's page first."; `wipe.raidLink` becomes "Open RAID {{array}}".

### 9.3 Flow A

Flow A already offers an empty array under "RAID arrays" (the file-systems slice's 6.3). This slice
changes:

- **The option's words** use 0.1's level word and the state: "RAID /dev/md0 (Mirror (RAID1), 2 disks),
  7.9 GiB", and, while it synchronises, a second line "Still synchronising its disks; that goes on while
  the file system is created." (`addStorage.raidSyncing`). Today the raw `level` is passed; it becomes
  `raidLevel.*`.
- **Which arrays are offered** is stricter: an array whose state is Critical or Unknown (degraded, not
  running, failed) is not offered; it is listed under "Cannot be used" with "RAID {{array}} is missing a
  disk. Replace it first, on the array's page." (or 0.2's reason) and a router link to the array.
  Synchronising and reshaping arrays are offered (section 17, D16).
- **The combine hint** under the disk choice becomes, with the plugin installed: "To combine several
  disks, use Combine disks (BTRFS), or create a RAID array under RAID. RAID makes the disks act as one
  disk, with any file system on it." with both router links.
- **"Add storage on this array"** (the array's page, 1.6, 3.6) opens Flow A with the array chosen,
  passed **in memory** (the session store), never in the address, as the disk's page does (the
  file-systems slice's 9, D17). The flow still re-reads and re-checks, and the typed confirmation of
  `/dev/md0` stays: the array may hold something by then.

Creating an array with "Use it for files" (section 3) runs Flow A's steps 3 to 7 itself, so the common
case needs one flow and one typed confirmation, not two.

---

## 10. A normal user

Every method in this slice refuses a normal user ("Invalid context role."). So:

- The RAID item stays out of a normal user's menu, and the shell makes no RAID read for one.
- A normal user who types `/storage/md`, an array's address or a flow's address gets the existing
  "only administrators" page, and the route makes no call first (UI-4).
- The dashboard for a normal user is unchanged.

---

## 11. Navigation and routes

| Item | Route | Roles | Replaces |
| --- | --- | --- | --- |
| Storage > RAID (only with the plugin) | `/storage/md` | admin | the stock "Multiple Device" list |
| (no menu item) | `/storage/md/$array` | admin | the stock details page, the Remove, Maintenance and Delete actions |
| (no menu item) | `/storage/md/create` | admin | the stock create page |
| (no menu item) | `/storage/md/$array/add` | admin | the stock Recover and Grow pages |

- **The menu item.** `NAV_PAGES` gains Storage > RAID (`item: "md"`, the classic segment;
  `labelKey: "nav.items.storage.md"` "RAID"; `classic: "/#/storage/md"`), placed where the stock menu
  places it: after Disk health (S.M.A.R.T.) and before File systems (stock positions 20, 30, 40). It is
  the first entry with a condition: it is shown only when the shell's `enumerateDevices` read, made once
  after an administrator signs in, did not answer 404 (0.10). That read is the same query the storage
  pages use, so they find it warm; it does not touch the disks (0.5) **[verify]**.
- Static file routes, more specific than `$group/$item`, as before. `BuiltRoute` gains `/storage/md`;
  `isCurrent` treats `/storage/md/…` as the RAID item's.
- `create` is a static segment matched before `$array`, and does not pass 0.6's pattern; `$array` is
  validated in `params.parse`, and a failing value renders the not-found state with no call.
- Route-level code splitting: each page is its own chunk.
- Document titles: "RAID – openmediavault", "RAID /dev/md0 – RAID – openmediavault", "Create array – RAID
  – openmediavault", "Add a disk – RAID /dev/md0 – RAID – openmediavault".

---

## 12. Every request in this slice

**Contract status:** *Exists* (already in the contract), or *New, cleared* (in the set the owner
cleared on 2026-11-21: `MdMgmt.*`). Request schemas are stricter than the plugin's datamodels where this
interface sends less, which the contract rules allow.

| Method | Where | When | Kind | Contract status and notes |
| --- | --- | --- | --- | --- |
| `MdMgmt.enumerateDevices` | shell (menu), every RAID page, dashboard, disks and file-systems pages | sign-in, open, Refresh, after an action, the poll (0.5), the re-checks | foreground; background in the poll | Exists. Its examples gain captures from the VM: a mirror synchronising, degraded, rebuilding, with a spare, a RAID5 not running; `name` and `description` scrubbed of the host name |
| `MdMgmt.getDetail` | an array's page, the add flow, the remove dialog | open, poll, checks | foreground; background in the poll | **New, cleared.** Read-only. Plain string. Captures scrubbed: the host name (on the "Name" line and anywhere else), the array's UUID, dates kept as documentation values |
| `MdMgmt.getSlaves` | an array's page, the add flow | open | foreground | **New, cleared.** Read-only. `{devicefile, size, vendor, serialnumber, description}[]`; `serialnumber` scrubbed; `size` a byte string **[verify]**; `description` server English, not shown |
| `MdMgmt.getCandidates` | create and add flows | open, step 1, after an erase | foreground | **New, cleared.** Read-only; may read the disks (in the description) |
| `MdMgmt.create` | create flow | after the typed confirmation and the re-check | foreground, short | **New, cleared.** `x-omv-destructive: data`, `x-omv-dirty: [mdadm, initramfs]`. Request: `devices` at least 2 device files (the contract's device-file pattern); `level` an enum `mirror`, `raid5`, `raid6`, `raid10` (stricter: no `stripe`); `name` required and limited to the empty string (section 17, D3). Reply: the plugin's change record `{name, devicefile, level, numdevices, devices}` |
| `MdMgmt.add` | add flow (replace, spare; the failed disk's removal is `remove`) | after the typed confirmation | foreground, short | **New, cleared.** `x-omv-destructive: data` (the added disk is overwritten), `x-omv-dirty: [mdadm, initramfs]`. `devicefile` an array (`^/dev/md[0-9]{1,3}$`); `devices` exactly one device file (stricter: one at a time). The description says a disk added to a degraded array starts a rebuild, and to a healthy one becomes a spare |
| `MdMgmt.grow` | add flow (bigger) | after the typed confirmation | foreground, short | **New, cleared.** `x-omv-destructive: data`; irreversible, said in the description; `x-omv-dirty: [mdadm, initramfs]`. `devices` one or more. The description says the reshape runs for hours after the call returns, and that the server adds the disks before it reshapes |
| `MdMgmt.remove` | the remove dialogs, add flow step 5 | after the confirmation | foreground, short | **New, cleared.** `x-omv-destructive: service` (it reduces protection; nothing is erased), `x-omv-dirty: [mdadm, initramfs]`. `devices` exactly one. The description says the disk keeps the array's marks |
| `MdMgmt.delete` | the delete dialog | after the typed confirmation | foreground, short | **New, cleared.** `x-omv-destructive: data`, `x-omv-dirty: [mdadm, initramfs]`. `devicefile` an array. The description says the server checks nothing about what is stored on it |
| `MdMgmt.setSyncAction` | the check section | after the confirmation | foreground | **New, cleared.** Not read-only; no dirty module. `action` an enum `check`, `idle` (stricter: no `repair`, section 18, P8). Returns `null` |
| `DiskMgmt.getList`, `DiskMgmt.rescan`, `DiskMgmt.wipe` | flows, pages | as in the earlier slices | | Exist |
| `FileSystemMgmt.getList`, `enumerateFilesystems`, `getCandidatesBg`, `create`, `getMountCandidates`, `setMountPoint` | pages, create flow's file-system stage | as Flow A | | Exist |
| `FsTab.getByFsName` | create flow's last step | | | Exists |
| `EmailNotification.get` | RAID list | open | foreground | Exists; password omitted |
| `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*`, `System.getInformation` | checkpoints, the band | as now | | Exist |

Not used, and kept out of the contract: `MdMgmt.getList` (the paged form of `enumerateDevices`, which
the app already reads whole), and `MdMgmt.get` (its reply does not carry a usable in-use flag, read
from source; `enumerateDevices` has everything it returns).

Every captured example is scrubbed before commit (AGENTS.md rule 2): host names in array names and
reports, serial numbers, WWNs and the by-id paths built from them, array and file-system UUIDs.

---

## 13. Components

### 13.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component | Why | States to cover |
| --- | --- | --- |
| `ProgressBar` (extracted from `JobProgress`'s bar) | A sync's progress in a table cell and on an array's page, outside a job: the same Base UI progress, the value text beside it, `aria-valuetext` with the words | known percentage; with and without time left; indeterminate (a check), and its reduced-motion form ("Working…" with a still bar); compact in a 36px row; 320px; 200% zoom |
| `NavItem` condition (shell extension) | The first menu entry shown only when something is known at run time (0.10) | hidden while loading, shown, hidden on 404, shown on another error; the current-item treatment when it appears while its page is open |

No new colour, token or colour variant: the slice uses the status, pending, destructive and neutral
families as they are, and the progress bar keeps `JobProgress`'s colours. The colour audit is not
affected.

### 13.2 Reused as they are

The job-runner parts (`JobRunner`, `PreflightNotice`, `JobSummary` with `typedConfirmation` and the
several-names `typedMatches`, `JobStepList`, `JobResult`, `JobFailure`, `AlsoPendingPrompt`),
`ConfirmDialog` (default and destructive), `TypeToConfirmField`, `RadioGroupField` with groups,
`CheckboxListField` with groups, `CheckboxField`, `UsedByPanel`, `Breadcrumbs`, `Card`, `FactList`,
`StatusPill` and `rollUp`, `EmptyState`, `InlineAlert`, `FormAlert`, `Table*`, `TableSkeletonRows`,
`Disclosure`, `ExternalLink`, `Identifier`, `CopyButton`, `TaskLog`, `Skeleton`, `Button` (with
`loading`), the task announcer and the Tasks menu; and from the app, Flow A's step runner and its
file-system steps.

### 13.3 In the app

Pure functions, each tested by itself:

- `arrayState(row, roles)` (0.2): the state, its reason key and progress, from `state`, `syncaction` and
  the counts; Unknown for anything unrecognised.
- `parseProgress(state)` (0.1): percentage and minutes left, or nothing.
- `memberRoles(detailText, devices)` (0.3): the roles per member and the missing count, or "not known"
  when the table cannot be parsed. Tested on every captured report and on hostile text.
- `levelWord(level)`, `protection(level, numdevices, missing)`, `usableSize(level, sizes)` (0.4).
- `arrayDisplayName(row)` (0.1): the device, and the own name without the host part.
- `raidChoices(candidates, disks, fileSystems, detected, arrays, session, minSize)` (0.7): the groups
  and reasons, built on `diskUse`; fail-closed on missing inputs.
- `arrayRefusals(row, roles, fileSystems, session)` (0.9): the blockers of add, grow, remove, check and
  delete.
- `arrayUsedBy(row, fileSystems, detected)` (0.11), with `partitionParent` extended to `md` names.
- The create and add plans: from the choices and the reads, the ordered steps, the summary items and the
  expected dirty set for R10.

The session store gains: the arrays this session created, changed or grew (for 1.6, 0.8's mark and
2.6), the check this session started (6.1), the array handed to Flow A, and the registry ids of the
flows. Cleared at sign-out with the task registry; nothing touches browser storage (UI-13).

---

## 14. Mock scenarios to add

Built from scrubbed captures where the VM can show them (section 15); hand-written ones say so.

| Method | Scenarios |
| --- | --- |
| `MdMgmt.enumerateDevices` | the existing ones (none, two mirrors, the 404), plus: a mirror synchronising (captured), resync pending (captured if the VM shows it), a mirror with a spare (captured), degraded (captured, after failing a member on the VM), degraded and rebuilding onto the spare (captured), a RAID5 of three (captured), a RAID5 not running (captured, after detaching two disks), reshaping (hand-written), being checked (captured), `state` `false` (hand-written), an unrecognised state (hand-written), an array on partitions made elsewhere, twenty arrays, a name 200 characters long, one right-to-left, one that looks like markup; an error |
| `MdMgmt.getDetail` | one report per scenario above (captured where possible); a report whose table cannot be parsed; an error |
| `MdMgmt.getSlaves` | a mirror's two disks (captured); a member that is gone (skipped by the server); mixed sizes (hand-written) |
| `MdMgmt.getCandidates` | the VM's empty scratch disks (captured); none; one too small (hand-written); an error |
| `MdMgmt.create` | a mirror of two (captured); RAID5 of three (captured); failed (hand-written from mdadm's words, **[verify]**) |
| `MdMgmt.add` | a spare added (captured); a replacement into a degraded array (captured); too small (hand-written) |
| `MdMgmt.grow` | reshaping started (hand-written unless the VM has a fourth disk); added but not reshaped (hand-written) |
| `MdMgmt.remove` | a failed member (captured); a spare (captured); a working member (captured); an error |
| `MdMgmt.delete` | deleted (captured); refused by the system because the array is still mounted (captured on the VM by the capture tool, with the file system put back afterwards) **[verify]** the server's words; an error |
| `MdMgmt.setSyncAction` | check started, stopped (captured); an error for a level without copies (captured) |
| The mock's memory | As Flow A's: the mock remembers creates, adds, removes, deletes, checks and their progress over time, so the journeys of sections 3, 4 and 8 can be walked on `pnpm dev:mock` and in the browser test |
| `System.getInformation`, `Config.*` | the flows: nothing pending; `mdadm` and `initramfs` pending; those plus Flow A's four; those plus `nfs` (R10); apply failed with `mdadm` deployed and `initramfs` not |

---

## 15. Checks before calling it done, and what only real hardware shows

### 15.1 On the mock, and in every build

- Both themes; greyscale; deuteranopia and protanopia emulation. Every state keeps its word and icon
  shape: Critical (degraded, failed, not running), Warning (synchronising, reshaping), OK, Unknown
  (hollow ring). The role words are words; Failed and Missing carry the Critical pill. The only red
  controls are "Erase {{count}} disks and create array", "Erase disk and add it", "Take disk out" and
  "Delete array", each with its verb.
- 320 CSS px and 200% zoom: the tables scroll inside their named frames only; the progress bar and its
  words wrap; the summary facts stack; device paths and serial numbers break safely; the typed fields
  and their targets wrap.
- Keyboard-only: the list (1.8), an array's page (2.8), the create flow (3.8), the add flow, the remove,
  check and delete dialogs (7.5).
- Screen reader hears: loading of each page; "Read at"; a state change from a poll, once; each flow
  step and a failure (assertively) and the result; the dialogs' titles with their consequences. It does
  not hear the percentage move or the elapsed-time counters.
- In the network panel: no `getCandidates` outside the create and add flows; no `create`, `add`, `grow`,
  `remove` or `delete` before their confirmations and re-reads; no `setSyncAction` before its
  confirmation; no poll while nothing is syncing, and none while the tab is hidden; every poll carries
  `updatelastaccess: false`; with the 404 scenario, no RAID call after the first and no RAID item in the
  menu; nothing at all for a normal user.

### 15.2 On the test VM

The VM (OMV 8.6.1) has three empty 8 GiB scratch disks, `sdb`, `sdc` and `sdd`; `sda` is the system disk
with a data file system on `sda1`. A snapshot is taken first, and everything is put back afterwards:
nothing left pending, every scratch disk wiped (`wipefs -n` empty).

1. **Without the plugin** (as now): the 404 state of 0.10 on every RAID address, no menu item, the Disks
   and File systems pages unchanged.
2. **Install `openmediavault-md`** from the classic interface's Plugins page; capture `enumerateDevices`
   empty; the menu item appears after signing in again.
3. **Create a mirror of `sdb` and `sdc` with "Use it for files" (EXT4)**: the whole of section 3; capture
   the states of a synchronising mirror and their progress text, `getDetail`'s report and roles,
   `getSlaves`; check that a new array appears in `getCandidatesBg` at once; time the checkpoint (the
   start-up image); check `/proc/diskstats` of the members and of `sda` before and after an
   `enumerateDevices` and a `getDetail` call (0.5); the usable size against 0.4.
4. **Add `sdd` as a spare**: capture the spare's role, and whether `devices` lists spares (1.3).
5. **Fail a member by hand** (a test-only shell command on the VM, as the plugin's own source suggests
   for testing): capture `faulty`, `degraded`, and the automatic rebuild onto the spare with its
   progress; the dashboard row; What to do now; then "Take the failed disk out" (5.3).
6. **Refusals**: delete refused while the file system is mounted; a working disk's removal refused while
   degraded; the system disk and `sda1`'s disk never offered; a disk with S.M.A.R.T. monitoring settings
   saved, in or out of `getCandidates` (0.7).
7. **Remove a working disk** of a healthy mirror (5.4), then add it back (it goes through Erase and
   reuse, 0.7): the full rebuild.
8. **Check** the mirror, stop it, run it to the end; the log line in System logs (6.1); whether any
   scheduled check remains on the system.
9. **Unmount and remove the file system** (the file-systems slice), then **delete the mirror**: the
   disks show "No file system found"; what applying, or restarting without applying, does to the array
   names (0.6, 0.8).
10. **RAID5 of three**: create it without a file system; detach one disk (the source's test method) for a
    degraded array, rescan, and replace it through section 4 with the same disk, now under "Erase and
    reuse"; detach two for a RAID5 that is not running, capture it, try reconnecting and restarting,
    then delete it (7.1).
11. `pnpm test:browser:vm` with the scratch disks named in the environment, over HTTP and HTTPS, with
    the destructive journeys of 3, 4, 5 and 7 on the scratch disks only.

Not possible with three scratch disks: Double parity (RAID6), Mirror and stripe (RAID10), and making a
RAID5 bigger (it needs a fourth disk). They are checked on the mock, by their hand-written scenarios,
unless the owner adds a fourth scratch disk to the VM, in which case 10 also grows the RAID5 3 → 4 and
captures a reshape.

### 15.3 Only on real hardware

These cannot be seen on the VM, whose virtual disks do not sleep, do not fail and are tiny. They are
stated, not claimed, until observed on a real NAS (the owner's own server stays read-only, ground rule
2 of [07](../07-implementation-plan.md)):

- Whether `enumerateDevices`, `getDetail`, `getSlaves` and `getCandidates` wake a disk that has spun
  down (0.5).
- A real disk failure: how the kernel marks a disk that returns read errors, and what the report and
  `state` show before and after; a disk that disappears from the bus while in use.
- Hot-swapping a disk in a bay, and whether the new disk appears without "Look for new disks".
- Rebuild, check and reshape times on multi-terabyte disks; what `finish=` says over hours; the poll
  over a whole night (and the idle timeout signing the reader out, as designed).
- USB disks being left out by the plugin (0.7), with a real USB enclosure.
- Disks of different sizes in one array (0.4's estimate).
- The email the NAS sends when a disk fails, with email set up.
- What a power cut during a reshape does: not tested on purpose; the design only warns (4.4).

---

## 16. Adversarial pass

### 16.1 Trying to break it

| Probe | Finding | Design response |
| --- | --- | --- |
| Create an array that includes the system disk | The server would overwrite it (it checks nothing) | Not offered: the disk-use model refuses it, whatever `getCandidates` says (0.7); re-checked at step 1 |
| A disk the plugin offers but the interface sees as holding a file system set up on this NAS | The two lists disagree | The stricter wins: not offered, listed with the reason (0.7) |
| **Two tabs create arrays on the same disks** | No lock on the server | Each tab's step 1 re-reads; once the first tab's array exists (seconds after its create), its disks are "Part of RAID" and the second stops before erasing. In the seconds between the first tab's step 1 and its create call, both could pass; the second create overwrites the first's new, empty array. Accepted and stated (section 18, P2); no data of the owner's is at risk then |
| **Disks renamed** between the summary and step 1 (`sdb` and `sdc` swap after a restart) | The flow could overwrite a different physical disk | Serial number and model compared at step 1; the stable by-id name is what the server receives (0.7) |
| **An array renamed** after a restart (`md0` becomes `md127`, and another array takes `md0`) | A bookmark opens the other array; an action could hit it | Every action compares the array's `uuid` with the one the page showed; "This array changed" (0.6, 2.9) |
| Take out the last working disk of a mirror | The server would do it; the array would fail | Refused: a degraded array's working disks cannot be taken out (5.1) |
| Take out two disks of a RAID6 at once | The server accepts several | One at a time in the contract and the interface (5.1; section 17, D14) |
| Take a disk out of a stripe | The array is destroyed | Not offered (5.1) |
| Take out a disk whose role could not be read | It might be the only working copy | Fail closed: unavailable (0.3) |
| Add a disk smaller than the others | mdadm refuses, after the disk was erased | Not offered: "Too small" (0.7), before anything is erased |
| Add a disk to an array that is rebuilding | Unclear outcome | Refused (4.1) |
| Make a mirror or a stripe bigger | The plugin's grow reshapes a stripe through a temporary parity level, and turns a mirror into more copies, not more space | Not offered; "bigger" only for RAID5 and RAID6 (section 17, D17) |
| The array is made bigger but the file system is not | Space looks lost | The result and the array's Used by say so, with the grow link (4.6, 2.6) |
| Delete an array with a mounted file system | The server would try; the stop fails | Refused with the file system named (7.1); re-checked when the dialog opens and on confirm |
| Delete an array whose mount is saved but not applied | A dangling mount entry would remain | Counts as "set up": refused (7.1) |
| Delete an array with LVM on it | The server does not look | `_used` with nothing found: refused (7.1) |
| Delete when the file-system read fails | Unknown content | Fail closed (7.1) |
| Delete, then regret it | Nothing restores it | Typed confirmation naming every member disk; "cannot be undone" in the consequence (7.3) |
| The state text changes form in a newer mdadm | Words not recognised | Unknown, with the server's words shown; every action unavailable (0.2) |
| `getDetail`'s table cannot be parsed | Roles unknown | Roles "Not known"; removing and replacing unavailable (0.3) |
| A poll during a 3-day reshape | Could keep the session alive forever | Background reads with `updatelastaccess: false`; the idle timeout signs out (UI-14); the reshape goes on |
| A poll on a healthy, idle NAS | Would read for nothing | Never: the poll runs only while a sync is under way (0.5) |
| Session expires or the NAS restarts during a rebuild | The rebuild continues, or resumes, in the kernel | After sign-in the page shows the real state; nothing in the browser was needed |
| Reload during the create flow | The journal is lost (R8) | The list's 1.6 recognises an array without a file system and the pending change; the array's own state is on the server |
| Apply fails half way at a checkpoint (B3) | Some modules deployed, some not | "Try again" first; the changes stay in the band; no "Undo", which would not remove the array (3.7) |
| Another administrator saves a change during a flow | It would ride the checkpoint | R10 lists it and asks (3.7) |
| Another administrator deletes the array in the classic interface during the add flow | | Step 1's re-read: the array is gone; nothing is erased |
| The plugin is removed while a RAID page is open | 404 on the next read | The page switches to 0.10's state |
| A NAS without the plugin, with an array made by hand | No RAID check possible | Nothing is claimed about RAID; the disks slice's untraceable-storage sentence covers it (0.10) |
| A degraded array chosen in Flow A | A file system would be put on an array short of a disk | Not offered (9.3) |
| An array's own name of 200 characters, right-to-left, or `<img onerror>` text | Layout, UI-2 | Text nodes, `dir="auto"`, wrapping; markup shown literally; the name is shown only on the array's page; the host part is dropped (0.1) |
| The host name in a shared screenshot of the technical details | It is personal data on screen | It is shown on screen only, in the report the reader asked for; never in an address, title, toast, log or storage; captures scrub it (0.1, 2.7, 12) |
| `/storage/md/md0/../../rpc.php`, `/storage/md/md9999` or `/storage/md/MD0` | URL as an identifier | Pattern rejects it; not-found state; no call (0.6) |
| `/storage/md/md0/add` from a bookmark | Could preselect and erase a disk | Nothing is chosen from the address; every step needs the typed confirmation |
| Press "Take disk out" or "Delete array" twice | Two calls | Buttons ignore presses while their call runs; the session registry refuses a second action on the same array |
| 0 arrays; 1; 20; an array of 30 disks | | 1.7's empty state; tables not paged but in their own frames; Select all over nine disks |
| A normal user types any RAID address | Refused methods | "Only administrators" page, no call (10) |

### 16.2 Without sight

| Probe | Requirement |
| --- | --- |
| Tab through each page | The orders in 1.8, 2.8, 3.8, 7.5; skip link first (shell) |
| The state | Every state is a word and an icon shape; the reason sentence is text next to the pill, not a tooltip; progress has `aria-valuetext` with the percentage and the time left in words |
| A poll | A change of state is announced once, politely; the moving percentage is not announced; focus never moves |
| The disk choice | Each option reads device, model, size, then the serial number and what is on it, so the reader hears what will be erased before choosing it |
| The Disks table | Each Take out button names the disk and the array; a missing disk is a row with its words |
| The typed confirmations | The prompt is the field's label; the reason the button is unavailable is its hint; the consequence is read before the field |
| The steps | An ordered list; each step's state is a word; changes polite, a failure assertive with focus moved to it |
| Colour | Critical, Warning, OK and Unknown differ by word and shape; the role words are words; destructive buttons differ by words and icon, not only colour |
| 200% zoom | One column; tables and the report scroll in their own frames only |

---

## 17. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID | Decision | Why |
| --- | --- | --- |
| D1 | The menu item is **"RAID"** under Storage, between Disk health and File systems, shown only with the plugin installed, known from one `enumerateDevices` read after an administrator signs in *(recommended)* | Q8's "shown only when installed"; the stock position; "RAID" is the word people search for, where the stock "Multiple Device" is not; the read is the one the storage pages make anyway |
| D2 | An array's page is addressed by its **kernel name** (`md0`), and every action re-checks the array's **UUID** *(recommended)* | It is what the stock interface, the disks list and the file-systems list call it; the UUID re-check covers a rename after a restart, as the serial number does for disks |
| D3 | Arrays get **no name** from this interface; the contract's `name` accepts only the empty string, and an existing name is shown without its host part *(recommended)* | The stock form never sends one either (its field is hidden), and OMV knows an array by its device name everywhere. If the owner wants names later, they are limited to at most 16 characters of ASCII letters, digits, hyphen and underscore, starting with a letter or digit, in the contract and the form. The host part is a host name and adds nothing on the NAS's own pages |
| D4 | **Degraded (even while rebuilding) is Critical; synchronising and reshaping are Warning**; a check is OK *(recommended)* | The style guide names a degraded array as Critical; a resync or reshape needs no action but is not full protection, and a reshape must not be interrupted |
| D5 | Each disk's **role is read from mdadm's report** (`getDetail`) and fails closed when it cannot be parsed *(recommended)* | No other method says which member is working, spare, rebuilding or failed; removing the wrong disk is the costliest mistake in this slice |
| D6 | **"It can lose" is said in words** for every array and every choice, with the usable space in "about" figures *(recommended)* | It is the one fact a RAID level is chosen for; levels by name mean nothing to most owners |
| D7 | Level words follow Combine disks (BTRFS): **Mirror (RAID1), Mirror and stripe (RAID10), Stripe (RAID0)**, and add **Parity (RAID5), Double parity (RAID6)** *(recommended)* | One vocabulary across both ways of combining disks; the RAID number stays for those who know it |
| D8 | Disks that hold something are offered under **Erase and reuse** and get a **quick wipe first**, under the same typed confirmation; **USB disks are not offered**, with the plugin's reason *(recommended)* | The plugin's list silently leaves out any disk with old partitions; a quick wipe clears them and any old array marks, as in Flow A; the plugin refuses USB disks, so offering them would erase a disk for nothing |
| D9 | **Every change to an array is confirmed against fresh reads** (disks by serial number and model, the array by UUID, state and roles) as the first step, before anything is erased *(recommended)* | The earlier slices' rule; arrays and disks are renamed by restarts |
| D10 | **The one poll** runs only while an array on the page is synchronising, rebuilding, reshaping or being checked, every 30 seconds, as a background read *(recommended; section 18, P9)* | The reader wants to see the work move; the disks are busy anyway then; an idle NAS is never polled |
| D11 | **The create and add flows apply their own changes** at a named checkpoint ("Save the array's settings"), after R1 and R10; the remove and delete dialogs leave them in the band *(recommended)* | A flow should end with the array written down, as Flow A ends with the file system mounted; a single dialog follows the save-then-apply loop of Phase 3 |
| D12 | A failed checkpoint offers **"Try again", not "Undo"** *(recommended)* | Undoing the pending changes would not remove an array that already exists on the disks; it would only make the NAS forget it at the next start |
| D13 | Create's file-system stage offers **EXT4 (default), XFS and BTRFS**; F2FS is left out *(recommended)* | F2FS is made for flash cards, not arrays; three choices, as few as possible |
| D14 | **One disk at a time** for replacing, spares and taking out; several only when making a RAID5 or RAID6 bigger *(recommended)* | One change at a time is easy to follow and to check; a reshape per disk would take days each, so growing takes several at once |
| D15 | "What the disk is for" (spare or bigger) has **no default** *(recommended)* | Both are reasonable; one is irreversible and takes a day or more, so the reader chooses |
| D16 | Flow A **does not offer a degraded, failed or not-running array**; it offers a synchronising or reshaping one *(recommended)* | New storage on an array short of a disk invites loss; a synchronising array is normal for a new one |
| D17 | **Making an array bigger is offered for RAID5 and RAID6 only** *(recommended)* | Growing a mirror adds copies, not space; growing a stripe goes through a risky temporary conversion; RAID10 is not offered by the stock interface either |
| D18 | **No "Repair"**; check and stop only (section 18, P8) *(recommended)* | Repair rewrites one copy from another when they differ, and which is right cannot be known; the classic interface keeps it |
| D19 | A disk taken out is **not wiped automatically**; the result recommends it and links to the disk's wipe *(recommended)* | A failed disk may not be wipeable and is about to be unplugged; a working one may be kept for undo; the wipe has its own typed confirmation |
| D20 | **The array's long work is not a task** in the Tasks menu; it is the array's state, on its page, in the list and on the dashboard *(recommended)* | It runs in the kernel, has no task handle, and survives sign-out and restarts; a task entry would vanish while the work goes on |
| D21 | The dashboard reads the arrays **once per visit** and shows rows only for **Critical and Unknown** *(recommended)* | The attention list is for what needs the reader; a resync needs nothing |
| D22 | "Add storage on this array" passes the array **in memory**, never in the address *(recommended)* | As the disk handover to Flow A (the file-systems slice's D17) |
| D23 | Catalogue: `raid.name` replaces `filesystems.raidOn` (English unchanged); `raidLevel.*` shared with Flow A's RAID option; `modules.mdadm` "RAID" *(recommended)* | Several pages now use them |

---

## 18. For the owner to agree

The destructive, irreversible and protection-reducing points of this slice. The design is built only
once these are agreed. Every method used is in the cleared set (`MdMgmt.*`); there is no review-list
question.

1. **P1, what creating an array or adding a disk may erase.** Both overwrite the disks they are given,
   and the server checks nothing. Offered only are disks that both the plugin's list and this
   interface's disk-use model allow; the stricter wins. Disks that hold something appear under "Erase
   and reuse" with what is on them, and get a quick wipe first. Refused, and listed with the reason: the
   system disk, read-only disks, disks with a file system in use, set up or being created, swap, disks
   already in an array, disks being wiped, USB disks, disks smaller than the array's, and every disk
   when the check could not run. (0.7)
2. **P2, how creating and adding are confirmed.** One summary that names each disk by device, model,
   serial number and size (with the label size), says what is lost and what the array can lose, then
   typing every chosen device name. A red button with the verb, Enter does not confirm, no second
   dialog. The disks and the array (UUID, state, roles) are re-checked as the first step, before
   anything is erased. Accepted and stated: two sessions creating on the same disks within a few
   seconds; the second overwrites the first's new, empty array. (3.3, 3.4, 4.4, 4.5, 16.1)
3. **P3, the levels offered and the default.** Mirror (RAID1, the default, Q3's reasoning), Parity
   (RAID5), Double parity (RAID6) and Mirror and stripe (RAID10), each saying in words what it can lose
   and about how much space it gives, with the plugin's minimum disk counts (2, 3, 4, 4). **Stripe is
   not offered**: it protects nothing, and Combine disks (BTRFS) already offers Stripe and Join for one
   large unprotected space; the page points there. No array name is asked for. (3.2, D3)
4. **P4, creating continues into storage.** By default the create flow also creates a file system on
   the array and mounts it (Flow A's steps, one typed confirmation, one checkpoint that saves the array
   and mounts the file system), then hands sharing to the classic interface as Flow A does. "Use it for
   files" can be unticked to leave the array empty. (3.2, 3.4, 9.3)
5. **P5, making an array bigger.** Offered for RAID5 and RAID6 only, when the array is OK and idle. It
   erases the added disks and cannot be undone; the reshape takes many hours, often a day or more, and
   the NAS must not be turned off meanwhile. Confirmed by the same typed confirmation as adding a disk,
   with "cannot be undone" and the time in the summary. The file system on it is grown afterwards on its
   own page (the file-systems slice's grow, already agreed). (4.3, 4.4, D17)
6. **P6, taking a disk out.** A failed disk or a spare: a plain confirmation, since nothing is lost. A
   working disk: only when the array is OK and idle and keeps copies, never from a degraded array or a
   stripe, one at a time; confirmed by a red dialog that says how much protection is left, suggests
   adding a spare first, and asks for the disk's device name to be typed, because the array is left
   with less (or no) protection. The disk is not erased. (5.1, 5.3, 5.4)
7. **P7, deleting an array.** Everything on it is lost. Refused while a file system on it is set up,
   mounted, used or being created, while other storage uses it, and when the check could not run (the
   interface's own safeguard; the server checks nothing). Confirmed by a red dialog naming every member
   disk, with the array's device name typed. Its pending changes go to the band. (7.1, 7.3)
8. **P8, check, and no repair.** "Check now" is a plain confirmation that says it wakes the disks and
   keeps them busy for hours; "Stop checking" likewise. **Repair is not offered here**: when copies
   disagree it rewrites one from the other, and which one is right cannot be known from the page; the
   classic interface keeps it, and the list's footer says so. The contract's `setSyncAction` accepts
   only `check` and `idle`. (6.1, 6.2)
9. **P9, the one poll.** While an array on the RAID list or its own page is synchronising, rebuilding,
   reshaping or being checked, the page re-reads the arrays (and that array's report) every 30 seconds,
   as a background read that keeps no session alive and stops when the tab is hidden; it never runs on
   an idle NAS. This departs from the earlier slices' "nothing polls", for the one case where the work
   takes hours and the reader waits for it. The reads ask only the kernel's state; whether they touch a
   sleeping disk is checked on the VM by disk counters and stated for real hardware. The alternative is
   no poll, with Refresh. (0.5)
10. **P10, no way round a refusal.** A refused create, add, removal, check or deletion offers no classic
    link that does the same without the check; the links offered lead to removing the blocker (the file
    system's page). The list's footer links to the classic RAID page for what this slice does not offer
    (repair, stripes, names). (0.9)
11. **P11, after a removal or a deletion.** The array's change acts at once on the disks; writing the
    arrays down for the next start (`mdadm`, and the start-up image) is left pending in the band, with a
    sentence saying what applying does. The create and add flows apply their own changes at their
    checkpoint, after refusing to start while anything else is pending (Q2). (0.8, D11)
