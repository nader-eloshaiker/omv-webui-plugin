# Phase 5, services slice: NFS, the rsync server, copy jobs and the rest of SMB: design

The services slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): sharing
folders with Linux and Unix computers over NFS (turning NFS on and off, letting computers in to a
folder, stopping), the rsync server (turning it on and off, offering a shared folder to it, who may
use it), copy jobs (the classic interface's "Rsync tasks": a list, adding and changing a job with its
direction, destination and schedule, a trial run, running a job now with its output, deleting a job),
and the parts of Windows and Mac sharing the shares slice left out that can be said in plain words
(the workgroup, a share's recycle bin, emptying it). It picks up where the shares slice stops: a
shared folder's page says today that "an NFS share, a backup job, the Rsync server" may use it,
without naming them ([phase-5-shares.md](phase-5-shares.md), 0.7); after this slice it names each one
and links to it.

**Status: agreed by the owner on 2026-11-23 (P1 to P19 as written, section 20; `CertificateMgmt.getSshList` cleared). Built on 2026-11-23, with the changes of section 22.** The 19 methods the owner cleared on
2026-11-23 and the SMB, NFS and SSH operations already in the contract cover everything here except
remote copy jobs over SSH, which need one more read (14.0). This slice can delete data (a copy job
that also deletes files on its destination, a job pointed the wrong way, emptying a recycle bin),
opens folders to other computers (NFS, which asks for no password; an rsync server folder without a
sign-in), handles passwords of other computers, and cuts access (stopping NFS, the rsync server, a
share), so every such point is in section 20 and nothing in it is built before the owner agrees.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-5, UI-6 and UI-8 above all), the journal entries of 2026-11-20 (the UX audit's answers: Q2 a flow
refuses to start while other changes are pending, Q4 new folders get mode 770, Q6 a choice that opens
a folder to anyone is separate and explained, Q10 Waiting), of 2026-11-21 (destructive slices agreed
before building; the interface enforces its own safeguards; disk health read only when asked), of
2026-11-22 (the shares and users designs agreed and built, with the VM's facts) and of 2026-11-23 (the
services methods cleared), the [UX audit](ux-audit.md) (Flow C "Back up a shared folder" in 4.4, the
job-runner rules R1 to R10 in 4.1, Pattern G in 4.8, the backend facts B1 to B14 in its section 0, B9
and B11 above all), and the conventions of [phase-3-pages.md](phase-3-pages.md) (the SSH page, its
section 3), [phase-5-monitoring.md](phase-5-monitoring.md) (service states, the service details, the
system logs), [phase-5-disks.md](phase-5-disks.md) (a schedule in words, 6.2 to 6.6),
[phase-5-shares.md](phase-5-shares.md) and [phase-5-users.md](phase-5-users.md), each in its section
0, which every page here reuses unchanged. Where this document and the style guide disagree, the
style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x tree: the `NFS`, `Rsync`, `Rsyncd` and `SMB` RPC
services, their `rpc.*` and `conf.*` datamodels, the `nfs`, `rsync`, `rsyncd` and `samba` engine
modules' listeners, the NFS exports, rsync job, rsync server and Samba recycle-bin deploy templates,
`CertificateMgmt.getSshList`, and the classic workbench's NFS, rsync and SMB forms). Earlier slices
observed a few of them on the test VM: the SMB methods' shapes, `Services.getStatus`'s rows (`nfs`,
`rsyncd`, `samba`, `ssh`) and `NFS.getStats`. Anything marked **[verify]** is checked on the mock and
the VM, by capture, before it is relied on (section 17.2). Anything marked **[owner]** needs the
owner's answer before that part is built.

Every method used here is administrator-only (read from source: each checks the administrator role).
A normal user sees nothing new (section 13).

## Scope of this slice (recommended)

| Built here                                                                                                                                                                                                                                                                                                                            | Left to the classic interface, and why                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Linux and Unix sharing (NFS)**: on and off; which folders are shared and with which computers                                                                                                                                                                                                                                       | **NFS versions and NFSv4 tuning**: which NFS versions are offered (shown as text, changed there). The NAS chooses the number of server threads itself                                                                                                                                                                                                                                                                                |
| A shared folder's **NFS section**: let in one computer, one network, or (its own warned choice) any computer; read only or read and write; stop                                                                                                                                                                                       | **NFS extra options** (`subtree_check`, `insecure`, `no_root_squash`, `all_squash`, `anonuid` and the rest): each share keeps what was set; new shares get the classic form's defaults. An option that hands the other computer administrator power over the files is shown and warned, never offered (0.5)                                                                                                                          |
| **The rsync server**: on and off; the folders offered to it, each read only or read and write, with a name and password by default, optionally only for one computer or network                                                                                                                                                       | **The rsync server's port and extra options**, a module's user and group, chroot, write-only, maximum connections, hosts deny, "list module", and modules with more than one sign-in (shown; changed there, 0.8)                                                                                                                                                                                                                     |
| **Copy jobs** (the classic "Rsync tasks"): a list; a job's page; adding and changing a job with its direction (from, to), on this NAS or with another computer, its schedule, whether it also deletes, and email; a **trial run** before a job that deletes runs for real; running a job now with its output and Stop; deleting a job | **Advanced rsync options**: archive, recursion, permissions, times, owner, group, ACLs, extended attributes, compression, partial files, quiet, extra options. New jobs get the classic form's defaults; existing jobs keep theirs, and options that delete files are shown and treated as deleting (0.6)                                                                                                                            |
| Remote copy jobs **over SSH with one of the NAS's SSH keys** (once 14.0 is cleared), and **to or from another computer's rsync server** with its password                                                                                                                                                                             | **Making SSH keys and copying a key to another computer** (`CertificateMgmt.createSsh`, `copySshId`): the second sends another computer's password through the NAS, and both belong with the certificates pages (System). The job form shows the chosen key's public half to copy by hand                                                                                                                                            |
| **Windows and Mac sharing, the rest**: the workgroup; a share's recycle bin (on, off, how many days files are kept); emptying a recycle bin                                                                                                                                                                                           | **The other SMB settings and share options**: server description, minimum protocol, NetBIOS, WINS, time server, log level, sendfile, asynchronous I/O, extra options, home-folder sharing; a share's hide dot files, ACL inheritance, attributes, hosts, audit, symbolic links, encryption, macOS compatibility, Time Machine, the recycle bin's size limit. As the shares slice agreed (its P2), plus the recycle bin moved in here |
| A shared folder's **Used by** names every core setting that uses it, with links; its delete refusals do the same                                                                                                                                                                                                                      | **Scheduled tasks** (`Cron.*`), the rsync job log's own settings, add-ons' settings                                                                                                                                                                                                                                                                                                                                                  |

The recommendation rests on the same three things as the earlier slices: the actions kept are the
ones a home or small-office owner meets when reaching the NAS from other kinds of computers and when
keeping a second copy of their files; each kept action can be told in one plain sentence, including
what it costs; and the actions left out are the ones whose effects cannot be put in one sentence
without Linux, NFS or rsync knowledge (section 20, P2). Copy jobs are kept, not left out, because the
classic form is where a backup most easily becomes a deletion (UX audit 4.4 and its 3.4 field count:
36 fields, 4 that matter), and that is exactly what this design makes explicit.

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the four
async states, the settings-form rules, the pending mark, the shared catalogue), the monitoring
domain's (status words, service states from `Services.getStatus`, background and foreground reads,
the service details, the system logs), the disks slice's (a schedule in words, one confirmation then
a step list, a task with its output), the shares slice's (Windows and Mac sharing's states and words,
the network address built from the host name, Used by, read-modify-write, direction controls in
names, refusals with no classic link round them) and the users slice's (secrets cleared after every
request, removed from replies). This section adds only what is new.

### 0.1 The words

| OMV, NFS or rsync term                    | The interface says                                                                                                 | Introduced as (`services.term.*`)                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFS service (`nfs`)                       | **Linux and Unix sharing (NFS)**                                                                                   | "Linux and Unix computers, and some media players, reach shared folders over NFS. NFS does not ask for a password: it lets in computers by their network address."                                                         |
| NFS share (`conf.service.nfs.share`)      | **let in** ("Computers at 192.0.2.0/24 may use it"); "NFS share" only where the classic interface's word is needed | 0.4                                                                                                                                                                                                                        |
| `client`                                  | **who may connect**: one computer, one network, any computer                                                       | 0.4                                                                                                                                                                                                                        |
| `options` `ro` / `rw`                     | **Read only** / **Read and write** (the shares slice's access words, reused)                                       |                                                                                                                                                                                                                            |
| `extraoptions` (NFS)                      | **other NFS options**                                                                                              | "Options set in the classic interface. They are kept as they are."                                                                                                                                                         |
| `no_root_squash`                          | **the other computer's administrator acts as this NAS's administrator on these files**                             | 0.5                                                                                                                                                                                                                        |
| Rsync job (`conf.service.rsync.job`)      | **copy job**, "rsync job" second                                                                                   | "A copy job copies the files of one folder into another, on this NAS or with another computer, by itself on a schedule. It keeps one copy, not earlier versions: a file changed or deleted by mistake is copied as it is." |
| `type` local / remote, `mode` push / pull | **Copy from** and **Copy to**, each "A shared folder on this NAS" or "Another computer"                            | 0.6                                                                                                                                                                                                                        |
| `optiondelete`                            | **also delete**: "Also delete files in {{dest}} that are not in {{src}}"                                           | 0.6                                                                                                                                                                                                                        |
| `optiondryrun`                            | **trial run**                                                                                                      | "A trial run lists what the job would copy and delete, and changes nothing."                                                                                                                                               |
| `enable` (job)                            | **on a schedule** / **only when started here**                                                                     | 0.7                                                                                                                                                                                                                        |
| `sshcertificateref`                       | **SSH key of this NAS**                                                                                            | "A key the NAS keeps for signing in to other computers. The other computer must have its public half."                                                                                                                     |
| Rsync server (`rsyncd`)                   | **rsync server**                                                                                                   | "The rsync server lets other computers copy files to and from this NAS with rsync, for example another NAS that keeps its copies here."                                                                                    |
| module (`conf.service.rsyncd.module`)     | **folder offered to the rsync server**, "offered as {{name}}"                                                      |                                                                                                                                                                                                                            |
| `authusers`, `users[]`                    | **ask for a name and password**; a **rsync sign-in**                                                               | "A name and password only for the rsync server. They are not a person on this NAS."                                                                                                                                        |
| `hostsallow`                              | **who may connect** (the NFS words, 0.4)                                                                           |                                                                                                                                                                                                                            |
| `recyclebin`                              | **recycle bin** (Windows' own word)                                                                                | "Files deleted from a Windows or Mac computer are moved into the recycle bin instead, so they can be got back."                                                                                                            |
| `workgroup`                               | **workgroup**                                                                                                      | "The name Windows computers use to group computers on a network. Most networks use WORKGROUP."                                                                                                                             |

"Export", "mount", "squash", "module", "daemon", "push", "pull", "cron", "URI" and "dry run" appear
only in technical places (the server's own messages, task output, `Identifier` values) and, where the
classic interface's word helps someone find the same setting there, once in brackets.

### 0.2 Formatting

| What                                            | Rule                                                                                                                                                                                                                                                                                                                                                | Example                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A shared folder (`{{folder}}`)                  | The shares slice's 0.2: the name as text, medium weight, `dir="auto"`, isolated in sentences, a router link to its page where it is not the page itself                                                                                                                                                                                             | `Photos`                                   |
| Who may connect (`{{client}}`)                  | In `Identifier`: an address, a network (`192.0.2.0/24`, `2001:db8::/32`) or a computer's name; in sentences "the computer at 192.0.2.10", "computers on 192.0.2.0/24", "any computer that can reach the NAS"; a value set in the classic interface that is none of these is shown as stored, in `Identifier`, with "(set in the classic interface)" | `192.0.2.0/24`                             |
| How many addresses a network holds              | Counted in the browser from the prefix, the locale's grouping, "addresses"; IPv6 networks of /64 or wider say "a very large number of addresses"                                                                                                                                                                                                    | "256 addresses"                            |
| NFS address (`{{nfsAddress}}`)                  | Built in the browser from the shell's host name and the folder's name, as text in `Identifier` with `CopyButton`, never a link (UI-3): `NAS_HOST:/export/{{folder}}` and, when an NFSv4 version is on, also `NAS_HOST:/{{folder}}` labelled "NFSv4" **[verify]** which form a Linux client mounts with each version                                 | `NAS_HOST:/export/Photos`                  |
| Rsync server address (`{{rsyncAddress}}`)       | `rsync://NAS_HOST/{{module}}/`, with `:{{port}}` after the host when the port is not 873; text in `Identifier` with `CopyButton`                                                                                                                                                                                                                    | `rsync://NAS_HOST/Photos/`                 |
| Another computer (`{{host}}`, `{{remotePath}}`) | Host name or address in `Identifier`; the folder on it in `Identifier`; in sentences "{{remotePath}} on {{host}}"                                                                                                                                                                                                                                   | `backup.example.org`, `/srv/copies/photos` |
| A copy job's name (`{{job}}`)                   | Its note (`comment`) when it has one, as text, `dir="auto"`; otherwise "{{src}} to {{dest}}" built from the two sides                                                                                                                                                                                                                               | `Photos to Backup`                         |
| A schedule (`{{when}}`)                         | 0.7's words; times in the NAS's own clock, the locale's hours and minutes; when the browser's time zone differs from the NAS's (`System.getTimeSettings`), "(NAS time)" after the time                                                                                                                                                              | "Every day at 03:00"                       |
| A public SSH key                                | In `Identifier`, wrapped, with `CopyButton`; its comment as the key's name                                                                                                                                                                                                                                                                          |                                            |
| Task output                                     | The terminal pair (style guide 5.7), text only, ANSI codes stripped, direction controls made visible (the shares slice's 19)                                                                                                                                                                                                                        |                                            |
| Days                                            | "{{count}} days" with plurals, tabular                                                                                                                                                                                                                                                                                                              | "30 days"                                  |

### 0.3 States in this slice

**Linux and Unix sharing (NFS)** and **the rsync server** take the shares slice's 0.3 table for Windows
and Mac sharing unchanged, with their own reads and words: `NFS.getSettings` (`enable`) or
`Rsyncd.getSettings` (`enable`), and `Services.getStatus`'s `nfs` or `rsyncd` row (observed names).

| Reading                             | Pill         | NFS words                                                                                                                                        | Rsync server words                                                                                                                            |
| ----------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable` false                      | **Disabled** | "Off. No folder can be reached over NFS."                                                                                                        | "Off. No folder is offered to other computers over rsync."                                                                                    |
| on, running                         | **OK**       | "On."                                                                                                                                            | "On."                                                                                                                                         |
| on, not running, module not pending | **Critical** | "On, but not running. Folders shared over NFS cannot be reached. The NFS service details may say why." + router link `/diagnostics/services/nfs` | "On, but not running. Other computers cannot copy to or from this NAS. The system logs may say why." + router link `/diagnostics/system-logs` |
| on, not running, module pending     | no pill      | "Turned on. It starts when you apply the pending changes." + the pending mark                                                                    | the same words                                                                                                                                |
| a read failed                       | **Unknown**  | "Could not read whether Linux and Unix sharing is on."                                                                                           | "Could not read whether the rsync server is on."                                                                                              |

**A folder's NFS entries** (the rows of `NFS.getShareList` whose `sharedfolderref` is the folder;
OMV allows several, one computer or network each, read from source) are settings, not statuses:
"Not shared with Linux and Unix computers." / "Shared with Linux and Unix computers: {{n}} computers
or networks may connect." and one line per entry (section 2). The pending mark and "Not applied yet."
when `nfs` is pending and this session saved it.

**A copy job** is a setting with a schedule, not a monitored thing, so it has **no status pill** of its
own:

| Reading                                                           | Words                                                                                                               | Mark                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `enable` true, no trial                                           | "On a schedule: {{when}}."                                                                                          | none                                                                                                 |
| `enable` false                                                    | "Not on a schedule. It runs only when you start it here."                                                           | none (it is a choice, 0.7)                                                                           |
| `optiondryrun` true, or a trial option in its extra options (0.6) | "Trial runs only: it changes nothing." added                                                                        | the warning-shape neutral icon with the words, because a job that looks like a backup copies nothing |
| `rsync` pending and this session saved it                         | "Not applied yet."                                                                                                  | the pending mark                                                                                     |
| Run in this session                                               | The task's own pill: **Running**, **Succeeded**, **Failed**, **Cancelled** (style guide 5.7)                        | as the task                                                                                          |
| Anything else about its last run                                  | "This page cannot tell whether its last run worked. Its output is in the Rsync jobs log." + router link (section 4) | none: Unknown is never drawn as OK, and nothing here claims a result it did not see                  |

**A folder offered to the rsync server** (a row of `Rsyncd.getModuleList`): "Offered as
{{rsyncAddress}}", "Read only" / "Read and write" / "Copy to it only" (write-only, set in the classic
interface), "Asks for a name and password" / "Asks for no password", who may connect (0.4), "Turned
off for this folder" when its `enable` is false. Not statuses; never pilled.

**A share's recycle bin**: "Off" / "On: files are kept {{days}}" / "On: files are kept until it is
emptied" (`recyclemaxage` 0). Not a status.

### 0.4 Who may connect (NFS, and the rsync server's folders)

NFS asks for no password. Whoever can reach the NAS from an address it lets in may use the folder
(0.5). OMV stores the choice as free text (`client` for NFS, `hostsallow` for an rsync server folder)
and writes it into the server's configuration as it is; an empty NFS `client` becomes "any computer"
(read from source). This interface never sends free text there. It offers three choices, as a radio
group in this order:

| Choice                                  | Stored as                                                                                                                            | Default                                                         | Said                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One computer**                        | One IPv4 or IPv6 address, or one computer's name (letters, digits, `.` and `-`, at most 253 characters, no wildcard)                 | **Chosen** for a new NFS share (the narrowest; section 20, P10) | "Only the computer at this address may connect." Field "Its address or name", placeholder "192.0.2.10"                                                                                                                                                                                                                                                                                           |
| **Computers on one network**            | An IPv4 network with a prefix from /8 to /32, or an IPv6 network from /16 to /128, written with its network address (`192.0.2.0/24`) |                                                                 | "Every computer on this network may connect." Field "Network", placeholder "192.0.2.0/24". Hint: "Write the network's first address, a slash and its size, as your router shows it." A network that holds more than 256 IPv4 addresses, or is wider than /64 in IPv6, shows the warning-shape neutral `InlineAlert`: "This network holds {{count}} addresses. Every computer on it may connect." |
| **Any computer that can reach the NAS** | `*`                                                                                                                                  | Never preselected                                               | After a 16px gap, its own choice (Q6). Hint: "Any computer on your network, and any that reaches it from outside, may connect." When chosen, the warning-shape neutral `InlineAlert`: "Any computer that can reach this NAS may use {{folder}}. NFS asks for no password, so this includes visitors' computers and anything that gets into your network."                                        |

- **Checks in the browser** (on blur and on Save): an address that is not a valid IPv4 or IPv6 address
  or name ("Write one address, such as 192.0.2.10, or one computer name."); a network whose address
  has bits set after the prefix ("192.0.2.5/24 is not the start of a network. Did you mean
  192.0.2.0/24?"); a prefix of /0 ("A network of /0 is every computer. Choose Any computer instead.");
  a prefix out of range.
- **A computer's name** is looked up by the NAS when the server starts, not by this page: "The NAS
  looks this name up when it starts NFS. If the name changes address later, the new address is not
  let in until NFS restarts." **[verify]** for a name that does not resolve: whether NFS still starts.
- **Values set in the classic interface** that are none of the three (a wildcard such as
  `*.example.org`, a netgroup, several entries in one field) are shown as stored with "(set in the
  classic interface)", kept on every save that does not change who may connect, and replaced only when
  the reader chooses one of the three.
- **For an rsync server folder**, "who may connect" is optional when a name and password are asked:
  its first choice is then **"Any computer with the name and password"** (stored empty, chosen by
  default), followed by the three above. Without a name and password it is required and "Any
  computer" is not offered (0.10, section 20, P13).

### 0.5 What NFS lets in

Read from source (the exports template) and to be confirmed on the VM:

- **No password.** NFS lets a computer in by its address and then believes what that computer says
  about who is using it: the person's account number (user ID). The page says it once, in the
  section's intro: "NFS asks for no password. A computer that is let in says which person is using it,
  by number, and the NAS believes it. Let in only computers you trust."
- **Access (who can use it) does not apply.** The shares slice's access grid is for Windows and Mac
  sharing and the rsync server; NFS ignores it. The NFS section says: "Who can use it, above, does not
  apply to NFS. Over NFS, the file permissions on the disk decide." For a folder made by this
  interface (mode 770, group `users`), that means a person on the other computer gets in only when
  their account number, or one of their group numbers, has access on the NAS **[verify]** with a
  client account whose number matches a person on the NAS and one whose number does not.
- **Read only or Read and write** (`options` `ro` or `rw`; OMV's own default is `ro`, and so is this
  page's). Read only is enforced by the NAS for every computer let in by that entry.
- **The other computer's administrator** is treated as nobody special by default (NFS's own default,
  "root squash"), so they cannot act as the NAS's administrator. The option `no_root_squash` turns
  that off. It is **never offered** here; when an entry's other options contain it, the entry shows
  the warning-shape neutral `InlineAlert`: "The administrator of the computers let in by this entry
  acts as this NAS's administrator on the files of {{folder}}: they can read, change and delete every
  file, whatever its permissions. This was set in the classic interface." (section 20, P11)
- **Other NFS options.** New entries get the classic form's own default, `subtree_check,insecure`
  (section 19, D6; the alternative is P11's). `insecure` lets in connections that do not come from the
  other computer's administrator; Mac computers and some media players need it **[verify]** with a Mac
  client. Existing entries keep their options exactly. The entry shows them, when they differ from the
  default, as "Other NFS options: `{{options}}` (set in the classic interface)".
- **Two entries for one folder** are allowed by OMV and written as one line for the folder; this page
  refuses a second entry for the same computer or network (0.10).

### 0.6 What a copy job does to its destination

Read from source (the rsync job deploy template, `Rsync.set`, `Rsync.execute`):

- **Direction.** A job copies from one side to the other, never both ways. OMV stores it as `type`
  (local or remote) and `mode` (push or pull). The form asks **Copy from** and **Copy to**, each
  either "A shared folder on this NAS" or "Another computer", and at most one side may be another
  computer:

  | Copy from        | Copy to          | Stored           | Said                                                          |
  | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------- |
  | A shared folder  | A shared folder  | `local`          | "Copies {{src}} into {{dest}}, both on this NAS."             |
  | A shared folder  | Another computer | `remote`, `push` | "Copies {{src}} from this NAS to {{remotePath}} on {{host}}." |
  | Another computer | A shared folder  | `remote`, `pull` | "Copies {{remotePath}} on {{host}} to {{dest}} on this NAS."  |

  The summary, the job's page and every confirmation repeat that sentence with an arrow between the two
  sides and the words "from" and "to", so the direction is never a colour, an icon or a position alone.

- **Contents into contents.** A shared folder's path always ends in `/` (read from source), so a job
  copies what is _inside_ the source into what is _inside_ the destination; it does not make a
  folder named after the source. This interface writes another computer's folder with a trailing `/`
  too, so both directions behave the same (section 19, D7) **[verify]**. A job made in the classic
  interface may lack it; its page then says "Copies the folder {{name}} itself into {{dest}}." when its
  source has no trailing `/`.
- **What is replaced.** Each run makes the destination's copy of each file match the source's: a file
  in both places with a different size or time is **replaced by the source's version**, whichever is
  newer. A job pointed the wrong way therefore replaces the newer files with older ones, even without
  deletion. The form says so under Copy to: "Files in {{dest}} with the same name as a file in {{src}}
  are replaced by the version in {{src}}, even when the one in {{dest}} is newer."
- **Also delete** (`optiondelete`). Off by default, never preselected. When on, each run also deletes
  every file in the destination that is not in the source: the destination becomes an exact copy. A
  job that also deletes, pointed at the wrong destination or the wrong way round, erases that folder's
  other files on its first run. So (section 20, P6):
  1. the checkbox is its own choice after a 16px gap, with the warning shown when it is ticked (5.2);
  2. a job that also deletes is saved as **trial runs only** and not on a schedule until a trial run
     has been seen (0.6's trial, section 5);
  3. turning it on for real asks for the destination's name to be typed (5.6);
  4. Run now for a job that also deletes uses the destructive confirmation (7.2).
- **Options that delete, set elsewhere.** OMV appends a job's extra options to its command as they
  are. When they contain an option whose name starts with `--del` (`--delete-after`,
  `--delete-excluded` and the rest), the job is treated as one that also deletes, and its page says
  "Also deletes files in {{dest}}: set in the classic interface's extra options." When they contain
  `--remove-source-files`, its page says, with the warning-shape `InlineAlert`, "Deletes each file
  from {{src}} after copying it: set in the classic interface's extra options." When they contain
  `--dry-run` or `-n`, the job is "Trial runs only". This interface never writes extra options; it
  keeps them.
- **The trial run** (`optiondryrun`) is a stored option of the job, not of one run: `Rsync.execute`
  takes only the job (read from source). A trial is therefore: save the job with trial runs on, apply,
  run it, read the output. The output lists each file the job would copy and, with deletion, a line
  "deleting {{path}}" for each file it would delete (rsync's own words; OMV always passes `--verbose`,
  and this interface turns "quiet" off for jobs it makes) **[verify]** the lines' exact form. The page
  counts those lines and says "The trial lists {{count}} files that the job would delete from
  {{dest}}." with the output below; it does not translate the lines.
- **Mounted or not.** A job refuses to run when its source or destination shared folder's file system
  is not mounted (read from source: "Source storage device not mounted at …"). That is a failure with
  OMV's words, never a deletion.
- **One run at a time.** A job does not start while it is already running; the second start ends at
  once with a failure and no message (read from source) **[verify]** what `Exec.getOutput` reports.
- **Not a versioned backup.** The term's sentence (0.1) is shown once on the jobs list. The interface
  calls these **copy jobs**, not backups (section 20, P3).

### 0.7 The schedule in words

OMV stores a job's schedule as the five cron fields, each a comma list of values or `*` (every), and
three "every N" flags for minute, hour and day of month; `enable` decides whether it runs on the
schedule at all (read from source: the cron file lists only enabled jobs; `Rsync.execute` runs any
job, enabled or not). The disks slice's 6.2 words are extended with minutes:

| Stored                                      | Words                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable` false                              | "Only when started here" (the schedule's fields are kept for when it is put back on a schedule)                                                |
| minute m, hour h, the rest every            | "Every day at {{time}}"                                                                                                                        |
| minute m, hour h, weekday w, the rest every | "Every {{weekday}} at {{time}}"                                                                                                                |
| minute m, hour h, day d, the rest every     | "On day {{day}} of every month at {{time}}"                                                                                                    |
| minute m, hour every, the rest every        | "Every hour at {{minute}} minutes past"                                                                                                        |
| `everynhour` with hour n, minute m          | "Every {{n}} hours, at {{minute}} minutes past"                                                                                                |
| `everynminute` with minute n                | "Every {{n}} minutes" (with the line "A copy job this often may still be running when the next one is due; the next one then does not run.")   |
| anything else                               | The disks slice's custom sentence with minutes added: "In {{months}}, on {{days}}, on {{weekdays}}, at {{hours}}, at {{minutes}} minutes past" |

Weekday 1 is Monday and 7 is Sunday (the classic form's values; cron also takes 7 for Sunday). A day
of the month and a weekday together run on days that match **either** (cron's own rule, which differs
from the disk monitor's); the custom form says so. The form (5.2, field 6) offers "Only when I start
it", "Every hour", "Every day" (default, at 03:00), "Every week", "Every month" and "Custom".

### 0.8 Passwords and keys in this slice

Read from source: `Rsync.get` and `Rsync.getList` return a job's stored password (the password for
another computer's rsync server) in their reply, and `Rsyncd.getModuleList` and `Rsyncd.getModule`
return every rsync sign-in's password; `Rsync.set` and `Rsyncd.setModule` return them in their reply
too. Under UI-6 the interface must never hold them:

- **The transport removes them** before anything else sees the reply (`x-omv-omit`, as for the mail
  password): `Rsync.get` `password`; `Rsync.getList` `data[].password`; `Rsync.set` `password`;
  `Rsyncd.getModule` `users[].password`; `Rsyncd.getModuleList` `data[].users[].password`;
  `Rsyncd.setModule` `users.user[].password`. The last three need `x-omv-omit` paths that step into a
  list inside a row; the lint rule and the transport learn that form (section 20, P4).
- **"Set" needs a sign of presence.** With the field gone, the page cannot tell "Set" from "none". The
  recommended extension (P4) is `x-omv-presence`: the transport replaces the named field with `true`
  when it was a non-empty string and `false` otherwise, before anything else sees it, and the reply
  schema declares it as a boolean. Without it, the page says "A password may be set." instead of
  "Set".
- **Saving needs the password again.** OMV's writes require the whole object, password included (B11),
  and sending an empty one clears it. So any save of a job that signs in to another computer's rsync
  server with a password, and any save of an rsync server folder with a sign-in, asks for the password
  again: "Type the password again to save. The NAS does not give it back to this page." The field is a
  `SecretField`, never pre-filled, cleared after every request (UI-6). The same holds when a trial
  turns into the real job (5.6).
- **SSH keys.** A remote job over SSH signs in with one of the NAS's SSH keys, chosen by its reference.
  `CertificateMgmt.getSshList` (14.0) returns each key's comment and public half, never the private
  half (read from source); the public half is shown so it can be copied to the other computer. No
  private key and no other computer's password passes through this interface.
- **Never in a toast, the URL, a dialog, a log or the task title.** The task's output is rsync's and
  the job script's; the password is not on rsync's command line (read from source) **[verify]** by
  reading the output of a job with a wrong password.

### 0.9 Pending changes in this slice

Read from source; every set **[verify]** by `dirtyModules` after each call on the VM (17.2). OMV names
the network-discovery module `zeroconf` in the listeners; the VM showed it as `avahi` for SMB (the
shares slice's 19), and this slice expects the same.

| Action                                                                            | Marks pending                                                                                                                                                 | Applied by                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| NFS on or off (`NFS.setSettings`)                                                 | `nfs`, `avahi`                                                                                                                                                | The band                                                           |
| Let a computer in (`NFS.setShare`, new)                                           | `nfs`, `avahi`; for the folder's first entry also `fstab`, `collectd`, `monit` and `quota` (OMV adds the folder's place under `/export` itself; observed, 22) | The band                                                           |
| Change an entry (`NFS.setShare`, existing)                                        | `nfs`                                                                                                                                                         | The band                                                           |
| Stop letting a computer in (`NFS.deleteShare`)                                    | `nfs`, `avahi`; for the folder's last entry also `fstab`, `collectd`, `monit` and `quota` (observed, 22)                                                      | The band                                                           |
| The rsync server on or off (`Rsyncd.setSettings`)                                 | `rsyncd`, `avahi`                                                                                                                                             | The band                                                           |
| Offer a folder, change or remove it (`Rsyncd.setModule`, `deleteModule`)          | `rsyncd`                                                                                                                                                      | The band                                                           |
| Save a copy job, change it, delete it (`Rsync.set`, `delete`)                     | `rsync`                                                                                                                                                       | The band, or the add and change flows' own checkpoints (section 5) |
| The workgroup, a share's recycle bin (`SMB.setSettings`, `setShare`)              | `samba`, `avahi`                                                                                                                                              | The band                                                           |
| Run a copy job now (`Rsync.execute`), empty a recycle bin (`SMB.emptyRecycleBin`) | nothing: they act at once                                                                                                                                     |                                                                    |

Module words: `nfs` becomes "Linux and Unix sharing (NFS)", `rsync` "Copy jobs (rsync)", `rsyncd`
"Rsync server" (section 19, D11); the others stay.

**Running needs the changes applied** (B9, read from source): `Rsync.execute` refuses while `rsync` is
pending, and `SMB.emptyRecycleBin` while `samba` is pending, with OMV's "Please apply the configuration
changes first." The job's script and the recycle bin's script are written only when changes are
applied, so a new job, or a recycle bin just turned on, cannot run before that. And because the module
is one for all jobs, **a pending change to any copy job stops every job from being run now**. Run now
and Empty are therefore unavailable while their module is pending, with the reason (7.1, 11.4).

**The copy-job flows apply themselves** (section 5): adding a job, and changing its direction, source,
destination or deletion, refuse to start while other changes are pending (R1, Q2), apply exactly what
they saved (R10), run the trial, and apply again when the reader turns the job on. Every other change
in this slice is a saved setting and goes to the band.

**The pending mark** appears beside the section or row this session saved since the last apply: a
folder's NFS entries, an rsync server folder, a copy job's row and page, the switch lines, the
workgroup, a share's recycle bin.

### 0.10 The interface's own refusals

OMV refuses a few things itself (read from source): an NFS share for a folder whose path on the disk
has a space, a second rsync server folder of the same name, running a job or emptying a recycle bin
while its module is pending, a second SMB share for a folder. It checks nothing else: not that a
job's source and destination differ, not that another computer's address is well formed, not that a
key exists. Every refusal below is **also** the interface's own (journal, 2026-11-21), checked before
the call and again just before it, and a refusal offers no classic link that would do the same thing
without the check (section 20, P18).

| Action                             | Refused when                                                                                                                                                                                                                                                                                                                                                                                                                                         | Section |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Let a computer in over NFS         | The folder is not OK (the shares slice's 0.3); its name or its folder on the disk contains a space (OMV refuses the second; the first is written into the server's configuration as it is) **[verify]** what a name with a space does; that computer or network is already let in to this folder; who may connect fails 0.4's checks; NFS has no version chosen (`versions` empty)                                                                   | 2, 1    |
| Turn NFS on                        | No NFS version is chosen                                                                                                                                                                                                                                                                                                                                                                                                                             | 1       |
| Save a copy job                    | Source and destination are the same shared folder, or one is inside the other (same file system, one folder path starting with the other's); both sides are another computer; a side is missing; a shared folder is not OK or its file system is not mounted (new jobs and changed sides only); another computer's address, folder or sign-in fails the patterns of 5.3; a remote job over SSH with no key chosen; the reads these rules need failed | 5, 6    |
| Turn on a job that also deletes    | No trial run of it was seen in this session since its source, destination, direction or deletion last changed; the typed name does not match                                                                                                                                                                                                                                                                                                         | 5.6     |
| Run a copy job now                 | `rsync` is pending; this job is already running in this session; a shared folder it uses is not OK or not mounted                                                                                                                                                                                                                                                                                                                                    | 7       |
| Offer a folder to the rsync server | The folder is not OK; already offered; the name is taken or fails 10.2's pattern; no name and password asked and who may connect is not one computer or one network (0.4)                                                                                                                                                                                                                                                                            | 10      |
| Save an rsync server folder        | It has more than one rsync sign-in (set in the classic interface; 0.8 would need every password typed)                                                                                                                                                                                                                                                                                                                                               | 10      |
| Empty a recycle bin                | `samba` is pending; Windows and Mac sharing is off; the share's recycle bin is off or not applied yet; an emptying of it is running in this session; the typed name does not match                                                                                                                                                                                                                                                                   | 11.4    |
| Change the workgroup               | Not 1 to 15 characters of OMV's own NetBIOS-name rule (letters, digits, spaces and `! # $ % & ' ( ) - . @ ^ _ { } ~`)                                                                                                                                                                                                                                                                                                                                | 11.2    |
| Any of them                        | An action on the same object is already running in this session; the object changed since the page read it                                                                                                                                                                                                                                                                                                                                           | all     |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message.

### 0.11 Writing back

OMV's writes here replace the whole object (B11); every field is required except where noted. Every
write is **read, change, write** (R4), the read made immediately before the write, with the single-object
read where there is one:

- **`NFS.setSettings`** sends `enable` and `versions` exactly as `getSettings` returned them, with only
  `enable` changed. `getSettings` also returns every NFS share (read from source); the contract's reply
  schema keeps them out of the cached object, and nothing reads them from there.
- **`NFS.setShare`, new**: `uuid` the new marker; `sharedfolderref`; `mntentref` the new marker (OMV
  requires it and replaces it with the folder's place under `/export`, read from source); `client`
  from 0.4; `options` `ro` or `rw`; `extraoptions` `subtree_check,insecure` (0.5); `comment` empty.
  **Existing**: the object from `NFS.getShare`, with only `client` or `options` changed; `mntentref`,
  `sharedfolderref`, `extraoptions` and `comment` as read.
- **`Rsyncd.setSettings`** sends `enable`, `port` and `extraoptions` as `getSettings` returned them,
  with only `enable` changed.
- **`Rsyncd.setModule`, new**: section 10.2's fields and the classic form's defaults for the rest
  (`uid` `nobody`, `gid` `users`, `usechroot` true, `writeonly` false, `list` true, `maxconnections`
  0, `hostsdeny` and `extraoptions` empty, `enable` true). **Existing**: the object from
  `Rsyncd.getModule`, with the changed fields, and its one sign-in's password typed again (0.8).
- **`Rsync.set`** takes all 36 fields; the schedule fields are lists of strings; the unused side's
  fields must be sent empty (read from source). New jobs: section 5.2's fields and the classic form's
  defaults for every option not asked (section 19, D5): archive, recursive, permissions, times,
  group, owner on; compress, ACLs, extended attributes, partial off; quiet **off** (so the output
  shows what happened; the classic form's default too), extra options empty, SSH port 22.
  **Existing**: the object from `Rsync.get` with the changes; the flattened fields `get` leaves out
  are filled from its `src` and `dest` (read from source); the password typed again when it signs in
  with one (0.8).
- **`SMB.setSettings`** sends the whole `getSettings` reply with only `workgroup` changed (observed: it
  keeps every field, the shares slice's 19).
- **`SMB.setShare`** for the recycle bin sends the object from **`SMB.getShare`** (cleared today) with
  only `recyclebin` and `recyclemaxage` changed, so the share's other options keep their values (the
  shares slice's 0.10; `setShare` builds a fresh object and resets what it is not sent). The shares
  slice's share form moves its own read-before-write to `getShare` too: it is narrower, and it does
  not fail when another share's folder is gone, as `getShareList` does (the shares slice's 19, #13).
- **A second administrator** saving the same object between the read and the write is not detected by
  OMV; the interface narrows the window and says nothing it cannot know.

---

## 1. Services > NFS: Linux and Unix sharing

**Question it answers:** is Linux and Unix sharing on and working, and which folders can which
computers reach? **Leads to:** turning it on or off; a folder's page; sharing a folder.

Administrators only. Route `/services/nfs`; the existing menu item "NFS" under Services gains the route
(section 13). It is built as the shares slice's `/services/smb` page is (its section 5), so the two
read alike.

### 1.1 Data

`NFS.getSettings`, `NFS.getShareList` (whole list, `limit: null`, all five paging fields),
`ShareMgmt.getList` (whole), `Services.getStatus`, `System.getInformation` (the shell's: host name,
`dirtyModules`). Refreshed on opening, Refresh, window focus and after a save.

### 1.2 Layout

1. Page title "Linux and Unix sharing". Under it, `text-sm muted-foreground`: "NFS".
2. Intro: `services.term.nfs` (0.1), and "Turn it on here, then choose on each folder's page which
   computers may use it."
3. **State line** (`role="status"`): 0.3's pill and words, the pending mark when `nfs` is pending.
4. **The switch card**: one line and one button. Off: "Linux and Unix sharing is off." with **"Turn
   on"** (filled; a save to the band, no dialog). On: "Linux and Unix sharing is on." with **"Turn
   off…"** (neutral, 1.3). Under it, `text-sm muted-foreground`: "NFS versions offered: {{versions}}."
   (`versions` as received, "NFSv3, NFSv4, NFSv4.1, NFSv4.2"); with none: "No NFS version is chosen,
   so it cannot be turned on. Choose them in the classic interface." and "Turn on" unavailable.
5. `h2` "Shared folders", toolbar with **"Share a folder…"** (neutral; 1.4), and a table of the
   entries, grouped by folder (one row per entry, the folder named on the first):

   | Order | Header          | Display                                                                                                                                                                                         |
   | ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1     | Folder          | Router link to its page (`sharedfolderref` matched to a `getList` row)                                                                                                                          |
   | 2     | Who may connect | 0.4's words with the value in `Identifier`                                                                                                                                                      |
   | 3     | Access          | "Read only" / "Read and write"; anything else as stored with "(set in the classic interface)"                                                                                                   |
   | 4     | Address         | `{{nfsAddress}}` with `CopyButton` (0.2), on the folder's first row                                                                                                                             |
   | 5     | Note            | The warning-shape icon and "Its administrator acts as the NAS's administrator" when 0.5's option is present; "Other NFS options set in the classic interface" when they differ from the default |

   Empty: "No folder is shared with Linux and Unix computers yet. Share one here, or from its own
   page." with "Share a folder…".

6. Router link "What is shared now" → `/diagnostics/services/nfs` (the monitoring domain's page, which
   shows what the NFS server is serving).
7. Footer, `text-sm muted-foreground`: "NFS versions and other NFS options are in the classic
   interface." `ExternalLink` "NFS settings in the classic interface" → `/#/services/nfs/settings`.

### 1.3 Turning it off

`ConfirmDialog` (plain: it cuts access, nothing is lost; no typing):

1. Title: "Turn off Linux and Unix sharing?"
2. "After the changes are applied, no computer can reach a shared folder over NFS: {{count}} folders
   are shared now ({{list}}, at most five names then "and {{more}} more"). The files stay on the NAS,
   and each folder keeps who may connect for when you turn it on again."
3. "Computers that use these folders may stop responding until they are told the folders are gone.
   Close their files first."
4. Buttons: "Cancel" (focused) and **"Turn off"** (filled primary, not the destructive form).

On confirm: `NFS.setSettings` (0.11), toast "Linux and Unix sharing will turn off when you apply the
changes.", the band. Turning on: the same call with `enable` true, toast "Linux and Unix sharing will
turn on when you apply the changes."

### 1.4 Share a folder from this page

"Share a folder…" opens a `Dialog` "Share a folder with Linux and Unix computers": field 1 **Folder**
(`Select` of the shared folders that are OK, by name, with their file system; folders 0.10 refuses
are listed unavailable with the reason after them, "Its folder on the disk has a space in its name."),
then the entry form of 2.3. On Save, the dialog closes, the row appears, the toast and band as 2.3,
and focus returns to "Share a folder…". When NFS is off, the dialog's last line is 2.4's and saving
turns it on in the same save.

### 1.5 States

| State                      | Look                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading                    | Skeletons of the state line, the switch card and three rows; "Loading Linux and Unix sharing…"                                                                                                                                                               |
| `getSettings` failed       | `EmptyState variant="error"`: "Could not read whether Linux and Unix sharing is on." + server message + "Try again". No switch, no table                                                                                                                     |
| `getShareList` failed      | The table's place: `EmptyState variant="error"`: "Could not read the folders shared with Linux and Unix computers." + message + "Try again". The switch stays. (OMV fails the whole read when an entry names a shared folder that is gone, read from source) |
| `ShareMgmt.getList` failed | Rows show the folder as "A shared folder this page could not read" with no link; "Share a folder…" unavailable with "Could not read the shared folders."                                                                                                     |
| Saving                     | The switch button shows "Saving…"                                                                                                                                                                                                                            |
| Populated                  | As 1.2                                                                                                                                                                                                                                                       |

### 1.6 Keyboard

Tab order: the state line's link (when shown), the switch button, "Share a folder…", each row's folder
link and copy button, "What is shared now", the footer link. After a save, focus stays on the switch
button, now showing the other verb.

### 1.7 Copy

| Key                           | English                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nfs.title`                   | Linux and Unix sharing                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nfs.subtitle`                | NFS                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `nfs.intro`                   | Turn it on here, then choose on each folder's page which computers may use it.                                                                                                                                                                                                                                                                                                                                                                 |
| `nfs.state.off`               | Off. No folder can be reached over NFS.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `nfs.state.on`                | On.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `nfs.state.down`              | On, but not running. Folders shared over NFS cannot be reached. The NFS service details may say why.                                                                                                                                                                                                                                                                                                                                           |
| `nfs.state.downLink`          | Open the NFS service details                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `nfs.state.pendingOn`         | Turned on. It starts when you apply the pending changes.                                                                                                                                                                                                                                                                                                                                                                                       |
| `nfs.state.unread`            | Could not read whether Linux and Unix sharing is on.                                                                                                                                                                                                                                                                                                                                                                                           |
| `nfs.switch.off`              | Linux and Unix sharing is off.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `nfs.switch.on`               | Linux and Unix sharing is on.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `nfs.turnOn`                  | Turn on                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `nfs.turnOff`                 | Turn off…                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `nfs.saving`                  | Saving…                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `nfs.versions`                | NFS versions offered: {{versions}}.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `nfs.noVersions`              | No NFS version is chosen, so it cannot be turned on. Choose them in the classic interface.                                                                                                                                                                                                                                                                                                                                                     |
| `nfs.turnedOn`                | Linux and Unix sharing will turn on when you apply the changes.                                                                                                                                                                                                                                                                                                                                                                                |
| `nfs.turnedOff`               | Linux and Unix sharing will turn off when you apply the changes.                                                                                                                                                                                                                                                                                                                                                                               |
| `nfs.off.title`               | Turn off Linux and Unix sharing?                                                                                                                                                                                                                                                                                                                                                                                                               |
| `nfs.off.body_one` / `_other` | After the changes are applied, no computer can reach a shared folder over NFS: {{count}} folder is shared now ({{list}}). The files stay on the NAS, and it keeps who may connect for when you turn it on again. / After the changes are applied, no computer can reach a shared folder over NFS: {{count}} folders are shared now ({{list}}). The files stay on the NAS, and each folder keeps who may connect for when you turn it on again. |
| `nfs.off.none`                | No folder is shared over NFS now. Turning it off stops the NFS service.                                                                                                                                                                                                                                                                                                                                                                        |
| `nfs.off.more`                | and {{count}} more                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `nfs.off.close`               | Computers that use these folders may stop responding until they are told the folders are gone. Close their files first.                                                                                                                                                                                                                                                                                                                        |
| `nfs.off.cancel`              | Cancel                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nfs.off.confirm`             | Turn off                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `nfs.shares.title`            | Shared folders                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `nfs.shares.add`              | Share a folder…                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `nfs.shares.col.folder`       | Folder                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nfs.shares.col.client`       | Who may connect                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `nfs.shares.col.access`       | Access                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nfs.shares.col.address`      | Address                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `nfs.shares.col.note`         | Note                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `nfs.shares.rootNote`         | Its administrator acts as the NAS's administrator                                                                                                                                                                                                                                                                                                                                                                                              |
| `nfs.shares.otherOptions`     | Other NFS options set in the classic interface                                                                                                                                                                                                                                                                                                                                                                                                 |
| `nfs.shares.classicValue`     | {{value}} (set in the classic interface)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `nfs.shares.unreadFolder`     | A shared folder this page could not read                                                                                                                                                                                                                                                                                                                                                                                                       |
| `nfs.shares.empty`            | No folder is shared with Linux and Unix computers yet. Share one here, or from its own page.                                                                                                                                                                                                                                                                                                                                                   |
| `nfs.shares.loadFailed`       | Could not read the folders shared with Linux and Unix computers.                                                                                                                                                                                                                                                                                                                                                                               |
| `nfs.shares.foldersFailed`    | Could not read the shared folders.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `nfs.whatIsShared`            | What is shared now                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `nfs.footerLine`              | NFS versions and other NFS options are in the classic interface.                                                                                                                                                                                                                                                                                                                                                                               |
| `nfs.classicLink`             | NFS settings in the classic interface                                                                                                                                                                                                                                                                                                                                                                                                          |
| `nfs.loading`                 | Loading Linux and Unix sharing…                                                                                                                                                                                                                                                                                                                                                                                                                |
| `nfs.dialog.title`            | Share a folder with Linux and Unix computers                                                                                                                                                                                                                                                                                                                                                                                                   |
| `nfs.dialog.folder`           | Folder                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nfs.dialog.folderSpace`      | Its folder on the disk has a space in its name.                                                                                                                                                                                                                                                                                                                                                                                                |
| `nfs.dialog.folderNameSpace`  | Its name has a space in it.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `nfs.dialog.folderNotOk`      | It cannot be reached now.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `modules.nfs`                 | Linux and Unix sharing (NFS)                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 2. A shared folder's page: Linux and Unix computers (NFS)

The shares slice's folder page (its 2.2) gains a section after "Windows and Mac computers": item 8,
`h2` "Linux and Unix computers"; Used by moves to item 9 and the delete section to item 10.

### 2.1 Not shared

`text-sm`: "Not shared with Linux and Unix computers." and the button **"Let a computer in…"**, which
opens the entry form (2.3) in place. When 0.10 refuses (a space in the name or folder, the folder not
OK), the button is unavailable (`aria-disabled`, focusable) with the reason beside it: "NFS cannot
share a folder whose name or folder on the disk has a space in it. Make a shared folder without spaces
for the same files to share them over NFS." (no rename is offered: the shares slice's P5).

### 2.2 Shared

The intro sentences of 0.5 first (no password; access above does not apply), `text-sm`. Then a list,
one item per entry, each a `FactList` with an `h3` naming who may connect ("The computer at
192.0.2.10", "Computers on 192.0.2.0/24", "Any computer that can reach the NAS"):

| Label             | Value                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access            | "Read only" / "Read and write"                                                                                                                                        |
| Address           | `{{nfsAddress}}` both forms with `CopyButton` (on the first entry only, "Address for every computer let in" when there are several)                                   |
| Other NFS options | Only when they differ from the default (0.5): `{{options}}` in `Identifier`, "(set in the classic interface)"; with 0.5's warning when `no_root_squash` is among them |

Each item's buttons: **"Change…"** (neutral; the form in place, filled with the entry) and **"Stop
letting them in…"** (neutral, after a gap; 2.5). Under the list: **"Let another computer in…"**.

When NFS is off for the NAS: "Set up for Linux and Unix computers, but Linux and Unix sharing is
off." with a router link "Open Linux and Unix sharing" → `/services/nfs` (as the shares slice's 19
did for SMB: the switch lives on its page).

### 2.3 The entry form

In place, under the section's line, a `form` with `h3` "Let a computer in" (or "Change who may
connect"):

1. **Who may connect** (`RadioGroupField`, 0.4's three choices, "One computer" chosen for a new
   entry; an existing entry opens on its own choice, or on none with its stored value shown when it
   was set in the classic interface and is none of the three).
2. **Access** (`SegmentedChoice`): "Read only" (default) / "Read and write". Hint: "Read only: they
   can open and copy files but not change them."
3. The 0.5 lines as the form's description, read with its heading.
4. When NFS is off: `text-sm` "Linux and Unix sharing is off for the whole NAS. Saving this turns it
   on." (`NFS.setSettings` in the same save; with no version chosen, the line is `nfs.noVersions` and
   Save is unavailable).
5. Buttons: **"Let them in"** (filled; for a change "Save") and "Cancel".

**On save**: re-read `NFS.getShareList`, `NFS.getSettings` and the folder's row; check 0.10 (the same
computer or network already let in, by its stored text compared without case and with networks
compared by address and prefix); then `NFS.setShare` (0.11) and, when NFS is off, `NFS.setSettings`
with `enable` true. The form closes, toast "{{folder}} is set to be shared with {{client}}. Apply the
changes to share it.", the band, focus to the new entry's heading. Failed: the form stays with the
server's message; if `setShare` succeeded and `setSettings` failed: "{{folder}} is set up for
{{client}}, but Linux and Unix sharing could not be turned on." with "Try again" (only the second
call).

### 2.4 Turning NFS on from here

As the shares slice's 4.4, without the name rule (NFS has none): the form's line 4 and the second call.

### 2.5 Stop letting them in

`ConfirmDialog` (plain: no file is touched, and letting them in again restores it):

1. Title: "Stop letting {{client}} use {{folder}}?"
2. "After the changes are applied, {{clientSentence}} cannot reach {{folder}} over NFS. The files stay
   on the NAS." When it is the folder's last entry: "{{folder}} is then not shared over NFS at all."
3. When the entry has other NFS options: "Its other NFS options, set in the classic interface, are
   removed with it."
4. Buttons: "Cancel" (focused) and **"Stop letting them in"** (filled primary).

On confirm: `NFS.deleteShare` with the entry's `uuid`; toast "{{client}} will stop using {{folder}}
when you apply the changes.", the band; focus to the section heading.

### 2.6 States

| State                                      | Look                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                    | A skeleton line                                                                                                                                   |
| `NFS.getShareList` or `getSettings` failed | `InlineAlert`: "Could not read how this folder is shared with Linux and Unix computers." + server message + "Try again". No NFS action is offered |
| Not shared / shared                        | 2.1 / 2.2                                                                                                                                         |
| Saving                                     | The form's controls unavailable, the button shows "Saving…"                                                                                       |

### 2.7 Used by, and deleting the folder

- **Used by** (the shares slice's 2.5) now names every core setting that uses the folder, each as its
  own `UsedByPanel` entry, from the reads this slice adds (section 12.1): its NFS entries are shown in
  their own section and so not repeated; "Offered to the rsync server as {{name}}" with router link
  → `/services/rsync/server`; "Copied by the copy job {{job}}" / "Copied to by the copy job {{job}}"
  with router links to each job's page; the users slice's home-folders entry. The one-sentence entry
  "Used by a setting this page does not show" remains only when `_used` is true and none of these
  reads finds the folder, and now says: "Used by an add-on's setting. Look in the classic
  interface." (no link).
- **The delete section** (the shares slice's 8.1) gains blockers, each with its own words and what to
  do: "It is shared with Linux and Unix computers." / "Stop letting every computer in first, above, and
  apply that change."; "It is offered to the rsync server as {{name}}." / router link "Open the rsync
  server" (where it can be removed, 10.4); "The copy job {{job}} copies from it." or "…copies into
  it." / router link to the job's page (where it can be deleted, section 8). The check before the
  dialog (the shares slice's 8.2) re-reads these three lists too.

### 2.8 Copy

| Key                                | English                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `folderNfs.title`                  | Linux and Unix computers                                                                                                                                                                                                                  |
| `folderNfs.notShared`              | Not shared with Linux and Unix computers.                                                                                                                                                                                                 |
| `folderNfs.letIn`                  | Let a computer in…                                                                                                                                                                                                                        |
| `folderNfs.letAnother`             | Let another computer in…                                                                                                                                                                                                                  |
| `folderNfs.cannot`                 | NFS cannot share a folder whose name or folder on the disk has a space in it. Make a shared folder without spaces for the same files to share them over NFS.                                                                              |
| `folderNfs.noPassword`             | NFS asks for no password. A computer that is let in says which person is using it, by number, and the NAS believes it. Let in only computers you trust.                                                                                   |
| `folderNfs.accessNotUsed`          | Who can use it, above, does not apply to NFS. Over NFS, the file permissions on the disk decide.                                                                                                                                          |
| `folderNfs.entry.one`              | The computer at <client></client>                                                                                                                                                                                                         |
| `folderNfs.entry.network`          | Computers on <client></client>                                                                                                                                                                                                            |
| `folderNfs.entry.any`              | Any computer that can reach the NAS                                                                                                                                                                                                       |
| `folderNfs.entry.classic`          | <client></client> (set in the classic interface)                                                                                                                                                                                          |
| `folderNfs.fact.access`            | Access                                                                                                                                                                                                                                    |
| `folderNfs.fact.address`           | Address                                                                                                                                                                                                                                   |
| `folderNfs.fact.addressAll`        | Address for every computer let in                                                                                                                                                                                                         |
| `folderNfs.fact.addressV4`         | NFSv4                                                                                                                                                                                                                                     |
| `folderNfs.fact.options`           | Other NFS options                                                                                                                                                                                                                         |
| `folderNfs.optionsClassic`         | (set in the classic interface)                                                                                                                                                                                                            |
| `folderNfs.rootWarn`               | The administrator of the computers let in by this entry acts as this NAS's administrator on the files of <folder></folder>: they can read, change and delete every file, whatever its permissions. This was set in the classic interface. |
| `folderNfs.change`                 | Change…                                                                                                                                                                                                                                   |
| `folderNfs.stop`                   | Stop letting them in…                                                                                                                                                                                                                     |
| `folderNfs.nfsOff`                 | Set up for Linux and Unix computers, but Linux and Unix sharing is off.                                                                                                                                                                   |
| `folderNfs.nfsOffLink`             | Open Linux and Unix sharing                                                                                                                                                                                                               |
| `folderNfs.notApplied`             | Not applied yet.                                                                                                                                                                                                                          |
| `folderNfs.form.titleNew`          | Let a computer in                                                                                                                                                                                                                         |
| `folderNfs.form.titleChange`       | Change who may connect                                                                                                                                                                                                                    |
| `folderNfs.form.who`               | Who may connect                                                                                                                                                                                                                           |
| `folderNfs.form.one`               | One computer                                                                                                                                                                                                                              |
| `folderNfs.form.oneHint`           | Only the computer at this address may connect.                                                                                                                                                                                            |
| `folderNfs.form.oneField`          | Its address or name                                                                                                                                                                                                                       |
| `folderNfs.form.nameHint`          | The NAS looks this name up when it starts NFS. If the name changes address later, the new address is not let in until NFS restarts.                                                                                                       |
| `folderNfs.form.network`           | Computers on one network                                                                                                                                                                                                                  |
| `folderNfs.form.networkHint`       | Every computer on this network may connect. Write the network's first address, a slash and its size, as your router shows it.                                                                                                             |
| `folderNfs.form.networkField`      | Network                                                                                                                                                                                                                                   |
| `folderNfs.form.networkWide`       | This network holds {{count}} addresses. Every computer on it may connect.                                                                                                                                                                 |
| `folderNfs.form.networkHuge`       | This network holds a very large number of addresses. Every computer on it may connect.                                                                                                                                                    |
| `folderNfs.form.any`               | Any computer that can reach the NAS                                                                                                                                                                                                       |
| `folderNfs.form.anyHint`           | Any computer on your network, and any that reaches it from outside, may connect.                                                                                                                                                          |
| `folderNfs.form.anyWarn`           | Any computer that can reach this NAS may use <folder></folder>. NFS asks for no password, so this includes visitors' computers and anything that gets into your network.                                                                  |
| `folderNfs.form.classicValue`      | Now: <client></client>, set in the classic interface. Choose one of these to replace it.                                                                                                                                                  |
| `folderNfs.form.access`            | Access                                                                                                                                                                                                                                    |
| `folderNfs.form.accessHint`        | Read only: they can open and copy files but not change them.                                                                                                                                                                              |
| `folderNfs.form.nfsOff`            | Linux and Unix sharing is off for the whole NAS. Saving this turns it on.                                                                                                                                                                 |
| `folderNfs.form.letIn`             | Let them in                                                                                                                                                                                                                               |
| `folderNfs.form.save`              | Save                                                                                                                                                                                                                                      |
| `folderNfs.form.cancel`            | Cancel                                                                                                                                                                                                                                    |
| `folderNfs.form.saving`            | Saving…                                                                                                                                                                                                                                   |
| `folderNfs.err.address`            | Write one address, such as 192.0.2.10, or one computer name.                                                                                                                                                                              |
| `folderNfs.err.networkStart`       | {{value}} is not the start of a network. Did you mean {{suggestion}}?                                                                                                                                                                     |
| `folderNfs.err.networkZero`        | A network of /0 is every computer. Choose Any computer instead.                                                                                                                                                                           |
| `folderNfs.err.prefix`             | Use a size from /8 to /32 for an IPv4 network, or /16 to /128 for IPv6.                                                                                                                                                                   |
| `folderNfs.err.network`            | Write a network such as 192.0.2.0/24 or 2001:db8::/32.                                                                                                                                                                                    |
| `folderNfs.err.duplicate`          | <client></client> may already use <folder></folder>. Change that entry instead.                                                                                                                                                           |
| `folderNfs.saved`                  | {{folder}} is set to be shared with {{client}}. Apply the changes to share it.                                                                                                                                                            |
| `folderNfs.savedChange`            | The changes for {{client}} are saved. Apply the changes to use them.                                                                                                                                                                      |
| `folderNfs.turnOnFailed`           | <folder></folder> is set up for <client></client>, but Linux and Unix sharing could not be turned on.                                                                                                                                     |
| `folderNfs.tryAgain`               | Try again                                                                                                                                                                                                                                 |
| `folderNfs.stop.title`             | Stop letting {{client}} use {{folder}}?                                                                                                                                                                                                   |
| `folderNfs.stop.body`              | After the changes are applied, {{clientSentence}} cannot reach <folder></folder> over NFS. The files stay on the NAS.                                                                                                                     |
| `folderNfs.stop.last`              | <folder></folder> is then not shared over NFS at all.                                                                                                                                                                                     |
| `folderNfs.stop.options`           | Its other NFS options, set in the classic interface, are removed with it.                                                                                                                                                                 |
| `folderNfs.stop.cancel`            | Cancel                                                                                                                                                                                                                                    |
| `folderNfs.stop.confirm`           | Stop letting them in                                                                                                                                                                                                                      |
| `folderNfs.stopped`                | {{client}} will stop using {{folder}} when you apply the changes.                                                                                                                                                                         |
| `folderNfs.loadFailed`             | Could not read how this folder is shared with Linux and Unix computers.                                                                                                                                                                   |
| `usedBy.rsyncModule`               | Offered to the rsync server as <name></name>                                                                                                                                                                                              |
| `usedBy.jobFrom`                   | Copied by the copy job <job></job>                                                                                                                                                                                                        |
| `usedBy.jobTo`                     | Copied to by the copy job <job></job>                                                                                                                                                                                                     |
| `usedBy.addOn`                     | Used by an add-on's setting. Look in the classic interface.                                                                                                                                                                               |
| `folderDelete.blocker.nfs`         | It is shared with Linux and Unix computers.                                                                                                                                                                                               |
| `folderDelete.fix.nfs`             | Stop letting every computer in first, above, and apply that change.                                                                                                                                                                       |
| `folderDelete.blocker.rsyncModule` | It is offered to the rsync server as <name></name>.                                                                                                                                                                                       |
| `folderDelete.fix.rsyncModule`     | Open the rsync server                                                                                                                                                                                                                     |
| `folderDelete.blocker.jobFrom`     | The copy job <job></job> copies from it.                                                                                                                                                                                                  |
| `folderDelete.blocker.jobTo`       | The copy job <job></job> copies into it.                                                                                                                                                                                                  |
| `folderDelete.fix.job`             | Open the copy job                                                                                                                                                                                                                         |

---

## 3. Services > Rsync: copy jobs

**Question it answers:** which copies does the NAS make, of what, to where, and when? **Leads to:** a
job's page; adding a job.

Administrators only. The existing menu item "Rsync" under Services gains the route `/services/rsync`,
a page with two `PageTabs`: **Copy jobs** (this section, `/services/rsync`) and **Rsync server**
(section 9, `/services/rsync/server`). Page title "Rsync"; the tab names say what each is.

### 3.1 Data

`Rsync.getList` (whole; `data[].password` removed by the transport, 0.8), `ShareMgmt.getList`
(whole), `System.getInformation` (the shell's), `System.getTimeSettings` (the NAS's time zone, 0.2).
Refreshed on opening, Refresh, window focus and after a save or a run.

### 3.2 Layout

1. Page title "Rsync", the tabs, Copy jobs current.
2. Intro: `services.term.job` (0.1).
3. When `rsync` is pending, the neutral `InlineAlert`: "Copy jobs cannot be started here until the
   pending changes are applied." (0.9)
4. Toolbar: **"Add a copy job"** (filled primary).
5. The table:

   | Order | Header       | Display                                                                                                                  |
   | ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
   | 1     | Job          | Router link to the job's page, `{{job}}` (0.2); the pending mark when this session saved it                              |
   | 2     | From         | The source: a shared folder's name, or `{{remotePath}}` on `{{host}}` in `Identifier`                                    |
   | 3     | To           | The destination, the same way. Between From and To, in the cell's accessible text, "to"                                  |
   | 4     | When         | 0.7's words; "Trial runs only" with the warning-shape icon when it applies (0.3)                                         |
   | 5     | Also deletes | "Yes" with the warning-shape icon, or "No"; "Yes (extra options)" when 0.6's options do it                               |
   | 6     | This session | The task pill when it ran in this session (Running, Succeeded, Failed, Cancelled), else empty                            |
   | 7     | Actions      | A menu button "Actions" (accessible name "Actions for {{job}}") with **Run now…**, **Change…**, a separator, **Delete…** |

   In the server's order, not paged (jobs are few). No row selection (UX audit 3.6).

6. Under the table, `text-sm muted-foreground`: "This page cannot tell whether a job's last run
   worked. Each run's output is in the Rsync jobs log." with router link "Open System logs" →
   `/diagnostics/system-logs` (the monitoring domain's page; the reader chooses "Rsync jobs" there).
7. Footer: "Advanced rsync options are in the classic interface." `ExternalLink` "Rsync tasks in the
   classic interface" → `/#/services/rsync/tasks`.

### 3.3 States

| State     | Look                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading   | Skeleton rows; "Loading copy jobs…"                                                                                                                                                       |
| Error     | `EmptyState variant="error"`: "Could not read the copy jobs." + server message + "Try again". (OMV fails the whole read when a job names a shared folder that is gone, read from source.) |
| Empty     | `EmptyState variant="empty"`: "No copy jobs yet. A copy job keeps a second copy of a shared folder, on another disk of this NAS or on another computer." Action "Add a copy job"          |
| Populated | As 3.2                                                                                                                                                                                    |

### 3.4 Keyboard

Tab order: the tabs, "Add a copy job", each row's job link and Actions button, the log link, the
footer link. The Actions menu follows the menu pattern; Escape returns focus to its button.

### 3.5 Copy

| Key                     | English                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rsync.title`           | Rsync                                                                                                                                                                                                                    |
| `rsync.tab.jobs`        | Copy jobs                                                                                                                                                                                                                |
| `rsync.tab.server`      | Rsync server                                                                                                                                                                                                             |
| `services.term.job`     | A copy job copies the files of one folder into another, on this NAS or with another computer, by itself on a schedule. It keeps one copy, not earlier versions: a file changed or deleted by mistake is copied as it is. |
| `jobs.pendingBlocksRun` | Copy jobs cannot be started here until the pending changes are applied.                                                                                                                                                  |
| `jobs.add`              | Add a copy job                                                                                                                                                                                                           |
| `jobs.col.job`          | Job                                                                                                                                                                                                                      |
| `jobs.col.from`         | From                                                                                                                                                                                                                     |
| `jobs.col.to`           | To                                                                                                                                                                                                                       |
| `jobs.col.when`         | When                                                                                                                                                                                                                     |
| `jobs.col.deletes`      | Also deletes                                                                                                                                                                                                             |
| `jobs.col.session`      | This session                                                                                                                                                                                                             |
| `jobs.col.actions`      | Actions                                                                                                                                                                                                                  |
| `jobs.actionsFor`       | Actions for {{job}}                                                                                                                                                                                                      |
| `jobs.action.run`       | Run now…                                                                                                                                                                                                                 |
| `jobs.action.change`    | Change…                                                                                                                                                                                                                  |
| `jobs.action.delete`    | Delete…                                                                                                                                                                                                                  |
| `jobs.remote`           | <path></path> on <host></host>                                                                                                                                                                                           |
| `jobs.name.auto`        | {{src}} to {{dest}}                                                                                                                                                                                                      |
| `jobs.trialOnly`        | Trial runs only                                                                                                                                                                                                          |
| `jobs.deletes.yes`      | Yes                                                                                                                                                                                                                      |
| `jobs.deletes.extra`    | Yes (extra options)                                                                                                                                                                                                      |
| `jobs.deletes.no`       | No                                                                                                                                                                                                                       |
| `jobs.lastRunUnknown`   | This page cannot tell whether a job's last run worked. Each run's output is in the Rsync jobs log.                                                                                                                       |
| `jobs.logLink`          | Open System logs                                                                                                                                                                                                         |
| `jobs.footerLine`       | Advanced rsync options are in the classic interface.                                                                                                                                                                     |
| `jobs.classicLink`      | Rsync tasks in the classic interface                                                                                                                                                                                     |
| `jobs.loading`          | Loading copy jobs…                                                                                                                                                                                                       |
| `jobs.loadFailed`       | Could not read the copy jobs.                                                                                                                                                                                            |
| `jobs.empty`            | No copy jobs yet. A copy job keeps a second copy of a shared folder, on another disk of this NAS or on another computer.                                                                                                 |
| `modules.rsync`         | Copy jobs (rsync)                                                                                                                                                                                                        |

---

## 4. A copy job's page

Route `/services/rsync/jobs/$job` (`$job` a UUID, validated; nothing in the address names a call).
Breadcrumbs "Copy jobs" › `{{job}}`.

### 4.1 Data on opening

`Rsync.get {uuid}` (`password` replaced by its presence, 0.8), `ShareMgmt.getList` (whole),
`System.getTimeSettings`, `EmailNotification.get` (whether email is set up, its password removed as
now), `System.getInformation`. A UUID that `get` does not find: "This copy job no longer exists." with
router link "Open Copy jobs".

### 4.2 Layout

1. Page title `{{job}}`; under it, `text-sm muted-foreground`: "Copy job".
2. **The direction sentence** (0.6), `text-base`, with the arrow and "from" and "to": "Copies the files
   of Photos into Backup, both on this NAS."
3. **What to do now**, only when there is something: a trial-only job: "This job only does trial runs,
   so it copies nothing." with **"Turn the job on…"** (5.6); a job not applied yet: "Apply the pending
   changes before the job can run."; a job whose folder cannot be reached: "{{folder}} cannot be
   reached, so the job fails until it can." with a link to the folder's page.
4. **Summary** (`FactList`):

   | Label         | Value                                                                                                                                                                                                                                          |
   | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Copy from     | The source (0.2), router link to the folder's page                                                                                                                                                                                             |
   | Copy to       | The destination                                                                                                                                                                                                                                |
   | Also deletes  | "No." / "Yes: files in {{dest}} that are not in {{src}} are deleted on each run." with the warning-shape icon; 0.6's sentences for options set elsewhere                                                                                       |
   | When          | 0.7's words                                                                                                                                                                                                                                    |
   | Signs in with | Remote only: "The SSH key {{key}}" (with "Show its public key" disclosure: the key in `Identifier` with `CopyButton`), or "A password: Set" / "No password", or "The SSH key set in the classic interface" when the key list could not be read |
   | Email         | "The output is emailed after each run." / "Not emailed." (and "Email notifications are not set up, so nothing is sent." when they are not)                                                                                                     |
   | Note          | `comment`, or "None"                                                                                                                                                                                                                           |
   | Other options | Only when the advanced options differ from the defaults of 0.11: "Some rsync options were set in the classic interface. They are kept." and the extra options, if any, in `Identifier`                                                         |

5. **Run** (`h2` "Run it now"): **"Run now…"** (neutral; section 7), unavailable with its reason (7.1);
   under it the session's task for this job, when there is one: `TaskLog` with its pill, elapsed time,
   output, Stop, copy and download (section 7).
6. **Change** (`h2` "Change the job"): **"Change…"** (neutral; opens section 6's form in place).
7. After a divider: **"Delete this copy job…"** (section 8).

### 4.3 States

| State                                        | Look                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Loading                                      | Skeletons of the sentence and the summary                                                    |
| `get` failed                                 | `EmptyState variant="error"`: "Could not read this copy job." + server message + "Try again" |
| Not found                                    | As 4.1                                                                                       |
| A shared folder it names is not in `getList` | That side reads "A shared folder that no longer exists", and Run now is unavailable          |

### 4.4 Keyboard and focus

Reading order. Opening the form moves focus to its heading; closing returns it to "Change…". After
Run now starts, focus moves to the task's heading; the output is not a tab stop except its scroll
region (keyboard scrollable) and its controls.

### 4.5 Copy

| Key                         | English                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `job.subtitle`              | Copy job                                                                                           |
| `job.sentence.local`        | Copies the files of <src></src> into <dest></dest>, both on this NAS.                              |
| `job.sentence.push`         | Copies the files of <src></src> from this NAS to <path></path> on <host></host>.                   |
| `job.sentence.pull`         | Copies the files of <path></path> on <host></host> into <dest></dest> on this NAS.                 |
| `job.sentence.folderItself` | Copies the folder <name></name> itself into <dest></dest>.                                         |
| `job.now.trialOnly`         | This job only does trial runs, so it copies nothing.                                               |
| `job.now.turnOn`            | Turn the job on…                                                                                   |
| `job.now.notApplied`        | Apply the pending changes before the job can run.                                                  |
| `job.now.unreachable`       | <folder></folder> cannot be reached, so the job fails until it can.                                |
| `job.fact.from`             | Copy from                                                                                          |
| `job.fact.to`               | Copy to                                                                                            |
| `job.fact.deletes`          | Also deletes                                                                                       |
| `job.fact.when`             | When                                                                                               |
| `job.fact.signIn`           | Signs in with                                                                                      |
| `job.fact.email`            | Email                                                                                              |
| `job.fact.note`             | Note                                                                                               |
| `job.fact.other`            | Other options                                                                                      |
| `job.deletes.no`            | No.                                                                                                |
| `job.deletes.yes`           | Yes: files in <dest></dest> that are not in <src></src> are deleted on each run.                   |
| `job.deletes.extra`         | Also deletes files in <dest></dest>: set in the classic interface's extra options.                 |
| `job.removesSource`         | Deletes each file from <src></src> after copying it: set in the classic interface's extra options. |
| `job.signIn.key`            | The SSH key <key></key>                                                                            |
| `job.signIn.showKey`        | Show its public key                                                                                |
| `job.signIn.passwordSet`    | A password: Set                                                                                    |
| `job.signIn.passwordMaybe`  | A password may be set.                                                                             |
| `job.signIn.none`           | No password                                                                                        |
| `job.signIn.keyUnread`      | The SSH key set in the classic interface                                                           |
| `job.email.on`              | The output is emailed after each run.                                                              |
| `job.email.off`             | Not emailed.                                                                                       |
| `job.email.notSetUp`        | Email notifications are not set up, so nothing is sent.                                            |
| `job.note.none`             | None                                                                                               |
| `job.other`                 | Some rsync options were set in the classic interface. They are kept.                               |
| `job.run.title`             | Run it now                                                                                         |
| `job.change.title`          | Change the job                                                                                     |
| `job.delete.button`         | Delete this copy job…                                                                              |
| `job.gone`                  | This copy job no longer exists.                                                                    |
| `job.goneLink`              | Open Copy jobs                                                                                     |
| `job.loadFailed`            | Could not read this copy job.                                                                      |
| `job.folderGone`            | A shared folder that no longer exists                                                              |
| `app.documentTitle.job`     | {{job}} – Copy jobs                                                                                |

---

## 5. Add a copy job

Route `/services/rsync/jobs/add`, no menu item (Copy jobs current); reached from the list's toolbar and
empty state and from a shared folder's page ("Keep a copy of this folder…", a line after its Used by
section, shown whether or not Used by is, which opens the flow with the source chosen). This is the UX audit's Flow C, with the trial run added.

### 5.1 Pre-flight (R1)

On opening (and again at the checkpoint), read `dirtyModules`. If anything is pending, the
`PreflightNotice`: "Other changes are waiting to be applied: {{modules}}. Adding a copy job applies
its own changes, so deal with those first." with "Apply them now" and "Undo them" (the shared
pre-flight). The form is shown but its checkpoint is unavailable until nothing is pending.

### 5.2 Decisions, in one form

`h1` "Add a copy job". The form, field by field (each label above its control, 16px rhythm):

| #   | Field                                                     | Control                                                               | Default and rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Copy from**                                             | `RadioGroupField`: "A shared folder on this NAS" / "Another computer" | A shared folder. Under it, the side's fields (5.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2   | **Copy to**                                               | The same two choices                                                  | A shared folder. When Copy from is "Another computer", "Another computer" is unavailable here with "One side must be a shared folder on this NAS.", and the other way round                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3   | The direction sentence                                    | `role="status"`, updated 500 ms after the last change                 | 0.6's sentence with both sides filled ("Copies the files of Photos into Backup, both on this NAS."), or "Choose both sides to see what this job does."                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 4   | The replace line                                          | `text-sm`                                                             | 0.6's "Files in {{dest}} with the same name…"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | **Also delete files in {{dest}} that are not in {{src}}** | `CheckboxField`, after a 16px gap, **off**, never preselected         | Hint: "Makes {{dest}} an exact copy of {{src}}. Use this only for a folder that holds nothing but this copy." When ticked, the warning-shape neutral `InlineAlert` (5.4)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | **When**                                                  | `RadioGroupField`: "Only when I start it" / "On a schedule" (default) | With "On a schedule": **How often** `Select` ("Every hour", "Every day" default, "Every week", "Every month", "Custom"), then the disks slice's 6.4 controls with a minute added: **At** (hour `Select` 00–23 and minute `Select` 00–59; default 03:00), **On** (weekday), **On day** (1–31, above 28 "Months without this day are skipped."), **At minutes past** (for Every hour); Custom: five `Select`s (Minute, Hour, Day of the month, Month, Weekday), each "Every …" first, with "With both a day of the month and a weekday, it runs on days that are either." Under the field: "Times are the NAS's clock{{zone}}." |
| 7   | **Email the output after each run**                       | `CheckboxField`, off                                                  | When email notifications are not set up: unavailable, "Set up email notifications first." with `ExternalLink` "Notifications in the classic interface" → `/#/system/notification/settings`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | **Note** (`comment`)                                      | `TextField`, optional, up to 200 characters                           | Hint: "Names the job in lists. Without one, it is called {{auto}}."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

With deletion ticked, the checkpoint (5.5) offers only "Save and try it". Without it, both "Save and
try it" (filled) and "Save and turn on" (neutral) are offered (section 20, P7).

### 5.3 A side's fields

**A shared folder on this NAS**: **Shared folder** (`Select`, every shared folder by name with its file
system and free space; folders that are not OK, or whose file system is not mounted, unavailable with
the reason). Refusals of 0.10 show under the second side chosen: "Choose two different folders.",
"{{other}} is inside {{folder}}, so the job would copy a folder into itself." For a destination that
is shared over SMB or NFS or offered to the rsync server, the line: "People and computers that use
{{dest}} see these copies. Files they add there are kept, unless the job also deletes."

**Another computer**: **How the NAS reaches it** (`RadioGroupField`): "Over SSH, with one of the NAS's
keys" (default; unavailable with "Needs the list of SSH keys, which this interface cannot read yet."
until 14.0 is cleared) / "Through its rsync server". Then:

| Field                       | Over SSH                                                                                                            | Through its rsync server                                                                                  | Rule (the interface's own; the contract's patterns are the same)                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Computer**                | yes                                                                                                                 | yes                                                                                                       | One IPv4 or IPv6 address, or a name of letters, digits, `.` and `-`, at most 253 characters                                                                                                  |
| **Port**                    | "SSH port", default 22                                                                                              | "Port", default 873                                                                                       | 1 to 65535                                                                                                                                                                                   |
| **Sign in as**              | yes, required                                                                                                       | optional                                                                                                  | 1 to 32 of small letters, digits, `.`, `_`, `-`, starting with a letter or `_`                                                                                                               |
| **Folder on that computer** | "Folder", an absolute path                                                                                          | "Folder offered by its rsync server" (the other computer's module name) and "Folder inside it" (optional) | Letters, digits, `.`, `_`, `-`, `+`, `@` and `/`, no spaces; a path starts with `/`; no part is `..`. Hint: "No spaces: a copy job cannot use a folder whose name has a space." **[verify]** |
| **Key**                     | `Select` of `CertificateMgmt.getSshList` by comment; "Show the public key" disclosure with the key and `CopyButton` |                                                                                                           | Required                                                                                                                                                                                     |
| **Password**                |                                                                                                                     | `SecretField`, optional                                                                                   | One line. Never pre-filled (0.8)                                                                                                                                                             |

Over SSH, under the key: "Add this public key to the account {{user}} on {{host}} before the job first
runs. If the trial run then fails with "Host key verification failed", the NAS has not connected to
{{host}} before; copying the key from the classic interface's SSH keys page (System > Certificates >
SSH) connects it." `ExternalLink` "SSH keys in the classic interface" →
`/#/system/certificates/ssh`. Through its rsync server, the warning-shape neutral `InlineAlert`: "An
rsync server does not encrypt. The files and the password cross the network as they are. Use it only
on a network you trust."

The stored address is built from these fields: over SSH `{{user}}@{{host}}:{{path}}/` (with `sshport`
separate, `authentication` `pubkey`); through its rsync server `rsync://[{{user}}@]{{host}}[:{{port}}]/{{module}}/[{{inside}}/]`
(`authentication` `password`, the password or empty). An IPv6 address is written in brackets.

### 5.4 The deletion warning

When field 5 is ticked, under it (warning-shape neutral `InlineAlert`, part of the checkbox's
description so it is heard when the box is reached):

- "Each run deletes every file in {{dest}} that is not in {{src}}. On the first run, that is
  everything {{dest}} holds now that did not come from {{src}}."
- "If {{dest}} is the wrong folder, or the job runs the wrong way round, those files are lost. A copy
  job keeps no earlier versions to get them back from."
- "So the job is saved for trial runs only. You see what it would delete before it deletes anything."

### 5.5 Summary and confirmation (R2)

"Review the job…" (filled) opens the summary in place of the form (Back returns to it with every
choice kept). `JobSummary`:

1. The direction sentence, with the arrow.
2. "When: {{when}}." or "Only when you start it."
3. With deletion: the warning-shape item "Also deletes files in {{dest}} that are not in {{src}}."
4. Remote: "Signs in to {{host}} as {{user}} with the SSH key {{key}}." / "Signs in to the rsync
   server on {{host}}{{asUser}}{{withPassword}}." and, through an rsync server, the "does not encrypt"
   item.
5. "The output is emailed after each run." when chosen.
6. What happens next, as a numbered list matching the steps of 5.6.

Buttons: **"Save and try it"** (filled) and, without deletion, "Save and turn on" (neutral); "Back".
Neither needs typing: nothing has run yet.

### 5.6 The steps (R3, R5)

**Save and try it** runs a step list (`JobRunner`):

1. **Check** — re-read `dirtyModules` (refuse if anything new is pending, R1), `ShareMgmt.getList`, and
   for a remote job over SSH `getSshList`; re-check 0.10.
2. **Save the job for trial runs** — `Rsync.set` with `optiondryrun` true and `enable` false (0.11),
   so it neither runs on a schedule nor changes anything.
3. **Apply** — R10's re-read, then `Config.applyChangesBg` (expected `rsync`).
4. **Trial run** — `Rsync.execute` (a task; the output on the terminal pair as it comes).
5. **Read the trial** — the result card (5.7).

**Save and turn on** (no deletion) runs steps 1, "Save the job" (`Rsync.set` with `optiondryrun` false
and `enable` as chosen), 3, then the result "The job is saved and on." with "Run it now…" (section 7).

### 5.7 The trial's result, and turning the job on

The trial ended:

- **Succeeded**: `JobResult` "The trial run finished. Nothing was changed." Then, from the output:
  "It would copy {{copy}} files." (lines that are not rsync's own summary or a "deleting" line; said as
  "about" only if the count is not exact **[verify]** against the output's form) and, with deletion,
  "It would delete {{count}} files from {{dest}}." with the first 20 such lines listed as text and
  "Show the whole trial output" (the `TaskLog`). Zero deletions: "It would delete nothing from {{dest}}
  now."
- **Failed**: "The trial run failed." + the output's last lines + "Change the job" (back to the form,
  the job kept as trial-only) and "Run the trial again". The common causes, said under it when the
  output contains them: "Host key verification failed" (5.3's line), "Permission denied" or "auth
  failed" ("{{host}} refused the sign-in. Check the account and that the key or password is right."),
  "not mounted" ("{{folder}}'s file system is not mounted."), and rsync's "(code 23)" ("Some files,
  or their times and permissions, could not be written on {{host}}. The account the job signs in as
  must own the folder there.", observed, 22).

Then **"Turn the job on…"** (filled), "Change the job", "Leave it for trial runs" (neutral; ends the
flow; the job's page says what to do now, 4.2). "Turn the job on…" opens a confirmation:

- Without deletion: `ConfirmDialog` (plain), title "Turn on the copy job {{job}}?", body the direction
  sentence and "When: {{when}}." Button "Turn on the job".
- **With deletion** (the destructive form, UI-8): title "Turn on {{job}}, which deletes files in
  {{dest}}?"; body "From now on, each run deletes the files in {{dest}} that are not in {{src}}. The
  trial run listed {{count}} such files now. They cannot be got back afterwards."; the
  `TypeToConfirmField` "Type {{destName}} to confirm" (the destination folder's name, or for another
  computer its name `{{host}}`); focus on Cancel; Enter does not confirm; the button **"Turn on and
  delete"** (destructive) stays unavailable until the name matches. A remote job that signs in with a
  password asks for it again here (0.8).

On confirm: steps 6 "Save the job" (`Rsync.set` with `optiondryrun` false, `enable` true or as chosen,
from `Rsync.get` just read) and 7 "Apply" (R10, expected `rsync`). Result: "{{job}} is on. {{when}}."
with "Run it now…" and router link "Open the job". If the job changed between the trial and now
(another administrator: its source, destination, direction or deletion differ from what was tried),
the confirmation says "The job was changed since its trial run. Run the trial again." and offers only
that.

### 5.8 Failures (R6, R7)

| Step fails   | Said                                      | Offered                                                                                                                |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1 Check      | The reason (0.10, or new pending changes) | "Try again"; nothing was saved                                                                                         |
| 2 or 6 Save  | "The job was not saved." + server message | "Try this step again". Nothing to undo                                                                                 |
| 3 or 7 Apply | The band's failed-apply words (R7)        | "Try applying again"; the job stays saved (as trial-only after step 2, so nothing deletes); the band keeps the failure |
| 4 Trial run  | 5.7's failed result                       | "Run the trial again", "Change the job"                                                                                |

No "Undo" is offered after step 2: the saved job is harmless (trial-only, off schedule) and is on the
list to change or delete. A reload or a lost session ends the flow view (R8); the job's page then says
"This job only does trial runs" (4.2), which is the way back in.

### 5.9 Keyboard and screen readers

The form in reading order; the direction sentence and the deletion warning are polite live regions
and part of the related fields' descriptions; the summary is one region with its heading; the step
list announces each step's word (Waiting, Running, Succeeded, Failed); the trial result is announced
politely, the typed confirmation's state assertively only on a mismatch at confirm.

### 5.10 Copy

| Key                                       | English                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addJob.title`                            | Add a copy job                                                                                                                                                                                                                                                                                                                                   |
| `addJob.preflight`                        | Other changes are waiting to be applied: {{modules}}. Adding a copy job applies its own changes, so deal with those first.                                                                                                                                                                                                                       |
| `addJob.from`                             | Copy from                                                                                                                                                                                                                                                                                                                                        |
| `addJob.to`                               | Copy to                                                                                                                                                                                                                                                                                                                                          |
| `addJob.side.folder`                      | A shared folder on this NAS                                                                                                                                                                                                                                                                                                                      |
| `addJob.side.remote`                      | Another computer                                                                                                                                                                                                                                                                                                                                 |
| `addJob.side.oneRemote`                   | One side must be a shared folder on this NAS.                                                                                                                                                                                                                                                                                                    |
| `addJob.sentence.incomplete`              | Choose both sides to see what this job does.                                                                                                                                                                                                                                                                                                     |
| `addJob.replace`                          | Files in <dest></dest> with the same name as a file in <src></src> are replaced by the version in <src></src>, even when the one in <dest></dest> is newer.                                                                                                                                                                                      |
| `addJob.delete`                           | Also delete files in <dest></dest> that are not in <src></src>                                                                                                                                                                                                                                                                                   |
| `addJob.deleteHint`                       | Makes <dest></dest> an exact copy of <src></src>. Use this only for a folder that holds nothing but this copy.                                                                                                                                                                                                                                   |
| `addJob.deleteWarn1`                      | Each run deletes every file in <dest></dest> that is not in <src></src>. On the first run, that is everything <dest></dest> holds now that did not come from <src></src>.                                                                                                                                                                        |
| `addJob.deleteWarn2`                      | If <dest></dest> is the wrong folder, or the job runs the wrong way round, those files are lost. A copy job keeps no earlier versions to get them back from.                                                                                                                                                                                     |
| `addJob.deleteWarn3`                      | So the job is saved for trial runs only. You see what it would delete before it deletes anything.                                                                                                                                                                                                                                                |
| `addJob.when`                             | When                                                                                                                                                                                                                                                                                                                                             |
| `addJob.when.manual`                      | Only when I start it                                                                                                                                                                                                                                                                                                                             |
| `addJob.when.schedule`                    | On a schedule                                                                                                                                                                                                                                                                                                                                    |
| `addJob.howOften`                         | How often                                                                                                                                                                                                                                                                                                                                        |
| `addJob.howOften.hourly`                  | Every hour                                                                                                                                                                                                                                                                                                                                       |
| `addJob.howOften.daily`                   | Every day                                                                                                                                                                                                                                                                                                                                        |
| `addJob.howOften.weekly`                  | Every week                                                                                                                                                                                                                                                                                                                                       |
| `addJob.howOften.monthly`                 | Every month                                                                                                                                                                                                                                                                                                                                      |
| `addJob.howOften.custom`                  | Custom                                                                                                                                                                                                                                                                                                                                           |
| `addJob.at`                               | At                                                                                                                                                                                                                                                                                                                                               |
| `addJob.atHour`                           | Hour                                                                                                                                                                                                                                                                                                                                             |
| `addJob.atMinute`                         | Minute                                                                                                                                                                                                                                                                                                                                           |
| `addJob.on`                               | On                                                                                                                                                                                                                                                                                                                                               |
| `addJob.onDay`                            | On day                                                                                                                                                                                                                                                                                                                                           |
| `addJob.onDayHigh`                        | Months without this day are skipped.                                                                                                                                                                                                                                                                                                             |
| `addJob.minutesPast`                      | At minutes past                                                                                                                                                                                                                                                                                                                                  |
| `addJob.custom.minute`                    | Minute                                                                                                                                                                                                                                                                                                                                           |
| `addJob.custom.hour`                      | Hour                                                                                                                                                                                                                                                                                                                                             |
| `addJob.custom.day`                       | Day of the month                                                                                                                                                                                                                                                                                                                                 |
| `addJob.custom.month`                     | Month                                                                                                                                                                                                                                                                                                                                            |
| `addJob.custom.weekday`                   | Weekday                                                                                                                                                                                                                                                                                                                                          |
| `addJob.custom.every.minute`              | Every minute                                                                                                                                                                                                                                                                                                                                     |
| `addJob.custom.every.hour`                | Every hour                                                                                                                                                                                                                                                                                                                                       |
| `addJob.custom.every.day`                 | Every day                                                                                                                                                                                                                                                                                                                                        |
| `addJob.custom.every.month`               | Every month                                                                                                                                                                                                                                                                                                                                      |
| `addJob.custom.every.weekday`             | Every weekday                                                                                                                                                                                                                                                                                                                                    |
| `addJob.custom.either`                    | With both a day of the month and a weekday, it runs on days that are either.                                                                                                                                                                                                                                                                     |
| `addJob.nasClock`                         | Times are the NAS's clock{{zone}}.                                                                                                                                                                                                                                                                                                               |
| `addJob.nasClockZone`                     | , {{zone}}                                                                                                                                                                                                                                                                                                                                       |
| `addJob.email`                            | Email the output after each run                                                                                                                                                                                                                                                                                                                  |
| `addJob.emailNotSetUp`                    | Set up email notifications first.                                                                                                                                                                                                                                                                                                                |
| `addJob.emailLink`                        | Notifications in the classic interface                                                                                                                                                                                                                                                                                                           |
| `addJob.note`                             | Note                                                                                                                                                                                                                                                                                                                                             |
| `addJob.noteHint`                         | Names the job in lists. Without one, it is called {{auto}}.                                                                                                                                                                                                                                                                                      |
| `addJob.folder`                           | Shared folder                                                                                                                                                                                                                                                                                                                                    |
| `addJob.folder.notOk`                     | It cannot be reached now.                                                                                                                                                                                                                                                                                                                        |
| `addJob.folder.notMounted`                | Its file system is not mounted.                                                                                                                                                                                                                                                                                                                  |
| `addJob.err.same`                         | Choose two different folders.                                                                                                                                                                                                                                                                                                                    |
| `addJob.err.inside`                       | <other></other> is inside <folder></folder>, so the job would copy a folder into itself.                                                                                                                                                                                                                                                         |
| `addJob.destShared`                       | People and computers that use <dest></dest> see these copies. Files they add there are kept, unless the job also deletes.                                                                                                                                                                                                                        |
| `addJob.how`                              | How the NAS reaches it                                                                                                                                                                                                                                                                                                                           |
| `addJob.how.ssh`                          | Over SSH, with one of the NAS's keys                                                                                                                                                                                                                                                                                                             |
| `addJob.how.sshUnavailable`               | Needs the list of SSH keys, which this interface cannot read yet.                                                                                                                                                                                                                                                                                |
| `addJob.how.rsyncd`                       | Through its rsync server                                                                                                                                                                                                                                                                                                                         |
| `addJob.host`                             | Computer                                                                                                                                                                                                                                                                                                                                         |
| `addJob.sshPort`                          | SSH port                                                                                                                                                                                                                                                                                                                                         |
| `addJob.port`                             | Port                                                                                                                                                                                                                                                                                                                                             |
| `addJob.user`                             | Sign in as                                                                                                                                                                                                                                                                                                                                       |
| `addJob.path`                             | Folder                                                                                                                                                                                                                                                                                                                                           |
| `addJob.module`                           | Folder offered by its rsync server                                                                                                                                                                                                                                                                                                               |
| `addJob.inside`                           | Folder inside it                                                                                                                                                                                                                                                                                                                                 |
| `addJob.pathHint`                         | No spaces: a copy job cannot use a folder whose name has a space.                                                                                                                                                                                                                                                                                |
| `addJob.key`                              | Key                                                                                                                                                                                                                                                                                                                                              |
| `addJob.showKey`                          | Show the public key                                                                                                                                                                                                                                                                                                                              |
| `addJob.keyHelp`                          | Add this public key to the account <user></user> on <host></host> before the job first runs. If the trial run then fails with "Host key verification failed", the NAS has not connected to <host></host> before; copying the key from the classic interface's SSH keys page (System > Certificates > SSH) connects it.                           |
| `addJob.keyLink`                          | SSH keys in the classic interface                                                                                                                                                                                                                                                                                                                |
| `addJob.password`                         | Password                                                                                                                                                                                                                                                                                                                                         |
| `addJob.passwordAgain`                    | Type the password again to save. The NAS does not give it back to this page.                                                                                                                                                                                                                                                                     |
| `addJob.noEncryption`                     | An rsync server does not encrypt. The files and the password cross the network as they are. Use it only on a network you trust.                                                                                                                                                                                                                  |
| `addJob.err.host`                         | Write one address, such as 192.0.2.20, or one computer name.                                                                                                                                                                                                                                                                                     |
| `addJob.err.port`                         | Use a port from 1 to 65535.                                                                                                                                                                                                                                                                                                                      |
| `addJob.err.user`                         | Use 1 to 32 small letters, digits, ".", "_" or "-", starting with a letter.                                                                                                                                                                                                                                                                      |
| `addJob.err.path`                         | Use letters, digits and . _ - + @ /, with no spaces, starting with "/".                                                                                                                                                                                                                                                                          |
| `addJob.err.module`                       | Use letters, digits and . _ - only.                                                                                                                                                                                                                                                                                                              |
| `addJob.err.key`                          | Choose a key.                                                                                                                                                                                                                                                                                                                                    |
| `addJob.review`                           | Review the job…                                                                                                                                                                                                                                                                                                                                  |
| `addJob.back`                             | Back                                                                                                                                                                                                                                                                                                                                             |
| `addJob.summary.when`                     | When: {{when}}.                                                                                                                                                                                                                                                                                                                                  |
| `addJob.summary.manual`                   | Only when you start it.                                                                                                                                                                                                                                                                                                                          |
| `addJob.summary.deletes`                  | Also deletes files in <dest></dest> that are not in <src></src>.                                                                                                                                                                                                                                                                                 |
| `addJob.summary.ssh`                      | Signs in to <host></host> as <user></user> with the SSH key <key></key>.                                                                                                                                                                                                                                                                         |
| `addJob.summary.rsyncd`                   | Signs in to the rsync server on <host></host>{{asUser}}{{withPassword}}.                                                                                                                                                                                                                                                                         |
| `addJob.summary.asUser`                   | as <user></user>                                                                                                                                                                                                                                                                                                                                 |
| `addJob.summary.withPassword`             | , with a password                                                                                                                                                                                                                                                                                                                                |
| `addJob.summary.email`                    | The output is emailed after each run.                                                                                                                                                                                                                                                                                                            |
| `addJob.saveTry`                          | Save and try it                                                                                                                                                                                                                                                                                                                                  |
| `addJob.saveOn`                           | Save and turn on                                                                                                                                                                                                                                                                                                                                 |
| `addJob.step.check`                       | Check                                                                                                                                                                                                                                                                                                                                            |
| `addJob.step.saveTrial`                   | Save the job for trial runs                                                                                                                                                                                                                                                                                                                      |
| `addJob.step.save`                        | Save the job                                                                                                                                                                                                                                                                                                                                     |
| `addJob.step.apply`                       | Apply                                                                                                                                                                                                                                                                                                                                            |
| `addJob.step.trial`                       | Trial run                                                                                                                                                                                                                                                                                                                                        |
| `addJob.step.read`                        | Read the trial                                                                                                                                                                                                                                                                                                                                   |
| `addJob.result.on`                        | The job is saved and on.                                                                                                                                                                                                                                                                                                                         |
| `addJob.trial.ok`                         | The trial run finished. Nothing was changed.                                                                                                                                                                                                                                                                                                     |
| `addJob.trial.copies_one` / `_other`      | It would copy {{count}} file. / It would copy {{count}} files.                                                                                                                                                                                                                                                                                   |
| `addJob.trial.deletes_one` / `_other`     | It would delete {{count}} file from <dest></dest>. / It would delete {{count}} files from <dest></dest>.                                                                                                                                                                                                                                         |
| `addJob.trial.deletesNone`                | It would delete nothing from <dest></dest> now.                                                                                                                                                                                                                                                                                                  |
| `addJob.trial.showAll`                    | Show the whole trial output                                                                                                                                                                                                                                                                                                                      |
| `addJob.trial.failed`                     | The trial run failed.                                                                                                                                                                                                                                                                                                                            |
| `addJob.trial.hostKey`                    | The NAS has not connected to <host></host> before. See the line about the key above.                                                                                                                                                                                                                                                             |
| `addJob.trial.denied`                     | <host></host> refused the sign-in. Check the account and that the key or password is right.                                                                                                                                                                                                                                                      |
| `addJob.trial.notMounted`                 | <folder></folder>'s file system is not mounted.                                                                                                                                                                                                                                                                                                  |
| `addJob.trial.again`                      | Run the trial again                                                                                                                                                                                                                                                                                                                              |
| `addJob.trial.change`                     | Change the job                                                                                                                                                                                                                                                                                                                                   |
| `addJob.trial.leave`                      | Leave it for trial runs                                                                                                                                                                                                                                                                                                                          |
| `addJob.turnOn`                           | Turn the job on…                                                                                                                                                                                                                                                                                                                                 |
| `addJob.turnOn.title`                     | Turn on the copy job {{job}}?                                                                                                                                                                                                                                                                                                                    |
| `addJob.turnOn.confirm`                   | Turn on the job                                                                                                                                                                                                                                                                                                                                  |
| `addJob.turnOnDelete.title`               | Turn on {{job}}, which deletes files in {{dest}}?                                                                                                                                                                                                                                                                                                |
| `addJob.turnOnDelete.body_one` / `_other` | From now on, each run deletes the files in <dest></dest> that are not in <src></src>. The trial run listed {{count}} such file now. It cannot be got back afterwards. / From now on, each run deletes the files in <dest></dest> that are not in <src></src>. The trial run listed {{count}} such files now. They cannot be got back afterwards. |
| `addJob.turnOnDelete.type`                | Type {{name}} to confirm                                                                                                                                                                                                                                                                                                                         |
| `addJob.turnOnDelete.confirm`             | Turn on and delete                                                                                                                                                                                                                                                                                                                               |
| `addJob.turnOn.changed`                   | The job was changed since its trial run. Run the trial again.                                                                                                                                                                                                                                                                                    |
| `addJob.turnedOn`                         | {{job}} is on. {{when}}                                                                                                                                                                                                                                                                                                                          |
| `addJob.runNow`                           | Run it now…                                                                                                                                                                                                                                                                                                                                      |
| `addJob.openJob`                          | Open the job                                                                                                                                                                                                                                                                                                                                     |
| `addJob.fail.notSaved`                    | The job was not saved.                                                                                                                                                                                                                                                                                                                           |
| `addJob.fail.tryStep`                     | Try this step again                                                                                                                                                                                                                                                                                                                              |
| `addJob.cancel`                           | Cancel                                                                                                                                                                                                                                                                                                                                           |
| `folderPage.keepCopy`                     | Keep a copy of this folder…                                                                                                                                                                                                                                                                                                                      |

---

## 6. Change a copy job

"Change…" on the job's page (or the list's menu) opens 5.2's form in place, filled from `Rsync.get`,
heading "Change the job". A stored schedule that fits a choice opens on it; anything else (several
values, "every N") opens on Custom with the stored values, and is kept unless a Custom field is
changed. A stored remote address that does not split into 5.3's fields is shown as stored, in
`Identifier`, "(set in the classic interface)", with "Write it again" to replace it.

**What a change needs** (section 20, P7):

| What changed                                                                                          | Then                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Only the schedule, "only when I start it", email or the note                                          | **Save** (filled): read-modify-write (0.11) to the band. Toast "The changes to {{job}} are saved. Apply them to use them."                                                                                                                             |
| Source, destination, direction, or deletion turned on (or the job already deletes and a side changed) | The add flow from 5.5: summary, "Save and try it", the trial, "Turn the job on…" with typing when it deletes. Its pre-flight (5.1) applies. Until it is turned on again the job is saved as trial-only and off schedule, so nothing deletes in between |
| Deletion turned off                                                                                   | **Save**, with the line "Files the job deleted before stay deleted."                                                                                                                                                                                   |

A job that signs in with a password asks for it again on any save (0.8). A job with options set in
the classic interface keeps them; when the reader turns deletion off but 0.6's extra options still
delete, the form says "Its extra options, set in the classic interface, still delete files. Change
them there." and the job stays treated as deleting.

Copy keys: `changeJob.title` "Change the job"; `changeJob.save` "Save"; `changeJob.saved` "The changes
to {{job}} are saved. Apply them to use them."; `changeJob.retrial` "Changing which folders it copies,
or the way it copies, needs a new trial run before the job runs again."; `changeJob.deletedStay` "Files
the job deleted before stay deleted."; `changeJob.extraStillDeletes` "Its extra options, set in the
classic interface, still delete files. Change them there."; `changeJob.classicValue` "{{value}} (set in
the classic interface)"; `changeJob.writeAgain` "Write it again"; and 5.10's keys for every field.

---

## 7. Run a copy job now

### 7.1 When it can run

"Run now…" (job page, list menu, the flows' results) is unavailable (`aria-disabled`, focusable,
reason beside it or in the menu item's description) when:

- `rsync` is pending: "Apply the pending changes first. The NAS runs each job as it was when changes
  were last applied." (0.9)
- this job is running in this session: "It is running now." with "Show it" (the task);
- a shared folder it uses is not OK or its file system is not mounted: "{{folder}} cannot be reached."

### 7.2 The confirmation

`ConfirmDialog`, focus on Cancel, by kind:

| Job                     | Variant                                                                          | Title                                            | Body                                                                                                     | Button            |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------- |
| Trial runs only         | plain                                                                            | "Run a trial of {{job}}?"                        | "It lists what the job would copy and delete, and changes nothing."                                      | "Run the trial"   |
| Copies, does not delete | plain                                                                            | "Copy {{src}} to {{dest}} now?"                  | The direction sentence. "Files in {{dest}} with the same name are replaced by the versions in {{src}}."  | "Start copying"   |
| Also deletes            | **destructive** (no typing: the name was typed when deletion was turned on, 5.7) | "Copy {{src}} to {{dest}} and delete there now?" | The direction sentence. "Files in {{dest}} that are not in {{src}} are deleted, and cannot be got back." | "Copy and delete" |

### 7.3 The task

On confirm: `Rsync.execute {uuid}` through the task helper; the task handle stays in memory (UI-5).
The task:

- **Title** "Copy job: {{job}}", the state pill (Running, Succeeded, Failed, Cancelled), elapsed time.
  No progress bar: rsync's output gives no total.
- **Output** on the terminal pair (`TaskLog`), the script's and rsync's lines as they come from
  `Exec.getOutput` through the transport, nothing sent anywhere else; follows the tail while the reader
  is at the bottom; copy and download (a text file made in the browser from what was received). The
  view keeps the newest 10,000 lines on screen and says "Showing the newest 10,000 lines. The download
  has every line received." (section 19, D10); every run's output is also in the Rsync jobs log.
- **Stop** ("Stop the copy…", neutral): a plain confirmation "Stop {{job}}? Files copied so far stay.
  Files it deleted so far stay deleted. The next run carries on." Button "Stop the copy". Then
  `Exec.stop` (the job's script stops rsync and removes its lock, read from source); the state
  Cancelled.
- **Survives navigation**: in the top bar's tasks menu, as every task.
- **Result**, announced politely and kept until dismissed: Succeeded "{{job}} finished." with "The
  output is kept until you dismiss it."; Failed "{{job}} failed." + the last lines + "Run again…";
  failed with no output: "{{job}} ended at once without saying why. It may already be running on its
  schedule. Wait for it to end and try again." (0.6) **[verify]**.

The run changes no configuration. After it ends, the job's page and the list re-read.

### 7.4 Copy

| Key                     | English                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `runJob.pending`        | Apply the pending changes first. The NAS runs each job as it was when changes were last applied.                       |
| `runJob.running`        | It is running now.                                                                                                     |
| `runJob.show`           | Show it                                                                                                                |
| `runJob.unreachable`    | <folder></folder> cannot be reached.                                                                                   |
| `runJob.trial.title`    | Run a trial of {{job}}?                                                                                                |
| `runJob.trial.body`     | It lists what the job would copy and delete, and changes nothing.                                                      |
| `runJob.trial.confirm`  | Run the trial                                                                                                          |
| `runJob.copy.title`     | Copy {{src}} to {{dest}} now?                                                                                          |
| `runJob.copy.body`      | Files in <dest></dest> with the same name are replaced by the versions in <src></src>.                                 |
| `runJob.copy.confirm`   | Start copying                                                                                                          |
| `runJob.delete.title`   | Copy {{src}} to {{dest}} and delete there now?                                                                         |
| `runJob.delete.body`    | Files in <dest></dest> that are not in <src></src> are deleted, and cannot be got back.                                |
| `runJob.delete.confirm` | Copy and delete                                                                                                        |
| `runJob.cancel`         | Cancel                                                                                                                 |
| `runJob.task.title`     | Copy job: {{job}}                                                                                                      |
| `runJob.task.cap`       | Showing the newest 10,000 lines. The download has every line received.                                                 |
| `runJob.stop`           | Stop the copy…                                                                                                         |
| `runJob.stop.title`     | Stop {{job}}?                                                                                                          |
| `runJob.stop.body`      | Files copied so far stay. Files it deleted so far stay deleted. The next run carries on.                               |
| `runJob.stop.confirm`   | Stop the copy                                                                                                          |
| `runJob.done`           | {{job}} finished.                                                                                                      |
| `runJob.kept`           | The output is kept until you dismiss it.                                                                               |
| `runJob.failed`         | {{job}} failed.                                                                                                        |
| `runJob.failedSilent`   | {{job}} ended at once without saying why. It may already be running on its schedule. Wait for it to end and try again. |
| `runJob.again`          | Run again…                                                                                                             |

---

## 8. Delete a copy job

"Delete this copy job…" (job page) and "Delete…" (list menu). Unavailable while this job runs in this
session ("Wait for it to finish, or stop it."). `ConfirmDialog`, plain (a job is configuration; no
file is lost, and Undo in the band brings it back before Apply):

1. Title: "Delete the copy job {{job}}?"
2. "It no longer runs once you apply the changes. The files it copied stay in {{dest}}, and {{src}} is
   not touched."
3. Buttons: "Cancel" (focused) and **"Delete copy job"** (filled primary).

On confirm: `Rsync.delete {uuid}`; toast "{{job}} will be deleted when you apply the changes.", the
band; from the job's page, the router goes to the list and focus to its heading.

Copy keys: `deleteJob.title` "Delete the copy job {{job}}?"; `deleteJob.body` "It no longer runs once
you apply the changes. The files it copied stay in <dest></dest>, and <src></src> is not touched.";
`deleteJob.cancel` "Cancel"; `deleteJob.confirm` "Delete copy job"; `deleteJob.running` "Wait for it to
finish, or stop it."; `deleteJob.done` "{{job}} will be deleted when you apply the changes.";
`deleteJob.failed` "The copy job was not deleted."

---

## 9. Services > Rsync > Rsync server

**Question it answers:** can other computers copy files to and from this NAS with rsync, and which
folders, for whom? **Leads to:** turning it on or off; offering a folder; changing or removing one.

Route `/services/rsync/server`, the second tab of the Rsync page (section 3).

### 9.1 Data

`Rsyncd.getSettings`, `Rsyncd.getModuleList` (whole; every sign-in's password removed by the
transport, 0.8), `ShareMgmt.getList` (whole), `Services.getStatus`, `System.getInformation`.
Refreshed on opening, Refresh, window focus and after a save.

### 9.2 Layout

1. The tabs, Rsync server current.
2. Intro: `services.term.rsyncd` (0.1), and the warning-shape neutral `InlineAlert`: "The rsync server
   does not encrypt. Files and passwords cross the network as they are. Use it only on a network you
   trust."
3. `text-sm`: "Another computer can also copy files over SSH, which encrypts, with a person's SSH
   sign-in." router link "SSH" → `/services/ssh` (Phase 3's page; it is not changed).
4. **State line** (`role="status"`): 0.3's pill and words, the pending mark when `rsyncd` is pending.
5. **The switch card**: "The rsync server is off." with **"Turn on"** (filled, to the band) / "The
   rsync server is on." with **"Turn off…"** (neutral, 9.3). Under it, `text-sm muted-foreground`:
   "It listens on port {{port}}." (as received; the port is changed in the classic interface).
6. `h2` "Folders offered", toolbar **"Offer a folder…"** (neutral; 10.1), and a table:

   | Order | Header              | Display                                                                                                                                                                                  |
   | ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 1     | Folder              | Router link to the shared folder's page                                                                                                                                                  |
   | 2     | Offered as          | `{{rsyncAddress}}` with `CopyButton`                                                                                                                                                     |
   | 3     | Other computers may | "Copy from it (read only)" / "Copy to and from it" / "Copy to it only" (set in the classic interface)                                                                                    |
   | 4     | Sign-in             | "Name and password: {{name}}" / "{{count}} sign-ins (set in the classic interface)" / "**None**" with the warning-shape icon and "Anyone who may connect can use it without a password." |
   | 5     | Who may connect     | 0.4's words; "Any computer with the name and password" when empty and a sign-in is asked; "Any computer" with the warning-shape icon when empty and no sign-in is asked                  |
   | 6     | Actions             | A menu button with **Change…**, a separator, **Stop offering…**                                                                                                                          |

   A folder turned off in the classic interface (`enable` false) reads "Turned off for this folder"
   under its name. Empty: "No folder is offered to the rsync server yet." with "Offer a folder…".

7. Footer: "The port and other rsync server options are in the classic interface." `ExternalLink`
   "Rsync server settings in the classic interface" → `/#/services/rsync/server/settings`.

### 9.3 Turning it off

`ConfirmDialog` (plain): title "Turn off the rsync server?"; body "After the changes are applied, other
computers cannot copy to or from this NAS over rsync: {{count}} folders are offered now ({{list}}).
Copy jobs on other computers that use them fail until it is on again. The files stay, and each folder
stays offered for when you turn it on again."; "Cancel" (focused), **"Turn off"** (filled primary). On
confirm `Rsyncd.setSettings` (0.11), toast, the band.

### 9.4 States

As 1.5, with the rsync server's words: "Could not read whether the rsync server is on." / "Could not
read the folders offered to the rsync server." / "Loading the rsync server…".

### 9.5 Copy

| Key                              | English                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `services.term.rsyncd`           | The rsync server lets other computers copy files to and from this NAS with rsync, for example another NAS that keeps its copies here.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rsyncd.noEncryption`            | The rsync server does not encrypt. Files and passwords cross the network as they are. Use it only on a network you trust.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rsyncd.sshInstead`              | Another computer can also copy files over SSH, which encrypts, with a person's SSH sign-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rsyncd.sshLink`                 | SSH                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rsyncd.state.off`               | Off. No folder is offered to other computers over rsync.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rsyncd.state.on`                | On.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rsyncd.state.down`              | On, but not running. Other computers cannot copy to or from this NAS. The system logs may say why.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rsyncd.state.downLink`          | Open System logs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rsyncd.state.pendingOn`         | Turned on. It starts when you apply the pending changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rsyncd.state.unread`            | Could not read whether the rsync server is on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rsyncd.switch.off`              | The rsync server is off.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rsyncd.switch.on`               | The rsync server is on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rsyncd.turnOn`                  | Turn on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rsyncd.turnOff`                 | Turn off…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rsyncd.port`                    | It listens on port {{port}}.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `rsyncd.turnedOn`                | The rsync server will turn on when you apply the changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rsyncd.turnedOff`               | The rsync server will turn off when you apply the changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `rsyncd.off.title`               | Turn off the rsync server?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `rsyncd.off.body_one` / `_other` | After the changes are applied, other computers cannot copy to or from this NAS over rsync: {{count}} folder is offered now ({{list}}). Copy jobs on other computers that use it fail until it is on again. The files stay, and the folder stays offered for when you turn it on again. / After the changes are applied, other computers cannot copy to or from this NAS over rsync: {{count}} folders are offered now ({{list}}). Copy jobs on other computers that use them fail until it is on again. The files stay, and each folder stays offered for when you turn it on again. |
| `rsyncd.off.cancel`              | Cancel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rsyncd.off.confirm`             | Turn off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rsyncd.modules.title`           | Folders offered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rsyncd.modules.add`             | Offer a folder…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rsyncd.col.folder`              | Folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rsyncd.col.as`                  | Offered as                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `rsyncd.col.may`                 | Other computers may                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rsyncd.col.signIn`              | Sign-in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rsyncd.col.who`                 | Who may connect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rsyncd.may.ro`                  | Copy from it (read only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `rsyncd.may.rw`                  | Copy to and from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `rsyncd.may.wo`                  | Copy to it only (set in the classic interface)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rsyncd.signIn.one`              | Name and password: <name></name>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `rsyncd.signIn.many`             | {{count}} sign-ins (set in the classic interface)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `rsyncd.signIn.none`             | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rsyncd.signIn.noneWarn`         | Anyone who may connect can use it without a password.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rsyncd.who.anyWithPassword`     | Any computer with the name and password                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rsyncd.who.any`                 | Any computer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `rsyncd.moduleOff`               | Turned off for this folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `rsyncd.modules.empty`           | No folder is offered to the rsync server yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rsyncd.modules.loadFailed`      | Could not read the folders offered to the rsync server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `rsyncd.footerLine`              | The port and other rsync server options are in the classic interface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rsyncd.classicLink`             | Rsync server settings in the classic interface                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `rsyncd.loading`                 | Loading the rsync server…                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `modules.rsyncd`                 | Rsync server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## 10. Offer a folder to the rsync server

### 10.1 The dialog

"Offer a folder…" opens a `Dialog` "Offer a folder to the rsync server"; "Change…" opens the same
dialog filled from `Rsyncd.getModule`, titled "Change how {{folder}} is offered".

### 10.2 Fields

| #   | Field                                  | Control                                                        | Default and rules                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Folder**                             | `Select` of the shared folders that are OK and not yet offered | Fixed when changing (OMV allows a change; moving what other computers reach is done by removing and offering again)                                                                                                                                                                                 |
| 2   | **Offered as**                         | `TextField`, `Identifier` font                                 | The folder's name when it fits the rule; otherwise empty. Rule: 1 to 64 of letters, digits, `.`, `_`, `-`, starting with a letter or digit, unique ignoring case among offered folders. Hint: "Other computers use this name: {{rsyncAddress}}." Fixed when changing (other computers' jobs use it) |
| 3   | **Other computers may**                | `RadioGroupField`                                              | **"Copy from it (read only)"** (default) / "Copy to and from it". Hint for the second: "They can also change and delete files in {{folder}}." A stored write-only is shown as a third, chosen, choice "Copy to it only (set in the classic interface)" and kept unless changed                      |
| 4   | **Ask for a name and password**        | `CheckboxField`, **ticked** by default                         | Unticking is its own choice: the warning-shape neutral `InlineAlert` "Without a name and password, every computer allowed below can {{may}} {{folder}} over rsync." and field 6 becomes required (0.4)                                                                                              |
| 5   | When ticked: **Name** and **Password** | `TextField`; `NewPasswordFields` (typed twice, reveal)         | Name: 1 to 32 of letters, digits, `.`, `_`, `-` (no `:`). Hint: "A name and password only for the rsync server. They are not a person on this NAS." Password: one line, not empty. When changing: "Password: Set" with "Change"; saving asks for it again (0.8)                                     |
| 6   | **Who may connect**                    | 0.4's control                                                  | With a sign-in: "Any computer with the name and password" first and chosen. Without: "One computer" chosen; "Any computer" not offered                                                                                                                                                              |

A module with more than one sign-in (set in the classic interface) opens read-only: its fields as
text, the line "This folder has {{count}} sign-ins set in the classic interface. Change it there."
and `ExternalLink` "Rsync server folders in the classic interface" → `/#/services/rsync/server/modules`;
only "Stop offering…" stays available here, since removing needs no password (0.10).

Buttons: **"Offer folder"** (filled; "Save" when changing) and "Cancel". On save: re-read
`getModuleList` (and `getModule` when changing), check 0.10, `Rsyncd.setModule` (0.11). The password
fields are cleared after the request, whatever its result (UI-6). Toast "{{folder}} will be offered as
{{name}} when you apply the changes.", the band, focus back to the opening button. When the rsync
server is off, the dialog's last line says "The rsync server is off. Offering a folder does not turn
it on." with no second call (one switch, on the tab).

### 10.3 Access and files

`text-sm` in the dialog under field 3: "Files copied in belong to the NAS's account for the rsync
server, so the people given access to {{folder}} can use them as usual." (the classic defaults `nobody`
and `users`, 0.11) **[verify]** on a folder made here (770): that a copy in works and the files are
readable by a person with access. And under field 4: "Who can use it, on the folder's page, does not
apply to the rsync server: only these sign-ins and who may connect decide." Read from source: the rsync
server's configuration is written from the module alone, and the folder's access list is not part of
it; the shares slice's 0.4 said otherwise, and is corrected by this slice **[verify]** (17.2, item 10).
Copy key `module.accessNotUsed`: "Who can use it, on the folder's page, does not apply to the rsync
server: only these sign-ins and who may connect decide."

### 10.4 Stop offering

`ConfirmDialog` (plain): title "Stop offering {{folder}} to the rsync server?"; body "After the
changes are applied, other computers cannot reach {{rsyncAddress}}. Copy jobs on other computers that
use it fail. The files stay on the NAS." and, with a sign-in, "Its name and password are removed with
it."; "Cancel" (focused), **"Stop offering"** (filled primary). On confirm `Rsyncd.deleteModule`,
toast, the band.

### 10.5 Copy

| Key                      | English                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module.titleNew`        | Offer a folder to the rsync server                                                                                                                         |
| `module.titleChange`     | Change how {{folder}} is offered                                                                                                                           |
| `module.folder`          | Folder                                                                                                                                                     |
| `module.name`            | Offered as                                                                                                                                                 |
| `module.nameHint`        | Other computers use this name: <address></address>.                                                                                                        |
| `module.may`             | Other computers may                                                                                                                                        |
| `module.may.ro`          | Copy from it (read only)                                                                                                                                   |
| `module.may.rw`          | Copy to and from it                                                                                                                                        |
| `module.may.rwHint`      | They can also change and delete files in <folder></folder>.                                                                                                |
| `module.may.wo`          | Copy to it only (set in the classic interface)                                                                                                             |
| `module.ask`             | Ask for a name and password                                                                                                                                |
| `module.noAskWarn`       | Without a name and password, every computer allowed below can {{may}} <folder></folder> over rsync.                                                        |
| `module.verb.ro`         | copy from                                                                                                                                                  |
| `module.verb.rw`         | copy to and from                                                                                                                                           |
| `module.signInName`      | Name                                                                                                                                                       |
| `module.signInHint`      | A name and password only for the rsync server. They are not a person on this NAS.                                                                          |
| `module.password`        | Password                                                                                                                                                   |
| `module.passwordSet`     | Password: Set                                                                                                                                              |
| `module.passwordChange`  | Change                                                                                                                                                     |
| `module.passwordAgain`   | Type the password again to save. The NAS does not give it back to this page.                                                                               |
| `module.who`             | Who may connect                                                                                                                                            |
| `module.filesBelong`     | Files copied in belong to the NAS's account for the rsync server, so the people given access to <folder></folder> can use them as usual.                   |
| `module.many`            | This folder has {{count}} sign-ins set in the classic interface. Change it there.                                                                          |
| `module.classicLink`     | Rsync server folders in the classic interface                                                                                                              |
| `module.serverOff`       | The rsync server is off. Offering a folder does not turn it on.                                                                                            |
| `module.offer`           | Offer folder                                                                                                                                               |
| `module.save`            | Save                                                                                                                                                       |
| `module.cancel`          | Cancel                                                                                                                                                     |
| `module.saving`          | Saving…                                                                                                                                                    |
| `module.err.name`        | Use 1 to 64 letters, digits, ".", "_" or "-", starting with a letter or digit.                                                                             |
| `module.err.nameTaken`   | Another folder is offered as {{name}}. Choose another name.                                                                                                |
| `module.err.signInName`  | Use 1 to 32 letters, digits, ".", "_" or "-".                                                                                                              |
| `module.err.whoRequired` | Without a name and password, choose one computer or one network.                                                                                           |
| `module.saved`           | {{folder}} will be offered as {{name}} when you apply the changes.                                                                                         |
| `module.savedChange`     | The changes to how {{folder}} is offered are saved. Apply them to use them.                                                                                |
| `module.failed`          | The folder was not offered.                                                                                                                                |
| `module.stop.title`      | Stop offering {{folder}} to the rsync server?                                                                                                              |
| `module.stop.body`       | After the changes are applied, other computers cannot reach <address></address>. Copy jobs on other computers that use it fail. The files stay on the NAS. |
| `module.stop.signIn`     | Its name and password are removed with it.                                                                                                                 |
| `module.stop.cancel`     | Cancel                                                                                                                                                     |
| `module.stop.confirm`    | Stop offering                                                                                                                                              |
| `module.stopped`         | {{folder}} will stop being offered when you apply the changes.                                                                                             |
| `module.action.change`   | Change…                                                                                                                                                    |
| `module.action.stop`     | Stop offering…                                                                                                                                             |

---

## 11. Windows and Mac sharing: the rest

### 11.1 What is added

- On **`/services/smb`** (the shares slice's section 5), a card after the switch card: `h2`
  "Workgroup" (11.2). The footer line becomes "Home folders, protocol versions and other options are in
  the classic interface."
- On a folder's **share form** (the shares slice's 4.3), after "Read only for everyone": the recycle
  bin (11.3). Its facts (4.2 there) gain "Recycle bin" and, when it is on, **"Empty the recycle
  bin…"** (11.4).
- The share form's and this section's writes read with `SMB.getShare` (0.11).

### 11.2 Workgroup

`text-sm`: `services.term.workgroup` (0.1). A `TextField` **"Workgroup"** with the stored value, and
**"Save"** (neutral, to the band). Validation on blur and Save: OMV's NetBIOS-name rule (0.10), with
"Use 1 to 15 letters, digits, spaces or ! # $ % & ' ( ) - . @ ^ _ { } ~." Hint: "Use the same
workgroup as your Windows computers. Changing it does not stop shared folders working; some
computers may take a while to list the NAS under the new one." **[verify]** on a Windows client.
On save: re-read `getSettings`, `SMB.setSettings` (0.11), toast "The workgroup is saved. Apply the
changes to use it."

### 11.3 The recycle bin on a share

Read from source (the Samba share template, the recycle-bin script): files deleted **from a Windows or
Mac computer through this share** are moved into a hidden folder `.recycle` inside the shared folder,
one folder per person, keeping their folders and earlier versions; files deleted any other way (over
NFS, by a copy job, on the NAS) are not. A daily task deletes files that have been in it longer than
the share's days (0 keeps them until emptied).

The form gains:

1. **"Keep deleted files in a recycle bin"** (`CheckboxField`, default off). Hint: "Files deleted from
   Windows and Mac computers go to a hidden folder .recycle inside {{folder}} instead, so they can be
   got back from there. Files deleted over NFS, by copy jobs or on the NAS are deleted at once."
2. When ticked: **"Delete files from it after"** (`NumberField`, days, 0 to 3650, default **30** for
   a share that had it off; the stored value otherwise) with "days". Hint: "0 keeps them until you
   empty the recycle bin. Files in it still use space in {{folder}}."
3. Unticking a stored "on": the neutral `InlineAlert` "Files already in the recycle bin stay in the
   hidden folder .recycle inside {{folder}}, using space. Empty it first if you want that space back:
   once the recycle bin is off, this page cannot empty it."

The stored size limit (`recyclemaxsize`) is kept; a new recycle bin gets 0 (no limit). On save the
share's other options are kept (0.11).

### 11.4 Empty the recycle bin

Read from source: `SMB.emptyRecycleBin {uuid}` takes **the SMB share's** `uuid`, runs as a background
task, and **deletes everything** in the share's `.recycle` folder, for every person, whatever its age;
it refuses while `samba` is pending; its script exists only when Windows and Mac sharing is on and the
share's recycle bin is on and applied.

"Empty the recycle bin…" (neutral) is unavailable, with the reason, when `samba` is pending ("Apply the
pending changes first."), Windows and Mac sharing is off ("Windows and Mac sharing is off, so the NAS
cannot empty it now."), the recycle bin is not applied yet, or an emptying of it runs in this session.

The confirmation (destructive, UI-8 `data`; type to confirm, since the files cannot be got back):

1. Title: "Empty the recycle bin of {{folder}}?"
2. "Every file in it is deleted for good, for every person, however recently it was deleted. This page
   cannot see how many files that is."
3. `TypeToConfirmField` "Type {{folder}} to confirm".
4. "Cancel" (focused); **"Empty recycle bin"** (destructive), unavailable until the name matches. Enter
   does not confirm.

Then the task, as 7.3: title "Emptying the recycle bin of {{folder}}", output on the terminal pair
(the list of what is removed), Stop ("Stop emptying…": "Files already deleted stay deleted.").
Result: "The recycle bin of {{folder}} is empty." When the output lists nothing removed (no "removed"
line; an empty bin prints only the script's first line, observed, 22): "Nothing was deleted. The
recycle bin was empty, or the NAS was emptying it already." **[verify]** both cases.

### 11.5 Copy

| Key                                     | English                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smb.workgroup.title`                   | Workgroup                                                                                                                                                                                                                 |
| `services.term.workgroup`               | The name Windows computers use to group computers on a network. Most networks use WORKGROUP.                                                                                                                              |
| `smb.workgroup.field`                   | Workgroup                                                                                                                                                                                                                 |
| `smb.workgroup.hint`                    | Use the same workgroup as your Windows computers. Changing it does not stop shared folders working; some computers may take a while to list the NAS under the new one.                                                    |
| `smb.workgroup.err`                     | Use 1 to 15 letters, digits, spaces or ! # $ % & ' ( ) - . @ ^ _ { } ~.                                                                                                                                                   |
| `smb.workgroup.save`                    | Save                                                                                                                                                                                                                      |
| `smb.workgroup.saved`                   | The workgroup is saved. Apply the changes to use it.                                                                                                                                                                      |
| `smb.footerLine`                        | Home folders, protocol versions and other options are in the classic interface.                                                                                                                                           |
| `folderSmb.fact.recycle`                | Recycle bin                                                                                                                                                                                                               |
| `folderSmb.recycle.off`                 | Off                                                                                                                                                                                                                       |
| `folderSmb.recycle.days_one` / `_other` | On: files are kept {{count}} day / On: files are kept {{count}} days                                                                                                                                                      |
| `folderSmb.recycle.forever`             | On: files are kept until it is emptied                                                                                                                                                                                    |
| `folderSmb.form.recycle`                | Keep deleted files in a recycle bin                                                                                                                                                                                       |
| `folderSmb.form.recycleHint`            | Files deleted from Windows and Mac computers go to a hidden folder .recycle inside <folder></folder> instead, so they can be got back from there. Files deleted over NFS, by copy jobs or on the NAS are deleted at once. |
| `folderSmb.form.recycleDays`            | Delete files from it after                                                                                                                                                                                                |
| `folderSmb.form.recycleDaysUnit`        | days                                                                                                                                                                                                                      |
| `folderSmb.form.recycleDaysHint`        | 0 keeps them until you empty the recycle bin. Files in it still use space in <folder></folder>.                                                                                                                           |
| `folderSmb.form.recycleOffWarn`         | Files already in the recycle bin stay in the hidden folder .recycle inside <folder></folder>, using space. Empty it first if you want that space back: once the recycle bin is off, this page cannot empty it.            |
| `folderSmb.form.recycleDaysErr`         | Use a number of days from 0 to 3650.                                                                                                                                                                                      |
| `folderSmb.empty`                       | Empty the recycle bin…                                                                                                                                                                                                    |
| `folderSmb.empty.pending`               | Apply the pending changes first.                                                                                                                                                                                          |
| `folderSmb.empty.smbOff`                | Windows and Mac sharing is off, so the NAS cannot empty it now.                                                                                                                                                           |
| `folderSmb.empty.notApplied`            | The recycle bin is not applied yet.                                                                                                                                                                                       |
| `folderSmb.empty.running`               | It is being emptied now.                                                                                                                                                                                                  |
| `folderSmb.empty.title`                 | Empty the recycle bin of {{folder}}?                                                                                                                                                                                      |
| `folderSmb.empty.body`                  | Every file in it is deleted for good, for every person, however recently it was deleted. This page cannot see how many files that is.                                                                                     |
| `folderSmb.empty.type`                  | Type {{folder}} to confirm                                                                                                                                                                                                |
| `folderSmb.empty.cancel`                | Cancel                                                                                                                                                                                                                    |
| `folderSmb.empty.confirm`               | Empty recycle bin                                                                                                                                                                                                         |
| `folderSmb.empty.task`                  | Emptying the recycle bin of {{folder}}                                                                                                                                                                                    |
| `folderSmb.empty.stop`                  | Stop emptying…                                                                                                                                                                                                            |
| `folderSmb.empty.stopBody`              | Files already deleted stay deleted.                                                                                                                                                                                       |
| `folderSmb.empty.stopConfirm`           | Stop emptying                                                                                                                                                                                                             |
| `folderSmb.empty.done`                  | The recycle bin of {{folder}} is empty.                                                                                                                                                                                   |
| `folderSmb.empty.nothing`               | Nothing was deleted. The recycle bin was empty, or the NAS was emptying it already.                                                                                                                                       |
| `folderSmb.empty.failed`                | The recycle bin of {{folder}} could not be emptied.                                                                                                                                                                       |

---

## 12. How services fit the other pages

### 12.1 Shared folders

- **A folder's page** gains the NFS section (section 2), the "Keep a copy of this folder…" line after its
  Used by section, shown always, which opens section 5 with the source chosen; and Used by's named
  entries and the delete blockers of 2.7. It reads `NFS.getShareList`, `Rsyncd.getModuleList` and `Rsync.getList` (whole
  lists) with its other reads. Any of them failing makes Used by show its retry form, and the delete
  waits for it, as now.
- **The Shared folders list**: the Sharing column gains "Linux and Unix (NFS)" beside "Windows and Mac"
  for a folder with an NFS entry (from `NFS.getShareList`, read with the table). A failed read leaves
  that part "Not known", as the shares slice's 19 did for SMB.

### 12.2 Dashboard

Unchanged in what it reads. The Services card's NFS and Rsync server rows become router links to
`/services/nfs` and `/services/rsync/server`; the attention row "on, but not running" for `nfs` and
`rsyncd` links there instead of the classic interface (the monitoring design's
`dashboard.attention.serviceLink.nfs` and `.rsyncd` become "Open Linux and Unix sharing" and "Open the
rsync server"). No row for copy jobs: this interface cannot read whether a job's last run worked
(section 19, D14).

### 12.3 Diagnostics

The NFS service details page (`/diagnostics/services/nfs`) gains a router link "Linux and Unix sharing
settings" → `/services/nfs`; its classic link goes. The System logs page is unchanged; the copy jobs
page links to it (3.2).

### 12.4 Services > SSH

**Not changed.** Copy jobs over SSH sign in to _another_ computer with the NAS's SSH keys (System >
Certificates), not through this NAS's SSH server. The rsync server tab links to the SSH page for
copying over SSH _to_ this NAS (9.2).

### 12.5 Not changed in this slice

The storage pages, the users pages, the band and the job runner's rules, the sign-in page.

---

## 13. A normal user, navigation and routes

### 13.1 A normal user

Nothing new. Every method here is administrator-only. A normal user who types one of these addresses
gets the "only administrators" page, and nothing is called first (UI-4).

### 13.2 Navigation and routes

| Route                       | Page                 | Menu                                       | Notes                                                                                                                                |
| --------------------------- | -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/services/nfs`             | 1                    | Services > NFS (exists; gains its route)   | The menu keeps OMV's "NFS"; the page title says what it does                                                                         |
| `/services/rsync`           | 3                    | Services > Rsync (exists; gains its route) | The Copy jobs tab                                                                                                                    |
| `/services/rsync/server`    | 9                    | none (Rsync current)                       | The Rsync server tab                                                                                                                 |
| `/services/rsync/jobs/add`  | 5                    | none (Rsync current)                       | Opens the flow; no step runs on load (R9). A source chosen from a folder's page is handed over in the session store, not the address |
| `/services/rsync/jobs/$job` | 4                    | none (Rsync current)                       | `$job` a UUID, validated; nothing in it names a call                                                                                 |
| `/services/smb`             | the shares slice's 5 | exists                                     | Gains the workgroup card                                                                                                             |

The static `add` route wins over `$job`; a UUID never reads `add`. Each item's classic link moves to
its page's footer, as every built page's does.

---

## 14. Backend methods

### 14.0 Methods that need the owner's clearance

The 19 methods cleared on 2026-11-23 cover NFS, the rsync server, copy jobs and the rest of SMB. One
more read is needed for remote copy jobs over SSH. It is administrator-only (read from source).

| Method                                           | Why it is needed                                                                                                                                                                                                                                                                                                                                | What is lost without it                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`CertificateMgmt.getSshList`** (paging fields) | Choosing which of the NAS's SSH keys a remote job signs in with (`sshcertificateref`), naming the key on a job's page, and showing its public half so the reader can add it to the other computer (5.3, 4.2). Read-only. Each row is `uuid`, `comment`, `publickey` and `_used`; OMV removes the private key before replying (read from source) | Remote jobs **over SSH** cannot be added or have their key changed here: "Over SSH" is unavailable with its reason (5.3). Existing SSH jobs are shown with "The SSH key set in the classic interface" and can still be run, changed in their schedule, email and note, and deleted. Jobs through another computer's rsync server are unaffected |

**Not asked for, said plainly:**

- `CertificateMgmt.createSsh` (make a key) and `copySshId` (put a key on another computer, using that
  computer's password): Flow C's remote branch. The second sends another computer's password through
  the NAS. Both stay with the certificates pages (System) for a later slice; the job form links the
  classic page (5.3). Recommended: not now (section 20, P9).
- `Cron.*`: copy jobs have their own schedule fields and their own cron file (read from source); no
  scheduled-task read is needed.
- `UserMgmt.enumerateAllUsers` / `enumerateAllGroups`: only to choose an rsync server folder's account
  and group, which keep the classic defaults here (0.11).
- `FolderBrowser.get`: another computer's folder is typed; a shared folder is chosen whole.
- `Rsync.getCandidates`: it does not exist (read from source: `Rsync` has `getList`, `get`, `set`,
  `delete`, `execute` only).

### 14.1 The facts read from source, per method

Every method checks the administrator role. OMV ignores parameters its RPC datamodel does not name, and
booleans and integers must be real JSON booleans and integers (read from source). "Marks pending" is
through the engine modules' listeners, **[verify]** each by `dirtyModules`.

| Method                                                                                               | Parameters (from the datamodel)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Marks pending                                                                                                                                                   | Task    | Quirks read from source                                                                                                                                                                                                                                                                                                                                                          | Contract notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NFS.getSettings`                                                                                    | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nothing                                                                                                                                                         | no      | `enable`, `versions` as a list (stored as a comma string, default `3,4,4.1,4.2`), **and every NFS share** under `shares`                                                                                                                                                                                                                                                         | **New, cleared.** Read-only. The reply schema declares `enable` and `versions`; `shares` is left undeclared and unread                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `NFS.setSettings`                                                                                    | `enable` (boolean), `versions` (list of `2`, `3`, `4`, `4.1`, `4.2`); both required; an empty list passes                                                                                                                                                                                                                                                                                                                                                                            | `nfs`, `avahi`                                                                                                                                                  | no      | No thread or NFSv4 tuning fields (the NAS sets threads from its processor count). Replies with `versions` as the stored comma string (observed, 22)                                                                                                                                                                                                                              | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: service`. Stricter: `versions` at least one item                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `NFS.getShareList`                                                                                   | paging fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | nothing                                                                                                                                                         | no      | Each share plus `sharedfoldername`. Fails as a whole when a share's shared folder is gone                                                                                                                                                                                                                                                                                        | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NFS.getShare`                                                                                       | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                         | no      | The stored share, no computed field                                                                                                                                                                                                                                                                                                                                              | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NFS.setShare`                                                                                       | `uuid`, `sharedfolderref`, `mntentref`, `client`, `options`, `extraoptions`, `comment`, all required strings; `client` and `options` have **no pattern**; `extraoptions` must be `key` or `key=value` items separated by commas (the stored model's pattern), so an empty value is refused **[verify]**                                                                                                                                                                              | New: `nfs`, `avahi`, and `fstab` for the folder's place under `/export` (made through `FsTab.set` when it is the folder's first entry, inferred). Change: `nfs` | no      | New only: refuses a folder whose path on the disk has a space; ignores the `mntentref` sent and uses (or makes) the bind mount at `/export/{{name}}`. No uniqueness check: several entries per folder, one line per folder in the exports file, one `client(options)` item per entry. An empty `client` is written as `*`. An NFSv4 root is added per distinct client, read only | **New, cleared.** `x-omv-dirty`; Not marked destructive: it opens a folder rather than closing one, and docs/04 has no value for that; the interface's own warnings apply (0.4). Stricter: `client` one of 0.4's three forms; `options` `ro` or `rw`; `extraoptions` OMV's pattern; `comment` at most 255                                                                                                                                                                                                                                                |
| `NFS.deleteShare`                                                                                    | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `nfs`, `avahi`; `fstab` when no other entry uses the folder's place (OMV removes that bind mount's record, inferred)                                            | no      | Returns the deleted share as an object, which reaches the client as an empty list (observed, 22)                                                                                                                                                                                                                                                                                 | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: service`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Rsyncd.getSettings`                                                                                 | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | nothing                                                                                                                                                         | no      | `enable`, `port` (stored model default 21; the classic form's 873), `extraoptions`; modules left out                                                                                                                                                                                                                                                                             | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Rsyncd.setSettings`                                                                                 | `enable`, `port` (1 to 65535), `extraoptions`, all required                                                                                                                                                                                                                                                                                                                                                                                                                          | `rsyncd` (inferred name), `avahi`                                                                                                                               | no      |                                                                                                                                                                                                                                                                                                                                                                                  | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: service`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Rsyncd.getModuleList`                                                                               | paging fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | nothing                                                                                                                                                         | no      | Each module with `users` as a list of `{name, password}` (**the password included**) and `sharedfoldername`                                                                                                                                                                                                                                                                      | **New, cleared.** Read-only. `x-omv-omit: [data[].users[].password]` and, with P4, `x-omv-presence`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Rsyncd.getModule`                                                                                   | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                         | no      | As a row, without `sharedfoldername`; passwords included                                                                                                                                                                                                                                                                                                                         | **New, cleared.** `x-omv-omit: [users[].password]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Rsyncd.setModule`                                                                                   | 17 required: `uuid`, `enable`, `sharedfolderref`, `name` (no pattern), `comment`, `uid`, `gid`, `readonly`, `writeonly`, `maxconnections` (integer ≥ 0), `list`, `hostsallow`, `hostsdeny`, `authusers`, `usechroot`, `users` (`{name, password}` each, password one line), `extraoptions`                                                                                                                                                                                           | `rsyncd`                                                                                                                                                        | no      | New only: `name` unique. Passwords stored as received; only enabled modules with `authusers` are written with their sign-ins. Replies in the stored shape (`users.user[]`), passwords included                                                                                                                                                                                   | **New, cleared.** `x-omv-dirty`; Not marked destructive, as `NFS.setShare` (0.4, 10.2). `x-omv-omit: [users.user[].password]`. Stricter: `name` 10.2's pattern; `users` at most one item, `name` 10.2's pattern; `hostsallow` 0.4's forms or empty; `uid` `nobody` and `gid` `users` for a new module (existing values accepted as stored)                                                                                                                                                                                                               |
| `Rsyncd.deleteModule`                                                                                | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `rsyncd`                                                                                                                                                        | no      |                                                                                                                                                                                                                                                                                                                                                                                  | **New, cleared.** `x-omv-dirty`; `x-omv-destructive: service`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Rsync.getList`                                                                                      | paging fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | nothing                                                                                                                                                         | no      | Stored jobs (schedule fields as comma strings) plus `srcname` and `destname` (a folder's name or the other computer's address); **the password included**. Fails as a whole when a job's shared folder is gone                                                                                                                                                                   | **New, cleared.** Read-only. `x-omv-omit: [data[].password]` (and presence)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Rsync.get`                                                                                          | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                         | no      | The stored job with `src` and `dest`, plus only the flattened fields that apply (`srcsharedfolderref`, `srcuri`, `destsharedfolderref`, `desturi`), schedule fields as lists; **the password included**                                                                                                                                                                          | **New, cleared.** `x-omv-omit: [password]` (and presence)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Rsync.set`                                                                                          | **36, all required**: `uuid`, `enable`, `sendemail`, `comment`, `type` (`local`, `remote`), `mode` (`push`, `pull`), `srcsharedfolderref`, `srcuri`, `destsharedfolderref`, `desturi`, `minute`, `hour`, `dayofmonth`, `month`, `dayofweek` (lists of strings), `everynminute`, `everynhour`, `everyndayofmonth`, 13 `option…` booleans, `extraoptions`, `authentication` (`password`, `pubkey`), `password` (one line), `sshcertificateref` (UUID or empty), `sshport` (1 to 65535) | `rsync`                                                                                                                                                         | no      | Keeps only the fields that apply to the type and mode, blanking the others. Checks nothing else: not that a side is set, that the two differ, that an address is well formed or that the key exists. The schedule item patterns are loose. Replies with the stored job, password included                                                                                        | **New, cleared.** `x-omv-dirty`; Not marked destructive: saving runs nothing; the interface types the destination's name when a save turns deletion on (5.7). `x-omv-omit: [password]`. Stricter: the four side fields by `type` and `mode` (the applying ones required non-empty, the others empty); `srcuri` and `desturi` 5.3's two forms; schedule items anchored (`*`, `0`–`59`, `0`–`23`, `1`–`31`, `1`–`12`, `1`–`7`); `extraoptions` only as read (the request schema accepts any string, the interface never changes it); `comment` at most 200 |
| `Rsync.delete`                                                                                       | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `rsync`                                                                                                                                                         | no      | Touches no file                                                                                                                                                                                                                                                                                                                                                                  | **New, cleared.** `x-omv-dirty`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Rsync.execute`                                                                                      | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                         | **yes** | Refuses while `rsync` is pending. Does not check that the job is enabled. Runs the job's script, written at apply, which checks the mounts and a lock, then rsync with `--verbose` (and `--quiet`, `--dry-run`, `--delete` and the rest from the job); the task's output is the script's and rsync's output. `Exec.stop` ends it; the script cleans up                           | **New, cleared.** `x-omv-task`; `x-omv-destructive: data`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SMB.getShare`                                                                                       | `uuid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing                                                                                                                                                         | no      | The stored share, without `sharedfoldername`                                                                                                                                                                                                                                                                                                                                     | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SMB.emptyRecycleBin`                                                                                | `uuid` (**the SMB share's**, not the shared folder's)                                                                                                                                                                                                                                                                                                                                                                                                                                | nothing                                                                                                                                                         | **yes** | Refuses while `samba` is pending. Runs the share's recycle-bin script with "now": deletes everything under `.recycle` in the shared folder, then empty folders; exits quietly if another emptying holds its lock or there is no `.recycle`. The script exists only with SMB on and the share's recycle bin on, after apply                                                       | **New, cleared.** `x-omv-task`; `x-omv-destructive: data`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SMB.getSettings`, `setSettings`, `getShareList`, `setShare`, `deleteShare`, `NFS.getStats`, `SSH.*` | as in the contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                 |         | `setShare`'s recycle fields: `recyclebin`, `recyclemaxsize`, `recyclemaxage` (integers ≥ 0)                                                                                                                                                                                                                                                                                      | Exist. `setSettings` is used for the workgroup; `setShare` for the recycle bin                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CertificateMgmt.getSshList`                                                                         | paging fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | nothing                                                                                                                                                         | no      | `uuid`, `comment`, `publickey`, `_used`; never the private key                                                                                                                                                                                                                                                                                                                   | **To clear** (14.0). Read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 14.2 Every request in this slice

| Method                                                                                                                                                                                                  | Where                                                   | When                                 | Kind       | Contract status     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ | ---------- | ------------------- |
| `NFS.getSettings`                                                                                                                                                                                       | NFS page, folder page                                   | open, before each write              | foreground | New, cleared        |
| `NFS.setSettings`                                                                                                                                                                                       | NFS page, the entry form                                | after the reader's action            | foreground | New, cleared        |
| `NFS.getShareList`                                                                                                                                                                                      | NFS page, folder page, shared-folder list, delete check | open, Refresh, focus, before a write | foreground | New, cleared        |
| `NFS.getShare`, `setShare`, `deleteShare`                                                                                                                                                               | the entry form, stop                                    | after the reader's action            | foreground | New, cleared        |
| `Rsyncd.getSettings`, `setSettings`                                                                                                                                                                     | rsync server tab                                        | open; the switch                     | foreground | New, cleared        |
| `Rsyncd.getModuleList`, `getModule`, `setModule`, `deleteModule`                                                                                                                                        | rsync server tab, folder page, delete check             | open; the dialog                     | foreground | New, cleared        |
| `Rsync.getList`                                                                                                                                                                                         | copy jobs, folder page, delete check                    | open, Refresh, focus                 | foreground | New, cleared        |
| `Rsync.get`, `set`, `delete`                                                                                                                                                                            | job page, add and change flows                          | open; after the reader's action      | foreground | New, cleared        |
| `Rsync.execute`                                                                                                                                                                                         | Run now, the trial step                                 | after a confirmation                 | task       | New, cleared        |
| `SMB.getShare`                                                                                                                                                                                          | share form, recycle bin                                 | before each write                    | foreground | New, cleared        |
| `SMB.emptyRecycleBin`                                                                                                                                                                                   | Empty the recycle bin                                   | after the typed confirmation         | task       | New, cleared        |
| `SMB.getSettings`, `setSettings`                                                                                                                                                                        | SMB page (workgroup)                                    | open; Save                           | foreground | Exist               |
| `CertificateMgmt.getSshList`                                                                                                                                                                            | add and change flows, job page                          | open (remote over SSH only)          | foreground | **To clear** (14.0) |
| `ShareMgmt.getList`, `Services.getStatus`, `System.getInformation`, `System.getTimeSettings`, `EmailNotification.get`, `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.getOutput`, `Exec.stop` | as named                                                | as now                               |            | Exist               |

Paging reads send all five fields with `limit: null` for a whole list (the monitoring domain's
observation). Every captured example is scrubbed before commit (AGENTS.md rule 2): host names become
`NAS_HOST` and `backup.example.org`, addresses come from 192.0.2.0/24 and 2001:db8::/32, accounts
become documentation names, every `password` becomes `EXAMPLE-PASSWORD` (so the transport's removal is
proved on the mock), public keys are replaced by a documentation key, and UUIDs are replaced.

### 14.3 Not used, and kept out of the contract

`CertificateMgmt.createSsh`, `copySshId`, `getSsh`, `setSsh`, `deleteSsh`; `Cron.*`; the SMB settings'
fields this slice does not change (they round-trip, 0.11); the home-folder SMB settings.

---

## 15. Components

### 15.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer), contributed back to the
library.

| Component                                                                      | Why                                                                                                                                                                                                                               | States to cover                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ClientField`** (new)                                                        | 0.4's three choices with their fields, checks, the wide-network and any-computer warnings, the "set in the classic interface" value, and the rsync server's extra first choice. Used by NFS entries and rsync server folders      | each choice; valid and invalid address, network, name; a wide IPv4 and IPv6 network; /0; any computer with its warning; a stored classic value; required and optional forms; disabled with a reason; 320 px (fields under their radio); 200% zoom |
| **`ScheduleField`** (new, from the disks slice's 6.4 form, now in the library) | Only when started / on a schedule; hourly, daily, weekly, monthly, custom with minutes; the NAS-clock line; stored values that open on Custom; "every N" kept. The disks slice's self-test form moves onto it with minutes hidden | every choice; custom with every field; a stored multi-value; every-N; the NAS-time line; errors; long locale weekday names; keyboard through the selects                                                                                          |
| **`DirectionSummary`** (new)                                                   | 0.6's sentence with the arrow and the words "from" and "to", two sides each a folder or another computer, in one line or wrapped; used on the job page, the summary, every confirmation                                           | local, push, pull; long names; right-to-left names (the arrow follows the sentence's direction, the words carry the meaning); 320 px                                                                                                              |
| `TaskLog` (extend)                                                             | A line cap with the "newest lines" notice and a download of everything received; a Stop control with its confirmation                                                                                                             | under and over the cap; stopped; failed with no output                                                                                                                                                                                            |
| `UsedByPanel` (extend)                                                         | Named entries with links for an rsync server folder and copy jobs, and the add-on entry                                                                                                                                           | each kind; many entries                                                                                                                                                                                                                           |
| `JobSummary` (reuse; the warning-shape item exists)                            | The deletion and no-encryption items                                                                                                                                                                                              |                                                                                                                                                                                                                                                   |

### 15.2 Reused as they are

`TableToolbar`, `Select`, `RadioGroupField`, `CheckboxField`, `SegmentedChoice`, `TextField`,
`NumberField`, `SecretField`, `NewPasswordFields`, `FactList`, `Identifier`, `CopyButton`,
`ConfirmDialog`, `Dialog`, `TypeToConfirmField`, `JobRunner`, `PreflightNotice`, `JobResult`,
`InlineAlert` (warning-shape neutral), `Disclosure`, `EmptyState`, `StatusPill`, `ExternalLink`,
`Breadcrumbs`, `PageTabs`, `Menu`, `Card`.

### 15.3 In the app

- `services/nfsModel.ts`: 0.3's states, entries per folder, 0.4's client parsing and printing, 0.5's
  option reading (the root-equivalent option, other options), 0.11's writes, the address builder.
- `services/clientRules.ts`: 0.4's checks, shared with the rsync server and the contract's patterns.
- `services/jobModel.ts`: 0.6's direction, sides, deletion (with extra options), trial-only, the
  stored address forms and their parsing, 0.11's write with every field, the "what changed" rule of
  section 6.
- `services/jobSchedule.ts`: 0.7, extending `disks/schedule.ts`, which moves into it.
- `services/trialOutput.ts`: counting and listing the trial's "deleting" lines and copies, with tests
  on captured output (17.2).
- `services/addJobFlow.ts`: 5.6 and 5.7, in the session store as Flow A's.
- `services/rsyncdModel.ts`: modules, sign-ins, 0.10's rules, 0.11's write.
- `sharedFolders/smbModel.ts` (extend): the recycle bin, `getShare` for writes, the workgroup.
- Pages: `NfsPage`, `RsyncPage` (tabs), `CopyJobsTab`, `CopyJobPage`, `AddCopyJobPage`,
  `RsyncServerTab`; `SharedFolderPage`, `SmbPage` and `SharedFoldersTable` changed.

---

## 16. Mock scenarios to add

Written by hand from the captured shapes, remembering what the pages do (entries, modules, jobs,
settings, apply, undo, runs), so every journey can be walked on `pnpm dev:mock`:

| Scenario             | What it shows                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `servicesNone`       | NFS and the rsync server off, no entries, no modules, no jobs, no SSH keys                                                                                                                                         |
| `servicesSome`       | NFS on with three entries (one computer, one network, any computer); the rsync server on with a module that asks for a sign-in and one that does not; three jobs (local, push over SSH, pull from an rsync server) |
| `servicesRoot`       | An NFS entry with `no_root_squash` and other classic options                                                                                                                                                       |
| `servicesDown`       | NFS and the rsync server on but not running                                                                                                                                                                        |
| `jobsDeleting`       | A job that deletes, one that deletes through extra options, one with `--remove-source-files`, one trial-only                                                                                                       |
| `jobsCustomSchedule` | Jobs with multi-value fields, every N hours, every N minutes, weekday 7, only when started                                                                                                                         |
| `jobsRun`            | Run now succeeding with 30,000 lines, failing with "Host key verification failed", failing at once with no output, stopped half-way                                                                                |
| `jobsTrial`          | The add flow's trial listing 12 deletions; one listing none; a trial that fails                                                                                                                                    |
| `jobsPending`        | `rsync` pending (Run now unavailable)                                                                                                                                                                              |
| `jobsMany`           | 1,000 copy jobs, and 400 NFS entries over 200 folders                                                                                                                                                              |
| `jobsBroken`         | `Rsync.getList` failing as when a job's folder is gone                                                                                                                                                             |
| `modulesMany`        | A module with three sign-ins set in the classic interface                                                                                                                                                          |
| `recycleBin`         | A share with a 30-day bin, one kept until emptied; emptying with output, with none, failing while `samba` is pending                                                                                               |
| `servicesNoSshList`  | `getSshList` not available (P1 not cleared)                                                                                                                                                                        |
| `servicesHostile`    | Notes, module names, hosts and folder names of 200 characters, right-to-left, and text that looks like markup; output lines with direction controls and ANSI codes                                                 |

---

## 17. Checks before calling it done

### 17.1 On the mock, and in every build

- Every page in both themes, at 1280 and 320 px and at 200% zoom; the jobs table scrolls only in its
  own region; the direction sentence wraps, never truncates.
- A keyboard-only pass of each journey: turn NFS on, let in a computer, a network, any computer, stop;
  offer a folder with and without a sign-in, stop offering; add a job that deletes through its trial
  and typed turn-on; change its schedule; run it, stop it; delete it; turn on a recycle bin and empty
  it.
- Screen reader: loading, saved, the direction sentence, every warning as part of its field's
  description, the step list, the trial's counts, the task's result; each dialog's description read
  with its title.
- Greyscale and the deficiency emulations: deletion, any computer and no sign-in carry a shape and
  words, never colour alone.
- The built output: no inline script or style, no third-party origin, no task handle in the DOM, no
  password in any rendered or cached state (a test reads the query cache after each secret-bearing
  read on the mock, whose examples carry `EXAMPLE-PASSWORD`) (UI-1, UI-5, UI-6, UI-7); the routes make
  no call on load beyond reads (UI-4).
- `clientRules`, `jobModel`, `jobSchedule` and `trialOutput` tests for every rule of 0.4, 0.6 and 0.7.

### 17.2 On the test VM: facts to verify

The VM (OMV 8.6.1) with a snapshot taken first; the data file system on `sda1`, a scratch disk for a
second file system, a Linux client for NFS and rsync, and a second machine (or the client) as the
other computer for remote jobs. Everything is put back afterwards: no extra entry, module, job, key or
shared folder, every service as it was, nothing pending. Read-only captures first.

1. **Pending modules** by `dirtyModules` after each write alone: NFS settings, an entry new (first and
   second for a folder), changed, deleted (last and not last); rsync server settings, a module new,
   changed, deleted; a job new, changed, deleted; the workgroup; a share's recycle bin. In particular
   `avahi` or `zeroconf`, `fstab` for NFS, and the rsync server module's name.
2. **NFS shapes**: `getSettings` with its `shares`; `getShare`; `deleteShare`'s reply; `getShareList`
   when a share's folder is gone; whether an empty `extraoptions` is refused.
3. **NFS access**, from the Linux client: a single address, a network, `*`; read only enforced; the
   mount address for NFSv3 and NFSv4 (which of 0.2's forms works); the client's administrator
   squashed; a client account whose number matches a person with access to a 770 folder, and one that
   does not; a Mac client with and without `insecure`; a computer name that does not resolve when NFS
   starts.
4. **NFS names**: a shared folder whose name has a space, and one with letters outside the Latin
   alphabet: what the exports file and the client see.
5. **Copy job shapes**: `getList` and `get` with `password` present (and removed by the transport on
   the mock with the captured shape), `get`'s flattened fields per type and mode, `set`'s reply.
6. **What a job does**: a local job copies contents into contents (the source's trailing `/`); a pull
   job with this interface's trailing `/` does the same; a job pointed the other way replaces newer
   files; deletion removes destination-only files; a trial with `--verbose` and deletion prints
   "deleting …" lines in the form `trialOutput` expects, and nothing changes.
7. **Running**: `execute` refused while `rsync` is pending (its message); a job with `enable` false
   runs; a second start while one runs (what `Exec.getOutput` reports); `Exec.stop` half-way (the
   state, the lock removed, the next run works); 20,000 files of output in the browser (time, memory);
   a source on an unmounted file system (the message).
8. **Remote jobs**: over SSH with a key, to a computer the NAS has not connected to before (the
   message), and after it is known; through an rsync server with a right and a wrong password (the
   output must not contain the password); a path with a space (whether it fails, for 5.3's rule).
9. **Schedules**: the cron line OMV writes for each 0.7 choice, including every N hours and weekday 7.
10. **The rsync server**: `getModuleList`'s and `getModule`'s `users[].password`; `setModule`'s reply;
    a fresh VM's port (873 or 21); from the client: a module without a sign-in, read only and read
    and write, on a 770 folder made here (files copied in, and readable by a person with access); a
    module with a sign-in, right and wrong password; `hostsallow` with one address and one network;
    whether the shared folder's access list has any effect on a module (read from source: none).
11. **The recycle bin**: files deleted over SMB land in `.recycle/{{person}}`; the daily task removes
    them after the days set; `getShare`'s shape; `emptyRecycleBin` refused while `samba` is pending
    (message), with SMB off or the bin off (message), its output, and with nothing in it; deleting
    with the bin off leaves `.recycle` as it was.
12. **The workgroup**: OMV's refusal message for a bad value; a Windows client after a change.
13. **`CertificateMgmt.getSshList`** (once cleared): its rows and `_used` for a key a job uses.

---

## 18. Adversarial pass

The main journeys walked twice more: adding a job that deletes and running it; sharing a folder over
NFS and offering it to the rsync server. Findings and what changed in this design:

### 18.1 Trying to break it

| Probe                                                                     | Finding                                                                                           | Change made                                                                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 jobs, 1, 1,000                                                          | 0 needs its own empty state; 1,000 unpaged would be a long table, though jobs are few in practice | 3.3's empty state; not paged, as OMV's own page; the table scrolls in its own region, and the `jobsMany` scenario checks it stays usable                     |
| Source and destination swapped                                            | Even without deletion, the newer files would be replaced by older ones                            | 0.6's replace line on the form and every confirmation; the trial before deletion; the direction sentence repeated with "from" and "to", never an arrow alone |
| A destination that holds other files, with deletion                       | The first run erases them                                                                         | Trial-only until a trial is seen; the trial counts the deletions; the typed destination name to turn it on                                                   |
| A job set in the classic interface with `--delete-after` in extra options | This interface's "Also deletes: No" would be a lie                                                | 0.6: options starting `--del` make the job a deleting one everywhere; `--remove-source-files` warned as deleting from the source                             |
| Same folder both sides; a folder inside the other                         | rsync would copy a folder into itself, and with deletion could loop over its own copies           | Refused (0.10)                                                                                                                                               |
| The destination is shared over SMB, so people put files there             | With deletion, their files vanish on the next run                                                 | 5.3's line under the destination                                                                                                                             |
| Changing a deleting job's destination                                     | The new destination would be deleted into with no trial                                           | Section 6: a changed side sends the job back to trial-only until it is tried and turned on again                                                             |
| A trial, then another administrator changes the job, then "Turn on"       | The tried job is not the one turned on                                                            | 5.7: the job is re-read and compared; a difference asks for a new trial                                                                                      |
| Run now while another job's change is pending                             | OMV refuses with a message about configuration                                                    | 0.9 and 7.1: unavailable with the reason in plain words                                                                                                      |
| Run now while the scheduled run is running                                | The second start ends at once with no message                                                     | 7.3's own sentence for an empty failure [verify] item 7                                                                                                      |
| Refresh or a second tab during the trial                                  | The flow's journal is in memory                                                                   | R8: the job is trial-only and the job page says what to do now; the task keeps running and is in the top bar                                                 |
| The session expires mid-form                                              | The typed password and choices are lost                                                           | Nothing is kept in storage (UI-6, UI-13); after sign-in the flow starts again; the job, if saved, is trial-only                                              |
| 30,000 lines of output                                                    | The browser slows; the page grows without bound                                                   | 10,000 lines on screen, everything in the download, the log for history (D10) [verify] item 7                                                                |
| Output containing markup, ANSI codes, direction controls                  | Must stay text and not reorder                                                                    | Text only (UI-2); ANSI stripped; direction controls made visible (0.2)                                                                                       |
| A note, module name or host of 200 characters, right-to-left, markup-like | Must stay text; must not break the sentence                                                       | Note at most 200; module and host patterns; `dir="auto"` and isolation; `servicesHostile`                                                                    |
| A remote password in the reply                                            | It would sit in the query cache and be readable by any code in the page                           | Removed by the transport before anything sees it (0.8); a test reads the cache                                                                               |
| A remote address typed with spaces or quotes                              | It would not work as a copy job address                                                           | 5.3's patterns refuse it in the browser and the contract                                                                                                     |
| NFS to `*` by mistake                                                     | Every computer that can reach the NAS gets the folder, with no password                           | "One computer" is chosen by default; "Any computer" is last, after a gap, with its warning                                                                   |
| NFS to `192.0.2.0/8`-like typing errors                                   | A network wider than intended                                                                     | The start-of-network check suggests the right one; the wide-network warning says how many addresses                                                          |
| `no_root_squash` from the classic interface                               | The other computer's administrator owns every file                                                | Shown and warned, never offered (0.5)                                                                                                                        |
| An rsync server folder without a sign-in                                  | Anyone on the network could read, and with read and write delete, the folder                      | A sign-in is ticked by default; without one, a computer or network is required; read only is the default                                                     |
| A module with three sign-ins                                              | Saving would need three passwords this page never had                                             | Read-only here, with "Change it there"; Stop offering still works (0.10)                                                                                     |
| Emptying the recycle bin by mistake                                       | Every file in it is gone                                                                          | Destructive confirmation with the folder's name typed                                                                                                        |
| Turning the recycle bin off with files in it                              | They stay hidden, using space, and this page could no longer empty them                           | 11.3's line before saving                                                                                                                                    |
| Pending changes from another administrator                                | They would ride the flow's apply                                                                  | R1 refuses to start; R10 lists anything new before applying                                                                                                  |
| A task failing at apply                                                   | R7 mix                                                                                            | The flow's R7 plan; the job is trial-only, so nothing deletes while it is sorted out                                                                         |

### 18.2 Without sight

- **Tab order**: every page in reading order. Found: on the add form the deletion warning appeared
  after Copy to, out of the reader's way; it is now part of the checkbox's description and a polite
  live region, so it is heard when the box is ticked and when it is reached again.
- **The direction**: an arrow alone means nothing to a screen reader. `DirectionSummary`'s accessible
  text is the sentence with "from" and "to"; the arrow is decorative (`aria-hidden`).
- **Focus**: never lost after a save (it stays on the button, or moves to the new entry's heading).
  Found: after "Stop letting them in" the entry is gone; focus moves to the section heading (2.5). After
  Run now, focus moves to the task's heading, not into the output.
- **Announcements**: loading, saved, the pending mark's text, each step's word, the trial's counts, the
  task's result (polite), every failure (assertive). Found: a running task's output would chatter;
  output lines are not a live region, only the state and the result are.
- **Colour alone**: none. Deletion, any computer, no sign-in and trial-only carry the warning shape and
  words; the service states use the fixed pills and words.
- **200% zoom and 320 px**: the client choice's fields move under their radio; the schedule's selects
  stack; the jobs table scrolls in its region; the dialogs reflow to one column.

---

## 19. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID  | Decision                                                                                                                                                           | Why                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| D1  | Routes follow the classic interface's paths (`/services/nfs`, `/services/rsync`, `/services/rsync/server`) _(recommended)_                                         | Existing users recognise them; the menu items gain their routes                                  |
| D2  | Page titles say what each does ("Linux and Unix sharing", "Rsync" with "Copy jobs" and "Rsync server" tabs); the menu keeps OMV's words _(recommended)_            | The shares slice's D7                                                                            |
| D3  | A job's page is addressed by its **UUID** _(recommended)_                                                                                                          | Notes are optional and free text                                                                 |
| D4  | A new job's schedule defaults to **every day at 03:00** _(recommended)_                                                                                            | A quiet hour; the disks slice's default hour                                                     |
| D5  | New jobs get **the classic form's defaults** for every option not asked, with quiet off _(recommended)_                                                            | The same copy as the classic interface makes; output that shows what happened                    |
| D6  | New NFS entries get the classic default other options `subtree_check,insecure` _(recommended)_                                                                     | The same behaviour as the classic interface; Mac clients work [verify]. The alternative is P11's |
| D7  | Another computer's folder is always written **with a trailing `/`** _(recommended)_                                                                                | Contents into contents, as local jobs already do; no surprise folder at the destination          |
| D8  | An rsync server folder is **offered under the shared folder's name** when it fits the rule _(recommended)_                                                         | One name for one folder everywhere                                                               |
| D9  | NFS addresses are shown in both forms, labelled _(recommended)_                                                                                                    | NFSv3 and NFSv4 clients use different paths [verify] item 3                                      |
| D10 | Task output keeps **10,000 lines on screen**, all received lines in the download _(recommended)_                                                                   | A large copy can print a line per file                                                           |
| D11 | Band words: `nfs` "Linux and Unix sharing (NFS)", `rsync` "Copy jobs (rsync)", `rsyncd` "Rsync server" _(recommended)_                                             | The same words as the pages                                                                      |
| D12 | The share form's read before writing moves to **`SMB.getShare`** _(recommended)_                                                                                   | Narrower, and it does not fail when another share's folder is gone                               |
| D13 | A new recycle bin keeps files **30 days** _(recommended)_                                                                                                          | 0 (the classic default) lets the bin fill the folder silently                                    |
| D14 | **No dashboard rows** for copy jobs _(recommended)_                                                                                                                | No read says whether a run worked; a row would claim a state it does not know                    |
| D15 | Catalogue: `services.term.*`, `folderNfs.*`, `jobs.*`, `job.*`, `addJob.*`, `runJob.*`, `rsyncd.*`, `module.*` as shared keys; `modules.*` changed _(recommended)_ | Later flows (Flow C on its own, the certificates pages) reuse them                               |
| D16 | Times are the **NAS's clock**, said when the browser's zone differs _(recommended)_                                                                                | A job runs on the NAS's time                                                                     |

---

## 20. For the owner to agree

The clearance question, the scope, and the destructive, access-opening and secret-handling points of
this slice. The design is built only once these are agreed. Each has a recommendation.

1. **P1, one more method.** `CertificateMgmt.getSshList`, to choose and show the NAS's SSH key for a
   remote job over SSH. **Recommended: clear it.** Without it, remote jobs over SSH cannot be added or
   have their key changed here (14.0).
2. **P2, the scope.** Built here: NFS on and off and per-folder entries; the rsync server on and off
   and its folders; copy jobs (list, page, add, change, trial, run, stop, delete), local and remote;
   the workgroup and a share's recycle bin with emptying; Used by naming every core user. Left to the
   classic interface: NFS versions and other options, the rsync server's port and advanced folder
   options, advanced rsync options, making and copying SSH keys, the other SMB settings and share
   options. **Recommended: as written.** (Scope)
3. **P3, the name.** "Copy jobs", with "rsync job" second, not "backup jobs": a job keeps one copy and
   no earlier versions. **Recommended: "Copy jobs".** The alternative is "Backup jobs", as the UX
   audit's Flow C says. (0.1, 0.6)
4. **P4, passwords.** The transport removes the rsync job password and every rsync server sign-in's
   password from every reply (`x-omv-omit`, with paths into lists inside rows); a new extension
   `x-omv-presence` lets the page say "Set"; any save that needs a password asks for it again.
   **Recommended: as written.** The alternative without the new extension: "A password may be set."
   (0.8)
5. **P5, the direction.** Copy from and Copy to, each a shared folder or another computer, one side
   at most remote; contents into contents; the same folder or one inside the other refused; the
   sentence with "from" and "to" on every surface. **Recommended: as written.** (0.6, 5.2)
6. **P6, deletion.** Off by default, its own checkbox, warned; a job that deletes is saved for trial
   runs only and off schedule until a trial run has been seen; turning it on asks for the
   destination's name typed; Run now for it is the destructive confirmation without typing; options
   that delete set in the classic interface are treated the same. **Recommended: as written.** The
   alternative is to leave deletion to the classic interface entirely. (0.6, 5.4, 5.7, 7.2)
7. **P7, trial runs.** "Save and try it" is the default for every new job, and required when it
   deletes; changing a job's sides, direction or deletion sends it back to a trial; each trial applies
   the changes twice (once to try, once to turn on). **Recommended: as written.** The alternative is a
   trial only for jobs that delete. (5.6, section 6)
8. **P8, running.** Run now through the task helper, with output, Stop (a plain confirmation that says
   what stays), copy and download; unavailable while any copy job change is pending; no "last run"
   state, only the log. **Recommended: as written.** (Section 7, 0.3)
9. **P9, remote jobs.** Over SSH with one of the NAS's existing keys (needs P1), and through another
   computer's rsync server with its password, warned as unencrypted. Making keys and copying them to
   another computer stay in the classic interface. **Recommended: as written.** The alternative is to
   leave remote jobs to the classic interface entirely. (5.3, 14.0)
10. **P10, who may connect over NFS.** One computer (chosen by default), one network (warned when
    wide), or any computer (last, never preselected, warned); no wildcards or free text; values set in
    the classic interface kept until replaced. **Recommended: as written.** (0.4)
11. **P11, NFS options.** Read only by default; new entries get the classic `subtree_check,insecure`;
    `no_root_squash` never offered and warned where set. **Recommended: as written.** The alternative
    is `subtree_check` alone for new entries (closer to NFS's own default, but some Mac clients and
    media players then cannot connect, [verify]). (0.5, D6)
12. **P12, NFS refusals.** No NFS entry for a folder whose name or folder on the disk has a space, or
    for a computer or network already let in. **Recommended: as written.** (0.10)
13. **P13, rsync server folders.** A name and password asked by default; without one, one computer or
    one network required; read only by default; one sign-in per folder here, more left to the classic
    interface. **Recommended: as written.** (0.4, 10.2)
14. **P14, the recycle bin.** On and off per share, with the days to keep (30 for a new bin); emptying
    is a destructive, typed confirmation and a task with output. **Recommended: as written.** (11.3,
    11.4)
15. **P15, the workgroup.** On the SMB page, OMV's own rule; the other SMB settings stay in the classic
    interface. **Recommended: as written.** (11.2)
16. **P16, pending changes.** Everything goes to the band except the copy-job flows, which refuse to
    start while anything is pending and apply their own changes. **Recommended: as written.** (0.9)
17. **P17, turning services off.** NFS and the rsync server: plain confirmations naming how many and
    which folders stop being reachable; to the band. Turning on needs no confirmation. **Recommended:
    as written.** (1.3, 9.3)
18. **P18, no way round a refusal.** A refused action offers no classic link that does the same
    without the check. Where the blocker is something this interface does not manage (an add-on, a
    module with several sign-ins), it says so. **Recommended: as written**, as for the earlier
    slices. (0.10)
19. **P19, Used by.** A folder's page names every NFS entry, rsync server folder and copy job that uses
    it, with links, and its delete refusals do the same. **Recommended: as written.** (2.7)

---

## 21. What the test VM is expected to show, and what would change this design

Nothing in this slice has been observed yet (section 17.2 is the plan). These assumptions carry the
most weight; if the VM shows otherwise, the build follows the VM and a "Changes made during the build"
section records each change, as the earlier slices do.

| #   | Assumption                                                                                                         | If it does not hold                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The pending modules are those of 0.9 (`avahi` as for SMB; `fstab` for an NFS folder's first and last entry)        | R10's expected sets and the module words change; nothing else does                                                                                                     |
| 2   | A trial run with deletion prints one "deleting …" line per file, and nothing else in that form                     | `trialOutput` follows the real form; if the lines cannot be counted reliably, the result says "The trial's list is below" without a count, and the typed turn-on stays |
| 3   | A job copies contents into contents, for a shared folder and for a remote folder written with `/`                  | The direction sentence and D7 follow what rsync does                                                                                                                   |
| 4   | `Rsync.execute` runs a job with `enable` false                                                                     | Trial-only jobs are saved with `enable` true and the trial flag (a scheduled trial changes nothing), and the job page says so                                          |
| 5   | Passwords are in the replies 0.8 names, and nowhere else                                                           | The omit paths follow the captures; a password found anywhere else is omitted the same way before the operation ships                                                  |
| 6   | NFSv3 and NFSv4 clients mount the two address forms of 0.2                                                         | The page shows only the form that works                                                                                                                                |
| 7   | A computer let in over NFS reaches a 770 folder only with a matching account number                                | 0.5's sentence follows the VM; the folder page may add how to match numbers                                                                                            |
| 8   | An rsync server folder with the classic account and group can receive files into a 770 folder                      | If it cannot, new modules use the account and group that work, and 10.3 says what files copied in belong to                                                            |
| 9   | `emptyRecycleBin` with nothing to delete, or while the daily task holds its lock, ends successfully with no output | 11.4's "Nothing was deleted" sentence follows what it reports                                                                                                          |
| 10  | A remote job to a computer the NAS has not connected to fails with "Host key verification failed"                  | 5.3's line and 5.7's cause follow the real message                                                                                                                     |

---

## 22. Changes made during the build

The contract was written from captures on the test VM (OMV 8.6.1) by
`tools/contract-capture/services.mjs`: a scratch EXT4 file system with documentation shared folders
(one with a space in its name, one with a space in its folder on the disk, one in Cyrillic letters),
NFS entries for one address, a network, a name that does not resolve and any computer, mounted from
the VM itself over NFSv3 and NFSv4.2 as documentation people with and without a matching account
number; rsync server folders with and without a sign-in, reached from the VM itself; local jobs, a
push over SSH with an SSH key made for the run, and a pull through the VM's own rsync server, with
trials, real runs, a second start, a stop half-way, an unmounted source and 20,000 files; a share's
recycle bin filled from an SMB client and emptied; and the workgroup's refusals. The VM was left as
it was. Where the VM answered a **[verify]** or contradicted this design, the build follows the VM:

| #   | Item (17.2, 21)   | What the VM showed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | What changed                                                                                                                                                                                                                                                                         |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 17.2 #1, 21 #1    | The discovery module is `avahi`, never `zeroconf`. A folder's first NFS entry, and deleting its last, also mark `collectd`, `monit` and `quota` with `fstab` (the bind mount under `/export`); a second entry and a delete that is not the last mark `nfs` and `avahi`; a change marks `nfs`. `Rsyncd.setSettings` marks `rsyncd` and `avahi`; modules `rsyncd`; jobs `rsync`; the workgroup and a share's recycle bin `samba` and `avahi`. Making an SSH key marks `certificates`                                                                                                                                                         | 0.9's NFS rows name the extra modules; nothing else                                                                                                                                                                                                                                  |
| 2   | 17.2 #2           | `getSettings` has `shares: ""` with none and `{share: […]}` otherwise; `setSettings` replies with `versions` as the stored comma string; `getShare` has no computed field; `deleteShare` replies `[]`; a new entry's reply carries the real bind mount's UUID. An empty `extraoptions` is refused with OMV's pattern message. `getShareList` fails with OMV's internal message when an entry's shared folder is gone, while `getShare` and `deleteShare` of that entry still work                                                                                                                                                          | The contract's `NfsSettingsSaved` and `NfsShareRemoved`; nothing in the pages reads either reply                                                                                                                                                                                     |
| 3   | 17.2 #3, 21 #6, 7 | NFSv3 mounts `host:/export/{{folder}}`; NFSv4.2 mounts `host:/{{folder}}` and refuses `/export/…`. One address, a network and `*` let in exactly what they say; an address not the client's is refused. Read only is enforced. The client's administrator is squashed. On a 770 folder of group `users`, a client account whose number matches a person in `users` reads and writes; an unmatched number reads nothing. A name that does not resolve is accepted, NFS starts, and the other entries keep working                                                                                                                           | 0.2 and D9 stand (both forms, NFSv4 only when a 4.x version is on); 0.4's name hint and 0.5's sentences stand. A Mac client was not available: D6 and P11 stand unverified                                                                                                           |
| 4   | 17.2 #4, 0.10     | A folder whose folder on the disk has a space is refused by OMV. A folder whose **name** has a space (its folder without) is accepted, and its export does not work. Cyrillic names export and mount                                                                                                                                                                                                                                                                                                                                                                                                                                       | 0.10's refusal of both stands, now observed                                                                                                                                                                                                                                          |
| 5   | 17.2 #5, 21 #5    | The stored secrets are in exactly the replies 0.8 names, and also in `Rsync.delete`'s and `Rsyncd.deleteModule`'s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | The transport removes them from those two replies too (`x-omv-omit`)                                                                                                                                                                                                                 |
| 6   | 17.2 #6, 21 #2, 3 | Contents into contents, for a local job and for a pull with this interface's trailing `/`; a newer file at the destination is replaced by the source's older one; deletion removes files and folders found only at the destination. A trial prints the script's "Please wait, syncing <…> to <…> ...", a blank line, "sending incremental file list", one line per file or folder (folders end in `/`), "deleting {{path}}" for each file and folder it would delete, a blank line, rsync's "sent …" and "total size is … (DRY RUN)" lines and the script's "The synchronisation has completed successfully."; nothing on the disk changes | `trialOutput` counts as files the lines that do not end in `/`, deleting and copying; the first-20 list shows every "deleting" line, folders included                                                                                                                                |
| 7   | 17.2 #7, 21 #4    | `execute` while `rsync` is pending: "Please apply the configuration changes first." A job with `enable` false runs. A second start fails at once with OMV's command message and nothing after it. `Exec.stop` replies nothing; the next output read fails because the task is gone; the lock is removed and the next run works. 20,000 files ran in about a second and printed 20,010 lines. An unmounted source: "Source storage device not mounted at <…>!"                                                                                                                                                                              | Trial-only jobs are saved with `enable` false, as designed; 7.3's sentence for a silent failure and the Cancelled state after Stop stand                                                                                                                                             |
| 8   | 17.2 #8, 21 #10   | Over SSH to a computer not met before: "Host key verification failed." After it is known, a push whose account at the other end does not own the destination folder copies the files but ends with rsync's exit code 23 ("failed to set times on …"). Through an rsync server, a wrong sign-in gives "@ERROR: auth failed on module …"; no output holds the secret. A remote folder with a space fails ("Unexpected remote arg")                                                                                                                                                                                                           | 5.7's causes gain "auth failed" beside "Permission denied", and "(code 23)" with `addJob.trial.partial` "Some files, or their times and permissions, could not be written on <host></host>. The account the job signs in as must own the folder there."; 5.3's no-spaces rule stands |
| 9   | 17.2 #9           | The cron lines are as 0.7 expects: `0 3 * * *`, `0 3 * * 1`, `0 3 15 * *`, `15 * * * *`, `0 */6 * * *`, `*/15 * * * *`, `0 3 */10 * *` (every N days of the month), `0 3 * * 7`, several values as comma lists, and no line for a job not on a schedule                                                                                                                                                                                                                                                                                                                                                                                    | "Every N days of the month" has no words of its own in 0.7: such a stored schedule is shown in the custom sentence with its stored values and kept unless changed. The contract's schedule items stay anchored                                                                       |
| 10  | 17.2 #10, 21 #8   | A fresh VM's port is 873. A folder without a sign-in, read and write: files pushed in land as `nobody:users` with the source's mode, readable by people in `users`; read only is enforced; `hostsallow` with an address or a network works. A wrong sign-in is refused. The shared folder's access list has no effect on the rsync server                                                                                                                                                                                                                                                                                                  | 10.3 stands, now observed                                                                                                                                                                                                                                                            |
| 11  | 17.2 #11, 21 #9   | Files deleted over SMB land in `.recycle/{{person}}/…` with their folders. The daily script removes a file older than the days set and keeps a younger one. Emptying lists "removed '…'" and "removed directory '…'" lines and keeps `.recycle` itself; an empty bin prints only the script's first line; with the bin off, or Windows and Mac sharing off, the task fails because the script is gone. Turning the bin off leaves `.recycle` as it was                                                                                                                                                                                     | 11.4's "Nothing was deleted" shows when no "removed" line is printed, not only for no output; its unavailable reasons already prevent the missing-script failure                                                                                                                     |
| 12  | 17.2 #12          | 16 characters or a colon: "workgroup: The value '…' is not a valid NetBIOS name."; 15 characters and a space are accepted. No Windows client was available                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 11.2's rule stands                                                                                                                                                                                                                                                                   |
| 13  | 17.2 #13          | `getSshList` rows are `uuid`, `publickey`, `comment` and `_used`, which turns true once a job uses the key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Nothing                                                                                                                                                                                                                                                                              |

**Decided while building, from the contract's stricter request schemas (0.4, 0.11, 14.1), and kept
by the owner on 2026-11-23** (P10: a value set in the classic interface is never sent back or
rewritten silently; changing it here means choosing one of the plain choices):

- **Who may connect** is sent only in 0.4's three forms (`NetworkClient`, and `RsyncdHostsAllow` for an
  rsync server folder, which also takes empty and never `*`). A value set in the classic interface
  that is none of them is kept as long as its entry is not changed here; saving a change to that entry
  needs one of the three chosen (`folderNfs.err.choose` "Choose who may connect."). The same holds for
  NFS options other than `ro` and `rw`. Stopping such an entry works as usual.
- **An rsync server folder** whose stored name, account, group or who may connect falls outside the
  contract's patterns opens read-only, as one with several sign-ins does, with Stop offering kept.
- **A copy job's remote address** is sent only in 5.3's two forms (`RsyncRemoteUri`, the trailing `/`
  optional for jobs made elsewhere); one that does not fit is written again before any save (section
  6's "Write it again" becomes required). A stored address without the trailing `/` is kept exactly
  as stored unless it is written again, so an existing job keeps copying as it did.

**Other departures while building:**

- **Copy keys.** i18next cannot hold a string and children under one key, so the design's keys that
  are both became: `folderNfs.stop` → `folderNfs.stop.open`; `module.may` → `module.may.label`;
  `folderSmb.empty` → `folderSmb.empty.label`; `app.documentTitle.job` → `app.documentTitleJob`;
  `addJob.when.manual` and `.schedule` → `addJob.whenManual` and `addJob.whenSchedule`;
  `addJob.howOften.*` → `addJob.howOftenOption.*`; `addJob.turnOn` → `addJob.turnOn.button`;
  `runJob.stop.title`, `.body`, `.confirm` → `runJob.stopTitle`, `runJob.stopBody`,
  `runJob.stopConfirm`. `folderNfs.notApplied` is not used: the pending mark already says "Not
  applied yet". Used by names each user with a short kind word and its name beside it
  (`usedBy.kind.*`), as the library's panel does, instead of one sentence with a slot.
- **The disks slice's schedule.** The schedule's parsing and words moved to `services/jobSchedule.ts`;
  the self-test parts (test kinds, the draft) stay in `disks/schedule.ts`, and the self-test form uses
  `ScheduleField` with hours only and without "Only when I start it".
- **A copy job's name** names another computer's side "{{path}} on {{host}}", not its stored address,
  everywhere it appears (list, Used by, delete refusals).
- **`--delay-updates`** in extra options is not treated as deleting, although it starts with `--del`.
- **Turning on a trial-only job from its page in a later session** offers "on a schedule"; the
  confirmation shows When before it is confirmed.
- **"Change…" from the list's menu** opens the job's page with its form open, handed over in memory,
  not in the address.
- **The two-button summary** ("Save and try it", "Save and turn on") is built in the app on
  `JobSummary`'s pattern, which takes one button.
- **An rsync server folder with a sign-in, changed:** "Password: Set" with one field to type it again,
  and "Change" to type a new one twice. The password is also kept out of the mutation cache.
- **NFS:** a failed NFS read in the Shared folders list says "Linux and Unix (NFS): not known"; on an
  empty NFS table "Share a folder…" is offered once, in the empty state; when turning NFS on fails
  after an entry was saved, the folder page says so in the section, since the form has given way to
  the new entry.
