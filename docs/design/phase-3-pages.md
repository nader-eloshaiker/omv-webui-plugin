# Phase 3 pages: design

The four pages of [Phase 3](../07-implementation-plan.md#phase-3--first-pages) and the set-up
checklist, ready to build. Normative sources: the [style guide](style-guide.md), the `UI-*` rules in
[05](../05-security.md), and the journal entry "Owner decisions before Phase 3" (binding). Where this
document and the style guide disagree, the style guide wins; raise it.

Backend facts quoted here were read from OMV's source (8.6.x) and the Phase 1 captures. Anything
marked **[verify]** is checked on the mock and the VM before it is relied on.

---

## 0. Conventions for all four pages

### 0.1 Formatting

| What | Rule | Example |
| --- | --- | --- |
| Bytes | Binary units, one decimal, non-breaking space before the unit; B, KiB, MiB, GiB, TiB. Int64 strings are parsed to numbers (all values here are far below 2^53) | `7.6 GiB` |
| Percent | Whole number; under 1 but above 0 shows `<1%` | `41%` |
| Counts, sizes, times, percentages | Tabular numerals | |
| Identifiers | Mono (`Identifier`): host name, paths, kernel release, SSH keys, unknown status codes | `nas01`, `/srv/dev-disk-by-uuid-…/media` |
| Durations | Two largest units, plural-aware: `12 days, 4 hours`; `5 hours, 12 minutes`; `35 minutes`; under a minute `less than a minute` | |
| Clock times in the interface | The browser's locale, hours:minutes:seconds | `10:12:04` |
| Missing value | The word in `muted-foreground`, never a dash alone | `Not reported`, `None` |

Catalogue keys for units and durations live under `format.*` (table in 0.6).

### 0.2 Links to the classic interface

**Defect to fix first.** The classic interface routes by hash (`useHash: true` in the workbench's
`app-routing.module.ts`), so its pages live at `/#/system/workbench/settings`, not
`/system/workbench/settings`. The Phase 2 navigation table (`classic: "/system/…"`) and
`CLASSIC_HTTPS_SETTINGS` use the path without `#`, which the stock nginx answers with its 404
redirect to `/#/404`. **[verify]** on the VM by following one classic link; if confirmed, every
`classic` path gains the `/#` prefix. The paths below are written in the hash form.

| Target | Fixed path |
| --- | --- |
| Classic start page | `/#/` |
| Network > General (host name) | `/#/network/general` |
| System > Date & Time | `/#/system/date-time` |
| System > Notification > Settings | `/#/system/notification/settings` |
| System > Workbench > Settings (HTTPS) | `/#/system/workbench/settings` |
| System > Update Management > Updates | `/#/system/updatemgmt/updates` |
| Storage > Shared Folders | `/#/storage/shared-folders` |
| Storage > Shared Folders > Create | `/#/storage/shared-folders/create` |
| Users > Users | `/#/usermgmt/users` |

Every such link is an `ExternalLink` (new tab, external mark, "(opens in a new tab)" for assistive
technology), with the visible words "… in the classic interface" so the reader knows where they go.
Links inside the new interface are ordinary router links.

### 0.3 The four async states, everywhere

| State | Look | Assistive technology |
| --- | --- | --- |
| Loading (first read) | Skeleton of the real layout and height: label-width bars for fact lists, `TableSkeletonRows` for tables, `CapacityMeter loading` for meters. Controls that need the data are disabled | `aria-busy` on the region, a polite "Loading …" from the catalogue |
| Error (read failed, nothing to show) | `EmptyState variant="error"` in place of the content: our sentence, then `ServerMessage` with the backend's text (UI-9), then "Try again" | The sentence is in a `role="alert"` region |
| Empty | `EmptyState variant="empty"`: what belongs here and how to create it | |
| Populated | The content | |

A failed **background** refresh never blanks good data: the data stays, and a line says when it was
last read and offers "Try again" (style guide 5.2, "a stale table never looks current").

### 0.4 Settings forms (SSH and the account details)

- Label above, hint below, error below the hint with its icon, linked by `aria-describedby`
  (`Field`). Validate on blur and on submit, never per keystroke.
- On/off settings in a form are **checkboxes**, not switches. A switch reads as "takes effect now";
  here nothing takes effect until Save (and, for SSH, Apply).
- Buttons, in this order at the end of the form: **Save** (filled primary) and **Discard changes**
  (secondary). "Undo" stays reserved for pending changes (journal, 2026-11-20). The account page has
  two forms and one filled primary per view, so there "Save details" is outlined and "Change
  password" is the filled one (5.4).
  - With no unsaved change, both are disabled **but stay focusable** (`aria-disabled`), with the hint
    "No changes to save", so focus is not lost after a save.
  - While saving: Save shows its loading state ("Saving…") and ignores presses; the fields are
    read-only.
- A save that fails: `FormAlert tone="critical"` at the top of the form, title from the page's table,
  the backend's message as text below it; focus moves to the alert; the edits stay.
- **Unsaved changes on leaving.** Navigation inside the app is blocked with a `ConfirmDialog`; a
  reload or tab close gets the browser's own prompt (`beforeunload`). The session ending (idle
  sign-out) cannot be blocked; the idle warning comes first. Form contents are never written to
  browser storage (UI-6, UI-13), so they do not survive a reload or a new sign-in.
- **No background refresh overwrites edits.** While the form has unsaved changes, a refetch of its
  data does not replace the fields. When clean, a refetch (on window focus) updates them silently.

### 0.5 The pending mark on a page

A page whose module is in `dirtyModules` shows, beside its title, `StatusPill status="pending"` with
the words **"Not applied yet"** (`pending.itemMark`). This is the "small pending mark" of style guide
5.8. It goes when the module leaves the list (after Apply or Undo). It is the only pending yellow on
the page; the band does the rest.

### 0.6 Shared catalogue entries

| Key | English |
| --- | --- |
| `pending.itemMark` | Not applied yet |
| `common.tryAgain` | Try again |
| `common.save` | Save |
| `common.saving` | Saving… |
| `common.discard` | Discard changes |
| `common.noChanges` | No changes to save |
| `common.notReported` | Not reported |
| `common.none` | None |
| `common.notAvailable` | Not available |
| `common.copy` | Copy |
| `common.copied` | Copied |
| `common.copySelected` | Selected. Press Ctrl+C to copy. |
| `common.inClassic` | {{page}} in the classic interface |
| `leave.title` | Leave without saving? |
| `leave.body` | Your changes on this page are not saved and will be lost. |
| `leave.confirm` | Leave without saving |
| `leave.cancel` | Stay on this page |
| `format.duration.days_one` / `_other` | {{count}} day / {{count}} days |
| `format.duration.hours_one` / `_other` | {{count}} hour / {{count}} hours |
| `format.duration.minutes_one` / `_other` | {{count}} minute / {{count}} minutes |
| `format.duration.pair` | {{first}}, {{second}} |
| `format.duration.underMinute` | less than a minute |
| `format.percentUnder1` | <1% |

`common.copySelected` is the fallback when the clipboard is unavailable, which it is on plain HTTP
(the Clipboard API needs a secure context): the text is selected instead, as the task log does.

"Email" is spelled without a hyphen, as in the existing catalogue (`modules.postfix`).

---

## 1. Dashboard

**Question it answers:** is the NAS fine, and is there anything I should do? **Leads to:** whatever
needs attention, or nothing.

### 1.1 Layout, administrator

Top to bottom, one column under 1024px content width; the two cards of item 4 sit side by side at
1024px and wider (the page widens from `max-w-3xl` to `max-w-5xl`).

1. Page title "Dashboard".
2. **Attention list**, only when there is something in it (1.4). Worst first.
3. **Set-up checklist**, while `displayWelcomeMessage` is true (section 2).
4. Two cards: **System** (what this NAS is) and **Usage** (how busy it is).
5. One line under the cards: when the figures were last read (1.5).

Pending configuration (`configDirty`, `dirtyModules`) is **not** repeated here: the band and the top
bar already say it.

### 1.2 System card (administrator)

A card (`surface`, hairline border, 16px padding) titled "System", holding a fact list (label left,
value right at 640px and wider; label above value below that).

| Label | Field | Display |
| --- | --- | --- |
| Name | `hostname` | `Identifier` (mono), as received |
| openmediavault version | `version` | As received, e.g. `8.6.1-1 (Synchrony)` |
| Processor | `cpuModelName`, `cpuCores` | `{model}, {n} cores`. Model null: `{n} cores`. Both null: "Not reported". `cpuMhz` is not shown: it moves with power saving and would change on every poll |
| Running for | `uptime` (seconds) | Duration (0.1), tabular |
| Time on the NAS | `time` | As received, as text, tabular. It is the server's own clock and format; it steps every 20 s with the poll, which the line under the cards explains |
| Kernel | `kernel` | Mono, e.g. `Linux 6.12.38+deb13-amd64` |
| Updates | `availablePkgUpdates` | `{n} available` and a link "Review updates in the classic interface". 0: "None found at the last check" (the list may never have been fetched; see 2.3) |

Footer link (quiet, start-aligned): "More system details in the classic interface" →
`/#/diagnostics/system-information`.

### 1.3 Usage card (administrator)

| Element | Field | Display |
| --- | --- | --- |
| Meter "Processor" | `cpuUtilization` (percent) | `CapacityMeter`, max 100, value text `12% in use` |
| Meter "Memory" | `memUsed`, `memTotal` (bytes) | `CapacityMeter`, value text `3.1 GiB of 7.6 GiB in use (41%)`. The percent is computed from these two, not taken from `memUtilization`, so the three numbers always agree. `memAvailable` is not shown: a second "free" figure beside "in use" invites a sum that does not add up |
| "Average load" | `loadAverage` {1min, 5min, 15min} | Three figures, two decimals, tabular, each labelled: `1 min 0.42 · 5 min 0.38 · 15 min 0.30`. Hint: "How many tasks wait for the processor on average. Below {{cores}}, the number of processor cores, the NAS keeps up." Without `cpuCores`: "Lower means less busy." |

No thresholds are configured for these, so the meters stay blue and carry no pill (style guide 5.6).
Values update in place, without animation.

### 1.4 Attention list

A list directly under the title, one row per item, each row a neutral `surface` card row with its
own words. Shown only when it has rows.

| Row | When | Mark | Copy | Action |
| --- | --- | --- | --- | --- |
| Restart needed | `rebootRequired` true | `StatusPill status="warning"` "Warning" | "A restart is needed to finish installing updates. Restarting is in the classic interface, in the power menu at the top right." | `ExternalLink` "Open the classic interface" → `/#/` |
| Clocks differ | `abs(ts − browser time at receipt) > 5 min` | Neutral clock icon, no pill | "The NAS clock and this computer's clock differ by {{duration}}. If the NAS clock is wrong, schedules and logs will be too." | `ExternalLink` "Check Date and time in the classic interface" → `/#/system/date-time` |

Why these treatments:

- **Restart needed is a Warning.** It is a monitored condition (`/run/reboot-required`) that needs
  attention soon and is not a failure, which is exactly the warning-orange job (style guide 2.1). It
  is **not** pending yellow: nothing is saved-but-unapplied, and the band's Apply cannot fix it. It
  shows only when true; there is no "Restart needed: No" row, because absence is the normal state.
- **Clock difference is advice**, not a monitored state, so it has no status colour. It compares
  `ts` (epoch seconds) with the browser's clock, so time zones do not matter. Five minutes leaves
  room for a slow reply and a slightly wrong computer clock.

### 1.5 Freshness line

Under the cards, `text-xs muted-foreground tabular-nums`:

- Normal: "Updated every 20 seconds. Last update {{time}}."
- After a failed background poll: "Could not update since {{time}}. The figures may be out of date."
  followed by a small "Try again" button (a foreground read; the reader asked for it, so it may
  count as activity).

A 401 from the poll is the session ending and is handled by the shell, not here.

### 1.6 Normal user

`System.getInformation` gives a normal user `ts`, `time` and `hostname` only.

1. Page title "Dashboard".
2. A card titled "This NAS" with two facts: Name (mono) and Time on the NAS.
3. The existing sentence "You are signed in as {{username}}, with user rights."
4. A line: "To change your password or your details, go to your account." with a router link
   "Your account" (`/account/settings`).

No attention list, no checklist, no usage, no freshness line (nothing on the page is a live figure
the reader acts on). The clock-difference row is not shown either: a normal user cannot fix it.

### 1.7 States

| State | Administrator | Normal user |
| --- | --- | --- |
| Loading | The query is normally warm from sign-in. If not: both cards as skeletons (fact rows at their real height, meters with `loading`); attention list and checklist not rendered | The card as a skeleton |
| Error, never read | One `EmptyState variant="error"` in place of the cards: "Could not read the system information." + server message + "Try again" | Same |
| Background poll failed | Last values stay; freshness line as in 1.5 | Last values stay; no line |
| Field null or missing | "Not reported" for that fact only | |

### 1.8 Keyboard and focus

Reading order is the visual order. Focus stops: attention-row links, checklist controls, "Review
updates…", "More system details…", "Try again" when present. Meters are not focusable; their value
text is their accessible value. The page's live figures are **not** a live region (a reader would
hear the processor figure every 20 s); only the freshness line's failure text is announced, politely,
once when it first appears.

### 1.9 Copy

| Key | English |
| --- | --- |
| `dashboard.title` | Dashboard |
| `dashboard.system.title` | System |
| `dashboard.system.name` | Name |
| `dashboard.system.version` | openmediavault version |
| `dashboard.system.processor` | Processor |
| `dashboard.system.processorValue` | {{model}}, {{count}} cores |
| `dashboard.system.processorCores_one` / `_other` | {{count}} core / {{count}} cores |
| `dashboard.system.uptime` | Running for |
| `dashboard.system.time` | Time on the NAS |
| `dashboard.system.kernel` | Kernel |
| `dashboard.system.updates` | Updates |
| `dashboard.system.updatesAvailable_one` / `_other` | {{count}} available |
| `dashboard.system.updatesNone` | None found at the last check |
| `dashboard.system.updatesLink` | Review updates in the classic interface |
| `dashboard.system.moreLink` | More system details in the classic interface |
| `dashboard.usage.title` | Usage |
| `dashboard.usage.cpu` | Processor |
| `dashboard.usage.cpuValue` | {{percent}} in use |
| `dashboard.usage.memory` | Memory |
| `dashboard.usage.memoryValue` | {{used}} of {{total}} in use ({{percent}}) |
| `dashboard.usage.load` | Average load |
| `dashboard.usage.loadValue` | 1 min {{one}} · 5 min {{five}} · 15 min {{fifteen}} |
| `dashboard.usage.loadHint` | How many tasks wait for the processor on average. Below {{cores}}, the number of processor cores, the NAS keeps up. |
| `dashboard.usage.loadHintNoCores` | Lower means less busy. |
| `dashboard.attention.label` | Needs attention |
| `dashboard.attention.restart` | A restart is needed to finish installing updates. Restarting is in the classic interface, in the power menu at the top right. |
| `dashboard.attention.restartLink` | Open the classic interface |
| `dashboard.attention.clock` | The NAS clock and this computer's clock differ by {{duration}}. If the NAS clock is wrong, schedules and logs will be too. |
| `dashboard.attention.clockLink` | Check Date and time in the classic interface |
| `dashboard.fresh` | Updated every 20 seconds. Last update {{time}}. |
| `dashboard.stale` | Could not update since {{time}}. The figures may be out of date. |
| `dashboard.loadFailed` | Could not read the system information. |
| `dashboard.user.title` | This NAS |
| `dashboard.user.account` | To change your password or your details, go to your account. |
| `dashboard.user.accountLink` | Your account |

`dashboard.placeholder` is removed.

---

## 2. The set-up checklist (Q11)

**Question it answers:** is this NAS set up safely? **Leads to:** the one setting still to do.

### 2.1 Placement and visibility

- Administrators only, while `System.getInformation.displayWelcomeMessage` is true. It replaces
  `SetupChecklistSlot`, under the attention list and above the cards.
- A card titled "Set up your NAS", intro: "A few things to check after installing. Each item is read
  from the NAS's current settings."
- The order is fixed by importance and never reorders as items change (a list that jumps loses the
  reader): password, HTTPS, email alerts, updates, name, time zone.
- If another administrator hides it, the next poll removes it; if focus was inside, it moves to the
  page title.

### 2.2 Item anatomy and states

Each item is a list item: a mark and state word on the leading side, then the title (medium weight),
one or two sentences, and one action. The checklist is **neutral**: these are configuration choices,
not monitored health, so no status hue is used (style guide 2.1: OK green is for a healthy monitored
thing, and "success" decoration is not allowed). States are told apart by **icon shape and word**,
both in `muted-foreground`/`foreground`:

| State | Mark (lucide) | Word | Meaning |
| --- | --- | --- | --- |
| Done | `CircleCheck` | Done | The interface read the setting and it is in place |
| Not done | `Circle` (plain, hollow) | Not done | The interface read the setting and it is not in place |
| Not checked | `CircleHelp` | Not checked | The interface cannot tell, or the read failed; the sentence says which |
| Value | none (space kept for alignment) | none | Only the reader can judge; the item shows the current value |
| Checking | skeleton bar in the mark column | Checking… | The item's read is in flight |

Each item's accessible text reads as one sentence: "{title}: {state word}. {sentence}". Each item's
read is independent: one failure shows "Not checked" with "Could not read …" and a small "Try again"
on that item only; the other items are unaffected. Values from the server are rendered as text.

### 2.3 Items

| # | Item | Read | Rule | Action |
| --- | --- | --- | --- | --- |
| 1 | Factory password | none | Always **Not checked**: OMV cannot report it | Signed in as `admin`: router link "Change your password" → `/account/password`. Signed in as another administrator: no link; the sentence says to sign in as admin (copy below). |
| 2 | HTTPS | `WebGui.getSettings` → `enablessl` | true: **Done**. false: **Not done** | Not done: `ExternalLink` "Open Web interface settings in the classic interface" → `/#/system/workbench/settings`. Done but this page is on `http:`: a link to the secure address (2.4) |
| 3 | Email alerts | `EmailNotification.get` (password removed by the transport) | **Done** when enabled and server, port, sender and primary address are set (the server's own test). Enabled but incomplete, or off: **Not done** | `ExternalLink` "Open Notifications in the classic interface" → `/#/system/notification/settings` |
| 4 | Updates | `availablePkgUpdates` | n > 0: **Not done**, "{{n}} updates are available." 0: **Not checked**, with the honest sentence below | `ExternalLink` "Open Updates in the classic interface" → `/#/system/updatemgmt/updates` |
| 5 | Name | `hostname` | **Value** | `ExternalLink` "Change it in the classic interface" → `/#/network/general` |
| 6 | Time zone | the date-and-time settings read (`System.getTimeSettings` → `timezone`, `ntpenable`) | **Value** | `ExternalLink` "Change it in the classic interface" → `/#/system/date-time` |

Items 4 and 5 come from the dashboard's own `System.getInformation`, so they share its state; if it
has never been read, the checklist is not shown at all (its visibility depends on it).

**HTTPS and the HTTP notice (UI-12).** The notice describes the connection; the item describes the
setting. The item does not repeat the notice's warning: when HTTPS is off it says the setting is off
and points up to the notice for why. When HTTPS is on but this page arrived over HTTP, the notice is
still shown (UI-12 is about the connection), and the item is Done with a link to the secure address.

### 2.4 The secure-address link (item 2)

Built only from `window.location.hostname` and `sslport` from `WebGui.getSettings`, never from a
reply's text or the URL's query: `https://{hostname}[:{sslport}]/ui/`, the port omitted when 443.
This follows the owner's Q7 reading of UI-3 for Flow E. **[owner]** confirm the same reading applies
to the checklist; without it, the Done item has no link and says "Open this page with an address that
starts with https://".

### 2.5 Hiding the checklist

- A secondary button at the end of the card: **"Hide the checklist"**, with the hint beside it:
  "Hides it for every administrator, and hides the classic interface's welcome panel too."
- Pressing it opens a `ConfirmDialog` (default variant, focus on Cancel), because the act affects
  other people and this interface cannot bring the checklist back:
  - Title "Hide the set-up checklist?"
  - Body "It is hidden for every administrator, on every computer, and the classic interface's
    welcome panel goes too. This interface cannot show it again."
  - Buttons "Hide the checklist" / "Cancel".
- Confirm calls `WebGui.dismissWelcomeMessage`. While it runs the confirm button shows its pending
  state. Success: the dialog closes, the card goes, focus moves to the page title, neutral toast
  "Set-up checklist hidden." Failure: the dialog stays open with the error (`ConfirmDialog error`):
  "The checklist was not hidden." + server message.

### 2.6 Copy

| Key | English |
| --- | --- |
| `checklist.title` | Set up your NAS |
| `checklist.intro` | A few things to check after installing. Each item is read from the NAS's current settings. |
| `checklist.state.done` | Done |
| `checklist.state.notDone` | Not done |
| `checklist.state.notChecked` | Not checked |
| `checklist.state.checking` | Checking… |
| `checklist.password.title` | Change the factory password |
| `checklist.password.body` | openmediavault is installed with a password that anyone can look up. If it has not been changed yet, change it now. This page cannot check whether it has been. |
| `checklist.password.bodyOtherAdmin` | openmediavault is installed with a password for the admin account that anyone can look up. This page cannot check whether it has been changed. To change it, sign in as admin and open Your account. |
| `checklist.password.link` | Change your password |
| `checklist.https.title` | Use a secure connection (HTTPS) |
| `checklist.https.done` | HTTPS is on. |
| `checklist.https.doneOnHttp` | HTTPS is on, but this page was opened without it. |
| `checklist.https.secureLink` | Open the secure address |
| `checklist.https.secureNoLink` | Open this page with an address that starts with https://. |
| `checklist.https.notDone` | HTTPS is off. The notice at the top of the page says why that matters. Turning it on needs a certificate, which the classic interface can create. |
| `checklist.https.link` | Open Web interface settings in the classic interface |
| `checklist.https.readFailed` | Could not read the web interface settings. |
| `checklist.email.title` | Get email alerts |
| `checklist.email.done` | Alerts go to {{address}}. |
| `checklist.email.off` | Alerts are off. Turn them on to hear about failing disks, full file systems and available updates. You need the details of an email account the NAS can send from. |
| `checklist.email.incomplete` | Alerts are on, but some details are missing, so none can be sent. |
| `checklist.email.applyHint` | After saving there, apply the changes, then send a test email. |
| `checklist.email.link` | Open Notifications in the classic interface |
| `checklist.email.readFailed` | Could not read the email alert settings. |
| `checklist.updates.title` | Install updates |
| `checklist.updates.available_one` | {{count}} update is available. |
| `checklist.updates.available_other` | {{count}} updates are available. |
| `checklist.updates.none` | No updates were found the last time the NAS looked. This page cannot tell when that was, so check for updates once to be sure. |
| `checklist.updates.link` | Open Updates in the classic interface |
| `checklist.name.title` | Name of your NAS |
| `checklist.name.body` | Your NAS is called <name></name>. Other computers on your network find it by this name. |
| `checklist.name.link` | Change it in the classic interface |
| `checklist.timezone.title` | Time zone |
| `checklist.timezone.body` | Time zone: <zone></zone>. Schedules, logs and the clock use it. |
| `checklist.timezone.ntpOn` | The clock is set automatically from the internet. |
| `checklist.timezone.ntpOff` | The clock is not set automatically. |
| `checklist.timezone.link` | Change it in the classic interface |
| `checklist.timezone.readFailed` | Could not read the date and time settings. |
| `checklist.hide` | Hide the checklist |
| `checklist.hideHint` | Hides it for every administrator, and hides the classic interface's welcome panel too. |
| `checklist.hideTitle` | Hide the set-up checklist? |
| `checklist.hideBody` | It is hidden for every administrator, on every computer, and the classic interface's welcome panel goes too. This interface cannot show it again. |
| `checklist.hideCancel` | Cancel |
| `checklist.hideFailed` | The checklist was not hidden. |
| `checklist.hidden` | Set-up checklist hidden. |

`<name>` and `<zone>` are `Trans` slots rendering the value as text in `Identifier`.
`checklist.email.applyHint` is shown under the Not done sentences (the test email refuses while the
module is dirty, UX audit B9).

---

## 3. SSH settings (Services > SSH)

**Question it answers:** can someone reach this NAS by SSH, and how? **Leads to:** Save, then Apply.

Administrators only. Data: `SSH.get` (read), `SSH.set` (write, whole object, UX audit B11). Saving
marks `ssh` and `avahi` dirty (observed in Phase 1; the band shows them as "SSH" and "Network
discovery (Zeroconf)").

### 3.1 Layout

1. Page title "SSH", with the pending mark (0.5) when `ssh` is in `dirtyModules`.
2. Intro: "SSH lets you sign in to the NAS from another computer and type commands. It is for
   advanced tasks; most people never need it."
3. When `ssh` is already pending on arrival: a neutral `FormAlert`: "Saved SSH settings are waiting
   to be applied. The form shows the saved settings, which are not in effect yet."
4. The form (3.2), in one column, max width about 40rem.
5. Buttons: Save, Discard changes (0.4), and the save status line (3.4).

### 3.2 Fields

| Order | Field | Control | Label | Hint |
| --- | --- | --- | --- | --- |
| 1 | `enable` | Checkbox | Turn on SSH | Each person also needs SSH access on their own account, which is set under Users. |
| 2 | `port` | Text input, `inputmode="numeric"`, about 8 characters wide, tabular | Port | The number SSH programs connect to. The usual one is 22; if you change it, tell your SSH program the new number. |
| — | Fieldset | legend "Signing in" | | |
| 3 | `passwordauthentication` | Checkbox | Allow signing in with a password | |
| 4 | `pubkeyauthentication` | Checkbox | Allow signing in with a key | A key is a file on your computer that proves who you are, with no password to guess. Keys are added to each account under Users. |
| 5 | `permitrootlogin` | Checkbox | Allow the root account to sign in | root is the built-in account with full control of the NAS. It is safer to leave this off and sign in with your own account. |
| — | Fieldset | legend "Connection" | | |
| 6 | `tcpforwarding` | Checkbox | Allow port forwarding | Lets someone signed in pass other network traffic through the NAS. Leave it off unless you use it. |
| 7 | `compression` | Checkbox | Compress data | Can speed up slow connections, at the cost of some processor time. |
| — | Disclosure | button "Advanced" | | |
| 8 | `extraoptions` | Multi-line text, mono, 4 rows, grows to 12, vertical resize | Extra configuration lines | These lines are added as they are to the SSH server's configuration file. A mistake can stop SSH from starting, so leave this empty unless you know you need it. |

- The fields under "Turn on SSH" stay editable when it is off (settings can be prepared before
  turning it on); a line under the checkbox says so when it is off: "The settings below are used when
  SSH is on."
- **Advanced** is a disclosure button (`aria-expanded`, chevron). It starts open when
  `extraoptions` holds text, and then its button reads "Advanced (1 line set)" / "Advanced ({{count}}
  lines set)" so the content is announced even when collapsed by the reader.

### 3.3 Validation and warnings

Validation blocks Save; warnings never do. Warnings are neutral `FormAlert`s placed right under the
field group they concern, shown as soon as the combination exists (on load or after a change), and
announced politely.

| Kind | Condition | Message | Why this kind |
| --- | --- | --- | --- |
| Error | `port` empty | Enter a port number. The usual one is 22. | Required by OMV |
| Error | not a whole number, or outside 1 to 65535 | Enter a whole number from 1 to 65535. | OMV's datamodel |
| Error | equals the port this page was loaded on (`window.location.port`, or 80/443 by scheme) | Port {{port}} is already used by this web interface. Choose another, such as 22. | The only conflict the page knows for certain; SSH would fail to start after Apply |
| Warning | SSH on, password and key both off | With both ways of signing in turned off, nobody can sign in over SSH. To stop SSH, turn it off at the top instead. | OMV accepts it, it locks nobody out of the web interface, and an administrator may mean it; blocking would be paternalistic |
| Warning | SSH was on when loaded and is now off | After you apply this, new SSH connections are refused. Anything that connects over SSH, such as a backup from another computer, stops working. | The reader may rely on SSH without thinking of it; a warning at the moment of change is enough, and Apply is a second step |
| Warning | SSH on, root on, password on | The root account can sign in with only a password. Anyone who guesses it controls the NAS. Turn off root sign-in, or allow keys only. | OMV's default; honest advice, not a fault, so it does not block |
| Warning | SSH on, password changed from on to off, key on | Only people with a key on their account can sign in now. Check that yours is added before you apply. | Prevents locking oneself out of SSH by surprise |

### 3.4 The save-then-apply loop

1. **Edit.** Save and Discard changes become available.
2. **Save.** `SSH.set` with the whole object. Save shows "Saving…".
3. **Saved.** The query for `SSH.get` and the system information are refreshed (the band appears
   with "2 changes waiting to be applied: SSH, Network discovery (Zeroconf)"); the form is clean;
   the pending mark appears beside the title; the status line beside the buttons
   (`role="status"`) reads "Saved. The changes take effect when you apply them in the band at the top
   of the page." No toast: the line and the band are the record. Focus stays on Save (disabled but
   focusable).
4. **Apply** (the existing band and its confirmation). While applying, the band shows progress; the
   form stays usable.
5. **Applied.** `ssh` leaves `dirtyModules`: the pending mark and the status line go; the task result
   is announced by the existing task announcer. The form already shows the new values.
6. **Apply failed.** The band shows its failed state with "Try applying again" (existing); the
   pending mark stays.

Unsaved edits are not part of an Apply; if the reader applies from the band with unsaved edits, the
form keeps them, still unsaved, and leaving still asks first.

### 3.5 States

| State | Look |
| --- | --- |
| Loading | Skeleton of the form: each label and a control-height bar; buttons disabled |
| Error, never read | `EmptyState variant="error"`: "Could not read the SSH settings." + server message + "Try again" |
| Populated | The form |
| Saving | Save "Saving…", fields read-only |
| Save failed | `FormAlert` critical, title "The SSH settings were not saved." + server message; focus to it; edits kept |
| Pending (saved, not applied) | Pending mark beside the title; band |
| Another administrator's pending changes | The band lists them too (existing); this page only marks `ssh` |

### 3.6 Keyboard and focus

Tab order follows the visual order: Turn on SSH, Port, the three sign-in checkboxes, the two
connection checkboxes, Advanced, the text area when open, Save, Discard changes. Space toggles a
checkbox; Enter in the Port field submits (it is a form); Enter in the text area adds a line. After a
failed save focus moves to the alert; after a successful save it stays on Save. Discard changes
restores the last saved values and keeps focus on its button.

### 3.7 Copy

| Key | English |
| --- | --- |
| `ssh.title` | SSH |
| `ssh.intro` | SSH lets you sign in to the NAS from another computer and type commands. It is for advanced tasks; most people never need it. |
| `ssh.pendingOnArrival` | Saved SSH settings are waiting to be applied. The form shows the saved settings, which are not in effect yet. |
| `ssh.enable` | Turn on SSH |
| `ssh.enableHint` | Each person also needs SSH access on their own account, which is set under Users. |
| `ssh.offNote` | The settings below are used when SSH is on. |
| `ssh.port` | Port |
| `ssh.portHint` | The number SSH programs connect to. The usual one is 22; if you change it, tell your SSH program the new number. |
| `ssh.portRequired` | Enter a port number. The usual one is 22. |
| `ssh.portRange` | Enter a whole number from 1 to 65535. |
| `ssh.portInUse` | Port {{port}} is already used by this web interface. Choose another, such as 22. |
| `ssh.signIn` | Signing in |
| `ssh.password` | Allow signing in with a password |
| `ssh.key` | Allow signing in with a key |
| `ssh.keyHint` | A key is a file on your computer that proves who you are, with no password to guess. Keys are added to each account under Users. |
| `ssh.root` | Allow the root account to sign in |
| `ssh.rootHint` | root is the built-in account with full control of the NAS. It is safer to leave this off and sign in with your own account. |
| `ssh.connection` | Connection |
| `ssh.forwarding` | Allow port forwarding |
| `ssh.forwardingHint` | Lets someone signed in pass other network traffic through the NAS. Leave it off unless you use it. |
| `ssh.compression` | Compress data |
| `ssh.compressionHint` | Can speed up slow connections, at the cost of some processor time. |
| `ssh.advanced` | Advanced |
| `ssh.advancedSet_one` / `_other` | Advanced ({{count}} line set) / Advanced ({{count}} lines set) |
| `ssh.extra` | Extra configuration lines |
| `ssh.extraHint` | These lines are added as they are to the SSH server's configuration file. A mistake can stop SSH from starting, so leave this empty unless you know you need it. |
| `ssh.warnNoMethod` | With both ways of signing in turned off, nobody can sign in over SSH. To stop SSH, turn it off at the top instead. |
| `ssh.warnTurningOff` | After you apply this, new SSH connections are refused. Anything that connects over SSH, such as a backup from another computer, stops working. |
| `ssh.warnRootPassword` | The root account can sign in with only a password. Anyone who guesses it controls the NAS. Turn off root sign-in, or allow keys only. |
| `ssh.warnKeysOnly` | Only people with a key on their account can sign in now. Check that yours is added before you apply. |
| `ssh.saved` | Saved. The changes take effect when you apply them in the band at the top of the page. |
| `ssh.saveFailed` | The SSH settings were not saved. |
| `ssh.loadFailed` | Could not read the SSH settings. |
| `ssh.loading` | Loading the SSH settings… |

---

## 4. Shared folders (Storage > Shared Folders)

**Question it answers:** which folders are shared, where are they, and is any of them broken?
**Leads to:** the classic interface to add or change one (Phase 3 is read-only).

Administrators only. Data: `ShareMgmt.getList` with `start`, `limit`, `sortfield`, `sortdir`,
`search`, all server-side. Table state (page, page size, sort, search) lives in memory for the
session (a store, not the URL, not browser storage): leaving and coming back keeps it; a reload
resets it.

### 4.1 Layout

1. Page title "Shared folders".
2. Intro: "Folders on your disks that other computers can reach over the network. To add, change or
   delete one, use the classic interface for now."
3. **Problem roll-up**, only when any folder is not OK (4.4).
4. Toolbar (`TableToolbar`): search field and its hint on the left; on the right, `ExternalLink`
   "Add a shared folder" → `/#/storage/shared-folders/create`.
5. The table.
6. Footer: pagination (4.5) and the last-refreshed line with a "Refresh" button
   (`TableLastRefreshed`). The table also refetches on window focus, so a folder added in the
   classic tab shows on return.

### 4.2 Columns

All columns are sortable: OMV sorts on any top-level field, in natural string order. Default sort:
Name, ascending (as the stock page).

| Order | Header | Field | Display |
| --- | --- | --- | --- |
| 1 | Name | `name` | Text, medium weight; long names wrap (`break-words`), never truncated |
| 2 | Status | `status` | Pill and, for anything but OK, its reason as text beside the pill (not in a tooltip). See 4.3 |
| 3 | File system | `device` | The file system's label, or its device path when it has none. A value starting with `/` is mono and may break anywhere; otherwise plain text. Empty: "Not available" |
| 4 | Path | `reldirpath` | Mono; the folder's path inside its file system |
| 5 | Full path | `absdirpath` | Mono, breaks anywhere, with an icon button "Copy full path of {{name}}" after it. Empty: "Not available", no button |
| 6 | Description | `comment` | Plain text, `muted-foreground`, wraps; at most three lines, then the cell clips with a "Show all" toggle in place. Empty: nothing (an empty cell is calm; the column header explains) |
| 7 | In use | `_used` | The word "Yes" or "No" (never an icon alone). Header has a footnote marker; under the table: "In use: a network share, backup job or other setting refers to this folder. Which one is not reported." |

Not shown, on purpose:

- `snapshots` (true only for some Btrfs folders): nothing on this page can act on it.
- `privileges`: it lists the configured grants, not who can actually reach the folder; showing it as
  "access" would mislead (Q9 keeps effective access on a folder's own page). Note that a folder with
  no grants reports `""` (Phase 1).

### 4.3 Status words

The pill uses the fixed status words (style guide 5.5); the reason says what the code means.

| `status` | Pill | Reason text |
| --- | --- | --- |
| `OK` | OK | none |
| `ENOENT` | Critical | Folder not found. Its disk may be disconnected or not mounted. |
| `ENOTDIR` | Critical | The path leads to a file, not a folder. |
| `ENOENT_DB_MNTENT` | Critical | Its file system is no longer set up on this NAS. |
| anything else | Unknown | Status not recognised: `{{code}}` (the code in mono, as text) |

Critical is right for all three failures: a folder that cannot be reached breaks every share that
uses it. In natural order the error codes sort before `OK`, so **Status, ascending, lists problems
first**.

### 4.4 Problem roll-up

Shown when any shared folder is not OK. It needs every row, not the current page, so it is a second,
separate read of the list with all rows, refreshed with the table **(owner default to confirm; see
the report)**. If that read fails, the roll-up is simply not shown; the table is unaffected.

- `StatusPill status="critical"` "Critical" (or the worst state present) and: "2 of 14 shared folders
  cannot be reached."
- A secondary button "Show these first", which sets the sort to Status, ascending, and goes to page 1.

### 4.5 Search, sort and paging

**Search.** `Input type="search"`, label "Search shared folders" (visible label, not placeholder),
placeholder "Name, path, file system…", a clear button "Clear the search" inside the field when it has
text, Escape clears it. The query is sent 300 ms after typing stops and resets to page 1. The hint
below the field, always visible:

"Search looks at every detail of a folder, including some not shown in the table, so a short word
such as "ok" or "1" can match more folders than you expect."

**Sort.** Pressing a header sorts by it ascending; pressing the sorted header again reverses it.
There is always exactly one sort. `aria-sort` on the header; a polite announcement "Sorted by
{{column}}, {{direction}}".

**Paging.** Under the table, wrapping on narrow screens:

- Range: "1–25 of 132" (tabular). With a search: "1–12 of 12 matching".
- "Rows per page" select: 10, 25 (default), 50, 100. Changing it goes to page 1.
- "Previous page" and "Next page" buttons (icon plus visible word on wide screens, icon with
  accessible name and tooltip under 640px), disabled with reason at either end.
- After a page change, focus stays on the pressed button and the new range is announced politely.
- If the total shrinks below the current page (folders deleted elsewhere), the table moves to the
  last page that exists.

**Between reads.** After the first load, changing page, sort or search keeps the current rows on
screen with `aria-busy` and a small "Loading…" in the toolbar, rather than flashing skeletons.

### 4.6 States

| State | Look |
| --- | --- |
| Loading (first) | Header row and `TableSkeletonRows` (as many as the page size, at most 10); "Loading shared folders…" for assistive technology |
| Error | In the table body: `EmptyState variant="error"`: "Could not read the shared folders." + server message + "Try again". The toolbar stays, so the search can be changed |
| Empty (no folders, no search) | `EmptyState variant="empty"`: "There are no shared folders yet. A shared folder is a folder on one of your disks that other computers can reach over the network." Action: `ExternalLink` "Add a shared folder in the classic interface" → `/#/storage/shared-folders/create`. The toolbar's search is hidden (nothing to search) |
| Filtered empty | `EmptyState variant="filtered"`: "No shared folders match "{{search}}"." Action: button "Clear the search" (focus moves to the search field after it) |
| Populated | The table |

### 4.7 Keyboard

Tab order: search, its clear button, "Add a shared folder", "Show these first" (when shown), each
sortable header, per row the copy button (and "Show all" where present), rows per page, Previous,
Next, Refresh. Rows are not focusable (nothing to open in Phase 3). The table scrolls inside its own
frame at narrow widths and 200% zoom; the page does not.

### 4.8 Copy

| Key | English |
| --- | --- |
| `sharedFolders.title` | Shared folders |
| `sharedFolders.intro` | Folders on your disks that other computers can reach over the network. To add, change or delete one, use the classic interface for now. |
| `sharedFolders.add` | Add a shared folder |
| `sharedFolders.addClassic` | Add a shared folder in the classic interface |
| `sharedFolders.tableLabel` | Shared folders |
| `sharedFolders.col.name` | Name |
| `sharedFolders.col.status` | Status |
| `sharedFolders.col.device` | File system |
| `sharedFolders.col.path` | Path |
| `sharedFolders.col.fullPath` | Full path |
| `sharedFolders.col.description` | Description |
| `sharedFolders.col.used` | In use |
| `sharedFolders.usedNote` | In use: a network share, backup job or other setting refers to this folder. Which one is not reported. |
| `sharedFolders.yes` | Yes |
| `sharedFolders.no` | No |
| `sharedFolders.showAll` | Show all |
| `sharedFolders.showLess` | Show less |
| `sharedFolders.copyPath` | Copy full path of {{name}} |
| `sharedFolders.status.ok` | OK |
| `sharedFolders.status.critical` | Critical |
| `sharedFolders.status.unknown` | Unknown |
| `sharedFolders.reason.ENOENT` | Folder not found. Its disk may be disconnected or not mounted. |
| `sharedFolders.reason.ENOTDIR` | The path leads to a file, not a folder. |
| `sharedFolders.reason.ENOENT_DB_MNTENT` | Its file system is no longer set up on this NAS. |
| `sharedFolders.reason.other` | Status not recognised: <code></code> |
| `sharedFolders.rollUp_one` / `_other` | {{count}} of {{total}} shared folders cannot be reached. |
| `sharedFolders.showFirst` | Show these first |
| `sharedFolders.search` | Search shared folders |
| `sharedFolders.searchPlaceholder` | Name, path, file system… |
| `sharedFolders.searchHint` | Search looks at every detail of a folder, including some not shown in the table, so a short word such as "ok" or "1" can match more folders than you expect. |
| `sharedFolders.clearSearch` | Clear the search |
| `sharedFolders.range` | {{from}}–{{to}} of {{total}} |
| `sharedFolders.rangeMatching` | {{from}}–{{to}} of {{total}} matching |
| `sharedFolders.pageSize` | Rows per page |
| `sharedFolders.previous` | Previous page |
| `sharedFolders.next` | Next page |
| `sharedFolders.firstPageReason` | This is the first page. |
| `sharedFolders.lastPageReason` | This is the last page. |
| `sharedFolders.sorted` | Sorted by {{column}}, {{direction}} |
| `sharedFolders.ascending` | ascending |
| `sharedFolders.descending` | descending |
| `sharedFolders.lastRefreshed` | Last refreshed {{time}} |
| `sharedFolders.refresh` | Refresh |
| `sharedFolders.loading` | Loading shared folders… |
| `sharedFolders.loadFailed` | Could not read the shared folders. |
| `sharedFolders.empty` | There are no shared folders yet. A shared folder is a folder on one of your disks that other computers can reach over the network. |
| `sharedFolders.filteredEmpty` | No shared folders match "{{search}}". |

---

## 5. Your account (Account)

**Question it answers:** who am I signed in as, and how do I change my password? **Leads to:** a new
password, or corrected details.

Every signed-in user. Data: `UserMgmt.getUserByContext` (`name`, `comment`, `email`, `sshpubkeys`,
`_readonly`), `UserMgmt.setUserByContext` (details), `UserMgmt.setPasswordByContext` (password).

### 5.1 Who may edit the details

OMV refuses `setUserByContext` for a system account such as `admin` (its `setUser` rejects system
accounts), and the reply cannot tell a system account from another. **Choice:** the details are
editable **only for the user role**, and only when `_readonly` is false. This matches the stock menu,
which offers Account > Settings to normal users only. An administrator sees the details read-only
with an explanation and a pointer to what they most likely want (email alerts). The password form is
offered to every account and hidden when `_readonly` is true (owner decision).

| Account | Details | Password |
| --- | --- | --- |
| Normal user, not locked | Editable | Form |
| Normal user, `_readonly` | Read-only, "locked" note | Replaced by the "locked" note |
| Administrator | Read-only, administrator note | Form |
| Administrator, `_readonly` (unusual) | Read-only, administrator note | Replaced by the "locked" note |

### 5.2 Layout

1. Page title "Your account", subtitle "Signed in as {{name}}" (name in mono).
2. Section "Details" (h2).
3. Section "Change password" (h2), with `id` so `/account/password` lands here (6.1).
4. Section "SSH keys" (h2).

### 5.3 Details

| Label | Field | Read-only display | Editable control |
| --- | --- | --- | --- |
| User name | `name` | Mono | Never editable |
| Description | `comment` | Text; empty: "None" | Text input. Hint: "A note about this account, such as your full name. Administrators see it in the list of users." |
| Email address | `email` | Text; empty: "None" | `type="email"`, `autocomplete="email"`. Hint: "Messages the NAS sends to your account are forwarded here." Error: "Enter an email address like name@example.com, or leave it empty." |

Editable: buttons "Save details" and "Discard changes" (0.4). Saving applies at once for the reader:
there is no pending band for a normal user. Success: neutral toast "Details saved." and the form is
clean. Failure: critical `FormAlert` "Your details were not saved." + server message.

Notes in place of the buttons when read-only:

- Administrator: "This page cannot change an administrator's details. Email alerts about the NAS are
  set up under Notifications." with `ExternalLink` "Open Notifications in the classic interface".
- Locked: "Your administrator has locked this account's details and password. Ask them if something
  needs changing."

### 5.4 Change password

Intro, always shown above the fields:

"The new password works straight away; there is nothing to apply. It is the same account everywhere,
so it also becomes your password for the classic interface and, if you use them, for shared folders
on other computers."

| Field | Control | Label | Hint | Errors |
| --- | --- | --- | --- | --- |
| New password | `SecretField`, `autocomplete="new-password"`, reveal toggle "Show password" | New password | Use a long password that you do not use anywhere else. | Empty: "Enter a new password." |
| Repeat | `SecretField`, same | Type the new password again | | Empty: "Type the new password again." Different: "The two passwords are not the same. Type them again." |

- A visually hidden, read-only `autocomplete="username"` input holding the user name sits in the
  form, so password managers file the new password under the right account.
- No current-password field: OMV's method has none, and the interface does not invent one.
- No strength meter and no length rule: OMV sets none, and a rule here would be ours alone. The hint
  carries the advice.
- Button "Change password", the page's one filled primary (it is the most common reason to come
  here; "Save details" is outlined). While running: "Changing password…".
- **Success:** both fields are cleared (UI-6); a neutral toast "Password changed."; and a status line
  under the button that stays until the next keystroke: "Password changed. Use the new password the
  next time you sign in." Focus stays on the button.
- **Failure:** critical `FormAlert` "The password was not changed." + server message; both fields are
  cleared (UI-6: cleared after submit) and focus moves to New password.
- The new password never appears in a toast, the status line, an error or the URL.

### 5.5 SSH keys (read-only in Phase 3)

- A list, one item per key in `sshpubkeys` (OMV stores them in RFC 4716 form). Each item shows the
  key's comment when the key has a `Comment:` header (text), otherwise "Key {{n}}"; under it the key
  body in mono, shortened in the middle to its first 12 and last 12 characters; a "Show full key"
  toggle that shows the whole key as mono text that breaks anywhere; and a "Copy key" button.
- Empty: "No SSH keys are added to this account." and "An administrator adds them under Users." For
  an administrator, the second sentence is `ExternalLink` "Add keys under Users in the classic
  interface" → `/#/usermgmt/users`.

### 5.6 States

| State | Look |
| --- | --- |
| Loading | Skeleton of the three sections; the password form is not shown until `_readonly` is known |
| Error | `EmptyState variant="error"` for the whole page: "Could not read your account." + server message + "Try again" (the password form depends on `_readonly`) |
| Populated | As above, by the table in 5.1 |
| Saving details / changing password | Each form's own loading state; the other form stays usable |

Unsaved changes (0.4) cover both forms: typed but unsubmitted password fields count as unsaved.

### 5.7 Keyboard and focus

Order: Description, Email address, Save details, Discard changes, New password, its reveal toggle,
the repeat field, its reveal toggle, Change password, then each key's Show full key and Copy key.
Arriving through `/account/password` moves focus to the "Change password" heading (`tabIndex=-1`),
which is announced, and the next Tab reaches New password.

### 5.8 Copy

| Key | English |
| --- | --- |
| `account.title` | Your account |
| `account.signedInAs` | Signed in as <name></name> |
| `account.details` | Details |
| `account.name` | User name |
| `account.comment` | Description |
| `account.commentHint` | A note about this account, such as your full name. Administrators see it in the list of users. |
| `account.email` | Email address |
| `account.emailHint` | Messages the NAS sends to your account are forwarded here. |
| `account.emailInvalid` | Enter an email address like name@example.com, or leave it empty. |
| `account.saveDetails` | Save details |
| `account.detailsSaved` | Details saved. |
| `account.detailsFailed` | Your details were not saved. |
| `account.adminNote` | This page cannot change an administrator's details. Email alerts about the NAS are set up under Notifications. |
| `account.adminNoteLink` | Open Notifications in the classic interface |
| `account.lockedNote` | Your administrator has locked this account's details and password. Ask them if something needs changing. |
| `account.password` | Change password |
| `account.passwordIntro` | The new password works straight away; there is nothing to apply. It is the same account everywhere, so it also becomes your password for the classic interface and, if you use them, for shared folders on other computers. |
| `account.newPassword` | New password |
| `account.newPasswordHint` | Use a long password that you do not use anywhere else. |
| `account.repeatPassword` | Type the new password again |
| `account.showPassword` | Show password |
| `account.passwordRequired` | Enter a new password. |
| `account.repeatRequired` | Type the new password again. |
| `account.passwordMismatch` | The two passwords are not the same. Type them again. |
| `account.changePassword` | Change password |
| `account.changingPassword` | Changing password… |
| `account.passwordChanged` | Password changed. |
| `account.passwordChangedLine` | Password changed. Use the new password the next time you sign in. |
| `account.passwordFailed` | The password was not changed. |
| `account.keys` | SSH keys |
| `account.keyN` | Key {{n}} |
| `account.showKey` | Show full key |
| `account.hideKey` | Hide full key |
| `account.copyKey` | Copy key |
| `account.noKeys` | No SSH keys are added to this account. |
| `account.noKeysUser` | An administrator adds them under Users. |
| `account.noKeysAdminLink` | Add keys under Users in the classic interface |
| `account.loadFailed` | Could not read your account. |

---

## 6. Navigation: switching the four items over

### 6.1 Routes

| Item | New route | Roles | Replaces |
| --- | --- | --- | --- |
| Dashboard | `/` (exists) | everyone | the placeholder text |
| Services > SSH | `/services/ssh` | admin | `ClassicOnlyPage` for `services/ssh` |
| Storage > Shared folders | `/storage/shared-folders` | admin | `ClassicOnlyPage` for `storage/shared-folders` |
| Account > Your account | `/account/settings` | everyone | `ClassicOnlyPage` for `account/settings` (was user only) |
| (no menu item) | `/account/password` | everyone | `ClassicOnlyPage` for `account/password`; now opens the account page with focus on "Change password" |

- Each is a static file route, more specific than `$group/$item`, so it wins; `$group/$item` keeps
  serving the rest.
- **The Account group shows one item, "Your account"**, for both roles, instead of the stock
  "Settings" (user) and "Password" (everyone). Two menu items for one page would both be "current".
  `/account/password` stays a valid address (the checklist links to it; stock users know it).
  **[owner]** This is a small departure from "group navigation as OMV does".
- The navigation entry of a built page marks itself as built (a field in the table), so the side
  navigation drops the "Classic" word and the external mark for it, and `aria-current` works as for
  any in-app page. The entry keeps its `classic` path (corrected per 0.2) for pages that still link
  out.
- A normal user who types `/services/ssh` or `/storage/shared-folders` gets the existing "only
  administrators" page; the route makes no call first (UI-4).
- Route-level code splitting: each of the three new pages is its own chunk (journal default).

### 6.2 Catalogue changes

| Key | English |
| --- | --- |
| `nav.items.account.settings` | Your account |

`nav.items.account.password` is no longer shown in the menu; `/account/password` takes its document
title from `account.title`, like `/account/settings`.

---

## 7. Components needed in `react-ui-components`

Each with stories for every state in both themes (design-system engineer).

| Component | Why | States to cover |
| --- | --- | --- |
| `Card` (`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`) | Dashboard cards, checklist, attention rows; none exists | default, with footer, loading content |
| `FactList` (description list) | System facts, account details: label/value in two columns, stacking under 640px; values may be mono | normal, value missing ("Not reported"), long mono value wrapping, skeleton |
| `Skeleton` (line and block) | Card and form skeletons outside tables | light, dark, reduced motion (static) |
| `CheckboxField` | Checkbox with its label beside it and hint below, wired through `Field` | unchecked, checked, focus, disabled with reason, invalid |
| `TextareaField` (with a `mono` option) | SSH extra lines | empty, filled, focus, invalid, disabled, auto-grow to a maximum |
| `Disclosure` (on Base UI Collapsible) | "Advanced", "Show full key", "Show all" | closed, open, with count in the label, keyboard |
| `SearchField` | Label, clear button, Escape to clear, `type="search"`, hint below | empty, with text, focus, busy |
| `TablePagination` | Range, rows-per-page select, previous/next with disabled reasons, live announcement | first, middle, last page, single page, narrow layout |
| `CopyButton` | Copy a path or key, with the plain-HTTP fallback of selecting the text (as the task log) | idle, copied, fallback (selected) |
| `ChecklistItem` | The new pattern of section 2: mark, state word, title, body, action, per-item retry | done, not done, not checked, value, checking, read failed |
| Promote `FormAlert` | Used by the shell and now by three pages; it belongs in the library as `InlineAlert` (critical and neutral) | critical with title and server message, neutral |

`StatusPill` (with `pending`), `CapacityMeter`, `EmptyState`, `Table*`, `SecretField`,
`ConfirmDialog`, `ExternalLink`, `Identifier`, `ServerMessage` and the toast are reused as they are.

---

## 8. Checks before calling a page done

- Both themes; greyscale; deuteranopia and protanopia emulation (Critical pills and the Warning row
  keep their words; checklist marks keep their shapes).
- 320 CSS px and 200% zoom: fact lists stack; toolbar and pagination wrap; the table scrolls in its
  frame only; long names, paths, keys and host names break inside their cell.
- Keyboard-only pass of each page in the orders above; focus always visible; no trap in the dialogs.
- Screen reader hears: loading, the save status line, the password confirmation, the sort and page
  announcements, task results (existing), and a failed read (`role="alert"`).

## 9. Adversarial pass

**Trying to break it**

| Probe | Finding | Design response |
| --- | --- | --- |
| 0 shared folders | Must not look like an error | Empty state with the classic link; search hidden |
| 1 folder, 1000 folders | Paging and the roll-up need all rows | Server paging; roll-up as a separate all-rows read that may fail quietly |
| Search "ok", "1", "true" | Matches nested and boolean fields | The hint says so, with those examples |
| 200-character folder name, right-to-left name, `<img src=x>` as a name or comment | Layout and UI-2 | Text nodes only; names wrap; `dir="auto"` on free-text cells (name, description, comment, email) so a right-to-left value does not reorder the row |
| Folder deleted in the classic tab while on page 6 | Page past the end | Move to the last existing page |
| Refresh mid-edit (SSH, account) | Edits lost | Browser prompt before unload; nothing stored (UI-6, UI-13) |
| Second tab saves SSH | Last save wins; OMV has no version check | No background refetch overwrites unsaved edits; after any save the form shows what was saved. Not detectable beyond that |
| Another administrator's pending changes | Apply is global (B2) | Existing band lists every module; the SSH page marks only `ssh` |
| Session expires mid-form | Edits lost | Idle warning first; documented, not stored |
| Apply task fails | Mixed state (B3) | Existing failed band; the page's pending mark stays |
| Hide the checklist in one tab, open in another | Flag already cleared | Next poll removes it; the call is idempotent |
| `admin` changes its password with a typo | Typed twice; nothing else to catch it | Match check; the intro says it is the classic sign-in too |
| Another administrator (not `admin`) follows "Change your password" | Would change their own password, not admin's | Branch: no link, sentence says to sign in as admin |
| Normal user or non-system administrator changes details or password | OMV marks `postfix` (and `ssh` if the account has keys) dirty and sets the file-sharing password at once | Administrators see pending changes they did not make; reported to the owner. "Undo" on the band would put the email and description back in the database but not the password |
| Clipboard on plain HTTP | API missing | Select-the-text fallback with "Press Ctrl+C to copy" |
| `cpuModelName` null (ARM boards) | Empty fact | "{n} cores" or "Not reported" |
| A new `status` code from a later OMV | Unmapped | Unknown pill with the raw code as text |
| SSH port set to this page's port | sshd would fail on Apply | Blocking validation error |

**Without sight**

| Probe | Requirement |
| --- | --- |
| Tab through each page | Orders in 1.8, 3.6, 4.7, 5.7; skip link first (shell) |
| Loading | `aria-busy` and a polite "Loading …" per region; skeletons hidden from assistive technology |
| Saved / applying / failed | Save status line (polite); band and task announcer (existing); failures as `role="alert"` |
| Colour | Every status has its word; checklist states have shape and word; In use is a word; pending is a labelled pill |
| Live figures | Not announced on each poll; only the stale notice, once |
| 200% zoom | Single column; no sideways page scroll |
