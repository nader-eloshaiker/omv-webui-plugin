# Phase 5, storage slice 4, ZFS: design

The fourth storage slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the
ZFS pools list, a pool's own page (its state, its disks and how they are arranged, what is stored on
it), creating a pool, ZFS file systems on a pool (creating one, its page, its size limit and
compression), snapshots (taking one, rolling back, deleting), checking a pool, replacing a disk, the
UX audit's Flow F "Replace a failing disk" (its 4.7, J8a) for ZFS, deleting a file system or a pool,
and how ZFS joins Flow A, the dashboard and the other storage pages. ZFS here is the ZFS plugin from
OMV-Extras, `openmediavault-zfs`.

**Status: agreed by the owner (P1 to P15 as written, all 19 methods cleared; journal, 2026-11-22) and
built on `phase-5-zfs`.** The contract was written from captures on the test VM, which contradicted
this design in places; the build follows the VM. Section 20 lists every change, and the sections it
names say so where they are affected. This slice erases disks (creating a pool and replacing a disk
overwrite them), destroys data (deleting a file system, a snapshot or a pool, and rolling a file system
back), and has actions that take away protection (taking a disk offline).

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-8 above all), the journal entries of 2026-11-20 (Q8: both storage plugins in version 1, each shown
only when installed; Q2: a flow refuses to start while other changes are pending), of 2026-11-21
(binding: storage in slices, each design agreed before building; the interface enforces its own
safeguards for destructive actions; nothing reads S.M.A.R.T. on its own; sharing is handed to the
classic interface for now; the owner offered Stripe for RAID, with strong warnings) and of 2026-11-22
(reads that touch member disks are confined to pages the reader opened; a plugin's presence is probed
with a call that reads no disk), the [UX audit](ux-audit.md) (Flow F in 4.7, the job-runner rules R1
to R10 in 4.1, the adversarial pass in 7), and the conventions of [phase-3-pages.md](phase-3-pages.md),
[phase-5-monitoring.md](phase-5-monitoring.md), [phase-5-disks.md](phase-5-disks.md),
[phase-5-filesystems.md](phase-5-filesystems.md) and [phase-5-raid.md](phase-5-raid.md), each in its
section 0, which every page here reuses unchanged. Where this document and the style guide disagree,
the style guide wins; raise it.

Backend facts were read from the plugin's source (`openmediavault-zfs` 8.1.4, for OMV 8.6 or later:
its RPC service, datamodels, workbench pages, storage and file-system backends, helper scripts,
README and GUIDE) and from OMV's own storage classes. Nothing has been observed yet. Anything marked
**[verify]** is checked on the mock and the VM, by capture, before it is relied on. Anything marked
**[owner]** needs the owner's answer before that part is built.

Every method used here is administrator-only (read from source: each one checks the administrator
role). A normal user sees nothing new (section 11).

## Scope of this slice (recommended)

The plugin offers far more than a home or small-office NAS owner needs on a day of ordinary
administration: about 85 methods across pools, disk groups, file systems, volumes, snapshots, clones,
encryption keys, scheduled jobs, replication and memory tuning. The classic interface stays
installed and keeps every one of them. This slice builds what an owner without ZFS knowledge needs to
**see that the pool is healthy, set it up, keep files on it, recover from a mistake, and survive a
failed disk**, and leaves the rest to the classic interface, linked plainly (section 18, P2).

| Built here                                                                                                                                                | Left to the classic interface, and why                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The pools list and a pool's page: state worst first, capacity, the disks and how they are arranged, health per disk, the last check, what is stored on it | **Import and export**: moving a pool between computers is rare, and a forced import of a pool still in use elsewhere can damage it. The list's footer says where it is                                                                                                                                       |
| Creating a pool with one group of disks: Mirror, RAID-Z1, RAID-Z2, RAID-Z3, and Stripe (no protection) apart and never preselected                        | **Adding disk groups, spares, read caches, write logs and metadata disks, removing a group, growing RAID-Z by one disk, attaching and detaching mirror disks**: each changes the pool's layout for good or needs knowledge to choose well; the plugin's own guide warns against adding them without a reason |
| ZFS file systems at the top of a pool: create, open, set a size limit, turn compression on or off, delete                                                 | **Nested file systems, record size, case sensitivity, mount folder, renaming, cloning, promoting, the raw property editor**: tuning, not daily work                                                                                                                                                          |
| Snapshots of a file system: list, take one now, roll back to the newest, delete one                                                                       | **Range deletes, cloning a snapshot, the difference report, scheduled snapshots**: bulk or scheduled work with its own forms                                                                                                                                                                                 |
| Checking a pool (scrub): check now, stop, continue a paused check; the progress while it runs                                                             | **Pausing a check, scheduled checks, TRIM, upgrading a pool's features** (one-way)                                                                                                                                                                                                                           |
| Replacing a disk (Flow F), taking a disk offline and back, clearing error counts after a fixed fault                                                      | **Volumes** (block devices for virtual machines or iSCSI): listed, not managed                                                                                                                                                                                                                               |
| How ZFS appears on the dashboard, the Disks, File systems and Flow A pages                                                                                | **Encryption**: unlocking, locking and keys are secrets with their own storage choices on the NAS (UI-6); the pages show which file systems are encrypted and whether they are locked                                                                                                                        |
|                                                                                                                                                           | **Discover** (registering file systems made outside OMV), **Fix packages**, **ARC statistics and memory settings**, **pool history**, **replication jobs**                                                                                                                                                   |

The recommendation rests on three things: the destructive actions kept are the ones an owner will
meet (create, replace, delete, roll back); every action kept can be given a plain sentence for what
it costs; and the actions left out are the ones whose consequences cannot be put in one sentence
without ZFS knowledge.

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the four
async states, the settings-form rules, the pending mark, the shared catalogue), the monitoring domain's
(status words, background and foreground reads, the idle timeout), the disks slice's (disk names, the
disk-use model, the wipe, what wakes a disk, one confirmation then a step list), the file-systems
slice's (file-system names, the Used by panel, Flow A and its job runner, the handover to the classic
interface for sharing) and the RAID slice's (a plugin shown only when installed, the one poll while
the kernel works, protection said in words, Stripe apart and never preselected, the session store for
what a flow hands on). This section adds only what is new.

### 0.1 The words: pool, file system, volume, snapshot

ZFS's own words mean nothing to most owners, and "dataset" means nothing to anyone. The interface uses
four nouns, each introduced once where it first appears, in the catalogue as shared keys:

| ZFS term                                         | The interface says                                                                                                                                          | Introduced as (`zfs.term.*`)                                                                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pool (`zpool`)                                   | **pool** ("ZFS pool" where the context does not say ZFS)                                                                                                    | "A pool joins one or more disks into one store of space, and decides how your files survive a failed disk."                                            |
| vdev                                             | **disk group**, said only for pools with more than one ("group of 2 mirrored disks"); a pool made here has one, and the page then says nothing about groups | "A pool is made of one or more groups of disks. Each group protects its own disks. If any group loses more disks than it can, the whole pool is lost." |
| dataset of type filesystem                       | **file system** (the word the File systems pages already use, for the same thing to an owner: somewhere to keep shared folders)                             | "A ZFS file system is a folder on a pool that you can share, with its own size limit and snapshots. All file systems on a pool share its free space."  |
| the pool's root dataset                          | **the pool's own folder**                                                                                                                                   | "Every pool is also a file system itself, in the folder named after the pool. It is better to keep files in file systems made on the pool."            |
| zvol                                             | **volume**                                                                                                                                                  | "A volume is a part of the pool that acts as a separate disk, for virtual machines or iSCSI. This page lists volumes but does not manage them."        |
| snapshot                                         | **snapshot**                                                                                                                                                | "A snapshot keeps a file system's files as they were at one moment. It takes no space at first, and grows as the files change."                        |
| scrub                                            | **check** (as the RAID slice)                                                                                                                               | "A check reads every file on the pool and compares it with its copies. ZFS repairs what it finds from a good copy."                                    |
| resilver                                         | **rebuilding** (as the RAID slice)                                                                                                                          |                                                                                                                                                        |
| spare, cache (L2ARC), log (SLOG), special, dedup | **spare**, **read cache**, **write log**, **metadata disk**, **deduplication table**                                                                        | Shown only, with one sentence each (0.4)                                                                                                               |

"Dataset", "vdev", "zpool", "zvol", "scrub", "resilver", "ARC" and "ashift" appear only in the
technical details (the server's own report) and in `Identifier` names.

### 0.2 Formatting

| What                                                                         | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Example                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| A pool's name (`{{pool}}`)                                                   | The pool's `name`, as text in `Identifier` (it is a technical name the reader chose or the classic interface made), `dir="auto"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `tank`                                                |
| A file system's name (`{{fs}}`)                                              | Its full `path` (`pool/name`) in `Identifier`; the pool's own folder is said as "{{pool}} (the pool's own folder)"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `tank/media`                                          |
| A snapshot's name (`{{snapshot}}`)                                           | The part after `@` (`name` in the reply) in `Identifier`; the full `path` (`pool/name@snap`) only in technical places (the typed confirmation names the short part, 5.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `2026-11-22_14-05-00`                                 |
| Layout of a disk group (`{{layout}}`)                                        | A shared word list `zfsLayout.*`, with the RAID words where the idea is the same: `mirror` "Mirror"; `raidz1` "Parity (RAID-Z1)"; `raidz2` "Double parity (RAID-Z2)"; `raidz3` "Triple parity (RAID-Z3)"; a single disk "Single disk"; several single disks "Stripe"; `draid…` "Distributed parity (dRAID)"; anything else as received, in `Identifier`                                                                                                                                                                                                                                                                       | `Mirror`                                              |
| A pool's layout in a list                                                    | "{{layout}}, {{count}} disks" for one group; "{{count}} groups, {{disks}} disks" for several, the groups named on its page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `Parity (RAID-Z1), 3 disks`                           |
| Space for files                                                              | From **the pool's own folder** row (`listPools`, `poolroot` true): `used` and `used + available` (bytes), with Phase 3's byte rule and "about" before the total. The pool row's own `size`, `used` and `available` are the disks' raw space, parity included for RAID-Z, so they are **not** shown as space for files (section 17, D6) **[verify]** both against the VM                                                                                                                                                                                                                                                       | `1.2 TiB of about 7.1 TiB used`                       |
| How full                                                                     | The pool row's `capacity` (whole percent, of the raw space): the meter's value. It is what ZFS itself uses to slow down and refuse writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `17% full`                                            |
| File system space                                                            | `used`; "{{available}} free, shared with the other file systems on {{pool}}"; with a size limit (`size` not null), "{{used}} of {{limit}} used"                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `340.0 GiB used · 6.8 TiB free, shared with the pool` |
| Compression                                                                  | `compression`: `off` "Off"; `lz4` "On (LZ4)"; `on` "On"; `zstd…`, `gzip…`, `lzjb`, `zle` "On ({{value}})" with the value in `Identifier`; and `compressratio` as "saves about {{percent}}" when above `1.00`. The plugin writes the ratio without an "x" ("1.00", observed; section 20, item 5); a trailing "x" is read too                                                                                                                                                                                                                                                                                                   | `On (LZ4), saves about 18%`                           |
| Progress of a check or a rebuild                                             | From the report's `scan:` lines (0.3): the percentage before `% done` with one decimal, and "about {{left}} left" from the `to go` time with the duration rule; neither: "progress not known"                                                                                                                                                                                                                                                                                                                                                                                                                                 | `27.0% done, about 10 minutes left`                   |
| Last check                                                                   | The **date** from the plugin's `lastscrub`, which carries its time zone ("Sat Nov 21 12:00:00 UTC 2026", observed); the report's `scan:` line has none, so it says only **what** the last scan was. "Last checked {{when}}" with the relative-date rule and the date in this computer's format and time zone on a second line; "Never checked" for `Never`; "The last check was stopped on {{date}}" for a cancelled one; after a rebuild (the scan line says "resilvered"), "Not checked since a disk was rebuilt on {{date}}". A date whose time zone is not UTC, GMT or an offset is shown as written (section 20, item 8) | `Last checked about 3 days ago`                       |
| Disk names, serial numbers, label sizes                                      | The disks slice's rules (its 0.1), including the label size in every confirmation that erases a disk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `3.6 TiB (4 TB on the label)`                         |
| Server-written text (the report, state words not recognised, error messages) | As received, as text (UI-2), `dir="auto"`. The plugin joins report lines with a line feed and a carriage return; the interface splits on either and drops empty ends                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                       |

The pool row's `devices` field joins device paths with a markup line break; the interface does not
use it (UI-2), and reads the devices from `getPoolDevices` instead (0.4).

### 0.3 A pool's state

The pills use the fixed words and the shared `health.*` keys. A pool's state is read from three
places, and the stricter reading wins:

- `listPools`'s pool row: `state` (ZFS's word for the pool: `ONLINE`, `DEGRADED`, `FAULTED`,
  `SUSPENDED`, `UNAVAIL`, `REMOVED`, `OFFLINE`, or `UNKNOWN` when the plugin could not read it),
  `status` (`OK`, or `Error` when ZFS counts damaged data), `scrubstate`, `removalactive`;
- the pool's **report** (`getObjectDetails` with type `Pool`: ZFS's own status report of the pool),
  parsed for the `scan:` line, the device tree with each device's state and its read, write and
  checksum error counts, and the `errors:` line;
- `getPoolDevices`: each disk's full path and state (0.4).

The report is open text; the interface recognises only the forms below **[verify]** every form on the
VM by capture (section 15).

| Recognised                                                                                         | State        | Reason, beside the pill                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state` is `UNKNOWN`, empty or missing, or the report could not be read or parsed                  | **Unknown**  | "Could not read its state."                                                                                                                        |
| `FAULTED`, `UNAVAIL`, `REMOVED`, `OFFLINE`                                                         | **Critical** | "Cannot be used. Too many of its disks are missing or have failed, so its files cannot be reached."                                                |
| `SUSPENDED`                                                                                        | **Critical** | "Stopped reading and writing after errors on its disks. Its files cannot be reached."                                                              |
| `status` is `Error`, or the `errors:` line counts damaged data                                     | **Critical** | "ZFS found damaged files that it could not repair from a copy. The technical details list them."                                                   |
| `DEGRADED` and a rebuild in progress                                                               | **Critical** | "A disk is missing or has failed. Rebuilding onto {{disk}}: {{progress}}. {{protection}}" (0.5's sentence for what is left until the rebuild ends) |
| `DEGRADED`                                                                                         | **Critical** | "A disk is missing or has failed. {{protection}} Replace the disk."                                                                                |
| `ONLINE`, a rebuild in progress (after replacing a disk that still worked, or a disk brought back) | **Warning**  | "Copying data onto {{disk}}: {{progress}}. It is fully protected again when this ends."                                                            |
| `ONLINE`, `removalactive`                                                                          | **Warning**  | "Moving data off a disk group that is being removed: this was started in the classic interface."                                                   |
| `ONLINE`, a disk's error counts are above zero                                                     | **Warning**  | "A disk has reported errors: {{disk}}. ZFS repaired them from a copy. Check the pool, and replace the disk if the errors come back."               |
| `ONLINE`, a check in progress                                                                      | **OK**       | "Being checked: {{progress}}. This can take hours."                                                                                                |
| `ONLINE`, a check paused                                                                           | **OK**       | "The check is paused at {{percent}}."                                                                                                              |
| `ONLINE`, none of the above                                                                        | **OK**       | none                                                                                                                                               |
| anything else                                                                                      | **Unknown**  | "Its state is “{{state}}”, which this page does not recognise."                                                                                    |

- **Degraded is Critical**, as the style guide names it (its 2) and as the RAID slice does (its D4),
  even while it rebuilds and even for RAID-Z2 with one disk missing: until the rebuild ends, it is
  short of a disk. The words say how much protection is left.
- **The report's own `status:` and `action:` paragraphs are not shown** beside the pill: they are
  English advice in ZFS command terms ("use 'zpool clear'"), and one of them is about pool features,
  which is not a problem. They are in the technical details.
- **Unknown fails closed**: every action that changes the pool is unavailable while its state is
  Unknown, with the reason "Its state could not be read, so it cannot be changed now."
- When the pool row says `ONLINE` but the report shows a disk that is not working (0.4), the pool is
  treated as degraded (the stricter reading wins).

**How full** is the meter's own concern, as on the dashboard (its 1.2.3), with fixed levels for pools
(section 17, D7): **Warning** at 80% or more ("ZFS slows down when a pool is more than 80% full."),
**Critical** at 95% or more ("Almost no space is left. Saving files may fail."). The pool's own
folder's mount entry has OMV's warning level as well; the File systems page keeps showing that one.

Not statuses, and so never coloured or pilled: the layout, the name, compression, the last check
date, encryption, and a disk's role (0.4), which carries the Critical pill only when the disk is
Failed, Missing or Removed.

### 0.4 A disk's place and state in a pool

The report's device tree says how the disks are arranged; `getPoolDevices` gives each disk's full path
(the report prints a short name) and state. The interface matches them by name, ignoring a partition
suffix (`-part1`) that ZFS adds on whole disks **[verify]** the forms, and matches each path to a disk
of `DiskMgmt.getList` by the disks slice's names and partition rule.

| Where in the tree                                                                              | Shown as                                                                                                                 | Notes                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| A data group (`mirror-0`, `raidz1-0`, …)                                                       | A group heading: "{{layout}}, {{count}} disks" and 0.5's sentence for that group                                         | Only when the pool has more than one group, or any class below                                                                          |
| A disk directly under the pool (no group)                                                      | "Single disk" for a pool of one, "Stripe" for several                                                                    | Protects nothing (0.5)                                                                                                                  |
| `spares`                                                                                       | Heading "Spares": "A spare waits, and takes the place of a failed disk by itself."                                       |                                                                                                                                         |
| `logs`, `cache`, `special`, `dedup`                                                            | Headings "Write log", "Read cache", "Metadata disks", "Deduplication table", each with "Added in the classic interface." | Shown, never changed here                                                                                                               |
| `replacing-N`, `spare-N` (inside a group, while a disk is being replaced or a spare stands in) | The two disks on **one row**: "{{new}} is taking the place of {{old}}", with the new disk's progress                     | `getPoolDevices` gives both disks the group `replacing-1` (observed): one replacement in progress, never two disks (section 20, item 6) |

| ZFS's word for the disk                         | Role                         | Shown                                                                                                                                    |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ONLINE`, error counts zero                     | **Working**                  | the word                                                                                                                                 |
| `ONLINE`, any error count above zero            | **Working, with errors**     | the Warning pill and "{{read}} read, {{write}} write and {{checksum}} checksum errors since the counts were last cleared"                |
| `ONLINE` with the report's `(resilvering)` mark | **Rebuilding**               | the word and 0.2's progress                                                                                                              |
| `DEGRADED` (a disk)                             | **Failing**                  | the Critical pill and "ZFS stopped trusting it after too many errors."                                                                   |
| `FAULTED`                                       | **Failed**                   | the Critical pill and "Failed"                                                                                                           |
| `UNAVAIL`                                       | **Missing**                  | the Critical pill and "Missing: not connected, or it cannot be opened" with the path it was last seen at (the report's "was …")          |
| `REMOVED`                                       | **Removed**                  | the Critical pill and "Removed: it was unplugged while in use"                                                                           |
| `OFFLINE`                                       | **Offline**                  | the word and "Taken offline. ZFS does not use it until it is brought back." No pill: it was a choice; the pool's pill says what it costs |
| `AVAIL` (a spare)                               | **Spare**                    | "Waiting"                                                                                                                                |
| `INUSE` (a spare)                               | **Spare, standing in**       | "Standing in for {{disk}}"                                                                                                               |
| anything else                                   | as received, in `Identifier` | the role is not known                                                                                                                    |

- **Counts**: working disks are the Working and Working-with-errors ones; a Rebuilding disk is not yet
  working.
- **Fail closed**: if the report cannot be read or parsed, a disk in the tree has no match in
  `getPoolDevices`, or `getPoolDevices` answers with no disks for a pool that has some, the roles are
  "Not known" and every action that depends on them (replacing, taking offline, bringing back) is
  unavailable: "Could not tell what each disk is doing, so this cannot be done now." with "Try again".

### 0.5 What a pool protects

From each data group's layout and its number of disks `n`, in words, on the pool's page, in the
create form and in every confirmation (section 17, D5):

| Layout                  | It can lose                                                                           | Usable space (each disk counts as the smallest in its group, `s`) |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Mirror                  | `n − 1` disks: "It can lose {{count}} disks and keep every file." (2 disks: "1 disk") | `s`                                                               |
| Parity (RAID-Z1)        | 1 disk                                                                                | `(n − 1) × s`                                                     |
| Double parity (RAID-Z2) | 2 disks                                                                               | `(n − 2) × s`                                                     |
| Triple parity (RAID-Z3) | 3 disks                                                                               | `(n − 3) × s`                                                     |
| Single disk, Stripe     | none: "It cannot lose any disk. If one fails, everything on the pool is lost."        | the total of the disks                                            |

- With several groups: "It can lose {{count}} disks in each group. If one group loses more, the whole
  pool is lost." (the smallest figure of the groups), with each group's own sentence on its heading.
- When disks are missing or failed, "It can lose" is reduced by that many in that group, down to "It
  cannot lose another disk."
- **ZFS checks every file it reads** against a checksum, and repairs a damaged one from a copy when
  the layout keeps one; a Single disk or a Stripe can find damage but not repair it. The create form
  says so once (3.2).
- Usable space is computed in the browser and always said with "about", **calibrated on the VM**
  (section 20, item 7): the pool's own folder's `used + available` as a share of the base was 90.8% of
  `s` for a mirror and a single disk, 90.8% of `2s` for a stripe of two, 94.8% of `2s` for a RAID-Z1 of
  three and 92.4% of `2s` for a RAID-Z2 of four. Those shares are used for those layouts; any other
  RAID-Z count uses 90%, below every share seen, so the estimate never claims more. Rounded down to the
  tenth of its unit.

### 0.6 What touches the disks, and the one poll

The owner's rule is that a background read must not wake a disk, and the RAID slice found that reads
which touch member disks are confined to pages the reader opened (journal, 2026-11-22). Reading
S.M.A.R.T. stays the disks slice's business and nothing here reads it.

From the source, the plugin's reads run ZFS's own status and listing commands. The status commands
(`zpool status`, `zpool list`) report the kernel's view of the pool; the listing commands (`zfs list`,
`zfs get`) read each file system's properties, which ZFS usually holds in memory but may have to read
from the pool when memory is short. None of this has been observed yet:

| Method                                                                   | What it runs (read from source)                                                         | Touches the disks?                              | When this slice calls it                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `Zfs.listCompressionTypes`                                               | nothing: it returns a fixed list                                                        | No                                              | Once after an administrator signs in, for the menu item (0.11)       |
| `Zfs.getPoolStatus`                                                      | the status and list commands, for every pool                                            | Expected not **[verify]**                       | The dashboard, once per visit (10.1); the disk-use model (0.8)       |
| `Zfs.getPoolDevices`                                                     | the status command, for one pool                                                        | Expected not **[verify]**                       | A pool's page; the disk-use model, once per pool; the replace flow   |
| `Zfs.getObjectDetails` (type `Pool`)                                     | the status command with its error list, for one pool                                    | Expected not **[verify]**                       | The ZFS list (each pool) and a pool's page; the poll for a busy pool |
| `Zfs.listPools`                                                          | the status and list commands, and the listing commands for every file system and volume | Possibly **[verify]**                           | The ZFS pages: on opening, Refresh, after an action, the poll        |
| `Zfs.getAllSnapshots`                                                    | the listing command for every snapshot on every pool                                    | Possibly **[verify]**                           | A file system's page, its snapshots section                          |
| `Zfs.getObjectDetails` (type `Filesystem`)                               | the listing commands for one file system, all properties                                | Possibly **[verify]**                           | Only on "Show technical details" (4.3)                               |
| `Zfs.getEmptyCandidates`                                                 | OMV's device information, as `MdMgmt.getCandidates`                                     | As in the RAID slice                            | The create and replace flows                                         |
| `Zfs.addPool`, `deviceReplace`, `deleteObjectBg` (pool), `DiskMgmt.wipe` |                                                                                         | Yes, they write to the disks                    | Only after their confirmations                                       |
| `Zfs.scrubPool`                                                          |                                                                                         | Yes: it reads every disk of the pool, for hours | Only after its confirmation (section 6)                              |

So the pools are read **only on the ZFS pages, the Disks pages and the flows**, which are about pools
or disks, and the dashboard reads only `getPoolStatus`, once per visit, if the VM shows that it reads
no disk (section 18, P14). Whether any of these wakes a spun-down disk is for real hardware (15.3).

**The one poll** (section 18, P13). ZFS does the long work (checking, rebuilding) by itself, and the
reader wants to see it move. So, **only while a pool shown on the page is being checked or rebuilt**,
the ZFS list re-reads `listPools` and the busy pools' reports every 30 seconds, and a pool's page
re-reads `listPools`, that pool's report and `getPoolDevices`. It is a background poll (the monitoring
domain's 0.4: `updatelastaccess: false`, stopped while the tab is hidden, no retry by itself after a
failure). It stops when nothing on the page is busy, so a healthy, idle NAS is never polled. Beside
the "Read at" time: "Updated every 30 seconds while a pool is being checked or rebuilt." A paused
check is not busy. Nothing else in this slice polls.

### 0.7 Names: in addresses, and for new pools and file systems

**Addresses** (section 11). A pool's page is `/storage/zfs/pools/$pool`; a file system's page is
`/storage/zfs/fs/$` with the file system's full name as the rest of the address (`/storage/zfs/fs/tank`
for the pool's own folder, `/storage/zfs/fs/tank/media`). Each part of the address is validated before
anything is read:

- a pool's name: `^[A-Za-z][A-Za-z0-9_.:-]{0,63}$`;
- each part of a file system's name after the pool: `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$`, not `.` or
  `..`, at most 8 parts and 255 characters in all.

The page reads `listPools` and finds the row whose `path` is exactly the address's name; every later
call uses that row's fields, never the address (UI-4). A name that fails a pattern, or names no row,
shows the not-found state and makes no pool- or file-system-specific call. **A pool or file system
whose name is outside these patterns** (made elsewhere, with spaces or other characters) has no page:
its row shows its name as text, its state and "This page cannot open it. Manage it in the classic
interface." with the footer's link.

**Names this interface gives** are stricter (section 18, P5):

| Name              | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Said to the reader when it fails                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new pool        | 1 to 32 characters; a letter first, then letters, digits, hyphens and underscores (`^[A-Za-z][A-Za-z0-9_-]{0,31}$`); not a name ZFS keeps for itself (`mirror`, `raidz`, `draid`, `spare`, `log`, or a name starting with one of the first four, case ignored); not the name of a folder the system itself uses at the top of the disk (`bin`, `boot`, `dev`, `etc`, `home`, `lib`, `lib32`, `lib64`, `media`, `mnt`, `opt`, `proc`, `root`, `run`, `sbin`, `srv`, `sys`, `tmp`, `usr`, `var`, case ignored); not the name of a pool already on this NAS | "Use 1 to 32 letters, digits, hyphens or underscores, starting with a letter." / "{{name}} is a word ZFS keeps for itself. Choose another name." / "{{name}} is a folder the system uses. The pool's folder would be /{{name}}, so choose another name." / "There is already a pool called {{name}}." |
| A new file system | 1 to 64 characters; a letter or digit first, then letters, digits, hyphens, underscores and full stops (`^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$`); not `.` or `..`; not the name of a file system or volume already at the top of that pool, case ignored                                                                                                                                                                                                                                                                                                     | "Use 1 to 64 letters, digits, hyphens, underscores or full stops, starting with a letter or digit." / "There is already a file system or volume called {{name}} on {{pool}}."                                                                                                                         |

The pool's folder on the NAS is `/{{pool}}`, and a file system's is `/{{pool}}/{{name}}`, the plugin's
own defaults (section 17, D13). The contract's request schemas carry the same patterns (section 12).

### 0.8 Which disks may go into a pool

Creating a pool and replacing a disk overwrite the disks they are given. The plugin's own list of
candidates (`getEmptyCandidates`) leaves out read-only disks, disks connected by USB, disks that
another setting refers to, disks in use, and any disk on which a file system was found (read from
source); ZFS itself refuses a disk that holds a file system or a partition table unless it is forced,
and this interface never forces (section 17, D12). As in Flow A and the RAID slice, **each disk is
placed by both the plugin's list and the disks slice's disk-use model (its 0.6), and the stricter
wins** (journal, 2026-11-21):

| Group                          | A disk is here when                                                                                                                                                                                                                       | Shown as                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty disks**                | It is in `getEmptyCandidates`, and the disk-use model finds nothing on it ("No file system found", or "Empty (wiped at …)" in this session)                                                                                               | Offered first                                                                                                                                                                                                                                                                                                                                     |
| **Erase and reuse**            | It is not in `getEmptyCandidates`, the disk-use model allows a wipe ("No file system found", or "File system {{name}}, not used on this NAS"), it is in no pool (below), and it is not connected by USB                                   | Offered under its own heading, each with what is on it; it gets a quick wipe first, as in Flow A and the RAID slice. **Settled on the VM** (section 20, item 4): a deleted pool's disks, a disk replaced out of a pool and a disk a refused create wrote to keep ZFS's partition table and are not candidates until wiped, so they come back here |
| **Too small** (replacing only) | Otherwise offered, but smaller than the disk it replaces (or, for a missing disk, than the smallest disk left in its group)                                                                                                               | Not offered; under "Cannot be used": "It is smaller than the disk it would replace ({{size}}). A replacement must be at least as large."                                                                                                                                                                                                          |
| **Cannot be used**             | Anything else in `DiskMgmt.getList`: the system disk, a read-only disk, a disk with a file system in use, set up or being created, swap, a RAID member, **a disk in a ZFS pool** (below), a disk being wiped, and a disk connected by USB | Not offered; listed in a `Disclosure` "Disks that cannot be used ({{count}})", each with the disks slice's blocker sentence; for a pool: "It is part of ZFS pool {{pool}}."; for USB: "It is connected by USB. The ZFS plugin does not use USB disks, because a USB connection can drop and damage the pool."                                     |

**A disk in a ZFS pool** joins the disk-use model in this slice (section 10.2): a disk is "Part of ZFS
pool {{pool}}" when one of `getPoolDevices`'s paths, for any pool in `getPoolStatus`, names the disk or
one of its partitions. That covers spares, read caches, write logs and metadata disks too, and pools
whose file systems are not mounted. A pool that has been exported, or one from another computer, is
not visible to any read here; its disks show as "No file system was found, but the disk is not empty:
it may hold old partitions, or be part of a RAID array or a ZFS pool from another computer." (the
RAID slice's sentence, extended).

- **USB** is what the plugin itself leaves out; the interface reads it as the RAID slice does, from the
  disk's `/dev/disk/by-id/usb-…` link.
- **After a reuse disk is erased**, it must appear in `getEmptyCandidates` before it is used; if it
  does not, the flow stops with the disk erased and says so (3.7, 7.2).
- **Fail closed**: if `getEmptyCandidates`, any disk-use input, `getPoolStatus` or any pool's
  `getPoolDevices` fails, nothing is offered: `EmptyState variant="error"` "Could not check which disks
  can be used." + server message + "Try again". An empty reply is not taken on trust where another
  read shows a pool: `getPoolStatus` with no pools while `FileSystemMgmt.getList` has ZFS file
  systems, or `getPoolDevices` with no disks for a listed pool, is treated as a failed read (section
  17, D10).
- The disk is sent to the server by the stable name the plugin's candidate list gives
  (`/dev/disk/by-id/…`), with the plugin's own by-id setting, so a disk renamed between the check and
  the call is never hit by mistake. For an Erase and reuse disk, its `/dev/disk/by-id/…` link from
  `DiskMgmt.getList` decides that it can be offered, and after its wipe the name the candidate list
  then gives is sent. The contract takes only by-id names, so a disk with none is not offered: "It has
  no stable ID, which ZFS needs to find it again after a restart." (section 20, item 9).

### 0.9 Pending changes in this slice

The plugin marks four modules pending after anything that adds or removes a file system the NAS knows
about (read from source): `fstab` "File system mounts", `collectd` "Performance statistics", `monit`
"Service monitoring" and `quota` "Disk quotas" (existing keys), the same four as a mount in Flow A. It
does so for snapshots too. Deleting a pool or a file system also removes the plugin's scheduled jobs
for it, which marks `zfscron` pending **[verify]**. Changes to the pool itself (a check, a replaced
disk, a disk offline) mark nothing.

| Action                                                                          | Marks pending                                                    | Applied by                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Create a pool (section 3), add a file system (4.2)                              | `fstab`, `collectd`, `monit`, `quota` **[verify]**               | The flow's own checkpoint at its end, after R10                                                                                |
| Delete a snapshot, a file system or a pool (5.5, section 9)                     | the same four, and `zfscron` when a job was removed **[verify]** | The dialog's own last step, right after the deletion, after refusing to start while anything else is pending (section 18, P15) |
| Size limit, compression (4.4)                                                   | `collectd`, `monit`, `quota` **[verify]**                        | The band, as any saved setting                                                                                                 |
| Take a snapshot, roll back, check, stop, replace, offline, online, clear errors | nothing                                                          |                                                                                                                                |
| Saving the email or notification settings in the classic interface              | `zfszed` too (the plugin listens for them)                       | The band                                                                                                                       |

New module words: `modules.zfs` "ZFS settings", `modules.zfszed` "ZFS alerts", `modules.zfscron` "ZFS
schedules". The band knows them by name; this slice never marks `zfs` itself.

**Why deletions apply their own changes.** A deleted snapshot that leaves "File system mounts,
Performance statistics, Service monitoring, Disk quotas" pending would puzzle anyone, and Undo in the
band cannot bring the snapshot back. So a deletion behaves as the file-systems slice's unmount does
(its P7): it refuses to start while other changes are pending, offering to apply or undo them first,
and after the deletion it applies exactly what the deletion left pending (R10 re-reads first and asks
when something new appeared).

**The pending mark on a file system's page** appears when `quota` or `monit` is pending and this
session saved this file system's settings since the last apply.

### 0.10 The interface's own refusals

The plugin refuses some things itself (read from source): deleting a pool that still has file systems
or volumes, deleting a file system that has file systems inside it, and deleting either while a shared
folder uses it. ZFS refuses some more: a disk in use, rolling back past newer snapshots, deleting a
file system whose snapshot another file system was cloned from. Every refusal below is **also** the
interface's own (journal, 2026-11-21), checked before the call and again at its first step, and a
refusal offers no classic link that would do the same thing without the check (the earlier slices' P3,
P9 and P10).

| Action               | Refused when                                                                                                                                                                                                                                                                                                                                        | Section |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Create a pool        | Fewer disks than the layout needs; any disk the 0.8 groups do not offer; a name 0.7 refuses                                                                                                                                                                                                                                                         | 3       |
| Add a file system    | The pool is not usable (Critical for `FAULTED`, `UNAVAIL`, `SUSPENDED`), Unknown, or full (Critical by 0.3's level); a name 0.7 refuses                                                                                                                                                                                                             | 4.2     |
| Size limit           | Smaller than what the file system already holds                                                                                                                                                                                                                                                                                                     | 4.4     |
| Take a snapshot      | The file system is locked (encrypted, its key not loaded), or the pool is not usable or Unknown                                                                                                                                                                                                                                                     | 5.3     |
| Roll back            | Not the file system's newest snapshot; the file system is locked; the pool is not usable or Unknown                                                                                                                                                                                                                                                 | 5.4     |
| Delete a snapshot    | Another file system was cloned from it (`origin` of a row in `listPools`)                                                                                                                                                                                                                                                                           | 5.5     |
| Check                | The pool is Critical or Unknown, being rebuilt, or already being checked                                                                                                                                                                                                                                                                            | 6       |
| Replace a disk       | The pool is Unknown, `FAULTED`, `UNAVAIL` or `SUSPENDED`; a rebuild is already running; the disk is a spare, read cache, write log, metadata disk or deduplication disk; a Single disk or Stripe disk that is not Working (its data is gone, 7.1); the roles are not known; the new disk is not offered by 0.8                                      | 7       |
| Take offline         | The disk's group would be left with no copy (0.5: it cannot lose another disk), or the disk is not Working; the pool is not OK or Warning; a rebuild is running                                                                                                                                                                                     | 7.7     |
| Bring back           | The disk is not Offline                                                                                                                                                                                                                                                                                                                             | 7.7     |
| Delete a file system | It is the pool's own folder (delete the pool instead); file systems or volumes inside it; a shared folder uses it (`ShareMgmt.getList`, by its mount entry, and the plugin's `hasshares`); something else uses its mount entry (`_used`); it is locked; another file system was cloned from one of its snapshots; the reads these rules need failed | 9.1     |
| Delete a pool        | Any file system or volume on it other than its own folder; a shared folder uses its own folder; something else uses its own folder's mount entry; its own folder is locked; the reads these rules need failed                                                                                                                                       | 9.2     |
| Any of them          | The pool's state is Unknown (0.3); an action on this pool is already running in this session; the object changed since the page was read (a pool by its name and disks, a file system by its name and pool)                                                                                                                                         | all     |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message. The interface always sends the mount
folder it read for the object (`mp`), after its own check of the shared folders.

### 0.11 When the ZFS plugin is not installed

OMV answers every method of an unknown service with HTTP 404 "RPC service 'Zfs' not found." (read
from OMV's RPC layer, observed for `MdMgmt` on the VM), and the app reads that as "no ZFS plugin"
(`isZfsPluginMissing`). OMV matches service names without regard to case (read from source); the
contract names the service `Zfs`, as the classic interface does.

- **The menu item "ZFS" is not shown** (Q8). Whether it is shown is decided by one
  `Zfs.listCompressionTypes` read, made once after an administrator signs in and kept for the session
  (section 11); it runs no command and reads nothing on the NAS (section 18, P14). While that read is
  loading, the item is not shown; on any other failure it is shown, and the page shows the error.
  Installing the plugin shows the item at the next sign-in. It is not repeated when a task ends.
- **Opening a ZFS address anyway** (`/storage/zfs`, a pool's page, a file system's page, a flow)
  shows, in place of the page's content, `EmptyState variant="empty"` with a neutral icon:
  - "ZFS needs the openmediavault-zfs plugin, which is not installed on this NAS."
  - "ZFS keeps your files safe across several disks, checks every file it reads, and can take
    snapshots. To use it, install openmediavault-zfs under System > Plugins in the classic interface
    (it comes from OMV-Extras), then come back here."
  - `ExternalLink` "Plugins in the classic interface" → `/#/system/plugins`.
  - No other call is made, and no pool- or file-system-specific address is resolved.
- **Elsewhere nothing claims anything about ZFS**, as today: the Disks pages and Flow A have no ZFS
  uses, and the disks slice's untraceable-storage sentence (its P4) still names ZFS.
- If the plugin is removed while a ZFS page is open, its next read answers 404 and the page switches
  to this state.
- **The plugin is installed but ZFS itself is not working** (its kernel module did not build after a
  kernel update, a known hazard of a module built on the NAS): the reads fail with the server's words,
  and each page shows its error state with them. The pools' file systems then show as Missing on the
  File systems page and the dashboard, which already say what that means (10.1, 10.3).

### 0.12 What uses a pool or a file system

Every ZFS file system the plugin knows has a mount entry in OMV (it makes one when it creates a pool
or a file system, read from source), and so appears in `FileSystemMgmt.getList` as a file system of
type `zfs` whose `devicefile` is its full name (read from the plugin's file-system backend). The
interface names what uses it with the library's `UsedByPanel`, as the file-systems slice does (its
0.6):

- **Shared folders on it**: rows of `ShareMgmt.getList` whose `mntent.dir` equals the file system's
  `mountpoint`. `FsTab.getByFsName` refuses a ZFS name (HTTP 400, observed: OMV's datamodel takes only
  a UUID or a device file), so it is **never called** for a ZFS file system (section 20, item 1). Each
  by name, with a router link to the Shared folders page. The plugin's own `hasshares` is read too, and
  the stricter wins: `hasshares` with no folder found refuses the delete with "The ZFS plugin says a
  shared folder uses it."
- **Something else**: the `getList` row's `_used` is true and no shared folder matches: the
  file-systems slice's sentence, with the classic File systems link.
- **File systems and volumes inside it** (`listPools` rows whose `path` starts with this one's and a
  `/`): each by name; a file system with a router link to its page, a volume with "Managed in the
  classic interface".
- **Clones**: a row whose `origin` is one of this file system's snapshots: "{{fs}} was made from its
  snapshot {{snapshot}}." (made in the classic interface).
- **Could not check**: a read failed: the panel's retry form. The refusals of 0.10 rest on these reads
  together, and fail closed.

---

## 1. Storage > ZFS

**Question it answers:** are my pools healthy, is any of them short of a disk or nearly full, and when
was each last checked? **Leads to:** a pool's page; creating a pool.

Administrators only, and only with the plugin installed (0.11). Route `/storage/zfs`.

### 1.1 Data

In parallel, on opening, on Refresh and after an action this session started ends; plus the poll of
0.6 while a pool is busy:

- `Zfs.listPools`: pools, file systems and volumes in one flat list (`type` `Pool`, `Filesystem` or
  `Volume`; the pool's own folder appears both as the pool row and as a `Filesystem` row with
  `poolroot` true) (read from source);
- each pool's report (`Zfs.getObjectDetails`, type `Pool`), for the state, the layout and the last
  check (0.3, 0.4) **[verify]** the time on a NAS with several pools;
- `EmailNotification.get` (exists), for the alerts line (1.5);
- `System.getInformation`'s `dirtyModules` (the shell's, already warm).

### 1.2 Layout

1. Page title "ZFS".
2. Intro: "ZFS keeps your files on one or more disks as a pool. Depending on how the disks are
   arranged, a pool keeps working when a disk fails, and ZFS checks every file it reads. It is not a
   backup: a file deleted by mistake is gone from every disk at once, unless a snapshot keeps it."
3. **Roll-up line** (1.4), only when something is not fine.
4. **Unfinished work** notice (1.6), only when found.
5. **Toolbar**: **"Create pool"** (filled primary, router link to `/storage/zfs/create`), "Refresh"
   (neutral), and on the trailing side "Read at {{time}}." and, while polling, the poll sentence.
6. The **table** (1.3), not paged.
7. **Alerts line** (1.5).
8. Footer: `ExternalLink` "ZFS in the classic interface" → `/#/storage/zfs/pools`, with one line before
   it, `text-sm muted-foreground`: "Importing or exporting a pool, adding disks to a pool, encryption,
   volumes and scheduled snapshots and checks are in the classic interface."

### 1.3 Columns

| Order | Header       | Field                                   | Display                                                                                                                                                              |
| ----- | ------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Pool         | `name`                                  | A router link to the pool's page, in `Identifier`. Accessible name "Open pool {{pool}}". No link for a name outside 0.7's pattern. Sortable (natural order)          |
| 2     | State        | 0.3                                     | The pill and its reason, never in a tooltip; while checking or rebuilding, a compact `ProgressBar` under the reason with the same figures as text                    |
| 3     | Layout       | the report                              | 0.2's pool layout words                                                                                                                                              |
| 4     | Space        | the pool's own folder's row, `capacity` | `CapacityMeter` compact: "{{used}} of about {{total}} used" (0.2) and the meter at `capacity`; the Warning or Critical pill of 0.3 beside it. Sortable by `capacity` |
| 5     | Last check   | the report                              | 0.2's last-check words. Over 35 days, or never, a second line `text-sm muted-foreground`: "Pools should be checked about once a month." (not a status)               |
| 6     | File systems | `listPools`                             | "{{count}} file systems" (the pool's own folder not counted), and "{{count}} volumes" when there are any                                                             |

The rows keep the server's order on every read; problems are led by the roll-up, not by moving rows.
There is no row selection and no row action: each pool's actions are on its page.

### 1.4 Roll-up line

`role="status"`, polite, above the toolbar, only when any pool is not OK (by state or by how full):
the worst pill and "1 of 2 pools: Critical" (`zfs.rollUp`). Nothing when every pool is OK; there is no
"all OK" claim.

### 1.5 Alerts line

`text-sm`, under the table, from `EmailNotification.get`, as the RAID list's (its 1.5):

- Email on: "When a disk in a pool fails, the NAS emails you, if ZFS alerts are on under Notifications
  in the classic interface." with `ExternalLink` "Notification events in the classic interface" →
  `/#/system/notification/events`. (The plugin's alerts follow OMV's email settings and their own
  event switch, read from source; the switch is not in the contract and is not read.)
- Email off: "Email notifications are off, so a failed disk is shown only here and on the dashboard."
  with `ExternalLink` "Notification settings in the classic interface" →
  `/#/system/notification/settings`.
- The read failed: nothing.

### 1.6 Unfinished work (R8)

The job journal lives in memory, so a reload ends a flow view. The list recognises from server state:

| Found                                                                                                                   | Line                                                                                                                                    | Action                                              |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| A pool this session created, with no file system but its own folder, whose create flow chose "Make a first file system" | "Pool {{pool}} has no file system for shared folders yet."                                                                              | Router link "Add a file system" → 4.2 for that pool |
| `fstab` (or another of 0.9's modules) pending, and this session created or deleted something on a pool                  | "The NAS has not saved the change to pool {{pool}} yet. Apply the pending changes so its file systems are monitored and can be shared." | none: the band carries Apply                        |

### 1.7 States

| State                               | Look                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin not installed                | 0.11                                                                                                                                                                                                                                                                                             |
| Loading                             | Header row and `TableSkeletonRows` (2); "Loading the ZFS pools…" for assistive technology                                                                                                                                                                                                        |
| Error (`listPools` failed, not 404) | `EmptyState variant="error"` in the table body: "Could not read the ZFS pools." + server message + "Try again". The toolbar stays                                                                                                                                                                |
| Empty                               | `EmptyState variant="empty"`: "There are no ZFS pools yet. Create one to keep your files on one or more disks, with copies that survive a failed disk." Action: router link "Create pool". Under it, `text-sm muted-foreground`: "A pool from another NAS is imported in the classic interface." |
| A pool's report failed              | That row: Layout and Last check "Not known", State Unknown with "Could not read its state." The other rows stay                                                                                                                                                                                  |
| Refreshing                          | Rows stay with `aria-busy`; Refresh shows "Refreshing…"; afterwards "Read at" is announced. A poll does not announce                                                                                                                                                                             |
| Poll failed                         | The rows stay; beside "Read at": "Could not update since {{time}}." and "Try again"                                                                                                                                                                                                              |
| Populated                           | The table                                                                                                                                                                                                                                                                                        |

### 1.8 Keyboard

Tab order: the unfinished-work actions, Create pool, Refresh, the sortable headers, each row's pool
link, the alerts line's link, the footer link. The table scrolls in its own named region at narrow
widths; under 640 px the table shows Pool and State as columns, with the layout, the space and the
last check on a second line under the pool, as the RAID list does. After Refresh, focus stays on
Refresh. A poll never moves focus.

### 1.9 Copy

| Key                                      | English                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zfs.title`                              | ZFS                                                                                                                                                                                                                                                                                  |
| `zfs.intro`                              | ZFS keeps your files on one or more disks as a pool. Depending on how the disks are arranged, a pool keeps working when a disk fails, and ZFS checks every file it reads. It is not a backup: a file deleted by mistake is gone from every disk at once, unless a snapshot keeps it. |
| `zfs.create`                             | Create pool                                                                                                                                                                                                                                                                          |
| `zfs.refresh`                            | Refresh                                                                                                                                                                                                                                                                              |
| `zfs.refreshing`                         | Refreshing…                                                                                                                                                                                                                                                                          |
| `zfs.readAt`                             | Read at {{time}}.                                                                                                                                                                                                                                                                    |
| `zfs.polling`                            | Updated every 30 seconds while a pool is being checked or rebuilt.                                                                                                                                                                                                                   |
| `zfs.pollFailed`                         | Could not update since {{time}}.                                                                                                                                                                                                                                                     |
| `zfs.loading`                            | Loading the ZFS pools…                                                                                                                                                                                                                                                               |
| `zfs.loadFailed`                         | Could not read the ZFS pools.                                                                                                                                                                                                                                                        |
| `zfs.empty`                              | There are no ZFS pools yet. Create one to keep your files on one or more disks, with copies that survive a failed disk.                                                                                                                                                              |
| `zfs.emptyImport`                        | A pool from another NAS is imported in the classic interface.                                                                                                                                                                                                                        |
| `zfs.rollUp_one` / `_other`              | {{number}} of {{count}} pool: {{status}} / {{number}} of {{count}} pools: {{status}}                                                                                                                                                                                                 |
| `zfs.tableLabel`                         | ZFS pools                                                                                                                                                                                                                                                                            |
| `zfs.col.pool`                           | Pool                                                                                                                                                                                                                                                                                 |
| `zfs.col.state`                          | State                                                                                                                                                                                                                                                                                |
| `zfs.col.layout`                         | Layout                                                                                                                                                                                                                                                                               |
| `zfs.col.space`                          | Space                                                                                                                                                                                                                                                                                |
| `zfs.col.lastCheck`                      | Last check                                                                                                                                                                                                                                                                           |
| `zfs.col.fileSystems`                    | File systems                                                                                                                                                                                                                                                                         |
| `zfs.open`                               | Open pool {{pool}}                                                                                                                                                                                                                                                                   |
| `zfs.noPage`                             | This page cannot open it. Manage it in the classic interface.                                                                                                                                                                                                                        |
| `zfs.space`                              | {{used}} of about {{total}} used                                                                                                                                                                                                                                                     |
| `zfs.fsCount_one` / `_other`             | {{count}} file system / {{count}} file systems                                                                                                                                                                                                                                       |
| `zfs.volCount_one` / `_other`            | {{count}} volume / {{count}} volumes                                                                                                                                                                                                                                                 |
| `zfs.checkAdvice`                        | Pools should be checked about once a month.                                                                                                                                                                                                                                          |
| `zfs.alerts.on`                          | When a disk in a pool fails, the NAS emails you, if ZFS alerts are on under Notifications in the classic interface.                                                                                                                                                                  |
| `zfs.alerts.onLink`                      | Notification events in the classic interface                                                                                                                                                                                                                                         |
| `zfs.alerts.off`                         | Email notifications are off, so a failed disk is shown only here and on the dashboard.                                                                                                                                                                                               |
| `zfs.alerts.offLink`                     | Notification settings in the classic interface                                                                                                                                                                                                                                       |
| `zfs.unfinished.noFs`                    | Pool <pool></pool> has no file system for shared folders yet.                                                                                                                                                                                                                        |
| `zfs.unfinished.addFs`                   | Add a file system                                                                                                                                                                                                                                                                    |
| `zfs.unfinished.notSaved`                | The NAS has not saved the change to pool <pool></pool> yet. Apply the pending changes so its file systems are monitored and can be shared.                                                                                                                                           |
| `zfs.footerLine`                         | Importing or exporting a pool, adding disks to a pool, encryption, volumes and scheduled snapshots and checks are in the classic interface.                                                                                                                                          |
| `zfs.classicLink`                        | ZFS in the classic interface                                                                                                                                                                                                                                                         |
| `zfs.notInstalled.title`                 | ZFS needs the openmediavault-zfs plugin, which is not installed on this NAS.                                                                                                                                                                                                         |
| `zfs.notInstalled.body`                  | ZFS keeps your files safe across several disks, checks every file it reads, and can take snapshots. To use it, install openmediavault-zfs under System > Plugins in the classic interface (it comes from OMV-Extras), then come back here.                                           |
| `zfs.notInstalled.link`                  | Plugins in the classic interface                                                                                                                                                                                                                                                     |
| `zfs.term.pool`                          | A pool joins one or more disks into one store of space, and decides how your files survive a failed disk.                                                                                                                                                                            |
| `zfs.term.group`                         | A pool is made of one or more groups of disks. Each group protects its own disks. If any group loses more disks than it can, the whole pool is lost.                                                                                                                                 |
| `zfs.term.fileSystem`                    | A ZFS file system is a folder on a pool that you can share, with its own size limit and snapshots. All file systems on a pool share its free space.                                                                                                                                  |
| `zfs.term.poolFolder`                    | Every pool is also a file system itself, in the folder named after the pool. It is better to keep files in file systems made on the pool.                                                                                                                                            |
| `zfs.term.volume`                        | A volume is a part of the pool that acts as a separate disk, for virtual machines or iSCSI. This page lists volumes but does not manage them.                                                                                                                                        |
| `zfs.term.snapshot`                      | A snapshot keeps a file system's files as they were at one moment. It takes no space at first, and grows as the files change.                                                                                                                                                        |
| `zfs.term.check`                         | A check reads every file on the pool and compares it with its copies. ZFS repairs what it finds from a good copy.                                                                                                                                                                    |
| `zfsState.unread`                        | Could not read its state.                                                                                                                                                                                                                                                            |
| `zfsState.unusable`                      | Cannot be used. Too many of its disks are missing or have failed, so its files cannot be reached.                                                                                                                                                                                    |
| `zfsState.suspended`                     | Stopped reading and writing after errors on its disks. Its files cannot be reached.                                                                                                                                                                                                  |
| `zfsState.dataErrors`                    | ZFS found damaged files that it could not repair from a copy. The technical details list them.                                                                                                                                                                                       |
| `zfsState.degradedRebuilding`            | A disk is missing or has failed. Rebuilding onto <disk></disk>: {{progress}}. {{protection}}                                                                                                                                                                                         |
| `zfsState.degraded`                      | A disk is missing or has failed. {{protection}} Replace the disk.                                                                                                                                                                                                                    |
| `zfsState.copying`                       | Copying data onto <disk></disk>: {{progress}}. It is fully protected again when this ends.                                                                                                                                                                                           |
| `zfsState.removing`                      | Moving data off a disk group that is being removed: this was started in the classic interface.                                                                                                                                                                                       |
| `zfsState.diskErrors`                    | A disk has reported errors: <disk></disk>. ZFS repaired them from a copy. Check the pool, and replace the disk if the errors come back.                                                                                                                                              |
| `zfsState.checking`                      | Being checked: {{progress}}. This can take hours.                                                                                                                                                                                                                                    |
| `zfsState.checkPaused`                   | The check is paused at {{percent}}.                                                                                                                                                                                                                                                  |
| `zfsState.unrecognised`                  | Its state is “{{state}}”, which this page does not recognise.                                                                                                                                                                                                                        |
| `zfsState.unknownBlocks`                 | Its state could not be read, so it cannot be changed now.                                                                                                                                                                                                                            |
| `zfsState.fullWarning`                   | ZFS slows down when a pool is more than 80% full.                                                                                                                                                                                                                                    |
| `zfsState.fullCritical`                  | Almost no space is left. Saving files may fail.                                                                                                                                                                                                                                      |
| `zfsState.progress`                      | {{percent}} done, about {{left}} left                                                                                                                                                                                                                                                |
| `zfsState.progressNoTime`                | {{percent}} done                                                                                                                                                                                                                                                                     |
| `zfsState.progressUnknown`               | progress not known                                                                                                                                                                                                                                                                   |
| `zfsCheck.last`                          | Last checked {{when}}                                                                                                                                                                                                                                                                |
| `zfsCheck.never`                         | Never checked                                                                                                                                                                                                                                                                        |
| `zfsCheck.stopped`                       | The last check was stopped on {{date}}                                                                                                                                                                                                                                               |
| `zfsLayout.mirror` … `zfsLayout.unknown` | Mirror, Parity (RAID-Z1), Double parity (RAID-Z2), Triple parity (RAID-Z3), Single disk, Stripe, Distributed parity (dRAID), Not known                                                                                                                                               |
| `zfsLayout.withDisks_one` / `_other`     | {{layout}}, {{count}} disk / {{layout}}, {{count}} disks                                                                                                                                                                                                                             |
| `zfsLayout.groups`                       | {{groups}} groups, {{disks}} disks                                                                                                                                                                                                                                                   |
| `zfsProtect.mirror_one` / `_other`       | It can lose {{count}} disk and keep every file. / It can lose {{count}} disks and keep every file.                                                                                                                                                                                   |
| `zfsProtect.parity_one` / `_other`       | It can lose {{count}} disk. / It can lose {{count}} disks.                                                                                                                                                                                                                           |
| `zfsProtect.none`                        | It cannot lose any disk. If one fails, everything on the pool is lost.                                                                                                                                                                                                               |
| `zfsProtect.noMore`                      | It cannot lose another disk.                                                                                                                                                                                                                                                         |
| `zfsProtect.groups_one` / `_other`       | It can lose {{count}} disk in each group. If one group loses more, the whole pool is lost. / It can lose {{count}} disks in each group. If one group loses more, the whole pool is lost.                                                                                             |
| `modules.zfs`                            | ZFS settings                                                                                                                                                                                                                                                                         |
| `modules.zfszed`                         | ZFS alerts                                                                                                                                                                                                                                                                           |
| `modules.zfscron`                        | ZFS schedules                                                                                                                                                                                                                                                                        |

---

## 2. A pool's page

**Question it answers:** is this pool healthy, which disks is it made of and what is each doing, how
full is it, and what is stored on it? **Leads to:** replacing a disk, checking the pool, adding a file
system, a file system's page, or deleting the pool.

Administrators only. Route `/storage/zfs/pools/$pool` (0.7). No menu item of its own; the ZFS item is
current while it is open.

### 2.1 Data on opening

- The list page's queries (1.1), shared and warm when coming from there, and this pool's report;
- `Zfs.getPoolDevices` with the pool's name, for each disk's path and state (0.4);
- `DiskMgmt.getList` (shared), to link each disk, name its model and serial number and size;
- `FileSystemMgmt.getList` and `ShareMgmt.getList` (shared), for what uses the pool's file systems
  (0.12);
- the session's disk-health check (the disks slice's D4), when there is one, for each disk's health;
  this page never starts it.

While the pool is busy, 0.6's poll re-reads `listPools`, the report and `getPoolDevices`.

### 2.2 Layout

1. **Breadcrumbs**: "ZFS" (router link) › `{{pool}}` (current page).
2. **Page title**: "Pool {{pool}}". Under it, `text-sm muted-foreground`: "{{layout}} · {{space}}".
3. **State line**: the pill and reason of 0.3 in a `role="status"` region (polite; a poll that changes
   the pill announces the new state once; a poll that only moves the percentage does not), the
   `ProgressBar` while busy, and "Read at {{time}}." with the poll sentence.
4. **What to do now** (2.4), only when 0.3 or 0.4 gives a reason to act.
5. **Summary card** (2.3).
6. **Disks** (2.5), `h2` "Disks".
7. **File systems** (2.6), `h2` "File systems", with "Add a file system".
8. **Check this pool** (section 6), `h2` "Check this pool".
9. **Technical details** (2.7), `h2` "Technical details".
10. After a divider and a 24px gap: **"Delete this pool"** (section 9.2).

One column; at 1024px and wider the summary facts take two columns. Document title: "Pool {{pool}} –
ZFS – openmediavault".

### 2.3 Summary card

A `FactList`:

| Label             | Value                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State             | 0.3's pill and reason                                                                                                                                                                    |
| Layout            | 0.2's words, and under it, `text-sm muted-foreground`, 0.5's protection sentence for the pool as it is now                                                                               |
| Space for files   | `CapacityMeter`: "{{used}} of about {{total}} used ({{capacity}} full)", and 0.3's level pill when crossed. Under it: "Shared by every file system on this pool."                        |
| Last check        | 0.2's words; while checking, the progress                                                                                                                                                |
| Compression       | the pool's own folder's `compression` and `compressratio` (0.2), and "File systems on the pool use it unless they say otherwise."                                                        |
| Encryption        | Only when the pool's own folder is encrypted: "Encrypted" (`encryption` not `OFF`), and "Locked" or "Unlocked" (`keystatus`), with "Locking and unlocking are in the classic interface." |
| Folder on the NAS | the pool's own folder's `mountpoint`, in `Identifier`, with `CopyButton`                                                                                                                 |

### 2.4 What to do now

A `Card` with an `h3`, the steps as an ordered list, and the action buttons. It is the start of Flow F
(section 8); each case says only what applies:

| Case                                                                      | Heading                             | Body and actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A disk **Failed**, **Failing** or **Removed**, still listed with its path | "Replace the failed disk"           | "The disk {{device}} ({{model}}, serial number {{serial}}) has failed. Replace it with a disk at least {{size}} large." Then two numbered ways (section 8): with a free place for a disk: "Connect the new disk, then press Replace the disk." Without: "Turn off the NAS, swap the failed disk for the new one, turn it on, then come back here and press Replace the disk." Button **"Replace the disk…"** (filled; router link to the replace flow with this disk chosen in memory, section 7) |
| A disk **Missing**                                                        | "Replace the missing disk"          | "A disk of this pool cannot be found any more. It was last seen as {{path}}. These disks are still in the pool: {{list}} (each with its serial number). The disk that is not in this list is the one to replace." Then "Connect a disk at least {{size}} large, then press Replace the disk." and "Look for new disks" (`DiskMgmt.rescan`, then the reads). Button **"Replace the disk…"**                                                                                                        |
| A disk **Offline**                                                        | "A disk is offline"                 | "{{device}} was taken offline, so the pool is not fully protected. If you are replacing it, swap it now and press Replace the disk. If not, bring it back." Buttons "Replace the disk…" and "Bring it back…" (7.7)                                                                                                                                                                                                                                                                                |
| **Rebuilding**                                                            | "Rebuilding"                        | "ZFS is copying everything onto {{disk}}. This takes hours on a large disk. Its files can be used meanwhile. You can leave this page or sign out; rebuilding goes on on the NAS." No button                                                                                                                                                                                                                                                                                                       |
| **Unusable** (`FAULTED`, `UNAVAIL`, `SUSPENDED`)                          | "This pool cannot be used"          | "Too many of its disks are missing or have failed. If a disk was unplugged, connect it again and restart the NAS. This page cannot repair a pool in this state; the technical details show what ZFS reports." **[verify]** that reconnecting and restarting brings a pool back on the VM                                                                                                                                                                                                          |
| **Damaged files** (`errors:` above zero)                                  | "Some files are damaged"            | "ZFS found files it could not repair, because no good copy was left. The technical details list them. Copy them back from a backup or a snapshot, then check the pool again." Button "Show technical details"                                                                                                                                                                                                                                                                                     |
| A disk **Working, with errors**, the pool otherwise OK                    | "A disk has reported errors"        | "ZFS found errors on {{device}} ({{model}}, serial number {{serial}}) and repaired them from a copy. A loose cable can cause this as well as a failing disk. Check the pool. If the errors come back, replace the disk." Buttons "Check now…" (section 6) and "Clear the error counts…" (7.8), with under it: "Clear them only after you have fixed the cause, such as a cable."                                                                                                                  |
| A Working disk's **health check** is Warning or Critical                  | "A disk in this pool may fail soon" | "The disk health check found a problem on {{device}} ({{model}}, serial number {{serial}}): {{reason}}. Replace it before it fails. ZFS keeps using it while it copies everything onto the new disk, so the pool stays protected." Buttons "Replace the disk…" and a router link "Open disk {{device}}" for its health details                                                                                                                                                                    |

The card never claims a disk is failing from anything but 0.4's role or the session's health check;
"Not checked" disks are never warned about.

### 2.5 Disks

A table, one row per disk in the report's tree, grouped as 0.4 says. With one data group and nothing
else, there are no group headings; otherwise each group or class is a heading row (`TableGroupRow`,
13.1) with its words.

| Order | Header    | Display                                                                                                                                                                                                                                                                            |
| ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Disk      | The device as a router link to its disk page (the disks slice's rule), in `Identifier`; a missing disk: "Missing" in `muted-foreground`, and the path it was last seen at under it                                                                                                 |
| 2     | Model     | The model, and under it the serial number in `Identifier` (from `DiskMgmt.getList`)                                                                                                                                                                                                |
| 3     | Size      | From `DiskMgmt.getList`, right-aligned, tabular                                                                                                                                                                                                                                    |
| 4     | Role      | 0.4's word; Failed, Failing, Missing and Removed with the Critical pill; Working with errors with the Warning pill and the counts; Rebuilding with its progress                                                                                                                    |
| 5     | Health    | From the session's check: the pill and reason; "Not checked" in `muted-foreground` with, once under the table, a router link "Check disk health on the Disks page"                                                                                                                 |
| 6     | (actions) | A visible "Replace…" button (neutral) on each row where section 7 allows it, accessible name "Replace {{device}} in pool {{pool}}"; "Take offline…" or "Bring back…" (7.7) where allowed. Where an action is not allowed, nothing in the row and the reason in the section's place |

Under the table, `text-sm muted-foreground`, only when the pool has any: "Spares, read caches, write
logs and metadata disks are added and removed in the classic interface."

### 2.6 File systems

A table of the pool's file systems and volumes (`listPools` rows of this pool), the pool's own folder
first:

| Order | Header      | Display                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | File system | The name as a router link to its page (0.7), in `Identifier`; the pool's own folder as "{{pool}} (the pool's own folder)"; a volume as text with "Volume"                                                                                                                                                                                                                                                                                                                   |
| 2     | State       | A file system: **OK** when mounted; **Critical** "Locked. Its files cannot be reached until it is unlocked in the classic interface." when encrypted and its key not loaded; **Critical** "Not mounted. Its files cannot be reached." otherwise (the file-systems slice's 0.2 words); no pill and "Has no folder" when its `mountpoint` is empty or `none` (made so in the classic interface) **[verify]** the value. A volume: no pill, "Managed in the classic interface" |
| 3     | Used        | `used`, and "of {{limit}}" when it has a size limit                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4     | Snapshots   | the count from `getAllSnapshots` once it has been read on a file system's page this session; otherwise nothing (the list is not read here, 0.6)                                                                                                                                                                                                                                                                                                                             |
| 5     | Shared      | "{{count}} shared folders" from 0.12, or "Not shared"                                                                                                                                                                                                                                                                                                                                                                                                                       |

Above the table: the term sentences of 0.1 for a file system and the pool's own folder, in a
`Disclosure` "What is a file system?" (once per page). Under it: **"Add a file system"** (neutral, router
link to 4.2), unavailable with 0.10's reason when refused. With only the pool's own folder:
"Nothing is kept on this pool yet, except in its own folder. Add a file system for your shared
folders."

### 2.7 Technical details

The pool's report, already read for the state (`getObjectDetails`, type `Pool`): shown on "Show
technical details" without a warning sentence, as text on the terminal pair (`TaskLog`, `size="page"`,
`wrap={false}`), with "Copy report" and "Hide technical details". Intro: "ZFS's own report on the
pool: how its disks are arranged, their error counts, the last check, and any damaged files." The
report can name damaged files by their folder and name; it lives in the session's memory only (UI-13)
and is never put in a title, a toast or a log. Failed: `InlineAlert tone="critical"` "Could not read
the technical details." + message + "Try again" (and 0.4's roles are "Not known").

### 2.8 Keyboard and focus

Tab order: the breadcrumb link, the What to do now card's buttons, the summary's copy button, the Disks
table (each disk link, each row action), Check disk health on the Disks page, the File systems table
(each link), What is a file system?, Add a file system, the check section's buttons, Show technical
details (then the report, Copy report, Hide), Delete pool…. A poll never moves focus, and a row that
disappears in a poll moves focus to its table's heading only if focus was in that row.

### 2.9 States of the page

| State                                                                                                              | Look                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin not installed                                                                                               | 0.11                                                                                                                                                                                                                 |
| Loading                                                                                                            | Title skeleton; the summary as `FactListSkeleton`; the sections' headings with skeletons                                                                                                                             |
| `listPools` failed                                                                                                 | `EmptyState variant="error"`: "Could not read this pool." + server message + "Try again"                                                                                                                             |
| No such pool (pattern fails, or no row)                                                                            | `EmptyState variant="empty"`: "There is no pool with this name on this NAS. It may have been deleted, or exported in the classic interface." and router link "Show all pools" → `/storage/zfs`                       |
| Gone after a re-read (deleted in another tab)                                                                      | The same empty state                                                                                                                                                                                                 |
| The disks changed after a re-read (another pool now has this name: none of its disks are the ones the page showed) | An `InlineAlert` (Unknown treatment) above the title: "This is a different pool from the one this page showed. Its details have been read again." Every running dialog of this page closes with "This pool changed." |
| The report or `getPoolDevices` failed                                                                              | The page, with roles "Not known" and 0.4's blocked actions                                                                                                                                                           |
| Populated                                                                                                          | 2.2                                                                                                                                                                                                                  |

### 2.10 Copy

| Key                                                                   | English                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zfsPool.title`                                                       | Pool {{pool}}                                                                                                                                                                                                                                  |
| `zfsPool.documentTitle`                                               | Pool {{pool}} – ZFS                                                                                                                                                                                                                            |
| `zfsPool.subtitle`                                                    | {{layout}} · {{space}}                                                                                                                                                                                                                         |
| `zfsPool.fact.state`                                                  | State                                                                                                                                                                                                                                          |
| `zfsPool.fact.layout`                                                 | Layout                                                                                                                                                                                                                                         |
| `zfsPool.fact.space`                                                  | Space for files                                                                                                                                                                                                                                |
| `zfsPool.spaceShared`                                                 | Shared by every file system on this pool.                                                                                                                                                                                                      |
| `zfsPool.spaceValue`                                                  | {{used}} of about {{total}} used ({{capacity}} full)                                                                                                                                                                                           |
| `zfsPool.fact.lastCheck`                                              | Last check                                                                                                                                                                                                                                     |
| `zfsPool.fact.compression`                                            | Compression                                                                                                                                                                                                                                    |
| `zfsPool.compressionInherit`                                          | File systems on the pool use it unless they say otherwise.                                                                                                                                                                                     |
| `zfsPool.fact.encryption`                                             | Encryption                                                                                                                                                                                                                                     |
| `zfsPool.encrypted`                                                   | Encrypted                                                                                                                                                                                                                                      |
| `zfsPool.locked`                                                      | Locked                                                                                                                                                                                                                                         |
| `zfsPool.unlocked`                                                    | Unlocked                                                                                                                                                                                                                                       |
| `zfsPool.encryptionClassic`                                           | Locking and unlocking are in the classic interface.                                                                                                                                                                                            |
| `zfsPool.fact.folder`                                                 | Folder on the NAS                                                                                                                                                                                                                              |
| `zfsPool.todo.failedTitle`                                            | Replace the failed disk                                                                                                                                                                                                                        |
| `zfsPool.todo.failedBody`                                             | The disk <device></device> ({{model}}, serial number <serial></serial>) has failed. Replace it with a disk at least {{size}} large.                                                                                                            |
| `zfsPool.todo.wayFree`                                                | Connect the new disk, then press Replace the disk.                                                                                                                                                                                             |
| `zfsPool.todo.waySwap`                                                | Turn off the NAS, swap the failed disk for the new one, turn it on, then come back here and press Replace the disk.                                                                                                                            |
| `zfsPool.todo.replace`                                                | Replace the disk…                                                                                                                                                                                                                              |
| `zfsPool.todo.missingTitle`                                           | Replace the missing disk                                                                                                                                                                                                                       |
| `zfsPool.todo.missingBody`                                            | A disk of this pool cannot be found any more. It was last seen as <path></path>. These disks are still in the pool: {{list}}. The disk that is not in this list is the one to replace.                                                         |
| `zfsPool.todo.missingConnect`                                         | Connect a disk at least {{size}} large, then press Replace the disk.                                                                                                                                                                           |
| `zfsPool.todo.rescan`                                                 | Look for new disks                                                                                                                                                                                                                             |
| `zfsPool.todo.offlineTitle`                                           | A disk is offline                                                                                                                                                                                                                              |
| `zfsPool.todo.offlineBody`                                            | <device></device> was taken offline, so the pool is not fully protected. If you are replacing it, swap it now and press Replace the disk. If not, bring it back.                                                                               |
| `zfsPool.todo.bringBack`                                              | Bring it back…                                                                                                                                                                                                                                 |
| `zfsPool.todo.rebuildingTitle`                                        | Rebuilding                                                                                                                                                                                                                                     |
| `zfsPool.todo.rebuildingBody`                                         | ZFS is copying everything onto <disk></disk>. This takes hours on a large disk. Its files can be used meanwhile. You can leave this page or sign out; rebuilding goes on on the NAS.                                                           |
| `zfsPool.todo.unusableTitle`                                          | This pool cannot be used                                                                                                                                                                                                                       |
| `zfsPool.todo.unusableBody`                                           | Too many of its disks are missing or have failed. If a disk was unplugged, connect it again and restart the NAS. This page cannot repair a pool in this state; the technical details show what ZFS reports.                                    |
| `zfsPool.todo.damagedTitle`                                           | Some files are damaged                                                                                                                                                                                                                         |
| `zfsPool.todo.damagedBody`                                            | ZFS found files it could not repair, because no good copy was left. The technical details list them. Copy them back from a backup or a snapshot, then check the pool again.                                                                    |
| `zfsPool.todo.errorsTitle`                                            | A disk has reported errors                                                                                                                                                                                                                     |
| `zfsPool.todo.errorsBody`                                             | ZFS found errors on <device></device> ({{model}}, serial number <serial></serial>) and repaired them from a copy. A loose cable can cause this as well as a failing disk. Check the pool. If the errors come back, replace the disk.           |
| `zfsPool.todo.clearHint`                                              | Clear them only after you have fixed the cause, such as a cable.                                                                                                                                                                               |
| `zfsPool.todo.healthTitle`                                            | A disk in this pool may fail soon                                                                                                                                                                                                              |
| `zfsPool.todo.healthBody`                                             | The disk health check found a problem on <device></device> ({{model}}, serial number <serial></serial>): {{reason}}. Replace it before it fails. ZFS keeps using it while it copies everything onto the new disk, so the pool stays protected. |
| `zfsPool.disks.title`                                                 | Disks                                                                                                                                                                                                                                          |
| `zfsPool.disks.tableLabel`                                            | Disks in pool {{pool}}                                                                                                                                                                                                                         |
| `zfsPool.disks.col.disk` / `.model` / `.size` / `.role` / `.health`   | Disk / Model / Size / Role / Health                                                                                                                                                                                                            |
| `zfsPool.disks.missing`                                               | Missing                                                                                                                                                                                                                                        |
| `zfsPool.disks.lastSeen`                                              | Last seen as <path></path>                                                                                                                                                                                                                     |
| `zfsPool.disks.replaceLabel`                                          | Replace {{device}} in pool {{pool}}                                                                                                                                                                                                            |
| `zfsPool.disks.classesClassic`                                        | Spares, read caches, write logs and metadata disks are added and removed in the classic interface.                                                                                                                                             |
| `zfsPool.disks.checkHealth`                                           | Check disk health on the Disks page                                                                                                                                                                                                            |
| `zfsPool.group.heading`                                               | {{layout}}, {{count}} disks                                                                                                                                                                                                                    |
| `zfsPool.group.spares`                                                | Spares                                                                                                                                                                                                                                         |
| `zfsPool.group.sparesHint`                                            | A spare waits, and takes the place of a failed disk by itself.                                                                                                                                                                                 |
| `zfsPool.group.log` / `.cache` / `.special` / `.dedup`                | Write log / Read cache / Metadata disks / Deduplication table                                                                                                                                                                                  |
| `zfsPool.group.classic`                                               | Added in the classic interface.                                                                                                                                                                                                                |
| `zfsPool.group.replacing`                                             | <new></new> is taking the place of <old></old>                                                                                                                                                                                                 |
| `zfsRole.working` … `zfsRole.unknown`                                 | Working, Working, with errors, Rebuilding, Failing, Failed, Missing, Removed, Offline, Spare, Spare, standing in, Not known                                                                                                                    |
| `zfsRole.errors`                                                      | {{read}} read, {{write}} write and {{checksum}} checksum errors since the counts were last cleared                                                                                                                                             |
| `zfsRole.failing`                                                     | ZFS stopped trusting it after too many errors.                                                                                                                                                                                                 |
| `zfsRole.missing`                                                     | Missing: not connected, or it cannot be opened                                                                                                                                                                                                 |
| `zfsRole.removed`                                                     | Removed: it was unplugged while in use                                                                                                                                                                                                         |
| `zfsRole.offline`                                                     | Taken offline. ZFS does not use it until it is brought back.                                                                                                                                                                                   |
| `zfsRole.spareWaiting`                                                | Waiting                                                                                                                                                                                                                                        |
| `zfsRole.standingIn`                                                  | Standing in for <disk></disk>                                                                                                                                                                                                                  |
| `zfsRole.notKnownBlocks`                                              | Could not tell what each disk is doing, so this cannot be done now.                                                                                                                                                                            |
| `zfsPool.fs.title`                                                    | File systems                                                                                                                                                                                                                                   |
| `zfsPool.fs.tableLabel`                                               | File systems on pool {{pool}}                                                                                                                                                                                                                  |
| `zfsPool.fs.col.name` / `.state` / `.used` / `.snapshots` / `.shared` | File system / State / Used / Snapshots / Shared                                                                                                                                                                                                |
| `zfsPool.fs.poolFolder`                                               | <pool></pool> (the pool's own folder)                                                                                                                                                                                                          |
| `zfsPool.fs.volume`                                                   | Volume                                                                                                                                                                                                                                         |
| `zfsPool.fs.volumeClassic`                                            | Managed in the classic interface                                                                                                                                                                                                               |
| `zfsPool.fs.locked`                                                   | Locked. Its files cannot be reached until it is unlocked in the classic interface.                                                                                                                                                             |
| `zfsPool.fs.notMounted`                                               | Not mounted. Its files cannot be reached.                                                                                                                                                                                                      |
| `zfsPool.fs.noFolder`                                                 | Has no folder                                                                                                                                                                                                                                  |
| `zfsPool.fs.usedOf`                                                   | {{used}} of {{limit}}                                                                                                                                                                                                                          |
| `zfsPool.fs.shared_one` / `_other`                                    | {{count}} shared folder / {{count}} shared folders                                                                                                                                                                                             |
| `zfsPool.fs.notShared`                                                | Not shared                                                                                                                                                                                                                                     |
| `zfsPool.fs.what`                                                     | What is a file system?                                                                                                                                                                                                                         |
| `zfsPool.fs.add`                                                      | Add a file system                                                                                                                                                                                                                              |
| `zfsPool.fs.onlyRoot`                                                 | Nothing is kept on this pool yet, except in its own folder. Add a file system for your shared folders.                                                                                                                                         |
| `zfsPool.details.title`                                               | Technical details                                                                                                                                                                                                                              |
| `zfsPool.details.show`                                                | Show technical details                                                                                                                                                                                                                         |
| `zfsPool.details.hide`                                                | Hide technical details                                                                                                                                                                                                                         |
| `zfsPool.details.copy`                                                | Copy report                                                                                                                                                                                                                                    |
| `zfsPool.details.intro`                                               | ZFS's own report on the pool: how its disks are arranged, their error counts, the last check, and any damaged files.                                                                                                                           |
| `zfsPool.details.failed`                                              | Could not read the technical details.                                                                                                                                                                                                          |
| `zfsPool.loadFailed`                                                  | Could not read this pool.                                                                                                                                                                                                                      |
| `zfsPool.notFound`                                                    | There is no pool with this name on this NAS. It may have been deleted, or exported in the classic interface.                                                                                                                                   |
| `zfsPool.showAll`                                                     | Show all pools                                                                                                                                                                                                                                 |
| `zfsPool.changed`                                                     | This is a different pool from the one this page showed. Its details have been read again.                                                                                                                                                      |
| `zfsPool.changedDialog`                                               | This pool changed.                                                                                                                                                                                                                             |

---

## 3. Create a pool

**Question it answers:** which disks do I use, how much protection do I want, and how much space do I
get? **Leads to:** a new pool, by default with a first file system on it, ready for shared folders.

Route `/storage/zfs/create`, no menu item; reached from the ZFS toolbar and empty state, and from Flow
A's combine hint (10.4). Breadcrumbs: "ZFS" › "Create pool". It follows R1 to R10 with the job-runner
parts, as the RAID create flow does. `Zfs.addPool` is synchronous: it creates the pool, turns
compression on, registers the pool's own folder with OMV and marks 0.9's four modules pending (read
from source).

### 3.1 Pre-flight (R1)

On opening, the page reads `dirtyModules`. If anything is pending, the flow does not start (Q2):
`PreflightNotice` "Some changes are not applied yet", the band's list in words, "Apply them now" /
"Undo them" with the band's own confirmations. Then, in parallel: `Zfs.getEmptyCandidates` ("Looking
for disks that can go into a pool… This reads the disks, which wakes any that have gone to sleep."),
the disk-use inputs (shared, often warm), `getPoolStatus` and each pool's `getPoolDevices` (0.8), and
`listPools` (for the names in use).

### 3.2 Decisions, in one form

`JobRunner` with the title "Create a ZFS pool" (`h2`; the page title is "ZFS").

**C1. Disks** (`CheckboxListField` with groups, legend "Disks to use"): the groups of 0.8, in order
"Empty disks", "Erase and reuse"; "Disks that cannot be used ({{count}})" as a `Disclosure` under them.
Each option names the disk as Flow A's do: device (`Identifier`), model, size; the serial number under
it; for Erase and reuse, what is on it. None ticked by default. With more than nine offered, "Select
all" and "Select none". When the ticked disks differ in size: "These disks differ in size. Each counts
as the smallest, {{size}}; {{lost}} on the larger ones is not used." (not shown for Stripe, which uses
all of each disk).

- No disk offered: `EmptyState variant="empty"`: "A pool needs at least one disk that can be erased.
  Connect a disk, or free one that is in use." with "Look for new disks" and the "Disks that cannot be
  used" list open.

**C2. How to protect your files** (`RadioGroupField` with groups, legend "Layout", five options in two
headed groups, because five exclusive choices need grouping (the uiux-design skill, 3); each hint ends
with the usable space for the ticked disks, 0.5, "about"; until enough disks are ticked for a layout,
its hint has no size and it says how many it needs; section 18, P4):

Group **"Protected"**:

1. **"Mirror, recommended"** (default). "Every file is kept on every disk. It can lose all but one
   disk. You can use the space of one disk: about {{usable}}." At least 2.
2. "Parity (RAID-Z1)". "It can lose 1 disk. You can use all but one disk's space: about {{usable}}. If
   a second disk fails while it rebuilds, everything is lost." At least 3.
3. "Double parity (RAID-Z2)". "It can lose 2 disks. You can use all but two disks' space: about
   {{usable}}." At least 4.
4. "Triple parity (RAID-Z3)". "It can lose 3 disks. You can use all but three disks' space: about
   {{usable}}. For many large disks." At least 5.

Group **"Not protected"**, last:

5. "No protection (stripe)". Hint, in the body colour, with the warning-shape icon before it (neutral,
   not a status): with one disk ticked, "One disk, no protection. If it fails, everything on the pool
   is lost. ZFS still finds damaged files, but cannot repair them. About {{usable}}."; with several,
   "No protection. If one disk fails, everything on all of them is lost. It uses all the space: about
   {{usable}}." At least 1. **It is never preselected**: not by default, not when it is the only
   layout the ticked count allows (one disk), and not when the reader returns with "Change choices"
   (after choosing it, the form comes back with no layout chosen, focus on the layout group, and
   Continue asks "Choose how to protect your files."); it is chosen only by the reader's own press,
   as the owner decided for RAID's Stripe (journal, 2026-11-21, P3). The hint ends with "Protection
   cannot be added to it here later."

A layout that the ticked count does not allow is not disabled: it stays choosable, and Continue says
"Choose at least {{count}} disks for {{layout}}." Under the "Not protected" group, `text-sm
muted-foreground`: "For one disk, Add storage under File systems makes a simpler file system that
needs no plugin." with a router link "Add storage".

Under the layout group, once, `text-sm muted-foreground`: "ZFS checks every file it reads. With a
protected layout it also repairs a damaged file from a good copy."

**C3. Name** (`TextField`, label "Pool name", required, `autocomplete="off"`, `spellcheck="false"`):
hint "Letters, digits, hyphens and underscores, starting with a letter. The pool's folder on the NAS
is /{{name}}." 0.7's rules, checked on blur and on Continue; the folder line updates as the reader
types. No default: the reader names it.

**C4. A first file system** (`CheckboxField`, default ticked): "Make a first file system on it, for
your shared folders." Hint: "Keeping files in a file system rather than in the pool's own folder lets
you give each its own size limit and snapshots." When ticked, a `TextField` "File system name",
default "data", 0.7's file-system rules.

And, under a `Disclosure` "Settings this page chooses for you" (closed), as text, not fields (section
17, D11 to D14):

- "Compression is on (LZ4). It saves space and is usually faster."
- "Disks are named by their stable ID, so the pool finds them after a restart even if their names
  change."
- "ZFS writes in 4 KiB blocks, which suits current disks."
- "File names are case-sensitive, as everywhere else on the NAS."
- "These cannot be changed here later. The classic interface offers the other choices."

And Flow A's line on sharing: "Sharing a folder on it with your computers is the next step. This page
shows you how when the pool is ready." Buttons at the end: **"Continue"** (filled).

### 3.3 Summary and confirmation (R2)

`JobSummary` with `typedConfirmation`, title "Ready to create the pool". One item per action, in the
order they run:

- "Erase {{count}} disks. Everything on them is lost:" then one line per disk, each as Flow A's erase
  or use-whole line (device, model, serial number, size with the label size; for Erase and reuse, what
  is lost).
- "Create the pool {{pool}}: {{layout}}. About {{usable}} for files. {{protection}}" with 0.5's
  sentence, and "Its folder on the NAS is /{{pool}}."
- With C4: "Make the file system {{pool}}/{{fs}} on it, in the folder /{{pool}}/{{fs}}."
- "Then save the pool's settings, which applies the changes for it. Nothing else is pending." and,
  with C4, "Sharing a folder on it comes next, in the classic interface for now."

**With "No protection" chosen**, the warning is repeated as the last thing before the typed field,
apart from the list: an `InlineAlert` (neutral surface, the warning-shape icon, never a status colour,
since nothing has failed; the RAID slice's `icon="warning"`) titled "This pool has no protection", body
for several disks "If one disk fails, everything on all {{count}} disks is lost: every file on the
pool, not only the files on that disk. Keep a backup of anything you store on it.", for one disk "If
the disk fails, everything on the pool is lost. Keep a backup of anything you store on it." It is part
of the summary's description, so it is read before the typed field.

Then the typed confirmation: "Type {{devices}} to confirm.", every chosen device name separated by
single spaces, in the order listed (the RAID slice's rule and its `typedMatches`). The confirm button
**"Erase {{count}} disks and create pool"** (`destructive`) is unavailable until it matches, with the
hint "The button is available once the names match." Beside it, "Change choices". No form around the
summary; Enter in the typed field does nothing; focus moves to the summary's heading on arrival.

### 3.4 The steps (R3, R5)

`JobStepList`, each step with its state word:

| #            | Step label                                       | Calls                                                                                                                                                                                 | Notes                                                                                                                                                                            |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1            | "Check the disks again"                          | `getEmptyCandidates`, the disk-use inputs, `getPoolStatus`, each pool's `getPoolDevices`, `listPools`                                                                                 | Every disk must still be offered in the same group, with the same serial number and model; the name must still be free. Otherwise the flow stops before anything is erased (3.7) |
| 2 …          | "Erase {{device}}", one per Erase and reuse disk | `DiskMgmt.wipe {devicefile, secure: false}`, a task, output in a `Disclosure`                                                                                                         | Then `getEmptyCandidates` again: the disk must now be a candidate                                                                                                                |
| n            | "Create the pool"                                | `Zfs.addPool {name, pooltype, devices, devalias: "id", force: false, mountpoint: "", ashift: true, ashiftval: 12, casesensitivity: "sensitive", compress: true, compresstype: "lz4"}` | Synchronous **[verify]** how long, and how its reply looks (the source returns nothing)                                                                                          |
| n+1          | "Find the new pool"                              | `listPools`, `getPoolDevices`, the report                                                                                                                                             | A Pool row with the name, whose disks are exactly the chosen disks (by any of their names) and whose layout is the chosen one. Exactly one must match                            |
| With C4: n+2 | "Make the file system {{fs}}"                    | `Zfs.addObject {type: "filesystem", path: pool, name: fs, mountpoint: ""}`                                                                                                            | Synchronous; it marks the same four modules                                                                                                                                      |
| last but one | **"Save the pool's settings"**                   | R10: expected exactly `fstab`, `collectd`, `monit`, `quota` **[verify]**; then `Config.applyChangesBg`                                                                                | The checkpoint, labelled by what it does, not "Apply"                                                                                                                            |
| last         | "Check the result"                               | `listPools` (the pool's own folder, and with C4 the file system, mounted); `FileSystemMgmt.getList` (each has a row, status 1, mounted)                                               | Never claim a mounted file system that is not (UX audit B8)                                                                                                                      |

While a task step runs, it shows "Running for {{duration}}" and its output, following the tail. The
tasks are in the Tasks menu ("Erase disk {{device}}", "Apply changes"). No step can be cancelled.

### 3.5 Leaving the page

Leaving does not stop the flow (its run lives in memory for the session, as Flow A's does); coming back
shows the step list. A reload or a new sign-in ends the flow view (R8): the ZFS list's 1.6 recognises
a pool with no file system and the pending changes.

### 3.6 Result

`JobResult` succeeded, announced politely:

- Title: "The pool is ready."
- "Pool {{pool}} ({{layout}}, about {{size}} for files) is ready. {{protection}}" Router link "Open pool
  {{pool}}". For no protection: "…is ready. It has no protection: if a disk fails, everything on it is
  lost."
- With C4: "{{pool}}/{{fs}} is mounted and ready, with {{size}} free." router link "Open the file
  system", and Flow A's handover card "Next: share a folder on it" (the file-systems slice's 6.8),
  unchanged, naming the file system as the classic shared-folder form lists it **[verify]** the words
  that form shows for a ZFS file system.
- Without C4: router link "Add a file system" (4.2).

### 3.7 Failures (R6, R7, R10)

The flow stops at the failed step, never retries by itself (UI-14), says what succeeded, what failed
(the server's message as text, UI-9) and what did not run; focus moves to the failure's heading.

| Fails at                   | The system is left                                        | The reader sees                                                                                                                                                                                                                  | Offered                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, a blocker or a change   | unchanged                                                 | "{{device}} cannot be used now." + the blocker; "The disk now called {{device}} is not the one you chose. Nothing was erased. Choose again."; or "There is now a pool called {{pool}}. Nothing was erased. Choose another name." | "Change choices"                                                                                                                                                                 |
| 1, a read failed           | unchanged                                                 | "Could not check the disks again, so nothing was erased." + message                                                                                                                                                              | "Try this step again"; "Stop here"                                                                                                                                               |
| 2, an erase                | earlier disks erased; this one unchanged or partly erased | "{{device}} could not be erased." + the output open, and "{{erased}} were erased before this step failed. They stay erased."                                                                                                     | "Try this step again"; "Stop here"                                                                                                                                               |
| 2, still not a candidate   | erased                                                    | "{{device}} was erased, but the ZFS plugin still does not offer it for a pool."                                                                                                                                                  | "Check again"; "Stop here"                                                                                                                                                       |
| n, create                  | reuse disks erased; perhaps a pool's marks on some        | "The pool was not created." + message, and "The disks may now carry parts of an unfinished pool. Creating again overwrites them."                                                                                                | "Try this step again"; "Stop here" (the disks then show under Erase and reuse)                                                                                                   |
| n+1, not found             | a pool may exist                                          | "The pool was created but has not appeared yet."                                                                                                                                                                                 | "Look again"; "Stop here", with "It is listed under ZFS when it appears."                                                                                                        |
| n+2, file system           | the pool exists, its own folder registered                | Flow A's sentence for a failed create, and "The pool stays. You can add a file system on its page." + message                                                                                                                    | "Try this step again"; "Stop here", which goes on to the checkpoint for the pool alone                                                                                           |
| Checkpoint, R10 finds more | pending: this flow's and something else                   | `AlsoPendingPrompt` "Also pending from elsewhere: {{list}}. Saving applies them too."                                                                                                                                            | "Apply them too"; "Stop here" (the changes stay in the band)                                                                                                                     |
| Checkpoint, apply          | some modules deployed, some not; all still pending (B3)   | "Saving the pool's settings failed." + message                                                                                                                                                                                   | **"Try again"** first (R7); then "Stop here", the changes stay in the band. No "Undo": it would not remove the pool, which already exists on the disks (as the RAID slice's D12) |
| Last, not mounted          | applied                                                   | "{{name}} was created but is not mounted." + "The pool exists. Its page shows what ZFS reports."                                                                                                                                 | "Check again"; "Open pool {{pool}}"                                                                                                                                              |

**Backing out.** The flow offers no automatic undo: the pool exists on the disks from step n on. A
reader who wants it gone deletes its file system and then the pool on its page (section 9), where the
typed confirmations apply; the result's "Stop here" text says so.

### 3.8 Keyboard and screen readers

The decisions are one form in reading order: the disk checkbox list (each option reads device, model,
size, serial and what is on it), Select all and Select none when shown, "Disks that cannot be used",
Look for new disks (when shown), the layout radio group (one tab stop, arrows inside; each hint read
with its option), the Add storage link, the pool name (its folder line is its description, updated
politely after typing stops), the first file system checkbox and its name, the chosen-settings
disclosure, then Continue. The summary, the typed field (its label is the "Type … to confirm."
sentence), the confirm button and Change choices follow. During the run, step changes are announced
politely, a failure assertively with focus on its heading, the result politely.

### 3.9 Copy

Flow A's keys (`addStorage.*`) are reused for the erase lines, the handover and the task names; the
keys below are new.

| Key                                  | English                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zfsCreate.breadcrumb`               | Create pool                                                                                                                                                                                 |
| `zfsCreate.title`                    | Create a ZFS pool                                                                                                                                                                           |
| `zfsCreate.documentTitle`            | Create pool – ZFS                                                                                                                                                                           |
| `zfsCreate.preflightBody`            | Apply or undo them before you create a pool, so that only these changes are applied at the end.                                                                                             |
| `zfsCreate.looking`                  | Looking for disks that can go into a pool… This reads the disks, which wakes any that have gone to sleep.                                                                                   |
| `zfsCreate.checkFailed`              | Could not check which disks can be used.                                                                                                                                                    |
| `zfsCreate.disks`                    | Disks to use                                                                                                                                                                                |
| `zfsCreate.minFor`                   | Choose at least {{count}} disks for {{layout}}.                                                                                                                                             |
| `zfsCreate.minOne`                   | Choose at least one disk.                                                                                                                                                                   |
| `zfsCreate.mixedSizes`               | These disks differ in size. Each counts as the smallest, {{size}}; {{lost}} on the larger ones is not used.                                                                                 |
| `zfsCreate.notEnough`                | A pool needs at least one disk that can be erased. Connect a disk, or free one that is in use.                                                                                              |
| `zfsCreate.cannot.pool`              | It is part of ZFS pool <pool></pool>.                                                                                                                                                       |
| `zfsCreate.cannot.usb`               | It is connected by USB. The ZFS plugin does not use USB disks, because a USB connection can drop and damage the pool.                                                                       |
| `zfsCreate.cannot.small`             | It is smaller than the disk it would replace ({{size}}). A replacement must be at least as large.                                                                                           |
| `zfsCreate.holds.unknown`            | No file system was found, but the disk is not empty: it may hold old partitions, or be part of a RAID array or a ZFS pool from another computer.                                            |
| `zfsCreate.layout`                   | Layout                                                                                                                                                                                      |
| `zfsCreate.group.protected`          | Protected                                                                                                                                                                                   |
| `zfsCreate.group.unprotected`        | Not protected                                                                                                                                                                               |
| `zfsCreate.mirror`                   | Mirror, recommended                                                                                                                                                                         |
| `zfsCreate.mirrorHint`               | Every file is kept on every disk. It can lose all but one disk. You can use the space of one disk: about {{usable}}.                                                                        |
| `zfsCreate.raidz1Hint`               | It can lose 1 disk. You can use all but one disk's space: about {{usable}}. If a second disk fails while it rebuilds, everything is lost.                                                   |
| `zfsCreate.raidz2Hint`               | It can lose 2 disks. You can use all but two disks' space: about {{usable}}.                                                                                                                |
| `zfsCreate.raidz3Hint`               | It can lose 3 disks. You can use all but three disks' space: about {{usable}}. For many large disks.                                                                                        |
| `zfsCreate.needs`                    | Needs at least {{count}} disks.                                                                                                                                                             |
| `zfsCreate.stripe`                   | No protection (stripe)                                                                                                                                                                      |
| `zfsCreate.stripeHintOne`            | One disk, no protection. If it fails, everything on the pool is lost. ZFS still finds damaged files, but cannot repair them. About {{usable}}. Protection cannot be added to it here later. |
| `zfsCreate.stripeHintMany`           | No protection. If one disk fails, everything on all of them is lost. It uses all the space: about {{usable}}. Protection cannot be added to it here later.                                  |
| `zfsCreate.stripeHintNoSize`         | No protection. If a disk fails, everything on the pool is lost. Protection cannot be added to it here later.                                                                                |
| `zfsCreate.oneDiskAlt`               | For one disk, Add storage under File systems makes a simpler file system that needs no plugin.                                                                                              |
| `zfsCreate.oneDiskAltLink`           | Add storage                                                                                                                                                                                 |
| `zfsCreate.checksums`                | ZFS checks every file it reads. With a protected layout it also repairs a damaged file from a good copy.                                                                                    |
| `zfsCreate.chooseLayout`             | Choose how to protect your files.                                                                                                                                                           |
| `zfsCreate.name`                     | Pool name                                                                                                                                                                                   |
| `zfsCreate.nameHint`                 | Letters, digits, hyphens and underscores, starting with a letter. The pool's folder on the NAS is /{{name}}.                                                                                |
| `zfsName.pool.pattern`               | Use 1 to 32 letters, digits, hyphens or underscores, starting with a letter.                                                                                                                |
| `zfsName.pool.reserved`              | {{name}} is a word ZFS keeps for itself. Choose another name.                                                                                                                               |
| `zfsName.pool.systemFolder`          | {{name}} is a folder the system uses. The pool's folder would be /{{name}}, so choose another name.                                                                                         |
| `zfsName.pool.taken`                 | There is already a pool called {{name}}.                                                                                                                                                    |
| `zfsName.fs.pattern`                 | Use 1 to 64 letters, digits, hyphens, underscores or full stops, starting with a letter or digit.                                                                                           |
| `zfsName.fs.taken`                   | There is already a file system or volume called {{name}} on {{pool}}.                                                                                                                       |
| `zfsCreate.firstFs`                  | Make a first file system on it, for your shared folders.                                                                                                                                    |
| `zfsCreate.firstFsHint`              | Keeping files in a file system rather than in the pool's own folder lets you give each its own size limit and snapshots.                                                                    |
| `zfsCreate.firstFsName`              | File system name                                                                                                                                                                            |
| `zfsCreate.chosen`                   | Settings this page chooses for you                                                                                                                                                          |
| `zfsCreate.chosen.compression`       | Compression is on (LZ4). It saves space and is usually faster.                                                                                                                              |
| `zfsCreate.chosen.ids`               | Disks are named by their stable ID, so the pool finds them after a restart even if their names change.                                                                                      |
| `zfsCreate.chosen.blocks`            | ZFS writes in 4 KiB blocks, which suits current disks.                                                                                                                                      |
| `zfsCreate.chosen.case`              | File names are case-sensitive, as everywhere else on the NAS.                                                                                                                               |
| `zfsCreate.chosen.later`             | These cannot be changed here later. The classic interface offers the other choices.                                                                                                         |
| `zfsCreate.sharingNext`              | Sharing a folder on it with your computers is the next step. This page shows you how when the pool is ready.                                                                                |
| `zfsCreate.continue`                 | Continue                                                                                                                                                                                    |
| `zfsCreate.summaryTitle`             | Ready to create the pool                                                                                                                                                                    |
| `zfsCreate.sum.erase_one` / `_other` | Erase {{count}} disk. Everything on it is lost: / Erase {{count}} disks. Everything on them is lost:                                                                                        |
| `zfsCreate.sum.create`               | Create the pool <pool></pool>: {{layout}}. About {{usable}} for files. {{protection}}                                                                                                       |
| `zfsCreate.sum.folder`               | Its folder on the NAS is /{{pool}}.                                                                                                                                                         |
| `zfsCreate.sum.fs`                   | Make the file system <fs></fs> on it, in the folder /{{pool}}/{{name}}.                                                                                                                     |
| `zfsCreate.sum.save`                 | Then save the pool's settings, which applies the changes for it. Nothing else is pending.                                                                                                   |
| `zfsCreate.sum.sharing`              | Sharing a folder on it comes next, in the classic interface for now.                                                                                                                        |
| `zfsCreate.sum.noProtectTitle`       | This pool has no protection                                                                                                                                                                 |
| `zfsCreate.sum.noProtectMany`        | If one disk fails, everything on all {{count}} disks is lost: every file on the pool, not only the files on that disk. Keep a backup of anything you store on it.                           |
| `zfsCreate.sum.noProtectOne`         | If the disk fails, everything on the pool is lost. Keep a backup of anything you store on it.                                                                                               |
| `zfsCreate.typePrompt`               | Type {{devices}} to confirm.                                                                                                                                                                |
| `zfsCreate.typeHint`                 | The button is available once the names match.                                                                                                                                               |
| `zfsCreate.confirm_one` / `_other`   | Erase {{count}} disk and create pool / Erase {{count}} disks and create pool                                                                                                                |
| `zfsCreate.changeChoices`            | Change choices                                                                                                                                                                              |
| `zfsCreate.step.check`               | Check the disks again                                                                                                                                                                       |
| `zfsCreate.step.create`              | Create the pool                                                                                                                                                                             |
| `zfsCreate.step.find`                | Find the new pool                                                                                                                                                                           |
| `zfsCreate.step.fs`                  | Make the file system {{name}}                                                                                                                                                               |
| `zfsCreate.step.save`                | Save the pool's settings                                                                                                                                                                    |
| `zfsCreate.step.verify`              | Check the result                                                                                                                                                                            |
| `zfsCreate.fail.checkRead`           | Could not check the disks again, so nothing was erased.                                                                                                                                     |
| `zfsCreate.fail.nameTaken`           | There is now a pool called {{pool}}. Nothing was erased. Choose another name.                                                                                                               |
| `zfsCreate.fail.notCandidate`        | {{device}} was erased, but the ZFS plugin still does not offer it for a pool.                                                                                                               |
| `zfsCreate.fail.create`              | The pool was not created.                                                                                                                                                                   |
| `zfsCreate.fail.createParts`         | The disks may now carry parts of an unfinished pool. Creating again overwrites them.                                                                                                        |
| `zfsCreate.fail.notFound`            | The pool was created but has not appeared yet.                                                                                                                                              |
| `zfsCreate.fail.listedLater`         | It is listed under ZFS when it appears.                                                                                                                                                     |
| `zfsCreate.fail.poolStays`           | The pool stays. You can add a file system on its page.                                                                                                                                      |
| `zfsCreate.fail.save`                | Saving the pool's settings failed.                                                                                                                                                          |
| `zfsCreate.fail.notMounted`          | {{name}} was created but is not mounted.                                                                                                                                                    |
| `zfsCreate.fail.notMountedBody`      | The pool exists. Its page shows what ZFS reports.                                                                                                                                           |
| `zfsCreate.alsoBody`                 | Also pending from elsewhere: {{list}}. Saving applies them too.                                                                                                                             |
| `zfsCreate.doneTitle`                | The pool is ready.                                                                                                                                                                          |
| `zfsCreate.doneBody`                 | Pool <pool></pool> ({{layout}}, about {{size}} for files) is ready. {{protection}}                                                                                                          |
| `zfsCreate.doneBodyNone`             | Pool <pool></pool> ({{layout}}, about {{size}} for files) is ready. It has no protection: if a disk fails, everything on it is lost.                                                        |
| `zfsCreate.doneFs`                   | <fs></fs> is mounted and ready, with {{size}} free.                                                                                                                                         |
| `zfsCreate.openPool`                 | Open pool {{pool}}                                                                                                                                                                          |
| `zfsCreate.openFs`                   | Open the file system                                                                                                                                                                        |
| `zfsCreate.addFs`                    | Add a file system                                                                                                                                                                           |

---

## 4. ZFS file systems

A ZFS file system is where shared folders live (0.1). This slice creates them at the top of a pool
only, gives each a page, and lets the reader set two things: a size limit and compression (section
17, D15). Nested file systems made in the classic interface are shown and opened like any other.

### 4.1 Where they appear

- On the pool's page, its File systems table (2.6).
- On the File systems page, as file systems of type ZFS, linking to their page here (10.3).
- On the dashboard's Storage card, grouped by pool (10.1).

### 4.2 Add a file system

**Question it answers:** what is it called, and how large may it grow? **Leads to:** a mounted file
system, ready for shared folders.

Route `/storage/zfs/pools/$pool/add`, reached from the pool's page and the list's unfinished-work line.
Breadcrumbs: "ZFS" › `{{pool}}` › "Add a file system". A short flow with the job-runner parts: nothing
is erased, so there is a summary but no typed confirmation.

- **Pre-flight (R1)**: `dirtyModules`; if anything is pending, the flow does not start (Q2), with the
  `PreflightNotice`. Then the pool's reads (2.1).
- **Refused** (0.10): the pool is Unknown, unusable or full; the form is replaced by the reason and a
  router link back to the pool.
- **Decisions**:
  - **Name** (`TextField`, "File system name", required): hint "Letters, digits, hyphens, underscores
    and full stops. Its folder on the NAS is /{{pool}}/{{name}}." 0.7's rules.
  - **Size limit** (`RadioGroupField`, legend "How large may it grow?"): "No limit: it can use all the
    free space of the pool" (default); "Up to:" with a `SizeField` (13.1) in GiB or TiB. Hint: "A
    limit keeps one file system from filling the pool for the others."
  - A sentence, not a field: "Compression is {{compression}}, as for the pool." (the pool's own
    folder's value; the file system inherits it).
  - Flow A's line on sharing. Button **"Continue"**.
- **Summary** (`JobSummary` without a typed field), title "Ready to add the file system": "Make the
  file system {{pool}}/{{name}}, in the folder /{{pool}}/{{name}}." "Limit it to {{limit}}." (when
  chosen) "Then save its settings, which applies the changes for it. Nothing else is pending." Button
  **"Add file system"** (filled primary, not destructive); "Change choices".
- **Steps**:

| #                | Step label                            | Calls                                                                                                               | Notes                                            |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1                | "Check the pool again"                | `listPools`, the report                                                                                             | The pool is still usable; the name is still free |
| 2                | "Make the file system"                | `Zfs.addObject {type: "filesystem", path: pool, name, mountpoint: ""}`                                              | Synchronous                                      |
| 3 (with a limit) | "Set its size limit"                  | `Zfs.setProperties {type: "Filesystem", name: pool/name, properties: [{property: "quota", value, modified: true}]}` | Synchronous; marks `collectd`, `monit`, `quota`  |
| 4                | **"Save the file system's settings"** | R10: expected `fstab`, `collectd`, `monit`, `quota` **[verify]**; `Config.applyChangesBg`                           | The checkpoint                                   |
| 5                | "Check the result"                    | `listPools` (mounted), `FileSystemMgmt.getList` (a row, status 1, mounted)                                          |                                                  |

- **Result**: "{{pool}}/{{name}} is mounted and ready, with {{free}} free." router link "Open the
  file system", and Flow A's handover card (the file-systems slice's 6.8).
- **Failures**: as Flow A's for its steps; step 3 failing leaves the file system without a limit:
  "The file system was made, but its size limit was not set." + message, "Try this step again", or
  "Go on without a limit" (which runs the checkpoint).

### 4.3 A file system's page

**Question it answers:** how much does it hold, is it reachable, what uses it, and which snapshots
keep its older files? **Leads to:** its settings, its snapshots, sharing a folder on it, or deleting
it.

Route `/storage/zfs/fs/$` (0.7). Breadcrumbs: "ZFS" › `{{pool}}` (router link) › the name (current
page). The ZFS item is current.

**Data on opening**: `listPools` (shared), the pool's report (for the pool's state, which gates the
actions), `getAllSnapshots` (whole list, filtered to this file system's `parent`, 5.1),
`FileSystemMgmt.getList`, `ShareMgmt.getList` and `FsTab.getByFsName` with the full name (0.12),
`dirtyModules`.

**Layout:**

1. **Page title**: the full name in `Identifier` (the pool's own folder: "{{pool}} (the pool's own
   folder)"). Beside it, the pending mark when 0.9 says so. Under it, `text-sm muted-foreground`: "ZFS
   file system on pool {{pool}}".
2. **State line**: the pill and reason of 2.6's State column; the pool's own pill and reason too when
   the pool is not OK ("Pool {{pool}}: Critical. A disk is missing or has failed." with a router link
   to the pool).
3. **Summary card** (`FactList`): Space (0.2's file system space, a `CapacityMeter` against the limit
   when there is one, otherwise "{{used}} used · {{available}} free, shared with the other file
   systems on {{pool}}"); Size limit ("No limit" or the limit); Compression (0.2); Folder on the NAS
   (`mountpoint`, `Identifier`, `CopyButton`); Encryption (only when encrypted: "Encrypted, locked" or
   "Encrypted, unlocked", with "Locking and unlocking are in the classic interface."); Made from (only
   for a clone: "A copy of {{origin}}, made in the classic interface.").
4. **Used by** (`UsedByPanel`, `h2` "Used by", 0.12). With nothing: "Nothing uses this file system yet."
   and Flow A's handover card "Share a folder on it" (the file-systems slice's 6.8).
5. **Snapshots** (section 5), `h2` "Snapshots".
6. **Settings** (4.4), `h2` "Settings".
7. **Technical details** (`h2`): on "Show technical details", `getObjectDetails {type: "Filesystem"}`
   (every ZFS property of it, as text on the terminal pair), with "This reads the file system's
   settings from the pool, which may wake its disks." beside the button; "Copy" and "Hide".
8. After a divider: **"Delete this file system"** (9.1), absent for the pool's own folder, which says
   instead "This is the pool's own folder. It goes when the pool is deleted." with a router link to
   the pool.

**A volume has no page**: its address shows "Volumes are managed in the classic interface." with the
footer's link. **States** follow 2.9's pattern ("Could not read this file system.", "There is no file
system with this name on this NAS. It may have been deleted or renamed in the classic interface.",
"Show pool {{pool}}").

### 4.4 Settings: size limit and compression

A settings form (Phase 3's rules: read, edit, Save, the saved line, the pending mark; R4 re-reads the
file system before writing):

- **Size limit** (`RadioGroupField`, as in 4.2): "No limit" / "Up to:" with `SizeField`. A limit below
  what it holds is refused on Save: "It already holds {{used}}. Choose a limit above that, or delete
  files first." Hint: "Changing the limit does not move or delete any file."
- **Compression** (`RadioGroupField`, legend "Compression"): "On (LZ4), recommended" and "Off". When
  the current value is another kind (`zstd`, `gzip`…, set in the classic interface), a third option
  "Keep {{value}}" is shown and chosen. Hint: "Only files saved from now on are affected; files already
  there stay as they are."
- **Save** sends `Zfs.setProperties {type: "Filesystem", name, properties: [...]}` with only the
  changed properties (`quota` as `none` for "No limit" or the size with a `G` or `T` suffix;
  `compression` as `lz4` or `off`), each with `modified: true` (read from source: unmodified ones are
  skipped). Then the shared saved line `common.savedPending`, and the band offers Apply (0.9).
- **Refused**: while the pool is Unknown or unusable, the form is read-only with 0.3's reason.

### 4.5 Copy

| Key                             | English                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `zfsFsAdd.breadcrumb`           | Add a file system                                                                                                 |
| `zfsFsAdd.title`                | Add a file system to pool {{pool}}                                                                                |
| `zfsFsAdd.documentTitle`        | Add a file system – Pool {{pool}} – ZFS                                                                           |
| `zfsFsAdd.preflightBody`        | Apply or undo them before you add a file system, so that only these changes are applied at the end.               |
| `zfsFsAdd.refused`              | A file system cannot be added to this pool now.                                                                   |
| `zfsFsAdd.name`                 | File system name                                                                                                  |
| `zfsFsAdd.nameHint`             | Letters, digits, hyphens, underscores and full stops. Its folder on the NAS is /{{pool}}/{{name}}.                |
| `zfsFsAdd.limit`                | How large may it grow?                                                                                            |
| `zfsFsAdd.limitNone`            | No limit: it can use all the free space of the pool                                                               |
| `zfsFsAdd.limitUpTo`            | Up to:                                                                                                            |
| `zfsFsAdd.limitHint`            | A limit keeps one file system from filling the pool for the others.                                               |
| `zfsFsAdd.compression`          | Compression is {{compression}}, as for the pool.                                                                  |
| `zfsFsAdd.summaryTitle`         | Ready to add the file system                                                                                      |
| `zfsFsAdd.sum.make`             | Make the file system <fs></fs>, in the folder /{{pool}}/{{name}}.                                                 |
| `zfsFsAdd.sum.limit`            | Limit it to {{limit}}.                                                                                            |
| `zfsFsAdd.sum.save`             | Then save its settings, which applies the changes for it. Nothing else is pending.                                |
| `zfsFsAdd.confirm`              | Add file system                                                                                                   |
| `zfsFsAdd.step.check`           | Check the pool again                                                                                              |
| `zfsFsAdd.step.make`            | Make the file system                                                                                              |
| `zfsFsAdd.step.limit`           | Set its size limit                                                                                                |
| `zfsFsAdd.step.save`            | Save the file system's settings                                                                                   |
| `zfsFsAdd.step.verify`          | Check the result                                                                                                  |
| `zfsFsAdd.fail.limit`           | The file system was made, but its size limit was not set.                                                         |
| `zfsFsAdd.fail.goOn`            | Go on without a limit                                                                                             |
| `zfsFsAdd.done`                 | <fs></fs> is mounted and ready, with {{free}} free.                                                               |
| `zfsFs.subtitle`                | ZFS file system on pool {{pool}}                                                                                  |
| `zfsFs.documentTitle`           | {{fs}} – ZFS                                                                                                      |
| `zfsFs.poolState`               | Pool <pool></pool>: {{status}}. {{reason}}                                                                        |
| `zfsFs.fact.space`              | Space                                                                                                             |
| `zfsFs.spaceShared`             | {{used}} used · {{available}} free, shared with the other file systems on {{pool}}                                |
| `zfsFs.fact.limit`              | Size limit                                                                                                        |
| `zfsFs.noLimit`                 | No limit                                                                                                          |
| `zfsFs.fact.compression`        | Compression                                                                                                       |
| `zfsFs.compression.off`         | Off                                                                                                               |
| `zfsFs.compression.lz4`         | On (LZ4)                                                                                                          |
| `zfsFs.compression.on`          | On                                                                                                                |
| `zfsFs.compression.other`       | On (<value></value>)                                                                                              |
| `zfsFs.compression.saves`       | saves about {{percent}}                                                                                           |
| `zfsFs.fact.folder`             | Folder on the NAS                                                                                                 |
| `zfsFs.fact.encryption`         | Encryption                                                                                                        |
| `zfsFs.encryptedLocked`         | Encrypted, locked                                                                                                 |
| `zfsFs.encryptedUnlocked`       | Encrypted, unlocked                                                                                               |
| `zfsFs.fact.origin`             | Made from                                                                                                         |
| `zfsFs.origin`                  | A copy of <origin></origin>, made in the classic interface.                                                       |
| `zfsFs.usedBy.title`            | Used by                                                                                                           |
| `zfsFs.usedBy.nothing`          | Nothing uses this file system yet.                                                                                |
| `zfsFs.usedBy.inside`           | Inside it: <fs></fs>                                                                                              |
| `zfsFs.usedBy.clone`            | <fs></fs> was made from its snapshot <snapshot></snapshot>.                                                       |
| `zfsFs.details.readsPool`       | This reads the file system's settings from the pool, which may wake its disks.                                    |
| `zfsFs.poolFolderNote`          | This is the pool's own folder. It goes when the pool is deleted.                                                  |
| `zfsFs.volumeNoPage`            | Volumes are managed in the classic interface.                                                                     |
| `zfsFs.loadFailed`              | Could not read this file system.                                                                                  |
| `zfsFs.notFound`                | There is no file system with this name on this NAS. It may have been deleted or renamed in the classic interface. |
| `zfsFs.showPool`                | Show pool {{pool}}                                                                                                |
| `zfsFsSettings.title`           | Settings                                                                                                          |
| `zfsFsSettings.limitTooSmall`   | It already holds {{used}}. Choose a limit above that, or delete files first.                                      |
| `zfsFsSettings.limitHint`       | Changing the limit does not move or delete any file.                                                              |
| `zfsFsSettings.compression`     | Compression                                                                                                       |
| `zfsFsSettings.compressionOn`   | On (LZ4), recommended                                                                                             |
| `zfsFsSettings.compressionOff`  | Off                                                                                                               |
| `zfsFsSettings.compressionKeep` | Keep {{value}}                                                                                                    |
| `zfsFsSettings.compressionHint` | Only files saved from now on are affected; files already there stay as they are.                                  |
| `zfsFsSettings.save`            | Save                                                                                                              |
| `zfsFsSettings.readOnly`        | These settings cannot be changed while the pool cannot be used.                                                   |

---

## 5. Snapshots

**Question it answers:** which older versions of this file system's files are kept, and how much
space do they hold? **Leads to:** taking a snapshot before a risky change, rolling back after a
mistake, or freeing space.

On a file system's page (4.3), section "Snapshots". Snapshots of volumes are in the classic
interface.

### 5.1 The list

`getAllSnapshots` returns every snapshot on every pool with `parent` (the file system), `name` (the part
after `@`), `path`, `used` and `refer` (bytes) and `encryption`; **not** when each was taken (read from
source). The interface keeps the rows whose `parent` is this file system, in the server's order, which
is expected to be oldest first within a file system **[verify]**; the last row is "the newest".

Intro, `text-sm muted-foreground`: 0.1's snapshot sentence, and "To get back a single file, there is no
need to roll back: the files of each snapshot can be opened in the hidden folder .zfs/snapshot inside
this file system's folder." **[verify]** that the folder is reachable through a shared folder over SMB
before keeping the second sentence.

A table, not paged up to 50 rows, then client-side pages of 50 (an automatic schedule can make
hundreds):

| Order | Header    | Display                                                                                                                                                                                               |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Snapshot  | `name` in `Identifier`; "Newest" in `text-xs muted-foreground` beside the last one. Snapshots taken by this page are named by the NAS with the date and time (5.3), so the name is the time for those |
| 2     | Holds     | `used`: "Space freed if you delete it", right-aligned, tabular. Under the header: "Space that only this snapshot keeps."                                                                              |
| 3     | (actions) | "Roll back…" on the newest only, with the accessible name "Roll {{fs}} back to snapshot {{snapshot}}"; "Delete…" on each, "Delete snapshot {{snapshot}} of {{fs}}"                                    |

Above the table: "{{count}} snapshots, holding {{total}}." and **"Take a snapshot now"** (neutral).
Under it, `text-sm muted-foreground`: "Automatic snapshots on a schedule are set up in the classic
interface." with `ExternalLink` "Snapshot schedules in the classic interface" →
`/#/storage/zfs/snapshotjobs`.

**States**: loading (`TableSkeletonRows` (3), "Loading the snapshots…"); error (`InlineAlert
tone="critical"` "Could not read the snapshots." + message + "Try again"; Take a snapshot now stays);
empty ("No snapshots of this file system yet. Take one before a big change, so you can go back."); the
populated table.

### 5.2 What the actions cost

| Action                           | Lost                                                                                                       | Confirmation                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Take a snapshot                  | nothing                                                                                                    | none: the button acts, then says so (5.3)                        |
| Roll back to the newest snapshot | every change to the file system since that snapshot: new files, changed files, deletions undone and redone | destructive, typed: the file system's name (section 18, P7)      |
| Delete a snapshot                | the older versions only that snapshot keeps; the files in the file system now are not touched              | destructive, typed: the snapshot's name (UI-8: data-destructive) |

### 5.3 Take a snapshot now

`Zfs.quickSnapshot {name: fs, recursive}`: the NAS names it with its own date and time
(`YYYY-MM-DD_HH-MM-SS`, read from source), and it marks nothing pending (section 17, D17). A custom
name is in the classic interface.

- When the file system has file systems inside it, a `CheckboxField` beside the button: "Include the
  file systems inside it" (default off; `recursive`).
- Refused (0.10) with the reason beside the button: locked; the pool not usable or Unknown.
- While it runs: the button shows "Taking a snapshot…". Then the list is read again, and a polite
  announcement and the line under the button: "Snapshot {{snapshot}} taken." Failed: `InlineAlert
tone="critical"` "The snapshot was not taken." + message (for example two in the same second, which
  the server refuses).

### 5.4 Roll back

Offered on the newest snapshot only. ZFS itself refuses to roll back past a newer snapshot (read from
source: the plugin does not ask it to delete them), so older snapshots have no Roll back button, and
the row of the newest says, once under the table: "To go back further, delete the newer snapshots
first. Each one you delete is gone." (section 18, P7).

**The check before the dialog**: pressing "Roll back…" re-reads `listPools`, `getAllSnapshots` and the
pool's report; the dialog opens with "Checking…", then shows a refusal (locked; pool not usable; not the
newest any more), "This snapshot no longer exists.", or the confirmation.

`ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm:

1. Title: "Roll {{fs}} back to {{snapshot}}?"
2. The consequence, one sentence: "Every change to {{fs}} since this snapshot is lost: files saved
   since are deleted, and files changed or deleted since go back to how they were. This cannot be
   undone."
3. When shared folders use it (0.12): "People using {{list}} see their files change at once. Ask them
   to close their files first."
4. "The snapshot itself is kept."
5. Type to confirm: "Type {{fs}} to confirm." (the file system's full name).
6. Buttons: "Cancel" (focused) and **"Roll back"** (`destructive`), unavailable until the name matches.

**On confirm**: the button shows "Checking again…", the three reads run once more; a change switches
the dialog to the refusal. Otherwise `Zfs.rollbackSnapshot {name: path}`; the dialog shows "Rolling
{{fs}} back…" (Cancel unavailable). Result: the dialog closes, the list is read again, and a polite
announcement and an `InlineAlert` (OK) above the snapshots: "{{fs}} was rolled back to {{snapshot}}."
Failed: the dialog stays with "{{fs}} was not rolled back." + message (for example when another file
system was cloned from a newer state). The request was cut: "Could not tell whether {{fs}} was rolled
back." and Refresh.

### 5.5 Delete a snapshot

**Refused** (0.10): another file system was made from it ("{{clone}} was made from this snapshot.
Delete or promote it in the classic interface first." with no link, as the RAID slice's P10: the link
would lead to a change this page does not show).

**Pre-flight**: deleting marks 0.9's four modules pending (read from source), so the dialog first
reads `dirtyModules`; if anything else is pending, the dialog shows `PreflightNotice` (the band's list
in words, "Apply them now" / "Undo them") instead of the confirmation (section 18, P15).

`ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm:

1. Title: "Delete snapshot {{snapshot}}?"
2. "Of {{fs}}, holding {{used}}."
3. The consequence: "The older versions of files that only this snapshot keeps are lost. The files in
   {{fs}} now are not touched. This cannot be undone."
4. Type to confirm: "Type {{snapshot}} to confirm."
5. Buttons: "Cancel" (focused) and **"Delete snapshot"** (`destructive`).

**On confirm**: re-read (`getAllSnapshots`, `listPools`, `dirtyModules`), then a step list inside the
dialog (`JobStepList`, compact):

| #   | Step                  | Calls                                                                                                          |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | "Delete the snapshot" | `Zfs.deleteObjectBg {type: "Snapshot", name: path, recursive: false}`, a task ("Delete snapshot {{snapshot}}") |
| 2   | "Save the change"     | R10: expected `fstab`, `collectd`, `monit`, `quota` **[verify]**; `Config.applyChangesBg`                      |

Result: the dialog closes; the list is read again; announced "Snapshot {{snapshot}} was deleted." A
failure at step 1 stays in the dialog with the server's words; at step 2, R7's "Try again" first,
then "Stop here" (the changes stay in the band, and the snapshot is gone either way, which it says).

### 5.6 Copy

| Key                              | English                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zfsSnap.title`                  | Snapshots                                                                                                                                                                 |
| `zfsSnap.singleFile`             | To get back a single file, there is no need to roll back: the files of each snapshot can be opened in the hidden folder .zfs/snapshot inside this file system's folder.   |
| `zfsSnap.summary_one` / `_other` | {{count}} snapshot, holding {{total}}. / {{count}} snapshots, holding {{total}}.                                                                                          |
| `zfsSnap.take`                   | Take a snapshot now                                                                                                                                                       |
| `zfsSnap.taking`                 | Taking a snapshot…                                                                                                                                                        |
| `zfsSnap.recursive`              | Include the file systems inside it                                                                                                                                        |
| `zfsSnap.taken`                  | Snapshot <snapshot></snapshot> taken.                                                                                                                                     |
| `zfsSnap.takeFailed`             | The snapshot was not taken.                                                                                                                                               |
| `zfsSnap.schedules`              | Automatic snapshots on a schedule are set up in the classic interface.                                                                                                    |
| `zfsSnap.schedulesLink`          | Snapshot schedules in the classic interface                                                                                                                               |
| `zfsSnap.tableLabel`             | Snapshots of {{fs}}                                                                                                                                                       |
| `zfsSnap.col.snapshot`           | Snapshot                                                                                                                                                                  |
| `zfsSnap.col.holds`              | Holds                                                                                                                                                                     |
| `zfsSnap.col.holdsHint`          | Space that only this snapshot keeps.                                                                                                                                      |
| `zfsSnap.newest`                 | Newest                                                                                                                                                                    |
| `zfsSnap.goFurther`              | To go back further, delete the newer snapshots first. Each one you delete is gone.                                                                                        |
| `zfsSnap.loading`                | Loading the snapshots…                                                                                                                                                    |
| `zfsSnap.loadFailed`             | Could not read the snapshots.                                                                                                                                             |
| `zfsSnap.empty`                  | No snapshots of this file system yet. Take one before a big change, so you can go back.                                                                                   |
| `zfsSnap.rollBack`               | Roll back…                                                                                                                                                                |
| `zfsSnap.rollBackLabel`          | Roll {{fs}} back to snapshot {{snapshot}}                                                                                                                                 |
| `zfsSnap.checking`               | Checking…                                                                                                                                                                 |
| `zfsSnap.gone`                   | This snapshot no longer exists.                                                                                                                                           |
| `zfsSnap.notNewest`              | A newer snapshot has been taken since this page read the list.                                                                                                            |
| `zfsSnap.rb.title`               | Roll {{fs}} back to {{snapshot}}?                                                                                                                                         |
| `zfsSnap.rb.consequence`         | Every change to <fs></fs> since this snapshot is lost: files saved since are deleted, and files changed or deleted since go back to how they were. This cannot be undone. |
| `zfsSnap.rb.shared`              | People using {{list}} see their files change at once. Ask them to close their files first.                                                                                |
| `zfsSnap.rb.kept`                | The snapshot itself is kept.                                                                                                                                              |
| `zfsSnap.rb.typePrompt`          | Type {{fs}} to confirm.                                                                                                                                                   |
| `zfsSnap.rb.confirm`             | Roll back                                                                                                                                                                 |
| `zfsSnap.rb.checkingAgain`       | Checking again…                                                                                                                                                           |
| `zfsSnap.rb.running`             | Rolling {{fs}} back…                                                                                                                                                      |
| `zfsSnap.rb.done`                | <fs></fs> was rolled back to <snapshot></snapshot>.                                                                                                                       |
| `zfsSnap.rb.failed`              | {{fs}} was not rolled back.                                                                                                                                               |
| `zfsSnap.rb.unknown`             | Could not tell whether {{fs}} was rolled back.                                                                                                                            |
| `zfsSnap.delete`                 | Delete…                                                                                                                                                                   |
| `zfsSnap.deleteLabel`            | Delete snapshot {{snapshot}} of {{fs}}                                                                                                                                    |
| `zfsSnap.del.cloned`             | <clone></clone> was made from this snapshot. Delete or promote it in the classic interface first.                                                                         |
| `zfsSnap.del.title`              | Delete snapshot {{snapshot}}?                                                                                                                                             |
| `zfsSnap.del.of`                 | Of <fs></fs>, holding {{used}}.                                                                                                                                           |
| `zfsSnap.del.consequence`        | The older versions of files that only this snapshot keeps are lost. The files in <fs></fs> now are not touched. This cannot be undone.                                    |
| `zfsSnap.del.typePrompt`         | Type {{snapshot}} to confirm.                                                                                                                                             |
| `zfsSnap.del.confirm`            | Delete snapshot                                                                                                                                                           |
| `zfsSnap.del.step.delete`        | Delete the snapshot                                                                                                                                                       |
| `zfsSnap.del.step.save`          | Save the change                                                                                                                                                           |
| `zfsSnap.del.task`               | Delete snapshot {{snapshot}}                                                                                                                                              |
| `zfsSnap.del.done`               | Snapshot <snapshot></snapshot> was deleted.                                                                                                                               |
| `zfsSnap.del.failed`             | Snapshot {{snapshot}} was not deleted.                                                                                                                                    |
| `zfsSnap.del.goneAnyway`         | The snapshot is deleted. Saving the change failed, so it stays pending in the band.                                                                                       |

---

## 6. Check a pool

**Question it answers:** are all the files on this pool still as they were saved? **Leads to:** a
check, which repairs what it can.

`Zfs.scrubPool {name}` starts a check, or continues a paused one (read from source); `Zfs.stopScrub
{name}` stops it. Both return at once; the check runs in ZFS for hours, and is not a task (section 17,
D20). Neither marks anything pending.

### 6.1 The section

`h2` "Check this pool" on the pool's page:

- 0.1's check sentence, and "It reads every disk for hours, and keeps the disks awake meanwhile. The
  pool can be used during a check, a little more slowly."
- The last check (0.2), and while checking, the `ProgressBar` with the progress.
- When the last check found something: "The last check repaired {{amount}}." or "The last check found
  {{count}} errors it could not repair." from the report's scan line **[verify]** the forms.
- Buttons, one at a time: **"Check now…"** (neutral) when idle; **"Stop checking…"** while checking;
  **"Continue checking…"** and "Stop checking…" while paused (a pause is made in the classic interface
  or by a schedule; this page does not pause, section 17, D19).
- Refused (0.10), with the reason beside the button: Critical ("Replace the missing disk first: a
  check would add hours of work to the disks that are left."), being rebuilt ("A check cannot run
  while the pool is being rebuilt."), Unknown.
- Under it, `text-sm muted-foreground`: "Checks on a schedule are set up in the classic interface."
  with `ExternalLink` "Check schedules in the classic interface" → `/#/storage/zfs/scrubjobs`.

### 6.2 The confirmations

`ConfirmDialog` (default, not destructive: nothing is lost), focus on Cancel:

- "Check pool {{pool}} now?" "ZFS reads every file on the pool and repairs what it can from a good copy.
  This takes hours on large disks, wakes every disk of the pool and keeps it busy. The pool can be used
  meanwhile." Button **"Check now"**.
- "Stop checking pool {{pool}}?" "The check stops now and starts from the beginning next time." Button
  **"Stop checking"**.
- "Continue checking pool {{pool}}?" "The check carries on from {{percent}}." Button **"Continue
  checking"**.

On confirm: the reads (`listPools`, the report) run once more; a refusal switches the dialog to it.
Otherwise the call; the dialog closes; the page reads again (the poll starts when the check shows).
Failed: the dialog stays with the server's words.

### 6.3 Copy

| Key                                  | English                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zfsCheck.title`                     | Check this pool                                                                                                                                                                             |
| `zfsCheck.cost`                      | It reads every disk for hours, and keeps the disks awake meanwhile. The pool can be used during a check, a little more slowly.                                                              |
| `zfsCheck.repaired`                  | The last check repaired {{amount}}.                                                                                                                                                         |
| `zfsCheck.unrepaired_one` / `_other` | The last check found {{count}} error it could not repair. / The last check found {{count}} errors it could not repair.                                                                      |
| `zfsCheck.start`                     | Check now…                                                                                                                                                                                  |
| `zfsCheck.stop`                      | Stop checking…                                                                                                                                                                              |
| `zfsCheck.resume`                    | Continue checking…                                                                                                                                                                          |
| `zfsCheck.refused.critical`          | Replace the missing disk first: a check would add hours of work to the disks that are left.                                                                                                 |
| `zfsCheck.refused.rebuilding`        | A check cannot run while the pool is being rebuilt.                                                                                                                                         |
| `zfsCheck.schedules`                 | Checks on a schedule are set up in the classic interface.                                                                                                                                   |
| `zfsCheck.schedulesLink`             | Check schedules in the classic interface                                                                                                                                                    |
| `zfsCheck.startTitle`                | Check pool {{pool}} now?                                                                                                                                                                    |
| `zfsCheck.startBody`                 | ZFS reads every file on the pool and repairs what it can from a good copy. This takes hours on large disks, wakes every disk of the pool and keeps it busy. The pool can be used meanwhile. |
| `zfsCheck.startConfirm`              | Check now                                                                                                                                                                                   |
| `zfsCheck.stopTitle`                 | Stop checking pool {{pool}}?                                                                                                                                                                |
| `zfsCheck.stopBody`                  | The check stops now and starts from the beginning next time.                                                                                                                                |
| `zfsCheck.stopConfirm`               | Stop checking                                                                                                                                                                               |
| `zfsCheck.resumeTitle`               | Continue checking pool {{pool}}?                                                                                                                                                            |
| `zfsCheck.resumeBody`                | The check carries on from {{percent}}.                                                                                                                                                      |
| `zfsCheck.resumeConfirm`             | Continue checking                                                                                                                                                                           |
| `zfsCheck.failed`                    | The check could not be changed.                                                                                                                                                             |

---

## 7. Replace a disk, take one offline, clear error counts

**Question it answers:** which new disk takes the place of this one, and what happens to my files
meanwhile? **Leads to:** ZFS rebuilding onto the new disk, then a fully protected pool.

`Zfs.deviceReplace {pool, olddevice, newdevice}` tells ZFS to copy everything the old disk held onto the
new one and then let go of the old one (read from source). It returns at once; the rebuild runs in
ZFS (0.3) and marks nothing pending. The new disk is overwritten.

ZFS keeps using a disk that still works while it rebuilds onto its replacement, so replacing a working
disk never lowers the pool's protection. That is why this slice replaces disks in place and offers no
"take a disk out" (the classic interface's detach and remove).

### 7.1 When "Replace…" is offered (on a disk's row, 2.5, and in What to do now, 2.4)

| The disk                                                                                                | Offered?                                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| In a Mirror or RAID-Z group: Working, Working with errors, Failing, Failed, Missing, Removed or Offline | Yes                                                                      |
| A Single disk or in a Stripe: Working or Working with errors                                            | Yes: the data is copied while the old disk still works                   |
| A Single disk or in a Stripe: anything else                                                             | No: "Its files are already lost, because this pool has no copy of them." |
| Rebuilding, or a pool already rebuilding                                                                | No: "Wait until rebuilding ends."                                        |
| A spare, read cache, write log, metadata disk or deduplication disk                                     | No: "Managed in the classic interface."                                  |
| The pool Unknown, `FAULTED`, `UNAVAIL` or `SUSPENDED`, or the roles not known                           | No: 0.3's or 0.4's reason                                                |

### 7.2 The flow

Route `/storage/zfs/pools/$pool/replace`. The disk to replace is handed over **in memory** (the session
store), never in the address, as the RAID slice's add flow does; opening the address without one shows
the pool's disks to choose from (the rows 7.1 allows), nothing preselected. Breadcrumbs: "ZFS" ›
`{{pool}}` › "Replace a disk". It follows R2 to R6; there is no apply, so no pre-flight (R1) is needed.

Reads on opening: the pool's reads (2.1), `getEmptyCandidates`, the disk-use inputs, `getPoolStatus`
and every pool's `getPoolDevices` (0.8).

**Decisions**:

- **The disk to replace**, as a fact at the top: device, model, serial number, size and role (or
  "Missing, last seen as {{path}}"), with "Change disk" when the pool has more than one that may be
  replaced.
- **The new disk** (`RadioGroupField` with groups, legend "New disk"): 0.8's groups, Empty disks
  first, then Erase and reuse, then "Disks that cannot be used ({{count}})" with Too small among them.
  One offered disk is preselected only when it is the only one, as the RAID add flow does. No disk
  offered: `EmptyState variant="empty"`: "No disk can take its place. Connect a disk at least {{size}}
  large, then look again." with "Look for new disks" (`DiskMgmt.rescan`, then the reads).
- Under the choice, `text-sm muted-foreground`, by case: a working disk: "ZFS keeps using
  {{old}} while it copies everything onto the new disk. When it ends, you can take {{old}} out."; a
  failed or missing one: "ZFS rebuilds what {{old}} held from the other disks onto the new one. Until it
  ends, {{protection}}". When a spare stands in for it: "The spare {{spare}} goes back to waiting when
  rebuilding ends."
- **"Continue"**.

**Summary and confirmation** (R2): `JobSummary` with `typedConfirmation`, title "Ready to replace the
disk":

- "Erase {{new}}. Everything on it is lost:" with Flow A's erase line for it (device, model, serial
  number, size with the label size; for Erase and reuse, what is lost).
- "Put it in the place of {{old}} in pool {{pool}}." with {{old}}'s model and serial number, so the
  right disk is pulled later.
- "Rebuilding then takes hours on large disks. The pool can be used meanwhile."
- Type to confirm: "Type {{new}} to confirm." (the new disk's device name). Button **"Erase disk and
  replace"** (`destructive`); "Change choices".

**Steps** (R3, R5):

| #              | Step label                           | Calls                                                                                                                | Notes                                                                                                                                                                                                                                             |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1              | "Check the pool and the disks again" | the pool's reads, `getEmptyCandidates`, the disk-use inputs                                                          | The old disk is still in the pool at the same place, with the same role or worse; the new disk is still offered in the same group, with the same serial number and model; 7.1 still allows it. Otherwise the flow stops before anything is erased |
| 2 (reuse only) | "Erase {{new}}"                      | `DiskMgmt.wipe {devicefile, secure: false}`, a task                                                                  | Then `getEmptyCandidates` again: it must now be a candidate                                                                                                                                                                                       |
| 3              | "Start rebuilding onto {{new}}"      | `Zfs.deviceReplace {pool, olddevice: the old disk's path from getPoolDevices, newdevice: the new disk's by-id path}` | Synchronous, short **[verify]**                                                                                                                                                                                                                   |
| 4              | "Check the result"                   | the report, `getPoolDevices`                                                                                         | The new disk is in the pool, in {{old}}'s place, Rebuilding (or, on a small pool, already Working)                                                                                                                                                |

**Result**: `JobResult` succeeded: "Rebuilding onto {{new}} has started." "It takes hours on a large
disk. You can leave this page or sign out; rebuilding goes on on the NAS. The pool's page shows its
progress." Router link "Open pool {{pool}}". When the old disk was working: "When rebuilding ends,
{{old}} ({{model}}, serial number {{serial}}) is no longer part of the pool, and you can take it out."
Recommends a wipe before giving a disk away, with a router link "Open disk {{old}}" (the disks slice's
wipe), as the RAID slice's D19.

**Failures**: as the RAID add flow's: step 1 (a change: "Nothing was erased. Choose again."; a read:
"Try this step again"); step 2 (the erase's output, "{{new}} stays erased."); step 3 ("The disk was not
put in the pool." + the server's words, for example "device is too small", and "{{new}} was erased.");
step 4 ("Rebuilding was started but the new disk has not appeared in the pool yet." with "Look again").

### 7.3 Leaving the page, and after

Leaving does not stop the flow; a reload ends its view (R8), and the pool's page shows the rebuild
from the server's state. The rebuild is the pool's state, polled (0.6), never a task.

### 7.4 Keyboard and screen readers

The new-disk radio group reads device, model, size, serial number and what is on it for each option;
the typed field's label is the prompt; step changes are polite, a failure assertive with focus on its
heading. The failure table above is the RAID add flow's (its 4.7) with these words.

### 7.7 Take a disk offline, or bring it back

`Zfs.deviceOffline {pool, device}` makes ZFS stop using a disk until it is brought back
(`Zfs.deviceOnline`), for example before pulling it from a bay to swap it (section 8). Nothing is
erased; the pool is short of that disk meanwhile (read from source; ZFS refuses itself when no copy
would be left).

- **"Take offline…"** on a Working (or Working with errors) disk of a Mirror or RAID-Z group, only
  when 0.5 says its group can lose another disk, the pool is OK or Warning, and nothing is rebuilding.
  Otherwise it is not on that row. It is never offered for a Single disk or Stripe.
  - `ConfirmDialog variant="destructive"` (it takes away protection; nothing is erased), focus on
    Cancel, no typed field (section 18, P10): title "Take {{device}} offline?"; the disk named (model,
    serial number); "Pool {{pool}} keeps working without it, but {{protection after}}. ZFS stops using
    the disk until you bring it back or replace it." Button **"Take offline"**.
- **"Bring back…"** on an Offline disk: `ConfirmDialog` (default): "Bring {{device}} back into pool
  {{pool}}?" "ZFS uses it again and copies onto it what changed while it was offline." Button **"Bring
  back"**. Then the pool may show "Copying data onto {{disk}}" (0.3).
- Both: re-read before the call; the server's words on failure; the page reads again after.

### 7.8 Clear error counts

`Zfs.clearPool {name}` sets every disk's error counts back to zero and lets ZFS try a failed disk
again (read from source). It is offered only in What to do now's "A disk has reported errors" case
(2.4), not as a general button.

`ConfirmDialog` (default), focus on Cancel: "Clear the error counts of pool {{pool}}?" "Do this only
after you have fixed the cause, such as a loose cable. If the disk is failing, the errors come back, and
the counts are the only record of them here." Button **"Clear error counts"**.

### 7.9 Copy

| Key                                | English                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zfsReplace.breadcrumb`            | Replace a disk                                                                                                                                                     |
| `zfsReplace.title`                 | Replace a disk in pool {{pool}}                                                                                                                                    |
| `zfsReplace.documentTitle`         | Replace a disk – Pool {{pool}} – ZFS                                                                                                                               |
| `zfsReplace.choose`                | Disk to replace                                                                                                                                                    |
| `zfsReplace.changeDisk`            | Change disk                                                                                                                                                        |
| `zfsReplace.new`                   | New disk                                                                                                                                                           |
| `zfsReplace.none`                  | No disk can take its place. Connect a disk at least {{size}} large, then look again.                                                                               |
| `zfsReplace.rescan`                | Look for new disks                                                                                                                                                 |
| `zfsReplace.whileWorking`          | ZFS keeps using <old></old> while it copies everything onto the new disk. When it ends, you can take <old></old> out.                                              |
| `zfsReplace.whileFailed`           | ZFS rebuilds what <old></old> held from the other disks onto the new one. Until it ends, {{protection}}                                                            |
| `zfsReplace.spareBack`             | The spare <spare></spare> goes back to waiting when rebuilding ends.                                                                                               |
| `zfsReplace.notAllowed.noCopy`     | Its files are already lost, because this pool has no copy of them.                                                                                                 |
| `zfsReplace.notAllowed.rebuilding` | Wait until rebuilding ends.                                                                                                                                        |
| `zfsReplace.notAllowed.class`      | Managed in the classic interface.                                                                                                                                  |
| `zfsReplace.summaryTitle`          | Ready to replace the disk                                                                                                                                          |
| `zfsReplace.sum.erase`             | Erase <new></new>. Everything on it is lost:                                                                                                                       |
| `zfsReplace.sum.place`             | Put it in the place of <old></old> ({{model}}, serial number <serial></serial>) in pool <pool></pool>.                                                             |
| `zfsReplace.sum.rebuild`           | Rebuilding then takes hours on large disks. The pool can be used meanwhile.                                                                                        |
| `zfsReplace.typePrompt`            | Type {{device}} to confirm.                                                                                                                                        |
| `zfsReplace.confirm`               | Erase disk and replace                                                                                                                                             |
| `zfsReplace.step.check`            | Check the pool and the disks again                                                                                                                                 |
| `zfsReplace.step.erase`            | Erase {{device}}                                                                                                                                                   |
| `zfsReplace.step.replace`          | Start rebuilding onto {{device}}                                                                                                                                   |
| `zfsReplace.step.verify`           | Check the result                                                                                                                                                   |
| `zfsReplace.doneTitle`             | Rebuilding onto {{device}} has started.                                                                                                                            |
| `zfsReplace.doneBody`              | It takes hours on a large disk. You can leave this page or sign out; rebuilding goes on on the NAS. The pool's page shows its progress.                            |
| `zfsReplace.doneOld`               | When rebuilding ends, <old></old> ({{model}}, serial number <serial></serial>) is no longer part of the pool, and you can take it out.                             |
| `zfsReplace.wipeAdvice`            | Wipe a disk before you give it away.                                                                                                                               |
| `zfsReplace.openOld`               | Open disk {{device}}                                                                                                                                               |
| `zfsReplace.fail.changed`          | The pool or the disks changed. Nothing was erased. Choose again.                                                                                                   |
| `zfsReplace.fail.notCandidate`     | {{device}} was erased, but the ZFS plugin still does not offer it.                                                                                                 |
| `zfsReplace.fail.replace`          | The disk was not put in the pool.                                                                                                                                  |
| `zfsReplace.fail.erased`           | {{device}} was erased.                                                                                                                                             |
| `zfsReplace.fail.notSeen`          | Rebuilding was started but the new disk has not appeared in the pool yet.                                                                                          |
| `zfsOffline.button`                | Take offline…                                                                                                                                                      |
| `zfsOffline.title`                 | Take {{device}} offline?                                                                                                                                           |
| `zfsOffline.body`                  | Pool <pool></pool> keeps working without it, but {{protection}}. ZFS stops using the disk until you bring it back or replace it.                                   |
| `zfsOffline.confirm`               | Take offline                                                                                                                                                       |
| `zfsOnline.button`                 | Bring back…                                                                                                                                                        |
| `zfsOnline.title`                  | Bring {{device}} back into pool {{pool}}?                                                                                                                          |
| `zfsOnline.body`                   | ZFS uses it again and copies onto it what changed while it was offline.                                                                                            |
| `zfsOnline.confirm`                | Bring back                                                                                                                                                         |
| `zfsClear.button`                  | Clear the error counts…                                                                                                                                            |
| `zfsClear.title`                   | Clear the error counts of pool {{pool}}?                                                                                                                           |
| `zfsClear.body`                    | Do this only after you have fixed the cause, such as a loose cable. If the disk is failing, the errors come back, and the counts are the only record of them here. |
| `zfsClear.confirm`                 | Clear error counts                                                                                                                                                 |
| `zfsDevice.failed`                 | The disk could not be changed.                                                                                                                                     |

---

## 8. Flow F: "Replace a failing disk" (J8a), for ZFS

The UX audit's Flow F (4.7) for the ZFS plugin, in the same two-part shape as the RAID slice's (its
section 8), built from the pieces above.

### 8.1 How the reader learns of it

- The email, when email and the plugin's ZFS alerts are on (1.5).
- The dashboard's attention row (10.1), the ZFS list's roll-up, and the Disks list ("Part of ZFS pool
  {{pool}}" beside the disk, and its health when checked).

### 8.2 The journey

| #   | Where                                                                                                                                                                                              | What the reader does                                                         | Calls                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | The pool's page, What to do now (2.4)                                                                                                                                                              | Reads which disk failed (device, model, serial number) or which disks remain | reads only                                                         |
| 2a  | With a free place for a disk: connect the new disk, then "Look for new disks"                                                                                                                      |                                                                              | `DiskMgmt.rescan`                                                  |
| 2b  | Without, and the old disk still works (a health warning, errors): "Take offline…" (7.7), turn off the NAS (the classic interface's power menu), swap the disks, turn it on, sign in, open the pool |                                                                              | `Zfs.deviceOffline`                                                |
| 2c  | Without, and the old disk has failed or is missing: turn off the NAS, swap the disks, turn it on, sign in, open the pool                                                                           |                                                                              |                                                                    |
| 3   | "Replace the disk…" (section 7): the replacement is preselected when it is the only disk offered; typed confirmation; steps                                                                        |                                                                              | `getEmptyCandidates`, `DiskMgmt.wipe` (reuse), `Zfs.deviceReplace` |
| 4   | The pool's page shows Rebuilding with its progress, polled (0.6); the reader may leave                                                                                                             |                                                                              | `listPools`, the report, `getPoolDevices`                          |
| 5   | When rebuilding ends, the state is OK, and the old disk is no longer listed                                                                                                                        |                                                                              |                                                                    |

**Replacing a disk that still works, with a free place**: step 2a then 3. The pool stays fully
protected throughout, because ZFS keeps the old disk until the new one is complete; this is ZFS's
advantage over the RAID slice's spare-then-remove, and the page says so (7.2).

|                 | Stock (J8a)                                                                   | Here                                                                                |
| --------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pages           | the pools list's Devices menu, a form per action, plus the Disks page to wipe | the pool's page and the replace flow                                                |
| Disk named by   | device path; model and serial only on the Disks page                          | device, model and serial number everywhere it is chosen, offlined or replaced       |
| Confirmations   | a form per action                                                             | one typed confirmation for the new disk; a plain one to take a working disk offline |
| Rebuild visible | the pools list's state; the scrub status page by hand                         | a progress bar with time left, polled only while it rebuilds                        |

### 8.3 The pause

Nothing is held in the browser across the pause: after the restart, the pool's page reads the pool
again, and What to do now shows the "Offline" or "Missing" case, whose Replace button leads to step 3
with that disk chosen. The disk to pull is identified by its serial number in What to do now and in
7.7's dialog **[verify]** that an offlined disk keeps its place and path in the report after a restart
with the disk swapped.

---

## 9. Delete a file system, delete a pool

Both use `Zfs.deleteObjectBg`, a background task (read from source: it runs the plugin's delete in a
background process and returns a task handle), and both mark 0.9's modules pending. So both follow
0.9's rule: the dialog refuses to start while anything else is pending, and its last step applies
what the deletion left pending.

### 9.1 Delete a file system

`deleteObjectBg {type: "Filesystem", name, mp}`: the plugin removes the file system's mount entry and
scheduled snapshot jobs, then destroys the file system **with all its snapshots** (read from source).
Everything in it is lost.

**The section** (`h2` "Delete this file system", last on its page, after a divider): "Deleting a file
system erases every file in it and all its snapshots." Button **"Delete file system…"** (neutral; the
destructive form is on the dialog's confirm button). Unavailable (`aria-disabled`, focusable), each
blocker in words beside the button (0.10):

| Blocker                                                               | Words                                                                                | What to do                                                                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared folders use it                                                 | "Shared folders use it: {{list}}."                                                   | "Remove them first, in Shared folders." router link to the Shared folders page                                                                       |
| Something else uses its mount entry                                   | the file-systems slice's "used by a setting" sentence                                | the classic File systems link stays in the footer for what this page does not show                                                                   |
| File systems or volumes inside it                                     | "It holds {{list}}."                                                                 | for a file system: "Delete it first, on its page." router link; for a volume: "Delete it in the classic interface first." (no link, section 18, P11) |
| A clone was made from one of its snapshots                            | "{{clone}} was made from one of its snapshots."                                      | "Delete or promote it in the classic interface first."                                                                                               |
| Locked                                                                | "It is locked."                                                                      | "Unlock it in the classic interface first."                                                                                                          |
| A read failed                                                         | "Could not check what uses this file system, so it cannot be deleted now." + message | "Try again"                                                                                                                                          |
| An action on its pool is running in this session; the pool is Unknown | 0.10's words                                                                         | none                                                                                                                                                 |

**The check before the dialog**: pressing "Delete file system…" re-reads `listPools`, `getAllSnapshots`,
`FileSystemMgmt.getList`, `ShareMgmt.getList`, `FsTab.getByFsName` and `dirtyModules`. The dialog opens
with "Checking what uses this file system…", then shows a refusal, the pre-flight (0.9), "This file
system no longer exists.", or the confirmation.

**The confirmation**: `ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm:

1. Title: "Delete file system {{fs}}?"
2. The file system named: pool, folder on the NAS, `used`, and "{{count}} snapshots holding {{size}}".
3. The consequence: "Every file in {{fs}} and all {{count}} of its snapshots are lost. This cannot be
   undone."
4. Type to confirm: "Type {{fs}} to confirm." (the full name).
5. Buttons: "Cancel" (focused) and **"Delete file system"** (`destructive`).

**On confirm**: the reads run once more ("Checking again…"); a blocker switches to the refusal.
Otherwise a step list in the dialog: 1 "Delete the file system" (the task, "Delete file system
{{fs}}"); 2 "Save the change" (R10: expected `fstab`, `collectd`, `monit`, `quota`, and `zfscron` when a
snapshot job was removed **[verify]**; `Config.applyChangesBg`). Result: the page shows, in place of its
content, `JobResult` succeeded: "{{fs}} was deleted." with "Its space is free on pool {{pool}}." and a
router link "Open pool {{pool}}". Failures: step 1 stays with the server's words ("{{fs}} was not
deleted."); step 2 has R7's "Try again" first, then "Stop here", saying the file system is gone and
the change stays pending. The request was cut: "Could not tell whether {{fs}} was deleted." and
Refresh.

### 9.2 Delete a pool

`deleteObjectBg {type: "Pool", name, mp}`: the plugin refuses while the pool has any file system or
volume besides its own folder; otherwise it removes the pool's own mount entry, destroys the pool, and
clears ZFS's marks and any other signatures from each of its disks' partitions, and removes the pool's
scheduled jobs (read from source). Everything on the pool is lost. **[verify]** whether its disks are
then offered as empty (0.8) or need a wipe.

**The section** (`h2` "Delete this pool", last on the pool's page, after a divider): "Deleting a pool
erases everything on it and frees its disks for other use." Button **"Delete pool…"** (neutral).
Unavailable, each blocker in words (0.10):

| Blocker                                          | Words                                          | What to do                                                              |
| ------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| File systems on it besides its own folder        | "It holds the file systems {{list}}."          | "Delete them first, on their pages." with a router link per file system |
| Volumes on it                                    | "It holds the volumes {{list}}."               | "Delete them in the classic interface first." (no link, P11)            |
| Shared folders use its own folder                | "Shared folders use its own folder: {{list}}." | router link to the Shared folders page                                  |
| Something else uses its own folder's mount entry | the "used by a setting" sentence               |                                                                         |
| Its own folder is locked                         | "Its own folder is locked."                    | "Unlock it in the classic interface first."                             |
| A read failed; Unknown; an action running        | 0.10's words                                   | "Try again" for a read                                                  |

A pool being checked or rebuilt can be deleted: nothing it holds is kept.

**The check before the dialog**: re-reads the pool's reads, `getAllSnapshots`, `FileSystemMgmt.getList`,
`ShareMgmt.getList`, `DiskMgmt.getList` and `dirtyModules`; "Checking what is on this pool…", then a
refusal, the pre-flight, "This pool no longer exists.", or the confirmation.

**The confirmation**: `ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm:

1. Title: "Delete pool {{pool}}?"
2. The pool named: layout, space for files, and **its disks**, each with device, model, serial number
   and size with the label size.
3. The consequence: "Everything on this pool is lost: the files in its own folder ({{used}}) and its
   {{count}} snapshots. This cannot be undone."
4. "Its disks are cleared of the pool's marks and can be used again. The files on them are not
   overwritten, only made unreadable; wipe a disk before you give it away."
5. Type to confirm: "Type {{pool}} to confirm."
6. Buttons: "Cancel" (focused) and **"Delete pool"** (`destructive`).

**On confirm**: as 9.1, with step 1 "Delete the pool" (task "Delete pool {{pool}}"). Result: "Pool
{{pool}} was deleted." "Its disks are free: {{list}}." with router links "Go to ZFS" and, for each
disk, "Open disk {{device}}". Failures as 9.1 ("Pool {{pool}} was not deleted." + the server's words;
"If the pool was destroyed but its disks were not cleared, they show under Erase and reuse when you
next use them.").

### 9.3 Keyboard and screen readers

Focus on Cancel; Tab order Cancel, the typed field, the confirm button (unavailable but focusable); the
consequence is the dialog's description, read with the title; the typed field's label is the prompt
and its hint is linked. The steps are announced politely, a failure assertively, the result politely.

### 9.4 Copy

| Key                             | English                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zfsDelete.fs.title`            | Delete this file system                                                                                                                                            |
| `zfsDelete.fs.intro`            | Deleting a file system erases every file in it and all its snapshots.                                                                                              |
| `zfsDelete.fs.open`             | Delete file system…                                                                                                                                                |
| `zfsDelete.blocked.shares`      | Shared folders use it: {{list}}.                                                                                                                                   |
| `zfsDelete.blocked.sharesDo`    | Remove them first, in Shared folders.                                                                                                                              |
| `zfsDelete.blocked.sharesLink`  | Open Shared folders                                                                                                                                                |
| `zfsDelete.blocked.inside`      | It holds {{list}}.                                                                                                                                                 |
| `zfsDelete.blocked.insideFsDo`  | Delete it first, on its page.                                                                                                                                      |
| `zfsDelete.blocked.insideVolDo` | Delete it in the classic interface first.                                                                                                                          |
| `zfsDelete.blocked.clone`       | <clone></clone> was made from one of its snapshots.                                                                                                                |
| `zfsDelete.blocked.cloneDo`     | Delete or promote it in the classic interface first.                                                                                                               |
| `zfsDelete.blocked.locked`      | It is locked.                                                                                                                                                      |
| `zfsDelete.blocked.lockedDo`    | Unlock it in the classic interface first.                                                                                                                          |
| `zfsDelete.blocked.unread`      | Could not check what uses this file system, so it cannot be deleted now.                                                                                           |
| `zfsDelete.fs.checking`         | Checking what uses this file system…                                                                                                                               |
| `zfsDelete.fs.gone`             | This file system no longer exists.                                                                                                                                 |
| `zfsDelete.fs.dialogTitle`      | Delete file system {{fs}}?                                                                                                                                         |
| `zfsDelete.fs.snapshots`        | {{count}} snapshots holding {{size}}                                                                                                                               |
| `zfsDelete.fs.consequence`      | Every file in <fs></fs> and all {{count}} of its snapshots are lost. This cannot be undone.                                                                        |
| `zfsDelete.fs.typePrompt`       | Type {{fs}} to confirm.                                                                                                                                            |
| `zfsDelete.fs.confirm`          | Delete file system                                                                                                                                                 |
| `zfsDelete.checkingAgain`       | Checking again…                                                                                                                                                    |
| `zfsDelete.fs.step.delete`      | Delete the file system                                                                                                                                             |
| `zfsDelete.step.save`           | Save the change                                                                                                                                                    |
| `zfsDelete.fs.task`             | Delete file system {{fs}}                                                                                                                                          |
| `zfsDelete.fs.doneTitle`        | {{fs}} was deleted.                                                                                                                                                |
| `zfsDelete.fs.doneBody`         | Its space is free on pool <pool></pool>.                                                                                                                           |
| `zfsDelete.fs.failed`           | {{fs}} was not deleted.                                                                                                                                            |
| `zfsDelete.fs.goneAnyway`       | The file system is deleted. Saving the change failed, so it stays pending in the band.                                                                             |
| `zfsDelete.fs.unknown`          | Could not tell whether {{fs}} was deleted.                                                                                                                         |
| `zfsDelete.pool.title`          | Delete this pool                                                                                                                                                   |
| `zfsDelete.pool.intro`          | Deleting a pool erases everything on it and frees its disks for other use.                                                                                         |
| `zfsDelete.pool.open`           | Delete pool…                                                                                                                                                       |
| `zfsDelete.pool.blocked.fs`     | It holds the file systems {{list}}.                                                                                                                                |
| `zfsDelete.pool.blocked.fsDo`   | Delete them first, on their pages.                                                                                                                                 |
| `zfsDelete.pool.blocked.vol`    | It holds the volumes {{list}}.                                                                                                                                     |
| `zfsDelete.pool.blocked.volDo`  | Delete them in the classic interface first.                                                                                                                        |
| `zfsDelete.pool.blocked.shares` | Shared folders use its own folder: {{list}}.                                                                                                                       |
| `zfsDelete.pool.blocked.locked` | Its own folder is locked.                                                                                                                                          |
| `zfsDelete.pool.checking`       | Checking what is on this pool…                                                                                                                                     |
| `zfsDelete.pool.gone`           | This pool no longer exists.                                                                                                                                        |
| `zfsDelete.pool.dialogTitle`    | Delete pool {{pool}}?                                                                                                                                              |
| `zfsDelete.pool.consequence`    | Everything on this pool is lost: the files in its own folder ({{used}}) and its {{count}} snapshots. This cannot be undone.                                        |
| `zfsDelete.pool.disks`          | Its disks are cleared of the pool's marks and can be used again. The files on them are not overwritten, only made unreadable; wipe a disk before you give it away. |
| `zfsDelete.pool.typePrompt`     | Type {{pool}} to confirm.                                                                                                                                          |
| `zfsDelete.pool.confirm`        | Delete pool                                                                                                                                                        |
| `zfsDelete.pool.step.delete`    | Delete the pool                                                                                                                                                    |
| `zfsDelete.pool.task`           | Delete pool {{pool}}                                                                                                                                               |
| `zfsDelete.pool.doneTitle`      | Pool {{pool}} was deleted.                                                                                                                                         |
| `zfsDelete.pool.doneBody`       | Its disks are free: {{list}}.                                                                                                                                      |
| `zfsDelete.pool.toList`         | Go to ZFS                                                                                                                                                          |
| `zfsDelete.pool.failed`         | Pool {{pool}} was not deleted.                                                                                                                                     |
| `zfsDelete.pool.notCleared`     | If the pool was destroyed but its disks were not cleared, they show under Erase and reuse when you next use them.                                                  |
| `zfsDelete.pool.unknown`        | Could not tell whether pool {{pool}} was deleted.                                                                                                                  |

---

## 10. How ZFS fits the dashboard, the Disks and File systems pages, and Flow A

### 10.1 Dashboard

| Where                                        | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attention rows (the monitoring design's 1.7) | **One row per pool that is not OK by state** (0.3, from `getPoolStatus`'s `state` and `status`, which are what it returns), read **once per visit** and on "Try again", never polled, **only if the VM shows that `getPoolStatus` reads no disk** (section 18, P14). Critical: "ZFS pool {{pool}}: a disk is missing or has failed." (`DEGRADED`), "ZFS pool {{pool}} cannot be used." (`FAULTED`, `UNAVAIL`, `SUSPENDED`), "ZFS pool {{pool}} has damaged files." (`status` `Error`). Action: router link "Open pool {{pool}}". Placed with the disk rows (order 3). No row for a disk's error counts or for how full (the report and the pool row are not read here), and none for Unknown (the monitoring design's rule). If the VM shows a disk read, there are no ZFS rows, as for RAID (its 9.1) |
| Storage card (1.2)                           | Unchanged reads. ZFS file systems (`type` `zfs`) of one pool are shown **as one item for the pool**: "ZFS pool {{pool}}" with the fullest of its file systems' figures and "{{count}} file systems share this space", because each one reports the pool's free space as its own and six rows of the same free space mislead (section 17, D22). The item links to the pool's page when the plugin is known to be installed                                                                                                                                                                                                                                                                                                                                                                              |

### 10.2 Disks

| Where                                      | Was                                                                                              | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The disk-use model (the disks slice's 0.6) | ZFS pools' disks seen only through mounted file systems, and the untraceable sentence naming ZFS | A new use, **"Part of ZFS pool {{pool}}"** (kind `zfs`), from `getPoolStatus` and each pool's `getPoolDevices` (0.8), read wherever the model is read (the Disks pages, the wipe, Flow A, the RAID and ZFS flows). It refuses a wipe, a RAID use and a new file system, as a RAID member does. Fail closed: when the plugin is installed and these reads fail, the model is "Not known" for every disk. The untraceable sentence drops "ZFS" from its list once these reads succeed |
| Disks list and a disk's page, "Used for"   | nothing, or the mounted ZFS file system's name                                                   | "Part of ZFS pool {{pool}}" with a router link to the pool's page, and the role in words when it is not a data disk ("Spare in ZFS pool {{pool}}", "Read cache of ZFS pool {{pool}}"), from `getPoolDevices` and the report **[verify]** that the role can be told from `getPoolDevices` alone; if not, only "Part of" is shown there                                                                                                                                               |
| A disk's page, wipe blocker                | the file system's blocker, when one was mounted                                                  | "It is part of ZFS pool {{pool}}." "Replace it, or delete the pool, on the pool's page first." + router link "Open pool {{pool}}" (where sections 7 and 9's own refusals apply)                                                                                                                                                                                                                                                                                                     |

### 10.3 File systems

Every ZFS file system the plugin knows appears in `FileSystemMgmt.getList` (0.12): type `zfs`, the
full name as `devicefile` and `label`, no UUID, the pool's first disk as `parentdevicefile`, the pool's
disks as `devicefiles`, and backend properties saying it is not mounted through OMV's mount table and
cannot be grown by OMV (read from the plugin's backend). So:

| Where                                                            | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type word                                                        | `zfs` "ZFS" joins the shared word list                                                                                                                                                                                                                                                                                                                                                                                 |
| Name and link                                                    | The full name in `Identifier`; a router link to its page under ZFS (0.7), not to a File systems page (it has no UUID, the file-systems slice's 0.5). Without the plugin known to be installed: text, with the existing "This file system has no ID this page can use" sentence                                                                                                                                         |
| "On" column                                                      | "ZFS pool {{pool}}", a router link to the pool's page                                                                                                                                                                                                                                                                                                                                                                  |
| Unmount, grow, warning level and tags                            | Not offered for ZFS rows: "ZFS file systems are managed on the ZFS pages." The existing refusals already exclude them (they are not mounted through OMV's settings and cannot be grown by OMV)                                                                                                                                                                                                                         |
| "Found on the disks, not mounted" (the file-systems slice's 1.5) | **ZFS file systems are left out**: the plugin's backend reports every ZFS file system, and mounting one through OMV's mount dialog would give it a second, different folder. A line instead, when any are found: "{{count}} ZFS file systems are not known to OMV yet, for example ones made outside the NAS's pages. Add them with Discover in the classic interface." with the classic ZFS link                      |
| The contract                                                     | `FileSystemMgmt.getList` and `enumerateFilesystems` rows for ZFS carry a `uuid` of `null` (the backend has none; OMV's helper copies it as it is) **[verify]**. The contract makes `uuid` nullable, and every function that reads it (the address, the disk-use model) treats `null` as empty. This is the first check on the VM (15.2, step 1): until it holds, the File systems pages could fail with a pool present |

### 10.4 Flow A

- **Disks in a ZFS pool are never offered** (10.2): they are "Part of ZFS pool {{pool}}" under
  "Cannot be used".
- **The combine hint** under the disk choice, with the plugin installed: "To combine several disks,
  use Combine disks (BTRFS), create a RAID array under RAID, or create a ZFS pool under ZFS." with the
  router links that apply (RAID only with its plugin).
- Flow A does not put a file system on a pool: a ZFS file system is made on the pool's page (4.2),
  and both hand over to sharing with the same card.
- "Erase and reuse"'s sentence for a disk with unknown contents names ZFS pools from other computers
  (0.8).

### 10.5 Not changed in this slice

- **System logs**: the plugin adds a "ZFS events" log; showing it needs only the existing
  `LogFile.getList` with the plugin's log id, and is left for a later change with its own capture.
- **Memory use**: ZFS uses free memory as a cache, so the dashboard's memory figure looks high on a
  ZFS NAS. Saying so on the Usage card is left for later.

---

## 11. A normal user, navigation and routes

### 11.1 A normal user

Every method in this slice refuses a normal user (read from source). So:

- The ZFS item stays out of a normal user's menu, and the shell makes no ZFS read for one.
- A normal user who types any ZFS address gets the existing "only administrators" page, and the route
  makes no call first (UI-4).
- The dashboard for a normal user is unchanged.

### 11.2 Navigation and routes

| Item                                 | Route                              | Roles | Replaces                                                                                                                      |
| ------------------------------------ | ---------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| Storage > ZFS (only with the plugin) | `/storage/zfs`                     | admin | the stock ZFS Pools list                                                                                                      |
| (no menu item)                       | `/storage/zfs/create`              | admin | the stock Add pool form                                                                                                       |
| (no menu item)                       | `/storage/zfs/pools/$pool`         | admin | the stock Details, Scrub and Devices menus for a pool, and its Delete                                                         |
| (no menu item)                       | `/storage/zfs/pools/$pool/add`     | admin | the stock Add filesystem dialog                                                                                               |
| (no menu item)                       | `/storage/zfs/pools/$pool/replace` | admin | the stock Replace device form                                                                                                 |
| (no menu item)                       | `/storage/zfs/fs/$`                | admin | the stock Datasets and Snapshots pages for one file system, its properties for the size limit and compression, and its Delete |

- **The menu item.** `NAV_PAGES` gains Storage > ZFS (`item: "zfs"`, the classic segment;
  `labelKey: "nav.items.storage.zfs"` "ZFS"; `classic: "/#/storage/zfs/pools"`), placed after RAID and
  before File systems **[verify]** where the classic menu places it. It is the second entry with a
  condition (`when: "zfsPlugin"`): it is shown only when the shell's `Zfs.listCompressionTypes` read,
  made once after an administrator signs in, did not answer 404 (0.11).
- Static file routes, more specific than `$group/$item`, as before. `BuiltRoute` gains `/storage/zfs`;
  `isCurrent` treats `/storage/zfs/…` as the ZFS item's.
- `create`, `pools` and `fs` are static segments; `$pool` and the file system's splat are validated in
  `params.parse` (0.7), and a failing value renders the not-found state with no call.
- Route-level code splitting: each page is its own chunk.
- Document titles: "ZFS – openmediavault", "Pool tank – ZFS – openmediavault", "Create pool – ZFS –
  openmediavault", "Add a file system – Pool tank – ZFS – openmediavault", "Replace a disk – Pool tank
  – ZFS – openmediavault", "tank/media – ZFS – openmediavault".

---

## 12. Every request in this slice

**The owner has not cleared any ZFS method yet.** Each `Zfs.*` method below is **Proposed**: it is put
to the owner against the private review list before any contract work. The plugin's service is named
`zfs` in its source and `Zfs` by the classic interface; OMV matches either (0.11). Every method checks
the administrator role (read from source). Request schemas will be stricter than the plugin's
datamodels where this interface sends less, which the contract rules allow; "Stricter" below says how.

### 12.1 ZFS methods this design needs

| #   | Method                     | What it does (read from source)                                                                                                                                                                                                                                                                                                                | Changes state?                                 | Marks pending                                                                        | Background task?                  | Used where, when                                                                                                | Contract notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Zfs.listCompressionTypes` | Returns a fixed list of compression names; runs no command and reads nothing                                                                                                                                                                                                                                                                   | No                                             | No                                                                                   | No                                | The shell, once after an administrator signs in, to know whether the plugin is installed (0.11)                 | No parameters. Its 404 means not installed. The list itself is not used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | `Zfs.listPools`            | Lists every pool, file system and volume in one flat list: names, type, sizes, mount folder, mounted, compression and ratio, size limit, origin, encryption and key state, whether shared folders use it, the pool's state, error status, check state and capacity. Runs ZFS's status, list and listing commands and reads OMV's configuration | No                                             | No                                                                                   | No (a `Bg` twin exists, not used) | Every ZFS page, the create and add flows: open, Refresh, after an action, the re-checks, the poll (0.6)         | Request: the four common list parameters, always sent (`start` 0, `limit` null, the sort fields null). Response: open object rows; `devices` (markup-joined) not used; sizes as numbers **[verify]**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | `Zfs.getObjectDetails`     | Returns ZFS's own report as text: for a pool, its status report with the device tree, error counts, last check and damaged files; for a file system, its listing and every property                                                                                                                                                            | No                                             | No                                                                                   | No                                | The ZFS list (each pool), a pool's page, the poll for a busy pool; a file system's technical details on request | Stricter: `type` only `Pool` or `Filesystem` (the source also has `Volume` and `Snapshot`); `name` 0.7's existing-name patterns. Response: a string, lines joined by a line feed and a carriage return. Captures scrubbed: serial numbers inside device names, damaged-file paths                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | `Zfs.getPoolDevices`       | Lists one pool's disks: full path, state, the group each is in                                                                                                                                                                                                                                                                                 | No                                             | No                                                                                   | No                                | A pool's page, the replace flow, the disk-use model (once per pool)                                             | `name` the pool pattern. Response: `{devicefile, state, vdev, label}[]`; `label` is server English, not shown. An empty reply for a listed pool is treated as a failure (0.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | `Zfs.getPoolStatus`        | Lists every pool's name, state, error status and capacity, from ZFS's status and list commands only                                                                                                                                                                                                                                            | No                                             | No                                                                                   | No                                | The dashboard, once per visit, if it reads no disk (P14); the disk-use model, for the pool names                | No parameters. An empty reply while ZFS file systems exist is treated as a failure (0.8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | `Zfs.getAllSnapshots`      | Lists every snapshot on every pool: file system, name, space it holds, size it shows, encryption. Not when it was taken                                                                                                                                                                                                                        | No                                             | No                                                                                   | No (a `Bg` twin exists, not used) | A file system's page; its delete and roll-back re-checks                                                        | Request: the common list parameters. **[verify]** the time on a NAS with thousands of snapshots; if it is slow, the `Bg` twin is the fallback and needs clearing too                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | `Zfs.getEmptyCandidates`   | Lists disks that may go into a pool: not read-only, not USB, not named by another service's settings, no file system found; with stable by-id paths, size, vendor, serial number                                                                                                                                                               | No                                             | No                                                                                   | No                                | The create and replace flows, and their re-checks                                                               | No parameters. `serialnumber` scrubbed in captures; `label` and `description` are server English, not shown                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | `Zfs.addPool`              | Creates a pool from the disks given with one layout, then turns compression on, and registers the pool's own folder with OMV                                                                                                                                                                                                                   | Yes: **erases the disks given**                | `fstab`, `collectd`, `monit`, `quota`                                                | No (synchronous)                  | The create flow, after the typed confirmation and the re-check                                                  | `x-omv-destructive: data`, `x-omv-dirty`. Stricter: `pooltype` one of `mirror`, `raidz1`, `raidz2`, `raidz3`, `basic`; `name` 0.7's new-pool rule; `devices` 1 or more by-id device paths (the contract's device-file pattern, limited to letters, digits and `. _ : + -` after `/dev/disk/by-id/`); `devalias` only `id`; `force` only `false`; `mountpoint` only empty; `ashift` only `true` and `ashiftval` only `12`; `casesensitivity` only `sensitive`; `compress` only `true`, `compresstype` only `lz4` (both read by the source though not in its datamodel). The description says the server checks nothing about what is on the disks beyond ZFS's own refusal of a disk in use |
| 9   | `Zfs.addObject`            | Creates a file system (or, not used here, a snapshot, volume or clone), mounts it and registers it with OMV                                                                                                                                                                                                                                    | Yes                                            | `fstab`, `collectd`, `monit`, `quota`                                                | No                                | The create flow's first file system; adding a file system (4.2)                                                 | Stricter: `type` only `filesystem`; `path` an existing pool's name; `name` 0.7's new-file-system rule; `mountpoint` only empty; `compression`, `recordsize`, `casesensitivity` not sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | `Zfs.setProperties`        | Sets ZFS properties of a pool or file system                                                                                                                                                                                                                                                                                                   | Yes                                            | for a file system: `collectd`, `monit`, `quota`                                      | No                                | A file system's settings (4.4), and the size limit step of 4.2                                                  | Stricter: `type` only `Filesystem`; `name` the existing-name pattern; `properties` 1 or 2 items, `property` only `quota` or `compression`, `value` for `quota` `none` or a size with a `G` or `T` suffix, for `compression` `lz4` or `off`, `modified` only `true`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 11  | `Zfs.quickSnapshot`        | Takes a snapshot of a file system, named with the NAS's date and time; with `recursive`, of the file systems inside it too                                                                                                                                                                                                                     | Yes (adds a snapshot)                          | No                                                                                   | No                                | Take a snapshot now (5.3)                                                                                       | `name` the existing-name pattern; `recursive` boolean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 12  | `Zfs.rollbackSnapshot`     | Rolls a file system back to a snapshot; ZFS refuses when newer snapshots exist                                                                                                                                                                                                                                                                 | Yes: **loses every change since the snapshot** | No                                                                                   | No                                | Roll back (5.4), after the typed confirmation                                                                   | `x-omv-destructive: data`. `name` a snapshot's full name (`pool/fs@snap`, each part 0.7's existing-name pattern)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 13  | `Zfs.deleteObjectBg`       | Deletes a snapshot, a file system (with its snapshots and mount entry) or a pool (destroying it and clearing its disks' marks), and the scheduled jobs that named it; refuses a pool with file systems or volumes, a file system with file systems inside it, either while shared folders use it                                               | Yes: **destroys data**                         | `fstab`, `collectd`, `monit`, `quota`; `zfscron` when a job was removed **[verify]** | **Yes** (returns a task handle)   | Delete a snapshot (5.5), a file system (9.1), a pool (9.2), after the typed confirmations                       | `x-omv-destructive: data`, `x-omv-task`, `x-omv-dirty`. Stricter: `type` only `Snapshot`, `Filesystem` or `Pool` (not `Volume`); `name` the matching existing-name pattern; `mp` the mount folder read for the object (empty for a snapshot); `recursive` only `false`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 14  | `Zfs.scrubPool`            | Starts a check of a pool, or continues a paused one                                                                                                                                                                                                                                                                                            | Yes (starts hours of work)                     | No                                                                                   | No (the check runs in ZFS)        | Check now, Continue checking (6.2)                                                                              | `name` the pool pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 15  | `Zfs.stopScrub`            | Stops a pool's check                                                                                                                                                                                                                                                                                                                           | Yes                                            | No                                                                                   | No                                | Stop checking (6.2)                                                                                             | `name` the pool pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 16  | `Zfs.deviceReplace`        | Replaces a disk of a pool with another; ZFS rebuilds onto the new one                                                                                                                                                                                                                                                                          | Yes: **erases the new disk**                   | No                                                                                   | No (the rebuild runs in ZFS)      | The replace flow (7.2), after the typed confirmation                                                            | `x-omv-destructive: data`. `pool` the pool pattern; `olddevice` a device path as `getPoolDevices` gave it; `newdevice` a by-id path as `getEmptyCandidates` gave it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17  | `Zfs.deviceOffline`        | Makes ZFS stop using a disk until it is brought back                                                                                                                                                                                                                                                                                           | Yes: **takes away protection**                 | No                                                                                   | No                                | Take offline (7.7)                                                                                              | `x-omv-destructive: service`. `pool`, `device` as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 18  | `Zfs.deviceOnline`         | Brings an offline disk back into use                                                                                                                                                                                                                                                                                                           | Yes                                            | No                                                                                   | No                                | Bring back (7.7)                                                                                                | `pool`, `device` as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 19  | `Zfs.clearPool`            | Sets a pool's error counts back to zero and lets ZFS try a failed disk again                                                                                                                                                                                                                                                                   | Yes (clears the record of errors)              | No                                                                                   | No                                | Clear error counts (7.8)                                                                                        | `name` the pool pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Nineteen methods: seven reads (1 to 7) and twelve that change state. Captured examples are scrubbed
before commit (AGENTS.md rule 2): serial numbers and WWNs, and the by-id names built from them, in
device paths and inside the report; pool and dataset GUIDs; damaged-file paths; pool and file system
names that are personal are replaced by documentation names (`tank`, `media`).

### 12.2 Other methods, already in the contract

| Method                                                                                                        | Where                                                              | Status                                                          |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `DiskMgmt.getList`, `DiskMgmt.rescan`, `DiskMgmt.wipe`                                                        | flows, pages, the disk-use model                                   | Exist                                                           |
| `FileSystemMgmt.getList`, `FileSystemMgmt.enumerateFilesystems`, `FileSystemMgmt.enumerateMountedFilesystems` | the disk-use model, Used by, the File systems pages, the dashboard | Exist; `uuid` becomes nullable for ZFS rows **[verify]** (10.3) |
| `FsTab.getByFsName`                                                                                           | Used by (0.12)                                                     | Exists                                                          |
| `ShareMgmt.getList`                                                                                           | Used by, the delete refusals                                       | Exists                                                          |
| `MdMgmt.enumerateDevices`                                                                                     | the disk-use model, as before                                      | Exists                                                          |
| `EmailNotification.get`                                                                                       | the ZFS list's alerts line                                         | Exists; password omitted                                        |
| `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*`, `System.getInformation`                          | checkpoints, the band, tasks                                       | Exist                                                           |

### 12.3 ZFS methods this design deliberately does not use

- **Background twins of the reads**: `listPoolsBg`, `listPoolsOnlyBg`, `listDatasetsBg`,
  `getAllSnapshotsBg`; and `listPoolsOnly`, `listDatasets` (filters of `listPools`).
- **Other reads not needed**: `getPoolHealth`, `getPoolNames`, `getDatasetNames`, `getScrubPoolNames`,
  `getScrubStatus`, `getVdevRemovalStatus`, `getPoolHistory`, `getSnapshotDiff`, `getProperties` (the
  raw property list), `getAttachAnchors`, `getTopLevelVdevs`, `getStats`, `getArcStats`, `getSettings`.
- **Pool layout changes**: `expandPool`, `addVdev`, `removeVdev`, `cancelVdevRemoval`,
  `deviceAttach`, `deviceDetach`, `trimPool`, `upgradePool`.
- **Moving pools**: `importPool`, `exportPool`.
- **Other deletes**: `deleteObject` (the synchronous twin), `deleteSnapshotRange`,
  `deleteSnapshotRangeBg`.
- **File system tuning**: `renameObject`, `cloneDataset`, `promoteDataset`, and `addObject` for
  snapshots, volumes and clones; `pauseScrub`.
- **Encryption**: `enableEncryption`, `loadEncryptionKey`, `unloadEncryptionKey`,
  `changeEncryptionKey`, `getEncryptionStatus`, `setAutoUnlock`, `removeAutoUnlock`,
  `encryptRemoteKey`.
- **Scheduled jobs**: every `…SnapshotJob…`, `…ScrubJob…` and `…ReplicationJob…` method, and
  `getSshCertificates`.
- **Maintenance**: `doDiscover`, `doDiscoverBg`, `fixPackages`, `setSettings`.

---

## 13. Components

### 13.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component       | Why                                                                                                                                                | States to cover                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `TableGroupRow` | A heading row inside a table body, spanning its columns, for a pool's disk groups and classes (2.5): the group's words and its protection sentence | one group; several; a long heading at 320px; in the compact phone layout; read by a screen reader as a row header for the rows under it |
| `SizeField`     | A size limit: a number and a unit (GiB, TiB) side by side, one label, binary units, error and hint linked (4.2, 4.4)                               | empty, filled, invalid (below what it holds), disabled with reason, 320px and 200% zoom; the unit change keeps the number               |

The menu item's condition is in the app's navigation model (`when: "zfsPlugin"`), as RAID's is. No
new colour, token or colour variant: the slice uses the status, pending, destructive and neutral
families as they are, and the capacity meter's existing threshold pills. The colour audit is not
affected.

### 13.2 Reused as they are

The job-runner parts (`JobRunner`, `PreflightNotice`, `JobSummary` with `typedConfirmation`, the
several-names `typedMatches` and the `notice` slot, `JobStepList`, `JobResult`, `JobFailure`,
`AlsoPendingPrompt`), `ConfirmDialog` (default and destructive), `TypeToConfirmField`,
`RadioGroupField` with groups, `CheckboxListField` with groups, `CheckboxField`, `TextField`,
`UsedByPanel`, `Breadcrumbs`, `Card`, `FactList`, `StatusPill` and `rollUp`, `CapacityMeter` (with its
compact form and threshold pill), `ProgressBar`, `EmptyState`, `InlineAlert` (with `icon="warning"`),
`FormAlert`, `Table*`, `TableSkeletonRows`, `Disclosure`, `ExternalLink`, `Identifier`, `CopyButton`,
`TaskLog`, `Skeleton`, `Button` (with `loading`), the task announcer and the Tasks menu; and from the
app, Flow A's step runner, its erase lines and its handover card.

### 13.3 In the app

Pure functions, each tested by itself:

- `parsePoolReport(text)` (0.3, 0.4): the device tree (groups, classes, disks with state and error
  counts, `was` paths, `replacing` and `spare` pairs), the `scan:` line (check or rebuild, running,
  paused, finished, stopped; percentage and time left; what it repaired), the `errors:` count; or
  "not parsed". Tested on every captured report and on hostile text (a pool named like a section
  header, a path with spaces, 1000 lines of damaged files, right-to-left names).
- `poolState(row, report, devices)` (0.3): the state, its reason key and progress; Unknown for
  anything unrecognised.
- `matchDisks(report, poolDevices, disks)` (0.4): each report entry with its path and its OMV disk, or
  "not known".
- `layoutWord`, `protection(groups, missing)`, `usableSize(layout, sizes)` (0.5).
- `poolNameProblems(name, pools)`, `fsNameProblems(name, rows)` (0.7), and the address validators.
- `zfsChoices(candidates, disks, inputs, session, minSize)` (0.8): the groups and reasons, built on
  `diskUse` and its new `zfs` use; fail-closed on missing or implausibly empty inputs.
- `poolRefusals`, `fsRefusals`, `snapshotRefusals`, `deviceRefusals` (0.10).
- `fsUsedBy(row, rows, fileSystems, shares, entry)` (0.12).
- `groupZfsForStorageCard(mounted)` (10.1).
- The create, add, replace and delete plans: from the choices and the reads, the ordered steps, the
  summary items and the expected dirty set for R10.

The session store gains: the pools this session created and what it did on them (for 1.6 and 0.9's
mark), the disk handed to the replace flow, the check this session started, and the registry ids of
the flows. Cleared at sign-out with the task registry; nothing touches browser storage (UI-13).

---

## 14. Mock scenarios to add

Built from scrubbed captures where the VM can show them (section 15); hand-written ones say so.

| Method                                                                          | Scenarios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Zfs.listCompressionTypes`                                                      | the list (captured); the 404 (written from OMV's reply for an unknown service, as the RAID one was)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Zfs.listPools`                                                                 | none (captured); a mirror of two with `data` (captured); RAID-Z1 of three, RAID-Z2 of four, a single disk, a stripe of two (captured); a pool with a spare (captured); a degraded mirror (captured, a disk offline and one detached by hand); rebuilding (captured); being checked, paused (captured); a nearly full pool (captured, filled to 85%); an encrypted, locked file system (captured, made in the classic interface); a volume (captured); a clone (captured); nested file systems (captured); a file system with no folder (captured); `state` `UNKNOWN` (hand-written); twenty pools; names 64 characters long, right-to-left, looking like markup (hand-written, within 0.7's patterns, and outside them)                                                                                                                                                                                                                          |
| `Zfs.getObjectDetails`                                                          | one report per pool scenario above (captured where possible), including RAID-Z3 of five and a pool with several groups, logs, cache and special (hand-written in ZFS's format); damaged files (hand-written); a report that cannot be parsed; an error; a file system's properties (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Zfs.getPoolDevices`                                                            | per pool scenario; an empty reply for a listed pool (hand-written, the fail-closed case)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Zfs.getPoolStatus`                                                             | none; one per pool scenario; an empty reply while ZFS file systems exist (hand-written)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Zfs.getAllSnapshots`                                                           | none; a few (captured); 500 on one file system (hand-written); a snapshot a clone was made from (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Zfs.getEmptyCandidates`                                                        | the VM's empty scratch disks (captured); none; one too small (hand-written); an error                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Zfs.addPool`                                                                   | each layout on the VM's disks (captured); refused because a disk is in use (captured); a name ZFS refuses (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Zfs.addObject`, `Zfs.setProperties`                                            | created (captured); a name taken (captured); a limit below what it holds (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Zfs.quickSnapshot`, `Zfs.rollbackSnapshot`                                     | taken, rolled back (captured); rollback refused for an older snapshot (captured); two snapshots in one second (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Zfs.deleteObjectBg`                                                            | snapshot, file system, pool deleted (captured, with the task's output); refused while shared, with children, with a clone (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Zfs.scrubPool`, `Zfs.stopScrub`                                                | started, stopped, continued (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Zfs.deviceReplace`, `deviceOffline`, `deviceOnline`, `clearPool`               | each (captured); replace with a disk too small (captured); offline refused with no copy left (captured)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| The mock's memory                                                               | As the RAID mock's: it remembers creates, file systems, snapshots, replacements, checks and deletes, with ZFS's work moving on at each read (a tenth more of a check or rebuild per report), so the journeys of sections 3, 4, 5, 7, 8 and 9 can be walked on `pnpm dev:mock` and in the browser test. Built as `zfsScenarios.ts` over the file-system mock's disks and file systems; its reports are written line by line in ZFS's format and read by the same parser as the captures. Named stories: `zfsNone`, `zfsMirror`, `zfsRaidz1`, `zfsRaidz2`, `zfsRaidz3`, `zfsSingle`, `zfsStripe`, `zfsSpare`, `zfsDegraded`, `zfsRebuilding`, `zfsChecking`, `zfsPaused`, `zfsErrors`, `zfsDamaged`, `zfsUnusable`, `zfsFull`, `zfsLocked`, `zfsVolume`, `zfsClone`, `zfsNested`, `zfsGroups`, `zfsStateUnknown`, `zfsReportFails`, `zfsEmptyDevices`, `zfsMany`, `zfsHostile`, `zfsNoPlugin`, `zfsBroken` (the plugin installed, ZFS not working) |
| `FileSystemMgmt.getList`, `enumerateFilesystems`, `enumerateMountedFilesystems` | ZFS rows with `uuid` `null` (captured) alongside the existing ones                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `System.getInformation`, `Config.*`                                             | the flows: nothing pending; the four pending; the four and `zfscron`; those and `nfs` (R10); apply failed half way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 15. Checks before calling it done, and what only real hardware shows

### 15.1 On the mock, and in every build

- Both themes; greyscale; deuteranopia and protanopia emulation. Every state keeps its word and icon
  shape: Critical (degraded, unusable, damaged files, a disk failed), Warning (copying, a disk's
  errors, nearly full), OK, Unknown (hollow ring). The role words are words. The only red controls
  are "Erase {{count}} disks and create pool", "Erase disk and replace", "Roll back", "Delete
  snapshot", "Delete file system", "Delete pool" and "Take offline", each with its verb.
- 320 CSS px and 200% zoom: the tables scroll inside their named frames only; the group rows and the
  progress bar wrap; the summary facts stack; device paths, serial numbers and long names break safely;
  the typed fields and their targets wrap.
- Keyboard-only: the list (1.8), a pool's page (2.8), the create flow (3.8), adding a file system, a
  file system's page, the snapshot dialogs, the replace flow, the offline, online, clear, check and
  delete dialogs (9.3).
- Screen reader hears: loading of each page; "Read at"; a state change from a poll, once; each flow
  step and a failure (assertively) and the result; the dialogs' titles with their consequences; a
  snapshot taken. It does not hear the percentage move.
- In the network panel: no ZFS read but `listCompressionTypes` outside the ZFS pages, the Disks pages
  and the flows (and `getPoolStatus` on the dashboard, if agreed); no `getEmptyCandidates` outside the
  create and replace flows; no state-changing call before its confirmation and re-reads; no poll while
  nothing is busy, and none while the tab is hidden; every poll carries `updatelastaccess: false`; with
  the 404 scenario, no ZFS call after the first and no ZFS item in the menu; nothing at all for a
  normal user.

### 15.2 On the test VM

The VM (OMV 8.6.1) has `openmediavault-zfs` with its kernel module built on the VM (DKMS), four empty
8 GiB scratch disks `sdb`, `sdc`, `sdd` and `sde`, the data file system `sda1` on `sda`, and the system
disk `nvme0n1`. A snapshot is taken first, and everything is put back afterwards: no pool, nothing left
pending, every scratch disk wiped (`wipefs -n` empty), `sda1` the only file system under `/srv`. The
contract is written only after the owner has cleared section 12's list; the captures come first, with
the capture tool, read-only methods before state-changing ones.

1. **With no pool**: `listCompressionTypes`, `listPools`, `getPoolStatus`, `getEmptyCandidates`
   captured; the plugin version and ZFS's own version noted (the plugin's reads use the status
   command's JSON form, which needs OpenZFS 2.3 or later); the classic menu's position of ZFS
   (11.2); **`FileSystemMgmt.getList` and `enumerateFilesystems` still pass the contract** (10.3).
2. **A mirror of `sdb` and `sdc` with `data`** through the classic interface first, for captures:
   `listPools`, the report, `getPoolDevices`, `getPoolStatus`; `FileSystemMgmt.getList`'s ZFS rows
   (`uuid`, `devicefile`, `devicefiles`, `propfstab`, `propresize`); `dirtyModules` after `addPool` and
   after `addObject`; the pool row's `size` against the pool's own folder's `used + available` (0.2);
   the usable size against 0.5. Then delete it there, and capture what the disks look like after
   (0.8: offered again, or Erase and reuse).
3. **Disk reads** (0.6): `/proc/diskstats` of the members, of `sda` and of `nvme0n1`, before and after
   each read method, with the pool idle, and again after exporting and importing the pool (by hand,
   test only) to start with ZFS's memory of the pool empty. The result decides P14.
4. **The create flow** (section 3) with each layout the VM's four disks allow: Mirror of two with
   `data`; RAID-Z1 of three; RAID-Z2 of four; No protection on one disk, and on two (never preselected,
   including after "Change choices"; the warning before the typed field). Time `addPool` and the
   checkpoint; capture each report. RAID-Z3 needs five disks and stays on the mock.
5. **Names**: a reserved word, a system folder, a name taken, a 32-character name; what ZFS itself
   says about each.
6. **File systems** (section 4): add `media` with a limit; change the limit and compression; a limit
   below what it holds; the classic shared-folder form's words for the file system (3.6); a shared
   folder on it, then the delete refusal (9.1).
7. **Snapshots** (section 5): take two; roll back to the newest; the server's refusal for the older;
   delete each (and `dirtyModules` after); two in one second; whether `.zfs/snapshot` is reachable
   through an SMB share (5.1); the order of `getAllSnapshots`'s rows.
8. **Check** (section 6): start, the progress text in the report, stop, continue after a pause made in
   the classic interface, run to the end; the finished line's forms.
9. **Replace and Flow F** (sections 7, 8): on the mirror, replace a working `sdc` with `sdd` (the
   pool stays protected; capture the `replacing` tree and the rebuild); take a disk offline, capture,
   bring it back; detach a disk at the hypervisor for a missing disk, capture `UNAVAIL` and the `was`
   path, then replace it with the same disk under Erase and reuse; inject errors by hand (test only)
   for "Working, with errors", then clear them; whether an offlined disk keeps its place after a
   restart with the disk swapped (8.3).
10. **Degraded and unusable**: a RAID-Z1 with one disk detached, then two, capture; reconnect and
    restart (2.4's Unusable case).
11. **Delete** (section 9): a file system, then the pool; capture each task's output and `dirtyModules`
    (`zfscron`); the disks afterwards.
12. **The disk-use model** (10.2): with a pool, the Disks page shows "Part of ZFS pool", the wipe is
    refused, Flow A and the RAID create flow do not offer the pool's disks; with the pool exported by
    hand, what the Disks page shows.
13. `pnpm test:browser:vm` with the scratch disks named in the environment, over HTTP and HTTPS, with
    the destructive journeys of sections 3, 5, 7 and 9 on the scratch disks only.

### 15.3 Only on real hardware

These cannot be seen on the VM, whose virtual disks do not sleep, do not fail and are tiny. They are
stated, not claimed, until observed on a real NAS (the owner's own server stays read-only, ground rule
2 of [07](../07-implementation-plan.md)):

- Whether `listPools`, `getAllSnapshots`, the reports, `getPoolDevices` and `getPoolStatus` wake a disk
  that has spun down (0.6), and so whether the dashboard's once-per-visit read is acceptable.
- A real disk failure: how ZFS marks a disk that returns read errors (errors, then Failing, then
  Failed), and what the report shows before and after; a disk that disappears from the bus in use.
- Hot-swapping a disk in a bay, and whether the new disk appears without "Look for new disks".
- Check and rebuild times on multi-terabyte disks; what "to go" says over hours; the poll over a
  night (and the idle timeout signing the reader out, as designed).
- USB disks left out by the plugin, with a real enclosure.
- Disks of different sizes in one group (0.5's estimate), and 512-byte-sector disks with the fixed
  4 KiB block size (D12).
- The email ZFS sends when a disk fails, with email and the plugin's alerts on.
- The kernel module failing to build after a kernel update (0.11's last case).

---

## 16. Adversarial pass

### 16.1 Trying to break it

| Probe                                                                                          | Finding                                                                                 | Design response                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a pool that includes the system disk or `sda`                                           | ZFS would refuse a disk in use, but the plugin's list is not the interface's only guard | Not offered: the disk-use model refuses both whatever the plugin says (0.8); re-checked at step 1                                                                                                                                           |
| A disk the plugin offers that the interface sees as a RAID member or another pool's            | The two lists disagree                                                                  | The stricter wins: not offered, with the reason (0.8)                                                                                                                                                                                       |
| `getPoolStatus` or `getPoolDevices` answers empty after a read error on the NAS                | The model would think no disk is in a pool                                              | An empty reply that contradicts another read is a failed read; fail closed (0.8, D10)                                                                                                                                                       |
| **Two tabs create pools on the same disks**                                                    | No lock on the server                                                                   | Each tab's step 1 re-reads; once the first pool exists its disks are "Part of ZFS pool" and the second stops. In the seconds between, ZFS refuses the second create because the disks are in use. Stated; no data of the owner's is at risk |
| **Disks renamed** between the summary and step 1                                               | A different physical disk could be overwritten                                          | Serial number and model compared at step 1; the stable by-id name is what the server receives (0.8)                                                                                                                                         |
| A pool named `etc`, `srv`, `mirror` or `log`                                                   | Its folder would sit on a system folder, or ZFS would refuse it                         | Refused by 0.7's rules, with the reason, before Continue                                                                                                                                                                                    |
| A pool named like an existing one, differing in case                                           | Two pools `Tank` and `tank` confuse the reader                                          | "There is already a pool called {{name}}" compares without case                                                                                                                                                                             |
| 200-character names, right-to-left names, `<img onerror>` names made in the classic interface  | Layout, UI-2                                                                            | Outside 0.7's patterns: no page, the name as text with "Manage it in the classic interface"; within them: text nodes, `dir="auto"`, wrapping, markup shown literally                                                                        |
| The pool row's `devices` field                                                                 | It carries a markup line break                                                          | Not used; devices come from `getPoolDevices` (0.2)                                                                                                                                                                                          |
| `/storage/zfs/fs/tank/../../rpc.php`, `/storage/zfs/pools/-rf`, `/storage/zfs/fs/tank%2Fmedia` | URL as an identifier                                                                    | Patterns reject them; not-found state; no call (0.7)                                                                                                                                                                                        |
| `/storage/zfs/pools/tank/replace` from a bookmark                                              | Could preselect and erase a disk                                                        | The disk to replace is chosen in memory only; the new disk is never preselected unless it is the only one, and the typed confirmation stands                                                                                                |
| **Stripe chosen by mistake**, or one disk with the only layout it allows                       | Losing the disk loses everything                                                        | Never preselected, grouped apart under "Not protected", last; the loss in its hint and again before the typed field; Change choices clears it (3.2, 3.3)                                                                                    |
| Replace a working disk with a smaller one                                                      | ZFS refuses after the new disk was erased                                               | Not offered: Too small (0.8), before anything is erased                                                                                                                                                                                     |
| Replace the only disk of a single-disk pool that has failed                                    | Nothing to rebuild from                                                                 | Not offered, with "Its files are already lost" (7.1)                                                                                                                                                                                        |
| Take offline the last good disk of a mirror                                                    | The pool would stop                                                                     | Not offered when the group cannot lose another disk; ZFS refuses too (7.7)                                                                                                                                                                  |
| Roll back while people are using a shared folder on it                                         | Their files change under them                                                           | Said in the dialog before the typed field (5.4)                                                                                                                                                                                             |
| Roll back to an older snapshot                                                                 | The server would refuse; if it were asked to force, it would delete the newer ones      | Offered on the newest only; the contract has no way to force it (5.4, 12)                                                                                                                                                                   |
| Delete a file system that a shared folder uses                                                 | The shared folder would point nowhere                                                   | Refused by the interface and by the plugin; re-checked on confirm (9.1)                                                                                                                                                                     |
| Delete a file system whose snapshot another one was cloned from                                | The plugin refuses with a message naming the clone                                      | Refused before the dialog, with the clone named (9.1)                                                                                                                                                                                       |
| Delete a pool with file systems                                                                | The plugin refuses                                                                      | Refused first, each file system named with its link (9.2)                                                                                                                                                                                   |
| Delete a pool, then regret it                                                                  | Nothing restores it                                                                     | Typed confirmation naming every disk; "cannot be undone" (9.2)                                                                                                                                                                              |
| A deletion leaves four modules pending                                                         | The band would puzzle the reader, and Undo cannot bring the object back                 | The deletion refuses to start while anything else is pending, and applies its own changes after (0.9, P15)                                                                                                                                  |
| Apply fails half way at a checkpoint (B3)                                                      | Some modules deployed, some not                                                         | "Try again" first; the changes stay in the band; no "Undo" (3.7)                                                                                                                                                                            |
| Another administrator saves a change during a flow                                             | It would ride the checkpoint                                                            | R10 lists it and asks                                                                                                                                                                                                                       |
| Another administrator deletes the pool in the classic interface during the replace flow        |                                                                                         | Step 1's re-read: the pool is gone; nothing is erased                                                                                                                                                                                       |
| A poll during a 2-day rebuild                                                                  | Could keep the session alive forever                                                    | Background reads with `updatelastaccess: false`; the idle timeout signs out (UI-14); the rebuild goes on                                                                                                                                    |
| A poll on a healthy, idle NAS                                                                  | Would read for nothing                                                                  | Never: the poll runs only while a check or rebuild is under way (0.6)                                                                                                                                                                       |
| The report's form changes in a newer ZFS                                                       | Words not recognised                                                                    | Unknown, with the server's words; every action unavailable (0.3, 0.4)                                                                                                                                                                       |
| The plugin is removed while a ZFS page is open                                                 | 404 on the next read                                                                    | The page switches to 0.11's state                                                                                                                                                                                                           |
| The plugin is installed and ZFS's kernel module did not build                                  | Every read fails                                                                        | The pages show the server's words; the File systems page and the dashboard show the file systems as Missing (0.11)                                                                                                                          |
| A ZFS file system not known to OMV appears under "Found on the disks"                          | Mounting it there would give it a second folder                                         | ZFS rows are left out of that section, with the Discover line (10.3)                                                                                                                                                                        |
| Thousands of snapshots from a schedule                                                         | A long read and a long table                                                            | Client-side pages of 50; **[verify]** the read's time (12, item 6)                                                                                                                                                                          |
| A shared screenshot of the technical details                                                   | Damaged-file paths and disk serial numbers on screen                                    | Shown only on request; never stored, titled, toasted or logged (2.7)                                                                                                                                                                        |
| Press "Delete pool" or "Roll back" twice                                                       | Two calls                                                                               | Buttons ignore presses while their call runs; the session registry refuses a second action on the same pool                                                                                                                                 |
| 0 pools; 1; 20; a pool of 30 disks in 6 groups                                                 |                                                                                         | 1.7's empty state; tables not paged but in their own frames; group rows (13.1)                                                                                                                                                              |
| A normal user types any ZFS address                                                            | Refused methods                                                                         | "Only administrators" page, no call (11.1)                                                                                                                                                                                                  |

### 16.2 Without sight

| Probe                   | Requirement                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab through each page   | The orders in 1.8, 2.8, 3.8, 9.3; skip link first (shell)                                                                                                                                                                             |
| The state               | Every state is a word and an icon shape; the reason is text next to the pill, not a tooltip; progress has `aria-valuetext` with the percentage and the time left in words                                                             |
| A poll                  | A change of state is announced once, politely; the moving percentage is not announced; focus never moves                                                                                                                              |
| The disk tree           | Group rows are row headers for the rows under them, so each disk is read with its group ("Mirror, 2 disks: sdb, Working")                                                                                                             |
| The disk choice         | Each option reads device, model, size, then the serial number and what is on it, before it is chosen                                                                                                                                  |
| The typed confirmations | The prompt is the field's label; the reason the button is unavailable is its hint; the consequence is read before the field                                                                                                           |
| The steps               | An ordered list; each step's state is a word; changes polite, a failure assertive with focus moved to it                                                                                                                              |
| Colour                  | Critical, Warning, OK and Unknown differ by word and shape; the role words are words; destructive buttons differ by words and icon, not only colour; the "No protection" warning has the warning shape and words on a neutral surface |
| 200% zoom               | One column; tables and the report scroll in their own frames only                                                                                                                                                                     |

---

## 17. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID  | Decision                                                                                                                                                                                                              | Why                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The menu item is **"ZFS"** under Storage, after RAID, one item for pools, file systems and snapshots, shown only with the plugin installed _(recommended)_                                                            | Q8; "ZFS" is what owners search for; the classic interface's eight sub-pages are one journey here (pool, then file system, then snapshots)                             |
| D2  | **Four nouns**: pool, file system, volume, snapshot; "the pool's own folder" for the root dataset; "disk group" only when there is more than one; never "dataset" or "vdev" outside technical details _(recommended)_ | "File system" is the word the File systems pages already use for the same thing to an owner; the others need ZFS knowledge                                             |
| D3  | A pool's page is addressed by its **name**, a file system's by its **full name** as the rest of the address, each part validated; the disk handed to the replace flow is passed **in memory** _(recommended)_         | ZFS names are what every ZFS tool and the classic interface use; they are chosen by the owner, not hardware identifiers; a bookmark must never choose a disk           |
| D4  | **Degraded (even while rebuilding) is Critical; copying onto a disk that was working, a disk's errors and being 80% full are Warning; a check is OK** _(recommended)_                                                 | As the RAID slice's D4; a disk's errors need watching, not alarm                                                                                                       |
| D5  | **"It can lose" is said in words** for every pool, group and choice, with usable space in "about" figures _(recommended)_                                                                                             | As RAID's D6                                                                                                                                                           |
| D6  | **Space for files comes from the pool's own folder**, not the pool row's raw size _(recommended)_                                                                                                                     | For RAID-Z the raw size counts parity, which no file can use                                                                                                           |
| D7  | **Fixed levels for how full a pool is**: Warning at 80%, Critical at 95% _(recommended)_                                                                                                                              | ZFS's own advice and behaviour: it slows down past 80% and keeps a few percent back near the top                                                                       |
| D8  | **Each disk's role is read from ZFS's report** and its path from `getPoolDevices`; anything that cannot be matched fails closed _(recommended)_                                                                       | No single method gives both; replacing the wrong disk is the costliest mistake in this slice                                                                           |
| D9  | **The last check is read from the report**, not from the plugin's `lastscrub` _(recommended)_                                                                                                                         | The plugin reports the end of a rebuild as the last check                                                                                                              |
| D10 | **An empty reply that contradicts another read is a failed read** _(recommended)_                                                                                                                                     | The plugin answers some failures with an empty list; the disk-use model must not take that for "no pools"                                                              |
| D11 | Pools get **compression on (LZ4)** _(recommended)_                                                                                                                                                                    | The plugin's guide calls it free; it is the classic form's choice too, though off there by default                                                                     |
| D12 | Pools get **4 KiB blocks** (`ashift` 12), disks **by stable ID**, **case-sensitive** names, and creation is **never forced** _(recommended)_                                                                          | The plugin's guide advises 12 for current disks; IDs survive restarts; the rest of the NAS is case-sensitive; forcing would overwrite what the interface did not check |
| D13 | **The plugin's default folders** (`/{{pool}}`, `/{{pool}}/{{name}}`), with system folder names refused as pool names _(recommended)_                                                                                  | Matches the classic interface and the guide; a custom folder is classic-only                                                                                           |
| D14 | **One disk group per pool** at creation; pools with several groups are shown in full _(recommended)_                                                                                                                  | The plugin's create makes one; adding groups is a layout change for good (P2)                                                                                          |
| D15 | **File systems at the top of a pool only**, with **size limit and compression** as their only settings _(recommended)_                                                                                                | The two settings an owner asks for; nesting and tuning are classic-only                                                                                                |
| D16 | **Volumes and encryption are shown, not managed** _(recommended)_                                                                                                                                                     | Volumes serve virtual machines and iSCSI, outside this domain; keys are secrets with their own storage choices (UI-6)                                                  |
| D17 | **Snapshots are taken with the NAS's own date-and-time name** (`quickSnapshot`), not a custom name _(recommended)_                                                                                                    | The named method marks four modules pending for a snapshot; the dated one marks nothing, and the name then tells when it was taken, which the reply does not           |
| D18 | **Roll back only to the newest snapshot** _(recommended)_                                                                                                                                                             | ZFS refuses older ones without deleting the newer; offering a button that always fails would mislead                                                                   |
| D19 | **No pause button**; a paused check can be continued or stopped _(recommended)_                                                                                                                                       | Three buttons for one job is two too many; a pause comes from a schedule or the classic interface                                                                      |
| D20 | **A check and a rebuild are not tasks** in the Tasks menu; they are the pool's state _(recommended)_                                                                                                                  | As RAID's D20: they run in ZFS, have no task handle, and survive sign-out and restarts                                                                                 |
| D21 | **The plugin's reads are made directly, not through their background twins** _(recommended)_                                                                                                                          | Each is expected to answer in seconds **[verify]**; a task per read would fill the Tasks menu                                                                          |
| D22 | The dashboard's **Storage card shows one item per pool** for ZFS file systems _(recommended)_                                                                                                                         | Every file system of a pool reports the pool's free space as its own                                                                                                   |
| D23 | Catalogue: `zfsLayout.*`, `zfsRole.*`, `zfsState.*`, `zfsProtect.*`, `zfs.term.*` as shared keys; `modules.zfs`, `modules.zfszed`, `modules.zfscron`; the type word `zfs` "ZFS" _(recommended)_                       | Several pages use them                                                                                                                                                 |

---

## 18. For the owner to agree

The clearance question, the scope, and the destructive, irreversible and protection-reducing points of
this slice. The design is built only once these are agreed.

1. **P1, the methods.** None of the plugin's methods is cleared yet. Section 12.1 lists the nineteen
   this design needs, each with what it does, whether it changes state, what it marks pending and
   whether it is a task; 12.3 lists the ones it does not use. Nothing is written into the contract
   until the owner has answered which may be used. (12)
2. **P2, the scope.** Built here: pools (list, page, create with one group), file systems at the top
   of a pool (create, page, size limit, compression, delete), snapshots (take, roll back to the newest,
   delete), checks (start, stop, continue), replacing a disk and Flow F, taking a disk offline and
   back, clearing error counts, deleting a pool. Left to the classic interface: import and export,
   adding or removing disk groups, spares, caches, logs and metadata disks, growing RAID-Z, attaching
   and detaching, nested file systems and their tuning, renaming, cloning, volumes, encryption,
   scheduled snapshots, checks and replication, range deletes, pausing, TRIM, upgrading, Discover,
   memory settings. (Scope)
3. **P3, what creating a pool or replacing a disk may erase.** Both overwrite the disks they are given.
   Offered only are disks that both the plugin's list and this interface's disk-use model allow; the
   stricter wins. Disks that hold something appear under "Erase and reuse" with what is on them, and
   get a quick wipe first. Refused, and listed with the reason: the system disk, read-only disks, disks
   with a file system in use, set up or being created, swap, RAID members, disks in a ZFS pool, disks
   being wiped, USB disks, disks smaller than the one replaced, and every disk when a check could not
   run or a reply was implausibly empty. (0.8)
4. **P4, the layouts offered and the default**, following the owner's RAID decision: under
   "Protected", Mirror (the default), Parity (RAID-Z1), Double parity (RAID-Z2), Triple parity
   (RAID-Z3); under "Not protected", last, **No protection (stripe)** for one disk or several, never
   preselected, its loss in its hint and repeated in the summary before the typed confirmation. Each
   says what it can lose and about how much space it gives (minimums 2, 3, 4, 5, 1). One group per
   pool; compression on, 4 KiB blocks, stable disk IDs, case-sensitive names, never forced, the
   plugin's default folder. (3.2, D11 to D14)
5. **P5, names.** New pool names: 1 to 32 letters, digits, hyphens or underscores, starting with a
   letter; not ZFS's reserved words; not a system folder's name (the pool's folder is `/{{name}}`); not
   one in use. New file system names: 1 to 64 letters, digits, hyphens, underscores or full stops,
   starting with a letter or digit. Existing objects whose names fall outside the address patterns get
   no page. (0.7)
6. **P6, creating continues into a first file system.** By default the create flow also makes a file
   system called `data` (editable) and saves both at one checkpoint, under one typed confirmation of
   every device name, then hands sharing to the classic interface as Flow A does. It can be unticked.
   (3.2 to 3.6)
7. **P7, snapshots.** Taking one needs no confirmation and is named by the NAS's date and time.
   Rolling back is offered only to the newest snapshot, in a red dialog that says every change since
   is lost and warns when shared folders use the file system, with the file system's name typed.
   Deleting a snapshot is a red dialog with the snapshot's name typed (UI-8: it destroys the old
   versions it keeps). No range deletes, no schedules here. (section 5)
8. **P8, deleting a file system.** Everything in it and all its snapshots are lost. Refused while
   shared folders or anything else use it, while file systems or volumes are inside it, while a clone
   depends on it, while it is locked, and when the check could not run. A red dialog with its full name
   typed. The pool's own folder cannot be deleted this way. (9.1)
9. **P9, deleting a pool.** Offered only once only its own folder is left (the plugin refuses
   otherwise); refused while shared folders or anything else use its own folder, while it is locked,
   and when the check could not run. A red dialog naming every disk, with the pool's name typed. Its
   disks are cleared of the pool's marks, not overwritten. (9.2)
10. **P10, replacing a disk, and taking one offline.** Replacing erases the new disk: a summary naming
    both disks, the new disk's device name typed, everything re-checked first; offered for any disk of
    a Mirror or RAID-Z group, and for a working disk of a single-disk or striped pool. Taking a working
    disk offline (to swap it in a full bay) is a red dialog without typing, because nothing is erased
    and it is undone by "Bring back"; it is refused when the disk's group could not lose another disk.
    Bringing a disk back and clearing error counts are plain confirmations. No apply is needed for
    any of these. (section 7)
11. **P11, no way round a refusal.** A refused action offers no classic link that does the same without
    the check; the links lead to removing the blocker on this interface's pages. Where the blocker is
    something this interface does not manage (a volume, a clone, a locked file system), the refusal
    says to deal with it in the classic interface, without a link that could be taken for a way round.
    (0.10)
12. **P12, checks.** "Check now", "Stop checking" and "Continue checking" are plain confirmations that
    say a check wakes the disks and keeps them busy for hours. Refused while the pool is Critical,
    Unknown or rebuilding. No pause. (section 6)
13. **P13, the one poll.** While a pool on the ZFS list or its own page is being checked or rebuilt,
    the page re-reads every 30 seconds, as a background read that keeps no session alive and stops when
    the tab is hidden; it never runs on an idle NAS. The same rule as RAID's P9. (0.6)
14. **P14, reads that may touch disks, and the two light reads.** The ZFS reads are made only on the
    ZFS pages, the Disks pages and the flows. Whether the plugin is installed is decided by
    `listCompressionTypes`, which reads nothing. The dashboard reads `getPoolStatus` once per visit,
    for its attention rows, **only if the VM shows it reads no disk**; otherwise the dashboard has no
    ZFS rows, as for RAID. (0.6, 0.11, 10.1)
15. **P15, pending changes.** The create and add flows apply their own changes at a named checkpoint,
    after refusing to start while anything else is pending (Q2). Deleting a snapshot, a file system or
    a pool also refuses to start while anything else is pending, and applies what it left pending
    right after, because the plugin marks four modules for each deletion and Undo cannot bring the
    object back. Size limit and compression go to the band, as any setting. (0.9)

---

## 19. What the test VM is expected to show, and what would change this design

Nothing has been observed yet (section 15.2 is the plan). These assumptions carry the most weight; if
the VM shows otherwise, the build follows the VM and this section records each change, as the RAID
slice's section 19 does.

| #   | Assumption                                                                                                                                       | If it does not hold                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `FileSystemMgmt.getList` returns ZFS rows with `uuid` `null`, and the existing pages can be made to accept it by widening the contract           | The File systems pages need a ZFS-specific path before this slice ships; until then they would fail on any NAS with a pool                              |
| 2   | ZFS's status commands read no disk; the listing commands usually do not                                                                          | P14 decides the dashboard's rows; if even the status commands read a disk, the disk-use model's reads move to the pages about disks only, as RAID's did |
| 3   | The report's text follows ZFS's usual layout (indented tree, `scan:` and `errors:` lines), and `getPoolDevices` names match the report's         | The parser is rewritten against the captures; until it passes, every device action fails closed                                                         |
| 4   | `addPool`, `addObject` and `deleteObjectBg` mark exactly `fstab`, `collectd`, `monit` and `quota` (and `zfscron` for deletes that removed a job) | The expected sets of R10 change; nothing else does                                                                                                      |
| 5   | A deleted pool's disks come back as empty candidates, or as Erase and reuse                                                                      | 0.8's wording for those disks changes                                                                                                                   |
| 6   | `getAllSnapshots` answers in seconds with many snapshots                                                                                         | Its background twin is put to the owner (12.1, item 6)                                                                                                  |
| 7   | The plugin's reads answer in seconds on a NAS with several pools                                                                                 | The ZFS list reads the reports only on the pool pages, and shows the plugin's state words in the list                                                   |
| 8   | Applying the four modules after a pool is created succeeds, with ZFS's own mounts already in place                                               | The checkpoint's failure plan is extended with what the VM shows                                                                                        |

---

## 20. Changes during the build

The contract was written from captures on the test VM (OMV 8.6.1, openmediavault-zfs 8.1.4, OpenZFS
2.4.4; journal, 2026-11-22). Where the VM contradicted this design, the build follows the VM:

| #   | What the VM showed                                                                                                                                                  | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `FsTab.getByFsName` answers HTTP 400 for a ZFS file system's name                                                                                                   | What uses a file system is found by the folder its shared folders' mount entries name (0.12); the method is never called for ZFS. Deletes and roll-backs read the shared folders the same way                                                                                                                                                                                                                                                   |
| 2   | `Zfs.addObject` with a name that is taken answers 200 and changes nothing                                                                                           | The name is checked again from a fresh `listPools` just before the call, and the file system must be listed afterwards: otherwise "The NAS answered, but the pool does not list a file system {{name}}. It was not made." (3.7, 4.2). A name that appeared meanwhile stops the step with "There is now a file system or volume called {{name}} on {{pool}}"                                                                                     |
| 3   | A refused `addPool` (a reserved name) still wrote a partition table to its disk                                                                                     | After any create failure the flow says "ZFS can leave a partition table on the disks even when it refuses, so the disks may have been changed. They were checked again: choose again, and any that now hold something are offered under Erase and reuse." Its only ways on are "Change choices", which reads the disks again, and "Stop here"; it never retries the create                                                                      |
| 4   | A deleted pool's disks, and a disk replaced out of a pool, keep ZFS's GPT and are not candidates until wiped                                                        | They are offered under "Erase and reuse" with the quick wipe first (0.8, settled). The delete-pool confirmation and result say so; the replace result says the old disk keeps ZFS's marks                                                                                                                                                                                                                                                       |
| 5   | `compressratio` and `dedup` read "1.00"                                                                                                                             | Read without the "x" (0.2)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | During a replace, `getPoolDevices` gives the old and the new disk the group `replacing-1`                                                                           | One row, "{{new}} is taking the place of {{old}}" (0.4); no change is offered for either disk until the rebuild ends                                                                                                                                                                                                                                                                                                                            |
| 7   | Own-folder space against the base: mirror 90.8% of `s`, single disk 90.8% of `s`, stripe of 2 90.8% of `2s`, RAID-Z1 of 3 94.8% of `2s`, RAID-Z2 of 4 92.4% of `2s` | The estimate uses those shares, 90% for other RAID-Z counts, always "about", never more (0.5)                                                                                                                                                                                                                                                                                                                                                   |
| 8   | `lastscrub` carries a time zone ("… UTC 2026"); the scan line does not                                                                                              | The date comes from `lastscrub`, parsed and shown in this computer's format and time zone; the scan line says only whether it was a check or a rebuild (0.2)                                                                                                                                                                                                                                                                                    |
| 9   | The contract accepts only by-id device paths, and quotas in whole GiB or TiB                                                                                        | A pool whose disks ZFS names by kernel name or path cannot have its disks changed here: its page says "ZFS knows this pool's disks by names that can change, not by their stable IDs, so this page cannot change its disks. Disks of this pool are replaced, taken offline and brought back in the classic interface." with no link (P11), and offers no replace, offline or online (fail closed). A size limit is a whole number of GiB or TiB |
| 10  | — (the owner's rule for deletes)                                                                                                                                    | Every delete sends, as `mp`, the folder `listPools` reported for the object (`mountpoint`; empty for a snapshot), never one typed or derived here. Deletes refuse to start while other changes are pending, then apply their own (P15)                                                                                                                                                                                                          |

Other decisions taken while building, each within the agreed design:

- **The snapshot list's order.** `getAllSnapshots` lists snapshots in name order (captured). "Newest"
  is the last of a file system's snapshots in that order, which is the time order for the dated names
  this page gives. A snapshot named otherwise in the classic interface may not be the newest; ZFS then
  refuses the roll-back, and the dialog shows ZFS's words.
- **What to do now** offers "Check now…" beside "Clear the error counts…" through the check section's
  own dialog, so there is one confirmation for a check wherever it starts.
- **The dashboard** reads `getPoolStatus` once per visit, as P14 allows (the VM showed it reads no
  member disk). A pool's Storage item has no attention row for how full it is.
- **File systems** gains the line "{{count}} ZFS file systems are not known to OMV yet …" from
  `enumerateFilesystems` rows of type `zfs` that `getList` does not list, once the plugin is known to
  be installed; without the plugin, a ZFS row keeps the classic-interface sentence.
- **The disk-use model** reads `getPoolStatus` and each pool's `getPoolDevices` wherever it is read
  (Disks, a disk's page, the wipe, Flow A, the RAID and ZFS flows). A pool whose name the contract
  cannot send, or a pool with no disks in `getPoolDevices`, makes every disk "Not known" (D10). The wipe
  confirmation's untraceable-storage sentence drops "ZFS" once these reads succeed.
- **The menu item** stands after RAID and before File systems. The plugin's own menu entry has no
  position, so the classic menu places it by its own rule; this interface keeps the design's place.
- **The flows' page headings** name the task ("Create a ZFS pool", "Add a file system to pool
  {{pool}}", "Replace a disk in pool {{pool}}"), with the job runner's own heading under them; the
  create form says how many disks a layout needs in plain words, and says it as an error only after
  Continue.
- **At a phone's width** the pools list keeps Pool and State (a long pool name ends in an ellipsis; its
  full name is the link's name), a pool's file systems keep File system and State with what each holds
  under the name, and the snapshots keep Snapshot and the actions with what each holds under the name.
  Names do not break inside; pills never wrap.
- **The delete dialogs** keep showing their steps after the deleted object has gone from the list (a
  finished task reads every list again), and a pool being deleted is not read again, so its report is
  never asked for after it is gone.

New and changed catalogue keys beyond the copy tables above:

| Key                                                              | English                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zfsCheck.ago`                                                   | about {{duration}} ago                                                                                                                                                                                                           |
| `zfsCheck.afterRebuild`                                          | Not checked since a disk was rebuilt on {{date}}                                                                                                                                                                                 |
| `zfsCheck.notKnown`                                              | Not known                                                                                                                                                                                                                        |
| `zfsBlock.notById`                                               | ZFS knows this pool's disks by names that can change, not by their stable IDs, so this page cannot change its disks. Disks of this pool are replaced, taken offline and brought back in the classic interface.                   |
| `zfsPool.notById`                                                | This pool cannot have its disks changed here                                                                                                                                                                                     |
| `zfsCreate.cannot.noId`                                          | It has no stable ID, which ZFS needs to find it again after a restart.                                                                                                                                                           |
| `zfsCreate.fail.createParts`                                     | ZFS can leave a partition table on the disks even when it refuses, so the disks may have been changed. They were checked again: choose again, and any that now hold something are offered under Erase and reuse.                 |
| `zfsCreate.fail.fsNotListed`                                     | The NAS answered, but the pool does not list a file system {{name}}. It was not made.                                                                                                                                            |
| `zfsCreate.fail.fsTaken`                                         | There is now a file system or volume called {{name}} on {{pool}}, so a new one was not made. Choose another name on the pool's page.                                                                                             |
| `zfsCreate.holdsUnknown`                                         | No file system was found, but the disk is not empty: it may hold old partitions, or be part of a RAID array or a ZFS pool from another computer or one deleted here.                                                             |
| `zfsDelete.pool.disks`                                           | Its disks are cleared of the pool's marks. The files on them are not overwritten, only made unreadable; wipe a disk before you give it away. To use them again here, choose them under Erase and reuse, which erases them first. |
| `zfsDelete.blocked.sharedUnnamed`                                | The ZFS plugin says a shared folder uses it. Remove that shared folder first, in Shared folders.                                                                                                                                 |
| `zfsDelete.preflightBody`                                        | A deletion saves its own change straight after, and an undo cannot bring back what was deleted. Apply or undo the other changes first.                                                                                           |
| `zfsReplace.doneOldKept`                                         | It keeps ZFS's marks, so to use it again here, choose it under Erase and reuse.                                                                                                                                                  |
| `dashboard.storage.zfsPool`                                      | ZFS pool {{pool}}                                                                                                                                                                                                                |
| `dashboard.storage.zfsShare_one` / `_other`                      | {{count}} file system shares this space / {{count}} file systems share this space                                                                                                                                                |
| `dashboard.attention.zfsDegraded` / `zfsUnusable` / `zfsDamaged` | ZFS pool {{pool}}: a disk is missing or has failed. / ZFS pool {{pool}} cannot be used. / ZFS pool {{pool}} has damaged files.                                                                                                   |
| `filesystems.zfsLine`                                            | Part of ZFS pool {{pool}}. ZFS file systems are managed on the ZFS pages.                                                                                                                                                        |
| `filesystems.zfsUnknown_one` / `_other`                          | {{count}} ZFS file system is not known to OMV yet, … / {{count}} ZFS file systems are not known to OMV yet, for example ones made outside the NAS's pages. Add them with Discover in the classic interface.                      |
| `wipe.blocked.zfsDoPool`                                         | Replace it, or delete the pool, on the pool's page first.                                                                                                                                                                        |
| `wipe.holds.untraceableNoZfs`                                    | This NAS also has storage that this page cannot trace to a disk, such as encrypted disks or LVM. …                                                                                                                               |
| `addStorage.combineHintZfs`                                      | To combine several disks, use Combine disks (BTRFS), create a RAID array under RAID, or create a ZFS pool under ZFS.                                                                                                             |
