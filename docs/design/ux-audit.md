# UX audit of the stock workbench (openmediavault 8), from source

Status: agreed by the owner on 2026-11-20, with the answers in section 5 (journal entry of that date).
The flows below are the starting design for Phase 5; each is still designed in full against the style
guide, and agreed with the owner before building where it erases data (docs/07, Phase 5). Source
only: no browser, VM or server was used. OMV checkout at commit `babf50d9b`. Nothing in the checkout
was modified.

## How to read this

**Evidence marks.** `[S path]` means read from source at that path. `[I]` means inferred from source,
not yet seen running. Every `[I]` that a flow depends on is listed in section 6 for the test VM.

**Path short forms** (all under the OMV checkout):

| Short | Path |
| --- | --- |
| `W/` | `deb/openmediavault/workbench/src/app/pages/` (Angular page configs) |
| `WC/` | `deb/openmediavault/workbench/src/app/` (core and shared components) |
| `Y/` | `deb/openmediavault/usr/share/openmediavault/workbench/` (YAML: `route.d`, `component.d`, `navigation.d`, `mkfs.d`, `dashboard.d`) |
| `R/` | `deb/openmediavault/usr/share/openmediavault/engined/rpc/` (backend methods) |
| `M/` | `deb/openmediavault/usr/share/openmediavault/engined/module/` (what marks a module dirty) |
| `DM/` | `deb/openmediavault/usr/share/openmediavault/datamodels/` (method parameter schemas) |
| `T` | `deb/openmediavault/usr/share/openmediavault/templates/config.xml` (factory defaults) |
| `P/` | `deb/openmediavault/usr/share/php/openmediavault/` |
| `MD/` | `deb/openmediavault-md/usr/share/openmediavault/` (the RAID plugin, a separate package) |

**Counting rules.** "Pages" are distinct routed views. "Dialogs" are modal confirmations or task
windows. "Fields shown" counts the inputs a form defines, including ones that show only in some
cases (counted by field type in the page config). "Fields that matter" are the ones a typical owner has to
decide for this job; the rest can keep their defaults. "Saves" are separate save actions. "Applies"
are separate trips to the pending-changes banner.

---

## 0. The backend facts that shape everything

These come before the jobs because they decide which flows are possible.

| # | Fact | Evidence |
| --- | --- | --- |
| B1 | Saving writes the configuration database. Listeners mark *modules* dirty; nothing reaches the system until `Config.applyChanges` runs. | `[S M/samba.inc bindListeners]`, `[S M/fstab.inc]`, `[S R/config.inc applyChanges]` |
| B2 | Apply is global. With `modules: []` it deploys **every** dirty module, including changes saved by someone else or left over from an abandoned form. A `modules` list can restrict it. | `[S R/config.inc 92-226]` |
| B3 | If one module's deploy fails, the loop stops, the modules already deployed stay deployed, and the dirty list is **not** rewritten (it is written only after the loop). Revision files are kept. | `[S R/config.inc 194-222]` |
| B4 | Revert is global too. It restores the whole database to the last applied revision and clears the dirty list. It does not undo anything done immediately (see B5). | `[S R/config.inc revertChanges]`, `[S P/config/databasebackend.inc revert]` |
| B5 | Some saves act immediately, outside apply: creating a user runs the system account tool and sets the file-sharing password (`[S R/usermgmt.inc setUser]`, `[S M/samba.inc onAddUser]`); creating a shared folder creates its directory and sets its mode (`[S R/sharemgmt.inc set]`); wiping a disk and creating a file system are background tasks that act at once (`[S R/diskmgmt.inc wipe]`, `[S R/filesystemmgmt.inc create]`); unmounting applies the mount change by itself (`[S R/filesystemmgmt.inc umount, 1084]`). | as cited |
| B6 | Mounting is **not** immediate: `FileSystemMgmt.setMountPoint` only writes a mount entry and marks `fstab` dirty. | `[S R/filesystemmgmt.inc setMountPoint]`, `[S M/fstab.inc]` |
| B7 | A shared folder can only be created on a file system that is mounted now: `ShareMgmt.getCandidates` skips mount entries that are not mounted. | `[S R/sharemgmt.inc getCandidates 98-103]` |
| B8 | `ShareMgmt.set` itself does not check that the file system is mounted before creating the directory. | `[S R/sharemgmt.inc set]`; the effect on an unmounted target is `[I]` (V1) |
| B9 | Several "do it now" actions refuse while their module is dirty ("Please apply the configuration changes first."): run a backup job (`Rsync.execute`), run a scheduled task (`Cron.execute`), send a test email (`EmailNotification.sendTestEmail`), check for updates (`Apt.update`), copy an SSH key to another machine (`CertificateMgmt.copySshId`), show certificate details (`CertificateMgmt.getDetail`), empty a recycle bin (`SMB.emptyRecycleBin`). | `[S P/config/configdirtyexception.inc]`, `[S R/rsync.inc 285]`, `[S R/cron.inc 188]`, `[S R/notification.inc 357]`, `[S R/apt.inc 284]`, `[S R/certificatemgmt.inc 260, 629]`, `[S R/smb.inc 258]` |
| B10 | "Is this used?" is a yes/no only. `_used` comes from `Database::isReferenced`, which checks whether **any** object (core or plugin) holds a reference. Nothing returns *who* uses it. | `[S P/config/database.inc 458-470]`, `[S R/sharemgmt.inc 276]`, `[S R/filesystemmgmt.inc 217]` |
| B11 | Settings methods replace the whole object: every property is required (`SMB.setSettings` 12 of 12, `SMB.setShare` 19 of 20, `Rsync.set` 36 of 36, `WebGui.setSettings` 6 of 6, `Smart.setSettings` 5 of 5, `Smart.setScheduledTest` 9 of 9). The client must read, change and write back. | `[S DM/rpc.smb.json, rpc.rsync.json, rpc.webgui.json, rpc.smart.json]` |
| B12 | `FileSystemMgmt.create` returns task output, not the new file system's identifier. The new file system is reported by `enumerateFilesystems` with a `parentdevicefile`. | `[S R/filesystemmgmt.inc create, enumerateFilesystems]`; matching on it is `[I]` (V3) |
| B13 | The web server deploys after certificates (`nginx` `deployAfter` includes `certificates`), so one apply can create a certificate and switch to HTTPS. | `[S M/nginx.inc 38-41]` |
| B14 | `DiskMgmt.wipe` has no check that the disk holds a file system in use. The stock page disables Wipe only for the system disk and read-only disks. | `[S R/diskmgmt.inc wipe]`, `[S W/storage/disks/disk-datatable-page.component.ts enabledConstraints]` |

---

## 1. The common jobs

Ordered by how often a home or small-office owner meets them `[I]`. J9 was added because the source
shows it is where the missing dependency view hurts most.

| Job | What the owner wants | Kept / added |
| --- | --- | --- |
| J1 | First set-up: safe password, name, time, alerts, updates | kept |
| J2 | Add a new disk and share a folder on it with Windows and Mac computers | kept |
| J3 | Add a person who can reach a share | kept |
| J4 | Back up a shared folder (to another disk, or another machine) | kept |
| J5 | Check health and be told when something goes wrong (disks, space, updates) | kept |
| J6 | Update the system | kept |
| J7 | Turn on HTTPS | kept |
| J8 | Replace a failing disk | kept; splits by whether the RAID plugin is in use |
| J9 | Retire storage safely: stop sharing, unmount, reuse a disk | added |

Dropped: network interface set-up (rare after installation, and the connection risk deserves its own
design), plugins and containers (out of v1 scope per `docs/01-decisions.md`). The exceptions are the
RAID plugin (`openmediavault-md`) and the ZFS plugin (`openmediavault-zfs`), which version 1 supports
(Q8).

---

## 2. The stock sequences, counted

### J2 Add a new disk and share it (disk has old partitions; the person already exists)

| # | Where | Defined in | Fields shown / matter | Save | Apply |
| --- | --- | --- | --- | --- | --- |
| 1 | Storage > Disks: select the row, then the eraser icon (label only in a tooltip) | `[S W/storage/disks/disk-datatable-page.component.ts]` | – | | |
| 2 | Dialog: "Do you really want to wipe the device /dev/sdX? All data will be lost." | same, `onWipe` | 0 | | |
| 3 | Dialog: choose "Quick" or "Secure", no explanation | same | 1 / 1 | | |
| 4 | Task window "Wiping device" | same | – | | |
| 5 | Storage > File Systems: "+" menu, pick BTRFS, EXT4, F2FS, JFS or XFS, no guidance | `[S W/storage/filesystems/filesystem-datatable-page.component.ts]`, `[S Y/mkfs.d/*.yaml]` | 1 / 1 | | |
| 6 | Create page (type shown read-only, device list) | `[S Y/component.d/omv-storage-filesystem-generic-create-form-page.yaml]`, `[S Y/route.d/storage.filesystems.*.create.yaml]` | 2 / 1 | | |
| 7 | Task window "Create file system"; on success it goes to the Mount page | same, `successUrl` | – | | |
| 8 | Mount page | `[S W/storage/filesystems/filesystem-mount-form-page.component.ts]` | 3 / 1 | 1 | |
| 9 | Banner: Apply, then "Do you really want to apply the configuration changes?" | `[S WC/core/components/apply-config-panel/apply-config-panel.component.ts]` | – | | **1 (forced: B7)** |
| 10 | Storage > Shared Folders: Create | `[S W/storage/shared-folders/shared-folder-form-page.component.ts]` | 5 / 2 | 2 | |
| 11 | Shared Folders: select, then the key icon (Permissions); one row per user and group | `[S W/storage/shared-folders/shared-folder-permissions-datatable-page.component.ts]` | 1 per row / 1 | 3 | |
| 12 | Services > SMB/CIFS > Settings: tick Enabled (off from the factory `[S T <smb><enable>0]`) | `[S W/services/smb/smb-settings-form-page.component.ts]` | 21 / 1 | 4 | |
| 13 | Services > SMB/CIFS > Shares: Create | `[S W/services/smb/smb-share-form-page.component.ts]` | 23 / 1-2 | 5 | |
| 14 | Banner: Apply, confirm | as 9 | – | | 2 |

**Totals:** 10 pages in 2 menu sections (Storage, Services), 6 dialogs and task windows, 6 forms,
about 55 fields shown plus the permission rows, about 7 that matter, 5 saves, 2 applies (one forced
halfway). If the person is new, add J3 (3 more pages, 2 saves). Nothing tells the owner the order;
the only link between steps is the jump from 7 to 8 and an info hint on page 6 that links to Disks
and Mount `[S Y/component.d/omv-storage-filesystem-generic-create-form-page.yaml hints]`.

### J3 Add a person who can reach a share

| # | Where | Defined in | Fields shown / matter | Save | Apply |
| --- | --- | --- | --- | --- | --- |
| 1 | Users > Users: "+" menu (Create, Import), Create | `[S W/usermgmt/users/user-datatable-page.component.ts]`, `[S W/usermgmt/users/user-form-page.component.ts]` | 9 / 3 (name, password twice) | 1 (account made at once: B5) | |
| 2 | Users: select, then "Shared folder permissions" icon; one row per shared folder | `[S W/usermgmt/users/user-shared-folder-permissions-datatable-page.component.ts]` | 1 per row / 1+ | 2 | |
| 3 | Banner: Apply | | | | 1 |

**Totals:** 3 pages, 2 forms, 9 fields shown, 3-4 that matter, 2 saves, 1 apply. Short, but the
result is not what the owner may expect, because access is decided in four places (F3 below).

### J4 Back up a shared folder

Local copy to a second disk, destination already prepared (otherwise add J2 steps 1-10):

| # | Where | Defined in | Fields shown / matter | Save | Apply |
| --- | --- | --- | --- | --- | --- |
| 1 | Services > Rsync > Tasks: Create | `[S W/services/rsync/rsync-task-form-page.component.ts]` | 36 (19 conditional) / 4 (source, destination, schedule, whether to delete) | 1 | |
| 2 | Banner: Apply (forced before Run: B9) | | | | 1 |
| 3 | Tasks: select, Run icon, task window | `[S W/services/rsync/rsync-task-datatable-page.component.ts]` | – | | |

To another machine, add before step 1: System > Certificates > SSH > Create (2 fields)
`[S W/system/certificates/ssh/ssh-certificate-create-form-page.component.ts]`, **apply** (copying the
key refuses while certificates are dirty, B9), then copy the key from the SSH certificate list
`[S W/system/certificates/ssh/ssh-certificate-datatable-page.component.ts 157]`. Totals for remote: 5
pages, 3 forms, 2 applies.

The schedule is the cron vocabulary: "Time of execution", "Minute", "Every N minute", "Hour", "Every
N hour", "Day of month", "Every N day of month", "Month", "Day of week" `[S same file 309-711]`.

### J5 Check health and be told

Turn on disk monitoring for 4 disks with a weekly short test, and email alerts:

| # | Where | Defined in | Fields shown / matter | Save | Apply |
| --- | --- | --- | --- | --- | --- |
| 1 | Dashboard says it "has not yet been configured", links to settings; pick widgets | `[S WC/core/pages/dashboard-page/dashboard-page.component.ts 33]`, `[S W/dashboard/dashboard-settings-page]` | 1 list / 3-4 | 1 | |
| 2 | Storage > S.M.A.R.T. > Settings: tick Enabled (off from the factory `[S T <smart><enable>0]`) | `[S W/storage/smart/smart-settings-form-page.component.ts]` | 5 / 1 | 2 | |
| 3 | S.M.A.R.T. > Devices: per disk, Edit, tick "Monitoring enabled" (x4) | `[S W/storage/smart/smart-device-form-page.component.ts]` | 4 / 1, four times | 3-6 | |
| 4 | S.M.A.R.T. > Scheduled Tasks: Create, one disk per task (x4) | `[S W/storage/smart/smart-task-form-page.component.ts]` | 8 / 2, four times | 7-10 | |
| 5 | System > Notification > Settings | `[S W/system/notification/notification-settings-form-page.component.ts]` | 10 / 5-8 | 11 | |
| 6 | Banner: Apply (forced before "Send test email": B9), then test | | | | 1 |
| 7 | System > Notification > Events: check which events send mail | `[S W/system/notification/notification-selection-list-page.component.ts]` | list | 12 | 2 |

**Totals:** about 13 page views in 3 sections, 12 saves, 2 applies. The disk-health widget only
shows disks with monitoring on ("No monitored devices.") and shows state by tile colour, with the
words only in a tooltip `[S Y/dashboard.d/smart_status.yaml]`.

### J6 Update the system

| # | Where | Defined in | Notes |
| --- | --- | --- | --- |
| 1 | System > Update Management > Updates | `[S W/system/updates/update-datatable-page.component.ts]` | list may be stale until checked |
| 2 | Magnifier icon "Check for new updates" (task) | same, `Apt.update` | refuses while `apt` is dirty (B9) |
| 3 | Download icon with a count badge, then "All packages will be upgraded. Do you want to proceed?" | same | all or nothing |
| 4 | Task window "Upgrade system", then the page reloads | same, `successUrl: /reload` | |
| 5 | Reboot notice in the notification side panel and the top bar | `[S WC/core/components/notification-bar/notification-bar.component.ts 149]`, `[S WC/core/components/top-bar/top-bar.component.ts 222]` | |

**Totals:** 1 page, 2 dialogs, 0 forms, 0 applies. Low friction; the gaps are copy (package
jargon: "Repository", "Maintainer", "Package Information") and the reboot notice sitting in a side
panel.

### J7 Turn on HTTPS

| # | Where | Defined in | Fields shown / matter | Save | Apply |
| --- | --- | --- | --- | --- | --- |
| 1 | System > Certificates > SSL: Create | `[S W/system/certificates/ssl/ssl-certificate-form-page.component.ts]` | 10 / 0-1 (all have defaults; "Common Name" is the only one an owner might set) | 1 | |
| 2 | System > Workbench > Settings: "SSL/TLS enabled", Certificate, Port, "Force SSL/TLS" | `[S W/system/workbench/workbench-settings-form-page.component.ts]` | 6 / 3 | 2 | |
| 3 | Banner: Apply, with the generic confirmation | `[S WC/core/components/apply-config-panel/apply-config-panel.component.ts 74-81]` | | | 1 |

**Totals:** 3 pages, 2 forms, 16 fields shown, 3-4 that matter, 2 saves, 1 apply. The setting lives
under "Workbench", a name for the interface itself. The apply confirmation does not say the
connection will move or that the browser will warn about a self-signed certificate.

### J8 Replace a failing disk

**(a) Disk in a software RAID (plugin `openmediavault-md`, installed from System > Plugins):**

| # | Where | Defined in | Applies |
| --- | --- | --- | --- |
| 1 | Spot it: dashboard tile colour or S.M.A.R.T. > Devices | `[S Y/dashboard.d/smart_status.yaml]` | |
| 2 | Storage > RAID Management: select array, Remove, select the disk | `[S MD/workbench/component.d/omv-storage-md-remove-form-page.yaml]` | 0 (acts at once: `[S MD/engined/rpc/mdmgmt.inc remove]`) |
| 3 | Power off (top-bar menu) or hot-swap; physical work | `[S WC/core/components/top-bar/top-bar.component.ts 170]` | |
| 4 | Storage > Disks: wipe the new disk if it is not empty (3 dialogs, as J2 1-4) | | |
| 5 | RAID Management: Recover, select the new disk; rebuild runs in the kernel | `[S MD/workbench/component.d/omv-storage-md-recover-form-page.yaml]` | 0 |

**Totals:** 3 pages, 2 forms, 3-5 dialogs, 0 applies, one physical pause. Disks are named by device
file throughout (`/dev/sdX`); model and serial appear only on the Disks page `[S W/storage/disks/disk-datatable-page.component.ts]`.

**(b) Single disk, no RAID.** There is no guided path. The owner must prepare a new disk (J2 1-9),
copy with a one-off backup job (J4), then edit each shared folder and change its File system
(the field stays editable on edit `[S W/storage/shared-folders/shared-folder-form-page.component.ts]`;
the edit creates an empty directory and does **not** move data `[S R/sharemgmt.inc set]`), apply,
check each service, then unmount the old file system. At least 8 pages plus one per shared folder,
3 or more applies.

### J9 Retire storage safely

| # | Where | What blocks the owner |
| --- | --- | --- |
| 1 | File Systems: Unmount (stop icon) is disabled | the disabled button gives no reason; its tooltip is the action name `[S WC/shared/components/datatable-actions/datatable-actions.component.html]` |
| 2 | Shared Folders: find the folders whose Device matches; "Referenced" column says yes or no | which service? B10 |
| 3 | Search SMB shares, NFS shares, Rsync tasks, Rsync server modules, the home-folder setting, and any plugin | up to 6 lists; plugins may hold references no core page shows `[I]` |
| 4 | Delete each share and folder (delete disabled while referenced, again no reason), apply | `[S W/storage/shared-folders/shared-folder-datatable-page.component.ts delete]` |
| 5 | Unmount: "Please make sure that the file system is not used by any service before unmounting." | the dialog asks the owner to know what the system could have told them |

### J1 First set-up

There is no first-run guide. The first screen shows a dismissible welcome panel with a donation form
and project links `[S WC/core/components/welcome-panel/welcome-panel.component.html]`. Nothing nudges
the owner to change the factory password (no such string in `WC/`) or warns that the interface is on
HTTP (`[S T <webadmin><enablessl>0]`).

| Task | Where | Fields shown / matter | Apply |
| --- | --- | --- | --- |
| Change the admin password | Account > Password `[S Y/navigation.d/account.password.yaml]` | 2 / 2 | 0 (immediate `[I]`) |
| Name the NAS | Network > General `[S W/network/general/general-network-form-page.component.ts]` | 2 / 1 | 1 |
| Time zone | System > Date & Time `[S W/system/date-time/date-time-form-page.component.ts]` | 4 / 1 | (batched) |
| Alerts | J5 steps 5-7 | 10 / 5-8 | 1 more, to test |
| Updates | J6 | | |
| HTTPS | J7 | 16 / 3-4 | 1 more |
| Dashboard | J5 step 1 | | |

**Totals:** about 9 pages in 5 sections, at least 3 applies if the owner tests email and turns on
HTTPS, and no indication of what is done and what is left.

---

## 3. Friction, grouped by cause

### 3.1 The starting points, confirmed or refuted

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Adding storage takes about six pages | **Confirmed, and worse**: 10 pages, 6 forms, 5 saves, 2 applies, 6 dialogs | J2 table |
| Apply after every save | **Refuted as stated, real in effect.** The stock banner batches changes and never asks after a save (`applyChangesBg` is called only from the banner: `[S WC/core/components/apply-config-panel/apply-config-panel.component.ts 108]`). But the backend forces an apply in the middle of J2 (B7), J4 remote, J4 "Run now" and J5 "test email" (B9) | B7, B9 |
| No view of what depends on what | **Confirmed.** Only a yes/no "Referenced" column; disabled buttons give no reason | B10, J9 |
| Long forms that show every option at once | **Confirmed** for SMB share (23 fields, `[S W/services/smb/smb-share-form-page.component.ts]`), SMB settings (21), rsync task (36), network interfaces (18-23 `[S W/network/interfaces/*-form-page.component.ts]`). Short elsewhere (mount 3, shared folder 5, user 9) | field counts |
| Jargon that assumes Linux knowledge | **Confirmed**; see 3.5 | labels as cited |

### 3.2 Hidden order and prerequisites

| Finding | Evidence |
| --- | --- |
| A job spans 2-5 menu sections in an order only the owner knows; the menu is grouped by subsystem, not by task | J2, J5, `[S Y/navigation.d/*.yaml]` |
| A file system must be mounted *and applied* before it appears in the shared-folder list; nothing says why it is missing | B7 |
| A disk with old partitions is silently left out of the create list; the explanation is a dismissible hint | `[S R/filesystemmgmt.inc getCandidates 636-646]`, `[S Y/component.d/omv-storage-filesystem-generic-create-form-page.yaml hints]` |
| File sharing for Windows and Mac is off from the factory; a share can be created and saved with the service off and nothing warns | `[S T <smb><enable>0]`; no hint in `[S W/services/smb/smb-share-datatable-page.component.ts]` |
| Disk monitoring is off from the factory, per disk and globally; the health widget then says "No monitored devices." | `[S T <smart><enable>0]`, `[S Y/dashboard.d/smart_status.yaml]` |
| "Run", "Test", "Check for updates" fail with "Please apply the configuration changes first." instead of offering to apply | B9 |
| The stock interface has inline "create" shortcuts for shared folder and certificate pickers, but they navigate away and back with a return address in the URL (pattern ruled out here by UI-3) | the stock form pickers |

### 3.3 The apply model

| Finding | Evidence |
| --- | --- |
| The banner lists module identifiers ("fstab", "samba", "zeroconf", "monit"); the plain description is only in a tooltip | `[S WC/core/components/apply-config-panel/apply-config-panel.component.html]` |
| Apply covers everyone's pending changes; the owner cannot see whose they are or apply only theirs | B2 |
| The confirmation is the same sentence for every change, including ones that move the connection (HTTPS, network) | `[S apply-config-panel.component.ts 74-81]` |
| Inconsistent: mount needs apply, unmount applies itself; creating a user acts at once but is listed as nothing pending; the shared-folder directory exists before apply | B5, B6 |
| A failed apply leaves a mix of deployed and not-deployed modules, still all marked pending; revert then makes the database disagree with what was deployed | B3, B4; the disagreement is `[I]` (V5) |
| Revert after creating a user removes the database record but not the system account | B4, B5; `[I]` (V4) |

### 3.4 No dependency view

| Finding | Evidence |
| --- | --- |
| "Referenced: yes" without saying by what; delete and unmount are disabled without a reason | B10, J9 |
| Wiping a disk names only `/dev/sdX`: no model, size, file systems, shared folders or services on it | `[S W/storage/disks/disk-datatable-page.component.ts onWipe]` |
| The backend does not stop a wipe of a disk whose file system is in use; only the system disk is protected | B14 |
| Delete confirmations are one generic sentence: "Do you really want to delete the selected item(s) …?" with no consequence | `[S WC/core/components/intuition/datatable-page/datatable-page.component.ts 321-338]` |
| Access to a share is decided in four places that never appear together: SMB share options (Public, Read-only), OMV permissions per user and group, the folder mode chosen once at creation (hidden on edit), and the file ACL page. The permissions page itself says its settings "have no effect on file system permissions" | `[S W/services/smb/smb-share-form-page.component.ts]`, `[S W/storage/shared-folders/shared-folder-permissions-datatable-page.component.ts hints]`, `[S W/storage/shared-folders/shared-folder-form-page.component.ts mode modifiers]`, `[S W/storage/shared-folders/shared-folder-acl-form-page.component.ts]` |
| What a share with no permissions set and Public = No allows is not shown anywhere | `[I]` (V6) |

### 3.5 Jargon (labels and options as shipped)

| Area | Words a non-Linux owner meets | Evidence |
| --- | --- | --- |
| Menu | "S.M.A.R.T.", "SMB/CIFS", "Rsync", "Workbench", "Scheduled Tasks" (three different menus use this name) | `[S Y/navigation.d/*.yaml]` |
| Storage | "BTRFS / EXT4 / F2FS / JFS / XFS" with no guidance; "Profile: Single, DUP, RAID0, RAID1, RAID10"; "Relative path"; "Device Symlinks", "WWN"; "Advanced Power Management", "Advanced Acoustic Management"; hint naming "ZFS, LVM, Linux RAID or LUKS member" | `[S Y/mkfs.d]`, `[S Y/component.d/omv-storage-filesystem-btrfs-create-form-page.yaml]`, `[S W/storage/disks/disk-form-page.component.ts]` |
| Shared folder | Permissions as "Administrator / Users / Others", where "Users" means a system group | `[S W/storage/shared-folders/shared-folder-form-page.component.ts 118-130]`, `[S R/usermgmt.inc setUser: always in group 'users']` |
| SMB share | "Inherit ACLs", "Wide links", "Follow symlinks", "Extended attributes", "Store DOS attributes", "Hosts allow/deny", "Extra options" | `[S W/services/smb/smb-share-form-page.component.ts]` |
| User | "Shell" (default `/usr/bin/sh`), "Groups" listing every system group, "SSH public keys" | `[S W/usermgmt/users/user-form-page.component.ts]` |
| Backup | "Archive mode", "Recurse into directories", "Trial run", "Delete" (removes files on the backup), "Push/Pull", cron fields | `[S W/services/rsync/rsync-task-form-page.component.ts]` |
| HTTPS | "SSL/TLS enabled", "Force SSL/TLS", "Common Name", "Key size" | J7 files |

### 3.6 Affordance and status honesty

| Finding | Evidence |
| --- | --- |
| Table actions are icon-only, named only in tooltips (44 icon buttons in page configs; Wipe, Unmount, Permissions, Run, Install updates among them); the action needs a row selected first | `[S WC/shared/components/datatable-actions/datatable-actions.component.html 12-37]` |
| Disk-health tiles carry state by colour; words only in a tooltip | `[S Y/dashboard.d/smart_status.yaml]` |
| Disk power mode uses status colours for non-status ("Active" orange, "Sleep" green, "Standby" blue) | `[S W/storage/disks/disk-datatable-page.component.ts 100-135]` |
| Status words differ per page: "Available/Unavailable" (shared folders), "Available/Creating/Missing" (file systems), "Good/Unknown" plus sentences (disk health) | as cited |
| The reboot-needed notice sits in a side panel | `[S WC/core/components/notification-bar/notification-bar.component.ts 149]` |

### 3.7 Defaults that work against the owner

| Default | Risk | Evidence |
| --- | --- | --- |
| Multi-disk BTRFS defaults to RAID0 | losing any one disk loses everything | `[S Y/component.d/omv-storage-filesystem-btrfs-create-form-page.yaml value: "raid0"]` |
| New shared folder mode 775 (everyone on the NAS can read) | wider than many owners expect | `[S W/storage/shared-folders/shared-folder-form-page.component.ts value: '775']` |
| New user shell `/usr/bin/sh` | a file-sharing account gets a login shell | `[S W/usermgmt/users/user-form-page.component.ts value: '/usr/bin/sh']` |
| File sharing, disk monitoring, HTTPS all off; dashboard empty | the owner must know to turn each on | `[S T]`, J5 |

---

## 4. Proposed job-based flows

### 4.1 Rules every flow follows (the "job runner")

| # | Rule | Why |
| --- | --- | --- |
| R1 | **Pre-flight.** Before the first decision, read `Config.isDirty`/`System.getInformation` (`dirtyModules`). If anything is pending, the flow says so in words and offers "Apply them now" or "Undo them" before continuing. | B2, B4: otherwise the flow's apply and undo would carry someone else's changes |
| R2 | **Decide, then summarise, then run.** All choices first; one summary in plain words; one confirmation (type-to-confirm where data is erased, UI-8); then a step list runs. | the owner's brief |
| R3 | **Order of steps:** reads and checks (names unique, disk still empty) → irreversible actions → configuration writes → apply → verify. Everything that can fail cheaply fails before anything is destroyed. | B5, B11 |
| R4 | **Read-modify-write.** A settings object is re-read immediately before it is written. | B11; reduces lost updates from a second administrator |
| R5 | **Step states in words**: Waiting, Running, Succeeded, Failed, Cancelled (style guide 5.7 plus "Waiting", see Q10). Running tasks show output on the terminal pair. | style guide 5.7 |
| R6 | **On failure:** stop. Show what succeeded, what failed (the backend message as text, UI-9) and what did not run. Offer "Try this step again". Offer "Undo the changes not applied yet" (`Config.revertChangesBg`) only when R1 held and no immediate step would be orphaned. Never retry a mutation automatically (UI-14). | B3, B4 |
| R7 | **After a failed apply**, the default offer is "Try applying again". If the owner chooses to undo instead, follow the revert with `Config.applyChangesBg {modules: <the modules that were deployed>, force: true}` so the files match the database again. | B3, B4; `[I]` V5 |
| R8 | **A reload or an expired session ends the flow view** (the step journal and task handles live in memory only, UI-5, UI-13). The object pages must recognise an unfinished job from server state and offer the next step (for example "This file system is mounted but nothing is shared from it yet"). A running task keeps running on the server `[I]`. | UI-5, UI-13 |
| R9 | **A flow's URL only opens the flow.** No step runs on page load. | UI-4 |
| R10 | **Just before the final apply**, re-read `dirtyModules`. If modules outside the flow's expected set are now dirty, the apply confirmation lists them ("Also pending from elsewhere: NFS"). | B2 |

### 4.2 Flow A: "Add storage and share it" (J2, with J3 inline)

**Decisions, in this order:**

| # | Decision | Default and copy |
| --- | --- | --- |
| A1 | Which disk | Empty disks first. Disks holding data are listed under "Erase and reuse", each with model, serial, size and what is on it. The system disk and disks with file systems in use are not offered (B14) |
| A2 | A name for the storage | Optional, for example "Media disk"; stored as the mount tag, which the shared-folder list already shows `[S R/sharemgmt.inc getCandidates 122-128]` |
| A3 | Format | "Standard (EXT4), recommended". Others under "Other formats" with one line each. Multi-disk BTRFS is a separate flow (Q3) |
| A4 | Shared folder name | Checked for the share-name pattern, 80 characters, uniqueness `[S W/storage/shared-folders/shared-folder-form-page.component.ts validators]`. The folder is created with mode 770, so only the people given access can reach it (Q4); the summary says so |
| A5 | Who can use it | Each person and group: Read and write, Read only, No access (default No access). "Anyone on the network, without a password" is a separate, explained choice |
| A6 | Reach it from other computers | "Windows and Mac (SMB)", on by default; "Use for Time Machine backups" checkbox. NFS under "More ways to share" |
| A7 | Warn when nearly full | 85%, shown in the summary with a Change link (stock default `[S W/storage/filesystems/filesystem-mount-form-page.component.ts]`) |

**Summary (example copy):** "Erase disk /dev/sdb (3.6 TiB). Everything on it will be lost.
Create a standard file system called Media disk. Create the shared folder Photos. Alex: read and
write. Sam: read only. Share it with Windows and Mac computers as \\NAS_HOST\Photos. Windows and Mac
sharing is off now and will be turned on." Confirm by typing the disk name; button "Erase disk and
create storage".

**Calls, in order** (service.method only):

| Stage | # | Call | Kind |
| --- | --- | --- | --- |
| Read | 0 | `Config.isDirty`, `DiskMgmt.getListBg`, `FileSystemMgmt.getCandidatesBg`, `FileSystemMgmt.getListBg`, `ShareMgmt.getList`, `UserMgmt.getUserList`, `UserMgmt.getGroupList`, `SMB.getSettings`, `SMB.getShareList` | reads, some tasks |
| A: disk | 1 | `DiskMgmt.wipe` (only if A1 was a disk holding data), then `FileSystemMgmt.getCandidatesBg` to confirm it is now offered | task, irreversible |
| | 2 | `FileSystemMgmt.create` | task, irreversible |
| | 3 | `FileSystemMgmt.getMountCandidates`; pick the entry whose `parentdevicefile` is the chosen disk | read, `[I]` V3 |
| B: mount | 4 | `FileSystemMgmt.setMountPoint` | config |
| | 5 | `Config.applyChangesBg {modules: ["fstab"]}` | **apply checkpoint**, task |
| | 6 | `FsTab.getByFsName`, then `ShareMgmt.getCandidates` must list it | verify |
| C: share | 7 | `ShareMgmt.set` | config, and the directory is made at once (B5) |
| | 8 | `ShareMgmt.setPrivileges` | config |
| | 9 | `SMB.getSettings` then `SMB.setSettings` with `enable: true` (only if off) | config |
| | 10 | `SMB.setShare` with every required property (B11) | config |
| D: apply | 11 | re-read `dirtyModules` (R10), then `Config.applyChangesBg {modules: []}` | apply, task |
| | 12 | `ShareMgmt.getList` (status OK), `SMB.getShareList`, `Services.getStatus` | verify |

**Done only when the apply runs:** the mount (step 5), the network share, the permissions as Samba
sees them, turning Samba on (step 11). **Done at once:** erase, format, the folder's directory.

**Failure plan:**

| Fails at | System is left | The owner sees | Offered |
| --- | --- | --- | --- |
| 1 erase | disk unchanged or partly erased | "The disk could not be erased." + message | Try again; Stop (nothing to undo) |
| 2 format | disk erased, no usable file system | "The disk was erased but formatting failed." | Try again (create erases first `[S R/filesystemmgmt.inc create]`); Stop, disk is listed as empty |
| 3 not found | file system made, not yet listed | "Waiting for the new file system to appear" | `DiskMgmt.rescan` and look again; then Stop with "Mount it from Storage > File systems" |
| 4 mount entry | as after 3 | message | Try again |
| 5 mount apply | mount entry pending, other modules untouched (R1) | "The file system could not be mounted." | Try applying again; Undo the pending mount (safe here: only `fstab` is pending) |
| 6 not mounted | mount applied but not active | "The file system is not mounted." | Stop; never continue to 7 (B8, V1) |
| 7 folder | record may exist without its directory (the record is written before the directory is made `[S R/sharemgmt.inc set]`); shows as "Directory does not exist" | message | Try again (same identifier); Remove the folder record (`ShareMgmt.delete`, content kept) |
| 8-10 | some configuration pending | which of permissions / sharing failed | Try this step again; Undo pending (removes the folder record; the empty directory stays `[I]`) |
| 11 apply | B3 mix | R6/R7 | Try applying again |
| 12 verify | applied, share not visible | "Saved and applied, but the share is not visible yet" | Check again; link to the share's page |

**Single apply impossible:** step 5 must apply before step 7 can run (B7), and step 7 must not run
before the mount is real (B8). Erase and format (A) are not part of apply at all. So the flow has
**one confirmation and two applies**; the step list shows the checkpoint as "Mount the new file
system", not as a second "Apply".

### 4.3 Flow B: "Add a person" (J3)

**Decisions:** name; password twice (masked, UI-6); email (optional; the help says it is used for
notifications `[I]`); access per shared folder (Read and write,
Read only, No access; default No access); under "More": groups, SSH access and keys. The account
gets no login shell unless "SSH access" is ticked (Q5).

**Summary:** "Create the account Alex. Alex can read and write Photos and read Documents. Alex can
sign in to shared folders from other computers." Button "Create account".

**Calls:**

| # | Call | Kind |
| --- | --- | --- |
| 0 | `Config.isDirty`, `UserMgmt.getUserList` (name free), `ShareMgmt.getList` | reads |
| 1 | `UserMgmt.setUser` | **immediate**: account and file-sharing password made now (B5) |
| 2 | `ShareMgmt.setPrivilegesByRole {role: "user", name, privileges}` | config, one call for all folders `[S DM/rpc.sharemgmt.json]` |
| 3 | `Config.applyChangesBg` | apply |
| 4 | `UserMgmt.getUser`, `ShareMgmt.getPrivilegesByRole` | verify |

**Failure plan:** 1 fails, nothing made (check with `UserMgmt.getUser`), Try again. 2 fails, "Alex
was created but access was not saved", Try again. 3 fails, R6/R7. **Do not offer "Undo pending
changes" after step 1**: revert would drop the record and leave the account (V4); the undo is
"Delete account" (`UserMgmt.deleteUser`, confirmed by name).

**Single apply:** possible. The effective access depends on the folder's file permissions, which
the flow cannot change. Reading them needs `ShareMgmt.getFileACL`, which reads the disk, so the
effective access is shown only on a folder's own page (Q9); the flow and its summary show what was
granted. Folders this interface creates use mode 770 (Q4), so for them the two agree.

### 4.4 Flow C: "Back up a shared folder" (J4)

**Decisions:** what (shared folder); where (another shared folder, or "a new disk", which runs Flow A
stages A-C without sharing); when (Every day at, Every week on, Every hour; "Custom schedule" opens
the cron fields); deleted files ("Keep them on the backup", default; "Remove them from the backup
too", with one sentence on the risk); email the result (shows whether email is set up).

**Calls (local):** `Rsync.getList`, `ShareMgmt.getList` → `Rsync.set` (all 36 properties, B11) →
`Config.applyChangesBg` → optional `Rsync.execute` (task) as "Run the first backup now".

**Calls (another machine):** `CertificateMgmt.createSsh` → `Config.applyChangesBg` (checkpoint) →
`CertificateMgmt.copySshId` (asks the other machine's password once, secret, UI-6) → `Rsync.set` →
`Config.applyChangesBg`.

**Failure plan:** `Rsync.set` fails, nothing pending, Try again. Apply fails, R6/R7. `Rsync.execute`
fails, the job is saved and scheduled; "The first backup failed" with the task output; Run again.
`copySshId` fails (wrong password, unreachable), key made, nothing copied; Try again.

**Single apply impossible:** "Run now" must follow the apply (B9); remote needs an apply before the
key can be copied (B9).

### 4.5 Flow D: "Watch disk health and tell me" (J5)

**Decisions:** disks to watch (all, by default, listed with model, serial, size); regular test
(None; Short, weekly, default; Long, monthly); temperature warning (Off; above N °C); how to be told
(email: server, port, encryption, sender, sign-in, recipients; or "Only show it here").

**Calls:** `Smart.getSettings` → `Smart.setSettings {enable: true}` → per disk
`Smart.setDeviceSettings {devicefile, enable: true}` → per disk `Smart.setScheduledTest` →
`EmailNotification.get` → `EmailNotification.set` → `Config.applyChangesBg` →
`EmailNotification.sendTestEmail` ("Send a test email") → `Smart.getListBg` (verify).

**Failure plan:** per-disk steps report per disk ("3 of 4 disks set; /dev/sdd failed"), Try the rest.
Test email fails after a good apply: settings are live; show the mail server's message; Change
settings.

**Single apply:** possible; the test email must come after it (B9).

### 4.6 Flow E: "Use a secure connection (HTTPS)" (J7)

**Decisions:** certificate (Create one for this NAS, default; Use an existing one; Import); port
(443); "Always use the secure connection" (on).

**Summary:** "After applying, this page stops working at its current address. Open
https://NAS_HOST/ui/ instead. Your browser will warn that it does not recognise the certificate the
first time, because this NAS made it itself."

**Calls:** `CertificateMgmt.getList` → `CertificateMgmt.create` (if creating) → `WebGui.getSettings`
→ `WebGui.setSettings` → `Config.applyChangesBg` (B13: one apply is enough).

**Failure plan:** create fails, nothing pending. setSettings fails, the certificate is pending; Try
again or Undo pending. Apply: the connection drops when the web server restarts `[I]` (V7), so the
task cannot be followed to the end. The page shows the fixed instruction and stops polling.

**Single apply:** possible, but the result **cannot be confirmed from the old page**: the CSP
`connect-src 'self'` (UI-1) forbids calling the HTTPS origin from the HTTP page. See Q7.

### 4.7 Flow F: "Replace a failing disk" (J8a, RAID and ZFS plugins) — version 1 (Q8)

Version 1 supports both the RAID plugin and the ZFS plugin (Q8). The RAID part below was read from
source; the ZFS part (replacing a disk in a pool) is designed in the same two-part shape once the ZFS
plugin's methods have been read from its source. Each part appears only when its plugin is installed.

Two parts with a physical pause: **Part 1** (`MdMgmt.getList`, `Smart.getListBg` → choose the
failing disk by model and serial → `MdMgmt.remove`, immediate) → "Now replace the disk" with an
optional `System.shutdown`; **Part 2** (`DiskMgmt.rescan` → `DiskMgmt.getListBg` → optional
`DiskMgmt.wipe` → `MdMgmt.add` → watch `MdMgmt.getList` until the rebuild finishes). No apply. A
single flow is impossible because the physical swap sits in the middle and a shutdown ends the
session. J8b (single disk) needs a migration flow with 3+ applies; design it after A and C.

### 4.8 Pattern G: "Used by" (J9)

Not a flow but a panel on every file system, shared folder, user and certificate: list the known
referrers by reading `SMB.getShareList`, `NFS.getShareList`, `Rsync.getList`,
`Rsyncd.getModuleList`, `UserMgmt.getSettings` (home folders). When `_used` is true and no known
referrer is found, say "Used by an add-on or setting this interface does not show yet" and link to
the classic interface. Every disabled delete, unmount or wipe names the blocker in words.

---

## 5. Open questions for the owner, and what to design first

### Open questions, answered by the owner on 2026-11-20

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Flow A needs two applies (B7, B8). Accept one flow with a visible "Mount the new file system" checkpoint, or split it into "Prepare a disk" and "Share a folder"? | One flow, with the checkpoint shown as "Mount the new file system" |
| Q2 | Pre-flight (R1): when other changes are pending, should a flow refuse to start until they are applied or undone, or include them and say so? | Refuse to start until the pending changes are applied or undone; the flow offers both (R1) |
| Q3 | Default format EXT4 for one disk; multi-disk BTRFS in its own flow with RAID1 as our default instead of the stock RAID0? | Yes: EXT4 is the default for one disk; multi-disk BTRFS is its own flow, with RAID1 as the default |
| Q4 | New shared folders: keep the stock mode 775 (everyone on the NAS can read) or use 770 (only people given access)? It changes behaviour compared with the classic interface. | 770: only the people given access |
| Q5 | New accounts: keep the stock shell `/usr/bin/sh` or use no login shell unless "SSH access" is ticked? | No login shell unless "SSH access" is ticked |
| Q6 | Offer "Anyone on the network, without a password" in Flow A at all, or only on the share's own page? | Offered in Flow A, as a separate, explained choice (A5) |
| Q7 | HTTPS: may the page show a link to `https://<this host>/ui/` built from the current host name and the chosen port (UI-3 reading), and do we accept that success cannot be confirmed from the old page? | Yes to both: the link is built from the current host name and the chosen port, and the page says it cannot confirm the result |
| Q8 | RAID plugin (`openmediavault-md`) in v1, or link to the classic interface for disk replacement? | Both plugins in version 1: the RAID plugin and the ZFS plugin (`openmediavault-zfs`) |
| Q9 | Showing effective access needs `ShareMgmt.getFileACL` per folder (it reads the disk). Acceptable on the access grid, or only on a folder's own page? | Only on a folder's own page |
| Q10 | Add "Waiting" to the task-state words for step lists (style guide 5.7 has Running, Succeeded, Failed, Cancelled)? | Yes: Waiting joins the task states (style guide 5.7) |
| Q11 | Should the first sign-in show a short set-up checklist (J1: password, name, alerts, HTTPS, updates) built from server state, in place of the stock welcome panel? | Yes |

### Recommended first flows

1. **Flow A, Add storage and share it.** Highest friction (10 pages, 2 applies), destructive, and it
   proves the job runner, the checkpoint apply and the type-to-confirm dialog. Needs owner agreement
   before build (destructive domain).
2. **Flow B, Add a person.** Common, one apply, and it forces the access model (Q9) to be designed.
3. **Flow D, Watch disk health and tell me.** Turns on what is off from the factory and feeds the
   worst-state-first dashboard.
4. **The job runner and Pattern G as shared components**, designed with all states in Phase 2, so
   Phase 5 domains reuse them.

---

## 6. To verify on the test VM (every `[I]` a flow depends on)

| # | Check | Flow |
| --- | --- | --- |
| V1 | What `ShareMgmt.set` does when its file system is configured but not mounted (directory on the system disk?) | A |
| V2 | `Config.applyChangesBg {modules: ["fstab"]}` alone mounts a new file system | A |
| V3 | A newly created file system is found by `parentdevicefile` in `FileSystemMgmt.getMountCandidates` | A |
| V4 | `Config.revertChanges` after `UserMgmt.setUser` leaves the system account and the file-sharing password | B |
| V5 | After a partly failed apply plus revert, deployed files disagree with the database; the forced re-apply of R7 fixes it | all |
| V6 | What an SMB share with no permissions and Public = No lets a signed-in user do | A, B |
| V7 | The HTTP page loses its connection during the HTTPS apply, and what the task helper sees | E |
| V8 | The `dirtyModules` keys produced by each step of Flows A-E (to build R10's expected set) | all |

---

## 7. Adversarial pass (Flow A, the main journey)

**As someone trying to break it**

| Probe | Finding | Change made to the flow |
| --- | --- | --- |
| 0 empty disks | Must not look like an error | Empty state: "No empty disk found. Disks that hold data are under Erase and reuse." Different from "Could not read disks" with the message and Try again |
| 1000 users and groups in A5 | Grid unusable | Search, group rows first, default No access, "Set all to" per column |
| Two tabs, same disk | No lock in the backend `[I]`; the second tab could erase the first tab's new file system | Step 1 re-reads candidates and stops with "This disk changed since you chose it" |
| Another administrator saves during the flow | Their change rides the final apply (B2) | R10 |
| Reload or back button mid-run | Journal and task handles lost (UI-5) | R8: object pages detect "mounted, not shared" and "folder without network share" |
| Session expires during format | Task continues; handle lost | After sign-in, R8 reconciliation; never re-run step 2 automatically (UI-14) |
| Apply fails | Mixed state (B3) | R6, R7 |
| 200-character name | Pattern and 80-character limit | Checked at A4, before the summary |
| Right-to-left name, name that looks like markup | Must render as text | UI-2; summary uses text nodes; mono for device paths |
| Disk with a file system in use | Backend would erase it (B14) | Not offered in A1; Pattern G names what uses it |

**As someone who cannot see it**

| Probe | Requirement |
| --- | --- |
| Keyboard only | Decisions are one form in reading order; the summary is a heading plus a list; focus starts on Cancel in the confirmation; Enter does not confirm (style guide 5.4) |
| Screen reader | The step list is an ordered list; each step's state is a word; step changes are announced politely, a failure assertively, and focus moves to the failure heading |
| Colour | Step states and disk states carry words and icon shapes; nothing relies on the tile colour the stock dashboard uses |
| 200% zoom, 320px | Step list one column; the type-to-confirm field and its target text wrap, device paths break safely |

