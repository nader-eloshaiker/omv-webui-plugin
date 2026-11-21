# Phase 5, storage slice 2, file systems: design

The second storage slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the
File systems list, a file system's own page (its details, warning level and tags), mounting a file
system found on a disk, growing one, unmounting one, removing a missing one, and UX-audit Flow A, "Add
storage and share it", with its multi-disk BTRFS variant.

**Status: for the owner's agreement before building.** This slice erases disks (creating a file
system overwrites the whole disk), has an irreversible action (grow) and one that cuts access
(unmount), so the owner agrees the design first (journal, 2026-11-21, "Storage is built in slices").
Section 18 lists the points to agree, and the backend methods outside the cleared set; section 17
lists the other judgement calls, each taken as recommended unless the owner says otherwise.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-8 above all), the journal entries of 2026-11-21 (binding: storage in slices, each design agreed
before building; the interface enforces its own safeguards for destructive actions; nothing reads
S.M.A.R.T. on its own), the [UX audit](ux-audit.md) (Flow A in 4.2, the job-runner rules R1 to R10 in
4.1, the adversarial pass in 7, the checks V1 to V8 in 6, and the owner's answers Q1 to Q11 in 5), and
the conventions of [phase-3-pages.md](phase-3-pages.md) section 0,
[phase-5-monitoring.md](phase-5-monitoring.md) section 0 and [phase-5-disks.md](phase-5-disks.md)
section 0, which every page here reuses unchanged. Where this document and the style guide disagree,
the style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x). Anything marked **[verify]** is checked on the mock
and the VM, by capture, before it is relied on. Anything marked **[owner]** needs the owner's answer
before that part is built.

Every method used here is administrator-only. A normal user sees nothing new (section 10).

---

## 0. Conventions added for this slice

The Phase 3 conventions (formatting, classic links, the four async states, the settings-form rules,
the pending mark, the shared catalogue), the monitoring domain's (status words, background and
foreground reads, the Storage card's usage rule) and the disks slice's (disk names, the disk-use model,
the wipe pattern, what wakes a disk, one confirmation then a step list) apply throughout. This section
adds only what is new.

### 0.1 Formatting

| What | Rule | Example |
| --- | --- | --- |
| A file system's name (`{{name}}`) | The disks slice's rule, unchanged: `label` as text when it is not empty, else "{{type}} on {{device}}" with the device in `Identifier`. The device is `canonicaldevicefile`, else `devicefile` (a missing file system has only the stable path) | `media`, `EXT4 on /dev/sdb1` |
| File-system type | A shared word list: `ext4` "EXT4", `xfs` "XFS", `btrfs` "BTRFS", `f2fs` "F2FS", `jfs` "JFS", `vfat` "FAT", `exfat` "exFAT", `ntfs` "NTFS", `iso9660` "CD or DVD", `zfs` "ZFS"; anything else as received, in `Identifier`. The disks slice's "Used for" lines adopt the same words (its English keys are unchanged; only the value passed changes) | `EXT4` |
| Tags | `comment` of the mount entry, which the classic interface edits as tags separated by commas **[verify]** the separator it writes. Shown as text joined with ", ", `dir="auto"`. Empty: nothing | `Media, Photos` |
| Folder on the NAS | `mountpoint`, in `Identifier`, breaks anywhere, with a `CopyButton` on a file system's page | `/srv/dev-disk-by-uuid-…` |
| Warning level | `usagewarnthreshold`: 1 to 100 as "{{percent}}"; 0 as "Off" | `85%` |
| How full | The monitoring domain's Storage-card figures (its 1.2.1): `percentage`, `available` and `size`, never `used` (a formatted string) | `86% full · 512.0 GiB free of 3.6 TiB` |
| Disk size in a destructive confirmation | The disks slice's label size (its 0.1) in the Flow A summary too, as in its wipe confirmation | `3.6 TiB (4 TB on the label)` |
| Server-written text (descriptions, mkfs and report output, error messages) | As received, as text (UI-2), `dir="auto"` | |

### 0.2 Status words

The pills use the fixed words and the shared `health.*` keys. A file system's **state** comes from
`FileSystemMgmt.getList`'s `status` and `mounted`, and whether `fstab` is pending:

| `status` | `mounted` | `fstab` pending | State | Reason, beside the pill |
| --- | --- | --- | --- | --- |
| 1 (available) | true | | **OK** | none |
| 1 | false | yes | the pending mark "Not applied yet" (no health pill) | "Set up. It is mounted when the changes are applied." |
| 1 | false | no | **Critical** | "Not mounted. Its files cannot be reached." |
| 2 (initializing) | | | the task-state pill **Running** (style guide 5.7) | "Being created" |
| 3 (missing) | | | **Critical** | "Missing. Its disk may be disconnected or have failed." (the dashboard's key, moved to shared `filesystem.reason.missing`) |

**OK means mounted and reachable**, which the NAS does monitor. How full it is, is the usage column's
own concern, with the dashboard's rule unchanged (its 1.2.3): a Warning or Critical pill beside the
figure when the level is crossed or the file system is full, Unknown when the figures could not be
read, and no pill otherwise. So a row can show OK and, beside its meter, Warning: two facts, each in
words. The roll-up (1.4) takes the worst of both.

"Set up but not mounted, nothing pending" is Critical rather than Unknown: the NAS was told to mount
it and it is not mounted, so shared folders on it are broken. **[verify]** on the VM that a mount saved
and applied always shows `mounted` true, and that this row only appears after a failed mount or an
unmount outside the interface.

Not statuses, and so never coloured or pilled: the type, the tags, the warning level, "found but not
mounted" (1.5), and what uses a file system (0.6).

### 0.3 Classic links used here

All are `ExternalLink`s with "… in the classic interface" in the visible words, literal paths written
in the code, never built from a reply (UI-3). None takes an identifier.

| Target | Path |
| --- | --- |
| Storage > File systems | `/#/storage/filesystems` |
| Storage > Shared folders | `/#/storage/shared-folders` |
| Storage > Shared folders > Create | `/#/storage/shared-folders/create` |
| Services > SMB/CIFS > Settings | `/#/services/smb/settings` |
| Services > SMB/CIFS > Shares > Create | `/#/services/smb/shares/create` |
| Users > Users | `/#/usermgmt/users` |

The disks slice's links to `/#/storage/filesystems` become router links to this slice's pages
(section 9). The classic File systems page stays reachable from this slice's list footer only, for
what this slice leaves out (quotas, JFS, the classic "create" types).

### 0.4 What touches the disks

The owner's rule is about S.M.A.R.T. (nothing reads it on its own), and no method in this slice reads
S.M.A.R.T. Some do read the disks themselves, so they follow the same discipline: a read that may wake a
sleeping disk is made only when the reader asks, and the sentence saying so is beside the button.

| Method | Touches the disks? | When this slice calls it |
| --- | --- | --- |
| `FileSystemMgmt.getList` | Probes every file system through the system's device information; not known whether it wakes a sleeping disk (accepted once per visit, journal 2026-11-21) **[verify]** | On opening a page, Refresh, after an action |
| `FileSystemMgmt.getMountCandidates` | The same probing as `getList` | With `getList`, on the list page and in Flow A |
| `FileSystemMgmt.enumerateFilesystems`, `DiskMgmt.getList`, `MdMgmt.enumerateDevices` | As in the disks slice (0.4 there) | For the disk-use model (0.6 there) |
| `FileSystemMgmt.getCandidatesBg` | It may run `wipefs` on a disk the system reports as blank, which reads the disk **[verify]** whether it wakes one | Only on opening Flow A, and in its re-checks |
| `FileSystemMgmt.getDetails` | Yes: it reads the file system on the disk (`dumpe2fs`, `xfs_info`, the BTRFS commands) | Only on "Show technical details" (2.5) |
| `FileSystemMgmt.create`, `createBtrfs`, `DiskMgmt.wipe` | Yes, and they erase it | Only after the typed confirmation (6.5) |
| `FileSystemMgmt.grow` | Yes | Only after its confirmation (section 4) |
| `FileSystemMgmt.setMountPoint`, `FsTab.getByFsName`, `FsTab.set` | No: configuration | On Save, and in Flow A's steps |
| `FileSystemMgmt.umountByDir` | Unmounts, then applies the mount change at once (0.7) | Only after its confirmation (section 5) |

**Nothing polls** in this slice, as in the disks slice (its D3). Every list is a snapshot with its
"Read at" time and Refresh. When a task this session started ends (a create, a grow, an unmount), the
lists are read again.

### 0.5 Naming a file system in an address

A file system's page is `/storage/filesystems/$fs`, where `$fs` is the **file system's UUID** (`uuid`
in `getList`), validated against `^[0-9A-Fa-f]{4,16}(-[0-9A-Fa-f]{2,16}){0,4}$` and at most 36
characters (standard UUIDs and the short FAT form `ABCD-1234`).

- The page reads `getList` and finds the row whose `uuid` equals the parameter (ignoring case), or a
  missing row (status 3) whose `devicefile` is `/dev/disk/by-uuid/` followed by the parameter. Every
  later call uses that row's fields, never the address (UI-4). A parameter that fails the pattern, or
  names no row, shows the not-found state (2.8) and makes no file-system-specific call.
- **Why the UUID, not the kernel name** (`sdb1`) as the disks slice uses: a missing file system has no
  kernel name, and kernel names move when the NAS restarts, while OMV itself records a file system by
  its UUID path (`setMountPoint` stores `/dev/disk/by-uuid/…` first). The UUID is a random number made
  when the file system was created: it is not the disk's serial number and says nothing about the
  hardware. The mount folder's name is **not** used, because for a file system recorded by disk ID it
  contains the disk's serial number (section 17, D2).
- A row with no UUID (a missing file system recorded by another kind of path, or a type without
  UUIDs) **[verify]** whether this occurs has no page: its name is text with no link, its state and
  reason are in the row, and the row says "This file system has no ID this page can use. Manage it in
  the classic interface." with the footer's link.
- A file system being created (status 2) and one found but not set up (1.5) have no page: there is
  nothing on it to manage yet.

### 0.6 What uses a file system

`_used` (on every `getList` row) is the server's yes or no: some configuration refers to the file
system's mount entry (UX audit B10). The interface names what it can (UX audit Pattern G), with the
library's `UsedByPanel`:

- **Shared folders on it**: rows of `ShareMgmt.getList` (whole list) whose `mntentref` is the mount
  entry's `uuid` (from `FsTab.getByFsName`), or, when that read fails, whose `mntent.dir` equals the
  file system's `mountpoint`. Each is listed by name with a router link to the Shared folders page.
- **Something else**: `_used` is true and no shared folder matches: "Used by a setting this interface
  does not show yet, such as a quota or an add-on." (Pattern G's sentence), with the classic File
  systems link.
- **Could not check**: `ShareMgmt.getList` failed: the panel's retry form. The refusals in sections 4
  and 5 rest on `_used` alone, which comes with the row, so they never depend on this read.

The **system drive** (mount point `/`) is never offered for any action (0.8).

### 0.7 Pending changes in this slice

| Action | What it marks pending | Applied by |
| --- | --- | --- |
| Mount a found file system (`setMountPoint`) | `fstab` "File system mounts", `collectd` "Performance statistics", `monit` "Service monitoring", `quota` "Disk quotas" **[verify]** V8 | The band, or Flow A's checkpoint (6.6) |
| Change the warning level or tags (`FsTab.set` on an existing entry) | `monit` only (read from the module listeners) **[verify]** | The band |
| Unmount, or remove a missing file system (`umountByDir`) | It applies `fstab` **at once**, by itself, and leaves `collectd`, `monit` and `quota` pending | This slice's own step right after it (section 5) |
| Create, grow, erase | Nothing: they act at once | |

Two facts about `umountByDir` shape section 5:

1. Its own apply of `fstab` is forced and global for that module: any other mount change already
   pending is applied with it.
2. Every apply ends by deleting the configuration snapshots that Undo restores from (read from OMV's
   apply code). After an unmount, **Undo in the band can no longer bring back changes that were
   pending before it** **[verify]** what the band's Undo does then (V5).

So unmounting and removing refuse to start while anything else is pending, offering to apply or undo
it first (the owner's Q2 answer, applied to a single action for the same reason).

**The pending mark on a file system's page** (Phase 3, 0.5) appears when the page's own change is
pending: `fstab` is pending and this file system is set up but not mounted; or `monit` is pending and
this session saved this file system's settings since the last apply. `monit` alone is pending for many
reasons, so it does not mark every file system's page.

### 0.8 The interface's own refusals

The server checks almost nothing here (UX audit B14, and the destructive-operations list read from
source): `create` and `createBtrfs` erase any device they are given, and `umountByDir` deletes a mount
entry that shared folders still point to. Every refusal in this slice is the interface's own (journal,
2026-11-21), and a refusal offers no classic link that would do the same thing without the check
(disks slice P3).

| Action | Refused when | Section |
| --- | --- | --- |
| Create a file system on a disk | The disk-use model of the disks slice (its 0.6) does not allow wiping it, or it is not one of `getCandidatesBg`'s devices and holds something the wipe also refuses | 6.4 |
| Grow | Not available (status 1) and mounted; read-only; the type cannot grow while in use (`propresize`); BTRFS on several disks (17, D12); being unmounted | 4 |
| Unmount | Used (`_used`); read-only or the system drive; being created; not mounted through OMV's settings (`propfstab` false); other changes pending | 5 |
| Remove a missing file system | Used (`_used`); other changes pending | 5 |

Fail closed, as the disks slice does: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message.

---

## 1. Storage > File systems

**Question it answers:** where are my files stored, is each file system reachable, how full is it,
and is anything found that is not set up yet? **Leads to:** a file system's page; adding storage
(Flow A); mounting a file system found on a disk.

Administrators only. Route `/storage/filesystems`.

### 1.1 Data

In parallel, on opening, on Refresh and after an action this session started ends; all foreground,
nothing polls:

- `FileSystemMgmt.getList`, whole list (`start: 0, limit: null, sortfield: "canonicaldevicefile",
  sortdir: "asc"`, as the disks slice reads it). Shared with the disks slice's queries.
- `FileSystemMgmt.getMountCandidates` (1.5).
- `FileSystemMgmt.enumerateMountedFilesystems` with `{ includeroot: true }` for the system drive only
  (1.3.2). Shared with the dashboard's Storage card query.
- `DiskMgmt.getList` (to name the disk a file system is on). Shared with the Disks pages.
- `System.getInformation`'s `dirtyModules` (the shell's, already warm) for the pending rows.

**[verify]** the time of `getList` plus `getMountCandidates` with five disks on the VM; both probe
every file system. If the pair is slow, `getMountCandidates` moves behind a "Look for file systems
that are not mounted" button and the owner is told.

### 1.2 Layout

1. Page title "File systems".
2. Intro: "A file system is how a disk stores files. Shared folders live on a file system, so it must
   be mounted for its folders to be reached."
3. **Roll-up line** (1.4), only when something is not fine.
4. **Unfinished work** notice (1.6), only when found.
5. **Toolbar**: **"Add storage"** (filled primary, router link to Flow A, `/storage/filesystems/add`),
   "Combine disks (BTRFS)" (neutral, router link to `/storage/filesystems/add-multi`), "Refresh"
   (neutral), and on the trailing side "Read at {{time}}." (`text-xs muted-foreground tabular-nums`).
6. The **table** (1.3), not paged.
7. `h2` **"Found on the disks, not mounted"** (1.5), only when there are any.
8. Footer: `ExternalLink` "File systems in the classic interface" → `/#/storage/filesystems`, with
   one line before it, `text-sm muted-foreground`: "Quotas, and file system types this page does not
   offer, are in the classic interface."

### 1.3 Columns

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | File system | 0.1's name, `comment` | A router link to the file system's page, the name as 0.1. Accessible name "Open file system {{name}}". Under it, `text-xs muted-foreground`, the tags when there are any. No link for status 2, for a row with no UUID (0.5) or for the system drive (1.3.2). Sortable (natural order) |
| 2 | State | 0.2 | The pill and its reason, never in a tooltip |
| 3 | Usage | `percentage`, `available`, `size`, `usagewarnthreshold` | `CapacityMeter` in its compact form with "{{percent}} full · {{free}} free of {{size}}", and the usage pill beside the figure (0.2). Missing, being created, or not mounted: "No reading" in `muted-foreground`, no meter. Sortable by `percentage` |
| 4 | Type | `type` | 0.1's word |
| 5 | On | `parentdevicefile`, `devicefiles`, `DiskMgmt.getList` | The disk or disks, each a router link to the disk's page (accessible name "Open disk /dev/sdb"), in `Identifier`, when the disk is in `DiskMgmt.getList` and its `devicename` passes the disks slice's pattern; a RAID array as text ("RAID /dev/md0"); anything else as text. Missing: "Disk not connected" in `muted-foreground` |
| 6 | Used by | `_used` | "Shared folders or other settings" or "Nothing", in words. Under the table: "Used by: whether shared folders or other settings use the file system. Its page says which." |

The rows keep the server's device order on every read; problems are led by the roll-up, not by moving
rows (as the disks slice does). There is no row selection and no row action: each file system's
actions are on its page, with the ones that cut access or cannot be undone apart, at the end.

#### 1.3.1 Being created

A row with status 2 (written by the server while `create` runs) shows the Running pill and "Being
created", "No reading" for usage, and the disk. When this session started the creation, the row also
has a router link "Show progress" to the running Flow A (whose job journal is in memory). A BTRFS file
system on several disks shows no such row while it is created (the server writes no marker for it);
the running flow and the Tasks menu are the only places that show it.

#### 1.3.2 The system drive

The first row is the drive openmediavault runs from, read from `enumerateMountedFilesystems` (its row
with `mountpoint` `/`), so the trail from the dashboard's Storage card, which shows it, does not end
here. It is named "System drive", second line "Where openmediavault is installed. It is managed by the
system, not here.", with its usage and warning level as on the dashboard, state OK when the row is
present, type, and its disk. It has no link and no page. If `getList` also lists `/` (an add-on that
shares the system drive), the two are one row.

### 1.4 Roll-up line

`role="status"`, polite, above the toolbar, only when any row is not fine:

- The worst pill and "1 of 4 file systems: Critical" (`filesystems.rollUp`), counting each file system
  once by its worst of state and usage. A pending mount is not counted: the band says it.
- Nothing when every file system is OK and below its level. As on the dashboard, there is no "all OK"
  claim about usage.

### 1.5 Found on the disks, not mounted

`getMountCandidates` lists file systems the NAS can see that have no mount entry, are not mounted, and
are not the system drive, swap or a cache (read from source). Typical cases: a disk from another
computer, a file system created in a session that ended before it was mounted (R8), or one unmounted
here.

- Intro: "These file systems are on the disks but not set up on this NAS. Mount one to use its files.
  Mounting changes nothing on the disk."
- A table: File system (0.1's name, as text), Type, On (the disk, as in 1.3), and a visible **"Mount…"**
  button per row (neutral, accessible name "Mount {{name}}"), which opens the mount dialog (section 3).
- A file system of a type the NAS cannot mount **[verify]** whether `getMountCandidates` ever lists
  one: no button, "This NAS cannot mount {{type}} file systems."
- If `getMountCandidates` fails: the section shows `InlineAlert tone="critical"` "Could not look for
  file systems that are not mounted." + server message + "Try again". The main table is unaffected.

### 1.6 Unfinished work (R8)

The job journal lives in memory, so a reload ends a flow view (UX audit R8). The list recognises the
common unfinished states from server state and offers the next step, in one `InlineAlert` (neutral
tone, info icon) per kind, above the toolbar:

| Found | Line | Action |
| --- | --- | --- |
| A file system in 1.5 that this session created (its flow ended before the mount, or after an undo) | "A file system on {{disk}} is not mounted yet." | "Mount…" (section 3) |
| A file system mounted, with no shared folder on it (from `ShareMgmt.getList`) and created in this session | "{{name}} is mounted, but nothing is shared from it yet." | Router link "See how to share a folder on it" → the file system's page, whose Used by panel carries the handover (6.8) |

The second line needs `ShareMgmt.getList`, read only when a file system was created in this session.
Beyond the session, the file system's page says "No shared folder uses it." without urging.

### 1.7 States

| State | Look |
| --- | --- |
| Loading | Header row and `TableSkeletonRows` (3); "Loading the file systems…" for assistive technology |
| Error (`getList` failed) | `EmptyState variant="error"` in the table body: "Could not read the file systems." + server message + "Try again". The toolbar stays |
| Empty (no row besides the system drive) | The system drive's row, then `EmptyState variant="empty"` under it: "There is no storage for files yet. Add a disk and create a file system on it to start." Action: router link "Add storage" (the toolbar already has the filled one, so this one is a link) |
| Refreshing | Rows stay with `aria-busy`; Refresh shows "Refreshing…"; afterwards "Read at" is announced |
| Populated | The table, then 1.5 |

### 1.8 Keyboard

Tab order: the unfinished-work actions, Add storage, Combine disks (BTRFS), Refresh, the sortable
headers, each row's file-system link and disk links, "Show progress" where present, the found
section's Mount buttons, the footer link. The table scrolls in its own named region at narrow widths.
After Refresh, focus stays on Refresh.

### 1.9 Copy

| Key | English |
| --- | --- |
| `filesystems.title` | File systems |
| `filesystems.intro` | A file system is how a disk stores files. Shared folders live on a file system, so it must be mounted for its folders to be reached. |
| `filesystems.add` | Add storage |
| `filesystems.addMulti` | Combine disks (BTRFS) |
| `filesystems.refresh` | Refresh |
| `filesystems.refreshing` | Refreshing… |
| `filesystems.readAt` | Read at {{time}}. |
| `filesystems.loading` | Loading the file systems… |
| `filesystems.loadFailed` | Could not read the file systems. |
| `filesystems.empty` | There is no storage for files yet. Add a disk and create a file system on it to start. |
| `filesystems.rollUp_one` / `_other` | {{count}} of {{total}} file system: {{status}} / {{count}} of {{total}} file systems: {{status}} |
| `filesystems.tableLabel` | File systems |
| `filesystems.col.name` | File system |
| `filesystems.col.state` | State |
| `filesystems.col.usage` | Usage |
| `filesystems.col.type` | Type |
| `filesystems.col.on` | On |
| `filesystems.col.usedBy` | Used by |
| `filesystems.open` | Open file system {{name}} |
| `filesystems.noReading` | No reading |
| `filesystems.diskGone` | Disk not connected |
| `filesystems.raidOn` | RAID <device></device> |
| `filesystems.usedBy.yes` | Shared folders or other settings |
| `filesystems.usedBy.no` | Nothing |
| `filesystems.usedByNote` | Used by: whether shared folders or other settings use the file system. Its page says which. |
| `filesystems.showProgress` | Show progress |
| `filesystems.noId` | This file system has no ID this page can use. Manage it in the classic interface. |
| `filesystems.system.name` | System drive |
| `filesystems.system.line` | Where openmediavault is installed. It is managed by the system, not here. |
| `filesystems.found.title` | Found on the disks, not mounted |
| `filesystems.found.intro` | These file systems are on the disks but not set up on this NAS. Mount one to use its files. Mounting changes nothing on the disk. |
| `filesystems.found.tableLabel` | File systems found on the disks |
| `filesystems.found.mount` | Mount… |
| `filesystems.found.mountName` | Mount {{name}} |
| `filesystems.found.cannotMount` | This NAS cannot mount {{type}} file systems. |
| `filesystems.found.failed` | Could not look for file systems that are not mounted. |
| `filesystems.unfinished.notMounted` | A file system on <disk></disk> is not mounted yet. |
| `filesystems.unfinished.notShared` | {{name}} is mounted, but nothing is shared from it yet. |
| `filesystems.unfinished.howToShare` | See how to share a folder on it |
| `filesystems.footerLine` | Quotas, and file system types this page does not offer, are in the classic interface. |
| `filesystems.classicLink` | File systems in the classic interface |
| `filesystem.state.setUpPending` | Set up. It is mounted when the changes are applied. |
| `filesystem.state.notMounted` | Not mounted. Its files cannot be reached. |
| `filesystem.state.creating` | Being created |
| `filesystem.reason.missing` | Missing. Its disk may be disconnected or have failed. |
| `filesystem.usage.full` | Full. Nothing more can be written to it. |
| `filesystem.usage.overLevel` | At or above its warning level of {{level}} |
| `filesystem.usage.unread` | Could not read how full it is |
| `fsType.ext4` … `fsType.zfs` | EXT4, XFS, BTRFS, F2FS, JFS, FAT, exFAT, NTFS, CD or DVD, ZFS |
| `fsName.onDevice` | {{type}} on <device></device> |

`filesystem.reason.missing`, `filesystem.usage.*` move from the dashboard's `dashboard.storage.*`
keys with the English unchanged (section 17, D19).

---

## 2. A file system's page

**Question it answers:** what is this file system, is it reachable, what uses it, and how is it set
up? **Leads to:** changing its warning level and tags, reading its technical details, growing it,
unmounting it, or removing it when its disk is gone.

Administrators only. Route `/storage/filesystems/$fs` (0.5). No menu item of its own; the File
systems item is current while it is open.

### 2.1 Data on opening

- The list page's queries (1.1), shared and warm when coming from there;
- `FsTab.getByFsName` with the row's `devicefile` (the stable path OMV stored), for the mount entry:
  its `uuid` for the Used by panel, and the saved warning level and tags for the form. It answers
  `false` when there is no entry. **[verify]** that the row's `devicefile` finds the entry for every
  status (the server also tries the file system's other names);
- `ShareMgmt.getList`, whole list, for the Used by panel (0.6).

The technical details (2.5) are read only on request.

### 2.2 Layout

1. **Breadcrumbs**: "File systems" (router link) › the name (current page).
2. **Page title**: "File system {{name}}". Beside it, the pending mark when 0.7 says so. Under it,
   `text-sm muted-foreground`: "{{type}}, {{size}}" (or "{{type}}" when the size is not read).
3. **State line**: the pill and reason of 0.2, in a `role="status"` region; for status 3, a second
   paragraph (2.3.1).
4. **Summary card** (2.3).
5. **Used by** (2.4), `h2` "Used by".
6. **Warning level and tags** (2.6), `h2` "Warning level and tags", not for status 3.
7. **Technical details** (2.5), `h2` "Technical details", not for status 3.
8. **Grow** (section 4), `h2` "Grow this file system", only when the type can grow while in use
   (`propresize`).
9. After a divider and a 24px gap, apart from everything that is only a setting: **"Unmount this file
   system"** (section 5) when it is mounted or set up, or **"Remove this file system from the NAS"**
   when it is missing or set up but not mounted with nothing pending.

One column; at 1024px and wider the summary facts take two columns. Document title: "{{name}} – File
systems – openmediavault" (`app.documentTitle`); the UUID is never in it.

### 2.3 Summary card

A `FactList`, in this order:

| Label | Value |
| --- | --- |
| State | 0.2's pill and reason |
| Usage | `CapacityMeter`, full size, with the figures and the usage pill; "No reading" when not mounted |
| Warning level | 0.1; "Off" with, `text-sm muted-foreground`, "No email and no dashboard warning when it fills up." |
| Tags | 0.1; "None" |
| Type | 0.1's word |
| On | The disks, as 1.3's column; for several, one per line |
| Device name | `canonicaldevicefile` in `Identifier`; for a missing one, "Not connected" |
| Folder on the NAS | `mountpoint` with `CopyButton` ("Copy folder path"). Hint, `text-sm muted-foreground`: "Shared folders are made inside this folder. Use a shared folder to reach files from other computers." |

Then a `Disclosure` **"Other names for this file system"** / "Hide other names": "UUID" (`uuid`),
"Stable name" (`devicefile`), "Other names" (`devlinks`, one per line), "Mount options" (`mountopts`,
split at commas, one per line), all in `Identifier`. These are what a support forum asks for; nobody
needs them to use the page.

#### 2.3.1 A missing file system

The state line's second paragraph: "OMV has this file system set up, but its disk is not connected or
has failed. If the disk was unplugged, connect it again and press Refresh. If the disk is gone for
good, remove this file system from the NAS below." **[verify]** whether a reconnected disk is mounted
again without a restart; if not, the sentence becomes "connect it again and restart the NAS".

The summary shows only State, Warning level, Tags, Type, the stable name and Folder on the NAS (the rest
cannot be read). The Used by panel is shown (it decides whether it can be removed).

### 2.4 Used by

`UsedByPanel`, `h2` "Used by" (0.6):

- Referrers: each shared folder on it, kind "Shared folder", its name, and a router link "Open Shared
  folders" (the Phase 3 list page; a shared folder has no page of its own yet).
- `_used` true with no shared folder found: Pattern G's sentence and the classic File systems link.
- Nothing: "Nothing uses this file system." When the file system was created in this session (or is
  mounted and has no shared folder at all), the panel adds the handover card of 6.8 under it, so the
  next step is never lost.
- Could not check: the panel's retry form, "Could not check which shared folders use this file
  system." + server message + "Try again".

### 2.5 Technical details

Read **only when the reader presses "Show technical details"**: `FileSystemMgmt.getDetails` with the
row's `canonicaldevicefile` (what the classic page passes). It reads the file system on the disk, so:

- Before: "The file system's own report: how it was made and its internal state. Reading it reads the
  disk, which wakes it if it has gone to sleep." and the button "Show technical details" (neutral).
- While reading: the button shows "Reading…" and ignores presses.
- After: "Read at {{time}}." and a labelled region ("Technical details of {{name}}") with the text on
  the terminal pair (`TaskLog`, `size="page"`, `wrap={false}`, no live follow), a "Copy report" control,
  and "Hide technical details".
- **Long reports.** An EXT4 report lists every block group, so on a large disk it is tens of thousands
  of lines **[verify]** its size on the VM and on a 4 TB file system. The region shows the first 500
  lines and "Showing the first 500 of {{count}} lines." with "Show all lines" (which renders the rest
  as text in the same frame); "Copy report" always copies everything.
- Failed: `InlineAlert tone="critical"` "Could not read the technical details." + server message +
  "Try again".

The report is server text, shown as text, untranslated; the sentence before it says it is the file
system's own report. It is kept in memory for the session and cleared at sign-out (UI-13).

### 2.6 Warning level and tags

A settings form (Phase 3, 0.4): label above, hint below, Save and Discard changes at the end. Not shown for a missing file system (nothing to watch) or one being created.

**Field 1, "Warn when it is this full"** (`Select`): "Off", "50%", "75%", "80%", "85%", "90%", "95%" (the
classic interface's choices). A saved value outside the list shows as "{{value}}% (set elsewhere)" and
stays selected until changed. Hint: "When the file system is fuller than this, the NAS emails you (when
email is set up) and the dashboard marks it Warning. Off turns both off."

**Field 2, "Tags"** (`TextField`): the saved `comment`. Hint: "Words that help you recognise this file
system, such as Media or Backups, separated by commas. They are shown when you choose where to put a
shared folder." At most 200 characters, in words when longer ("Use at most 200 characters.")
**[verify]** what the classic tag field writes for several tags and whether the server limits the
length.

**Save** re-reads the entry with `FsTab.getByFsName` (R4), then writes `FsTab.set` with every field of
the re-read entry (`uuid`, `fsname`, `dir`, `type`, `opts`, `freq`, `passno`, `hidden`) and the two from
the form. The form never changes anything else. Then the save-then-apply loop: `common.savedPending`,
the band, and the pending mark of 0.7.

| State | Look |
| --- | --- |
| Loading | The two fields' skeletons |
| `FsTab.getByFsName` failed | `InlineAlert tone="critical"` "Could not read this file system's settings." + server message + "Try again"; the fields are not shown |
| No entry (`false`) | "This file system is not set up on this NAS any more." and Refresh; no form |
| Populated | The form with the saved values |
| Saving | "Saving…", fields read-only |
| Save failed | `FormAlert` critical "The settings were not saved." + server message |
| Re-read finds no entry | `FormAlert` critical "This file system was removed from the NAS while you edited. Nothing was saved." |
| Pending | The pending mark; the band |

### 2.7 Keyboard and focus

Tab order: the breadcrumb link, the summary's disk links and Copy folder path, "Other names for this
file system", the Used by panel's links (or its Try again), the form (warning level, tags, Save,
Discard changes), Show technical details (then the report region, Show all lines, Copy report, Hide),
Grow file system…, then the last section's button. After a save, focus stays on Save.

### 2.8 States of the page

| State | Look |
| --- | --- |
| Loading | Title skeleton; the summary as `FactListSkeleton`; the sections' headings with skeletons |
| `getList` failed | `EmptyState variant="error"` in place of the content: "Could not read this file system." + server message + "Try again" |
| No such file system (pattern fails, or no row) | `EmptyState variant="empty"`: "This file system is not set up on this NAS. It may have been unmounted or removed." and a router link "Show all file systems" → `/storage/filesystems` |
| Gone after a re-read (unmounted in another tab) | The same empty state |
| Missing (status 3) | 2.3.1; the last section is "Remove this file system from the NAS" |
| Populated | 2.2 |

### 2.9 Copy

| Key | English |
| --- | --- |
| `filesystem.breadcrumb` | File systems |
| `filesystem.title` | File system {{name}} |
| `filesystem.subtitle` | {{type}}, {{size}} |
| `filesystem.documentTitle` | {{name}} – File systems |
| `filesystem.loading` | Loading the file system… |
| `filesystem.loadFailed` | Could not read this file system. |
| `filesystem.notFound` | This file system is not set up on this NAS. It may have been unmounted or removed. |
| `filesystem.showAll` | Show all file systems |
| `filesystem.missingBody` | OMV has this file system set up, but its disk is not connected or has failed. If the disk was unplugged, connect it again and press Refresh. If the disk is gone for good, remove this file system from the NAS below. |
| `filesystem.fact.state` | State |
| `filesystem.fact.usage` | Usage |
| `filesystem.fact.level` | Warning level |
| `filesystem.fact.levelOff` | Off |
| `filesystem.fact.levelOffHint` | No email and no dashboard warning when it fills up. |
| `filesystem.fact.tags` | Tags |
| `filesystem.fact.type` | Type |
| `filesystem.fact.on` | On |
| `filesystem.fact.device` | Device name |
| `filesystem.fact.notConnected` | Not connected |
| `filesystem.fact.folder` | Folder on the NAS |
| `filesystem.fact.copyFolder` | Copy folder path |
| `filesystem.fact.folderHint` | Shared folders are made inside this folder. Use a shared folder to reach files from other computers. |
| `filesystem.names.show` | Other names for this file system |
| `filesystem.names.hide` | Hide other names |
| `filesystem.names.uuid` | UUID |
| `filesystem.names.stable` | Stable name |
| `filesystem.names.links` | Other names |
| `filesystem.names.options` | Mount options |
| `filesystem.usedBy.title` | Used by |
| `filesystem.usedBy.sharedFolder` | Shared folder |
| `filesystem.usedBy.openShared` | Open Shared folders |
| `filesystem.usedBy.other` | Used by a setting this interface does not show yet, such as a quota or an add-on. |
| `filesystem.usedBy.none` | Nothing uses this file system. |
| `filesystem.usedBy.failed` | Could not check which shared folders use this file system. |
| `filesystem.settings.title` | Warning level and tags |
| `filesystem.settings.level` | Warn when it is this full |
| `filesystem.settings.levelOff` | Off |
| `filesystem.settings.levelElsewhere` | {{value}}% (set elsewhere) |
| `filesystem.settings.levelHint` | When the file system is fuller than this, the NAS emails you (when email is set up) and the dashboard marks it Warning. Off turns both off. |
| `filesystem.settings.tags` | Tags |
| `filesystem.settings.tagsHint` | Words that help you recognise this file system, such as Media or Backups, separated by commas. They are shown when you choose where to put a shared folder. |
| `filesystem.settings.tagsTooLong` | Use at most 200 characters. |
| `filesystem.settings.loadFailed` | Could not read this file system's settings. |
| `filesystem.settings.noEntry` | This file system is not set up on this NAS any more. |
| `filesystem.settings.saveFailed` | The settings were not saved. |
| `filesystem.settings.removedMeanwhile` | This file system was removed from the NAS while you edited. Nothing was saved. |
| `filesystem.details.title` | Technical details |
| `filesystem.details.intro` | The file system's own report: how it was made and its internal state. Reading it reads the disk, which wakes it if it has gone to sleep. |
| `filesystem.details.show` | Show technical details |
| `filesystem.details.hide` | Hide technical details |
| `filesystem.details.reading` | Reading… |
| `filesystem.details.readAt` | Read at {{time}}. |
| `filesystem.details.label` | Technical details of {{name}} |
| `filesystem.details.partial` | Showing the first {{shown}} of {{count}} lines. |
| `filesystem.details.showAllLines` | Show all lines |
| `filesystem.details.copy` | Copy report |
| `filesystem.details.failed` | Could not read the technical details. |

---

## 3. Mount a file system found on a disk

From the found section (1.5) and the unfinished-work notice (1.6). Not destructive: it writes a mount
entry and marks modules pending (0.7); nothing on the disk changes.

`Dialog` (not a confirmation), title "Mount {{name}}":

1. "Mounting makes its files reachable, so you can put shared folders on it. Nothing on the disk is
   changed. It is mounted when you apply the changes."
2. The file system, named: type, the disk (device, model, size), and, when the file system has a
   label, the label.
3. "Warn when it is this full" (2.6's field, default **85%**, the classic mount form's default and
   Flow A's, A7).
4. "Tags" (2.6's field, empty).
5. Buttons: **"Save"** (filled) and "Cancel". Enter in a field submits (this is a form; nothing is
   destroyed).

On Save: `FileSystemMgmt.setMountPoint` with `id` the candidate's `devicefile`, `usagewarnthreshold`,
and `comment`. The dialog closes, the lists are read again, the file system moves to the main table
with "Set up. It is mounted when the changes are applied." and the pending mark, and the band offers
Apply. Focus returns to the main table's Refresh (the Mount button it came from is gone), and
"{{name}} is set up. Apply the changes to mount it." is announced politely.

| State | Look |
| --- | --- |
| Saving | "Saving…", fields read-only, Cancel unavailable |
| Failed | `FormAlert` critical "The file system was not set up." + server message (for example the server's "A mount point already exists", when another tab mounted it first: then "Refresh" is offered beside it) |

| Key | English |
| --- | --- |
| `fsMount.title` | Mount {{name}} |
| `fsMount.intro` | Mounting makes its files reachable, so you can put shared folders on it. Nothing on the disk is changed. It is mounted when you apply the changes. |
| `fsMount.label` | Label |
| `fsMount.save` | Save |
| `fsMount.cancel` | Cancel |
| `fsMount.failed` | The file system was not set up. |
| `fsMount.saved` | {{name}} is set up. Apply the changes to mount it. |

---

## 4. Grow a file system

**Question it answers:** the storage under this file system was made bigger; can the file system use
the new space? **Leads to:** a bigger file system.

`FileSystemMgmt.grow {id: uuid}`. It makes the file system fill the device it is on. It is **not
reversible** here (nothing in OMV shrinks a file system), it loses nothing, and the file system stays
in use while it grows. It is a **synchronous** call: the request lasts as long as the resize. It marks
nothing pending.

What it does not do: it does not enlarge a partition. A file system that OMV created on a disk sits in
a partition that already fills the disk, so growing it after nothing changed does nothing. The real
uses are a file system made directly on a RAID array after a disk was added to the array (the RAID
slice will link here), and storage enlarged by other means.

### 4.1 The section

`h2` "Grow this file system", only when `propresize` is true:

- "Use this after the storage under the file system has been made bigger, for example after adding a
  disk to its RAID array. The file system then uses all the space now available. If nothing was made
  bigger, nothing changes."
- Button **"Grow file system…"** (neutral).

Unavailable (`aria-disabled`, focusable), with the reason in words beside it:

| Blocker | Words |
| --- | --- |
| Not mounted, or not available | "It must be mounted to grow." |
| Read-only (`_readonly`) | "It is read-only, so it cannot be grown." |
| BTRFS on several disks (`hasmultipledevices`) | "It spans several disks. Growing it here would grow only its first disk's part, so it is not offered." (section 17, D12) **[verify]** on the VM what the server's command does on several disks |
| Being unmounted, or grown already in this session and still running | "It is being changed now." |

### 4.2 The confirmation

`ConfirmDialog variant="destructive"`: warning-shape icon, the red confirm button, focus on Cancel, no
form so Enter does not confirm, Escape and Cancel close it, the scrim does not. It is destructive in
form because it cannot be undone (style guide 3.6), but asks for no typing, because nothing is lost
(UI-8 keeps typing for data loss; section 18, P5).

1. Title: "Grow file system {{name}}?"
2. The file system, named: type, device, the disk or array it is on (with model), its size now.
3. The consequence, one sentence: "It is made to use all the space on {{device}}. This cannot be
   undone: a file system cannot be made smaller again here."
4. "Nothing on it is changed or lost, and it stays in use while it grows. Growing can take a few
   minutes; keep this page open until it ends."
5. Buttons: "Cancel" (focused) and **"Grow file system"** (`destructive`).

**On "Grow file system":** the button shows "Checking again…", the interface re-reads `getList`, and if
the row is gone, not mounted, or no longer the same file system (`uuid`), the dialog shows "This file
system changed since the page was read." and Close; nothing is grown. Otherwise the dialog closes and
the section shows "Growing {{name}}… Keep this page open." (`role="status"`, the button in its loading
state).

### 4.3 When it ends

The lists are re-read and the size compared with the one before:

| Result | Section shows (stays until dismissed) |
| --- | --- |
| Bigger | `JobResult` succeeded: "{{name}} was grown." then "It is now {{size}} (it was {{before}})." |
| Same size | `JobResult` succeeded: "{{name}} already used all the space available. Nothing changed." |
| Failed | `JobFailure`: "{{name}} was not grown." + server message (for example "does not support online resizing"). "The file system stays in use." "Try again…" reopens the dialog |
| The request was cut (timeout or connection) | `InlineAlert` (Unknown treatment): "Could not tell whether growing finished. It may still be running on the NAS." and Refresh **[verify]** whether a cut request stops the resize, and the longest the web server lets a request run |

### 4.4 Copy

| Key | English |
| --- | --- |
| `fsGrow.title` | Grow this file system |
| `fsGrow.intro` | Use this after the storage under the file system has been made bigger, for example after adding a disk to its RAID array. The file system then uses all the space now available. If nothing was made bigger, nothing changes. |
| `fsGrow.open` | Grow file system… |
| `fsGrow.blocked.notMounted` | It must be mounted to grow. |
| `fsGrow.blocked.readOnly` | It is read-only, so it cannot be grown. |
| `fsGrow.blocked.multi` | It spans several disks. Growing it here would grow only its first disk's part, so it is not offered. |
| `fsGrow.blocked.busy` | It is being changed now. |
| `fsGrow.dialogTitle` | Grow file system {{name}}? |
| `fsGrow.sizeNow` | Size now: {{size}} |
| `fsGrow.consequence` | It is made to use all the space on <device></device>. This cannot be undone: a file system cannot be made smaller again here. |
| `fsGrow.safe` | Nothing on it is changed or lost, and it stays in use while it grows. Growing can take a few minutes; keep this page open until it ends. |
| `fsGrow.cancel` | Cancel |
| `fsGrow.confirm` | Grow file system |
| `fsGrow.checkingAgain` | Checking again… |
| `fsGrow.changed` | This file system changed since the page was read. |
| `fsGrow.close` | Close |
| `fsGrow.running` | Growing {{name}}… Keep this page open. |
| `fsGrow.doneTitle` | {{name}} was grown. |
| `fsGrow.doneBody` | It is now {{size}} (it was {{before}}). |
| `fsGrow.sameTitle` | {{name}} already used all the space available. Nothing changed. |
| `fsGrow.failedTitle` | {{name}} was not grown. |
| `fsGrow.failedBody` | The file system stays in use. |
| `fsGrow.again` | Try again… |
| `fsGrow.unknown` | Could not tell whether growing finished. It may still be running on the NAS. |
| `fsGrow.dismiss` | Dismiss |

---

## 5. Unmount a file system, and remove a missing one

**Question it answers:** can I stop using this file system, and what stops working if I do? **Leads
to:** a file system no longer set up on this NAS, which stays on its disk and can be mounted again (or,
for a missing one, a list without the stale entry).

Both use `FileSystemMgmt.umountByDir {dir: mountpoint}`. For a mounted file system it unmounts it,
deletes its mount entry, applies `fstab` at once, and removes the empty mount folder. For a missing one
(or one set up but not mounted) there is nothing to unmount, so it only deletes the entry and applies
(read from source). The server does not check whether shared folders use it (UX audit J9, B10); this
interface does. It is a synchronous call and slow, because of its own apply.

### 5.1 The section

For a mounted file system, or one set up with its mount pending: `h2` **"Unmount this file system"**:

- "Unmounting stops the NAS from using this file system. Nothing on it is deleted, and you can mount it
  again later."
- Button **"Unmount…"** (neutral).

For a missing file system, or one set up but not mounted with nothing pending: `h2` **"Remove this
file system from the NAS"**:

- "Removes the NAS's setting for this file system. Nothing on any disk is changed. Do this when its
  disk is gone for good."
- Button **"Remove from the NAS…"** (neutral).

A mount that is only pending is undone with the band's Undo, which this section says instead when that
is the only pending change: "This mount is not applied yet. To cancel it, undo the pending changes in
the band at the top of the page."

Unavailable (`aria-disabled`, focusable), the blocker in words beside the button, each with what to
do:

| Blocker | Words | What to do |
| --- | --- | --- |
| Used (`_used`), shared folders found | "Shared folders use it: {{list}}." | "Delete those shared folders, or move them to another file system, first." Router link "Open Shared folders" and `ExternalLink` "Shared folders in the classic interface" |
| Used, nothing found | "A setting this interface does not show yet uses it, such as a quota or an add-on." | `ExternalLink` "File systems in the classic interface", which shows the same refusal and the "Referenced" column |
| Read-only or the system drive | "It is read-only, so it cannot be unmounted here." | none |
| Being created | "It is being created now." | none |
| `propfstab` false | "This kind of file system is not mounted through the NAS's settings, so it cannot be unmounted here." | none |
| Being grown, or unmounted in this session and still running | "It is being changed now." | none |

The classic links here lead to removing the blocker, never round it: the classic File systems page
refuses an unmount while the file system is used, as this one does.

### 5.2 The check before the dialog

Pressing the button re-reads `getList`, `ShareMgmt.getList` and `dirtyModules`. The dialog opens at
once with "Checking…" (`aria-busy`, Cancel available), then shows one of:

- **A refusal** that appeared since the page was read: title "This file system cannot be unmounted
  now" (or "…removed now"), the blocker of 5.1, Close. The page's section updates.
- **Other changes are pending** (anything in `dirtyModules`): `PreflightNotice` inside the dialog,
  title "Some changes are not applied yet", body "Unmounting applies some changes at once and clears
  what lets the band undo the others. Apply or undo them first." with the band's list in words, and
  "Apply them now" / "Undo them" (the band's own confirmations). When nothing is pending any more, the
  dialog continues to the confirmation.
- **Gone**: "This file system is no longer set up on this NAS." and Close.
- **The confirmation** (5.3).

### 5.3 The confirmation

**Unmount:** `ConfirmDialog variant="destructive"` (it cuts access: style guide 5.4), focus on Cancel,
Enter does not confirm, no typing (nothing is lost and it can be mounted again; section 18, P6):

1. Title: "Unmount {{name}}?"
2. The file system, named: type, device, the disk (model), how full, and "Folder on the NAS" with the
   path in `Identifier`.
3. The consequence, one sentence: "Its files cannot be reached until it is mounted again. Nothing on it
   is deleted."
4. "What stops working" (`h3`), a list:
   - "Programs and settings that use its folder directly, rather than through a shared folder, such as
     a container or a backup job set up by hand. They may then write to the system drive instead."
   - "Its warning level and tags are removed. You set them again when you mount it."
   - "If a program or a computer is using its files at this moment, unmounting fails and nothing is
     changed."
5. "Afterwards it is listed under Found on the disks, not mounted, where you can mount it again."
6. Buttons: "Cancel" (focused) and **"Unmount"** (`destructive`).

**Remove a missing file system:** `ConfirmDialog` default variant (nothing is reachable now, so nothing
is cut off), focus on Cancel:

1. Title: "Remove {{name}} from the NAS?"
2. Its type, stable name and folder path.
3. "This removes the NAS's setting for a file system whose disk is not connected. Nothing on any disk
   is changed. Its warning level and tags are removed."
4. "If the disk comes back, you can mount the file system again under File systems."
5. Buttons: "Cancel" (focused) and **"Remove from the NAS"** (filled).

**On confirm**, both re-check once more (the button shows "Checking again…": the same three reads),
then close the dialog, and the section becomes a small step list (`JobStepList`), focus on its heading:

| # | Step | Calls |
| --- | --- | --- |
| 1 | "Unmount {{name}}" (or "Remove {{name}} from the NAS") | `FileSystemMgmt.umountByDir` with the row's `mountpoint` |
| 2 | "Apply the remaining changes" | Re-read `dirtyModules` (R10): expected `collectd`, `monit`, `quota` **[verify]** V8; then `Config.applyChangesBg` |
| 3 | "Check that it is unmounted" | `getList` (the row is gone) and `getMountCandidates` (for an unmount, it is listed) |

Step 2 runs without asking again: the pre-flight held, so only this action's own changes are pending,
and leaving them in the band would make "Unmount" look half done. If R10 finds other modules pending
(another administrator saved meanwhile), the step pauses with `AlsoPendingPrompt` "Also pending from
elsewhere: {{list}}. Applying applies them too.", "Apply them too" / "Stop here" (the remaining changes
then stay in the band).

### 5.4 When it ends

| Result | Section shows (stays until dismissed) |
| --- | --- |
| Unmounted | `JobResult` succeeded: "{{name}} was unmounted." then "Its files stay on the disk. To use them again, mount it under Found on the disks, not mounted." with a router link "Go to File systems". The page itself then shows the not-found state under the result |
| Removed | `JobResult` succeeded: "{{name}} was removed from the NAS." and "Go to File systems" |
| Step 1 failed, busy | `JobFailure`: "{{name}} was not unmounted." + server message, then "Something is still using its files. Nothing was changed. Stop the program or close the files on the other computer, then try again." "Try again…" reopens the dialog. **[verify]** the server's message when the file system is busy, and that nothing was deleted |
| Step 1 failed, other | `JobFailure`: "{{name}} was not unmounted." + server message + "Try again…" |
| Step 2 failed | R7: "{{name}} was unmounted, but applying the remaining changes failed." + server message; "Try applying again" first; the changes stay in the band, which offers Undo **[verify]** V5 |
| Step 3 finds it still there | "The NAS still lists {{name}} as set up." and "Check again" |

### 5.5 Keyboard and screen readers

The dialogs: focus on Cancel; Tab order Cancel, then the confirm button; the consequence is the
dialog's description, read with the title. During the steps, step changes are announced politely and
a failure assertively, focus on the failure's heading. "Unmounting {{name}} started." is announced on
start.

### 5.6 Copy

| Key | English |
| --- | --- |
| `fsUnmount.title` | Unmount this file system |
| `fsUnmount.intro` | Unmounting stops the NAS from using this file system. Nothing on it is deleted, and you can mount it again later. |
| `fsUnmount.open` | Unmount… |
| `fsUnmount.pendingOnly` | This mount is not applied yet. To cancel it, undo the pending changes in the band at the top of the page. |
| `fsUnmount.blocked.shared` | Shared folders use it: {{list}}. |
| `fsUnmount.blocked.sharedDo` | Delete those shared folders, or move them to another file system, first. |
| `fsUnmount.blocked.other` | A setting this interface does not show yet uses it, such as a quota or an add-on. |
| `fsUnmount.blocked.readOnly` | It is read-only, so it cannot be unmounted here. |
| `fsUnmount.blocked.creating` | It is being created now. |
| `fsUnmount.blocked.noFstab` | This kind of file system is not mounted through the NAS's settings, so it cannot be unmounted here. |
| `fsUnmount.blocked.busy` | It is being changed now. |
| `fsUnmount.sharedLink` | Shared folders in the classic interface |
| `fsUnmount.checking` | Checking… |
| `fsUnmount.refusedTitle` | This file system cannot be unmounted now |
| `fsUnmount.goneBody` | This file system is no longer set up on this NAS. |
| `fsUnmount.preflightTitle` | Some changes are not applied yet |
| `fsUnmount.preflightBody` | Unmounting applies some changes at once and clears what lets the band undo the others. Apply or undo them first. |
| `fsUnmount.applyThem` | Apply them now |
| `fsUnmount.undoThem` | Undo them |
| `fsUnmount.dialogTitle` | Unmount {{name}}? |
| `fsUnmount.consequence` | Its files cannot be reached until it is mounted again. Nothing on it is deleted. |
| `fsUnmount.stopsTitle` | What stops working |
| `fsUnmount.stops.direct` | Programs and settings that use its folder directly, rather than through a shared folder, such as a container or a backup job set up by hand. They may then write to the system drive instead. |
| `fsUnmount.stops.settings` | Its warning level and tags are removed. You set them again when you mount it. |
| `fsUnmount.stops.busy` | If a program or a computer is using its files at this moment, unmounting fails and nothing is changed. |
| `fsUnmount.afterwards` | Afterwards it is listed under Found on the disks, not mounted, where you can mount it again. |
| `fsUnmount.cancel` | Cancel |
| `fsUnmount.confirm` | Unmount |
| `fsUnmount.checkingAgain` | Checking again… |
| `fsUnmount.started` | Unmounting {{name}} started. |
| `fsUnmount.steps` | Steps |
| `fsUnmount.step.unmount` | Unmount {{name}} |
| `fsUnmount.step.apply` | Apply the remaining changes |
| `fsUnmount.step.verify` | Check that it is unmounted |
| `fsUnmount.alsoBody` | Also pending from elsewhere: {{list}}. Applying applies them too. |
| `fsUnmount.applyToo` | Apply them too |
| `fsUnmount.stop` | Stop here |
| `fsUnmount.doneTitle` | {{name}} was unmounted. |
| `fsUnmount.doneBody` | Its files stay on the disk. To use them again, mount it under Found on the disks, not mounted. |
| `fsUnmount.toList` | Go to File systems |
| `fsUnmount.failedTitle` | {{name}} was not unmounted. |
| `fsUnmount.busyBody` | Something is still using its files. Nothing was changed. Stop the program or close the files on the other computer, then try again. |
| `fsUnmount.again` | Try again… |
| `fsUnmount.applyFailed` | {{name}} was unmounted, but applying the remaining changes failed. |
| `fsUnmount.tryApply` | Try applying again |
| `fsUnmount.stillThere` | The NAS still lists {{name}} as set up. |
| `fsUnmount.checkAgain` | Check again |
| `fsRemove.title` | Remove this file system from the NAS |
| `fsRemove.intro` | Removes the NAS's setting for this file system. Nothing on any disk is changed. Do this when its disk is gone for good. |
| `fsRemove.open` | Remove from the NAS… |
| `fsRemove.refusedTitle` | This file system cannot be removed now |
| `fsRemove.dialogTitle` | Remove {{name}} from the NAS? |
| `fsRemove.body` | This removes the NAS's setting for a file system whose disk is not connected. Nothing on any disk is changed. Its warning level and tags are removed. |
| `fsRemove.comesBack` | If the disk comes back, you can mount the file system again under File systems. |
| `fsRemove.confirm` | Remove from the NAS |
| `fsRemove.step` | Remove {{name}} from the NAS |
| `fsRemove.doneTitle` | {{name}} was removed from the NAS. |
| `fsRemove.failedTitle` | {{name}} was not removed. |

---

## 6. Flow A: "Add storage"

The UX audit's Flow A (4.2), J2 "Add a new disk and share a folder on it", as the owner answered Q1 to
Q4, Q6 and Q9. Route `/storage/filesystems/add`, no menu item; reached from the File systems toolbar,
the dashboard's Storage card, a disk's page (after a wipe, and from its summary when it is empty), and
the list's empty state. Breadcrumbs: "File systems" › "Add storage". It follows R1 to R10 with the
library's job-runner parts.

### 6.1 Scope: what the flow does, and where it hands over

| Stage | In this slice | Calls |
| --- | --- | --- |
| A. Disk | **The flow does it**: choose the disk, erase it when it holds something, create the file system | cleared methods (12) |
| B. Mount | **The flow does it**: set up the mount, then the checkpoint **"Mount the new file system"** (Q1), then check it is mounted | cleared methods |
| C. Share | **Handed over to the classic interface**, with exact steps and choices (6.8), until the shares domain is built and the owner clears its methods (section 8) | none in this slice |

This keeps the flow within what this slice's contract can do. The flow's title says what it does
("Add storage"), and its summary and result say plainly that sharing is the next step, done in the
classic interface for now. When the shares methods are cleared, stage C joins the same flow and the
title becomes "Add storage and share it" (section 8).

| | Stock (J2) | Flow A here, this slice | With stage C (section 8) |
| --- | --- | --- | --- |
| Pages | 10, in 2 menu sections | 1, then 4 classic pages for sharing | 1 |
| Dialogs and task windows | 6 | 0 (one confirmation in the page) | 0 |
| Saves by the reader | 5 | 0 here, then 4 in the classic interface | 0 |
| Applies by the reader | 2 (one forced halfway) | 0 here (the flow applies once), then 1 | 0 (the flow applies twice) |

### 6.2 Pre-flight (R1)

On opening, the page reads `dirtyModules` (the shell's, already warm). If anything is pending, the flow
does not start (Q2): `PreflightNotice` "Some changes are not applied yet", the band's list in words, and
"Apply them now" / "Undo them", with the band's own confirmations. When nothing is pending any more,
the flow continues.

Then it reads, in parallel: `FileSystemMgmt.getCandidatesBg` (a task; "Looking for disks that can hold
new storage…"), and the disk-use inputs of the disks slice's 0.6 (`DiskMgmt.getList`,
`FileSystemMgmt.getList`, `FileSystemMgmt.enumerateFilesystems`, `MdMgmt.enumerateDevices`, shared and
often warm). The sentence above the disk choice says that looking may read the disks (0.4).

### 6.3 Which disks are offered

Each device is placed by both the server's candidate list and the disks slice's disk-use model, and
**the stricter one wins** (journal, 2026-11-21):

| Group | A device is here when | Shown as |
| --- | --- | --- |
| **Empty disks** | It is in `getCandidatesBg` and the disk-use model finds nothing on it ("Nothing found", or "Empty (wiped at …)" in this session) | Offered first |
| **RAID arrays** (only with the RAID plugin) | It is a RAID array in `getCandidatesBg`, with no file system | Offered, after empty disks: "RAID {{name}} ({{level}}, {{count}} disks)" |
| **Erase and reuse** | It is a disk, not in `getCandidatesBg` (the server sees something on it), and the disk-use model allows a wipe ("Nothing found", or "File system {{name}}, not used on this NAS") | Offered, under its own heading, each with what is on it (6.4) |
| **Cannot be used** | Anything else in `DiskMgmt.getList`: the system disk, a read-only disk, a disk with a file system in use, set up or being created, swap, a RAID member, a disk being wiped | Not offered; listed in a `Disclosure` "Disks that cannot be used ({{count}})", each with the disks slice's blocker sentence (its 3.1), so the reader learns why a disk is missing |
| A device in `getCandidatesBg` the interface cannot place (not a disk in `DiskMgmt.getList`, not a known array) **[verify]** whether this occurs (partitions, loop or LVM devices) | | Not offered; listed under "Cannot be used" with "This page cannot tell what this device is, so it is not offered. Use the classic interface for it." |

**Fail closed**: if the disk-use inputs or the candidate task fail, nothing is offered:
`EmptyState variant="error"` "Could not check which disks can be used." + server message + "Try
again".

### 6.4 Decisions, in one form

`JobRunner` with the title "Add storage" (`h2`; the page title is "File systems").

**A1. Where to put it** (`RadioGroupField` with groups, legend "Disk"; one choice). Each option names
the device exactly, as the wipe confirmation does: the device (`Identifier`), the model, the size;
under it, `text-xs muted-foreground`, the serial number. For "Erase and reuse", one more line in the
body colour: what is on it ("Holds the file system {{name}} ({{type}}, {{size}}), not used on this
NAS." or "No file system was found, but the disk is not empty, for example old partitions."). Groups,
in order: "Empty disks", "RAID arrays", "Erase and reuse". Nothing is chosen by default when more than
one device is offered; one offered device is chosen.

- No device offered at all: `EmptyState variant="empty"`: "No disk can hold new storage right now.
  Connect a new disk, or free one that is in use." with "Look for new disks" (`DiskMgmt.rescan` then the
  reads again, as the Disks page does) and the "Disks that cannot be used" list open.
- Fewer than two disks offered: "Combine disks (BTRFS)" is not mentioned. Two or more: a line under the
  group, `text-sm`: "To combine several disks into one file system, use Combine disks (BTRFS)." with a
  router link.

**A2. Format** (`RadioGroupField`, legend "Format", four options, Q3):

1. **"Standard (EXT4), recommended"** (default). Hint: "Works well for almost everything. This is what
   most NAS owners use."
2. "XFS". Hint: "Good for very large files, such as video. It can be made bigger later, but not
   smaller."
3. "BTRFS". Hint: "Can keep snapshots of earlier versions of your files. Snapshots are managed in the
   classic interface."
4. "F2FS". Hint: "Made for flash cards and USB sticks. Not for hard disks."

JFS, which the classic interface also offers, is left out (section 17, D9).

**A3. Tags** (`TextField`, optional), 2.6's field and hint. Placeholder: "For example: Media".

**A4. Warn when it is this full** (`Select`), 2.6's field, default **85%** (A7).

**What the flow does with sharing** (read only, no field), `text-sm`: "Sharing a folder on it with your
computers is the next step. This page shows you how when the storage is ready." (Until stage C.)

Buttons at the end: **"Continue"** (filled) to the summary. The breadcrumb leads back.

### 6.5 Summary and confirmation (R2)

`JobSummary` with `typedConfirmation`, title "Ready to add storage". One item per action, in plain
words, in the order they run:

- Erase and reuse only: "Erase {{device}} ({{model}}, serial number {{serial}}, {{size}} ({{label}} on
  the label)). Everything on it is lost: {{what}}." where `{{what}}` is the "On this disk now" line of
  6.4.
- Empty disk: "Use the whole of {{device}} ({{model}}, serial number {{serial}}, {{size}} ({{label}}
  on the label)). Anything on it is overwritten."
- "Create an EXT4 file system on it." (for a RAID array: "…on the RAID array {{name}}, which keeps
  its disks as they are."). One sentence per format, so that each language words its article with the
  type ("an EXT4", "an XFS", "a BTRFS", "an F2FS").
- "Tag it {{tags}}." (only with tags)
- "Warn when it is {{level}} full." / "No warning when it fills up."
- "Then mount it, which applies the changes for it. Nothing else is pending."
- "Sharing a folder on it comes next, in the classic interface for now."

Then the **typed confirmation** (the wipe pattern, UI-8): "Type {{device}} to confirm." The match is
exact and case-sensitive, surrounding spaces ignored (`typedMatches`). The confirm button **"Erase disk
and create file system"** (`destructive`; for a RAID array "Erase array and create file system") is
unavailable until it matches, with the hint "The button is available once the name matches." Beside it,
"Change choices" (neutral), which returns to the form with every choice kept.

There is no form element around the summary: Enter in the typed field does nothing. On arrival, focus
moves to the summary's heading (it is in the page, not a dialog, and nothing on it acts on arrival).
There is no second confirmation: one named, typed confirmation is the gate (style guide 5.4).

### 6.6 The steps (R3, R5)

`JobStepList`, each step with its state word (Waiting, Running, Succeeded, Failed, Cancelled). Reads and
checks first, then what cannot be undone, then configuration, then the checkpoint, then the check:

| # | Step label | Calls | Notes |
| --- | --- | --- | --- |
| 1 | "Check {{device}} again" | `getCandidatesBg`, `DiskMgmt.getList`, `FileSystemMgmt.getList`, `enumerateFilesystems`, `MdMgmt.enumerateDevices` | The device must still be offered in the same group (6.3), with the same `serialnumber` and `model` as the summary showed (for a RAID array: the same array `uuid` and member list). Otherwise the flow stops before anything is erased (6.7) |
| 2 | "Erase {{device}}" (Erase and reuse only) | `DiskMgmt.wipe {devicefile, secure: false}` (the quick wipe of the disks slice), a task, output in a `Disclosure` | Then `getCandidatesBg` once more: the disk must now be a candidate |
| 3 | "Create the {{format}} file system" | `FileSystemMgmt.create {devicefile, type}`, a task; output (mkfs) in a `Disclosure` | `devicefile` from step 1's fresh row (the stable path). For BTRFS on one disk, `create` with `type: "btrfs"` as for the others (17, D10) |
| 4 | "Find the new file system" | `FileSystemMgmt.getMountCandidates` | The entry whose `parentdevicefile` is one of the device's names (the disks slice's partition rule) **[verify]** V3. Exactly one must match |
| 5 | "Set up the mount" | `FileSystemMgmt.setMountPoint {id: <the entry's devicefile>, usagewarnthreshold, comment}` | Marks `fstab`, `collectd`, `monit`, `quota` pending (0.7) |
| 6 | **"Mount the new file system"** (the checkpoint, Q1) | Re-read `dirtyModules` (R10): expected exactly the four of step 5 **[verify]** V8; then `Config.applyChangesBg` | Labelled as the mount, not as "Apply" |
| 7 | "Check that it is mounted" | `FileSystemMgmt.getList` (the row is status 1, `mounted` true), `FsTab.getByFsName` (the entry exists) | Never continue when it is not mounted (UX audit B8, V1) |

While a task step runs, it shows "Running for {{duration}}" (not announced) and its output on the
terminal pair, following the tail. The tasks are in the top bar's Tasks menu: "Erase disk {{device}}",
"Create file system on {{device}}", "Apply changes". Leaving the page does not stop them; coming back
shows the step list again from the registry. A reload ends the flow view (R8; 1.6 takes over).

When a task fails, OMV answers the next output read with the failure and gives no more output
(`Exec.getOutput` fails with the task's error). The output block keeps what was read before, and the
failure's message is shown with the failure (6.7). An empty block then says "The output of this task
could not be read." (or, when the call that starts the task failed, "This task did not start, so it
has no output."), never "This task wrote no output.", which is kept for a task that ended without
failing.

No step can be cancelled: a half-made file system helps nothing, and the quick wipe takes seconds.

### 6.7 Failures (R6, R7, R10)

The flow stops at the failed step, never retries by itself (UI-14), and says what succeeded, what failed
(the server's message as text, UI-9) and what did not run. Focus moves to the failure's heading.

| Fails at | The system is left | The reader sees | Offered |
| --- | --- | --- | --- |
| 1, a blocker appeared | unchanged | "{{device}} cannot be used now." + the blocker sentence | "Choose another disk" (back to the form, the choice cleared); nothing to undo |
| 1, the disk changed | unchanged | "The disk now called {{device}} is not the one you chose. Nothing was erased. Choose again." | "Choose again" (the form, re-read) |
| 1, a read failed | unchanged | "Could not check {{device}} again, so nothing was erased." + message | "Try this step again"; "Stop here" |
| 2 erase | disk unchanged or partly erased | "{{device}} could not be erased." + the output open | "Try this step again"; "Stop here" (the disk may now show as empty) |
| 2, still not a candidate after erasing | erased | "{{device}} was erased, but the NAS still does not offer it for a new file system." | "Check again"; "Stop here" |
| 3 create | disk erased; no usable file system | "{{device}} was erased, but creating the file system failed." + the output open | "Try this step again" (creating erases the disk first again); "Stop here" (the disk then shows "No file system found") |
| 4 not found | file system made, not mounted | "The new file system was created but has not appeared yet." | "Look again" (the same read); "Look for new disks" (`DiskMgmt.rescan`, then the read); "Stop here", with "It is listed under Found on the disks, not mounted, where you can mount it." |
| 4, more than one match | file system made | "More than one file system was found on {{device}}, so this page cannot tell which is new." | "Stop here", with the same sentence and the list link |
| 5 set up | file system made; nothing pending **[verify]** | "The new file system was created, but setting up its mount failed." + message | "Try this step again"; "Stop here" (as 4) |
| 6, R10 finds more | the mount entry pending, and something else | `AlsoPendingPrompt`: "Other changes are pending too. Also pending from elsewhere: {{list}}. Mounting applies them too." | "Apply them too"; "Stop here" (the mount stays pending in the band) |
| 6 apply | B3: some modules deployed, some not; all still pending | "Mounting the new file system failed." + message | **"Try mounting again"** first (R7); "Undo the mount" second: `Config.revertChangesBg` (safe: the pre-flight held, so only this flow's changes are pending), then R7's forced re-apply of the modules that were deployed (the band's existing behaviour). After an undo, the file system stays on the disk and is listed under Found on the disks, not mounted |
| 7 not mounted | applied, but not mounted | "The changes were applied, but the file system is not mounted." | "Check again"; "Stop here", with a router link to the file system's page. The flow never goes on to sharing (B8) |
| 7, mounted, but the apply reported a failure for another module | mounted; some modules still pending | "The file system is mounted, but applying {{modules}} failed. They are still pending in the band." | "Try applying again"; "Continue" (to the result: the mount is what sharing needs) |

### 6.8 Result, and the handover to the classic interface

`JobResult` succeeded, announced politely:

- Title: "The new storage is ready."
- "{{name}} is mounted and ready, with {{size}} free." (`{{name}}` is the file system's name from
  0.1, with its tags when it has them; without a size, "{{name}} is mounted and ready."). A file system
  is mounted on a folder, not on a disk, and its name already says which device it is on.
- Router link "Open the file system" → its page.

Then a card **"Next: share a folder on it"** (`h3`), the handover. It is honest that these steps are in
the classic interface, and gives the exact choices this interface would make (Q4, Q6), so the result is
the same as when stage C is built. Each step is a numbered item with an `ExternalLink` and one or two
plain sentences:

1. **"Add a shared folder."** `ExternalLink` "Add a shared folder in the classic interface" →
   `/#/storage/shared-folders/create`. "Choose the file system {{choiceText}}. For Permissions, choose
   "Administrator: read/write, Users: read/write, Others: no access", so that only the people you give
   access to can reach it." `{{choiceText}}` is how the classic list names it: its tags in brackets
   when it has them, else its device **[verify]** the classic picker's text for a tagged and an untagged
   file system.
2. **"Choose who can use it."** `ExternalLink` "Shared folders in the classic interface" →
   `/#/storage/shared-folders`. "Select the new folder, then the Permissions button (the key icon). Give
   each person or group Read/Write or Read-only. Anyone not given access cannot use it."
3. **"Turn on sharing with Windows and Mac computers."** Shown only when `Services.getStatus` reports SMB
   as not enabled (the monitoring domain's read). `ExternalLink` "SMB/CIFS settings in the classic
   interface" → `/#/services/smb/settings`. "Tick Enabled, then Save."
4. **"Share the folder with your computers."** `ExternalLink` "Add an SMB share in the classic
   interface" → `/#/services/smb/shares/create`. "Choose the new shared folder and Save. Leave Public at
   No, so that people sign in with their name and password." Then, as its own short paragraph (Q6, a
   separate and explained choice): "Only if anyone on your network may open it without a password,
   choose Guests allowed instead. Anyone who can reach your network can then read it, and change it if
   the folder allows."
5. **"Apply the changes."** "When you have saved these, apply the changes, here in the band at the top
   of the page or in the classic interface."

Under the list, `text-sm muted-foreground`: "Who can actually open the folder depends on its
permissions too. A shared folder's own page will show it when it is built here." (Q9: effective access
only on a folder's own page.)

The flow cannot follow what is done in the classic interface. The file system's page carries the same
card under Used by while nothing is shared from it (2.4), so closing the flow loses nothing.

**Catalogue note:** the quoted option text in step 1 and the words "Guests allowed", "Public",
"Enabled" and "Permissions" must match the classic interface's own words in each language. The
translators are given the classic interface's catalogue entries for them; in English they are copied
exactly from the classic forms.

### 6.9 Keyboard and screen readers

The decisions are one form in reading order: the disk radio group (one tab stop, arrows inside, across
its groups), "Disks that cannot be used", "Look for new disks" (when shown), the Combine link (when
shown), the format radio group, Tags, Warn when, Continue. The summary is a heading and a list, then the
typed field, then the confirm button (unavailable but focusable) and Change choices; the typed field's
label is the "Type /dev/sdb to confirm." sentence and its hint is linked. During the run, step changes
are announced politely, a failure assertively with focus on its heading, and the result politely. The
handover is an ordered list; each link says it opens a new tab.

### 6.10 Copy

| Key | English |
| --- | --- |
| `addStorage.breadcrumb` | Add storage |
| `addStorage.title` | Add storage |
| `addStorage.documentTitle` | Add storage – File systems |
| `addStorage.preflightTitle` | Some changes are not applied yet |
| `addStorage.preflightBody` | Apply or undo them before you add storage, so that only these changes are applied at the end. |
| `addStorage.applyThem` | Apply them now |
| `addStorage.undoThem` | Undo them |
| `addStorage.looking` | Looking for disks that can hold new storage… This reads the disks, which wakes any that have gone to sleep. (Shown only while it looks.) |
| `addStorage.checkFailed` | Could not check which disks can be used. |
| `addStorage.disk` | Disk |
| `addStorage.group.empty` | Empty disks |
| `addStorage.group.raid` | RAID arrays |
| `addStorage.group.reuse` | Erase and reuse |
| `addStorage.reuseIntro` | These disks hold something. Everything on the one you choose is erased. |
| `addStorage.option` | {{device}}, {{model}}, {{size}} |
| `addStorage.optionSerial` | Serial number <serial></serial> |
| `addStorage.raidOption` | RAID <device></device> ({{level}}, {{count}} disks), {{size}} |
| `addStorage.holds.fsUnused` | Holds the file system {{name}} ({{type}}, {{size}}), not used on this NAS. |
| `addStorage.holds.unknown` | No file system was found, but the disk is not empty, for example old partitions. |
| `addStorage.cannotUse` | Disks that cannot be used ({{count}}) |
| `addStorage.cannotPlace` | This page cannot tell what this device is, so it is not offered. Use the classic interface for it. |
| `addStorage.none` | No disk can hold new storage right now. Connect a new disk, or free one that is in use. |
| `addStorage.rescan` | Look for new disks |
| `addStorage.combineHint` | To combine several disks into one file system, use Combine disks (BTRFS). |
| `addStorage.combineLink` | Combine disks (BTRFS) |
| `addStorage.format` | Format |
| `addStorage.format.ext4` | Standard (EXT4), recommended |
| `addStorage.format.ext4Hint` | Works well for almost everything. This is what most NAS owners use. |
| `addStorage.format.xfs` | XFS |
| `addStorage.format.xfsHint` | Good for very large files, such as video. It can be made bigger later, but not smaller. |
| `addStorage.format.btrfs` | BTRFS |
| `addStorage.format.btrfsHint` | Can keep snapshots of earlier versions of your files. Snapshots are managed in the classic interface. |
| `addStorage.format.f2fs` | F2FS |
| `addStorage.format.f2fsHint` | Made for flash cards and USB sticks. Not for hard disks. |
| `addStorage.tagsPlaceholder` | For example: Media |
| `addStorage.sharingNext` | Sharing a folder on it with your computers is the next step. This page shows you how when the storage is ready. |
| `addStorage.continue` | Continue |
| `addStorage.summaryTitle` | Ready to add storage |
| `addStorage.sum.erase` | Erase {{device}} ({{model}}, serial number {{serial}}, {{size}} ({{label}} on the label)). Everything on it is lost: {{what}} |
| `addStorage.sum.useWhole` | Use the whole of {{device}} ({{model}}, serial number {{serial}}, {{size}} ({{label}} on the label)). Anything on it is overwritten. |
| `addStorage.sum.create.ext4` | Create an EXT4 file system on it. |
| `addStorage.sum.create.xfs` | Create an XFS file system on it. |
| `addStorage.sum.create.btrfs` | Create a BTRFS file system on it. |
| `addStorage.sum.create.f2fs` | Create an F2FS file system on it. |
| `addStorage.sum.createOnRaid.ext4` | Create an EXT4 file system on the RAID array {{name}}, which keeps its disks as they are. (and `.xfs`, `.btrfs`, `.f2fs` with their articles) |
| `addStorage.sum.tags` | Tag it {{tags}}. |
| `addStorage.sum.level` | Warn when it is {{level}} full. |
| `addStorage.sum.noLevel` | No warning when it fills up. |
| `addStorage.sum.mount` | Then mount it, which applies the changes for it. Nothing else is pending. |
| `addStorage.sum.shareNext` | Sharing a folder on it comes next, in the classic interface for now. |
| `addStorage.typePrompt` | Type {{device}} to confirm. |
| `addStorage.typeHint` | The button is available once the name matches. |
| `addStorage.confirm` | Erase disk and create file system |
| `addStorage.confirmRaid` | Erase array and create file system |
| `addStorage.back` | Change choices |
| `addStorage.steps` | Steps |
| `addStorage.step.check` | Check {{device}} again |
| `addStorage.step.erase` | Erase {{device}} |
| `addStorage.step.create` | Create the {{format}} file system |
| `addStorage.step.find` | Find the new file system |
| `addStorage.step.setUp` | Set up the mount |
| `addStorage.step.mount` | Mount the new file system |
| `addStorage.step.verify` | Check that it is mounted |
| `addStorage.runningFor` | Running for {{duration}} |
| `addStorage.showOutput` | Show the output |
| `tasks.outputUnread` | The output of this task could not be read. |
| `tasks.notStarted` | This task did not start, so it has no output. |
| `addStorage.hideOutput` | Hide the output |
| `addStorage.task.erase` | Erase disk {{device}} |
| `addStorage.task.create` | Create file system on {{device}} |
| `addStorage.fail.blocked` | {{device}} cannot be used now. |
| `addStorage.fail.changed` | The disk now called {{device}} is not the one you chose. Nothing was erased. Choose again. |
| `addStorage.fail.checkRead` | Could not check {{device}} again, so nothing was erased. |
| `addStorage.fail.erase` | {{device}} could not be erased. |
| `addStorage.fail.notCandidate` | {{device}} was erased, but the NAS still does not offer it for a new file system. |
| `addStorage.fail.create` | {{device}} was erased, but creating the file system failed. |
| `addStorage.fail.notFound` | The new file system was created but has not appeared yet. |
| `addStorage.fail.ambiguous` | More than one file system was found on {{device}}, so this page cannot tell which is new. |
| `addStorage.fail.listedFound` | It is listed under Found on the disks, not mounted, where you can mount it. |
| `addStorage.fail.setUp` | The new file system was created, but setting up its mount failed. |
| `addStorage.fail.mount` | Mounting the new file system failed. |
| `addStorage.fail.notMounted` | The changes were applied, but the file system is not mounted. |
| `addStorage.fail.otherModules` | The file system is mounted, but applying {{modules}} failed. They are still pending in the band. |
| `addStorage.chooseOther` | Choose another disk |
| `addStorage.chooseAgain` | Choose again |
| `addStorage.tryStep` | Try this step again |
| `addStorage.stop` | Stop here |
| `addStorage.checkAgain` | Check again |
| `addStorage.lookAgain` | Look again |
| `addStorage.alsoTitle` | Other changes are pending too |
| `addStorage.alsoBody` | Also pending from elsewhere: {{list}}. Mounting applies them too. |
| `addStorage.applyToo` | Apply them too |
| `addStorage.tryMount` | Try mounting again |
| `addStorage.undoMount` | Undo the mount |
| `addStorage.tryApply` | Try applying again |
| `addStorage.continueAnyway` | Continue |
| `addStorage.doneTitle` | The new storage is ready. |
| `addStorage.doneBody` | {{name}} is mounted and ready, with {{size}} free. |
| `addStorage.doneBodyNoSize` | {{name}} is mounted and ready. |
| `addStorage.openFs` | Open the file system |
| `addStorage.handover.title` | Next: share a folder on it |
| `addStorage.handover.folder` | Add a shared folder. |
| `addStorage.handover.folderLink` | Add a shared folder in the classic interface |
| `addStorage.handover.folderBody` | Choose the file system {{choiceText}}. For Permissions, choose "Administrator: read/write, Users: read/write, Others: no access", so that only the people you give access to can reach it. |
| `addStorage.handover.access` | Choose who can use it. |
| `addStorage.handover.accessLink` | Shared folders in the classic interface |
| `addStorage.handover.accessBody` | Select the new folder, then the Permissions button (the key icon). Give each person or group Read/Write or Read-only. Anyone not given access cannot use it. |
| `addStorage.handover.smbOn` | Turn on sharing with Windows and Mac computers. |
| `addStorage.handover.smbOnLink` | SMB/CIFS settings in the classic interface |
| `addStorage.handover.smbOnBody` | Tick Enabled, then Save. |
| `addStorage.handover.share` | Share the folder with your computers. |
| `addStorage.handover.shareLink` | Add an SMB share in the classic interface |
| `addStorage.handover.shareBody` | Choose the new shared folder and Save. Leave Public at No, so that people sign in with their name and password. |
| `addStorage.handover.guest` | Only if anyone on your network may open it without a password, choose Guests allowed instead. Anyone who can reach your network can then read it, and change it if the folder allows. |
| `addStorage.handover.apply` | Apply the changes. |
| `addStorage.handover.applyBody` | When you have saved these, apply the changes, here in the band at the top of the page or in the classic interface. |
| `addStorage.handover.access2` | Who can actually open the folder depends on its permissions too. A shared folder's own page will show it when it is built here. |

---

## 7. "Combine disks (BTRFS)"

Flow A's multi-disk variant (Q3: its own flow, with RAID1 as the default instead of the stock RAID0).
Route `/storage/filesystems/add-multi`, no menu item; reached from the File systems toolbar and Flow
A's hint. Breadcrumbs: "File systems" › "Combine disks". Everything is as in section 6 except what
follows.

### 7.1 Decisions

**B1. Disks** (a checkbox list in the groups of 6.3, without RAID arrays; legend "Disks to combine"):
each option as A1's, "Erase and reuse" ones with what is on them. None ticked by default. At least two
must be ticked; the count needed for the chosen way (B2) is said in words under the list ("Choose at
least 2 disks." / "Choose at least 4 disks for this way of combining them."), checked on Continue, not
on each tick. More than nine offered: "Select all" and "Select none".

**B2. How to combine them** (`RadioGroupField`, four options; each hint ends with the usable space for
the ticked disks, computed in the browser and said with "about", **[verify]** against what the NAS
reports after creation on the VM. Until enough disks are ticked for a way, its hint has no size: the
sentence ends before "about {{usable}}"):

1. **"Mirror (RAID1), recommended"** (default). "Every file is kept on two disks, so one disk can fail
   without losing anything. You can use about half the total space: about {{usable}}." At least 2.
   Usable: the smaller of half the total and the total less the largest disk.
2. "Mirror and stripe (RAID10)". "Like a mirror, and faster with many disks. One disk can fail. About
   {{usable}}." At least 4. Usable: as RAID1.
3. "Stripe (RAID0)". "Uses all the space and is fast, but if any one disk fails, everything on all of
   them is lost. About {{usable}}." At least 2. Usable: the total, less what the largest disk has
   beyond all the others together.
4. "Join (single)". "Uses all the space, filling one disk after another. If any one disk fails, files
   on it are lost, and the file system may not open. About {{usable}}." At least 2. Usable: the total.

`dup` (one disk only) and RAID5/RAID6 (not offered by OMV) are not choices.

**B3, B4**: Tags and Warn when, as A3 and A4.

### 7.2 Summary and confirmation

- "Erase {{count}} disks:" then one line per disk, each as 6.5's erase or use-whole line.
- "Combine them into one BTRFS file system: {{way}}. About {{usable}} can be used." `{{way}}` is the
  way's name without the option's "recommended" ("Mirror (RAID1)").
- The tags, level, mount and sharing lines of 6.5.
- **Typed confirmation**: "Type {{devices}} to confirm." where `{{devices}}` is every chosen device
  name, separated by single spaces, in the order listed (for example `/dev/sdb /dev/sdc`). The match is
  exact and case-sensitive, with runs of spaces counted as one and surrounding spaces ignored (an
  extension of `typedMatches`, 13.1). Button **"Erase {{count}} disks and create file system"**
  (`destructive`). Section 18, P2.

### 7.3 Steps

| # | Step label | Calls |
| --- | --- | --- |
| 1 | "Check the disks again" | As 6.6 step 1, for every disk; any disk failing stops the flow before anything is erased |
| 2 … | "Erase {{device}}", one per "Erase and reuse" disk | As 6.6 step 2; one failure stops the flow (the others already erased stay erased, said in the failure) |
| n | "Create the BTRFS file system" | `FileSystemMgmt.createBtrfs {profile, devicefiles}`: `profile` from B2 (`raid1`, `raid10`, `raid0`, `single`), `devicefiles` the chosen stable paths joined with commas (the server reads one comma-separated string) **[verify]** on the VM; no `label` (the tags carry the name, as for one disk) |
| n+1 | "Find the new file system" | `getMountCandidates`: the entry whose `devicefiles` (or `parentdevicefile`) are the chosen disks **[verify]** the form they arrive in |
| n+2 … | Set up the mount, Mount the new file system, Check that it is mounted | As 6.6 steps 5 to 7 |

While the BTRFS file system is created, the File systems list shows no "Being created" row (the server
writes no marker for it, 1.3.1), and the chosen disks would look free to another tab. The flow's own
registry entry blocks a second flow in the same session; across sessions, see 16.1.

### 7.4 Copy (in addition to section 6's, with `addStorage.multi.` keys for what differs)

| Key | English |
| --- | --- |
| `addStorage.multi.breadcrumb` | Combine disks |
| `addStorage.multi.title` | Combine disks (BTRFS) |
| `addStorage.multi.documentTitle` | Combine disks – File systems |
| `addStorage.multi.disks` | Disks to combine |
| `addStorage.multi.min` | Choose at least {{count}} disks. |
| `addStorage.multi.minFor` | Choose at least {{count}} disks for this way of combining them. |
| `addStorage.multi.selectAll` | Select all |
| `addStorage.multi.selectNone` | Select none |
| `addStorage.multi.way` | How to combine them |
| `addStorage.multi.raid1` | Mirror (RAID1), recommended |
| `addStorage.multi.raid1Hint` | Every file is kept on two disks, so one disk can fail without losing anything. You can use about half the total space: about {{usable}}. |
| `addStorage.multi.raid1HintNoSize` | Every file is kept on two disks, so one disk can fail without losing anything. You can use about half the total space. |
| `addStorage.multi.raid10` | Mirror and stripe (RAID10) |
| `addStorage.multi.raid10Hint` | Like a mirror, and faster with many disks. One disk can fail. About {{usable}}. |
| `addStorage.multi.raid10HintNoSize` | Like a mirror, and faster with many disks. One disk can fail. |
| `addStorage.multi.raid0` | Stripe (RAID0) |
| `addStorage.multi.raid0Hint` | Uses all the space and is fast, but if any one disk fails, everything on all of them is lost. About {{usable}}. |
| `addStorage.multi.raid0HintNoSize` | Uses all the space and is fast, but if any one disk fails, everything on all of them is lost. |
| `addStorage.multi.single` | Join (single) |
| `addStorage.multi.singleHint` | Uses all the space, filling one disk after another. If any one disk fails, files on it are lost, and the file system may not open. About {{usable}}. |
| `addStorage.multi.singleHintNoSize` | Uses all the space, filling one disk after another. If any one disk fails, files on it are lost, and the file system may not open. |
| `addStorage.multi.wayName.raid1` | Mirror (RAID1) |
| `addStorage.multi.wayName.raid10` | Mirror and stripe (RAID10) |
| `addStorage.multi.wayName.raid0` | Stripe (RAID0) |
| `addStorage.multi.wayName.single` | Join (single) |
| `addStorage.multi.sum.erase_other` | Erase {{count}} disks: |
| `addStorage.multi.sum.combine` | Combine them into one BTRFS file system: {{way}}. About {{usable}} can be used. |
| `addStorage.multi.typePrompt` | Type {{devices}} to confirm. |
| `addStorage.multi.confirm` | Erase {{count}} disks and create file system |
| `addStorage.multi.step.check` | Check the disks again |
| `addStorage.multi.step.create` | Create the BTRFS file system |
| `addStorage.multi.fail.someErased` | {{erased}} were erased before this step failed. They stay erased. |

---

## 8. Stage C, once the shares methods are cleared (designed, not built in this slice)

When the owner clears the methods below (section 18) and the shares domain is designed, stage C joins
Flow A after step 7, with the audit's decisions and calls (UX audit 4.2), as the owner answered them:

- **Decisions** A4 to A6 join the form: the shared folder's name (the share-name pattern, 80
  characters, unique); who can use it, per person and group, Read and write, Read only or No access
  (default No access), with search and "Set all to" for long lists; "Anyone on the network, without a
  password" as a separate, explained checkbox (Q6); "Windows and Mac (SMB)" on by default, and "Use for
  Time Machine backups".
- **The folder is made with mode 770** (Q4), and the summary says so: "Only the people you give access
  to can open it."
- **Steps** after step 7: "Create the shared folder" (`ShareMgmt.set`, which makes the directory at
  once, B5), "Give access" (`ShareMgmt.setPrivileges`), "Turn on Windows and Mac sharing" (`SMB.getSettings`
  then `SMB.setSettings`, only if off, read-modify-write B11), "Share the folder" (`SMB.setShare`, every
  required property, B11), then the second checkpoint "Apply the sharing changes" (R10, then
  `Config.applyChangesBg`), and "Check that it is shared" (`ShareMgmt.getList`, `SMB.getShareList`,
  `Services.getStatus`).
- **Failures** as the audit's plan (its 4.2), including "Remove the folder record" (`ShareMgmt.delete`,
  content kept) when the folder record exists without its directory.
- **Effective access** stays on a folder's own page (Q9); the flow shows what was granted.
- The handover card (6.8) is then removed, and the title becomes "Add storage and share it".

---

## 9. Dashboard, Disks and other links in

| Where | Was | Becomes |
| --- | --- | --- |
| Dashboard, Storage card footer | `ExternalLink` "File systems in the classic interface" | Router link "Open File systems" → `/storage/filesystems` |
| Dashboard, Storage card items | text | The name is a router link to the file system's page (0.5), when the row has a UUID that matches `getList`; the system drive stays text |
| Dashboard, Storage card empty state | `ExternalLink` "Open File systems in the classic interface" | Router link "Add storage" → `/storage/filesystems/add` |
| Dashboard, attention rows for a nearly full or missing file system | classic link | Router link "Open file system {{name}}" → its page |
| Disks list and a disk's page, "Used for" | the file system's name as text | A router link to the file system's page when it has one |
| A disk's page, wipe blockers "Stop using it and unmount it under File systems first" / "Remove it under File systems first" | `ExternalLink` "File systems in the classic interface" | Router link "Open file system {{name}}" → its page, where the unmount or removal and its own refusals are |
| A disk's page, after a wipe | `ExternalLink` "Create a file system in the classic interface" | Router link "Add storage on this disk" → `/storage/filesystems/add`, with the disk chosen in A1 |
| A disk's page whose "Used for" is "No file system found" or "Empty" | nothing | A line in the summary card: router link "Add storage on this disk" |
| Shared folders (Phase 3), status `ENOENT_DB_MNTENT` or `ENOENT` | text | unchanged in this slice (the folder rows do not carry a file-system UUID); the shares domain links them |

**"With the disk chosen"** means the disk's page passes its disk to the flow **in memory** (the session
store), never in the address: an address that preselected a disk to erase would come close to a URL
that leads to an action (UI-4), and it would sit in the history. The flow still re-reads and re-checks
the disk, and a disk that is no longer offered is simply not chosen. Opened by its address, Flow A
starts with nothing chosen.

Catalogue changes: `dashboard.storage.link` "Open File systems"; `dashboard.storage.emptyLink` "Add
storage"; new `dashboard.storage.openFs` "Open file system {{name}}"; `wipe.blocked.fsInUseDo` and
`fsSetUpDo` keep their English, and their link becomes `wipe.fsOpen` "Open file system {{name}}";
`wipe.createFsLink` becomes "Add storage on this disk"; new `disk.addStorage` "Add storage on this
disk".

---

## 10. A normal user

Every method in this slice refuses a normal user ("Invalid context role."). So:

- The File systems item stays out of a normal user's menu.
- A normal user who types `/storage/filesystems`, a file system's address or a flow's address gets the
  existing "only administrators" page, and the route makes no call first (UI-4).
- The dashboard for a normal user is unchanged.

---

## 11. Navigation and routes

| Item | Route | Roles | Replaces |
| --- | --- | --- | --- |
| Storage > File systems | `/storage/filesystems` | admin | `ClassicOnlyPage` for `storage/filesystems` |
| (no menu item) | `/storage/filesystems/$fs` | admin | the stock edit, details, grow and unmount actions |
| (no menu item) | `/storage/filesystems/add` | admin | the stock create and mount pages, J2 steps 5 to 9 |
| (no menu item) | `/storage/filesystems/add-multi` | admin | the stock BTRFS create page |

- Static file routes, more specific than `$group/$item`, as before. `BuiltRoute` gains
  `/storage/filesystems`; `isCurrent` treats `/storage/filesystems/…` as the File systems item's.
- `add` and `add-multi` are static segments matched before `$fs`, and neither passes 0.5's pattern
  (`add` is shorter than it allows; `add-multi` has letters outside A to F), so there is no ambiguity.
- `$fs` is validated by 0.5's pattern in the route's `params.parse`; a failing value renders the
  not-found state and makes no call.
- The navigation entry keeps its `classic` path.
- Route-level code splitting: each page is its own chunk.
- Document titles: "File systems – openmediavault", "{{name}} – File systems – openmediavault", "Add
  storage – File systems – openmediavault", "Combine disks – File systems – openmediavault".

---

## 12. Every request in this slice

**Contract status:** *Exists* (already in the contract), *New, cleared* (in the set the owner cleared
on 2026-11-21: `FileSystemMgmt.*`, `FsTab.getByFsName`/`set`/`delete`), or *Owner's review list* (not
cleared; needed only for stage C, section 8; not built in this slice).

| Method | Where | When | Kind | Contract status and notes |
| --- | --- | --- | --- | --- |
| `FileSystemMgmt.getList` | everywhere in this slice | open, Refresh, after an action, the re-checks | foreground | Exists |
| `FileSystemMgmt.enumerateFilesystems` | Flow A's disk-use model | with the reads | foreground | Exists |
| `FileSystemMgmt.enumerateMountedFilesystems` | list (system drive) | open | foreground | Exists |
| `FileSystemMgmt.getMountCandidates` | list, Flow A step 4, unmount step 3 | open, steps | foreground | **New, cleared.** Read-only. Full file-system objects, as `enumerateFilesystems`'s rows |
| `FileSystemMgmt.getCandidatesBg` → `Exec.*` | Flow A | open, step 1, after an erase | task | **New, cleared.** `x-omv-task`, read-only (the journal's open point about read-only tasks applies). Result: `{devicefile, size, description}[]`; `description` is server English and not shown |
| `FileSystemMgmt.create` | Flow A step 3 | after the typed confirmation and the re-check | task | **New, cleared.** `x-omv-task`, `x-omv-destructive: data`. Request `{devicefile, type}`; `type` an enum `ext4`, `xfs`, `btrfs`, `f2fs`, stricter than OMV's free string (JFS left out, 17 D9). The description says the server erases any device it is given |
| `FileSystemMgmt.createBtrfs` | Combine disks | as above | task | **New, cleared.** `x-omv-task`, `x-omv-destructive: data`. `profile` an enum `single`, `raid0`, `raid1`, `raid10` (stricter: no `dup`); `devicefiles` a string of comma-separated device files with a pattern; `label` not sent |
| `FileSystemMgmt.setMountPoint` | mount dialog, Flow A step 5 | Save, step | foreground | **New, cleared.** `x-omv-dirty: [fstab, collectd, monit, quota]` **[verify]** V8. `id` a device file (the contract accepts only that form, stricter than OMV's UUID-or-device); `usagewarnthreshold` 0 to 100; `comment` at most 200 characters |
| `FileSystemMgmt.grow` | a file system's page | after its confirmation | foreground, long | **New, cleared.** Synchronous. Not data-destructive; the description says it cannot be undone. `id` in OMV's file-system-UUID format |
| `FileSystemMgmt.umountByDir` | a file system's page | after its confirmation | foreground, long | **New, cleared.** `x-omv-destructive: service`. `x-omv-dirty: [collectd, monit, quota]` (what it leaves pending; it applies `fstab` itself, said in the description, with the loss of the undo snapshots) |
| `FileSystemMgmt.getDetails` | a file system's page | Show technical details | foreground | **New, cleared.** Plain string; reads the disk (in the description); captures scrubbed of UUIDs, labels, host names and serial numbers in device names |
| `FsTab.getByFsName` | a file system's page, Flow A step 7 | open, before a save, step | foreground | **New, cleared.** Reply is the mount-entry object or the boolean `false` (`oneOf`), observed in source |
| `FsTab.set` | a file system's page | Save | foreground | **New, cleared.** `x-omv-dirty: [monit]` on a change **[verify]**. Request: `uuid`, `fsname`, `dir`, `type`, `opts`, `freq`, `passno` (0, 1 or 2) required, `usagewarnthreshold` 0 to 100 and `comment` (at most 200) optional, `hidden` optional (OMV's storage schema has it; the classic form sends it) |
| `DiskMgmt.getList`, `DiskMgmt.rescan`, `MdMgmt.enumerateDevices` | list, page, Flow A | as above | foreground | Exist |
| `DiskMgmt.wipe` | Flow A step 2 (Erase and reuse) | after the typed confirmation | task | Exists (`x-omv-destructive: data`) |
| `ShareMgmt.getList` | a file system's page (Used by), the unmount check, 1.6 | open, checks | foreground | Exists |
| `Services.getStatus` | Flow A's handover (whether SMB is on) | at the result | foreground | Exists |
| `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*`, `System.getInformation` | Flow A, unmount, the band | as now | | Exist |
| `ShareMgmt.set` | stage C | | | **Owner's review list** |
| `ShareMgmt.setPrivileges` | stage C | | | **Owner's review list** |
| `ShareMgmt.delete` | stage C's failure plan | | | **Owner's review list** |
| `UserMgmt.getUserList`, `UserMgmt.getGroupList` | stage C (who can use it) | | | **Owner's review list** |
| `SMB.getSettings`, `SMB.setSettings` | stage C (turn SMB on) | | | **Owner's review list** |
| `SMB.getShareList`, `SMB.setShare` | stage C (the share, and the check) | | | **Owner's review list** |

Not used, and kept out of the contract for this slice: `FileSystemMgmt.getCandidates` (the task version
is used, as the stock interface does, so a hanging disk does not hold a request), `getListBg`,
`umountByFsName`, `hasFilesystem`, and `FsTab.delete` (cleared, but `umountByDir` deletes the entry and
applies the change in one step; deleting alone would leave a mount the system still has).

---

## 13. Components

### 13.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component | Why | States to cover |
| --- | --- | --- |
| `RadioGroupField` **groups** (extension) | Flow A's disk choice: one radio group with headed sections ("Empty disks", "Erase and reuse"), one tab stop, arrows across sections, each section a labelled `group` inside the `radiogroup` | one section, three sections, an empty section left out, long option labels with a serial line and a body line, 320px, 200% zoom |
| `CheckboxField` **list with groups** (extension) | Combine disks: the same sections as checkboxes, with the count line under them | as above, plus Select all / Select none |
| `typedMatches` **several names** (extension) | Combine disks' typed confirmation: runs of spaces count as one | the single-name cases unchanged; two and four names; extra spaces; a wrong order fails |
| `CapacityMeter` **compact** (variant) | The usage column in a 36px row: the bar and the figure on one line, the pill beside, wrapping under 640px | below level, Warning, Critical (full), no reading, loading |
| `TaskLog` **partial** (option) | Technical details: show the first N lines with a "Showing the first N of M lines" line and a "Show all lines" control; Copy copies all | under N, over N, expanded |

### 13.2 Reused as they are

The job-runner parts (`JobRunner`, `PreflightNotice`, `JobSummary` with `typedConfirmation`,
`JobStepList`, `JobProgress`, `JobResult`, `JobFailure`, `AlsoPendingPrompt`), `ConfirmDialog` (default
and destructive), `Dialog`, `TypeToConfirmField`, `UsedByPanel`, `Breadcrumbs`, `Card`, `FactList`,
`StatusPill` and `rollUp`, `CapacityMeter`, `EmptyState`, `InlineAlert`, `FormAlert`, `Table*`,
`TableSkeletonRows`, `Select`, `Field`, `Disclosure`, `ExternalLink`, `Identifier`, `CopyButton`,
`TaskLog`, `Skeleton`, `Button` (with `loading`), the task announcer and the Tasks menu.

No new colour, token or variant of a colour: the slice uses the status, pending, destructive and
neutral families as they are. The colour audit is not affected.

### 13.3 In the app

Pure functions, each tested by itself:

- `fsName(row)`, `fsTypeWord(type)` (0.1), shared with the disks slice.
- `fsState(row, dirtyModules)` (0.2) and `fsUsage(row)` (the dashboard's rule, moved to a shared
  module).
- `fsRefusals(row, shares, session)` (0.8): the grow, unmount and remove blockers.
- `usedBy(row, mountEntry, sharedFolders)` (0.6).
- `storageChoices(candidates, disks, fileSystems, detected, arrays, session)` (6.3): the groups and the
  reasons, built on the disks slice's `diskUse`; fail-closed on missing inputs.
- `findNewFilesystem(mountCandidates, chosenDevices)` (6.6 step 4, 7.3): exactly one match or a reason.
- `btrfsUsable(sizes, profile)` (7.1).
- Flow A's plan: from the choices and the reads, the ordered steps and the summary items; the expected
  dirty set for R10.

The session store gains: the disk handed to Flow A from a disk's page, the file systems this session
created (for 1.6 and 2.4), the "saved settings since the last apply" marks of 0.7, technical-details
reports per file system, and the registry ids of running creates, grows and unmounts. Cleared at
sign-out with the task registry; none of it touches browser storage (UI-13).

---

## 14. Mock scenarios to add

Built from scrubbed captures where the VM can show them (verification rule); hand-written ones say so.
The VM has disposable extra disks for the creates.

| Method | Scenarios |
| --- | --- |
| `FileSystemMgmt.getList` | the existing scenarios, plus: a file system set up and pending (`mounted` false); set up, not mounted, nothing pending; nearly full; full; no reading (`-1`); BTRFS on two disks; one on a RAID array; one with tags; a missing one recorded by disk ID (no UUID); twenty file systems; a label 200 characters long, one right-to-left, one that looks like markup; the system drive also listed (an add-on) |
| `FileSystemMgmt.getMountCandidates` | none; one created and not mounted (captured, after a create on the VM); an NTFS disk from another computer; an error |
| `FileSystemMgmt.getCandidatesBg` | the VM's empty scratch disk (captured); none; an empty disk and a RAID array; a device that is not a disk (partition); a failed task |
| `FileSystemMgmt.create` | EXT4 succeeded (captured, on a VM scratch disk, with its mkfs output); failed part-way (the device disappeared) |
| `FileSystemMgmt.createBtrfs` | RAID1 on two disks succeeded (captured); failed |
| `FileSystemMgmt.setMountPoint` | saved (captured, then put back with the capture tool's undo); "A mount point already exists" |
| `FileSystemMgmt.grow` | grown (a bigger size on the re-read); nothing to grow (same size); "does not support online resizing"; the request cut |
| `FileSystemMgmt.umountByDir` | unmounted (captured, on the scratch disk); busy (the server's message) **[verify]** its text; an error |
| `FileSystemMgmt.getDetails` | EXT4 (captured, scrubbed); XFS; BTRFS on two disks; a 40,000-line report; a line that looks like markup; an error |
| `FsTab.getByFsName` | an entry (captured); `false` |
| `FsTab.set` | saved; an error |
| `ShareMgmt.getList` | the existing scenarios, plus two folders on one file system, and a folder on a missing one |
| `System.getInformation` and `Config.*` | Flow A: nothing pending; `fstab`, `collectd`, `monit`, `quota` pending; those plus `nfs` (R10); apply failed with `fstab` deployed and `monit` not; unmount: the three left pending |
| `Services.getStatus` | SMB off; SMB on |

---

## 15. Checks before calling it done

- Both themes; greyscale; deuteranopia and protanopia emulation. Every state and usage pill keeps its
  word; "Running" for a file system being created is the task pill, not pending yellow; the pending
  mount is the pending mark with its words; the only red controls are "Erase disk and create file
  system", "Erase {{count}} disks…", "Grow file system" and "Unmount", each with its verb.
- 320 CSS px and 200% zoom: the tables scroll inside their named frames only; the summary facts stack;
  the disk options wrap with their serial lines; device paths break safely; the typed field and its
  target wrap; the handover list is one column.
- Keyboard-only: the list (1.8), a file system's page (2.7), the mount dialog (3), grow (4.2), unmount
  and remove (5.5), Flow A (6.9), Combine disks.
- Screen reader hears: loading of each page; "Read at"; the mount saved line; growing and its result;
  unmounting's start, steps and result; each Flow A step, a failure assertively, and the result. It does
  not hear the elapsed-time counters.
- In the network panel: no `getDetails` until "Show technical details"; no `getCandidatesBg` outside
  Flow A; no `create`, `createBtrfs` or `wipe` before the typed confirmation, and each preceded by step
  1's re-reads; no `grow` or `umountByDir` before their confirmations and re-reads; no apply after an
  unmount when R10 found other changes and the reader chose "Stop here"; no request at all for a normal
  user; nothing polls.
- On the VM with disposable extra disks: Flow A from an empty disk to mounted (EXT4), then the
  handover's steps done in the classic interface and the share reached from another machine; Flow A on
  a disk holding an old file system (Erase and reuse); Combine disks with two scratch disks (RAID1);
  grow on a file system with nothing to grow; unmount refused while a shared folder uses it, then done
  after the folder is deleted; a missing file system made by detaching a scratch disk, then removed;
  the checks V1, V2, V3, V5 and V8 recorded in the journal. Everything put back afterwards; nothing left
  pending.

---

## 16. Adversarial pass

### 16.1 Trying to break it

| Probe | Finding | Design response |
| --- | --- | --- |
| Create a file system on the system disk by choosing it | The server would erase it (it checks nothing) | Not offered: the disk-use model refuses it, whatever `getCandidatesBg` says (6.3); re-checked at step 1 |
| A disk that `getCandidatesBg` offers but the interface sees as swap or a RAID member | The server's filter and ours disagree | The stricter wins: not offered, listed under "Cannot be used" with the reason (6.3) |
| **Two tabs, same disk, Flow A in both** | No lock on the server | Each tab's step 1 re-reads: once the first tab's create starts, the server's "being created" marker makes the disk "File system being created", so the second stops with "{{device}} cannot be used now". In the second or so between the first tab's step 1 and its create writing the marker, both could pass; the second create would erase the first's new file system before anything was stored on it. Accepted and stated; no data of the owner's is at risk then |
| Two tabs, Combine disks | No marker for BTRFS (7.3) | The same race lasts the whole creation, not a second: across tabs the disks look free. The first tab's flow blocks a second flow in the same session; across sessions it is accepted and stated, and raised with the owner (18, P2) |
| **The disk changes during the flow**: `sdb` and `sdc` swap after a restart, or another disk is plugged in under the same name | The flow could erase a different physical disk | Step 1 compares serial number and model with what the summary showed; any difference stops before erasing: "The disk now called /dev/sdb is not the one you chose" (6.7) |
| The chosen disk is unplugged between the summary and step 1 | | Step 1: "cannot be used now" (it is gone from the lists) |
| The disk is unplugged during the create | The task fails; the disk may be partly erased | Step 3's failure; when it is plugged in again it shows "No file system found" and can be chosen again |
| Another administrator mounts a file system on the same disk between the summary and step 1 | | The disk-use model now sees "set up": refused at step 1 |
| Another administrator saves a change during the flow | It would ride the mount checkpoint (B2) | R10 at step 6 lists it and asks (6.7) |
| **Apply fails half way** at the checkpoint (R7, B3) | Some modules deployed, some not; all still pending | Step 6's failure: "Try mounting again" first, "Undo the mount" second, with R7's forced re-apply after an undo; step 7 reads the real mount state, so "mounted, but another module failed" is told apart from "not mounted" (6.7) |
| **A mount that fails**: the apply succeeds but the file system is not mounted | Sharing would put folders on the system disk (B8, V1) | Step 7 stops the flow; the handover is never shown; the list shows the row as Critical "Not mounted" (0.2) |
| The new file system does not appear after the create | | Step 4 offers "Look again" and "Look for new disks"; then "Stop here" with where to find it (1.5) |
| Reload during the create | The handle is lost (UI-5); the create continues | 1.3.1 shows "Being created" (one disk) until it ends; then 1.6 offers to mount it (R8). Never re-run automatically (UI-14) |
| Session expires during the mount checkpoint | The apply continues on the server | After sign-in, the list shows the real state: mounted (then 1.6's "nothing is shared yet"), or pending in the band |
| Unmount while shared folders use it | The server would delete the entry and leave the folders pointing at nothing | Refused with the folders named (5.1); re-checked when the dialog opens and on confirm |
| Unmount with other changes pending | Their undo snapshots would be lost and pending mount changes applied by surprise (0.7) | The dialog's pre-flight (5.2) |
| Unmount while a program has files open | The server's unmount fails | "Something is still using its files. Nothing was changed." (5.4) **[verify]** nothing is deleted then |
| A shared folder created in another tab between the confirmation and the call | | The re-check on confirm (5.3) re-reads `getList` (`_used`); the window left is the call itself, accepted |
| Unmount, then the "remaining changes" apply fails | Half done in the reader's eyes | R7 in the panel; the band keeps the changes (5.4) |
| Grow a file system with nothing to grow | Looks like a failure or a success that did nothing | Sizes compared: "already used all the space available. Nothing changed." (4.3) |
| Grow on BTRFS across several disks | Would grow only one disk's part | Not offered until verified (4.1; 17, D12) |
| Grow takes longer than the web server allows | Unknown outcome | "Could not tell whether growing finished" and Refresh (4.3) |
| Press "Grow file system" or "Unmount" twice | Two calls | Buttons ignore presses while their call runs; the registry refuses a second action on the same file system |
| Edit the warning level in two tabs | The last save wins | R4 re-read before each save; both saves are complete objects, so nothing else is overwritten |
| Tags 200 characters long, right-to-left, or `<img onerror>` text, also as a label | Layout, UI-2 | Text nodes, `dir="auto"`, wrapping; markup shown literally; the 200-character limit in the form |
| A label or device path in the summary that looks like a second device (`/dev/sdb /dev/sdc` as a label) | The typed confirmation could be confused | The typed target is always the device name from the disk list, never a label (6.5, 7.2) |
| A technical report of 150,000 lines | The page could freeze | The first 500 lines, the rest on request (2.5) |
| `/storage/filesystems/../../rpc.php` or a 37-character "UUID" | URL as an identifier | Pattern rejects it; not-found state; no call (0.5) |
| `/storage/filesystems/add` opened from a bookmark | Could preselect and erase a disk | Nothing is chosen from the address; the disk handoff is in memory only (9); every step needs the typed confirmation |
| 0 file systems; 1; 20 | | 1.7's empty state; the table not paged but in its own frame |
| 0 disks to offer; 1; 20 | | 6.4's empty state; one device is chosen for the reader; Select all over nine in Combine disks |
| A normal user types any address here | Refused methods | "Only administrators" page, no call (10) |

### 16.2 Without sight

| Probe | Requirement |
| --- | --- |
| Tab through each page | The orders in 1.8, 2.7, 5.5, 6.9; skip link first (shell) |
| The disk choice | One radio group with named sections; each option's name reads device, model, size, then the serial and what is on it, so the reader hears what will be erased before choosing it |
| The typed confirmation | The prompt is the field's label; the reason the button is unavailable is its hint; the consequence sentences are read before the field |
| The steps | An ordered list; each step's state is a word; changes announced politely, a failure assertively with focus moved to it; the elapsed time is not announced |
| Unmount and grow dialogs | Title and consequence read together on open; focus on Cancel |
| Colour | Every state is a word and an icon shape; "Running", "Not applied yet" and Critical differ by word and shape; usage pills carry their words; destructive buttons differ by words and icon, not only colour |
| 200% zoom | One column; tables and the report scroll in their own frames only |

---

## 17. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID | Decision | Why |
| --- | --- | --- |
| D1 | **Flow A does stages A and B itself and hands stage C to the classic interface**, with exact steps and the choices this interface would make (770, Public No, no-password as a separate choice) *(recommended)* | It keeps within this slice's cleared methods; the owner gets storage in one page now and the same result for sharing; the shares domain then replaces the handover without changing stages A and B |
| D2 | A file system's page is addressed by its **file-system UUID**; not by the kernel name, not by the mount folder's name *(recommended)* | A missing file system has no kernel name, kernel names move after a restart, and OMV records file systems by UUID. The mount folder's name can contain the disk's serial number. The UUID is random and identifies no hardware |
| D3 | **OK means mounted and reachable**; how full is a separate pill beside the meter, with the dashboard's rule *(recommended)* | Two facts, each in words, and the same usage anatomy as the dashboard; a file system below its level is never called OK for its usage |
| D4 | "Set up, not mounted, nothing pending" is **Critical** *(recommended)* | The NAS was told to mount it and it is not; folders on it are broken |
| D5 | **The system drive is the list's first row**, read-only, with no page *(recommended)* | The dashboard shows it; the trail from a full system drive must not end at a page that omits it |
| D6 | **File systems found but not mounted** are listed in their own section with "Mount…" *(recommended)* | The stock list hides them behind a Mount button; they are how a reload mid-flow (R8) and a disk from another computer are recovered |
| D7 | **Mounting a found file system uses the save-then-apply loop** (the band); only Flow A applies by itself *(recommended)* | Phase 3's rule; Flow A must apply mid-flow (Q1, B7), a single mount does not |
| D8 | Flow A offers **Erase and reuse** for disks that hold something, with one quick wipe as its own step before creating, under the same typed confirmation *(recommended)* | The server's candidate list leaves them out silently; a quick wipe also clears old signatures that creating alone may leave (at the end of the disk) |
| D9 | Formats offered: **EXT4 (default), XFS, BTRFS, F2FS**; JFS left to the classic interface *(recommended)* | A choice of at most four; JFS is rarely chosen today; the contract's type enum follows |
| D10 | BTRFS on **one disk uses `create`**, as the other types do; several disks use `createBtrfs` *(recommended)* | One path for one disk: a partition, the server's "being created" marker, and the same step list. **[verify]** the BTRFS options the server uses on one disk |
| D11 | The file system's **name for people is its label, else type and device**, with the tags beside it; Flow A sets tags, not a label *(recommended)* | The generic create cannot set a label; tags are what the shared-folder picker shows; one naming rule with the disks slice |
| D12 | **Grow is not offered for BTRFS on several disks** until the VM shows what it does *(recommended)* | The server's command may grow only one disk's part, which would look like success |
| D13 | **Nothing polls**; a list is a snapshot with Refresh *(recommended)* | As the disks slice (its D3); the stock page reloads every 10 seconds, probing every file system each time |
| D14 | **Technical details are read on request** and the first 500 lines shown *(recommended)* | The report reads the disk; an EXT4 report on a large disk is very long |
| D15 | **Unmount and remove are followed by applying the changes they leave pending**, after R10, without a second question *(recommended)* | The server applies the mount change itself and leaves three modules pending; leaving them would make the action look half done; the pre-flight made sure they are only this action's |
| D16 | A **mount that is only pending** is cancelled with the band's Undo, not with Unmount *(recommended)* | Unmount on an unapplied entry would apply mount changes as a side effect; Undo is the one verb for pending changes |
| D17 | The **disk handed from a disk's page to Flow A travels in memory**, never in the address *(recommended)* | UI-4 in spirit: no address may lead towards erasing a disk; nothing about a disk belongs in history |
| D18 | **Usable space for Combine disks is estimated in the browser**, said with "about" *(recommended)* | The reader needs it to choose; the server says nothing before creating; the estimate is checked on the VM |
| D19 | Moved catalogue keys: `filesystem.reason.missing` and `filesystem.usage.*` from `dashboard.storage.*`, `fsType.*` and `fsName.onDevice` shared with the disks slice, English unchanged *(recommended)* | Several pages now use them |
| D20 | The **Used by panel adds the sharing handover** while nothing is shared from a file system this session created, or any mounted one without shared folders *(recommended)* | The flow cannot follow the classic interface; the next step must not depend on keeping the result open |
| D21 | The **handover quotes the classic interface's own option words** in quotation marks *(recommended)* | The reader must find them on the classic page; translators get the classic catalogue's entries |

---

## 18. For the owner to agree

The destructive, irreversible and access-cutting points of this slice, and every backend method
outside the cleared set. The design is built only once these are agreed.

1. **P1, what creating a file system may erase.** Creating overwrites the whole disk. Flow A offers only
   disks that both the server's candidate list and this interface's disk-use model (the disks slice's
   0.6, as agreed in its P1) allow; the stricter wins. Disks that hold something appear under "Erase and
   reuse" with what is on them, and get a quick wipe first. Refused, and listed with the reason: the
   system disk, read-only disks, disks with a file system in use, set up or being created, swap, RAID
   members, disks being wiped, and every disk when the check could not run. (6.3)
2. **P2, how creating is confirmed.** One summary that names each disk by device, model, serial number
   and size (with the label size) and says in one sentence what is lost, then typing the device name
   (`/dev/sdb`); for several disks, every device name separated by spaces. A red button with the verb,
   Enter does not confirm, no second dialog. The disks are re-checked, serial number included, as the
   first step, before anything is erased. Accepted and stated: across two sessions, Combine disks has no
   server marker, so another session can see its disks as free while BTRFS is created. (6.5, 6.6, 7.2,
   16.1)
3. **P3, the multi-disk default.** Combine disks defaults to Mirror (RAID1) (Q3); it also offers RAID10,
   Stripe (RAID0) and Join (single), each saying in one sentence what one failed disk costs. `dup`,
   RAID5 and RAID6 are not offered. (7.1)
4. **P4, Flow A stops at the mount and hands sharing over.** Until the shares methods are cleared
   (item 10), the flow ends with storage mounted and a list of the classic interface's pages and exact
   choices for the shared folder (770, Q4), access, turning SMB on, and the share (Public No; "Guests
   allowed" as a separate, explained choice, Q6). The classic shared-folder form defaults to 775, so the
   handover tells the reader to choose the 770 option. (6.1, 6.8)
5. **P5, grow.** Irreversible (nothing shrinks it again) but loses nothing. Confirmed by a red
   destructive-form dialog that names the file system and says it cannot be undone, **without** typing:
   typing stays reserved for data loss. Refused when not mounted, read-only, a type that cannot grow
   while in use, or BTRFS on several disks (until verified). The alternative is to ask for the name to
   be typed. (4.1, 4.2)
6. **P6, unmount.** It cuts access to everything on the file system until it is mounted again, and
   removes its warning level and tags; nothing on it is deleted. Refused while shared folders or other
   settings use it (the interface's own safeguard, journal 2026-11-21), when read-only or the system
   drive, while being created, and for types OMV does not mount itself. Confirmed by a red
   destructive-form dialog without typing, which lists what stops working (programs using its folder
   directly). (5.1, 5.3)
7. **P7, unmount refuses while other changes are pending.** The server's unmount applies mount changes
   at once and clears the snapshots the band's Undo uses, so the interface offers "Apply them now" or
   "Undo them" first (Q2's reasoning, applied to one action). After the unmount it applies the three
   changes the server leaves pending, without asking again. (0.7, 5.2, 5.3)
8. **P8, removing a missing file system.** It removes only the NAS's setting; nothing on any disk
   changes. A plain confirmation (not red), refused while shared folders still use it, with the same
   pre-flight as P7. (5.1, 5.3)
9. **P9, no way round a refusal.** A refused create, grow, unmount or removal offers no classic link
   that does the same without the check. The links offered lead to removing the blocker (deleting the
   shared folders), where the classic interface refuses the same thing. (0.8, 5.1)
10. **P10, backend methods outside the cleared set, for the review-list question.** None is used in this
    slice. They are needed for Flow A's stage C (section 8), and may also serve the shares domain:
    - `ShareMgmt.set` (create the shared folder; makes its directory at once)
    - `ShareMgmt.setPrivileges` (who can use it)
    - `ShareMgmt.delete` (remove a folder record left without its directory, content kept)
    - `UserMgmt.getUserList`, `UserMgmt.getGroupList` (the people and groups to choose from)
    - `SMB.getSettings`, `SMB.setSettings` (turn Windows and Mac sharing on)
    - `SMB.getShareList`, `SMB.setShare` (create the share; check it)

    Is any of them on the private review list? If none is, stage C can be designed in full with the
    shares domain and joined to Flow A.
