# Phase 5, shares slice: shared folders, access, and sharing over SMB: design

The shares slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the Shared
folders list made actionable, a shared folder's own page, who may use a folder (access per person and
group), adding a shared folder on a mounted file system (from the list, and from Flow A's handover),
sharing a folder with Windows and Mac computers over SMB (turning SMB on, the share's few plain
options, stopping), changing where a broken folder points, and deleting a shared folder, with or
without its files. It picks up where Flow A ends ([phase-5-filesystems.md](phase-5-filesystems.md),
6.8, "Next: share a folder on it").

**Status: proposed, for the owner to agree (section 17). Nothing is built.** The nine methods the
owner cleared on 2026-11-22 cover most of it; two more are asked for (11.0). This slice destroys data
(deleting a shared folder with its files), cuts access (stopping a share, turning SMB off, taking
someone's access away, deleting a folder) and can open a folder to anyone on the network (guest
access), so every destructive point is in section 17 and nothing destructive is built before the
owner agrees.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-8 above all), the journal entries of 2026-11-20 (the UX audit's answers: Q2 a flow refuses to
start while other changes are pending, Q4 new folders get mode 770, Q6 "Anyone on the network, without
a password" is a separate, explained choice, Q9 effective access only on a folder's own page), of
2026-11-21 (destructive slices agreed before building; the interface enforces its own safeguards; Flow
A hands sharing to the classic interface, P4) and of 2026-11-22 (the shares methods cleared), the [UX
audit](ux-audit.md) (Flow A in 4.2, Flow B in 4.3, the job-runner rules R1 to R10 in 4.1, Pattern G
in 4.8, the backend facts B1 to B14 in its section 0), and the conventions of
[phase-3-pages.md](phase-3-pages.md) (the read-only Shared folders page, its section 4),
[phase-5-monitoring.md](phase-5-monitoring.md), [phase-5-disks.md](phase-5-disks.md),
[phase-5-filesystems.md](phase-5-filesystems.md), [phase-5-raid.md](phase-5-raid.md) and
[phase-5-zfs.md](phase-5-zfs.md), each in its section 0, which every page here reuses unchanged. Where
this document and the style guide disagree, the style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x tree: the `ShareMgmt`, `UserMgmt` and `SMB` RPC
services, their `rpc.*` and `conf.*` datamodels, the `sharedfolders`, `samba`, `systemd`, `avahi`, `nfs`
and `rsyncd` engine modules, the Samba deploy templates, and the classic workbench's shared-folder and
SMB forms). Nothing in this slice has been observed yet. Anything marked **[verify]** is checked on the
mock and the VM, by capture, before it is relied on (section 14.2). Anything marked **[owner]** needs
the owner's answer before that part is built.

Every method used here is administrator-only (read from source: each checks the administrator role).
A normal user sees nothing new (section 10).

## Scope of this slice (recommended)

| Built here | Left to the classic interface, and why |
| --- | --- |
| The Shared folders list with its actions: add, open a folder, which folders are shared over SMB | **File permissions on the disk (ACLs)**: owner, group and per-person file rights, applied recursively to every file. The classic page needs Linux permission knowledge to use safely, and its method reads and writes the disk (11.0). The folder's page says plainly that these exist and where |
| A shared folder's page: its state, where it is, its description, who may use it, how it is shared, what uses it | **NFS shares**: for Linux and other Unix computers; the owners this interface is for use SMB. A folder's page says when something else (NFS among others) uses it |
| Adding a shared folder on a mounted file system, from the list or from Flow A's handover, with access and SMB in the same flow, one checkpoint | **Advanced SMB settings**: workgroup, server description, minimum protocol, NetBIOS, WINS, time server, home folders, log level, asynchronous I/O, sendfile, extra options |
| Access per person and group: Read and write, Read only, No access | **Advanced share options**: recycle bin, hide dot files, inherit ACLs and permissions, extended and DOS attributes, hosts allow and deny, audit, symbolic links, transport encryption, macOS compatibility and Time Machine (which changes behaviour for every share on the NAS), extra options. Each share keeps whatever was set there |
| Sharing a folder over SMB with three plain options: shown in the network list, read only for everyone, guest access (off by default); stopping it | **Copying access from another folder**, access by person across all folders (Flow B's job), and the user and group pages themselves |
| Turning Windows and Mac sharing (SMB) on and off | **Snapshots of BTRFS shared folders**, scheduled snapshots, the recycle bin's "Empty now" |
| Changing where a folder points, only to repair one that cannot be reached | **Moving a working folder** to another file system or path (it moves no files; see section 7) |
| Deleting a shared folder: keeping its files, or with every file in it | **Renaming a shared folder** (its name is its network name, section 0.5) |

The recommendation rests on the same three things as the ZFS slice: the actions kept are the ones a
home or small-office owner meets when making storage useful (make a folder, say who may use it, reach
it from a computer, clean it up); each kept action can be told in one plain sentence, including what
it costs; and the actions left out are the ones whose effects cannot be put in one sentence without
Linux or Samba knowledge (section 17, P2).

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the four
async states, the settings-form rules, the pending mark, the shared catalogue, the Shared folders
table's server-side paging and its status words), the monitoring domain's (status words, background
and foreground reads, the idle timeout), the disks slice's (one confirmation then a step list), the
file-systems slice's (file-system names and the "choice text", the Used by panel, Flow A and its job
runner, the handover) and the RAID and ZFS slices' (refusals offer no classic link round them, the
session store for what a flow hands on, deletions that refuse to start while other changes are
pending). This section adds only what is new.

### 0.1 The words

OMV's and Samba's words mean little to most owners. The interface uses these, each introduced once
where it first appears, as shared keys:

| OMV or Samba term | The interface says | Introduced as (`shares.term.*`) |
| --- | --- | --- |
| shared folder (`conf.system.sharedfolder`) | **shared folder** (OMV's own word, kept) | "A shared folder is a folder on one of your file systems that you can reach from other computers. Making one does not share it yet: you also choose who may use it and how computers reach it." |
| SMB share (`conf.service.smb.share`) | **shared with Windows and Mac computers**, "SMB share" second where the classic interface's words are needed | "Windows and Mac computers reach shared folders over SMB, the file-sharing method both understand. Linux computers can use it too." |
| SMB/CIFS service (`samba`) | **Windows and Mac sharing (SMB)** | "Windows and Mac sharing must be on for any folder to be reached from those computers." |
| privileges (`perms` 7, 5, 0) | **access**: **Read and write**, **Read only**, **No access** (and **Blocked**, 0.4) | "Access decides who may open this folder from another computer, and whether they may change its files." |
| user, group | **person** in running text, **user** in the Kind column; **group** | "A group is a set of people. Access given to a group applies to everyone in it." |
| guest (`guest` `allow`) | **guest access** ("anyone on the network, without a password") | 0.4 |
| browseable | **shown in the network list** | "Computers on your network see it when they browse the NAS. When this is off, it can still be opened by typing its address." |
| read-only (share) | **read only for everyone** | "Nobody can change files through this share, whatever their access says." |
| mode (770 and others) | **file permissions** (only in the sentences of 0.4) | |
| `reldirpath` | **folder on the file system** | "The folder this shared folder uses, inside its file system." |
| `mntentref` / mount entry | the file system's name (the file-systems slice's 0.1) | |
| `comment` | **description** (the classic form calls it "Tags"; the Phase 3 list already says Description) | |

"Privileges", "ACL", "mode", "Samba", "CIFS", "valid users" and "guest account" appear only in
technical places (the server's own messages, `Identifier` names) and in the one sentence of 0.4 that
names the classic interface's ACL page.

### 0.2 Formatting

| What | Rule | Example |
| --- | --- | --- |
| A shared folder's name (`{{folder}}`) | The folder's `name` as text, medium weight, `dir="auto"`; never truncated; in running text isolated (the disks slice's rule for server text inside a sentence) | `Photos` |
| Its folder on the file system (`{{path}}`) | `reldirpath` without its trailing slash, in `Identifier`; `/` for the whole file system, said as "the whole file system" in sentences | `Photos` |
| Its full path (`{{fullPath}}`) | `absdirpath` in `Identifier` with `CopyButton`, as Phase 3 | `/srv/dev-disk-by-uuid-…/Photos` |
| The file system (`{{fs}}`) | The file-systems slice's name rule (0.1 there): tags when it has them, else its device; for ZFS, its full name | `Media disk` |
| The network address (`{{address}}`) | Built in the browser from `System.getInformation`'s `hostname` (the shell's read) and the folder's name, as **text** in `Identifier` with `CopyButton`, never a link (UI-3): Windows `\\{{host}}\{{folder}}`; Mac `smb://{{host}}/{{folder}}` with the name percent-encoded | `\\NAS_HOST\Photos` |
| A person or group (`{{name}}`) | The account name as received, in `Identifier`; a group with "(group)" after it in running text | `alex`, `family (group)` |
| Access words | `access.rw` "Read and write", `access.ro` "Read only", `access.none` "No access", `access.blocked` "Blocked" | |
| Counts of people | "{{count}} people and {{groups}} groups have access" with plurals; "Nobody has access yet" | |
| Server-written text (error messages, `description`) | As received, as text (UI-2), `dir="auto"`. The list's server-built `description` field is not shown: it is English built on the server and repeats the name | |

### 0.3 States in this slice

**A shared folder's state** keeps Phase 3's words and reasons unchanged (its 4.3): OK; Critical for
`ENOENT`, `ENOTDIR`, `ENOENT_DB_MNTENT`; Unknown for any other code. Read from source: `status` is
computed on every `getList` by checking whether the path exists and is a folder; it does not say
whether the file system is mounted, so a folder on an unmounted file system whose empty mount folder
still exists reads OK **[verify]**. The folder's page therefore also shows the file system's own state
from `FileSystemMgmt.getList` (the file-systems slice's 0.2) and takes the worse of the two.

**Windows and Mac sharing**, from `SMB.getSettings` (`enable`) and `Services.getStatus` (the `smb` row's
`enabled` and `running`, the monitoring domain's read):

| Reading | Pill | Words |
| --- | --- | --- |
| `enable` false | **Disabled** (the Unknown treatment, its own word) | "Off. No folder can be reached from Windows or Mac computers." |
| `enable` true, running | **OK** | "On." |
| `enable` true, not running, and `samba` not pending | **Critical** | "On, but not running. Shared folders cannot be reached. The SMB service details may say why." with a router link to `/diagnostics/services/smb` |
| `enable` true, not running, and `samba` pending | no pill | "Turned on. It starts when you apply the pending changes." with the pending mark |
| either read failed | **Unknown** | "Could not read whether Windows and Mac sharing is on." |

**One folder's SMB share** (a row of `SMB.getShareList` whose `sharedfolderref` is the folder's
`uuid`; OMV allows at most one, read from source):

| Reading | Shown as (not a status pill: it is a setting) |
| --- | --- |
| No row | "Not shared with Windows and Mac computers." |
| A row with `enable` true, and SMB is on | "Shared with Windows and Mac computers as {{address}}." |
| A row with `enable` true, and SMB is off | "Set up for Windows and Mac computers, but Windows and Mac sharing is off." with "Turn it on…" |
| A row with `enable` false | "Set up for Windows and Mac computers, but turned off for this folder." with "Turn it on" (it was turned off in the classic interface) |
| `samba` pending and this session saved this share | the pending mark and "Not applied yet." |

Not statuses, and never coloured or pilled: access, guest access, read only, shown in the network
list, the description. Guest access is said in words with the warning-shape neutral `InlineAlert`
(the RAID slice's Stripe warning), not a Warning pill: it is a choice, not a fault.

### 0.4 Access: what OMV stores and what it means

Read from source (`ShareMgmt.setPrivileges`, the Samba share template):

- Each shared folder stores a list of entries `{type: user|group, name, perms}`, with `perms` 7 (read
  and write), 5 (read only) or 0. `setPrivileges` **replaces the whole list**; a person or group left
  out of the list loses their entry.
- **Access is for the network, not the disk.** The entries decide who Samba (and the Rsync server)
  lets in. They do not change the file permissions on the disk. The classic page says so in one line;
  so does this one (3.1).
- With **guest access off**, a person or group with 7 or 5 may open the folder; one with 5 only reads;
  anyone with **no entry** is not let in **while at least one entry gives access**; an entry with 0 is
  refused even when a group they belong to gives access (Samba's "invalid users", which wins).
- With **guest access on** (`guest` `allow`), anyone on the network may open it without a password, and
  neither the "no entry" rule nor 0 keeps anyone out; 5 still limits a signed-in person to reading.
- **An empty list.** What a share with no entries and guest access off lets a signed-in person do is
  the UX audit's V6, not yet observed. This design does not depend on the answer: a folder is not
  shared over SMB with guest access off until at least one person or group has access, and the last
  access cannot be removed while it is shared that way (0.9, section 17, P8).

**How the interface maps the three choices** (section 17, P7):

| The interface shows | Stored as | Why |
| --- | --- | --- |
| **Read and write** | 7 | |
| **Read only** | 5 | |
| **No access** | **no entry** | With guest access off, no entry already keeps a person out (while someone has access). Storing 0 for everyone not chosen would also refuse the members of any group given access, which is never what "No access" on a person's row means |
| **Blocked** (only on a row whose stored value is already 0, set in the classic interface) | 0, kept | Shown so that nothing is hidden: "Blocked: cannot open it, even through a group." It can be changed to any of the other three; it cannot be chosen anew here |

**People and groups offered** are those of `UserMgmt.getUserList` and `UserMgmt.getGroupList`. Both
list only accounts that are not system accounts (read from source). The web interface's administrator
account is refused by `setPrivileges` (read from source: it may not have shared-folder access); if it
appears in the list it is not offered **[verify]** whether it is listed. The group every person
belongs to (`users`, made by OMV for every account) is a system group and is not listed **[verify]**.

**Entries for accounts that are not listed** (a person since deleted, or a system account given access
elsewhere) cannot be shown on a row. `setPrivileges` refuses an entry for an account that no longer
exists (read from source), and the classic page drops entries it does not list when it saves. So the
grid says, under the table: "{{count}} entries for accounts that are not on this list will be removed
when you save: {{names}}." and saving drops them, as the classic interface does (section 16, D9).

**Groups and people together.** A person's row says when a group gives them more than their own row:
"Also gets {{access}} as a member of {{group}}." (from `getUserList`'s `groups` and the group rows),
so that "No access" on a person never looks like a promise the group breaks. Blocked says the
opposite: "Blocked: cannot open it, even through {{group}}." **[verify]** the effective result of each
combination on the VM (14.2).

**File permissions on the disk.** A folder this interface creates gets mode 770 (Q4): the owner and
the group every person belongs to may read and write, and nobody else may. So for folders made here,
access as shown here is what decides. For a folder made elsewhere, its file permissions on the disk
may stop someone the access list lets in, or (with guest access) let in more than intended; this page
cannot read them without `ShareMgmt.getFileACL` (11.0). The page says it once, in 3.1, with
`ExternalLink` "File permissions in the classic interface".

**Guests and folders made here.** A guest is let in as the NAS's guest account, which is not in the
group a 770 folder allows. So **a guest can see a folder made here but not open it** **[verify]** on
the VM (14.2). The guest-access option says so before it is turned on (4.3).

### 0.5 Names and the folder on the disk

**A new shared folder's name** (section 17, P5) is checked in the browser, then by the server:

| Rule | Said to the reader when it fails |
| --- | --- |
| 1 to 80 characters (OMV's limit) | "Use 1 to 80 characters." |
| None of `" \ / [ ] : \| < > + = ; , * ?`, no control characters, no space at the start or end (OMV's share-name rule, the same as Windows') | "A name cannot contain any of these: \" \\ / [ ] : \| < > + = ; , * ?, and cannot start or end with a space." |
| Not starting with a full stop, not containing two full stops in a row | "A name cannot start with a full stop or contain two in a row." (a leading full stop hides the folder on the NAS and in the share; OMV refuses ".." anywhere in the folder's path, and the folder is named after the shared folder) |
| Not `global`, `homes`, `printers`, `print$` or `ipc$`, case ignored | "{{name}} is a name Windows and Mac sharing keeps for itself. Choose another name." (these name Samba's own sections and services) **[verify]** what OMV does with a folder called `homes` |
| Not the name of another shared folder, **case ignored** | "There is already a shared folder called {{other}}." (OMV checks exact names; Windows and Mac computers do not tell `Photos` from `photos`) |

Right-to-left text and other scripts are allowed, as OMV allows them; the name is shown with
`dir="auto"` everywhere.

**The name cannot be changed after the folder is made** (section 17, P5). OMV's server would allow
it, but the classic interface does not offer it: the name is the folder's network name
(`\\NAS_HOST\Photos`), so computers that mapped it, backup jobs on other computers and Time Machine
would stop finding it. The page says: "The name is also its network address, so it cannot be changed.
To use another name, add a new shared folder for the same folder on the disk, move what uses it, then
remove the old one and keep its files."

**The folder on the file system.** By default the shared folder uses a folder with its own name at the
top of the file system (`{{name}}/`, the classic form's own default). "Use another folder" opens one
text field, "Folder on the file system", for a path inside it:

- one to eight parts separated by `/`, each part 1 to 255 characters, none of them `.` or `..`, no
  part starting with a full stop, no control characters, no `\`; a leading or trailing `/` is
  removed; `/` alone means the whole file system and needs its own tick: "Share the whole file
  system" with the hint "Every folder on it can then be reached through this shared folder.";
- not the folder of another shared folder on the same file system ("{{other}} already uses this
  folder.", which OMV refuses too);
- there is no folder browser here (OMV's folder browser method is not cleared and not needed), so the
  hint says: "The folder is made if it does not exist. If it already exists, it is used as it is, with
  its files and its own file permissions."

The interface sends the path with no leading slash; OMV adds the trailing slash itself (read from
source) and the page strips it for display.

### 0.6 Which file systems can hold a shared folder

A shared folder may only be made on a file system that is **mounted now** (B7): OMV's `set` does not
check, and on a file system that is set up but not mounted it would make the folder on the system
drive instead (B8, V1). OMV's own list of candidates (`ShareMgmt.getCandidates`, 11.0) offers only
mount entries that are mounted now, are not bind mounts, and whose file system type can hold a shared
folder (read from source), and it gives each mount entry's identifier, which `set` needs. **The
stricter of that list and this interface's own reading wins**, as everywhere in storage:

| Group | A file system is here when | Shown as |
| --- | --- | --- |
| **Offered** | It is in `getCandidates`, its `FileSystemMgmt.getList` row is mounted and not Critical (the file-systems slice's 0.2), and it is not the system drive | Its name (0.2), type, and "{{free}} free" from `FileSystemMgmt.getList`; the one Flow A handed over is chosen; one offered file system is chosen; otherwise none |
| **Full** | Offered, but at or past its warning level, or Critical by fullness | Offered, with the Warning or Critical pill and its level sentence beside it ("Almost full: {{free}} free.") |
| **Cannot be used** | Any other `FileSystemMgmt.getList` row: not mounted, missing, read-only **[verify]** how a read-only mount appears, being created, the system drive | Not offered; a `Disclosure` "File systems that cannot hold a shared folder ({{count}})", each with its reason: "Not mounted.", "Missing.", "This is the system drive. Shared folders belong on a data disk." |

- **The system drive** is refused (section 17, P4): OMV offers it only when an add-on mounts it, and a
  shared folder there fills the drive the NAS itself runs from.
- **Fail closed**: if `getCandidates` or `FileSystemMgmt.getList` fails, nothing is offered:
  `EmptyState variant="error"` "Could not check which file systems can hold a shared folder." + server
  message + "Try again".
- **No file system offered**: `EmptyState variant="empty"`: "No file system can hold a shared folder
  yet. Add storage first: a disk with a file system, mounted." with router link "Add storage" → Flow A.
- **Without `getCandidates`** (if the owner does not clear it): the identifier is read with
  `FsTab.getByFsName` for each mounted file system, which refuses ZFS names (journal, 2026-11-22), so
  ZFS file systems could not hold a new shared folder from here, and the check that OMV can hold a
  shared folder on that type of file system is the interface's own guess (11.0).

### 0.7 What uses a shared folder

`_used` on a `getList` row is true when **any** setting refers to the folder (OMV's yes-or-no, B10).
Read from source, these can: an SMB share, an NFS share, an Rsync server module, a backup (Rsync) job
as source or destination, the user home folders setting, and add-ons (FTP, USB backup, antivirus,
media servers and others). The page names what it can read, with the library's `UsedByPanel`
(Pattern G):

- **Its SMB share**: the `SMB.getShareList` row (0.3), by name, with what it is: "Shared with Windows
  and Mac computers."
- **Something else**: `_used` is true and the folder has no SMB share. When it has one, `_used` is
  true because of it and cannot say whether anything else refers to the folder as well (B10). The
  panel then says nothing more, and the delete dialog finds out (below). Otherwise it says: "Used by a setting
  this page does not show: an NFS share, a backup job, the Rsync server, the home folders setting or
  an add-on. Look in the classic interface." with no link (section 17, P15).
- **Could not check**: a read failed: the panel's retry form. Deleting waits for it.

The panel cannot tell "only its SMB share" from "its SMB share and something else". So the delete
dialog (section 8) re-reads after the SMB share is removed, and refuses if `_used` is still true.

### 0.8 Pending changes in this slice

Read from source; every set **[verify]** by `dirtyModules` after each call on the VM (14.2):

| Action | Marks pending | Applied by |
| --- | --- | --- |
| Create a shared folder (`ShareMgmt.set`, new) | `sharedfolders`, `systemd`. **The folder on the disk is made at once** (B5) | The add flow's checkpoint |
| Change the description, or where it points (`ShareMgmt.set`, existing) | `sharedfolders`, `systemd`; also `samba` when it has an SMB share, and `nfs` with `fstab`, `rsync` or `rsyncd` when those use it | The band |
| Save access (`ShareMgmt.setPrivileges`) | `sharedfolders`, `systemd`; `samba` when it has an SMB share; `rsyncd` when a module uses it | The band, or the add flow's checkpoint |
| Share it, change its options, turn it on or off for this folder, stop sharing (`SMB.setShare`, `SMB.deleteShare`) | `samba`, `avahi` (the network-discovery module, which OMV also calls `zeroconf`) | The band, or the add flow's checkpoint |
| Turn Windows and Mac sharing on or off (`SMB.setSettings`) | `samba`, `avahi` | The band, or the add flow's checkpoint |
| Delete a shared folder (`ShareMgmt.delete`) | `sharedfolders`, `systemd`. **With its files, they are deleted at once** | The dialog's own last step (below) |

Module words already in the catalogue: `samba` "SMB/CIFS", `sharedfolders` "Shared folders",
`systemd` "System services", `avahi` "Network discovery (Zeroconf)", `nfs`, `fstab`, `rsync`,
`rsyncd`. The band changes `modules.samba` to "Windows and Mac sharing (SMB)" (section 16, D11); the
others stay.

**Why deleting applies its own changes**, as the ZFS slice's deletions do (its 0.9): a deleted shared
folder leaves "Shared folders, System services" pending, which would puzzle anyone, and Undo in the
band brings back the folder's record but never its files. So the delete dialog refuses to start while
other changes are pending, offering to apply or undo them first, and after the deletion it applies
exactly what the deletion left pending (R10 re-reads first and asks when something new appeared). This
holds for both ways of deleting, so that one rule is learnt (section 17, P14).

**The add flow applies once**, at its checkpoint "Save and share" (R10, then `Config.applyChangesBg`),
after refusing to start while anything else is pending (Q2). Everything else in this slice is a saved
setting and goes to the band, as any setting does.

**The pending mark** appears on a folder's page beside the section whose save is not applied yet
(access, sharing, description), when its module is pending and this session saved it since the last
apply; on the list, beside the folder's name for a folder this session changed; on the SMB page,
beside the on or off line.

### 0.9 The interface's own refusals

OMV refuses some things itself (read from source): a name or path already taken, `..` in the path,
deleting a folder anything refers to, deleting the files when another shared folder uses the same
folder or one inside it, access for an account that does not exist or for the web administrator, a
second SMB share for the same folder, and turning SMB on when the NAS's name is longer than 15
characters. Every refusal below is **also** the interface's own (journal, 2026-11-21), checked before
the call and again at its first step, and a refusal offers no classic link that would do the same
thing without the check (section 17, P15).

| Action | Refused when | Section |
| --- | --- | --- |
| Add a shared folder | No file system offered (0.6); a name or path 0.5 refuses; the reads these rules need failed | 6 |
| Share over SMB with guest access off | Nobody has Read and write or Read only (0.4), and the reader has not given anyone access in the same form | 4, 6 |
| Save access | It would leave nobody with access while the folder is shared over SMB with guest access off | 3 |
| Turn Windows and Mac sharing on | The NAS's name is longer than 15 characters (read from `System.getInformation`'s `hostname`) | 5 |
| Change where it points | The folder is OK (section 7 is for repair only); a path 0.5 refuses; the file system is not offered by 0.6 | 7 |
| Delete, keeping the files | Anything uses it besides its own SMB share (0.7); the reads failed | 8 |
| Delete with every file in it | The same, and: it is not OK (its folder cannot be found, so the page cannot say what would be deleted); its file system is not mounted or not OK; it is the whole file system (`/`); another shared folder uses the same folder or one inside it (read from `getList`, as OMV refuses); it is on the system drive | 8 |
| Any of them | An action on this folder is already running in this session; the folder changed since the page was read (by its `uuid`, `name`, `mntentref` and `reldirpath`) | all |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message.

### 0.10 Writing settings back

OMV's SMB methods replace the whole object (B11), so every write is **read, change, write** (R4), with
the read made immediately before the write:

- **`SMB.setShare` on an existing share** sends the row just read from `getShareList` with only the
  fields this page changes (`enable`, `browseable`, `readonly`, `guest`), everything else as read:
  recycle bin, Time Machine, symbolic links, extra options and the rest keep their values. The
  computed `sharedfoldername` is left out **[verify]** that OMV refuses it, as the source suggests.
  The other fields of the row that are outside the method's datamodel (`macoscompat`,
  `timemachinemaxsize`, `transportencryption`, `followsymlinks`, `widelinks`) are sent too, because
  OMV builds a fresh object and would otherwise reset them to their defaults (read from source)
  **[verify]**.
- **`SMB.setShare` for a new share** sends the classic form's own defaults for everything this page
  does not ask (section 16, D5): enabled; not read only; shown in the network list; guest access off;
  no recycle bin (size and age 0); hide dot files on; inherit ACLs and permissions off; extended
  attributes on; DOS attributes off; no hosts allow or deny; no audit; no Time Machine; no extra
  options; follow symbolic links on, wide links off; macOS compatibility and transport encryption off.
- **`SMB.setSettings`** sends the whole `getSettings` reply with only `enable` changed **[verify]** that
  the fields outside the method's datamodel (home-folder options, `netbios`, `minprotocol`) are
  accepted and kept, as the source reads.
- **`ShareMgmt.set` on an existing folder** sends `uuid`, `name`, `comment`, `mntentref` and
  `reldirpath` from the `getList` row just read, with the change; OMV keeps the access list itself
  (read from source). When the path changes (section 7), `mode` 770 is sent too, so a folder made
  there gets the same file permissions as a new one.
- **`ShareMgmt.setPrivileges`** sends the whole list as the grid now shows it, built on the folder's
  `privileges` read just before (0.4). If those changed since the grid was opened (another
  administrator), the save stops: "Access to {{folder}} was changed elsewhere since you opened this
  page." with "Show the current access" (re-read; the reader's changes are kept and marked where they
  differ).
- **A second administrator** saving the same object between the read and the write is not detected by
  OMV; the interface narrows the window, as every slice does (R4), and says nothing it cannot know.

---

## 1. Storage > Shared folders

**Question it answers:** which folders are shared, how computers reach them, and is any of them
broken? **Leads to:** a folder's page; adding a shared folder.

Administrators only. Route `/storage/shared-folders` (exists). Phase 3's page (its section 4) is kept
whole: server-side search, sort and paging, the table state in memory for the session, the roll-up,
the status words, the states. This section lists only what changes.

### 1.1 Data

- `ShareMgmt.getList` (exists), paged on the server, and the roll-up's whole-list read (exists).
- `SMB.getShareList` (new, cleared), the whole list (`limit: null`, all five paging fields sent, as
  section 11 says), for the new Sharing column; read with the table, on Refresh and on window focus.
- `SMB.getSettings` (new, cleared), for whether Windows and Mac sharing is on.
- `System.getInformation` (the shell's), for the host name in addresses and `dirtyModules`.

`SMB.getShareList` failing does not hide the table: the Sharing column says "Not known" on every row
and a line above the table says "Could not read which folders are shared with Windows and Mac
computers." + server message + "Try again".

### 1.2 Layout

1. Page title "Shared folders".
2. Intro, changed: "Folders on your file systems that other computers can reach over the network.
   Open a folder to choose who may use it and how computers reach it."
3. **Windows and Mac sharing line**, only when it is off: `text-sm`, the Disabled pill and "Windows and
   Mac sharing is off, so no folder can be reached from Windows or Mac computers." with router link
   "Open Windows and Mac sharing" → `/services/smb`.
4. Problem roll-up (Phase 3's, unchanged).
5. **Unfinished work** (1.5), only when found.
6. Toolbar: search (unchanged); on the trailing side **"Add a shared folder"**, now a filled primary
   router link to `/storage/shared-folders/add` (it was an external link).
7. The table (1.3).
8. Footer: pagination and the last-refreshed line (unchanged); then, `text-sm muted-foreground`:
   "NFS shares, file permissions on the disk and the advanced SMB options are in the classic
   interface." with `ExternalLink` "Shared folders in the classic interface" →
   `/#/storage/shared-folders`.

### 1.3 Columns

| Order | Header | Change |
| --- | --- | --- |
| 1 | Name | Now a router link to the folder's page, accessible name "Open shared folder {{folder}}"; the pending mark after it when this session changed it and the change is pending |
| 2 | Status | Unchanged |
| 3 | File system | Unchanged |
| 4 | **Sharing** (new) | "Windows and Mac" when its SMB share is enabled and SMB is on; "Windows and Mac (off)" when the share is set up but the share or SMB is off; "Guests too" on a second line, `text-sm`, when guest access is on; empty when not shared. Not sortable (it is not a server field) |
| 5 | Path, Full path, Description, In use | Unchanged. "In use" keeps its footnote |

The table stays sortable by server fields only. At under 640px the table shows Name and Status as
columns, with the file system, the sharing words and the path on a second line under the name, as the
RAID and ZFS lists do.

### 1.4 States

Phase 3's states, with two changes:

- **Empty** (no folders, no search): "There are no shared folders yet. A shared folder is a folder on
  one of your file systems that other computers can reach over the network." Action: router link
  "Add a shared folder" (was the classic link).
- **The Sharing column's read failed**: 1.1.

### 1.5 Unfinished work (R8)

The add flow's journal lives in memory, so a reload ends the flow view. The list recognises from
server state:

| Found | Line | Action |
| --- | --- | --- |
| A folder this session created, `sharedfolders` still pending | "{{folder}} is made, but the NAS has not saved it yet. Apply the pending changes so it can be used." | none: the band carries Apply |
| A folder this session created with an SMB share chosen, and no SMB share for it | "{{folder}} is not shared with Windows and Mac computers yet." | Router link "Share it" → its page, sharing section |
| A folder this session created whose status is not OK | "{{folder}} was set up, but its folder could not be made on the disk." | Router link "Open {{folder}}" (section 8 offers "Remove it and keep any files") |

### 1.6 Keyboard

Phase 3's tab order, with the SMB line's link after the intro, the unfinished-work actions before the
toolbar, and each row's name link before its copy button.

### 1.7 Copy (new or changed keys only)

| Key | English |
| --- | --- |
| `sharedFolders.intro` | Folders on your file systems that other computers can reach over the network. Open a folder to choose who may use it and how computers reach it. |
| `sharedFolders.add` | Add a shared folder |
| `sharedFolders.open` | Open shared folder {{folder}} |
| `sharedFolders.col.sharing` | Sharing |
| `sharedFolders.sharing.smb` | Windows and Mac |
| `sharedFolders.sharing.smbOff` | Windows and Mac (off) |
| `sharedFolders.sharing.guests` | Guests too |
| `sharedFolders.sharing.unknown` | Not known |
| `sharedFolders.sharing.loadFailed` | Could not read which folders are shared with Windows and Mac computers. |
| `sharedFolders.smbOff` | Windows and Mac sharing is off, so no folder can be reached from Windows or Mac computers. |
| `sharedFolders.smbOffLink` | Open Windows and Mac sharing |
| `sharedFolders.empty` | There are no shared folders yet. A shared folder is a folder on one of your file systems that other computers can reach over the network. |
| `sharedFolders.footerLine` | NFS shares, file permissions on the disk and the advanced SMB options are in the classic interface. |
| `sharedFolders.classicLink` | Shared folders in the classic interface |
| `sharedFolders.unfinished.notSaved` | <folder></folder> is made, but the NAS has not saved it yet. Apply the pending changes so it can be used. |
| `sharedFolders.unfinished.notShared` | <folder></folder> is not shared with Windows and Mac computers yet. |
| `sharedFolders.unfinished.shareIt` | Share it |
| `sharedFolders.unfinished.noDir` | <folder></folder> was set up, but its folder could not be made on the disk. |
| `sharedFolders.unfinished.open` | Open {{folder}} |

The Phase 3 keys `sharedFolders.addClassic` and the old intro are removed.

---

## 2. A shared folder's page

**Question it answers:** can this folder be reached, where is it, who may use it, and how do computers
reach it? **Leads to:** changing access, sharing it with Windows and Mac computers or stopping,
repairing where it points, deleting it.

Administrators only. Route `/storage/shared-folders/$folder`, where `$folder` is the folder's `uuid`
(section 16, D1). The address is checked against the UUID pattern before anything is read; the page
then finds the row of the whole-list `getList` read whose `uuid` matches exactly, and every later call
uses that row's fields, never the address (UI-4). A value that fails the pattern or names no row shows
the not-found state and makes no folder-specific call. No menu item of its own; Shared folders is
current while it is open.

### 2.1 Data on opening

In parallel:

- `ShareMgmt.getList`, the whole list (the roll-up's read, shared and often warm), for this folder's
  row and for the name and path rules (0.5, 0.9);
- `SMB.getShareList` and `SMB.getSettings` (1.1, shared), `Services.getStatus` (the monitoring
  domain's), for 0.3;
- `UserMgmt.getUserList` and `UserMgmt.getGroupList` (new, cleared), whole lists, for the access grid
  (section 3);
- `FileSystemMgmt.getList` (exists, shared), for the file system's own state and free space (0.3);
- `System.getInformation` (the shell's), for the host name and `dirtyModules`.

Re-read on Refresh, after an action this page started ends, and on window focus (so a change made in
the classic tab shows on return), but **never while the access grid or the sharing options hold
unsaved changes** (the reader's work is not overwritten; "Refresh" then asks first, 2.8).

### 2.2 Layout

1. **Breadcrumbs**: "Shared folders" (router link) › `{{folder}}` (current page).
2. **Page title**: "{{folder}}". Under it, `text-sm muted-foreground`: "Shared folder on {{fs}}".
3. **State line** (`role="status"`, polite): the worse of the folder's and its file system's pills,
   with the reason (0.3). Nothing more when OK.
4. **What to do now** (2.4), only when there is something to do.
5. **Summary card** (2.3).
6. **Who can use it** (section 3), `h2` "Who can use it".
7. **Windows and Mac computers** (section 4), `h2` "Windows and Mac computers".
8. **Used by** (2.5), `h2` "Used by", only when anything besides its SMB share uses it, or a read
   failed.
9. After a divider and a 24px gap: **"Delete this shared folder"** (section 8).

One column; at 1024px and wider the summary facts take two columns. Document title: "{{folder}} –
Shared folders – openmediavault".

### 2.3 Summary card

A `FactList`:

| Label | Value |
| --- | --- |
| State | 0.3's pill and reason |
| File system | `{{fs}}` as a router link to its page (the file-systems slice's address rule; a ZFS file system to its ZFS page), with its type and "{{free}} free" |
| Folder on the file system | `{{path}}`, or "The whole file system" |
| Full path on the NAS | `{{fullPath}}` with `CopyButton` (Phase 3's rule; "Not available" when empty) |
| Network address | Only when shared over SMB and SMB is on: both forms of `{{address}}`, each with `CopyButton`, and under them, `text-sm muted-foreground`: "If a computer cannot find {{host}}, use the NAS's network address in place of the name." |
| Description | The `comment`, or "None", with an "Edit" button that turns the value into a `TextField` with "Save" and "Cancel" (2.6) |
| Name | Not repeated (it is the title); under the facts, `text-sm muted-foreground`, 0.5's sentence that the name cannot be changed, behind a `Disclosure` "Why can't I rename it?" |

### 2.4 What to do now

A `Card` with an `h3`, shown for the first case that applies:

| Case | Heading | Body and actions |
| --- | --- | --- |
| `ENOENT_DB_MNTENT` | "Its file system is gone" | "{{folder}} pointed at a file system that is no longer set up on this NAS. If the disk is still connected, set the file system up again under File systems. Otherwise point this shared folder at another file system, or delete it." Buttons "Point it somewhere else…" (section 7) and a router link "Open File systems" |
| `ENOENT`, file system Missing or not mounted | "Its file system is not mounted" | "The file system {{fs}} is not mounted, so the folder cannot be reached. Connect its disk, then open the file system's page." Router link "Open {{fs}}" |
| `ENOENT`, file system mounted | "Its folder is missing" | "The folder {{path}} is not on {{fs}} any more. It may have been renamed or deleted on the disk. Point this shared folder at the right folder, or delete it." Button "Point it somewhere else…" |
| `ENOTDIR` | "It points at a file" | "{{path}} on {{fs}} is a file, not a folder. Point this shared folder at a folder." Button "Point it somewhere else…" |
| Shared over SMB with guest access off, nobody has access | "Nobody can open it yet" | "It is shared with Windows and Mac computers, but no person or group has access. Give someone access below." (this occurs only when set up elsewhere: 0.9 keeps the interface from making it) |
| SMB share set up, Windows and Mac sharing off | "Windows and Mac sharing is off" | "This folder is set up for Windows and Mac computers, but sharing is off for the whole NAS." Router link "Open Windows and Mac sharing" |
| SMB on but not running (0.3 Critical) | "Windows and Mac sharing is not running" | 0.3's words and the router link to the SMB service details |

### 2.5 Used by

`UsedByPanel` with 0.7's entries. Shown only when the folder has a user besides its own SMB share
(which section 4 already shows), or when a read failed (the retry form). An NFS share, a backup job,
the home folders setting and add-ons are one entry, 0.7's sentence, until their reads are cleared
(11.3).

### 2.6 Editing the description

`ShareMgmt.set` with the fields of 0.10. The field: label "Description", optional, at most 255
characters **[verify]** OMV's limit (the datamodel sets none; 255 keeps it on one screen), hint "Shown
in the list, to help you tell folders apart. It is not shown to other computers." Enter in the field
saves; Escape cancels. Saved: the value returns to text, a toast "Description saved.", the band
appears, focus returns to "Edit". Failed: the field stays with the server's message below it.

### 2.7 States of the page

| State | Look |
| --- | --- |
| Loading | The title from the address is not shown (it is only an identifier); a skeleton of the summary card and the two section headings; "Loading the shared folder…" for assistive technology |
| Not found (pattern fails, or no row) | `EmptyState variant="empty"`: "This shared folder does not exist. It may have been deleted." with router link "Go to Shared folders". No further call |
| `getList` failed | `EmptyState variant="error"`: "Could not read this shared folder." + server message + "Try again" |
| A section's own read failed (users and groups, SMB) | That section shows its error in place (sections 3 and 4); the rest of the page stays |
| Refreshing | The page stays with `aria-busy`; afterwards "Read at {{time}}" is announced |
| Populated | As 2.2 |

### 2.8 Keyboard and focus

Tab order follows 2.2: breadcrumbs, the What to do now actions, the summary's links, copy buttons and
Edit, the access grid (section 3), the sharing section (section 4), Used by, the delete section. On
arrival focus is on the page title. Refresh with unsaved changes opens a plain dialog: "You have
changes that are not saved. Refresh anyway and lose them?" with "Keep my changes" (focused) and
"Refresh and lose them". Leaving the page with unsaved changes asks the same, through the router's
block (the file-systems slice's warning-level form does the same).

### 2.9 Copy

| Key | English |
| --- | --- |
| `sharedFolder.docTitle` | {{folder}} – Shared folders – openmediavault |
| `sharedFolder.subtitle` | Shared folder on <fs></fs> |
| `sharedFolder.loading` | Loading the shared folder… |
| `sharedFolder.notFound` | This shared folder does not exist. It may have been deleted. |
| `sharedFolder.toList` | Go to Shared folders |
| `sharedFolder.loadFailed` | Could not read this shared folder. |
| `sharedFolder.fact.state` | State |
| `sharedFolder.fact.fs` | File system |
| `sharedFolder.fact.fsValue` | {{type}}, {{free}} free |
| `sharedFolder.fact.path` | Folder on the file system |
| `sharedFolder.fact.wholeFs` | The whole file system |
| `sharedFolder.fact.fullPath` | Full path on the NAS |
| `sharedFolder.fact.address` | Network address |
| `sharedFolder.fact.addressWindows` | From Windows |
| `sharedFolder.fact.addressMac` | From a Mac |
| `sharedFolder.fact.addressHint` | If a computer cannot find {{host}}, use the NAS's network address in place of the name. |
| `sharedFolder.copyAddress` | Copy the address of {{folder}} |
| `sharedFolder.fact.description` | Description |
| `sharedFolder.fact.descriptionNone` | None |
| `sharedFolder.description.edit` | Edit |
| `sharedFolder.description.label` | Description |
| `sharedFolder.description.hint` | Shown in the list, to help you tell folders apart. It is not shown to other computers. |
| `sharedFolder.description.save` | Save |
| `sharedFolder.description.cancel` | Cancel |
| `sharedFolder.description.saved` | Description saved. |
| `sharedFolder.description.tooLong` | Use at most 255 characters. |
| `sharedFolder.rename.why` | Why can't I rename it? |
| `sharedFolder.rename.body` | The name is also its network address, so it cannot be changed. To use another name, add a new shared folder for the same folder on the disk, move what uses it, then remove the old one and keep its files. |
| `sharedFolder.todo.fsGone.title` | Its file system is gone |
| `sharedFolder.todo.fsGone.body` | <folder></folder> pointed at a file system that is no longer set up on this NAS. If the disk is still connected, set the file system up again under File systems. Otherwise point this shared folder at another file system, or delete it. |
| `sharedFolder.todo.notMounted.title` | Its file system is not mounted |
| `sharedFolder.todo.notMounted.body` | The file system <fs></fs> is not mounted, so the folder cannot be reached. Connect its disk, then open the file system's page. |
| `sharedFolder.todo.missing.title` | Its folder is missing |
| `sharedFolder.todo.missing.body` | The folder <path></path> is not on <fs></fs> any more. It may have been renamed or deleted on the disk. Point this shared folder at the right folder, or delete it. |
| `sharedFolder.todo.notDir.title` | It points at a file |
| `sharedFolder.todo.notDir.body` | <path></path> on <fs></fs> is a file, not a folder. Point this shared folder at a folder. |
| `sharedFolder.todo.nobody.title` | Nobody can open it yet |
| `sharedFolder.todo.nobody.body` | It is shared with Windows and Mac computers, but no person or group has access. Give someone access below. |
| `sharedFolder.todo.smbOff.title` | Windows and Mac sharing is off |
| `sharedFolder.todo.smbOff.body` | This folder is set up for Windows and Mac computers, but sharing is off for the whole NAS. |
| `sharedFolder.todo.smbDown.title` | Windows and Mac sharing is not running |
| `sharedFolder.todo.repoint` | Point it somewhere else… |
| `sharedFolder.todo.openFs` | Open {{fs}} |
| `sharedFolder.todo.openFsList` | Open File systems |
| `sharedFolder.usedBy.title` | Used by |
| `sharedFolder.usedBy.other` | Used by a setting this page does not show: an NFS share, a backup job, the Rsync server, the home folders setting or an add-on. Look in the classic interface. |
| `sharedFolder.unsaved.title` | You have changes that are not saved. |
| `sharedFolder.unsaved.body` | Refresh anyway and lose them? |
| `sharedFolder.unsaved.leaveBody` | Leave this page and lose them? |
| `sharedFolder.unsaved.keep` | Keep my changes |
| `sharedFolder.unsaved.refresh` | Refresh and lose them |
| `sharedFolder.unsaved.leave` | Leave and lose them |
| `shares.term.sharedFolder` | A shared folder is a folder on one of your file systems that you can reach from other computers. Making one does not share it yet: you also choose who may use it and how computers reach it. |
| `shares.term.smb` | Windows and Mac computers reach shared folders over SMB, the file-sharing method both understand. Linux computers can use it too. |
| `shares.term.smbService` | Windows and Mac sharing must be on for any folder to be reached from those computers. |
| `shares.term.access` | Access decides who may open this folder from another computer, and whether they may change its files. |
| `shares.term.group` | A group is a set of people. Access given to a group applies to everyone in it. |
| `shares.term.path` | The folder this shared folder uses, inside its file system. |

---

## 3. Who can use it (access)

On a folder's page (2.2, item 6) and, in the same component, in the add flow (section 6).

### 3.1 The section

1. `h2` "Who can use it", and under it, `text-sm`: "Choose who may open this folder from other
   computers. Anyone not given access cannot open it." (with guest access on, the sentence of 4.3
   replaces the second half).
2. **The access grid** (`AccessGrid`, new in the library, section 12).
3. Under the grid: the change count and "Save access" / "Discard changes" (3.3).
4. `text-sm muted-foreground`, always: "Access applies when the folder is opened from another
   computer. The folder's file permissions on the NAS can also stop people. Folders made in this
   interface let in everyone given access here; for others, file permissions are shown and changed in
   the classic interface." with `ExternalLink` "File permissions in the classic interface" →
   `/#/storage/shared-folders` (the classic page is reached from the folder's row there; a deep link
   would need the folder's identifier in a classic route, which is fine under UI-3 since it is built
   from the row, but the classic route's form is **[verify]**).

### 3.2 The grid

A table, one row per group and person from `getGroupList` and `getUserList`, **groups first** then
people, each in natural order of name (the UX audit's 1000-account probe). Each row:

| Column | Display |
| --- | --- |
| Name | `{{name}}` in `Identifier`; for a person with a description (`comment`), that under it in `text-sm muted-foreground`. 0.4's group line under it when a group gives more ("Also gets Read and write as a member of family.") |
| Kind | "Group" or "User" (words, not icons) |
| Access | A radio group of three options shown as a segmented control: **Read and write**, **Read only**, **No access** (a fourth, **Blocked**, only on a row stored as 0). One tab stop per row; arrow keys move within it; its accessible name is "Access for {{name}}". The row's current saved value carries no colour; a changed row has a neutral "Changed" word after the control and the row's leading edge in `border-control` |

Above the grid, in a `TableToolbar`:

- `SearchField` "Search people and groups" (filters by name and description, in the browser; the
  lists are read whole).
- `Select` "Show": "Everyone" (default), "With access", "Changed".
- "Set all shown to" `Select` with the three choices and an "Apply to {{count}} shown" button. It
  changes only the rows shown (after search and filter) and never a Blocked row; it is a change in the
  grid, not a save.

At more than 50 rows the grid pages in the browser (`TablePagination`, 50 rows, the list page's
controls); search and filter work across all rows. A row count line: "{{shown}} of {{total}} people
and groups." 

**Rows the reader cannot change**, each in place, `aria-disabled` with the reason as text in the row:

- the web administrator account, if listed (0.4): "The web interface's administrator account cannot
  be given access to shared folders.";
- while saving: every row ("Saving…").

**Stale entries** (0.4): under the grid, only when there are any, 0.4's sentence with the names.

### 3.3 Saving

- **"Save access"** (filled primary within the section; it is the section's one primary) is available
  when anything changed; beside it "Discard changes" (neutral). The count line: "{{count}} changes not
  saved." (polite live region, updated after typing stops for 500 ms, not on every arrow press).
- On "Save access": the folder's row is re-read (0.10); then the refusal of 0.9 (nobody left while
  shared with guest access off) is checked: "{{folder}} is shared with Windows and Mac computers, so
  at least one person or group must keep access. To close it to everyone, stop sharing it first." with
  the save left undone and the changes kept. Otherwise `setPrivileges` with the whole list.
- Saved: toast "Access to {{folder}} saved.", the band appears (0.8), the changed marks clear, the
  pending mark appears beside the heading, focus stays on "Save access" (now unavailable, "Nothing to
  save.").
- Failed: an `InlineAlert` above the buttons with the server's message as text; every change is kept.
  OMV names the account it refused in its message (an account deleted meanwhile, or the
  administrator); the page re-reads the lists and marks that row.
- **No confirmation dialog** for taking access away (section 16, D10): nothing on the disk changes,
  the change reaches nobody until Apply, whose confirmation lists "Windows and Mac sharing (SMB)", and
  Undo in the band takes it back. The count line and the "Changed" filter make the change reviewable
  before saving.

### 3.4 States of the section

| State | Look |
| --- | --- |
| Loading (either list) | Skeleton rows (5); "Loading people and groups…" |
| Error | `EmptyState variant="error"` in the grid: "Could not read the people and groups on this NAS." + server message + "Try again". Saving is unavailable |
| Empty (no person and no group) | `EmptyState variant="empty"`: "There are no user accounts on this NAS yet, apart from the administrator. Add the people who will use shared folders, then give them access here." with `ExternalLink` "Users in the classic interface" → `/#/usermgmt/users` (until Flow B is built) |
| Filtered empty | "No people or groups match "{{search}}"." with "Clear the search" |
| Populated | The grid |

### 3.5 Copy

| Key | English |
| --- | --- |
| `access.title` | Who can use it |
| `access.intro` | Choose who may open this folder from other computers. Anyone not given access cannot open it. |
| `access.introGuests` | Choose who may open this folder from other computers. Guest access is on, so anyone on your network can open it without a password, whatever you choose here. |
| `access.rw` | Read and write |
| `access.ro` | Read only |
| `access.none` | No access |
| `access.blocked` | Blocked |
| `access.blockedHint` | Blocked: cannot open it, even through a group. |
| `access.blockedVia` | Blocked: cannot open it, even through {{group}}. |
| `access.viaGroup` | Also gets {{access}} as a member of {{group}}. |
| `access.rowLabel` | Access for {{name}} |
| `access.col.name` | Name |
| `access.col.kind` | Kind |
| `access.col.access` | Access |
| `access.kind.user` | User |
| `access.kind.group` | Group |
| `access.changed` | Changed |
| `access.search` | Search people and groups |
| `access.show` | Show |
| `access.show.all` | Everyone |
| `access.show.withAccess` | With access |
| `access.show.changed` | Changed |
| `access.setAll` | Set all shown to |
| `access.setAllApply_one` / `_other` | Apply to {{count}} shown / Apply to {{count}} shown |
| `access.count` | {{shown}} of {{total}} people and groups. |
| `access.adminRow` | The web interface's administrator account cannot be given access to shared folders. |
| `access.stale_one` / `_other` | {{count}} entry for an account that is not on this list will be removed when you save: {{names}}. / {{count}} entries for accounts that are not on this list will be removed when you save: {{names}}. |
| `access.changes_one` / `_other` | {{count}} change not saved. / {{count}} changes not saved. |
| `access.save` | Save access |
| `access.discard` | Discard changes |
| `access.saving` | Saving… |
| `access.nothing` | Nothing to save. |
| `access.saved` | Access to {{folder}} saved. |
| `access.lastAccess` | <folder></folder> is shared with Windows and Mac computers, so at least one person or group must keep access. To close it to everyone, stop sharing it first. |
| `access.changedElsewhere` | Access to <folder></folder> was changed elsewhere since you opened this page. |
| `access.showCurrent` | Show the current access |
| `access.network` | Access applies when the folder is opened from another computer. The folder's file permissions on the NAS can also stop people. Folders made in this interface let in everyone given access here; for others, file permissions are shown and changed in the classic interface. |
| `access.networkLink` | File permissions in the classic interface |
| `access.loading` | Loading people and groups… |
| `access.loadFailed` | Could not read the people and groups on this NAS. |
| `access.empty` | There are no user accounts on this NAS yet, apart from the administrator. Add the people who will use shared folders, then give them access here. |
| `access.emptyLink` | Users in the classic interface |
| `access.filtered` | No people or groups match "{{search}}". |
| `access.clearSearch` | Clear the search |

---

## 4. Windows and Mac computers (the folder's SMB share)

On a folder's page (2.2, item 7). One folder has at most one SMB share (read from source).

### 4.1 Not shared

`text-sm`: "Not shared with Windows and Mac computers." Then:

- the button **"Share with Windows and Mac computers…"** opens the **share form** (4.3) in place,
  under the line;
- in the form, while nobody has access and guest access is not ticked, "Share" is unavailable
  (`aria-disabled`, focusable) with the reason beside it: "Give at least one person or group access
  first, above." (0.9). Unsaved access changes in the grid do not count: access is saved first.

When Windows and Mac sharing is off for the NAS, the form says so and turns it on in the same save
(4.4).

### 4.2 Shared

A `FactList`:

| Label | Value |
| --- | --- |
| Shared as | `{{address}}` both forms with `CopyButton` (only when SMB is on), else 0.3's words |
| Shown in the network list | "Yes" or "No" |
| Read only for everyone | "Yes" or "No" |
| Guest access | "Off" or "On: anyone on your network can open it without a password." ("Guests only" when set in the classic interface: "Guests only: everyone who opens it is treated as a guest, so access per person does not apply.") |
| Other options | Only when any of the options this page does not offer differs from the defaults of 0.10: "Some options were set in the classic interface, such as the recycle bin. They are kept." |

Buttons: **"Change options…"** (neutral; opens the form, 4.3, filled with the share's values),
**"Stop sharing…"** (neutral, after a gap; 4.5). When the share is turned off for this folder
(`enable` false): "Turn it on" (neutral, a save to the band, no dialog: it restores what was set).

### 4.3 The share form

In place, under the section's line, a `form` with `h3` "Share with Windows and Mac computers" (or
"Change how it is shared"):

1. **"Show it in the network list"** (`CheckboxField`, default on). Hint: "Computers on your network
   see it when they browse the NAS. When this is off, it can still be opened by typing its address."
2. **"Read only for everyone"** (`CheckboxField`, default off). Hint: "Nobody can change files through
   this share, even people with Read and write access."
3. **"Also let in anyone on the network, without a password"** (`CheckboxField`, default **off**,
   never preselected, after a 16px gap so it reads as its own choice, Q6). Hint: "Anyone who can reach
   your network can then open it. Use this only for files you would show to any visitor." When ticked,
   the warning-shape neutral `InlineAlert` appears under it (not a pill, 0.3):
   - "Anyone on your network can open {{folder}} without a password. The No access choices above no
     longer keep anyone out."
   - for a folder this session created, or any folder made by this interface (its directory mode is
     not readable here, so the line is shown on every folder): "Folders made in this interface let in
     only the people given access, so guests may see the folder but not open it. To let guests open
     it, change its file permissions in the classic interface." **[verify]** what a guest sees (14.2)
   - "Guests only", set in the classic interface, is shown as ticked with the line "Guests only is set
     in the classic interface. Saving here changes it to also let in people who sign in." (section 17,
     P9).
4. Buttons: **"Share"** (filled; for a change "Save") and "Cancel".

**On "Share"**: re-read `getShareList`, `getSettings`, the folder's row (0.10); check 0.9; then
`SMB.setShare` (new: `uuid` the new marker, the folder's `uuid`, 0.10's defaults with the three
choices; change: the row as read with the three choices); and, when Windows and Mac sharing is off,
`SMB.setSettings` with `enable` true (4.4). The form closes, toast "{{folder}} is set to be shared.
Apply the changes to share it.", the band appears, focus moves to the section heading. Failed: the
form stays with the server's message; if `setShare` succeeded and `setSettings` failed, the message
says "{{folder}} is set up for Windows and Mac computers, but Windows and Mac sharing could not be
turned on." with "Try again" (only the second call).

### 4.4 Turning Windows and Mac sharing on from here

When SMB is off, the share form's last line, `text-sm`: "Windows and Mac sharing is off for the whole
NAS. Sharing this folder turns it on." For a NAS name longer than 15 characters: the "Share" button
is unavailable, with "Windows and Mac sharing needs a NAS name of 15 characters or fewer. This NAS is
called {{host}} ({{count}} characters). Change its name under Network in the classic interface."
(`ExternalLink` "Network settings in the classic interface" → `/#/network/general`). The NAS's name is
changed there, not here (it is the network domain's).

### 4.5 Stop sharing

**"Stop sharing…"** opens a `ConfirmDialog` (plain, not destructive: no file is touched, and it is
undone by sharing again, though the options set in the classic interface are lost):

1. Title: "Stop sharing {{folder}} with Windows and Mac computers?"
2. "Computers that use {{address}} cannot reach it after the changes are applied. The files stay on
   the NAS. Who can use it is kept."
3. When "Other options" (4.2) is shown: "The options set in the classic interface, such as the recycle
   bin, are removed with the share."
4. Buttons: "Cancel" (focused) and **"Stop sharing"** (filled primary; not the destructive form,
   since nothing is destroyed and sharing again restores access).

On confirm: `SMB.deleteShare` with the share's `uuid` (11.0); toast "{{folder}} will stop being
shared when you apply the changes.", the band. The button that opened the dialog is gone
afterwards, so focus moves to the section heading. **Without `deleteShare` cleared**, "Stop sharing" sets
`enable` false (`setShare`, read-modify-write) and the dialog's third line is replaced by "Its options
are kept, so you can turn it on again." (section 17, P11).

### 4.6 States

| State | Look |
| --- | --- |
| Loading | A skeleton line |
| `getShareList` or `getSettings` failed | `InlineAlert`: "Could not read how this folder is shared." + server message + "Try again". No sharing action is offered |
| Not shared / shared | 4.1 / 4.2 |
| Saving | The form's controls unavailable, "Share" shows "Saving…" |

### 4.7 Copy

| Key | English |
| --- | --- |
| `folderSmb.title` | Windows and Mac computers |
| `folderSmb.notShared` | Not shared with Windows and Mac computers. |
| `folderSmb.shared` | Shared with Windows and Mac computers as <address></address>. |
| `folderSmb.sharedSmbOff` | Set up for Windows and Mac computers, but Windows and Mac sharing is off. |
| `folderSmb.sharedDisabled` | Set up for Windows and Mac computers, but turned off for this folder. |
| `folderSmb.notApplied` | Not applied yet. |
| `folderSmb.share` | Share with Windows and Mac computers… |
| `folderSmb.needAccess` | Give at least one person or group access first, above. |
| `folderSmb.fact.sharedAs` | Shared as |
| `folderSmb.fact.browseable` | Shown in the network list |
| `folderSmb.fact.readonly` | Read only for everyone |
| `folderSmb.fact.guest` | Guest access |
| `folderSmb.fact.other` | Other options |
| `folderSmb.yes` | Yes |
| `folderSmb.no` | No |
| `folderSmb.guest.off` | Off |
| `folderSmb.guest.on` | On: anyone on your network can open it without a password. |
| `folderSmb.guest.only` | Guests only: everyone who opens it is treated as a guest, so access per person does not apply. |
| `folderSmb.otherOptions` | Some options were set in the classic interface, such as the recycle bin. They are kept. |
| `folderSmb.change` | Change options… |
| `folderSmb.stop` | Stop sharing… |
| `folderSmb.turnOn` | Turn it on |
| `folderSmb.form.titleNew` | Share with Windows and Mac computers |
| `folderSmb.form.titleChange` | Change how it is shared |
| `folderSmb.form.browseable` | Show it in the network list |
| `folderSmb.form.browseableHint` | Computers on your network see it when they browse the NAS. When this is off, it can still be opened by typing its address. |
| `folderSmb.form.readonly` | Read only for everyone |
| `folderSmb.form.readonlyHint` | Nobody can change files through this share, even people with Read and write access. |
| `folderSmb.form.guest` | Also let in anyone on the network, without a password |
| `folderSmb.form.guestHint` | Anyone who can reach your network can then open it. Use this only for files you would show to any visitor. |
| `folderSmb.form.guestWarn` | Anyone on your network can open <folder></folder> without a password. The No access choices above no longer keep anyone out. |
| `folderSmb.form.guestMode` | Folders made in this interface let in only the people given access, so guests may see the folder but not open it. To let guests open it, change its file permissions in the classic interface. |
| `folderSmb.form.guestOnly` | Guests only is set in the classic interface. Saving here changes it to also let in people who sign in. |
| `folderSmb.form.smbOff` | Windows and Mac sharing is off for the whole NAS. Sharing this folder turns it on. |
| `folderSmb.form.hostTooLong` | Windows and Mac sharing needs a NAS name of 15 characters or fewer. This NAS is called <host></host> ({{count}} characters). Change its name under Network in the classic interface. |
| `folderSmb.form.hostLink` | Network settings in the classic interface |
| `folderSmb.form.share` | Share |
| `folderSmb.form.save` | Save |
| `folderSmb.form.cancel` | Cancel |
| `folderSmb.form.saving` | Saving… |
| `folderSmb.saved` | {{folder}} is set to be shared. Apply the changes to share it. |
| `folderSmb.savedChange` | The sharing options of {{folder}} are saved. Apply the changes to use them. |
| `folderSmb.turnOnFailed` | <folder></folder> is set up for Windows and Mac computers, but Windows and Mac sharing could not be turned on. |
| `folderSmb.tryAgain` | Try again |
| `folderSmb.stop.title` | Stop sharing {{folder}} with Windows and Mac computers? |
| `folderSmb.stop.body` | Computers that use <address></address> cannot reach it after the changes are applied. The files stay on the NAS. Who can use it is kept. |
| `folderSmb.stop.options` | The options set in the classic interface, such as the recycle bin, are removed with the share. |
| `folderSmb.stop.optionsKept` | Its options are kept, so you can turn it on again. |
| `folderSmb.stop.cancel` | Cancel |
| `folderSmb.stop.confirm` | Stop sharing |
| `folderSmb.stopped` | {{folder}} will stop being shared when you apply the changes. |
| `folderSmb.loadFailed` | Could not read how this folder is shared. |

---

## 5. Services > SMB/CIFS: Windows and Mac sharing

**Question it answers:** is Windows and Mac sharing on and working, and which folders does it share?
**Leads to:** turning it on or off; a folder's page.

Administrators only. Route `/services/smb`; the existing menu item "SMB/CIFS" under Services gains the
route (section 10). The classic interface's SMB pages stay for the settings this page does not show.

### 5.1 Data

`SMB.getSettings`, `SMB.getShareList`, `ShareMgmt.getList` (whole, shared), `Services.getStatus`,
`System.getInformation` (the shell's). Refreshed on opening, Refresh, window focus and after a save.

### 5.2 Layout

1. Page title "Windows and Mac sharing". Under it, `text-sm muted-foreground`: "SMB/CIFS".
2. Intro: 0.1's `shares.term.smb`, and "Turn it on here, then share folders from their own pages."
3. **State line** (`role="status"`): 0.3's pill and words, and the pending mark when `samba` is pending.
4. **The switch card**: one line and one button. Off: "Windows and Mac sharing is off." with **"Turn
   on"** (filled; a save to the band, no dialog; the NAS-name rule of 4.4 applies and the button is
   then unavailable with that reason). On: "Windows and Mac sharing is on." with **"Turn off…"**
   (neutral, 5.3).
5. `h2` "Shared folders", and a table of the SMB shares: Folder (router link to its page, by
   `sharedfolderref` matched to a `getList` row; "A shared folder that no longer exists" when none,
   `ENOENT`-like, with no link **[verify]** whether `getShareList` fails outright in that case, as
   the source suggests), Address (`{{address}}` Windows form with `CopyButton`), Guest access ("Off",
   "On", "Guests only"), Read only, Shown in the network list, and "Turned off for this folder" when
   `enable` is false. Empty: "No folder is shared with Windows and Mac computers yet. Open a shared
   folder to share it." with router link "Open Shared folders".
6. Router link "Who is connected now" → `/diagnostics/services/smb` (the monitoring domain's page).
7. Footer, `text-sm muted-foreground`: "The workgroup, home folders, protocol versions and other
   options are in the classic interface." `ExternalLink` "SMB/CIFS settings in the classic interface"
   → `/#/services/smb/settings`.

### 5.3 Turning it off

`ConfirmDialog` (plain; it cuts access, nothing is lost, style guide 5.4 calls for naming what
depends on it, and no typing):

1. Title: "Turn off Windows and Mac sharing?"
2. "After the changes are applied, no shared folder can be reached from Windows or Mac computers:
   {{count}} folders are shared now ({{list}}, at most five names then "and {{more}} more"). The files
   stay on the NAS, and each folder keeps its sharing options for when you turn it on again."
3. "If you are using a shared folder from this computer, close its files first."
4. Buttons: "Cancel" (focused) and **"Turn off"** (filled primary; not the destructive form, since
   nothing is lost and turning it on again restores every share).

On confirm: `SMB.setSettings` with the whole `getSettings` reply, `enable` false (0.10). Toast "Windows
and Mac sharing will turn off when you apply the changes.", the band.

### 5.4 States

| State | Look |
| --- | --- |
| Loading | Skeletons of the state line, the switch card and three table rows; "Loading Windows and Mac sharing…" |
| `getSettings` failed | `EmptyState variant="error"`: "Could not read whether Windows and Mac sharing is on." + server message + "Try again". No switch |
| `getShareList` failed | The table's place: `EmptyState variant="error"` "Could not read the folders shared with Windows and Mac computers." + message + "Try again". The switch stays |
| Saving | The switch button shows "Saving…" |
| Populated | As 5.2 |

### 5.5 Keyboard

Tab order: the state line's link (when shown), the switch button, each row's folder link and copy
button, "Who is connected now", the footer link. After a save, focus stays on the switch button, now
showing the other verb.

### 5.6 Copy

| Key | English |
| --- | --- |
| `smb.title` | Windows and Mac sharing |
| `smb.subtitle` | SMB/CIFS |
| `smb.intro` | Turn it on here, then share folders from their own pages. |
| `smb.state.off` | Off. No folder can be reached from Windows or Mac computers. |
| `smb.state.on` | On. |
| `smb.state.down` | On, but not running. Shared folders cannot be reached. The SMB service details may say why. |
| `smb.state.downLink` | Open the SMB service details |
| `smb.state.pendingOn` | Turned on. It starts when you apply the pending changes. |
| `smb.state.unread` | Could not read whether Windows and Mac sharing is on. |
| `smb.switch.off` | Windows and Mac sharing is off. |
| `smb.switch.on` | Windows and Mac sharing is on. |
| `smb.turnOn` | Turn on |
| `smb.turnOff` | Turn off… |
| `smb.saving` | Saving… |
| `smb.turnedOn` | Windows and Mac sharing will turn on when you apply the changes. |
| `smb.turnedOff` | Windows and Mac sharing will turn off when you apply the changes. |
| `smb.off.title` | Turn off Windows and Mac sharing? |
| `smb.off.body_one` / `_other` | After the changes are applied, no shared folder can be reached from Windows or Mac computers: {{count}} folder is shared now ({{list}}). The files stay on the NAS, and each folder keeps its sharing options for when you turn it on again. / After the changes are applied, no shared folder can be reached from Windows or Mac computers: {{count}} folders are shared now ({{list}}). The files stay on the NAS, and each folder keeps its sharing options for when you turn it on again. |
| `smb.off.more` | and {{count}} more |
| `smb.off.close` | If you are using a shared folder from this computer, close its files first. |
| `smb.off.cancel` | Cancel |
| `smb.off.confirm` | Turn off |
| `smb.shares.title` | Shared folders |
| `smb.shares.col.folder` | Folder |
| `smb.shares.col.address` | Address |
| `smb.shares.col.guest` | Guest access |
| `smb.shares.col.readonly` | Read only |
| `smb.shares.col.browseable` | Shown in the network list |
| `smb.shares.guest.no` | Off |
| `smb.shares.guest.allow` | On |
| `smb.shares.guest.only` | Guests only |
| `smb.shares.disabled` | Turned off for this folder |
| `smb.shares.gone` | A shared folder that no longer exists |
| `smb.shares.empty` | No folder is shared with Windows and Mac computers yet. Open a shared folder to share it. |
| `smb.shares.emptyLink` | Open Shared folders |
| `smb.shares.loadFailed` | Could not read the folders shared with Windows and Mac computers. |
| `smb.connected` | Who is connected now |
| `smb.footerLine` | The workgroup, home folders, protocol versions and other options are in the classic interface. |
| `smb.classicLink` | SMB/CIFS settings in the classic interface |
| `smb.loading` | Loading Windows and Mac sharing… |
| `modules.samba` | Windows and Mac sharing (SMB) |

---

## 6. Add a shared folder (Flow A's stage C, on its own)

Route `/storage/shared-folders/add`, no menu item; reached from the list's toolbar and empty state,
a file system's page (its Used by panel), and Flow A's result, which hands over the file system it
made **in memory** (the session store the RAID and ZFS slices use for what a flow hands on; never in
the URL, UI-4). Breadcrumbs: "Shared folders" › "Add a shared folder". It follows R1 to R10 with the
library's job-runner parts. It is the UX audit's Flow A stage C (its 4.2, decisions A4 to A6, calls 7
to 12), run on its own after a mount, as section 17, P3 recommends.

### 6.1 Pre-flight (R1)

On opening, the page reads `dirtyModules`. If anything is pending, the flow does not start (Q2):
`PreflightNotice` "Some changes are not applied yet", the band's list in words, and "Apply them now" /
"Undo them". Then it reads, in parallel: `ShareMgmt.getCandidates` (11.0) and `FileSystemMgmt.getList`
(0.6), `ShareMgmt.getList` (whole, for names and paths), `UserMgmt.getUserList`,
`UserMgmt.getGroupList`, `SMB.getSettings`, `SMB.getShareList`, `Services.getStatus`. Any failure: the
fail-closed state of 0.6 with the failing read's name in words ("Could not read the people and groups
on this NAS.") and "Try again".

### 6.2 Decisions, in one form

`JobRunner` with the title "Add a shared folder" (`h2`; the page title is "Shared folders").

**C1. Where** (`RadioGroupField`, legend "File system"): 0.6's groups. The file system handed over by
Flow A is chosen and its option says "(the storage you just added)". Under the group, the `Disclosure`
"File systems that cannot hold a shared folder ({{count}})".

**C2. Name** (`TextField`, label "Name", required). Hint: "Other computers see the folder by this name.
It cannot be changed later." Placeholder: "For example: Photos". Checked on blur and on Continue by
0.5's rules, in that order, one message at a time.

**C3. Folder on the file system** (read only by default): `text-sm` "It uses a folder called
{{name}} at the top of {{fs}}." with "Use another folder" (a button that reveals 0.5's field and the
"Share the whole file system" tick; "Use the default folder" hides them and restores the default).
0.5's hint about an existing folder sits under the field.

**C4. Description** (`TextField`, optional), 2.6's hint.

**C5. Who can use it**: the access grid (section 3) in the form, with every row at **No access**
(the UX audit's default, A5). Its intro: "Choose who may open this folder from other computers. You
can change this later on the folder's page." The stale-entry line never shows (a new folder has no
entries). With no people or groups (3.4's empty state), the grid is replaced by its empty state, and
C6 offers only guest access or no sharing.

**C6. Reach it from Windows and Mac computers** (`CheckboxField` "Share it with Windows and Mac
computers", default **on**, A6). Under it, when ticked, 4.3's three options with their hints and
warnings: shown in the network list (on), read only for everyone (off), and the separate guest-access
choice (off, never preselected, Q6). When SMB is off: 4.4's sentence that this turns it on; with a NAS
name over 15 characters, the checkbox is unavailable with 4.4's reason, and the flow can still make
the folder without sharing it. Time Machine is not offered here (scope).

**What the flow does with file permissions** (read only, no field), `text-sm`: "Only the people you
give access to can open it." (Q4, 770).

Buttons at the end: **"Continue"** (filled) to the summary. The breadcrumb leads back.

**Checked on Continue**, with the message at the field and focus moved to the first one: the name and
path (0.5); with sharing ticked and guest access off, at least one row not at No access: "Give at
least one person or group access, or untick Share it with Windows and Mac computers." (0.9, at the
grid's heading).

### 6.3 Summary and confirmation (R2)

`JobSummary`, title "Ready to add the shared folder", one item per action in the order they run:

- "Make the shared folder {{name}} on {{fs}}, in the folder {{path}}. Only the people you give access
  to can open it." (whole file system: "…using the whole file system {{fs}}. Every folder on it can be
  reached through this shared folder.")
- "If a folder called {{path}} already exists there, it is used as it is, with its files and its own
  file permissions."
- One line per person or group given access, grouped: "Read and write: {{list}}." / "Read only:
  {{list}}." / with nobody: "Nobody has access yet." (only when not shared over SMB).
- Sharing: "Share it with Windows and Mac computers as {{address}}." and, when SMB is off, "Windows and
  Mac sharing is off now and will be turned on." Not shared: "It is not shared with other computers
  yet. You can share it later from its page."
- Guest access, when chosen, its own item with the warning-shape icon: "Anyone on your network can
  open it without a password." and 4.3's line about folders made here.
- "Then apply the changes, which also applies nothing else: no other change is pending."

**No typed confirmation**: nothing is erased (UI-8 types only for data loss). The confirm button is
**"Add shared folder"** (filled primary), with "Change choices" (neutral) beside it, which returns to
the form with every choice kept. No form around the summary, so Enter in it does nothing; on arrival
focus moves to the summary's heading.

### 6.4 The steps (R3, R5)

A `JobRunner` step list, each step's state in words:

| # | Step | Calls | Notes |
| --- | --- | --- | --- |
| 1 | "Check the choices" | `getCandidates`, `FileSystemMgmt.getList`, `ShareMgmt.getList`, `dirtyModules`, `getShareList`, `getSettings` | Re-reads; stops with "{{fs}} cannot hold a shared folder any more: {{reason}}." or "There is now a shared folder called {{other}}." or a pending change (R1) |
| 2 | "Make the shared folder" | `ShareMgmt.set` (`uuid` the new marker, `name`, `comment`, `mntentref`, `reldirpath`, `mode` "770") | Makes the folder on the disk at once (B5). The reply carries the new `uuid` (read from source), kept in memory |
| 3 | "Give access" | `ShareMgmt.setPrivileges` | Only when anyone was given access |
| 4 | "Turn on Windows and Mac sharing" | `SMB.getSettings` then `SMB.setSettings`, `enable` true | Only when sharing was chosen and SMB is off (R4) |
| 5 | "Share the folder" | `SMB.setShare` (0.10's defaults) | Only when sharing was chosen |
| 6 | "Save and share" | R10: re-read `dirtyModules`; expected `sharedfolders`, `systemd`, and with sharing `samba`, `avahi` **[verify]**; anything else listed in the confirmation ("Also pending from elsewhere: NFS"); then `Config.applyChangesBg` | The checkpoint; the task's output on the terminal pair, as Flow A's |
| 7 | "Check that it is ready" | `ShareMgmt.getList` (the folder's `status` OK), `getShareList` (its row), `Services.getStatus` (`smb` running, when shared) | Up to five reads two seconds apart for the service to start **[verify]** how long it takes |

Leaving the page does not stop the run (the file-systems slice's session store); coming back shows
it. A reload ends the view (R8); the list's unfinished-work lines (1.5) recognise what was left.

### 6.5 Result

`JobResult` succeeded, announced politely:

- Title: "{{name}} is ready."
- Shared: "Open it from a Windows computer at {{addressWindows}}, or from a Mac at {{addressMac}}, and
  sign in with the name and password of someone who has access." with both addresses and
  `CopyButton`s. Not shared: "It is not shared with other computers yet."
- With guest access: "Anyone on your network can open it without a password."
- Router links "Open the shared folder" and "Add another shared folder".

### 6.6 Failures (R6, R7, R10)

| Fails at | The NAS is left | The reader sees | Offered |
| --- | --- | --- | --- |
| 1 check | nothing done | the reason | "Change choices" |
| 2, the record not made (`getList` has no such folder) | nothing done | "The shared folder was not made." + server message | "Try again"; "Change choices" |
| 2, the record made but the folder could not be made on the disk (the record is written first, read from source) | a record whose status is not OK | "The shared folder was set up, but its folder could not be made on {{fs}}." + server message | "Try again" (the same call with the new `uuid`, which makes the folder if it does not exist); "Remove it again" (`ShareMgmt.delete`, `recursive` false: nothing on the disk is touched, then the band's Undo is not needed for it) |
| 3 to 5 | the folder made on the disk; some settings saved, none applied | "{{name}} was made, but {{what}} could not be saved." + server message | "Try this step again"; "Stop here", saying: "The folder {{path}} is made on {{fs}}. The changes saved so far are pending in the band. If you undo them there, the folder's record goes, but the empty folder stays on the disk." (B4, B5) |
| 6 apply | R7's mix (B3) | "Applying the changes failed." + the task's last lines | R7: "Try applying again" first; then "Stop here", saying what is still pending |
| 7 not ready | applied | "The changes are applied, but {{what}} is not ready yet." ("the folder cannot be reached", "Windows and Mac sharing is not running") | "Check again"; router link "Open the shared folder" |
| A request cut (session, network) at any write | not known | "Could not tell whether {{step}} finished." | "Check again" (the reads of step 1, then the run resumes at the first step whose effect is not seen) |

Never retried by itself (UI-14). Undo is offered only through the band, with 6.6's sentence about the
folder on the disk, never as a step of its own (R6: an immediate step would be orphaned).

### 6.7 Flow A's handover

The handover card of [phase-5-filesystems.md](phase-5-filesystems.md) 6.8 and its Used by panel copy
(its 2.4, D20) are **replaced** by one card "Next: share a folder on it" (`h3`) with one sentence and
one button:

- "Make a shared folder on {{fs}}, choose who can use it, and share it with your computers."
- **"Share a folder on it"** (filled; router link to `/storage/shared-folders/add`, with the file
  system put in the session store first).

The classic-interface steps, links and the catalogue note about the classic words go. Flow A's own
stages and its summary's line "Sharing a folder on it comes next, in the classic interface for now."
change to "Sharing a folder on it comes next." Its title stays "Add storage" (section 17, P3: the
in-flow stage C of the file-systems design's section 8 is the alternative).

### 6.8 Keyboard and screen readers

The form in reading order: the file-system radio group (one tab stop, arrows inside), its disclosure,
Name, "Use another folder" (and its field and tick), Description, the access grid (its toolbar, then
one tab stop per row), the sharing checkbox and its three options, Continue. Field errors are linked
by `aria-describedby`; on Continue with errors, focus moves to the first and the count is announced
("2 things to fix"). The summary is a heading and a list; the run's step changes are announced
politely, a failure assertively with focus on its heading, the result politely.

### 6.9 Copy

| Key | English |
| --- | --- |
| `addShare.title` | Add a shared folder |
| `addShare.breadcrumb` | Add a shared folder |
| `addShare.fs.legend` | File system |
| `addShare.fs.handedOver` | (the storage you just added) |
| `addShare.fs.free` | {{free}} free |
| `addShare.fs.full` | Almost full: {{free}} free. |
| `addShare.fs.cannot_one` / `_other` | File system that cannot hold a shared folder ({{count}}) / File systems that cannot hold a shared folder ({{count}}) |
| `addShare.fs.reason.notMounted` | Not mounted. |
| `addShare.fs.reason.missing` | Missing. |
| `addShare.fs.reason.system` | This is the system drive. Shared folders belong on a data disk. |
| `addShare.fs.reason.notCandidate` | The NAS does not offer this file system for shared folders. |
| `addShare.fs.loadFailed` | Could not check which file systems can hold a shared folder. |
| `addShare.fs.none` | No file system can hold a shared folder yet. Add storage first: a disk with a file system, mounted. |
| `addShare.fs.addStorage` | Add storage |
| `addShare.name.label` | Name |
| `addShare.name.hint` | Other computers see the folder by this name. It cannot be changed later. |
| `addShare.name.placeholder` | For example: Photos |
| `addShare.name.length` | Use 1 to 80 characters. |
| `addShare.name.chars` | A name cannot contain any of these: " \ / [ ] : \| < > + = ; , * ?, and cannot start or end with a space. |
| `addShare.name.dots` | A name cannot start with a full stop or contain two in a row. |
| `addShare.name.reserved` | {{name}} is a name Windows and Mac sharing keeps for itself. Choose another name. |
| `addShare.name.taken` | There is already a shared folder called {{other}}. |
| `addShare.path.default` | It uses a folder called <path></path> at the top of <fs></fs>. |
| `addShare.path.other` | Use another folder |
| `addShare.path.useDefault` | Use the default folder |
| `addShare.path.label` | Folder on the file system |
| `addShare.path.hint` | The folder is made if it does not exist. If it already exists, it is used as it is, with its files and its own file permissions. |
| `addShare.path.whole` | Share the whole file system |
| `addShare.path.wholeHint` | Every folder on it can then be reached through this shared folder. |
| `addShare.path.invalid` | Use folder names separated by /, without . or .. and without names that start with a full stop. |
| `addShare.path.tooDeep` | Use at most 8 folders in the path. |
| `addShare.path.taken` | {{other}} already uses this folder. |
| `addShare.access.intro` | Choose who may open this folder from other computers. You can change this later on the folder's page. |
| `addShare.smb.label` | Share it with Windows and Mac computers |
| `addShare.modeNote` | Only the people you give access to can open it. |
| `addShare.continue` | Continue |
| `addShare.check.needAccess` | Give at least one person or group access, or untick Share it with Windows and Mac computers. |
| `addShare.check.count_one` / `_other` | {{count}} thing to fix / {{count}} things to fix |
| `addShare.sum.title` | Ready to add the shared folder |
| `addShare.sum.make` | Make the shared folder <name></name> on <fs></fs>, in the folder <path></path>. Only the people you give access to can open it. |
| `addShare.sum.makeWhole` | Make the shared folder <name></name> using the whole file system <fs></fs>. Every folder on it can be reached through this shared folder. |
| `addShare.sum.existing` | If a folder called <path></path> already exists there, it is used as it is, with its files and its own file permissions. |
| `addShare.sum.rw` | Read and write: {{list}}. |
| `addShare.sum.ro` | Read only: {{list}}. |
| `addShare.sum.nobody` | Nobody has access yet. |
| `addShare.sum.share` | Share it with Windows and Mac computers as <address></address>. |
| `addShare.sum.smbOn` | Windows and Mac sharing is off now and will be turned on. |
| `addShare.sum.noShare` | It is not shared with other computers yet. You can share it later from its page. |
| `addShare.sum.guest` | Anyone on your network can open it without a password. |
| `addShare.sum.apply` | Then apply the changes. No other change is pending. |
| `addShare.confirm` | Add shared folder |
| `addShare.changeChoices` | Change choices |
| `addShare.step.check` | Check the choices |
| `addShare.step.make` | Make the shared folder |
| `addShare.step.access` | Give access |
| `addShare.step.smbOn` | Turn on Windows and Mac sharing |
| `addShare.step.share` | Share the folder |
| `addShare.step.apply` | Save and share |
| `addShare.step.verify` | Check that it is ready |
| `addShare.task.apply` | Apply the changes for {{name}} |
| `addShare.fail.fsGone` | <fs></fs> cannot hold a shared folder any more: {{reason}} |
| `addShare.fail.nameTaken` | There is now a shared folder called <other></other>. |
| `addShare.fail.notMade` | The shared folder was not made. |
| `addShare.fail.noDir` | The shared folder was set up, but its folder could not be made on <fs></fs>. |
| `addShare.fail.removeAgain` | Remove it again |
| `addShare.fail.partial` | <name></name> was made, but {{what}} could not be saved. |
| `addShare.fail.what.access` | who can use it |
| `addShare.fail.what.smbOn` | turning on Windows and Mac sharing |
| `addShare.fail.what.share` | sharing it with Windows and Mac computers |
| `addShare.fail.stopHere` | Stop here |
| `addShare.fail.stopBody` | The folder <path></path> is made on <fs></fs>. The changes saved so far are pending in the band. If you undo them there, the folder's record goes, but the empty folder stays on the disk. |
| `addShare.fail.apply` | Applying the changes failed. |
| `addShare.fail.notReady` | The changes are applied, but {{what}} is not ready yet. |
| `addShare.fail.what.folder` | the folder cannot be reached |
| `addShare.fail.what.smb` | Windows and Mac sharing is not running |
| `addShare.fail.unknown` | Could not tell whether “{{step}}” finished. |
| `addShare.tryAgain` | Try again |
| `addShare.tryStep` | Try this step again |
| `addShare.tryApply` | Try applying again |
| `addShare.checkAgain` | Check again |
| `addShare.done.title` | {{name}} is ready. |
| `addShare.done.shared` | Open it from a Windows computer at <windows></windows>, or from a Mac at <mac></mac>, and sign in with the name and password of someone who has access. |
| `addShare.done.notShared` | It is not shared with other computers yet. |
| `addShare.done.guest` | Anyone on your network can open it without a password. |
| `addShare.done.open` | Open the shared folder |
| `addShare.done.another` | Add another shared folder |
| `addStorage.handover.title` | Next: share a folder on it |
| `addStorage.handover.body` | Make a shared folder on <fs></fs>, choose who can use it, and share it with your computers. |
| `addStorage.handover.button` | Share a folder on it |
| `addStorage.sum.shareNext` | Sharing a folder on it comes next. |
| `addStorage.sharingNext` | Sharing a folder on it with your computers is the next step. |

The Flow A keys `addStorage.handover.folder*`, `.access*`, `.smbOn*`, `.share*`, `.guest`, `.apply*`
and `.access2` are removed.

---

## 7. Point a shared folder somewhere else (repair only)

OMV's `set` lets a shared folder's file system and folder change at any time; it then **points at the
new folder and moves no file** (read from source: the record is rewritten, and the new folder is made
if it does not exist). On a working folder that would quietly change what every computer, share and
backup job sees, with the old files left where they were. So this interface offers it **only to
repair a folder that cannot be reached** (status `ENOENT`, `ENOTDIR` or `ENOENT_DB_MNTENT`), from What
to do now (2.4), and leaves moving a working folder to the classic interface (section 17, P6).

**The dialog** (`Dialog`, not destructive: nothing is deleted; `h2` "Point {{folder}} somewhere
else"):

1. "Choose where {{folder}} should point. No files are moved: it uses whatever is in the folder you
   choose, and makes the folder if it does not exist."
2. "File system" (0.6's radio group, its current file system chosen when it is offered).
3. "Folder on the file system" (0.5's field, filled with the current path).
4. When something uses it (0.7): "{{list}} will use the new folder as soon as the changes are
   applied."
5. Buttons: "Cancel" and **"Save"** (filled).

**On Save**: re-read the folder's row, the rules of 0.5 and 0.6 (the same path may be kept, for a
folder that was missing and is wanted back at the same place, which `set` then makes), then
`ShareMgmt.set` with the new `mntentref` and `reldirpath` and `mode` "770" (0.10). The band appears;
the page re-reads; the status shows OK once the folder exists (immediately, since `set` makes it).
Failed: the dialog stays with the server's message.

| Key | English |
| --- | --- |
| `repoint.title` | Point {{folder}} somewhere else |
| `repoint.body` | Choose where <folder></folder> should point. No files are moved: it uses whatever is in the folder you choose, and makes the folder if it does not exist. |
| `repoint.users` | {{list}} will use the new folder as soon as the changes are applied. |
| `repoint.cancel` | Cancel |
| `repoint.save` | Save |
| `repoint.saved` | {{folder}} now points at {{path}} on {{fs}}. Apply the changes to use it. |
| `repoint.okOnly` | This is only for a shared folder that cannot be reached. To move a working shared folder, use the classic interface. |

---

## 8. Delete a shared folder

`ShareMgmt.delete {uuid, recursive}`. Read from source: it refuses while **anything** refers to the
folder (its SMB share included); with `recursive` false it removes only the shared folder's record
and **leaves every file on the disk**; with `recursive` true it then deletes the folder on the disk
**and everything in it** at once, inside the request (not a background task), refusing first only when
another shared folder uses the same folder or one inside it. Both mark `sharedfolders` and `systemd`
pending (0.8).

### 8.1 The section

`h2` "Delete this shared folder", last on the page, after a divider. Two sentences, `text-sm`:
"Removing the shared folder keeps its files on the disk; only this NAS's setting goes. Deleting it
with its files erases everything in its folder." Then two buttons, neutral, in this order:
**"Remove, keep the files…"** and, after a gap, **"Delete with all its files…"** (the destructive form
is only on the dialog's confirm button). Each is unavailable (`aria-disabled`, focusable) with its
blockers in words beside it (0.9):

| Blocker | Words | What to do |
| --- | --- | --- |
| Shared with Windows and Mac computers | "It is shared with Windows and Mac computers." | "Stop sharing it first, above, and apply that change." (button "Stop sharing…", 4.5, in place; the delete then refuses to start until the change is applied, 0.8) |
| Something else uses it (0.7) | 0.7's sentence | none (no link, P15) |
| A read failed | "Could not check what uses this shared folder, so it cannot be removed now." + message | "Try again" |
| An action on it is running in this session | "Wait for {{action}} to finish." | none |
| Delete with files only: not OK | "Its folder cannot be found, so this page cannot tell what would be deleted." | "Remove, keep the files" stays available |
| Delete with files only: file system not mounted or not OK | "Its file system {{fs}} is not mounted." / its state | none |
| Delete with files only: the whole file system | "It is the whole file system {{fs}}. Deleting all its files would erase everything on {{fs}}." | "To erase the file system, use its page." router link to the file system's page (its unmount and the disk's wipe are there, with their own checks) |
| Delete with files only: another shared folder uses the same folder or one inside it | "{{other}} uses {{its path}}, inside this folder." | "Delete or move {{other}} first." router link to its page |
| Delete with files only: on the system drive | "It is on the system drive." | none |

**Without `SMB.deleteShare` cleared**, a folder with an SMB share cannot be deleted from here (the
share, even turned off, still refers to it), and the first blocker's "What to do" says "Remove its
SMB share in the classic interface first." with no link (section 17, P11).

### 8.2 The check before the dialog

Pressing either button re-reads `ShareMgmt.getList`, `SMB.getShareList`, `FileSystemMgmt.getList` and
`dirtyModules`. The dialog opens with "Checking what uses this shared folder…", then shows a refusal,
the pre-flight (other changes pending: "Apply them now" / "Undo them", 0.8), "This shared folder no
longer exists.", or the confirmation.

### 8.3 Remove, keep the files

`ConfirmDialog`, plain (nothing on the disk is lost; it is undone by adding a shared folder for the
same folder), focus on Cancel:

1. Title: "Remove the shared folder {{folder}}?"
2. "The files stay on {{fs}} in {{fullPath}}. Nobody can reach them from other computers through
   {{folder}} any more. Who could use it is forgotten."
3. "To use these files again later, add a shared folder for the same folder."
4. Buttons: "Cancel" (focused) and **"Remove shared folder"** (filled primary).

### 8.4 Delete with all its files

`ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm (UI-8, `data`):

1. Title: "Delete {{folder}} and all its files?"
2. The folder named: file system, folder on it, full path.
3. The consequence: "Every file and folder in {{fullPath}} is deleted from the NAS, at once. This
   cannot be undone, and this page cannot count how much that is."
4. When the file system is BTRFS: "{{fs}} may keep snapshots of this folder. Snapshots are managed in
   the classic interface." **[verify]** what deleting does to a BTRFS shared folder (a subvolume) and
   its snapshots.
5. "If the files matter, copy them somewhere else first. Choose Remove, keep the files, if you only
   want the shared folder to go." with a button "Remove and keep the files instead" (switches to 8.3).
6. Type to confirm: "Type {{folder}} to confirm." (`typedMatches`, exact and case-sensitive, spaces
   around ignored).
7. Buttons: "Cancel" (focused) and **"Delete folder and files"** (`destructive`), unavailable until
   the name matches.

### 8.5 On confirm, both ways

The reads of 8.2 run once more ("Checking again…"); a blocker switches to the refusal. Otherwise a
step list in the dialog:

1. "Remove the shared folder" or "Delete the folder and its files": `ShareMgmt.delete` with
   `recursive` false or true. The deletion of files runs inside the request and may take long for a
   large folder **[verify]** how long, and what the browser sees if it runs past the web server's
   limits (14.2). The step says "This can take a while for a large folder. Keep this page open."
2. "Save the change" (R10: expected `sharedfolders`, `systemd` **[verify]**; `Config.applyChangesBg`).

**Result**: the page shows, in place of its content, `JobResult` succeeded: "{{folder}} was removed.
Its files are still on {{fs}} in {{fullPath}}." or "{{folder}} and its files were deleted.", with a
router link "Go to Shared folders".

**Failures**: step 1 stays with the server's words ("{{folder}} was not removed." / "…was not
deleted."); with files, a failure after `rm` started may leave some files deleted: "Some files may
already be deleted." (OMV runs the deletion before it removes the record, read from source, so the
record is then still there and the folder shows on the list). Step 2 has R7's "Try applying again"
first, then "Stop here", saying the folder is removed and the change stays pending. The request was
cut: "Could not tell whether {{folder}} was removed." with "Check again" (re-reads `getList`).

### 8.6 Keyboard and screen readers

Focus on Cancel; Tab order Cancel, (the typed field), the confirm button (unavailable but focusable),
then the "instead" button; the consequence is the dialog's description, read with the title; the
typed field's label is the prompt and its hint is linked. Steps announced politely, a failure
assertively, the result politely.

### 8.7 Copy

| Key | English |
| --- | --- |
| `shareDelete.title` | Delete this shared folder |
| `shareDelete.intro` | Removing the shared folder keeps its files on the disk; only this NAS's setting goes. Deleting it with its files erases everything in its folder. |
| `shareDelete.keep.open` | Remove, keep the files… |
| `shareDelete.files.open` | Delete with all its files… |
| `shareDelete.blocked.smb` | It is shared with Windows and Mac computers. |
| `shareDelete.blocked.smbDo` | Stop sharing it first, above, and apply that change. |
| `shareDelete.blocked.smbClassic` | Remove its SMB share in the classic interface first. |
| `shareDelete.blocked.unread` | Could not check what uses this shared folder, so it cannot be removed now. |
| `shareDelete.blocked.running` | Wait for {{action}} to finish. |
| `shareDelete.blocked.notOk` | Its folder cannot be found, so this page cannot tell what would be deleted. |
| `shareDelete.blocked.fsNotMounted` | Its file system <fs></fs> is not mounted. |
| `shareDelete.blocked.whole` | It is the whole file system <fs></fs>. Deleting all its files would erase everything on <fs></fs>. |
| `shareDelete.blocked.wholeDo` | To erase the file system, use its page. |
| `shareDelete.blocked.inside` | <other></other> uses <path></path>, inside this folder. |
| `shareDelete.blocked.insideDo` | Delete or move {{other}} first. |
| `shareDelete.blocked.system` | It is on the system drive. |
| `shareDelete.checking` | Checking what uses this shared folder… |
| `shareDelete.gone` | This shared folder no longer exists. |
| `shareDelete.keep.title` | Remove the shared folder {{folder}}? |
| `shareDelete.keep.body` | The files stay on <fs></fs> in <path></path>. Nobody can reach them from other computers through <folder></folder> any more. Who could use it is forgotten. |
| `shareDelete.keep.later` | To use these files again later, add a shared folder for the same folder. |
| `shareDelete.keep.confirm` | Remove shared folder |
| `shareDelete.files.title` | Delete {{folder}} and all its files? |
| `shareDelete.files.consequence` | Every file and folder in <path></path> is deleted from the NAS, at once. This cannot be undone, and this page cannot count how much that is. |
| `shareDelete.files.btrfs` | <fs></fs> may keep snapshots of this folder. Snapshots are managed in the classic interface. |
| `shareDelete.files.copyFirst` | If the files matter, copy them somewhere else first. Choose Remove, keep the files, if you only want the shared folder to go. |
| `shareDelete.files.instead` | Remove and keep the files instead |
| `shareDelete.files.typePrompt` | Type {{folder}} to confirm. |
| `shareDelete.files.typeHint` | The button is available once the name matches. |
| `shareDelete.files.confirm` | Delete folder and files |
| `shareDelete.cancel` | Cancel |
| `shareDelete.checkingAgain` | Checking again… |
| `shareDelete.step.keep` | Remove the shared folder |
| `shareDelete.step.files` | Delete the folder and its files |
| `shareDelete.step.filesHint` | This can take a while for a large folder. Keep this page open. |
| `shareDelete.step.save` | Save the change |
| `shareDelete.done.keep` | <folder></folder> was removed. Its files are still on <fs></fs> in <path></path>. |
| `shareDelete.done.files` | <folder></folder> and its files were deleted. |
| `shareDelete.done.toList` | Go to Shared folders |
| `shareDelete.failed.keep` | {{folder}} was not removed. |
| `shareDelete.failed.files` | {{folder}} was not deleted. |
| `shareDelete.failed.partly` | Some files may already be deleted. |
| `shareDelete.failed.saveBody` | The shared folder is removed. Saving the change failed, so it stays pending in the band. |
| `shareDelete.unknown` | Could not tell whether {{folder}} was removed. |
| `shareDelete.checkAgain` | Check again |

---

## 9. How shares fit the other pages

### 9.1 File systems and Flow A

- **Flow A's result** and **a file system's Used by panel** carry the new handover card (6.7) in place
  of the classic steps, under the same rule (the file-systems slice's D20: while nothing is shared
  from a file system this session created, or any mounted one without shared folders).
- **Used by** on a file system's page links each shared folder to its new page (it linked the list).
- **The unmount refusal** ("Shared folders use it") links each folder to its page, where it can be
  removed (keeping the files) once nothing uses it. The ZFS and RAID refusals that name shared folders
  do the same.
- The file-systems slice's "Found on the disks, not mounted" and every refusal are unchanged.

### 9.2 Dashboard

Unchanged in what it reads. Its Services card already shows SMB's state from `Services.getStatus`; the
SMB row's name becomes a router link to `/services/smb`. The Shared folders roll-up stays on its page:
the dashboard has no shared-folder rows in this slice (section 16, D14).

### 9.3 Diagnostics

The SMB service details page (`/diagnostics/services/smb`) gains a router link "Windows and Mac
sharing settings" → `/services/smb`.

### 9.4 Not changed in this slice

The Disks pages, RAID and ZFS pages (apart from the links in 9.1), the monitoring pages, the band and
the job runner's rules.

---

## 10. A normal user, navigation and routes

### 10.1 A normal user

Nothing new. Every method here is administrator-only. A normal user who types one of these addresses
gets the "only administrators" page, and nothing is called first (UI-4), as on the Phase 3 page.

### 10.2 Navigation and routes

| Route | Page | Menu | Notes |
| --- | --- | --- | --- |
| `/storage/shared-folders` | 1 | Storage > Shared Folders (exists) | |
| `/storage/shared-folders/add` | 6 | none (Shared folders current) | Opens the flow; no step runs on load (R9) |
| `/storage/shared-folders/$folder` | 2 | none (Shared folders current) | `$folder` a UUID, validated (2); nothing in the address names a call |
| `/services/smb` | 5 | Services > SMB/CIFS (exists; gains its route) | The menu label stays OMV's ("SMB/CIFS") so existing users find it; the page title says what it does |

The classic link of the SMB/CIFS menu item moves to the page's footer, as every built page's does.

---

## 11. Backend methods

### 11.0 Methods that need the owner's clearance

The nine cleared methods (journal, 2026-11-22) cover reading and writing shared folders, access, and
SMB. Two more are needed for parts of this design, and one is asked about for later. Each is
administrator-only (read from source).

| Method | Why it is needed | What is lost without it |
| --- | --- | --- |
| **`SMB.deleteShare`** `{uuid}` | "Stop sharing" (4.5), and deleting a shared folder that has (or had) an SMB share: `ShareMgmt.delete` refuses while any setting refers to the folder, and an SMB share that is only turned off still does. It removes the share's record only; it touches no shared folder and no file; it marks `samba` and `avahi` pending (read from source) | "Stop sharing" can only turn the share off for that folder (`setShare` with `enable` false), and a folder that was ever shared over SMB cannot be deleted from this interface: the reader is sent to the classic interface to remove the share first (8.1) |
| **`ShareMgmt.getCandidates`** (no parameters) | Which file systems may hold a new shared folder, and each one's mount-entry identifier, which `ShareMgmt.set` needs (`mntentref`). It is OMV's own list: mounted now, not a bind mount, and of a type that can hold a shared folder (read from source); it is what the classic form offers. Read-only; it checks each mount folder but reads no file | The identifier is read with `FsTab.getByFsName` per file system (exists), which refuses ZFS names (journal, 2026-11-22): **no shared folder could be made on a ZFS file system from here**, and the "can this type hold a shared folder" check becomes the interface's own guess from the file-system type |
| `ShareMgmt.getFileACL` `{uuid, file}` (later, not for this slice) | Q9's "effective access on a folder's own page": the folder's owner, group and file permissions, so the page could say when they stop someone the access list lets in. It reads the disk | The page cannot read a folder's file permissions; it says so once (3.1) and links the classic interface. For folders this interface makes (770) nothing is lost (0.4). Recommended: not now (section 17, P16) |

**Not needed, said plainly:**

- `ShareMgmt.getPrivileges`: it returns every listed person and group with their stored access or
  none. The folder's `privileges` in `getList` plus `getUserList` and `getGroupList` give exactly the
  same, and the browser joins them (0.4). Nothing is lost.
- `ShareMgmt.get`: `getList`'s row has every stored field `set` needs (`uuid`, `name`, `comment`,
  `mntentref`, `reldirpath`). It adds only the mount folder, which `getList`'s `mntent.dir` has too.
- `SMB.getShare`: `getShareList`'s rows are the whole stored share objects plus `sharedfoldername`, so
  the read-modify-write of 0.10 uses them.
- `ShareMgmt.setPrivilegesByRole`, `getPrivilegesByRole`, `copyPrivileges`: access by person across
  folders is Flow B's (UX audit 4.3), not this slice's.
- `FolderBrowser.get` (a folder picker): the path is typed, with OMV making it if needed (0.5).
- `NFS.getShareList`, `Rsync.getList`, `Rsyncd.getModuleList`, `UserMgmt.getSettings`: they would let
  Used by name an NFS share, a backup job, an Rsync module or the home folders setting instead of
  0.7's one sentence. Useful later (Pattern G), not needed for any rule here, which rests on `_used`.

### 11.1 The facts read from source, per method

Every method below checks the administrator role. OMV ignores parameters its datamodel does not name
(read from source), so the contract's request schemas are **stricter** than OMV's where this interface
sends less; "Stricter" says how. None is a background task. "Marks pending" is through OMV's engine
modules' listeners, **[verify]** each by `dirtyModules` on the VM.

| Method | Parameters (from the datamodel) | Marks pending | Quirks read from source | Contract notes |
| --- | --- | --- | --- | --- |
| `ShareMgmt.getList` (exists) | `start`, `limit` (integer or null), `sortfield`, `sortdir`, `search` | nothing | Builds every row on each call: checks each folder's path on the disk (`status`), whether its file system is mounted (`mntent.devicefile`, `device`), whether anything refers to it (`_used`). `description` is server English. `privileges` is `{privilege: [...]}`, or empty | Exists. The examples gain rows with one and several privileges, and a stale entry (14.2) |
| `ShareMgmt.set` | `uuid` (the new marker `fa4b1c66-ef79-11e5-87a0-0002b3a176b4` to create), `name` (share-name format, at most 80), `reldirpath` (string), `comment` (string, may be empty), `mntentref` (UUID), `mode` (optional: `700`, `750`, `755`, `770`, `775`, `777`; default 775) | Create: `sharedfolders`, `systemd`. Change: the same, plus `samba` when an SMB share uses it, `nfs` and `fstab` for an NFS share, `rsync`, `rsyncd` for their users | Writes the record **first**, then makes the folder on the disk **only if it does not exist** (BTRFS: a subvolume), sets the mode, the group `users` and the setgid mark, and lets the group pass through the parent folders. An existing folder keeps its permissions. Refuses `..` anywhere in the path, a taken name (exact) and a taken path on the same file system. Does not check that the file system is mounted (B8). On a change, keeps the stored access list and rewrites everything else; the name is not locked. `mode` is not stored; the reply carries it | **New, cleared.** `x-omv-dirty: true`. Stricter: `name` with 0.5's pattern (no leading full stop, no `..`, the reserved words); `reldirpath` with 0.5's path pattern; `comment` at most 255 **[verify]**; `mode` only `"770"` |
| `ShareMgmt.setPrivileges` | `uuid`; `privileges`: `{type: user\|group, name (user-name format), perms: 0\|5\|7}[]` (the array is not marked required; always sent) | `sharedfolders`, `systemd`; `samba` when an SMB share uses it, `rsyncd` when a module does | **Replaces the whole list.** Refuses an account that does not exist and the web administrator account. Changes no file permission. With guest access off, 0 is "refused even through a group"; with it on, 0 does nothing (the Samba template) | **New, cleared.** `x-omv-dirty: true`; `x-omv-destructive: service` (it can take access away; nothing is erased). Stricter: `privileges` required, at most 10,000 items |
| `ShareMgmt.delete` | `uuid`; `recursive` (boolean, **required**) | `sharedfolders`, `systemd`; queues OMV's task that removes the folder's alias | Refuses while **any** setting refers to the folder (OMV's "is referenced" check: SMB, NFS, Rsync server modules, backup jobs, home folders, add-ons). `recursive` false: removes the record only, every file stays. `recursive` true: refuses when another shared folder uses the same folder or one inside it, then **deletes the folder and everything in it inside the request**, then removes the record | **New, cleared.** `x-omv-destructive: data`; `x-omv-dirty: true`. The description says what each value of `recursive` does and that the deletion is not a background task |
| `UserMgmt.getUserList` | `start`, `limit`, `sortfield`, `sortdir`, `search`, `detail` (`basic` or `full`, default `basic`) | nothing | Only accounts that are not system accounts. Each: `name`, `uid`, `gid`, `comment`, `dir`, `shell`, `groups`, `system` (always false here), `email`, `disallowusermod`, `sshpubkeys` | **New, cleared.** Read-only. Stricter: `detail` only `basic`. Response open; `sshpubkeys` and `shell` are not shown here; captures scrub names, e-mail addresses and keys |
| `UserMgmt.getGroupList` | `start`, `limit`, `sortfield`, `sortdir`, `search` | nothing | Only groups that are not system groups. Each: `name`, `gid`, `members`, `system`, and `comment` only when OMV holds a record for the group | **New, cleared.** Read-only. `comment` optional |
| `SMB.getSettings` | none | nothing | The SMB settings without the shares: `enable`, `workgroup`, `serverstring`, `loglevel`, `usesendfile`, `aio`, `timeserver`, `winssupport`, `winsserver`, `homesenable`, `homesbrowseable`, `homesrecyclebin`, `homesmacoscompat`, `homesinheritacls`, `homesinheritpermissions`, `homesextraoptions`, `homesfollowsymlinks`, `homeswidelinks`, `netbios`, `minprotocol`, `extraoptions` | **New, cleared.** Read-only. Booleans as JSON booleans **[verify]** |
| `SMB.setSettings` | 12 required: `enable`, `workgroup`, `serverstring`, `loglevel`, `usesendfile`, `aio`, `timeserver`, `winssupport`, `winsserver`, `homesenable`, `homesbrowseable`, `extraoptions`; the stored home-folder, `netbios` and `minprotocol` fields are accepted too and kept when left out | `samba`, `avahi` | With `enable` true, refuses a NAS name longer than 15 characters ("The DNS hostname is limited to 15 characters when using SMB/CIFS…") and home-folder sharing while home folders are off | **New, cleared.** `x-omv-dirty: true`; `x-omv-destructive: service` (turning it off cuts every share). The request schema names every field `getSettings` returns, so the whole reply is sent back (0.10) |
| `SMB.getShareList` | `start`, `limit`, `sortfield`, `sortdir`, `search` (accepted and ignored) | nothing | The stored share objects plus `sharedfoldername`. If a share's shared folder is gone, the whole read fails **[verify]** | **New, cleared.** Read-only |
| `SMB.setShare` | `uuid` (new marker to create), `enable`, `sharedfolderref`, `comment`, `guest` (`no`, `allow`, `only`), `readonly`, `browseable`, `recyclebin`, `recyclemaxsize`, `recyclemaxage`, `hidedotfiles`, `inheritacls`, `inheritpermissions`, `easupport`, `storedosattributes`, `hostsallow`, `hostsdeny`, `audit`, `extraoptions` (all required), `timemachine` (optional); stored fields outside the datamodel accepted: `macoscompat`, `timemachinemaxsize`, `transportencryption`, `followsymlinks`, `widelinks` | `samba`, `avahi` | **At most one share per shared folder** (refused otherwise). Builds a fresh object each time, so a field left out returns to its default (0.10). Time Machine forces macOS compatibility on. Does not check that the shared folder exists | **New, cleared.** `x-omv-dirty: true`. `guest` keeps all three values (an existing "Guests only" must round-trip, 4.3), though this interface never chooses `only` |

**Where OMV's words for access come from** (the Samba share template, read from source): with guest
access off, people and groups with 7 or 5 are the only ones let in, 5 only reads, 0 is refused;
with guest access on, the "only these" and "refused" lists are not written, so neither keeps anyone
out; with "Guests only", no per-person list is written at all. The share's name on the network is
the shared folder's name.

### 11.2 Every request in this slice

| Method | Where | When | Kind | Contract status |
| --- | --- | --- | --- | --- |
| `ShareMgmt.getList` | list, folder page, add flow, delete, SMB page | open, Refresh, focus, re-checks | foreground | Exists |
| `ShareMgmt.getCandidates` | add flow, repair dialog | open, step 1 | foreground | **To clear** (11.0) |
| `ShareMgmt.set` | add flow step 2, description, repair | after the reader's action | foreground | New, cleared |
| `ShareMgmt.setPrivileges` | access grid, add flow step 3 | Save access, step 3 | foreground | New, cleared |
| `ShareMgmt.delete` | delete dialog, add flow's "Remove it again" | after the confirmation | foreground, may be long | New, cleared |
| `UserMgmt.getUserList`, `getGroupList` | folder page, add flow | open, Refresh, focus, before a save | foreground | New, cleared |
| `SMB.getSettings` | list, folder page, add flow, SMB page | open, before each write | foreground | New, cleared |
| `SMB.setSettings` | SMB page, share form, add flow step 4 | after the reader's action | foreground | New, cleared |
| `SMB.getShareList` | list, folder page, add flow, delete, SMB page | open, before each write | foreground | New, cleared |
| `SMB.setShare` | share form, "Turn it on", add flow step 5 | after the reader's action | foreground | New, cleared |
| `SMB.deleteShare` | Stop sharing | after the confirmation | foreground | **To clear** (11.0) |
| `FileSystemMgmt.getList`, `FsTab.getByFsName` | add flow, folder page, repair | open, step 1 | foreground | Exist (`FsTab` only without `getCandidates`) |
| `Services.getStatus` | folder page, SMB page, add flow step 7 | open, step 7 | foreground | Exists |
| `System.getInformation`, `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*` | shell, checkpoints, the band | as now | | Exist |

Paging reads send all five fields with `limit: null` for a whole list (the monitoring domain's
observation; OMV reads `sortfield`, `sortdir` and `search` without checking they are there).

Every captured example is scrubbed before commit (AGENTS.md rule 2): user and group names become
documentation names (`alex`, `sam`, `family`), e-mail addresses and SSH keys are removed, the host
name is `NAS_HOST`, the workgroup and server description are their defaults, and share and folder
UUIDs are replaced.

### 11.3 Not used, and kept out of the contract

The ACL methods (`getFileACL`, `setFileACL`), the snapshot methods of `ShareMgmt`, `getPath`,
`enumerateSharedFolders` (the unpaged form of `getList`), `SMB.emptyRecycleBin`, and every `NFS.*`
method but the existing `getStats`.

---

## 12. Components

### 12.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer), contributed back to the
library.

| Component | Why | States to cover |
| --- | --- | --- |
| **`AccessGrid`** (new) | One table of people and groups, each row a three-way choice, with search, a filter, "Set all shown to", in-browser paging, changed marks, unavailable rows with reasons, and an optional fourth value shown only where stored. Flow B (a person's access across folders) will reuse it with folders as rows | loading, error, empty, filtered empty, populated; 0, 1, 1,000 rows; a row with the fourth value; an unavailable row; changed rows; saving (all unavailable); long and right-to-left names; 320 px (the choice wraps under the name); 200% zoom; keyboard (one tab stop per row, arrows inside) |
| **`SegmentedChoice`** (new, used by `AccessGrid`) | A compact radio group drawn as joined buttons, one tab stop, arrows inside, for three or four short mutually exclusive words | default, hover, focus, checked, disabled with reason, error; both themes; 40% longer labels wrap to a vertical stack rather than truncate |
| `JobSummary` (extend) | An item with the warning-shape icon for guest access (the RAID Stripe notice is a block before the typed field; this is one item in the list) | with and without the item |
| `UsedByPanel` (reuse; one new entry kind) | "Shared with Windows and Mac computers" as a named entry with no link | as now |

### 12.2 Reused as they are

`TableToolbar`, `SearchField`, `Select`, `TablePagination`, `CheckboxField`, `RadioGroupField`,
`TextField`, `FactList`, `Identifier`, `CopyButton`, `ConfirmDialog`, `Dialog`, `TypeToConfirmField`,
`JobRunner`, `PreflightNotice`, `JobResult`, `InlineAlert` (warning-shape neutral), `Disclosure`,
`EmptyState`, `StatusPill`, `ExternalLink`, `Breadcrumbs`, `PageTitle`, `Card`.

### 12.3 In the app

- `sharedFolders/accessModel.ts`: the join of 0.4 (rows, stored values, group lines, stale entries,
  the write list), with its tests for every combination in 14.2.
- `sharedFolders/nameRules.ts`: 0.5's name and path rules, shared by the flow and the repair dialog,
  and the contract's patterns.
- `sharedFolders/smbModel.ts`: 0.3's states, 0.10's read-modify-write for shares and settings, the
  address builder.
- `sharedFolders/shareActions.ts`: the refusals of 0.9, from the reads, failing closed.
- `sharedFolders/addFlow.ts`: the run of 6.4 and its failure plan, in the session store as Flow A's.
- Pages: `SharedFolderPage`, `AddSharedFolderPage`, `SmbPage`; `SharedFoldersPage` and
  `SharedFoldersTable` changed (section 1).

---

## 13. Mock scenarios to add

Written by hand from the captured shapes, remembering what the flow and pages do (create, access,
share, settings, stop, delete, apply, undo), so the journeys can be walked on `pnpm dev:mock`:

| Scenario | What it shows |
| --- | --- |
| `sharesNone` | No shared folder, SMB off, two users and one group |
| `sharesSome` | Three folders: one shared with two people, one with guest access, one not shared; SMB on |
| `sharesMany` | 140 folders and 1,000 users and 60 groups (paging, the grid at size) |
| `sharesBroken` | One folder of each Critical status, and one Unknown code |
| `sharesSmbDown` | SMB on but not running |
| `sharesNoUsers` | No user accounts and no groups |
| `sharesStale` | A folder with entries for a deleted account and a 0 entry ("Blocked") |
| `sharesClassicOptions` | A share with recycle bin, Time Machine and "Guests only" set in the classic interface |
| `sharesUsedElsewhere` | A folder whose `_used` is true with no SMB share (an NFS share or a backup job) |
| `sharesWholeFs` | A folder using the whole file system, and one with another folder inside it |
| `sharesLongHost` | A NAS name of 16 characters |
| `sharesAddFails` | The flow failing at each step in turn, including "record made, folder not made" |
| `sharesDeleteSlow` | A delete with files that takes 40 seconds, and one whose request is cut |
| `sharesHostile` | Names and descriptions of 200 characters, right-to-left, and text that looks like markup |

---

## 14. Checks before calling it done

### 14.1 On the mock, and in every build

- Every page in both themes, at 1280 and 320 px and at 200% zoom; the grid's choice wraps, never
  scrolls sideways outside its table region.
- A keyboard-only pass of each journey: add (with and without sharing), give and take access, share,
  stop, turn SMB off, repair, remove keeping files, delete with files.
- Screen reader: loading, saved, the change count, the pending mark's text, the run's steps, the
  result; every dialog's description read with its title.
- Greyscale and the deficiency emulations: no meaning in colour alone (the changed mark is a word and
  an edge, the guest warning a shape and words).
- The built output: no inline script or style, no third-party origin, no handle in the DOM (UI-1,
  UI-5, UI-7); the routes make no call on load beyond reads (UI-4).
- `accessModel` tests for every combination of 14.2's item 4; `nameRules` tests for each rule of 0.5.

### 14.2 On the test VM: facts to verify

The VM (OMV 8.6.1) with a snapshot taken first; the data file system on `sda1`, a scratch disk for a
second file system, and a ZFS pool for item 1. Everything is put back afterwards: no extra shared
folder, user or group, SMB as it was, nothing pending. The captures come first, read-only methods
before state-changing ones.

1. **`ShareMgmt.getCandidates`** (once cleared): its rows for EXT4, BTRFS and a ZFS file system; that
   its `uuid` is the `mntentref` a folder made there gets; that an unmounted file system is left out.
2. **Pending modules**, by `dirtyModules` after each write, alone: `set` new, `set` change (with and
   without an SMB share), `setPrivileges` (with and without), `setShare` new and change, `deleteShare`,
   `setSettings`, `delete` with each `recursive`. In particular whether the network-discovery module
   appears as `avahi` or `zeroconf` (R10's expected sets).
3. **An empty access list** (V6): a share with guest access off and no entries, opened by a signed-in
   person who was not given access. The design does not depend on the result (0.4); the result is
   recorded.
4. **Access combinations**, each opened from a client with `smbclient` as the person: person 7; person
   5; person with no entry while another has 7; group 7 and person no entry; group 7 and person 0;
   group 5 and person 7; read only for everyone with person 7; guest access on with person 0; "Guests
   only". The results go into `accessModel`'s tests and 0.4's group lines.
5. **A guest on a folder made here** (770), with guest access on: whether it is listed, opened,
   readable.
6. **The lists**: whether `getUserList` lists the web administrator account; whether `getGroupList`
   lists `users`; the shape of an empty and a one-entry `privileges` (an object, an array, a string);
   `perms` as a number or a string.
7. **Read-modify-write**: `setShare` with a `getShareList` row minus `sharedfoldername` accepted and
   every field kept; with `sharedfoldername` left in (refused or ignored); `setSettings` with the whole
   `getSettings` reply accepted and the home-folder, `netbios` and `minprotocol` values kept.
8. **`set` on an existing folder**: changing the description keeps the access list; the reply's
   `reldirpath` has its trailing slash; a path that exists keeps its mode; a new path gets 770 with
   the setgid mark and the group `users`.
9. **Names**: OMV's answer to a second folder named with different case; to a folder named `homes`
   and `global` (and what Samba then shows); a 200-character name refused at 80; a right-to-left name.
10. **`delete`**: refused while an enabled and while a turned-off SMB share refers (its message); with
    files on a folder of about 2 GiB in many small files: how long it takes, and what the browser
    sees if it runs past the web server's limits; on a BTRFS shared folder (a subvolume) and its
    snapshots.
11. **Turning SMB on** with a 16-character host name: the message, as text.
12. **After apply**: how long until `Services.getStatus` shows SMB running and the share opens from a
    client (step 7's wait); what `getList`'s `status` says for a folder whose file system is
    unmounted but whose mount folder exists.
13. **`getShareList`** when a share's shared folder has been removed by hand in the classic interface
    (whether the read fails).
14. **The classic deep link** to a folder's file-permission page, for 3.1's link.

---

## 15. Adversarial pass

The main journeys walked twice more: adding a folder and sharing it, then changing access and
deleting. Findings and what changed in this design:

### 15.1 Trying to break it

| Probe | Finding | Change made |
| --- | --- | --- |
| 0 people and groups | The grid would be an empty table and sharing with guest access off impossible, with no reason given | 3.4's empty state says why and where to add people; 6.2 C6 then offers only guest access or no sharing |
| 1 person | "Set all shown to" and the filter are noise | Kept: they are in the toolbar, not in the way; the grid has one row and needs no paging |
| 1,000 people, 60 groups | One tab stop per row is still 1,060 stops | Search and the "With access" filter come first in the tab order; paging at 50; groups first |
| Name of 200 characters, right-to-left, markup-like (`<b>x</b>`) | The name is a network name; markup-like text must stay text; right-to-left must not reorder the sentence around it | 80-character limit (OMV's); `dir="auto"` and isolation in every sentence (0.2); text only (UI-2); `sharesHostile` scenario |
| `Photos` and `photos` | OMV takes both; Windows and Mac would not tell them apart | 0.5: unique ignoring case |
| A folder named `homes` or `global` | Collides with Samba's own sections | 0.5: refused, [verify] item 9 |
| Refresh mid-flow, back, a second tab | The flow's journal is in memory | R8: the list's unfinished-work lines (1.5); step 1 re-reads names, candidates and pending changes |
| Two tabs saving access to the same folder | `setPrivileges` replaces the whole list: the second save would undo the first | 0.10: the list is re-read before saving and the save stops when it changed |
| Another administrator changes SMB options in the classic interface while the form is open | A full-replace write would undo theirs | 0.10: re-read just before writing; only the three fields are changed |
| The session expires mid-form | The grid's choices would be lost on sign-in | The page's unsaved-changes guard is the router's; after sign-in the page re-reads (the fixed route after login, UI-3). The loss is said ("You were signed out. Changes that were not saved are lost.", the shell's existing message); nothing is kept in storage (UI-13) |
| Deleting with files a folder that is the whole file system | OMV would delete everything on the file system | 0.9 and 8.1: refused, with the file system's page offered |
| Deleting with files a folder whose file system is not mounted | The path is an empty folder on the system drive, or nothing | Refused (0.9) |
| Deleting a large folder | The request may run long or be cut | 8.5: the step says so; a cut request is "Could not tell" with "Check again" [verify] item 10 |
| Removing the last access from a shared folder | Leaves it with an empty list (0.4) | Refused (0.9, 3.3) |
| Guest access on a folder made here | Guests cannot open it (770) | Said before ticking (4.3) [verify] item 5 |
| "Guests only" set in the classic interface | The form has no such choice | Shown and kept until the reader changes it, with the sentence of 4.3 |
| A stale access entry for a deleted account | Saving would be refused by OMV | Dropped on save, said under the grid (0.4) |
| The NAS name over 15 characters | Turning SMB on is refused by OMV after the click | Checked first and said with where to change it (4.4) |
| A task failing at apply | R7 mix | The flow's R7 plan; the band's own "Try applying again" |
| Pending changes from another administrator | They would ride the flow's apply | R1 refuses to start; R10 lists anything new before applying |

### 15.2 Without sight

- **Tab order**: every page in reading order; the grid is one stop per row with arrows inside, its
  toolbar first. Found: the change count updating on every arrow press would chatter; it now updates
  500 ms after the last change (3.3).
- **Focus**: visible on the segmented choice's checked and unchecked parts in both themes (the 2px
  ring with its offset outside the joined edges); never lost after a save (it stays on the button).
  Found: after "Stop sharing" the button that opened the dialog is gone; focus now moves to the
  section heading (4.5).
- **Announcements**: loading, saved, "N changes not saved", the pending mark's text ("Not applied
  yet."), the run's steps, the result, every failure assertively. The guest warning is part of the
  checkbox's description, so it is heard when the box is reached, not only when it appears.
- **Colour alone**: none. Changed rows carry the word "Changed"; the guest choice carries a shape and
  words; the SMB state uses the fixed pills and words.
- **200% zoom**: the grid's choice moves under the name; the summary and dialogs reflow to one column;
  nothing needs sideways scrolling outside the grid's own region.

---

## 16. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID | Decision | Why |
| --- | --- | --- |
| D1 | A folder's page is addressed by its **UUID** _(recommended)_ | Names may hold spaces and any script, and cannot be changed here; the UUID is stable and already validated by the contract's pattern |
| D2 | **Groups first, then people** in the grid, each in natural order _(recommended)_ | The UX audit's 1,000-account probe; one group row often decides access for many |
| D3 | **"No access" stores no entry**; 0 is shown as **Blocked** only where it is stored _(recommended)_ | Storing 0 would refuse the members of any group given access (0.4) |
| D4 | The **network address is built from the NAS's host name**, shown as text with copy, never a link _(recommended)_ | UI-3; `\\host\share` and `smb://` are not web links |
| D5 | New SMB shares get **the classic form's defaults** for every option not asked _(recommended)_ | The same result as the classic interface; the owner's agreed handover chose the same |
| D6 | **Existing shares keep every option** this page does not show (0.10) _(recommended)_ | A full-replace write must not reset what someone set in the classic interface |
| D7 | The SMB page is titled **"Windows and Mac sharing"**, with "SMB/CIFS" under it; the menu keeps "SMB/CIFS" _(recommended)_ | Plain words on the page; OMV's menu word so existing users find it |
| D8 | The **list keeps server-side paging**, and the Sharing column joins the whole SMB list in the browser _(recommended)_ | Phase 3's behaviour stays; SMB shares are few |
| D9 | **Access entries for accounts not listed are dropped on save**, and said before saving _(recommended)_ | OMV refuses a deleted account; the classic page drops them too |
| D10 | **No confirmation dialog for saving access**; the change count and the band's Apply are the gate _(recommended)_ | Nothing on the disk changes; Apply lists the services and Undo takes it back |
| D11 | The band's word for `samba` becomes **"Windows and Mac sharing (SMB)"** _(recommended)_ | The same words as the pages it comes from |
| D12 | **The description** is the only field of the folder edited in place; 255 characters at most _(recommended)_ | It is the only one safe to change on a working folder (P5, P6) |
| D13 | **Read-only mounts and the system drive** cannot hold a new shared folder _(recommended)_ | A folder there fails to be made, or fills the drive the NAS runs from |
| D14 | **No dashboard rows** for shared folders in this slice _(recommended)_ | A broken folder is shown on its list and page; its file system's problems are already on the dashboard |
| D15 | Catalogue: `shares.term.*`, `access.*`, `folderSmb.*` as shared keys; `modules.samba` changed _(recommended)_ | Flow B and the dashboard will use them |

---

## 17. For the owner to agree

The clearance question, the scope, and the destructive, access-cutting and access-opening points of
this slice. The design is built only once these are agreed. Each has a recommendation.

1. **P1, two more methods.** `SMB.deleteShare` (stop sharing; delete a folder that was shared over SMB)
   and `ShareMgmt.getCandidates` (which file systems may hold a shared folder, ZFS included).
   **Recommended: clear both.** Without them, "Stop sharing" only turns a share off, such folders
   cannot be deleted here, and no shared folder can be made on a ZFS file system (11.0).
2. **P2, the scope.** Built here: the list with actions, a folder's page, access per person and group,
   adding a folder with access and SMB in one flow, sharing over SMB with three options and stopping,
   turning SMB on and off, repairing where a broken folder points, deleting with or without files.
   Left to the classic interface: file permissions on the disk (ACLs), NFS, the advanced SMB settings
   and share options (recycle bin, Time Machine, hosts, extra options and the rest), copying access,
   renaming, moving a working folder, BTRFS snapshots. **Recommended: as written.** (Scope)
3. **P3, Flow A's handover.** The classic steps are replaced by one button that opens "Add a shared
   folder" with the new file system chosen; Flow A keeps its stages and title. The alternative is the
   file-systems design's section 8 (stage C inside Flow A, one summary and two checkpoints).
   **Recommended: the button**, since it reuses one flow from the list and from Flow A, and changes
   nothing already agreed for Flow A. (6.7)
4. **P4, new folders.** Mode 770 (Q4), with no choice of mode here; the folder named after the shared
   folder at the top of the file system by default; another path or the whole file system on request;
   an existing folder used as it is, which the summary says. Only mounted, non-system file systems that
   both OMV's list and this interface allow. **Recommended: as written.** (0.5, 0.6, 6.2)
5. **P5, names.** OMV's share-name rule, plus: unique ignoring case, no leading full stop or `..`, not
   Samba's own section names. The name is fixed once made (it is the network address); OMV would allow
   a rename, the classic interface does not offer one. **Recommended: as written.** (0.5)
6. **P6, changing where a folder points.** Offered only to repair a folder that cannot be reached
   (missing folder, gone file system, a file in its place); it moves no file and says so. Moving a
   working folder stays in the classic interface. **Recommended: as written.** (section 7)
7. **P7, the access model.** Three choices (Read and write, Read only, No access); No access stores
   nothing; an existing 0 entry is shown as Blocked and kept until changed; entries for accounts no
   longer listed are dropped on save; the web administrator account is not offered; no confirmation
   for saving access. **Recommended: as written.** (0.4, section 3)
8. **P8, nobody with access.** A folder is not shared over SMB with guest access off until at least one
   person or group has access, and its last access cannot be removed while it is shared that way.
   **Recommended: as written**, whatever the VM shows for an empty list (14.2, item 3). (0.9)
9. **P9, guest access.** Offered on the share form and in the flow as its own unticked checkbox, never
   preselected, with two warnings before it is saved: anyone on the network gets in and No access no
   longer applies; and guests may not be able to open folders made here (770). "Guests only" is never
   offered; an existing one is shown and kept until changed. **Recommended: as written.** The
   alternative is to leave guest access to the classic interface entirely. (4.3)
10. **P10, the share's options.** Shown in the network list (on), read only for everyone (off), guest
    access (off); new shares get the classic form's defaults for the rest; existing shares keep every
    other option. **Recommended: as written.** (0.10, 4.3)
11. **P11, stopping a share.** With `SMB.deleteShare`: a plain confirmation that says computers using
    the address lose it, the files and access stay, and options set in the classic interface go with
    the share. Without it: the share is turned off and kept. **Recommended: with `deleteShare`.** (4.5)
12. **P12, turning SMB off.** A plain confirmation naming how many folders and which stop being
    reachable; to the band. Turning it on needs no confirmation and is checked against the 15-character
    name limit first. **Recommended: as written.** (5.3, 4.4)
13. **P13, deleting.** Two ways. "Remove, keep the files": a plain confirmation that says where the
    files stay. "Delete with all its files": red, typed name, refused while anything uses it, while its
    folder cannot be found, while its file system is not mounted, for the whole file system, when
    another shared folder is inside it, and on the system drive; the deletion is OMV's own, inside the
    request, and the page says it cannot count what is deleted. **Recommended: as written.** (section 8)
14. **P14, pending changes.** The add flow refuses to start while anything is pending and applies once
    at "Save and share". Both ways of deleting refuse to start while anything is pending and apply
    right after. Every other change goes to the band. **Recommended: as written.** (0.8)
15. **P15, no way round a refusal.** A refused action offers no classic link that does the same without
    the check. Where the blocker is something this interface does not manage (an NFS share, a backup
    job, an add-on), the refusal says to deal with it in the classic interface, with no link.
    **Recommended: as written**, as for the earlier slices. (0.9)
16. **P16, effective access (Q9).** Showing a folder's file permissions on its page needs
    `ShareMgmt.getFileACL`, which reads the disk and is not cleared. **Recommended: not in this
    slice**; the page says what access does and does not cover, and links the classic page. (11.0, 3.1)

---

## 18. What the test VM is expected to show, and what would change this design

Nothing has been observed yet (section 14.2 is the plan). These assumptions carry the most weight; if
the VM shows otherwise, the build follows the VM and a "Changes during the build" section records each
change, as the RAID and ZFS slices do.

| # | Assumption | If it does not hold |
| --- | --- | --- |
| 1 | The pending modules are those of 0.8 | R10's expected sets change; nothing else does |
| 2 | Access combinations behave as 0.4 reads (Samba's lists as the template writes them) | `accessModel` and 0.4's group lines follow the VM; the three choices stay |
| 3 | A guest cannot open a 770 folder | 4.3's second warning is removed, or reworded to what a guest can do |
| 4 | `setShare` and `setSettings` accept the read rows back (without `sharedfoldername`) and keep every field | The write builds the object field by field from the datamodel, and the contract names each |
| 5 | `getCandidates` lists ZFS file systems with the identifier a folder gets | Without it, ZFS file systems are listed under "Cannot be used" with "Use the classic interface for shared folders on ZFS." |
| 6 | A delete with files on a few GiB finishes within the web server's limits | A cut request is already handled as "Could not tell"; if it is common, the dialog says before confirming that a large folder may take longer than the page can follow, and the list's unfinished-work line recognises a folder still there |
| 7 | `getShareList` survives a share whose folder was removed by hand | If it fails, the folder page and the SMB page show the read's failure with the server's words, and the list's Sharing column says "Not known" |
| 8 | OMV takes a folder called `homes` and Samba then misbehaves | If OMV refuses it, the rule stays as a friendlier message; if Samba copes, the rule is dropped |
