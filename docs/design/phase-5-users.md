# Phase 5, users slice: people, groups and home folders: design

The users slice of [Phase 5](../07-implementation-plan.md#phase-5--coverage-by-domain): the Users list
made actionable, a person's own page, adding a person (the UX audit's Flow B), what a person may do
(be an administrator of this NAS, sign in over SSH), the groups they are in and the shared folders
they can use, setting a new password, deleting a person; the Groups list, a group's page, adding a
group, its members and deleting it; and the home-folder setting. It picks up where the shares slice's
access grid points today ("Users in the classic interface", [phase-5-shares.md](phase-5-shares.md)
3.4), and links back to that grid from every person and group.

**Status: agreed by the owner on 2026-11-22 (P1 to P17 as written, section 21; a whole-file-system shared folder for home folders is settled by the VM check, keeping the safer choice). Not built yet.** The ten UserMgmt methods the owner
cleared today and the five already in the contract cover everything here; section 15.0 asks for no
further method. This slice hands out and takes away control of the NAS (administrator rights, SSH
sign-in), cuts access (deleting a person or a group, taking someone out of a group, a new password),
and turns home folders on and off for everyone, so every such point is in section 21 and nothing in
it is built before the owner agrees.

Normative sources: the [style guide](style-guide.md), the `UI-*` rules in [05](../05-security.md)
(UI-6 and UI-8 above all), the journal entries of 2026-11-20 (the UX audit's answers: Q2 a flow
refuses to start while other changes are pending, Q5 **new accounts get no login shell unless "SSH
access" is ticked**, Q9 effective access only on a folder's own page), of 2026-11-21 (destructive
slices agreed before building; the interface enforces its own safeguards) and of 2026-11-22 (the
shares design agreed; the users methods cleared, bulk import left in the classic interface), the [UX
audit](ux-audit.md) (Flow B in 4.3, the job-runner rules R1 to R10 in 4.1, Pattern G in 4.8, the
backend facts B1 to B14 in its section 0, V4 and V6), and the conventions of
[phase-3-pages.md](phase-3-pages.md) (the SSH page, its section 3; the account pages, its section 5),
[phase-5-monitoring.md](phase-5-monitoring.md), [phase-5-filesystems.md](phase-5-filesystems.md) and
[phase-5-shares.md](phase-5-shares.md), each in its section 0, which every page here reuses unchanged.
Where this document and the style guide disagree, the style guide wins; raise it.

Backend facts were read from OMV's source (8.6.x tree: the `UserMgmt` RPC service, its `rpc.usermgmt`
and `conf.system.usermngmnt.*` datamodels and their format rules, the system `User` and `Group`
classes, the `samba`, `ssh` and `postfix` engine modules' listeners, the SSH server template, the
package's install script that makes the `admin` account and the `openmediavault-admin` group, and the
classic user, group and settings forms). Earlier slices observed a few of them on the test VM: the
user and group lists' shapes, and the mail settings left pending after a password change. Anything
marked **[verify]** is checked on the mock and the VM, by capture, before it is relied on (section
18.2). Anything marked **[owner]** needs the owner's answer before that part is built.

Every method used here is administrator-only (read from source: each checks the administrator role),
except the three `…ByContext` methods that the account pages already use. A normal user sees nothing
new (section 14).

## Scope of this slice (recommended)

| Built here                                                                                                                                       | Left to the classic interface, and why                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The Users list with its actions: add, open a person; who is an administrator and who may sign in over SSH, said first                            | **Bulk import** of people and groups (`importUsers`, `importGroups`): a text file of names and passwords in OMV's own format. The owner's decision (journal, 2026-11-22)                                                             |
| A person's page: description, email address, home folder, groups, shared folders, what they may do, a new password                               | **Quotas**: per person or group and per file system, in blocks and files. They need the `Quota` methods and storage words this slice does not introduce                                                                              |
| Adding a person (Flow B): name, password, email address, groups, access to shared folders, administrator and SSH, one summary and one checkpoint | **SSH keys**: adding and removing a person's public keys. Pasting key text in two formats, with nothing to check it against here, is for people who already know SSH (section 21, P14). The person's page says how many keys are set |
| What a person may do: **administrator of this NAS** and **sign in over SSH**, each its own explained, unticked choice                            | **Every other system group** (`sudo`, `root`, `disk` and the rest): never offered here; shown, with what it means, when a person is in one (0.5)                                                                                     |
| Groups: the list, a group's page, adding one, its members and description, which shared folders it can use, deleting it                          | **Account numbers and the login shell** (`uid`, `gid`, `shell`): the NAS chooses them; the shell follows the SSH choice (Q5). The classic form offers the shell, not the numbers                                                     |
| Deleting a person, saying what goes and what stays, and taking them off folder access lists by default                                           | **Renaming** a person or a group: OMV has no rename; the name is the account (0.6)                                                                                                                                                   |
| Home folders: turning them on in a shared folder, and off                                                                                        | **Moving home folders** to another shared folder: it moves every person's files inside one request (section 12). **Sharing home folders over SMB** stays with the advanced SMB settings                                              |
| Links both ways between a person or group and the shared folders' access grid                                                                    | **"Disallow account modification"**: shown here, changed there (section 21, P15)                                                                                                                                                     |

The recommendation rests on the same three things as the shares slice: the actions kept are the ones
a home or small-office owner meets when letting people use the NAS (add someone, say what they may
open, give them a new password, remove them); each kept action can be told in one plain sentence,
including what it costs; and the actions left out are the ones whose effects cannot be put in one
sentence without Linux knowledge (section 21, P2). The two choices that hand out control of the NAS
are kept, not hidden, because the classic form hides them inside a list of every system group, which
is how someone becomes an administrator without meaning to (UX audit 3.5).

---

## 0. Conventions added for this slice

The conventions of the earlier slices apply throughout: Phase 3's (formatting, classic links, the
four async states, the settings-form rules, the pending mark, the shared catalogue), the monitoring
domain's (status words, background and foreground reads, the idle timeout), the file-systems slice's
(one confirmation then a step list, the job runner, the session store for what a flow hands on) and
the shares slice's (the access model of its 0.4, the `AccessGrid`, names with direction controls
shown with a visible mark, refusals that offer no classic link round them, deletions that refuse to
start while other changes are pending and apply what they leave). This section adds only what is new.

### 0.1 The words

OMV's and Linux's words mean little to most owners. The interface uses these, each introduced once
where it first appears, as shared keys:

| OMV or Linux term                                                   | The interface says                                                                                                              | Introduced as (`users.term.*`)                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| user (`conf.system.usermngmnt.user`, an account on the NAS)         | **person** in running text; **user** in Kind columns and in the menu ("Users", OMV's word)                                      | "A person is someone who uses this NAS: they open shared folders from their own computer, and can sign in here to change their own password."                                   |
| group (`conf.system.usermngmnt.group`)                              | **group** (the shares slice's `shares.term.group`, reused)                                                                      | "A group is a set of people. Access given to a group applies to everyone in it."                                                                                                |
| member of `openmediavault-admin`; role `admin`                      | **administrator of this NAS**; "Administrator" in columns                                                                       | "An administrator can change every setting on this NAS, read and delete every file on it, and add or remove people. Make only people you trust with everything administrators." |
| member of `_ssh`, with a login shell                                | **may sign in over SSH**; "SSH" in columns                                                                                      | "SSH lets someone sign in to the NAS's command line from another computer, type commands and copy files. Most people never need it."                                            |
| system account, system group (an account number outside 1000–60000) | **built-in account**; **system group**                                                                                          | "System groups are made by the NAS and the programs on it. Some of them give a person power over the NAS itself."                                                               |
| `users` (every person's main group)                                 | not shown; it is in no sentence                                                                                                 |                                                                                                                                                                                 |
| `comment` (the account's GECOS field; the classic form says "Tags") | **description**                                                                                                                 |                                                                                                                                                                                 |
| `email`                                                             | **email address**                                                                                                               | "Email that the NAS sends to this person, such as messages from scheduled jobs, goes to this address."                                                                          |
| home directory; `conf.system.usermngmnt.homedir`                    | **home folder**; the setting is **home folders**                                                                                | "A home folder is a private folder for one person, inside a shared folder that holds everyone's. Only that person can open it."                                                 |
| `disallowusermod`                                                   | **can change their own details** (the opposite sense, so that "Yes" is the usual state)                                         |                                                                                                                                                                                 |
| `sshpubkeys`                                                        | **SSH keys**                                                                                                                    | "An SSH key is a file on someone's computer that lets them sign in over SSH without a password."                                                                                |
| `shell`, `uid`, `gid`, `dir`                                        | not in sentences; under "Technical details" only, as "Command-line program", "Account number", "Main group", "Home folder path" |                                                                                                                                                                                 |

"User account", "UID", "GID", "shell", "sudo", "GECOS" and "passwd" appear only in technical places
(the server's own messages, `Identifier` values, the technical-details disclosure, and the names of
system groups, which are shown as they are because they are their names).

### 0.2 Formatting

| What                          | Rule                                                                                                                                                  | Example                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| A person's name (`{{name}}`)  | The account `name` as received, in `Identifier`; never truncated; in running text isolated (the disks slice's rule for server text inside a sentence) | `alex`                           |
| A group's name (`{{group}}`)  | As a person's name; in running text "(group)" after it where a person's name could be meant                                                           | `family (group)`                 |
| A system group                | Its name in `Identifier`, then its meaning in words when 0.5 has one                                                                                  | `sudo`: can run anything as root |
| A description                 | As received, as text (UI-2), `dir="auto"`, direction controls shown with a visible mark (shares slice, its 19)                                        | `Alex at home`                   |
| An email address              | As text in `Identifier` with `CopyButton`; **never a link**: a `mailto:` address built from a reply is a supplied target (UI-3)                       | `alex@example.org`               |
| A list of names in a sentence | At most five, in natural order, then "and {{count}} more"                                                                                             | `alex, robin and 3 more`         |
| Counts                        | "{{count}} people", "{{count}} members", "{{count}} SSH keys", with plurals                                                                           | `1 member`                       |
| A home folder                 | The shared folder's name and the person's name, as "{{folder}} › {{name}}"; the full path only under Technical details, with `CopyButton`             | `Homes › alex`                   |
| Account numbers               | Tabular numerals, in Technical details only                                                                                                           | `1003`                           |

### 0.3 States in this slice

A person and a group have no health. Nothing in this slice is a monitored state, so **there is no
status pill for a person or a group**, and nothing about them is coloured. What a person may do is
said in words:

**Administrator:** "Yes" when `openmediavault-admin` is in the person's `groups`, else "No". The
built-in `admin` account is always an administrator and is not listed (0.8).

**SSH**, from the person's `groups` and `shell`, `SSH.get` (`enable`, `passwordauthentication`,
`pubkeyauthentication`, already in the contract for the SSH page) and the `ssh` row of
`Services.getStatus`:

| Reading                                                                                                           | Column word | On the person's page                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Not in `_ssh` or `root`                                                                                           | No          | "No."                                                                                                                                        |
| In `_ssh`, a login shell (0.5), SSH on and running, password sign-in on, or key sign-in on with a key             | Allowed     | "Yes."                                                                                                                                       |
| In `_ssh`, but the shell is a no-login one (`/usr/sbin/nologin`, `/sbin/nologin`, `/usr/bin/false`, `/bin/false`) | Allowed     | "Allowed, but their account is set not to open a command line, so they cannot sign in over SSH." (3.3 sets a login shell when SSH is ticked) |
| In `_ssh`, SSH is off                                                                                             | Allowed     | "Allowed, but SSH is off on this NAS." with router link "Open SSH settings" → `/services/ssh`                                                |
| In `_ssh`, SSH on but not running, and `ssh` not pending                                                          | Allowed     | "Allowed, but SSH is not running on this NAS." with router link "Open the SSH service details" → `/diagnostics/services/ssh`                 |
| In `_ssh`, password sign-in off, and no key, or key sign-in off too                                               | Allowed     | "Allowed, but SSH accepts only keys, and {{name}} has none. Keys are added in the classic interface."                                        |
| In `root` (whatever else)                                                                                         | Allowed     | "Can sign in over SSH as a member of the system group root." with 0.5's warning                                                              |
| `SSH.get` or `Services.getStatus` failed                                                                          | Allowed     | "Allowed. Could not check whether SSH is on." (the account's part is still known)                                                            |

"Allowed" in the column is a fact about the account; the page says whether it works, so the list
never claims more than the account shows.

**Home folders**, from `UserMgmt.getSettings` and the chosen shared folder's `ShareMgmt.getList` row:
"Off", "On, in {{folder}}", or, when that folder is not OK, its state from the shares slice's 0.3 with
its pill (a shared folder's state is a monitored state) and "People cannot reach their home folders."

**Not statuses**, and never coloured or pilled: administrator, SSH, groups, access, the description,
the email address, "can change their own details". The administrator and SSH warnings use the
warning-shape neutral `InlineAlert` (the shares slice's guest warning), not a Warning pill: they are
choices, not faults.

### 0.4 What takes effect at once, and what waits for Apply

The UX audit's B5 holds throughout this slice: **almost everything here takes effect at once**,
inside the request, and is not undone by Undo in the band. Read from source:

| Action                                                                         | At once, inside the request                                                                                                                        | Left pending (the band)                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Add a person (`setUser`, new)                                                  | The account, its groups, its shell; its password for signing in here **and** for Windows and Mac sharing; its home folder when home folders are on | Email (`postfix`), always; SSH (`ssh`) when the person has SSH keys, never at creation here                                      |
| Change a person (`setUser`): groups, administrator, SSH, description, password | All of it, the email address and SSH keys excepted                                                                                                 | Email, always (OMV refreshes its list of addresses); SSH when the person has or had SSH keys                                     |
| Delete a person (`deleteUser`)                                                 | The account, its Windows and Mac sharing entry, its group memberships, OMV's record (email address, SSH keys)                                      | Email; SSH when they had keys                                                                                                    |
| Add a group (`setGroup`, new)                                                  | The group and its members                                                                                                                          | Nothing **[verify]**                                                                                                             |
| Change a group (`setGroup`): members, description                              | The members; the description is OMV's record                                                                                                       | Windows and Mac sharing (`samba`), so that computers connected now use the new members **[verify]**                              |
| Delete a group (`deleteGroup`)                                                 | The group and OMV's record                                                                                                                         | Nothing **[verify]**                                                                                                             |
| Turn home folders on or off (`setSettings`)                                    | Every person's home folder is set (and made, or set to none) **[verify]** how long for many people                                                 | Windows and Mac sharing (it shares home folders only while they are on)                                                          |
| Access to shared folders (`ShareMgmt.setPrivileges`)                           | Nothing                                                                                                                                            | Shared folders, System services, and Windows and Mac sharing with Network discovery when the folder is shared (shares slice, 19) |

So:

- **The pending mark** appears only where something really waits: beside the email address when this
  session changed it and Email is pending; beside "Shared folders" on a person's or group's page when
  this session saved access there and its modules are pending; beside a group's "Members" when this
  session saved them and Windows and Mac sharing is pending; on the home-folders page likewise. It
  never appears beside groups, administrator, SSH or a password: those are already in effect.
- **After every save of a person**, the page says once, under the section that saved: "Saved, and
  already in effect. The NAS also lists its email settings as not applied: applying them only
  refreshes the email addresses it knows." (`users.savedNote`). The band then shows "Email" pending,
  as it does today after a password change (observed, Phase 3); applying it changes nothing else.
- **Undo in the band** restores OMV's records (the email address, SSH keys, a group's description) to
  the last applied state and nothing else (B4): an account made since stays, a group change stays, a
  new password stays. That is the UX audit's V4 **[verify]**. The add flows therefore apply their
  own changes and never offer Undo once the account exists (sections 6 and 10), and the band's Undo
  dialog is not changed by this slice.

### 0.5 Groups, membership and the power to control the NAS

Read from source:

- **Every person is in `users`**, their main group. OMV sets it on every save of a person, and the
  shares slice's 770 folders rely on it. It is a system group, not listed, never a choice here.
- **Groups made in OMV** have a number from 1000 to 60000 and are what `getGroupList` lists.
  Membership of one gives a person **no power on the NAS**: only the shared-folder access that the
  group has.
- **System groups** are made by Debian, by OMV and by add-ons. `getGroupList` leaves them out; a
  person's own `groups` names every one they are in. **Two of them hand out control of the NAS**, and
  the interface offers exactly those two, each as its own choice (section 3):

  | System group           | What membership does (read from source)                                                                                                 | Offered as                    |
  | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
  | `openmediavault-admin` | Signing in to this web interface or the classic one gives the administrator role (OMV's sign-in checks this group)                      | **Administrator of this NAS** |
  | `_ssh`                 | The SSH server lets in members of `root` and `_ssh` only (`AllowGroups root _ssh` in OMV's template); OMV's own help says to use `_ssh` | **May sign in over SSH**      |

- **Any other system group** a person is in was set in the classic interface or by an add-on. It is
  shown on the person's page (3.4), **kept on every save**, and never added or removed here. A fixed
  list in the app (`users/systemGroups.ts`) says what the well-known ones mean; the ones that amount
  to control of the NAS get the warning-shape `InlineAlert` and are named on the Users list too:

  | Group                                                                      | Words                                                        | Warned |
  | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
  | `root`                                                                     | "the NAS's superuser group; it also allows SSH sign-in"      | Yes    |
  | `sudo`                                                                     | "can run anything as the NAS's superuser"                    | Yes    |
  | `disk`                                                                     | "can read and write every disk directly"                     | Yes    |
  | `shadow`                                                                   | "can read the NAS's stored passwords"                        | Yes    |
  | `docker`, `lxd`, `libvirt`, `incus-admin`                                  | "can start containers or virtual machines with full control" | Yes    |
  | `openmediavault-config`, `openmediavault-engined`, `openmediavault-webgui` | "the NAS's own groups, which its web interface uses"         | Yes    |
  | `adm`, `systemd-journal`                                                   | "can read the NAS's logs"                                    | No     |
  | any other                                                                  | its name only                                                | No     |

- **Writing a person's groups replaces the whole list** (OMV runs the system's account tool with the
  full list). So every save of a person sends: `users`; every system group they are in, as read; the
  two above as chosen; and the OMV groups as chosen. **An empty list changes nothing** (OMV skips the
  groups when the list is empty, read from source), so the list is never empty; sending `users` alone
  takes a person out of every other group **[verify]**.
- **A group's members can be set from either side**: on the person's page (their groups) and on the
  group's page (its members). Writing a group's members also replaces the whole list. Both sides
  write the same fact; each re-reads just before writing (0.11), so the later save wins, and a page
  whose list changed since it was opened says so instead of overwriting it.
- **A group's member whose main group it is** (possible only for accounts made outside OMV) is shown
  with "(main group)" and cannot be taken out here: OMV's member list does not hold them (read from
  source).

### 0.6 Names

**A new person's name** (section 21, P6), checked in the browser on blur and on Continue, then with
`getUser` and `getGroup` at the flow's first step, then by the server:

| Rule                                                                                                           | Said to the reader when it fails                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 to 32 characters **[verify]** the system's limit                                                             | "Use 1 to 32 characters."                                                                                                                     |
| Small letters a to z, digits, `.`, `_` and `-`; starting with a letter                                         | "Use small letters a to z, digits, and . _ or -, starting with a letter."                                                                     |
| Not `admin`, `administrator`, `root`, `guest`, `nobody`, `users` or `everyone`, even if no such account exists | "{{name}} is a name the NAS or Windows keeps for itself. Choose another name."                                                                |
| No account of that name, built-in ones included (`getUser` finds it)                                           | A person: "There is already a person called {{name}}." A built-in account: "{{name}} is a name the NAS uses for itself. Choose another name." |
| No group of that name, system groups included (`getGroup` finds it)                                            | "There is already a group called {{name}}. Choose a name no group uses, so the two cannot be confused."                                       |

OMV's own rule is wider: capital letters, a leading digit, full stop or underscore, and a trailing `$`
(read from source). The interface is stricter because Windows and Mac computers send the name in any
case and Samba matches names without regard to case, so `Alex` and `alex` would be confusing; a name
of digits alone reads as an account number; a trailing `$` marks a Windows computer's account; and a
person and a group of the same name look alike in every access list.

**A new group's name**: the same character rule and length; not `users`, `root`, `admin`, `sudo`,
`wheel`, `everyone` or `guests`; no group of that name ("There is already a group called
{{group}}."), and no account of that name ("There is already a person called {{group}}. Choose a
name no person uses, so the two cannot be confused.").

**Names cannot be changed.** OMV has no rename: saving under a new name makes a new account (read
from source). A person's page says, behind a `Disclosure` "Why can't I rename {{name}}?": "The name
is what {{name}} signs in with, and what every shared folder's access list uses. To use another
name, add a new person, give them the same access, and delete this one. Files that belong to
{{name}} keep belonging to the old account." A group's page says the same with "group" and "member".

**Existing names** made in the classic interface that break these rules (capital letters, say) are
shown as they are and keep working; the rules apply to new names only. The contract keeps OMV's own
pattern for names it sends back (as the shares slice did for folder names), and the browser holds new
names to the rules above; tests check those rules never accept what the contract refuses.

### 0.7 Passwords

- **OMV's rules only** (read from source): a new person needs a password; a password is one line (no
  line break). There is no minimum length, no list of required characters and **no strength meter**:
  the interface invents no rule and draws no bar. The hint gives plain advice instead (copy, 6.8).
- **Typed twice**, each in a masked field with its own "Show password" toggle (`aria-pressed`),
  `autocomplete="new-password"` on both so that a password manager offers a new one rather than the
  administrator's own, paste allowed, and **kept exactly as typed**: spaces at either end are part of
  the password and are not trimmed. A mismatch says "The two passwords are not the same." on blur of
  the second and on Continue.
- **Sent only in the `setUser` request, through the transport** (`x-omv-secret` on the field). It is
  never shown, never pre-filled, never in a summary, a toast, a dialog's text, the URL, storage, a log
  or an error report; both fields are cleared from form state as soon as the request returns, whatever
  it returned, and when the form or dialog closes (UI-6). The reply's `password` field is removed by
  the transport (`x-omv-omit`), as it already is for `setUserByContext`.
- **An existing password** is never read and never shown; the person's page has "Set a new
  password…" (section 5). The page does not claim to know whether a password is set.
- **It takes effect at once**, for signing in here and for Windows and Mac sharing (OMV sets both,
  read from source). No Apply is needed, and the page says so.
- **On a connection that is not encrypted**, every password field here has, under it, `text-sm`:
  "This connection is not encrypted, so this password can be read by others on your network." with
  router link "Turn on HTTPS" (the Phase 3 checklist's target). This adds a field-level line to UI-12's
  page notice; it does not replace it (section 20, D9).
- **The signed-in person's own password** is changed under Your account (`/account/password`), not
  here (0.8).

### 0.8 The built-in admin and the signed-in person

**The built-in `admin` account** (read from source): OMV's install script makes it as a system
account in `openmediavault-admin`, with no home folder and no login shell. `getUserList` does not list
it; `setUser` refuses to change any system account; OMV leaves it out of Windows and Mac sharing; its
password is changed only while signed in as `admin`, under Your account. **The interface treats it as
OMV does**: it is not listed, never changed, never deleted here, and never offered in access lists
(the shares slice's 0.4). The Users page says so in one line (1.2). It is always an administrator, so
taking administrator rights from every listed person never locks the NAS (3.5 says so when it
happens).

**The signed-in person** is the session's `username` (the shell's read of `getUserByContext`). When
that person is listed (an account in `openmediavault-admin`, such as the VM's `example-admin`):

- their page says "This is the account you are signed in with." with router link "Your account";
- **they cannot delete themselves** (7.1);
- **they cannot take away their own administrator rights**: the checkbox is checked and unavailable,
  with the reason (3.2); every save of their groups keeps `openmediavault-admin`;
- their password is changed under Your account, where OMV's own method for it is (5.1);
- their SSH choice, description, email address, groups and access can be changed here: none of these
  can cut their access to this interface.

**Fail closed:** when the session's `username` is not known (its read failed), every listed
administrator is treated as possibly the reader: deleting and taking away administrator rights are
unavailable for all of them, with "Could not tell which account you are signed in with. Sign out and
sign in again, then try once more."

### 0.9 Pending changes in this slice

0.4's table, as `dirtyModules` keys, every set **[verify]** by `dirtyModules` after each call on the VM
(18.2):

| Action                    | Marks pending                                                                   | Applied by                                                |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `setUser` (any)           | `postfix`; `ssh` when the person has or had SSH keys                            | The band; the add flow's checkpoint                       |
| `deleteUser`              | `postfix`; `ssh` when they had keys                                             | The delete's own last step                                |
| `setGroup` new            | none                                                                            | (the add-group flow's checkpoint, when access was given)  |
| `setGroup` change         | `samba`                                                                         | The band; the delete-group flow's last step               |
| `deleteGroup`             | none                                                                            | (the delete-group flow's last step, for its other writes) |
| `setSettings`             | `samba`                                                                         | The band                                                  |
| `ShareMgmt.setPrivileges` | `sharedfolders`, `systemd`; `samba`, `avahi` when the folder is shared over SMB | The band; the add and delete flows' last step             |

Module words already in the catalogue: `postfix` "Email", `ssh` "SSH", `samba` "Windows and Mac
sharing (SMB)", `sharedfolders` "Shared folders", `systemd` "System services", `avahi` "Network
discovery (Zeroconf)". None changes.

**Which actions apply their own changes**, as the shares slice's deletions do (its 0.8): the add flows
(a person, a group), because Undo after them would leave an account the band no longer mentions (V4);
and the two deletes, because they act at once and leave "Email", "Shared folders, System services"
pending, which would puzzle anyone. Each refuses to start while other changes are pending, offering to
apply or undo them first (R1, Q2), and applies exactly what it left (R10 re-reads first and lists
anything new). Every other save in this slice goes to the band, as any setting does (section 21,
P11).

### 0.10 The interface's own refusals

OMV refuses some things itself (read from source): changing a system account or a system group; a
group in a person's list that does not exist; a login shell that is not on the NAS; deleting a group
that still has members; a name that does not match its pattern; an email address that is not one; a
line break in a password; a member who does not exist. Every refusal below is **also** the
interface's own (journal, 2026-11-21), checked before the call and again at its first step, and a
refusal offers no classic link that would do the same thing without the check (section 21, P16):

| Action                                                                                                    | Refused when                                                                                                                                                                                                       | Section |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Add a person or a group                                                                                   | A name 0.6 refuses; the name is in use as an account or a group; the passwords are empty or differ; other changes are pending; the reads these rules need failed                                                   | 6, 10   |
| Make someone an administrator, or allow SSH                                                               | The `openmediavault-admin` or `_ssh` group is not on the NAS (`getGroup` does not find it): "SSH sign-in cannot be set up here: the NAS has no group called _ssh."                                                 | 3       |
| Take away administrator rights                                                                            | It is the signed-in person; the signed-in person is not known (0.8)                                                                                                                                                | 3       |
| Delete a person                                                                                           | It is the signed-in person; the signed-in person is not known and they are an administrator; other changes are pending; the reads failed                                                                           | 7       |
| Take someone's access away from a folder (on a person's or group's page, or by deleting a group's access) | It would leave nobody with access to a folder shared over SMB with guest access off (the shares slice's 0.9). Deleting a person or a group is not refused for this; the dialog says the folder is left with nobody | 4, 9    |
| Delete a group                                                                                            | A member has it as their main group (0.5); other changes are pending; the reads failed                                                                                                                             | 11      |
| Turn home folders on                                                                                      | The chosen shared folder is not OK, its file system is not mounted or not OK, or it is on the system drive; the reads failed                                                                                       | 12      |
| Any of them                                                                                               | An action on this person or group is already running in this session; the person or group changed since the page was read (0.11)                                                                                   | all     |

Fail closed, as the earlier slices do: when a read these rules need has failed, the action is
unavailable until a read succeeds, with the server's message.

### 0.11 Writing back

OMV's `setUser` and `setGroup` take every field and rewrite the account from them (B11), so every
write is **read, change, write** (R4), with the read made immediately before the write:

- **`setUser` for an existing person** sends: `name`; `groups` built as 0.5 says; `shell` as read, or
  as 3.3 changes it; `password` as the empty string unless a new one is being set (OMV keeps the
  password when it is empty, read from source); `email`, `comment`, `disallowusermod` and `sshpubkeys`
  as read from `getUser`, with only the fields this page changes changed. `uid` is never sent: OMV uses
  it only when making an account, and the interface lets the NAS choose. SSH keys go back as read
  **[verify]** that OMV stores them back unchanged (it converts every key to one format).
- **`setUser` for a new person** sends: `name`, `password`, `email`, `comment`, `groups` (0.5),
  `shell` `/usr/sbin/nologin`, or `/usr/bin/sh` when SSH is chosen (Q5; `/usr/bin/sh` is the classic
  form's own default), `disallowusermod` false (the classic form's default) and `sshpubkeys` empty.
- **`setUser` makes the account when no account has that name, and changes the one that has it
  otherwise**: there is no separate "create" (read from source). So the add flow checks, at its first
  step and immediately before `setUser`, that `getUser` answers that no such account exists
  **[verify]** that reply's status and words, which the flow depends on. Any other answer stops the
  flow: it never writes over an existing person. `setGroup` is the same, checked with `getGroup`.
- **`setGroup` for an existing group** sends `name`, `comment` and `members` from `getGroup` just read,
  with the change. `gid` is never sent.
- **`setSettings`** sends both fields; with `enable` true, always a shared folder's `uuid`.
- **`ShareMgmt.setPrivileges`**, from a person's or group's page, follows the shares slice's 0.10 per
  folder: the folder's `privileges` re-read from `ShareMgmt.getList` just before, this person's or
  group's entry set, changed or removed, every other entry kept, and entries for accounts that no
  longer exist dropped (the shares slice's D9, said before saving).
- **Changed elsewhere.** If the re-read differs from what the page showed in a field the reader did
  not change, the save stops: "{{name}} was changed elsewhere since you opened this page." with "Show
  the current details" (re-read; the reader's changes are kept and marked where they differ). A second
  administrator saving between the read and the write is not detected by OMV; the interface narrows
  the window, as every slice does, and says nothing it cannot know.

---

## 1. Users > Users

**Question it answers:** who can use this NAS, and which of them can control it? **Leads to:** a
person's page; adding a person.

Administrators only. Route `/usermgmt/users`: the menu item Users > Users gains this route, and its
classic link moves to the page's footer (section 14).

### 1.1 Data

- `UserMgmt.getUserList` (exists), the whole list (`limit: null`, all five paging fields sent,
  `detail: "basic"`), read on opening, Refresh and window focus. OMV builds every row on every call,
  whatever page is asked for (read from source), so the page sorts, searches and pages in the browser,
  as the access grid does **[verify]** how long the read takes with 300 accounts.
- `UserMgmt.getGroupList` (exists), whole, for the group names in the Groups column.
- `SSH.get` and `Services.getStatus` (exist), for 0.3's SSH words on the summary line.
- `System.getInformation` (the shell's), for `dirtyModules`.

### 1.2 Layout

1. Page title "Users".
2. Intro: 0.1's `users.term.person`.
3. **Who can control this NAS** (always shown; worst first). A `Card` with
   `h2` "Who can control this NAS" and up to three lines, `text-sm`:
   - "Administrators: {{list}}, and the built-in admin account." (with nobody listed: "Only the
     built-in admin account is an administrator.");
   - "May sign in over SSH: {{list}}." or "Nobody may sign in over SSH.";
   - only when any person is in a warned system group (0.5), with the warning-shape icon: "In system
     groups that give control of the NAS: {{name}} ({{groups}})." one line per person, each name a
     router link to their page.
     Each list follows 0.2's five-names rule; each name is a router link.
4. **Unfinished work** (1.5), only when found.
5. Toolbar: `SearchField` "Search people" (name, description, email address); `Select` "Show":
   "Everyone" (default), "Administrators", "May sign in over SSH", "In system groups"; on the trailing
   side **"Add a person"**, a filled primary router link to `/usermgmt/users/add`.
6. The table (1.3).
7. Footer: in-browser pagination at 50 rows and the last-read line; then, `text-sm muted-foreground`:
   - "The built-in admin account is not on this list. To change its password, sign in as admin and
     open Your account."
   - "Importing many people at once, quotas and SSH keys are in the classic interface." with
     `ExternalLink` "Users in the classic interface" → `/#/usermgmt/users`.

### 1.3 Columns

| Order | Header        | Display                                                                                                                                             | Sort                   |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1     | Name          | `{{name}}` as a router link, accessible name "Open {{name}}"; "(you)" after it, `text-sm muted-foreground`, for the signed-in person                | Natural order, default |
| 2     | Description   | The `comment`, or "None" in `muted-foreground`                                                                                                      | Yes                    |
| 3     | Email address | The `email`, or "None"                                                                                                                              | Yes                    |
| 4     | Groups        | The OMV groups they are in, at most three then "and {{count}} more"; "None". System groups are not listed here (the summary line names warned ones) | No                     |
| 5     | Administrator | "Yes" or "No"                                                                                                                                       | Yes                    |
| 6     | SSH           | 0.3's column word: "Allowed" or "No"                                                                                                                | Yes                    |

Under 640px the table shows Name and Administrator as columns, with the description, the SSH word and
the groups on a second line under the name, as the RAID, ZFS and shares lists do.

### 1.4 States

| State                 | Look                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading               | Skeleton of the summary card and five table rows; "Loading people…"                                                                                                                                                                                  |
| `getUserList` failed  | `EmptyState variant="error"` in place of the card and table: "Could not read the people on this NAS." + server message + "Try again"                                                                                                                 |
| A side read failed    | `getGroupList`: the Groups column says "Not known" and a line above the table says "Could not read the groups." + message + "Try again". `SSH.get`: the summary's SSH line says "Allowed" names only, and 0.3's "Could not check whether SSH is on." |
| Empty (nobody listed) | `EmptyState variant="empty"`: "There is nobody on this NAS yet apart from the built-in admin account. Add the people who will use its shared folders." Action: router link "Add a person". The summary card still shows its first line               |
| Filtered empty        | "No people match "{{search}}"." / "Nobody matches this filter." with "Clear the search" / "Show everyone"                                                                                                                                            |
| Populated             | As 1.2                                                                                                                                                                                                                                               |

### 1.5 Unfinished work (R8)

The add and delete flows' journals live in memory, so a reload ends the flow view. The list recognises
from server state:

| Found                                                                               | Line                                                                    | Action                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| A person this session added whose chosen folder access is not in the folders' lists | "{{name}} was added, but their access to shared folders was not saved." | Router link "Open {{name}}" (its Shared folders section)   |
| A person this session deleted who is still listed                                   | "{{name}} is still on this NAS. Deleting them did not finish."          | Router link "Open {{name}}"                                |
| Access entries for an account this session deleted, still in a folder's list        | "Shared folders still list {{name}}, who was deleted: {{folders}}."     | Router link to each folder's page, where saving drops them |

### 1.6 Keyboard

Tab order: the summary card's links, the unfinished-work actions, the search, the Show filter, "Add a
person", the column headers (sortable ones as buttons), each row's name link, the pagination, the
footer link. On arrival focus is on the page title.

### 1.7 Copy

| Key                            | English                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `users.title`                  | Users                                                                                                                                          |
| `users.term.person`            | A person is someone who uses this NAS: they open shared folders from their own computer, and can sign in here to change their own password.    |
| `users.control.title`          | Who can control this NAS                                                                                                                       |
| `users.control.admins`         | Administrators: {{list}}, and the built-in admin account.                                                                                      |
| `users.control.adminOnly`      | Only the built-in admin account is an administrator.                                                                                           |
| `users.control.ssh`            | May sign in over SSH: {{list}}.                                                                                                                |
| `users.control.sshNobody`      | Nobody may sign in over SSH.                                                                                                                   |
| `users.control.systemGroups`   | In system groups that give control of the NAS: <name></name> ({{groups}}).                                                                     |
| `users.search`                 | Search people                                                                                                                                  |
| `users.show`                   | Show                                                                                                                                           |
| `users.show.all`               | Everyone                                                                                                                                       |
| `users.show.admins`            | Administrators                                                                                                                                 |
| `users.show.ssh`               | May sign in over SSH                                                                                                                           |
| `users.show.systemGroups`      | In system groups                                                                                                                               |
| `users.add`                    | Add a person                                                                                                                                   |
| `users.open`                   | Open {{name}}                                                                                                                                  |
| `users.you`                    | (you)                                                                                                                                          |
| `users.col.name`               | Name                                                                                                                                           |
| `users.col.description`        | Description                                                                                                                                    |
| `users.col.email`              | Email address                                                                                                                                  |
| `users.col.groups`             | Groups                                                                                                                                         |
| `users.col.admin`              | Administrator                                                                                                                                  |
| `users.col.ssh`                | SSH                                                                                                                                            |
| `users.yes`                    | Yes                                                                                                                                            |
| `users.no`                     | No                                                                                                                                             |
| `users.sshAllowed`             | Allowed                                                                                                                                        |
| `users.more`                   | and {{count}} more                                                                                                                             |
| `users.notKnown`               | Not known                                                                                                                                      |
| `users.loading`                | Loading people…                                                                                                                                |
| `users.loadFailed`             | Could not read the people on this NAS.                                                                                                         |
| `users.groupsFailed`           | Could not read the groups.                                                                                                                     |
| `users.empty`                  | There is nobody on this NAS yet apart from the built-in admin account. Add the people who will use its shared folders.                         |
| `users.filtered`               | No people match "{{search}}".                                                                                                                  |
| `users.filteredShow`           | Nobody matches this filter.                                                                                                                    |
| `users.clearSearch`            | Clear the search                                                                                                                               |
| `users.showAll`                | Show everyone                                                                                                                                  |
| `users.footer.admin`           | The built-in admin account is not on this list. To change its password, sign in as admin and open Your account.                                |
| `users.footer.classic`         | Importing many people at once, quotas and SSH keys are in the classic interface.                                                               |
| `users.classicLink`            | Users in the classic interface                                                                                                                 |
| `users.unfinished.access`      | <name></name> was added, but their access to shared folders was not saved.                                                                     |
| `users.unfinished.notDeleted`  | <name></name> is still on this NAS. Deleting them did not finish.                                                                              |
| `users.unfinished.staleAccess` | Shared folders still list <name></name>, who was deleted: {{folders}}.                                                                         |
| `users.savedNote`              | Saved, and already in effect. The NAS also lists its email settings as not applied: applying them only refreshes the email addresses it knows. |

---

## 2. A person's page

**Question it answers:** who is this, what can they open, and can they control the NAS? **Leads to:**
changing their details, groups, access and what they may do; a new password; deleting them.

Administrators only. Route `/usermgmt/users/$name`, where `$name` is the account name (section 20,
D1). The address is checked against OMV's user-name pattern before anything is read; the page then
finds the row of the whole-list `getUserList` read whose `name` matches exactly, and every later call
uses that row's `name`, never the address (UI-4). A value that fails the pattern or names no row shows
the not-found state and makes no person-specific call; a built-in account's name is not in the list,
so it is not found here. No menu item of its own; Users is current while it is open.

### 2.1 Data on opening

In parallel:

- `UserMgmt.getUserList` and `UserMgmt.getGroupList` (1.1, shared and often warm), for this person's
  row and the group choices;
- `ShareMgmt.getList`, the whole list (the shares slice's, shared), and `SMB.getShareList` and
  `SMB.getSettings`, for the Shared folders section (4.2);
- `SSH.get` and `Services.getStatus`, for 0.3's SSH words;
- `UserMgmt.getSettings` (new, cleared), for the home folder;
- `System.getInformation` (the shell's), for `dirtyModules` and the host name.

`getUser` (new, cleared) is not read on opening: the list row holds the same fields (read from
source). It is read immediately before every write (0.11).

Re-read on Refresh, after an action this page started ends, and on window focus, but **never while a
section holds unsaved changes** (the shares slice's 2.1 rule; Refresh then asks first, 2.7).

### 2.2 Layout

1. **Breadcrumbs**: "Users" (router link) › `{{name}}` (current page).
2. **Page title**: "{{name}}". Under it, `text-sm muted-foreground`, the description, or "Person".
3. For the signed-in person only, `text-sm`: "This is the account you are signed in with." with
   router link "Your account" → `/account/settings`.
4. **What to do now** (2.4), only when there is something to do.
5. **Summary card** (2.3).
6. **What {{name}} can do** (section 3), `h2`.
7. **Groups** (section 4.1), `h2`.
8. **Shared folders** (section 4.2), `h2`.
9. **Password** (section 5), `h2`.
10. After a divider and a 24px gap: **"Delete this person"** (section 7).

One column. Document title: "{{name}} – Users"; the shell adds "– openmediavault".

### 2.3 Summary card

A `FactList`, with "Edit details" (neutral) at the card's top right, which turns Description and Email
address into fields in place (2.5):

| Label                        | Value                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                         | `{{name}}`; under it, a `Disclosure` "Why can't I rename {{name}}?" with 0.6's sentence                                                                                             |
| Description                  | The `comment`, or "None"                                                                                                                                                            |
| Email address                | The `email` with `CopyButton`, or "None"; the pending mark when 0.4 says so                                                                                                         |
| Home folder                  | Home folders on: "{{folder}} › {{name}}" with router link to the shared folder's page. Off: "Home folders are off." with router link "Home folders settings" → `/usermgmt/settings` |
| SSH keys                     | "None", or "{{count}} SSH keys, added in the classic interface."                                                                                                                    |
| Can change their own details | "Yes" or "No", and `text-sm muted-foreground` "Set in the classic interface." (section 21, P15)                                                                                     |
| Technical details            | A `Disclosure`: Account number (`uid`), Main group (`users`), Command-line program (`shell`, mono), Home folder path (`dir`, mono, `CopyButton`; "None" when it is `/nonexistent`)  |

### 2.4 What to do now

A `Card` with an `h3`, shown for the first case that applies:

| Case                                                                                        | Heading                                      | Body and actions                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In a warned system group (0.5)                                                              | "{{name}} has control over the NAS"          | "{{name}} is in {{groups}}. Members of these groups can take control of the NAS, as an administrator can. If that is not meant, take {{name}} out of them in the classic interface." with `ExternalLink` "Users in the classic interface" |
| Allowed SSH, but it cannot work (0.3's rows 3 to 6)                                         | "{{name}} cannot sign in over SSH yet"       | 0.3's sentence and its link                                                                                                                                                                                                               |
| No access to any shared folder, directly or through a group, and at least one folder exists | "{{name}} cannot open any shared folder yet" | "Choose which shared folders {{name}} may open, below." with a button "Choose shared folders" that moves focus to 4.2's grid                                                                                                              |
| The home folder's shared folder is not OK (0.3)                                             | "{{name}} cannot reach their home folder"    | "Home folders are in {{folder}}, which cannot be reached: {{reason}}" with router link "Open {{folder}}"                                                                                                                                  |

### 2.5 Editing the details

"Edit details" turns the two values into fields, with "Save details" (filled within the card) and
"Cancel":

- **Description** (`TextField`, optional): at most 65 characters (the classic form's limit), no `:`
  and no line break **[verify]** what OMV does with a `:` or `,` in it. Hint: "Shown in lists, to help
  you tell people apart. Windows and Mac computers may show it too." **[verify]** whether Samba shows
  it (OMV passes it to Samba as the account's description, read from source).
- **Email address** (`TextField`, `type="email"`, `autocomplete="off"`, optional): one address, or
  empty. Hint: 0.1's `users.term.email`.

On "Save details": `getUser` re-read, 0.11's checks, then `setUser` with the two fields changed. Saved:
the values return to text, toast "Details of {{name}} saved.", 0.4's note under the card, the pending
mark beside the email address when it changed; focus returns to "Edit details". Failed: the fields
stay, with the server's message above the buttons. Enter in a field saves; Escape cancels.

### 2.6 States of the page

| State                                | Look                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                              | The name from the address is not shown (it is only an identifier); a skeleton of the summary card and the section headings; "Loading this person…"                                                                                                                                     |
| Not found (pattern fails, or no row) | `EmptyState variant="empty"`: "There is nobody called {{name}} on this NAS. They may have been deleted." with router link "Go to Users". No further call. The name shown is the address's, as text, only when it matched the pattern; otherwise "There is no such person on this NAS." |
| `getUserList` failed                 | `EmptyState variant="error"`: "Could not read this person." + server message + "Try again"                                                                                                                                                                                             |
| A section's own read failed          | That section shows its error in place (sections 3, 4); the rest of the page stays                                                                                                                                                                                                      |
| Refreshing                           | The page stays, `aria-busy`; afterwards "Read at {{time}}" is announced                                                                                                                                                                                                                |
| Populated                            | As 2.2                                                                                                                                                                                                                                                                                 |

### 2.7 Keyboard and focus

Tab order follows 2.2: breadcrumbs, the signed-in line's link, the What to do now action, "Edit
details", the summary's links, copy buttons and disclosures, then sections 3, 4.1, 4.2, 5 and 7 in
order. On arrival focus is on the page title. Refresh or leaving with unsaved changes in any section
opens the shares slice's dialog (its 2.8: "You have changes that are not saved." with "Keep my
changes" focused). A password typed in a dialog is never counted as an unsaved change to keep: closing
the dialog clears it (0.7).

### 2.8 Copy

| Key                                    | English                                                                                                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person.docTitle`                      | {{name}} – Users                                                                                                                                                                                                                                            |
| `person.subtitleNone`                  | Person                                                                                                                                                                                                                                                      |
| `person.isYou`                         | This is the account you are signed in with.                                                                                                                                                                                                                 |
| `person.yourAccount`                   | Your account                                                                                                                                                                                                                                                |
| `person.loading`                       | Loading this person…                                                                                                                                                                                                                                        |
| `person.notFound`                      | There is nobody called {{name}} on this NAS. They may have been deleted.                                                                                                                                                                                    |
| `person.notFoundPlain`                 | There is no such person on this NAS.                                                                                                                                                                                                                        |
| `person.toList`                        | Go to Users                                                                                                                                                                                                                                                 |
| `person.loadFailed`                    | Could not read this person.                                                                                                                                                                                                                                 |
| `person.editDetails`                   | Edit details                                                                                                                                                                                                                                                |
| `person.fact.name`                     | Name                                                                                                                                                                                                                                                        |
| `person.fact.description`              | Description                                                                                                                                                                                                                                                 |
| `person.fact.email`                    | Email address                                                                                                                                                                                                                                               |
| `person.fact.home`                     | Home folder                                                                                                                                                                                                                                                 |
| `person.fact.homeValue`                | <folder></folder> › <name></name>                                                                                                                                                                                                                           |
| `person.fact.homeOff`                  | Home folders are off.                                                                                                                                                                                                                                       |
| `person.fact.homeLink`                 | Home folders settings                                                                                                                                                                                                                                       |
| `person.fact.keys`                     | SSH keys                                                                                                                                                                                                                                                    |
| `person.fact.keysCount_one` / `_other` | {{count}} SSH key, added in the classic interface. / {{count}} SSH keys, added in the classic interface.                                                                                                                                                    |
| `person.fact.ownDetails`               | Can change their own details                                                                                                                                                                                                                                |
| `person.fact.ownDetailsClassic`        | Set in the classic interface.                                                                                                                                                                                                                               |
| `person.fact.technical`                | Technical details                                                                                                                                                                                                                                           |
| `person.fact.uid`                      | Account number                                                                                                                                                                                                                                              |
| `person.fact.gid`                      | Main group                                                                                                                                                                                                                                                  |
| `person.fact.shell`                    | Command-line program                                                                                                                                                                                                                                        |
| `person.fact.dir`                      | Home folder path                                                                                                                                                                                                                                            |
| `person.copyEmail`                     | Copy the email address of {{name}}                                                                                                                                                                                                                          |
| `person.rename.why`                    | Why can't I rename {{name}}?                                                                                                                                                                                                                                |
| `person.rename.body`                   | The name is what <name></name> signs in with, and what every shared folder's access list uses. To use another name, add a new person, give them the same access, and delete this one. Files that belong to <name></name> keep belonging to the old account. |
| `person.details.description`           | Description                                                                                                                                                                                                                                                 |
| `person.details.descriptionHint`       | Shown in lists, to help you tell people apart. Windows and Mac computers may show it too.                                                                                                                                                                   |
| `person.details.descriptionTooLong`    | Use at most 65 characters.                                                                                                                                                                                                                                  |
| `person.details.descriptionChars`      | A description cannot contain a colon or a line break.                                                                                                                                                                                                       |
| `person.details.email`                 | Email address                                                                                                                                                                                                                                               |
| `users.term.email`                     | Email that the NAS sends to this person, such as messages from scheduled jobs, goes to this address.                                                                                                                                                        |
| `person.details.emailInvalid`          | Enter one email address, such as alex@example.org, or leave this empty.                                                                                                                                                                                     |
| `person.details.save`                  | Save details                                                                                                                                                                                                                                                |
| `person.details.cancel`                | Cancel                                                                                                                                                                                                                                                      |
| `person.details.saved`                 | Details of {{name}} saved.                                                                                                                                                                                                                                  |
| `person.changedElsewhere`              | <name></name> was changed elsewhere since you opened this page.                                                                                                                                                                                             |
| `person.showCurrent`                   | Show the current details                                                                                                                                                                                                                                    |
| `person.todo.power.title`              | {{name}} has control over the NAS                                                                                                                                                                                                                           |
| `person.todo.power.body`               | <name></name> is in {{groups}}. Members of these groups can take control of the NAS, as an administrator can. If that is not meant, take <name></name> out of them in the classic interface.                                                                |
| `person.todo.ssh.title`                | {{name}} cannot sign in over SSH yet                                                                                                                                                                                                                        |
| `person.todo.noAccess.title`           | {{name}} cannot open any shared folder yet                                                                                                                                                                                                                  |
| `person.todo.noAccess.body`            | Choose which shared folders <name></name> may open, below.                                                                                                                                                                                                  |
| `person.todo.noAccess.action`          | Choose shared folders                                                                                                                                                                                                                                       |
| `person.todo.home.title`               | {{name}} cannot reach their home folder                                                                                                                                                                                                                     |
| `person.todo.home.body`                | Home folders are in <folder></folder>, which cannot be reached: {{reason}}                                                                                                                                                                                  |
| `person.todo.home.open`                | Open {{folder}}                                                                                                                                                                                                                                             |
| `users.term.home`                      | A home folder is a private folder for one person, inside a shared folder that holds everyone's. Only that person can open it.                                                                                                                               |
| `users.term.keys`                      | An SSH key is a file on someone's computer that lets them sign in over SSH without a password.                                                                                                                                                              |

The shares slice's unsaved-changes keys (`sharedFolder.unsaved.*`) are reused as they are.

---

## 3. What a person can do: administrator and SSH

On a person's page (2.2, item 6) and, in the same component, in the add flow (section 6). This is
the slice's most consequential section, so it is its own form with its own Save, and every change to
it is confirmed in words before it is written (section 21, P3 and P4).

### 3.1 The section

1. `h2` "What {{name}} can do", and under it, `text-sm`: "Everyone can open the shared folders they
   are given access to, and sign in here to change their own password. These two choices give more."
2. **Administrator of this NAS** (3.2).
3. **May sign in over SSH** (3.3), after a 16px gap so that each reads as its own choice.
4. **Other system groups** (3.4), only when the person is in any.
5. Buttons: **"Save"** (filled primary within the section) and "Discard changes", both unavailable
   but focusable with "No changes to save" until something changes (Phase 3's 0.4).

### 3.2 Administrator of this NAS

`CheckboxField` "Administrator of this NAS", default **off** for a new person, never preselected.

- Hint: "Can change every setting on this NAS, read and delete every file on it, and add or remove
  people, here and in the classic interface."
- When ticked and it was not ticked before, the warning-shape neutral `InlineAlert` under it, also
  the checkbox's description (heard when the box is reached): "Make {{name}} an administrator only if
  you trust them with everything on this NAS. An administrator can also take your own rights away."
- **The signed-in person** (0.8): ticked and unavailable (`aria-disabled`, focusable), with the reason
  as text under it: "You cannot take away your own administrator rights. Another administrator can."
- **The signed-in person not known** (0.8): for any person who is an administrator, unavailable with
  0.8's sentence.
- **The group missing** (0.10): unavailable with "Administrator rights cannot be given here: the NAS
  has no group called openmediavault-admin." (it is made by OMV's install, so this is a guard only).

### 3.3 May sign in over SSH

`CheckboxField` "May sign in over SSH", default **off**, never preselected (Q5).

- Hint: "Lets {{name}} sign in to the NAS's command line from another computer, type commands, and
  copy files with SFTP. Most people never need it."
- When ticked and it was not ticked before, the warning-shape `InlineAlert`, also its description:
  "With SSH, {{name}} can run programs on the NAS and open every file their account can reach, not
  only through shared folders."
- Under it, always, 0.3's line for how SSH stands on the NAS when it would stop this from working:
  SSH off ("SSH is off on this NAS, so this has no effect until it is turned on." with router link
  "Open SSH settings"), password sign-in off and no key ("SSH accepts only keys, and {{name}} has
  none. Keys are added in the classic interface." with `ExternalLink` "Users in the classic
  interface"), or the read failed ("Could not check whether SSH is on.").
- **What ticking does** (Q5): adds `_ssh` to the person's groups, and when their shell is a no-login
  one (0.3), sets it to `/usr/bin/sh`. A shell set in the classic interface that already opens a
  command line is kept.
- **What unticking does**: takes `_ssh` out of their groups and sets the shell to `/usr/sbin/nologin`,
  so that neither SSH nor SFTP can sign them in (section 20, D6). When they are also in `root`, the
  line "{{name}} is also in the system group root, which lets them sign in over SSH too. Take them
  out of it in the classic interface." stays under the box.
- **The group missing**: unavailable with 0.10's sentence. `getGroup` for `_ssh` is read with the
  section **[verify]** that the group exists on OMV 8 and is named so.
- The checkbox is a choice about the account, and is offered whatever SSH's settings are, so an
  administrator can prepare an account before turning SSH on (the SSH page's own rule, Phase 3 3.2).

### 3.4 Other system groups

Shown only when the person is in a system group other than `users`, `openmediavault-admin` and `_ssh`:

- `h3` "Other system groups", `text-sm`: "{{name}} is also in these groups, set in the classic interface
  or by an add-on. They are kept when you save here."
- A list: each group's name in `Identifier` and its words from 0.5's table.
- When any is warned, the warning-shape `InlineAlert` above the list: "{{groups}} give control over
  the NAS itself, as an administrator has. Take {{name}} out of them in the classic interface if that
  is not meant." with `ExternalLink` "Users in the classic interface". This is not a refusal; nothing
  is blocked by it.

### 3.5 Saving, and the confirmation

On **"Save"**: a `ConfirmDialog`, plain (no file is touched, and every change can be made again here),
focus on Cancel, listing each change in the order of the form:

1. Title: "Change what {{name}} can do?"
2. One item per change:
   - made an administrator: "{{name}} becomes an administrator of this NAS. The next time they sign
     in, they can change every setting, read and delete every file, and add or remove people.";
   - no longer an administrator: "{{name}} is no longer an administrator. They can still open the
     shared folders they have access to and change their own password." and, when that leaves no
     listed administrator: "After this, the built-in admin account is the only administrator. Make
     sure you know its password.";
   - SSH allowed: "{{name}} may sign in over SSH and use the NAS's command line." (and 3.3's SSH line
     when SSH is off);
   - SSH taken away: "{{name}} can no longer sign in over SSH or copy files with SFTP. Anything that
     signs in to the NAS as {{name}}, such as a backup from another computer, stops working."
3. "This takes effect as soon as you save. It does not wait for Apply."
4. Buttons: "Cancel" (focused) and **"Save changes"** (filled primary: nothing is destroyed, and the
   choice can be changed back here; the words above carry the weight, not the colour).

On confirm: `getUser` re-read and 0.11's checks; then 0.8's self rule once more; then `setUser` with
the groups and shell of 3.2 and 3.3. Saved: toast per change ("{{name}} is now an administrator. It
takes effect the next time they sign in.", "{{name}} is no longer an administrator.", "{{name}} may now
sign in over SSH.", "{{name}} can no longer sign in over SSH."), 0.4's note under the section, focus on
"Save" (now unavailable). Failed: an `InlineAlert` above the buttons with the server's message; the
choices stay.

### 3.6 States of the section

| State                                           | Look                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Loading                                         | Two skeleton checkbox lines                                                                                      |
| The person's row is known; SSH reads failed     | The section works; 3.3's line says "Could not check whether SSH is on."                                          |
| `getGroup` for `_ssh` or the admin group failed | That checkbox is unavailable with "Could not check this option." + server message + "Try again"; the other works |
| Saving                                          | Both checkboxes unavailable; "Save" shows "Saving…"                                                              |
| Populated                                       | As 3.1                                                                                                           |

### 3.7 Copy

| Key                             | English                                                                                                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personCan.title`               | What {{name}} can do                                                                                                                                                             |
| `personCan.intro`               | Everyone can open the shared folders they are given access to, and sign in here to change their own password. These two choices give more.                                       |
| `personCan.admin`               | Administrator of this NAS                                                                                                                                                        |
| `personCan.adminHint`           | Can change every setting on this NAS, read and delete every file on it, and add or remove people, here and in the classic interface.                                             |
| `personCan.adminWarn`           | Make <name></name> an administrator only if you trust them with everything on this NAS. An administrator can also take your own rights away.                                     |
| `personCan.adminSelf`           | You cannot take away your own administrator rights. Another administrator can.                                                                                                   |
| `personCan.adminUnknownSelf`    | Could not tell which account you are signed in with. Sign out and sign in again, then try once more.                                                                             |
| `personCan.adminNoGroup`        | Administrator rights cannot be given here: the NAS has no group called openmediavault-admin.                                                                                     |
| `personCan.ssh`                 | May sign in over SSH                                                                                                                                                             |
| `personCan.sshHint`             | Lets <name></name> sign in to the NAS's command line from another computer, type commands, and copy files with SFTP. Most people never need it.                                  |
| `personCan.sshWarn`             | With SSH, <name></name> can run programs on the NAS and open every file their account can reach, not only through shared folders.                                                |
| `personCan.sshOff`              | SSH is off on this NAS, so this has no effect until it is turned on.                                                                                                             |
| `personCan.sshOffLink`          | Open SSH settings                                                                                                                                                                |
| `personCan.sshKeysOnly`         | SSH accepts only keys, and <name></name> has none. Keys are added in the classic interface.                                                                                      |
| `personCan.sshUnread`           | Could not check whether SSH is on.                                                                                                                                               |
| `personCan.sshRoot`             | <name></name> is also in the system group root, which lets them sign in over SSH too. Take them out of it in the classic interface.                                              |
| `personCan.sshNoGroup`          | SSH sign-in cannot be set up here: the NAS has no group called _ssh.                                                                                                             |
| `personCan.optionFailed`        | Could not check this option.                                                                                                                                                     |
| `personCan.other.title`         | Other system groups                                                                                                                                                              |
| `personCan.other.intro`         | <name></name> is also in these groups, set in the classic interface or by an add-on. They are kept when you save here.                                                           |
| `personCan.other.warn`          | {{groups}} give control over the NAS itself, as an administrator has. Take <name></name> out of them in the classic interface if that is not meant.                              |
| `systemGroup.root`              | the NAS's superuser group; it also allows SSH sign-in                                                                                                                            |
| `systemGroup.sudo`              | can run anything as the NAS's superuser                                                                                                                                          |
| `systemGroup.disk`              | can read and write every disk directly                                                                                                                                           |
| `systemGroup.shadow`            | can read the NAS's stored passwords                                                                                                                                              |
| `systemGroup.containers`        | can start containers or virtual machines with full control                                                                                                                       |
| `systemGroup.omv`               | the NAS's own groups, which its web interface uses                                                                                                                               |
| `systemGroup.logs`              | can read the NAS's logs                                                                                                                                                          |
| `personCan.save`                | Save                                                                                                                                                                             |
| `personCan.discard`             | Discard changes                                                                                                                                                                  |
| `personCan.saving`              | Saving…                                                                                                                                                                          |
| `personCan.confirm.title`       | Change what {{name}} can do?                                                                                                                                                     |
| `personCan.confirm.makeAdmin`   | <name></name> becomes an administrator of this NAS. The next time they sign in, they can change every setting, read and delete every file, and add or remove people.             |
| `personCan.confirm.removeAdmin` | <name></name> is no longer an administrator. They can still open the shared folders they have access to and change their own password.                                           |
| `personCan.confirm.lastAdmin`   | After this, the built-in admin account is the only administrator. Make sure you know its password.                                                                               |
| `personCan.confirm.allowSsh`    | <name></name> may sign in over SSH and use the NAS's command line.                                                                                                               |
| `personCan.confirm.removeSsh`   | <name></name> can no longer sign in over SSH or copy files with SFTP. Anything that signs in to the NAS as <name></name>, such as a backup from another computer, stops working. |
| `personCan.confirm.now`         | This takes effect as soon as you save. It does not wait for Apply.                                                                                                               |
| `personCan.confirm.cancel`      | Cancel                                                                                                                                                                           |
| `personCan.confirm.save`        | Save changes                                                                                                                                                                     |
| `personCan.saved.makeAdmin`     | {{name}} is now an administrator. It takes effect the next time they sign in.                                                                                                    |
| `personCan.saved.removeAdmin`   | {{name}} is no longer an administrator.                                                                                                                                          |
| `personCan.saved.allowSsh`      | {{name}} may now sign in over SSH.                                                                                                                                               |
| `personCan.saved.removeSsh`     | {{name}} can no longer sign in over SSH.                                                                                                                                         |
| `users.term.admin`              | An administrator can change every setting on this NAS, read and delete every file on it, and add or remove people. Make only people you trust with everything administrators.    |
| `users.term.ssh`                | SSH lets someone sign in to the NAS's command line from another computer, type commands and copy files. Most people never need it.                                               |
| `users.term.systemGroup`        | System groups are made by the NAS and the programs on it. Some of them give a person power over the NAS itself.                                                                  |

---

## 4. A person's groups and shared folders

On a person's page (2.2, items 7 and 8) and, in the same components, in the add flow (section 6).

### 4.1 Groups

1. `h2` "Groups", and under it, `text-sm`: 0.1's `shares.term.group`, then "Groups give no other
   powers on the NAS."
2. **The group picker** (`MemberPicker`, new in the library, section 16): one checkbox per group from
   `getGroupList`, in natural order of name, each with its description under it; a search field and a
   "Show: All groups / Groups {{name}} is in" filter appear when there are more than ten; paged in the
   browser at 50; a count line "In {{count}} of {{total}} groups."
3. Buttons "Save groups" (filled within the section) and "Discard changes".

On "Save groups": `getUser` re-read, 0.11's checks; then `setUser` with the groups of 0.5 (every system
group kept). Saved: toast "Groups of {{name}} saved.", 0.4's note, and, `text-sm`, "Computers that are
connected now may need to connect again to use the new groups." **[verify]** when a connected SMB
session sees a membership change. The Shared folders section (4.2) re-reads, since its "through a
group" lines change. Failed: `InlineAlert` with the server's message; the choices stay.

| State          | Look                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Loading        | Five skeleton lines                                                                                          |
| Error          | `InlineAlert`: "Could not read the groups." + server message + "Try again". Saving is unavailable            |
| Empty          | "There are no groups yet." and 0.1's group sentence, with router link "Add a group" → `/usermgmt/groups/add` |
| Filtered empty | "No groups match "{{search}}"." with "Clear the search"                                                      |
| Saving         | Every checkbox unavailable; "Save groups" shows "Saving…"                                                    |

### 4.2 Shared folders

This is the link the shares slice's grid points back to, the other way round: the same choices, with
folders as rows (section 21, P13).

1. `h2` "Shared folders", with the pending mark when 0.4 says so. Under it, `text-sm`: "Choose which
   shared folders {{name}} may open from other computers. The same choices are on each shared folder's
   page."
2. **The access grid** (the shares slice's `AccessGrid`, extended, section 16) with one row per shared
   folder from `ShareMgmt.getList`, in natural order of name:

   | Column  | Display                                                                                                                                                                                                                                                                                                                                                                                      |
   | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Name    | The folder's name as a router link to its page, at its "Who can use it" section, accessible name "Open shared folder {{folder}}"; under it, `text-sm muted-foreground`, the folder's description                                                                                                                                                                                             |
   | Sharing | The shares list's words (its 1.3): "Windows and Mac", "Windows and Mac (off)", "Guests too", or "Not shared"; a folder that is not OK shows its pill and status word instead                                                                                                                                                                                                                 |
   | Access  | The segmented choice: **Read and write**, **Read only**, **No access**, and **Blocked** only where 0 is stored (the shares slice's 0.4). Under it, the group lines of that model, the other way round: "Also gets Read and write as a member of family." / "Blocked: cannot open it, even through family." / with guest access on, "Anyone on your network can open it, without a password." |

3. Above the grid, the grid's own toolbar: "Search shared folders", "Show: All folders / With access /
   Changed", "Set all shown to".
4. Under the grid: the change count and **"Save access"** / "Discard changes" (the shares slice's 3.3),
   then, `text-sm muted-foreground`, the shares slice's sentence about file permissions on the disk
   (`access.network`) with its classic link.

**On "Save access"**: for each changed folder, in natural order: its row re-read from
`ShareMgmt.getList`, 0.10's last-access check, then `ShareMgmt.setPrivileges` with 0.11's list. A step
line under the buttons, polite, says "Saving access to {{done}} of {{count}} folders…".

- All saved: toast "Access of {{name}} saved.", the band appears, the changed marks clear, the pending
  mark appears beside the heading, focus stays on "Save access".
- **A folder refused by 0.10**: that folder is not written, its row keeps the change and shows, in the
  row: "{{name}} is the only one with access to {{folder}}, which is shared with Windows and Mac
  computers. Give someone else access on its page, or stop sharing it, first." The others are saved.
- **A write failed**: the folders saved so far stay saved; an `InlineAlert` above the buttons: "Access
  to {{saved}} saved. Access to {{failed}} could not be saved: {{message}}" with "Try again" (only the
  folders not saved). Never retried by itself (UI-14).
- A folder changed elsewhere since it was read: the shares slice's 0.10 rule for that folder ("Access
  to {{folder}} was changed elsewhere since you opened this page."), the others saved.

| State                      | Look                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading                    | The grid's skeleton rows (5); "Loading shared folders…"                                                                                                                        |
| `ShareMgmt.getList` failed | `EmptyState variant="error"` in the grid: "Could not read the shared folders." + server message + "Try again". Saving is unavailable                                           |
| SMB lists failed           | The Sharing column says "Not known"; access can still be saved                                                                                                                 |
| Empty (no shared folder)   | `EmptyState variant="empty"`: "There are no shared folders yet. Make one, then choose who may open it." with router link "Add a shared folder" → `/storage/shared-folders/add` |
| Filtered empty             | "No shared folders match "{{search}}"." with "Clear the search"                                                                                                                |
| Saving                     | Every row unavailable ("Saving…"); the step line                                                                                                                               |

### 4.3 Copy

| Key                        | English                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personGroups.title`       | Groups                                                                                                                                                                           |
| `personGroups.noPowers`    | Groups give no other powers on the NAS.                                                                                                                                          |
| `personGroups.search`      | Search groups                                                                                                                                                                    |
| `personGroups.show`        | Show                                                                                                                                                                             |
| `personGroups.show.all`    | All groups                                                                                                                                                                       |
| `personGroups.show.member` | Groups {{name}} is in                                                                                                                                                            |
| `personGroups.count`       | In {{count}} of {{total}} groups.                                                                                                                                                |
| `personGroups.save`        | Save groups                                                                                                                                                                      |
| `personGroups.discard`     | Discard changes                                                                                                                                                                  |
| `personGroups.saving`      | Saving…                                                                                                                                                                          |
| `personGroups.saved`       | Groups of {{name}} saved.                                                                                                                                                        |
| `personGroups.reconnect`   | Computers that are connected now may need to connect again to use the new groups.                                                                                                |
| `personGroups.loadFailed`  | Could not read the groups.                                                                                                                                                       |
| `personGroups.empty`       | There are no groups yet.                                                                                                                                                         |
| `personGroups.emptyLink`   | Add a group                                                                                                                                                                      |
| `personGroups.filtered`    | No groups match "{{search}}".                                                                                                                                                    |
| `personAccess.title`       | Shared folders                                                                                                                                                                   |
| `personAccess.intro`       | Choose which shared folders <name></name> may open from other computers. The same choices are on each shared folder's page.                                                      |
| `personAccess.col.folder`  | Shared folder                                                                                                                                                                    |
| `personAccess.col.sharing` | Sharing                                                                                                                                                                          |
| `personAccess.notShared`   | Not shared                                                                                                                                                                       |
| `personAccess.open`        | Open shared folder {{folder}}                                                                                                                                                    |
| `personAccess.guests`      | Anyone on your network can open it, without a password.                                                                                                                          |
| `personAccess.search`      | Search shared folders                                                                                                                                                            |
| `personAccess.show.all`    | All folders                                                                                                                                                                      |
| `personAccess.count`       | {{shown}} of {{total}} shared folders.                                                                                                                                           |
| `personAccess.progress`    | Saving access to {{done}} of {{count}} folders…                                                                                                                                  |
| `personAccess.saved`       | Access of {{name}} saved.                                                                                                                                                        |
| `personAccess.lastAccess`  | <name></name> is the only one with access to <folder></folder>, which is shared with Windows and Mac computers. Give someone else access on its page, or stop sharing it, first. |
| `personAccess.partial`     | Access to {{saved}} saved. Access to {{failed}} could not be saved: {{message}}                                                                                                  |
| `personAccess.loading`     | Loading shared folders…                                                                                                                                                          |
| `personAccess.loadFailed`  | Could not read the shared folders.                                                                                                                                               |
| `personAccess.empty`       | There are no shared folders yet. Make one, then choose who may open it.                                                                                                          |
| `personAccess.emptyLink`   | Add a shared folder                                                                                                                                                              |
| `personAccess.filtered`    | No shared folders match "{{search}}".                                                                                                                                            |

The shares slice's `access.*` keys (the three choices, Blocked, "Changed", the toolbar, the change
count, Save access, Discard changes, `access.network`) are reused as they are.

---

## 5. Set a new password

On a person's page (2.2, item 9).

### 5.1 The section

`h2` "Password", `text-sm`: "The password is never shown. Setting a new one replaces the old one at
once." Then the button **"Set a new password…"** (neutral). For the signed-in person, in place of the
button: "This is you. Change your own password under Your account." with router link "Change your
password" → `/account/password` (OMV's own method for it, and the page that asks the reader's current
session for nothing more).

### 5.2 The dialog

`Dialog` (not destructive: nothing is erased; it cuts the old password), `h2` "Set a new password for
{{name}}":

1. "{{name}} signs in with the new password from now on, here and from their computers. Computers and
   phones that saved the old password to open shared folders must be given the new one."
2. "New password" (masked, reveal toggle, `autocomplete="new-password"`), hint: "A long password that
   {{name}} uses nowhere else is hardest to guess." 0.7's unencrypted-connection line when not HTTPS.
3. "Type it again" (masked, reveal toggle, `autocomplete="new-password"`).
4. Buttons: "Cancel" and **"Set password"** (filled primary).

Checked on "Set password": not empty ("Enter a new password."), no line break (pasting one: "A
password cannot contain a line break."), the two the same ("The two passwords are not the same.").
Then `getUser` re-read and 0.11's checks; `setUser` with the row as read and `password` set.

- Set: both fields cleared, the dialog closes, toast "The password of {{name}} is changed. It works
  now." (the password is not in it), 0.4's note under the section, focus back on "Set a new
  password…".
- Failed: both fields cleared (0.7), the dialog stays with the server's message above the fields:
  "The password was not changed." + message; focus on the first field.
- The request was cut: "Could not tell whether the password was changed. Set it again to be sure."
  (both fields cleared; setting the same password twice is harmless).

### 5.3 Copy

| Key                         | English                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `password.title`            | Password                                                                                                                                                                                    |
| `password.intro`            | The password is never shown. Setting a new one replaces the old one at once.                                                                                                                |
| `password.open`             | Set a new password…                                                                                                                                                                         |
| `password.self`             | This is you. Change your own password under Your account.                                                                                                                                   |
| `password.selfLink`         | Change your password                                                                                                                                                                        |
| `password.dialog.title`     | Set a new password for {{name}}                                                                                                                                                             |
| `password.dialog.body`      | <name></name> signs in with the new password from now on, here and from their computers. Computers and phones that saved the old password to open shared folders must be given the new one. |
| `password.new`              | New password                                                                                                                                                                                |
| `password.newHint`          | A long password that <name></name> uses nowhere else is hardest to guess.                                                                                                                   |
| `password.again`            | Type it again                                                                                                                                                                               |
| `password.show`             | Show password                                                                                                                                                                               |
| `password.hide`             | Hide password                                                                                                                                                                               |
| `password.notEncrypted`     | This connection is not encrypted, so this password can be read by others on your network.                                                                                                   |
| `password.notEncryptedLink` | Turn on HTTPS                                                                                                                                                                               |
| `password.empty`            | Enter a new password.                                                                                                                                                                       |
| `password.lineBreak`        | A password cannot contain a line break.                                                                                                                                                     |
| `password.mismatch`         | The two passwords are not the same.                                                                                                                                                         |
| `password.cancel`           | Cancel                                                                                                                                                                                      |
| `password.set`              | Set password                                                                                                                                                                                |
| `password.setting`          | Setting…                                                                                                                                                                                    |
| `password.done`             | The password of {{name}} is changed. It works now.                                                                                                                                          |
| `password.failed`           | The password was not changed.                                                                                                                                                               |
| `password.unknown`          | Could not tell whether the password was changed. Set it again to be sure.                                                                                                                   |

---

## 6. Add a person (Flow B)

Route `/usermgmt/users/add`, no menu item; reached from the Users list's toolbar and empty state, and
from the shares slice's access grid when it is empty (section 13). Breadcrumbs: "Users" › "Add a
person". It follows R1 to R10 with the library's job-runner parts, and is the UX audit's Flow B (its
4.3), with Q5's shell rule.

### 6.1 Pre-flight (R1)

On opening, the page reads `dirtyModules`. If anything is pending, the flow does not start (Q2):
`PreflightNotice` "Some changes are not applied yet", the band's list in words, and "Apply them now" /
"Undo them". Then it reads, in parallel: `getUserList`, `getGroupList`, `ShareMgmt.getList`,
`SMB.getShareList`, `SMB.getSettings`, `SSH.get`, `Services.getStatus`, `UserMgmt.getSettings`, and
`getGroup` for `openmediavault-admin` and `_ssh`. Any failure of the first three: the fail-closed
state, "Could not read what this NAS needs to add a person." + the failing read's name in words +
server message + "Try again". The others only take away what they feed (the SSH line, the home-folder
line, the Sharing column, the two privilege checkboxes, as 3.6 says).

### 6.2 Decisions, in one form

`JobRunner` with the title "Add a person" (`h2`; the page title is "Users").

**B1. Name** (`TextField`, label "Name", required, `autocomplete="off"`, `spellcheck="false"`,
`autocapitalize="none"`). Hint: "{{name}} signs in with this name, here and from their computers. It
cannot be changed later." with `{{name}}` read "They" while empty. Placeholder: "For example: alex".
Checked on blur by 0.6's character and length rules, one message at a time; on Continue also by the
reserved names; at step 1 by the reads.

**B2. Password** (0.7): "Password" and "Type it again", with 5.2's hint and the unencrypted line.

**B3. Email address** (optional), 2.5's field and hint.

**B4. Description** (optional), 2.5's field and hint.

**B5. Groups**: the group picker of 4.1, nothing ticked. With no groups, the line "There are no groups
yet. You can add {{name}} to groups later." and no picker.

**B6. Shared folders**: the grid of 4.2 with every row at **No access** (the UX audit's default, A5),
its intro: "Choose which shared folders they may open from other computers. You can change this later
on their page or on each folder's page." Its group lines follow B5's ticks as they change. With no
shared folders, 4.2's empty state.

**B7. What they can do**: section 3's two checkboxes, both unticked, with their hints and warnings;
no "Other system groups" (a new person has none).

**What the flow does with the account** (read only, no field), `text-sm`: "They can sign in here to
change their own password." and, when home folders are on, "They get a private home folder in
{{folder}}."

Button at the end: **"Continue"** (filled) to the summary. The breadcrumb leads back.

**Checked on Continue**, with the message at the field and focus moved to the first one: the name
(0.6, the pattern and reserved names), both passwords (0.7), the email address, the description.

### 6.3 Summary and confirmation (R2)

`JobSummary`, title "Ready to add {{name}}", one item per thing that happens, in the order it happens:

- "Add the person {{name}}, who signs in with the password you typed." (the password is never shown,
  0.7); with an email address: "Email for {{name}} goes to {{email}}."; with a description, it is
  quoted.
- Groups: "Member of {{list}}." or "Not in any group."
- Access, grouped: "Read and write: {{list}}." / "Read only: {{list}}." / through groups: "Through
  {{group}}: {{list}}." / with none: "No access to any shared folder yet."
- Administrator, when chosen, its own item with the warning-shape icon: "{{name}} becomes an
  administrator of this NAS: they can change every setting, and read and delete every file."
- SSH, when chosen, its own item with the warning-shape icon: "{{name}} may sign in over SSH and use
  the NAS's command line." and 3.3's SSH line when SSH is off.
- When home folders are on: "A private home folder is made for {{name}} in {{folder}}."
- "The account works as soon as it is made. Then the changes to shared folders and email are
  applied. No other change is pending."

**No typed confirmation**: nothing is erased (UI-8 types only for data loss). The confirm button is
**"Add person"** (filled primary), with "Change choices" (neutral) beside it, which returns to the form
with every choice kept **except the passwords**, which are kept in memory only while the summary is
open and cleared if the reader goes back (0.7), so the form asks for them again. No form around the
summary, so Enter in it does nothing; on arrival focus moves to the summary's heading.

### 6.4 The steps (R3, R5)

A `JobRunner` step list, each step's state in words:

| #   | Step                            | Calls                                                                                                                                                                                                                              | Notes                                                                                                                                                             |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Check the choices"             | `getUser` and `getGroup` for the name (both must answer "does not exist", 0.11), `dirtyModules`, `getGroupList` (the chosen groups still exist), `getGroup` for each privilege group chosen                                        | Stops with "There is now an account called {{name}}." / "There is now a group called {{name}}." / "The group {{group}} no longer exists." / a pending change (R1) |
| 2   | "Add the person"                | `setUser` (0.11's new-person fields)                                                                                                                                                                                               | **Takes effect at once** (B5): the account, its password for signing in and for Windows and Mac sharing, its groups, its home folder                              |
| 3   | "Give access to shared folders" | `ShareMgmt.getList`, then `ShareMgmt.setPrivileges` per chosen folder (0.11)                                                                                                                                                       | Only when any access was chosen                                                                                                                                   |
| 4   | "Save and finish"               | R10: re-read `dirtyModules`; expected `postfix`, and with access `sharedfolders`, `systemd`, plus `samba`, `avahi` when a chosen folder is shared over SMB; anything else listed in the confirmation; then `Config.applyChangesBg` | The checkpoint; the task's output on the terminal pair, as Flow A's                                                                                               |
| 5   | "Check that {{name}} is ready"  | `getUser` (the groups and shell as chosen), `ShareMgmt.getList` (the entries as chosen)                                                                                                                                            |                                                                                                                                                                   |

Leaving the page does not stop the run (the session store); coming back shows it. A reload ends the
view (R8); the Users list's unfinished-work lines (1.5) recognise what was left.

### 6.5 Result

`JobResult` succeeded, announced politely:

- Title: "{{name}} is ready."
- With access: "They can open {{list}} from a Windows computer or a Mac, signing in as {{name}} with
  the password you set." Without: "They cannot open any shared folder yet. Choose some on their page."
- "They can also sign in here, at this address, to change their own password."
- Router links "Open {{name}}" and "Add another person".

### 6.6 Failures (R6, R7, R10)

| Fails at                                                                        | The NAS is left                                                                                                  | The reader sees                                                                                        | Offered                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 check                                                                         | nothing done                                                                                                     | the reason                                                                                             | "Change choices"                                                                                                                                                                                                                                                            |
| 2, and `getUser` then finds no such account                                     | nothing done that matters (OMV may keep its own record of the name, which the next try reuses, read from source) | "{{name}} was not added." + server message                                                             | "Try again" (asks for the password again, 0.7); "Change choices"                                                                                                                                                                                                            |
| 2, the account was made but the request failed after (the password, the groups) | an account that may not have its password or groups                                                              | "{{name}} was added, but not everything was set up." + server message                                  | "Finish setting up {{name}}" (re-reads with `getUser`, then `setUser` with the same choices and the password asked for again); "Delete {{name}} again" (`deleteUser`, plain confirmation: "Nothing of theirs is kept.", with the home folder line of 7.3 when one was made) |
| 3                                                                               | the account made and in effect; some access saved, none applied                                                  | "{{name}} was added, but access to {{folders}} could not be saved." + server message                   | "Try this step again"; "Stop here", saying: "{{name}} is on the NAS and can sign in. The access saved so far is pending in the band. If you undo it there, {{name}} stays on the NAS; delete them on their page if they should not." (B4, V4)                               |
| 4 apply                                                                         | R7's mix (B3)                                                                                                    | "Applying the changes failed." + the task's last lines                                                 | R7: "Try applying again" first; then "Stop here", saying what is still pending                                                                                                                                                                                              |
| 5 not as chosen                                                                 | applied                                                                                                          | "{{name}} was added, but {{what}} is not as you chose." ("their groups", "their access to {{folder}}") | "Check again"; router link "Open {{name}}"                                                                                                                                                                                                                                  |
| A request cut (session, network) at any write                                   | not known                                                                                                        | "Could not tell whether "{{step}}" finished."                                                          | "Check again" (the reads of step 1, then the run resumes at the first step whose effect is not seen; a cut step 2 asks for the password again)                                                                                                                              |

Never retried by itself (UI-14). **Undo is never offered once step 2 has run** (V4): Undo in the band
would drop OMV's record and leave the account. The way back is "Delete {{name}} again".

### 6.7 Keyboard and screen readers

The form in reading order: Name, the two passwords (each field then its "Show password" toggle),
Email address, Description, the group picker (its search and filter, then one checkbox per group),
the access grid (its toolbar, then one tab stop per row), the two privilege checkboxes, Continue.
Field errors are linked by `aria-describedby`; on Continue with errors, focus moves to the first and
the count is announced ("2 things to fix"). The warning alerts are the checkboxes' descriptions. The
summary is a heading and a list; the run's step changes are announced politely, a failure
assertively with focus on its heading, the result politely. No announcement ever contains the
password, its length or whether it was revealed.

### 6.8 Copy

| Key                                    | English                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addPerson.title`                      | Add a person                                                                                                                                                                                     |
| `addPerson.breadcrumb`                 | Add a person                                                                                                                                                                                     |
| `addPerson.readsFailed`                | Could not read what this NAS needs to add a person.                                                                                                                                              |
| `addPerson.name.label`                 | Name                                                                                                                                                                                             |
| `addPerson.name.hint`                  | {{name}} signs in with this name, here and from their computers. It cannot be changed later.                                                                                                     |
| `addPerson.name.hintEmpty`             | They sign in with this name, here and from their computers. It cannot be changed later.                                                                                                          |
| `addPerson.name.placeholder`           | For example: alex                                                                                                                                                                                |
| `addPerson.name.length`                | Use 1 to 32 characters.                                                                                                                                                                          |
| `addPerson.name.chars`                 | Use small letters a to z, digits, and . _ or -, starting with a letter.                                                                                                                          |
| `addPerson.name.reserved`              | {{name}} is a name the NAS or Windows keeps for itself. Choose another name.                                                                                                                     |
| `addPerson.name.takenPerson`           | There is already a person called {{name}}.                                                                                                                                                       |
| `addPerson.name.takenSystem`           | {{name}} is a name the NAS uses for itself. Choose another name.                                                                                                                                 |
| `addPerson.name.takenGroup`            | There is already a group called {{name}}. Choose a name no group uses, so the two cannot be confused.                                                                                            |
| `addPerson.password.label`             | Password                                                                                                                                                                                         |
| `addPerson.password.hint`              | A long password that this person uses nowhere else is hardest to guess. Anyone who knows it can open the shared folders this person can.                                                         |
| `addPerson.password.again`             | Type it again                                                                                                                                                                                    |
| `addPerson.password.empty`             | Enter a password.                                                                                                                                                                                |
| `addPerson.groups.none`                | There are no groups yet. You can add {{name}} to groups later.                                                                                                                                   |
| `addPerson.access.intro`               | Choose which shared folders they may open from other computers. You can change this later on their page or on each folder's page.                                                                |
| `addPerson.accountNote`                | They can sign in here to change their own password.                                                                                                                                              |
| `addPerson.homeNote`                   | They get a private home folder in <folder></folder>.                                                                                                                                             |
| `addPerson.continue`                   | Continue                                                                                                                                                                                         |
| `addPerson.check.count_one` / `_other` | {{count}} thing to fix / {{count}} things to fix                                                                                                                                                 |
| `addPerson.sum.title`                  | Ready to add {{name}}                                                                                                                                                                            |
| `addPerson.sum.add`                    | Add the person <name></name>, who signs in with the password you typed.                                                                                                                          |
| `addPerson.sum.email`                  | Email for <name></name> goes to <email></email>.                                                                                                                                                 |
| `addPerson.sum.description`            | Described as "<description></description>".                                                                                                                                                      |
| `addPerson.sum.groups`                 | Member of {{list}}.                                                                                                                                                                              |
| `addPerson.sum.noGroups`               | Not in any group.                                                                                                                                                                                |
| `addPerson.sum.rw`                     | Read and write: {{list}}.                                                                                                                                                                        |
| `addPerson.sum.ro`                     | Read only: {{list}}.                                                                                                                                                                             |
| `addPerson.sum.viaGroup`               | Through <group></group>: {{list}}.                                                                                                                                                               |
| `addPerson.sum.noAccess`               | No access to any shared folder yet.                                                                                                                                                              |
| `addPerson.sum.admin`                  | <name></name> becomes an administrator of this NAS: they can change every setting, and read and delete every file.                                                                               |
| `addPerson.sum.ssh`                    | <name></name> may sign in over SSH and use the NAS's command line.                                                                                                                               |
| `addPerson.sum.home`                   | A private home folder is made for <name></name> in <folder></folder>.                                                                                                                            |
| `addPerson.sum.order`                  | The account works as soon as it is made. Then the changes to shared folders and email are applied. No other change is pending.                                                                   |
| `addPerson.confirm`                    | Add person                                                                                                                                                                                       |
| `addPerson.changeChoices`              | Change choices                                                                                                                                                                                   |
| `addPerson.step.check`                 | Check the choices                                                                                                                                                                                |
| `addPerson.step.add`                   | Add the person                                                                                                                                                                                   |
| `addPerson.step.access`                | Give access to shared folders                                                                                                                                                                    |
| `addPerson.step.apply`                 | Save and finish                                                                                                                                                                                  |
| `addPerson.step.verify`                | Check that {{name}} is ready                                                                                                                                                                     |
| `addPerson.task.apply`                 | Apply the changes for {{name}}                                                                                                                                                                   |
| `addPerson.fail.takenAccount`          | There is now an account called <name></name>.                                                                                                                                                    |
| `addPerson.fail.takenGroup`            | There is now a group called <name></name>.                                                                                                                                                       |
| `addPerson.fail.groupGone`             | The group <group></group> no longer exists.                                                                                                                                                      |
| `addPerson.fail.notAdded`              | {{name}} was not added.                                                                                                                                                                          |
| `addPerson.fail.partlyAdded`           | {{name}} was added, but not everything was set up.                                                                                                                                               |
| `addPerson.fail.finish`                | Finish setting up {{name}}                                                                                                                                                                       |
| `addPerson.fail.deleteAgain`           | Delete {{name}} again                                                                                                                                                                            |
| `addPerson.fail.deleteAgainBody`       | Nothing of theirs is kept.                                                                                                                                                                       |
| `addPerson.fail.access`                | {{name}} was added, but access to {{folders}} could not be saved.                                                                                                                                |
| `addPerson.fail.stopHere`              | Stop here                                                                                                                                                                                        |
| `addPerson.fail.stopBody`              | <name></name> is on the NAS and can sign in. The access saved so far is pending in the band. If you undo it there, <name></name> stays on the NAS; delete them on their page if they should not. |
| `addPerson.fail.apply`                 | Applying the changes failed.                                                                                                                                                                     |
| `addPerson.fail.notAsChosen`           | {{name}} was added, but {{what}} is not as you chose.                                                                                                                                            |
| `addPerson.fail.what.groups`           | their groups                                                                                                                                                                                     |
| `addPerson.fail.what.access`           | their access to {{folder}}                                                                                                                                                                       |
| `addPerson.fail.unknown`               | Could not tell whether “{{step}}” finished.                                                                                                                                                      |
| `addPerson.tryAgain`                   | Try again                                                                                                                                                                                        |
| `addPerson.tryStep`                    | Try this step again                                                                                                                                                                              |
| `addPerson.tryApply`                   | Try applying again                                                                                                                                                                               |
| `addPerson.checkAgain`                 | Check again                                                                                                                                                                                      |
| `addPerson.done.title`                 | {{name}} is ready.                                                                                                                                                                               |
| `addPerson.done.access`                | They can open {{list}} from a Windows computer or a Mac, signing in as <name></name> with the password you set.                                                                                  |
| `addPerson.done.noAccess`              | They cannot open any shared folder yet. Choose some on their page.                                                                                                                               |
| `addPerson.done.account`               | They can also sign in here, at this address, to change their own password.                                                                                                                       |
| `addPerson.done.open`                  | Open {{name}}                                                                                                                                                                                    |
| `addPerson.done.another`               | Add another person                                                                                                                                                                               |

---

## 7. Delete a person

`UserMgmt.deleteUser {name}`. Read from source: it removes the account (the system's account tool,
forced, **without** removing the home folder or any file), then OMV's record of the person (email
address, SSH keys), and Windows and Mac sharing's entry for them at once. It does **not** touch any
shared folder's access list, scheduled job, Rsync server module or add-on setting that names them.
It marks Email pending, and SSH when they had keys (0.9).

### 7.1 The section

`h2` "Delete this person", last on the page, after a divider. `text-sm`: "Deleting {{name}} removes
their account: they can no longer sign in here or open shared folders from their computers. Their
files stay on the NAS." Then **"Delete {{name}}…"** (neutral; the destructive form is only on the
dialog's confirm button). Unavailable (`aria-disabled`, focusable) with the reason beside it:

| Blocker                                              | Words                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The signed-in person                                 | "You cannot delete the account you are signed in with. Another administrator can."           |
| The signed-in person not known, and an administrator | 0.8's sentence                                                                               |
| A read failed                                        | "Could not check what uses {{name}}, so they cannot be deleted now." + message + "Try again" |
| An action on them is running in this session         | "Wait for {{action}} to finish."                                                             |

### 7.2 The check before the dialog

Pressing the button re-reads `getUser`, `ShareMgmt.getList`, `SMB.getShareList`, `UserMgmt.getSettings`
and `dirtyModules`. The dialog opens with "Checking what uses {{name}}…", then shows a refusal, the
pre-flight (other changes pending: "Apply them now" / "Undo them", 0.9), "{{name}} is no longer on
this NAS." or the confirmation.

### 7.3 The confirmation

`ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm (UI-8):

1. Title: "Delete {{name}}?"
2. **"What goes"** (`h3`), a list, each line only when it applies:
   - "Their account and password: {{name}} can no longer sign in here, or open shared folders from
     their computers."
   - "Their administrator rights." / "Their SSH sign-in." / "Their {{count}} SSH keys."
   - "Their membership of {{groups}}."
   - "Their email address on this NAS, {{email}}."
3. **"What stays"** (`h3`), a list:
   - "Their files, wherever they are on the NAS. The files keep their old owner, who is then shown as a
     number. A person you add later may be given the same number and so become the owner of these
     files." **[verify]** which account number the next new person gets.
   - With a home folder: "Their home folder, {{folder}} › {{name}}, with everything in it. If you add
     a person called {{name}} again, they get this folder." **[verify]**
4. **Access**, when any folder lists them: a `CheckboxField`, **ticked by default**: "Also take
   {{name}} off the access lists of {{count}} shared folders: {{list}}." Hint: "If you leave this,
   those folders keep an entry for {{name}}, and a person you add later with the same name gets that
   access." When ticked and a folder would be left with nobody while shared over SMB with guest access
   off: "After this, nobody can open {{folders}} from other computers: {{name}} was the only one with
   access." (not a refusal, 0.10).
5. `text-sm`: "Scheduled jobs, the Rsync server or add-ons set to use {{name}} stop working for them.
   This page cannot list them; look in the classic interface." (section 15.0)
6. Type to confirm: "Type {{name}} to confirm." (`typedMatches`, exact, spaces around ignored).
7. Buttons: "Cancel" (focused) and **"Delete person"** (`destructive`), unavailable until the name
   matches.

Typed, although no file is erased, because the account, its password and its keys cannot be brought
back, and a new account of the same name is a different account (section 21, P9).

### 7.4 On confirm

The reads of 7.2 run once more ("Checking again…"); a blocker switches to the refusal. Otherwise a step
list in the dialog:

1. "Delete the account": `deleteUser`. **Takes effect at once.**
2. "Take {{name}} off the access lists" (when ticked): per folder that lists them, its row re-read and
   `ShareMgmt.setPrivileges` without their entry (0.11; other entries for accounts that no longer
   exist are dropped too, as the shared folder's page does).
3. "Save the change" (R10: expected `postfix`, `ssh` when they had keys, and with step 2
   `sharedfolders`, `systemd`, plus `samba`, `avahi` for folders shared over SMB;
   `Config.applyChangesBg`).

**Result**: in place of the page, `JobResult` succeeded: "{{name}} was deleted. Their files are still
on the NAS." with a router link "Go to Users".

**Failures**: step 1 stays with the server's words ("{{name}} was not deleted."). Step 2: "{{name}}
was deleted, but {{folders}} still list them." with "Try this step again" and "Stop here" ("The
shared folders' pages drop the entry the next time access is saved there."). Step 3 has R7's "Try
applying again" first, then "Stop here", saying the person is deleted and the change stays pending in
the band. A cut request: "Could not tell whether {{name}} was deleted." with "Check again" (re-reads
`getUserList`).

### 7.5 Keyboard and screen readers

Focus on Cancel; Tab order Cancel, the access checkbox, the typed field, the confirm button
(unavailable but focusable). The title and the two lists are the dialog's description, read with it.
Steps announced politely, a failure assertively, the result politely.

### 7.6 Copy

| Key                                     | English                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personDelete.title`                    | Delete this person                                                                                                                                                                                    |
| `personDelete.intro`                    | Deleting <name></name> removes their account: they can no longer sign in here or open shared folders from their computers. Their files stay on the NAS.                                               |
| `personDelete.open`                     | Delete {{name}}…                                                                                                                                                                                      |
| `personDelete.blocked.self`             | You cannot delete the account you are signed in with. Another administrator can.                                                                                                                      |
| `personDelete.blocked.unread`           | Could not check what uses <name></name>, so they cannot be deleted now.                                                                                                                               |
| `personDelete.blocked.running`          | Wait for {{action}} to finish.                                                                                                                                                                        |
| `personDelete.checking`                 | Checking what uses {{name}}…                                                                                                                                                                          |
| `personDelete.gone`                     | {{name}} is no longer on this NAS.                                                                                                                                                                    |
| `personDelete.dialog.title`             | Delete {{name}}?                                                                                                                                                                                      |
| `personDelete.goes.title`               | What goes                                                                                                                                                                                             |
| `personDelete.goes.account`             | Their account and password: <name></name> can no longer sign in here, or open shared folders from their computers.                                                                                    |
| `personDelete.goes.admin`               | Their administrator rights.                                                                                                                                                                           |
| `personDelete.goes.ssh`                 | Their SSH sign-in.                                                                                                                                                                                    |
| `personDelete.goes.keys_one` / `_other` | Their SSH key. / Their {{count}} SSH keys.                                                                                                                                                            |
| `personDelete.goes.groups`              | Their membership of {{groups}}.                                                                                                                                                                       |
| `personDelete.goes.email`               | Their email address on this NAS, <email></email>.                                                                                                                                                     |
| `personDelete.stays.title`              | What stays                                                                                                                                                                                            |
| `personDelete.stays.files`              | Their files, wherever they are on the NAS. The files keep their old owner, who is then shown as a number. A person you add later may be given the same number and so become the owner of these files. |
| `personDelete.stays.home`               | Their home folder, <folder></folder> › <name></name>, with everything in it. If you add a person called <name></name> again, they get this folder.                                                    |
| `personDelete.access_one` / `_other`    | Also take <name></name> off the access list of {{count}} shared folder: {{list}}. / Also take <name></name> off the access lists of {{count}} shared folders: {{list}}.                               |
| `personDelete.accessHint`               | If you leave this, those folders keep an entry for <name></name>, and a person you add later with the same name gets that access.                                                                     |
| `personDelete.leavesNobody`             | After this, nobody can open {{folders}} from other computers: <name></name> was the only one with access.                                                                                             |
| `personDelete.elsewhere`                | Scheduled jobs, the Rsync server or add-ons set to use <name></name> stop working for them. This page cannot list them; look in the classic interface.                                                |
| `personDelete.typePrompt`               | Type {{name}} to confirm.                                                                                                                                                                             |
| `personDelete.typeHint`                 | The button is available once the name matches.                                                                                                                                                        |
| `personDelete.confirm`                  | Delete person                                                                                                                                                                                         |
| `personDelete.cancel`                   | Cancel                                                                                                                                                                                                |
| `personDelete.checkingAgain`            | Checking again…                                                                                                                                                                                       |
| `personDelete.step.delete`              | Delete the account                                                                                                                                                                                    |
| `personDelete.step.access`              | Take {{name}} off the access lists                                                                                                                                                                    |
| `personDelete.step.save`                | Save the change                                                                                                                                                                                       |
| `personDelete.done`                     | <name></name> was deleted. Their files are still on the NAS.                                                                                                                                          |
| `personDelete.toList`                   | Go to Users                                                                                                                                                                                           |
| `personDelete.failed`                   | {{name}} was not deleted.                                                                                                                                                                             |
| `personDelete.failed.access`            | <name></name> was deleted, but {{folders}} still list them.                                                                                                                                           |
| `personDelete.failed.accessStop`        | The shared folders' pages drop the entry the next time access is saved there.                                                                                                                         |
| `personDelete.failed.saveBody`          | <name></name> is deleted. Saving the change failed, so it stays pending in the band.                                                                                                                  |
| `personDelete.unknown`                  | Could not tell whether {{name}} was deleted.                                                                                                                                                          |
| `personDelete.checkAgain`               | Check again                                                                                                                                                                                           |

---

## 8. Users > Groups

**Question it answers:** which groups are there, who is in each, and what can each open? **Leads
to:** a group's page; adding a group.

Administrators only. Route `/usermgmt/groups`: the menu item Users > Groups gains this route.

### 8.1 Data

`UserMgmt.getGroupList` (exists), whole; `UserMgmt.getUserList` (exists, shared), for the members'
names; `ShareMgmt.getList` (shared), for how many folders each group can open; `System.getInformation`.
Read on opening, Refresh and window focus.

### 8.2 Layout

1. Page title "Groups".
2. Intro: 0.1's group sentence, and "Give a group access to a shared folder, and everyone in it gets
   that access. Groups give no other powers on the NAS."
3. Toolbar: `SearchField` "Search groups" (name, description, member names); on the trailing side
   **"Add a group"**, a filled primary router link to `/usermgmt/groups/add`.
4. The table: Name (router link, "Open group {{group}}"), Description ("None"), Members ("{{count}}
   members: {{list}}", at most three names then "and {{count}} more"; "Nobody"), Shared folders (the
   number of folders whose list gives the group Read and write or Read only, "None"). Sort by name,
   description and the two counts, in the browser; pages at 50. Under 640px, Name and Members as
   columns, the rest on a second line.
5. Footer, `text-sm muted-foreground`: "System groups, which the NAS and its programs make, are not
   listed. Importing many groups at once is in the classic interface." with `ExternalLink` "Groups in
   the classic interface" → `/#/usermgmt/groups`.

### 8.3 States

| State            | Look                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading          | Five skeleton rows; "Loading groups…"                                                                                                                                                          |
| Error            | `EmptyState variant="error"`: "Could not read the groups." + server message + "Try again"                                                                                                      |
| Side read failed | `getUserList`: members shown by count only. `ShareMgmt.getList`: the Shared folders column says "Not known"                                                                                    |
| Empty            | `EmptyState variant="empty"`: "There are no groups yet. A group is a set of people; give it access to a shared folder, and everyone in it gets that access." Action: router link "Add a group" |
| Filtered empty   | "No groups match "{{search}}"." with "Clear the search"                                                                                                                                        |
| Populated        | As 8.2                                                                                                                                                                                         |

### 8.4 Keyboard

Tab order: the search, "Add a group", the sortable headers, each row's name link, the pagination, the
footer link. Focus on the page title on arrival.

### 8.5 Copy

| Key                                  | English                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `groups.title`                       | Groups                                                                                                                         |
| `groups.intro`                       | Give a group access to a shared folder, and everyone in it gets that access. Groups give no other powers on the NAS.           |
| `groups.search`                      | Search groups                                                                                                                  |
| `groups.add`                         | Add a group                                                                                                                    |
| `groups.open`                        | Open group {{group}}                                                                                                           |
| `groups.col.name`                    | Name                                                                                                                           |
| `groups.col.description`             | Description                                                                                                                    |
| `groups.col.members`                 | Members                                                                                                                        |
| `groups.col.folders`                 | Shared folders                                                                                                                 |
| `groups.members_one` / `_other`      | {{count}} member: {{list}} / {{count}} members: {{list}}                                                                       |
| `groups.membersCount_one` / `_other` | {{count}} member / {{count}} members                                                                                           |
| `groups.nobody`                      | Nobody                                                                                                                         |
| `groups.none`                        | None                                                                                                                           |
| `groups.footer`                      | System groups, which the NAS and its programs make, are not listed. Importing many groups at once is in the classic interface. |
| `groups.classicLink`                 | Groups in the classic interface                                                                                                |
| `groups.loading`                     | Loading groups…                                                                                                                |
| `groups.loadFailed`                  | Could not read the groups.                                                                                                     |
| `groups.empty`                       | There are no groups yet. A group is a set of people; give it access to a shared folder, and everyone in it gets that access.   |
| `groups.filtered`                    | No groups match "{{search}}".                                                                                                  |

---

## 9. A group's page

**Question it answers:** who is in this group, and what can they open through it? **Leads to:**
changing its members, description and access; deleting it.

Administrators only. Route `/usermgmt/groups/$group`, `$group` the group's name, validated against
OMV's name pattern and found in the whole `getGroupList` read before any group-specific call (2's
rule). A system group is not in that list and is not found here. Users > Groups is current while it is
open.

### 9.1 Data on opening

`getGroupList`, `getUserList`, `ShareMgmt.getList`, `SMB.getShareList`, `SMB.getSettings` (all shared
with the pages above), `System.getInformation`. `getGroup` (new, cleared) is read immediately before
every write. Re-read on Refresh, after an action ends and on window focus, never over unsaved changes.

### 9.2 Layout

1. Breadcrumbs "Groups" › `{{group}}`.
2. Page title "{{group}}"; under it the description, or "Group".
3. **Summary card**: Name (with 0.6's rename disclosure in its group form), Description (the
   `comment`, "None", with "Edit" in place, 9.3), Members ("{{count}} members"), Technical details
   (`Disclosure`: Group number, the `gid`).
4. **Members** (`h2`, 9.4), with the pending mark when 0.4 says so.
5. **Shared folders** (`h2`, 9.5), with the pending mark when 0.4 says so.
6. After a divider: **"Delete this group"** (section 11).

Document title: "{{group}} – Groups".

### 9.3 Editing the description

"Edit" turns the value into a `TextField` "Description" (optional, at most 65 characters, the classic
form's limit **[verify]** OMV's) with "Save" and "Cancel". Hint: "Shown in lists, to help you tell
groups apart." On Save: `getGroup` re-read, 0.11's checks, `setGroup` with the comment changed.
Saved: toast "Description of {{group}} saved."; the band shows Windows and Mac sharing pending (0.9)
with 0.4's note in its group form: "Saved. The NAS also lists Windows and Mac sharing as not applied:
applying it restarts sharing so connected computers see the change." (`groups.savedNote`).

### 9.4 Members

1. `text-sm`: "Everyone in {{group}} gets the access the group has to shared folders."
2. **The member picker** (`MemberPicker`): one checkbox per person from `getUserList`, in natural order,
   each with their description under the name; a search field and "Show: Everyone / Members" filter
   when there are more than ten; paged at 50; "{{count}} of {{total}} people are members." A member
   whose main group this is (0.5) is ticked and unavailable: "This is {{name}}'s main group, set
   outside this interface."
3. Buttons **"Save members"** and "Discard changes".

On "Save members": `getGroup` re-read; if its members changed since the page read them, the shares
slice's changed-elsewhere rule ("The members of {{group}} were changed elsewhere since you opened this
page." with "Show the current members"); then `setGroup` with the whole list. Saved: toast "Members of
{{group}} saved.", `groups.savedNote`, and the Shared folders section's group lines re-read. Failed:
`InlineAlert` with the server's message (OMV names a member it could not find); the choices stay.

No confirmation for taking someone out: nothing on the disk changes, the person keeps every access of
their own, and the change can be made again here. The change count ("{{count}} changes not saved.")
and the "Members" filter make it reviewable before saving, as the access grid's do (the shares slice's
D10).

### 9.5 Shared folders

Section 4.2's grid and rules with the group in place of the person: rows are shared folders, the
choice is the group's own entry, and the group lines become "{{count}} members also have their own
access to this folder." when any member has an entry of their own, which wins for that member (the
shares slice's 0.4, observed). The last-access refusal (0.10) applies to the group's entry as to a
person's.

### 9.6 States

As 2.6, with "Loading this group…", "There is no group called {{group}} on this NAS. It may have been
deleted." and router link "Go to Groups", "Could not read this group.".

### 9.7 Keyboard

Breadcrumbs, the summary's Edit and disclosures, the member picker (search, filter, one checkbox per
person), Save members, the access grid (toolbar, one tab stop per row), Save access, the delete
section. Focus on the page title on arrival.

### 9.8 Copy

| Key                                      | English                                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group.docTitle`                         | {{group}} – Groups                                                                                                                                   |
| `group.subtitleNone`                     | Group                                                                                                                                                |
| `group.fact.number`                      | Group number                                                                                                                                         |
| `group.rename.why`                       | Why can't I rename {{group}}?                                                                                                                        |
| `group.rename.body`                      | The name is what every shared folder's access list uses. To use another name, add a new group with the same members and access, and delete this one. |
| `group.description.hint`                 | Shown in lists, to help you tell groups apart.                                                                                                       |
| `group.description.saved`                | Description of {{group}} saved.                                                                                                                      |
| `groups.savedNote`                       | Saved. The NAS also lists Windows and Mac sharing as not applied: applying it restarts sharing so connected computers see the change.                |
| `group.members.title`                    | Members                                                                                                                                              |
| `group.members.intro`                    | Everyone in <group></group> gets the access the group has to shared folders.                                                                         |
| `group.members.search`                   | Search people                                                                                                                                        |
| `group.members.show.all`                 | Everyone                                                                                                                                             |
| `group.members.show.members`             | Members                                                                                                                                              |
| `group.members.count`                    | {{count}} of {{total}} people are members.                                                                                                           |
| `group.members.mainGroup`                | This is <name></name>'s main group, set outside this interface.                                                                                      |
| `group.members.save`                     | Save members                                                                                                                                         |
| `group.members.saved`                    | Members of {{group}} saved.                                                                                                                          |
| `group.members.changedElsewhere`         | The members of <group></group> were changed elsewhere since you opened this page.                                                                    |
| `group.members.showCurrent`              | Show the current members                                                                                                                             |
| `group.members.changes_one` / `_other`   | {{count}} change not saved. / {{count}} changes not saved.                                                                                           |
| `group.members.empty`                    | There is nobody on this NAS to add yet.                                                                                                              |
| `group.members.emptyLink`                | Add a person                                                                                                                                         |
| `group.access.intro`                     | Choose which shared folders the members of <group></group> may open from other computers. The same choices are on each shared folder's page.         |
| `group.access.ownEntries_one` / `_other` | {{count}} member also has their own access to this folder. / {{count}} members also have their own access to this folder.                            |
| `group.loading`                          | Loading this group…                                                                                                                                  |
| `group.notFound`                         | There is no group called {{group}} on this NAS. It may have been deleted.                                                                            |
| `group.toList`                           | Go to Groups                                                                                                                                         |
| `group.loadFailed`                       | Could not read this group.                                                                                                                           |

---

## 10. Add a group

Route `/usermgmt/groups/add`; breadcrumbs "Groups" › "Add a group". A short job-runner flow, for the
same reason as Flow B: the group is made at once, and Undo in the band would drop OMV's record of it
and leave the group (0.4). It refuses to start while other changes are pending (R1).

**Decisions, in one form** (`JobRunner` "Add a group"):

- **Name** (required), 0.6's group rules. Hint: "Shared folders' access lists show the group by this
  name. It cannot be changed later." Placeholder: "For example: family".
- **Description** (optional), 9.3's field.
- **Members**: 9.4's picker, nobody ticked.
- **Shared folders**: 9.5's grid, every row at No access.

**Summary** "Ready to add the group {{group}}": "Add the group {{group}}." / "Members: {{list}}." or
"Nobody is in it yet." / the access lines of 6.3 / "The group and its members work as soon as it is
made. Then the changes to shared folders are applied." Confirm **"Add group"** (filled), "Change
choices".

**Steps:** 1 "Check the choices" (`getGroup` and `getUser` for the name answer "does not exist",
`dirtyModules`, the chosen people still listed); 2 "Add the group" (`setGroup` with `name`, `comment`,
`members`; at once); 3 "Give access to shared folders" (per folder, only when chosen); 4 "Save and
finish" (R10, expected `sharedfolders`, `systemd`, plus `samba`, `avahi` for shared folders; only when
step 3 ran, since `setGroup` for a new group marks nothing **[verify]**); 5 "Check that it is ready"
(`getGroup`, `ShareMgmt.getList`).

**Result:** "{{group}} is ready." with "Its members can open {{list}}." or "It has no access to any
shared folder yet.", router links "Open {{group}}" and "Add another group".

**Failures:** as 6.6, with "Delete {{group}} again" (`deleteGroup` after `setGroup` with no members,
plain confirmation) in place of "Delete {{name}} again", and no password to ask for.

| Key                         | English                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `addGroup.title`            | Add a group                                                                                              |
| `addGroup.name.hint`        | Shared folders' access lists show the group by this name. It cannot be changed later.                    |
| `addGroup.name.placeholder` | For example: family                                                                                      |
| `addGroup.name.reserved`    | {{group}} is a name the NAS keeps for itself. Choose another name.                                       |
| `addGroup.name.taken`       | There is already a group called {{group}}.                                                               |
| `addGroup.name.takenPerson` | There is already a person called {{group}}. Choose a name no person uses, so the two cannot be confused. |
| `addGroup.sum.title`        | Ready to add the group {{group}}                                                                         |
| `addGroup.sum.add`          | Add the group <group></group>.                                                                           |
| `addGroup.sum.members`      | Members: {{list}}.                                                                                       |
| `addGroup.sum.nobody`       | Nobody is in it yet.                                                                                     |
| `addGroup.sum.order`        | The group and its members work as soon as it is made. Then the changes to shared folders are applied.    |
| `addGroup.confirm`          | Add group                                                                                                |
| `addGroup.step.check`       | Check the choices                                                                                        |
| `addGroup.step.add`         | Add the group                                                                                            |
| `addGroup.step.access`      | Give access to shared folders                                                                            |
| `addGroup.step.apply`       | Save and finish                                                                                          |
| `addGroup.step.verify`      | Check that it is ready                                                                                   |
| `addGroup.fail.notAdded`    | {{group}} was not added.                                                                                 |
| `addGroup.fail.deleteAgain` | Delete {{group}} again                                                                                   |
| `addGroup.done.title`       | {{group}} is ready.                                                                                      |
| `addGroup.done.access`      | Its members can open {{list}}.                                                                           |
| `addGroup.done.noAccess`    | It has no access to any shared folder yet.                                                               |
| `addGroup.done.open`        | Open {{group}}                                                                                           |
| `addGroup.done.another`     | Add another group                                                                                        |

The rest of the flow's words (Continue, Change choices, the step failures, Try again, Stop here) are
section 6.8's keys, reused.

---

## 11. Delete a group

`UserMgmt.deleteGroup {name}`. Read from source: it **refuses while the group has members** (the
system's tool is run with "only if empty"), then removes the group and OMV's record. It does not touch
any shared folder's access list. It marks nothing pending (0.9). So deleting a group with members is
two writes: take everyone out (`setGroup` with no members, which marks Windows and Mac sharing
pending), then delete.

### 11.1 The section

`h2` "Delete this group", `text-sm`: "Deleting {{group}} takes everyone out of it and removes it. The
people stay on the NAS, with their own access." Then **"Delete {{group}}…"** (neutral), unavailable
with its reason when a read failed, an action is running, or a member has it as their main group
("{{name}} has {{group}} as their main group, set outside this interface. It cannot be deleted here.",
no link, P16).

### 11.2 The check and the confirmation

The button re-reads `getGroup`, `ShareMgmt.getList` and `dirtyModules`; the pre-flight and refusals as
7.2. Then `ConfirmDialog variant="destructive"`, focus on Cancel, Enter does not confirm, **no typed
name** (no file is touched, and no person loses their account; section 21, P10):

1. Title: "Delete the group {{group}}?"
2. With members: "{{count}} people are taken out of it: {{list}}. They stay on the NAS, but lose the
   access the group gave them: {{folders}}." (per folder, its access word: "Photos (Read and write)").
   Without: "Nobody is in it."
3. Access, when any folder lists it: a `CheckboxField`, ticked by default: "Also take {{group}} off the
   access lists of {{count}} shared folders: {{list}}." with 7.3's hint in its group form, and 7.3's
   "nobody can open" line when it applies.
4. Buttons: "Cancel" (focused) and **"Delete group"** (`destructive`).

### 11.3 On confirm

The reads again; then steps in the dialog: 1 "Take everyone out of {{group}}" (`setGroup` with
`members` empty; only with members); 2 "Delete the group" (`deleteGroup`); 3 "Take {{group}} off the
access lists" (when ticked); 4 "Save the change" (R10: expected `samba` when step 1 ran, and step 3's
modules; `Config.applyChangesBg`).

**Result:** "{{group}} was deleted. Its members are still on the NAS." with a router link "Go to
Groups".

**Failures:** step 1: "{{group}} was not changed." Step 2 after step 1: "Everyone was taken out of
{{group}}, but it was not deleted." + server message, with "Try again" and **"Put the members back"**
(`setGroup` with the list read at 11.2). Steps 3 and 4 as 7.4. A cut request: "Could not tell whether
{{group}} was deleted." with "Check again".

### 11.4 Copy

| Key                                          | English                                                                                                                                                                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groupDelete.title`                          | Delete this group                                                                                                                                                                                                                                        |
| `groupDelete.intro`                          | Deleting <group></group> takes everyone out of it and removes it. The people stay on the NAS, with their own access.                                                                                                                                     |
| `groupDelete.open`                           | Delete {{group}}…                                                                                                                                                                                                                                        |
| `groupDelete.blocked.mainGroup`              | <name></name> has <group></group> as their main group, set outside this interface. It cannot be deleted here.                                                                                                                                            |
| `groupDelete.blocked.unread`                 | Could not check what uses <group></group>, so it cannot be deleted now.                                                                                                                                                                                  |
| `groupDelete.dialog.title`                   | Delete the group {{group}}?                                                                                                                                                                                                                              |
| `groupDelete.members_one` / `_other`         | {{count}} person is taken out of it: {{list}}. They stay on the NAS, but lose the access the group gave them: {{folders}}. / {{count}} people are taken out of it: {{list}}. They stay on the NAS, but lose the access the group gave them: {{folders}}. |
| `groupDelete.membersNoAccess_one` / `_other` | {{count}} person is taken out of it: {{list}}. They stay on the NAS. / {{count}} people are taken out of it: {{list}}. They stay on the NAS.                                                                                                             |
| `groupDelete.nobody`                         | Nobody is in it.                                                                                                                                                                                                                                         |
| `groupDelete.access_one` / `_other`          | Also take <group></group> off the access list of {{count}} shared folder: {{list}}. / Also take <group></group> off the access lists of {{count}} shared folders: {{list}}.                                                                              |
| `groupDelete.accessHint`                     | If you leave this, those folders keep an entry for <group></group>, and a group you add later with the same name gets that access.                                                                                                                       |
| `groupDelete.leavesNobody`                   | After this, nobody can open {{folders}} from other computers: <group></group> was the only one with access.                                                                                                                                              |
| `groupDelete.confirm`                        | Delete group                                                                                                                                                                                                                                             |
| `groupDelete.step.empty`                     | Take everyone out of {{group}}                                                                                                                                                                                                                           |
| `groupDelete.step.delete`                    | Delete the group                                                                                                                                                                                                                                         |
| `groupDelete.step.access`                    | Take {{group}} off the access lists                                                                                                                                                                                                                      |
| `groupDelete.step.save`                      | Save the change                                                                                                                                                                                                                                          |
| `groupDelete.done`                           | <group></group> was deleted. Its members are still on the NAS.                                                                                                                                                                                           |
| `groupDelete.toList`                         | Go to Groups                                                                                                                                                                                                                                             |
| `groupDelete.failed.empty`                   | {{group}} was not changed.                                                                                                                                                                                                                               |
| `groupDelete.failed.delete`                  | Everyone was taken out of <group></group>, but it was not deleted.                                                                                                                                                                                       |
| `groupDelete.putBack`                        | Put the members back                                                                                                                                                                                                                                     |
| `groupDelete.unknown`                        | Could not tell whether {{group}} was deleted.                                                                                                                                                                                                            |

The cancel, "Checking…", "Try this step again", "Stop here" and "Check again" words are 7.6's, reused.

---

## 12. Users > Settings: home folders

**Question it answers:** does each person have a private folder on the NAS, and where? **Leads to:**
turning home folders on in a shared folder, or off.

Administrators only. Route `/usermgmt/settings`: the menu item Users > Settings (OMV's word) gains
the route. Page title "Home folders"; under it, `text-sm muted-foreground`, "User settings".

### 12.1 What OMV does (read from source)

`UserMgmt.setSettings {enable, sharedfolderref}` saves the setting, then, **inside the request**, for
every person who is in `users` (every person made in OMV):

- **On:** sets their home folder to `{{folder}}/{{name}}`. When that folder does not exist yet, the
  system's account tool is asked to move their old home folder there with its content; then the folder
  is made if it is still missing, private to the person (only they can open it), in `users`.
- **Off:** sets their home folder to none (`/nonexistent`). **Every folder and file stays where it
  was.**
- In both cases Windows and Mac sharing is marked pending: it shares home folders (an advanced SMB
  setting, left to the classic interface) only while home folders are on.
- A new person, while home folders are on, gets their folder when they are made (0.4).
- The shared folder that holds home folders is "in use" while they are on, so it cannot be deleted
  (the shares slice's 0.7).

**Moving to another shared folder while home folders are on** asks the system to move every person's
home folder, with all its files, inside one request, possibly from one disk to another. This interface
does not offer it (section 21, P12): the page says to turn home folders off and on again in the
classic interface, or to do it there, and why.

### 12.2 Data

`UserMgmt.getSettings` (new, cleared), `ShareMgmt.getList` (whole), `FileSystemMgmt.getList` (the
chosen folder's file system, and the system drive rule), `SMB.getSettings` (`homesenable`, for one
line), `getUserList` (the number of people), `System.getInformation`.

### 12.3 Layout

1. Title and subtitle.
2. Intro: 0.1's `users.term.home`.
3. **State line** (`role="status"`): Off: "Home folders are off. People have no private folder on the
   NAS." On: "Each person has a private home folder in {{folder}}." with router link to the folder's
   page; when that folder is not OK, its pill and 0.3's sentence. The pending mark when this session
   saved the setting and `samba` is pending.
4. **Off**: a `form` with `RadioGroupField` "Shared folder for home folders", one option per shared
   folder that may hold them (12.4), none chosen; the `Disclosure` "Shared folders that cannot hold
   home folders ({{count}})" with reasons; and the button **"Turn on home folders…"** (filled).
5. **On**: the line "To stop using home folders, turn them off. Their folders and files stay in
   {{folder}}." and the button **"Turn off home folders…"** (neutral); then `text-sm
muted-foreground`: "To keep home folders in another shared folder, use the classic interface: the
   NAS then moves every home folder, with its files, which can take a long time." with `ExternalLink`
   "User settings in the classic interface" → `/#/usermgmt/settings`.
6. One line, `text-sm muted-foreground`, from `SMB.getSettings`: "Windows and Mac computers can open
   home folders: {{yes or no}}. That is set with the advanced SMB options in the classic interface."
   (only when Windows and Mac sharing is on).
7. Router link "Add a shared folder for home folders" → `/storage/shared-folders/add`, under the radio
   group, when no shared folder may hold them.

### 12.4 Which shared folders may hold home folders

Offered: a shared folder whose status is OK (the shares slice's 0.3), whose file system is mounted and
not Critical, that is not on the system drive, and that is not the whole file system (`/`) **[owner]**
(a home folder for each person at the top of a whole disk mixes them with every other folder there).
The rest are listed with their reason: "Cannot be reached.", "Its file system is not mounted.", "On
the system drive.", "It is the whole file system {{fs}}." Fail closed: any of these reads failing
leaves nothing offered, with the failing read's sentence and "Try again".

### 12.5 Turning them on

`ConfirmDialog`, plain (nothing is erased), focus on Cancel:

1. Title: "Turn on home folders in {{folder}}?"
2. "A private folder named after each person is made in {{folder}} now, for the {{count}} people on
   this NAS, and for everyone you add later. Only that person can open their folder."
3. "If a person already has a home folder elsewhere, its files are moved into the new one."
   **[verify]** what an account made with home folders off has as its home, and whether anything moves.
4. "This can take a while with many people. Keep this page open."
5. When Windows and Mac sharing shares home folders (`homesenable` true): "Windows and Mac computers
   can open their home folders after the changes are applied."
6. Buttons: "Cancel" (focused) and **"Turn on"** (filled primary).

On confirm: the folder's row and the setting re-read (12.4's rules again), then `setSettings` with
`enable` true and the folder's `uuid`. A step line "Setting up home folders for {{count}} people…"
while the request runs. Done: toast "Home folders are on, in {{folder}}.", the band (samba), focus on
the state line. Failed: the dialog stays with the server's message; "Some home folders may already be
set up. Turning them on again finishes the rest." (the work is per person, in order, read from
source). Cut: "Could not tell whether home folders were turned on." with "Check again".

### 12.6 Turning them off

`ConfirmDialog`, plain (nothing is erased; access to home folders is cut), focus on Cancel:

1. Title: "Turn off home folders?"
2. "People no longer have a home folder on the NAS. The folders and every file in them stay in
   {{folder}}, where only each person's own account could open their folder."
3. When Windows and Mac sharing shares home folders: "Windows and Mac computers can no longer open
   home folders after the changes are applied."
4. "Programs that keep files in a person's home folder, such as an add-on, stop finding them."
5. Buttons: "Cancel" (focused) and **"Turn off"** (filled primary).

On confirm: `setSettings` with `enable` false and the folder's `uuid` kept (OMV stores both, so turning
them on again offers the same folder first). Toast "Home folders are off. Their files are still in
{{folder}}."

### 12.7 States

| State                     | Look                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                   | Skeleton of the state line and the radio group; "Loading the home folders setting…"                                                               |
| `getSettings` failed      | `EmptyState variant="error"`: "Could not read whether home folders are on." + server message + "Try again". No button                             |
| The chosen folder is gone | On, but its `uuid` names no shared folder: Unknown pill, "Home folders are on, but their shared folder no longer exists." and the off button only |
| Saving                    | The button shows "Saving…"; the step line                                                                                                         |
| Populated                 | As 12.3                                                                                                                                           |

### 12.8 Copy

| Key                                  | English                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homeFolders.title`                  | Home folders                                                                                                                                                                                                                                                                                                                                                                        |
| `homeFolders.subtitle`               | User settings                                                                                                                                                                                                                                                                                                                                                                       |
| `homeFolders.state.off`              | Home folders are off. People have no private folder on the NAS.                                                                                                                                                                                                                                                                                                                     |
| `homeFolders.state.on`               | Each person has a private home folder in <folder></folder>.                                                                                                                                                                                                                                                                                                                         |
| `homeFolders.state.gone`             | Home folders are on, but their shared folder no longer exists.                                                                                                                                                                                                                                                                                                                      |
| `homeFolders.state.unreachable`      | People cannot reach their home folders.                                                                                                                                                                                                                                                                                                                                             |
| `homeFolders.choose`                 | Shared folder for home folders                                                                                                                                                                                                                                                                                                                                                      |
| `homeFolders.cannot_one` / `_other`  | Shared folder that cannot hold home folders ({{count}}) / Shared folders that cannot hold home folders ({{count}})                                                                                                                                                                                                                                                                  |
| `homeFolders.reason.notOk`           | Cannot be reached.                                                                                                                                                                                                                                                                                                                                                                  |
| `homeFolders.reason.notMounted`      | Its file system is not mounted.                                                                                                                                                                                                                                                                                                                                                     |
| `homeFolders.reason.system`          | On the system drive.                                                                                                                                                                                                                                                                                                                                                                |
| `homeFolders.reason.whole`           | It is the whole file system <fs></fs>.                                                                                                                                                                                                                                                                                                                                              |
| `homeFolders.none`                   | No shared folder can hold home folders yet.                                                                                                                                                                                                                                                                                                                                         |
| `homeFolders.addFolder`              | Add a shared folder for home folders                                                                                                                                                                                                                                                                                                                                                |
| `homeFolders.turnOn`                 | Turn on home folders…                                                                                                                                                                                                                                                                                                                                                               |
| `homeFolders.turnOff`                | Turn off home folders…                                                                                                                                                                                                                                                                                                                                                              |
| `homeFolders.onLine`                 | To stop using home folders, turn them off. Their folders and files stay in <folder></folder>.                                                                                                                                                                                                                                                                                       |
| `homeFolders.move`                   | To keep home folders in another shared folder, use the classic interface: the NAS then moves every home folder, with its files, which can take a long time.                                                                                                                                                                                                                         |
| `homeFolders.classicLink`            | User settings in the classic interface                                                                                                                                                                                                                                                                                                                                              |
| `homeFolders.smbYes`                 | Windows and Mac computers can open home folders: yes. That is set with the advanced SMB options in the classic interface.                                                                                                                                                                                                                                                           |
| `homeFolders.smbNo`                  | Windows and Mac computers can open home folders: no. That is set with the advanced SMB options in the classic interface.                                                                                                                                                                                                                                                            |
| `homeFolders.on.title`               | Turn on home folders in {{folder}}?                                                                                                                                                                                                                                                                                                                                                 |
| `homeFolders.on.body_one` / `_other` | A private folder named after each person is made in <folder></folder> now, for the {{count}} person on this NAS, and for everyone you add later. Only that person can open their folder. / A private folder named after each person is made in <folder></folder> now, for the {{count}} people on this NAS, and for everyone you add later. Only that person can open their folder. |
| `homeFolders.on.move`                | If a person already has a home folder elsewhere, its files are moved into the new one.                                                                                                                                                                                                                                                                                              |
| `homeFolders.on.wait`                | This can take a while with many people. Keep this page open.                                                                                                                                                                                                                                                                                                                        |
| `homeFolders.on.smb`                 | Windows and Mac computers can open their home folders after the changes are applied.                                                                                                                                                                                                                                                                                                |
| `homeFolders.on.confirm`             | Turn on                                                                                                                                                                                                                                                                                                                                                                             |
| `homeFolders.on.progress`            | Setting up home folders for {{count}} people…                                                                                                                                                                                                                                                                                                                                       |
| `homeFolders.on.done`                | Home folders are on, in {{folder}}.                                                                                                                                                                                                                                                                                                                                                 |
| `homeFolders.on.partly`              | Some home folders may already be set up. Turning them on again finishes the rest.                                                                                                                                                                                                                                                                                                   |
| `homeFolders.on.unknown`             | Could not tell whether home folders were turned on.                                                                                                                                                                                                                                                                                                                                 |
| `homeFolders.off.title`              | Turn off home folders?                                                                                                                                                                                                                                                                                                                                                              |
| `homeFolders.off.body`               | People no longer have a home folder on the NAS. The folders and every file in them stay in <folder></folder>, where only each person's own account could open their folder.                                                                                                                                                                                                         |
| `homeFolders.off.smb`                | Windows and Mac computers can no longer open home folders after the changes are applied.                                                                                                                                                                                                                                                                                            |
| `homeFolders.off.programs`           | Programs that keep files in a person's home folder, such as an add-on, stop finding them.                                                                                                                                                                                                                                                                                           |
| `homeFolders.off.confirm`            | Turn off                                                                                                                                                                                                                                                                                                                                                                            |
| `homeFolders.off.done`               | Home folders are off. Their files are still in {{folder}}.                                                                                                                                                                                                                                                                                                                          |
| `homeFolders.cancel`                 | Cancel                                                                                                                                                                                                                                                                                                                                                                              |
| `homeFolders.saving`                 | Saving…                                                                                                                                                                                                                                                                                                                                                                             |
| `homeFolders.loading`                | Loading the home folders setting…                                                                                                                                                                                                                                                                                                                                                   |
| `homeFolders.loadFailed`             | Could not read whether home folders are on.                                                                                                                                                                                                                                                                                                                                         |
| `homeFolders.checkAgain`             | Check again                                                                                                                                                                                                                                                                                                                                                                         |

---

## 13. How users fit the other pages

### 13.1 Shared folders (the link back)

- **The access grid** on a shared folder's page and in the add-a-shared-folder flow: each row's name
  becomes a router link to the person's or group's page ("Open {{name}}" / "Open group {{group}}"),
  opened in the same tab; with unsaved changes in the grid, the router's unsaved-changes guard asks
  first (the shares slice's 2.8).
- **Its empty state** (the shares slice's 3.4) changes: "There is nobody on this NAS yet apart from
  the built-in admin account. Add the people who will use shared folders, then give them access here."
  with router link **"Add a person"** → `/usermgmt/users/add` in place of the classic link.
- **Stale entries** (the shares slice's 0.4) keep their line; when this session deleted that account,
  the line adds "{{name}} was deleted in this session." so the reader knows why.
- **Used by** on a shared folder's page: when it holds home folders (`UserMgmt.getSettings`, now
  cleared), the panel names it, "Home folders of every person", with a router link to
  `/usermgmt/settings`, and the delete refusal says "It holds every person's home folder. Turn home
  folders off first." The shares slice's sentence about "the home folders setting" drops those words.

### 13.2 Services > SSH (Phase 3)

The hints "Each person also needs SSH access on their own account, which is set under Users." and
"Keys are added to each account under Users." gain a router link "Users" → `/usermgmt/users`. A line
under "Turn on SSH", `text-sm`: "People who may sign in over SSH: {{list}}." or "Nobody may sign in
over SSH yet: allow it on a person's page." from `getUserList` (0.3's account part only).

### 13.3 Your account

Unchanged. The signed-in person's page links to it (2.2, 5.1). A normal user sees only Your account,
as now.

### 13.4 Dashboard

No new rows (section 20, D14). The set-up checklist is unchanged.

### 13.5 Not changed in this slice

The storage pages, the band and the job runner's rules, the monitoring pages, the sign-in page.

---

## 14. A normal user, navigation and routes

### 14.1 A normal user

Nothing new. Every method here, except the `…ByContext` ones of Your account, is administrator-only.
A normal user who types one of these addresses gets the "only administrators" page, and nothing is
called first (UI-4), as on the other administrator pages.

### 14.2 Navigation and routes

| Route                     | Page | Menu                                       | Notes                                                                                            |
| ------------------------- | ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `/usermgmt/users`         | 1    | Users > Users (exists; gains its route)    |                                                                                                  |
| `/usermgmt/users/add`     | 6    | none (Users current)                       | Opens the flow; no step runs on load (R9)                                                        |
| `/usermgmt/users/$name`   | 2    | none (Users current)                       | `$name` checked against OMV's name pattern and found in the list (2); nothing in it names a call |
| `/usermgmt/groups`        | 8    | Users > Groups (exists; gains its route)   |                                                                                                  |
| `/usermgmt/groups/add`    | 10   | none (Groups current)                      | As `/usermgmt/users/add`                                                                         |
| `/usermgmt/groups/$group` | 9    | none (Groups current)                      | As `$name`                                                                                       |
| `/usermgmt/settings`      | 12   | Users > Settings (exists; gains its route) | The menu keeps OMV's word "Settings"; the page title says "Home folders"                         |

The routes follow the classic interface's paths (`/#/usermgmt/...`) so existing users recognise them.
`add` is not a valid name under 0.6's rule for new names, but an existing account may be called `add`
under OMV's wider rule: the static `add` route wins, and such a person's page is reached from the list
by a link that passes the name as data, not by typing the address **[verify]** the router's
precedence, and whether any VM account is named `add`.

---

## 15. Backend methods

### 15.0 Methods that need the owner's clearance

**None.** The ten methods cleared today and the five already in the contract cover every page and
flow here. Said plainly, so that nothing is designed round a missing method:

| Method                                                                  | Would give                                                                                                                                   | Without it (this design)                                                                                                                                                                                                                      | Asked for                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Cron.getList`, `Rsyncd.getModuleList`, `Rsync.getList`, add-ons' lists | The delete dialog could name the scheduled jobs, Rsync server modules, backup jobs and add-on settings that use a person by name (Pattern G) | One sentence says such settings stop working for them and to look in the classic interface (7.3)                                                                                                                                              | Later, with Pattern G, not for this slice |
| `UserMgmt.enumerateAllGroups`, `enumerateSystemGroups`                  | Every system group, as the classic form lists them                                                                                           | Not needed: the system groups a person is in are in their own `groups`, and the two offered are named in the app and checked with `getGroup` (0.5)                                                                                            | No                                        |
| `System.getShells`                                                      | The list of login programs, as the classic form offers                                                                                       | Not needed: Q5 fixes the two shells used here (0.11)                                                                                                                                                                                          | No                                        |
| `ShareMgmt.getPrivilegesByRole`, `setPrivilegesByRole`                  | One person's access across every folder in one call                                                                                          | Not needed: `ShareMgmt.getList`'s `privileges` give the same, and the cleared `setPrivileges` writes each changed folder (4.2). `setPrivilegesByRole` also rewrites every folder, changed or not (read from source), which this design avoids | No                                        |
| `ShareMgmt.getPath`                                                     | A shared folder's path on the NAS                                                                                                            | Not needed: `getList`'s `absdirpath`                                                                                                                                                                                                          | No                                        |
| `Quota.*`                                                               | Quotas                                                                                                                                       | Out of scope (classic)                                                                                                                                                                                                                        | No                                        |

**Cleared, but not used:** `UserMgmt.enumerateUsers` and `enumerateGroups`. They list the same accounts
as `getUserList` and `getGroupList` without OMV's stored fields (email address, SSH keys, a group's
description) and without paging, so they add nothing here. Recommended: leave them out of the contract
until a page needs them (section 21, P1).

### 15.1 The facts read from source, per method

Every method below checks the administrator role. OMV ignores parameters its datamodel does not name,
so the contract's request schemas are **stricter** than OMV's where this interface sends less;
"Stricter" says how. None is a background task. "Marks pending" is through OMV's engine modules'
listeners, **[verify]** each by `dirtyModules` on the VM. The person's name is the key of every person
method, and a group's name of every group method; there is no other identifier.

| Method                                                                 | Parameters (from the datamodel)                                                                                                                                                                                                                                                                                                | Marks pending                                                                | What it does, read from source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Contract notes                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UserMgmt.getUserList` (exists)                                        | `start`, `limit` (integer or null), `sortfield`, `sortdir`, `search`, `detail` (`basic` or `full`)                                                                                                                                                                                                                             | nothing                                                                      | Every account whose number is from `UID_MIN` to `UID_MAX` of the system's login settings (1000 to 60000 by default) is a person; every other is a system account and is not listed. Each row: `name`, `uid`, `gid`, `comment`, `dir`, `shell`, `groups` (every group, main group first, by the system's own list), `system`, then OMV's stored `email`, `disallowusermod`, `sshpubkeys` (defaults when OMV has no record). Builds every row on each call, one group lookup per person                                                                                                                 | Exists. Unchanged; the examples gain a person in `_ssh` with a login shell, one with a no-login shell, one in `sudo`, and one with two SSH keys (scrubbed, 18.2)                                                                                                                                                                                                                         |
| `UserMgmt.getGroupList` (exists)                                       | `start`, `limit`, `sortfield`, `sortdir`, `search`                                                                                                                                                                                                                                                                             | nothing                                                                      | Groups numbered from `GID_MIN` to `GID_MAX`. Each: `name`, `gid`, `members` (including people whose main group it is), `system`; `comment` only when OMV holds a record                                                                                                                                                                                                                                                                                                                                                                                                                               | Exists. Unchanged                                                                                                                                                                                                                                                                                                                                                                        |
| `UserMgmt.getUser`                                                     | `name` (user-name format, required)                                                                                                                                                                                                                                                                                            | nothing                                                                      | The list row's fields for one account, **system accounts included** (`system` true). A missing account answers with the error "The user '…' does not exist."                                                                                                                                                                                                                                                                                                                                                                                                                                          | **New, cleared.** Read-only. Its "does not exist" reply is an example of its own **[verify]** the HTTP status and words, which 0.11 relies on                                                                                                                                                                                                                                            |
| `UserMgmt.setUser`                                                     | `name` (user-name format), `uid` (integer, optional), `groups` (array of names, required), `shell` (optional), `password` (one line, required, may be empty), `email` (an address or empty, required), `comment` (optional), `disallowusermod` (boolean, required), `sshpubkeys` (array of RFC 4716 or OpenSSH keys, required) | `postfix`; `ssh` when the person has or had keys                             | Refuses a system account. Writes OMV's record **first** (email address, the flag, keys converted to RFC 4716 and made unique), then makes the account (`--gid users`, the shell, the comment, the groups, the `uid`, and the home folder when home folders are on) or changes it (the same, without `uid` or home). Each group must exist; the shell must exist as a file. With an empty `groups` the groups are left as they are. When `password` is not empty, sets it, and Windows and Mac sharing's password with it, at once (not for `admin`). Creating and changing are the same call, by name | **New, cleared.** `x-omv-dirty: true`; `x-omv-destructive: access` (it can take away administrator rights and SSH). `password` is `x-omv-secret`; `x-omv-omit: [password]` on the reply, as `setUserByContext`. Stricter: no `uid`; `groups` items in the user-name format and never empty; `comment` at most 65 characters, no `:` or line break **[verify]**; `shell` an absolute path |
| `UserMgmt.deleteUser`                                                  | `name` (user-name format, required)                                                                                                                                                                                                                                                                                            | `postfix`; `ssh` when they had keys                                          | Reads the account (it must exist), removes it with the system's account tool, forced and **without** removing the home folder or files, then OMV's record, then Windows and Mac sharing's entry for them. Shared folders' access lists and other settings that name them are not touched                                                                                                                                                                                                                                                                                                              | **New, cleared.** `x-omv-destructive: access`; `x-omv-dirty: true`. Its description says what stays                                                                                                                                                                                                                                                                                      |
| `UserMgmt.getGroup`                                                    | `name` (user-name format, required)                                                                                                                                                                                                                                                                                            | nothing                                                                      | One group's list fields, **system groups included**; "The group '…' does not exist." when missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **New, cleared.** Read-only; the "does not exist" reply as an example **[verify]**                                                                                                                                                                                                                                                                                                       |
| `UserMgmt.setGroup`                                                    | `name` (user-name format, required), `gid` (integer, optional), `comment` (string, required), `members` (array of user names, required)                                                                                                                                                                                        | `samba` on a change of a group OMV holds a record for; nothing for a new one | Refuses a system group. Writes OMV's record first; makes the group when new (with `gid`); then sets the member list to exactly `members` (replacing it; an empty list empties the group). Creating and changing are the same call, by name                                                                                                                                                                                                                                                                                                                                                            | **New, cleared.** `x-omv-dirty: true`; `x-omv-destructive: access` (it can take people out). Stricter: no `gid`; `comment` at most 65 characters **[verify]**                                                                                                                                                                                                                            |
| `UserMgmt.deleteGroup`                                                 | `name` (user-name format, required)                                                                                                                                                                                                                                                                                            | nothing                                                                      | Reads the group (it must exist), removes it **only if it has no members** (the system tool refuses otherwise), then OMV's record. Access lists are not touched                                                                                                                                                                                                                                                                                                                                                                                                                                        | **New, cleared.** `x-omv-destructive: access`. The "has members" refusal as an example **[verify]** its words                                                                                                                                                                                                                                                                            |
| `UserMgmt.getSettings`                                                 | none                                                                                                                                                                                                                                                                                                                           | nothing                                                                      | `{enable, sharedfolderref}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **New, cleared.** Read-only                                                                                                                                                                                                                                                                                                                                                              |
| `UserMgmt.setSettings`                                                 | `enable` (boolean, required), `sharedfolderref` (a UUID or empty, required)                                                                                                                                                                                                                                                    | `samba`                                                                      | Saves the setting first, then 12.1's work for every person in `users`, inside the request                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **New, cleared.** `x-omv-dirty: true`; `x-omv-destructive: data` (the method can move every home folder's files, though this interface does not ask it to). Stricter: with `enable` true, `sharedfolderref` must be a UUID                                                                                                                                                               |
| `UserMgmt.enumerateUsers`, `enumerateGroups`                           | `detail` / none                                                                                                                                                                                                                                                                                                                | nothing                                                                      | The people, or the groups, unpaged, without OMV's stored fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Cleared; not used, not added (15.0)                                                                                                                                                                                                                                                                                                                                                      |
| `getUserByContext`, `setUserByContext`, `setPasswordByContext` (exist) |                                                                                                                                                                                                                                                                                                                                |                                                                              | Your account's; unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Unchanged                                                                                                                                                                                                                                                                                                                                                                                |

**Other facts the design rests on** (read from source): signing in gives the administrator role to
any account in `openmediavault-admin`, built-in or not; a person not in it gets the normal role, and a
system account outside it cannot sign in. The SSH server lets in only `root` and `_ssh`. OMV's install
makes `openmediavault-admin` a system group on purpose, so that it is "not managed via the UI but a
user can still be assigned to" it (its own comment). Windows and Mac sharing restarts on a change of a
group, "otherwise it is possible that a user still works with privileges that are already obsolete"
(its own comment), which is why `setGroup` marks `samba`.

### 15.2 Every request in this slice

| Method                                                                               | Where                                                         | When                                                 | Kind                    | Contract status |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- | --------------- |
| `UserMgmt.getUserList`, `getGroupList`                                               | every page here; the SSH page; the shares grid                | open, Refresh, focus, before a check                 | foreground              | Exist           |
| `UserMgmt.getUser`                                                                   | person's page, add flow, delete                               | before every write; the name check                   | foreground              | New, cleared    |
| `UserMgmt.setUser`                                                                   | details, what they can do, groups, password, add flow step 2  | after the reader's action                            | foreground              | New, cleared    |
| `UserMgmt.deleteUser`                                                                | delete, add flow's "Delete again"                             | after the confirmation                               | foreground              | New, cleared    |
| `UserMgmt.getGroup`                                                                  | group's page, add flows, person's page (`_ssh`, admin group)  | before every write; the name check; section 3's read | foreground              | New, cleared    |
| `UserMgmt.setGroup`                                                                  | group's page, add-group flow, delete-group flow               | after the reader's action                            | foreground              | New, cleared    |
| `UserMgmt.deleteGroup`                                                               | delete-group flow                                             | after the confirmation                               | foreground              | New, cleared    |
| `UserMgmt.getSettings`, `setSettings`                                                | home folders page; person's page and the add flow (read only) | open; after the confirmation                         | foreground, may be long | New, cleared    |
| `ShareMgmt.getList`, `setPrivileges`                                                 | person's and group's pages, add and delete flows              | open; Save access; steps                             | foreground              | Exist           |
| `SMB.getShareList`, `SMB.getSettings`                                                | the Sharing column, the home folders line                     | open                                                 | foreground              | Exist           |
| `SSH.get`, `Services.getStatus`                                                      | Users list, person's page, add flow                           | open, focus                                          | foreground              | Exist           |
| `FileSystemMgmt.getList`                                                             | home folders page                                             | open, before the confirmation                        | foreground              | Exists          |
| `System.getInformation`, `Config.applyChangesBg`, `Config.revertChangesBg`, `Exec.*` | shell, checkpoints, the band                                  | as now                                               |                         | Exist           |

Paging reads send all five fields with `limit: null` for a whole list (the monitoring domain's
observation). Nothing here is read in the background or polled.

Every captured example is scrubbed before commit (AGENTS.md rule 2): people and groups become
documentation names (`alex`, `robin`, `sam`, `family`), email addresses become `@example.org`
addresses, SSH keys are replaced by a documentation key, account numbers are kept (they are not
personal), the host name is `NAS_HOST`, and no password is ever captured: the scrubber's `password`
rule replaces it in requests and replies (docs/04).

### 15.3 Not used, and kept out of the contract

`importUsers`, `importGroups` (the owner's decision), `authUser` and `verifyChallenge` (sign-in is
the transport's, through `Session`), `enumerateSystemUsers`, `enumerateAllUsers`,
`enumerateSystemGroups`, `enumerateAllGroups`, and `UserMgmt.enumerateUsers` and `enumerateGroups`
until needed (15.0).

---

## 16. Components

### 16.1 New or extended in `react-ui-components`

Each with stories for every state in both themes (design-system engineer), contributed back to the
library.

| Component                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                             | States to cover                                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`MemberPicker`** (new)      | A list of checkboxes, one per person or group, with a description line, search, a "Show: all / ticked" filter, a count line, in-browser paging at 50, unavailable rows with their reason, and changed marks (a word and an edge, as the access grid's). Used for a person's groups and a group's members. It is `CheckboxListField` grown up; if that component can take search and paging without breaking its callers, it is extended instead | loading, error, empty, filtered empty, populated; 0, 1, 1,000 rows; an unavailable row; changed rows; saving; long and right-to-left names; 320 px; 200% zoom; keyboard (Tab to each checkbox, Space to toggle; the filter and search first) |
| **`NewPasswordFields`** (new) | Two masked fields with their own reveal toggles, `autocomplete="new-password"`, the mismatch message, the optional unencrypted-connection line, and clearing on submit and unmount. Built from `SecretField`'s input; `SecretField` itself stays the "Set / Change" control for stored secrets                                                                                                                                                  | empty, typed, revealed, mismatch, error from the server, disabled while saving, cleared; HTTP and HTTPS; both themes; screen reader (the toggle's pressed state, no value read out)                                                          |
| `AccessGrid` (extend)         | Its name cell can be a router link (folder or person rows); its Kind column can carry status words and a pill (a folder that is not OK); a row can show a refusal reason after a save while keeping its change                                                                                                                                                                                                                                  | with links, with a pill in the Kind column, a row refused after save; the shares slice's existing states                                                                                                                                     |
| `ConfirmDialog` (extend)      | Titled lists in the body ("What goes", "What stays") and a checkbox before the typed field, for the two deletes                                                                                                                                                                                                                                                                                                                                 | plain and destructive, with and without lists, with the checkbox ticked and not, typed and not                                                                                                                                               |
| `JobSummary` (reuse)          | The administrator and SSH items with the warning-shape icon (the shares slice's guest item)                                                                                                                                                                                                                                                                                                                                                     | as now                                                                                                                                                                                                                                       |

### 16.2 Reused as they are

`TableToolbar`, `SearchField`, `Select`, `TablePagination`, `CheckboxField`, `RadioGroupField`,
`TextField`, `FactList`, `Identifier`, `CopyButton`, `Dialog`, `TypeToConfirmField`, `JobRunner`,
`PreflightNotice`, `JobResult`, `InlineAlert` (warning-shape neutral), `Disclosure`, `EmptyState`,
`StatusPill`, `ExternalLink`, `Breadcrumbs`, `PageTitle`, `Card`, `SegmentedChoice`, `UsedByPanel`.

### 16.3 In the app

- `users/userModel.ts`: the groups list of 0.5 (the person's system groups kept, the two privilege
  groups, `users` always), 0.3's SSH reading, 0.8's self rules (failing closed), and the shells of
  0.11, with tests for every row of 0.3 and every combination of ticks.
- `users/systemGroups.ts`: 0.5's table of system groups, their words and which are warned.
- `users/nameRules.ts`: 0.6's rules for people and groups, and the contract's patterns.
- `users/accessByAccount.ts`: the shares slice's `accessModel` turned round (folders as rows for one
  person or group, the group lines, the writes per folder, the last-access refusal), with its tests.
- `users/addPersonFlow.ts`, `users/deletePersonFlow.ts`, `groups/addGroupFlow.ts`,
  `groups/deleteGroupFlow.ts`: the runs of sections 6, 7, 10 and 11 and their failure plans, in the
  session store as Flow A's. No password is ever in the session store: the add flow holds it in the
  form's memory until step 2 returns (0.7).
- `homeFolders/homeModel.ts`: 12.4's offered folders and the state line.
- Pages: `UsersPage`, `PersonPage`, `AddPersonPage`, `GroupsPage`, `GroupPage`, `AddGroupPage`,
  `HomeFoldersPage`; the shares slice's `AccessGrid` callers gain the links of 13.1.

---

## 17. Mock scenarios to add

Written by hand from the captured shapes, remembering what the pages and flows do (add, change,
password, delete, groups, members, home folders, apply, undo), so every journey can be walked on
`pnpm dev:mock`:

| Scenario            | What it shows                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `usersNone`         | Nobody but the built-in admin; no group; two shared folders                                                                           |
| `usersSome`         | alex (administrator), robin (SSH allowed, login shell), sam (no groups, no access); the groups family and kids; access through family |
| `usersMany`         | 1,000 people, 60 groups, 140 shared folders (paging, the pickers and grid at size)                                                    |
| `usersSelf`         | The signed-in person is a listed administrator (the VM's `example-admin` shape): self rules                                           |
| `usersSelfUnknown`  | The session's name could not be read: 0.8's fail-closed state                                                                         |
| `usersSystemGroups` | A person in `sudo` and `docker`, one in `root`, one in `audio`                                                                        |
| `usersSshStates`    | Every row of 0.3's SSH table, including SSH off and keys only                                                                         |
| `usersNoSshGroup`   | `getGroup` for `_ssh` answers "does not exist"                                                                                        |
| `usersHomeOn`       | Home folders on in Homes; one person's home folder unreachable                                                                        |
| `usersHomeGone`     | Home folders on, its shared folder deleted                                                                                            |
| `usersStaleAccess`  | Folders with entries for a deleted person and a deleted group                                                                         |
| `usersOnlyAccess`   | A person who is the only one with access to a folder shared over SMB                                                                  |
| `usersMainGroup`    | A group that is someone's main group (made outside OMV)                                                                               |
| `usersAddFails`     | The add flow failing at each step in turn, including "account made, password not set"                                                 |
| `usersDeleteFails`  | Delete failing at each step, including "group emptied, not deleted"                                                                   |
| `usersHomeSlow`     | Turning home folders on for 300 people takes 40 seconds; and one whose request is cut                                                 |
| `usersHostile`      | Descriptions of 200 characters, right-to-left, and text that looks like markup; an existing name with capitals; a person called `add` |
| `usersReadsFail`    | Each read failing in turn                                                                                                             |

---

## 18. Checks before calling it done

### 18.1 On the mock, and in every build

- Every page and dialog in both themes, at 1280 and 320 px and at 200% zoom; the pickers and the grid
  wrap, never scroll sideways outside their own table region.
- A keyboard-only pass of each journey: add a person (with and without access, administrator and SSH),
  change details, groups, access and what they can do, set a password, delete; add a group, change its
  members and access, delete it; turn home folders on and off.
- Screen reader: loading, saved, the change counts, the pending mark's text, each warning as the
  checkbox's description, the runs' steps, the results; every dialog's description read with its
  title; no announcement contains a password.
- Greyscale and the deficiency emulations: no meaning in colour alone (nothing here is coloured but
  a shared folder's pill and the destructive buttons, which carry verbs).
- **UI-6 checks**: no password in the DOM after submit, in the session store, in browser storage, in a
  toast, in the mock's request log as shown in the console, or in the URL; both password fields carry
  `autocomplete="new-password"`; the transport removes `password` from `setUser`'s reply (a test, with
  the example carrying the scrubber's placeholder, docs/04).
- The built output: no inline script or style, no third-party origin, no handle in the DOM (UI-1,
  UI-5, UI-7); the routes make no call on load beyond reads (UI-4); `/usermgmt/users/$name` with a
  value that fails the pattern makes no call at all.
- `userModel` tests for every 0.3 row, 0.5 combination and 0.8 rule; `nameRules` tests for each rule of
  0.6 and against the contract's pattern; `accessByAccount` tests reusing the shares slice's observed
  combinations.

### 18.2 On the test VM: facts to verify

The VM (OMV 8.6.1) with a snapshot taken first. Only documentation names are used (`alex`, `robin`,
`sam`, `family`); the test accounts already on the VM are read, never changed, except where a step
says so. Everything is put back afterwards: no extra person or group, home folders as they were,
nothing pending. Reads first, then writes. Test passwords come from the env files and are never
printed or captured (AGENTS.md rule 8).

1. **`getUser` and `getGroup` for a missing name**: the HTTP status, the error's words, and that they
   differ from every other failure (0.11's name check depends on it). For `admin`, `root` and
   `nobody`: `system` true and the fields.
2. **The two groups**: `_ssh` and `openmediavault-admin` exist on OMV 8.6.1, as system groups, with
   those exact names; `getGroup` reads them.
3. **`setUser` for a new person**: accepted with `shell` `/usr/sbin/nologin` and `/usr/bin/sh`; the
   home folder it gets with home folders off (its path, and whether it exists); `groups` `["users"]`
   alone; the reply, as captured before the transport, so the omit test has its example; the pending
   modules (`postfix` only, 0.9).
4. **`setUser` for an existing person**: `groups` replaces the whole list, system groups included;
   `["users"]` takes them out of every other; an empty list changes nothing; SSH keys sent back as
   read are stored unchanged; `uid` is ignored; a description with `,` and `:`, and of 66 characters;
   an email address with capitals; the pending modules with and without keys.
5. **Passwords**: a new and a changed password work at once for signing in here and over SMB
   (`smbclient`), with no Apply; a password with spaces at both ends, a `:`, non-Latin letters and 200
   characters; a line break refused, with its words.
6. **SSH**: a person in `_ssh` with `/usr/bin/sh` signs in over SSH and SFTP (password sign-in on); with
   `/usr/sbin/nologin` neither works; not in `_ssh`, refused; in `root`, let in; each at once, with no
   Apply.
7. **Administrator**: a person added to `openmediavault-admin` signs in as an administrator; taken
   out, they sign in as a normal user. The effect of each change to an account (a new password, the
   administrator rights, deleting it) on that person's web session already open in another browser.
8. **`deleteUser`**: the home folder and the person's files stay, and how their owner then shows; the
   account number the next new person gets; their group memberships go; SMB refuses them at once;
   their access entries stay in the folders' lists; their SSH keys stop working after Apply; the
   pending modules; their open SMB connection.
9. **Groups**: `setGroup` new and changed, `deleteGroup`: the pending modules of each (0.9), with a
   group OMV holds a record for and one it does not; `members` replaces the list; `[]` empties it;
   `deleteGroup` with members refused, and its words; a membership change seen by a connected SMB
   session before and after Apply.
10. **Home folders**: `getSettings`' shape; turning them on for the VM's people: what is made (mode,
    owner, group), how long it takes per person, whether an existing home is moved; turning them off:
    homes become `/nonexistent` and every file stays; SMB's home-folder share before and after Apply
    with `homesenable` on; the pending modules; `ShareMgmt.getList`'s `_used` for the folder while on.
11. **Names**: the longest name the system takes; capitals, a leading digit, a trailing `$`, digits
    only; a person and a group of the same name; a person called `add` and the route of 14.2.
12. **Size**: how long `getUserList` takes with 300 people (made by a script, then removed).
13. **The classic deep links**: `/#/usermgmt/users/edit/{name}` and `/#/usermgmt/groups/edit/{name}`,
    in case a later page wants them (this design links the classic lists only).

---

## 19. Adversarial pass

The main journeys walked twice more: adding a person with access and SSH, then making them an
administrator, setting a password and deleting them; and adding a group with members, then deleting
it. Findings and what changed in this design:

### 19.1 Trying to break it

| Probe                                                                  | Finding                                                                                                                | Change made                                                                                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 people                                                               | The list would be an empty table, and "who can control this NAS" would say nothing                                     | 1.4's empty state names the built-in admin; the summary card keeps its first line (1.2)                                                                 |
| 1 person, who is the reader                                            | Every destructive control on their page would be a trap                                                                | 0.8: no delete, the administrator box locked, the password via Your account; the page says "This is the account you are signed in with."                |
| 1,000 people, 60 groups, 140 folders                                   | The group picker, member picker and grid are each hundreds of tab stops; one list read is slow                         | Search and filter first in each; paging at 50; one whole read shared by every page, re-read on focus only; [verify] 18.2 item 12                        |
| A name typed in capitals (`Alex`)                                      | OMV takes it; Samba matches names without case, so `Alex` and `alex` would be the same person to a Windows computer    | 0.6: new names in small letters only; existing ones shown as they are                                                                                   |
| Adding a person whose name is already taken                            | `setUser` would quietly change the existing person, password included                                                  | 0.11: `getUser` must say "does not exist" at step 1, immediately before; any other answer stops the flow                                                |
| Adding a person named like a system account (`backup`, `www-data`)     | `setUser` refuses to change system accounts, but only after the click, with an unfriendly message                      | 0.6: `getUser` finds system accounts too, and the name is refused in words first                                                                        |
| A person and a group both called `family`                              | Every access list would show two `family` rows                                                                         | 0.6: each name refused if the other kind uses it                                                                                                        |
| Ticking a group that is a system group                                 | Not possible: the picker lists OMV groups only                                                                         | 0.5: system groups are never offered; the two that matter are explicit choices                                                                          |
| A person already in `sudo` from the classic interface, saved here      | `setUser` replaces the whole list; a save here that sent only the ticked groups would take them out of `sudo` silently | 0.5: every system group is sent back as read, and shown (3.4)                                                                                           |
| Unticking every group                                                  | An empty list makes OMV change nothing: the person would stay in every group while the page said "saved"               | 0.5: the list always holds `users`; [verify] 18.2 item 4                                                                                                |
| Taking away your own administrator rights from the group's side        | `openmediavault-admin` is a system group, not listed                                                                   | Not reachable; 0.8 covers the person's side                                                                                                             |
| Two administrators, each taking the other's rights away at once        | Both saves succeed; only the built-in admin is left                                                                    | 3.5's last-administrator line; the built-in admin always remains (0.8). Not refused                                                                     |
| The session's name not read                                            | The self rules could not apply                                                                                         | 0.8: fail closed for every administrator                                                                                                                |
| Refresh mid-flow, back, a second tab                                   | The flow's journal is in memory                                                                                        | R8: 1.5's unfinished-work lines; step 1 re-reads the name and pending changes                                                                           |
| Going back from the summary to change a choice                         | The passwords would sit in memory longer than needed                                                                   | 6.3: going back clears them and the form asks again                                                                                                     |
| Two tabs saving the same person's groups                               | The second save would undo the first                                                                                   | 0.11: re-read before writing; the save stops when the list changed                                                                                      |
| The same membership changed on the person's page and the group's page  | Both write the same fact from different sides                                                                          | 0.5: the later save wins, and the page that read an old list stops instead of overwriting                                                               |
| Undo in the band after adding a person                                 | It drops OMV's record and leaves the account (V4)                                                                      | 0.9: the add flow applies its own changes; "Delete {{name}} again" is the way back                                                                      |
| Deleting a person whose name a later person reuses                     | The folders' entries and the home folder would pass to the new person                                                  | 7.3: taking them off the access lists is ticked by default, and the dialog says what a same-name person inherits                                        |
| Deleting the only person with access to a shared folder                | The folder is left with nobody                                                                                         | Said in the dialog (7.3); not refused (0.10)                                                                                                            |
| Deleting a group with members                                          | OMV refuses; the classic interface leaves the reader to empty it first                                                 | 11: the flow empties it, then deletes, and offers "Put the members back" if the second step fails                                                       |
| A password pasted with a line break, or spaces at the ends             | OMV refuses the first; the second would be trimmed by a careless form                                                  | 0.7: the line break is refused in words; spaces are kept exactly                                                                                        |
| The password echoed back                                               | The reply would carry it into the app's memory                                                                         | 0.7: `x-omv-omit` on the reply, tested                                                                                                                  |
| A password on plain HTTP                                               | It crosses the network readable                                                                                        | 0.7: the line under every password field, beside UI-12's page notice                                                                                    |
| Turning home folders on for many people                                | One long request; it may be cut                                                                                        | 12.5: the dialog says so; a cut request is "Could not tell" with "Check again"; turning on again finishes the rest                                      |
| Moving home folders to another shared folder                           | Every person's files moved inside one request                                                                          | Not offered (12.1, P12)                                                                                                                                 |
| Description of 200 characters, right-to-left, markup-like (`<b>x</b>`) | Must stay text and not reorder the sentence round it                                                                   | 65-character limit (the classic form's); `dir="auto"`, isolation and the visible mark for direction controls (0.2); text only (UI-2); `usersHostile`    |
| A person called `add`                                                  | Their address would be the add flow's                                                                                  | 14.2: the static route wins; the list's link reaches them; [verify]                                                                                     |
| The session expires mid-form                                           | The choices would be lost on sign-in                                                                                   | The shell's existing message ("You were signed out. Changes that were not saved are lost."); nothing is kept in storage (UI-13), passwords least of all |
| A task failing at apply                                                | R7 mix                                                                                                                 | The flows' R7 plan; the band's own "Try applying again"                                                                                                 |
| Pending changes from another administrator                             | They would ride the flows' apply                                                                                       | R1 refuses to start; R10 lists anything new before applying                                                                                             |

### 19.2 Without sight

- **Tab order**: every page in reading order; in each picker and the grid the search and filter come
  first, then one stop per row. Found: the administrator and SSH warnings appeared only visually when
  a box was ticked; they are now each checkbox's description, so they are heard when the box is
  reached and announced politely when they appear (3.2, 3.3).
- **Focus**: never lost after a save (it stays on the section's button, now unavailable but
  focusable); after a delete the page's content is replaced by the result, and focus moves to its
  heading. Found: after "Set password" the dialog closed and focus fell to the page; it now returns
  to "Set a new password…" (5.2).
- **Announcements**: loading, saved, the change counts (500 ms after the last change, the shares
  slice's rule), the pending mark's text, the runs' steps, the results, every failure assertively.
  Found: the reveal toggle's state was not announced; it is `aria-pressed` with the words "Show
  password" / "Hide password", and nothing ever reads the password out.
- **Colour alone**: none. The administrator and SSH facts are words; warnings carry a shape and
  words; the destructive buttons carry verbs.
- **200% zoom and 320 px**: the summary card and dialogs reflow to one column; the list keeps Name and
  Administrator and moves the rest under the name; the pickers' description lines wrap; nothing
  scrolls sideways outside a table's own region.

---

## 20. Decisions taken

Judgement calls made in this design. Each is the recommended answer; the design is built this way
unless the owner says otherwise.

| ID  | Decision                                                                                                                       | Why                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | A person's page is addressed by their **name**, a group's by its name _(recommended)_                                          | The name is the only key OMV has for either, and it cannot change; it is validated by pattern and found in the list before any call (UI-4)                 |
| D2  | **Lists are read whole** and sorted, searched and paged in the browser _(recommended)_                                         | OMV builds every row on every call whatever page is asked (read from source); the shares grid already reads them whole                                     |
| D3  | **No status pills** for people or groups; administrator and SSH are words _(recommended)_                                      | They are choices, not monitored states (style guide 2)                                                                                                     |
| D4  | "**Who can control this NAS**" leads the Users page _(recommended)_                                                            | Worst first: the most consequential fact about the people on a NAS is who can control it                                                                   |
| D5  | **Two system groups are offered, as explicit choices; no other** _(recommended)_                                               | Each of the two can be put in one sentence; the others need Linux knowledge, and some amount to control of the NAS                                         |
| D6  | **Unticking SSH sets the no-login shell** as well as taking `_ssh` away _(recommended)_                                        | Q5's rule for new accounts applied to changes, so the two ways to an account without SSH end in the same state                                             |
| D7  | **The SSH shell is `/usr/bin/sh`**, the classic form's default _(recommended)_                                                 | The same as an account made in the classic interface; a different shell is a classic-interface choice                                                      |
| D8  | **Groups, administrator and SSH changes are confirmed by a plain dialog**; group membership and access are not _(recommended)_ | The first hand out or take away control of the NAS; the second change only what a person may open, are reviewable by their change count, and undoable here |
| D9  | **A line under every password field on plain HTTP**, beside UI-12's page notice _(recommended)_                                | The moment of typing a password is when the warning matters                                                                                                |
| D10 | **Every person save says it is already in effect** and why "Email" shows as pending _(recommended)_                            | Otherwise the band suggests the change waits for Apply (0.4)                                                                                               |
| D11 | **The add flows apply their own changes**; edits go to the band _(recommended)_                                                | Undo after an add leaves an account the band no longer mentions (V4); edits follow every other slice                                                       |
| D12 | **Taking a deleted person or group off the access lists is ticked by default** _(recommended)_                                 | The safe default: a later same-name account inherits nothing                                                                                               |
| D13 | **Description at most 65 characters**, no `:` or line break, for people and groups _(recommended)_                             | The classic form's limit; the account tool's own rule for that field [verify]                                                                              |
| D14 | **No dashboard rows** for people or groups _(recommended)_                                                                     | Nothing here is a monitored state; the Users page leads with who can control the NAS                                                                       |
| D15 | **The home-folder page is titled "Home folders"**, with "User settings" under it; the menu keeps "Settings" _(recommended)_    | The shares slice's D7 rule: plain words on the page, OMV's word in the menu                                                                                |
| D16 | Catalogue: `users.term.*`, `personCan.*`, `personAccess.*`, `password.*`, `systemGroup.*` as shared keys _(recommended)_       | The add flows, the SSH page and the shares grid use them                                                                                                   |

---

## 21. For the owner to agree

The clearance question, the scope, and the points of this slice that hand out or take away control of
the NAS, cut access or touch everyone's files. The design is built only once these are agreed. Each
has a recommendation.

1. **P1, methods.** No further clearance is needed (15.0). `enumerateUsers` and `enumerateGroups` are
   cleared but add nothing. **Recommended: ask for no method; leave those two out of the contract
   until a page needs them.**
2. **P2, the scope.** Built here: the Users and Groups lists, a person's and a group's pages, adding a
   person (Flow B) and a group, details, groups and members, access to shared folders from either
   side, administrator and SSH, a new password, deleting a person and a group, home folders on and
   off. Left to the classic interface: bulk import, quotas, SSH keys, every other system group, the
   account numbers and shell, renaming, moving home folders, SMB home-folder sharing, "disallow
   account modification". **Recommended: as written.** (Scope)
3. **P3, administrator rights.** One explicit checkbox, "Administrator of this NAS", off by default,
   never preselected, with a warning when ticked and a plain confirmation that says what it gives;
   taking it away from someone else is confirmed and, when it leaves only the built-in admin, says so;
   the signed-in person cannot take away their own. **Recommended: as written.** The alternative is to
   leave administrator rights to the classic interface entirely. (Section 3, 0.8)
4. **P4, SSH sign-in.** One explicit checkbox, "May sign in over SSH", off by default (Q5), with a
   warning; ticking adds `_ssh` and a login shell, unticking takes both away; the page says when SSH
   cannot work (off, keys only). **Recommended: as written.** (3.3, D6, D7)
5. **P5, other system groups.** Never offered; shown on a person's page with what they mean; the ones
   that amount to control of the NAS warned on the page and named on the Users list; kept on every
   save. **Recommended: as written.** (0.5, 3.4)
6. **P6, names.** New people and groups: 1 to 32 small letters, digits, `.`, `_`, `-`, starting with a
   letter; no name used by any account or group of either kind; a few reserved words. Names are fixed
   once made. Existing names are kept as they are. **Recommended: as written.** (0.6)
7. **P7, passwords.** OMV's rules only (not empty, one line), typed twice, a reveal toggle, no meter;
   never shown, cleared after every request, removed from the reply; in effect at once; a line on
   plain HTTP; the reader's own password through Your account. **Recommended: as written.** (0.7,
   section 5)
8. **P8, adding a person.** A flow that refuses to start while anything is pending, asks for
   everything in one form (no access, no groups, no administrator, no SSH by default), shows one
   summary, makes the account at once, gives access, and applies once at "Save and finish"; never
   Undo after the account exists. **Recommended: as written.** (Section 6)
9. **P9, deleting a person.** Red, the name typed, refused for the signed-in person; the dialog lists
   what goes (account, password, rights, keys, memberships, email address) and what stays (every
   file, the home folder, and what a same-name person later gets); taking them off the folders' access
   lists is ticked by default; it applies its own changes. **Recommended: as written.** The alternative
   is a plain confirmation without typing, since no file is erased. (Section 7)
10. **P10, deleting a group.** Red, not typed; it takes everyone out first (OMV refuses a group with
    members), says what access they lose, takes the group off the access lists by default, and offers
    "Put the members back" if deleting then fails. **Recommended: as written.** (Section 11)
11. **P11, pending changes.** Person and group edits go to the band, with the note that they are
    already in effect; the add and delete flows refuse to start while anything is pending and apply
    what they leave. **Recommended: as written.** The alternative is for every person save to apply
    the Email change itself, which would deploy anyone else's pending mail settings too. (0.4, 0.9)
12. **P12, home folders.** Turning them on in a shared folder (OK, mounted, not the system drive, not a
    whole file system **[owner]**) and off, each with a plain confirmation; moving them to another
    shared folder stays in the classic interface, because it moves every person's files inside one
    request. **Recommended: as written.** (Section 12)
13. **P13, access from a person's and a group's page.** The shares slice's grid with folders as rows,
    editable, saving each changed folder; the same last-access refusal; links both ways. **Recommended:
    as written.** The alternative is a read-only list of folders with links to each folder's grid,
    with access set only from the folder (and in the add flow). (4.2, 9.5)
14. **P14, SSH keys.** Shown as a count, added and removed in the classic interface. **Recommended: as
    written.** The alternative is a list with "Add a key" (one pasted key, checked by OMV) and
    "Remove", which marks SSH pending. (Scope, 2.3)
15. **P15, "Can change their own details".** Shown on a person's page, changed in the classic
    interface. **Recommended: as written.** (2.3)
16. **P16, no way round a refusal.** A refused action offers no classic link that does the same without
    the check; where the blocker is something this interface does not manage (a main group set
    outside it), the refusal says so with no link. **Recommended: as written**, as for the earlier
    slices. (0.10)
17. **P17, the built-in admin.** Not listed, never changed or deleted here, as OMV treats it; one line
    on the Users page says how its password is changed. **Recommended: as written.** (0.8)

---

## 22. What the test VM is expected to show, and what would change this design

Nothing in this slice has been observed yet (section 18.2 is the plan). These assumptions carry the
most weight; if the VM shows otherwise, the build follows the VM and a "Changes made during the
build" section records each change, as the earlier slices do.

| #   | Assumption                                                                                                | If it does not hold                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `getUser` and `getGroup` answer a missing name with a reply the interface can tell from any other failure | The name check cannot be trusted: the add flows refuse to run, with "Could not check whether the name is free.", until a reliable sign is found; nothing is written over an existing account            |
| 2   | `_ssh` is the SSH group on OMV 8.6.1, and `openmediavault-admin` the administrator group                  | The two names come from what the VM shows; if SSH uses a group not visible to `getGroup`, the SSH choice is left to the classic interface                                                               |
| 3   | `setUser` with `["users"]` takes a person out of every other group; an empty list changes nothing         | 0.5's list is built to whatever empties the other groups; if nothing does, taking a person out of their last group is done from the group's side                                                        |
| 4   | Changes to a person take effect at once and mark only Email (and SSH with keys)                           | 0.4's table, the notes and the pending marks follow the VM                                                                                                                                              |
| 5   | `deleteUser` leaves the home folder and files, and the folders' access entries                            | 7.3's lists follow the VM exactly; the access checkbox stays only if entries stay                                                                                                                       |
| 6   | A new group marks nothing pending; a changed one marks Windows and Mac sharing                            | The add-group flow's checkpoint and 9.3's note follow the VM                                                                                                                                            |
| 7   | Turning home folders on finishes within the web server's limits for a few hundred people                  | A cut request is already "Could not tell"; if it is common, the dialog says before confirming that it may take longer than the page can follow, and turning on again finishes the rest                  |
| 8   | SSH keys sent back as read are stored unchanged                                                           | If OMV changes them, the interface still sends them as read (OMV's own conversion), and the VM's result is recorded; if keys are lost, saving a person with keys is refused here until P14 is revisited |
